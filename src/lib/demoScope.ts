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
