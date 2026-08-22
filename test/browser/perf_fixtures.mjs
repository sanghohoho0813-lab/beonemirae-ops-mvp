

//  3~5년 누적 실측.
//
//   지금까지 확인한 것은 「1,000줄 넘게 읽어 오는가」(페이징)뿐입니다.
//   읽어 온 다음이 문제입니다 — 화면이 그걸 몇 초 만에 그리는지,
//   날짜를 한 번 넘길 때 몇 초 멈추는지는 아무도 재 보지 않았습니다.
//
//   실제 규모로 만듭니다.
//    거래처 18곳 · 주 2회 · 3년  →  수거 약 5,600건
//    청구 18 × 36개월 = 648건 · 입금 900건 · 자재 2,800건 · 감사기록 4,000건
//
//   재는 것은 「사람이 기다리는 시간」입니다. 렌더 함수 호출 횟수가 아니라
//   버튼을 누르고 화면이 바뀔 때까지의 시간입니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const YEARS = Number(process.env.YEARS ?? 3)

const profile = {
  id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2023-01-01T00:00:00Z', client_id: null, created_at: '2023-01-01T00:00:00Z',
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const start = new Date(TODAY)
start.setDate(start.getDate() - YEARS * 365)

const NAMES = ['의료법인한양의료재단', '가나요양병원', '다래의원', '마루한방병원', '바다병원', '사랑요양원',
  '아침의원', '자연치과', '차오름병원', '카페인의원', '타워의원', '파랑재활병원', '하늘요양병원',
  '한빛의원', '새벽병원', '온누리의원', '푸른요양원', '중앙정형외과']

const clients = NAMES.map((name, i) => ({
  id: `c${i}`, name, type: i % 3 === 0 ? '요양병원' : '병원', address: `서울시 강남구 테헤란로 ${i + 1}길 ${10 + i}`,
  manager: '원무과', phone: `02-500-${pad(i)}00`, collection_cycle: '주 2회',
  collects_medical_waste: true, collects_diaper: i % 3 === 0, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2023-01-01', contract_end: null, payment_terms: '', payment_due_day: 25,
  pricing: { medical: { sale: 900 + i * 10, cost: 350 }, diaper: { sale: 300, cost: 120 } },
  created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z',
  biz_no: `220-81-${10000 + i}`, biz_ceo: '대표', biz_type: '의료업', biz_item: '병원',
  tax_email: `a${i}@b.c`, vat_mode: '별도', flat_fee_when_empty: false,
  collect_time: '평일 09:00~17:00', disposal_site: '○○환경', diaper_cycle: '주 1회',
}))

const vehicles = [1, 2, 3].map((n) => ({
  id: `v${n}`, name: `${n}호차`, waste_type: n === 3 ? '일회용기저귀' : '의료폐기물',
  tonnage: 1.2 * n, nominal_capacity: 1500 * n, expected_capacity: 1200 * n, driver: `${n}호기사`,
  active: true, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z',
}))

//  수거 — 주 2회(화·금)
const schedules = []
const materials = []
let sid = 0
for (let d = new Date(start); iso(d) <= TODAY; d.setDate(d.getDate() + 1)) {
  const wd = d.getDay()
  if (wd !== 2 && wd !== 5) continue
  const day = iso(d)
  for (let i = 0; i < clients.length; i += 1) {
    sid += 1
    const done = day < TODAY
    schedules.push({
      id: `s${sid}`, date: day, client_id: `c${i}`, waste_type: i % 3 === 0 && wd === 5 ? '일회용기저귀' : '의료폐기물',
      vehicle_id: `v${(i % 3) + 1}`, scheduled_time: `${9 + (i % 8)}:00`,
      status: done ? '완료' : '예정',
      expected_amount: 80 + (i * 7) % 60, actual_amount: done ? 75 + (sid * 13) % 90 : null,
      completed_at: done ? `${day}T01:00:00Z` : null,
      memo: sid % 40 === 0 ? '경비실 연락 후 후문' : '', origin: 'field', is_additional: false,
      demo_session_id: null, plan_batch: null, handover_status: done ? '인계 완료' : null,
      driver_name: `${(i % 3) + 1}호기사`, created_at: `${day}T00:00:00Z`, updated_at: `${day}T00:00:00Z`,
    })
    if (sid % 4 === 0) {
      materials.push({
        id: `m${sid}`, date: day, client_id: `c${i}`, box_count: 5 + (i % 7), vinyl_count: 10 + (i % 5),
        needle_box_count: i % 3, is_additional_request: sid % 20 === 0, memo: '', origin: 'field',
        demo_session_id: null, created_at: `${day}T00:00:00Z`, updated_at: `${day}T00:00:00Z`, items: null,
      })
    }
  }
}

//  청구 · 입금 — 36개월
const payments = []
const receipts = []
let pid = 0
const m0 = new Date(start)
for (let k = 0; k < YEARS * 12; k += 1) {
  const mm = new Date(m0.getFullYear(), m0.getMonth() + k, 1)
  const month = `${mm.getFullYear()}-${pad(mm.getMonth() + 1)}`
  if (month >= TODAY.slice(0, 7)) break
  for (let i = 0; i < clients.length; i += 1) {
    pid += 1
    const amount = 1_200_000 + ((pid * 37211) % 900_000)
    const paid = pid % 9 !== 0
    payments.push({
      id: `p${pid}`, client_id: `c${i}`, billing_month: month, amount,
      status: paid ? '입금완료' : '미수금', method: '무통장', paid_at: null, memo: '', demo_session_id: null,
      snapshot: { kind: '정기', confirmedAt: `${month}-28T00:00:00Z`, scheduleIds: [], materialIds: [] },
      canceled_at: null, created_at: `${month}-28T00:00:00Z`, updated_at: `${month}-28T00:00:00Z`,
    })
    if (paid) {
      receipts.push({
        id: `r${pid}`, payment_id: `p${pid}`, received_on: `${month}-30`, amount,
        method: '계좌이체', memo: '', actor_id: null, actor_name: '대표',
        created_at: `${month}-30T00:00:00Z`, updated_at: `${month}-30T00:00:00Z`,
        source_ref: `${month}-30|${amount}|${clients[i].name.slice(0, 2)}`,
      })
    }
  }
}

const notes = clients.flatMap((c, i) => [0, 1].map((k) => ({
  id: `n${i}-${k}`, client_id: c.id, kind: k ? '자재' : '주의',
  content: k ? '박스 5개 상시 추가' : '화물 엘리베이터만 사용 가능',
  done: false, archived: false, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z',
})))

const costs = []
for (let k = 0; k < YEARS * 12; k += 1) {
  const mm = new Date(m0.getFullYear(), m0.getMonth() + k, 1)
  const month = `${mm.getFullYear()}-${pad(mm.getMonth() + 1)}`
  costs.push({ id: `oc${k}a`, month, category: '인건비', amount: 18_000_000, memo: '', actor_name: '대표',
    created_at: `${month}-01T00:00:00Z`, updated_at: `${month}-01T00:00:00Z` })
  costs.push({ id: `oc${k}b`, month, category: '유류비', amount: 2_100_000, memo: '', actor_name: '대표',
    created_at: `${month}-01T00:00:00Z`, updated_at: `${month}-01T00:00:00Z` })
}

const prices = clients.map((c, i) => ({
  id: `pr${i}`, client_id: c.id, effective_from: '2023-01-01', pricing: c.pricing,
  memo: '엑셀에서 옮김', actor_id: null, actor_name: '대표', created_at: '2023-01-01T00:00:00Z',
}))


export { clients, vehicles, schedules, materials, payments, receipts, notes, costs, prices, profile, UID, BASE, TODAY }
