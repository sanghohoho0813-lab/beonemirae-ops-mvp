import type { AppData } from '../types'
import type { PerformanceSummary } from './performance'
import type { AxEvidence } from './axEvidence'
import type { ExcelSummary } from './excelCheck'
import { EXCEL_MIN_DAYS } from './excelCheck'
import type { NumKind } from '../components/KindChip'
import { summarizeTrials, type Trial, type TrialSummary } from './trials'

// ─────────────────────────────────────────────────────────────────────────────
// 요약 화면이 보여 줄 것을 고릅니다 (0107)
//
//  ⚠ 숫자를 감추지 않습니다. 표본이 작아도 실제로 잰 값이면 「초기 측정」으로
//    보여 줍니다. 다만 비교 범위가 다르면 개선율을 만들지 않습니다 — 그건 표본
//    문제가 아니라 뜻이 다른 문제라서.
//  ⚠ 값이 없는 항목은 카드로 늘어놓지 않고 「아직 측정하지 않은 항목 N개」로
//    묶습니다. 실제로 잰 0 과 나빠진 값은 카드에 그대로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface SummaryCard {
  key: string
  label: string
  /** 큰 숫자 (단위 포함) */
  value: string
  /** 한 줄 설명 */
  desc: string
  kind: NumKind
  /** 간결한 출처 — 「시스템 측정 · 표본 5건」 */
  source: string
  /** 나빠진 값이면 true — 숨기지 않고 색만 다르게 */
  worse?: boolean
  /** 측정 근거 탭의 어디로 가는가 */
  anchor: string
}

export interface Unmeasured {
  key: string
  label: string
  /** 왜 아직 없는가 — 한 줄 */
  reason: string
}

export interface NextAction {
  key: string
  title: string
  why: string
  /** 화면 안 탭이면 tab, 다른 화면이면 to */
  tab?: 'settings' | 'basis'
  to?: string
  /** 관리자만 할 수 있는 일 */
  adminOnly?: boolean
}

export interface DataDiagnosis {
  /** 읽지 못한 자료 — 「자료 미확인」. 비어 있으면 다 읽었다는 뜻 */
  unreadable: string[]
  /** 한 줄 판정 */
  headline: string
  /** 근거 몇 줄 */
  lines: string[]
}

const fmt = (v: number, unit: string) => `${Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toFixed(1)}${unit}`

/**
 * AX 로 확인된 변화 — 값이 있는 것 중 앞에서 최대 3개.
 *  우선순위: 사무업무 시간(같은 범위 실측이 있을 때만) → 입력 소요시간 → 자동 반영 →
 *  당일 입력률 → 다시 적는 횟수 → 포털 병원 수 → 처리시설 대기 → 계기판 km
 */
