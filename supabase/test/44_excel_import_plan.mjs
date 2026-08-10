// ─────────────────────────────────────────────────────────────────────────────
// 엑셀 가져오기 — 파일을 읽고 무엇을 넣을지 정하는 부분 (DB·브라우저 없이)
//
//  「202602_더원요양병원_거래처관리.xlsx」를 실제로 읽어서
//   · 거래처·계약·단가를 제대로 뽑아내는가
//   · 날짜가 있는 기록만 등록 대상으로 잡는가
//   · 날짜가 없는 달을 조용히 지어내지 않고 「확인 필요」로 빼 두는가
//   · 금액이 수량×단가와 다른 줄을 잡아내는가
//   · 이미 있는 기록과 겹칠 때 덮어쓰지 않고 「건너뜀/충돌」로 나누는가
//  를 확인합니다.
//
//  그리고 가장 중요한 것 — 엑셀에 적힌 합계와 시스템이 계산한 금액이
//  **원 단위까지 같은가**. 하나라도 다르면 옮긴 뒤에도 이사님은 엑셀을
//  다시 열어 맞춰 보시게 됩니다.
//
//  실행 (저장소 최상위에서)
//    node --experimental-strip-types supabase/test/44_excel_import_plan.mjs
//    (원본 파일 경로는 SAMPLE_XLSX 로 지정합니다)
//
//  · 원본 파일은 읽기만 합니다. 어떤 경우에도 고치지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, statSync } from 'node:fs'
import { readWorkbook } from '../../src/lib/xlsx.ts'
import { analyzeWorkbook, reconcile, planCounts } from '../../src/lib/excelImport.ts'
import { settlementFor, invoiceFor } from '../../src/lib/billing.ts'

