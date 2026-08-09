#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// 실제 Supabase 프로젝트 라이브 검증
//
//  01_verify.sql 은 DB 안에서 세션을 흉내 내어 검증합니다. 이 스크립트는 그
//  바깥, 즉 "실제로 앱이 통신하는 경로"를 검증합니다.
//
//    · 로그인       → GoTrue (/auth/v1/token)
//    · 데이터 접근  → PostgREST (/rest/v1/…) + 실제 JWT
//    · 권한         → 서버가 실제로 거부하는지 (메뉴 숨김이 아니라 응답 코드)
//    · 수거 완료    → complete_collection RPC 의 전 항목이 DB 에 남는지
//
//  즉 "코드상 된다"가 아니라 "실제 프로젝트에서 된다"를 확인합니다.
//
// ── 실행 방법 ────────────────────────────────────────────────────────────────
//
//   1) 환경변수를 셸에만 넣습니다 (파일로 저장하지 말고, 커밋하지 마세요)
//
//      export SUPABASE_URL="https://xxxx.supabase.co"
//      export SUPABASE_ANON_KEY="sb_publishable_…"     # 공개 키 (프론트와 동일)
//      export SUPABASE_SERVICE_ROLE_KEY="sb_secret_…"  # 이 스크립트에서만 사용
//
//      예전 JWT 형식(eyJ…) 키도 그대로 동작합니다.
//      export TEST_ADMIN_PW=…  TEST_OFFICE_PW=…  TEST_FIELD_PW=…  TEST_CLIENT_PW=…
//
//      · SERVICE_ROLE 키는 계정 생성과 "DB 에 실제로 남았는지" 확인에만 씁니다.
//        프론트엔드 번들에는 절대 들어가지 않습니다.
//      · 검증이 끝나면 셸을 닫거나 unset 하세요.
//
//   2) 계정이 없다면 먼저 만듭니다 (이미 있으면 건너뜁니다)
//
//      node supabase/test/05_live.mjs --setup
//
//   3) 검증
//
//      node supabase/test/05_live.mjs
//
//   4) 검증용으로 만든 데이터를 지웁니다
//
//      node supabase/test/05_live.mjs --cleanup
//
//  --setup 은 검증용 거래처·차량·일정·요청을 만듭니다. 이름에 모두
//  '[검증]' 접두사가 붙고 --cleanup 이 그것만 지우므로, 실제 운영 데이터와
//  섞이지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const ANON = process.env.SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'

const ACCOUNTS = {
  admin: { email: `admin@${EMAIL_DOMAIN}`, pw: process.env.TEST_ADMIN_PW, name: '검증 관리자' },
  office: { email: `office@${EMAIL_DOMAIN}`, pw: process.env.TEST_OFFICE_PW, name: '검증 사무실' },
  field: { email: `field@${EMAIL_DOMAIN}`, pw: process.env.TEST_FIELD_PW, name: '검증 현장' },
  client: { email: `client@${EMAIL_DOMAIN}`, pw: process.env.TEST_CLIENT_PW, name: '검증 병원' },
}

const MARK = '[검증]' // 이 접두사가 붙은 것만 만들고 지웁니다

if (!URL_ || !ANON) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY 가 필요합니다. 파일 상단 주석을 참고하세요.')
  process.exit(2)
}

const mode = process.argv[2] ?? '--verify'

