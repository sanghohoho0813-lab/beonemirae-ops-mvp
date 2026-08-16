// ─────────────────────────────────────────────────────────────────────────────
// 도입 전 실제 업무 조사 — 이사님 답변 (2026-08)
//
//  지금까지 「도입 전 기준값」은 대표님이 감으로 넣거나, 시연용 예시값이
//  들어가 있었습니다. 심사 자리에서 「이 숫자 어디서 났습니까」를 물으면
//  답할 것이 없었습니다.
//
//  아래는 **이사님이 실제로 적어 주신 표와 답변을 그대로 옮긴 것**입니다.
//  숫자를 고치지 않았고, 없는 칸은 null 로 둡니다(그날 그 차가 안 나간
//  것입니다 — 0 이라고 적으면 「나갔는데 한 곳도 못 갔다」가 됩니다).
//
//  ⚠ 여기서 파생값(월 몇 시간, 하루 평균 몇 곳)을 만들 때는 **어떻게 나온
//    숫자인지**를 함께 냅니다. 파생값만 화면에 띄우면 그것이 다시 원본처럼
//    쓰이고, 몇 달 뒤에는 아무도 근거를 못 댑니다.
// ─────────────────────────────────────────────────────────────────────────────

export type Weekday = '일' | '월' | '화' | '수' | '목' | '금'

export interface SurveyVehicle {
  /** 차량 번호 뒷자리 — 이사님 표의 이름 그대로 */
  no: string
  /** 적재 톤수 표기 그대로 */
  tonnage: string
  waste: '의료폐기물' | '사업장기저귀폐기물'
  /** 요일별 방문 병원 수 (그날 안 나갔으면 null) */
  visits: Partial<Record<Weekday, number>>
  /** 요일별 이동거리 km (그날 안 나갔으면 null) */
  km: Partial<Record<Weekday, number>>
}

export const SURVEY_TAKEN_ON = '2026-08'
export const SURVEY_SOURCE = '이사님 업무 조사 답변 (차량별 하루 방문 개수 및 이동거리)'

/** 1. 차량별 하루 거래처 방문 개수 및 이동거리 — 표 그대로 */
export const SURVEY_VEHICLES: SurveyVehicle[] = [
  {
    no: '9844', tonnage: '3.5톤', waste: '의료폐기물',
    visits: { 월: 6, 화: 6, 수: 6, 목: 3, 금: 4 },
    km: { 월: 174, 화: 196, 수: 272, 목: 190, 금: 160 },
  },
  {
    no: '5506', tonnage: '1톤', waste: '의료폐기물',
    visits: { 월: 14, 화: 4 },
    km: { 월: 210, 화: 169 },
  },
  {
    no: '7432', tonnage: '1톤', waste: '의료폐기물',
    visits: { 수: 5, 목: 4, 금: 4 },
    km: { 수: 178, 목: 143, 금: 193 },
  },
  {
    no: '6730', tonnage: '1톤', waste: '사업장기저귀폐기물',
    visits: { 일: 4, 월: 4, 화: 5, 수: 4, 목: 6 },
    km: { 일: 227, 월: 210, 화: 210, 수: 234, 목: 205 },
  },
  {
    no: '9188', tonnage: '1톤', waste: '사업장기저귀폐기물',
    visits: { 월: 6, 수: 4, 금: 5 },
    km: { 월: 268, 수: 197, 금: 258 },
  },
]

export const WEEKDAYS: Weekday[] = ['일', '월', '화', '수', '목', '금']

/** 2·3. 하루에 사람이 붙잡고 있는 시간 — 답변에 적힌 범위 그대로 */
export interface SurveyTask {
  label: string
  /** 하루 최소 시간 */
  minH: number
  /** 하루 최대 시간 */
  maxH: number
  /** 주 며칠 하는가 (일요일 제외 = 6) */
  daysPerWeek: number
  /** 답변 원문 */
  quote: string
}

export const SURVEY_TASKS: SurveyTask[] = [
  {
    label: '배차 일정관리',
    minH: 0.5, maxH: 40 / 60, daysPerWeek: 6,
    quote: '일요일 제외 30~40분 소요',
  },
  {
    label: '수거 일정관리',
    minH: 1, maxH: 1, daysPerWeek: 6,
    quote: '일요일 제외 1시간 소요',
  },
  {
    label: '수거내역·거래명세서 엑셀 정리',
    minH: 2, maxH: 3, daysPerWeek: 6,
    quote: '일요일을 제외하고 2시간~3시간 소요',
  },
]

/** 4. 당일수거 정상 완료 건수 */
export const SURVEY_ON_TIME_PCT = 99
export const SURVEY_ON_TIME_QUOTE =
  '99% 일정 소화 (간혹, 예상보다 폐기물이 많이 나올 경우 전체 수거 불가 → 이후 추가 수거 진행 또는 차주에 함께 수거)'

/** 한 주에 실제로 일이 있었던 날 수 (표에 값이 있는 요일) */
export function activeDays(v: SurveyVehicle): number {
  return WEEKDAYS.filter((d) => v.visits[d] != null).length
}

