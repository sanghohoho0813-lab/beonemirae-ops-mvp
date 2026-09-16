import type { AppData, CollectionEvent, Schedule } from '../types'
import { classifyEvent, isFieldSchedule, localDateOf } from './evidenceBase'
import { pilotClientsOf, pilotColumnMissing } from './pilotClients'
import { usedItemsOf, usedTotal } from './collection'
import { ITEM_BY_KEY, itemsOf, isLegacySupply, type ItemKey } from './billing'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 이번 주 Pilot 실제 기록 (0122) — 자동으로 쌓인 것만, 있는 그대로
//
//  ⚠ 새 표도, 새 이벤트 표도 없습니다. 이미 쌓이는 collection_events ·
//    schedules · materials · client_requests 를 **Pilot 거래처 × Pilot 기간**
//    으로 걸러 그 자리에서 셉니다. 같은 값을 두 곳에 저장하지 않습니다.
//
//  ⚠ 여기서 나오는 숫자는 전부 **건수·명수·날짜**입니다. 「몇 % 향상」은
//    만들지 않습니다 — 도입 전 기준(baseline)이 실측으로 있을 때만 비교가
//    뜻이 있고, 그 비교는 성과 화면의 기존 계산이 따로 합니다.
//
//  ── 표본 규칙 (evidenceBase 와 같음) ──────────────────────────────────────
//   · Pilot 거래처: experiment_settings.pilot_client_ids 중 시연용이 아닌 것
//   · Pilot 기간: experiment_settings.start_date ~ 오늘. 시작일이 비어 있으면
//     **오늘 하루**만 세고 startUnset 을 켭니다 — 임의 기간을 만들지 않습니다.
//   · 시연(demo_session_id) · 취소(reverted) · 시작일 이전(practice) 은 뺍니다.
//     뺀 건수도 적어 둡니다 — 「빠졌다」가 보여야 합니다.
//
//  ── 출처 표기 (provenance) ────────────────────────────────────────────────
//   COLLECTION TABLE  collection_events (+ schedules 완료 연결)
//   MATERIAL USAGE    schedules.containers.usedItems / materials.items
//   CUSTOMER REQUEST  client_requests
//   USER FEEDBACK     피드백 화면 — 시스템 로그와 섞지 않고 자리만 알려 줍니다
// ─────────────────────────────────────────────────────────────────────────────

export type Provenance = 'COLLECTION TABLE' | 'MATERIAL USAGE' | 'CUSTOMER REQUEST' | 'USER FEEDBACK'

export interface PilotEvidence {
  /** SQL(PROPOSAL_0122) 을 아직 안 돌려 Pilot 칸이 없는 상태 */
  columnMissing: boolean
  startDate: string | null
  startUnset: boolean
  period: { from: string; to: string; days: number }
  clients: { id: string; name: string; entered: number }[]
  /** 수거 입력 (COLLECTION TABLE) */
  collections: {
    entered: number
    /** 그중 완료 일정으로 이어져 이력·거래처 화면에 남은 건수 */
    linked: number
    byUser: { name: string; count: number }[]
    days: number
    firstAt: string | null
    lastAt: string | null
  }
  /** 자재 사용 (MATERIAL USAGE) */
  materials: {
    /** 규격별 사용량이 적힌 수거 건수 / Pilot 수거 건수 */
    usedRecords: number
    ofRecords: number
    byItem: { key: string; label: string; used: number; supplied: number }[]
    suppliedRecords: number
  }
  /** Portal 요청 (CUSTOMER REQUEST) — 병원이 포털에서 직접 올린 것만 */
  portal: { requests: number; handled: number; clients: number }
  /** 재입력 대리지표 — 취소된 입력 건수. 「줄었다」가 아니라 건수입니다 */
  reentry: { reverted: number; entered: number }
  /** 거래처 Coverage — Pilot 거래처 중 이 기간에 입력이 1건 이상인 곳 */
  coverage: { withInput: number; pilot: number }
  excluded: { demo: number; practice: number; reverted: number; nonPilot: number }
  /** 자동으로 재지 못하는 것 — 기준값이 있으면 KNOWN, 없으면 UNKNOWN. 지어내지 않습니다 */
  baseline: { key: string; label: string; status: 'KNOWN' | 'UNKNOWN'; value: string | null }[]
  feedback: { note: string }
  provenance: Record<'clients' | 'collections' | 'materials' | 'portal' | 'reentry' | 'coverage' | 'baseline' | 'feedback', Provenance | 'SETTINGS'>
}

