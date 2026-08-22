import { chromium, EXEC } from './_pw.mjs'

//  거래처 정보 붙여넣기 + 오늘 일정 휴무일 표시.
//
//   세금계산서 칸을 만들었지만 그 값은 지금 이사님 엑셀에 있습니다.
//   스무 곳을 하나씩 열어 여섯 칸씩 옮겨 적기 전까지 발행 목록은 비어
//   있습니다. 있는 엑셀을 그대로 붙여 넣게 합니다.
//
//   지키는 것
//    · 이름이 목록에 없으면 새로 만들지 않습니다 (유령 거래처 금지)
//    · 이미 값이 있는 칸은 기본으로 덮어쓰지 않습니다
//    · 사업자번호 오타·부가세 못 읽는 값이 있는 줄은 통째로 저장하지 않습니다
//    · 단가는 아예 다루지 않습니다 (청구 금액이 바뀌는 값)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const GOOD = '124-81-00998'
const TYPO = '124-81-00997'

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name, tax = {}) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: tax.due ?? null,
  pricing: { medical: { sale: 950, cost: 350 } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: tax.no ?? null, biz_ceo: tax.ceo ?? null, biz_type: null, biz_item: null,
  tax_email: null, vat_mode: tax.vat ?? null,
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const CD = '00000000-0000-0000-0000-0000000000d1'
const clients = [
  mkClient(CA, '더원요양병원'),
  //  이미 대표자가 들어 있습니다 — 다른 값이 들어오면 덮어쓰지 않아야 합니다.
  mkClient(CB, '남양주백병원', { ceo: '기존대표' }),
  mkClient(CC, '오남한양병원'),
  mkClient(CD, '목동현대웰병원'),
]

let holidays = []
const patched = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const method = r.request().method()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(34)
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/clients') && method === 'PATCH') {
    const body = JSON.parse(r.request().postData() ?? '{}')
    patched.push({ url, body })
    //  서버처럼 실제로 반영합니다 — 다시 읽었을 때 값이 남아 있어야
    //  화면이 「이제 준비됨」으로 바뀌는지 볼 수 있습니다.
    const id = (url.match(/id=eq\.([0-9a-f-]+)/) ?? [])[1]
    const at = clients.findIndex((c) => c.id === id)
    if (at >= 0) clients[at] = { ...clients[at], ...body }
    return json([clients[at] ?? {}])
  }
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/holidays')) return json(holidays)
  if (url.includes('/payment_receipts')) return json([])
  if (url.includes('/payments')) return json([])
  if (url.includes('/schedules')) return json([])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
p.on('dialog', (d) => d.accept())

await p.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-price-summary]', { timeout: 20000 })
await p.click('button:has-text("엑셀에서 한 번에 붙여넣기")')
await p.waitForSelector('[data-paste-input]', { timeout: 10000 })

// ── 1. 머리글이 없으면 짐작하지 않는다 ───────────────────────────────────
await p.fill('[data-paste-input]', `더원요양병원\t${GOOD}\t김대표`)
await p.waitForTimeout(600)
ok((await p.locator('[data-paste-nohead]').count()) === 1, '머리글이 없으면 순서를 짐작하지 않고 알려 줌')
ok((await p.locator('[data-paste-preview]').count()) === 0, '머리글이 없으면 저장할 것도 만들지 않음')

// ── 2. 머리글이 있으면 칸을 찾는다 ────────────────────────────────────────
//  일부러 칸 순서를 흔들고 머리글 이름도 조금 다르게 씁니다 —
//  실제 엑셀은 「사업자번호」·「대표」처럼 짧게 적혀 있습니다.
const paste = [
  '거래처명\t대표\t사업자번호\t업태\t종목\t메일\t부가세\t결제일',
  `더원요양병원\t김대표\t${GOOD}\t의료업\t병원\ta@x.kr\t별도\t20`,
  `남양주백병원\t새대표\t${GOOD}\t의료업\t의원\tb@x.kr\tVAT 포함\t`,
  `오남한양병원\t박대표\t${TYPO}\t\t\t\t별도\t`,
  `없는병원\t최대표\t${GOOD}\t\t\t\t별도\t`,
  `목동현대웰병원\t한대표\t${GOOD}\t\t\t\t알아서\t`,
].join('\n')
await p.fill('[data-paste-input]', paste)
await p.waitForTimeout(700)

const cols = ((await p.textContent('[data-paste-cols]')) ?? '').replace(/\s+/g, ' ')
ok(/읽은 칸 — 7개/.test(cols), '머리글 이름이 달라도 7칸을 찾음', cols)
ok(/2곳을 찾았습니다/.test(cols), '저장할 수 있는 2곳 (오타·못 읽는 값이 있는 줄은 제외)', cols)

const preview = ((await p.textContent('[data-paste-preview]')) ?? '').replace(/\s+/g, ' ')
ok(/채울 거래처 2곳/.test(preview), '실제로 바뀌는 곳만 셈 (덮어쓰기 꺼짐)', preview.slice(0, 110))
ok(/사업자등록번호 124-81-00998/.test(preview), '사업자번호를 하이픈 넣어 보여 줌', preview.slice(0, 120))
ok(/결제일 20/.test(preview), '결제일도 채움')

