import type { AppData, Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 시연 흔적은 시연 안에서만 (0142)
//
//  대표님: 「시연에서 예시로 입력한 건 거기서만 저장되고, 시연 끄면 같이 사라져야 하는데
//          시연 이후에도 흔적이 남아 있네. 『급한 요청이 반복되는 곳』이라고 나오는 거.」
//
//  발표 시연은 「시연용 병원」(isDemoGenerated) 한 곳 안에서만 요청 · 회신 · 날짜 잡기를 합니다.
//  그 기록은 DB 에 그대로 두고(지우지 않음), **시연을 끈 업무 화면에서는 안 보이게** 거릅니다.
//  시연 중(안내 카드 켜짐) · 발표 시작 화면(/presentation)에서는 그대로 보입니다.
//
//  ⚠ 거르는 것은 「시연용 병원」 하나뿐입니다 — 이름이 「시연용 병원」으로 시작하거나 메모에
//    「AI 시연용」이 적힌, 시연 표시(isDemoGenerated)가 있는 거래처. 시드의 시연용 확장 거래처
//    (로컬 시연 모드의 가상 거래처 30곳)는 건드리지 않습니다 — 그쪽은 그 자체가 시연 자료입니다.
//  ⚠ 그 병원 id(clientId) 또는 그 병원 요청 id(requestId)를 단 줄만 뺍니다. 다른 줄은 손대지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_CLIENT_NAME = '시연용 병원'

export function isPresenterDemoClient(c: Pick<Client, 'name' | 'note' | 'isDemoGenerated'>): boolean {
  if (!c.isDemoGenerated) return false
  return (c.name ?? '').trim().startsWith(DEMO_CLIENT_NAME) || /AI 시연용/.test(c.note ?? '')
}

type Row = Record<string, unknown>

/**
 * 기록이 만들어진 때 (비교용 ms). createdAt → at(수거 이벤트) → completedAt → date(그날 0시, 한국 시각).
 *  모르면 0 — 「오래된 것」으로 봅니다.
 */
function stamp(r: Row): { ms: number; dayOnly: boolean } {
  for (const k of ['createdAt', 'at', 'completedAt'] as const) {
    const v = r[k]
    if (typeof v === 'string' && v) {
      const ms = Date.parse(v)
      if (Number.isFinite(ms)) return { ms, dayOnly: false }
    }
  }
  const d = r.date
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return { ms: Date.parse(`${d.slice(0, 10)}T00:00:00+09:00`), dayOnly: true }
  return { ms: 0, dayOnly: false }
}

/**
 * 0143 — 시연 **중**: 「시연용 병원」의 기록 중 이번 시연(since) 뒤에 생긴 것만 남깁니다.
 *  대표님: 「예시로 몇 번 눌러 보느라 눌렀던 흔적 — 시연이 끝나면 다 같이 없어지는 걸로」.
 *  · 병원 자체 · 이번 시연 요청(keepRequestId)과 그 요청에 딸린 기록은 늘 남김
 *  · 날짜만 있는 기록(자재 공급 등)은 그날 것이면 남김
 *  · DB 에서 지우지 않습니다 — 화면에서 안 보일 뿐
 */
export function scopePresenterDemo(data: AppData, since: string, keepRequestId: string | null): AppData {
  const sinceMs = Date.parse(since)
  if (!since || !Number.isFinite(sinceMs)) return data
  const ids = new Set(data.clients.filter(isPresenterDemoClient).map((c) => c.id))
  if (ids.size === 0) return data
  const sinceDay = Date.parse(`${new Date(sinceMs + 9 * 3600_000).toISOString().slice(0, 10)}T00:00:00+09:00`)
  const old = (x: unknown) => {
    if (!x || typeof x !== 'object') return false
    const r = x as Row
    if (!(typeof r.clientId === 'string' && ids.has(r.clientId))) return false
    if (keepRequestId && (r.id === keepRequestId || r.requestId === keepRequestId)) return false
    const st = stamp(r)
    return st.dayOnly ? st.ms < sinceDay : st.ms < sinceMs
  }
  const out: Row = { ...data }
  let changed = false
  for (const [k, v] of Object.entries(data)) {
    if (k === 'clients' || k === 'retiredClients' || !Array.isArray(v) || v.length === 0) continue
    if (v.some(old)) { out[k] = v.filter((x) => !old(x)); changed = true }
  }
  return changed ? (out as unknown as AppData) : data
}

/** 「시연용 병원」과 그 병원 기록을 뺀 자료 — 없으면 받은 그대로 돌려줍니다(같은 객체) */
export function hidePresenterDemo(data: AppData): AppData {
  const ids = new Set(data.clients.filter(isPresenterDemoClient).map((c) => c.id))
  if (ids.size === 0) return data
  const reqIds = new Set(data.requests.filter((r) => ids.has(r.clientId)).map((r) => r.id))
  const hit = (x: unknown) => {
    if (!x || typeof x !== 'object') return false
    const r = x as Row
    return (typeof r.clientId === 'string' && ids.has(r.clientId)) || (typeof r.requestId === 'string' && reqIds.has(r.requestId))
  }
  const out: Row = { ...data }
  for (const [k, v] of Object.entries(data)) {
    if (!Array.isArray(v) || v.length === 0) continue
    if (k === 'clients' || k === 'retiredClients') out[k] = (v as Client[]).filter((c) => !ids.has(c.id))
    else if (v.some(hit)) out[k] = v.filter((x) => !hit(x))
  }
  return out as unknown as AppData
}