const dayDiff = (from: string, to: string) => {
  const a = new Date(`${from}T00:00:00`).getTime()
  const b = new Date(`${to}T00:00:00`).getTime()
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 86_400_000)) + 1
}

/** 넣은 사람 이름 — 이벤트에 남은 것 → 일정의 기사 이름. 차량 기본 기사로 채우지 않습니다 */
function whoOf(e: CollectionEvent, sched: Schedule | undefined): string {
  const n = (e.actorName ?? '').trim()
  if (n) return n
  const d = (sched?.driverName ?? '').trim()
  return d || '(이름 미기록)'
}

export function pilotEvidence(data: AppData, todayStr = today()): PilotEvidence {
  const pilot = pilotClientsOf(data)
  const pilotIds = new Set(pilot.map((c) => c.id))
  const startDate = data.experiment?.startDate ?? null
  const startUnset = !startDate
  const from = startDate ?? todayStr
  const to = todayStr
  const period = { from, to, days: dayDiff(from, to) }
  const inPeriod = (d: string) => !!d && d >= from && d <= to

  const schedById = new Map(data.schedules.map((s) => [s.id, s]))

  //  ── 수거 입력 (COLLECTION TABLE) ────────────────────────────────────────
  const excluded = { demo: 0, practice: 0, reverted: 0, nonPilot: 0 }
  const field: CollectionEvent[] = []
  for (const e of data.events) {
    if (e.action !== '수거 완료') continue
    if (!pilotIds.has(e.clientId)) {
      excluded.nonPilot += 1
      continue
    }
    const cls = classifyEvent(e, startDate)
    if (cls === 'demo') excluded.demo += 1
    else if (cls === 'reverted') excluded.reverted += 1
    else if (cls === 'practice') excluded.practice += 1
    else if (cls === 'field' && inPeriod(localDateOf(e.at))) field.push(e)
  }
  const perClient = new Map<string, number>()
  const perUser = new Map<string, number>()
  const days = new Set<string>()
  let linked = 0
  for (const e of field) {
    perClient.set(e.clientId, (perClient.get(e.clientId) ?? 0) + 1)
    const s = schedById.get(e.scheduleId)
    perUser.set(whoOf(e, s), (perUser.get(whoOf(e, s)) ?? 0) + 1)
    days.add(localDateOf(e.at))
    //  「연결」 = 이 입력이 완료 일정으로 남아 수거이력·거래처 화면에 보이는 것
    if (s && s.status === '완료' && isFieldSchedule(s)) linked += 1
  }
  const ats = field.map((e) => e.at).sort()

  //  ── 자재 사용 (MATERIAL USAGE) ──────────────────────────────────────────
  //   Pilot 거래처의 완료 일정 중 기간 안의 것. 규격별 사용량이 적힌 건만
  //   「기록」으로 셉니다 — 4칸 추정값(빠른 완료)은 usedItems 가 없어 자연히 빠집니다.
  const pilotDone = data.schedules.filter(
    (s) => pilotIds.has(s.clientId) && s.status === '완료' && isFieldSchedule(s) && inPeriod(s.date),
  )
  const usedBy = new Map<string, number>()
  let usedRecords = 0
  for (const s of pilotDone) {
    const u = usedItemsOf(s.containers)
    if (usedTotal(u) === 0) continue
    usedRecords += 1
    for (const [k, n] of Object.entries(u)) usedBy.set(k, (usedBy.get(k) ?? 0) + (n ?? 0))
  }
  const suppliedBy = new Map<string, number>()
  let suppliedRecords = 0
  for (const m of data.materials) {
    //  공급 기록에는 시연 표식 칸이 없습니다 — Pilot 거래처(시연용 제외)와 기간으로만 거릅니다.
    if (!pilotIds.has(m.clientId) || !inPeriod(m.date)) continue
    if (isLegacySupply(m)) continue
    suppliedRecords += 1
    for (const [k, n] of Object.entries(itemsOf(m))) suppliedBy.set(k, (suppliedBy.get(k) ?? 0) + (n ?? 0))
  }
  const itemKeys = Array.from(new Set([...usedBy.keys(), ...suppliedBy.keys()])).filter((k) => ITEM_BY_KEY[k as ItemKey])
  const byItem = itemKeys
    .map((k) => ({ key: k, label: ITEM_BY_KEY[k as ItemKey].label, used: usedBy.get(k) ?? 0, supplied: suppliedBy.get(k) ?? 0 }))
    .sort((a, b) => b.used - a.used || b.supplied - a.supplied)

  //  ── Portal 요청 (CUSTOMER REQUEST) ───────────────────────────────────────
  const portalReqs = data.requests.filter(
    (r) => r.source === 'portal' && pilotIds.has(r.clientId) && !r.demoSessionId && inPeriod(localDateOf(r.createdAt)),
  )

  //  ── 기준값 (BASELINE) — 있는 것만 KNOWN ───────────────────────────────────
  //   시연용 예시값(source='demo')은 실제 기준이 아니므로 UNKNOWN 으로 둡니다.
  const b = data.baseline
  const real = b.source !== 'demo'
  const known = (v: number | null, unit: string) => (real && v != null ? { status: 'KNOWN' as const, value: `${v}${unit}` } : { status: 'UNKNOWN' as const, value: null })
  const baseline = [
    { key: 'adminMinutes', label: '수거 1건 뒤 사무업무 시간 (카톡·전화·엑셀 포함)', ...known(b.adminMinutesPerCollection, '분') },
    { key: 'repeatEntries', label: '같은 정보를 다시 적는 횟수', ...known(b.repeatEntriesPerCollection, '회') },
    { key: 'docHours', label: '월간 문서·정산 정리 시간', ...known(b.monthlyDocHours, '시간') },
    { key: 'rework', label: '월간 누락·재확인 건수', ...known(b.monthlyReworkCount, '건') },
    { key: 'dailyCapacity', label: '하루 평균 처리 건수', ...known(b.dailyCapacity, '건') },
  ]

  return {
    columnMissing: pilotColumnMissing(data),
    startDate,
    startUnset,
    period,
    clients: pilot.map((c) => ({ id: c.id, name: c.name, entered: perClient.get(c.id) ?? 0 })),
    collections: {
      entered: field.length,
      linked,
      byUser: Array.from(perUser.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      days: days.size,
      firstAt: ats[0] ?? null,
      lastAt: ats[ats.length - 1] ?? null,
    },
    materials: { usedRecords, ofRecords: pilotDone.length, byItem, suppliedRecords },
    portal: {
      requests: portalReqs.length,
      handled: portalReqs.filter((r) => r.handledAt).length,
      clients: new Set(portalReqs.map((r) => r.clientId)).size,
    },
    reentry: { reverted: excluded.reverted, entered: field.length },
    coverage: { withInput: Array.from(perClient.keys()).length, pilot: pilot.length },
    excluded,
    baseline,
    //  사람이 답한 것은 시스템 기록과 다른 종류입니다 — 있는지만 알려 주고 섞지 않습니다.
    feedback: {
      note: data.afterSurvey
        ? '도입 후 업무 조사 응답이 1건 있습니다 — 성과 화면 「측정 근거」에서 따로 봅니다. 여기 건수와 합치지 않습니다.'
        : '사용자 피드백은 시스템 기록과 섞지 않습니다 — 피드백 화면에서 따로 봅니다.',
    },
    provenance: {
      clients: 'SETTINGS',
      collections: 'COLLECTION TABLE',
      materials: 'MATERIAL USAGE',
      portal: 'CUSTOMER REQUEST',
      reentry: 'COLLECTION TABLE',
      coverage: 'COLLECTION TABLE',
      baseline: 'SETTINGS',
      feedback: 'USER FEEDBACK',
    },
  }
}