// ── 3. 확인이 필요한 줄 ───────────────────────────────────────────────────
const bad = ((await p.textContent('[data-paste-bad]')) ?? '').replace(/\s+/g, ' ')
ok(/확인이 필요한 3줄/.test(bad), '오타·못 읽는 값·없는 이름 3줄', bad.slice(0, 70))
ok(/오남한양병원.*형식에 맞지 않습니다/.test(bad), '사업자번호 오타를 잡음', bad.slice(0, 160))
ok(/없는병원.*거래처를 찾지 못했습니다/.test(bad), '없는 이름은 새로 만들지 않고 알려 줌')
ok(/목동현대웰병원.*별도·포함·면세/.test(bad), '부가세를 못 읽으면 그 줄을 저장하지 않음')

// ── 4. 이미 있는 값은 덮어쓰지 않는다 ─────────────────────────────────────
const conflict = ((await p.textContent('[data-paste-conflict]')) ?? '').replace(/\s+/g, ' ')
ok(/이미 값이 들어 있는 칸 1곳/.test(conflict), '기존 값과 다른 곳을 따로 세움', conflict.slice(0, 80))
ok(/남양주백병원 대표자 기존대표 → 새대표/.test(conflict), '무엇이 무엇으로 바뀌는지 그대로 적음',
  conflict.slice(0, 130))
ok(!/새대표/.test(preview), '덮어쓰기가 꺼져 있으면 미리보기에도 안 넣음')

// ── 5. 저장 — 빈 칸만 ─────────────────────────────────────────────────────
await p.click('[data-paste-save]')
await p.waitForTimeout(2500)
ok(patched.length === 2, '두 곳만 저장 (오타·못 찾은 줄은 안 보냄)', String(patched.length))
const sentA = patched.find((x) => x.url.includes(CA))?.body
ok(sentA?.biz_no === '1248100998', '사업자번호는 숫자만 저장', JSON.stringify(sentA?.biz_no))
ok(sentA?.vat_mode === '별도', '부가세 방식 저장', JSON.stringify(sentA?.vat_mode))
ok(sentA?.payment_due_day === 20, '결제일 저장', JSON.stringify(sentA?.payment_due_day))
ok(sentA?.pricing === undefined, '단가는 건드리지 않음 — 붙여넣기가 청구 금액을 바꾸지 않습니다',
  JSON.stringify(Object.keys(sentA ?? {})))
const sentB = patched.find((x) => x.url.includes(CB))?.body
ok(sentB?.biz_ceo === undefined, '이미 대표자가 있던 곳은 그 칸을 보내지 않음', JSON.stringify(sentB))
ok(sentB?.vat_mode === '포함', '「VAT 포함」도 읽음', JSON.stringify(sentB?.vat_mode))
const doneTxt = (await p.textContent('[data-paste-done]')) ?? ''
ok(/2곳을 채웠습니다/.test(doneTxt), '몇 곳을 채웠는지 알려 줌', doneTxt.trim())

// ── 6. 채운 뒤 점검 목록이 줄어드는가 ─────────────────────────────────────
await p.waitForTimeout(800)
const sum = ((await p.textContent('[data-price-summary]')) ?? '').replace(/\s+/g, ' ')
ok(/세금계산서\s*2곳/.test(sum), '채운 두 곳이 확인 목록에서 빠짐 (4곳 → 2곳)', sum)

// ── 7. 덮어쓰기를 켜면 기존 값도 바뀐다 ───────────────────────────────────
patched.length = 0
await p.fill('[data-paste-input]', ['거래처명\t대표', '남양주백병원\t새대표'].join('\n'))
await p.waitForTimeout(700)
await p.check('[data-paste-overwrite]')
await p.waitForTimeout(500)
await p.click('[data-paste-save]')
await p.waitForTimeout(2000)
ok(patched.length === 1, '덮어쓰기를 켜면 저장됨', String(patched.length))
ok(patched[0]?.body?.biz_ceo === '새대표', '기존 값이 바뀜', JSON.stringify(patched[0]?.body))

// ── 8. 오늘 일정에 휴무일 표시 ────────────────────────────────────────────
//  편성에서는 그 날을 빼 주지만, 이미 만들어 둔 예정이 남아 있으면
//  현장은 그날이 쉬는 날인지 모릅니다.
await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
ok((await p.locator('[data-holiday-today]').count()) === 0, '휴무일이 아니면 아무것도 뜨지 않음')

holidays = [{ day: TODAY, name: '임시공휴일' }]
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-holiday-today]', { timeout: 20000 })
const hol = ((await p.textContent('[data-holiday-today]')) ?? '').replace(/\s+/g, ' ')
ok(/휴무일입니다 — 임시공휴일/.test(hol), '오늘이 휴무일이면 현장 화면에 그대로', hol.slice(0, 70))
ok(/편성에서 빠집니다/.test(hol), '일정이 없으면 그 사실만 알려 줌', hol.slice(0, 90))

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
