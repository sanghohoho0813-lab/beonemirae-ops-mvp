import type { AppData, Client, Schedule, WasteType } from '../types'
import { today } from './format'
import { addDays } from './performance'
import { WEEKDAY_LABEL, weekdayOf } from './schedulePlan'

// ─────────────────────────────────────────────────────────────────────────────
// 동선 점검 — 요일 쏠림과 「같은 날 묶을 수 있는 곳」
//
//  이사님 조사표에 이런 줄이 있었습니다.
//
//    5506호   월 14곳 / 화 4곳
//    9844호   월 6 · 화 6 · 수 6 · 목 3 · 금 4
//
//  월요일에 몰려 있습니다. 몰린 날은 늦게 끝나고, 예상보다 폐기물이 많이
//  나오면 그날 다 못 돕니다(조사 답변: 「전체 수거 불가 → 이후 추가 수거」).
//  반대편 요일은 차가 여유가 있는데도 그대로 나갑니다.
//
// ── 무엇을 계산하고, 무엇을 계산하지 않는가 ─────────────────────────────────
//
//  계산합니다
//   · 요일별로 실제 몇 곳을 갔는가 — **완료된 수거 기록**에서 셉니다.
//   · 어느 요일이 몰렸고 어느 요일이 비었는가.
//   · 몰린 날의 어느 거래처가, 비어 있는 날에 **그 차가 이미 가는 시군구**에
//     있는가.
//
//  계산하지 않습니다
//   · **거리(km)와 소요시간.** 거래처 좌표가 없습니다. 주소는 글자일 뿐이라
//     「몇 km 줄어듭니다」를 말할 수 없습니다. 지어낸 km 를 화면에 띄우면
//     그 숫자로 판단하시게 됩니다.
//   · 최적 경로 순서. 같은 이유입니다.
//
//  그래서 이 화면이 말할 수 있는 것은 딱 하나입니다 —
//  **「같은 차가 그날 이미 그 동네에 갑니다」.** 그 이상은 말하지 않습니다.
//
// ── 옮겨도 되는 곳만 제안합니다 ─────────────────────────────────────────────
//
//  수거 날짜를 미루면 병원 안에 폐기물이 더 오래 쌓입니다. 그래서 조건을
//  전부 통과한 것만 제안합니다(하나라도 걸리면 제안하지 않고, 왜 뺐는지
//  남깁니다).
//
//   1. 그 거래처의 완료 기록이 MIN_VISITS 회 이상 — 패턴을 알 수 있을 만큼.
//   2. 옮길 요일이 **같은 주의 더 뒤쪽**. 월→화는 되고 목→월은 안 됩니다.
//      뒤로 옮기면 그 주 간격이 한 번 짧아졌다가 제자리로 돌아옵니다.
//      앞으로 당기면 전환되는 주에 간격이 한 번 **길어집니다** — 보관기한이
//      걸리는 쪽이라 자동으로 권하지 않습니다.
//   3. 보관창고가 「작음」인 곳은 뺍니다. 하루도 더 못 쌓는 곳입니다.
//   4. 옮길 요일에 **같은 차가 같은 시군구를 이미 갑니다.**
//   5. 옮겨도 그 요일이 이 차의 기존 최대 정차 수를 넘지 않습니다 —
//      한쪽을 풀자고 다른 쪽에 새 봉우리를 만들면 안 됩니다.
//   6. 평균까지만 덜어냅니다. 몰린 날을 평균 밑으로 깎지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 몇 주치를 보는가 — 12주 (schedulePlan 과 같은 창) */
export const LOOKBACK_DAYS = 84

/** 이 정도는 가 봤어야 「이 거래처의 요일」이라고 말할 수 있습니다 */
export const MIN_VISITS = 3

/** 요일이 이만큼은 차이 나야 「쏠렸다」고 봅니다 (몰린 날 − 빈 날, 곳 수) */
export const MIN_GAP = 3

// ── 주소에서 시군구 읽기 ────────────────────────────────────────────────────
//
//  좌표가 없으니 글자로 묶는 수밖에 없습니다. **주소에 적힌 것만** 씁니다 —
//  「가까울 것 같다」는 짐작은 넣지 않습니다.
//
//   경기도 남양주시 오남읍 양지로 47-35   → 남양주시 · 오남읍
//   서울특별시 강남구 역삼동 …            → 강남구 · 역삼동
//   경기도 성남시 분당구 …                → 성남시 분당구 (구까지 붙입니다)
//
//  못 읽으면 null 입니다. 못 읽은 주소는 제안에서 빠집니다 — 「모르니까
//  아마 같은 동네」로 밀어 넣으면 엉뚱한 곳을 옮기게 됩니다.

