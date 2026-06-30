import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge, WasteBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Stagger, StaggerItem } from '../components/motion'
import { EmptyState } from '../components/ui'
import { schedulesOn } from '../lib/selectors'
import { prettyDate, today, weight } from '../lib/format'
import type { Schedule } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 일정 — 날짜별 수거 일정 리스트 + 완료 처리 + 수거량 입력
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function TodaySchedule() {
  const { data, clientById, completeSchedule, updateSchedule } = useData()
  const [date, setDate] = useState(today())
  const [target, setTarget] = useState<Schedule | null>(null)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')

  const list = useMemo(() => schedulesOn(data, date), [data, date])

  function openComplete(s: Schedule) {
    setTarget(s)
    setAmount(s.actualAmount != null ? String(s.actualAmount) : String(s.expectedAmount))
    setMemo(s.memo)
  }

  function submitComplete() {
    if (!target) return
    completeSchedule(target.id, Number(amount) || 0, memo)
    setTarget(null)
  }

  const doneCount = list.filter((s) => s.status === '완료').length

  return (
    <div>
      <PageHeader title="오늘 일정" subtitle={`완료 ${doneCount} / 전체 ${list.length}건`} />

      {/* 날짜 네비게이션 */}
      <div className="card mb-4 flex items-center justify-between p-2">
        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-50 text-navy-500 transition active:scale-95"
          onClick={() => setDate((d) => shiftDate(d, -1))}
          aria-label="이전 날짜"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="text-[15px] font-extrabold text-navy-900">{prettyDate(date)}</p>
          <button className="text-xs font-bold text-teal-600" onClick={() => setDate(today())}>
            오늘로 이동
          </button>
        </div>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-50 text-navy-500 transition active:scale-95"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          aria-label="다음 날짜"
        >
          ›
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="🗓️" title="등록된 일정이 없어요" subtitle="다른 날짜를 확인하거나 수거 입력에서 등록하세요." />
      ) : (
        <Stagger className="space-y-3">
          {list.map((s) => {
            const client = clientById(s.clientId)
            const vehicle = data.vehicles.find((v) => v.id === s.vehicleId)
            const done = s.status === '완료'
            const urgent = s.status === '긴급'
            return (
              <StaggerItem key={s.id} className={`card overflow-hidden ${done ? 'opacity-[0.92]' : ''}`}>
                {/* 긴급: 상단 우선 방문 안내 */}
                {urgent && (
                  <div className="bg-rose-50 px-4 py-2 text-xs font-bold text-rose-500">⚠ 우선 방문 요청</div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular-nums text-lg font-extrabold text-navy-900">{s.scheduledTime}</span>
                        <WasteBadge type={s.wasteType} />
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="mt-1.5 truncate text-xl font-extrabold text-navy-900">
                        {client?.name ?? '알 수 없는 거래처'}
                      </p>
                      <p className="mt-0.5 truncate t-caption">
                        {client?.address} · {vehicle?.name ?? '미배정'}
                      </p>
                      {s.memo && <p className="mt-1.5 text-sm font-medium text-amber-600">📌 {s.memo}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="t-caption">예상 {weight(s.expectedAmount)}</p>
                      {s.actualAmount != null && (
                        <p className="mt-0.5 text-base font-extrabold text-teal-600">실수거 {weight(s.actualAmount)}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    {done ? (
                      <button className="btn-ghost flex-1 py-3.5" onClick={() => openComplete(s)}>
                        ✎ 수거량 수정
                      </button>
                    ) : (
                      <>
                        <button className="btn-primary flex-1 py-4 text-base" onClick={() => openComplete(s)}>
                          ✓ 수거 완료 처리
                        </button>
                        {!urgent && (
                          <button className="btn-ghost px-4" onClick={() => updateSchedule(s.id, { status: '긴급' })}>
                            긴급
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      {/* 완료/수거량 입력 모달 */}
      <Modal
        open={target !== null}
        title="수거 완료 처리"
        onClose={() => setTarget(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setTarget(null)}>
              취소
            </button>
            <button className="btn-primary flex-1" onClick={submitComplete}>
              저장
            </button>
          </>
        }
      >
        {target && (
          <>
            <div className="rounded-xl bg-navy-50 p-3 text-sm">
              <p className="font-semibold text-navy-900">{clientById(target.clientId)?.name}</p>
              <p className="text-navy-400">
                {target.scheduledTime} · {target.wasteType}
              </p>
            </div>
            <div>
              <label className="field-label">실제 수거량 (kg)</label>
              <input
                type="number"
                inputMode="numeric"
                className="field-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예: 320"
              />
            </div>
            <div>
              <label className="field-label">메모</label>
              <textarea
                className="field-input"
                rows={2}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="현장 특이사항을 입력하세요"
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
