//  ─────────────────────────────────────────────────────────────────────────
//  Playwright 연결부
//
//   ⚠ 검사들이 원래는 개발 작업공간의 절대 경로를 그대로 적고 있었습니다
//     (`/tmp/…/scratchpad/node_modules/playwright`, `/opt/pw-browsers/…`).
//     그 자리는 그 컨테이너에만 있습니다. 저장소로 옮기면서 그대로 두면
//     **다른 곳에서는 한 건도 못 돕니다.**
//
//   그래서 찾는 자리를 여기 한 곳에 모읍니다. 못 찾으면 조용히 넘어가지 않고
//   **무엇을 어떻게 넣어야 하는지 말하고 멈춥니다.**
// ─────────────────────────────────────────────────────────────────────────
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require_ = createRequire(import.meta.url)

/** playwright 를 어디서 찾을지 — 환경변수 → 저장소 → 시스템 순 */
async function load() {
  const hint = process.env.PW_MODULE
  const tries = [hint, 'playwright', 'playwright-core'].filter(Boolean)
  for (const t of tries) {
    try { return await import(t) } catch { /* 다음 자리를 봅니다 */ }
    try { return await import(require_.resolve(t)) } catch { /* 다음 자리 */ }
  }
  throw new Error(
    'playwright 를 못 찾았습니다.\n'
    + '  · npm i -D playwright  로 넣거나\n'
    + '  · PW_MODULE=/어딘가/node_modules/playwright/index.mjs 로 자리를 알려 주세요.')
}

/** 크로미움 실행 파일 — 환경변수 → PLAYWRIGHT_BROWSERS_PATH 아래 → 기본값 */
export function chromiumPath() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (root && existsSync(root)) {
    //  chromium-1194/chrome-linux/chrome 처럼 판 번호가 붙습니다 — 있는 것을 씁니다
    for (const d of readdirSync(root)) {
      if (!d.startsWith('chromium')) continue
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome']) {
        const f = join(root, d, rel)
        if (existsSync(f)) return f
      }
    }
    const flat = join(root, 'chromium')
    if (existsSync(flat)) return flat
  }
  //  자리를 못 찾으면 undefined 를 돌려줍니다 — playwright 가 제 것을 씁니다.
  return undefined
}

const pw = await load()
//  ⚠ playwright 는 CommonJS 로도 깔립니다(전역 설치가 특히 그렇습니다).
//    그때는 이름들이 `default` 안에 들어와 `pw.chromium` 이 **undefined** 가
//    됩니다. 그러면 검사들은 「playwright 를 찾았다」고 여긴 채 첫 줄에서
//    터지고, runner 에는 「검사 0」으로만 남습니다 — 원인이 안 보입니다.
const chromium_ = pw.chromium ?? pw.default?.chromium
if (!chromium_) {
  throw new Error('playwright 는 찾았는데 chromium 이 없습니다 — 설치가 깨졌을 수 있습니다.')
}
export const chromium = chromium_
/** 검사들이 그대로 쓰던 이름 */
export const EXEC = chromiumPath()