const SIDO = /(특별시|광역시|특별자치시|특별자치도|[가-힣]도)$/
const SIGUNGU = /(시|군|구)$/
const EUPMYEONDONG = /(읍|면|동|가|리)$/

//  「서울시 송파구」처럼 광역시를 줄여 쓴 주소가 많습니다. 이걸 그냥 두면
//  「성남시 분당구」와 같은 규칙에 걸려 `서울시 송파구` 가 통째로 한 권역이
//  됩니다 — 서울 전체가 한 동네가 되는 셈입니다.
//
//  ⚠ 「광주시」는 두 곳입니다. 광주광역시와 **경기도 광주시**.
//    뒤에 구가 오면 광역시(광주시 남구), 아니면 경기도 광주시로 읽습니다
//    (경기도 광주시에는 자치구가 없습니다).
const METRO = /^(서울|부산|인천|대구|대전|광주|울산|세종)시$/

export interface Region {
  /** 묶는 기준 — 「남양주시」 또는 「성남시 분당구」 */
  key: string
  /** 더 자세한 자리 — 「오남읍」. 없을 수 있습니다 */
  detail: string
}

export function regionOf(address: string): Region | null {
  const parts = (address ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null

  //  시도는 건너뜁니다 — 「경기도」로 묶으면 남양주와 평택이 한 덩어리가 됩니다.
  let i = 0
  if (SIDO.test(parts[0])) i = 1
  else if (METRO.test(parts[0]) && parts[1]?.endsWith('구')) i = 1

  const first = parts[i]
  if (!first || !SIGUNGU.test(first)) return null

  //  「성남시 분당구」처럼 시 뒤에 구가 또 오면 둘을 합쳐야 실제 권역이 됩니다.
  let key = first
  let next = i + 1
  if (first.endsWith('시') && parts[next]?.endsWith('구')) {
    key = `${first} ${parts[next]}`
    next += 1
  }

  const detail = parts[next] && EUPMYEONDONG.test(parts[next]) ? parts[next] : ''
  return { key, detail }
}

// ── 요일별 부하 ─────────────────────────────────────────────────────────────

export interface DayLoad {
  /** 0=일 … 6=토 */
  weekday: number
  label: string
  /** 최근 창 안에서 이 요일에 실제로 간 곳 수 (연인원) */
  visits: number
  /** 이 요일이 실제로 있었던 주 수 — 이걸로 나눠야 「하루 몇 곳」이 됩니다 */
  weeks: number
  /** 하루 평균 몇 곳 (소수 1자리) */
  perDay: number
}

export interface VehicleSkew {
  vehicleId: string
  vehicleName: string
  driver: string
  wasteType: WasteType
  days: DayLoad[]
  /** 가장 몰린 요일 */
  peak: DayLoad | null
  /** 가장 비어 있는 요일 (그 차가 실제로 나가는 날 중에서) */
  light: DayLoad | null
  /** 나가는 날 하루 평균 몇 곳 */
  avgPerDay: number
  /** 몰린 날 − 빈 날 (곳 수) */
  gap: number
  /** 왜 판단을 못 했는지 — 기록이 모자랄 때 */
  blocked: string
}

/** 완료된 수거만 셉니다 — 예정은 아직 간 것이 아닙니다 */
function done(s: Schedule): boolean {
  return s.status === '완료'
}

function loadsOf(rows: Schedule[]): DayLoad[] {
  //  같은 요일이 창 안에 몇 번 있었는지도 세야 합니다. 12주 창에서 월요일이
  //  12번 있었는데 24곳을 갔으면 하루 2곳입니다 — 24곳이 아닙니다.
  const byDay = new Map<number, { visits: number; dates: Set<string> }>()
  for (const s of rows) {
    const w = weekdayOf(s.date)
    const cur = byDay.get(w) ?? { visits: 0, dates: new Set<string>() }
    cur.visits += 1
    cur.dates.add(s.date)
    byDay.set(w, cur)
  }
  return [...byDay.entries()]
    .map(([weekday, v]) => ({
      weekday,
      label: WEEKDAY_LABEL[weekday],
      visits: v.visits,
      weeks: v.dates.size,
      perDay: v.dates.size ? Math.round((v.visits / v.dates.size) * 10) / 10 : 0,
    }))
    .sort((a, b) => a.weekday - b.weekday)
}

/**
 * 차량별 요일 쏠림.
 *
 *  엑셀로 가져온 과거 기록에는 차량이 없습니다. 그런 기록은 차량별 계산에
 *  들어갈 수 없어, 차가 붙은 기록만으로 셉니다. 그래서 「기록 부족」이
 *  나올 수 있고, 그때는 그렇게 말합니다.
 */
export function vehicleSkews(data: AppData, asOf: string = today()): VehicleSkew[] {
  const from = addDays(asOf, -LOOKBACK_DAYS)
  const rows = data.schedules.filter((s) => done(s) && s.date >= from && s.date <= asOf)

  return data.vehicles.map((v): VehicleSkew => {
    const mine = rows.filter((s) => s.vehicleId === v.id)
    const days = loadsOf(mine)
    const base = {
      vehicleId: v.id, vehicleName: v.name, driver: v.driver, wasteType: v.wasteType, days,
    }
    if (mine.length < MIN_VISITS || days.length < 2) {
      return {
        ...base, peak: null, light: null, avgPerDay: 0, gap: 0,
        blocked:
          mine.length === 0
            ? '이 차로 완료된 기록이 최근 12주에 없습니다'
            : `기록이 ${mine.length}건뿐이라 요일을 말할 수 없습니다`,
      }
    }
    const sorted = [...days].sort((a, b) => b.perDay - a.perDay)
    const peak = sorted[0]
    const light = sorted[sorted.length - 1]
    const avgPerDay = Math.round((days.reduce((s, d) => s + d.perDay, 0) / days.length) * 10) / 10
    return {
      ...base, peak, light, avgPerDay,
      gap: Math.round((peak.perDay - light.perDay) * 10) / 10,
      blocked: '',
    }
  })
}

/** 차량 구분 없이 회사 전체 요일 부하 — 엑셀 기록처럼 차가 없는 것도 셉니다 */
export function companyDayLoads(data: AppData, asOf: string = today()): DayLoad[] {
  const from = addDays(asOf, -LOOKBACK_DAYS)
  return loadsOf(data.schedules.filter((s) => done(s) && s.date >= from && s.date <= asOf))
}

// ── 옮길 수 있는 곳 ─────────────────────────────────────────────────────────

export interface MoveSuggestion {
  clientId: string
  clientName: string
  vehicleId: string
  vehicleName: string
  wasteType: WasteType
  /** 지금 가는 요일 */
  fromWeekday: number
  fromLabel: string
  /** 옮길 요일 */
  toWeekday: number
  toLabel: string
  /** 이 거래처의 시군구 */
  region: string
  /** 옮길 요일에 그 차가 이미 가는 같은 시군구 거래처 수 */
  sameRegionOnTarget: number
  /** 그 거래처를 최근 창에서 몇 번 갔는가 */
  visits: number
  /** 옮기면 요일이 어떻게 되는가 (곳/일) */
  afterFrom: number
  afterTo: number
  /** 화면에 그대로 나가는 근거 한 문장 */
  basis: string
}

export interface SkipReason {
  clientName: string
  reason: string
}

export interface RouteReview {
  asOf: string
  from: string
  /** 차량별 쏠림 */
  skews: VehicleSkew[]
  /** 회사 전체 요일 부하 */
  company: DayLoad[]
  suggestions: MoveSuggestion[]
  /** 후보였지만 조건에 걸려 뺀 것 — 왜 뺐는지 보여 줍니다 */
  skipped: SkipReason[]
  /** 주소를 읽지 못해 아예 검토도 못 한 거래처 수 */
  noAddress: number
}

/**
 * 몰린 요일에서 비어 있는 요일로 옮길 수 있는 거래처를 찾습니다.
 *
 *  **읽기만 합니다.** 아무것도 바꾸지 않습니다 — 옮길지 말지는 사람이
 *  정합니다.
 */
export function reviewRoutes(data: AppData, asOf: string = today()): RouteReview {
  const from = addDays(asOf, -LOOKBACK_DAYS)
  const rows = data.schedules.filter((s) => done(s) && s.date >= from && s.date <= asOf)
  const clientById = new Map<string, Client>(data.clients.map((c) => [c.id, c]))
  const skews = vehicleSkews(data, asOf)

  const suggestions: MoveSuggestion[] = []
  const skipped: SkipReason[] = []
  const noAddressIds = new Set<string>()

  for (const sk of skews) {
    if (!sk.peak || !sk.light) continue
    if (sk.gap < MIN_GAP) continue
    //  ② 같은 주의 뒤쪽으로만 옮깁니다. 빈 날이 몰린 날보다 앞이면 손대지
    //     않습니다 — 전환되는 주에 간격이 길어집니다.
    if (sk.light.weekday <= sk.peak.weekday) continue

    const mine = rows.filter((s) => s.vehicleId === sk.vehicleId)
    const onPeak = mine.filter((s) => weekdayOf(s.date) === sk.peak!.weekday)
    const onLight = mine.filter((s) => weekdayOf(s.date) === sk.light!.weekday)

    //  옮길 요일에 이 차가 이미 가는 시군구
    const targetRegions = new Map<string, number>()
    for (const id of new Set(onLight.map((s) => s.clientId))) {
      const r = regionOf(clientById.get(id)?.address ?? '')
      if (!r) continue
      targetRegions.set(r.key, (targetRegions.get(r.key) ?? 0) + 1)
    }

    //  몰린 요일에 가는 거래처 — 몇 번 갔는지와 함께
    const peakVisits = new Map<string, number>()
    for (const s of onPeak) peakVisits.set(s.clientId, (peakVisits.get(s.clientId) ?? 0) + 1)

    //  ⑥ 평균까지만 덜어냅니다.
    const room = Math.floor(sk.peak.perDay - sk.avgPerDay)
    //  ⑤ 이 차가 지금까지 하루에 가장 많이 간 곳 수 — 새 봉우리를 만들지 않습니다.
    const ceiling = Math.max(...sk.days.map((d) => d.perDay))

    //  ⚠ 조건에 걸린 것을 만나면 **거기서 멈추지 않고 끝까지 봅니다.**
    //    예전에는 자리가 차면 그대로 빠져나왔는데, 그러면 뒤에 있는
    //    거래처는 검토조차 안 된 채 화면에서 사라집니다. 「왜 얘는 없지」에
    //    답할 수 없고, 검사도 「제안 안 함」을 통과시켜 버립니다 —
    //    실제로는 보지도 않은 것인데 말입니다.
    const eligible: Array<{ clientId: string; name: string; region: Region; same: number; visits: number }> = []
    const candidates = [...peakVisits.entries()].sort((a, b) => b[1] - a[1])
    for (const [clientId, visits] of candidates) {
      const c = clientById.get(clientId)
      const name = c?.name ?? '거래처'

      if (visits < MIN_VISITS) {
        skipped.push({ clientName: name, reason: `이 차로 ${visits}번밖에 안 가서 요일을 말할 수 없습니다` })
        continue
      }
      if (c?.storageSize === '작음') {
        skipped.push({ clientName: name, reason: '보관창고가 작아 하루도 더 못 쌓습니다' })
        continue
      }
      const r = regionOf(c?.address ?? '')
      if (!r) {
        noAddressIds.add(clientId)
        continue
      }
      const same = targetRegions.get(r.key) ?? 0
      if (same === 0) {
        skipped.push({
          clientName: name,
          reason: `${sk.light.label}요일에 ${sk.vehicleName}가 ${r.key}에 안 갑니다 — 옮기면 그 동네만 따로 가게 됩니다`,
        })
        continue
      }
      eligible.push({ clientId, name, region: r, same, visits })
    }

    //  ⑤⑥ 자리가 되는 만큼만 실제 제안으로 올립니다. 남은 것은 「이번에는
    //     여기까지」라고 밝힙니다 — 조용히 지우면 빠뜨린 것과 구분이 안 됩니다.
    let moved = 0
    for (const e of eligible) {
      const afterTo = Math.round((sk.light.perDay + moved + 1) * 10) / 10
      if (afterTo > ceiling) {
        skipped.push({
          clientName: e.name,
          reason: `${sk.light.label}요일이 ${afterTo}곳이 되어 지금 가장 많은 날(${ceiling}곳)을 넘습니다`,
        })
        continue
      }
      if (moved >= room) {
        skipped.push({
          clientName: e.name,
          reason:
            `옮길 수는 있지만 이번에는 뺐습니다 — ${sk.vehicleName}의 나가는 날 평균이 ` +
            `${sk.avgPerDay}곳이라 ${sk.peak.label}요일을 평균 밑으로는 깎지 않습니다`,
        })
        continue
      }

      const { clientId, name, region: r, same, visits } = e
      moved += 1
      const afterFrom = Math.round((sk.peak.perDay - moved) * 10) / 10
      suggestions.push({
        clientId, clientName: name,
        vehicleId: sk.vehicleId, vehicleName: sk.vehicleName, wasteType: sk.wasteType,
        fromWeekday: sk.peak.weekday, fromLabel: sk.peak.label,
        toWeekday: sk.light.weekday, toLabel: sk.light.label,
        region: r.key, sameRegionOnTarget: same, visits,
        afterFrom, afterTo,
        basis:
          `${sk.vehicleName}는 ${sk.peak.label}요일 ${sk.peak.perDay}곳 · ` +
          `${sk.light.label}요일 ${sk.light.perDay}곳입니다. ` +
          `${name}은 ${r.key}이고, ${sk.light.label}요일에 ${sk.vehicleName}가 ${r.key} ${same}곳을 이미 갑니다 ` +
          `(최근 12주 실제 기록). 옮기면 ${sk.peak.label} ${afterFrom}곳 · ${sk.light.label} ${afterTo}곳.`,
      })
    }
  }

  return {
    asOf, from,
    skews,
    company: companyDayLoads(data, asOf),
    suggestions,
    skipped,
    noAddress: noAddressIds.size,
  }
}
