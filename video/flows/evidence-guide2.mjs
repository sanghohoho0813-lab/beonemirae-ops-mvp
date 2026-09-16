// ─────────────────────────────────────────────────────────────────────────────
//  흐름 ③  AX Evidence Guide v2 — 경영진용 (약 4분 30초)
//
//   v1 과 다른 점은 **순서**입니다. 기능 설명부터 시작하지 않고,
//   「왜 이걸 해야 하는가」부터 답합니다 —
//
//     유사 성장사례 → 비원미래의 현장자산 → 왜 AX를 만들었는가
//     → 실제 사용 → 운영 변화 → 앞으로 잴 지표 → 내부 성장 → 외부 확장
//
//   ⚠ 앞선 두 편은 그대로 있습니다.
//     flows/short-demo.mjs      50초    심사위원용
//     flows/evidence-guide.mjs  2분31초  경영진용 v1
//
//   ⚠ 지어낸 화면을 만들지 않습니다.
//     · 앞으로 잴 지표 — 제품이 이미 들고 있는 「아직 측정하지 않은 항목」을
//       **실제로 펼쳐** 보여 주고, 그 위에 대표님이 주신 여섯 지표를 올립니다.
//       시스템에 세는 칸이 아직 없는 둘은 별표로 갈라 둡니다.
//     · 성장 로드맵 — /roadmap 에 완료 · MVP 구현 · 예정 · 「계획 수립됨 ·
//       착수 전」 배지가 붙은 실제 화면이 있어 그대로 씁니다.
//
//   ⚠ 사례 카드에 **금액을 적지 않습니다** (대표님 지시). 확인하지 못한
//     남의 회사 숫자를 화면에 올리지 않습니다. 필요한 것은 금액이 아니라
//     「현장사업 → 데이터 → 시스템 → 실증 → 확장」이라는 구조입니다.
// ─────────────────────────────────────────────────────────────────────────────

export const start = {
  //  글자 화면으로 시작하므로 앱은 미리 AX 코치에 올려 둡니다
  //  (stage.coverAtStart 가 켜져 있어 뜨는 동안이 가려집니다).
  url: '/ax-coach',
  ready: '[data-coach-total]',
  settle: 250,
}

const T = (text, size, o = {}) => ({ text, size, ...o })

/** 여는 글자 화면 */
const OPEN = [
  T('현장이 중요한 산업에서도', 52),
  T('현장 데이터를 시스템으로 바꾸며\n성장한 기업들이 있습니다', 52),
]

/** 사례 카드 — 금액 없이 구조만 */
const CASE_FOOT = '제공된 리서치 자료 기준 · 성장 구조만 인용했습니다'
const CASES = [
  [
    T('리코', 50),
    T('사업장 폐기물 수거 · 관리', 28, { weight: 600, dim: true }),
    T('→  데이터 · 플랫폼 사업으로 확장', 30),
  ],
  [
    T('로커스코리아', 50),
    T('직접 물류센터 운영  →  현장 데이터 축적', 28, { weight: 600, dim: true }),
    T('→  자체 WMS · OMS SaaS  →  TMS · ERP · CRM · AI 확장', 30),
  ],
  [
    T('써큘러랩스', 50),
    T('현장 회수업무  →  RFID · NFC 데이터화', 28, { weight: 600, dim: true }),
    T('→  실제 현장 실증  →  순환경제 플랫폼', 30),
  ],
]

/** 공통 구조 */
const COMMON = [
  T('현장사업  →  데이터  →  자체 시스템  →  실증  →  확장', 40),
  T('비원미래가 AX를 만드는 이유도 같습니다', 34, { weight: 700, dim: true }),
]

/** 앞으로 측정할 지표 — 숫자는 한 칸도 적지 않습니다 */
const KPI = [
  T('앞으로 측정할 지표 — 아직 값이 없습니다', 36),
  T('배차계획 작성시간 *   ·   수거 1건 처리시간\n'
    + '누락 · 재확인 건수   ·   긴급수거 대응시간 *\n'
    + '차량당 일평균 방문처   ·   직원 1인당 처리 업무량', 27, { weight: 700 }),
  T('* 시스템에 아직 세는 칸이 없습니다 — 먼저 만들어야 합니다', 20, { weight: 600, dim: true }),
]

