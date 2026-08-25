import type { AppData, Client, ClientRequest } from '../types'
import { today, thisMonth } from './format'
import { clientSignals } from './insights'
import { outstandingOf } from './selectors'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 건강도 — **규칙**입니다. AI 가 아닙니다 (0083)
//
//  대표님: 「처음부터 복잡한 머신러닝을 구현하지 않는다. 현재 확보 가능한
//  데이터를 기반으로 규칙 기반 점수화를 우선 구현한다. 향후 AI 분석으로
//  교체하기 쉬운 구조로 만든다.」
//
//  ── 여기서 지키는 것 ──────────────────────────────────────────────────────
//
//  ⚠ **없는 자료로 점수를 매기지 않습니다.** 브리프의 예시에는 「포털 로그인
//    활동」·「거래 기간」 같은 항목이 있지만, 지금 서버에 그 값이 없는
//    거래처가 대부분입니다. 없는 것을 0점으로 치면 멀쩡한 거래처가
//    「관리필요」로 뜨고, 대표님은 그 화면을 곧 안 보시게 됩니다.
//    → 잴 수 있는 항목만 재고, **몇 개로 쟀는지 함께 돌려줍니다.**
//
//  ⚠ 점수를 **저장하지 않습니다.** 수거·미수 기록이 바뀌면 점수도 같이
//    바뀌어야 합니다. 표에 넣어 두면 원자료가 바뀌어도 옛 점수가 남습니다.
//
//  ⚠ 나중에 AI 로 바꿀 때는 `score()` 한 곳만 갈아 끼웁니다. 화면은
//    `CustomerHealth` 모양만 보고 그립니다.
//
//  ⚠ 화면에 「AI 가 분석했습니다」라고 적지 않습니다. 규칙입니다.
//    근거(`reasons`)를 그대로 보여 주어, 왜 그 등급인지 사람이 확인할 수
//    있게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 거래처 상태 — 대표님이 쓰시는 말 그대로 */
export type HealthGrade = '우수' | '안정' | '관심' | '관리필요'

export interface HealthReason {
  /** 무엇을 보고 판단했는가 */
  label: string
  /** 실제 값 — 지어내지 않고 있는 그대로 */
  detail: string
  /** 점수에 얼마나 더했는가 (음수면 깎았습니다) */
  points: number
}

export interface CustomerHealth {
  clientId: string
  clientName: string
  grade: HealthGrade
  /** 0~100. **잴 수 있었던 항목만으로** 계산한 값입니다 */
  score: number
  /** 몇 개 항목으로 쟀는가 — 적으면 화면에서 그렇게 말해 줍니다 */
  measured: number
  /** 전체 항목 수 */
  total: number
  reasons: HealthReason[]
  /** 지금 눈에 띄는 것 — 없으면 빈 배열 */
  risks: string[]
}

const DAY = 86_400_000
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)

const isUrgent = (r: ClientRequest) => r.kind === '긴급수거'

/**
 * 한 거래처의 건강도.
 *
 *  @param data  전체 자료
 *  @param client 볼 거래처
 */
