import type { DevRequestRow } from './repo'

// ─────────────────────────────────────────────────────────────────────────────
// 업무 재현시험 — 같은 일을 예전 방식과 시스템 방식으로 각각 해 보고 시간·오류를 적습니다 (0107)
//
//  현장 성과가 쌓이기 전에 **초기 측정값**을 얻는 가장 빠른 길입니다. 다만
//  이것은 실험실 값입니다 — 실제 운영 성과와 따로 표시하고, 회사 전체 절감률이나
//  연간 절감액으로 자동 확대하지 않습니다.
//
//  ── 조건 ────────────────────────────────────────────────────────────────
//   · 같은 자료 · 같은 결과물 · 같은 정확성 기준으로 두 방식을 각각 수행
//   · 각각의 소요 시간(분)과 오류 건수를 실제로 재서 적음 — 추정 금지
//   · 저장은 dev_requests(사용자 피드백)를 그대로 씁니다 (새 표 없음)
//
//     trial:2026-09-10|invoice|old=25,1|new=9,0 › 8월 한양의료재단 명세서
// ─────────────────────────────────────────────────────────────────────────────

export const TRIAL_TOPIC = '업무 재현시험'

export type TrialTask = 'invoice' | 'collection' | 'request'

export const TRIAL_TASKS: { task: TrialTask; label: string; hint: string }[] = [
  { task: 'invoice', label: '거래명세서 작성', hint: '같은 달·같은 거래처의 명세서를 엑셀로 한 번, 시스템 월말 청구로 한 번' },
  { task: 'collection', label: '수거 건 입력·정리', hint: '같은 수거 건을 수기·카톡·엑셀로 한 번, 수거 입력 화면으로 한 번' },
  { task: 'request', label: '병원 요청 접수·처리', hint: '같은 요청을 전화·카톡으로 한 번, 고객 요청 화면으로 한 번' },
]

export const TRIAL_TASK_LABEL: Record<TrialTask, string> = Object.fromEntries(
  TRIAL_TASKS.map((t) => [t.task, t.label]),
) as Record<TrialTask, string>

export interface Trial {
  id: string
  date: string
  task: TrialTask
  oldMin: number
  oldErrors: number
  newMin: number
  newErrors: number
  note: string
  who: string
  createdAt: string
}

const LINE = /^trial:(\d{4}-\d{2}-\d{2})\|(invoice|collection|request)\|old=([\d.]+),(\d+)\|new=([\d.]+),(\d+)\s*(?:›\s*(.*))?$/

export function formatTrial(t: Omit<Trial, 'id' | 'who' | 'createdAt'>): string {
  const head = `trial:${t.date}|${t.task}|old=${t.oldMin},${t.oldErrors}|new=${t.newMin},${t.newErrors}`
  return t.note.trim() ? `${head} › ${t.note.trim()}` : head
}

export function parseTrial(row: Pick<DevRequestRow, 'id' | 'topics' | 'message' | 'requesterName' | 'createdAt'>): Trial | null {
  if (!row.topics.includes(TRIAL_TOPIC)) return null
  const m = row.message.split('\n')[0].trim().match(LINE)
  if (!m) return null
  return {
    id: row.id,
    date: m[1],
    task: m[2] as TrialTask,
    oldMin: Number(m[3]),
    oldErrors: Number(m[4]),
    newMin: Number(m[5]),
    newErrors: Number(m[6]),
    note: (m[7] ?? '').trim(),
    who: row.requesterName,
    createdAt: row.createdAt,
  }
}

export function parseTrials(rows: DevRequestRow[]): Trial[] {
  return rows.map(parseTrial).filter((t): t is Trial => !!t)
}

export interface TrialSummary {
  task: TrialTask
  label: string
  n: number
  oldMedianMin: number
  newMedianMin: number
  oldErrors: number
  newErrors: number
  /** 시간 단축 % — 같은 일을 같은 기준으로 했으므로 냅니다 (실험실 값) */
  savedPct: number | null
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** 과제별로 묶습니다. 한 번도 안 한 과제는 나오지 않습니다 */
export function summarizeTrials(trials: Trial[]): TrialSummary[] {
  const out: TrialSummary[] = []
  for (const { task, label } of TRIAL_TASKS) {
    const rows = trials.filter((t) => t.task === task)
    if (rows.length === 0) continue
    const o = Math.round(median(rows.map((t) => t.oldMin)) * 10) / 10
    const n = Math.round(median(rows.map((t) => t.newMin)) * 10) / 10
    out.push({
      task,
      label,
      n: rows.length,
      oldMedianMin: o,
      newMedianMin: n,
      oldErrors: rows.reduce((s, t) => s + t.oldErrors, 0),
      newErrors: rows.reduce((s, t) => s + t.newErrors, 0),
      savedPct: o > 0 ? Math.round(((o - n) / o) * 100) : null,
    })
  }
  return out
}
