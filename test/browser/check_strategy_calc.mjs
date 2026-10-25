//  0148 — 사업화전략 계산 엔진 (src/lib/bizStrategy.ts) · 화면 없이
//
//   가상 회사 · 중립 숫자(strategy_fixture.mjs)로, 기대값은 **손으로 계산한 값**입니다
//   (엔진을 돌려 나온 숫자를 옮겨 적지 않았습니다). 금액은 1원이라도 다르면 FAIL.
//
//   확인하는 것
//    · 연말 고객 ≠ 연평균 고객 (연중 가입) · 신규 가입 역산 · 이탈 · 무료 체험
//    · 요금제 비중 · 부가 기능 채택률 → 월 고객매출 · 설정비 · 추천 할인
//    · B2B 직접판매(총액) / 중개(수수료) / 혼합 · 거래총액(GMV)은 매출 아님 · 이익 · 운전자금
//    · 달력 연도와 신보 차년도(접수월 다음 달부터 12개월) · 계산 기간 밖 경고
//    · 억원 · 백만원 반올림과 각주 · 결정(합의 · 의견 조율 · 재확인) · 직접 입력 · 초안 칸 서로 맞음

import * as E from '../../src/lib/bizStrategy.ts'
import { fixtureModel } from './strategy_fixture.mjs'

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const eq = (a, b, m) => ok(a === b, m, `${a} (기대 ${b})`)
const near = (a, b, m, tol = 1e-9) => ok(Math.abs(a - b) <= tol, m, `${a} (기대 ${b})`)

const M = fixtureModel()
ok(E.validate(M).length === 0, '검사용 모델 모양이 올바름', E.validate(M).join(' / '))

// ── 1. 기본안(B) — SaaS ────────────────────────────────────────────────────────
const r = E.compute(M, 'B')
const [y27, y28, y29] = r.years
eq(r.sel, 'B', '추천 시나리오 B')
//  2027: 0 → 12곳 · 이탈 0 · 매달 1곳 → 연평균 6.5곳 · 결제 78곳·월
near(y27.saas.newCustomers, 12, '2027 신규 12곳 (연말 목표 12 · 이탈 0)')
near(y27.saas.avgCustomers, 6.5, '2027 연평균 6.5곳 ≠ 연말 12곳')
eq(y27.saas.arpu, 175000, '월 고객매출 = 요금 0.5×100,000 + 0.5×200,000 + 도우미 0.5×50,000')
eq(y27.saas.sub, 11700000, '2027 구독 = 78 × 150,000')
eq(y27.saas.opt, 1950000, '2027 부가 기능 = 78 × 25,000')
eq(y27.saas.setup, 3600000, '2027 설정비 = 12 × 50% × 600,000')
eq(y27.saas.referral, 450000, '2027 추천 할인 = 12 × 25% × 150,000')
eq(y27.saas.net, 16800000, '2027 SaaS 매출')
eq(y28.saas.net, 25200000, '2028 SaaS 매출 (12곳 그대로 · 신규 0)')
near(y28.saas.newCustomers, 0, '2028 신규 0')
//  2029: 12 → 36 · 매달 2곳 → 연평균 25곳, 결제 300곳·월
near(y29.saas.newCustomers, 24, '2029 신규 24곳')
near(y29.saas.avgPaying, 25, '2029 연평균 유료 25곳 (연말 36곳)')
eq(y29.saas.sub, 45000000, '2029 구독 = 300 × 150,000')
eq(y29.saas.opt, 7500000, '2029 부가 기능')
eq(y29.saas.setup, 7200000, '2029 설정비 = 24 × 50% × 600,000')
eq(y29.saas.referral, 900000, '2029 추천 할인 = 24 × 25% × 150,000')
eq(y29.saas.net, 58800000, '2029 SaaS 매출')
//  유입 경로 역산 — 직접영업 75% · 추천 25%
const fd = y29.saas.funnel.direct, fr = y29.saas.funnel.ref
near(fd.paid, 18, '직접영업 유료 18곳'); near(fd.signups, 36, '가입 36'); near(fd.demos, 72, '시연 72'); near(fd.contacts, 144, '접촉 144')
near(fr.contacts, 24, '추천 경로 접촉 24곳 (시연율 100%)')