export function customerHealth(data: AppData, client: Client, now = today()): CustomerHealth {
  const sig = clientSignals(data, client)
  const reasons: HealthReason[] = []
  const risks: string[] = []
  //  ⚠ 각 항목은 「잴 수 있었나」와 「몇 점인가」를 따로 돌려줍니다.
  //    못 잰 항목은 분모에서도 빠집니다 — 모르는 것을 0점으로 세지 않습니다.
  let got = 0
  let possible = 0

  // ── ① 최근에 왔는가 (25점) ───────────────────────────────────────────────
  //    수거를 한 번도 안 한 곳은 잴 수 없습니다 — 신규일 뿐 나쁜 것이 아닙니다.
  if (sig.lastDate) {
    possible += 25
    const gap = daysBetween(sig.lastDate, now)
    const p = gap <= 14 ? 25 : gap <= 30 ? 18 : gap <= 60 ? 9 : 0
    got += p
    reasons.push({ label: '최근 수거', detail: `${gap}일 전 (${sig.lastDate})`, points: p })
    if (gap > 60) risks.push(`${gap}일째 수거가 없습니다`)
  }

  // ── ② 배출량이 늘고 있는가 (20점) ────────────────────────────────────────
  //    앞뒤 2주가 **둘 다** 있어야 견줄 수 있습니다. 한쪽이 0이면 모릅니다.
  if (sig.prevKg > 0 && sig.recentKg > 0) {
    possible += 20
    const g = sig.growthPct
    const p = g >= 10 ? 20 : g >= -10 ? 15 : g >= -30 ? 7 : 0
    got += p
    reasons.push({
      label: '배출량 추이',
      detail: `최근 2주 ${Math.round(sig.recentKg)}kg · 직전 2주 ${Math.round(sig.prevKg)}kg (${g >= 0 ? '+' : ''}${g}%)`,
      points: p,
    })
    if (g <= -30) risks.push(`배출량이 ${Math.abs(g)}% 줄었습니다`)
  }

  // ── ③ 돈이 밀렸는가 (25점) ───────────────────────────────────────────────
  //    청구가 한 건도 없으면 잴 수 없습니다.
  const bills = data.payments.filter((p) => p.clientId === client.id && p.status !== '취소' && !p.canceledAt)
  if (bills.length > 0) {
    possible += 25
    const owed = bills.reduce((a, p) => a + outstandingOf(data, p), 0)
    const p = owed <= 0 ? 25 : owed < 1_000_000 ? 15 : owed < 5_000_000 ? 7 : 0
    got += p
    reasons.push({
      label: '미수금',
      detail: owed <= 0 ? '없음' : `${owed.toLocaleString('ko-KR')}원`,
      points: p,
    })
    if (owed >= 1_000_000) risks.push(`미수금 ${owed.toLocaleString('ko-KR')}원`)
  }

  // ── ④ 급하게 부르는 일이 잦은가 (15점) ──────────────────────────────────
  //    요청이 한 건도 없으면 잴 수 없습니다 — 조용한 것이 나쁜 것은 아닙니다.
  const mine = (data.requests ?? []).filter((r) => r.clientId === client.id)
  const recent = mine.filter((r) => daysBetween(r.createdAt.slice(0, 10), now) <= 90)
  if (recent.length > 0) {
    possible += 15
    const urgent = recent.filter(isUrgent).length
    const p = urgent === 0 ? 15 : urgent <= 2 ? 8 : 0
    got += p
    reasons.push({
      label: '최근 90일 긴급수거',
      detail: urgent === 0 ? `없음 (요청 ${recent.length}건)` : `${urgent}건`,
      points: p,
    })
    if (urgent >= 3) risks.push(`90일에 긴급수거 ${urgent}건 — 수거주기 검토`)
  }

  // ── ⑤ 포털을 쓰는가 (15점) ───────────────────────────────────────────────
  //    ⚠ 요청·문의를 **한 번이라도** 올린 적이 있어야 잽니다. 아예 없으면
  //      「포털을 아직 안 드렸을 뿐」일 수 있어 점수로 깎지 않습니다.
  const inqs = (data.inquiries ?? []).filter((q) => q.clientId === client.id)
  const portalTouches = [...mine.filter((r) => r.source === 'portal'), ...inqs]
  if (portalTouches.length > 0) {
    possible += 15
    const dates = portalTouches.map((x) => x.createdAt.slice(0, 10)).sort()
    const last = dates[dates.length - 1]
    const gap = daysBetween(last, now)
    const p = gap <= 30 ? 15 : gap <= 90 ? 8 : 0
    got += p
    reasons.push({ label: '포털 이용', detail: `마지막 ${gap}일 전 · 모두 ${portalTouches.length}건`, points: p })
  }

  // ── 등급 ──────────────────────────────────────────────────────────────────
  //   ⚠ 잰 항목이 하나도 없으면 점수를 만들지 않습니다.
  const score = possible > 0 ? Math.round((got / possible) * 100) : 0
  const grade: HealthGrade =
    possible === 0 ? '관심' : score >= 85 ? '우수' : score >= 65 ? '안정' : score >= 40 ? '관심' : '관리필요'

  return {
    clientId: client.id,
    clientName: client.name,
    grade,
    score,
    measured: reasons.length,
    total: 5,
    reasons,
    risks,
  }
}

