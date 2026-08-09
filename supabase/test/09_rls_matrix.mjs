// ─────────────────────────────────────────────────────────────────────────────
// 역할 × 테이블 × 조작 전수 점검 (실제 Supabase)
//
//  0012 로 막은 구멍은 "정책이 고정해야 할 목록에서 하나가 빠진" 종류였습니다.
//  그런 누락은 눈으로 읽어서는 잘 안 보입니다. 그래서 18개 테이블 전부에
//  대해 네 역할(+비로그인)이 읽기·넣기·수정·지우기를 실제로 시도하고,
//  migration 을 읽어 옮긴 "의도" 표와 맞춰 봅니다.
//
//  왜 필요한가 — 실제로 위험했던 지점
//   · 0002 의 정책 상당수가 is_active_user() 를 씁니다. 이 함수가 "로그인한
//     사람"이던 시절 그대로였다면 병원 계정이 일정·재고·자재를 쓸 수 있었습니다.
//     0006 이 직원 3역할로 좁혔지만, 그것을 확인하는 검사가 없었습니다.
//   · 감사로그는 update/delete 정책을 만들지 않는 방식으로 지킵니다.
//     실수로 하나 추가되면 조용히 뚫립니다.
//
//  판정 기준 — 읽기와 쓰기는 판정법이 다릅니다
//   읽기: SELECT 는 RLS 에 걸려도 403 이 아니라 200 + 빈 배열입니다. 그래서
//        상태코드로는 알 수 없습니다. service 권한이 보는 행 수를 기준선으로
//        두고 "기준선은 있는데 이 역할에게는 0건" 일 때만 차단으로 봅니다.
//        기준선이 0이면 판정 불가이므로 '[검증]' 행을 만들어 두고 검사합니다.
//   쓰기: 201/200 → 허용, 401/403 → 차단.
//        400·409 는 검사 쪽 문제(제약 위반 등)이므로 따로 셉니다.
//        제약 위반을 "차단"으로 읽으면 없는 안전을 있다고 착각하게 됩니다.
//
//  안전장치
//   · 넣어 보는 행은 기존 행을 복제하고 '[검증]' 을 붙입니다. 막혀야 하는데
//     들어갔다면 service 권한으로 즉시 지웁니다.
//   · 수정은 "지금 값을 그대로 다시 쓰기"라 값이 바뀌지 않습니다.
//   · 지우기는 이 검사가 직접 만든 임시 행에만 시도합니다.
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=... TEST_CLIENT_PW=...
//    node supabase/test/09_rls_matrix.mjs
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const MARK = '[검증]'

let pass = 0
let fail = 0
const findings = []
const harnessIssues = []
const ok = (cond, msg, detail = '') => {
  cond ? pass++ : fail++
  if (!cond) findings.push(`${msg}${detail ? ' — ' + detail : ''}`)
  return cond
}

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const call = (key, token, path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  }).then(json)

const svc = (path, init) => call(S, S, path, init)
const as = (token, path, init) => call(A, token, path, init)

async function login(email, password) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`로그인 실패 ${email}: ${d.msg ?? d.error_description ?? r.status}`)
  return d.access_token
}

