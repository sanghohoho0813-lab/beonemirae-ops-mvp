// ─────────────────────────────────────────────────────────────────────────────
// 「시연 데이터 초기화」의 사정거리 (실제 DB · API)
//
//  이 앱에서 데이터를 실제로 지우는 기능은 이것 하나뿐입니다.
//  잘못 만들면 시연 기록을 지우려다 실제 수거·정산까지 날아갑니다.
//  한 번 날아가면 되돌릴 방법이 없으므로, 사정거리를 못으로 박아 둡니다.
//
//  확인하는 것
//   1) 관리자가 아니면 거부하는가
//   2) 시연 세션 id 없이 부르면 거부하는가 (전체 삭제 방지)
//   3) 다른 세션 id 로 부르면 남의 시연 기록도 건드리지 않는가
//   4) 자기 세션 것만 지우고, 실제 운영 데이터 수는 그대로인가
//
//  이 검사는 지우는 기능을 실제로 실행합니다. 그래서
//   · 지워질 대상은 이 검사가 직접 만든 시연 태깅 행뿐이고
//   · 실행 전후로 실제 운영 데이터 건수를 세어 하나도 줄지 않았음을 확인합니다.
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=...
//    node supabase/test/33_demo_reset_scope.mjs
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const SESSION = `[검증]demo-${Date.now()}`
const OTHER = `[검증]demo-other-${Date.now()}`

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)
const login = async (email, password) =>
  (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)).body?.access_token
const reset = (token, sessionId) =>
  fetch(`${U}/rest/v1/rpc/reset_demo_records`, {
    method: 'POST',
    headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_session_id: sessionId }),
  }).then(json)

/** 실제 운영 데이터(시연 태깅이 없는 행) 건수 */
async function realCounts() {
  const tables = ['schedules', 'materials', 'collection_events', 'site_notes', 'clients', 'client_requests']
  const out = {}
  for (const t of tables) {
    out[t] = ((await svc(`/${t}?select=id&demo_session_id=is.null`)).body ?? []).length
  }
  return out
}

