import type { AppData, Client } from '../types'
import { clientSchedules } from './ops'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 고른 것을 요청 한 줄로 (0089)
//
//  대표님: 「타이핑은 정말 필요한 경우에만」 · 「선택 → 선택 → 수량/일정
//  선택 → 완료 만으로 대부분의 업무를 끝낼 수 있도록」
//
//  ⚠ 고른 것을 **그대로** 적습니다. 저희가 살을 붙이지 않습니다 —
//    배차 담당이 읽는 글이고, 병원이 안 한 말이 섞이면 안 됩니다.
//
//  ⚠ 「소량 · 보통 · 많음」을 **kg 으로 지어내지 않습니다.**
//    그 병원의 **실제 최근 수거량 평균**이 있을 때만 그것을 기준으로
//    환산하고, 화면에도 「평소 118kg 기준」이라고 근거를 적습니다.
//    기록이 없으면 kg 은 비워 둡니다 — 「모름」입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 요청 성격 — 병원이 실제로 하는 말 그대로 */
export const PICKUP_REASONS = [
  { value: '정기 일정 외 추가 수거', label: '정기 일정 외 추가 수거' },
  { value: '예상보다 폐기물이 많이 발생', label: '예상보다 폐기물이 많이 발생' },
  { value: '기존 일정 앞당기기', label: '기존 일정 앞당기기' },
  { value: '기존 일정 늦추기', label: '기존 일정 늦추기' },
  { value: '특정 폐기물 별도 수거', label: '특정 폐기물 별도 수거' },
  { value: '기타', label: '기타' },
] as const

/** 긴급 사유 */
export const URGENT_REASONS = [
  { value: '격리의료폐기물 발생', label: '격리의료폐기물 발생' },
  { value: '예상보다 폐기물 급증', label: '예상보다 폐기물 급증' },
  { value: '보관 용량 부족', label: '보관 용량 부족' },
  { value: '연휴 전 수거 필요', label: '연휴 전 수거 필요' },
  { value: '당일 처리 필요', label: '당일 처리 필요' },
  { value: '일정 변경 필요', label: '일정 변경 필요' },
  { value: '기타', label: '기타' },
] as const

/**
 * 폐기물 종류 — **저장되는 값과 화면 글자가 다릅니다.**
 *
 *  ⚠ 「격리 의료폐기물」은 저장할 칸이 없습니다. `client_requests.waste_type`
 *    은 0087 에서 '의료폐기물' · '일회용기저귀' 둘만 받도록 막아 두었고,
 *    그건 `schedules.waste_type` 과 같은 말을 쓰기 위해서입니다.
 *    격리를 새 값으로 넣으면 세는 순간 갈래가 늘어납니다.
 *
 *  그래서 격리는 **유형은 의료폐기물로 저장하고, 요청 글에 적습니다.**
 *  배차 담당은 글에서 보고, 통계는 유형에서 셉니다. 둘 다 맞습니다.
 */
export interface WasteChoice {
  value: string
  label: string
  /** 실제로 저장할 유형 */
  store: '의료폐기물' | '일회용기저귀'
  /** 요청 글에 따로 적어야 하는 말 */
  note?: string
}

export function wasteChoicesFor(client: Client): WasteChoice[] {
  const out: WasteChoice[] = []
  if (client.collectsMedicalWaste) {
    out.push({ value: '일반', label: '일반 의료폐기물', store: '의료폐기물' })
    //  ⚠ 격리는 보관기한이 짧아 배차가 **가장 먼저 알아야 하는 것**입니다.
    out.push({
      value: '격리',
      label: '격리 의료폐기물',
      store: '의료폐기물',
      note: '격리 의료폐기물 포함',
    })
  }
  //  ⚠ 기저귀를 안 맡기는 병원에는 이 선택지를 안 보여 줍니다.
  if (client.collectsDiaper) {
    out.push({ value: '기저귀', label: '의료기관 일회용 기저귀', store: '일회용기저귀' })
  }
  return out
}

// ── 예상 배출량 ──────────────────────────────────────────────────────────────

export type AmountLevel = '소량' | '보통' | '많음' | '매우 많음'
export const AMOUNT_LEVELS: AmountLevel[] = ['소량', '보통', '많음', '매우 많음']

