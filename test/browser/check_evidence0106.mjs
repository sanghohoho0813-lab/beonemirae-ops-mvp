import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
//  0106 — 성과 계산의 경계 사례 (브라우저 없이 계산층만)
//
//   취소 · 시연 · 연습(실증 전) · 빈 값 · 기간 경계 · 부분 사용 · 표본 부족 ·
//   업무 범위 불일치 · 차량/거점 변화 · 추천 이력 없음 · 전화 접수 없음.
//
//   ⚠ 기대값은 **규칙에서** 나옵니다. 시스템이 내는 값에 맞추지 않았습니다.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = '/home/user/beonemirae-ops-mvp'
let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}

const dir = mkdtempSync(join(tmpdir(), 'ev-'))
const entry = join(dir, 'entry.ts')
writeFileSync(entry, `
export * as E from '${ROOT}/src/lib/evidenceBase.ts'
export * as P from '${ROOT}/src/lib/performance.ts'
export * as A from '${ROOT}/src/lib/axEvidence.ts'
export * as R from '${ROOT}/src/lib/readiness.ts'
export * as C from '${ROOT}/src/lib/opsChanges.ts'
export * as X from '${ROOT}/src/lib/excelCheck.ts'
export * as S from '${ROOT}/src/lib/perfSummary.ts'
export * as T from '${ROOT}/src/lib/trials.ts'
`)
const bundle = join(dir, 'ev.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  entry, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { stdio: 'pipe' })
const { E, P, A, R, C, X, S, T } = await import(bundle)

//  오늘 기준으로 날짜를 만듭니다 — 「실증 전체」가 오늘까지라서.
const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d) }
const TODAY = daysAgo(0)
const START = daysAgo(40)

const ev = (i, over = {}) => ({
  id: `e${i}`, at: `${daysAgo(over.ago ?? 1)}T03:00:00`, role: '현장 담당자', screen: '수거 입력', action: '수거 완료',
  scheduleId: `s${i}`, createdSchedule: false, clientId: over.clientId ?? 'c1', clientName: '병원', wasteType: '의료폐기물',
  amountKg: 50, before: { status: '예정', actualAmount: null, handoverStatus: null }, materialIds: [], stockBefore: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  requestUpdates: [], note: '', reverted: false, revertedAt: null, demoSessionId: null, inputDurationMs: 90000, ...over,
})
const sched = (i, over = {}) => ({
  id: `s${i}`, date: daysAgo(over.ago ?? 1), clientId: over.clientId ?? 'c1', wasteType: '의료폐기물', vehicleId: over.vehicleId ?? 'v1',
  scheduledTime: '09:00', status: '완료', expectedAmount: 50, actualAmount: over.actualAmount === undefined ? 50 : over.actualAmount,
  completedAt: over.completedAt === undefined ? `${daysAgo(over.ago ?? 1)}T03:00:00Z` : over.completedAt, memo: '', origin: over.origin ?? 'field',
  driverName: over.driverName ?? '김기사', ...over,
})
const base = (over = {}) => ({
  clients: [{ id: 'c1', name: '가나요양병원', isDemoGenerated: false }, { id: 'c2', name: '다래의원', isDemoGenerated: false }],
  vehicles: [{ id: 'v1', name: '1호차', wasteType: '의료폐기물', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 700, driver: '김기사' }],
  vehicleReservations: [], schedules: [], materials: [], payments: [], officeStock: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  events: [], requestOverrides: [], notes: [], leads: [], requests: [], inquiries: [], productOrders: [], receipts: [], operatingCosts: [],
  baseline: { adminMinutesPerCollection: 3.4, repeatEntriesPerCollection: 4, monthlyDocHours: 91, monthlyReworkCount: 4, dailyCapacity: 18.8, source: 'survey', updatedAt: null },
  experiment: { startDate: START }, ...over,
})

console.log('── ① 취소만 30건: 준비 상태와 성과가 같은 답을 낸다 ──')
{
  const events = Array.from({ length: 30 }, (_, i) => ev(i, { reverted: true, revertedAt: `${TODAY}T05:00:00Z` }))
  const d = base({ events })
  const s = E.evidenceSample(d)
  ok('① 취소 기록은 field 0건', s.field.length === 0, String(s.field.length))
  ok('① 취소 기록 30건은 reverted 로 분류', s.reverted.length === 30, String(s.reverted.length))
  const perf = P.performanceSummary(d, 'all')
  const ready = R.readinessOf(d).find((i) => i.key === 'fieldSamples')
  ok('① 성과: 현장 0건', perf.fieldCount === 0, String(perf.fieldCount))
  ok('① 준비 상태: 「비어 있음」 — 「준비됨」이 아니다', ready.state === 'missing', ready.state)
  ok('① 준비 상태 값 줄이 현장 0건을 말한다', /현장 0건/.test(ready.value), ready.value)
  ok('① 취소 후 재입력 지표는 측정값만(비교 기준 없음)', perf.metrics.find((m) => m.key === 'rework').status === 'no-comparable',
    perf.metrics.find((m) => m.key === 'rework').status)
  ok('① 취소 후 재입력 30건이 그대로 적힌다', perf.revertedCount === 30 && perf.metrics.find((m) => m.key === 'rework').after === 30)
}