const SAMPLE =
  process.env.SAMPLE_XLSX ||
  '/root/.claude/uploads/1c636c94-52d3-5813-b2a8-7537162d97f7/1a85e0e1-202602_____________.xlsx'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`
const eq = (got, want, label) =>
  Math.round(got) === Math.round(want)
    ? ok(label, won(want))
    : no(label, `시스템 ${won(got)} · 엑셀 ${won(want)} (차이 ${won(got - want)})`)

async function main() {
  console.log('\n════ 엑셀 가져오기 — 읽기·판정·금액 대조 ════')

  let stat
  try {
    stat = statSync(SAMPLE)
  } catch {
    no('원본 엑셀을 찾지 못했습니다', SAMPLE)
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    process.exit(1)
  }
  const before = { size: stat.size, mtime: stat.mtimeMs }

  const buf = readFileSync(SAMPLE)
  const sheets = await readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

  // ── 1. 파일을 열었는가 ──────────────────────────────────────────────────
  section('1. 엑셀을 그대로 읽어냈는가')
  check(sheets.length === 2, '시트 2장을 읽음', sheets.map((s) => s.name).join(' · '))
  const settle = sheets.find((s) => /정산/.test(s.name))
  const inv = sheets.find((s) => /명세서/.test(s.name))
  check(!!settle && !!inv, '정산 시트와 거래명세서 시트를 찾음')
  check(settle?.rows[1]?.[0] === '더원요양병원', '거래처 이름을 읽음', String(settle?.rows[1]?.[0]))
  check(settle?.rows[2]?.[3] === 950, '단가 칸을 읽음 (빈 칸에 밀리지 않음)', String(settle?.rows[2]?.[3]))
  check(inv?.rows[16]?.[0] === '2026-08-05', '날짜 칸을 날짜로 읽음 (숫자로 나오지 않음)', String(inv?.rows[16]?.[0]))

  const plan0 = analyzeWorkbook(sheets, '202602_더원요양병원_거래처관리.xlsx')

  // ── 2. 거래처 · 계약 · 단가 ─────────────────────────────────────────────
  section('2. 거래처 · 계약조건 · 단가')
  const c = plan0.client
  check(c?.name === '더원요양병원', '거래처명', c?.name ?? '없음')
  check(c?.contractStart === '2026-02-01', '계약 시작일', c?.contractStart ?? '없음')
  check(c?.contractEnd === '2028-04-30', '계약 종료일', c?.contractEnd ?? '없음')
  check(c?.paymentDueDay === 20, '결제일 (익월 20일)', String(c?.paymentDueDay))
  check(c?.pricing?.medical?.sale === 950, '의료폐기물 판매단가', String(c?.pricing?.medical?.sale))
  check(c?.pricing?.medical?.cost === 350, '의료폐기물 소각비 (음수를 양수로)', String(c?.pricing?.medical?.cost))
  check(c?.pricing?.diaper?.sale === 660, '기저귀 판매단가', String(c?.pricing?.diaper?.sale))
  check(c?.pricing?.diaper?.cost === 220, '기저귀 원가 (소각 200 + 부가세 20)', String(c?.pricing?.diaper?.cost))
  check(c?.pricing?.plastic20?.sale === 7000, '20L 합성수지 판매단가', String(c?.pricing?.plastic20?.sale))
  check(c?.pricing?.box63?.sale === null && c?.pricing?.box63?.cost === 1045,
    '63L 박스는 무상 공급 · 매입가 1,045원', String(c?.pricing?.box63?.cost))

  // ── 3. 날짜가 있는 것만 등록 대상 ───────────────────────────────────────
  section('3. 날짜가 있는 기록만 등록 대상으로 잡는가')
  const willImport = plan0.rows.filter((r) => r.status === '등록 예정')
  check(willImport.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)), '등록 대상은 모두 날짜가 있음')
  const cols = willImport.filter((r) => r.kind === '수거')
  const sups = willImport.filter((r) => r.kind === '자재')
  check(cols.length === 3, '수거 3건 (8/5 의료폐기물 · 8/2·8/5 기저귀)', `${cols.length}건`)
  check(sups.length === 1, '자재 공급 1건 (8/5 20L 합성수지)', `${sups.length}건`)

  const med = cols.find((r) => r.wasteType === '의료폐기물')
  check(med?.date === '2026-08-05' && med?.kg === 472, '의료폐기물 8/5 472kg', `${med?.date} ${med?.kg}kg`)
  const d1 = cols.find((r) => r.date === '2026-08-02')
  const d2 = cols.find((r) => r.date === '2026-08-05' && r.wasteType === '일회용기저귀')
  check(d1?.kg === 1000, '기저귀 8/2 1,000kg', `${d1?.kg}kg`)
  check(d2?.kg === 1270, '기저귀 8/5 1,270kg', `${d2?.kg}kg`)
  check(sups[0]?.items?.plastic20 === 50, '20L 합성수지 50개', String(sups[0]?.items?.plastic20))

  // ── 4. 날짜 없는 달을 지어내지 않는가 (가장 중요) ───────────────────────
  section('4. 날짜가 없는 달을 조용히 만들어 내지 않는가')
  const noDate = plan0.monthly.filter((m) => !m.hasDated)
  check(noDate.length === 6, '2~7월은 월 합계만 있어 등록 대상이 아님', `${noDate.length}개 달`)
  check(!plan0.rows.some((r) => noDate.some((m) => r.date.startsWith(m.month))),
    '그 달짜리 수거 기록을 하나도 만들지 않음')
  for (const m of ['2026-02', '2026-03', '2026-07']) {
    check(plan0.issues.some((i) => i.where.startsWith(m) && i.level === '확인 필요'),
      `${m} 은 「확인 필요」로 남김`)
  }
  check(plan0.issues.some((i) => /정산 상태/.test(i.what) && /미수금/.test(i.what)),
    '「미수금」 표시는 어느 달인지 몰라 청구로 만들지 않음')
  check(plan0.issues.some((i) => /제목은/.test(i.what)),
    '제목(2025년 8월)과 거래일자(2026-08)가 다른 것을 짚어 냄',
    plan0.issues.find((i) => /제목은/.test(i.what))?.what?.slice(0, 46) ?? '')

  // ── 5. 엑셀 합계와 시스템 계산이 같은가 (원 단위) ───────────────────────
  section('5. 엑셀에 적힌 금액과 시스템 계산이 같은가')
  //  가져온 것만으로 8월 정산을 계산해 봅니다 — 엑셀의 8월과 같아야 합니다.
  const clientId = 'test-client'
  const client = {
    id: clientId, name: c.name, type: '요양병원', address: '', manager: '', phone: '',
    collectionCycle: '', collectsMedicalWaste: true, collectsDiaper: true, storageSize: '보통',
    note: '', isDemoGenerated: false,
    contractStart: c.contractStart, contractEnd: c.contractEnd,
    paymentTerms: c.paymentTerms, paymentDueDay: c.paymentDueDay, pricing: c.pricing,
  }
  const data = {
    clients: [client], retiredClients: [], vehicles: [], schedules: [], materials: [],
    notes: [], payments: [], collectionEvents: [], clientRequests: [], salesLeads: [],
    officeStock: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
    requestOverrides: [], performanceBaseline: null, experimentSettings: null,
  }
  for (const r of willImport) {
    if (r.kind === '수거') {
      data.schedules.push({
        id: `s${data.schedules.length}`, date: r.date, clientId, wasteType: r.wasteType,
        vehicleId: '', scheduledTime: '', status: '완료', expectedAmount: 0,
        actualAmount: r.kg, completedAt: `${r.date}T09:00:00Z`, memo: '', origin: 'migrated',
      })
    } else {
      data.materials.push({
        id: `m${data.materials.length}`, date: r.date, clientId,
        boxCount: 0, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: false,
        memo: '', items: r.items, origin: 'migrated',
      })
    }
  }

  const aug = plan0.monthly.find((m) => m.month === '2026-08')
  const st = settlementFor(data, clientId, '2026-08')
  check(!!aug, '엑셀에 8월 합계가 있음')
  eq(st.revenue, aug.revenue, '8월 전체매출')
  eq(st.revenue, 2296600, '8월 전체매출이 엑셀 V11 과 같음')

  const invoice = invoiceFor(data, clientId, '2026-08')
  eq(invoice.total, 2296600, '거래명세서 합계금액 (엑셀 C14)')
  eq(invoice.medicalSubtotal, 798400, '의료폐기물 수집운반비용 합계 (엑셀 G37)')
  eq(invoice.diaperSubtotal, 1498200, '일회용기저귀 수집운반비용 합계 (엑셀 G48)')
  check(invoice.dueDate === '2026-09-20', '결제기한이 엑셀과 같음 (2026년 9월 20일)', invoice.dueDate)
  check(invoice.medicalKg === 472, '의료폐기물 수량', `${invoice.medicalKg}kg`)
  check(invoice.diaperKg === 2270, '기저귀 수량', `${invoice.diaperKg}kg`)

  // ── 6. 이미 있는 데이터와 겹칠 때 ───────────────────────────────────────
  section('6. 이미 있는 기록과 겹칠 때 덮어쓰지 않는가')
  const already = JSON.parse(JSON.stringify(data))
  const planSame = reconcile(plan0, already, clientId)
  const cSame = planCounts(planSame)
  check(cSame.willImport === 0, '똑같은 것을 다시 넣지 않음', `등록 예정 ${cSame.willImport}건`)
  check(cSame.skip === 4, '전부 「건너뜀」', `${cSame.skip}건`)

  const changed = JSON.parse(JSON.stringify(data))
  changed.schedules[0].actualAmount = 999
  const planDiff = reconcile(plan0, changed, clientId)
  const cDiff = planCounts(planDiff)
  check(cDiff.conflict === 1, '값이 다르면 「충돌」로 잡음', `${cDiff.conflict}건`)
  check(cDiff.willImport === 0 && cDiff.skip === 3, '충돌 건은 등록 대상에서 빠짐',
    `등록 ${cDiff.willImport} · 건너뜀 ${cDiff.skip}`)
  const conflictRow = planDiff.rows.find((r) => r.status === '충돌')
  check(/999/.test(conflictRow?.reason ?? ''), '무엇이 다른지 사람 말로 보여 줌', conflictRow?.reason ?? '')

  const planEmpty = reconcile(plan0, data0(), clientId)
  const cEmpty = planCounts(planEmpty)
  check(cEmpty.willImport === 4 && cEmpty.skip === 0 && cEmpty.conflict === 0,
    '빈 DB 에는 4건 모두 등록 예정',
    `등록 ${cEmpty.willImport} · 건너뜀 ${cEmpty.skip} · 충돌 ${cEmpty.conflict}`)
  check(cEmpty.error === 0, '오류 0건', `${cEmpty.error}건`)
  check(cEmpty.needsCheck > 0, '확인 필요는 숨기지 않고 셈', `${cEmpty.needsCheck}건`)

  // ── 7. 원본을 건드리지 않았는가 ─────────────────────────────────────────
  section('7. 원본 엑셀을 건드리지 않았는가')
  const after = statSync(SAMPLE)
  check(after.size === before.size && after.mtimeMs === before.mtime,
    '원본 파일이 그대로 (크기·수정시각 동일)', `${after.size} bytes`)

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`엑셀 가져오기 판정·대조: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

function data0() {
  return {
    clients: [], retiredClients: [], vehicles: [], schedules: [], materials: [],
    notes: [], payments: [], collectionEvents: [], clientRequests: [], salesLeads: [],
    officeStock: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
    requestOverrides: [], performanceBaseline: null, experimentSettings: null,
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
