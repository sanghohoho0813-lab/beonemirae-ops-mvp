import { chromium, EXEC } from './_pw.mjs'

//  월 마감 진행상황.
//
//   한 달을 마감하는 여섯 단계가 세 화면에 흩어져 있어서 「이번 달 어디까지
//   했지」를 알려면 돌아다녀야 했습니다. 한 자리에서 봅니다.
//
//   특히 지키는 것 — **시스템이 모르는 것을 「끝」이라고 말하지 않습니다.**
//   명세서를 보냈는지, 홈택스에 발행했는지는 기록이 남지 않습니다.
//
//   시나리오 (지난달)
//    A병원  수거 1건 완료 · 청구 100만원 확정 · 명세서 있음 · 사업자정보 완비 · 입금 60만
//    B의원  수거 1건이 아직 「예정」인 채로 지나감 (입력 대기)
//    C의원  수거 1건 완료 · 아직 확정 안 함 · 단가 없음(기본 단가)

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const [Y, M] = TODAY.slice(0, 7).split('-').map(Number)
const PREV = M === 1 ? `${Y - 1}-12` : `${Y}-${String(M - 1).padStart(2, '0')}`

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mkClient = (id, name, pricing, biz) => ({
  id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: biz ? '220-81-62517' : null, biz_ceo: biz ? '홍길동' : null,
  biz_type: biz ? '의료업' : null, biz_item: biz ? '병원' : null,
  tax_email: biz ? 'a@b.c' : null, vat_mode: biz ? '별도' : null,
  flat_fee_when_empty: false,
})
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000b1'
const CC = '00000000-0000-0000-0000-0000000000c1'
const clients = [
  mkClient(CA, 'A병원', { medical: { sale: 1000, cost: 350 } }, true),
  mkClient(CB, 'B의원', { medical: { sale: 950, cost: 350 } }, true),
  //  단가를 넣지 않은 곳 — 기본 단가로 계산됩니다
  mkClient(CC, 'C의원', {}, false),
]

const mkSched = (id, clientId, date, kg, status) => ({
  id, date, client_id: clientId, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status, expected_amount: kg, actual_amount: status === '완료' ? kg : null,
  completed_at: status === '완료' ? `${date}T09:00:00Z` : null, memo: '', origin: 'app',
  is_additional: false, demo_session_id: null, plan_batch: null,
  created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
})
const schedules = [
  mkSched('sa', CA, `${PREV}-05`, 1000, '완료'),
  //  지나갔는데 아직 예정인 채 — 입력 대기
  mkSched('sb', CB, `${PREV}-06`, 100, '예정'),
  mkSched('sc', CC, `${PREV}-07`, 100, '완료'),
]

const invoice = {
  clientName: 'A병원', month: PREV, total: 1000000, lines: [], vatTotal: 0,
}
const payments = [{
  id: 'pa', client_id: CA, billing_month: PREV, amount: 1000000, status: '미수금',
  method: '무통장', paid_at: null, memo: '', demo_session_id: null,
  snapshot: { kind: '정기', confirmedAt: `${PREV}-28T00:00:00Z`, invoice,
              scheduleIds: ['sa'], materialIds: [] },
  canceled_at: null, created_at: `${PREV}-28T00:00:00Z`, updated_at: `${PREV}-28T00:00:00Z`,
}]
const receipts = [{
  id: 'ra', payment_id: 'pa', received_on: `${PREV}-30`, amount: 600000, method: '계좌이체',
  memo: '', actor_name: '대표', created_at: `${PREV}-30T00:00:00Z`, source_ref: null,
}]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(37)
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/client_prices')) return json([])
  if (url.includes('/holidays')) return json([])
  if (url.includes('/payment_receipts')) return json(receipts)
  if (url.includes('/payments')) return json(payments)
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

await p.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-progress-panel]', { timeout: 20000 })
await p.waitForTimeout(1200)
await p.click(`[data-close-month="${PREV}"]`)
await p.waitForTimeout(1000)

const txt = async (sel) => ((await p.textContent(sel)) ?? '').replace(/\s+/g, ' ')
const state = (k) => txt(`[data-progress-state="${k}"]`)

// ── 1. 여섯 단계가 다 있는가 ──────────────────────────────────────────────
//  넓은 화면은 여섯 장을 한눈에, 폰은 「다음 할 일」만 펼치고 나머지는 접습니다.
//  DOM 에는 둘 다 있으므로 넓은 화면 쪽(data-progress-grid)만 셉니다.
ok((await p.locator('[data-progress-grid] [data-progress-step]').count()) === 6, '여섯 단계를 한 자리에')
for (const k of ['collect', 'settle', 'confirm', 'invoice', 'tax', 'bank']) {
  ok((await p.locator(`[data-progress-grid] [data-progress-step="${k}"]`).count()) === 1, `단계 ${k}`)
}
ok((await p.locator('[data-progress-phone]').count()) === 1, '폰에서는 접어 두는 묶음이 따로 있음')

// ── 2. 수거 입력 — 지나갔는데 예정인 건을 잡는다 ──────────────────────────
ok((await state('collect')).includes('남음'), '입력 대기가 있으면 「남음」', await state('collect'))
const collect = await txt('[data-progress-step="collect"]')
ok(/입력 대기 1건/.test(collect), '몇 건인지', collect.slice(0, 90))
ok(/완료 2건/.test(collect), '완료 건수도 함께')

