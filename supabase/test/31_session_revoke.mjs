// ─────────────────────────────────────────────────────────────────────────────
// 계정을 중지·역할 변경했을 때 이미 열려 있는 세션 (실제 DB · API)
//
//  퇴사자나 사고가 났을 때 관리자가 계정을 중지합니다. 그런데 그 사람의
//  폰은 이미 로그인된 채로 열려 있습니다. 브라우저를 닫지 않는 한 토큰은
//  살아 있으므로, "화면에서 로그아웃시킨다"는 것만으로는 부족합니다.
//  중지한 그 순간부터 데이터에 손을 못 대야 합니다.
//
//  역할 변경도 같습니다. 현장 담당자를 사무실로 올리거나 내렸을 때,
//  그 사람이 로그아웃했다 다시 들어오기 전에도 권한이 바뀌어야 합니다.
//
//  이 검사는 브라우저를 띄우지 않습니다(수 초면 끝납니다).
//  화면이 아니라 서버가 막는지를 보는 것이 목적이기 때문입니다.
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_FIELD_PW=...
//    node supabase/test/31_session_revoke.mjs
//
//  · 계정 상태는 시작 시점 값으로 반드시 되돌립니다(실패해도 finally 에서).
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const MARK = '[검증]중지된계정쓰기'

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
const as = (token, path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(json)
const login = async (email, password) =>
  (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)).body

