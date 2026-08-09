// ─────────────────────────────────────────────────────────────────────────────
// 병원 계정 교차 접근 검증 (실제 Supabase)
//
//  05_live.mjs 는 "병원 계정이 내부 화면 데이터를 못 본다"까지 확인합니다.
//  그때 병원이 하나뿐이라 「다른 병원 것도 못 보는가」는 건너뛰었습니다.
//  거래처를 넘겨다보는 사고는 대부분 그 지점에서 납니다. 그래서 병원을 하나 더
//  만들고 두 계정으로 실제로 서로를 찔러 봅니다.
//
//  이 스크립트가 실제로 찾아낸 것
//   · 병원 계정이 자기 profiles.client_id 를 다른 병원 것으로 바꿀 수 있었습니다.
//     바꾸고 나면 RLS 가 "이 사람의 소속"을 기준으로 판단하므로 그 순간부터
//     남의 병원 데이터가 전부 열립니다. → 0012 로 막았습니다.
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_CLIENT_PW=... TEST_CLIENT2_PW=...
//    node supabase/test/06_cross_client.mjs
//
//  · service 키는 "DB 에 실제로 뭐가 남았는지" 확인하는 용도로만 씁니다.
//    차단 여부는 항상 사용자 토큰으로 판단합니다.
//  · 만드는 데이터에는 전부 '[검증]' 접두사가 붙습니다.
//  · 소속 바꿔치기를 시도한 뒤에는 원래 소속으로 반드시 되돌립니다.
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
const EMAIL1 = `client@${DOMAIN}`
const EMAIL2 = `client2@${DOMAIN}`