console.log('── ② 시연만 · 연습(실증 전)만 · 표식 없는 원본 ──')
{
  const demo = Array.from({ length: 12 }, (_, i) => ev(i, { demoSessionId: 'demo' }))
  const practice = Array.from({ length: 5 }, (_, i) => ev(100 + i, { ago: 45 }))
  const d = base({ events: [...demo, ...practice] })
  const s = E.evidenceSample(d)
  ok('② 시연 12건은 demo', s.demo.length === 12, String(s.demo.length))
  ok('② 실증 시작 전 5건은 practice — 현장으로 세지 않는다', s.practice.length === 5 && s.field.length === 0, `${s.practice.length}/${s.field.length}`)
  const perf = P.performanceSummary(d, 'all')
  ok('② 성과 화면도 연습 5건을 제외한다', perf.practiceCount === 5 && perf.fieldCount === 0)
  ok('② 시연만 있으면 출처는 demo', P.provenanceOf(d).kind === 'demo', P.provenanceOf(d).kind)
  const d2 = base({ events: practice, experiment: { startDate: null } })
  const s2 = E.evidenceSample(d2)
  ok('② 실증 시작일이 없으면 연습을 가르지 못한다고 말한다 (startUnset)', s2.breadth.startUnset === true && s2.field.length === 5)
  //  출처(origin)가 없는 완료 일정은 현장으로 세되, 그 사실을 센다
  const d3 = base({ events: [ev(1)], schedules: [sched(1, { origin: undefined })] })
  ok('② origin 미표기 일정은 세되 originUnknown 으로 적는다', E.evidenceSample(d3).breadth.originUnknown === 1)
  //  이관(migrated) 일정은 커버리지 분모에서 뺀다
  const d4 = base({ events: [ev(1)], schedules: [sched(1), sched(2, { origin: 'migrated' }), sched(3, { origin: 'demo' })] })
  ok('② 이관·시연 일정은 커버리지 분모에서 뺀다 (done 1)', E.evidenceSample(d4).breadth.coverage.done === 1, JSON.stringify(E.evidenceSample(d4).breadth.coverage))
}

console.log('── ③ 하루에 한 사람이 넣은 30건은 대표 성과값이 아니다 ──')
{
  const events = Array.from({ length: 32 }, (_, i) => ev(i, { ago: 1 }))
  const schedules = events.map((_, i) => sched(i, { ago: 1 }))
  const d = base({ events, schedules })
  const perf = P.performanceSummary(d, 'all')
  ok('③ 건수 단계는 field(30건 이상)', perf.tier === 'field', perf.tier)
  ok('③ 그러나 폭이 모자라 breadthOk=false', perf.breadthOk === false)
  ok('③ 모자란 것에 「입력한 날 1/14일」이 있다', perf.breadthGaps.some((g) => /입력한 날 1\/14일/.test(g)), perf.breadthGaps.join(' · '))
  ok('③ 모자란 것에 「병원 1/5곳」이 있다', perf.breadthGaps.some((g) => /병원 1\/5곳/.test(g)))
  ok('③ 기사 1/2명', perf.breadthGaps.some((g) => /기사 1\/2명/.test(g)))
  ok('③ 강조(emphasis) 지표가 하나도 없다', perf.emphasized === 0, String(perf.emphasized))
  const ready = R.readinessOf(d).find((i) => i.key === 'fieldSamples')
  ok('③ 준비 상태도 「채우는 중」(partial) — 30건만으로 준비됨이 되지 않는다', ready.state === 'partial', ready.state)
  ok('③ 준비 상태 값 줄에 커버리지 100% 가 적힌다', /입력 커버리지 100%/.test(ready.value), ready.value)
}

console.log('── ④ 폭을 넘으면 내부 기준 충족 · 하루 처리 건수는 커버리지가 넘을 때만 ──')
{
  //  16일 × 2건, 병원 5곳 순환, 기사 2명, 완료 일정 전부 이벤트 있음
  const events = []
  const schedules = []
  let n = 0
  for (let day = 1; day <= 16; day += 1) {
    for (let k = 0; k < 2; k += 1) {
      const clientId = `c${(n % 5) + 1}`
      events.push(ev(n, { ago: day, clientId }))
      schedules.push(sched(n, { ago: day, clientId, driverName: k === 0 ? '김기사' : '이기사' }))
      n += 1
    }
  }
  const clients = [1, 2, 3, 4, 5].map((i) => ({ id: `c${i}`, name: `병원${i}`, isDemoGenerated: false }))
  const d = base({ events, schedules, clients })
  const perf = P.performanceSummary(d, 'all')
  ok('④ breadthOk=true (32건 · 16일 · 병원 5 · 기사 2 · 커버리지 100%)', perf.breadthOk === true, perf.breadthGaps.join(' · '))
  const daily = perf.metrics.find((m) => m.key === 'dailyCount')
  ok('④ 하루 처리 건수 = 2.0 (32건 ÷ 16일)', daily.after === 2, String(daily.after))
  ok('④ 도입 전 18.8 과 견줘 status ok', daily.status === 'ok', daily.status)
  ok('④ 나빠진 값도 그대로 (changePct 음수)', daily.changePct < 0, String(daily.changePct))
  ok('④ 강조된다 (emphasis) — 시연 없음 · 폭 충족 · 복합 개선 아님', daily.emphasis === true)
  //  커버리지가 낮으면 (완료 일정 중 절반만 시스템 입력) 하루 처리 건수를 내지 않는다
  const extra = Array.from({ length: 40 }, (_, i) => sched(500 + i, { ago: (i % 16) + 1 }))
  const perf2 = P.performanceSummary(base({ events, schedules: [...schedules, ...extra], clients }), 'all')
  const daily2 = perf2.metrics.find((m) => m.key === 'dailyCount')
  ok('④ 커버리지 44% 이면 하루 처리 건수는 measuring', daily2.status === 'measuring' && daily2.after == null, `${daily2.status} · ${perf2.breadth.coverage.pct}%`)
}

