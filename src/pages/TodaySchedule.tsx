import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, AlertTriangle, ClipboardEdit, Zap, AlertCircle, Inbox, CalendarX2, Pin} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { canAccess } from '../lib/access'
import { NoteChips } from '../components/SiteNotes'
import { PageHeader } from '../components/PageHeader'
import { StartHere } from '../components/StartHere'
import { NextVisitCard } from '../components/NextVisit'
import { TourBanner } from '../components/TourEntry'
import { StatusBadge, WasteBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Stagger, StaggerItem } from '../components/motion'
import { EmptyState } from '../components/ui'
import { schedulesOn } from '../lib/selectors'
import { openRequests } from '../lib/ops'
import { EMPTY_SUPPLIED } from '../lib/collection'
import { prettyDate, today, weight } from '../lib/format'
import type { ContainerBreakdown, Schedule, WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 일정 — 날짜별 수거 일정 + 완료 처리
//  · 수거정보 입력: 프리필된 수거 입력 화면으로 이동 (용기·자재까지 상세 입력)
//  · 빠른 완료: 기본값으로 통합 커맨드 실행 (일정·이력·자재·통계 자동 연결)
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 빠른 완료 시 용기별 배출 수량 기본값 (결정적)
function defaultContainers(wasteType: WasteType, amount: number): ContainerBreakdown {
  if (wasteType === '일회용기저귀') return { corrugated: 0, plastic: 0, bag: Math.max(2, Math.round(amount / 30)), etc: 0 }
  return { corrugated: Math.max(1, Math.round(amount / 45)), plastic: 1, bag: 0, etc: 0 }
}

export function TodaySchedule() {
  const { data, clientById, completeSchedule, completeCollection, notesFor } = useData()
  const { configured, role } = useAuth()
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다.
  const canGoHistory = !configured || canAccess(role, '/history')
  const canGoMaterials = !configured || canAccess(role, '/materials')
  const navigate = useNavigate()
  const [date, setDate] = useState(today())

  // 완료된 건 수정 (기존 동작 유지)
  const [editTarget, setEditTarget] = useState<Schedule | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMemo, setEditMemo] = useState('')

  // 빠른 완료
  const [quick, setQuick] = useState<Schedule | null>(null)
  // 성과측정: 빠른 완료 모달을 연 시각 (저장 시 경과시간 기록)
  const quickStartRef = useRef<number | null>(null)
  const [quickAmount, setQuickAmount] = useState('')
  const [quickMemo, setQuickMemo] = useState('')
  const [quickError, setQuickError] = useState('')
  // null = 입력 단계, 값 = 완료 성공 단계(같은 모달 안에서 전환)
  const [quickResult, setQuickResult] = useState<{ clientId: string; name: string; amount: number } | null>(null)
  //  빠른 완료도 경고를 받아 둡니다. 예전에는 result.warnings 를 아예 읽지
  //  않아서, 자릿수를 잘못 쳐도 이 화면에서는 아무 표시가 없었습니다.
  const [quickWarnings, setQuickWarnings] = useState<string[]>([])
  const [flash, setFlash] = useState(false)

  const list = useMemo(() => schedulesOn(data, date), [data, date])

  function openEdit(s: Schedule) {
    setEditTarget(s)
    setEditAmount(s.actualAmount != null ? String(s.actualAmount) : String(s.expectedAmount))
    setEditMemo(s.memo)
  }
  function submitEdit() {
    if (!editTarget) return
    completeSchedule(editTarget.id, Number(editAmount) || 0, editMemo)
    setEditTarget(null)
  }

  function openQuick(s: Schedule) {
    quickStartRef.current = Date.now()
    setQuick(s)
    setQuickAmount(String(s.expectedAmount))
    setQuickMemo(s.memo)
    setQuickError('')
    setQuickResult(null)
    setQuickWarnings([])
  }
  function closeQuick() {
    quickStartRef.current = null
    setQuick(null)
    setQuickResult(null)
    setQuickWarnings([])
  }
  async function submitQuick() {
    if (!quick) return
    const amt = Number(quickAmount) || quick.expectedAmount
    const vehicle = data.vehicles.find((v) => v.id === quick.vehicleId)
    const result = await completeCollection({
      scheduleId: quick.id,
      clientId: quick.clientId,
      wasteType: quick.wasteType,
      vehicleId: quick.vehicleId,
      driverName: vehicle?.driver ?? '',
      actualAmount: amt,
      actualTime: quick.scheduledTime,
      containers: defaultContainers(quick.wasteType, amt),
      handoverStatus: '수거 완료',
      supplied: { ...EMPTY_SUPPLIED },
      isAdditional: false,
      memo: quickMemo,
      role: '현장 담당자',
      screen: '오늘 일정 · 빠른 완료',
      // 성과측정: 빠른 완료 모달 진입 → 저장까지의 실제 경과시간
      inputDurationMs: quickStartRef.current ? Date.now() - quickStartRef.current : null,
    })
    setQuickWarnings(result.warnings)
    if (!result.ok) {
      setQuickError(result.errors.join(' '))
      return
    }
    const name = clientById(quick.clientId)?.name ?? '거래처'
    // 같은 모달을 성공 단계로 전환 (모달 중첩으로 인한 히스토리 경합 방지)
    setQuickResult({ clientId: quick.clientId, name, amount: amt })
    setFlash(true)
    setTimeout(() => setFlash(false), 1600)
  }

  const doneCount = list.filter((s) => s.status === '완료').length
  const pendingRequests = openRequests(data)

  return (
    <div>
      <div className={flash ? 'rounded-2xl bg-teal-50/70 transition-colors duration-700' : 'transition-colors duration-700'}>
        <StartHere data={data} />
        <TourBanner />
        {/* 진행 건수는 아래 「다음 방문」 카드가 크게 보여 주므로 폰에서는 반복하지 않습니다 */}
        <PageHeader
          title="오늘 일정"
          subtitle={<span className="hidden lg:inline">{`완료 ${doneCount} / 전체 ${list.length}건`}</span>}
        />
      </div>

      {/* 모바일 — 폰을 열면 가장 먼저 "다음에 어디로 가는가" */}
      <NextVisitCard data={data} list={list} notesFor={notesFor} />

      {/* 병원에서 올라온 요청 — 오늘 방문 전에 확인해야 하는 것 */}
      {pendingRequests.length > 0 && (
        <button
          onClick={() => navigate('/requests')}
          className="card mb-4 hidden w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 text-left transition hover:bg-navy-50 lg:flex"
        >
          <Inbox size={19} className="shrink-0 text-teal-600" strokeWidth={2.4} />
          <span className="t-body min-w-0 break-keep font-extrabold text-navy-900">
            병원 요청 {pendingRequests.length}건 처리 대기
          </span>
          {pendingRequests.some((r) => r.urgent) && <span className="pill bg-rose-50 text-rose-600">긴급 포함</span>}
          <span className="t-muted min-w-0 flex-1 break-keep">
            {pendingRequests[0].clientName} · {pendingRequests[0].type}
          </span>
          <ChevronRight size={18} className="shrink-0 text-navy-300" />
        </button>
      )}

      {/* 날짜 네비게이션 */}
      <div className="card mb-4 flex items-center justify-between p-2">
        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-50 text-navy-500 transition active:scale-95"
          onClick={() => setDate((d) => shiftDate(d, -1))}
          aria-label="이전 날짜"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-[1.07rem] font-extrabold text-navy-900">{prettyDate(date)}</p>
          <button className="text-[0.98rem] font-bold text-teal-600" onClick={() => setDate(today())}>
            오늘로 이동
          </button>
        </div>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-50 text-navy-500 transition active:scale-95"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          aria-label="다음 날짜"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={CalendarX2} title="등록된 일정이 없어요" subtitle="다른 날짜를 확인하거나 수거 입력에서 등록하세요." />
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          {list.map((s, si) => {
            const client = clientById(s.clientId)
            const vehicle = data.vehicles.find((v) => v.id === s.vehicleId)
            const done = s.status === '완료'
            const urgent = s.status === '긴급'
            return (
              <StaggerItem key={s.id} className="card overflow-hidden">
                {/* 폰 — 한 줄 요약. 상세와 조작은 위 「다음 방문」 카드와 상세 화면에서 합니다 */}
                <button
                  onClick={() => (done ? openEdit(s) : navigate(`/collection?schedule=${s.id}`))}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-navy-50 lg:hidden"
                >
                  <span
                    className={`w-[3.6rem] shrink-0 tabular-nums text-[1.15rem] font-extrabold ${
                      done ? 'text-navy-300' : 'text-navy-900'
                    }`}
                  >
                    {s.scheduledTime}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block break-keep text-[1.15rem] font-extrabold leading-snug ${
                        done ? 'text-navy-400' : 'text-navy-900'
                      }`}
                    >
                      {client?.name ?? '알 수 없는 거래처'}
                    </span>
                    <span className="t-muted mt-0.5 block break-keep">
                      {s.wasteType} · {weight(s.actualAmount ?? s.expectedAmount)}
                      {s.memo ? ' · 특이사항 있음' : ''}
                    </span>
                  </span>
                  {done ? (
                    <span className="pill shrink-0 bg-emerald-50 text-emerald-700">완료</span>
                  ) : urgent ? (
                    <span className="pill shrink-0 bg-rose-50 text-rose-600">긴급</span>
                  ) : (
                    <ChevronRight size={18} className="shrink-0 text-navy-300" />
                  )}
                </button>

                <div className="hidden lg:block">
                {urgent && (
                  <div className="flex items-center gap-1.5 bg-rose-50 px-4 py-2 text-[0.98rem] font-bold text-rose-500">
                    <AlertTriangle size={13} strokeWidth={2.6} /> 우선 방문 요청
                  </div>
                )}
                <div className="p-4">
                  <div
                    data-tour={si === 0 ? 'today-list' : undefined}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular-nums text-lg font-extrabold text-navy-900">{s.scheduledTime}</span>
                        <WasteBadge type={s.wasteType} />
                        {!done && <StatusBadge status={s.status} />}
                        {done && s.handoverStatus && (
                          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[0.9rem] font-bold text-navy-500">
                            {s.handoverStatus}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => client && navigate(`/clients/${client.id}`)}
                        className="mt-1.5 flex min-w-0 max-w-full items-center gap-1 text-left"
                      >
                        <span className="min-w-0 text-xl font-extrabold text-navy-900 [overflow-wrap:anywhere] [word-break:keep-all]">
                          {client?.name ?? '알 수 없는 거래처'}
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-navy-300" />
                      </button>
                      <p className="mt-0.5 break-keep t-caption">
                        {client?.address} · {vehicle?.name ?? '미배정'}
                      </p>
                      {s.memo && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-[1.08rem] font-medium text-amber-600">
                            <Pin size={14} strokeWidth={2.4} className="mt-1 shrink-0" />
                            <span className="break-keep">{s.memo}</span>
                          </p>
                        )}
                      {/* 현장 메모 — 거래처 상세에 기록해둔 특이사항을 방문 전에 함께 확인 */}
                      {client && (
                        <span data-tour={si === 0 ? 'today-notes' : undefined} className="block">
                          <NoteChips notes={notesFor(client.id)} max={2} />
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {s.actualAmount != null ? (
                        <>
                          <p className="t-caption">실수거</p>
                          <p className="text-lg font-extrabold text-teal-600">{weight(s.actualAmount)}</p>
                        </>
                      ) : (
                        <>
                          <p className="t-caption">예상</p>
                          <p className="text-base font-bold text-navy-500">{weight(s.expectedAmount)}</p>
                        </>
                      )}
                      {done && (
                        <button
                          className="mt-1.5 rounded-full bg-navy-50 px-3 py-1 text-[0.98rem] font-bold text-navy-500 transition active:scale-95"
                          onClick={() => openEdit(s)}
                        >
                          수정
                        </button>
                      )}
                    </div>
                  </div>

                  {!done && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-navy-50 px-3 py-2.5 text-[1.08rem] font-bold text-navy-700 transition active:scale-95"
                        onClick={() => navigate(`/collection?schedule=${s.id}`)}
                      >
                        <ClipboardEdit size={15} strokeWidth={2.4} /> 수거정보 입력
                      </button>
                      <button
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-500 px-3 py-2.5 text-[1.08rem] font-bold text-white shadow-sm transition active:scale-95"
                        onClick={() => openQuick(s)}
                      >
                        <Zap size={15} strokeWidth={2.6} /> 빠른 완료
                      </button>
                    </div>
                  )}
                </div>
                </div>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      {/* 병원 요청은 사무실 업무라, 좁은 화면에서는 일정 아래로 내립니다 */}
      {pendingRequests.length > 0 && (
        <button
          onClick={() => navigate('/requests')}
          className="card mt-4 flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 text-left transition hover:bg-navy-50 lg:hidden"
        >
          <Inbox size={19} className="shrink-0 text-teal-600" strokeWidth={2.4} />
          <span className="t-body min-w-0 break-keep font-extrabold text-navy-900">
            병원 요청 {pendingRequests.length}건 처리 대기
          </span>
          {pendingRequests.some((r) => r.urgent) && <span className="pill bg-rose-50 text-rose-600">긴급 포함</span>}
          <span className="t-muted min-w-0 flex-1 break-keep">
            {pendingRequests[0].clientName} · {pendingRequests[0].type}
          </span>
          <ChevronRight size={18} className="shrink-0 text-navy-300" />
        </button>
      )}


      {/* 빠른 완료 모달 — 입력 → 성공을 한 모달 안에서 전환 (통합 커맨드 사용) */}
      <Modal
        open={quick !== null}
        title={quickResult ? '수거 완료 반영됨' : '빠른 완료'}
        onClose={closeQuick}
        footer={
          quickResult ? (
            <button className="btn-ghost w-full" onClick={closeQuick}>
              시연 계속하기
            </button>
          ) : (
            <>
              <button className="btn-ghost flex-1" onClick={closeQuick}>
                취소
              </button>
              <button className="btn-primary flex-1" onClick={submitQuick}>
                <Check size={16} strokeWidth={2.6} /> 완료 처리
              </button>
            </>
          )
        }
      >
        {quick && !quickResult && (
          <>
            <div className="rounded-xl bg-navy-50 p-3 text-[1.08rem]">
              <p className="font-semibold text-navy-900">{clientById(quick.clientId)?.name}</p>
              <p className="text-navy-400">
                {quick.scheduledTime} · {quick.wasteType} ·{' '}
                {data.vehicles.find((v) => v.id === quick.vehicleId)?.driver ?? '기사 미지정'}
              </p>
            </div>
            <div>
              <label className="field-label">실제 수거량 (kg)</label>
              <input
                type="number"
                inputMode="numeric"
                className="field-input"
                value={quickAmount}
                onChange={(e) => {
                  setQuickAmount(e.target.value)
                  setQuickError('')
                }}
                placeholder="예: 320"
              />
            </div>
            <div>
              <label className="field-label">메모</label>
              <textarea
                className="field-input"
                rows={2}
                value={quickMemo}
                onChange={(e) => setQuickMemo(e.target.value)}
                placeholder="현장 특이사항 (선택)"
              />
            </div>
            <div className="rounded-xl bg-navy-50 p-3">
              <p className="text-[0.95rem] font-bold text-navy-400">완료 시 자동 반영</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {['오늘 일정 완료', '수거이력', '거래처 최근 활동', '대시보드 KPI', '통계', '수거대장 초안', '월간 명세 초안'].map(
                  (t) => (
                    <span key={t} className="rounded-full bg-white px-2 py-0.5 text-[0.9rem] font-semibold text-navy-500">
                      {t}
                    </span>
                  ),
                )}
              </div>
            </div>
            <p className="text-[0.95rem] text-navy-400">
              용기·자재까지 상세 입력하려면 <b>수거정보 입력</b>을 사용하세요. 빠른 완료도 동일하게 일정·이력·통계에
              연결됩니다.
            </p>
            {quickError && (
              <p className="flex items-start gap-1.5 text-[1.08rem] font-semibold text-rose-500">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {quickError}
              </p>
            )}
          </>
        )}
        {quickResult && (
          <>
            <div className="rounded-xl bg-emerald-50 p-3.5 text-center">
              <Check size={22} className="mx-auto text-emerald-500" strokeWidth={2.6} />
              <p className="mt-1.5 text-[1.08rem] font-bold text-navy-900">
                {quickResult.name} · {weight(quickResult.amount)}
              </p>
              <p className="text-[0.98rem] text-navy-500">수거정보가 여러 운영 화면에 자동 반영되었습니다.</p>
            </div>
            {quickWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                {quickWarnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-[1.02rem] font-semibold text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2">
              <button
                className="flex items-center justify-between rounded-xl bg-navy-50 px-3.5 py-3 text-[1.08rem] font-bold text-navy-700 transition active:scale-[0.98]"
                onClick={() => navigate(`/clients/${quickResult.clientId}`)}
              >
                거래처 상세에서 확인 <ChevronRight size={16} className="text-navy-300" />
              </button>
              {/*  현장 담당자에게는 두 화면이 막혀 있습니다(access.ts).
                   눌러도 차단 안내만 뜨는 버튼은 두지 않습니다. */}
              {canGoMaterials && (
                <button
                  className="flex items-center justify-between rounded-xl bg-navy-50 px-3.5 py-3 text-[1.08rem] font-bold text-navy-700 transition active:scale-[0.98]"
                  onClick={() => navigate('/materials')}
                >
                  자재관리에서 확인 <ChevronRight size={16} className="text-navy-300" />
                </button>
              )}
              {canGoHistory && (
                <button
                  className="flex items-center justify-between rounded-xl bg-navy-50 px-3.5 py-3 text-[1.08rem] font-bold text-navy-700 transition active:scale-[0.98]"
                  onClick={() => navigate('/history')}
                >
                  전체 수거이력에서 확인 <ChevronRight size={16} className="text-navy-300" />
                </button>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* 완료 건 수정 모달 */}
      <Modal
        open={editTarget !== null}
        title="수거 내역 수정"
        onClose={() => setEditTarget(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setEditTarget(null)}>
              취소
            </button>
            <button className="btn-primary flex-1" onClick={submitEdit}>
              저장
            </button>
          </>
        }
      >
        {editTarget && (
          <>
            <div className="rounded-xl bg-navy-50 p-3 text-[1.08rem]">
              <p className="font-semibold text-navy-900">{clientById(editTarget.clientId)?.name}</p>
              <p className="text-navy-400">
                {editTarget.scheduledTime} · {editTarget.wasteType}
              </p>
            </div>
            <div>
              <label className="field-label">실제 수거량 (kg)</label>
              <input
                type="number"
                inputMode="numeric"
                className="field-input"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="예: 320"
              />
            </div>
            <div>
              <label className="field-label">메모</label>
              <textarea
                className="field-input"
                rows={2}
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                placeholder="현장 특이사항을 입력하세요"
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
