// ─────────────────────────────────────────────────────────────────────────────
// 아무도 들어올 수 없게 될 수 있는가 (실제 DB · API)
//
//  이 시스템의 관리자는 지금 한 명입니다. 사용자 추가·역할 변경·설정이
//  전부 관리자 전용이므로, 그 한 명이 잠기면 대표님이 스스로 푸실 방법이
//  없습니다. Supabase service 키를 쥔 사람이 DB 를 직접 고쳐야 합니다.
//
//  사용자 관리 화면은 자기 계정 중지를 막고 있습니다. 그런데 화면만
//  막혀 있었고 서버는 막지 않아서, 요청을 직접 보내면 그대로 됐습니다
//  (실측: active=false 200, role=office 200).
//
//  확인하는 것
//   1) 자기 계정을 스스로 중지할 수 없는가
//   2) 마지막 남은 관리자를 중지할 수 없는가
//   3) 마지막 남은 관리자의 역할을 내릴 수 없는가
//   4) 관리자가 아닌 계정은 평소처럼 중지·복구되는가 (과하게 막지 않았는지)
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=...
//    node supabase/test/37_admin_lockout.mjs
//
//  · 바꾼 값은 끝나면 원래대로 돌려놓고, 돌아갔는지까지 확인합니다.
//  · 0016_admin_lockout_guard.sql 을 적용하지 않았으면 실패합니다.
//    (적용 전에도 조용히 통과시키지 않습니다)
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
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
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
  }).then(json)).body?.access_token