// ── 2. B2B · 기존 사업 · 합계 ──────────────────────────────────────────────────
const b = y29.b2b
eq(b.goodsGmv, 120000000, '상품 거래총액 = 100곳 × 100,000 × 12')
eq(b.serviceGmv, 100000000, '서비스 거래총액 = 50건 × 2,000,000')
eq(b.goodsDirect, 120000000, '직접판매 = 총액 매출')
eq(b.service, 10000000, '서비스는 수수료 10%만 매출')
eq(b.revenue, 135000000, 'B2B 매출 = 120,000,000 + 10,000,000 + 광고 5,000,000')
eq(b.gmv, 220000000, '거래총액 220,000,000 — 매출(135,000,000)과 다름')
eq(b.cogs, 96000000, '매입원가 (매출총이익률 20%)')
eq(b.grossProfit, 39000000, '매출총이익')
eq(b.contribution, 13800000, '기여이익 = 39,000,000 − 배송 3,600,000 − 결제 2,400,000 − 쿠폰 1,200,000 − 운영 18,000,000')
eq(b.nwc, 8547945, '운전자금 = 매출채권 30일 + 재고 10일 − 매입채무 15일')
eq(b.monthlyPurchase, 8000000, '월 상품 매입자금')
eq(y27.b2b.contribution, -5520000, '2027 B2B 는 손실 (운영비가 큼)')
ok(r.warnings.some((w) => w.code === 'b2b_loss' && w.msg.includes('2027')), '손실인 해를 경고')
near(r.legacyGrowth, 0.1, '기존 사업 연 10% (10억 → 13.31억, 3년)', 1e-12)
eq(y27.legacy, 1100000000, '2027 기존 사업'); eq(y28.legacy, 1210000000, '2028 기존 사업'); eq(y29.legacy, 1331000000, '2029 기존 사업 = 목표')
eq(y29.total, 1524800000, '2029 전체 = 1,331,000,000 + 58,800,000 + 135,000,000')
eq(y27.total, 1128800000, '2027 전체'); eq(y28.total, 1310200000, '2028 전체')

// ── 3. 구조 바꾸기 — 중개 · 혼합 ───────────────────────────────────────────────
const broker = E.compute(M, 'B', { structure: { choice: 'broker' } }).years[2].b2b
eq(broker.revenue, 24600000, '중개형 매출 = 120,000,000 × 8% + 10,000,000 + 5,000,000')
eq(broker.gmv, 220000000, '중개형도 거래총액은 같음')
eq(broker.cogs, 0, '중개형은 매입원가 없음')
const mixed = E.compute(M, 'B', { structure: { choice: 'mixed' } }).years[2].b2b
eq(mixed.revenue, 79800000, '혼합(직접 50%) = 60,000,000 + 4,800,000 + 15,000,000')
eq(mixed.cogs, 48000000, '혼합 매입원가')

// ── 4. 신보 차년도 (접수 2026.11 → 1차년도 2026.12~2027.11) ──────────────────────
const w = r.windows
eq(E.ymText(w[0].from) + '~' + E.ymText(w[0].to), '2026.12~2027.11', '1차년도 기간')
eq(w[0].legacy, 1091666667, '1차년도 기존 = 2026년 12월분 + 2027년 11개월분')
eq(w[0].saas, 14437500, '1차년도 SaaS = 9,900,000 + 1,650,000 + 3,300,000 − 412,500')
eq(w[0].b2b, 11000000, '1차년도 B2B = 2027년 11개월분')
eq(w[0].total, 1117104167, '1차년도 합계')
eq(w[1].total, 1296045833, '2차년도 합계')
eq(w[2].saas, 54075000, '3차년도 SaaS')
eq(w[2].total, 1504991667, '3차년도 합계')
ok(w.every((x) => x.complete), '세 차년도 모두 계산 기간 안')
ok(w[0].total !== y27.total, '차년도(1,117,104,167)와 달력 2027년(1,128,800,000)은 다른 숫자')
const late = E.compute({ ...M, meta: { ...M.meta, applicationMonth: '2027-03' } }, 'B')
eq(late.windows[2].missingMonths, 3, '접수 2027.03 → 3차년도 3개월이 계산 기간 밖')
ok(late.warnings.some((x) => x.code === 'window_outside'), '계산 기간 밖 경고')
eq(E.compute({ ...M, meta: { ...M.meta, applicationMonth: '' } }, 'B').windows, null, '접수월이 없으면 차년도를 만들지 않음 (추측 안 함)')
eq(E.compute({ ...M, meta: { ...M.meta, applicationMonth: '' } }, 'B', {}, [], E.ym('2026.10')).windows[0].from, E.ym('2026.11'), '작성일 기준 접수월(2026.10)을 받으면 1차년도 2026.11부터')