export interface SurveyTotals {
  /** 한 주 전체 방문 병원 수 (모든 차량 합) */
  weekVisits: number
  /** 한 주 전체 이동거리 km */
  weekKm: number
  /** 실제로 차가 나간 「차량×요일」 칸 수 */
  vehicleDays: number
  /** 차 한 대가 하루 나가면 평균 몇 곳 (소수 1자리) */
  visitsPerVehicleDay: number
  /** 차 한 대가 하루 나가면 평균 몇 km */
  kmPerVehicleDay: number
  /** 요일별 회사 전체 방문 수 */
  byDay: Array<{ day: Weekday; visits: number; km: number }>
  /** 월~금 회사 전체 하루 평균 방문 수 — 일요일은 한 대만 나가 평균을 왜곡합니다 */
  weekdayAvgVisits: number
  /** 사람이 하루에 붙잡고 있는 시간 (최소~최대) */
  dailyAdminMinH: number
  dailyAdminMaxH: number
  /** 한 달 기준 (주 6일 × 4.345주) — 어떻게 나왔는지 화면에 함께 적습니다 */
  monthlyAdminMinH: number
  monthlyAdminMaxH: number
}

/** 한 달에 몇 주인가 — 365 ÷ 7 ÷ 12 */
export const WEEKS_PER_MONTH = 4.345

export function surveyTotals(
  vehicles: SurveyVehicle[] = SURVEY_VEHICLES,
  tasks: SurveyTask[] = SURVEY_TASKS,
): SurveyTotals {
  const byDay = WEEKDAYS.map((day) => ({
    day,
    visits: vehicles.reduce((s, v) => s + (v.visits[day] ?? 0), 0),
    km: vehicles.reduce((s, v) => s + (v.km[day] ?? 0), 0),
  }))
  const weekVisits = byDay.reduce((s, d) => s + d.visits, 0)
  const weekKm = byDay.reduce((s, d) => s + d.km, 0)
  const vehicleDays = vehicles.reduce((s, v) => s + activeDays(v), 0)

  //  일요일은 차 한 대만 나갑니다. 평일 평균에 섞으면 하루 처리량이
  //  실제보다 낮아 보입니다.
  const weekdays = byDay.filter((d) => d.day !== '일')
  const weekdayAvgVisits =
    Math.round((weekdays.reduce((s, d) => s + d.visits, 0) / weekdays.length) * 10) / 10

  const dailyAdminMinH = tasks.reduce((s, t) => s + t.minH, 0)
  const dailyAdminMaxH = tasks.reduce((s, t) => s + t.maxH, 0)
  //  주 며칠 하는지가 일마다 다를 수 있으므로 일별로 곱합니다.
  const monthMin = tasks.reduce((s, t) => s + t.minH * t.daysPerWeek * WEEKS_PER_MONTH, 0)
  const monthMax = tasks.reduce((s, t) => s + t.maxH * t.daysPerWeek * WEEKS_PER_MONTH, 0)

  const r1 = (n: number) => Math.round(n * 10) / 10
  return {
    weekVisits,
    weekKm,
    vehicleDays,
    visitsPerVehicleDay: vehicleDays ? r1(weekVisits / vehicleDays) : 0,
    kmPerVehicleDay: vehicleDays ? Math.round(weekKm / vehicleDays) : 0,
    byDay,
    weekdayAvgVisits,
    dailyAdminMinH: r1(dailyAdminMinH),
    dailyAdminMaxH: r1(dailyAdminMaxH),
    monthlyAdminMinH: Math.round(monthMin),
    monthlyAdminMaxH: Math.round(monthMax),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 조사 답변 → 「도입 전 기준값」
//
//  답변에 없는 칸은 **채우지 않습니다.** 반복 입력 횟수와 월 누락·재확인
//  건수는 이번 조사에 없었습니다 — 비워 두면 화면이 「기준값 입력 필요」라고
//  말해 줍니다. 넉넉히 지어 넣는 것보다 그 편이 낫습니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface SurveyBaselineField {
  key: 'adminMinutesPerCollection' | 'monthlyDocHours' | 'dailyCapacity'
  value: number
  /** 이 숫자가 어떻게 나왔는지 — 화면에 그대로 나갑니다 */
  how: string
}

/** 조사 답변으로 채울 수 있는 칸과, 그 값이 나온 계산 */
export function surveyBaselineFields(t: SurveyTotals = surveyTotals()): SurveyBaselineField[] {
  //  하루 사무시간을 그날 방문한 곳 수로 나눕니다. **적게 잡은 쪽**(최소)을
  //  씁니다 — 도입 전 값을 크게 잡으면 나중에 개선폭이 부풀려집니다.
  const perVisit = Math.round(((t.dailyAdminMinH * 60) / t.weekdayAvgVisits) * 10) / 10
  return [
    {
      key: 'adminMinutesPerCollection',
      value: perVisit,
      how:
        `하루 사무 ${t.dailyAdminMinH}시간(${t.dailyAdminMinH * 60}분) ÷ 평일 하루 방문 ` +
        `${t.weekdayAvgVisits}곳 = ${perVisit}분 · 적게 잡은 쪽`,
    },
    {
      key: 'monthlyDocHours',
      value: t.monthlyAdminMinH,
      how:
        `하루 ${t.dailyAdminMinH}~${t.dailyAdminMaxH}시간 × 주 6일 × ${WEEKS_PER_MONTH}주 = ` +
        `월 ${t.monthlyAdminMinH}~${t.monthlyAdminMaxH}시간 · 적게 잡은 ${t.monthlyAdminMinH}시간`,
    },
    {
      key: 'dailyCapacity',
      value: t.weekdayAvgVisits,
      how: `월~금 회사 전체 방문 ${t.byDay.filter((d) => d.day !== '일').map((d) => d.visits).join('+')} ÷ 5일`,
    },
  ]
}
