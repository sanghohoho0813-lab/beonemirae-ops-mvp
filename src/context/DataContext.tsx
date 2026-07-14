import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  Client,
  MaterialSupply,
  Payment,
  Schedule,
} from '../types'
import { loadData, resetData, saveData, uid, loadClientSet, saveClientSet, type ClientSetSize } from '../lib/storage'
import {
  applyCollectionCompletion,
  rollbackCollectionCompletion,
  type CollectionCompletionInput,
  type CommandResult,
} from '../lib/collection'

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
  // 수거일정
  addSchedule: (s: Omit<Schedule, 'id'>) => Schedule
  updateSchedule: (id: string, patch: Partial<Schedule>) => void
  removeSchedule: (id: string) => void
  completeSchedule: (id: string, actualAmount: number, memo?: string) => void
  // 수거 완료 통합 커맨드 (3단계) — 입력 한 번으로 일정/이력/자재/재고/요청/감사기록 연결
  completeCollection: (input: CollectionCompletionInput) => CommandResult
  revertCollection: (eventId: string) => CommandResult
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
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [clientSet, setClientSetState] = useState<ClientSetSize>(() => loadClientSet())

  // 변경 시 영속화
  useEffect(() => {
    saveData(data)
  }, [data])

  // ── 거래처 ──────────────────────────────────────────────────────────────
  const addClient = useCallback((c: Omit<Client, 'id'>) => {
    const client: Client = { ...c, id: uid('c') }
    setData((d) => ({ ...d, clients: [...d.clients, client] }))
    return client
  }, [])

  const updateClient = useCallback((id: string, patch: Partial<Client>) => {
    setData((d) => ({
      ...d,
      clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }, [])

  const removeClient = useCallback((id: string) => {
    setData((d) => ({ ...d, clients: d.clients.filter((c) => c.id !== id) }))
  }, [])

  // ── 수거일정 ────────────────────────────────────────────────────────────
  const addSchedule = useCallback((s: Omit<Schedule, 'id'>) => {
    const schedule: Schedule = { ...s, id: uid('s') }
    setData((d) => ({ ...d, schedules: [...d.schedules, schedule] }))
    return schedule
  }, [])

  const updateSchedule = useCallback((id: string, patch: Partial<Schedule>) => {
    setData((d) => ({
      ...d,
      schedules: d.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }, [])

  const removeSchedule = useCallback((id: string) => {
    setData((d) => ({ ...d, schedules: d.schedules.filter((s) => s.id !== id) }))
  }, [])

  const completeSchedule = useCallback((id: string, actualAmount: number, memo?: string) => {
    setData((d) => ({
      ...d,
      schedules: d.schedules.map((s) =>
        s.id === id
          ? {
              ...s,
              status: '완료',
              actualAmount,
              completedAt: new Date().toISOString(),
              memo: memo !== undefined ? memo : s.memo,
            }
          : s,
      ),
    }))
  }, [])

  // ── 수거 완료 통합 커맨드 (3단계) ───────────────────────────────────────
  // 검증→적용→저장을 한 번에 수행. 현재 커밋된 data 기준으로 계산(원자적)합니다.
  const completeCollection = useCallback(
    (input: CollectionCompletionInput): CommandResult => {
      const result = applyCollectionCompletion(data, input)
      if (result.ok && result.data) setData(result.data)
      return result
    },
    [data],
  )

  const revertCollection = useCallback(
    (eventId: string): CommandResult => {
      const result = rollbackCollectionCompletion(data, eventId)
      if (result.ok && result.data) setData(result.data)
      return result
    },
    [data],
  )

  // ── 자재공급 ────────────────────────────────────────────────────────────
  const addMaterial = useCallback((m: Omit<MaterialSupply, 'id'>) => {
    const material: MaterialSupply = { ...m, id: uid('m') }
    setData((d) => ({ ...d, materials: [...d.materials, material] }))
    return material
  }, [])

  const removeMaterial = useCallback((id: string) => {
    setData((d) => ({ ...d, materials: d.materials.filter((m) => m.id !== id) }))
  }, [])

  // ── 결제 ────────────────────────────────────────────────────────────────
  const addPayment = useCallback((p: Omit<Payment, 'id'>) => {
    const payment: Payment = { ...p, id: uid('p') }
    setData((d) => ({ ...d, payments: [...d.payments, payment] }))
    return payment
  }, [])

  const updatePayment = useCallback((id: string, patch: Partial<Payment>) => {
    setData((d) => ({
      ...d,
      payments: d.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }, [])

  const markPaid = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      payments: d.payments.map((p) =>
        p.id === id ? { ...p, status: '입금완료', paidAt: new Date().toISOString() } : p,
      ),
    }))
  }, [])

  const reset = useCallback(() => {
    setData(resetData(loadClientSet()))
  }, [])

  const replaceAll = useCallback((next: AppData) => {
    setData(next)
  }, [])

  // 거래처 세트 전환 — 해당 세트 기준으로 데이터 재생성
  const setClientSet = useCallback((demoCount: ClientSetSize) => {
    saveClientSet(demoCount)
    setClientSetState(demoCount)
    setData(resetData(demoCount))
  }, [])

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
      addSchedule,
      updateSchedule,
      removeSchedule,
      completeSchedule,
      completeCollection,
      revertCollection,
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
    }),
    [
      data,
      addClient,
      updateClient,
      removeClient,
      addSchedule,
      updateSchedule,
      removeSchedule,
      completeSchedule,
      completeCollection,
      revertCollection,
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
