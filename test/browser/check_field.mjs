import { chromium, EXEC } from './_pw.mjs'

//  현장 담당자 화면에서 돈과 운영도구가 사라졌는지 확인합니다.
//  같은 데이터로 사무실 담당자도 함께 돌려, "지워야 할 것만 지웠는지" 를 봅니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const CLIENT_ID = '00000000-0000-0000-0000-0000000000c1'

const out = []
//  ⚠ 모아 뒀다가 끝에 찍으면 중간에 터졌을 때 **앞의 결과까지 전부 사라집니다.**
//    그러면 회귀 집계에 「검사 0 · 실패 0」으로 남아 통과한 것처럼 보입니다.
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

//  추천이 나오려면 수거이력이 쌓여 있어야 합니다(insights.ts). 수거량이 늘고
//  주기가 임박한 모양으로 만들어, 「추가 수거 제안 + 금액」이 실제로 뜨게 합니다.
//  ⚠⚠ 예전에는 여기가 `new Date(2026, 7, 12 - back)` 이었습니다 — **날짜가
//     못 박혀** 있었습니다. 추천 엔진(insights.ts)은 「최근 2주」와 「다음
//     수거 예정일까지 며칠」로 판단하는데, 진짜 오늘이 8월 12일에서 멀어질수록
//     이 자료가 그 창 밖으로 밀려나, 어느 날부터 **제품은 그대로인데 검사만**
//     빨간 줄이 났습니다. 실제로 8월 21일에 그렇게 났습니다.
//     기준을 **오늘**로 잡아, 며칠에 돌리든 같은 뜻이 되게 합니다.
const day = (back) => {
  const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - back)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const CLIENTS = [{
  id: CLIENT_ID, name: '한양의료재단', type: '병원', address: '서울시 강남구', manager: '김주현',
  phone: '02-000-0000', collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', pricing: null,
}]
const SCHEDULES = [40, 33, 26, 19, 12, 5, 2].map((back, i) => ({
  id: `00000000-0000-0000-0000-00000000s${String(i).padStart(3, '0')}`.replace('s', 'a'),
  date: day(back), client_id: CLIENT_ID, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '09:00', status: '완료', expected_amount: 100 + i * 40, actual_amount: 100 + i * 40,
  actual_time: '09:30', completed_at: `${day(back)}T00:30:00Z`, containers: null, driver_name: '김기사',
  handover_status: '수거 완료', handover_at: null, memo: '', event_id: null, origin: 'field',
  demo_session_id: null, created_at: `${day(back)}T00:00:00Z`, updated_at: `${day(back)}T00:00:00Z`,
}))

const b = await chromium.launch({ executablePath: EXEC })

async function asRole(role, uid) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } })
  const profile = {
    id: uid, email: `${role}@beonemirae.test`, name: role === 'field' ? '현장 직원' : '사무실 직원',
    role, font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null,
    created_at: '2026-01-01T00:00:00Z',
  }
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/clients')) return json(single ? CLIENTS[0] : CLIENTS)
    if (url.includes('/schedules')) return json(SCHEDULES)
    //  청구·입금은 서버가 현장에게 0건을 돌려줍니다. 그 상태를 그대로 흉내 냅니다.
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  return { ctx, p }
}

const MONEY = /원\b|만원|억원|\+\s*\d/

