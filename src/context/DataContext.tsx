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
import { loadData, resetData, saveData, uid } from '../lib/storage'

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
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())

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
    setData(resetData())
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
      addMaterial,
      removeMaterial,
      addPayment,
      updatePayment,
      markPaid,
      clientById,
      reset,
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
      addMaterial,
      removeMaterial,
      addPayment,
      updatePayment,
      markPaid,
      clientById,
      reset,
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
