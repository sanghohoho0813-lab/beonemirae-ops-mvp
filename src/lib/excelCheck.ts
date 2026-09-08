import type { DevRequestRow } from './repo'

// ─────────────────────────────────────────────────────────────────────────────
// 엑셀 병행 확인 — 「오늘 엑셀·카톡에 다시 적은 것이 있었나」 (0106)
//
//  첫 실사용 피드백: 거래처 정보와 규격이 실제 업무와 맞지 않아 엑셀을
//  병행한다. 그런데 **무엇 때문에** 엑셀을 다시 쓰는지가 어디에도 남지
//  않았습니다. 남지 않으면 고칠 수 없고, 「반복 입력 1회」 지표는 시스템
//  안에서만 세는 구조값으로 남습니다.
//
//  ── 저장 자리 ────────────────────────────────────────────────────────────
//  새 표를 만들지 않고 dev_requests(사용자 피드백)를 그대로 씁니다.
//   · 이미 있고, 내부 직원이면 누구나 쓸 수 있고, 관리자가 다 읽습니다.
//   · 주제(topics)에 EXCEL_TOPIC 을 넣고, 본문 첫 줄을 기계가 읽을 수 있는
//     형식으로 적습니다. 피드백 화면은 이 주제를 따로 묶어 보여 줍니다.
//
//     excel:2026-09-08=0                    → 오늘은 다시 적은 것 없음
//     excel:2026-09-08=2 › 거래처 단가, 자재 규격  → 2건, 무엇 때문인지
//
//  ⚠ 응답이 없는 날은 「없음」이 아니라 「모름」입니다. 지표는 응답한 날만
//    셉니다. 하루 한 번 묻고, 답하지 않아도 아무 일도 막지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export const EXCEL_TOPIC = '엑셀 병행 확인'

/** 지표를 내기 전에 있어야 하는 응답 일수 */
export const EXCEL_MIN_DAYS = 5

export interface ExcelCheck {
  id: string
  date: string
  /** 다시 적은 건수 (0 = 없음) */
  reentries: number
  /** 무엇 때문에 — 사람이 적은 그대로 */
  items: string
  who: string
  createdAt: string
}

const LINE = /^excel:(\d{4}-\d{2}-\d{2})=(\d+)\s*(?:›\s*(.*))?$/

export function formatExcelCheck(date: string, reentries: number, items: string): string {
  const n = Math.max(0, Math.round(reentries))
  const it = items.trim()
  return it ? `excel:${date}=${n} › ${it}` : `excel:${date}=${n}`
}

/** dev_requests 줄 → 엑셀 확인 (해당 주제가 아니거나 형식이 다르면 null) */
export function parseExcelCheck(row: Pick<DevRequestRow, 'id' | 'topics' | 'message' | 'requesterName' | 'createdAt'>): ExcelCheck | null {
  if (!row.topics.includes(EXCEL_TOPIC)) return null
  const first = row.message.split('\n')[0].trim()
  const m = first.match(LINE)
  if (!m) return null
  return {
    id: row.id,
    date: m[1],
    reentries: Number(m[2]),
    items: (m[3] ?? '').trim(),
    who: row.requesterName,
    createdAt: row.createdAt,
  }
}

export function parseExcelChecks(rows: DevRequestRow[]): ExcelCheck[] {
  return rows.map(parseExcelCheck).filter((c): c is ExcelCheck => !!c)
}

export interface ExcelSummary {
  /** 기간 안에서 응답한 서로 다른 날 수 */
  respondedDays: number
  /** 다시 적은 것이 있었던 날 수 */
  daysWithReentry: number
  /** 다시 적은 건수 합 */
  reentries: number
  /** 무엇 때문이었는지 — 많이 나온 순 */
  reasons: { text: string; count: number }[]
  /** 지표를 낼 만큼 응답이 있는가 */
  enough: boolean
}

/**
 * 기간 안 응답을 묶습니다. 같은 날 여러 사람이 답하면 날은 한 번, 건수는 합칩니다.
 */
export function summarizeExcelChecks(checks: ExcelCheck[], from: string, to: string): ExcelSummary {
  const inRange = checks.filter((c) => c.date >= from && c.date <= to)
  const days = new Set(inRange.map((c) => c.date))
  const withRe = new Set(inRange.filter((c) => c.reentries > 0).map((c) => c.date))
  const reentries = inRange.reduce((s, c) => s + c.reentries, 0)
  const reasonCount = new Map<string, number>()
  for (const c of inRange) {
    for (const r of c.items.split(/[,、·]/).map((x) => x.trim()).filter(Boolean)) {
      reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1)
    }
  }
  return {
    respondedDays: days.size,
    daysWithReentry: withRe.size,
    reentries,
    reasons: [...reasonCount.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count),
    enough: days.size >= EXCEL_MIN_DAYS,
  }
}