console.log('── ⑤ 업무 범위 불일치: 입력 소요시간은 측정값만 · 사무시간은 같은 범위 조사가 있어야 ──')
{
  const events = Array.from({ length: 5 }, (_, i) => ev(i, { ago: i + 1, inputDurationMs: 120000 }))
  const d = base({ events })
  const perf = P.performanceSummary(d, 'all')
  const it = perf.metrics.find((m) => m.key === 'inputTime')
  ok('⑤ 입력 소요시간 2.0분 측정', it.after === 2, String(it.after))
  ok('⑤ 입력 소요시간은 no-comparable (개선율 없음)', it.status === 'no-comparable' && it.changePct == null, it.status)
  ok('⑤ 입력 소요시간의 도입 전 출처는 none', it.beforeSource === 'none')
  const ad = perf.metrics.find((m) => m.key === 'adminTime')
  ok('⑤ 사무시간은 도입 후 같은 범위 조사가 없어 measuring', ad.status === 'measuring' && ad.after == null, ad.status)
  ok('⑤ 사무시간 도입 전 출처는 survey', ad.beforeSource === 'survey', ad.beforeSource)
  const perf2 = P.performanceSummary(d, 'all', undefined, { afterSurvey: { adminMinutesPerCollection: 1.7, monthlyDocHours: 40, surveyedOn: TODAY, source: 'survey', note: '' } })
  const ad2 = perf2.metrics.find((m) => m.key === 'adminTime')
  ok('⑤ 같은 범위 조사값이 들어오면 3.4 → 1.7 = 50% 단축', ad2.status === 'ok' && ad2.changePct === 50, `${ad2.status} ${ad2.changePct}`)
  ok('⑤ 그래도 폭이 모자라 강조하지 않는다', ad2.emphasis === false)
  const doc2 = perf2.metrics.find((m) => m.key === 'docHours')
  ok('⑤ 문서 시간도 91 → 40 = 56% 단축', doc2.status === 'ok' && doc2.changePct === 56, `${doc2.status} ${doc2.changePct}`)
  //  추정(estimate) 출처면 지표 출처도 estimate
  const d3 = base({ events, baseline: { ...d.baseline, source: 'user' } })
  ok('⑤ 직접 입력 기준값은 출처 estimate', P.performanceSummary(d3, 'all').metrics.find((m) => m.key === 'adminTime').beforeSource === 'estimate')
}

console.log('── ⑥ 반복 입력: 시스템 1회는 구조값 · 엑셀 확인 응답이 5일 이상일 때만 ──')
{
  const events = Array.from({ length: 10 }, (_, i) => ev(i, { ago: i + 1 }))
  const d = base({ events })
  const none = P.performanceSummary(d, 'all', undefined, { excelChecks: [] })
  const rp = none.metrics.find((m) => m.key === 'repeatEntry')
  ok('⑥ 응답이 없으면 after=null · measuring (1회로 확정하지 않는다)', rp.after == null && rp.status === 'measuring', `${rp.after} ${rp.status}`)
  ok('⑥ 미확인이라고 적는다', /확인되지 않았습니다/.test(rp.note), rp.note)
  const rows = [
    { id: 'r1', topics: ['엑셀 병행 확인'], message: `excel:${daysAgo(1)}=0`, requesterName: '이사', createdAt: '' },
    { id: 'r2', topics: ['엑셀 병행 확인'], message: `excel:${daysAgo(2)}=2 › 거래처 단가, 자재 규격`, requesterName: '이사', createdAt: '' },
    { id: 'r3', topics: ['엑셀 병행 확인'], message: `excel:${daysAgo(3)}=0`, requesterName: '이사', createdAt: '' },
    { id: 'r4', topics: ['엑셀 병행 확인'], message: `excel:${daysAgo(4)}=1 › 자재 규격`, requesterName: '이사', createdAt: '' },
    { id: 'r5', topics: ['사용 후기'], message: '그냥 후기', requesterName: '이사', createdAt: '' },
  ]
  const checks = X.parseExcelChecks(rows)
  ok('⑥ 형식이 맞는 4줄만 읽는다', checks.length === 4, String(checks.length))
  const four = P.performanceSummary(d, 'all', undefined, { excelChecks: checks })
  const rp4 = four.metrics.find((m) => m.key === 'repeatEntry')
  ok('⑥ 응답 4일이면 아직 measuring (5일 이상부터)', rp4.status === 'measuring' && /5일 이상/.test(rp4.note), rp4.note)
  const five = [...checks, X.parseExcelCheck({ id: 'r6', topics: ['엑셀 병행 확인'], message: `excel:${daysAgo(5)}=0`, requesterName: '이사', createdAt: '' })]
  const s5 = P.performanceSummary(d, 'all', undefined, { excelChecks: five })
  const rp5 = s5.metrics.find((m) => m.key === 'repeatEntry')
  ok('⑥ 응답 5일: after = 1 + 3건 ÷ 10건 = 1.3', rp5.after === 1.3, String(rp5.after))
  ok('⑥ 도입 전 4회 → 1.3회 = 67.5% 단축', rp5.status === 'ok' && rp5.changePct === 67.5, `${rp5.status} ${rp5.changePct}`)
  ok('⑥ 이유가 많이 나온 순으로 적힌다 (자재 규격 2회)', s5.excel.reasons[0].text === '자재 규격' && s5.excel.reasons[0].count === 2, JSON.stringify(s5.excel.reasons))
  ok('⑥ 형식 만들기/읽기가 서로 맞는다', X.parseExcelCheck({ id: 'z', topics: ['엑셀 병행 확인'], message: X.formatExcelCheck('2026-09-08', 2, '단가, 규격'), requesterName: '', createdAt: '' }).items === '단가, 규격')
}

