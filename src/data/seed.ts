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
//  · 기본: 사업계획서 기재 실제 주요거래처 5곳 (isDemoGenerated=false)
//  · 확장: 시연용 가상 거래처 최대 30곳 (isDemoGenerated=true)
//  · 차량 5대 / 월평균 105톤 등 사업계획서 핵심 수치는 유지
//  수거일정·자재·결제는 선택된 거래처 세트 기준으로 "앱 실행일"에 맞춰 생성됩니다.
// ─────────────────────────────────────────────────────────────────────────────

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
  { id: 'v1', name: '의료폐기물 1톤 A', wasteType: '의료폐기물', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 670, driver: '김현수' },
  { id: 'v2', name: '의료폐기물 1톤 B', wasteType: '의료폐기물', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 670, driver: '박정민' },
  { id: 'v3', name: '의료폐기물 3.5톤', wasteType: '의료폐기물', tonnage: 3.5, nominalCapacity: 2500, expectedCapacity: 1670, driver: '이상호' },
  { id: 'v4', name: '일회용기저귀 1톤 A', wasteType: '일회용기저귀', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 750, driver: '최영재' },
  { id: 'v5', name: '일회용기저귀 1톤 B', wasteType: '일회용기저귀', tonnage: 1, nominalCapacity: 1000, expectedCapacity: 750, driver: '정대원' },
]

// ── 거래처 시드 정의 ─────────────────────────────────────────────────────────
// [이름, 유형, 의료폐기물, 기저귀, 창고크기, 수거주기, 담당부서]
// [이름, 유형, 의료폐기물, 기저귀, 창고크기, 수거주기, 담당부서, 권역(서울·경기권 시연 주소)]
type ClientSeed = [string, ClientType, boolean, boolean, StorageSize, string, string, string]

// 실제 주요거래처 5곳 (사업계획서 기재) — 서울·경기권, 담당자는 부서명, 사업자번호 미표시
const REAL_CLIENT_SEEDS: ClientSeed[] = [
  ['의료법인한양의료재단', '병원', true, false, '큼', '주 3회', '원무과', '경기 남양주시 오남읍'],
  ['센트럴서울요양병원', '요양병원', true, true, '큼', '주 2회', '관리팀', '서울 영등포구 문래동'],
  ['더원요양병원', '요양병원', true, true, '보통', '주 2회', '시설팀', '경기 용인시 기흥구'],
  ['남양주백병원', '병원', true, false, '보통', '주 2회', '총무팀', '경기 남양주시 다산동'],
  ['에이스병원', '병원', true, false, '보통', '주 1회', '원무과', '경기 구리시 인창동'],
]

// 시연용 확장 거래처 30곳 (가상) — 서울·경기권(남양주·구리·의정부·하남·양주·포천·용인·성남 / 서울 동북·중부권)
const DEMO_CLIENT_SEEDS: ClientSeed[] = [
  ['다산365의원', '의원', true, false, '작음', '주 1회', '접수실', '경기 남양주시 다산동'],
  ['별내우리요양병원', '요양병원', true, true, '큼', '주 2회', '관리팀', '경기 남양주시 별내동'],
  ['오남행복요양병원', '요양병원', true, true, '보통', '주 2회', '원무과', '경기 남양주시 오남읍'],
  ['진접사랑요양원', '요양원', false, true, '작음', '주 1회', '시설팀', '경기 남양주시 진접읍'],
  ['구리중앙내과의원', '의원', true, false, '작음', '주 1회', '접수실', '경기 구리시 인창동'],
  ['구리참좋은요양병원', '요양병원', true, true, '큼', '주 2회', '관리팀', '경기 구리시 교문동'],
  ['의정부서울정형외과의원', '의원', true, false, '보통', '주 1회', '원무과', '경기 의정부시 민락동'],
  ['의정부늘봄요양원', '요양원', false, true, '보통', '주 1회', '시설팀', '경기 의정부시 신곡동'],
  ['하남미사요양병원', '요양병원', true, true, '큼', '주 2회', '관리팀', '경기 하남시 미사동'],
  ['미사바른치과의원', '치과', true, false, '작음', '월 2회', '접수실', '경기 하남시 망월동'],
  ['양주은빛요양원', '요양원', false, true, '보통', '주 1회', '시설팀', '경기 양주시 옥정동'],
  ['포천한마음병원', '병원', true, false, '보통', '주 1회', '원무과', '경기 포천시 소흘읍'],
  ['용인더케어요양병원', '요양병원', true, true, '보통', '주 2회', '관리팀', '경기 용인시 기흥구'],
  ['성남우리요양병원', '요양병원', true, true, '보통', '주 2회', '관리팀', '경기 성남시 중원구'],
  ['노원365의원', '의원', true, false, '작음', '주 1회', '접수실', '서울 노원구 상계동'],
  ['중랑우리내과의원', '의원', true, false, '작음', '주 1회', '접수실', '서울 중랑구 면목동'],
  ['강동하늘요양병원', '요양병원', true, true, '큼', '주 2회', '관리팀', '서울 강동구 천호동'],
  ['송파연세치과의원', '치과', true, false, '작음', '월 2회', '접수실', '서울 송파구 문정동'],
  ['광진튼튼한의원', '한의원', true, false, '작음', '월 2회', '접수실', '서울 광진구 자양동'],
  ['동대문한방병원', '한방병원', true, false, '보통', '주 1회', '원무과', '서울 동대문구 전농동'],
  ['영등포센트럴요양병원', '요양병원', true, true, '큼', '주 2회', '관리팀', '서울 영등포구 당산동'],
  ['서울봄날의원', '의원', true, false, '작음', '주 1회', '접수실', '서울 노원구 중계동'],
  ['경기햇살요양원', '요양원', false, true, '보통', '주 1회', '시설팀', '경기 남양주시 화도읍'],
  ['남양주한빛장례식장', '장례식장', true, false, '보통', '주 1회', '시설팀', '경기 남양주시 와부읍'],
  ['구리평안장례식장', '장례식장', true, false, '보통', '주 1회', '시설팀', '경기 구리시 갈매동'],
  ['하남우리장례식장', '장례식장', true, false, '보통', '주 1회', '시설팀', '경기 하남시 신장동'],
  ['별내미소치과의원', '치과', true, false, '작음', '월 2회', '접수실', '경기 남양주시 별내동'],
  ['다산가정의학과의원', '의원', true, false, '작음', '월 2회', '접수실', '경기 남양주시 다산동'],
  ['진접한방병원', '한방병원', true, false, '보통', '주 1회', '원무과', '경기 남양주시 진접읍'],
  ['오남중앙의원', '의원', true, false, '작음', '주 1회', '접수실', '경기 남양주시 오남읍'],
]

