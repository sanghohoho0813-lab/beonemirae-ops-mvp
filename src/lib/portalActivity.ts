import type { AppData, Client } from '../types'
import { REQUEST_KIND_LABEL } from '../types'
import { clientSchedules, requestsForClient } from './ops'
import { outstandingOf } from './selectors'
import { today, prettyDate, weight, won } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 「우리 병원에 무슨 일이 있었나」 (0089)
//
//  대표님: 「홈 화면이 너무 비어 보이지 않도록 … 데이터는 실제 DB에서
//  가져온다. 없는 경우 적절한 Empty State」
//
//  ⚠ **표를 새로 만들지 않았습니다.** 이미 있는 자료(수거·주문·청구·문의·
//    요청)를 시각 순으로 한 줄에 세울 뿐입니다. 활동 로그를 따로 쌓으면
//    원래 자료가 바뀌었을 때 로그만 옛말을 하고 있게 됩니다.
//
//  ⚠ 없으면 빈 배열입니다. 채우려고 없는 일을 지어내지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityKind = '수거' | '주문' | '정산' | '문의' | '요청'

export interface ActivityItem {
  key: string
  kind: ActivityKind
  /** YYYY-MM-DD */
  date: string
  title: string
  /** 숫자·상태 같은 짧은 꼬리말 */
  tail?: string
}

export function recentActivity(data: AppData, client: Client, limit = 5): ActivityItem[] {
  const out: ActivityItem[] = []
  const t = today()

  //  ── 수거 ──────────────────────────────────────────────────────────────
  for (const s of clientSchedules(data, client.id).filter((x) => x.status === '완료' && x.date <= t).slice(0, 8)) {
    out.push({
      key: `sch-${s.id}`,
      kind: '수거',
      date: s.date,
      title: '수거 완료',
      //  ⚠ 무게가 안 적혔으면 「0kg」이 아니라 안 적습니다.
      tail: s.actualAmount != null ? `${s.wasteType} ${weight(s.actualAmount)}` : s.wasteType,
    })
  }

  //  ── 자재 주문 ─────────────────────────────────────────────────────────
  for (const o of (data.productOrders ?? []).filter((x) => x.clientId === client.id).slice(0, 8)) {
    const items = (o.items ?? []).map((i) => `${i.name} ${i.qty}${i.unit || '개'}`).join(' · ')
    out.push({
      key: `ord-${o.id}`,
      kind: '주문',
      date: (o.deliveredAt ?? o.requestedAt).slice(0, 10),
      title: o.status === '전달완료' ? '물품 전달 완료' : '물품 주문',
      tail: items || o.status,
    })
  }

  //  ── 입금 ──────────────────────────────────────────────────────────────
  //   ⚠ 실제 입금 기록이 있을 때만입니다. 청구서에 적힌 예정일을
  //     입금일처럼 보여 주지 않습니다.
  const myPayments = new Set(
    data.payments.filter((p) => p.clientId === client.id).map((p) => p.id),
  )
  for (const r of (data.receipts ?? []).filter((x) => myPayments.has(x.paymentId)).slice(0, 6)) {
    out.push({
      key: `rcp-${r.id}`,
      kind: '정산',
      date: r.receivedOn,
      title: '입금 확인',
      tail: won(r.amount),
    })
  }

  //  ── 문의 ──────────────────────────────────────────────────────────────
  for (const q of (data.inquiries ?? []).filter((x) => x.clientId === client.id).slice(0, 6)) {
    if (q.status === '답변 완료' && q.reply) {
      out.push({
        key: `inq-${q.id}`,
        kind: '문의',
        date: (q.handledAt ?? q.createdAt).slice(0, 10),
        title: '문의 답변 완료',
        tail: q.subject,
      })
    } else {
      out.push({
        key: `inq-${q.id}`,
        kind: '문의',
        date: q.createdAt.slice(0, 10),
        title: '문의 접수',
        tail: q.subject,
      })
    }
  }

  //  ── 수거 요청 ─────────────────────────────────────────────────────────
  for (const r of requestsForClient(data, client.id).slice(0, 6)) {
    out.push({
      key: `req-${r.id}`,
      kind: '요청',
      date: r.when.slice(0, 10),
      //  ⚠ 저장값(`소모품`)이 아니라 **병원이 읽는 이름**으로 적습니다.
      title:
        r.status === '접수'
          ? `${REQUEST_KIND_LABEL[r.type] ?? r.type} 요청 접수`
          : `${REQUEST_KIND_LABEL[r.type] ?? r.type} 요청 · ${r.status}`,
      tail: r.content.split('\n')[0].slice(0, 40),
    })
  }

  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

// ─────────────────────────────────────────────────────────────────────────────
// 「지금 확인이 필요한 것」 (0089 · 브리프 21)
//
//  ⚠ 없으면 **빈 배열**입니다. 대표님: 「0건이면 영역을 과도하게 크게
//    보여주지 않는다」. 할 말이 없는데 자리를 잡아 두지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface TodoItem {
  key: string
  title: string
  detail: string
  tone: 'info' | 'warn' | 'good'
  /** 눌러서 열 창 */
  sheet?: 'history' | 'billing' | 'supply' | 'ask' | 'report'
}

