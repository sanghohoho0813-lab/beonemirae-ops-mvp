import type { AppData, Client, RequestKind, SalesLead } from '../types'
import { today, thisMonth } from './format'
import { clientSchedules, requestsForClient, type RequestItem } from './ops'
import { cycleDays } from './insights'
import { isPending } from './scheduleLive'

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
    .filter((s) => s.date >= t && isPending(s))
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

// ─────────────────────────────────────────────────────────────────────────────
// 병원 서비스 → 추가 매출 전환 (심사·대시보드용)
//
//  "병원이 무엇을 요청했고, 우리가 얼마나 처리했고, 그래서 얼마가 되었는가"를
//  한 줄로 보여주기 위한 집계입니다.
//
//  숫자의 출처를 섞지 않는 것이 이 함수의 핵심입니다.
//    · 요청 / 처리  → client_requests (병원이 올린 실제 기록)
//    · 제안 / 수락  → sales_leads     (병원에 전달하고 병원이 직접 누른 기록)
//    · 실제 매출    → 수락 건에 담당자가 입력한 값만. 예상 매출은 절대 섞지 않습니다.
//
//  기록이 없으면 0으로 두고, 만들어 내지 않습니다. 대신 '무엇을 하면 채워지는지'는
//  화면에서 안내합니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 요청 유형 → 추천·제안 유형. 같은 카테고리로 묶어야 매출과 이어집니다. */
const REQUEST_TO_LEAD: Record<RequestKind, string> = {
  긴급수거: '추가수거',
  추가수거: '추가수거',
  소모품: '소모품공급',
  '교육·자료': '배출자교육',
  기타: '관리필요',
}

export interface ConversionRow {
  /** 화면에 쓰는 묶음 이름 */
  label: string
  /** 이 묶음에 들어가는 요청 유형 (색을 고르는 데 씁니다) */
  kind: RequestKind
  requested: number
  handled: number
  accepted: number
  /** 실제 입력된 매출만 */
  revenue: number
  /** 수락됐지만 매출이 아직 입력되지 않은 건수 */
  revenuePending: number
}

export interface ServiceConversion {
  month: string
  requested: number
  handled: number
  proposed: number
  accepted: number
  revenue: number
  revenuePending: number
  rows: ConversionRow[]
  /** 한 건이라도 기록이 있는지 — 없으면 화면에서 '시작 전'으로 안내합니다 */
  started: boolean
}

const CONVERSION_GROUPS: { label: string; kinds: RequestKind[]; kind: RequestKind }[] = [
  { label: '긴급 · 추가 수거', kinds: ['긴급수거', '추가수거'], kind: '긴급수거' },
  { label: '소모품 공급', kinds: ['소모품'], kind: '소모품' },
  { label: '교육 · 자료', kinds: ['교육·자료'], kind: '교육·자료' },
]

export function serviceConversion(data: AppData, month = thisMonth()): ServiceConversion {
  const reqs = (data.requests ?? []).filter((r) => r.createdAt.slice(0, 7) === month)
  const shared = (data.leads ?? []).filter((l) => l.sharedWithClient && l.month === month)
  const accepted = shared.filter((l) => l.stage === '수락')

  const rows: ConversionRow[] = CONVERSION_GROUPS.map((g) => {
    const rs = reqs.filter((r) => g.kinds.includes(r.kind))
    const leadKinds = new Set(g.kinds.map((k) => REQUEST_TO_LEAD[k]))
    const acc = accepted.filter((l) => leadKinds.has(l.kind))
    return {
      label: g.label,
      kind: g.kind,
      requested: rs.length,
      handled: rs.filter((r) => r.status === '처리 완료').length,
      accepted: acc.length,
      revenue: acc.reduce((s, l) => s + (l.actualRevenue ?? 0), 0),
      revenuePending: acc.filter((l) => l.actualRevenue == null).length,
    }
  })

  return {
    month,
    requested: reqs.length,
    handled: reqs.filter((r) => r.status === '처리 완료').length,
    proposed: shared.length,
    accepted: accepted.length,
    revenue: accepted.reduce((s, l) => s + (l.actualRevenue ?? 0), 0),
    revenuePending: accepted.filter((l) => l.actualRevenue == null).length,
    rows,
    started: reqs.length > 0 || shared.length > 0,
  }
}