console.log('── ⑦ 운영 변화가 겹치면 복합 개선 · 기록이 없으면 「모름」 ──')
{
  const events = Array.from({ length: 5 }, (_, i) => ev(i, { ago: i + 1 }))
  const d = base({ events })
  const unknown = P.performanceSummary(d, 'all')
  ok('⑦ 표가 없으면 known=false (변화 없음이 아니다)', unknown.confounding.known === false && /기록이 없습니다/.test(unknown.confounding.note))
  const none = P.performanceSummary(d, 'all', undefined, { changes: [] })
  ok('⑦ 기록해 봤는데 없으면 known=true · 겹침 0', none.confounding.known === true && none.confounding.overlapping.length === 0)
  const planned = [{ id: 'x1', kind: 'vehicle', title: '3.5톤 추가', status: 'planned', effectiveOn: daysAgo(3), note: '', createdAt: '', createdByName: '' }]
  ok('⑦ 계획(planned)은 겹침으로 치지 않는다', C.confoundingIn(planned, START, TODAY).overlapping.length === 0)
  const applied = [{ ...planned[0], status: 'applied' }]
  const cf = C.confoundingIn(applied, START, TODAY)
  ok('⑦ 적용된 차량 변화가 구간에 있으면 복합 개선', cf.overlapping.length === 1 && /AX 단독 효과 분리 불가/.test(cf.note), cf.note)
  ok('⑦ AX 시작·기능 적용은 복합 개선 종류가 아니다', C.confoundingIn([{ ...applied[0], kind: 'ax_start' }], START, TODAY).overlapping.length === 0)
  ok('⑦ 구간 밖 변화는 겹치지 않는다', C.confoundingIn([{ ...applied[0], effectiveOn: daysAgo(60) }], START, TODAY).overlapping.length === 0)
  const withAfter = P.performanceSummary(d, 'all', undefined, {
    changes: applied,
    afterSurvey: { adminMinutesPerCollection: 1.7, monthlyDocHours: null, surveyedOn: TODAY, source: 'survey', note: '' },
  })
  const ad = withAfter.metrics.find((m) => m.key === 'adminTime')
  ok('⑦ 개선율은 나오되 confounded=true · 강조 안 함', ad.status === 'ok' && ad.confounded === true && ad.emphasis === false)
  const it = withAfter.metrics.find((m) => m.key === 'inputTime')
  ok('⑦ 비교가 아닌 지표(측정값만)에는 복합 개선 표시가 붙지 않는다', it.confounded === false)
  //  axCompare 도 같은 판정을 씁니다
  const cmp = A.axCompare(d, START, TODAY, applied)
  ok('⑦ 도입 전→현재 표도 복합 개선을 말한다', cmp.confounding.overlapping.length === 1)
}

console.log('── ⑧ 고객 AX: 전화 접수가 0건이면 포털 비율을 내지 않는다 · 여러 주 · 접수→처리 ──')
{
  const P1 = { from: daysAgo(30), to: TODAY }
  const reqs = (rows) => rows.map((r, i) => ({ id: `q${i}`, clientId: r.c ?? 'c1', clientName: '병원', kind: '추가수거', content: '', status: '접수', source: r.s, requesterName: '', reply: '', handledBy: null, handledAt: r.h ?? null, createdAt: `${daysAgo(r.ago)}T01:00:00Z` }))
  const onlyPortal = base({ requests: reqs([{ s: 'portal', ago: 1 }, { s: 'portal', ago: 2 }]) })
  const c1 = A.customerAx(onlyPortal, P1)
  const share = c1.numbers.find((n) => n.key === 'portalShare')
  ok('⑧ 직원 접수 0건 → 포털 비율 null · not-countable', share.value == null && share.state === 'not-countable', `${share.value} ${share.state}`)
  ok('⑧ 이유가 적혀 있다 (나머지를 안 적은 것)', /안 적은 것/.test(share.basis), share.basis)
  const mixed = base({ requests: reqs([{ s: 'portal', ago: 1 }, { s: 'portal', ago: 9 }, { s: 'staff', ago: 3 }]) })
  const c2 = A.customerAx(mixed, P1)
  ok('⑧ 직원 접수가 있으면 2/3 = 66.7%', c2.numbers.find((n) => n.key === 'portalShare').value === 66.7)
  ok('⑧ 같은 병원이 8일 차이로 두 번 → 2주 이상에 걸쳐 쓴 병원 1곳', c2.numbers.find((n) => n.key === 'multiWeekPortalClients').value === 1)
  const sameDay = base({ requests: reqs([{ s: 'portal', ago: 1 }, { s: 'portal', ago: 1 }, { s: 'staff', ago: 3 }]) })
  const c3 = A.customerAx(sameDay, P1)
  ok('⑧ 같은 날 두 번은 2주 이상이 아니다 (0곳) · 두 번 이상 쓴 병원은 1곳', c3.numbers.find((n) => n.key === 'multiWeekPortalClients').value === 0 && c3.numbers.find((n) => n.key === 'repeatPortalClients').value === 1)
  const handled = base({ requests: reqs([{ s: 'portal', ago: 2, h: `${daysAgo(1)}T01:00:00Z` }, { s: 'staff', ago: 5, h: `${daysAgo(5)}T13:00:00Z` }]) })
  const rh = A.customerAx(handled, P1).numbers.find((n) => n.key === 'responseHours')
  ok('⑧ 접수→처리 중앙값 = (24h, 12h) → 18.0시간', rh.value === 18, String(rh.value))
  ok('⑧ 첫 응답·완료 칸이 없다고 적는다', /첫 응답과 완료를 따로 적는 칸은 없습니다/.test(rh.basis))
}

