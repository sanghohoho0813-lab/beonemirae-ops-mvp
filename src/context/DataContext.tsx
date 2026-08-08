import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  Client,
  MaterialSupply,
  NoteKind,
  Payment,
  Schedule,
  SiteNote,
  Vehicle,
  BaselineMetrics,
  LeadStage,
  SalesLead,
  RequestKind,
  RequestStatus,
} from '../types'
import { EMPTY_APP_DATA } from '../types'
import { loadData, resetData, saveData, uid, loadClientSet, saveClientSet, type ClientSetSize } from '../lib/storage'
import {
  applyCollectionCompletion,
  rollbackCollectionCompletion,
  type CollectionCompletionInput,
  type CommandResult,
} from '../lib/collection'
import { resetDemoSession, startDemoSession, restoreTodayOnly } from '../lib/demo'
import { leadKey } from '../lib/sales'
import type { NextAction } from '../lib/insights'
import { thisMonth } from '../lib/format'
import { useAuth } from './AuthContext'
import { friendlyError, isSupabaseConfigured } from '../lib/supabase'
import * as repo from '../lib/repo'

// ─────────────────────────────────────────────────────────────────────────────
// 전역 데이터 컨텍스트
//
// 모든 CRUD 는 이 컨텍스트를 통해 이루어지며, 변경 시 자동으로 localStorage 에
// 영속화됩니다. 컴포넌트는 useData() 훅으로 접근합니다.
// ─────────────────────────────────────────────────────────────────────────────

interface DataContextValue {
  data: AppData
  // 거래처
  addClient: (c: Omit<Client, 'id'>) => Client
  updateClient: (id: string, patch: Partial<Client>) => void
  removeClient: (id: string) => void
  // 현장 메모 / 특이사항 (병원별)
  addNote: (clientId: string, kind: NoteKind, content: string) => SiteNote
  toggleNote: (id: string) => void
  removeNote: (id: string) => void
  notesFor: (clientId: string) => SiteNote[]
  // 수거일정
  addSchedule: (s: Omit<Schedule, 'id'>) => Schedule
  updateSchedule: (id: string, patch: Partial<Schedule>) => void
  removeSchedule: (id: string) => void
  completeSchedule: (id: string, actualAmount: number, memo?: string) => void
  // 수거 완료 통합 커맨드 (3단계) — 입력 한 번으로 일정/이력/자재/재고/요청/감사기록 연결
  completeCollection: (input: CollectionCompletionInput) => CommandResult
  revertCollection: (eventId: string) => CommandResult
  // 시연 안정화 (3.5단계)
  resetDemo: () => void // 시연용 변경만 기준 상태로 복원
  startDemo: () => void // 기준 복원 + 새 시연 세션 시작
  restoreToday: () => void // 오늘 일정만 기준 복원 (비상)
  /** 운영 모드 전환 — 끄면 이후 입력이 '실제 현장 기록'으로 저장됩니다(성과 실증 대상). */
  setDemoActive: (active: boolean) => void
  // 차량 — 차량이 없으면 수거 완료 입력이 불가능하므로 앱에서 등록할 수 있어야 합니다
  addVehicle: (v: Omit<Vehicle, 'id'>) => Vehicle
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void
  removeVehicle: (id: string) => void
  // 자재공급
  addMaterial: (m: Omit<MaterialSupply, 'id'>) => MaterialSupply
  removeMaterial: (id: string) => void
  // 결제
  addPayment: (p: Omit<Payment, 'id'>) => Payment
  updatePayment: (id: string, patch: Partial<Payment>) => void
  markPaid: (id: string) => void
  // 거래처 조회 헬퍼
  clientById: (id: string) => Client | undefined
  // 데이터 초기화
  reset: () => void
  // 전체 데이터 교체 (JSON 가져오기 등)
  replaceAll: (data: AppData) => void
  // 거래처 데이터 세트 (0=실제 5곳, 10/20/30=실제+시연)
  clientSet: ClientSetSize
  setClientSet: (demoCount: ClientSetSize) => void
  // AX 실증·성과측정 (v4)
  setBaseline: (patch: Partial<BaselineMetrics>) => void // 도입 전 기준값 (사용자 입력)
  setExperimentStart: (date: string | null) => void // 실증 시작일
  // 매출 전환 실증 (v5) — 추천 → 제안 → 수락 → 실제 매출
  setLeadStage: (action: NextAction, stage: LeadStage, month?: string) => void
  setLeadRevenue: (leadId: string, amount: number | null) => void
  // ── v7: 병원 고객 서비스 ──
  /** 병원 요청 등록 (병원 포털 직접 등록 / 비원미래 대행 접수) */
  addRequest: (r: {
    clientId: string
    kind: RequestKind
    content: string
    desiredDate?: string | null
    urgent?: boolean
    source?: 'portal' | 'staff'
    requesterName?: string
  }) => void
  /** 비원미래 담당자의 요청 처리 (상태 변경 · 병원에 보이는 회신) */
  handleRequest: (id: string, patch: { status?: RequestStatus; reply?: string }) => void
  /** 추천을 병원 포털로 전달 — 이후 수락은 병원이 직접 누릅니다 */
  shareProposal: (action: NextAction, message: string, month?: string) => void
  /** 병원 담당자의 제안 응답 (수락 / 보류) */
  respondProposal: (leadId: string, accept: boolean) => void
  // ── v6: 실사용 전환 (Supabase) ──
  /** 'live' = 로그인 상태의 서버 DB, 'demo' = 이 브라우저에만 저장되는 시연 데이터 */
  mode: 'live' | 'demo'
  /** 서버 통신 상태 — 화면에서 로딩/저장중/실패를 그대로 보여주기 위한 값 */
  sync: { loading: boolean; saving: boolean; error: string | null; lastSavedAt: string | null }
  /** 서버에서 다시 읽어옵니다 (다른 기기에서 입력한 내용 반영) */
  reload: () => Promise<void>
  /** 마지막 실패한 저장을 다시 시도 */
  retry: () => Promise<void>
  clearSyncError: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { mode } = useAuth()
  // 서버가 연결된 환경에서는 시연 데이터로 시작하지 않습니다.
  // (로그인 직후 서버 응답을 기다리는 동안 존재하지 않는 병원·일정이
  //  실제 데이터처럼 보이면 안 됩니다)
  const [data, setData] = useState<AppData>(() =>
    isSupabaseConfigured ? EMPTY_APP_DATA : loadData(),
  )
  const [clientSet, setClientSetState] = useState<ClientSetSize>(() => loadClientSet())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  // 실패한 작업을 그대로 다시 실행하기 위해 보관합니다 (입력값이 사라지지 않도록).
  const pending = useRef<null | (() => Promise<void>)>(null)
  const live = mode === 'live'