let pass = 0
let fail = 0
const ok = (cond, msg, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${detail ? ' — ' + detail : ''}`)
}

const json = async (r) => ({ status: r.status, body: await r.json().catch(() => null) })

/** service 권한 — "DB 에 실제로 뭐가 있는가"를 확인할 때만 */
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(json)

/** 로그인한 사용자 권한 — 차단 여부는 항상 이쪽으로 판단합니다 */
const usr = (token, path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(json)

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

async function main() {
  console.log('── 병원 교차 접근 차단 ──────────────────────────────────────')

  // ── 두 번째 검증용 병원 ────────────────────────────────────────────────
  const name2 = `${MARK}두번째검증병원`
  let c2 = (await svc(`/clients?name=eq.${encodeURIComponent(name2)}&select=id`)).body?.[0]
  if (!c2) {
    const r = await svc('/clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: name2, type: '요양병원', address: '서울 검증구', manager: '검증',
        phone: '000-0000-0000', collection_cycle: '주 1회',
        collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
      }),
    })
    c2 = r.body?.[0]
    ok(!!c2, '두 번째 검증 병원 생성', `(${r.status})`)
  } else {
    ok(true, '두 번째 검증 병원 이미 있음')
  }

  // ── 두 번째 병원 계정 ──────────────────────────────────────────────────
  const pw2 = process.env.TEST_CLIENT2_PW
  if (!pw2) { console.error('TEST_CLIENT2_PW 가 필요합니다.'); process.exit(1) }
  await fetch(`${U}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL2, password: pw2, email_confirm: true,
      user_metadata: { name: '검증병원2', role: 'client', client_id: c2.id },
    }),
  })
  await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL2)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'client', client_id: c2.id, active: true }),
  })
  ok(true, '두 번째 병원 계정 준비')

  // ── 병원A 로 로그인해 병원B 를 찔러 봅니다 ────────────────────────────
  const t1 = await login(EMAIL1, process.env.TEST_CLIENT_PW)
  const own = (await usr(t1, '/clients?select=id,name')).body
  ok(own.length === 1 && own[0].id !== c2.id, '병원A 는 자기 병원만 조회', `${own.length}곳`)

  const peek = await usr(t1, `/clients?id=eq.${c2.id}&select=id,name`)
  ok(Array.isArray(peek.body) && peek.body.length === 0,
    '병원A → 병원B 거래처 조회 차단', `${peek.body?.length ?? '?'}건`)

  // 병원B 의 요청을 하나 만들고, 병원A 가 보거나 고칠 수 있는지
  const req2 = await svc('/client_requests', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      client_id: c2.id, kind: '추가수거', content: `${MARK}교차접근 확인용`,
      urgent: false, status: '접수', requester_name: '검증',
    }),
  })
  const rid2 = req2.body?.[0]?.id
  ok(!!rid2, '병원B 요청 생성')

  const seen = await usr(t1, `/client_requests?id=eq.${rid2}&select=id`)
  ok(Array.isArray(seen.body) && seen.body.length === 0,
    '병원A → 병원B 요청 조회 차단', `${seen.body?.length ?? '?'}건`)

  const tamper = await usr(t1, `/client_requests?id=eq.${rid2}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: '처리 완료' }),
  })
  ok(!(Array.isArray(tamper.body) && tamper.body.length),
    '병원A → 병원B 요청 수정 차단', `(${tamper.status})`)

  const sch2 = await svc(`/schedules?client_id=eq.${c2.id}&select=id&limit=1`)
  if (sch2.body?.length) {
    const s = await usr(t1, `/schedules?id=eq.${sch2.body[0].id}&select=id`)
    ok(Array.isArray(s.body) && s.body.length === 0, '병원A → 병원B 일정 조회 차단')
  }

  // ── 핵심: 소속 자체를 바꿔치기할 수 있는가 ────────────────────────────
  //
  //  역할(role)이 아니라 소속(client_id)을 바꾸는 경로입니다. 성공하면 그 뒤의
  //  모든 RLS 판단이 남의 병원 기준으로 돌아갑니다. 0012 가 이것을 막습니다.
  const before = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=client_id`)).body?.[0]
  const hijack = await usr(t1, `/profiles?email=eq.${encodeURIComponent(EMAIL1)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ client_id: c2.id }),
  })
  const now = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=client_id`)).body?.[0]
  const blocked = now?.client_id !== c2.id
  ok(blocked, '병원A → 소속 병원 바꿔치기 차단', `(${hijack.status})`)

  // 뚫렸다면 확인만 하고 여기서 바로 되돌립니다.
  // (뒤따르는 검사들이 "소속이 바뀐 상태"에서 돌면 결과를 믿을 수 없습니다)
  if (!blocked) {
    await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}`, {
      method: 'PATCH',
      body: JSON.stringify({ client_id: before.client_id }),
    })
    const restored = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=client_id`)).body?.[0]
    ok(restored?.client_id === before.client_id, '(복구) 원래 소속으로 되돌림')
  }

  // ── 소속 말고 다른 길로도 올라갈 수 있는가 ────────────────────────────
  //
  //  소속 바꿔치기를 막아도, 같은 목적지로 가는 다른 문이 열려 있으면 의미가
  //  없습니다. 실제로 열어 볼 수 있는 문을 하나씩 밀어 봅니다.

  // (1) 가입할 때 쓰는 user_metadata.role 을 나중에 바꿔 역할을 올릴 수 있는가
  //     handle_new_user() 는 insert 시점에만 metadata 를 읽고, 그 뒤의 판단은
  //     전부 profiles 를 봅니다. 그래도 실제로 바꿔 보고 확인합니다.
  const meBefore = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=role,client_id`)).body?.[0]
  const metaTry = await fetch(`${U}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: A, Authorization: `Bearer ${t1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { role: 'admin' } }),
  }).then(json)
  const meAfter = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=role`)).body?.[0]
  ok(meAfter?.role === 'client',
    'user_metadata 를 고쳐도 역할이 올라가지 않음', `metadata ${metaTry.status} · role ${meAfter?.role}`)
  // 손댄 metadata 는 되돌립니다.
  await fetch(`${U}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: A, Authorization: `Bearer ${t1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { role: 'client', client_id: meBefore?.client_id } }),
  })

  // (2) 역할 자체를 profiles 에서 올릴 수 있는가 (0002 가 이미 막고 있어야 합니다)
  await usr(t1, `/profiles?email=eq.${encodeURIComponent(EMAIL1)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'admin' }),
  })
  const roleNow = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=role`)).body?.[0]
  ok(roleNow?.role === 'client', '병원 계정 → 자기 역할 상승 차단', `role ${roleNow?.role}`)

  // (3) 남의 병원 이름으로 요청을 넣을 수 있는가
  const forge = await usr(t1, '/client_requests', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      client_id: c2.id, kind: '추가수거', content: `${MARK}남의 병원으로 등록 시도`,
      urgent: false, status: '접수', source: 'portal', requester_name: '검증',
    }),
  })
  ok(!(Array.isArray(forge.body) && forge.body.length),
    '병원A → 병원B 이름으로 요청 등록 차단', `(${forge.status})`)

  // (4) 자기가 넣은 요청의 처리 상태를 스스로 바꿀 수 있는가 (update 정책 없음)
  const mine = (await usr(t1, '/client_requests?select=id&limit=1')).body?.[0]
  if (mine) {
    const selfEdit = await usr(t1, `/client_requests?id=eq.${mine.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: '처리 완료' }),
    })
    ok(!(Array.isArray(selfEdit.body) && selfEdit.body.length),
      '병원 계정 → 자기 요청의 처리 상태 변경 차단', `(${selfEdit.status})`)
  }

  // (5) 아직 공유하지 않은 내부 제안이 병원에 보이는가
  const secret = (await svc('/sales_leads?select=id&shared_with_client=is.false&limit=1')).body?.[0]
  if (secret) {
    const peekLead = await usr(t1, `/sales_leads?id=eq.${secret.id}&select=id`)
    ok(Array.isArray(peekLead.body) && peekLead.body.length === 0,
      '공유 전 내부 제안은 병원에 보이지 않음', `${peekLead.body?.length ?? '?'}건`)
  }

  // (6) 막는 것만큼 중요한 것 — 본인이 원래 할 수 있어야 하는 일은 되는가
  //
  //  0012 는 신원 값을 고정합니다. 그 김에 이름·글자크기까지 막아 버리면
  //  보안 수정이 기능을 깨는 셈입니다. 앱이 실제로 쓰는 경로(name, font_scale)를
  //  그대로 눌러 보고, 끝나면 원래 값으로 되돌립니다.
  const meNow = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=name,font_scale`)).body?.[0]
  const edit = await usr(t1, `/profiles?email=eq.${encodeURIComponent(EMAIL1)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: `${meNow?.name ?? '검증'} `.trim() + '·수정확인', font_scale: 'lg' }),
  })
  const edited = (await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}&select=name,font_scale`)).body?.[0]
  ok(edited?.name?.endsWith('·수정확인') && edited?.font_scale === 'lg',
    '본인 이름·글자크기는 그대로 수정 가능', `(${edit.status}) ${edited?.name} · ${edited?.font_scale}`)
  await svc(`/profiles?email=eq.${encodeURIComponent(EMAIL1)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: meNow?.name, font_scale: meNow?.font_scale }),
  })

  // 검증이 만든 흔적 정리 — 남의 병원으로 넣으려다 만들어진 요청이 있으면 지웁니다.
  const junk = (await svc(`/client_requests?select=id&content=like.*${encodeURIComponent('남의 병원으로 등록 시도')}*`)).body ?? []
  for (const r of junk) await svc(`/client_requests?id=eq.${r.id}`, { method: 'DELETE' })
  if (junk.length) console.log(`(정리) 검증용 요청 ${junk.length}건 삭제`)

  if (!blocked) {
    console.log('\n  → supabase/bundles/RUN_4_security_fix.sql 을 SQL Editor 에서 실행하면 막힙니다.\n')
  }

  console.log(`\n합계  PASS ${pass} · FAIL ${fail}`)
  console.log(`병원 간 데이터 격리: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