console.log('── ⑨ 추천: 노출 기록이 없으면 「일치」만 · 있으면 노출 뒤 주문만 채택 ──')
{
  const P1 = { from: daysAgo(30), to: TODAY }
  const materials = [1, 2, 3].map((i) => ({ id: `m${i}`, date: daysAgo(10 * i), clientId: 'c1', boxCount: 10, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: false, memo: '', items: null }))
  const order = (id, ago, stockKey = 'corrugated_box') => ({ id, clientId: 'c1', status: '전달완료', requesterName: '', source: 'portal', note: '', deliverScheduleId: null, deliverOn: null, requestedAt: `${daysAgo(ago)}T02:00:00Z`, confirmedAt: null, deliveredAt: `${daysAgo(ago)}T05:00:00Z`, canceledAt: null, cancelReason: '', items: [{ productId: 'p1', name: '골판지', spec: '', unit: '개', qty: 5, unitPrice: 1000, unitCost: 600, stockKey }] })
  const noViews = base({ materials, productOrders: [order('o1', 2)], products: [{ id: 'p1', name: '골판지', spec: '', unit: '개', salePrice: 1000, stockKey: 'corrugated_box', active: true, available: true }] })
  const s1 = A.salesAx(noViews, P1)
  const shown = s1.numbers.find((n) => n.key === 'recoShown')
  ok('⑨ 노출 표가 없으면 not-countable (0 이 아니다)', shown.value == null && shown.state === 'not-countable', `${shown.value} ${shown.state}`)
  ok('⑨ 일치 지표 이름이 「추천 규칙의 일치」이다', /일치/.test(s1.numbers.find((n) => n.key === 'needHit').label))
  ok('⑨ 일치 근거에 「봤다는 증거가 아닙니다」', /증거가 아닙니다/.test(s1.numbers.find((n) => n.key === 'needHit').basis))
  const views = [
    { id: 'v1', clientId: 'c1', shownOn: daysAgo(3), shownAt: `${daysAgo(3)}T01:00:00Z`, viewerRole: 'client', items: [{ key: 'corrugated_box', label: '골판지', suggestQty: 5 }], ruleVersion: 'needs-2026.09-90d-min2', action: 'shown', orderId: null },
  ]
  const withViews = base({ ...noViews, recommendationViews: views })
  const s2 = A.salesAx(withViews, P1)
  ok('⑨ 노출 1쌍 · 노출(3일 전) 뒤 주문(2일 전) → 채택 1', s2.numbers.find((n) => n.key === 'recoShown').value === 1 && s2.numbers.find((n) => n.key === 'recoAdopted').value === 1)
  ok('⑨ 채택률 100%', s2.numbers.find((n) => n.key === 'recoAdoptRate').value === 100)
  const before = base({ ...noViews, productOrders: [order('o2', 5)], recommendationViews: views })
  ok('⑨ 노출 전 주문은 채택이 아니다 (0)', A.salesAx(before, P1).numbers.find((n) => n.key === 'recoAdopted').value === 0)
  const emptyViews = base({ ...noViews, recommendationViews: [] })
  const s3 = A.salesAx(emptyViews, P1)
  ok('⑨ 표는 있는데 노출이 없으면 0 · none', s3.numbers.find((n) => n.key === 'recoShown').value === 0 && s3.numbers.find((n) => n.key === 'recoShown').state === 'none')
  ok('⑨ 매출·청구·입금이 다른 키로 나뉜다', ['revenue', 'billedRevenue', 'paidRevenue', 'profit'].every((k) => s2.numbers.some((n) => n.key === k)))
}

console.log('── ⑩ 확장 AX: 운행일당 수거량 · 방문당 운영비(운영비 있는 달만) · 계기판·대기 ──')
{
  const P1 = { from: daysAgo(40), to: TODAY }
  const schedules = [
    sched(1, { ago: 1, actualAmount: 100 }), sched(2, { ago: 1, actualAmount: 200 }),
    sched(3, { ago: 2, actualAmount: null }), sched(4, { ago: 2, actualAmount: 100, vehicleId: 'v2' }),
  ]
  const month = TODAY.slice(0, 7)
  const d = base({ schedules, operatingCosts: [{ id: 'oc', month, category: '유류비', amount: 400000, memo: '', actorName: '', updatedAt: '' }] })
  const cap = A.capacityAx(d, P1)
  const kg = cap.numbers.find((n) => n.key === 'kgPerVehicleDay')
  //  운행일: v1×어제, v1×그제, v2×그제 = 3 · kg 400 (빈 값은 더하지 않음) → 133
  ok('⑩ 운행일당 수거량 = 400 ÷ 3 = 133kg', kg.value === 133, String(kg.value))
  const visitsThisMonth = schedules.filter((s) => s.date.slice(0, 7) === month).length
  const cpv = cap.numbers.find((n) => n.key === 'costPerVisit')
  ok('⑩ 방문당 운영비 = 400,000 ÷ 이번 달 방문 수', visitsThisMonth === 0 ? cpv.value == null : cpv.value === Math.round(400000 / visitsThisMonth), `${cpv.value} (visits ${visitsThisMonth})`)
  const noCost = A.capacityAx(base({ schedules }), P1).numbers.find((n) => n.key === 'costPerVisit')
  ok('⑩ 운영비가 없으면 null · 이유가 적힘', noCost.value == null && /운영비가 입력된 달이 없습니다/.test(noCost.basis))
  const km0 = cap.numbers.find((n) => n.key === 'kmPerDay')
  ok('⑩ 마감 표가 없으면 계기판 km 은 not-countable', km0.value == null && km0.state === 'not-countable')
  const closes = [
    { profileId: 'p', who: '김기사', date: daysAgo(1), note: '', closedAt: '', summary: {}, odometerStart: 100, odometerEnd: 180, facilityWaitMin: 90, facilityTrips: 1 },
    { profileId: 'p', who: '김기사', date: daysAgo(2), note: '', closedAt: '', summary: {}, odometerStart: null, odometerEnd: null, facilityWaitMin: 30, facilityTrips: null },
    { profileId: 'p', who: '김기사', date: daysAgo(3), note: '', closedAt: '', summary: {}, odometerStart: 200, odometerEnd: 260, facilityWaitMin: null, facilityTrips: null },
  ]
  const cap2 = A.capacityAx(base({ schedules, dayCloses: closes }), P1)
  ok('⑩ 계기판 (80+60)/2 = 70km · 안 적은 날은 빼고', cap2.numbers.find((n) => n.key === 'kmPerDay').value === 70)
  ok('⑩ 대기 중앙값 (30, 90) → 60분', cap2.numbers.find((n) => n.key === 'facilityWaitMin').value === 60)
}