/** 「보통」을 그 병원의 평소 수거량으로 봅니다 */
const FACTOR: Record<AmountLevel, number> = {
  소량: 0.5,
  보통: 1,
  많음: 1.5,
  '매우 많음': 2.5,
}

export interface AmountAnchor {
  /** 최근 실제 수거량 평균 (kg). 기록이 없으면 null */
  usual: number | null
  /** 몇 건으로 낸 평균인가 — 근거를 화면에 적습니다 */
  from: number
}

/**
 * 「평소 얼마나 나오는가」 — **그 병원의 실제 기록에서만** 냅니다.
 *
 *  ⚠ 무게가 안 적힌 수거는 뺍니다. 0 으로 세면 평소보다 적게 잡히고,
 *    그러면 「많음」이 실제보다 작은 숫자가 됩니다.
 */
export function amountAnchor(data: AppData, client: Client, now = today()): AmountAnchor {
  const done = clientSchedules(data, client.id).filter(
    (s) => s.status === '완료' && s.date <= now && s.actualAmount != null && s.actualAmount > 0,
  )
  //  최근 12건까지만 봅니다 — 3년 전 습관은 지금과 다릅니다.
  const recent = done.slice(0, 12)
  if (recent.length < 3) return { usual: null, from: recent.length }
  const avg = recent.reduce((a, s) => a + (s.actualAmount ?? 0), 0) / recent.length
  return { usual: Math.round(avg), from: recent.length }
}

/** 고른 단계가 몇 kg 쯤인가 — 평소가 있을 때만 */
export function amountKgOf(level: AmountLevel, anchor: AmountAnchor): number | null {
  if (anchor.usual == null) return null
  return Math.round(anchor.usual * FACTOR[level])
}

/** 화면에 적을 근거 한 줄 */
export function amountHint(level: AmountLevel, anchor: AmountAnchor): string | undefined {
  if (anchor.usual == null) return undefined
  const kg = amountKgOf(level, anchor)
  if (level === '보통') return `평소 수준 · 약 ${kg}kg`
  return `약 ${kg}kg`
}

// ── 요청 글 만들기 ───────────────────────────────────────────────────────────

export interface DraftInput {
  reasons: string[]
  wastes: WasteChoice[]
  level: AmountLevel | null
  anchor: AmountAnchor
  memo: string
  urgent: boolean
}

/**
 * 고른 것을 배차 담당이 읽는 한 덩어리로 만듭니다.
 *
 *  ⚠ 고른 것만 적습니다. 아무것도 안 고르면 그 줄은 아예 없습니다 —
 *    「해당 없음」 같은 말을 저희가 채우지 않습니다.
 */
export function buildRequestContent(x: DraftInput): string {
  const lines: string[] = []
  if (x.reasons.length > 0) lines.push(x.reasons.join(' · '))

  const notes = x.wastes.map((w) => w.note).filter(Boolean)
  if (notes.length > 0) lines.push(notes.join(' · '))

  if (x.level) {
    const kg = amountKgOf(x.level, x.anchor)
    lines.push(
      kg != null
        ? `예상 배출량 ${x.level} (평소 ${x.anchor.usual}kg 기준 약 ${kg}kg)`
        : `예상 배출량 ${x.level}`,
    )
  }
  if (x.memo.trim()) lines.push(x.memo.trim())
  return lines.join('\n')
}

// ── 날짜 빠른 선택 ───────────────────────────────────────────────────────────

const addDays = (iso: string, n: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface DayChoice {
  value: string
  label: string
  note?: string
}

const WD = ['일', '월', '화', '수', '목', '금', '토']
const pretty = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`
}

/**
 * 「오늘 · 내일 · 모레」를 **실제 날짜와 함께** 보여 줍니다.
 *
 *  ⚠ 「내일」만 적어 두면 병원 담당자가 오늘 날짜를 착각한 채 고릅니다.
 *    날짜를 같이 적으면 그 자리에서 알아봅니다.
 */
export function dayChoices(now = today()): DayChoice[] {
  return [
    { value: now, label: '오늘', note: pretty(now) },
    { value: addDays(now, 1), label: '내일', note: pretty(addDays(now, 1)) },
    { value: addDays(now, 2), label: '2일 후', note: pretty(addDays(now, 2)) },
    { value: addDays(now, 4), label: '이번 주 안에', note: `${pretty(addDays(now, 4))}까지` },
  ]
}