// ── 5. 이탈 · 무료 체험 · 접촉 수 기준 ───────────────────────────────────────────
const churnM = fixtureModel(); churnM.scenarios.B.saas.years['2029'].churnRate = 0.2
const rc = E.compute(churnM, 'B').years[2].saas
near(rc.endCustomers, 36, '이탈 20% 에서도 연말 목표 36곳에 맞게 신규를 역산', 1e-9)
ok(rc.newCustomers > 24, '이탈만큼 신규가 더 필요', E.cnt(rc.newCustomers))
near(rc.churned, rc.startCustomers + rc.newCustomers - rc.endCustomers, '이탈 = 시작 + 신규 − 연말')
const trialM = fixtureModel(); trialM.scenarios.B.saas.years['2029'].trialMonths = 2
eq(E.compute(trialM, 'B').years[2].saas.sub, 38100000, '무료 체험 2개월 → 결제 254곳·월 × 150,000')
const funM = fixtureModel(); Object.assign(funM.scenarios.B.saas.years['2029'], { drive: 'funnel', contacts: { direct: 160, ref: 40 } })
const rf = E.compute(funM, 'B').years[2].saas
near(rf.newCustomers, 30, '접촉 수 기준: 160×0.5×0.5×0.5 + 40×1×0.5×0.5 = 30곳')
near(rf.endCustomers, 42, '연말 42곳')
funM.scenarios.B.saas.years['2029'].funnel.direct.paidRate = 0.25
near(E.compute(funM, 'B').years[2].saas.endCustomers, 32, '전환율을 낮추면 고객 수 · 매출이 같이 줄어듦 (32곳)')

// ── 6. 결정 — 직접 입력 · 여러 개 고르기 · 시나리오 ──────────────────────────────
eq(E.compute(M, 'B', { legacy: { choice: 'custom', custom: 12.5 } }).years[2].legacy, 1250000000, '직접 입력 12.5억 → 1,250,000,000원 (모든 시나리오)')
const rC = E.compute(M, 'B', { scenario: { choice: 'C' }, saas_target: { choice: 'k24' } })
eq(rC.sel, 'C', '결정 1 = C 이면 C 시나리오'); near(rC.years[2].saas.endCustomers, 24, '그다음 결정 3(24곳)은 고른 C 에 적용')
eq(E.compute(M, 'A', { scenario: { choice: 'C' } }, [], null, true).sel, 'A', '나란히 비교할 때는 결정 1 과 상관없이 A')
eq(E.compute(M, 'B', { ai: { choice: 'custom', custom: ['route'] } }).years[2].saas.arpu, 158000, '부가 기능 개별 선택: 도우미 끔 · 경로 계산 10% → 150,000 + 8,000')
ok(E.compute(M, 'B', { ai: { choice: '추후 결정' } }).years[2].saas.arpu === 175000, '「추후 결정」은 아무것도 바꾸지 않음')