// ── 현장 담당자 ─────────────────────────────────────────────────────────────
{
  const { ctx, p } = await asRole('field', '00000000-0000-0000-0000-0000000000f1')

  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  const nav = (await p.textContent('aside')) ?? ''
  ok(!/운영 도구/.test(nav), '사이드바에 「운영 도구」 묶음이 없음')
  ok(!/추가 개발 예정/.test(nav), '사이드바에 「추가 개발 예정」이 없음')
  ok(!/자재 관리|수거이력|활용 계획/.test(nav), '자재 관리·수거이력·활용 계획이 메뉴에 없음')
  ok(/오늘 일정/.test(nav) && /수거 입력/.test(nav) && /거래처/.test(nav), '현장 업무 메뉴는 그대로 있음')
  await p.screenshot({ path: `${SHOT}/field-sidebar.png`, fullPage: false })

  await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  const list = (await p.textContent('main')) ?? ''
  ok(/한양의료재단/.test(list), '거래처 목록은 정상적으로 보임')
  ok(!/추가 수거 제안|소모품 공급 제안|배출자 교육 제안/.test(list), '거래처 목록에 영업 추천이 없음')
  ok(!MONEY.test(list), '거래처 목록에 금액이 없음', (list.match(/[^\s]*원[^\s]*/) ?? [''])[0])
  await p.screenshot({ path: `${SHOT}/field-clients.png`, fullPage: true })

  await p.goto(`${BASE}/clients/${CLIENT_ID}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  const detail = (await p.textContent('main')) ?? ''
  ok(!/다음 행동 추천/.test(detail), '거래처 상세에 「다음 행동 추천」이 없음')
  ok(!/영업 전환 이력/.test(detail), '거래처 상세에 「영업 전환 이력」이 없음')
  ok(!/월 정산|결제·미수금|미수금/.test(detail), '정산·미수금 탭이 없음')
  ok(!MONEY.test(detail), '거래처 상세에 금액이 없음', (detail.match(/[^\s]*원[^\s]*/) ?? [''])[0])
  await p.screenshot({ path: `${SHOT}/field-client-detail.png`, fullPage: true })

  for (const path of ['/materials', '/history', '/roadmap', '/receivables', '/stats']) {
    await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1200)
    const t = (await p.textContent('body')) ?? ''
    ok(/접근 권한이 없는 화면입니다/.test(t), `${path} 직접 주소로 들어가도 차단됨`)
  }
  await ctx.close()
}

// ── 사무실 담당자 (지워야 할 것만 지웠는가) ─────────────────────────────────
{
  const { ctx, p } = await asRole('office', '00000000-0000-0000-0000-0000000000o1')

  await p.goto(`${BASE}/clients`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  const nav = (await p.textContent('aside')) ?? ''
  ok(/운영 도구/.test(nav), '사무실 담당자에게는 「운영 도구」가 그대로 보임')
  //  「운영 도구」는 접힌 채로 시작하고, 「추가 개발 예정」은 그 **안에**
  //  들어갔습니다(예전에는 목차 한 칸을 따로 차지했습니다). 그래서 접힌
  //  상태에서는 둘 다 안 보이는 것이 맞습니다 — 펼쳐서 확인합니다.
  ok(!/추가 개발 예정/.test(nav), '접힌 상태에서는 예정 항목도 같이 숨음')
  await p.locator('[data-nav-group-header="운영 도구"]').click()
  await p.waitForTimeout(300)
  const navOpen = (await p.textContent('aside')) ?? ''
  ok(/자재 관리/.test(navOpen) && /수거이력/.test(navOpen), '자재 관리·수거이력 메뉴 유지')
  ok(/추가 개발 예정/.test(navOpen), '펼치면 「추가 개발 예정」이 같은 묶음 안에 있음')

  const list = (await p.textContent('main')) ?? ''
  ok(/추가 수거 제안|소모품 공급 제안|배출자 교육 제안/.test(list), '사무실 담당자에게는 영업 추천이 보임')
  //  ⚠ 여기는 예전에 「사무실 담당자에게는 예상 금액이 보임」을 확인했습니다.
  //    그런데 이 자료는 pricing: null 이고 청구 기록도 없습니다 — **금액의
  //    근거가 한 줄도 없는데 금액이 보였던 것**입니다. 그 값은 코드에 박아
  //    둔 3,500원 / 15만원 / 1,200원이었고, 이 검사가 그것을 못 박고
  //    있었습니다. 이제는 근거가 없으면 금액을 안 붙입니다(0060).
  ok(!MONEY.test(list),
    '**단가 근거가 없으면 금액을 안 보여 줌** (예전에는 지어낸 값이 떴습니다)',
    (list.match(/[^\s]*원[^\s]*/) ?? [''])[0] || '금액 없음')
  await p.screenshot({ path: `${SHOT}/office-clients.png`, fullPage: true })

  await p.goto(`${BASE}/clients/${CLIENT_ID}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  const detail = (await p.textContent('main')) ?? ''
  ok(/다음 행동 추천/.test(detail), '사무실 담당자에게는 「다음 행동 추천」이 보임')
  ok(/영업 전환 이력/.test(detail), '사무실 담당자에게는 「영업 전환 이력」이 보임')

  await p.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ok(!/접근 권한이 없는 화면입니다/.test((await p.textContent('body')) ?? ''), '사무실 담당자는 자재 관리를 열 수 있음')
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