function seedToClient([name, type, medical, diaper, storage, cycle, dept, region]: ClientSeed, i: number, demo: boolean): Client {
  const phone = `010-${pad((i * 37) % 90 + 10)}${pad((i * 13) % 90 + 10)}-${pad((i * 53) % 90 + 10)}${pad((i * 7) % 90 + 10)}`
  return {
    id: `${demo ? 'd' : 'r'}${pad(i + 1)}`,
    name,
    type,
    address: `${region} ${1 + ((i * 7) % 80)}-${1 + ((i * 3) % 30)}`,
    manager: dept,
    phone,
    collectionCycle: cycle,
    collectsMedicalWaste: medical,
    collectsDiaper: diaper,
    storageSize: storage,
    note: i % 9 === 0 ? '엘리베이터 없음, 후문 이용' : i % 11 === 0 ? '오전 방문 선호' : '',
    isDemoGenerated: demo,
  }
}

/** 거래처 = 실제 5곳 + 시연용 demoCount곳 */
export function buildClients(demoCount = 0): Client[] {
  const real = REAL_CLIENT_SEEDS.map((s, i) => seedToClient(s, i, false))
  const demo = DEMO_CLIENT_SEEDS.slice(0, Math.max(0, demoCount)).map((s, i) => seedToClient(s, i, true))
  return [...real, ...demo]
}

/** 실제 5곳 */
export const seedClients: Client[] = buildClients(0)

// ── 일정/자재/결제 생성 (거래처 배열 기준, 소규모에도 안전) ──────────────────
const medicalVehicles = seedVehicles.filter((v) => v.wasteType === '의료폐기물')
const diaperVehicles = seedVehicles.filter((v) => v.wasteType === '일회용기저귀')

function pickVehicle(wasteType: WasteType, seed: number): Vehicle {
  const pool = wasteType === '의료폐기물' ? medicalVehicles : diaperVehicles
  return pool[seed % pool.length]
}

/** 거래처의 수거 가능 폐기물에 맞춘 구분 */
function wasteFor(client: Client, preferDiaper: boolean): WasteType {
  if (preferDiaper && client.collectsDiaper) return '일회용기저귀'
  if (client.collectsMedicalWaste) return '의료폐기물'
  if (client.collectsDiaper) return '일회용기저귀'
  return '의료폐기물'
}