export function summaryCards(summary: PerformanceSummary, ev: AxEvidence, max = 3): SummaryCard[] {
  const cards: SummaryCard[] = []
  const m = (k: string) => summary.metrics.find((x) => x.key === k)
  const n = (list: { key: string; value: number | null; samples: number }[], k: string) => list.find((x) => x.key === k)
  const fieldNote = `실제 현장 ${summary.fieldCount}건`

  const admin = m('adminTime')
  if (admin && admin.status === 'ok' && admin.after != null && admin.before != null && admin.changePct != null) {
    const worse = admin.changePct < 0
    cards.push({
      key: 'adminTime', label: '수거 1건 사무업무 시간', value: `${fmt(admin.after, '분')}`,
      desc: `도입 전 ${fmt(admin.before, '분')} → ${worse ? `${Math.abs(admin.changePct)}% 늘어남` : admin.changePct === 0 ? '변화 없음' : `${admin.changePct}% 단축`}${admin.confounded ? ' · 복합 개선' : ''}`,
      kind: '초기 측정', source: '도입 전·후 같은 범위 조사', worse, anchor: 'metric-adminTime',
    })
  }
  if (summary.fieldDuration.samples > 0 && summary.fieldDuration.medianMin != null) {
    cards.push({
      key: 'inputTime', label: '수거 1건 입력 시간', value: fmt(summary.fieldDuration.medianMin, '분'),
      desc: '입력 화면 열고 → 저장까지 (중앙값). 도입 전 사무시간과 범위가 달라 개선율은 내지 않음',
      kind: '초기 측정', source: `시스템 측정 · 표본 ${summary.fieldDuration.samples}건`, anchor: 'metric-inputTime',
    })
  }
  if (summary.fieldCount > 0) {
    const avg = Math.round((summary.autoLink.total / summary.collectionCount) * 10) / 10
    cards.push({
      key: 'autoLink', label: '입력 1건이 자동 반영한 업무', value: `${avg}건`,
      desc: '일정 · 이력 · 거래처 · 자재 · 재고 · 통계 · 문서 초안 — 시스템 안에서 세는 값',
      kind: '초기 측정', source: `시스템 집계 · ${fieldNote}`, anchor: 'automation',
    })
  }
  const same = n(ev.work.numbers, 'sameDayRate')
  //  현장 입력이 하나도 없는데 완료율만 뜨면 「실제 사용 없음」과 어긋납니다 — 현장 입력이 있을 때만.
  if (same && same.value != null && same.samples > 0 && summary.fieldCount > 0) {
    cards.push({
      key: 'sameDayRate', label: '당일 입력 완료율', value: `${same.value}%`,
      desc: '다녀온 날 안에 입력이 끝난 비율',
      kind: '초기 측정', source: `시스템 측정 · 완료 ${same.samples}건`, worse: same.value < 50, anchor: 'ax-work',
    })
  }
  const rep = m('repeatEntry')
  if (rep && rep.after != null) {
    cards.push({
      key: 'repeatEntry', label: '같은 정보를 다시 적는 횟수', value: `${rep.after}회`,
      desc: rep.before != null && rep.changePct != null ? `도입 전 ${rep.before}회 → ${rep.changePct >= 0 ? `${rep.changePct}% 감소` : `${Math.abs(rep.changePct)}% 증가`}` : '엑셀·카톡 재입력 포함',
      kind: '초기 측정', source: '하루 한 줄 확인 응답', worse: rep.changePct != null && rep.changePct < 0, anchor: 'metric-repeatEntry',
    })
  }
  const portal = n(ev.customer.numbers, 'portalClients')
  if (portal && portal.value != null && portal.value > 0) {
    cards.push({
      key: 'portalClients', label: '포털을 직접 쓴 병원', value: `${portal.value}곳`,
      desc: '전화·카톡 대신 포털에서 요청·주문한 서로 다른 병원',
      kind: '초기 측정', source: '포털 기록', anchor: 'ax-customer',
    })
  }
  const wait = n(ev.capacity.numbers, 'facilityWaitMin')
  if (wait && wait.value != null && wait.samples > 0) {
    cards.push({
      key: 'facilityWait', label: '처리시설 대기 (중앙값)', value: `${wait.value}분`,
      desc: '기사님 마감 기록 — 「3~4시간」 전언과 견주는 실측',
      kind: '초기 측정', source: `마감 기록 ${wait.samples}건`, anchor: 'ax-capacity',
    })
  }
  const km = n(ev.capacity.numbers, 'kmPerDay')
  if (km && km.value != null && km.samples > 0) {
    cards.push({
      key: 'kmPerDay', label: '운행거리 (계기판)', value: `${km.value}km`,
      desc: '마감 1건당 도착 − 출발 계기판 평균',
      kind: '초기 측정', source: `마감 기록 ${km.samples}건`, anchor: 'ax-capacity',
    })
  }
  return cards.slice(0, max)
}

