// ─────────────────────────────────────────────────────────────────────────────
// 제안 종단 흐름 — 사무실이 제안 → 병원이 수락 → 사무실이 확인 (실브라우저·실DB)
//
//  이 흐름이 끊기면 두 가지가 동시에 무너집니다.
//   · 병원은 제안을 못 보거나, 수락을 눌러도 아무 일이 안 일어납니다.
//   · 사무실은 "말은 했는데 어떻게 됐더라"를 다시 전화로 확인해야 합니다.
//  그리고 수락은 돈이 오가는 약속이라, 누가 언제 눌렀는지가 남아야 합니다.
//
//  밟는 순서
//   1) 사무실(PC)   거래처 상세의 추천에서 「병원에 제안 전달」
//   2) DB           sales_leads 에 공유 표시가 남는가
//   3) 병원(모바일) 포털 첫 화면에 그 제안이 뜨는가 → 「수락」
//   4) DB           수락이 남고, 감사기록에 병원 이름으로 찍히는가
//   5) 사무실(PC)   같은 화면에 '수락' 과 '병원이 직접 응답' 이 보이는가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_CLIENT_PW=...
//    node supabase/test/24_proposal_flow.mjs
//
//  · 이 검사가 만든 제안은 끝나면 지웁니다.
//  · 이미 있던 제안은 건드리지 않고, 시작·종료 건수를 비교합니다.
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

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
}

