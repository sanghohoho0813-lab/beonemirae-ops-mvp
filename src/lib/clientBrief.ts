import type { AppData, Client } from '../types'
import { today, thisMonth } from './format'
import { clientSignals } from './insights'
import { customerHealth, opsSuggestions } from './customerHealth'
import { outstandingOf } from './selectors'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 요약 — 나중에 LLM 에 넘길 **자료 묶음** (0083)
//
//  대표님: 「향후 LLM API 를 연결할 수 있는 구조를 고려한다. 이번 작업에서
//  API Key 가 없거나 연결되어 있지 않다면 **억지로 실제 API 를 구현하지
//  않는다.** 대신 서비스 레이어 및 UI 진입점 정도까지만 만든다.」
//
//  ── 그래서 여기까지만 합니다 ──────────────────────────────────────────────
//
//   이 파일이 하는 일은 **한 가지**입니다 — 한 거래처에 대해 지금 서버가
//   알고 있는 것을 사람이 읽을 수 있는 글로 모아 줍니다.
//
//   지금은 그 글을 **화면에 그대로 보여 줍니다.** 나중에 열쇠가 생기면
//   같은 글을 LLM 에 보내고 답을 받으면 됩니다. 바꿀 곳은 부르는 쪽
//   한 줄뿐입니다.
//
//  ⚠ **가짜 AI 를 만들지 않습니다.** 규칙으로 만든 문장을 「AI 가
//    분석했습니다」라고 적으면 그건 거짓말입니다. 화면에는 「지금까지 쌓인
//    기록을 한 장으로 모았습니다」라고 적고, AI 는 아직 안 붙었다고
//    그대로 말합니다.
//
//  ⚠ 없는 값은 「모름」으로 적습니다. LLM 에 0 을 넘기면 LLM 은 그것을
//    사실로 받아들이고, 그 위에서 틀린 조언을 만듭니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientBrief {
  clientId: string
  clientName: string
  /** 사람이 읽을 수 있는 요약 — 그대로 화면에 보여 주거나 LLM 에 보냅니다 */
  text: string
  /** 몇 줄로 모았는가 */
  lines: number
}

const fmt = (n: number) => n.toLocaleString('ko-KR')

export function buildClientBrief(data: AppData, client: Client, now = today()): ClientBrief {
  const sig = clientSignals(data, client, thisMonth())
  const h = customerHealth(data, client, now)
  const reqs = (data.requests ?? []).filter((r) => r.clientId === client.id)
  const inqs = (data.inquiries ?? []).filter((q) => q.clientId === client.id)
  const bills = data.payments.filter((p) => p.clientId === client.id && p.status !== '취소' && !p.canceledAt)
  const owed = bills.reduce((a, p) => a + outstandingOf(data, p), 0)
  const supplies = data.materials.filter((m) => m.clientId === client.id)

  const L: string[] = []
  L.push(`거래처: ${client.name} (${client.type || '구분 미설정'})`)
  L.push(`수거주기: ${client.collectionCycle || '미설정'}`)
  //  ⚠ 없는 것은 「모름」입니다 — 0 이라고 적지 않습니다.
  L.push(`최근 수거: ${sig.lastDate ?? '기록 없음'}`)
  L.push(`다음 예상 수거: ${sig.predictedDate ?? '모름 (기록이 모자랍니다)'}`)
  L.push(
    sig.prevKg > 0 && sig.recentKg > 0
      ? `배출량: 최근 2주 ${fmt(Math.round(sig.recentKg))}kg · 직전 2주 ${fmt(Math.round(sig.prevKg))}kg (${sig.growthPct >= 0 ? '+' : ''}${sig.growthPct}%)`
      : '배출량 추이: 견줄 기록이 모자랍니다',
  )
  L.push(`청구: ${bills.length}건 · 미수금 ${owed > 0 ? `${fmt(owed)}원` : '없음'}`)
  L.push(
    `요청: 모두 ${reqs.length}건 (포털 ${reqs.filter((r) => r.source === 'portal').length}건 · 긴급 ${reqs.filter((r) => r.kind === '긴급수거').length}건)`,
  )
  L.push(`문의: ${inqs.length}건 (답변 대기 ${inqs.filter((q) => q.status !== '답변 완료').length}건)`)
  L.push(`자재 공급: ${supplies.length}건`)
  L.push(
    h.measured === 0
      ? '상태: 아직 잴 수 있는 기록이 없습니다'
      : `상태: ${h.grade} (${h.score}점 — ${h.total}가지 중 ${h.measured}가지로 계산)`,
  )
  for (const r of h.reasons) L.push(`  · ${r.label}: ${r.detail}`)
  if (h.risks.length) L.push(`눈에 띄는 것: ${h.risks.join(' / ')}`)
  const sug = opsSuggestions(data, now).filter((x) => x.clientId === client.id)
  for (const x of sug) L.push(`다음 조치: ${x.action} — ${x.because}`)

  return { clientId: client.id, clientName: client.name, text: L.join('\n'), lines: L.length }
}
