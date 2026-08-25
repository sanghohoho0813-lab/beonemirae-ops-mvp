import type { AppData, Client } from '../types'
import { today, prettyDate } from './format'
import { portalSummary } from './portal'
import { outstandingOf } from './selectors'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 알림 — **표를 만들지 않았습니다** (0083)
//
//  대표님: 「실제 푸시알림이나 문자 API까지 구현할 필요는 없다. 웹 내부 알림
//  구조만 먼저 만든다.」
//
//  ⚠ 알림 표를 따로 두지 않은 이유 —
//    「내일 수거 예정입니다」·「요청이 승인되었습니다」·「미납이 있습니다」는
//    전부 **이미 있는 자료에서 그대로 나오는 말**입니다. 표에 미리 적어 두면
//    일정이 바뀌었는데 알림만 옛말을 하고 있는 어긋남이 반드시 생깁니다.
//    (실제로 그런 시스템을 여러 번 봤습니다 — 병원은 알림을 믿고 준비했는데
//     차가 안 오는 일이 그렇게 생깁니다)
//
//    그래서 볼 때마다 **지금 자료로** 만듭니다. 틀릴 수가 없습니다.
//
//  ⚠ 「읽음」 표시는 이 단계에서 두지 않습니다. 읽음을 저장하려면 결국 표가
//    필요하고, 그러면 위의 어긋남이 돌아옵니다. 알림은 지금 상태를 비추는
//    거울입니다 — 처리하면 저절로 사라집니다.
// ─────────────────────────────────────────────────────────────────────────────

export type NoticeTone = 'info' | 'good' | 'warn'

export interface PortalNotice {
  key: string
  tone: NoticeTone
  title: string
  /** 왜 이 알림이 떴는가 — 사실만 */
  detail: string
  /** 눌러서 갈 곳 (없으면 그냥 알림) */
  to?: string
}

const DAY = 86_400_000
const daysUntil = (iso: string, from: string) =>
  Math.round((new Date(iso).getTime() - new Date(from).getTime()) / DAY)

/**
 * 이 병원에게 지금 할 말.
 *
 *  ⚠ 할 말이 없으면 **빈 배열**입니다. 「알림이 없습니다」를 채우려고
 *    없는 말을 만들지 않습니다.
 */
export function portalNotices(data: AppData, client: Client, now = today()): PortalNotice[] {
  const out: PortalNotice[] = []
  const s = portalSummary(data, client)

  // ── 곧 수거가 옵니다 ──────────────────────────────────────────────────────
  //    ⚠ 「예상」인지 「확정」인지 반드시 구분합니다. 수거주기로 계산한 값을
  //      확정처럼 알리면, 병원은 그날 사람을 대기시켜 놓고 헛수고를 합니다.
  if (s.nextDate) {
    const d = daysUntil(s.nextDate, now)
    if (d >= 0 && d <= 2) {
      out.push({
        key: 'next',
        tone: 'info',
        title:
          d === 0 ? '오늘 수거 예정입니다' : d === 1 ? '내일 수거 예정입니다' : '모레 수거 예정입니다',
        detail: s.nextIsEstimate
          ? `${prettyDate(s.nextDate)} — 수거주기로 본 **예상**입니다 (확정 일정은 아닙니다)`
          : `${prettyDate(s.nextDate)}${s.nextTime ? ` ${s.nextTime}` : ''} 방문 예정`,
        to: '/portal',
      })
    }
  }

  // ── 올린 요청이 움직였습니다 ──────────────────────────────────────────────
  for (const r of s.allRequests.slice(0, 20)) {
    if (r.status === '일정 반영') {
      out.push({
        key: `req-ok-${r.id}`,
        tone: 'good',
        title: '요청이 일정에 반영되었습니다',
        detail: `${r.type} · ${r.content.slice(0, 40)}${r.content.length > 40 ? '…' : ''}`,
        to: '/portal',
      })
    } else if (r.status === '처리 완료' && r.reply) {
      out.push({
        key: `req-done-${r.id}`,
        tone: 'good',
        title: '요청 처리가 끝났습니다',
        detail: `회신: ${r.reply.slice(0, 50)}${r.reply.length > 50 ? '…' : ''}`,
        to: '/portal',
      })
    }
  }

  // ── 문의에 답이 왔습니다 ──────────────────────────────────────────────────
  for (const q of (data.inquiries ?? []).filter((x) => x.clientId === client.id)) {
    if (q.status === '답변 완료' && q.reply) {
      out.push({
        key: `inq-${q.id}`,
        tone: 'good',
        title: '문의에 답변이 등록되었습니다',
        detail: `${q.topic} · ${q.subject.slice(0, 40)}`,
        to: '/portal/support',
      })
    }
  }

  // ── 아직 안 낸 것이 있습니다 ──────────────────────────────────────────────
  //    ⚠ 돈 이야기는 조심스럽게 적습니다. 사실만 적고 재촉하지 않습니다.
  const owed = data.payments
    .filter((p) => p.clientId === client.id && p.status !== '취소' && !p.canceledAt)
    .reduce((a, p) => a + outstandingOf(data, p), 0)
  if (owed > 0) {
    out.push({
      key: 'owed',
      tone: 'warn',
      title: '납부하지 않은 청구가 있습니다',
      detail: `${owed.toLocaleString('ko-KR')}원 — 자세한 내역은 정산 화면에서 보실 수 있습니다`,
      to: '/portal/billing',
    })
  }

  // ── 이번 달 리포트가 만들어졌습니다 ───────────────────────────────────────
  //    ⚠ 수거가 한 건이라도 있어야 말이 됩니다. 0건인데 「리포트가
  //      나왔습니다」라고 하면 열어 봤을 때 빈 화면입니다.
  if (s.monthVisits > 0) {
    out.push({
      key: 'report',
      tone: 'info',
      title: '이번 달 수거 리포트를 보실 수 있습니다',
      detail: `이번 달 ${s.monthVisits}회 · ${Math.round(s.monthKg).toLocaleString('ko-KR')}kg 수거`,
      to: '/portal/report',
    })
  }

  return out
}