const DAY = 86_400_000
const daysUntil = (iso: string, from: string) =>
  Math.round((new Date(iso).getTime() - new Date(from).getTime()) / DAY)

export function portalTodos(
  data: AppData,
  client: Client,
  next: { date: string | null; isEstimate: boolean },
  now = today(),
): TodoItem[] {
  const out: TodoItem[] = []

  //  ── 곧 수거가 옵니다 ──────────────────────────────────────────────────
  if (next.date) {
    const d = daysUntil(next.date, now)
    if (d >= 0 && d <= 2) {
      out.push({
        key: 'next',
        tone: 'info',
        title: d === 0 ? '오늘 수거 예정입니다' : d === 1 ? '내일 수거 예정입니다' : '모레 수거 예정입니다',
        //  ⚠ 「예상」인지 「확정」인지 반드시 구분합니다. 수거주기로 계산한
        //    값을 확정처럼 알리면, 병원은 그날 사람을 대기시켜 놓고 헛수고를
        //    합니다.
        detail: next.isEstimate
          ? `${prettyDate(next.date)} — 수거주기로 본 예상입니다 (확정 아님)`
          : `${prettyDate(next.date)} 방문 예정`,
        sheet: 'history',
      })
    }
  }

  //  ── 주문한 물품이 움직였습니다 ────────────────────────────────────────
  for (const o of (data.productOrders ?? []).filter((x) => x.clientId === client.id)) {
    if (o.status === '전달예정' || o.status === '준비') {
      out.push({
        key: `ord-${o.id}`,
        tone: 'good',
        title: o.status === '전달예정' ? '주문하신 물품이 곧 전달됩니다' : '주문하신 물품을 준비 중입니다',
        detail:
          (o.items ?? []).map((i) => `${i.name} ${i.qty}${i.unit || '개'}`).join(' · ') ||
          '자세한 내용은 주문 내역에서 보실 수 있습니다',
        sheet: 'supply',
      })
    }
  }

  //  ── 문의에 답이 왔습니다 ──────────────────────────────────────────────
  for (const q of (data.inquiries ?? []).filter((x) => x.clientId === client.id)) {
    if (q.status === '답변 완료' && q.reply) {
      out.push({
        key: `inq-${q.id}`,
        tone: 'good',
        title: '문의에 답변이 도착했습니다',
        detail: `${q.topic} · ${q.subject.slice(0, 40)}`,
        sheet: 'ask',
      })
    }
  }

  //  ── 아직 안 낸 것이 있습니다 ──────────────────────────────────────────
  //   ⚠ 돈 이야기는 사실만 적고 재촉하지 않습니다.
  const owed = data.payments
    .filter((p) => p.clientId === client.id && p.status !== '취소' && !p.canceledAt)
    .reduce((a, p) => a + outstandingOf(data, p), 0)
  if (owed > 0) {
    out.push({
      key: 'owed',
      tone: 'warn',
      title: '납부하지 않은 청구가 있습니다',
      detail: `${won(owed)} — 자세한 내역은 정산 현황에서 보실 수 있습니다`,
      sheet: 'billing',
    })
  }

  return out
}