// ── 최소 HTTP 도우미 ─────────────────────────────────────────────────────────
const rest = async (token, path, init = {}, key = ANON) => {
  const r = await fetch(`${URL_}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  let body = null
  try {
    body = await r.json()
  } catch {
    /* 204 */
  }
  return { status: r.status, body }
}
const rpc = (token, fn, args) => rest(token, `/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
/** service_role 로 읽습니다 — RLS 를 우회하므로 "DB 에 실제로 남았는가"의 기준입니다. */
const truth = (path, init) => {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY 가 없어 DB 실제 상태를 확인할 수 없습니다.')
  // apikey 까지 secret 으로 보냅니다.
  //
  // 새 키 형식(sb_publishable_ / sb_secret_)에서는 게이트웨이가 apikey 로 역할을
  // 정합니다. 예전처럼 apikey 에 공개키를 두고 Authorization 에만 secret 을
  // 넣으면 권한이 조용히 anon 으로 떨어질 수 있습니다. 그러면 이 함수가
  // "DB 에 실제로 남았는가"를 확인하지 못하는데 실패가 RLS 문제처럼 보여
  // 원인을 엉뚱한 데서 찾게 됩니다.
  return rest(SERVICE, path, init, SERVICE)
}

async function login(who) {
  const a = ACCOUNTS[who]
  if (!a.pw) throw new Error(`TEST_${who.toUpperCase()}_PW 환경변수가 없습니다.`)
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.pw }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`${a.email} 로그인 실패: ${JSON.stringify(d)}`)
  return d
}

let pass = 0
let fail = 0
const failed = []
const ok = (cond, msg) => {
  if (cond) pass++
  else {
    fail++
    failed.push(msg)
  }
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
}
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`)

// ── --setup : 계정 + 검증용 데이터 ───────────────────────────────────────────
async function setup() {
  if (!SERVICE) throw new Error('계정 생성에는 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')

  // 1) 검증용 병원 (client 계정이 소속될 곳)
  const existing = await truth(`/clients?select=id&name=eq.${encodeURIComponent(MARK + '한마음요양병원')}`)
  let clientId = existing.body?.[0]?.id
  if (!clientId) {
    const c = await truth('/clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: `${MARK}한마음요양병원`,
        type: '요양병원',
        address: '서울 양천구 목동로 55',
        manager: '검증담당',
        collection_cycle: '주 3회',
        collects_medical_waste: true,
        collects_diaper: true,
      }),
    })
    clientId = c.body?.[0]?.id
    console.log(`거래처 생성: ${MARK}한마음요양병원`)
  }

  // 2) 계정 4개
  for (const [role, a] of Object.entries(ACCOUNTS)) {
    if (!a.pw) throw new Error(`TEST_${role.toUpperCase()}_PW 환경변수가 없습니다.`)
    const r = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: a.email,
        password: a.pw,
        email_confirm: true,
        user_metadata: { name: a.name, role, ...(role === 'client' ? { client_id: clientId } : {}) },
      }),
    })
    const d = await r.json()
    console.log(`계정 ${a.email}: ${r.status === 200 ? '생성' : `이미 있음/실패 (${d.msg ?? d.message ?? r.status})`}`)
  }

  // 2-1) 계정이 이미 있으면 트리거가 동작하지 않으므로 역할·소속을 맞춰 둡니다.
  //      (--cleanup 이 병원 계정을 field 로 되돌려 두기 때문에 재실행 시 필요합니다)
  await truth(`/profiles?email=eq.${encodeURIComponent(ACCOUNTS.client.email)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'client', client_id: clientId }),
  })
  for (const [role, a] of Object.entries(ACCOUNTS)) {
    if (role === 'client') continue
    await truth(`/profiles?email=eq.${encodeURIComponent(a.email)}`, {
      method: 'PATCH',
      body: JSON.stringify({ role, active: true }),
    })
  }

  // 3) profiles 가 트리거로 채워졌는지
  const profs = await truth('/profiles?select=email,role,client_id')
  for (const [role, a] of Object.entries(ACCOUNTS)) {
    const p = profs.body?.find((x) => x.email === a.email)
    console.log(`profiles ${a.email} → role=${p?.role ?? '없음'}${role === 'client' ? ` client_id=${p?.client_id ? 'O' : 'X'}` : ''}`)
  }

  // 4) 차량 · 오늘 일정 · 병원 요청
  const veh = await truth(`/vehicles?select=id&name=eq.${encodeURIComponent(MARK + '검증차량')}`)
  let vehicleId = veh.body?.[0]?.id
  if (!vehicleId) {
    const v = await truth('/vehicles', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: `${MARK}검증차량`,
        waste_type: '의료폐기물',
        tonnage: 1,
        nominal_capacity: 180,
        expected_capacity: 150,
        driver: '검증기사',
      }),
    })
    vehicleId = v.body?.[0]?.id
  }

  const today = kstToday()
  const sch = await truth(`/schedules?select=id&client_id=eq.${clientId}&date=eq.${today}&waste_type=eq.${encodeURIComponent('의료폐기물')}`)
  if (!sch.body?.length) {
    await truth('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        date: today,
        client_id: clientId,
        waste_type: '의료폐기물',
        vehicle_id: vehicleId,
        scheduled_time: '11:00',
        expected_amount: 32,
        status: '예정',
        origin: 'seed',
      }),
    })
    console.log(`오늘(${today}) 검증용 일정 생성`)
  }

  const req = await truth(`/client_requests?select=id&client_id=eq.${clientId}`)
  if (!req.body?.length) {
    await truth('/client_requests', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        kind: '추가수거',
        content: `${MARK} 보관실이 빨리 찼습니다. 추가 수거 가능할까요?`,
        urgent: true,
        status: '접수',
        requester_name: '검증담당',
      }),
    })
    console.log('검증용 병원 요청 생성')
  }

  // 5) 사무실 재고 — 자재 동시공급 검증에 필요한 만큼만 보충
  const st = await truth('/office_stock?select=*&id=eq.1')
  const s = st.body?.[0]
  if (s && (s.corrugated_box < 20 || s.needle_box < 20)) {
    await truth('/office_stock?id=eq.1', {
      method: 'PATCH',
      body: JSON.stringify({
        corrugated_box: Math.max(s.corrugated_box, 20),
        needle_box: Math.max(s.needle_box, 20),
      }),
    })
    console.log('사무실 재고 보충 (검증 최소치)')
  }

  console.log('\n준비 완료 — 이제 `node supabase/test/05_live.mjs` 로 검증하세요.')
}

