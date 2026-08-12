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
  OfficeStock,
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
import { buildBillingSnapshot, itemsOf, stockDeltaOf } from '../lib/billing'
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
  addClient: (c: Omit<Client, 'id'>) => Promise<Client | null>
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
  completeCollection: (input: CollectionCompletionInput) => Promise<CommandResult>
  revertCollection: (eventId: string) => Promise<CommandResult>
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
  /** 사무실 자재 입고 — 재고는 공급으로 줄기만 하므로 채우는 길이 필요합니다 */
  receiveStock: (patch: Partial<OfficeStock>, memo: string) => void
  // 결제
  addPayment: (p: Omit<Payment, 'id'>) => Payment
  /** 월 정산을 확인한 뒤 청구로 확정합니다 (금액·명세서를 그 순간으로 고정) */
  confirmBilling: (clientId: string, month: string) => Promise<{ ok: boolean; error: string | null }>
  /** 잘못 만든 청구 — 지우지 않고 취소로 남깁니다 */
  cancelPayment: (id: string, reason: string) => void
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
  }) => Promise<{ ok: boolean; error: string | null }>
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

/** 사무실 재고 4칸의 화면 이름 (감사기록에 그대로 적습니다) */
const STOCK_LABEL: Record<keyof OfficeStock, string> = {
  corrugatedBox: '골판지 전용박스',
  plasticContainer: '합성수지 전용용기',
  bag: '전용 봉투',
  needleBox: '합성수지 바늘통',
}

/**
 * 감사기록에 남길 거래처 이름 — 그만둔 거래처도 찾습니다.
 * (돈 기록에 "거래처" 라고만 남으면 나중에 아무 소용이 없습니다)
 */