// ── 무엇이 허용되어야 하는가 (migration 을 읽어 옮긴 의도) ───────────────────
//
//  r/i/u/d = 읽기 / 넣기 / 수정 / 지우기
//  1 = 허용 · 0 = 차단 · 'own' = 자기 병원 것만 보여야 함
const T = (r, i, u, d) => ({ r, i, u, d })
const EXPECT = {
  clients:               { admin: T(1,1,1,1), office: T(1,1,1,0), field: T(1,0,0,0), client: T('own',0,0,0) },
  vehicles:              { admin: T(1,1,1,1), office: T(1,1,1,1), field: T(1,0,0,0), client: T(0,0,0,0) },
  schedules:             { admin: T(1,1,1,1), office: T(1,1,1,1), field: T(1,1,1,0), client: T('own',0,0,0) },
  materials:             { admin: T(1,1,1,0), office: T(1,1,1,0), field: T(1,1,0,0), client: T('own',0,0,0) },
  material_transactions: { admin: T(1,1,0,0), office: T(1,1,0,0), field: T(1,1,0,0), client: T(0,0,0,0) },
  office_stock:          { admin: T(1,0,1,0), office: T(1,0,1,0), field: T(1,0,1,0), client: T(0,0,0,0) },
  site_notes:            { admin: T(1,1,1,1), office: T(1,1,1,1), field: T(1,1,1,0), client: T(0,0,0,0) },
  request_overrides:     { admin: T(1,1,1,1), office: T(1,1,1,1), field: T(1,1,1,1), client: T(0,0,0,0) },
  collection_events:     { admin: T(1,1,1,0), office: T(1,1,1,0), field: T(1,1,1,0), client: T(0,0,0,0) },
  payments:              { admin: T(1,1,1,1), office: T(1,1,1,1), field: T(0,0,0,0), client: T(0,0,0,0) },
  sales_leads:           { admin: T(1,1,1,1), office: T(1,1,1,1), field: T(0,0,0,0), client: T('own',0,0,0) },
  sales_lead_events:     { admin: T(1,1,0,0), office: T(1,1,0,0), field: T(0,0,0,0), client: T(0,0,0,0) },
  performance_baselines: { admin: T(1,0,1,0), office: T(1,0,0,0), field: T(1,0,0,0), client: T(0,0,0,0) },
  experiment_settings:   { admin: T(1,0,1,0), office: T(1,0,0,0), field: T(1,0,0,0), client: T(0,0,0,0) },
  audit_logs:            { admin: T(1,1,0,0), office: T(0,1,0,0), field: T(0,1,0,0), client: T(0,0,0,0) },
  client_requests:       { admin: T(1,1,1,1), office: T(1,1,1,0), field: T(1,1,0,0), client: T('own',1,0,0) },
  client_documents:      { admin: T(1,1,1,1), office: T(1,1,1,0), field: T(1,0,0,0), client: T(0,0,0,0) },
  profiles:              { admin: T(1,0,1,0), office: T('own',0,1,0), field: T('own',0,1,0), client: T('own',0,1,0) },
}

/**
 * 단일 행 설정 테이블 — 행을 복제하는 대신 "두 번째 행을 넣을 수 있는가 /
 * 그 행을 지울 수 있는가"를 직접 봅니다. 지워졌으면 즉시 되돌립니다.
 */
const SINGLETON = new Set(['office_stock', 'performance_baselines', 'experiment_settings'])
/**
 * 신원 테이블 — profiles.id 는 auth.users 를 가리킵니다. 여기서 행을 만들거나
 * 지우면 실제 로그인 계정이 망가지므로 시도하지 않습니다. 프로필을 건드리는
 * 경로는 06_cross_client.mjs 가 따로 확인합니다.
 */
const IDENTITY = new Set(['profiles'])

/** 서버가 만드는 값 — 복제할 때 뺍니다 */
const GENERATED = new Set(['id', 'created_at', 'updated_at', 'at'])

/**
 * '자기 것'의 기준은 역할마다 다릅니다.
 *  · profiles  → 본인 행 하나 (모든 역할)
 *  · clients   → 병원 계정의 소속 거래처
 *  · 그 밖     → client_id 가 소속과 같은 행
 */
const ownsRow = (table, row, ctx) => {
  if (table === 'profiles') return row.id === ctx.profileId
  if (table === 'clients') return row.id === ctx.clientId
  return row.client_id === ctx.clientId
}

/** 쓰기 응답을 허용/차단/검사문제 로 분류합니다 */
const classify = (res) => {
  if (res.status >= 200 && res.status < 300) return 'allow'
  if (res.status === 401 || res.status === 403) return 'deny'
  return 'error'
}