console.log('── ⑪ 기간 경계: 기간 밖 이벤트는 세지 않는다 · 준비 상태의 기업 증빙은 사람이 확인 ──')
{
  const d = base({ events: [ev(1, { ago: 0 }), ev(2, { ago: 3 }), ev(3, { ago: 20 })] })
  const s = E.evidenceSample(d, { from: daysAgo(3), to: daysAgo(1) })
  ok('⑪ from~to 양끝 포함, 밖은 제외 (1건)', s.field.length === 1 && s.field[0].id === 'e2', s.field.map((e) => e.id).join(','))
  const items = R.readinessOf(d)
  ok('⑪ 기업 증빙 항목은 전부 group=company · manual/missing', items.filter((i) => i.group === 'company').every((i) => i.state === 'manual' || i.state === 'missing'))
  ok('⑪ 자금계획은 「비어 있음」 (만들어 넣지 않음)', items.find((i) => i.key === 'fact:funding').state === 'missing')
  ok('⑪ AI 는 개수가 아니라 기록으로 답한다고 적혀 있다', /입력·결과·담당자 수정·실패·처리시간/.test(items.find((i) => i.key === 'ai').why))
  ok('⑪ 준비 상태 표본 값 줄 = 성과의 breadthLine 과 같다',
    items.find((i) => i.key === 'fieldSamples').value === E.breadthLine(P.performanceSummary(d, 'all').fieldCount, P.performanceSummary(d, 'all').breadth))
}

console.log('── ⑫ 이번 달 시스템 안에서 끝난 거래처 (수거 → 자재 → 정산) ──')
{
  const month = TODAY.slice(0, 7)
  const inMonth = (n) => { const d = daysAgo(n); return d.slice(0, 7) === month ? n : 0 }
  //  c1: 완료 2건 모두 시스템 입력 + 청구 확정 → 끝남 · c2: 완료 1건은 입력했지만 청구 없음 · c3: 완료 1건 입력 안 됨
  const schedules = [
    sched(1, { ago: inMonth(1), clientId: 'c1' }), sched(2, { ago: inMonth(2), clientId: 'c1' }),
    sched(3, { ago: inMonth(1), clientId: 'c2' }), sched(4, { ago: inMonth(1), clientId: 'c3' }),
  ]
  const events = [ev(1, { ago: inMonth(1), clientId: 'c1' }), ev(2, { ago: inMonth(2), clientId: 'c1' }), ev(3, { ago: inMonth(1), clientId: 'c2' })]
  const payments = [{ id: 'pay1', clientId: 'c1', billingMonth: month, amount: 100000, status: '청구 확정', canceledAt: null, snapshot: null }]
  const materials = [{ id: 'm1', date: daysAgo(inMonth(1)), clientId: 'c2', boxCount: 5, vinylCount: 0, needleBoxCount: 0, isAdditionalRequest: false, memo: '', items: null }]
  const clients = [1, 2, 3].map((i) => ({ id: `c${i}`, name: `병원${i}`, isDemoGenerated: false }))
  const it = R.readinessOf(base({ schedules, events, payments, materials, clients })).find((i) => i.key === 'systemClosed')
  ok('⑫ 완료 수거 3곳 중 끝난 곳 1곳 (c1) → 채우는 중', it.state === 'partial' && /완료 수거 3곳/.test(it.value) && /끝난 곳 1곳/.test(it.value), it.value)
  ok('⑫ 전부 시스템 입력 2곳 (c1·c2) · 자재 기록 1곳 · 청구 확정 1곳', /전부 시스템 입력 2곳/.test(it.value) && /자재 기록 1곳/.test(it.value) && /청구 확정 1곳/.test(it.value), it.value)
  const none = R.readinessOf(base({})).find((i) => i.key === 'systemClosed')
  ok('⑫ 이번 달 완료 수거가 없으면 비어 있음', none.state === 'missing')
  const all = R.readinessOf(base({ schedules: schedules.slice(0, 2), events: events.slice(0, 2), payments, clients })).find((i) => i.key === 'systemClosed')
  ok('⑫ 한 곳뿐이고 그 곳이 끝났으면 준비됨', all.state === 'ok', all.value)
}