function findClientName(data: AppData, clientId: string): string {
  const c =
    data.clients.find((x) => x.id === clientId) ??
    data.retiredClients?.find((x) => x.id === clientId)
  return c?.name ?? '거래처'
}

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

  // ── 남의 입력을 따라잡기 ────────────────────────────────────────────────
  //
  //  여기까지의 동작은 이랬습니다.
  //
  //    내가 저장한다        → runLive 가 곧바로 다시 읽어옴 → 내 화면은 최신
  //    남이 저장한다        → 아무 일도 일어나지 않음      → 내 화면은 그대로
  //
  //  현장에서 수거를 입력해도, 사무실에서 화면을 켜 둔 사람은 브라우저를
  //  새로고침하기 전까지 그 건을 보지 못했습니다. 로그인할 때 한 번 읽고
  //  끝이었기 때문입니다. "실시간으로 넘어온다"고 알고 계시면 곤란한
  //  동작입니다 — 사무실은 오지 않은 수거로 알고 병원에 전화하게 됩니다.
  //
  //  두 가지 계기로 다시 읽어옵니다.
  //
  //    화면으로 돌아올 때  다른 탭·앱에 갔다 오면 그 즉시
  //    켜 두는 동안        45초마다 (보이는 상태일 때만)
  //
  //  Supabase Realtime 을 쓰면 더 빠르지만 대시보드에서 테이블마다 복제를
  //  켜야 하고, 꺼져 있으면 조용히 아무것도 오지 않습니다. 이 방식은 서버
  //  설정 없이 지금 그대로 동작합니다.
  const savingRef = useRef(false)
  savingRef.current = saving

  /** 배경 갱신 — 화면을 깜빡이지 않도록 loading 을 건드리지 않습니다 */
  const refreshQuiet = useCallback(async () => {
    if (mode !== 'live') return
    //  저장이 진행 중이면 건너뜁니다. 저장 직후 runLive 가 어차피 다시
    //  읽어오고, 여기서 끼어들면 방금 넣은 값이 잠깐 사라졌다 돌아옵니다.
    if (savingRef.current) return
    try {
      setData(await repo.loadAppData())
    } catch {
      //  배경 갱신 실패는 조용히 넘깁니다. 다음 차례에 다시 시도합니다.
      //  여기서 오류 배너를 띄우면, 차를 타고 이동하며 신호가 끊길 때마다
      //  현장 화면에 빨간 띠가 떴다 사라집니다.
    }
  }, [mode])

  useEffect(() => {
    if (!live) return
    const wake = () => {
      if (document.visibilityState === 'visible') void refreshQuiet()
    }
    const id = window.setInterval(wake, 45_000)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
    }
  }, [live, refreshQuiet])

  /**
   * 서버 반영 후 최신 상태를 다시 읽어옵니다.
   * 실패하면 화면 상태를 바꾸지 않고 오류만 노출해, 사용자가 입력한 내용이
   * 사라지지 않도록 합니다(재시도 가능).
   */
  // 저장이 됐는지와 안 됐다면 왜인지를 함께 돌려줍니다.
  // 부르는 쪽이 "저장됐다"고 화면에 쓰기 전에 이 결과를 봐야 합니다.
  const runLive = useCallback(
    async (fn: () => Promise<void>): Promise<{ ok: boolean; error: string | null }> => {
      setSaving(true)
      setSyncError(null)
      try {
        await fn()
        setData(await repo.loadAppData())
        setLastSavedAt(new Date().toISOString())
        pending.current = null
        return { ok: true, error: null }
      } catch (e) {
        const message = friendlyError(e)
        setSyncError(message)
        pending.current = fn
        return { ok: false, error: message }
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
  //  서버가 발급한 id 를 돌려줍니다. 예전에는 여기서 만든 임시 id(c_…)를
  //  돌려줘서, 등록 직후 화면이 '거래처를 찾을 수 없어요' 로 갔습니다.
  //  저장은 됐는데 실패한 것처럼 보이니 한 번 더 등록해 같은 거래처가
  //  둘이 되는 자리였습니다.
  const addClient = useCallback(
    async (c: Omit<Client, 'id'>): Promise<Client | null> => {
      if (live) {
        let created: Client | null = null
        await runLive(async () => {
          const row = await repo.insertClient(c)
          created = row
          await repo.writeAudit({
            action: 'client.create',
            entity: 'clients',
            entityId: row.id,
            clientId: row.id,
            clientName: row.name,
            after: c,
            summary: `거래처 등록 — ${row.name}`,
          })
        })
        return created
      }
      const client: Client = { ...c, id: uid('c') }
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
    async (input: CollectionCompletionInput): Promise<CommandResult> => {
      if (live) {
        // 실사용: 서버 함수(complete_collection)가 일정·이력·자재·재고·요청·감사기록을
        // 한 트랜잭션에서 처리합니다. 먼저 로컬 검증으로 즉시 피드백을 주고,
        // 실제 반영은 서버가 다시 검증한 뒤 수행합니다(중복 완료·재고 초과는 서버가 최종 차단).
        const precheck = applyCollectionCompletion(data, { ...input, demoSessionId: null })
        if (!precheck.ok) return precheck

        // 서버 응답을 기다린 뒤에 성공을 돌려줍니다.
        //
        //  예전에는 여기서 바로 ok 를 돌려줬습니다. 지하 주차장처럼 통신이 끊기는
        //  곳에서 저장을 누르면 "수거 완료가 반영되었습니다" 화면이 뜨고 입력값이
        //  지워지는데, 실제로는 아무것도 저장되지 않았습니다. 기사는 저장된 줄
        //  알고 떠나고 그 수거는 사라집니다. 현장에서 가장 위험한 종류입니다.
        const saved = await runLive(async () => {
          await repo.completeCollection(input)
        })
        if (!saved.ok) {
          return {
            ok: false,
            errors: [saved.error ?? '저장하지 못했습니다. 통신 상태를 확인한 뒤 다시 시도해 주세요.'],
            warnings: precheck.warnings,
          }
        }
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
    async (eventId: string): Promise<CommandResult> => {
      if (live) {
        const e = data.events.find((x) => x.id === eventId)
        if (!e) return { ok: false, errors: ['취소할 입력을 찾을 수 없습니다.'], warnings: [] }
        if (e.reverted) return { ok: false, errors: ['이미 취소된 입력입니다.'], warnings: [] }
        // 수거 완료와 같은 이유로 서버 결과를 기다립니다 —
        // 되돌려지지 않았는데 "되돌렸습니다"라고 말하면 안 됩니다.
        const done = await runLive(async () => repo.revertCollection(eventId))
        if (!done.ok) {
          return { ok: false, errors: [done.error ?? '되돌리지 못했습니다. 잠시 후 다시 시도해 주세요.'], warnings: [] }
        }
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
    async (r: {
      clientId: string
      kind: RequestKind
      content: string
      desiredDate?: string | null
      urgent?: boolean
      source?: 'portal' | 'staff'
      requesterName?: string
    }): Promise<{ ok: boolean; error: string | null }> => {
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
        //  서버가 받았는지 확인한 뒤에 돌려줍니다. 예전에는 기다리지 않아서,
        //  통신이 끊긴 채로 요청을 보내도 병원 화면에는 '접수되었습니다' 가
        //  떴습니다. 병원은 접수된 줄 알고 기다리는데 아무것도 오지 않습니다.
        return await runLive(async () => repo.insertRequest(payload))
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
      return { ok: true, error: null }
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
        //  같은 사실(자재를 병원에 줬다)인데 어디서 넣느냐에 따라 결과가
        //  달랐습니다. 수거 입력의 동시공급은 사무실 재고를 줄이고 원장에도
        //  남는데, 자재 화면의 공급 등록은 둘 다 하지 않았습니다. 그러면
        //  재고 숫자가 조용히 실제와 어긋나고, 「자재 소진 위험」도 틀립니다.
        //  같은 사실은 같은 결과가 되도록 여기서도 줄이고 원장에 남깁니다.
        const delta = stockDeltaOf(itemsOf(m as MaterialSupply))
        const name = findClientName(data, m.clientId)
        void runLive(async () => {
          const created = await repo.insertMaterial(m)
          const moved = (Object.keys(delta) as (keyof typeof delta)[]).filter((k) => delta[k] > 0)
          if (moved.length) {
            const next: Partial<OfficeStock> = {}
            for (const k of moved) next[k] = (data.officeStock?.[k] ?? 0) - delta[k]
            await repo.adjustStock(next, '공급', `자재 화면에서 ${name} 공급 등록`, m.clientId, created.id)
          }
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
    [live, runLive, data],
  )

  //  사무실 재고는 수거 입력의 동시공급으로 줄기만 하고, 채우는 길이 화면에
  //  없었습니다. 그대로 두면 재고가 0 이 되는 순간 서버가 "재고보다 많이
  //  공급할 수 없습니다" 로 막아 현장이 실제로 준 자재를 기록조차 못 하게
  //  됩니다. 더원요양병원 한 달 사용량(63L 180개·12L 400개·비닐 800개)이면
  //  지금 재고로는 한 달을 못 넘깁니다. 원장에는 '입고' 로 남깁니다.
  const receiveStock = useCallback(
    (patch: Partial<OfficeStock>, memo: string) => {
      const next: Partial<OfficeStock> = {}
      for (const [k, v] of Object.entries(patch)) {
        const add = Number(v ?? 0)
        if (add > 0) next[k as keyof OfficeStock] = (data.officeStock?.[k as keyof OfficeStock] ?? 0) + add
      }
      if (Object.keys(next).length === 0) return
      if (live) {
        void runLive(async () => {
          await repo.adjustStock(next, '입고', memo || '자재 입고')
          await repo.writeAudit({
            action: 'stock.receive',
            entity: 'office_stock',
            summary: `자재 입고 — ${Object.entries(patch)
              .filter(([, v]) => Number(v ?? 0) > 0)
              .map(([k, v]) => `${STOCK_LABEL[k as keyof OfficeStock]} +${v}`)
              .join(' · ')}${memo ? ` (${memo})` : ''}`,
          })
        })
        return
      }
      setData((d) => ({ ...d, officeStock: { ...d.officeStock, ...next } }))
    },
    [live, runLive, data],
  )

  const removeMaterial = useCallback(
    (id: string) => {
      if (live) {
        //  감사기록은 서버가 남깁니다(0023). 화면에서 따로 남기면, 실제로는
        //  지워지지 않았는데 「지웠다」가 기록되는 일이 다시 생깁니다.
        void runLive(async () => {
          await repo.deleteMaterial(id)
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

  //  ── 청구 확정 ──────────────────────────────────────────────────────────
  //  사무실이 월 정산을 눈으로 확인한 뒤 누릅니다. 그 순간의 정산·명세서를
  //  통째로 담아 두므로, 나중에 단가를 바꾸거나 그 달 수거가 더 들어와도
  //  이 청구는 흔들리지 않습니다. 남은 수거·공급이 없으면 만들지 않습니다
  //  (같은 달을 두 번 청구하는 것을 이걸로 막습니다).
  const confirmBilling = useCallback(
    async (clientId: string, month: string): Promise<{ ok: boolean; error: string | null }> => {
      const built = buildBillingSnapshot(data, clientId, month, new Date().toISOString())
      if (!built) {
        return { ok: false, error: '이 달에는 새로 청구할 수거·공급이 없습니다.' }
      }
      const name = findClientName(data, clientId)
      const payload: Omit<Payment, 'id'> = {
        clientId,
        billingMonth: month,
        amount: built.amount,
        status: '미수금',
        method: '무통장',
        paidAt: null,
        memo: `${built.snapshot.kind} 청구`,
        snapshot: built.snapshot,
      }
      if (live) {
        return await runLive(async () => {
          const created = await repo.insertPayment(payload)
          await repo.writeAudit({
            action: 'payment.confirm',
            entity: 'payments',
            entityId: created.id,
            clientId,
            after: { amount: created.amount, month, kind: built.snapshot.kind },
            summary:
              `${name} ${month} ${built.snapshot.kind} 청구 확정 — ` +
              `${built.amount.toLocaleString('ko-KR')}원 ` +
              `(수거 ${built.snapshot.scheduleIds.length}건 · 공급 ${built.snapshot.materialIds.length}건)`,
          })
        })
      }
      setData((d) => ({ ...d, payments: [...d.payments, { ...payload, id: uid('p') }] }))
      return { ok: true, error: null }
    },
    [live, runLive, data],
  )

  //  잘못 만든 청구는 지우지 않습니다. 지워 버리면 "그런 청구는 없었다" 가
  //  되어, 병원과 금액을 두고 다툴 때 근거가 남지 않습니다.
  const cancelPayment = useCallback(
    (id: string, reason: string) => {
      const before = data.payments.find((p) => p.id === id)
      const name = before ? findClientName(data, before.clientId) : '거래처'
      const canceledAt = new Date().toISOString()
      if (live) {
        void runLive(async () => {
          await repo.updatePayment(id, { status: '취소', canceledAt })
          await repo.writeAudit({
            action: 'payment.cancel',
            entity: 'payments',
            entityId: id,
            clientId: before?.clientId,
            before,
            summary: before
              ? `${name} ${before.billingMonth} 청구 ${before.amount.toLocaleString('ko-KR')}원 취소` +
                `${reason ? ` — ${reason}` : ''}`
              : '청구 취소',
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        payments: d.payments.map((p) => (p.id === id ? { ...p, status: '취소', canceledAt } : p)),
      }))
    },
    [live, runLive, data],
  )

  const updatePayment = useCallback(
    (id: string, patch: Partial<Payment>) => {
      if (live) {
        //  돈에 관한 상태 변경인데 아무 기록도 남지 않았습니다. 나중에
        //  "누가 이걸 확인필요로 바꿨나" 를 물으면 답할 수가 없습니다.
        const before = data.payments.find((p) => p.id === id)
        const name = before ? findClientName(data, before.clientId) : '거래처'
        void runLive(async () => {
          await repo.updatePayment(id, patch)
          await repo.writeAudit({
            action: 'payment.update',
            entity: 'payments',
            entityId: id,
            clientId: before?.clientId,
            before,
            after: before ? { ...before, ...patch } : patch,
            summary: before
              ? `${name} ${before.billingMonth} 청구 ${before.amount.toLocaleString('ko-KR')}원 — ` +
                `${patch.status ? `${before.status} → ${patch.status}` : '내용 수정'}`
              : '청구 내용 수정',
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        payments: d.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }))
    },
    [live, runLive, data],
  )

  const markPaid = useCallback(
    (id: string) => {
      const paidAt = new Date().toISOString()
      if (live) {
        //  기록에 "입금 완료 처리" 여섯 글자만 남아 있어서, 감사로그만 보고는
        //  어느 병원의 몇 월치 얼마인지 알 수 없었습니다. 돈 기록입니다.
        const before = data.payments.find((p) => p.id === id)
        const name = before ? findClientName(data, before.clientId) : '거래처'
        void runLive(async () => {
          await repo.updatePayment(id, { status: '입금완료', paidAt })
          await repo.writeAudit({
            action: 'payment.paid',
            entity: 'payments',
            entityId: id,
            clientId: before?.clientId,
            before,
            after: before ? { ...before, status: '입금완료', paidAt } : null,
            summary: before
              ? `${name} ${before.billingMonth} 청구 ${before.amount.toLocaleString('ko-KR')}원 입금 완료 처리`
              : '입금 완료 처리',
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        payments: d.payments.map((p) => (p.id === id ? { ...p, status: '입금완료', paidAt } : p)),
      }))
    },
    [live, runLive, data],
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

  //  그만둔 거래처도 찾습니다. 활성 목록에만 있으면, 비활성으로 돌린
  //  거래처의 미수금이 '알 수 없음' 으로 남아 몇 달 뒤 주인을 못 찾습니다.
  const clientById = useCallback(
    (id: string) =>
      data.clients.find((c) => c.id === id) ?? data.retiredClients?.find((c) => c.id === id),
    [data.clients, data.retiredClients],
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
      receiveStock,
      addPayment,
      confirmBilling,
      cancelPayment,
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
      receiveStock,
      addPayment,
      confirmBilling,
      cancelPayment,
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
