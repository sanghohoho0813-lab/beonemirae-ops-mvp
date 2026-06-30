import type {
  AppData,
  Client,
  ClientType,
  MaterialSupply,
  Payment,
  Schedule,
  StorageSize,
  Vehicle,
  WasteType,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 초기 샘플 데이터
//
// 실제 ㈜비원미래 운영 규모를 반영한 데모용 데이터입니다.
//  - 거래처 49곳 (병원 10 / 요양병원 14 / 의원·장례식장·요양원 20 / 치과 2 / 한의원·한방병원 3)
//  - 차량 5대
//  - 월평균 수거량: 의료폐기물 40톤 + 일회용기저귀 65톤 = 105톤
// 수거일정·자재공급·결제 데이터는 "앱 최초 실행일" 기준으로 생성됩니다.
// ─────────────────────────────────────────────────────────────────────────────

// ── 날짜 유틸 ────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toMonthStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const addDays = (base: Date, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

// ── 차량 5대 ─────────────────────────────────────────────────────────────────
export const seedVehicles: Vehicle[] = [
  {
    id: 'v1',
    name: '의료폐기물 1톤 A',
    wasteType: '의료폐기물',
    tonnage: 1,
    nominalCapacity: 1000,
    expectedCapacity: 670, // 부피 문제로 명목 적재량의 약 2/3
    driver: '김현수',
  },
  {
    id: 'v2',
    name: '의료폐기물 1톤 B',
    wasteType: '의료폐기물',
    tonnage: 1,
    nominalCapacity: 1000,
    expectedCapacity: 670,
    driver: '박정민',
  },
  {
    id: 'v3',
    name: '의료폐기물 3.5톤',
    wasteType: '의료폐기물',
    tonnage: 3.5,
    nominalCapacity: 2500, // 적재 가능량(명목)
    expectedCapacity: 1670, // 부피 문제로 약 2/3
    driver: '이상호',
  },
  {
    id: 'v4',
    name: '일회용기저귀 1톤 A',
    wasteType: '일회용기저귀',
    tonnage: 1,
    nominalCapacity: 1000,
    expectedCapacity: 750,
    driver: '최영재',
  },
  {
    id: 'v5',
    name: '일회용기저귀 1톤 B',
    wasteType: '일회용기저귀',
    tonnage: 1,
    nominalCapacity: 1000,
    expectedCapacity: 750,
    driver: '정대원',
  },
]

// ── 거래처 49곳 ──────────────────────────────────────────────────────────────
// 가독성을 위해 [이름, 유형, 의료폐기물, 기저귀, 창고크기] 튜플로 정의 후 매핑합니다.
type ClientSeed = [name: string, type: ClientType, medical: boolean, diaper: boolean, storage: StorageSize]

const clientSeeds: ClientSeed[] = [
  // 병원 10
  ['미래제일병원', '병원', true, true, '큼'],
  ['한빛종합병원', '병원', true, true, '큼'],
  ['새중앙병원', '병원', true, true, '큼'],
  ['동래성모병원', '병원', true, false, '큼'],
  ['우리연합병원', '병원', true, true, '보통'],
  ['해운대바른병원', '병원', true, false, '보통'],
  ['금정좋은병원', '병원', true, true, '큼'],
  ['사상튼튼병원', '병원', true, false, '보통'],
  ['강서참사랑병원', '병원', true, true, '보통'],
  ['남부365병원', '병원', true, false, '보통'],
  // 요양병원 14
  ['실버케어요양병원', '요양병원', true, true, '큼'],
  ['은빛마을요양병원', '요양병원', true, true, '큼'],
  ['효사랑요양병원', '요양병원', true, true, '큼'],
  ['평안요양병원', '요양병원', true, true, '보통'],
  ['미소요양병원', '요양병원', true, true, '보통'],
  ['하나요양병원', '요양병원', true, true, '큼'],
  ['행복채움요양병원', '요양병원', true, true, '보통'],
  ['늘푸른요양병원', '요양병원', true, true, '보통'],
  ['참편한요양병원', '요양병원', true, true, '큼'],
  ['소망요양병원', '요양병원', true, true, '보통'],
  ['양지요양병원', '요양병원', true, true, '보통'],
  ['다온요양병원', '요양병원', true, true, '보통'],
  ['한울요양병원', '요양병원', true, true, '큼'],
  ['더사랑요양병원', '요양병원', true, true, '보통'],
  // 의원·장례식장·요양원 20 (의원 9 / 장례식장 5 / 요양원 6)
  ['연제365의원', '의원', true, false, '작음'],
  ['수영가정의학과의원', '의원', true, false, '작음'],
  ['동래내과의원', '의원', true, false, '작음'],
  ['부산정형외과의원', '의원', true, false, '보통'],
  ['하나피부과의원', '의원', true, false, '작음'],
  ['밝은eye안과의원', '의원', true, false, '작음'],
  ['우리이비인후과의원', '의원', true, false, '작음'],
  ['세란산부인과의원', '의원', true, false, '보통'],
  ['연세비뇨기과의원', '의원', true, false, '작음'],
  ['부산영락공원장례식장', '장례식장', true, false, '보통'],
  ['해운대추모관장례식장', '장례식장', true, false, '보통'],
  ['금정하늘장례식장', '장례식장', true, false, '작음'],
  ['서부산평안장례식장', '장례식장', true, false, '보통'],
  ['중앙추모장례식장', '장례식장', true, false, '작음'],
  ['은혜요양원', '요양원', false, true, '보통'],
  ['행복한집요양원', '요양원', false, true, '보통'],
  ['사랑채요양원', '요양원', false, true, '작음'],
  ['평화로운요양원', '요양원', false, true, '보통'],
  ['아름다운노년요양원', '요양원', false, true, '작음'],
  ['햇살가득요양원', '요양원', false, true, '보통'],
  // 치과 2
  ['연세본치과의원', '치과', true, false, '작음'],
  ['미소드림치과의원', '치과', true, false, '작음'],
  // 한의원·한방병원 3
  ['자생한방병원', '한방병원', true, false, '보통'],
  ['경희본한의원', '한의원', true, false, '작음'],
  ['편강한의원', '한의원', true, false, '작음'],
]

const districts = ['부산 동래구', '부산 연제구', '부산 해운대구', '부산 금정구', '부산 수영구', '부산 사상구', '부산 남구', '부산 강서구']
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
const cycles = ['주 3회', '주 2회', '주 2회', '주 1회', '월 2회']

function buildClients(): Client[] {
  return clientSeeds.map(([name, type, medical, diaper, storage], i): Client => {
    const district = districts[i % districts.length]
    const manager = `${lastNames[i % lastNames.length]}${['민수', '서연', '지훈', '하나', '도윤', '예린'][i % 6]}`
    const phone = `010-${pad((i * 37) % 90 + 10)}${pad((i * 13) % 90 + 10)}-${pad((i * 53) % 90 + 10)}${pad((i * 7) % 90 + 10)}`
    return {
      id: `c${pad(i + 1)}`,
      name,
      type,
      address: `${district} ${10 + ((i * 7) % 80)}로 ${1 + ((i * 3) % 40)}`,
      manager,
      phone,
      collectionCycle: cycles[i % cycles.length],
      collectsMedicalWaste: medical,
      collectsDiaper: diaper,
      storageSize: storage,
      note: i % 9 === 0 ? '엘리베이터 없음, 후문 이용' : i % 11 === 0 ? '오전 방문 선호' : '',
    }
  })
}

export const seedClients: Client[] = buildClients()

// ── 수거일정 생성 ────────────────────────────────────────────────────────────
// 오늘을 포함한 최근 약 6주간의 일정을 생성합니다.
// 오늘 일정은 "예정/완료/지연/긴급" 이 골고루 섞이도록 구성합니다.
const medicalVehicles = seedVehicles.filter((v) => v.wasteType === '의료폐기물')
const diaperVehicles = seedVehicles.filter((v) => v.wasteType === '일회용기저귀')

function pickVehicle(wasteType: WasteType, seed: number): Vehicle {
  const pool = wasteType === '의료폐기물' ? medicalVehicles : diaperVehicles
  return pool[seed % pool.length]
}

function buildSchedules(today: Date): Schedule[] {
  const schedules: Schedule[] = []
  let n = 0

  // 과거 5주치 완료 일정 (월 수거량 통계용) — 주중(월~금) 위주
  for (let dayOffset = -38; dayOffset < 0; dayOffset++) {
    const date = addDays(today, dayOffset)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue // 주말 제외
    // 하루에 거래처 5~7곳 방문
    const count = 5 + (Math.abs(dayOffset) % 3)
    for (let k = 0; k < count; k++) {
      const client = seedClients[(Math.abs(dayOffset) * 7 + k * 3) % seedClients.length]
      const wasteType: WasteType =
        client.collectsMedicalWaste && (!client.collectsDiaper || k % 2 === 0)
          ? '의료폐기물'
          : '일회용기저귀'
      const vehicle = pickVehicle(wasteType, n)
      const expected =
        wasteType === '의료폐기물' ? 120 + ((n * 17) % 180) : 220 + ((n * 23) % 260)
      schedules.push({
        id: `s${pad(n + 1)}`,
        date: toDateStr(date),
        clientId: client.id,
        wasteType,
        vehicleId: vehicle.id,
        scheduledTime: `${pad(9 + (k % 7))}:${k % 2 === 0 ? '00' : '30'}`,
        status: '완료',
        expectedAmount: expected,
        actualAmount: Math.round(expected * (0.9 + ((n % 5) * 0.04))),
        completedAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9 + (k % 7), 20).toISOString(),
        memo: '',
      })
      n++
    }
  }

  // 오늘 일정 — 상태 다양화
  const todayPlan: Array<{ ci: number; waste: WasteType; status: Schedule['status']; time: string }> = [
    { ci: 0, waste: '의료폐기물', status: '완료', time: '09:00' },
    { ci: 10, waste: '의료폐기물', status: '완료', time: '09:40' },
    { ci: 24, waste: '의료폐기물', status: '긴급', time: '10:10' },
    { ci: 14, waste: '일회용기저귀', status: '지연', time: '10:30' },
    { ci: 1, waste: '의료폐기물', status: '예정', time: '11:00' },
    { ci: 15, waste: '일회용기저귀', status: '예정', time: '11:40' },
    { ci: 40, waste: '의료폐기물', status: '예정', time: '13:10' },
    { ci: 11, waste: '일회용기저귀', status: '예정', time: '13:50' },
    { ci: 2, waste: '의료폐기물', status: '예정', time: '14:30' },
    { ci: 35, waste: '일회용기저귀', status: '예정', time: '15:10' },
  ]
  for (const p of todayPlan) {
    const client = seedClients[p.ci]
    const vehicle = pickVehicle(p.waste, n)
    const expected = p.waste === '의료폐기물' ? 150 + ((n * 13) % 160) : 260 + ((n * 19) % 240)
    const done = p.status === '완료'
    schedules.push({
      id: `s${pad(n + 1)}`,
      date: toDateStr(today),
      clientId: client.id,
      wasteType: p.waste,
      vehicleId: vehicle.id,
      scheduledTime: p.time,
      status: p.status,
      expectedAmount: expected,
      actualAmount: done ? Math.round(expected * 0.96) : null,
      completedAt: done
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), Number(p.time.slice(0, 2)), 25).toISOString()
        : null,
      memo: p.status === '긴급' ? '보관량 초과 — 우선 방문 요청' : p.status === '지연' ? '도로 통제로 지연' : '',
    })
    n++
  }

  // 내일~모레 예정 일정 (오늘 일정 화면에서 날짜 이동 확인용)
  for (let dayOffset = 1; dayOffset <= 2; dayOffset++) {
    const date = addDays(today, dayOffset)
    for (let k = 0; k < 5; k++) {
      const client = seedClients[(dayOffset * 9 + k * 5) % seedClients.length]
      const wasteType: WasteType = client.collectsMedicalWaste && k % 2 === 0 ? '의료폐기물' : '일회용기저귀'
      const finalWaste: WasteType =
        wasteType === '일회용기저귀' && !client.collectsDiaper ? '의료폐기물' : wasteType
      const vehicle = pickVehicle(finalWaste, n)
      const expected = finalWaste === '의료폐기물' ? 130 + ((n * 11) % 150) : 240 + ((n * 17) % 220)
      schedules.push({
        id: `s${pad(n + 1)}`,
        date: toDateStr(date),
        clientId: client.id,
        wasteType: finalWaste,
        vehicleId: vehicle.id,
        scheduledTime: `${pad(9 + k)}:00`,
        status: '예정',
        expectedAmount: expected,
        actualAmount: null,
        completedAt: null,
        memo: '',
      })
      n++
    }
  }

  return schedules
}