/** 아직 측정하지 않은 항목 — 이유 한 줄씩 */
export function unmeasured(summary: PerformanceSummary, ev: AxEvidence, shown: SummaryCard[]): Unmeasured[] {
  const has = new Set(shown.map((c) => c.key))
  const out: Unmeasured[] = []
  const m = (k: string) => summary.metrics.find((x) => x.key === k)
  const n = (list: { key: string; value: number | null; samples: number }[], k: string) => list.find((x) => x.key === k)

  if (!has.has('adminTime')) {
    out.push({
      key: 'adminTime', label: '수거 1건 사무업무 시간',
      reason: summary.afterSurvey?.source === 'estimate'
        ? `도입 후 값 ${summary.afterSurvey.adminMinutesPerCollection ?? '—'}분은 추정(직접 입력)이라 실측 비교에서 제외 — 이사님 같은 범위 조사가 들어오면 견줌`
        : m('adminTime')?.before == null ? '도입 전 기준값 미입력' : '도입 후 같은 범위 조사 없음',
    })
  }
  if (!has.has('inputTime')) out.push({ key: 'inputTime', label: '수거 1건 입력 시간', reason: summary.fieldCount === 0 ? '실증 시작일 이후 현장 입력 0건' : '입력 시간이 남은 표본 없음' })
  if (!has.has('repeatEntry')) {
    const ex = summary.excel
    out.push({ key: 'repeatEntry', label: '같은 정보를 다시 적는 횟수', reason: ex == null ? '엑셀 확인 응답을 읽지 못함 (관리자만)' : `첫 화면 엑셀 확인 응답 ${ex.respondedDays}/${EXCEL_MIN_DAYS}일` })
  }
  if (!has.has('sameDayRate')) out.push({ key: 'sameDayRate', label: '당일 입력 완료율', reason: '완료 처리된 수거 기록 없음' })
  const doc = m('docHours')
  if (doc && doc.after == null) out.push({ key: 'docHours', label: '월간 문서·정산 정리 시간', reason: summary.afterSurvey?.source === 'estimate' ? '추정값은 비교 제외 — 같은 범위 조사 필요' : '도입 후 같은 범위 조사 없음' })
  const rw = m('rework')
  if (rw && rw.after == null) out.push({ key: 'rework', label: '완료 취소 후 재입력 건수', reason: rw.note })
  const dc = m('dailyCount')
  if (dc && dc.after == null) out.push({ key: 'dailyCount', label: '하루 처리 건수 (회사 전체)', reason: summary.fieldCount === 0 ? '현장 입력 0건' : `입력 커버리지 ${summary.breadth.coverage.pct ?? '—'}% (80% 이상부터)` })
  if (!has.has('portalClients')) out.push({ key: 'portalClients', label: '포털을 직접 쓴 병원', reason: '병원이 포털에서 올린 요청·주문 없음' })
  if (!has.has('facilityWait')) {
    const w = n(ev.capacity.numbers, 'facilityWaitMin')
    out.push({ key: 'facilityWait', label: '처리시설 대기', reason: w && w.value == null && /칸이 아직 없습니다/.test((w as { basis?: string }).basis ?? '') ? '마감 기록 표 없음 (SQL 0106)' : '기사님 마감에 대기시간 기록 없음' })
  }
  if (!has.has('kmPerDay')) out.push({ key: 'kmPerDay', label: '운행거리 (계기판)', reason: '기사님 마감에 계기판 기록 없음' })
  return out
}

/** 지금 필요한 행동 — 우선순위대로 최대 3개, 같은 말을 되풀이하지 않습니다 */
export function nextActions(
  data: AppData,
  summary: PerformanceSummary,
  opts: { trials: Trial[]; excel: ExcelSummary | null; isAdmin: boolean; unreadable: string[] },
  max = 3,
): NextAction[] {
  const out: NextAction[] = []
  const baselineFilled = [
    data.baseline.adminMinutesPerCollection, data.baseline.repeatEntriesPerCollection,
    data.baseline.monthlyDocHours, data.baseline.monthlyReworkCount, data.baseline.dailyCapacity,
  ].some((v) => v != null)
  const hasAxStart = (data.opsChanges ?? []).some((c) => c.kind === 'ax_start')

  if (opts.unreadable.length > 0) {
    out.push({ key: 'unreadable', title: '읽지 못한 자료부터 확인', why: `${opts.unreadable.join(' · ')} — 자료가 없는 것이 아니라 못 읽은 것입니다. 통신 또는 SQL 실행 여부를 확인해 주세요.`, tab: 'basis' })
  }
  if (summary.fieldCount === 0) {
    out.push({
      key: 'field', title: '기사님이 수거 입력을 시작',
      why: summary.practiceCount > 0
        ? `실증 시작일(${summary.experimentStart}) 이후 현장 입력이 0건입니다. 그 전 ${summary.practiceCount}건은 연습으로 분류돼 있습니다. 입력이 있어야 아래 측정이 시작됩니다.`
        : '현장 수거 입력이 아직 없습니다. 입력이 있어야 측정이 시작됩니다.',
      to: '/collection',
    })
  }
  if (!baselineFilled) {
    out.push({ key: 'baseline', title: '도입 전 기준값 채우기 (1분)', why: '설정 → 「업무 조사 값으로 채우기」를 누르면 이사님 8월 조사값이 들어갑니다. 이것이 없으면 어떤 개선율도 계산되지 않습니다.', to: '/settings#baseline', adminOnly: true })
  }
  if (opts.trials.length === 0) {
    out.push({ key: 'trial', title: '업무 재현시험 1건 — 같은 명세서를 두 방식으로', why: '같은 달 같은 거래처의 거래명세서를 엑셀로 한 번, 월말 청구로 한 번 만들고 각각 시간을 적으면 오늘 바로 첫 측정값이 생깁니다.', tab: 'settings' })
  }
  if (!summary.afterSurvey || summary.afterSurvey.source !== 'survey' || summary.afterSurvey.adminMinutesPerCollection == null) {
    out.push({ key: 'afterSurvey', title: '이사님께 같은 세 가지 시간 다시 여쭙기', why: '배차 · 수거 일정 · 엑셀 정리의 하루 시간을 지금 기준으로. 그래야 도입 전 8월 조사와 같은 자로 견줍니다.', tab: 'settings', adminOnly: true })
  }
  if (!opts.excel || opts.excel.respondedDays < EXCEL_MIN_DAYS) {
    out.push({ key: 'excel', title: `첫 화면 엑셀 한 줄에 답하기 (${opts.excel?.respondedDays ?? 0}/${EXCEL_MIN_DAYS}일)`, why: '「오늘 엑셀·카톡에 다시 적은 것이 있었나요」에 5일 답하면 다시 적는 횟수가 측정값이 됩니다.', to: '/' })
  }
  if (!hasAxStart && data.opsChanges !== undefined) {
    out.push({ key: 'axStart', title: '운영 변화 기록에 AX 사용 시작일 적기', why: '차량·인력·거점 변화와 AX 효과를 가르는 기준점입니다.', tab: 'settings' })
  }
  return out.filter((a) => !a.adminOnly || opts.isAdmin).slice(0, max)
}

