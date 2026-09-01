import { chromium, EXEC } from './_pw.mjs'
import { UPLOAD_DIR, requireUploads } from './_uploads.mjs'

//  "엑셀 올리고 → 이상 없으면 그대로 거래처로 옮기기" 흐름을 확인합니다.
//   1) 등록 안 된 거래처: 파일 내용으로 바로 거래처를 만들 수 있는가
//   2) 판정: 이상 없으면 「이상 없음」, 아니면 무엇을 봐야 하는지
//   3) 비슷한 이름이 이미 있으면 그냥 만들지 않고 경고하는가

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UP = UPLOAD_DIR
//  ⚠ 폴더만 보면 안 됩니다 — 다른 파일이 올라와 폴더가 다시 생기면
//    폴더는 있는데 엑셀은 없어서 도중에 터집니다 (0095 에서 실제로 그랬습니다).
//    이 스위트가 쓰는 파일을 **하나씩** 확인합니다.
requireUploads([`${UP}/4d162046-202512_______________________.xlsx`, `${UP}/7c6daff4-202304_____________.xlsx`, `${UP}/ec9615a7-202608____________.xlsx`])
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const mk = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '', collects_medical_waste: true, collects_diaper: true, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null, pricing: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})

async function open(clientRows) {
  let clients = clientRows.slice()
  const posted = []
  const b = await chromium.launch({ executablePath: EXEC })
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
  await ctx.route('**/rest/v1/**', (r) => {
    const req = r.request()
    const url = req.url()
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    //  0045 부터 거래처 등록은 표에 직접 넣지 않고 create_client 로 갑니다.
    if (url.includes('/rpc/create_client')) {
      const b = req.postDataJSON() ?? {}
      const body = b.p_client ?? {}
      const id = '00000000-0000-0000-0000-00000000new1'
      const row = { ...mk(id, body.name ?? ''), ...body }
      posted.push(body)
      clients = [...clients, row]
      return json({ id, alreadySaved: false, duplicates: [] })
    }
    if (req.method() === 'POST' && url.includes('/clients')) {
      //  여기로 오면 안 됩니다 — 옛 길입니다.
      let body = {}
      try { body = JSON.parse(req.postData() ?? '{}') } catch { /* 무시 */ }
      const row = { ...mk('00000000-0000-0000-0000-00000000old1', body.name ?? ''), ...body }
      posted.push(body)
      clients = [...clients, row]
      return json([row])
    }
    if (req.method() === 'POST') return json([{ id: 'x' }])
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/clients')) {
      if (single) {
        const m = url.match(/id=eq\.([0-9a-f-]+)/)
        return json(clients.find((c) => c.id === m?.[1]) ?? clients[0])
      }
      return json(clients)
    }
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  p.on('dialog', (d) => d.accept())
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  return { b, p, posted }
}

const body = (p) => p.textContent('main').then((t) => t ?? '')

// ── 1. 등록 안 된 거래처 — 파일로 바로 만들기 (엠에스병원, 이상 없는 파일) ──
{
  const { b, p, posted } = await open([])
  await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  await p.setInputFiles('input[type="file"]', `${UP}/ec9615a7-202608____________.xlsx`)
  await p.waitForTimeout(2500)

  let t = await body(p)
  ok(/엠에스병원.*아직 등록된 거래처가 아닙니다|아직 등록된 거래처가 아닙니다/.test(t), '없는 거래처임을 알려 줌')
  const btn = p.locator('[data-create-client]')
  ok((await btn.count()) === 1, '「거래처로 만들기」 버튼이 있음')
  ok(/「엠에스병원」 거래처로 만들기/.test(await btn.textContent() ?? ''), '버튼에 파일의 상호가 그대로')

  await btn.click()
  //  거래처 생성 → 서버 응답 → 판정 다시 계산까지 기다립니다.
  await p.locator('[data-verdict]').waitFor({ state: 'attached', timeout: 15000 })
  await p.waitForTimeout(600)
  ok(posted.length === 1, '거래처 생성 요청이 한 번 나감')
  ok(posted[0]?.name === '엠에스병원', '파일의 상호로 만들어짐', posted[0]?.name)
  ok(posted[0]?.contract_start === '2026-08-01', '계약 시작일도 파일에서', posted[0]?.contract_start)
  ok(posted[0]?.pricing?.medical?.sale === 1000, '단가(의료 1,000원/kg)도 파일에서', JSON.stringify(posted[0]?.pricing?.medical))

  t = await body(p)
  ok(/이상 없습니다/.test(t), '만든 뒤 바로 「이상 없습니다」 판정')
  ok(/정산 상태가 「미수금」/.test(t), '옮기지 않는 항목은 「안내」로 그대로 보임')
  ok(/그대로 옮기기/.test(t), '버튼이 「그대로 옮기기」로 바뀜')
  ok((await p.locator('[data-verdict="clean"]').count()) === 1, '판정 = 깨끗함')
  await p.screenshot({ path: `${SHOT}/import-create-client.png`, fullPage: true })
  await b.close()
}

// ── 2. 확인할 것이 있는 파일 (서울인화 — 연도 밀린 날짜 4건) ──────────────
{
  const { b, p } = await open([mk('00000000-0000-0000-0000-0000000000c9', '서울인화스포츠마취통증의학과의원')])
  await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  await p.setInputFiles('input[type="file"]', `${UP}/4d162046-202512_______________________.xlsx`)
  await p.waitForTimeout(2500)
  const t = await body(p)
  //  정산 시트 이름은 잘려 있지만(「…마취통증」) 명세서의 전체 상호로 맞춰져
  //  기존 거래처가 자동 선택돼야 합니다.
  ok(/서울인화스포츠마취통증의학과의원/.test(t), '잘린 상호를 명세서의 전체 상호로 맞춤')
  ok((await p.locator('[data-create-client]').count()) === 0, '이미 있는 거래처라 새로 만들기 안 띄움')
  ok((await p.locator('[data-verdict="check"]').count()) === 1, '판정 = 확인 필요')
  ok(/넣을 수 없는 줄 4건/.test(t), '연도 밀린 4건을 그대로 알려 줌')
  await b.close()
}

// ── 3. 비슷한 이름이 이미 있을 때 — 말없이 만들지 않음 ────────────────────
{
  const { b, p, posted } = await open([mk('00000000-0000-0000-0000-0000000000c8', '엠에스병원 본원')])
  await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  await p.setInputFiles('input[type="file"]', `${UP}/ec9615a7-202608____________.xlsx`)
  await p.waitForTimeout(2500)
  const t = await body(p)
  ok(/이름이 비슷한 거래처가 있습니다/.test(t), '비슷한 이름이 있으면 먼저 알려 줌')
  ok(/「엠에스병원 본원」/.test(t), '어느 거래처와 비슷한지 이름을 밝힘')
  ok((await p.locator('[data-create-client]').count()) === 0, '바로 만들기 버튼은 안 띄움')
  ok(posted.length === 0, '아무것도 만들지 않음')
  await b.close()
}

// ── 4. 상호가 아예 다른 파일 (오남한양 — 법인명) ──────────────────────────
{
  const { b, p } = await open([])
  await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)
  await p.setInputFiles('input[type="file"]', `${UP}/7c6daff4-202304_____________.xlsx`)
  await p.waitForTimeout(2500)
  const t = await body(p)
  ok(/의료법인 한양의료재단/.test(t), '명세서의 법인명이 다르다는 것을 알려 줌')
  ok(/오남한양병원/.test(t), '정산 시트의 사업장명도 함께 보여 줌')
  await b.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