// 읽기는 다릅니다. SELECT 가 RLS 에 걸려도 403 이 아니라 200 + 빈 배열이 옵니다.
// 그래서 "행이 0건" 만으로는 차단인지 원래 빈 테이블인지 알 수 없습니다.
// service 권한이 보는 행 수를 기준선으로 두고 비교합니다.

/** 기본키 컬럼 — 대부분 id 지만 request_overrides 는 request_id 입니다 */
const pkOf = (sample) => (sample.id !== undefined ? 'id' : sample.request_id !== undefined ? 'request_id' : Object.keys(sample)[0])

/** 값을 바꾸지 않고 눌러 볼 컬럼 — 표본에 실제로 있는 것만 고릅니다 */
const PREFER = ['memo', 'note', 'text', 'content', 'summary', 'title', 'name', 'by', 'driver', 'screen', 'source', 'status']
function touchOf(sample, pk) {
  for (const k of PREFER) if (typeof sample[k] === 'string') return k
  for (const k of Object.keys(sample)) {
    if (k === pk || GENERATED.has(k) || k.endsWith('_by') || k.endsWith('_id')) continue
    return k   // 값이 null 이어도 그대로 다시 쓰면 되므로 상관없습니다
  }
  return null
}

// CHECK 제약이 걸린 컬럼입니다. 여기에 '[검증]…' 을 넣으면 400 이 나고,
// 그걸 "차단"으로 읽으면 없는 안전을 있다고 착각하게 됩니다.
const CONSTRAINED = new Set(['kind', 'stage', 'status', 'source', 'waste_type', 'origin', 'item', 'type', 'handover_status'])
/** 자유 텍스트라 표시를 남겨도 되는 컬럼 */
const FREE_TEXT = ['memo', 'note', 'content', 'title', 'summary', 'name']

// 자유 텍스트 컬럼이 없는 테이블(예: sales_lead_events)은 제약이 걸린 컬럼을
// "다른 유효한 값"으로 바꿔 보면 수정이 통과했는지 알 수 있습니다.
const ENUM_ALT = {
  stage: ['추천', '제안', '수락', '보류', '미전환'],
  status: ['접수', '확인 중', '일정 반영', '처리 완료'],
  kind: ['수거요청', '연락', '주의', '자재', '기타'],
}

/** 넣어 볼 행 — 기존 행을 복제하고 알아볼 수 있게 표시합니다 */
let ctxClientId = null
function cloneFor(table, sample, pk, tag) {
  const body = {}
  for (const [k, v] of Object.entries(sample)) {
    if (GENERATED.has(k)) continue
    body[k] = v
  }
  for (const key of FREE_TEXT) {
    if (typeof body[key] === 'string' && !CONSTRAINED.has(key)) { body[key] = `${MARK}${tag}`; break }
  }
  // 고유 제약이 있는 값은 겹치지 않게 바꿉니다
  if (pk === 'request_id') body.request_id = `${MARK}${tag}`.slice(0, 60)
  if (table === 'sales_leads') body.key = `${MARK}${tag}`
  // 같은 날 같은 거래처의 '완료' 일정은 하나뿐입니다 — 복제본은 예정으로 둡니다
  if (table === 'client_requests' && tag.endsWith('client')) {
    // 병원이 요청을 넣는 정상 경로 — 자기 병원 · portal · 접수
    body.client_id = ctxClientId
    body.source = 'portal'
    body.status = '접수'
  }
  if (table === 'schedules') {
    body.status = '예정'
    body.is_additional = true
    body.event_id = null
    body.completed_at = null
    body.actual_amount = null
  }
  return body
}

