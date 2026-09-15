// ─────────────────────────────────────────────────────────────────────────────
//  흐름 ①  50초 심사 시연 — **제품의 그 투어를 그대로 녹화합니다**
//
//   0111~0118 까지 만든 그 영상입니다. 단계 순서·문장·강조·덮개는 전부
//   제품의 TourOverlay 가 그리는 그대로이고, 여기 있는 것은 「누르는 손」뿐
//   입니다. 투어를 고치면 영상이 따라옵니다.
//
//   ⚠ 0119 에서 파일만 옮겼습니다 — **한 줄도 바꾸지 않았습니다.**
//     경영진용 영상(flows/evidence-guide.mjs)이 생기면서 엔진과 흐름을
//     나눴을 뿐입니다. 장면 시각과 증거 기록이 그대로인지 맞대어 확인했습니다.
// ─────────────────────────────────────────────────────────────────────────────

export const start = {
  url: '/presentation',
  ready: '[data-demo-tour] [data-tour-start]',
  settle: 300,
}

export async function flow(K) {
  const { page, H, C0, mark, scene, point, bring, advance, expect, checkSpot } = K

  mark('시작 화면 (심사 시연 안내)')
  await page.waitForTimeout(H.intro)

  //  투어 켜기 — 화면에 보이는 단추이므로 커서가 움직입니다.
  await point('[data-demo-tour] [data-tour-start]', { fast: true })
  await page.locator('[data-tour-title]:has-text("무엇이 비어 있는가")').waitFor({ state: 'attached', timeout: 15000 })
  await page.waitForTimeout(H.afterRoute)
  await expect(1, '①')
  await checkSpot('①')
  await scene('s1')

  //  ① → ②  (읽는 단계이므로 「다음」)
  await advance()
  await page.locator('[data-tour-title]:has-text("바로 업무로")').waitFor({ state: 'attached', timeout: 15000 })
  await page.waitForTimeout(H.afterRoute)
  await expect(2, '②')
  await checkSpot('②')
  await scene('s2')

  //  ② → ③  **실제 미션 단추**를 누릅니다 — 투어가 따라옵니다
  await point('[data-coach-go="collect-today"]')
  await page.locator('[data-collect-save]').waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(H.afterClick)
  await expect(3, '③')
  await checkSpot('③')

  //  거래처 · 차량 · 수거량 — **말하는 동안** 한 칸씩 채웁니다.
  //  ⚠ 채우는 칸이 화면에 보이도록 먼저 올려 둡니다 (bring 설명 참고).
  await scene('s3', {
    during: [
      async () => {
        await bring('[data-guide="guide-client"]', 'start')
        await page.locator('select').first().selectOption(C0)
      },
      async () => {
        //  수거량 칸을 화면 가운데로 — 숫자가 채워지는 것이 보여야 합니다.
        await bring('[data-guide="guide-amount"]', 'center')
        await page.locator('[data-actual-amount]').fill('70')
        await page.locator('select').nth(1).selectOption('v1')
      },
    ],
  })

  //  ③ → ④  저장. **흉내 서버가 받습니다 — 실제 저장이 아닙니다.**
  await point('[data-collect-save]')
  await page.locator('[data-tour="collect-done"]').waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(H.afterSave ?? H.afterClick)
  await expect(4, '④')
  await checkSpot('④')
  await scene('s4')

  //  ④ → ⑤
  await advance()
  await page.locator('[data-tour-title]:has-text("실제 기록을 확인")').waitFor({ state: 'attached', timeout: 15000 })
  await page.waitForTimeout(H.afterRoute)
  await expect(5, '⑤')
  await checkSpot('⑤')
  await scene('s5')

  //  마무리 — 투어가 성과 화면으로 넘겨 줍니다.
  //  ⚠ 강조가 옅어진 덕에 투어가 끝나도 화면이 확 밝아지지 않습니다 —
  //    덮개 자체가 9% 뿐이라 걷혀도 눈에 띄는 계단이 안 생깁니다.
  await advance()
  await page.waitForURL('**/performance', { timeout: 15000 })
  await page.waitForTimeout(H.afterRoute)
  //  ⚠ 0118-b — 마무리는 **말이 끝난 자리에서** 꼬리를 셉니다(엔진이 맡습니다).
  await scene('outro', { pad: 0 })
}
