import { readFileSync } from 'node:fs'

// ─────────────────────────────────────────────────────────────────────────────
// Pilot 동안 내려 둔 화면을 검사에서 어떻게 다룰 것인가 (0080)
//
//  대표님이 Pilot 동안 「병원 요청」과 「소모품 주문」을 화면에서 내리셨습니다
//  (`src/lib/pilotMode.ts`). 기능은 그대로 있고 **보이지만 않습니다.**
//
//  그래서 그 화면을 여는 옛 검사들이 한꺼번에 실패합니다. 이때
//
//   ✗ 검사를 지운다      → 다시 켤 때 아무도 그 기능을 안 봐 줍니다
//   ✗ 기대값을 바꿔 둔다 → 「안 보이는 게 맞다」가 영구화됩니다
//   ✓ **내려 둔 동안만 건너뛰고, 왜 건너뛰는지 적는다**
//
//  스위치를 `false` 로 되돌리면 이 검사들은 **저절로 다시 돕니다.**
//  「안 보이나」쪽은 `check_pilot80.mjs` 가 따로 못박아 두었습니다.
// ─────────────────────────────────────────────────────────────────────────────

const src = readFileSync(new URL('../../src/lib/pilotMode.ts', import.meta.url), 'utf-8')
const on = (key) => new RegExp(`${key}:\\s*true`).test(src)

/** 지금 무엇이 내려가 있는가 — 화면 코드와 **같은 파일**을 읽습니다 */
export const PILOT = {
  requests: on('clientRequests'),
  supplies: on('supplies'),
}

/**
 * 내려가 있으면 이 자리를 건너뜁니다.
 *
 *  @returns 건너뛰었으면 true — 호출한 쪽에서 `return` 하거나 블록을 건너뜁니다.
 */
export function skipIfHidden(what, why) {
  const hidden = what === 'supplies' ? PILOT.supplies : PILOT.requests
  if (!hidden) return false
  const label = what === 'supplies' ? '소모품 주문' : '병원 요청'
  console.log(`SKIP | ${why} — Pilot 동안 「${label}」을 화면에서 내려 두었습니다 (src/lib/pilotMode.ts). 다시 켜면 이 검사도 같이 돌아옵니다.`)
  return true
}