  // 변경 시 영속화 — 서버가 연결된 환경에서는 원본이 서버이므로 저장하지 않습니다.
  // (시연 데이터가 실제 데이터를 덮어쓰지 않게 하는 안전장치이기도 합니다.
  //  로그아웃 상태에서도 저장하지 않아, 실사용 브라우저에 시연 데이터가
  //  쌓이지 않습니다.)
  useEffect(() => {
    if (!isSupabaseConfigured) saveData(data)
  }, [data])

  /** 서버에서 전체 운영 데이터를 다시 읽어옵니다. */
  const reload = useCallback(async () => {
    if (mode !== 'live') return
    setLoading(true)
    setSyncError(null)
    try {
      setData(await repo.loadAppData())
    } catch (e) {
      setSyncError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [mode])

  // 로그인/로그아웃 시 데이터 원본을 전환합니다.
  // 서버가 연결된 환경에서 로그아웃하면 화면을 비웁니다 — 앞사람의 운영 데이터가
  // 남아 있어서도, 그 자리를 시연 데이터가 채워서도 안 됩니다.
  useEffect(() => {
    if (live) void reload()
    else setData(isSupabaseConfigured ? EMPTY_APP_DATA : loadData())
  }, [live, reload])

  /**
   * 서버 반영 후 최신 상태를 다시 읽어옵니다.
   * 실패하면 화면 상태를 바꾸지 않고 오류만 노출해, 사용자가 입력한 내용이
   * 사라지지 않도록 합니다(재시도 가능).
   */
  const runLive = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      setSaving(true)
      setSyncError(null)
      try {
        await fn()
        setData(await repo.loadAppData())
        setLastSavedAt(new Date().toISOString())
        pending.current = null
        return true
      } catch (e) {
        setSyncError(friendlyError(e))
        pending.current = fn
        return false
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const retry = useCallback(async () => {
    const fn = pending.current
    if (fn) await runLive(fn)
  }, [runLive])

  const clearSyncError = useCallback(() => setSyncError(null), [])

  // ── 거래처 ──────────────────────────────────────────────────────────────
  const addClient = useCallback(
    (c: Omit<Client, 'id'>) => {
      const client: Client = { ...c, id: uid('c') }
      if (live) {
        void runLive(async () => {
          const created = await repo.insertClient(c)
          await repo.writeAudit({
            action: 'client.create',
            entity: 'clients',
            entityId: created.id,
            clientId: created.id,
            clientName: created.name,
            after: c,
            summary: `거래처 등록 — ${created.name}`,
          })
        })
        return client
      }
      setData((d) => ({ ...d, clients: [...d.clients, client] }))
      return client
    },
    [live, runLive],
  )

  const updateClient = useCallback(
    (id: string, patch: Partial<Client>) => {
      if (live) {
        const before = data.clients.find((c) => c.id === id)
        void runLive(async () => {
          await repo.updateClient(id, patch)
          await repo.writeAudit({
            action: 'client.update',
            entity: 'clients',
            entityId: id,
            clientId: id,
            clientName: before?.name ?? '',
            before,
            after: patch,
            summary: `거래처 정보 수정 — ${before?.name ?? id}`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }))
    },
    [live, runLive, data.clients],
  )

  /** 실사용에서는 삭제 대신 비활성화합니다 — 과거 수거 이력이 끊기지 않도록. */
  const removeClient = useCallback(
    (id: string) => {
      if (live) {
        const before = data.clients.find((c) => c.id === id)
        void runLive(async () => {
          await repo.deactivateClient(id)
          await repo.writeAudit({
            action: 'client.deactivate',
            entity: 'clients',
            entityId: id,
            clientId: id,
            clientName: before?.name ?? '',
            summary: `거래처 비활성화 — ${before?.name ?? id}`,
          })
        })
        return
      }
      // 거래처를 지우면 그 거래처의 현장 메모도 함께 정리합니다.
      setData((d) => ({
        ...d,
        clients: d.clients.filter((c) => c.id !== id),
        notes: (d.notes ?? []).filter((n) => n.clientId !== id),
      }))
    },
    [live, runLive, data.clients],
  )

  // ── 현장 메모 / 특이사항 ────────────────────────────────────────────────
  // 한 번 기록하면 오늘 일정·수거 입력·대시보드에서 함께 확인됩니다.
  const addNote = useCallback(
    (clientId: string, kind: NoteKind, content: string) => {
      const note: SiteNote = {
        id: uid('note'),
        clientId,
        kind,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        done: false,
      }
      if (live) {
        void runLive(async () => {
          await repo.insertNote({ clientId, kind, content: content.trim(), done: false })
        })
        return note
      }
      setData((d) => ({ ...d, notes: [note, ...(d.notes ?? [])] }))
      return note
    },
    [live, runLive],
  )

  const toggleNote = useCallback(
    (id: string) => {
      if (live) {
        const cur = (data.notes ?? []).find((n) => n.id === id)
        void runLive(async () => repo.setNoteDone(id, !cur?.done))
        return
      }
      setData((d) => ({
        ...d,
        notes: (d.notes ?? []).map((n) => (n.id === id ? { ...n, done: !n.done } : n)),
      }))
    },
    [live, runLive, data.notes],
  )

  /** 실사용에서는 메모도 삭제 대신 보관 처리합니다. */
  const removeNote = useCallback(
    (id: string) => {
      if (live) {
        void runLive(async () => repo.archiveNote(id))
        return
      }
      setData((d) => ({ ...d, notes: (d.notes ?? []).filter((n) => n.id !== id) }))
    },
    [live, runLive],
  )

  const notesFor = useCallback(
    (clientId: string) =>
      (data.notes ?? [])
        .filter((n) => n.clientId === clientId)
        .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt)),
    [data.notes],
  )

  // ── 수거일정 ────────────────────────────────────────────────────────────
  const addSchedule = useCallback(
    (s: Omit<Schedule, 'id'>) => {
      const schedule: Schedule = { ...s, id: uid('s') }
      if (live) {
        void runLive(async () => {
          const created = await repo.insertSchedule(s)
          await repo.writeAudit({
            action: 'schedule.create',
            entity: 'schedules',
            entityId: created.id,
            clientId: s.clientId,
            summary: `수거일정 생성 — ${s.date} ${s.wasteType}`,
          })
        })
        return schedule
      }
      setData((d) => ({ ...d, schedules: [...d.schedules, schedule] }))
      return schedule
    },
    [live, runLive],
  )

  const updateSchedule = useCallback(
    (id: string, patch: Partial<Schedule>) => {
      if (live) {
        const before = data.schedules.find((s) => s.id === id)
        void runLive(async () => {
          await repo.updateSchedule(id, patch)
          await repo.writeAudit({
            action: 'schedule.update',
            entity: 'schedules',
            entityId: id,
            clientId: before?.clientId,
            before,
            after: patch,
            summary: `수거일정 수정 — ${before?.date ?? id}`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        schedules: d.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }))
    },
    [live, runLive, data.schedules],
  )

  const removeSchedule = useCallback(
    (id: string) => {
      if (live) {
        void runLive(async () => {
          await repo.deleteSchedule(id)
          await repo.writeAudit({
            action: 'schedule.delete',
            entity: 'schedules',
            entityId: id,
            summary: '수거일정 삭제',
          })
        })
        return
      }
      setData((d) => ({ ...d, schedules: d.schedules.filter((s) => s.id !== id) }))
    },
    [live, runLive],
  )

  // 완료된 일정의 수거량·메모 수정 (오늘 일정 화면의 '수정')
  //
  // 실제 운영에서는 서버가 원본입니다. 여기서 화면 상태만 바꾸면 새로고침하는
  // 순간 수정한 값이 사라지는데, 사용자에게는 저장된 것처럼 보입니다.
  const completeSchedule = useCallback(
    (id: string, actualAmount: number, memo?: string) => {
      const patch: Partial<Schedule> = {
        status: '완료',
        actualAmount,
        completedAt: new Date().toISOString(),
        ...(memo !== undefined ? { memo } : {}),
      }
      if (live) {
        const before = data.schedules.find((s) => s.id === id)
        void runLive(async () => {
          await repo.updateSchedule(id, patch)
          await repo.writeAudit({
            action: 'schedule.complete',
            entity: 'schedules',
            entityId: id,
            clientId: before?.clientId,
            before,
            after: patch,
            summary: `수거 완료 수정 — ${before?.date ?? id} · ${actualAmount}kg`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        schedules: d.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }))
    },
    [live, runLive, data.schedules],
  )

  // ── 수거 완료 통합 커맨드 (3단계) ───────────────────────────────────────
  // 검증→적용→저장을 한 번에 수행. 현재 커밋된 data 기준으로 계산(원자적)합니다.
  const completeCollection = useCallback(
    (input: CollectionCompletionInput): CommandResult => {
      if (live) {
        // 실사용: 서버 함수(complete_collection)가 일정·이력·자재·재고·요청·감사기록을
        // 한 트랜잭션에서 처리합니다. 여기서는 먼저 로컬 검증을 돌려 즉시 피드백을 주고,
        // 실제 반영은 서버가 다시 검증한 뒤 수행합니다(중복 완료·재고 초과는 서버가 최종 차단).
        const precheck = applyCollectionCompletion(data, { ...input, demoSessionId: null })
        if (!precheck.ok) return precheck

        // 관련 병원 요청은 서버(complete_collection)가 같은 트랜잭션에서 직접 닫습니다.
        void runLive(async () => {
          await repo.completeCollection(input)
        })
        return { ok: true, errors: [], warnings: precheck.warnings }
      }

      // 시연 모드: 로컬에서 순수 함수로 처리하고 시연 기록으로 태깅합니다.
      const demoSessionId = data.demoSession?.active ? data.demoSession.id : null
      const result = applyCollectionCompletion(data, { ...input, demoSessionId })
      if (result.ok && result.data) setData(result.data)
      return result
    },
    [data, live, runLive],
  )

  const revertCollection = useCallback(
    (eventId: string): CommandResult => {
      if (live) {
        const e = data.events.find((x) => x.id === eventId)
        if (!e) return { ok: false, errors: ['취소할 입력을 찾을 수 없습니다.'], warnings: [] }
        if (e.reverted) return { ok: false, errors: ['이미 취소된 입력입니다.'], warnings: [] }
        void runLive(async () => repo.revertCollection(eventId))
        return { ok: true, errors: [], warnings: [] }
      }
      const result = rollbackCollectionCompletion(data, eventId)
      if (result.ok && result.data) setData(result.data)
      return result
    },
    [data, live, runLive],
  )

  // ── 시연 안정화 ─────────────────────────────────────────────────────────
  // ── AX 실증·성과측정 ────────────────────────────────────────────────────
  // 기준값은 사용자가 입력한 값만 저장합니다(시스템이 임의 값을 만들지 않음).
  const setBaseline = useCallback(
    (patch: Partial<BaselineMetrics>) => {
      if (live) {
        const row: Record<string, number | null> = {}
        if ('adminMinutesPerCollection' in patch) row.admin_minutes_per_collection = patch.adminMinutesPerCollection ?? null
        if ('repeatEntriesPerCollection' in patch) row.repeat_entries_per_collection = patch.repeatEntriesPerCollection ?? null
        if ('monthlyDocHours' in patch) row.monthly_doc_hours = patch.monthlyDocHours ?? null
        if ('monthlyReworkCount' in patch) row.monthly_rework_count = patch.monthlyReworkCount ?? null
        if ('dailyCapacity' in patch) row.daily_capacity = patch.dailyCapacity ?? null
        if (Object.keys(row).length) void runLive(async () => repo.saveBaseline(row))
        return
      }
      setData((d) => ({
        ...d,
        baseline: { ...d.baseline, ...patch, updatedAt: new Date().toISOString() },
      }))
    },
    [live, runLive],
  )

  const setExperimentStart = useCallback(
    (date: string | null) => {
      if (live) {
        void runLive(async () => repo.saveExperimentStart(date))
        return
      }
      setData((d) => ({ ...d, experiment: { ...d.experiment, startDate: date } }))
    },
    [live, runLive],
  )

  // ── 매출 전환 실증 ──────────────────────────────────────────────────────
  // 추천은 파생값이라 저장하지 않고, 담당자가 상태를 기록할 때만 lead 를 만듭니다.
  const setLeadStage = useCallback((action: NextAction, stage: LeadStage, month = thisMonth()) => {
    if (live) {
      void runLive(async () =>
        repo.upsertLead({
          key: leadKey(action.clientId, action.kind, month),
          clientId: action.clientId,
          clientName: action.clientName,
          kind: action.kind,
          title: action.title,
          month,
          estValue: action.estValue,
          stage,
          // 수락에서 벗어나면 실제 매출을 함께 비웁니다(유령 값 방지).
          actualRevenue: stage === '수락' ? (data.leads ?? []).find((l) => l.key === leadKey(action.clientId, action.kind, month))?.actualRevenue ?? null : null,
          actualRevenueAt: stage === '수락' ? (data.leads ?? []).find((l) => l.key === leadKey(action.clientId, action.kind, month))?.actualRevenueAt ?? null : null,
          demoSessionId: null,
        }).then(() =>
          repo.writeAudit({
            action: 'lead.stage',
            entity: 'sales_leads',
            entityId: leadKey(action.clientId, action.kind, month),
            clientId: action.clientId,
            clientName: action.clientName,
            after: { stage, kind: action.kind, month },
            summary: `영업 단계 변경 — ${action.clientName} · ${action.title} → ${stage}`,
          }),
        ),
      )
      return
    }
    setData((d) => {
      const key = leadKey(action.clientId, action.kind, month)
      const at = new Date().toISOString()
      const demoSessionId = d.demoSession?.active ? d.demoSession.id : null
      const existing = (d.leads ?? []).find((l) => l.key === key)
      if (existing) {
        if (existing.stage === stage) return d
        // 수락에서 벗어나면 입력된 실제 매출을 함께 비웁니다.
        // (수락이 아닌 건에 매출이 남아 있으면 집계에서 보이지 않는 유령 값이 됩니다.)
        const leavingAccepted = existing.stage === '수락' && stage !== '수락'
        return {
          ...d,
          leads: d.leads.map((l) =>
            l.key === key
              ? {
                  ...l,
                  stage,
                  history: [...l.history, { stage, at }],
                  actualRevenue: leavingAccepted ? null : l.actualRevenue,
                  actualRevenueAt: leavingAccepted ? null : l.actualRevenueAt,
                }
              : l,
          ),
        }
      }
      const lead: SalesLead = {
        id: uid('lead'),
        key,
        clientId: action.clientId,
        clientName: action.clientName,
        kind: action.kind,
        title: action.title,
        month,
        estValue: action.estValue,
        stage,
        actualRevenue: null,
        actualRevenueAt: null,
        history: [
          { stage: '추천', at },
          ...(stage === '추천' ? [] : [{ stage, at }]),
        ],
        createdAt: at,
        demoSessionId,
      }
      return { ...d, leads: [...(d.leads ?? []), lead] }
    })
  }, [live, runLive, data.leads])

  /** 실제 매출 입력 — null 이면 '미입력'으로 되돌립니다(0원과 구분). */
  const setLeadRevenue = useCallback(
    (leadId: string, amount: number | null) => {
      if (live) {
        const lead = (data.leads ?? []).find((l) => l.id === leadId)
        void runLive(async () => {
          await repo.setLeadRevenue(leadId, amount)
          await repo.writeAudit({
            action: 'lead.revenue',
            entity: 'sales_leads',
            entityId: leadId,
            clientId: lead?.clientId,
            clientName: lead?.clientName,
            before: { actualRevenue: lead?.actualRevenue ?? null },
            after: { actualRevenue: amount },
            summary:
              amount == null
                ? `실제 매출 삭제 — ${lead?.clientName ?? ''} · ${lead?.title ?? ''}`
                : `실제 매출 입력 — ${lead?.clientName ?? ''} · ${lead?.title ?? ''} · ${amount.toLocaleString('ko-KR')}원`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        leads: (d.leads ?? []).map((l) =>
          l.id === leadId
            ? { ...l, actualRevenue: amount, actualRevenueAt: amount == null ? null : new Date().toISOString() }
            : l,
        ),
      }))
    },
    // data.leads 를 읽어 변경 전 값을 감사기록에 남기므로 의존성에 포함합니다.
    [live, runLive, data.leads],
  )

  // ── 병원 요청 (병원 고객 서비스) ────────────────────────────────────────
  // 병원 담당자가 포털에서 직접 올리거나, 전화·카톡으로 받은 것을 비원미래가
  // 대신 접수합니다. 어느 쪽이든 같은 기록으로 남아 오늘 일정·수거 입력과 연결됩니다.
  const addRequest = useCallback(
    (r: {
      clientId: string
      kind: RequestKind
      content: string
      desiredDate?: string | null
      urgent?: boolean
      source?: 'portal' | 'staff'
      requesterName?: string
    }) => {
      const payload = {
        clientId: r.clientId,
        kind: r.kind,
        content: r.content.trim(),
        desiredDate: r.desiredDate ?? null,
        urgent: r.urgent ?? false,
        source: r.source ?? 'portal',
        requesterName: r.requesterName ?? '',
      }
      if (live) {
        void runLive(async () => repo.insertRequest(payload))
        return
      }
      const now = new Date().toISOString()
      setData((d) => ({
        ...d,
        requests: [
          {
            ...payload,
            id: uid('creq'),
            clientName: d.clients.find((c) => c.id === r.clientId)?.name ?? '',
            status: '접수' as const,
            reply: '',
            handledBy: null,
            handledAt: null,
            createdAt: now,
            demoSessionId: d.demoSession?.active ? d.demoSession.id : null,
          },
          ...(d.requests ?? []),
        ],
      }))
    },
    [live, runLive],
  )

  /** 비원미래 담당자의 요청 처리 — 상태 변경 + 병원에 보이는 회신 */
  const handleRequest = useCallback(
    (id: string, patch: { status?: RequestStatus; reply?: string }) => {
      if (live) {
        const before = (data.requests ?? []).find((r) => r.id === id)
        void runLive(async () => {
          await repo.updateRequest(id, patch)
          await repo.writeAudit({
            action: 'request.handle',
            entity: 'client_requests',
            entityId: id,
            clientId: before?.clientId,
            clientName: before?.clientName,
            screen: '병원 요청',
            before,
            after: patch,
            summary: `병원 요청 처리 — ${before?.clientName ?? ''} ${before?.kind ?? ''} → ${patch.status ?? '회신'}`,
          })
        })
        return
      }
      const at = new Date().toISOString()
      setData((d) => ({
        ...d,
        requests: (d.requests ?? []).map((r) =>
          r.id === id ? { ...r, ...patch, handledAt: patch.status ? at : r.handledAt } : r,
        ),
      }))
    },
    [live, runLive, data.requests],
  )

  /**
   * 추천을 병원 포털로 전달합니다 — 이후 '수락'은 병원이 직접 누릅니다.
   * 추천 자체는 파생값이라 저장되어 있지 않으므로, 전달할 때 lead 를 만들며 함께 공유합니다.
   */
  const shareProposal = useCallback(
    (action: NextAction, message: string, month = thisMonth()) => {
      const key = leadKey(action.clientId, action.kind, month)
      const at = new Date().toISOString()
      if (live) {
        const existing = (data.leads ?? []).find((l) => l.key === key)
        void runLive(async () => {
          await repo.upsertLead({
            key,
            clientId: action.clientId,
            clientName: action.clientName,
            kind: action.kind,
            title: action.title,
            month,
            estValue: action.estValue,
            stage: '제안',
            actualRevenue: existing?.actualRevenue ?? null,
            actualRevenueAt: existing?.actualRevenueAt ?? null,
            demoSessionId: null,
            sharedWithClient: true,
            sharedAt: at,
            clientMessage: message,
          })
          await repo.writeAudit({
            action: 'proposal.share',
            entity: 'sales_leads',
            clientId: action.clientId,
            clientName: action.clientName,
            screen: '추천',
            summary: `병원에 제안 전달 — ${action.clientName} ${action.title}`,
          })
        })
        return
      }
      setData((d) => {
        const existing = (d.leads ?? []).find((l) => l.key === key)
        if (existing) {
          return {
            ...d,
            leads: d.leads.map((l) =>
              l.key === key
                ? {
                    ...l,
                    stage: '제안' as const,
                    sharedWithClient: true,
                    sharedAt: at,
                    clientMessage: message,
                    history: [...l.history, { stage: '제안' as const, at }],
                  }
                : l,
            ),
          }
        }
        const lead: SalesLead = {
          id: uid('lead'),
          key,
          clientId: action.clientId,
          clientName: action.clientName,
          kind: action.kind,
          title: action.title,
          month,
          estValue: action.estValue,
          stage: '제안',
          actualRevenue: null,
          actualRevenueAt: null,
          history: [
            { stage: '추천', at },
            { stage: '제안', at },
          ],
          createdAt: at,
          demoSessionId: d.demoSession?.active ? d.demoSession.id : null,
          sharedWithClient: true,
          sharedAt: at,
          clientMessage: message,
        }
        return { ...d, leads: [...(d.leads ?? []), lead] }
      })
    },
    [live, runLive, data.leads],
  )

  /** 병원 담당자의 제안 응답 — 수락/보류 (실제 고객 행동) */
  const respondProposal = useCallback(
    (leadId: string, accept: boolean) => {
      const stage = accept ? ('수락' as const) : ('보류' as const)
      if (live) {
        void runLive(async () => repo.respondToProposal(leadId, accept))
        return
      }
      const at = new Date().toISOString()
      setData((d) => ({
        ...d,
        leads: (d.leads ?? []).map((l) =>
          l.id === leadId
            ? {
                ...l,
                stage,
                clientRespondedAt: at,
                actualRevenue: accept ? l.actualRevenue : null,
                actualRevenueAt: accept ? l.actualRevenueAt : null,
                history: [...l.history, { stage, at }],
              }
            : l,
        ),
      }))
    },
    [live, runLive],
  )

  // ── 시연 전용 기능 ──────────────────────────────────────────────────────
  // 실제 운영(live) 모드에서는 시연 초기화·복원이 동작하지 않습니다.
  // 실제 DB 데이터를 시연 버튼으로 지우는 사고를 원천 차단합니다.
  const setDemoActive = useCallback(
    (active: boolean) => {
      if (live) return
      setData((d) => ({
        ...d,
        demoSession: d.demoSession
          ? { ...d.demoSession, active }
          : { id: uid('demo'), startedAt: new Date().toISOString(), active },
      }))
    },
    [live],
  )

  const resetDemo = useCallback(() => {
    if (live) return
    setData((d) => resetDemoSession(d))
  }, [live])
  const startDemo = useCallback(() => {
    if (live) return
    setData((d) => startDemoSession(d))
  }, [live])
  const restoreToday = useCallback(() => {
    if (live) return
    setData((d) => restoreTodayOnly(d))
  }, [live])

  // ── 차량 ────────────────────────────────────────────────────────────────
  const addVehicle = useCallback(
    (v: Omit<Vehicle, 'id'>) => {
      const vehicle: Vehicle = { ...v, id: uid('v') }
      if (live) {
        void runLive(async () => {
          const created = await repo.insertVehicle(v)
          await repo.writeAudit({
            action: 'vehicle.create',
            entity: 'vehicles',
            entityId: created.id,
            summary: `차량 등록 — ${created.name} (${v.wasteType})`,
          })
        })
        return vehicle
      }
      setData((d) => ({ ...d, vehicles: [...d.vehicles, vehicle] }))
      return vehicle
    },
    [live, runLive],
  )

  const updateVehicle = useCallback(
    (id: string, patch: Partial<Vehicle>) => {
      if (live) {
        const before = data.vehicles.find((v) => v.id === id)
        void runLive(async () => {
          await repo.updateVehicle(id, patch)
          await repo.writeAudit({
            action: 'vehicle.update',
            entity: 'vehicles',
            entityId: id,
            before,
            after: patch,
            summary: `차량 정보 수정 — ${before?.name ?? id}`,
          })
        })
        return
      }
      setData((d) => ({ ...d, vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) }))
    },
    [live, runLive, data.vehicles],
  )

  /** 차량도 삭제 대신 비활성화 — 과거 배차 이력이 끊기지 않도록 */
  const removeVehicle = useCallback(
    (id: string) => {
      if (live) {
        const before = data.vehicles.find((v) => v.id === id)
        void runLive(async () => {
          await repo.deactivateVehicle(id)
          await repo.writeAudit({
            action: 'vehicle.deactivate',
            entity: 'vehicles',
            entityId: id,
            summary: `차량 비활성화 — ${before?.name ?? id}`,
          })
        })
        return
      }
      setData((d) => ({ ...d, vehicles: d.vehicles.filter((v) => v.id !== id) }))
    },
    [live, runLive, data.vehicles],
  )

  // ── 자재공급 ────────────────────────────────────────────────────────────
  const addMaterial = useCallback(
    (m: Omit<MaterialSupply, 'id'>) => {
      const material: MaterialSupply = { ...m, id: uid('m') }
      if (live) {
        void runLive(async () => {
          await repo.insertMaterial(m)
          await repo.writeAudit({
            action: 'material.supply',
            entity: 'materials',
            clientId: m.clientId,
            summary: `자재 공급 기록 — 박스 ${m.boxCount} · 비닐 ${m.vinylCount} · 바늘통 ${m.needleBoxCount}`,
          })
        })
        return material
      }
      setData((d) => ({ ...d, materials: [...d.materials, material] }))
      return material
    },
    [live, runLive],
  )

  const removeMaterial = useCallback(
    (id: string) => {
      if (live) {
        const before = data.materials.find((m) => m.id === id)
        void runLive(async () => {
          await repo.deleteMaterial(id)
          await repo.writeAudit({
            action: 'material.delete',
            entity: 'materials',
            entityId: id,
            clientId: before?.clientId,
            before,
            summary: `자재 공급 기록 삭제 — ${before?.date ?? id}`,
          })
        })
        return
      }
      setData((d) => ({ ...d, materials: d.materials.filter((m) => m.id !== id) }))
    },
    [live, runLive, data.materials],
  )

  // ── 결제 ────────────────────────────────────────────────────────────────
  const addPayment = useCallback(
    (p: Omit<Payment, 'id'>) => {
      const payment: Payment = { ...p, id: uid('p') }
      if (live) {
        void runLive(async () => {
          const created = await repo.insertPayment(p)
          await repo.writeAudit({
            action: 'payment.create',
            entity: 'payments',
            entityId: created.id,
            clientId: p.clientId,
            after: created,
            summary: `청구 등록 — ${p.billingMonth} · ${p.amount.toLocaleString()}원`,
          })
        })
        return payment
      }
      setData((d) => ({ ...d, payments: [...d.payments, payment] }))
      return payment
    },
    [live, runLive],
  )

  const updatePayment = useCallback(
    (id: string, patch: Partial<Payment>) => {
      if (live) {
        void runLive(async () => repo.updatePayment(id, patch))
        return
      }
      setData((d) => ({
        ...d,
        payments: d.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }))
    },
    [live, runLive],
  )

  const markPaid = useCallback(
    (id: string) => {
      const paidAt = new Date().toISOString()
      if (live) {
        void runLive(async () => {
          await repo.updatePayment(id, { status: '입금완료', paidAt })
          await repo.writeAudit({
            action: 'payment.paid',
            entity: 'payments',
            entityId: id,
            summary: '입금 완료 처리',
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        payments: d.payments.map((p) => (p.id === id ? { ...p, status: '입금완료', paidAt } : p)),
      }))
    },
    [live, runLive],
  )

  // 아래 세 가지는 시연/로컬 데이터 전용입니다.
  // 실제 운영 모드에서는 서버 데이터를 건드리지 않습니다.
  const reset = useCallback(() => {
    if (live) return
    setData(resetData(loadClientSet()))
  }, [live])

  const replaceAll = useCallback(
    (next: AppData) => {
      if (live) return
      setData(next)
    },
    [live],
  )

  // 거래처 세트 전환 — 해당 세트 기준으로 데이터 재생성
  const setClientSet = useCallback(
    (demoCount: ClientSetSize) => {
      if (live) return
      saveClientSet(demoCount)
      setClientSetState(demoCount)
      setData(resetData(demoCount))
    },
    [live],
  )

  const clientById = useCallback(
    (id: string) => data.clients.find((c) => c.id === id),
    [data.clients],
  )

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      addClient,
      updateClient,
      removeClient,
      addNote,
      toggleNote,
      removeNote,
      notesFor,
      addSchedule,
      updateSchedule,
      removeSchedule,
      completeSchedule,
      completeCollection,
      revertCollection,
      resetDemo,
      startDemo,
      restoreToday,
      setDemoActive,
      addVehicle,
      updateVehicle,
      removeVehicle,
      addMaterial,
      removeMaterial,
      addPayment,
      updatePayment,
      markPaid,
      clientById,
      reset,
      replaceAll,
      clientSet,
      setClientSet,
      setBaseline,
      setExperimentStart,
      setLeadStage,
      setLeadRevenue,
      addRequest,
      handleRequest,
      shareProposal,
      respondProposal,
      mode,
      sync: { loading, saving, error: syncError, lastSavedAt },
      reload,
      retry,
      clearSyncError,
    }),
    [
      data,
      addClient,
      updateClient,
      removeClient,
      addNote,
      toggleNote,
      removeNote,
      notesFor,
      addSchedule,
      updateSchedule,
      removeSchedule,
      completeSchedule,
      completeCollection,
      revertCollection,
      resetDemo,
      startDemo,
      restoreToday,
      setDemoActive,
      addVehicle,
      updateVehicle,
      removeVehicle,
      addMaterial,
      removeMaterial,
      addPayment,
      updatePayment,
      markPaid,
      clientById,
      reset,
      replaceAll,
      clientSet,
      setClientSet,
      setBaseline,
      setExperimentStart,
      setLeadStage,
      setLeadRevenue,
      addRequest,
      handleRequest,
      shareProposal,
      respondProposal,
      mode,
      loading,
      saving,
      syncError,
      lastSavedAt,
      reload,
      retry,
      clearSyncError,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData 는 DataProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