async function main() {
  console.log('\n════ 시연 데이터 초기화의 사정거리 ════')

  const client = (await svc('/clients?select=id&active=eq.true&limit=1')).body?.[0]
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const made = { mine: [], other: [] }

  try {
    // ── 0. 실행 전 실제 데이터 건수 ─────────────────────────────────────
    section('0. 실행 전 실제 운영 데이터')
    const before = await realCounts()
    console.log('  ' + Object.entries(before).map(([k, v]) => `${k} ${v}`).join(' · '))

    //  운영 데이터가 시연으로 잘못 태깅돼 있으면 초기화 때 함께 지워집니다.
    let mistagged = 0
    for (const t of ['schedules', 'materials', 'collection_events', 'clients']) {
      mistagged += ((await svc(`/${t}?select=id&demo_session_id=not.is.null`)).body ?? []).length
    }
    check(mistagged === 0, '실제 운영 데이터에 시연 태깅이 섞여 있지 않음',
      mistagged ? `${mistagged}건이 시연으로 태깅돼 있습니다` : '')

    // ── 1. 권한 ────────────────────────────────────────────────────────
    section('1. 누가 부를 수 있는가')
    const officeTok = await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    const byOffice = await reset(officeTok, SESSION)
    check(byOffice.status >= 400 && /관리자만/.test(JSON.stringify(byOffice.body)),
      '사무실 계정은 초기화를 실행할 수 없음', `(${byOffice.status})`)

    const adminTok = await login(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    check(!!adminTok, '관리자로 로그인됨')

    // ── 2. 세션 id 없이 부르면 ──────────────────────────────────────────
    section('2. 시연 세션 id 없이 불렀을 때 (전체 삭제 방지)')
    for (const bad of ['', null]) {
      const r = await reset(adminTok, bad)
      check(r.status >= 400, `세션 id 가 ${bad === null ? 'null' : '빈 값'} 이면 거부`, `(${r.status})`)
    }

    // ── 3. 시연 기록을 두 세션으로 만들어 둔다 ──────────────────────────
    section('3. 시연 기록을 두 세션으로 만든다')
    for (const [key, sid] of [['mine', SESSION], ['other', OTHER]]) {
      const sched = (await svc('/schedules', {
        method: 'POST',
        body: JSON.stringify({
          date: today, client_id: client.id, waste_type: '의료폐기물',
          scheduled_time: '10:00', expected_amount: 10, status: '예정',
          is_additional: true, origin: 'demo', memo: `[검증]${key}`,
          demo_session_id: sid, event_id: crypto.randomUUID(),
        }),
      })).body?.[0]
      if (sched) made[key].push(['schedules', sched.id])
      const note = (await svc('/site_notes', {
        method: 'POST',
        body: JSON.stringify({ client_id: client.id, kind: '기타', content: `[검증]${key}메모`, demo_session_id: sid }),
      })).body?.[0]
      if (note) made[key].push(['site_notes', note.id])
    }
    check(made.mine.length === 2 && made.other.length === 2,
      '두 세션에 각각 시연 기록을 만듦', `내 세션 ${made.mine.length}건 · 다른 세션 ${made.other.length}건`)

    // ── 4. 내 세션만 초기화 ─────────────────────────────────────────────
    section('4. 내 세션 id 로 초기화')
    const done = await reset(adminTok, SESSION)
    check(done.status === 200, '초기화 실행됨', `(${done.status}) ${JSON.stringify(done.body)}`)

    const mineLeft = ((await svc(`/schedules?select=id&demo_session_id=eq.${encodeURIComponent(SESSION)}`)).body ?? []).length
      + ((await svc(`/site_notes?select=id&demo_session_id=eq.${encodeURIComponent(SESSION)}`)).body ?? []).length
    check(mineLeft === 0, '내 세션의 시연 기록은 모두 지워짐', `${mineLeft}건 남음`)

    const otherLeft = ((await svc(`/schedules?select=id&demo_session_id=eq.${encodeURIComponent(OTHER)}`)).body ?? []).length
      + ((await svc(`/site_notes?select=id&demo_session_id=eq.${encodeURIComponent(OTHER)}`)).body ?? []).length
    check(otherLeft === 2, '다른 세션의 시연 기록은 건드리지 않음', `${otherLeft}건 그대로`)

    // ── 5. 실제 운영 데이터는 하나도 줄지 않았는가 ──────────────────────
    section('5. 실제 운영 데이터 (가장 중요한 확인)')
    const after = await realCounts()
    const diffs = Object.keys(before).filter((k) => before[k] !== after[k])
    check(diffs.length === 0, '실제 운영 데이터가 한 건도 줄지 않음',
      diffs.length ? diffs.map((k) => `${k} ${before[k]}→${after[k]}`).join(' · ') : '')

    const audit = (await svc('/audit_logs?select=action,summary&action=eq.demo.reset&order=id.desc&limit=1')).body?.[0]
    check(!!audit && audit.summary.includes(SESSION), '초기화가 감사기록에 남음',
      audit?.summary?.slice(0, 50) ?? '없음')
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    //  남은 시연 기록(다른 세션 몫 포함)을 지웁니다.
    let removed = 0
    for (const sid of [SESSION, OTHER]) {
      for (const t of ['schedules', 'site_notes', 'collection_events']) {
        const rows = (await svc(`/${t}?select=id&demo_session_id=eq.${encodeURIComponent(sid)}`)).body ?? []
        for (const r of rows) { await svc(`/${t}?id=eq.${r.id}`, { method: 'DELETE' }); removed++ }
      }
    }
    check(true, '검증용 시연 기록 정리', `${removed}건 지움`)
    let leftover = 0
    for (const t of ['schedules', 'site_notes']) {
      leftover += ((await svc(`/${t}?select=id&demo_session_id=not.is.null`)).body ?? []).length
    }
    check(leftover === 0, '시연 태깅이 남지 않음', leftover ? `${leftover}건 남음` : '')

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`시연 초기화 사정거리: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