// ── 자재공급 생성 ────────────────────────────────────────────────────────────
function buildMaterials(today: Date): MaterialSupply[] {
  const materials: MaterialSupply[] = []
  let n = 0
  // 이번 달 정기 공급 + 추가요청 4~5건
  const plan = [
    { ci: 0, off: -20, add: false },
    { ci: 10, off: -18, add: false },
    { ci: 11, off: -15, add: true },
    { ci: 2, off: -12, add: false },
    { ci: 24, off: -10, add: true },
    { ci: 14, off: -8, add: false },
    { ci: 1, off: -6, add: true },
    { ci: 40, off: -4, add: false },
    { ci: 15, off: -2, add: true },
    { ci: 35, off: 0, add: true },
    { ci: 3, off: 0, add: false },
  ]
  for (const p of plan) {
    const client = seedClients[p.ci]
    const date = addDays(today, p.off)
    materials.push({
      id: `m${pad(n + 1)}`,
      date: toDateStr(date),
      clientId: client.id,
      boxCount: 10 + ((n * 7) % 40),
      vinylCount: 20 + ((n * 11) % 60),
      needleBoxCount: 5 + ((n * 3) % 20),
      isAdditionalRequest: p.add,
      memo: p.add ? '보관량 소진으로 추가 요청' : '정기 공급',
    })
    n++
  }
  return materials
}

