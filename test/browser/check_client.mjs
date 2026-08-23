import { chromium, EXEC } from './_pw.mjs'

//  거래처 정보 수정 · 삭제.
//
//   「운영조건」 탭은 수거 가능시간과 처리장을 「미등록」으로 보여 주는데
//   넣을 칸이 없었습니다. 기저귀 주기도 의료폐기물과 같은 칸을 나눠 썼습니다.
//   화면에 보이는 값은 전부 넣고 고칠 수 있어야 합니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const CID = '00000000-0000-0000-0000-0000000000a1'
const mkProfile = (role) => ({
  id: UID, email: 'a@b.c', name: '대표', role, font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
})
let client = {
  id: CID, name: 'A병원', type: '병원', address: '경기도 남양주시', manager: '원무과',
  phone: '031-000-0000', collection_cycle: '주 2회',
  collects_medical_waste: true, collects_diaper: true, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
  flat_fee_when_empty: false, collect_time: '', disposal_site: '', diaper_cycle: '',
}
const calls = []
let purgeFails = false
const b = await chromium.launch({ executablePath: EXEC })

async function open(role = 'admin') {
  const profile = mkProfile(role)
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(39)
    if (url.includes('/rpc/delete_client')) {
      calls.push({ kind: 'purge', ...JSON.parse(r.request().postData() ?? '{}') })
      if (purgeFails) {
        return r.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ message: '「A병원」에는 수거 12건 · 청구 3건 기록이 있어 지울 수 없습니다. 지우면 지난 매출·미수금이 바뀝니다 — 「거래 종료」로 정리해 주세요.' }) })
      }
      return json({ name: 'A병원', deleted: true })
    }
    if (url.includes('/clients') && method === 'PATCH') {
      const body = JSON.parse(r.request().postData() ?? '{}')
      calls.push({ kind: 'patch', ...body })
      client = { ...client, ...body }
      return json([client])
    }
    if (url.includes('/audit_logs')) return json([{ id: 1 }])
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/clients')) return json(single ? client : [client])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  return { ctx, p }
}

const { ctx, p } = await open('admin')
const dialogs = []
let answer = true
let promptText = '오타로 두 번 등록'
p.on('dialog', (d) => {
  dialogs.push(d.message())
  if (d.type() === 'prompt') void d.accept(promptText)
  else if (answer) void d.accept()
  else void d.dismiss()
})
const txt = async (sel) => ((await p.textContent(sel)) ?? '').replace(/\s+/g, ' ')

await p.goto(`${BASE}/clients/${CID}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2400)

//  ⚠ 0087 에서 탭 순서가 바뀌었습니다 — 예전에는 「운영조건」이 첫 탭이라
//    화면을 열자마자 여기 값들이 보였습니다. 지금은 매일 보는 「수거이력」이
//    먼저이고, 수거주기·처리장 같은 **설정성 정보**는 맨 뒤입니다.
//    값이 없어진 것이 아니라 자리가 바뀐 것이라, 검사도 그 자리로 갑니다.
const toOps = async () => {
  await p.locator('[data-client-tab="ops"]').first().dispatchEvent('click')
  await p.waitForTimeout(700)
}
await toOps()

// ── 1. 넣을 칸이 없던 값들 ────────────────────────────────────────────────
const before = await txt('main')
ok(/수거 가능시간.*미등록/.test(before), '처음에는 수거 가능시간이 「미등록」', before.slice(before.indexOf('수거 가능시간'), before.indexOf('수거 가능시간') + 30))
await p.click('button:has-text("수정")')
await p.waitForTimeout(800)
for (const [hook, label] of [
  ['data-client-collect-time', '수거 가능시간'],
  ['data-client-disposal', '처리장'],
  ['data-client-diaper-cycle', '기저귀 수거주기'],
  ['data-client-cycle', '의료폐기물 수거주기'],
]) {
  ok((await p.locator(`[${hook}]`).count()) === 1, `${label} 을 넣는 칸이 있음`)
}

await p.fill('[data-client-collect-time]', '평일 09:00~17:00 (점심 제외)')
await p.fill('[data-client-disposal]', '○○환경 소각장')
await p.fill('[data-client-diaper-cycle]', '주 1회')
calls.length = 0
await p.click('button:has-text("저장")')
await p.waitForTimeout(1800)
const patch = calls.find((c) => c.kind === 'patch')
ok(!!patch, '저장이 서버로 감')
ok(patch?.collect_time === '평일 09:00~17:00 (점심 제외)', '수거 가능시간을 그대로 보냄', String(patch?.collect_time))
ok(patch?.disposal_site === '○○환경 소각장', '처리장도')
ok(patch?.diaper_cycle === '주 1회', '기저귀 주기를 따로 보냄 — 의료폐기물 주기를 덮지 않음')
ok(patch?.collection_cycle === '주 2회', '의료폐기물 주기는 그대로')

await p.waitForTimeout(600)
await toOps()
const after = await txt('main')
ok(/평일 09:00~17:00/.test(after), '넣은 값이 운영조건에 바로 보임')
ok(/○○환경 소각장/.test(after), '처리장도 화면에 반영')
ok(!/수거 가능시간 미등록/.test(after.replace(/\s+/g, ' ')), '더는 「미등록」이 아님')

// ── 2. 삭제 — 기록이 있으면 서버가 막고, 그 문구를 그대로 보여 준다 ────────
ok((await p.locator('[data-client-purge]').count()) === 1, '관리자에게 「삭제」 버튼이 있음')
ok((await p.locator('[data-client-retire]').count()) === 1, '「거래 종료」와 따로 있음 — 뜻이 다릅니다')

purgeFails = true
dialogs.length = 0
calls.length = 0
await p.click('[data-client-purge]')
await p.waitForTimeout(1800)
ok(calls.some((c) => c.kind === 'purge'), '삭제가 서버 함수로 감')
ok(calls.find((c) => c.kind === 'purge')?.p_reason === '오타로 두 번 등록', '적은 사유를 그대로 보냄')
const msg = dialogs.join(' ')
ok(/수거 12건 · 청구 3건 기록이 있어 지울 수 없습니다/.test(msg), '서버가 막은 이유를 그대로 보여 줌',
  msg.slice(msg.indexOf('수거 12'), msg.indexOf('수거 12') + 60))
ok(/거래 종료/.test(msg), '대신 무엇을 하면 되는지도')
ok(p.url().includes(CID), '막혔으므로 화면에 그대로 남아 있음')

// ── 3. 기록이 없으면 지워지고 목록으로 ────────────────────────────────────
purgeFails = false
await p.click('[data-client-purge]')
await p.waitForTimeout(1800)
ok(p.url().endsWith('/clients'), '지워지면 거래처 목록으로 돌아감', p.url())
await ctx.close()

// ── 4. 사무실 담당자에게는 삭제 버튼이 없다 ───────────────────────────────
{
  const { ctx: c2, p: p2 } = await open('office')
  await p2.goto(`${BASE}/clients/${CID}`, { waitUntil: 'domcontentloaded' })
  await p2.waitForTimeout(2400)
  ok((await p2.locator('[data-client-purge]').count()) === 0, '사무실 담당자에게는 삭제 버튼이 없음')
  ok((await p2.locator('[data-client-retire]').count()) === 1, '거래 종료는 할 수 있음')
  ok((await p2.locator('button:has-text("수정")').count()) >= 1, '정보 수정도 할 수 있음')
  await c2.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
