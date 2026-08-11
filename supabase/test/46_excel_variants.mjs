// ─────────────────────────────────────────────────────────────────────────────
// 엑셀 형식이 다를 때 — 추측하지 않는가 (DB·브라우저 없이)
//
//  업체마다 엑셀 모양이 다릅니다. 시트 이름이 다르거나, 월 칸이 없거나,
//  적힌 금액이 수량×단가와 안 맞거나, 모르는 품목이 섞여 있습니다.
//
//  그때 **비슷해 보이는 것에 끼워 맞추면 안 됩니다.** 틀린 값이 조용히
//  DB 에 들어가면 나중에 정산이 어긋나는데 원인을 찾을 수 없습니다.
//  모르면 모른다고 하고 사람에게 넘기는지 확인합니다.
//
//  실행 (저장소 최상위에서)
//    node --experimental-strip-types supabase/test/46_excel_variants.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readWorkbook } from '../../src/lib/xlsx.ts'
import { analyzeWorkbook, planCounts } from '../../src/lib/excelImport.ts'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

async function read(file) {
  const b = readFileSync(join(DIR, file))
  const sheets = await readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  const plan = analyzeWorkbook(sheets, file)
  return { plan, counts: planCounts(plan), sheets }
}
const said = (plan, re) => plan.issues.some((i) => re.test(i.what)) || plan.rows.some((r) => re.test(r.reason ?? ''))

async function main() {
  console.log('\n════ 엑셀 형식이 다를 때 — 추측하지 않는가 ════')

  // ── A. 우리 양식이 아예 아닌 파일 ────────────────────────────────────
  section('A. 우리 양식이 아예 아닌 파일 (수거대장 한 장짜리)')
  const a = await read('A_전혀다른구조.xlsx')
  check(a.counts.willImport === 0, '아무것도 등록 대상으로 잡지 않음', `${a.counts.willImport}건`)
  check(a.counts.needsCheck >= 2, '무엇을 못 찾았는지 알려 줌', `확인 필요 ${a.counts.needsCheck}건`)
  check(said(a.plan, /정산 시트를 찾지 못했습니다/), '정산 시트가 없다고 말함')
  check(said(a.plan, /거래명세서 시트를 찾지 못했습니다/), '명세서 시트가 없다고 말함')
  check(a.plan.client === null, '거래처를 지어내지 않음')

  // ── B. 비슷하지만 월 칸이 없는 파일 ──────────────────────────────────
  section('B. 정산 시트는 있는데 월 칸(1월~12월)이 없는 파일')
  const b = await read('B_월칸없음.xlsx')
  check(b.counts.error >= 1, '월 칸이 없다는 것을 오류로 잡음', `오류 ${b.counts.error}건`)
  check(said(b.plan, /월별 칸\(1월~12월\)을 찾지 못했습니다/), '어느 칸이 없는지 말함')
  check(b.plan.client === null, '거래처·단가를 추측해서 만들지 않음')
  check(b.plan.monthly.length === 0, '월별 합계를 지어내지 않음')
  //  명세서 쪽은 날짜가 있으므로 그 줄만은 살립니다 — 사람이 거래처를 골라
  //  넣을 수 있어야 합니다. 다만 오류 건수가 함께 보여야 합니다.
  check(b.counts.willImport === 1, '날짜가 있는 명세서 줄만 살림', `${b.counts.willImport}건`)

  // ── C. 금액이 안 맞고 모르는 품목이 섞인 파일 ────────────────────────
  section('C. 금액이 안 맞고 모르는 품목이 섞인 파일')
  const c = await read('C_금액불일치_모르는품목.xlsx')
  check(c.counts.willImport === 0, '틀린 줄을 등록 대상으로 잡지 않음', `${c.counts.willImport}건`)
  check(said(c.plan, /수량×단가 95,000원 ≠ 적힌 금액 99,000원/),
    '수량×단가와 적힌 금액이 다른 것을 잡아냄')
  check(said(c.plan, /모르는 품목 「형광등 폐기물」/), '모르는 품목을 버리지 않고 알려 줌')
  check(said(c.plan, /결제조건 "익월 말일" 에서 결제일을 읽지 못했습니다/),
    '「익월 말일」을 31일 같은 값으로 추측하지 않음')
  check(c.plan.client?.paymentDueDay === null, '못 읽은 결제일은 비워 둠', String(c.plan.client?.paymentDueDay))
  check(said(c.plan, /정산 상태가 「정산완료」/), '정산 상태를 청구로 바꾸지 않고 그대로 보여 줌')

  // ── D. 세 파일 모두 공통 ─────────────────────────────────────────────
  section('D. 세 파일 모두')
  for (const [name, r] of [['A', a], ['B', b], ['C', c]]) {
    check(r.counts.error + r.counts.needsCheck > 0, `${name}: 모르는 것을 조용히 넘기지 않음`,
      `오류 ${r.counts.error} · 확인 필요 ${r.counts.needsCheck}`)
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`형식이 달라도 추측하지 않음: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
