// ─────────────────────────────────────────────────────────────────────────────
// Auth 경계 검증 (실제 Supabase)
//
//  05 는 "제대로 로그인하면 되는가"를 봅니다. 여기서는 그 반대쪽 —
//  로그인 없이, 로그아웃한 뒤, 토큰을 손댄 채로 들어오려 할 때를 봅니다.
//
//  실제로 사고가 나는 자리
//   · 공개 가입이 켜져 있으면 아무나 계정을 만들어 내부 화면에 들어옵니다.
//     설정 한 칸이고, 실수로 켜져 있어도 화면상으로는 아무 표시가 없습니다.
//   · 로그인 실패 문구가 "없는 계정"과 "틀린 비밀번호"를 구분해 주면
//     누가 이 회사 직원인지 밖에서 알아낼 수 있습니다.
//   · 로그아웃했는데 갱신 토큰이 살아 있으면 기기를 잃어버렸을 때 회수가 안 됩니다.
//   · 시연 초기화 함수가 실제 데이터를 지울 수 있으면 그날로 끝입니다.
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_CLIENT_PW=... TEST_FIELD_PW=...
//    node supabase/test/11_auth_boundary.mjs
//
//  · 가입이 열려 있으면 계정이 하나 만들어집니다. 확인 즉시 지웁니다.
//  · 실제 데이터는 건드리지 않습니다 (읽기와 거부 확인만).
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'

