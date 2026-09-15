// ─────────────────────────────────────────────────────────────────────────────
//  흐름 ②  비원미래 AX Evidence Guide — 경영진용 (약 2분 30초)
//
//   보시는 분이 대표님과 이사님입니다. 기능 자랑이 아니라 **왜 실제 업무에서
//   계속 써야 하는가**를 이해하시게 하는 것이 목적입니다.
//
//   이 영상 전체를 한 줄이 관통합니다 —
//     「AX Evidence 는 심사를 위해 따로 만드는 자료가 아니라,
//       회사가 실제로 일하면서 남기는 변화의 기록이다.」
//
//   ⚠ 50초짜리 짧은 영상(flows/short-demo.mjs)과 **완전히 별개**입니다.
//     그쪽은 제품의 심사 시연 투어를 그대로 녹화하고, 이쪽은 투어를 켜지
//     않고 화면을 직접 돕니다. 투어가 다섯 단계뿐이라 스무 곳 넘게 짚지
//     못하기 때문입니다. **강조 모양은 투어가 그리던 것과 같은 값**을 쓰고,
//     화면은 여전히 100% 실제 제품입니다.
//
//   ⚠ 일부러 짚지 않는 것 — 성과 화면의 「기업 성장 현황」(2025년 매출 등).
//     그 칸은 회사 실적이지 AX 도입 효과가 아니고, 화면에도 그렇게 적혀
//     있습니다. 경영진 영상에서 강조하면 AX 성과처럼 읽힙니다.
// ─────────────────────────────────────────────────────────────────────────────

export const start = {
  //  글자 화면으로 시작하므로 앱은 미리 AX 코치에 올려 둡니다.
  //  (config 의 stage.coverAtStart 가 켜져 있어 뜨는 동안이 가려집니다)
  url: '/ax-coach',
  ready: '[data-coach-total]',
  settle: 250,
}

/** 여는 글자 화면 */
const INTRO = [
  { text: 'AX를 만들었다는 사실보다 중요한 것은', size: 46 },
  { text: '실제로 회사가 어떻게 달라지고 있는가입니다', size: 46 },
  { text: '누가, 언제, 어떤 업무를 했고 그 결과 무엇이 달라졌는지가\n데이터로 남아야 AX 도입의 변화도 설명할 수 있습니다', size: 27, weight: 600, dim: true },
  { text: '이 기록은 내부 운영 개선의 기준이 되고,\n앞으로 회사의 성장과 실행력을 외부에 설명하는 근거가 됩니다', size: 22, weight: 600, dim: true },
]

/** 닫는 글자 화면 */
const OUTRO = [
  { text: 'AX를 쓰는 과정이', size: 46 },
  { text: '회사의 변화 기록이 됩니다', size: 46 },
  { text: '업무를 바꾸고, 그 변화를 데이터로 남기고,\n그 데이터가 다음 성장을 위한 근거가 됩니다', size: 27, weight: 600, dim: true },
]

/** PART 7 — 성과 화면을 배경으로 남기고 한마디만 */
const WHY = [
  { text: '쌓인 데이터는 먼저 내부 경영에 쓰입니다', size: 38 },
  { text: '충분히 쌓이면 회사의 변화와 실행력을\n외부에 설명하는 근거로도 활용할 수 있습니다', size: 26, weight: 600, dim: true },
  { text: '정책자금 · R&D · 투자 · 사업 확장', size: 22, weight: 700, dim: true },
]

