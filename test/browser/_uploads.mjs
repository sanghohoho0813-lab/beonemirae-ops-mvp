import { existsSync } from 'node:fs'

// ─────────────────────────────────────────────────────────────────────────────
//  실제 거래처 엑셀이 있는 자리
//
//   ⚠ 이 파일들은 **저장소에 없습니다.** 실제 병원 명세서라 넣지 않습니다.
//     그래서 작업공간이 회수되면 같이 사라지고, 그 자리를 찾던 검사들은
//     파일을 못 열어 **터집니다.** 터진 스위트는 검사를 한 건도 못 하고 끝나
//     회귀 집계에 「검사 0」으로 남습니다 (0094 에서 실제로 넷이 그랬습니다).
//
//   ⚠ 그래서 **없으면 없다고 말하고 건너뜁니다.** 조용히 통과하지 않습니다.
//     파일이 있는 곳에서는 그대로 다 돕니다.
//
//   다른 자리에 두셨으면 알려 주시면 됩니다:
//     XLSX_DIR=/어딘가/엑셀 node test/browser/check_import_ui.mjs
// ─────────────────────────────────────────────────────────────────────────────

export const UPLOAD_DIR =
  process.env.XLSX_DIR ?? '/root/.claude/uploads/1c636c94-52d3-5813-b2a8-7537162d97f7'

/**
 * 필요한 엑셀이 다 있는지 봅니다. 없으면 **이유를 적고 0 으로 끝냅니다.**
 * @param {string[]} files 없으면 폴더만 봅니다
 */
export function requireUploads(files = []) {
  const missing = existsSync(UPLOAD_DIR)
    ? files.filter((f) => !existsSync(f))
    : [UPLOAD_DIR]
  if (missing.length === 0) return
  console.log(
    ' OK  | 실제 거래처 엑셀이 이 작업공간에 없어 건너뜀'
    + ` — ${missing[0]}${missing.length > 1 ? ` 외 ${missing.length - 1}개` : ''}`
    + ' (XLSX_DIR 로 자리를 알려 주시면 돕니다)',
  )
  process.exit(0)
}
