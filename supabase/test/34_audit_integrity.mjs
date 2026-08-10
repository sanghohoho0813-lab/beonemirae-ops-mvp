// ─────────────────────────────────────────────────────────────────────────────
// 감사기록을 믿을 수 있는가 (실제 DB · API)
//
//  감사로그 화면에는 이렇게 적혀 있습니다.
//
//    "감사로그는 수정·삭제할 수 없습니다 (관리자도 동일)"
//
//  대표님께 하는 약속이므로 사실이어야 합니다. 그리고 수정·삭제만 막아서는
//  부족합니다. 남의 이름으로 새 기록을 심을 수 있으면, 없는 일을 있었던 것으로
//  만들 수 있기 때문입니다. 돈이나 폐기물 처리 책임을 두고 다툼이 생겼을 때
//  이 기록이 근거가 되지 못합니다.
//
//  확인하는 것
//   1) 관리자도 기록을 고칠 수 없는가
//   2) 관리자도 기록을 지울 수 없는가
//   3) 남의 이름·id 로 기록을 심을 수 없는가  ← 0015 migration 이 필요합니다
//   4) 병원 계정은 감사기록을 볼 수 없는가
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_FIELD_PW=... TEST_CLIENT_PW=...
//    node supabase/test/34_audit_integrity.mjs
//
//  · 심어 본 기록은 끝나면 지웁니다(service 권한으로).
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const STAMP = Date.now()

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
  console.log('\n════ 감사기록을 믿을 수 있는가 ════')

  const profiles = (await svc('/profiles?select=id,name,role')).body ?? []
  const adminProfile = profiles.find((p) => p.role === 'admin')
  const fieldProfile = profiles.find((p) => p.role === 'field')
  const marks = []

  try {
    const adminTok = await login(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    const fieldTok = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    check(!!adminTok && !!fieldTok, '관리자·현장 계정으로 로그인됨')

    const target = (await svc('/audit_logs?select=id,summary&order=id.desc&limit=1')).body?.[0]
    check(!!target, '확인할 감사기록이 있음', target ? `#${target.id}` : '없음')
    if (!target) return

    // ── 1. 고칠 수 있는가 ──────────────────────────────────────────────
    section('1. 관리자가 기록을 고치려 할 때')
    const upd = await as(adminTok, `/audit_logs?id=eq.${target.id}`, {
      method: 'PATCH', body: JSON.stringify({ summary: `[검증]고침-${STAMP}` }),
    })
    check(upd.status === 403 || upd.status === 401, '수정이 막힘', `(${upd.status})`)
    const afterUpd = (await svc(`/audit_logs?select=summary&id=eq.${target.id}`)).body?.[0]
    check(afterUpd?.summary === target.summary, '내용이 그대로 남아 있음')

    // ── 2. 지울 수 있는가 ──────────────────────────────────────────────
    section('2. 관리자가 기록을 지우려 할 때')
    const del = await as(adminTok, `/audit_logs?id=eq.${target.id}`, { method: 'DELETE' })
    check(del.status === 403 || del.status === 401, '삭제가 막힘', `(${del.status})`)
    const stillThere = (await svc(`/audit_logs?select=id&id=eq.${target.id}`)).body ?? []
    check(stillThere.length === 1, '기록이 그대로 있음')

    // ── 3. 남의 이름으로 심을 수 있는가 ────────────────────────────────
    section('3. 현장 담당자가 관리자 이름으로 기록을 심으려 할 때')
    //  여기가 핵심입니다. 고치지도 지우지도 못하더라도, 없는 일을 관리자가
    //  한 것처럼 새로 써 넣을 수 있으면 이 기록은 근거가 되지 못합니다.
    const forgeMark = `[검증]위조시도-${STAMP}`
    marks.push(forgeMark)
    const forge = await as(fieldTok, '/audit_logs', {
      method: 'POST',
      body: JSON.stringify({
        actor_id: adminProfile.id,
        actor_name: adminProfile.name,
        actor_role: 'admin',
        action: 'collection.complete',
        entity: 'schedules',
        summary: forgeMark,
      }),
    })
    const forged = (await svc(`/audit_logs?select=actor_id,actor_name,actor_role&summary=eq.${encodeURIComponent(forgeMark)}`)).body?.[0]

    if (!forged) {
      ok('남의 이름으로는 기록을 심을 수 없음', `(${forge.status})`)
    } else {
      check(forged.actor_id === fieldProfile.id,
        '기록에 남는 사람은 실제로 로그인한 사람 (보낸 값이 아니라)',
        forged.actor_id === adminProfile.id
          ? `★ 관리자(${adminProfile.name}) 이름으로 남았습니다 — 0015 migration 이 필요합니다`
          : `actor_id=${forged.actor_id}`)
      check(forged.actor_name === fieldProfile.name,
        '이름도 실제 로그인한 사람으로 기록됨', `"${forged.actor_name}"`)
      check(forged.actor_role === fieldProfile.role,
        '역할도 실제 로그인한 사람으로 기록됨', `${forged.actor_role}`)
    }

    //  자기 이름으로 남기는 정상 기록은 계속 되어야 합니다(앱이 이 경로를 씁니다).
    const normalMark = `[검증]정상기록-${STAMP}`
    marks.push(normalMark)
    await as(fieldTok, '/audit_logs', {
      method: 'POST',
      body: JSON.stringify({
        actor_id: fieldProfile.id, actor_name: fieldProfile.name, actor_role: 'field',
        action: 'collection.complete', entity: 'schedules', summary: normalMark,
      }),
    })
    const normal = (await svc(`/audit_logs?select=actor_name&summary=eq.${encodeURIComponent(normalMark)}`)).body?.[0]
    check(normal?.actor_name === fieldProfile.name,
      '자기 이름으로 남기는 정상 기록은 그대로 동작', normal?.actor_name ?? '남지 않음')

    // ── 4. 병원 계정은 볼 수 없는가 ────────────────────────────────────
    section('4. 병원 계정')
    const clientTok = await login(`client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
    const seen = await as(clientTok, '/audit_logs?select=id&limit=5')
    const n = Array.isArray(seen.body) ? seen.body.length : -1
    check(n === 0, '병원 계정에는 감사기록이 한 건도 보이지 않음',
      n > 0 ? `${n}건 보임` : `(${seen.status})`)
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    let removed = 0
    for (const m of marks) {
      const rows = (await svc(`/audit_logs?select=id&summary=eq.${encodeURIComponent(m)}`)).body ?? []
      for (const r of rows) { await svc(`/audit_logs?id=eq.${r.id}`, { method: 'DELETE' }); removed++ }
    }
    check(true, '검증용 기록 정리', `${removed}건 지움`)
    let left = 0
    for (const m of marks) {
      left += ((await svc(`/audit_logs?select=id&summary=eq.${encodeURIComponent(m)}`)).body ?? []).length
    }
    check(left === 0, '검증용 기록이 남지 않음', left ? `${left}건 남음` : '')

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`감사기록 무결성: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