// ── 3. 정산 확인 — 기본 단가로 계산된 곳 ──────────────────────────────────
ok((await state('settle')).includes('확인'), '기본 단가가 섞이면 「확인」', await state('settle'))
const settle = await txt('[data-progress-step="settle"]')
ok(/기본 단가 1곳/.test(settle), '몇 곳인지', settle.slice(0, 90))
ok(/추정 금액/.test(settle), '왜 봐야 하는지 적음')

// ── 4. 청구 확정 — 확정 대기 ──────────────────────────────────────────────
ok((await state('confirm')).includes('남음'), '확정 대기가 있으면 「남음」', await state('confirm'))
const confirm = await txt('[data-progress-step="confirm"]')
ok(/확정 대기 1곳/.test(confirm), '몇 곳인지', confirm.slice(0, 90))

// ── 5. 명세서 · 세금계산서 — 「끝」이라고 말하지 않는다 ────────────────────
//  여기가 이번 라운드의 핵심입니다. 보냈는지 발행했는지는 시스템에 기록이
//  남지 않습니다. 초록색 「끝」으로 칠하면 안 한 일을 했다고 믿게 됩니다.
ok((await state('invoice')).includes('준비됨'), '명세서는 「준비됨」까지만', await state('invoice'))
ok(!(await state('invoice')).includes('끝'), '명세서를 「끝」이라고 하지 않음')
const inv = await txt('[data-progress-step="invoice"]')
ok(/1장 뽑을 수 있음/.test(inv), '몇 장인지', inv.slice(0, 80))
ok(/보냈는지는 시스템이 알지 못합니다/.test(inv), '보냈는지 모른다고 그대로 적음')

ok((await state('tax')).includes('준비됨'), '세금계산서도 「준비됨」', await state('tax'))
const tax = await txt('[data-progress-step="tax"]')
ok(/공급가액 1,000,000원/.test(tax) && /세액 100,000원/.test(tax), '공급가액·세액을 그대로', tax.slice(0, 110))
ok(/홈택스에 실제로 발행했는지는 시스템이 알지 못합니다/.test(tax), '발행 여부를 모른다고 적음')

// ── 6. 입금 대사 — 부분입금이 반영된 남은 금액 ────────────────────────────
ok((await state('bank')).includes('남음'), '못 받은 돈이 있으면 「남음」', await state('bank'))
const bank = await txt('[data-progress-step="bank"]')
ok(/입금 대기 1곳/.test(bank) && /남은 400,000원/.test(bank), '부분입금을 뺀 남은 금액',
  bank.slice(0, 90))

// ── 7. 돈 세 줄 — 확정·받은·못 받은 ───────────────────────────────────────
const money = await txt('[data-progress-money]')
ok(/확정 청구\s*1,000,000원/.test(money), '확정 청구', money)
ok(/받은 돈\s*600,000원/.test(money), '실제로 받은 돈')
ok(/못 받은 돈\s*400,000원/.test(money), '못 받은 돈')

// ── 8. 숫자에는 출처가 있다 ───────────────────────────────────────────────
ok((await p.locator('[data-progress-grid] [data-progress-source]').count()) === 6, '단계마다 출처를 적음')
ok((await txt('[data-progress-source="bank"]')).includes('청구액 − 입금 기록(부분입금 포함)'),
  '입금 숫자가 어디서 나왔는지', await txt('[data-progress-source="bank"]'))
ok((await txt('[data-progress-source="settle"]')).includes('거래처 단가'), '정산 숫자의 출처')

// ── 9. 다음 할 일을 맨 위에 ───────────────────────────────────────────────
const head = await txt('[data-progress-headline]')
ok(/다음 할 일 — 수거 입력/.test(head), '남은 것 중 첫 단계를 맨 위에', head)
ok((await txt('[data-progress-count]')).startsWith('2'), '남은 단계 없음 2 / 6',
  await txt('[data-progress-count]'))

// ── 10. 각 단계에서 그 화면으로 갈 수 있다 ────────────────────────────────
//  폰용 「다음 할 일」 카드가 같은 단계를 한 번 더 그립니다(의도).
//  PC 표 안에서만 찾습니다 — 안 그러면 다음 할 일이 무엇이냐에 따라 결과가 흔들립니다.
const link = (k) => p.locator(`[data-progress-grid] [data-progress-link="${k}"]`).first().getAttribute('href')
ok((await link('bank')) === '/bank', '입금 대사 → 통장 대사')
ok((await link('collect')) === '/today', '수거 입력 → 오늘 일정')
ok((await link('settle')) === '/pricing', '정산 확인 → 거래처 점검')

// ── 11. 달을 바꾸면 그 달로 다시 센다 ─────────────────────────────────────
//  아무 일도 없던 달은 「해당 없음」이어야 합니다 — 끝났다고 하면 안 됩니다.
const [py, pm] = PREV.split('-').map(Number)
const t2 = py * 12 + (pm - 1) - 3
const OLD = `${Math.floor(t2 / 12)}-${String((t2 % 12) + 1).padStart(2, '0')}`
await p.click(`[data-close-month="${OLD}"]`)
await p.waitForTimeout(1000)
ok((await state('collect')).includes('해당 없음'), '기록이 없는 달은 「해당 없음」', await state('collect'))
ok((await state('confirm')).includes('해당 없음'), '청구도 「해당 없음」')
const head2 = await txt('[data-progress-headline]')
ok(/모두 끝났습니다/.test(head2), '남은 일이 없으면 그렇게 말함', head2)

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
