import type { AppData, Schedule, WasteType } from '../types'
import { today } from './format'
import { isLive } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 현장에서 들어온 입력
//
//  이사님·대표님이 궁금한 것은 두 가지입니다.
//
//   ① 오늘 현장에서 뭐가 들어왔나   — 사무실에 앉아 알 방법이 없었습니다
//   ② 이 거래처 마지막 수거가 언제였나 — 거래처를 열면 표가 나오지만,
//      「언제 누가 얼마」 한 줄이 없었습니다
//
// ── 판단하지 않습니다 ───────────────────────────────────────────────────────
//
//  「잘했다 / 못했다」를 시스템이 매기지 않습니다. 기준을 정한 사람이
//  없는데 시스템이 성적을 매기면, 그 숫자로 사람을 평가하게 됩니다.
//  **사실만 적습니다** — 언제, 누가, 얼마.
//
// ── 없는 것을 지어내지 않습니다 ─────────────────────────────────────────────
//
//  기사 이름은 수거 입력에서 **사람이 적은 값**입니다(schedules.driver_name).
//  안 적혀 있으면 비워 둡니다. 차량 기본 기사로 대신 채우면 실제로 간
//  사람과 다를 수 있고, 그 이름이 그대로 기록에 남습니다.
//
//  엑셀로 가져온 과거 기록에는 기사도 시간도 없습니다. 그때는 날짜와
//  수거량만 적습니다.
//
// ── 금액은 여기에 없습니다 ──────────────────────────────────────────────────
//
//  이 파일은 현장 화면에도 쓰입니다. 단가·금액을 한 칸이라도 담으면
//  현장 화면에 새어 나갈 길이 생깁니다. **kg 까지만** 다룹니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldInput {
  scheduleId: string
  clientId: string
  clientName: string
  wasteType: WasteType
  /** 실제 수거량 (kg) — 금액은 담지 않습니다 */
  amountKg: number
  /** 수거한 날 (YYYY-MM-DD) */
  date: string
  /** 실제 수거 시간 HH:mm — 안 적혀 있으면 빈 문자열 */
  atTime: string
  /** 저장된 시각 (ISO) — 정렬용 */
  savedAt: string
  /** 누가 — 수거 입력에 적힌 기사 이름. 안 적혀 있으면 빈 문자열 */
  who: string
  /**
   * 예정에 없던 것을 직접 입력한 것인가.
   *  수거 이벤트가 있을 때만 참입니다 — 없으면 「모른다」는 뜻이고,
   *  화면에 딱지를 안 붙입니다.
   */
  adHoc: boolean
  /**
   * 배출 용기 — 「골판지 3 · 합성수지 2」처럼 읽을 수 있게 만든 줄.
   *
   *  ⚠ 이사님이 카카오톡 사진을 다시 여는 이유가 **이것**입니다. 수거량만
   *    보여 주면 이 화면으로 사진을 대신할 수 없습니다.
   *  ⚠ 적혀 있지 않으면 빈 문자열입니다 — **0 으로 채우지 않습니다.**
   *    「안 적었다」와 「0개였다」는 다른 말입니다.
   */
  containerLine: string
  /** 배출 용기 합계 (개). 적혀 있지 않으면 null */
  containerTotal: number | null
  /** 이 방문에서 건넨 자재 — 「63L 박스 10 · 20L 용기 3」. 없으면 빈 문자열 */
  supplyLine: string
  /** 특이사항 — 기사님이 적은 메모. 없으면 빈 문자열 */
  memo: string
}

/** 「골판지 3 · 합성수지 2」 — 0 인 칸은 빼고 이어 붙입니다 */
function containerText(c: Schedule['containers']): { line: string; total: number | null } {
  if (!c) return { line: '', total: null }
  const parts: string[] = []
  let total = 0
  const push = (label: string, n: number | undefined) => {
    if (!n) return
    parts.push(`${label} ${n}`)
    total += n
  }
  push('골판지', c.corrugated)
  push('합성수지', c.plastic)
  push('봉투', c.bag)
  push('기타', c.etc)
  //  하나도 안 적혀 있으면 「없다」가 아니라 「모른다」입니다.
  return parts.length === 0 ? { line: '', total: null } : { line: parts.join(' · '), total }
}

function toInput(s: Schedule, clientName: string, adHoc: boolean, supplyLine = ''): FieldInput {
  const c = containerText(s.containers)
  return {
    scheduleId: s.id,
    clientId: s.clientId,
    clientName,
    wasteType: s.wasteType,
    amountKg: s.actualAmount ?? 0,
    date: s.date,
    atTime: s.actualTime ?? '',
    savedAt: s.completedAt ?? `${s.date}T00:00:00Z`,
    //  ⚠ 차량 기본 기사로 채우지 않습니다 — 실제로 간 사람과 다를 수 있습니다.
    who: (s.driverName ?? '').trim(),
    adHoc,
    containerLine: c.line,
    containerTotal: c.total,
    supplyLine,
    memo: (s.memo ?? '').trim(),
  }
}