console.log('── ⑬ 요약 카드(0107): 잰 값은 표본이 작아도 보이고 · 추정은 실측 비교에서 빠지고 · 나빠진 값도 감추지 않는다 ──')
{
  const events = Array.from({ length: 5 }, (_, i) => ev(i, { ago: i + 1, inputDurationMs: 120000 }))
  const schedules = events.map((_, i) => sched(i, { ago: i + 1 }))
  const d = base({ events, schedules })
  const perf = P.performanceSummary(d, 'all')
  const ax = A.axEvidence(d, { from: perf.period.from, to: perf.period.to })
  const cards = S.summaryCards(perf, ax)
  ok('⑬ 카드는 최대 3장', cards.length <= 3, String(cards.length))
  ok('⑬ 표본 5건이어도 입력 시간 2분은 「초기 측정」으로 보인다', cards.some((c) => c.key === 'inputTime' && c.value === '2분' && c.kind === '초기 측정'), JSON.stringify(cards.map((c) => [c.key, c.value])))
  ok('⑬ 입력 시간 카드는 개선율을 만들지 않는다 (범위가 다름)', !/%/.test(cards.find((c) => c.key === 'inputTime')?.desc ?? '%'))
  ok('⑬ 같은 범위 조사가 없으면 사무시간 카드가 없다', !cards.some((c) => c.key === 'adminTime'))
  ok('⑬ 카드 출처는 짧다 (「시스템 측정 · 표본 5건」)', cards.find((c) => c.key === 'inputTime')?.source === '시스템 측정 · 표본 5건', cards.find((c) => c.key === 'inputTime')?.source)
  //  추정으로 넣은 도입 후 값은 보존하되 실측 비교에서 뺀다
  const est = P.performanceSummary(d, 'all', undefined, { afterSurvey: { adminMinutesPerCollection: 11.7, monthlyDocHours: 91, surveyedOn: TODAY, source: 'estimate', note: '거의 그대로' } })
  const adEst = est.metrics.find((m) => m.key === 'adminTime')
  ok('⑬ 추정 출처의 도입 후 값은 비교에 안 들어간다 (measuring · after null)', adEst.status === 'measuring' && adEst.after == null, `${adEst.status} ${adEst.after}`)
  ok('⑬ 대신 값 11.7 을 메모에 보존한다', /11\.7분.*추정/.test(adEst.note), adEst.note)
  ok('⑬ 추정값으로 0% 개선을 만들지 않는다', adEst.changePct == null)
  const cardsEst = S.summaryCards(est, ax)
  ok('⑬ 추정 상태에서도 사무시간 카드는 없다', !cardsEst.some((c) => c.key === 'adminTime'))
  const um = S.unmeasured(est, ax, cardsEst)
  ok('⑬ 「아직 측정하지 않은 항목」에 추정 제외 이유가 적힌다', /11\.7분은 추정/.test(um.find((u) => u.key === 'adminTime')?.reason ?? ''), um.find((u) => u.key === 'adminTime')?.reason)
  ok('⑬ 이미 카드로 보인 항목은 미측정 목록에 없다', !um.some((u) => cardsEst.some((c) => c.key === u.key)))
  //  같은 범위 조사가 있으면 사무시간이 첫 카드 · 나빠져도 감추지 않는다
  const good = P.performanceSummary(d, 'all', undefined, { afterSurvey: { adminMinutesPerCollection: 1.7, monthlyDocHours: 40, surveyedOn: TODAY, source: 'survey', note: '' } })
  const c2 = S.summaryCards(good, ax)
  ok('⑬ 같은 범위 조사가 오면 사무시간 3.4 → 1.7 (50% 단축) 이 첫 카드', c2[0]?.key === 'adminTime' && /50% 단축/.test(c2[0].desc) && c2[0].worse !== true, JSON.stringify(c2[0]))
  const bad = P.performanceSummary(d, 'all', undefined, { afterSurvey: { adminMinutesPerCollection: 5.1, monthlyDocHours: 100, surveyedOn: TODAY, source: 'survey', note: '' } })
  const c3 = S.summaryCards(bad, ax)
  ok('⑬ 나빠진 값(3.4 → 5.1)도 카드로 보이고 worse 표시', c3[0]?.key === 'adminTime' && c3[0].worse === true && /늘어남/.test(c3[0].desc), JSON.stringify(c3[0]))
  //  현장 0건이면 카드가 없다 — 임의 건수 기준이 아니라 값이 없어서
  const empty = P.performanceSummary(base({}), 'all')
  ok('⑬ 현장 0건이면 카드 0장', S.summaryCards(empty, A.axEvidence(base({}), { from: empty.period.from, to: empty.period.to })).length === 0)
}