async function main() {
  console.log('\n════ 제안 종단 흐름 (사무실 → 병원 → 사무실) ════')

  //  병원 계정이 붙어 있는 거래처로만 이 흐름을 밟을 수 있습니다.
  const clientProfile = (await svc(`/profiles?select=client_id,name&email=eq.${encodeURIComponent(`client@${DOMAIN}`)}`)).body?.[0]
  if (!clientProfile?.client_id) {
    console.error('병원 계정에 소속 병원이 없습니다. 05_live.mjs --setup 을 먼저 실행하세요.')
    process.exit(1)
  }
  const clientId = clientProfile.client_id
  const client = (await svc(`/clients?select=id,name&id=eq.${clientId}`)).body?.[0]

  const startLeads = ((await svc(`/sales_leads?select=id&client_id=eq.${clientId}`)).body ?? []).map((l) => l.id)
  let madeLeadId = null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    // ── 1. 사무실이 제안을 보낸다 ───────────────────────────────────────
    section('1. 사무실이 거래처 화면에서 제안을 보낸다')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    office.on('console', (m) => { if (m.type() === 'error') errors.push(`[사무실] ${m.text()}`) })
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)

    await office.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(3000)

    const shareBtn = office.locator('button:has-text("병원에 제안 전달"), button:has-text("병원에 다시 전달")').first()
    const hasProposal = await shareBtn.count() > 0
    check(hasProposal, '이 거래처에 보낼 추천이 하나 이상 있음',
      hasProposal ? '' : '추천이 없어 이 흐름을 밟을 수 없습니다 (데이터 부족)')
    if (!hasProposal) return

    await shareBtn.click()
    await office.waitForTimeout(1200)
    const box = office.locator('textarea[placeholder^="병원 담당자에게"]').first()
    check(await box.count() > 0, '보낼 내용을 적는 칸이 열림')
    await office.locator('button:has-text("전달")').last().click()
    await office.waitForTimeout(3500)

    // ── 2. DB 에 공유 표시가 남는가 ─────────────────────────────────────
    section('2. 제안이 DB 에 남는가')
    const leads = (await svc(`/sales_leads?select=*&client_id=eq.${clientId}&shared_with_client=is.true&order=updated_at.desc`)).body ?? []
    const lead = leads.find((l) => !startLeads.includes(l.id)) ?? leads[0]
    check(!!lead, '공유된 제안이 DB 에 있음', lead ? lead.title : '없음')
    if (!lead) return
    if (!startLeads.includes(lead.id)) madeLeadId = lead.id
    check(lead.shared_with_client === true, '병원 전달 표시가 켜짐')
    check(lead.client_id === clientId, '그 병원의 제안으로 붙음')

    const shareAudit = (await svc('/audit_logs?select=action,summary&action=eq.proposal.share&order=id.desc&limit=1')).body?.[0]
    check(!!shareAudit, '제안 공유가 감사기록에 남음', shareAudit?.summary?.slice(0, 40) ?? '없음')

    // ── 3. 병원이 포털에서 본다 → 수락 ─────────────────────────────────
    section('3. 병원(모바일)이 제안을 보고 수락')
    const portal = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    portal.on('pageerror', (e) => errors.push(`[병원] ${e.message}`))
    await signIn(portal, `client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
    await portal.goto(`${BASE}/portal`, { waitUntil: 'networkidle' })
    await portal.waitForTimeout(3000)

    const portalText = await portal.locator('body').innerText()
    check(portalText.includes('비원미래가 제안드립니다'), '포털에 제안 칸이 보임')
    check(portalText.includes(lead.title.slice(0, 10)), '보낸 제안 내용이 그대로 보임', lead.title.slice(0, 30))

    const accept = portal.locator('button:has-text("수락")').first()
    check(await accept.count() > 0, '「수락」 버튼이 있음')
    await accept.click()
    await portal.waitForTimeout(3500)

    // ── 4. 수락이 남는가 ───────────────────────────────────────────────
    section('4. 수락이 DB 와 감사기록에 남는가')
    const after = (await svc(`/sales_leads?select=stage,client_responded_at&id=eq.${lead.id}`)).body?.[0]
    check(after?.stage === '수락', '제안이 수락 상태로 바뀜', after?.stage ?? '')
    check(!!after?.client_responded_at, '병원이 응답한 시각이 남음', after?.client_responded_at ?? '')

    const evt = (await svc(`/sales_lead_events?select=stage&lead_id=eq.${lead.id}&order=at.desc&limit=1`)).body?.[0]
    check(evt?.stage === '수락', '진행 이력에도 수락이 쌓임')

    const respAudit = (await svc('/audit_logs?select=actor_role,summary&action=eq.proposal.respond&order=id.desc&limit=1')).body?.[0]
    check(respAudit?.actor_role === 'client', '누가 눌렀는지(병원)가 감사기록에 남음',
      respAudit?.summary?.slice(0, 40) ?? '없음')

    // ── 5. 사무실 화면에도 즉시 보이는가 ───────────────────────────────
    section('5. 사무실이 같은 화면에서 확인')
    await office.reload({ waitUntil: 'networkidle' })
    await office.waitForTimeout(3500)
    const officeText = await office.locator('body').innerText()
    check(officeText.includes('병원이 직접 응답'),
      "사무실 화면에 '병원이 직접 응답' 이 보임")
    check(officeText.includes('수락'), '진행 상태가 수락으로 보임')

    //  수락한 제안에는 실제 매출을 적는 칸이 열려야 합니다.
    check(await office.locator('text=실제 청구·입금된 금액').count() > 0,
      '수락하면 실제 매출 입력칸이 열림')
    await portal.close()

    // ── 6. 화면 오류 ───────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await office.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (madeLeadId) {
      await svc(`/sales_lead_events?lead_id=eq.${madeLeadId}`, { method: 'DELETE' })
      await svc(`/sales_leads?id=eq.${madeLeadId}`, { method: 'DELETE' })
    }
    const endLeads = ((await svc(`/sales_leads?select=id&client_id=eq.${clientId}`)).body ?? []).length
    check(endLeads === startLeads.length, '제안 건수가 시작 시점과 같음',
      `${startLeads.length}건 → ${endLeads}건${madeLeadId ? '' : ' (기존 제안을 재사용했습니다)'}`)
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`제안 종단 흐름: ${fail === 0 ? 'YES' : 'NO'}`)
    console.log(`검증 대상 병원: ${client?.name ?? clientId}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