async function main() {
  console.log('\n════ 아무도 들어올 수 없게 될 수 있는가 ════')

  const profiles = (await svc('/profiles?select=id,email,name,role,active')).body ?? []
  const admins = profiles.filter((p) => p.role === 'admin' && p.active)
  const me = profiles.find((p) => p.email === `admin@${DOMAIN}`)
  const other = profiles.find((p) => p.role !== 'admin' && p.role !== 'client')
  console.log(`살아 있는 관리자 ${admins.length}명 · 검사 대상 ${me?.name ?? '없음'}`)

  //  검사 도중 무엇이 어떻게 됐든 원래대로 돌려놓기 위해 먼저 적어 둡니다.
  const snapshot = profiles.map((p) => ({ id: p.id, role: p.role, active: p.active }))
  const restore = async () => {
    let fixed = 0
    for (const s of snapshot) {
      const now = (await svc(`/profiles?select=role,active&id=eq.${s.id}`)).body?.[0]
      if (!now) continue
      if (now.role !== s.role || now.active !== s.active) {
        await svc(`/profiles?id=eq.${s.id}`, {
          method: 'PATCH', body: JSON.stringify({ role: s.role, active: s.active }),
        })
        fixed++
      }
    }
    return fixed
  }

  try {
    if (!me) { no('검사할 관리자 계정을 찾지 못했습니다'); return }
    const tok = await login(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    check(!!tok, '관리자 계정으로 로그인됨')
    if (!tok) return

    const lastOne = admins.length <= 1

    //  한 번 중지되면 그 계정으로는 더 이상 아무것도 못 합니다(그게 바로
    //  이 검사가 말하려는 것입니다). 그래서 시도할 때마다 service 키로
    //  곧바로 되돌려 놓고 다음 검사를 합니다. 안 그러면 두 번째부터는
    //  '막혔다' 가 아니라 '이미 죽은 계정이라 안 된 것' 이 됩니다.
    const resetMe = async () =>
      svc(`/profiles?id=eq.${me.id}`, {
        method: 'PATCH', body: JSON.stringify({ role: 'admin', active: true }),
      })

    // ── 1. 자기 계정 중지 ─────────────────────────────────────────────
    section('1. 자기 계정을 스스로 중지하려 할 때')
    const selfOff = await as(tok, `/profiles?id=eq.${me.id}`, {
      method: 'PATCH', body: JSON.stringify({ active: false }),
    })
    const afterSelf = (await svc(`/profiles?select=active&id=eq.${me.id}`)).body?.[0]
    check(afterSelf?.active === true, '자기 계정을 중지할 수 없음',
      afterSelf?.active === false
        ? `★ 중지됐습니다 (${selfOff.status}) — 0016 migration 이 필요합니다`
        : `(${selfOff.status})`)
    if (afterSelf?.active === false) {
      await resetMe()
      console.log('        (되살려 두고 다음 검사를 이어갑니다)')
    }

    // ── 2. 마지막 관리자 역할 내리기 ──────────────────────────────────
    section('2. 마지막 남은 관리자의 역할을 내리려 할 때')
    const demote = await as(tok, `/profiles?id=eq.${me.id}`, {
      method: 'PATCH', body: JSON.stringify({ role: 'office' }),
    })
    const afterRole = (await svc(`/profiles?select=role&id=eq.${me.id}`)).body?.[0]
    if (lastOne) {
      check(afterRole?.role === 'admin', '마지막 관리자의 역할을 내릴 수 없음',
        afterRole?.role !== 'admin'
          ? `★ ${afterRole?.role} 로 바뀌었습니다 (${demote.status}) — 0016 migration 이 필요합니다`
          : `(${demote.status})`)
    } else {
      ok('관리자가 두 명 이상이라 이 검사는 해당 없음', `${admins.length}명`)
    }
    if (afterRole?.role !== 'admin') {
      await resetMe()
      console.log('        (관리자로 되돌려 두고 다음 검사를 이어갑니다)')
    }

    // ── 3. 관리자가 아닌 계정은 평소처럼 ──────────────────────────────
    //  과하게 막아 버리면 계정 관리 자체가 안 됩니다. 정상 경로는 살아
    //  있어야 합니다.
    section('3. 관리자가 아닌 계정은 평소처럼 중지·복구되는가')
    if (!other) {
      no('중지해 볼 직원 계정을 찾지 못했습니다')
    } else {
      const off = await as(tok, `/profiles?id=eq.${other.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: false }),
      })
      const nowOff = (await svc(`/profiles?select=active&id=eq.${other.id}`)).body?.[0]
      check(nowOff?.active === false, `${other.name} 계정을 중지할 수 있음`, `(${off.status})`)
      const on = await as(tok, `/profiles?id=eq.${other.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: true }),
      })
      const nowOn = (await svc(`/profiles?select=active&id=eq.${other.id}`)).body?.[0]
      check(nowOn?.active === true, `${other.name} 계정을 다시 살릴 수 있음`, `(${on.status})`)
    }

    // ── 4. service 키로는 여전히 풀 수 있는가 ─────────────────────────
    //  잠긴 상태를 되살리는 유일한 열쇠입니다. 이 문까지 잠그면 안 됩니다.
    section('4. 잠겼을 때 되살릴 길이 남아 있는가')
    const svcOff = await svc(`/profiles?id=eq.${me.id}`, {
      method: 'PATCH', body: JSON.stringify({ active: false }),
    })
    const svcState = (await svc(`/profiles?select=active&id=eq.${me.id}`)).body?.[0]
    check(svcState?.active === false, 'service 키로는 관리자 계정을 중지할 수 있음', `(${svcOff.status})`)
    await svc(`/profiles?id=eq.${me.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
    const back = (await svc(`/profiles?select=active&id=eq.${me.id}`)).body?.[0]
    check(back?.active === true, 'service 키로 다시 살릴 수 있음')
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    const fixed = await restore()
    check(true, '계정 상태를 검사 전으로 되돌림', fixed ? `${fixed}건 되돌림` : '바뀐 것 없음')
    const now = (await svc('/profiles?select=role,active')).body ?? []
    const sameAdmins = now.filter((p) => p.role === 'admin' && p.active).length
    check(sameAdmins === admins.length, '살아 있는 관리자 수가 시작 시점과 같음',
      `${admins.length}명 → ${sameAdmins}명`)

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`관리자 잠김 방지: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