function buildSchedules(clients: Client[], today: Date): Schedule[] {
  const schedules: Schedule[] = []
  const len = clients.length
  if (len === 0) return schedules
  let n = 0

  // 과거 5주 완료 일정 (통계용)
  for (let dayOffset = -38; dayOffset < 0; dayOffset++) {
    const date = addDays(today, dayOffset)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue
    const count = Math.min(len, 5 + (Math.abs(dayOffset) % 3))
    for (let k = 0; k < count; k++) {
      const client = clients[(Math.abs(dayOffset) * 3 + k * 2) % len]
      const wasteType = wasteFor(client, k % 2 === 1)
      const vehicle = pickVehicle(wasteType, n)
      const expected = wasteType === '의료폐기물' ? 120 + ((n * 17) % 180) : 220 + ((n * 23) % 260)
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

  // 오늘 일정 — 시연 신뢰성을 위해 항상 완료 3 + 격리 긴급 1 + 지연 1 + 예정 다수로 채움
  const todayCount = Math.min(10, Math.max(6, len * 2))
  // 앞쪽 상태를 고정해 대시보드·오늘 일정·배차가 언제 열어도 풍부하게 보이도록 함
  const statuses: Schedule['status'][] = ['완료', '완료', '긴급', '완료', '지연', '예정', '예정', '예정', '예정', '예정']
  const times = ['08:50', '09:30', '10:00', '10:40', '11:20', '13:00', '13:40', '14:20', '15:00', '15:40']
  for (let k = 0; k < todayCount; k++) {
    const client = clients[k % len]
    const status = statuses[k % statuses.length]
    const isolation = status === '긴급'
    // 격리 긴급수거는 의료폐기물로 고정, 그 외는 거래처 배출물 기준
    const wasteType = isolation ? '의료폐기물' : wasteFor(client, k % 3 === 2)
    const vehicle = pickVehicle(wasteType, n)
    const expected = wasteType === '의료폐기물' ? 150 + ((n * 13) % 160) : 260 + ((n * 19) % 240)
    const done = status === '완료'
    const time = times[k % times.length]
    schedules.push({
      id: `s${pad(n + 1)}`,
      date: toDateStr(today),
      clientId: client.id,
      wasteType,
      vehicleId: vehicle.id,
      scheduledTime: time,
      status,
      expectedAmount: expected,
      actualAmount: done ? Math.round(expected * 0.96) : null,
      completedAt: done ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), Number(time.slice(0, 2)), 25).toISOString() : null,
      memo: isolation ? '격리의료폐기물 보관기한 임박 — 우선 수거 요청' : status === '지연' ? '도로 통제로 지연' : '',
    })
    n++
  }

  // 내일~모레 예정
  for (let dayOffset = 1; dayOffset <= 2; dayOffset++) {
    const date = addDays(today, dayOffset)
    const count = Math.min(len, 5)
    for (let k = 0; k < count; k++) {
      const client = clients[(dayOffset * 3 + k * 2) % len]
      const wasteType = wasteFor(client, k % 2 === 1)
      const vehicle = pickVehicle(wasteType, n)
      const expected = wasteType === '의료폐기물' ? 130 + ((n * 11) % 150) : 240 + ((n * 17) % 220)
      schedules.push({
        id: `s${pad(n + 1)}`,
        date: toDateStr(date),
        clientId: client.id,
        wasteType,
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

function buildMaterials(clients: Client[], today: Date): MaterialSupply[] {
  const materials: MaterialSupply[] = []
  const len = clients.length
  if (len === 0) return materials
  // 시연 신뢰성: 이번 달(오늘 포함) 자재공급이 항상 보이도록 최근일 위주로 생성
  const count = Math.min(12, Math.max(6, len))
  const offsets = [0, 0, -1, -3, -6, -9, -12, -15, -18, -21, -24, -27]
  const addFlags = [true, false, true, false, true, false, false, true, false, true, false, false]
  for (let i = 0; i < count; i++) {
    const client = clients[(i * 3) % len]
    const date = addDays(today, offsets[i % offsets.length])
    const add = addFlags[i % addFlags.length]
    materials.push({
      id: `m${pad(i + 1)}`,
      date: toDateStr(date),
      clientId: client.id,
      boxCount: 10 + ((i * 7) % 40),
      vinylCount: 20 + ((i * 11) % 60),
      needleBoxCount: 5 + ((i * 3) % 20),
      isAdditionalRequest: add,
      memo: add ? '보관량 소진으로 추가 요청' : '정기 공급',
    })
  }
  return materials
}

function buildPayments(clients: Client[], today: Date): Payment[] {
  const thisMonth = toMonthStr(today)
  const lastMonth = toMonthStr(addDays(new Date(today.getFullYear(), today.getMonth(), 1), -1))
  const payments: Payment[] = []
  const billable = clients.slice(0, Math.min(clients.length, 30))
  let n = 0
  for (const client of billable) {
    const base = client.type === '병원' || client.type === '요양병원' ? 1_200_000 : 450_000
    const amount = base + ((n * 37) % 9) * 50_000
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

// ── 전체 시드 빌더 (demoCount: 0/10/20/30) ──────────────────────────────────
export function buildSeedData(demoCount = 0, today = new Date()): AppData {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const clients = buildClients(demoCount)
  return {
    clients,
    vehicles: seedVehicles,
    schedules: buildSchedules(clients, base),
    materials: buildMaterials(clients, base),
    payments: buildPayments(clients, base),
  }
}

/**
 * 저장된 거래처는 그대로 유지하면서 일정/자재/결제만 "오늘" 기준으로 다시 생성합니다.
 * 과거에 저장된 시연 데이터의 '오늘 일정'이 비어 보이는 문제를 방지하기 위한 자가복구용.
 */
export function rebuildForToday(clients: Client[], today = new Date()): AppData {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return {
    clients,
    vehicles: seedVehicles,
    schedules: buildSchedules(clients, base),
    materials: buildMaterials(clients, base),
    payments: buildPayments(clients, base),
  }
}