const D = [{ profile_id: 'p1', name: '가', title: '' }, { profile_id: 'p2', name: '나', title: '' }]
const row = (pid, choice, rev = 3, custom = null) => ({ key: 'scenario', profile_id: pid, name: pid, title: '', choice, custom, note: '', assump_rev: rev, at: '' })
eq(E.resolveDecision('scenario', [], D, 3).state, '결정 대기', '아무도 안 고름 → 결정 대기')
eq(E.resolveDecision('scenario', [row('p1', 'B')], D, 3).state, '결정 대기', '한 분만 → 결정 대기 (미선택을 추천안으로 저장하지 않음)')
eq(E.resolveDecision('scenario', [row('p1', 'B'), row('p2', 'B')], D, 3).state, '합의', '두 분 같음 → 합의')
eq(E.resolveDecision('scenario', [row('p1', 'B'), row('p2', 'C')], D, 3).state, '의견 조율 필요', '두 분 다름 → 의견 조율 필요')
eq(E.resolveDecision('scenario', [row('p1', 'B', 2), row('p2', 'B')], D, 3).state, '재확인 필요', '한 분의 선택이 숫자 바뀌기 전 → 재확인 필요 (합의로 세지 않음)')
eq(E.resolveDecision('scenario', [row('p1', 'custom', 3, 30), row('p2', 'custom', 3, 30)], D, 3).state, '합의', '직접 입력 같은 값 → 합의')
eq(E.resolveDecision('scenario', [row('p1', 'custom', 3, 30), row('p2', 'custom', 3, 31)], D, 3).state, '의견 조율 필요', '직접 입력 다른 값 → 의견 조율 필요')
eq(E.resolveDecision('scenario', [row('p1', '추후 결정'), row('p2', '추후 결정')], D, 3).state, '추후 결정', '둘 다 추후 → 추후 결정')
eq(E.resolveDecision('scenario', [row('p1', 'B'), row('p2', 'B')], [], 3).state, '결정 대기', '결정할 분(검토 참여자)이 없으면 합의 아님')
eq(E.resolveDecision('scenario', [row('p1', 'B')], [D[0]], 3).state, '결정 대기', '결정할 분이 1명뿐이면 그분이 골라도 합의 아님 (두 분이 필요)')

// ── 7. 자금 · 생산성 · 시장 · 기존 자료 대조 ─────────────────────────────────────
eq(r.funding.guarantee, 70000000, '자금 A안: 적격 가능 금액만 (확인 필요 30,000,000 제외)')
eq(r.funding.outside, 30000000, '보증 밖 30,000,000')
eq(r.funding.firstYear, 90000000, '1차년도 사용분 = 50,000,000 + 20,000,000×50% + 30,000,000')
const fB = E.compute(M, 'B', { funding: { choice: 'B' } }).funding
ok(fB.guarantee === 70000000 && fB.guaranteeMax === 100000000, '자금 B안: 70,000,000 ~ 신보 확인 뒤 100,000,000')
eq(E.compute(M, 'B', { funding: { choice: 'C' } }).funding.reduced, 30000000, '자금 C안: 신청금액을 30,000,000 줄임')
ok(r.warnings.some((x) => x.code === 'funding_check'), '확인 전 금액은 보증금액에 넣지 않는다는 경고')
const p = r.productivity
ok(p.saveMin[0] === 90 && p.saveMin[1] === 150, '하루 절감 90~150분')
near(p.rate[0], 0.75, '감소율 75%'); near(p.rate[1], 150 / 180, '감소율 83.3%')
ok(p.monthHours[0] === 30 && p.monthHours[1] === 50, '월 30~50시간 (20일)')
ok(p.yearHours[0] === 360 && p.yearHours[1] === 600, '연 360~600시간 (240일)')
ok(p.value[0] === 3600000 && p.value[1] === 6000000, '시간 가치 3,600,000~6,000,000원 (현금 절감 아님)')
ok(r.warnings.some((x) => x.code === 'market_unknown' && x.level === 'risk'), '시장 규모를 모르면 점유율을 말하지 않고 위험 표시')
const mk = fixtureModel(); mk.market.steps[0].count = 100
ok(E.compute(mk, 'B').warnings.some((x) => x.code === 'market_share' && x.msg.includes('36.0%') && x.level === 'risk'), '시장 100곳 중 36곳 = 36.0% → 위험')
ok(r.warnings.some((x) => x.code === 'setup_count'), '기존 자료 설정비 30곳 > 신규 24곳 → 모순 경고')
const sr = fixtureModel(); sr.original.B.setupCount = 20
ok(E.compute(sr, 'B').warnings.some((x) => x.code === 'setup_ratio' && x.msg.includes('83%')), '설정비 20곳 = 신규 24곳의 83% > 유료 설정 비율 50% → 「무료 가입이 거의 없다」 경고')
const sr2 = fixtureModel(); sr2.original.B.setupCount = 12
ok(!E.compute(sr2, 'B').warnings.some((x) => x.code.startsWith('setup_')), '설정비 12곳 = 신규의 50% → 경고 없음')
ok(r.warnings.some((x) => x.code === 'original_diff' && x.msg.includes('SaaS')), '기존 자료 SaaS 0.60억 vs 다시 계산 0.59억 대조')
ok(!r.warnings.some((x) => x.code === 'original_diff' && x.msg.includes('연평균')), '연평균 25곳은 기존 자료와 같음')