/** 성장 사다리 — 지금 / 실증 중 / 향후를 반드시 가릅니다 */
const LADDER = [
  T('지금        의료폐기물 수거 · 운반', 28, { weight: 700 }),
  T('실증 중     자체 AX 내부 운영 데이터화  ·  의료기관 고객포털', 28, { weight: 700 }),
  T('향후        배차 · 수거 · 자재 · 정산 고도화\n타 수거 · 운반업체 적용  ·  의료폐기물 운영 플랫폼', 28, { weight: 700 }),
  T('현장사업  →  데이터  →  시스템  →  반복 실증  →  플랫폼 확장', 23, { weight: 700, dim: true }),
  T('정책자금 · R&D · 투자 · 사업 확장', 19, { weight: 600, dim: true }),
]

/** 닫는 글자 화면 */
const CLOSE = [
  T('비원미래 AX의 목표는', 46),
  T('프로그램 하나를 만드는 것이 아닙니다', 46),
  T('현장의 경험을 데이터로,  그 데이터를 기술자산으로,\n그 자산을 다음 성장으로 잇는 것입니다', 26, { weight: 600, dim: true }),
]

export async function flow(K) {
  const {
    page, H, C0, mark, scene, point, bring, sleep,
    spot, spotOff, card, cardOff, veil, veilOff, chip,
  } = K

  /** 왼쪽 목차를 눌러 화면을 옮깁니다 — 커서가 보이게 */
  const nav = async (label, ready) => {
    await point(`aside.sticky a:has-text("${label}")`)
    await page.locator(ready).waitFor({ state: 'visible', timeout: 15000 })
    await sleep(H.afterRoute)
  }
  /** 글자 화면이 덮고 있는 동안 조용히 옮깁니다 — 커서 없이 */
  const jump = async (label, ready) => {
    await page.locator(`aside.sticky a:has-text("${label}")`).first().click()
    await page.locator(ready).waitFor({ state: 'visible', timeout: 15000 })
    await sleep(200)
  }

  // ── 여는 말 + 사례 ────────────────────────────────────────────────────
  mark('여는 글자 화면')
  await card(OPEN)
  await scene('s0', { caption: false, pad: 0 })

  //  세 회사를 한 장씩 — 말하는 동안 넘어갑니다
  await scene('s1', {
    caption: false, pad: 0, spread: true,
    during: [() => card(CASES[0], CASE_FOOT), () => card(CASES[1], CASE_FOOT), () => card(CASES[2], CASE_FOOT)],
  })

  await card(COMMON)
  await scene('s2', {
    caption: false, pad: 0, spread: true,
    //  말하는 동안, 덮인 뒤에서 대시보드로 옮겨 둡니다
    //  ⚠ 대시보드가 아니라 **오늘 일정**으로 갑니다. 대시보드 맨 위에는
    //    이번 달 매출 금액이 있어, 「현장이 있다」를 말하는 자리에 돈 숫자가
    //    같이 잡힙니다. 오늘 일정은 거래처·차량·시간뿐입니다.
    during: [async () => { await jump('오늘 일정', '[data-tour="today-list"]') }],
  })
  await cardOff(450)
  await sleep(480)

  // ── 비원미래의 현장자산 ───────────────────────────────────────────────
  //  ⚠ 아래 자리는 촬영 전에 실제 화면에서 재서 고른 것입니다.
  await chip('오늘 일정')
  await scene('s3', {
    spread: true,
    during: [
      () => spot('[data-tour="today-list"]'),
      async () => { await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' })); await sleep(380) },
    ],
  })
  await spotOff()
  await nav('거래처', '[data-tour="client-list"]')
  await chip('거래처')
  await scene('s4', {
    spread: true,
    during: [
      () => spot('[data-tour="client-list"]'),
      async () => { await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' })); await sleep(360) },
    ],
  })
  await spotOff()

  // ── AX 코치 ───────────────────────────────────────────────────────────
  await nav('AX 코치', '[data-coach-total]')
  await chip('AX 코치')
  await scene('s5', {
    spread: true,
    during: [
      () => spot('[data-coach-total]'),
      () => spot('[data-coach-area="work"]'),
      () => spot('[data-coach-area="sales"]'),
      () => spot('[data-coach-area="customer"]'),
    ],
  })

  await chip('오늘 이것만 해주세요')
  await bring('[data-coach-today]', 'start')
  await scene('s6', {
    spread: true,
    during: [
      () => spot('[data-coach-today]'),
      () => spot('[data-coach-go="collect-today"] >> xpath=ancestor::li[1]'),
      //  ⚠ 이 영상에서 가장 중요한 한 줄 — 「했다」 단추가 없다는 것
      () => spot('[data-coach-today] p:has-text("「했다」 단추는 없습니다")'),
    ],
  })
  await spotOff()
  await point('[data-coach-go="collect-today"]')
  await page.locator('[data-collect-save]').waitFor({ state: 'visible', timeout: 15000 })
  await sleep(H.afterClick)

  // ── 실제 수거업무 ─────────────────────────────────────────────────────
  await chip('수거 입력')
  await scene('s7', {
    spread: true,
    during: [
      async () => {
        await bring('[data-guide="guide-client"]', 'start')
        await spot('[data-guide="guide-client"] >> xpath=ancestor::div[contains(@class,"card")][1]')
        await page.locator('select').first().selectOption(C0)
      },
      async () => {
        await bring('[data-guide="guide-amount"]', 'center')
        await spot('[data-guide="guide-amount"] >> xpath=ancestor::div[contains(@class,"card")][1]')
        await page.locator('[data-actual-amount]').fill('70')
      },
      async () => {
        await bring('[data-tour="collect-supply"]', 'center')
        await spot('[data-tour="collect-supply-row"]')
        await page.locator('button[aria-label="2L 합성수지 더하기"]').first().click()
        await sleep(240)
        await page.locator('button[aria-label="2L 합성수지 더하기"]').first().click()
      },
    ],
  })
  await scene('s8', {
    spread: true,
    during: [
      async () => {
        await bring('[data-guide="guide-save"]', 'center')
        await spot('[data-guide="guide-save"] >> xpath=preceding::div[contains(@class,"card")][1]')
        await page.locator('select').nth(1).selectOption('v1')
      },
      () => spot('[data-collect-save]'),
    ],
  })

  //  저장 — **흉내 서버가 받습니다. 실제 저장이 아닙니다.**
  await spotOff()
  await point('[data-collect-save]')
  await page.locator('[data-tour="collect-done"]').waitFor({ state: 'visible', timeout: 15000 })
  await sleep(H.afterSave ?? H.afterClick)

  // ── 한 번 입력이 여러 업무로 ──────────────────────────────────────────
  await chip('자동 반영')
  const LINKED = '[data-tour="collect-done"] div.bg-navy-50 > p'
  await scene('s9', {
    spread: true,
    during: [
      () => spot('[data-tour="collect-done"]'),
      () => spot(`${LINKED} >> nth=1`),
      () => spot(`${LINKED} >> nth=2`),
      () => spot(`${LINKED} >> nth=3`),
      () => spot(`${LINKED} >> nth=4`),
      () => spot('[data-tour="collect-done"]'),
    ],
  })
  await spotOff()

  // ── 첫 번째 실제 변화 — 처음 본 44% 가 46% 로 ─────────────────────────
  await nav('AX 코치', '[data-coach-total]')
  await chip('실제 기록으로 확인')
  await bring('[data-coach-done]', 'center')
  await scene('s10', {
    spread: true,
    during: [
      () => spot('[data-coach-done]'),
      async () => {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
        await sleep(H.scroll ?? 380)
        await spot('[data-coach-total]')
      },
    ],
  })
  await spotOff()

  // ── 앞으로 잴 것 ──────────────────────────────────────────────────────
  await nav('AX 도입 성과', '[data-perf-summary]')
  await chip('앞으로 잴 것')
  //  「기업 성장 현황」(회사 실적)이 주인공이 되지 않게 찍는 자리를 내립니다.
  await page.evaluate(() => {
    const m = document.querySelector('main')
    if (m) m.style.setProperty('padding-bottom', '700px', 'important')
  })
  await sleep(120)
  await page.evaluate(() => {
    const c = document.querySelector('[data-perf-change]')
    const head = c?.closest('section') ?? c
    if (head) window.scrollBy({ top: head.getBoundingClientRect().top - 24, behavior: 'smooth' })
  })
  await sleep(340)
  await scene('s11', {
    spread: true,
    during: [
      //  제품이 이미 들고 있는 「아직 측정하지 않은 항목」을 실제로 펼칩니다
      async () => {
        await bring('[data-perf-unmeasured]', 'center')
        await spot('[data-perf-unmeasured]')
      },
      async () => {
        await point('[data-perf-unmeasured-toggle]')
        await page.locator('[data-perf-unmeasured-item]').first().waitFor({ state: 'visible', timeout: 10000 })
        await spot('[data-perf-unmeasured]')
      },
    ],
  })
  //  그 위에 대표님이 주신 여섯 지표 — 숫자는 없습니다
  //  ⚠ 덮개 뒤로 비치는 배경에서도 「기업 성장 현황」(회사 실적)이 위에
  //    남지 않게 한 번 더 내립니다.
  await spotOff()
  await page.evaluate(() => {
    const c = document.querySelector('[data-perf-change]')
    const head = c?.closest('section') ?? c
    if (head) window.scrollBy({ top: head.getBoundingClientRect().top - 24, behavior: 'smooth' })
  })
  await sleep(340)
  await veil(KPI)
  await scene('s12', { caption: false, pad: 0 })
  await veilOff()
  await sleep(300)

  // ── 지금 실제로 재고 있는 값 ──────────────────────────────────────────
  await chip('지금 재고 있는 값')
  await page.evaluate(() => {
    const c = document.querySelector('[data-perf-change]')
    const head = c?.closest('section') ?? c
    if (head) window.scrollBy({ top: head.getBoundingClientRect().top - 24, behavior: 'smooth' })
  })
  await sleep(340)
  await scene('s13', {
    spread: true,
    during: [
      () => spot('[data-perf-change] >> nth=0'),
      () => spot('[data-perf-change] >> nth=1'),
      () => spot('[data-perf-change] >> nth=2'),
    ],
  })
  await scene('s14', {
    spread: true,
    during: [async () => { await bring('[data-perf-unmeasured]', 'center'); await spot('[data-perf-unmeasured]') }],
  })
  await spotOff()

  // ── 성장 로드맵 — 제품에 있는 실제 화면 ───────────────────────────────
  //  「활용 계획」은 접혀 있는 「관리」 묶음 안에 있습니다 — 사람이 하듯 폅니다.
  await point('aside.sticky button:has-text("관리")')
  await sleep(320)
  await nav('활용 계획', '[data-roadmap-hero]')
  await chip('활용 계획')
  const phase = (t) => `p:has-text("${t}") >> xpath=ancestor::div[contains(@class,"card")][1]`
  await scene('s15', {
    spread: true,
    during: [
      () => spot('[data-roadmap-hero]'),
      //  「MVP 구현 · 현재」 배지가 붙은 단계
      () => spot(phase('반복입력 자동화')),
      () => spot(phase('병원 고객 서비스')),
    ],
  })
  await scene('s16', {
    spread: true,
    during: [
      //  「예정」 배지가 붙은 단계 — 완성된 것처럼 보이지 않게
      () => spot(phase('정기 운영관리')),
      async () => { await bring('[data-saas-plan]', 'center'); await spot('[data-saas-plan]') },
    ],
  })
  //  ⚠ 사다리를 처음부터 덮으면 제품이 적어 둔 「계획 수립됨 · 착수 전」을
  //    읽을 수 없습니다. 먼저 그 카드를 보여 주고, 뒤에 사다리를 얹습니다.
  await scene('s17', {
    spread: true,
    during: [
      () => spot('[data-saas-plan]'),
      async () => { await spotOff(); await veil(LADDER) },
    ],
  })

  // ── 닫는 말 ───────────────────────────────────────────────────────────
  //  ⚠ 덮개를 먼저 걷으면 「어둡다 → 밝다 → 다시 어둡다」로 한 번 번쩍입니다.
  //    닫는 글자 화면을 덮개 **위로** 먼저 올린 뒤 그 뒤에서 걷습니다.
  await chip(null)
  await card(CLOSE)
  await sleep(320)
  await veilOff()
  await scene('outro', { caption: false, pad: 0 })
}