/** 서버(KST) 기준 오늘 — complete_collection 이 쓰는 기준과 같습니다 */
function kstToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

// ── --cleanup ────────────────────────────────────────────────────────────────
async function cleanup() {
  if (!SERVICE) throw new Error('정리에는 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  const c = await truth(`/clients?select=id,name&name=like.${encodeURIComponent(MARK + '%')}`)
  const rows = c.body ?? []
  let removed = 0
  for (const { id, name } of rows) {
    for (const path of [
      `/materials?client_id=eq.${id}`,
      `/payments?client_id=eq.${id}`,
      `/collection_events?client_id=eq.${id}`,
      `/schedules?client_id=eq.${id}`,
      `/client_requests?client_id=eq.${id}`,
      `/site_notes?client_id=eq.${id}`,
      `/sales_leads?client_id=eq.${id}`,
    ]) {
      await truth(path, { method: 'DELETE' })
    }
    // 병원 계정을 먼저 떼어 놓습니다.
    // profiles 에는 "role=client 이면 client_id 가 있어야 한다"는 제약이 있어서,
    // 거래처를 지우면 SET NULL 이 그 제약과 충돌합니다. client_id 만 비우는 것도
    // 같은 이유로 실패하므로 역할까지 함께 바꿉니다.
    await truth(`/profiles?client_id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'field', client_id: null }),
    })
    const del = await truth(`/clients?id=eq.${id}`, { method: 'DELETE' })
    if (del.status === 204 || del.status === 200) {
      removed++
    } else {
      console.log(`  삭제 실패 ${name}: ${del.status} ${del.body?.message ?? ''}`)
    }
  }
  await truth(`/vehicles?name=like.${encodeURIComponent(MARK + '%')}`, { method: 'DELETE' })
  console.log(`검증용 데이터 삭제 완료 (거래처 ${removed}/${rows.length}곳)`)
  console.log('계정은 남겨 둡니다 — 필요 없으면 Supabase 대시보드에서 지우세요.')
  console.log('병원 계정은 소속 병원이 사라지므로 역할을 field 로 되돌려 두었습니다.')
}

// ── --verify ─────────────────────────────────────────────────────────────────
async function verify() {
  const T = {}
  const S = {}

  // ── 0. 준비 상태 자기점검 ────────────────────────────────────────────────
  //  아래 검증은 전부 "DB 에 실제로 남았는가"를 service 권한으로 확인합니다.
  //  그 권한이 안 잡히면 멀쩡한 기능도 전부 실패로 나와 원인을 엉뚱한 데서
  //  찾게 되므로, 시작 전에 한 번만 확인하고 넘어갑니다.
  //  순서가 중요합니다. 스키마가 없으면 무엇을 물어도 404 라서,
  //  "차단됐다"와 "테이블이 없다"를 구분하지 못합니다.
  //  권한 → 스키마 → 차단 순으로 확인합니다.
  section('0. 연결 · 권한 확인')
  if (SERVICE) {
    const d = await db('/profiles?select=id&limit=1')
    ok(
      d.status === 200,
      d.status === 200
        ? 'service 권한으로 DB 직접 확인 가능'
        : `service 권한 확인 실패 (${d.status}) — SUPABASE_SERVICE_ROLE_KEY 를 확인하세요`,
    )
    if (d.status !== 200) {
      console.log('\n  service 권한이 없으면 아래 검증은 모두 무의미합니다. 여기서 멈춥니다.\n')
      return
    }
  } else {
    ok(false, 'SUPABASE_SERVICE_ROLE_KEY 없음 — DB 실제 상태를 확인할 수 없습니다')
    return
  }
  {
    // 스키마가 적용되지 않은 상태에서 돌리면 전부 404 로 실패합니다.
    const need = ['profiles', 'clients', 'schedules', 'materials', 'collection_events', 'audit_logs',
                  'client_requests', 'office_stock', 'material_transactions']
    const missing = []
    for (const t of need) {
      const r = await db(`/${t}?select=*&limit=1`)
      if (r.status === 404) missing.push(t)
    }
    ok(missing.length === 0, missing.length ? `테이블 없음: ${missing.join(', ')} — migration 을 먼저 적용하세요` : '필수 테이블 존재')
    if (missing.length) return
  }
  {
    // 스키마가 있는 것을 확인한 뒤에야 "차단됐다"가 의미를 가집니다.
    const probe = await fetch(`${URL_}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: ANON } })
    ok(probe.status === 401 || probe.status === 403, `공개키만으로는 profiles 접근 차단 (${probe.status})`)
  }

  section('1. 실제 Auth 로그인')
  for (const who of Object.keys(ACCOUNTS)) {
    const d = await login(who)
    T[who] = d.access_token
    S[who] = d.refresh_token
    const claims = JSON.parse(Buffer.from(d.access_token.split('.')[1], 'base64url').toString())
    ok(claims.role === 'authenticated' && !!claims.sub, `${who} 실제 로그인 (sub ${String(claims.sub).slice(0, 8)})`)
  }
  {
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ACCOUNTS.admin.email, password: 'definitely-wrong-password' }),
    })
    ok(r.status >= 400, `잘못된 비밀번호 거부 (${r.status})`)
  }
  {
    // 세션 갱신 — 새로고침 후 로그인이 유지되는 실제 경로입니다
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: S.field }),
    })
    const d = await r.json()
    ok(!!d.access_token, `refresh_token 으로 세션 갱신 (${r.status})`)
    if (d.access_token) T.field = d.access_token
  }
  {
    // 역할 확인 — 프로필이 트리거로 만들어졌는지
    // (admin 은 전체 목록이 보이므로 반드시 본인 것을 지목해서 읽습니다)
    for (const who of Object.keys(ACCOUNTS)) {
      const p = await rest(T[who], `/profiles?select=role,client_id&email=eq.${encodeURIComponent(ACCOUNTS[who].email)}`)
      const me = p.body?.[0]
      ok(me?.role === who, `${who} 프로필 역할 = ${me?.role ?? '없음'}`)
      if (who === 'client') ok(!!me?.client_id, '병원 계정에 소속 병원 연결됨')
    }
  }

  section('2. 미인증 접근 차단')
  for (const tbl of ['clients', 'profiles', 'audit_logs', 'schedules']) {
    const r = await fetch(`${URL_}/rest/v1/${tbl}?select=id`, { headers: { apikey: ANON } })
    ok(r.status === 401 || r.status === 403, `미인증 anon → ${tbl} 차단 (${r.status})`)
  }

  section('3. RLS — 실제 query 수준')
  // field
  {
    const s = await rest(T.field, '/schedules?select=id,date,status')
    ok(s.status === 200 && s.body.length > 0, `field → 일정 조회 성공 (${s.body?.length}건)`)
    for (const tbl of ['audit_logs', 'payments', 'sales_leads']) {
      const r = await rest(T.field, `/${tbl}?select=id`)
      ok(r.status === 200 && r.body.length === 0, `field → ${tbl} 접근 차단 (0건)`)
    }
    const ins = await rest(T.field, '/clients', { method: 'POST', body: JSON.stringify({ name: `${MARK}몰래`, type: '의원' }) })
    ok(ins.status === 401 || ins.status === 403, `field → 거래처 등록 차단 (${ins.status})`)
    for (const tbl of ['performance_baselines', 'experiment_settings']) {
      const r = await rest(T.field, `/${tbl}?id=eq.1`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(tbl === 'experiment_settings' ? { start_date: '2020-01-01' } : { daily_capacity: 999 }),
      })
      ok(!(Array.isArray(r.body) && r.body.length), `field → ${tbl}(관리자 설정) 변경 차단`)
    }
    const me = await rest(T.field, '/profiles?select=id')
    const esc = await rest(T.field, `/profiles?id=eq.${me.body?.[0]?.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'admin' }),
    })
    ok(!(Array.isArray(esc.body) && esc.body.some((x) => x.role === 'admin')), 'field → 본인 권한 상승 차단')
  }
  // office
  {
    const c = await rest(T.office, '/clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: `${MARK}CRUD검증`, type: '의원' }),
    })
    ok(c.status === 201, `office → 거래처 등록 허용 (${c.status})`)
    const id = c.body?.[0]?.id
    if (id) {
      const u = await rest(T.office, `/clients?id=eq.${id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ manager: '수정됨' }),
      })
      ok(u.body?.[0]?.manager === '수정됨', `office → 거래처 수정 허용 (${u.status})`)
      const by = await truth(`/clients?id=eq.${id}&select=created_by`)
      ok(!!by.body?.[0]?.created_by, '등록한 행에 작성자 자동 기록 (created_by)')
      await truth(`/clients?id=eq.${id}`, { method: 'DELETE' })
    }
    const a = await rest(T.office, '/audit_logs?id=gt.0', { method: 'DELETE' })
    ok(a.status === 401 || a.status === 403, `office → 감사로그 삭제 차단 (${a.status})`)
    const p = await rest(T.office, '/profiles?select=id')
    ok(p.body.length <= 1, `office → 전체 사용자 목록 조회 불가 (${p.body?.length}건)`)
  }
  // admin
  {
    const a = await rest(T.admin, '/audit_logs?select=id&limit=1')
    ok(a.status === 200, `admin → 감사로그 접근 허용 (${a.status})`)
    const p = await rest(T.admin, '/profiles?select=id')
    ok(p.body.length >= 4, `admin → 사용자 목록 조회 (${p.body?.length}명)`)
  }
  // client
  const myClientId = (await rest(T.client, '/profiles?select=client_id')).body?.[0]?.client_id
  {
    const c = await rest(T.client, '/clients?select=id,name')
    ok(c.body.length === 1 && c.body[0].id === myClientId, `client → 본인 병원만 조회 (${c.body?.length}곳)`)
    const s = await rest(T.client, '/schedules?select=client_id')
    ok(s.body.every((x) => x.client_id === myClientId), 'client → 본인 병원 일정만 조회')
    for (const tbl of ['audit_logs', 'payments', 'office_stock', 'profiles']) {
      const r = await rest(T.client, `/${tbl}?select=*`)
      const n = r.body?.length ?? 0
      ok(tbl === 'profiles' ? n <= 1 : n === 0, `client → ${tbl} 접근 차단 (${n}건)`)
    }
    const mine = await rest(T.client, '/client_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ client_id: myClientId, kind: '소모품', content: `${MARK} 본인 병원 요청` }),
    })
    ok(mine.status === 201, `client → 본인 병원 요청 생성 허용 (${mine.status})`)

    const others = await truth(`/clients?select=id&id=neq.${myClientId}&limit=1`)
    const otherId = others.body?.[0]?.id
    if (otherId) {
      const bad = await rest(T.client, '/client_requests', {
        method: 'POST',
        body: JSON.stringify({ client_id: otherId, kind: '소모품', content: `${MARK} 남의 병원` }),
      })
      ok(bad.status === 401 || bad.status === 403, `client → 타 병원 요청 생성 차단 (${bad.status})`)

      const victim = (await truth(`/client_requests?client_id=eq.${otherId}&select=id,status&limit=1`)).body?.[0]
      if (victim) {
        const upd = await rest(T.client, `/client_requests?id=eq.${victim.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: '처리 완료' }),
        })
        ok(!(Array.isArray(upd.body) && upd.body.length), `client → 타 병원 요청 수정 차단 (${upd.status})`)
      } else {
        console.log('SKIP  타 병원 요청이 없어 수정 차단은 확인하지 못했습니다')
      }
    } else {
      console.log('SKIP  다른 병원이 없어 교차 접근 검증을 건너뜁니다')
    }
    if (mine.body?.[0]?.id) {
      const forge = await rest(T.client, `/client_requests?id=eq.${mine.body[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ reply: '스스로 처리 완료' }),
      })
      const got = await truth(`/client_requests?id=eq.${mine.body[0].id}&select=reply`)
      ok(!got.body?.[0]?.reply, `client → 담당자 회신 위조 불가 (${forge.status})`)
      await truth(`/client_requests?id=eq.${mine.body[0].id}`, { method: 'DELETE' })
    }
  }

  section('4. 수거 완료 트랜잭션 (field)')
  const today = kstToday()
  const sched = (await truth(`/schedules?select=*&client_id=eq.${myClientId}&date=eq.${today}&status=eq.${encodeURIComponent('예정')}&limit=1`)).body?.[0]
  if (!sched) {
    ok(false, `오늘(${today}) 예정 일정이 없어 수거 완료를 검증하지 못했습니다 — --setup 을 먼저 실행하세요`)
  } else {
    const stockBefore = (await truth('/office_stock?select=*&id=eq.1')).body?.[0]
    const evtBefore = (await truth('/collection_events?select=id')).body?.length ?? 0
    const audBefore = (await truth('/audit_logs?select=id')).body?.length ?? 0

    const payload = (over = {}) => ({
      p: {
        scheduleId: sched.id,
        clientId: myClientId,
        wasteType: sched.waste_type,
        vehicleId: sched.vehicle_id,
        driverName: '검증기사',
        actualAmount: 34,
        actualTime: '11:12',
        containers: { corrugated: 3, plastic: 2, bag: 1, etc: 0 },
        handoverStatus: '수거 완료',
        supplied: { corrugatedBox: 2, plasticContainer: 0, bag: 0, needleBox: 1 },
        isAdditional: false,
        memo: `${MARK} 라이브 검증`,
        screen: 'collection',
        inputDurationMs: 48000,
        demoSessionId: null,
        ...over,
      },
    })

    const r = await rpc(T.field, 'complete_collection', payload())
    ok(r.status === 200 && r.body?.eventId, `field → 수거 완료 저장 (${r.status})`)

    const after = (await truth(`/schedules?select=*&id=eq.${sched.id}`)).body?.[0]
    ok(after?.status === '완료', `일정 상태 완료 (${after?.status})`)
    ok(after?.actual_amount === 34, `실제 수거량 34kg 기록 (${after?.actual_amount})`)
    ok(after?.event_id === r.body?.eventId, '일정 ↔ 수거 이벤트 연결')

    const evtAfter = (await truth('/collection_events?select=id,actor_role')).body ?? []
    ok(evtAfter.length === evtBefore + 1, `수거 이벤트 +1 (${evtBefore} → ${evtAfter.length})`)
    ok(evtAfter.some((e) => e.actor_role === 'field'), '수거 이벤트 실행자 = field')

    const mats = (await truth(`/materials?select=id&client_id=eq.${myClientId}`)).body ?? []
    ok(mats.length >= 1, `자재 공급 이력 생성 (${mats.length}건)`)
    const stockAfter = (await truth('/office_stock?select=*&id=eq.1')).body?.[0]
    ok(
      stockAfter?.corrugated_box === stockBefore.corrugated_box - 2 && stockAfter?.needle_box === stockBefore.needle_box - 1,
      `사무실 재고 차감 (골판지 ${stockBefore.corrugated_box}→${stockAfter?.corrugated_box}, 침통 ${stockBefore.needle_box}→${stockAfter?.needle_box})`,
    )

    const reqs = (await truth(`/client_requests?select=status&client_id=eq.${myClientId}`)).body ?? []
    ok(reqs.some((x) => x.status === '처리 완료'), `관련 병원 요청 자동 처리 (${reqs.map((x) => x.status).join(', ')})`)

    const audAfter = (await truth('/audit_logs?select=action,actor_id&order=id.desc')).body ?? []
    ok(audAfter.length > audBefore, `감사로그 증가 (${audBefore} → ${audAfter.length})`)
    ok(audAfter.some((a) => a.action === 'collection.complete'), '수거 완료 감사로그 기록')
    ok(audAfter.every((a) => !!a.actor_id), '모든 감사로그에 실행자 기록')

    // 중복 저장 차단 — 같은 날 같은 병원·같은 구분
    const dup = await rpc(T.field, 'complete_collection', payload({ scheduleId: null }))
    ok(dup.status >= 400, `중복 완료 차단 (${dup.status})`)
    // 추가 수거는 허용
    const add = await rpc(T.field, 'complete_collection', payload({
      scheduleId: null, isAdditional: true, actualTime: '17:40', actualAmount: 9,
      supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
    }))
    ok(add.status === 200, `추가 수거는 같은 날에도 허용 (${add.status})`)
    if (add.body?.eventId) await rpc(T.office, 'revert_collection', { p_event_id: add.body.eventId })

    // 병원 계정은 수거 입력을 할 수 없다
    const bad = await rpc(T.client, 'complete_collection', payload({ scheduleId: null, isAdditional: true }))
    ok(bad.status >= 400, `client → 수거 완료 차단 (${bad.status})`)

    // half-completed 가 없어야 한다
    const orphan = (await truth(`/schedules?select=id&status=eq.${encodeURIComponent('완료')}&event_id=is.null`)).body ?? []
    ok(orphan.length === 0, `중간만 저장된 상태 없음 (완료·이벤트없음 ${orphan.length}건)`)
  }

  section('5. 두 세션 동기화 (서버가 원본인지)')
  {
    const target = (await truth(`/client_requests?select=id,status&client_id=eq.${myClientId}&limit=1`)).body?.[0]
    if (!target) {
      ok(false, '검증용 병원 요청이 없어 동기화를 확인하지 못했습니다 — --setup 을 실행하세요')
    } else {
      // 세션 A (office) 가 상태를 바꾸고
      const upd = await rest(T.office, `/client_requests?id=eq.${target.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: '확인 중', reply: `${MARK} 담당자 회신` }),
      })
      ok(upd.status === 200, `세션 A(office) 요청 상태 변경 (${upd.status})`)
      // 세션 B (admin) 가 같은 값을 본다
      const seenByAdmin = (await rest(T.admin, `/client_requests?id=eq.${target.id}&select=status,reply`)).body?.[0]
      ok(seenByAdmin?.status === '확인 중', `세션 B(admin)에서 동일 값 확인 (${seenByAdmin?.status})`)
      // 세션 C (병원) 도 자기 요청의 회신을 본다
      const seenByClient = (await rest(T.client, `/client_requests?id=eq.${target.id}&select=status,reply`)).body?.[0]
      ok(seenByClient?.reply?.includes(MARK), '세션 C(병원)에서 담당자 회신 확인')
    }
  }

  section('6. demo / live 분리')
  {
    const demoTagged = (await truth('/schedules?select=id&demo_session_id=not.is.null')).body ?? []
    ok(demoTagged.length === 0, `실사용 일정에 시연 태깅 없음 (demo_session_id ${demoTagged.length}건)`)
    const demoOrigin = (await truth(`/schedules?select=id&origin=eq.demo`)).body ?? []
    ok(demoOrigin.length === 0, `실사용 일정 origin 에 demo 없음 (${demoOrigin.length}건)`)
    const demoClients = (await truth('/clients?select=id&is_demo_generated=is.true')).body ?? []
    ok(demoClients.length === 0, `실제 DB 에 시연 생성 거래처 없음 (${demoClients.length}곳)`)
    // reset_demo_records 는 시연 세션 것만 지웁니다 — 실제 데이터는 건드리지 않아야 합니다
    const before = (await truth('/schedules?select=id')).body?.length ?? 0
    const res = await rpc(T.admin, 'reset_demo_records', { p_session_id: 'live-verify-nonexistent-session' })
    const afterCount = (await truth('/schedules?select=id')).body?.length ?? 0
    ok(before === afterCount, `시연 초기화가 실제 데이터를 건드리지 않음 (${before} → ${afterCount}, rpc ${res.status})`)
  }

  section('결과')
  console.log(`\n합계  PASS ${pass} · FAIL ${fail}`)
  if (fail) {
    console.log('\n실패 항목:')
    failed.forEach((f) => console.log(`  · ${f}`))
  }

  const yn = (b) => (b ? 'YES' : 'NO')
  const noFail = (kw) => !failed.some((f) => kw.some((k) => f.includes(k)))
  console.log('\n─────────────────────────────────')
  console.log(`LIVE SUPABASE VERIFIED: ${yn(fail === 0)}`)
  console.log(`AUTH VERIFIED: ${yn(noFail(['로그인', '세션', '역할', '비밀번호']))}`)
  console.log(`RLS VERIFIED: ${yn(noFail(['차단', '허용', '조회', '권한']))}`)
  console.log(`CRUD VERIFIED: ${yn(noFail(['등록', '수정', '작성자']))}`)
  console.log(`COLLECTION TRANSACTION VERIFIED: ${yn(noFail(['수거', '일정 상태', '재고', '자재']))}`)
  console.log(`AUDIT LOG VERIFIED: ${yn(noFail(['감사로그']))}`)
  console.log(`MULTI-BROWSER VERIFIED: ${yn(noFail(['세션 A', '세션 B', '세션 C']))}`)
  console.log(`DEMO/LIVE VERIFIED: ${yn(noFail(['시연', 'demo']))}`)
  console.log('─────────────────────────────────')
  return fail
}

try {
  if (mode === '--setup') await setup()
  else if (mode === '--cleanup') await cleanup()
  else process.exit((await verify()) ? 1 : 0)
} catch (e) {
  console.error(`\n오류: ${e.message}`)
  process.exit(2)
}