// ── 8. 표시 반올림 ─────────────────────────────────────────────────────────────
eq(E.eok(140280000), '1.40억', '1.4028억 → 1.40억'); eq(E.mil(1091666667), 1092, '백만원 반올림')
ok(E.roundNote([400000, 400000, 400000], 1200000, 'eok') !== null, '부문 합(0.00억)과 합계(0.01억)가 다르면 각주')
ok(E.roundNote([1400000, 1400000], 2800000, 'mil') !== null, '부문 합(2)과 합계(3백만원)가 다르면 각주')
eq(E.roundNote([100000000, 200000000], 300000000, 'eok'), null, '맞으면 각주 없음')

// ── 9. 사업계획서 칸 초안 — 서로 맞는지 (제출 전 점검과 충돌 없음) ─────────────────
const dr = Object.fromEntries(E.drafts(r).map((x) => [x.key, x]))
const colSum = (rows, c) => rows.reduce((a, x) => a + Number(x[c] ?? 0), 0)
eq(colSum(dr['s11.plan.y1'].value, 'amount'), 1117, '1차년도 표 합 1,117백만원')
eq(Number(dr['s11.plan.sum_limit'].value.a), colSum(dr['s11.plan.y1'].value, 'amount'), '한도산정 Ⓐ = 1차년도 표 합')
eq(Number(dr['a.sales_total'].value.y1), colSum(dr['a.sales_items'].value, 'y1'), '별첨 추정매출액 = 품목별 합')
eq(dr['a.periods'].value.y1, '2026.12 ~ 2027.11', '별첨 차년도 기간')
eq(dr['s11.plan.sum_annual'].value.y2026, '1000', '연간 매출 2026 = 기준연도 추정 1,000백만원')
eq(dr['s11.plan.sum_annual'].value.y2027, '1129', '연간 매출 2027 = 1,100 + 17 + 12')
eq(colSum(dr['a.funds'].value, 'amount'), 90, '별첨 소요자금 90백만원')
eq(colSum(dr['s9.working'].value, 'amount'), 90, '9번 운전 = 별첨과 같은 90')
const fg = dr['s9.funding'].value
eq(Number(fg.own ?? 0) + Number(fg.loan ?? 0) + Number(fg.etc ?? 0), 90, '9번 조달(B) = 소요(A) 90')
eq(fg.guarantee, '70', '보증신청 70 — 확인 전 30은 넣지 않음')
ok(dr['s11.plan.y1_note'].text.includes('계약 확정 아님') && dr['s11.plan.y1_note'].text.includes('매출이 아니며'), '근거 문장에 「계약 확정 아님」 · 거래총액은 매출 아님')
eq(dr['s11.prod.bm_b'].text, '가상 사업모델 — 마지막 해 연말 36곳 · 매출 0.59억', '글 칸 초안 — 지표를 계산값으로')
const mt = E.metrics(r)
ok(mt['price.basic'] === '100,000원' && mt['b2b.structure'] === '상품 직접판매(총액 매출)', '지표 — 요금 · B2B 구조도 계산값에서 (초안 문장에 숫자를 박지 않음)')
const rd = E.render('a {{saas.end.2029}} b {{nope}}', mt)
ok(rd.text === 'a 36곳 b {{?nope}}' && rd.missing[0] === 'nope', '모르는 지표는 {{?…}} 로 남기고 알림 (지어내지 않음)')

// ── 10. 모델 검사 ──────────────────────────────────────────────────────────────
const bad = fixtureModel(); bad.scenarios.A.saas.years['2028'].mix = { basic: 0.7, plus: 0.7 }
ok(E.validate(bad).some((x) => x.includes('요금제 비중')), '요금제 비중 합이 100%가 아니면 저장 전에 막음')
const bad2 = fixtureModel(); bad2.decisions[0].recommended = 'Z'
ok(E.validate(bad2).some((x) => x.includes('추천안')), '없는 추천안이면 막음')