async function main() {
  console.log('\n════ 계정 중지·역할 변경과 열려 있는 세션 ════')

  const prof = (await svc(`/profiles?select=id,active,role&email=eq.${encodeURIComponent(`field@${DOMAIN}`)}`)).body?.[0]
  if (!prof) { console.error('현장 계정을 찾을 수 없습니다.'); process.exit(1) }
  const client = (await svc('/clients?select=id&active=eq.true&limit=1')).body?.[0]
  const wasActive = prof.active
  const wasRole = prof.role
  //  역할별 차이를 판정하려면 미수금이 최소 한 건 있어야 합니다.
  //  없으면 '판정 불가' 로 조용히 지나가므로, 이 검사가 직접 만들어 둡니다.
  let seededPaymentId = null

  try {
    // ── 1. 중지 전에는 정상 동작 ────────────────────────────────────────
    section('1. 중지 전')
    const t = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    check(!!t?.access_token, '현장 계정으로 로그인됨')
    const token = t.access_token

    const before = await as(token, '/schedules?select=id&limit=1')
    check(before.status === 200 && Array.isArray(before.body) && before.body.length > 0,
      '수거일정을 읽을 수 있음', `${before.status} · ${before.body?.length ?? 0}건`)

    // ── 2. 관리자가 계정을 중지 ─────────────────────────────────────────
    section('2. 관리자가 계정을 중지한 직후 (그 사람 브라우저는 열려 있음)')
    await svc(`/profiles?id=eq.${prof.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })

    //  RLS 로 막히면 오류가 아니라 '0건' 으로 옵니다. 건수로 판정합니다.
    const read = await as(token, '/schedules?select=id&limit=1')
    check(read.status === 200 && Array.isArray(read.body) && read.body.length === 0,
      '가지고 있던 토큰으로도 더 이상 데이터가 보이지 않음',
      `${read.status} · ${Array.isArray(read.body) ? read.body.length + '건' : '-'}`)

    const write = await as(token, '/site_notes', {
      method: 'POST',
      body: JSON.stringify({ client_id: client.id, kind: '기타', content: MARK }),
    })
    check(write.status === 403 || write.status === 401, '쓰기가 막힘', `(${write.status})`)

    const rpc = await fetch(`${U}/rest/v1/rpc/complete_collection`, {
      method: 'POST',
      headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: {} }),
    }).then(json)
    check(rpc.status >= 400 && /로그인이 필요/.test(JSON.stringify(rpc.body)),
      '수거 완료 함수도 거부함', `(${rpc.status})`)

    //  참고 — 토큰 갱신 자체는 Supabase Auth 가 막지 않습니다.
    //  계정 중지는 이 앱의 값(profiles.active)이라 로그인 서버는 모릅니다.
    //  다만 위처럼 데이터 접근이 전부 막히므로 갱신된 토큰도 쓸모가 없습니다.
    const refreshed = await fetch(`${U}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh_token }),
    }).then(json)
    const newToken = refreshed.body?.access_token
    if (newToken) {
      const afterRefresh = await as(newToken, '/schedules?select=id&limit=1')
      check(Array.isArray(afterRefresh.body) && afterRefresh.body.length === 0,
        '토큰을 새로 받아도 데이터는 여전히 안 보임',
        `${afterRefresh.status} · ${afterRefresh.body?.length ?? 0}건`)
    }
    console.log(`  참고  토큰 갱신 자체는 ${refreshed.status} 로 되지만, 위처럼 데이터가 막힙니다`)

    // ── 3. 다시 사용으로 돌리면 즉시 복구 ───────────────────────────────
    section('3. 다시 사용으로 돌렸을 때')
    await svc(`/profiles?id=eq.${prof.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
    const back = await as(token, '/schedules?select=id&limit=1')
    check(Array.isArray(back.body) && back.body.length > 0,
      '같은 토큰으로 다시 정상 동작 (재로그인 없이)', `${back.body?.length ?? 0}건`)

    // ── 4. 역할을 내렸을 때도 즉시 반영되는가 ───────────────────────────
    section('4. 역할 변경이 열려 있는 세션에 즉시 반영되는가')
    if (((await svc('/payments?select=id&limit=1')).body ?? []).length === 0) {
      const made = (await svc('/payments', {
        method: 'POST',
        body: JSON.stringify({
          client_id: client.id,
          billing_month: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7),
          amount: 10000, status: '미수금', method: '무통장', memo: '[검증]역할판정용',
        }),
      })).body?.[0]
      if (made) seededPaymentId = made.id
    }
    //  현장은 미수금(payments)을 볼 수 없고, 사무실은 볼 수 있습니다.
    const asField = await as(token, '/payments?select=id&limit=1')
    const fieldSees = Array.isArray(asField.body) ? asField.body.length : -1

    await svc(`/profiles?id=eq.${prof.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'office' }) })
    const asOffice = await as(token, '/payments?select=id&limit=1')
    const officeSees = Array.isArray(asOffice.body) ? asOffice.body.length : -1

    check(fieldSees === 0, '현장 역할일 때는 미수금이 보이지 않음', `${fieldSees}건`)
    check(officeSees > 0, '사무실로 올리면 재로그인 없이 바로 보임', `${officeSees}건`)

    await svc(`/profiles?id=eq.${prof.id}`, { method: 'PATCH', body: JSON.stringify({ role: wasRole }) })
    const restored = await as(token, '/payments?select=id&limit=1')
    check(Array.isArray(restored.body) && restored.body.length === 0,
      '역할을 되돌리면 다시 가려짐', `${restored.body?.length ?? 0}건`)
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    await svc(`/profiles?id=eq.${prof.id}`, {
      method: 'PATCH', body: JSON.stringify({ active: wasActive, role: wasRole }),
    })
    const now = (await svc(`/profiles?select=active,role&id=eq.${prof.id}`)).body?.[0]
    check(now?.active === wasActive && now?.role === wasRole,
      '계정 상태를 시작 시점으로 되돌림', `active=${now?.active} · role=${now?.role}`)

    if (seededPaymentId) await svc(`/payments?id=eq.${seededPaymentId}`, { method: 'DELETE' })
    const left = (await svc(`/site_notes?select=id&content=eq.${encodeURIComponent(MARK)}`)).body ?? []
    for (const n of left) await svc(`/site_notes?id=eq.${n.id}`, { method: 'DELETE' })
    check(left.length === 0, '중지된 계정이 남긴 기록 없음', left.length ? `${left.length}건 지움` : '')

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`계정 중지·역할 변경 즉시 반영: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
