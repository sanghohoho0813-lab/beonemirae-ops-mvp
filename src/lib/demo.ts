import type { AppData } from '../types'
import { DEFAULT_OFFICE_STOCK, EMPTY_BASELINE, EMPTY_EXPERIMENT } from '../types'
import { rebuildForToday } from '../data/seed'
import { newDemoSession } from './storage'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 시연 안정화 (3.5단계)
//
//  실사 당일, 대표자가 언제 시연하더라도 동일한 기준 상태에서 설명하고
//  시연 후 원상복구할 수 있도록 하는 "시연 세션" 유틸.
//
//  기준 상태(baseline)는 rebuildForToday(clients)로 결정적으로 재생성합니다.
//   → 별도 스냅샷 저장 없이도 언제나 동일한 기준(오늘 10건: 완료3/긴급1/지연1/예정5,
//     자재·미수금·재고 기본값)으로 복원되며, 여러 번 실행해도 결과가 같습니다(idempotent).
//
//  보존 대상: 실제 거래처 기본정보, 5/15/35 세트, origin='field'(실사용) 기록,
//            시연 세션이 아닌(demoSessionId 없는) 감사기록·자재.
//  정리 대상: origin='demo'(시연 중 입력) 기록, 시연 세션 감사기록, 재고 차감,
//            요청 자동처리 오버라이드 → 모두 기준값으로 복원.
// ─────────────────────────────────────────────────────────────────────────────

/** 시연용 변경만 기준 상태로 되돌립니다. 실사용(field) 기록과 세트/거래처는 유지. */
export function resetDemoSession(data: AppData): AppData {
  const regen = rebuildForToday(data.clients)

  // 실사용(비-시연) 기록만 보존
  const realFieldSchedules = data.schedules.filter((s) => s.origin === 'field')
  const realEvents = data.events.filter((e) => !e.demoSessionId)
  const realMaterialIds = new Set(realEvents.flatMap((e) => e.materialIds))
  const realMaterials = data.materials.filter((m) => realMaterialIds.has(m.id))

  return {
    ...regen,
    schedules: [...regen.schedules, ...realFieldSchedules],
    materials: [...regen.materials, ...realMaterials],
    events: realEvents,
    requestOverrides: [],
    officeStock: { ...DEFAULT_OFFICE_STOCK },
    // 세션 자체는 유지 (이후 입력도 계속 시연 기록으로 태깅)
    demoSession: data.demoSession ?? newDemoSession(),
    // 성과측정 기준값·실증 시작일은 '설정'이므로 시연 초기화 대상이 아닙니다.
    // (시연 중 입력된 이벤트는 함께 제거되므로 '도입 후 측정값'만 초기화됩니다.)
    baseline: data.baseline ?? { ...EMPTY_BASELINE },
    experiment: data.experiment ?? { ...EMPTY_EXPERIMENT },
    // 영업 전환 기록: 시연 세션 중 기록한 건만 정리하고 실사용 기록은 보존합니다.
    leads: (data.leads ?? []).filter((l) => !l.demoSessionId),
    // 병원 요청도 시연 세션 중 등록된 것만 정리합니다.
    requests: (data.requests ?? []).filter((r) => !r.demoSessionId),
  }
}

/** 시연 시작 — 기준 상태로 되돌리고 새 시연 세션을 시작합니다. */
export function startDemoSession(data: AppData): AppData {
  return { ...resetDemoSession(data), demoSession: newDemoSession() }
}

/** 오늘 일정만 기준 상태로 복원 (비상 복구용) — 과거 이력/실사용 기록은 유지. */
export function restoreTodayOnly(data: AppData): AppData {
  const t = today()
  const regen = rebuildForToday(data.clients)
  const baselineToday = regen.schedules.filter((s) => s.date === t)
  // 오늘이 아닌 기존 일정은 그대로 두고, 오늘 일정만 기준값 + 실사용 오늘 입력으로 교체
  const nonTodayExisting = data.schedules.filter((s) => s.date !== t)
  const realTodayField = data.schedules.filter((s) => s.date === t && s.origin === 'field')
  return {
    ...data,
    schedules: [...nonTodayExisting, ...baselineToday, ...realTodayField],
  }
}

/** 시연 기준 상태의 오늘 요약 (테스트·표시용) */
export function demoBaselineToday(data: AppData) {
  const t = today()
  const list = rebuildForToday(data.clients).schedules.filter((s) => s.date === t)
  return {
    total: list.length,
    완료: list.filter((s) => s.status === '완료').length,
    긴급: list.filter((s) => s.status === '긴급').length,
    지연: list.filter((s) => s.status === '지연').length,
    예정: list.filter((s) => s.status === '예정').length,
  }
}