// ── 결제관리 생성 ────────────────────────────────────────────────────────────
function buildPayments(today: Date): Payment[] {
  const thisMonth = toMonthStr(today)
  const lastMonth = toMonthStr(addDays(new Date(today.getFullYear(), today.getMonth(), 1), -1))
  const payments: Payment[] = []
  let n = 0

  // 청구 대상 거래처 (수거가 활발한 상위 30곳)
  const billable = seedClients.slice(0, 30)
  for (const client of billable) {
    const base = client.type === '병원' || client.type === '요양병원' ? 1_200_000 : 450_000
    const amount = base + ((n * 37) % 9) * 50_000
    // 지난달: 대부분 입금완료, 일부 미수금
    payments.push({
      id: `p${pad(n + 1)}`,
      clientId: client.id,
      billingMonth: lastMonth,
      amount,
      status: n % 7 === 0 ? '미수금' : '입금완료',
      method: n % 3 === 0 ? '무통장' : n % 3 === 1 ? '카드요청' : '기타',
      paidAt: n % 7 === 0 ? null : new Date(today.getFullYear(), today.getMonth() - 1, 25).toISOString(),
      memo: '',
    })
    n++
  }
  // 이번달 청구 — 미수금/확인필요 다수
  for (const client of billable) {
    const base = client.type === '병원' || client.type === '요양병원' ? 1_200_000 : 450_000
    const amount = base + ((n * 41) % 9) * 50_000
    const status: Payment['status'] = n % 4 === 0 ? '입금완료' : n % 5 === 0 ? '확인필요' : '미수금'
    payments.push({
      id: `p${pad(n + 1)}`,
      clientId: client.id,
      billingMonth: thisMonth,
      amount,
      status,
      method: n % 3 === 0 ? '무통장' : n % 3 === 1 ? '카드요청' : '기타',
      paidAt: status === '입금완료' ? new Date().toISOString() : null,
      memo: status === '확인필요' ? '입금자명 불일치 확인 필요' : '',
    })
    n++
  }
  return payments
}

// ── 전체 시드 빌더 ───────────────────────────────────────────────────────────
export function buildSeedData(today = new Date()): AppData {
  // 시간 부분 제거 (날짜만 사용)
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return {
    clients: seedClients,
    vehicles: seedVehicles,
    schedules: buildSchedules(base),
    materials: buildMaterials(base),
    payments: buildPayments(base),
  }
}
