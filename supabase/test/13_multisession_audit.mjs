// ─────────────────────────────────────────────────────────────────────────────
// 멀티세션 동시 수정 · 감사기록 완전성 (실제 Supabase + 실제 브라우저)
//
//  두 사람이 같은 거래처를 동시에 고칠 때, 한 사람이 방금 바꾼 값이 다른
//  사람의 오래된 화면에 덮여 조용히 사라지는 일이 있습니다. 아무도 오류를
//  보지 못하고, 나중에 "내가 분명히 바꿨는데"만 남습니다.
//
//  그리고 그 일이 벌어졌을 때 "누가 언제 무엇을 바꿨는가"를 댈 수 있어야
//  합니다. 특히 돈에 직결되는 것 — 거래처 단가, 미수금 상태, 일정 삭제.
//
//  여기서 보는 것
//   1) 서로 다른 칸을 동시에 고치면 둘 다 살아남는가
//   2) 같은 칸을 동시에 고치면 마지막이 이기되, 누가 마지막인지 남는가
//   3) 화면이 오래된 상태에서 저장해도 흔적이 남는가
//   4) 돈에 관계된 변경이 감사기록에 남는가  ← 실제 화면으로 확인
//
//  실행
//    npm run build && npx vite preview --port 4173      # 다른 터미널에서
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=...
//    node supabase/test/13_multisession_audit.mjs
//
//  · 바꾸는 값은 '[검증]' 거래처의 메모·담당자뿐이고 끝나면 되돌립니다.
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const BASE = process.env.BASE || 'http://localhost:4173'
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const MARK = '[검증]'

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
/**
 * 표에 실제로 몇 줄이 있는가.
 *
 *  받아 온 줄을 세면 안 됩니다. PostgREST 는 한 번에 1000줄까지만 돌려주기
 *  때문에, 표가 그 이상 커지면 늘어나도 늘 1000 으로 보입니다. 감사로그가
 *  1056줄이 되자 "감사기록이 안 남는다" 는 실패가 났습니다 — 잘 남고
 *  있었습니다. 개수는 서버에 물어봅니다.
 */
