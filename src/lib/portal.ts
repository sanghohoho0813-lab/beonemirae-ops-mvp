import type { AppData, Client, SalesLead } from '../types'
import { today, thisMonth } from './format'
import { clientSchedules, requestsForClient, type RequestItem } from './ops'
import { cycleDays } from './insights'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 화면용 파생값
//
//  병원 담당자에게 필요한 것은 내부 운영 지표가 아니라 아래 네 가지입니다.
//    · 다음 수거는 언제인가
//    · 최근에 얼마나 가져갔는가
//    · 내가 올린 요청은 어떻게 되었는가
//    · 비원미래가 제안한 것이 있는가
//
//  전부 이미 쌓여 있는 운영 데이터에서 나옵니다. 병원용으로 따로 만드는
//  데이터는 없으며, 없는 값은 만들지 않고 '아직 없음'으로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalSummary {
  client: Client
  /** 다음 수거 예정 (등록된 일정 우선, 없으면 수거주기 기반 예상) */
  nextDate: string | null
  nextTime: string | null
  /** 등록된 일정이 아니라 수거주기로 계산한 값인지 */
  nextIsEstimate: boolean
  lastDate: string | null
  lastKg: number | null
  /** 이번 달 수거량 · 횟수 */
  monthKg: number
  monthVisits: number
  /** 진행 중인 요청 / 전체 요청 */
  openRequests: RequestItem[]
  allRequests: RequestItem[]
  /** 병원에 전달된 제안 중 아직 응답하지 않은 것 */
  pendingProposals: SalesLead[]
  /** 병원이 수락한 제안 */
  acceptedProposals: SalesLead[]
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function portalSummary(data: AppData, client: Client, month = thisMonth()): PortalSummary {
  const t = today()
  const all = clientSchedules(data, client.id)
  const done = all.filter((s) => s.status === '완료')
  const last = done[0] ?? null

  const upcoming = all
    .filter((s) => s.date >= t && s.status !== '완료')
    .sort((a, b) => (a.date + a.scheduledTime).localeCompare(b.date + b.scheduledTime))[0]

  // 등록된 일정이 없으면 수거주기로 예상만 보여주고, 예상값임을 분명히 표시합니다.
  const estimated = last ? addDays(last.date, Math.round(cycleDays(client.collectionCycle))) : null

  const monthDone = done.filter((s) => s.date.startsWith(month))
  const requests = requestsForClient(data, client.id)
  const leads = (data.leads ?? []).filter((l) => l.clientId === client.id && l.sharedWithClient)

  return {
    client,
    nextDate: upcoming?.date ?? estimated,
    nextTime: upcoming?.scheduledTime ?? null,
    nextIsEstimate: !upcoming && !!estimated,
    lastDate: last?.date ?? null,
    lastKg: last?.actualAmount ?? null,
    monthKg: monthDone.reduce((s, x) => s + (x.actualAmount ?? 0), 0),
    monthVisits: monthDone.length,
    openRequests: requests.filter((r) => r.status !== '처리 완료'),
    allRequests: requests,
    pendingProposals: leads.filter((l) => l.stage === '제안'),
    acceptedProposals: leads.filter((l) => l.stage === '수락'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 서비스 운영 현황 (비원미래 내부용)
//  "고객 서비스가 실제로 돌아가고 있는가"를 실제 기록으로만 집계합니다.
// ─────────────────────────────────────────────────────────────────────────────
export interface CustomerServiceStats {
  /** 요청을 올린 병원 수 */
  activeClients: number
  requestsTotal: number
  requestsOpen: number
  requestsDone: number
  /** 병원이 직접 올린 비율 (전화 대행 접수 제외) */
  portalRatio: number
  /** 병원에 전달한 제안 / 병원이 수락한 제안 */
  proposalsShared: number
  proposalsAccepted: number
  /** 수락된 제안 중 실제 매출이 입력된 금액 */
  acceptedRevenue: number
}

export function customerServiceStats(data: AppData): CustomerServiceStats {
  const reqs = data.requests ?? []
  const leads = data.leads ?? []
  const shared = leads.filter((l) => l.sharedWithClient)
  const accepted = shared.filter((l) => l.stage === '수락')
  const portal = reqs.filter((r) => r.source === 'portal').length
  return {
    activeClients: new Set(reqs.map((r) => r.clientId)).size,
    requestsTotal: reqs.length,
    requestsOpen: reqs.filter((r) => r.status !== '처리 완료').length,
    requestsDone: reqs.filter((r) => r.status === '처리 완료').length,
    portalRatio: reqs.length ? Math.round((portal / reqs.length) * 100) : 0,
    proposalsShared: shared.length,
    proposalsAccepted: accepted.length,
    acceptedRevenue: accepted.reduce((s, l) => s + (l.actualRevenue ?? 0), 0),
  }
}