/**
 * 「예정에 없던 것을 직접 입력했는가」.
 *
 *  ⚠ 일정 표만 봐서는 알 수 없습니다. origin 은 거의 다 'field' 라
 *    구분이 안 되고, 짐작으로 「예정 외」 딱지를 붙이면 화면에 틀린
 *    사실이 남습니다.
 *
 *  수거 이벤트에 **그 사실이 그대로 적혀 있습니다**(createdSchedule =
 *  직접 입력으로 새 일정을 만든 것). 이벤트가 없으면 딱지를 안 붙입니다 —
 *  「예정대로였다」고 말하는 것이 아니라 **모른다**는 뜻입니다.
 */
function adHocIds(data: AppData): Set<string> {
  return new Set(
    (data.events ?? [])
      .filter((e) => e.action === '수거 완료' && !e.reverted && e.createdSchedule)
      .map((e) => e.scheduleId),
  )
}

/** 완료된 수거만 — 예정은 아직 들어온 것이 아닙니다 */
function completed(s: Schedule): boolean {
  return s.status === '완료' && s.actualAmount != null
}

/**
 * 그날 현장에서 들어온 입력.
 *
 *  **저장된 날**이 아니라 **수거한 날** 기준입니다. 어제 것을 오늘 아침에
 *  입력했으면 어제 수거입니다 — 그날 무엇이 수거됐는지가 궁금한 것이지,
 *  언제 타이핑했는지가 궁금한 게 아닙니다.
 */
export function fieldInputsOn(data: AppData, date: string = today()): FieldInput[] {
  const name = new Map((data.clients ?? []).map((c) => [c.id, c.name]))
  const retired = new Map((data.retiredClients ?? []).map((c) => [c.id, c.name]))
  const adHoc = adHocIds(data)
  //  그날 그 거래처에 건넨 자재 — 이사님이 카톡 사진에서 확인하던 바로 그것.
  const supply = new Map<string, string>()
  for (const m of data.materials ?? []) {
    if (m.date !== date) continue
    const parts: string[] = []
    if (m.boxCount > 0) parts.push(`박스 ${m.boxCount}`)
    if (m.vinylCount > 0) parts.push(`비닐 ${m.vinylCount}`)
    if (m.needleBoxCount > 0) parts.push(`바늘통 ${m.needleBoxCount}`)
    if (parts.length === 0) continue
    const before = supply.get(m.clientId)
    supply.set(m.clientId, before ? `${before} · ${parts.join(' · ')}` : parts.join(' · '))
  }
  return (data.schedules ?? [])
    .filter((s) => completed(s) && s.date === date)
    .map((s) =>
      toInput(
        s,
        name.get(s.clientId) ?? retired.get(s.clientId) ?? '알 수 없는 거래처',
        adHoc.has(s.id),
        supply.get(s.clientId) ?? '',
      ),
    )
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.atTime.localeCompare(a.atTime))
}

// ─────────────────────────────────────────────────────────────────────────────
// 아직 안 들어온 것 (F4)
//
//  이사님이 저녁이나 새벽에 「누가 아직 안 보냈나」를 기다리는 구조를 줄입니다.
//
//  ⚠ **「업무 누락」이라고 단정하지 않습니다.** 일정이 바뀌었을 수도, 병원이
//    쉬었을 수도, 다음 날 처리하기로 했을 수도 있습니다. 시스템은 그 이유를
//    모릅니다. 그래서 **「아직 입력이 없다」**는 사실만 적습니다.
//  ⚠ 무른 방문(0059)은 세지 않습니다 — 안 가기로 한 것입니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingVisit {
  scheduleId: string
  clientId: string
  clientName: string
  wasteType: WasteType
  /** 예정 시각 HH:mm — 안 정해졌으면 빈 문자열 */
  atTime: string
  /** 기사님이 정해져 있으면 이름 (없으면 빈 문자열) */
  who: string
}

/** 그날 예정인데 **아직 입력이 없는** 방문 */
export function pendingVisitsOn(data: AppData, date: string = today()): PendingVisit[] {
  const name = new Map((data.clients ?? []).map((c) => [c.id, c.name]))
  return (data.schedules ?? [])
    .filter((s) => s.date === date && !completed(s) && isLive(s))
    .map((s) => ({
      scheduleId: s.id,
      clientId: s.clientId,
      clientName: name.get(s.clientId) ?? '알 수 없는 거래처',
      wasteType: s.wasteType,
      atTime: s.scheduledTime ?? '',
      who: (s.driverName ?? '').trim(),
    }))
    .sort((a, b) => a.atTime.localeCompare(b.atTime) || a.clientName.localeCompare(b.clientName, 'ko'))
}

export interface StaffDay {
  /** 기사 이름. 빈 문자열이면 **이름이 안 적힌 것**입니다 (지어내지 않습니다) */
  who: string
  /** 이 이름으로 **입력이 들어온** 방문 수 */
  done: number
  /** 이 이름으로 예정돼 있는데 **아직 입력이 없는** 방문 수 */
  pending: number
  /** 들어온 것만 더한 kg */
  totalKg: number
}