async function main() {
  console.log('\n════ 역할 × 테이블 × 조작 전수 점검 ════\n')

  const tok = {
    admin: await login(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW),
    office: await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW),
    field: await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW),
    client: await login(`client@${DOMAIN}`, process.env.TEST_CLIENT_PW),
  }
  const me = (await svc(`/profiles?email=eq.${encodeURIComponent(`client@${DOMAIN}`)}&select=id,client_id`)).body?.[0]
  const myClientId = me?.client_id
  ctxClientId = myClientId
  const myProfileId = me?.id
  const profileIdOf = {}
  for (const role of ['admin', 'office', 'field', 'client']) {
    profileIdOf[role] = (await svc(`/profiles?email=eq.${encodeURIComponent(`${role}@${DOMAIN}`)}&select=id`)).body?.[0]?.id
  }

  const tables = Object.keys(EXPECT)
  const roles = ['admin', 'office', 'field', 'client']

  // ── 안전망 ────────────────────────────────────────────────────────────────
  //
  //  이 검사는 실제 운영 DB 를 찌릅니다. 만드는 과정에서 계정 이름 다섯 개를
  //  덮어써 놓고도 한참 모르고 있었습니다. 검사가 데이터를 바꿔 놓고 통과하는
  //  일이 다시 생기지 않도록, 시작 시점의 계정 상태를 찍어 두고 끝에 대조합니다.
  const beforeAccounts = (await svc('/profiles?select=id,email,name,role,active,client_id,font_scale&order=email')).body ?? []
  const snap = (rows) => JSON.stringify(rows.map((r) => [r.email, r.name, r.role, r.active, r.client_id, r.font_scale]))
  const accountsBefore = snap(beforeAccounts)

  // ── 0. 비로그인 ────────────────────────────────────────────────────────────
  console.log('── 0. 비로그인(anon)')
  const anonOpen = []
  for (const t of tables) {
    const r = await call(A, null, `/${t}?select=*&limit=1`)
    if (classify(r) === 'allow') anonOpen.push(t)
  }
  ok(anonOpen.length === 0, '비로그인은 어떤 테이블도 열 수 없음', anonOpen.join(', '))
  console.log(`  ${anonOpen.length === 0 ? 'PASS' : 'FAIL'}  비로그인 전 테이블 차단 (${tables.length - anonOpen.length}/${tables.length})\n`)

  // ── 1. 빈 테이블에는 검사용 표본을 하나 만들어 둡니다 ──────────────────────
  const seeded = []
  const SEED = {
    site_notes: async () => {
      const c = (await svc('/clients?select=id&limit=1')).body[0]
      return { client_id: c.id, kind: '기타', content: `${MARK}RLS점검용 메모` }
    },
    payments: async () => {
      const c = (await svc('/clients?select=id&limit=1')).body[0]
      const m = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
      return { client_id: c.id, billing_month: m, amount: 1000, status: '미수금', memo: `${MARK}RLS점검용` }
    },
    sales_leads: async () => {
      // 병원 계정의 소속 거래처로, '공유됨' 상태로 만듭니다.
      // 그래야 "자기 것은 보이고 남의 것은 안 보인다"를 양쪽으로 확인할 수 있습니다.
      const c = (await svc(`/clients?select=id,name&id=eq.${ctxClientId}`)).body?.[0]
        ?? (await svc('/clients?select=id,name&limit=1')).body[0]
      const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
      return {
        key: `${MARK}RLS점검용`, client_id: c.id, client_name: c.name,
        kind: '자재', title: `${MARK}RLS점검용 제안`, month, est_value: 0,
        stage: '제안', shared_with_client: true,
      }
    },
    request_overrides: async () => ({
      request_id: `${MARK}RLS점검용`, status: '접수', by: '검증',
    }),
    client_documents: async () => {
      const c = (await svc('/clients?select=id&limit=1')).body[0]
      return { client_id: c.id, kind: '기타', title: `${MARK}RLS점검용`, note: `${MARK}RLS점검용` }
    },
  }
  for (const [t, make] of Object.entries(SEED)) {
    const n = (await svc(`/${t}?select=*&limit=1`)).body ?? []
    if (n.length) continue
    const r = await svc(`/${t}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(await make()) })
    if (r.body?.[0]) {
      const k = r.body[0].id !== undefined ? 'id' : 'request_id'
      seeded.push([t, k, r.body[0][k]])
      console.log(`  (표본 생성) ${t}`)
    }
    else harnessIssues.push(`${t} 표본 생성 실패 (${r.status}) ${JSON.stringify(r.body).slice(0, 140)}`)
  }
  // sales_lead_events 는 sales_leads 가 있어야 만들 수 있습니다
  if ((await svc('/sales_lead_events?select=id&limit=1')).body?.length === 0) {
    const lead = (await svc('/sales_leads?select=id&limit=1')).body?.[0]
    if (lead) {
      const r = await svc('/sales_lead_events', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ lead_id: lead.id, stage: '추천' }),
      })
      if (r.body?.[0]) { seeded.push(['sales_lead_events', 'id', r.body[0].id]); console.log('  (표본 생성) sales_lead_events') }
      else harnessIssues.push(`sales_lead_events 표본 생성 실패 (${r.status}) ${JSON.stringify(r.body).slice(0, 140)}`)
    }
  }
  if (seeded.length) console.log()

  // ── 2. 매트릭스 ────────────────────────────────────────────────────────────
  const rows = []
  for (const t of tables) {
    const sample = (await svc(`/${t}?select=*&limit=1`)).body?.[0]
    if (!sample) { harnessIssues.push(`${t}: 표본이 없어 넣기·수정·지우기를 확인하지 못했습니다`) }
    const pk = sample ? pkOf(sample) : 'id'
    const touch = sample ? touchOf(sample, pk) : null
    if (sample && !touch) harnessIssues.push(`${t}: 눌러 볼 컬럼을 찾지 못했습니다`)

    // service 권한이 보는 행 수 — 읽기 판정의 기준선입니다
    const baseline = ((await svc(`/${t}?select=*&limit=200`)).body ?? []).length
    if (baseline === 0) harnessIssues.push(`${t}: 행이 없어 읽기 차단 여부를 판정하지 못했습니다`)

    const line = { table: t, cells: {} }
    for (const role of roles) {
      const exp = EXPECT[t][role]
      const got = { r: '—', i: '—', u: '—', d: '—' }

      // ── 읽기 ── service 가 보는 행 수를 기준선으로 두고 비교합니다
      const rd = await as(tok[role], `/${t}?select=*&limit=200`)
      const rc = classify(rd)
      if (rc === 'error') harnessIssues.push(`${t}·${role} 읽기 응답 ${rd.status}`)
      const seen = Array.isArray(rd.body) ? rd.body : []
      if (rc === 'deny') got.r = 0
      else if (rc === 'error') got.r = '?'
      else if (baseline === 0) got.r = '?'          // 기준선이 없으면 판정 불가
      else if (seen.length === 0) got.r = 0          // 기준선은 있는데 안 보임 = 차단
      else {
        const ctx = { profileId: profileIdOf[role], clientId: role === 'client' ? myClientId : null }
        const mineOnly = seen.every((x) => ownsRow(t, x, ctx))
        // 'own' 을 기대하는 칸은 "남의 것이 섞이지 않았는가"로 판정합니다
        got.r = exp.r === 'own' ? (mineOnly ? 'own' : 'ALL') : 1
      }

      // ── 넣기 ──
      //  return=representation 을 쓰면 안 됩니다. RETURNING 은 SELECT 권한을
      //  요구해서, 넣기는 되는데 읽기가 막힌 테이블(감사로그)이 403 으로 보입니다.
      //  앱도 RETURNING 없이 넣습니다. 그래서 응답이 아니라 DB 를 보고 판정합니다.
      if (sample && !SINGLETON.has(t) && !IDENTITY.has(t)) {
        const keysBefore = new Set(((await svc(`/${t}?select=${pk}&limit=1000`)).body ?? []).map((x) => x[pk]))
        const ins = await as(tok[role], `/${t}`, {
          method: 'POST',
          body: JSON.stringify(cloneFor(t, sample, pk, `RLS-${role}`)),
        })
        const rowsAfter = (await svc(`/${t}?select=${pk}&limit=1000`)).body ?? []
        const added = rowsAfter.filter((x) => !keysBefore.has(x[pk]))
        if (added.length) got.i = 1
        else if (classify(ins) === 'deny') got.i = 0
        else if (classify(ins) === 'error') {
          got.i = '?'
          harnessIssues.push(`${t}·${role} 넣기 응답 ${ins.status} ${JSON.stringify(ins.body).slice(0, 120)}`)
        } else got.i = 0
        for (const a of added) await svc(`/${t}?${pk}=eq.${encodeURIComponent(a[pk])}`, { method: 'DELETE' })
      }

      // ── 수정 ──
      //
      //  USING 에 걸린 수정은 403 이 아니라 "0건 수정"으로 조용히 끝나고,
      //  PostgREST 는 그때도 204 를 줍니다. 응답만 보면 정책이 아예 없는
      //  테이블도 "허용"으로 읽힙니다. 그래서 값이 실제로 바뀌었는지 봅니다.
      //
      //   · 일반 테이블  임시 행을 만들어 거기에만 시도합니다 (실데이터 무손상)
      //   · 단일행 설정  updated_by 를 null 로 비워 두고, 0009 트리거가 실행자를
      //                  찍는지로 판정합니다 (값은 그대로 다시 쓰므로 안 바뀝니다)
      //   · profiles     본인 행의 이름을 바꿔 보고 원래대로 되돌립니다
      if (sample && touch) {
        const probeVal = `${MARK}수정확인-${role}`
        if (t === 'profiles') {
          const target = profileIdOf[role]
          const orig = (await svc(`/profiles?select=name&id=eq.${target}`)).body?.[0]?.name
          await as(tok[role], `/profiles?id=eq.${target}`, {
            method: 'PATCH', body: JSON.stringify({ name: probeVal }),
          })
          const now = (await svc(`/profiles?select=name&id=eq.${target}`)).body?.[0]?.name
          got.u = now === probeVal ? 1 : 0
          if (now !== orig) await svc(`/profiles?id=eq.${target}`, { method: 'PATCH', body: JSON.stringify({ name: orig }) })
        } else if (SINGLETON.has(t)) {
          const orig = (await svc(`/${t}?select=updated_by&${pk}=eq.${sample[pk]}`)).body?.[0]?.updated_by
          await svc(`/${t}?${pk}=eq.${sample[pk]}`, { method: 'PATCH', body: JSON.stringify({ updated_by: null }) })
          await as(tok[role], `/${t}?${pk}=eq.${sample[pk]}`, {
            method: 'PATCH', body: JSON.stringify({ [touch]: sample[touch] }),
          })
          const now = (await svc(`/${t}?select=updated_by&${pk}=eq.${sample[pk]}`)).body?.[0]?.updated_by
          got.u = now === profileIdOf[role] ? 1 : 0
          await svc(`/${t}?${pk}=eq.${sample[pk]}`, { method: 'PATCH', body: JSON.stringify({ updated_by: orig ?? null }) })
        } else {
          const tmp = (await svc(`/${t}`, {
            method: 'POST', headers: { Prefer: 'return=representation' },
            body: JSON.stringify(cloneFor(t, sample, pk, `RLSUPD-${role}`)),
          })).body?.[0]
          if (!tmp) {
            got.u = '?'
            harnessIssues.push(`${t}: 수정 검사용 임시 행을 만들지 못했습니다`)
          } else {
            const free = typeof tmp[touch] === 'string' && !CONSTRAINED.has(touch)
            const alt = ENUM_ALT[touch]?.find((v) => v !== tmp[touch])
            const want = free ? probeVal : alt
            const patch = want !== undefined ? { [touch]: want } : { [touch]: sample[touch] }
            await as(tok[role], `/${t}?${pk}=eq.${encodeURIComponent(tmp[pk])}`, {
              method: 'PATCH', body: JSON.stringify(patch),
            })
            const after = (await svc(`/${t}?select=*&${pk}=eq.${encodeURIComponent(tmp[pk])}`)).body?.[0]
            if (want !== undefined) got.u = after?.[touch] === want ? 1 : 0
            else if (after?.updated_by !== undefined) got.u = after.updated_by === profileIdOf[role] ? 1 : 0
            else {
              got.u = '?'
              harnessIssues.push(`${t}: 수정 여부를 확인할 수 있는 컬럼이 없습니다 (touch=${touch})`)
            }
            await svc(`/${t}?${pk}=eq.${encodeURIComponent(tmp[pk])}`, { method: 'DELETE' })
          }
        }
      }

      // ── 단일행 설정: 두 번째 행을 넣거나 그 행을 지울 수 있는가 ──────────
      //
      //  재고(office_stock)가 지워지면 자재 관리가 통째로 멎습니다. 정책이
      //  없어서 막히는 구조라 실수로 하나 추가되면 조용히 뚫립니다.
      //  안전을 위해 지우기 전에 행을 통째로 복사해 두고, 사라졌으면 되돌립니다.
      if (sample && SINGLETON.has(t)) {
        const dup = { ...sample }
        delete dup[pk]
        const ins = await as(tok[role], `/${t}`, { method: 'POST', body: JSON.stringify(dup) })
        const cnt = ((await svc(`/${t}?select=${pk}`)).body ?? []).length
        got.i = cnt > 1 ? 1 : classify(ins) === 'deny' ? 0 : 0
        if (cnt > 1) {
          for (const r of (await svc(`/${t}?select=${pk}&${pk}=neq.${sample[pk]}`)).body ?? []) {
            await svc(`/${t}?${pk}=eq.${r[pk]}`, { method: 'DELETE' })
          }
        }

        const snapshot = (await svc(`/${t}?select=*&${pk}=eq.${sample[pk]}`)).body?.[0]
        await as(tok[role], `/${t}?${pk}=eq.${sample[pk]}`, { method: 'DELETE' })
        const left = ((await svc(`/${t}?select=${pk}&${pk}=eq.${sample[pk]}`)).body ?? []).length
        got.d = left === 0 ? 1 : 0
        if (left === 0 && snapshot) {
          // 지워졌다면 즉시 원래 행을 되돌립니다 (설정·재고가 사라지면 안 됩니다)
          await svc(`/${t}`, { method: 'POST', body: JSON.stringify(snapshot) })
          harnessIssues.push(`${t}·${role} 이 단일행을 지웠습니다 — 복구했지만 정책을 확인해야 합니다`)
        }
      }

      // ── 지우기 ── 이 검사가 만든 임시 행에만 시도하고, 실제로 사라졌는지 봅니다
      if (sample && !SINGLETON.has(t) && !IDENTITY.has(t)) {
        const tmp = (await svc(`/${t}`, {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify(cloneFor(t, sample, pk, `RLSDEL-${role}`)),
        })).body?.[0]
        if (tmp) {
          await as(tok[role], `/${t}?${pk}=eq.${encodeURIComponent(tmp[pk])}`, { method: 'DELETE' })
          const left = ((await svc(`/${t}?select=${pk}&${pk}=eq.${encodeURIComponent(tmp[pk])}`)).body ?? []).length
          got.d = left === 0 ? 1 : 0
          if (left) await svc(`/${t}?${pk}=eq.${encodeURIComponent(tmp[pk])}`, { method: 'DELETE' })
        } else {
          harnessIssues.push(`${t}: 지우기 검사용 임시 행을 만들지 못했습니다`)
        }
      }

      line.cells[role] = { exp, got }
      for (const op of ['r', 'i', 'u', 'd']) {
        const e = exp[op]
        const g = got[op]
        if (g === '—' || g === '?') continue // 확인하지 못한 칸은 별도로 셉니다
        const good = e === 'own' ? g === 'own' : (e ? g === 1 : g === 0)
        ok(good, `${t} · ${role} · ${op}`, `기대 ${e} · 실제 ${g}`)
      }
    }
    rows.push(line)
  }

  // 만들어 둔 표본 정리
  for (const [t, key, val] of seeded.reverse()) {
    await svc(`/${t}?${key}=eq.${encodeURIComponent(val)}`, { method: 'DELETE' })
  }

  // ── 3. 표 ──────────────────────────────────────────────────────────────────
  const sym = (e, g) => {
    if (g === '—' || g === '?') return '?'
    const good = e === 'own' ? g === 'own' : (e ? g === 1 : g === 0)
    if (!good) return '✗'
    return g === 'own' ? 'o' : g ? '●' : '·'
  }
  console.log('\n── 매트릭스  (● 허용 · o 자기것만 · · 차단 · ✗ 의도와 다름 · ? 미확인)')
  console.log(`  ${''.padEnd(23)}${roles.map((r) => r.padEnd(10)).join('')}`)
  console.log(`  ${'테이블'.padEnd(21)}${roles.map(() => 'r i u d   ').join('')}`)
  for (const line of rows) {
    const cells = roles.map((role) => {
      const { exp, got } = line.cells[role]
      return ['r', 'i', 'u', 'd'].map((op) => sym(exp[op], got[op])).join(' ') + '   '
    })
    console.log(`  ${line.table.padEnd(23)}${cells.join('')}`)
  }

  // ── 4. 감사로그 불변 ───────────────────────────────────────────────────────
  console.log('\n── 감사로그 불변 (아무도 고치거나 지울 수 없어야 합니다)')
  const one = (await svc('/audit_logs?select=id,summary&order=id.desc&limit=1')).body?.[0]
  if (one) {
    for (const role of roles) {
      const u = await as(tok[role], `/audit_logs?id=eq.${one.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ summary: one.summary }),
      })
      const d = await as(tok[role], `/audit_logs?id=eq.${one.id}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' },
      })
      const immutable = !(Array.isArray(u.body) && u.body.length) && !(Array.isArray(d.body) && d.body.length)
      ok(immutable, `${role} → 감사로그 수정·삭제 차단`)
      console.log(`  ${immutable ? 'PASS' : 'FAIL'}  ${role} → 감사로그 수정·삭제 차단`)
    }
    const still = (await svc(`/audit_logs?select=id&id=eq.${one.id}`)).body?.length
    ok(still === 1, '감사로그 행이 그대로 남아 있음')
  }

  // ── 안전망 대조 — 검사가 계정을 바꿔 놓지 않았는가 ─────────────────────────
  console.log('\n── 검사가 남긴 흔적')
  const afterAccounts = (await svc('/profiles?select=id,email,name,role,active,client_id,font_scale&order=email')).body ?? []
  const same = snap(afterAccounts) === accountsBefore
  ok(same, '검사가 계정 정보를 바꾸지 않음')
  console.log(`  ${same ? 'PASS' : 'FAIL'}  검사가 계정 정보를 바꾸지 않음`)
  if (!same) {
    // 바뀌었으면 즉시 되돌립니다 — 검사가 운영 데이터를 망가뜨린 채 끝나면 안 됩니다
    for (const b of beforeAccounts) {
      await svc(`/profiles?id=eq.${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: b.name, role: b.role, active: b.active, client_id: b.client_id, font_scale: b.font_scale }),
      })
    }
    console.log('  (복구) 시작 시점 값으로 되돌렸습니다')
    for (const b of beforeAccounts) {
      const a = afterAccounts.find((x) => x.id === b.id)
      if (a && JSON.stringify(a) !== JSON.stringify(b)) console.log(`    · ${b.email}: ${JSON.stringify(b)} ← ${JSON.stringify(a)}`)
    }
  }

  // ── 5. 결과 ────────────────────────────────────────────────────────────────
  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  if (findings.length) {
    console.log('\n의도와 다른 칸:')
    for (const f of findings) console.log(`  · ${f}`)
  }
  if (harnessIssues.length) {
    console.log('\n확인하지 못한 칸 (검사 쪽 문제 — 조용히 넘기지 않습니다):')
    for (const h of harnessIssues) console.log(`  · ${h}`)
  }
  console.log(`\n역할별 권한이 의도대로: ${fail === 0 && harnessIssues.length === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 && harnessIssues.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