/** 활성 거래처 전부 — 나쁜 순으로 */
export function allCustomerHealth(data: AppData, now = today()): CustomerHealth[] {
  return data.clients
    .map((c) => customerHealth(data, c, now))
    .sort((a, b) => a.score - b.score || a.clientName.localeCompare(b.clientName))
}

// ─────────────────────────────────────────────────────────────────────────────
// 다음 조치 — 이것도 **규칙**입니다
//
//  대표님: 「UI상으로는 AI가 실제 분석하지 않았는데 "AI가 분석했다"고
//  과장하지 않는다.」
//
//  그래서 항목마다 **왜 그렇게 말하는지(근거)** 를 같이 답니다. 근거를 못
//  대는 제안은 아예 만들지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpsSuggestion {
  clientId: string
  clientName: string
  /** 무엇을 하면 좋은가 */
  action: string
  /** 왜 그렇게 보는가 — 사실만 적습니다 */
  because: string
  /** 급한 정도 */
  tone: 'urgent' | 'watch' | 'good'
  /** 눌러서 갈 곳 */
  to: string
}

export function opsSuggestions(data: AppData, now = today()): OpsSuggestion[] {
  const out: OpsSuggestion[] = []
  const month = thisMonth()
  for (const c of data.clients) {
    const h = customerHealth(data, c, now)
    const sig = clientSignals(data, c, month)
    const to = `/clients/${c.id}`

    const owed = data.payments
      .filter((p) => p.clientId === c.id && p.status !== '취소' && !p.canceledAt)
      .reduce((a, p) => a + outstandingOf(data, p), 0)
    if (owed >= 1_000_000) {
      out.push({
        clientId: c.id, clientName: c.name, tone: 'urgent', to,
        action: '정산 연락',
        because: `미수금 ${owed.toLocaleString('ko-KR')}원`,
      })
    }

    const urgent90 = (data.requests ?? []).filter(
      (r) => r.clientId === c.id && isUrgent(r) && daysBetween(r.createdAt.slice(0, 10), now) <= 90,
    ).length
    if (urgent90 >= 3) {
      out.push({
        clientId: c.id, clientName: c.name, tone: 'urgent', to,
        action: '정기 수거주기 조정 검토',
        because: `최근 90일 긴급수거 ${urgent90}건 — 주기가 실제 배출량을 못 따라가고 있을 수 있습니다`,
      })
    }

    if (sig.prevKg > 0 && sig.recentKg > 0) {
      if (sig.growthPct <= -30) {
        out.push({
          clientId: c.id, clientName: c.name, tone: 'watch', to,
          action: '거래처 상태 확인',
          because: `배출량이 직전 2주 대비 ${Math.abs(sig.growthPct)}% 줄었습니다 (${Math.round(sig.prevKg)}kg → ${Math.round(sig.recentKg)}kg)`,
        })
      } else if (sig.growthPct >= 30) {
        out.push({
          clientId: c.id, clientName: c.name, tone: 'good', to,
          action: '추가 배차 검토',
          because: `배출량이 ${sig.growthPct}% 늘었습니다 (${Math.round(sig.prevKg)}kg → ${Math.round(sig.recentKg)}kg)`,
        })
      }
    }

    if (sig.lastDate && daysBetween(sig.lastDate, now) > 60) {
      out.push({
        clientId: c.id, clientName: c.name, tone: 'watch', to,
        action: '거래 지속 여부 확인',
        because: `마지막 수거가 ${daysBetween(sig.lastDate, now)}일 전입니다 (${sig.lastDate})`,
      })
    }

    if (h.grade === '우수' && out.every((o) => o.clientId !== c.id)) {
      //  ⚠ 좋은 곳도 한 줄 답니다. 나쁜 것만 뜨면 이 화면이 「혼나는 자리」가
      //    되어 안 보게 됩니다.
      out.push({
        clientId: c.id, clientName: c.name, tone: 'good', to,
        action: '지금처럼 유지',
        because: `건강도 ${h.score}점 — ${h.reasons.map((r) => r.label).join(' · ')} 모두 양호`,
      })
    }
  }
  const rank = { urgent: 0, watch: 1, good: 2 }
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || a.clientName.localeCompare(b.clientName))
}