/**
 * 그날을 **사람별로** 묶어 봅니다 — 이사님이 「누구 것이 아직 안 들어왔나」를
 * 한 줄로 보시게.
 *
 * ── 성적표가 아닙니다 ──────────────────────────────────────────────────────
 *
 *  `pending` 은 **「안 했다」가 아닙니다.** 시스템은 이유를 모릅니다 —
 *  일정이 바뀌었을 수도, 병원이 쉬었을 수도, 내일 넣기로 했을 수도
 *  있습니다. 그래서 이 값에 「누락·미이행」 같은 말을 붙이지 않습니다.
 *  화면 문구도 같은 규칙을 지킵니다.
 *
 * ── 두 이름의 출처가 다릅니다 ──────────────────────────────────────────────
 *
 *   done    수거 입력에 **사람이 적은** 기사 이름
 *   pending 일정에 **미리 적어 둔** 담당 기사 이름
 *
 *  이하늘 기사님 자리에 김준기 기사님이 대신 갔으면 두 이름이 갈립니다.
 *  그것을 한쪽으로 맞추지 않습니다 — 맞추면 실제로 간 사람이 지워집니다.
 *  이름이 안 적힌 것은 다른 이름과 합치지 않고 빈 이름 줄로 따로 둡니다.
 */
export function staffDayOn(data: AppData, date: string = today()): StaffDay[] {
  const rows = new Map<string, StaffDay>()
  const at = (who: string): StaffDay => {
    const key = who
    let r = rows.get(key)
    if (!r) {
      r = { who, done: 0, pending: 0, totalKg: 0 }
      rows.set(key, r)
    }
    return r
  }
  for (const i of fieldInputsOn(data, date)) {
    const r = at(i.who)
    r.done += 1
    r.totalKg += i.amountKg
  }
  for (const v of pendingVisitsOn(data, date)) at(v.who).pending += 1
  //  이름이 있는 줄을 먼저, 그 안에서는 아직 안 들어온 것이 많은 순서로.
  //  빈 이름(안 적힌 것)은 맨 아래 — 사람이 아니라 「모르는 것」입니다.
  return [...rows.values()].sort((a, b) => {
    if (!a.who !== !b.who) return a.who ? -1 : 1
    return b.pending - a.pending || b.done - a.done || a.who.localeCompare(b.who, 'ko')
  })
}

export interface FieldDaySummary {
  date: string
  inputs: FieldInput[]
  /**
   * 그날 예정인데 아직 입력이 없는 방문.
   *  ⚠ 「누락」이 아닙니다 — 이유를 시스템이 모릅니다. 사실만 적습니다.
   */
  pending: PendingVisit[]
  /** 몇 곳 (같은 거래처를 두 번 갔으면 한 곳) */
  clients: number
  /** 모두 몇 kg */
  totalKg: number
  /** 예정에 없던 것을 직접 입력한 건수 */
  adHoc: number
  /** 이름이 안 적힌 건수 — 지어내지 않고 그대로 셉니다 */
  noName: number
  /**
   * 사람별 묶음.
   *  ⚠ 성적표가 아닙니다 — `pending` 은 「안 했다」가 아니라 「아직 입력이
   *    없다」입니다. 이유는 시스템이 모릅니다.
   */
  staff: StaffDay[]
}

export function fieldDay(data: AppData, date: string = today()): FieldDaySummary {
  const inputs = fieldInputsOn(data, date)
  return {
    date,
    inputs,
    clients: new Set(inputs.map((i) => i.clientId)).size,
    totalKg: inputs.reduce((s, i) => s + i.amountKg, 0),
    adHoc: inputs.filter((i) => i.adHoc).length,
    noName: inputs.filter((i) => !i.who).length,
    pending: pendingVisitsOn(data, date),
    staff: staffDayOn(data, date),
  }
}

/**
 * 이 거래처의 마지막 수거 한 줄.
 *
 *  거래처 화면에 작게 붙습니다 — 「8월 16일 · 김준기 · 120kg」.
 *  기록이 없으면 null 입니다(「아직 없음」은 화면이 정합니다).
 */
export function lastCollectionOf(data: AppData, clientId: string): FieldInput | null {
  const name = (data.clients ?? []).find((c) => c.id === clientId)?.name
    ?? (data.retiredClients ?? []).find((c) => c.id === clientId)?.name
    ?? '알 수 없는 거래처'
  const rows = (data.schedules ?? [])
    .filter((s) => s.clientId === clientId && completed(s))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  return rows.length > 0 ? toInput(rows[0], name, adHocIds(data).has(rows[0].id)) : null
}

/** 「8월 16일 · 김준기 · 120kg」 — 없는 칸은 조용히 빼고 이어 붙입니다 */
export function lastCollectionLine(i: FieldInput): string {
  const [, m, d] = i.date.split('-').map(Number)
  const parts = [`${m}월 ${d}일`]
  if (i.who) parts.push(i.who)
  parts.push(`${i.amountKg.toLocaleString('ko-KR')}kg`)
  return parts.join(' · ')
}
