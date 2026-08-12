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
  //
  //  0021 부터 물어보는 것이 달라졌습니다.
  //
  //   예전   "가입이 막혀 있는가"        — 열려 있으면 실패
  //   지금   "가입해도 아무 힘이 없는가" — 열려 있어도 되지만, 스스로 가입한
  //                                        계정은 승인 전까지 아무것도 못 봐야 합니다
  //
  //  가입 자체를 막는 것은 대시보드 설정 한 칸이고, 그 칸은 실수로 켜질 수
  //  있습니다. 그때 무너지지 않는 것이 중요합니다. 그래서 실제로 가입해 보고,
  //  그 계정으로 데이터를 요구해 봅니다.
  section('1. 스스로 가입한 계정이 힘을 갖는가')
  const probePw = `Probe-${Date.now()}!aA`
  const probeEmail = `signup-probe-${Date.now()}@beonemirae-probe.invalid`
  const signup = await fetch(`${U}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    //  공격자가 실제로 보낼 값입니다 — 스스로 관리자라고 적어서 보냅니다.
    body: JSON.stringify({
      email: probeEmail,
      password: probePw,
      data: { name: '가입검증', role: 'admin', client_id: '00000000-0000-0000-0000-000000000001' },
    }),
  }).then(json)
  const uid = signup.body?.id ?? signup.body?.user?.id
  const created = signup.status < 300 && uid

  if (!created) {
    ok('공개 가입이 아직 닫혀 있음 (관리자가 만든 계정만 로그인)',
      `(${signup.status}) ${(signup.body?.msg ?? signup.body?.error_description ?? signup.body?.code ?? '').toString().slice(0, 70)}`)
  } else {
    //  가입이 열려 있습니다. 여기서부터가 진짜 검증입니다.
    const row = (await svc(`/profiles?select=role,active,approved_at,client_id&id=eq.${uid}`)).body?.[0]
    check(row?.role === 'field', '스스로 admin 이라고 적어도 현장(field)으로 생성', `role=${row?.role}`)
    check(row?.active === false, '승인 전에는 비활성', `active=${row?.active}`)
    check(row?.approved_at === null, '승인 대기로 표시 (approved_at 없음)')
    check(row?.client_id === null, 'client_id 를 적어 보내도 소속이 붙지 않음')

    //  로그인은 됩니다. 그 토큰으로 무엇이 나오는지가 핵심입니다.
    const probeTok = (await token(probeEmail, probePw)).body?.access_token
    if (probeTok) {
      const cl = await asUser(probeTok, '/clients?select=id&limit=5')
      const au = await asUser(probeTok, '/audit_logs?select=id&limit=5')
      const pf = await asUser(probeTok, '/profiles?select=id')
      check(Array.isArray(cl.body) && cl.body.length === 0, '승인 대기 토큰으로 거래처 0건', `${cl.status}`)
      check(Array.isArray(au.body) && au.body.length === 0, '승인 대기 토큰으로 감사기록 0건', `${au.status}`)
      check(Array.isArray(pf.body) && pf.body.length <= 1, '계정 목록은 자기 것만', `${pf.body?.length}건`)

      //  스스로 승인하기
      const selfUp = await asUser(probeTok, `/profiles?id=eq.${uid}`, {
        method: 'PATCH', body: JSON.stringify({ active: true, role: 'admin', approved_at: new Date().toISOString() }),
      })
      const after = (await svc(`/profiles?select=role,active&id=eq.${uid}`)).body?.[0]
      check(after?.role === 'field' && after?.active === false,
        '본인이 자기 계정을 승인·승격할 수 없음', `PATCH ${selfUp.status} · role=${after?.role} active=${after?.active}`)

      //  승인 함수를 직접 부르기
      const rpc = await fetch(`${U}/rest/v1/rpc/admin_approve_user`, {
        method: 'POST',
        headers: { apikey: A, Authorization: `Bearer ${probeTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: uid, p_role: 'admin' }),
      }).then(json)
      check(rpc.status >= 400, '승인 함수를 직접 불러도 거절',
        `${rpc.status} ${(rpc.body?.message ?? '').toString().slice(0, 50)}`)
    } else {
      advise('가입 계정으로 로그인 토큰을 받지 못해 권한 확인을 건너뜀 (이메일 인증 대기일 수 있습니다)')
    }

    //  검증용 계정은 지웁니다.
    await fetch(`${U}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE', headers: { apikey: S, Authorization: `Bearer ${S}` },
    })
    await svc(`/profiles?email=eq.${encodeURIComponent(probeEmail)}`, { method: 'DELETE' })
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

  // 갱신 토큰 회전과 재생 공격
  //
  //  여기서 한 번 헛짚었습니다. 회전 직후의 옛 토큰이 잠깐 같은 세션을
  //  돌려주는 것을 문제로 봤는데, 그건 GoTrue 가 일부러 두는 재시도 보호입니다
  //  (Refresh token reuse interval, 기본 10초). 현장에서 통신이 끊겨 같은
  //  요청이 두 번 가는 일이 흔하기 때문입니다.
  //
  //  실제 재생 공격은 모양이 다릅니다. 토큰이 새어 나간 뒤 본인은 계속 쓰고,
  //  체인이 앞으로 나아간 다음 공격자가 옛 토큰을 들이미는 것입니다.
  //  그때 거부되는지, 그리고 본인 세션은 살아 있는지를 봐야 합니다.
  const s2 = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
  const refresh = (t) => fetch(`${U}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t }),
  }).then(json)

  const tokenA = s2.refresh_token
  const rB = await refresh(tokenA)
  check(!!rB.body?.access_token, '정상 갱신은 동작', `(${rB.status})`)
  check(rB.body?.refresh_token && rB.body.refresh_token !== tokenA,
    '갱신하면 새 갱신 토큰이 발급됨 (회전 켜져 있음)')

  // 재시도 보호 — 창 안에서는 같은 세션을 돌려줍니다 (의도된 동작)
  const retry = await refresh(tokenA)
  check(retry.body?.refresh_token === rB.body?.refresh_token,
    '통신이 끊겨 같은 요청이 두 번 가도 세션이 하나로 유지됨')

  // 재생 공격 — 재사용 창(10초)을 넘기고, 체인을 한 칸 더 진행시킨 뒤 옛 토큰을 들이밉니다
  await new Promise((r) => setTimeout(r, 12000))
  const rC = await refresh(rB.body.refresh_token)
  check(!!rC.body?.access_token, '본인은 계속 갱신 가능', `(${rC.status})`)

  const replay = await refresh(tokenA)
  check(!replay.body?.access_token, '새어 나간 옛 토큰의 재생은 거부',
    `(${replay.status}) ${(replay.body?.error_code ?? replay.body?.msg ?? '').toString().slice(0, 50)}`)

  const stillMine = await refresh(rC.body.refresh_token)
  check(!!stillMine.body?.access_token, '재생 시도가 본인 세션을 끊지 않음', `(${stillMine.status})`)

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