const countOf = async (path) => {
  const r = await fetch(`${U}/rest/v1${path}`, {
    headers: { apikey: S, Authorization: `Bearer ${S}`, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number(r.headers.get('content-range')?.split('/')[1] ?? 0)
}
const asUser = (token, path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)

async function login(email, password) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)
  if (!r.body?.access_token) throw new Error(`로그인 실패 ${email}`)
  return r.body.access_token
}

async function main() {
  console.log('\n════ 멀티세션 동시 수정 · 감사기록 ════')

  const office = await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
  const admin = await login(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
  const idOf = {}
  for (const r of ['office', 'admin']) {
    idOf[r] = (await svc(`/profiles?select=id&email=eq.${encodeURIComponent(`${r}@${DOMAIN}`)}`)).body?.[0]?.id
  }

  const client = (await svc(`/clients?select=*&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body?.[0]
  if (!client) { console.error('검증용 거래처가 없습니다.'); process.exit(1) }
  const orig = { manager: client.manager, note: client.note ?? '', phone: client.phone }
  const restore = () => svc(`/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify(orig) })

  try {
    // ── 1. 서로 다른 칸을 동시에 ──────────────────────────────────────────
    section('1. 두 사람이 서로 다른 칸을 동시에 고침')
    await Promise.all([
      asUser(office, `/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ manager: `${MARK}사무실이바꾼담당자` }) }),
      asUser(admin, `/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ phone: '010-0000-1111' }) }),
    ])
    const both = (await svc(`/clients?select=manager,phone&id=eq.${client.id}`)).body?.[0]
    check(both?.manager === `${MARK}사무실이바꾼담당자` && both?.phone === '010-0000-1111',
      '둘 다 살아남음 (앱이 바꾼 칸만 보내므로 서로 안 지움)',
      `담당자 "${both?.manager}" · 전화 ${both?.phone}`)

    // ── 2. 같은 칸을 동시에 ───────────────────────────────────────────────
    section('2. 두 사람이 같은 칸을 동시에 고침')
    await Promise.all([
      asUser(office, `/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ note: `${MARK}사무실메모` }) }),
      asUser(admin, `/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ note: `${MARK}관리자메모` }) }),
    ])
    const after = (await svc(`/clients?select=note,updated_by,updated_at&id=eq.${client.id}`)).body?.[0]
    const winner = after?.updated_by === idOf.office ? '사무실' : after?.updated_by === idOf.admin ? '관리자' : '?'
    check(after?.note === `${MARK}사무실메모` || after?.note === `${MARK}관리자메모`,
      '한 쪽 값으로 확정됨 (반쯤 섞인 값이 남지 않음)', `"${after?.note}"`)
    check(after?.updated_by === idOf.office || after?.updated_by === idOf.admin,
      '마지막으로 바꾼 사람이 기록됨', `${winner} · ${after?.updated_at?.slice(0, 19)}`)
    const consistent = (after?.note === `${MARK}사무실메모` && after?.updated_by === idOf.office) ||
                       (after?.note === `${MARK}관리자메모` && after?.updated_by === idOf.admin)
    check(consistent, '남은 값과 기록된 사람이 서로 맞음',
      consistent ? '' : `값은 "${after?.note}" 인데 기록은 ${winner}`)

    // ── 3. 오래된 화면에서 저장 ───────────────────────────────────────────
    section('3. 화면이 오래된 상태에서 저장했을 때')
    //  사무실이 화면을 연 뒤(값 A), 관리자가 먼저 바꾸고(값 B),
    //  사무실이 자기 화면의 값으로 저장하면 B 가 사라집니다.
    //  MVP 는 잠금을 두지 않으므로 덮어쓰기 자체는 막지 않습니다.
    //  대신 "누가 마지막인지"가 남아 되짚을 수 있어야 합니다.
    await svc(`/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ note: `${MARK}관리자가먼저바꾼값` }) })
    const beforeStale = (await svc(`/clients?select=updated_at&id=eq.${client.id}`)).body?.[0]?.updated_at
    await asUser(office, `/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ note: `${MARK}오래된화면값` }) })
    const stale = (await svc(`/clients?select=note,updated_by,updated_at&id=eq.${client.id}`)).body?.[0]
    check(stale?.note === `${MARK}오래된화면값`, '덮어쓰기 자체는 허용 (MVP 는 잠금 없음)', `"${stale?.note}"`)
    check(stale?.updated_by === idOf.office, '덮어쓴 사람이 남음', winner)
    check(stale?.updated_at !== beforeStale, '수정 시각이 갱신됨',
      `${beforeStale?.slice(11, 19)} → ${stale?.updated_at?.slice(11, 19)}`)

    // ── 4. 돈에 관계된 변경이 감사기록에 남는가 ───────────────────────────
    section('4. 돈에 관계된 변경이 감사기록에 남는가')
    const auditBefore = await countOf('/audit_logs?select=id')

    const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
    const browser = await pw.default.chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
    })
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.fill('#login-email', `office@${DOMAIN}`)
    await page.fill('#login-password', process.env.TEST_OFFICE_PW)
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ])
    await page.goto(`${BASE}/clients/${client.id}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    const newManager = `${MARK}감사확인-${Date.now() % 100000}`
    let edited = false
    const editBtn = page.locator('button:has-text("수정")').first()
    if (await editBtn.count()) {
      await editBtn.click()
      await page.waitForTimeout(800)
      // 담당자 칸은 label 바로 뒤의 input 입니다 (id 가 없어 라벨로 찾습니다)
      const mgr = page.locator('label:text-is("담당자") + input')
      if (await mgr.count()) {
        await mgr.fill(newManager)
        edited = true
        await page.locator('button:has-text("저장")').last().click()
        await page.waitForTimeout(3000)
      }
    }
    check(edited, '화면에서 거래처 담당자를 수정')
    const saved = (await svc(`/clients?select=manager&id=eq.${client.id}`)).body?.[0]?.manager
    check(saved === newManager, '수정이 DB 에 저장됨', `"${saved}"`)

    const auditAfter = (await svc('/audit_logs?select=id,action,summary&order=id.desc&limit=10')).body ?? []
    const total = await countOf('/audit_logs?select=id')
    const clientAudit = auditAfter.find((a) => a.action?.startsWith('client.'))
    check(total > auditBefore && !!clientAudit, '거래처 수정이 감사기록에 남음',
      clientAudit ? `${clientAudit.action} · ${clientAudit.summary?.slice(0, 60)}` : `감사기록 ${auditBefore}건 그대로 — 누가 바꿨는지 추적 불가`)

    await browser.close()
  } catch (e) {
    //  중간에 터지면 여기서 붙잡아 실패로 남깁니다. 예전에는 catch 가 없어서,
    //  터진 뒤 finally 의 process.exit(0) 이 그대로 실행되며 '통과' 로 끝났습니다.
    //  (관리자 로그인이 막혔을 때 이 검사가 4건만 하고 YES 를 찍었습니다)
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    await restore()
    const back = (await svc(`/clients?select=manager,note,phone&id=eq.${client.id}`)).body?.[0]
    check(back?.manager === orig.manager && (back?.note ?? '') === orig.note && back?.phone === orig.phone,
      '거래처 값을 검사 전으로 되돌림', `담당자 "${back?.manager}"`)
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`멀티세션·감사기록: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