console.log('── ⑭ 다음 할 일 · 자료 진단 · 재현시험 기록 (0107) ──')
{
  const empty = base({})
  const perf0 = P.performanceSummary(empty, 'all')
  const nx = S.nextActions(empty, perf0, { trials: [], excel: null, isAdmin: true, unreadable: [] })
  ok('⑭ 최대 3개', nx.length === 3, String(nx.length))
  ok('⑭ 현장 0건이면 첫 일은 「수거 입력 시작」', nx[0]?.key === 'field', nx[0]?.key)
  ok('⑭ 기준값이 이미 있으면 「기준값 채우기」는 없다', !nx.some((a) => a.key === 'baseline'))
  const nxU = S.nextActions(empty, perf0, { trials: [], excel: null, isAdmin: true, unreadable: ['도입 전 기준값 (performance_baselines)'] })
  ok('⑭ 못 읽은 자료가 있으면 그것이 첫 일', nxU[0]?.key === 'unreadable' && /못 읽은 것/.test(nxU[0].why), nxU[0]?.key)
  const noBase = base({ baseline: { adminMinutesPerCollection: null, repeatEntriesPerCollection: null, monthlyDocHours: null, monthlyReworkCount: null, dailyCapacity: null, source: 'user', updatedAt: null } })
  const nxO = S.nextActions(noBase, P.performanceSummary(noBase, 'all'), { trials: [], excel: null, isAdmin: false, unreadable: [] })
  ok('⑭ 사무실 계정에는 관리자 전용 일(기준값·이사님 조사)이 없다', !nxO.some((a) => a.key === 'baseline' || a.key === 'afterSurvey'), nxO.map((a) => a.key).join(','))
  const trial = T.parseTrial({ id: 'd1', topics: ['업무 재현시험'], message: 'trial:2026-09-10|invoice|old=25,1|new=9,0 › 8월 명세서', requesterName: '이사', createdAt: '2026-09-10T01:00:00Z' })
  const nxT = S.nextActions(empty, perf0, { trials: [trial], excel: null, isAdmin: true, unreadable: [] })
  ok('⑭ 재현시험이 1건이라도 있으면 「재현시험 1건」 일은 사라진다', !nxT.some((a) => a.key === 'trial'))

  //  진단 — 자료 미확인 / 실제 사용 없음 / 연습만
  const dg0 = S.diagnoseData(empty, perf0, [])
  ok('⑭ 기록이 하나도 없으면 「실제 사용 없음 — 수거 입력 기록이 하나도 없습니다」', /실제 사용 없음.*하나도 없습니다/.test(dg0.headline), dg0.headline)
  const dgU = S.diagnoseData(empty, perf0, ['도입 전 기준값 (performance_baselines)'])
  ok('⑭ 못 읽은 자료가 있으면 「자료 미확인」이 앞선다', /^자료 미확인/.test(dgU.headline) && dgU.lines.some((l) => /못 읽은 것/.test(l)), dgU.headline)
  const practice = Array.from({ length: 6 }, (_, i) => ev(i, { ago: 50 + i }))
  const dP = base({ events: practice, schedules: practice.map((_, i) => sched(i, { ago: 50 + i })) })
  const perfP = P.performanceSummary(dP, 'all')
  const dgP = S.diagnoseData(dP, perfP, [])
  ok('⑭ 시작일 전 6건뿐이면 「실제 사용 없음 — 시작일 이후 현장 입력 0건」', new RegExp(`실제 사용 없음 — 실증 시작일 ${START} 이후 현장 입력 0건`).test(dgP.headline), dgP.headline)
  ok('⑭ 전체 6 = 현장 0 · 연습 6 · 시연 0 · 취소 0 으로 센다', dgP.lines.some((l) => /전체 6건 = 현장 0 · 연습\(시작일 전\) 6 · 시연 0 · 취소 0/.test(l)), dgP.lines.join(' | '))
  ok('⑭ 연습을 실제로 바꾸는 것은 대표님이 설정에서 정한다고 적는다 (시스템이 임의로 안 바꿈)', dgP.lines.some((l) => /시스템이 임의로 바꾸지 않고, 대표님이 설정에서/.test(l)))
  ok('⑭ 기준값 미입력은 「못 읽은 것이 아니라 아직 안 넣은 것」', S.diagnoseData(noBase, P.performanceSummary(noBase, 'all'), []).lines.some((l) => /아직 안 넣은 것/.test(l)))
  const dgE = S.diagnoseData(empty, P.performanceSummary(empty, 'all', undefined, { afterSurvey: { adminMinutesPerCollection: 11.7, monthlyDocHours: 91, surveyedOn: TODAY, source: 'estimate', note: '' } }), [])
  ok('⑭ 추정 도입 후 값은 「보존 · 실측 비교 제외」로 적는다', dgE.lines.some((l) => /추정\(직접 입력\).*제외.*보존/.test(l)), dgE.lines.join(' | '))

  //  재현시험 — 줄 형식 왕복 · 중앙값 · 단축률 · 나빠진 값
  ok('⑭ 재현시험 줄 왕복 (25,1 → 9,0 · 메모)', trial && trial.oldMin === 25 && trial.oldErrors === 1 && trial.newMin === 9 && trial.newErrors === 0 && trial.note === '8월 명세서', JSON.stringify(trial))
  ok('⑭ formatTrial 이 같은 줄을 만든다', T.formatTrial({ date: '2026-09-10', task: 'invoice', oldMin: 25, oldErrors: 1, newMin: 9, newErrors: 0, note: '8월 명세서' }) === 'trial:2026-09-10|invoice|old=25,1|new=9,0 › 8월 명세서')
  ok('⑭ 주제가 다르거나 형식이 다른 줄은 재현시험이 아니다', T.parseTrial({ id: 'x', topics: ['기타'], message: 'trial:2026-09-10|invoice|old=25,1|new=9,0', requesterName: '', createdAt: '' }) === null && T.parseTrial({ id: 'y', topics: ['업무 재현시험'], message: '명세서 25분 → 9분', requesterName: '', createdAt: '' }) === null)
  const t2 = { ...trial, id: 'd2', oldMin: 31, newMin: 11 }
  const t3 = { ...trial, id: 'd3', task: 'collection', oldMin: 4, newMin: 6, oldErrors: 0, newErrors: 1 }
  const sums = T.summarizeTrials([trial, t2, t3])
  const inv = sums.find((s) => s.task === 'invoice')
  ok('⑭ 명세서 2회 — 중앙값 (25,31)=28 · (9,11)=10 · 64% 단축', inv && inv.n === 2 && inv.oldMedianMin === 28 && inv.newMedianMin === 10 && inv.savedPct === 64, JSON.stringify(inv))
  const col = sums.find((s) => s.task === 'collection')
  ok('⑭ 수거 입력 1회 — 4 → 6 은 −50% 로 그대로 (감추지 않음) · 오류 0→1', col && col.savedPct === -50 && col.newErrors === 1, JSON.stringify(col))
  ok('⑭ 한 번도 안 한 과제(request)는 나오지 않는다', !sums.some((s) => s.task === 'request'))
}

console.log(`\ncheck_evidence0106 OK=${pass} FAIL=${fail}`)
process.exit(fail ? 1 : 0)