export async function flow(K) {
  const {
    page, H, C0, mark, scene, point, bring, sleep,
    spot, spotOff, card, cardOff, veil, veilOff, chip,
  } = K

  //  왼쪽 목차로 화면을 옮깁니다 — 순간이동이 아니라 사람이 누르는 것으로.
  const nav = async (label, ready) => {
    await point(`aside.sticky a:has-text("${label}")`)
    await page.locator(ready).waitFor({ state: 'visible', timeout: 15000 })
    await sleep(H.afterRoute)
  }

  // ── INTRO ─────────────────────────────────────────────────────────────
  mark('여는 글자 화면')
  await card(INTRO)
  //  글자 화면이 같은 문장을 크게 보여 주므로 아래 자막은 띄우지 않습니다.
  await scene('intro', { caption: false, pad: 0 })
  //  어두운 글자 화면 → 밝은 AX 화면. 한 번에 걷으면 한 프레임에 밝기가
  //  크게 튑니다 — 조금 길게 녹입니다.
  await cardOff(450)
  await sleep(480)

  // ── PART 1 — AX 코치가 지금 상태를 본다 ───────────────────────────────
  await chip('AX 코치')
  await scene('p1', {
    spread: true,
    during: [
      () => spot('[data-coach-total]'),
      () => spot('[data-coach-area="work"]'),
      () => spot('[data-coach-area="sales"]'),
      () => spot('[data-coach-area="capacity"]'),
      () => spot('[data-coach-area="customer"]'),
      //  「업무 활용」을 눌러 무엇을 세는지 펼쳐 봅니다 (제품에 있는 동작)
      async () => {
        await point('[data-coach-area="work"] button')
        await page.locator('[data-coach-items="work"]').waitFor({ state: 'visible', timeout: 10000 })
        await spot('[data-coach-items="work"]')
      },
    ],
  })
  //  다시 접습니다 — 펼친 채로 두면 아래 내용이 밀려 내려갑니다.
  await page.locator('[data-coach-area="work"] button').first().click()
  await spotOff()
  await sleep(220)

  // ── PART 2 — 부족한 것을 실제 업무로 연결 ─────────────────────────────
  await chip('오늘 이것만 해주세요')
  await bring('[data-coach-today]', 'start')
  await scene('p2', {
    spread: true,
    during: [
      () => spot('[data-coach-today]'),
      () => spot('[data-coach-go="collect-today"] >> xpath=ancestor::li[1]'),
      //  ⚠ 이 영상에서 가장 중요한 한 줄 — 「했다」 단추가 없다는 것.
      () => spot('[data-coach-today] p:has-text("「했다」 단추는 없습니다")'),
      () => spot('[data-coach-go="collect-today"]'),
    ],
  })
  await spotOff()
  await point('[data-coach-go="collect-today"]')
  await page.locator('[data-collect-save]').waitFor({ state: 'visible', timeout: 15000 })
  await sleep(H.afterClick)

  // ── PART 3 — 증거를 위해 따로 하는 일이 아니다 ────────────────────────
  await chip('수거 입력')
  await scene('p3', {
    spread: true,
    during: [
      //  거래처 — 고르면 폐기물 구분과 주소가 따라 들어옵니다
      async () => {
        await bring('[data-guide="guide-client"]', 'start')
        await spot('[data-guide="guide-client"] >> xpath=ancestor::div[contains(@class,"card")][1]')
        await page.locator('select').first().selectOption(C0)
      },
      //  다녀온 날 · 시간 · 수거량
      async () => {
        await bring('[data-guide="guide-amount"]', 'center')
        await spot('[data-guide="guide-amount"] >> xpath=ancestor::div[contains(@class,"card")][1]')
        await page.locator('[data-actual-amount]').fill('70')
      },
      //  병원에 두고 온 용기 — 저장하면 사무실 재고가 그만큼 줄어듭니다
      async () => {
        await bring('[data-tour="collect-supply"]', 'center')
        await spot('[data-tour="collect-supply-row"]')
        await page.locator('button[aria-label="2L 합성수지 더하기"]').first().click()
        await sleep(260)
        await page.locator('button[aria-label="2L 합성수지 더하기"]').first().click()
      },
      //  오늘 쓴 차량
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

  // ── PART 4 — 하나의 기록이 회사 여러 업무로 ───────────────────────────
  await chip('자동 반영')
  const LINKED = '[data-tour="collect-done"] div.bg-navy-50 > p'
  await scene('p4', {
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

  // ── PART 5 — 실제로 했는지 다시 확인 ──────────────────────────────────
  await nav('AX 코치', '[data-coach-total]')
  await chip('오늘 확인된 것')
  await bring('[data-coach-done]', 'center')
  await scene('p5', {
    spread: true,
    during: [
      () => spot('[data-coach-done]'),
      () => spot('[data-coach-done] [data-coach-verified], [data-coach-done] li'),
      async () => {
        await bring('[data-coach-report-pct]', 'center')
        await spot('[data-coach-report-pct]')
      },
    ],
  })
  await spotOff()

  // ── PART 6 — 기록이 쌓이면 변화가 측정된다 ────────────────────────────
  await nav('AX 도입 성과', '[data-perf-summary]')
  await chip('AX 도입 성과')
  await scene('p6', {
    spread: true,
    during: [
      //  ⚠ 「기업 성장 현황」은 짚지 않습니다 (맨 위 설명 참고)
      () => spot('[data-perf-change] >> nth=0'),
      () => spot('[data-perf-change] >> nth=1'),
      () => spot('[data-perf-change] >> nth=2'),
      async () => {
        await bring('[data-perf-unmeasured]', 'center')
        await spot('[data-perf-unmeasured]')
      },
    ],
  })

  // ── PART 7 — 이 데이터가 왜 회사 성장에 중요한가 ──────────────────────
  await spotOff()
  await chip(null)
  await veil(WHY)
  await scene('p7', { caption: false, pad: 0 })

  // ── OUTRO ─────────────────────────────────────────────────────────────
  //  ⚠ 덮개를 먼저 걷으면 「어둡다 → 밝다 → 다시 어둡다」가 되어 한 번
  //    번쩍입니다. 닫는 글자 화면을 **덮개 위로 먼저 올린 뒤**, 그 뒤에서
  //    조용히 덮개를 내립니다.
  await card(OUTRO, '비원미래 AX · AX Coach')
  await sleep(320)
  await veilOff()
  await scene('outro', { caption: false, pad: 0 })
}
