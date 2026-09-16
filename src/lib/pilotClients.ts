import type { AppData, Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Pilot 거래처 (0122) — 「이번 주 5~10곳」을 가르는 표식 하나
//
//  ⚠ 거래처 표(clients)에는 칸을 더하지 않았습니다. 실증 설정
//    (experiment_settings, id=1)의 pilot_client_ids 한 칸에 id 목록만 둡니다.
//    그래서 SQL(PROPOSAL_0122) 을 아직 안 돌린 판에서도 앱은 그대로 돌고,
//    Pilot 은 0곳으로 보입니다 — 지어내지 않습니다.
//
//  ⚠ src/lib/pilotMode.ts 는 다른 것입니다 — 「Pilot 동안 화면 숨기기」 스위치.
//    이름이 비슷해 헷갈리지 않게 여기는 pilotClients 로 부릅니다.
//
//  ⚠ 「10곳」은 권장이지 상한이 아닙니다. 11번째를 막지 않고, 화면에
//    「5 / 10」처럼 권장 수를 함께 적을 뿐입니다.
// ─────────────────────────────────────────────────────────────────────────────

export const PILOT_RECOMMENDED = 10

/** 관리자 화면에서 「먼저 켜 보시라」고 짚어 주는 조건 — 월정액 거래처 (PHASE 1) */
export function isFlatFeeClient(c: Client): boolean {
  return (c.monthlyFlatFee ?? 0) > 0
}

export function pilotIdsOf(data: Pick<AppData, 'experiment'>): Set<string> {
  return new Set(data.experiment?.pilotClientIds ?? [])
}

export function isPilotClient(data: Pick<AppData, 'experiment'>, clientId: string | null | undefined): boolean {
  return !!clientId && pilotIdsOf(data).has(clientId)
}

/** Pilot 으로 켜진 실제 거래처 — 시연용(isDemoGenerated)은 켜져 있어도 세지 않습니다 */
export function pilotClientsOf(data: Pick<AppData, 'experiment' | 'clients'>): Client[] {
  const ids = pilotIdsOf(data)
  return data.clients.filter((c) => ids.has(c.id) && !c.isDemoGenerated)
}

/** SQL 을 아직 안 돌렸는지 — undefined 는 「칸이 없다」, [] 는 「아직 안 골랐다」 */
export function pilotColumnMissing(data: Pick<AppData, 'experiment'>): boolean {
  return data.experiment?.pilotClientIds === undefined
}

/** PHASE 기록용 — 화면 문구와 PILOT_PLAN.md 가 같은 표를 씁니다 */
export const PILOT_PHASES: { phase: 1 | 2 | 3 | 4; label: string; scope: string }[] = [
  { phase: 1, label: '월정액 거래처', scope: '5~10곳 · 이번 주' },
  { phase: 2, label: '단순 거래처', scope: '단일 성상 · 주 1~2회' },
  { phase: 3, label: 'kg 단가 거래처', scope: '수거량이 곧 금액' },
  { phase: 4, label: '박스 · 자재 · 복합', scope: '개당 정산 · 자재 유상 · 혼합' },
]
