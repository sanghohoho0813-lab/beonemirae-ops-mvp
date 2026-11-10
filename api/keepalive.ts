// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — 서버 유지 신호 (/api/keepalive)
//
//  Supabase 무료 프로젝트는 「지난 1주일 동안 사용자 DB 활동이 충분하지 않으면」 일시정지됩니다
//  (공식 문서 — 하루에 요청 몇 번이면 보통 충분). 직원이 앱을 매일 쓰면 문제없지만, 안 쓰는 주가
//  생기면 멈춥니다. 그래서 사람 손 없이 **읽기 전용에 가까운 작은 DB 요청**을 주기적으로 보냅니다.
//
//   누가 부르나   설정 화면의 「지금 유지 신호 보내기」. 사람 손 없이 주기적으로 부르는 예약(Vercel Cron ·
//                 GitHub Actions)은 **대표님이 켜기로 하셨을 때만** 답니다 — docs/SERVER_KEEPALIVE_0151.md
//   무엇을 하나   공개 키(anon)로 `app_ping()` 을 몇 번 부릅니다(PROPOSAL_0151 — 유지 신호 한 줄만 고침).
//                 그 함수가 아직 없으면 로그인 전용 함수를 불러 DB 가 「권한 없음」이라고 **답하게** 합니다
//                 (DB 까지는 닿습니다 — 업무 자료는 읽지도 쓰지도 않습니다).
//   무엇을 답하나 { ok, state, at } — 주소 · 키 · 자료는 답에 넣지 않습니다.
//                 일시정지(540) · 못 닿음이면 503 으로 답해, 부른 쪽이 실패로 알 수 있게 합니다.
//
//  · Edge 런타임 · 외부 SDK 없이 fetch
//  · 환경변수: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (앱 빌드에 이미 쓰는 공개 값 — 새 비밀 없음)
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: 'edge' }

/** 한 번 불릴 때 DB 에 보내는 요청 수 — 공식 문서의 「하루에 요청 몇 번」에 맞추려고 */
export const PINGS = 3

export type KeepaliveState = 'ok' | 'reached' | 'paused' | 'down' | 'not_configured'

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/** 응답 코드 하나를 상태로 — ok(함수가 돌았다) · reached(DB 가 답했다) · paused · down */
export function stateOf(status: number): KeepaliveState {
  if (status === 540) return 'paused'
  if (status >= 200 && status < 300) return 'ok'
  //  401 · 403 — DB 가 「권한 없음」이라고 답한 것. 404 는 PostgREST 가 함수 목록만 보고 답한 것일 수 있어 reached 로 치지 않습니다.
  if (status === 401 || status === 403) return 'reached'
  return 'down'
}

export async function ping(url: string, key: string, fetchImpl: typeof fetch = fetch): Promise<{ state: KeepaliveState; needsSql: boolean }> {
  const call = async (fn: string) => {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    return res.status
  }
  let needsSql = false
  let best: KeepaliveState = 'down'
  for (let i = 0; i < PINGS; i += 1) {
    let status = needsSql ? 404 : await call('app_ping')
    if (status === 404) {
      //  유지 신호 함수가 아직 없습니다(PROPOSAL_0151 전) — 로그인 전용 함수로 DB 까지 닿게 합니다
      needsSql = true
      status = await call('app_schema_version')
    }
    const s = stateOf(status)
    if (s === 'paused') return { state: 'paused', needsSql }
    if (s === 'ok' || (s === 'reached' && best !== 'ok')) best = s
  }
  return { state: best, needsSql }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ ok: false, error: 'GET 만 받습니다.' }, 405)
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim()
  const key = (env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '').trim()
  const at = new Date().toISOString()
  if (!url || !key) return json({ ok: false, state: 'not_configured' satisfies KeepaliveState, at }, 500)
  try {
    const r = await ping(url, key)
    const ok = r.state === 'ok' || r.state === 'reached'
    //  needs_sql — 신호는 DB 까지 갔지만 기록 함수가 없습니다(PROPOSAL_0151 을 실행하면 ok 가 됩니다)
    return json({ ok, state: r.state, needs_sql: r.needsSql, at }, ok ? 200 : 503)
  } catch {
    return json({ ok: false, state: 'down' satisfies KeepaliveState, at }, 503)
  }
}