/** 왜 지금 숫자가 안 보이는가 — 「자료 미확인」과 「실제 사용 없음」을 가릅니다 */
export function diagnoseData(data: AppData, summary: PerformanceSummary, unreadable: string[]): DataDiagnosis {
  const lines: string[] = []
  const all = (data.events ?? []).filter((e) => e.action === '수거 완료')
  const reverted = all.filter((e) => e.reverted).length
  const demo = all.filter((e) => !e.reverted && e.demoSessionId).length
  const start = summary.experimentStart
  let headline: string
  if (unreadable.length > 0) {
    headline = `자료 미확인 — 읽지 못한 자료 ${unreadable.length}건 (${unreadable.join(', ')})`
    lines.push('숫자가 0 으로 보여도 없는 것이 아니라 못 읽은 것입니다.')
  } else if (all.length === 0) {
    headline = '실제 사용 없음 — 수거 입력 기록이 하나도 없습니다'
  } else if (summary.fieldCount === 0) {
    headline = start
      ? `실제 사용 없음 — 실증 시작일 ${start} 이후 현장 입력 0건`
      : '실제 사용 없음 — 시연·취소를 뺀 현장 입력 0건'
  } else {
    headline = `현장 입력 ${summary.fieldCount}건이 집계에 들어 있습니다`
  }
  lines.push(`수거 완료 기록 전체 ${all.length}건 = 현장 ${summary.fieldCount} · 연습(시작일 전) ${summary.practiceCount} · 시연 ${demo} · 취소 ${reverted}`)
  if (summary.practiceCount > 0 && start) {
    lines.push(`연습 ${summary.practiceCount}건은 시작일(${start}) 이전 입력입니다. 시작일을 그 앞으로 옮기면 실제 기록으로 셉니다 — 시스템이 임의로 바꾸지 않고, 대표님이 설정에서 정합니다.`)
  }
  if (summary.breadth.startUnset) lines.push('실증 시작일이 없어 연습과 실제를 가르지 못합니다.')
  const b = data.baseline
  const filled = [b.adminMinutesPerCollection, b.repeatEntriesPerCollection, b.monthlyDocHours, b.monthlyReworkCount, b.dailyCapacity].filter((v) => v != null).length
  lines.push(filled === 0 ? '도입 전 기준값 미입력 — 자료를 못 읽은 것이 아니라 아직 안 넣은 것입니다 (설정에서 1분).' : `도입 전 기준값 ${filled}/5개 입력 (출처 ${b.source === 'survey' ? '업무 조사 응답' : b.source === 'demo' ? '시연용' : '직접 입력'})`)
  if (summary.afterSurvey?.source === 'estimate') lines.push(`도입 후 조사값은 추정(직접 입력)으로 저장돼 있어 실측 비교에서 제외했습니다 — 값은 그대로 보존됩니다.`)
  return { unreadable, headline, lines }
}

export function trialSummaries(trials: Trial[]): TrialSummary[] {
  return summarizeTrials(trials)
}