let pass = 0
let fail = 0
let warn = 0
const warns = []
/** 코드로 고칠 수 없는 것(대시보드 설정 등)은 실패가 아니라 경고로 드러냅니다 */
const advise = (t, e = '') => { warn++; warns.push(`${t}${e ? ' — ' + e : ''}`); console.log(`  경고  ${t}${e ? '  ' + e : ''}`) }
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}`)

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
const asUser = (token, path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: A, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(json)

const token = (email, password) =>
  fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)

async function login(email, password) {
  const r = await token(email, password)
  if (!r.body?.access_token) throw new Error(`로그인 실패 ${email}: ${JSON.stringify(r.body).slice(0, 120)}`)
  return r.body
}

/** JWT 의 payload 만 바꿔치기 (서명은 그대로 두면 서버가 거부해야 합니다) */
function tamper(jwt, patch) {
  const [h, p, s] = jwt.split('.')
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
  return `${h}.${b64({ ...payload, ...patch })}.${s}`
}

async function main() {
  console.log('\n════ Auth 경계 검증 ════')

  // ── 1. 공개 가입 ──────────────────────────────────────────────────────────
  section('1. 공개 가입이 막혀 있는가')
  const probeEmail = `signup-probe-${Date.now()}@beonemirae-probe.invalid`
  const signup = await fetch(`${U}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: probeEmail, password: `Probe-${Date.now()}!aA` }),
  }).then(json)
  const created = signup.status < 300 && (signup.body?.id || signup.body?.user?.id)
  check(!created, '외부인이 계정을 만들 수 없음',
    created ? `가입이 열려 있습니다 (${signup.status})` : `(${signup.status}) ${(signup.body?.msg ?? signup.body?.error_description ?? signup.body?.code ?? '').toString().slice(0, 70)}`)
  if (created) {
    // 열려 있었다면 확인 즉시 지웁니다
    const uid = signup.body?.id ?? signup.body?.user?.id
    await fetch(`${U}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE', headers: { apikey: S, Authorization: `Bearer ${S}` },
    })
    await svc(`/profiles?email=eq.${encodeURIComponent(probeEmail)}`, { method: 'DELETE' })
    console.log('        → 만들어진 계정을 지웠습니다. Supabase 대시보드에서')
    console.log('          Authentication → Providers → Email → "Allow new users to sign up" 를 꺼 주세요.')
  }

  // ── 2. 로그인 실패 문구가 계정 존재를 흘리는가 ────────────────────────────
  section('2. 로그인 실패 문구')
  const wrongPw = await token(`office@${DOMAIN}`, '틀린비밀번호-probe-1234')
  const noSuch = await token(`nobody-${Date.now()}@${DOMAIN}`, '틀린비밀번호-probe-1234')
  const m1 = JSON.stringify(wrongPw.body)
  const m2 = JSON.stringify(noSuch.body)
  check(wrongPw.status === noSuch.status, '있는 계정과 없는 계정의 응답 코드가 같음',
    `${wrongPw.status} vs ${noSuch.status}`)
  check(m1 === m2, '응답 내용도 같음 (계정 존재 여부가 새지 않음)',
    m1 === m2 ? (wrongPw.body?.error_description ?? wrongPw.body?.msg ?? '').slice(0, 60) : `${m1.slice(0, 50)} / ${m2.slice(0, 50)}`)

  // ── 3. 손댄 토큰 ──────────────────────────────────────────────────────────
  section('3. 토큰을 손댔을 때')
  const office = await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
  const client = await login(`client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
  const adminId = (await svc(`/profiles?select=id&email=eq.${encodeURIComponent(`admin@${DOMAIN}`)}`)).body?.[0]?.id

  const cases = [
    ['서명 없는 토큰', office.access_token.split('.').slice(0, 2).join('.') + '.'],
    ['서명 바꾼 토큰', office.access_token.slice(0, -3) + 'AAA'],
    ['role 을 service_role 로', tamper(office.access_token, { role: 'service_role' })],
    ['sub 를 관리자 id 로', tamper(office.access_token, { sub: adminId })],
    ['만료시각을 미래로', tamper(office.access_token, { exp: Math.floor(Date.now() / 1000) + 999999 })],
    ['빈 토큰', ''],
    ['아무 문자열', 'not-a-jwt'],
  ]
  for (const [label, t] of cases) {
    const r = await asUser(t, '/clients?select=id&limit=1')
    const gotRows = Array.isArray(r.body) && r.body.length > 0
    check(!gotRows, `${label} 으로는 데이터를 못 가져옴`, `(${r.status})`)
  }

  // 관리자 id 로 sub 만 바꾼 토큰이 관리자 권한을 얻지는 않는지 (감사로그로 확인)
  const asAdminFake = await asUser(tamper(office.access_token, { sub: adminId }), '/audit_logs?select=id&limit=1')
  check(!(Array.isArray(asAdminFake.body) && asAdminFake.body.length),
    'sub 를 바꿔도 관리자 전용 데이터가 열리지 않음', `(${asAdminFake.status})`)

  // ── 4. 로그아웃 ───────────────────────────────────────────────────────────
  section('4. 로그아웃한 뒤')
  const tmp = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
  await fetch(`${U}/auth/v1/logout`, {
    method: 'POST', headers: { apikey: A, Authorization: `Bearer ${tmp.access_token}` },
  })
  const refreshAfter = await fetch(`${U}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tmp.refresh_token }),
  }).then(json)
  check(!refreshAfter.body?.access_token, '로그아웃하면 갱신 토큰이 죽음 (기기 회수 가능)',
    `(${refreshAfter.status})`)

  // 갱신 토큰 회전
  const s2 = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
  const refresh = (t) => fetch(`${U}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t }),
  }).then(json)

  const first = await refresh(s2.refresh_token)
  check(!!first.body?.access_token, '정상 갱신은 동작', `(${first.status})`)
  check(first.body?.refresh_token && first.body.refresh_token !== s2.refresh_token,
    '갱신하면 새 갱신 토큰이 발급됨 (회전 켜져 있음)')

  // 회전한 뒤 이전 토큰이 언제까지 사는지.
  //
  //  GoTrue 는 네트워크가 끊겨 재시도하는 경우를 위해 잠깐(기본 10초) 같은
  //  세션을 돌려줍니다. 그 사이의 재사용은 정상 동작입니다. 하지만 그 창이
  //  길면, 갱신 토큰이 새어 나갔을 때 훔친 쪽과 본인이 같은 세션을 나눠 쓰게
  //  되고 서버가 그것을 이상 징후로 잡아내지 못합니다.
  //
  //  이건 코드가 아니라 프로젝트 설정입니다(Authentication → Sessions).
  //  그래서 실패로 세지 않되, 조용히 넘기지도 않습니다.
  await new Promise((r) => setTimeout(r, 30000))
  const late = await refresh(s2.refresh_token)
  if (late.body?.access_token) {
    advise('회전 전 갱신 토큰이 30초 뒤에도 유효합니다',
      'Authentication → Sessions 에서 「Detect and revoke potentially compromised refresh tokens」를 켜 주세요')
  } else {
    ok('회전한 뒤 이전 갱신 토큰은 무효', `(${late.status})`)
  }

  // ── 5. 키만으로는 아무것도 안 되는가 ──────────────────────────────────────
  section('5. 공개 키만 들고 왔을 때')
  const anonRead = await asUser(null, '/clients?select=id&limit=1')
  check(!(Array.isArray(anonRead.body) && anonRead.body.length), '공개 키만으로 거래처 조회 불가', `(${anonRead.status})`)
  const anonRpc = await fetch(`${U}/rest/v1/rpc/complete_collection`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: {} }),
  }).then(json)
  check(anonRpc.status !== 200, '공개 키만으로 수거 완료 호출 불가', `(${anonRpc.status})`)

  // ── 6. 시연 초기화가 실제 데이터를 지울 수 있는가 ─────────────────────────
  section('6. 시연 초기화 함수')
  const realBefore = {
    clients: ((await svc('/clients?select=id')).body ?? []).length,
    schedules: ((await svc('/schedules?select=id')).body ?? []).length,
    materials: ((await svc('/materials?select=id')).body ?? []).length,
    events: ((await svc('/collection_events?select=id')).body ?? []).length,
  }
  const attempts = [null, '', 'field', 'all', '%']
  for (const sid of attempts) {
    await fetch(`${U}/rest/v1/rpc/reset_demo_records`, {
      method: 'POST',
      headers: { apikey: A, Authorization: `Bearer ${office.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_session_id: sid }),
    })
  }
  const realAfter = {
    clients: ((await svc('/clients?select=id')).body ?? []).length,
    schedules: ((await svc('/schedules?select=id')).body ?? []).length,
    materials: ((await svc('/materials?select=id')).body ?? []).length,
    events: ((await svc('/collection_events?select=id')).body ?? []).length,
  }
  const untouched = Object.keys(realBefore).every((k) => realBefore[k] === realAfter[k])
  check(untouched, '어떤 인자를 넣어도 실제 데이터가 지워지지 않음',
    Object.keys(realBefore).map((k) => `${k} ${realBefore[k]}→${realAfter[k]}`).join(' · '))

  // 병원 계정은 아예 호출할 수 없어야 합니다
  const clientReset = await fetch(`${U}/rest/v1/rpc/reset_demo_records`, {
    method: 'POST',
    headers: { apikey: A, Authorization: `Bearer ${client.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_session_id: 'x' }),
  }).then(json)
  const stillThere = ((await svc('/clients?select=id')).body ?? []).length
  check(stillThere === realBefore.clients, '병원 계정이 호출해도 데이터가 그대로', `거래처 ${stillThere}곳`)

  // ── 7. 병원 계정이 남의 제안에 응답할 수 있는가 ─────────────────────────
  section('7. 병원 계정이 남의 제안에 응답할 수 있는가')
  const myClient = (await svc(`/profiles?select=client_id&email=eq.${encodeURIComponent(`client@${DOMAIN}`)}`)).body?.[0]?.client_id
  const otherClient = ((await svc('/clients?select=id,name')).body ?? []).find((c) => c.id !== myClient)
  let seeded = null
  if (otherClient) {
    // 남의 병원 제안을 하나 만들어 둡니다 (공유 상태 — 가장 열려 있는 조건)
    const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
    seeded = (await svc('/sales_leads', {
      method: 'POST',
      body: JSON.stringify({
        key: `[검증]AUTH경계-${Date.now()}`, client_id: otherClient.id, client_name: otherClient.name,
        kind: '자재', title: '[검증]교차 응답 확인용', month, est_value: 0,
        stage: '제안', shared_with_client: true,
      }),
    })).body?.[0]
  }
  if (seeded) {
    const r = await fetch(`${U}/rest/v1/rpc/respond_to_proposal`, {
      method: 'POST',
      headers: { apikey: A, Authorization: `Bearer ${client.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_lead_id: seeded.id, p_accept: true }),
    }).then(json)
    const now = (await svc(`/sales_leads?select=stage&id=eq.${seeded.id}`)).body?.[0]?.stage
    check(now === '제안', '남의 병원 제안은 단계가 바뀌지 않음', `(${r.status}) 제안 → ${now}`)
    const visible = await asUser(client.access_token, `/sales_leads?select=id&id=eq.${seeded.id}`)
    check(!(Array.isArray(visible.body) && visible.body.length), '남의 병원 제안은 보이지도 않음')
    await svc(`/sales_leads?id=eq.${seeded.id}`, { method: 'DELETE' })
  } else {
    console.log('  (건너뜀) 두 번째 거래처가 없어 교차 응답을 확인하지 못했습니다')
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL${warn ? ` / ${warn} 경고` : ''} ════`)
  if (warns.length) {
    console.log('\n코드로는 못 고치는 것 (대시보드에서 설정해 주세요):')
    for (const w of warns) console.log(`  · ${w}`)
  }
  console.log(`\nAuth 경계: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
