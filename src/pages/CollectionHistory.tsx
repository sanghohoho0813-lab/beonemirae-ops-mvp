import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { FilterChip } from '../components/ui'
import { CollectionRecord } from '../components/CollectionRecord'
import { facilityByWaste } from '../data/ops'
import { num, weight, today, shiftDays } from '../lib/format'
import type { WasteType } from '../types'
import { isCanceled } from '../lib/scheduleLive'
import { koMatch } from '../lib/koSearch'

// ─────────────────────────────────────────────────────────────────────────────
// 전체 수거이력 (/history) — 거래처 상세·통계에서 진입하는 파생 조회 화면
//  기존 schedules 에서 파생하여 표시 (localStorage 스키마 변경 없음)
// ─────────────────────────────────────────────────────────────────────────────

type WasteFilter = '전체' | WasteType
type KindFilter = '전체' | '정기' | '추가' | '긴급'
type PeriodFilter = '전체' | '최근 7일' | '이번 달' | '지난 달'
//  0131 — 이 화면은 **실제 수거 기록**입니다. 예전에는 일정 표 전체를 그대로 보여 줘서
//  다음 주 예정·무른 방문까지 「수거 기록」 맨 위에 섞였고, 위 「전체 수거건수」도
//  그만큼 부풀었습니다(월말에 이 숫자를 보고 맞춥니다).
//   완료    — 실제로 다녀와 입력된 것 (기본)
//   미입력  — **어제까지** 일정인데 아직 입력이 없는 것 → 여기서 바로 입력하러 갑니다
type StatusFilter = '완료' | '미입력'

//  기간 경계도 한국 시각 기준입니다 (lib/format).
const shift = shiftDays

export function CollectionHistory() {
  const { data, clientById } = useData()
  const { role, mode } = useAuth()
  const navigate = useNavigate()
  //  ⚠ 잘못 올라간 기록을 지우는 것은 **돈이 바뀌는 일**입니다 —
  //    그 달 정산·청구·매출이 같이 바뀝니다. 사무실·관리자만 합니다.
  const canRevert = mode !== 'live' || role === 'admin' || role === 'office'
  const [error, setError] = useState('')
  //  ⚠ 0088 — window.confirm 을 씁니다가 **사유를 받을 자리가 없었습니다.**
  //    되돌리기는 자재·재고·요청·그 달 청구가 함께 되돌아가는 일이라
  //    이유가 안 남으면 나중에 아무도 설명하지 못합니다. 수거 입력 화면과
  //    **같은 부품**을 씁니다 — 두 벌이면 한쪽만 고쳐집니다.
  const [openId, setOpenId] = useState<string | null>(null)
  const [waste, setWaste] = useState<WasteFilter>('전체')
  const [kind, setKind] = useState<KindFilter>('전체')
  //  한 번에 그리는 줄 수 (0082). 5,634줄을 한 장에 그리면 폰이 버벅이고,
  //  60줄에서 말없이 자르면 위 KPI 숫자와 어긋나 보입니다.
  const PAGE = 60
  const [shown, setShown] = useState(PAGE)
  const [period, setPeriod] = useState<PeriodFilter>('전체')
  //  거래처 상세의 「전체 수거이력 보기」·대시보드에서 조건을 달고 들어옵니다 (0131)
  //   ?client=<id> → 그 거래처 이름으로 검색 · ?status=missing → 미입력
  const [params] = useSearchParams()
  const [status, setStatus] = useState<StatusFilter>(params.get('status') === 'missing' ? '미입력' : '완료')
  const [query, setQuery] = useState(() => {
    const id = params.get('client')
    return id ? (clientById(id)?.name ?? '') : ''
  })
  //  새로고침으로 바로 들어오면 첫 그림 때 거래처 목록이 아직 없습니다 — 읽히면 한 번 채웁니다.
  const linkedName = params.get('client') ? clientById(params.get('client')!)?.name : undefined
  useEffect(() => { if (linkedName) setQuery((q) => q || linkedName) }, [linkedName])
  //  ⚠ 조건을 바꾸면 처음부터 봅니다. 안 그러면 「이번 달」로 좁혔는데
  //    120줄이 그려져 있고 「더 보기」가 남은 것처럼 보입니다.
  useEffect(() => { setShown(PAGE) }, [waste, kind, period, query, status])

  const rows = useMemo(() => {
    const t = today()
    const weekAgo = shift(-7)
    const month = t.slice(0, 7)
    const lastMonth = (() => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
    return data.schedules
      //  무른 방문 · 앞으로의 예정은 기록이 아닙니다
      .filter((s) => !isCanceled(s) && s.date <= t)
      .filter((s) => (status === '완료' ? s.status === '완료' : s.status !== '완료' && s.date < t))
      .map((s) => {
        //  그만둔 거래처의 과거 수거도 이름이 남아야 합니다.
        //  활성 목록만 뒤지면 '거래처' 라는 이름으로 뭉개집니다.
        const client = clientById(s.clientId)
        const v = data.vehicles.find((x) => x.id === s.vehicleId)
        const facility = facilityByWaste(s.wasteType)
        const done = s.status === '완료'
        const handoverStatus = s.handoverStatus ?? (done ? '인계 완료' : null)
        const k: KindFilter = s.status === '긴급' ? '긴급' : s.memo.includes('추가') ? '추가' : '정기'
        return {
          id: s.id,
          //  되돌리기는 **수거 기록(event)** 단위입니다. 일정에 event 가
          //  안 붙어 있으면(엑셀로 들어온 옛 기록) 되돌릴 수 없습니다.
          eventId: s.eventId ?? null,
          date: s.date,
          time: s.actualTime ?? s.scheduledTime,
          clientName: client?.name ?? '거래처',
          clientType: client?.type ?? '',
          wasteType: s.wasteType,
          amount: s.actualAmount,
          driver: s.driverName ?? v?.driver ?? '-',
          vehicleName: v?.name ?? '-',
          facility: facility?.name ?? '처리장',
          completed: done,
          handoverStatus,
          handedOver: handoverStatus === '인계 완료',
          fromField: s.origin === 'field',
          kind: k,
          note: s.memo || (done ? '정상수거' : ''),
        }
      })
      .filter((r) => (waste === '전체' ? true : r.wasteType === waste))
      .filter((r) => (kind === '전체' ? true : r.kind === kind))
      .filter((r) => (period === '전체' ? true : period === '이번 달' ? r.date.startsWith(month) : period === '지난 달' ? r.date.startsWith(lastMonth) : r.date >= weekAgo && r.date <= t))
      //  거래처 검색과 같은 이유로 앞뒤 공백을 떼고 대소문자를 가리지 않습니다.
      .filter((r) => {
        //  기사·차량으로도 찾습니다 (0131) — 「김 기사님 지난주 기록」을 찾을 길이 없었습니다
        return koMatch(query, [r.clientName, r.driver, r.vehicleName])
      })
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  }, [data, clientById, waste, kind, period, query, status])

  const completedRows = rows.filter((r) => r.completed)
  const totalKg = completedRows.reduce((s, r) => s + (r.amount ?? 0), 0)
  const urgent = rows.filter((r) => r.kind === '긴급').length
  const handoverRate = completedRows.length
    ? Math.round((completedRows.filter((r) => r.handedOver).length / completedRows.length) * 100)
    : 0

  return (
    <div>
      {/*  폰에서 29px 이라 자꾸 빗나갔습니다. 글자는 그대로, 누를 자리만 44px. */}
      <button
        onClick={() => navigate(-1)}
        className="-ml-2 mb-1 flex min-h-[2.75rem] items-center gap-1.5 rounded-xl px-2 text-[1.08rem] font-bold text-navy-500 transition hover:bg-navy-50"
      >
        <ArrowLeft size={16} /> 뒤로
      </button>
      <PageHeader title="전체 수거이력" subtitle="거래처·차량·폐기물 구분별 수거 기록" />

      {/* 요약 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">{status === '완료' ? '수거건수' : '미입력 건수'}</p>
          <p className="t-stat mt-1.5 text-navy-900">{rows.length}<span className="ml-0.5 text-[max(0.9rem,0.55em)] text-navy-400">건</span></p>
        </div>
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">총 수거량</p>
          <p className="t-stat mt-1.5 text-teal-600">{weight(totalKg)}</p>
        </div>
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">긴급수거</p>
          <p className="t-stat mt-1.5 text-rose-500">{urgent}<span className="ml-0.5 text-[max(0.9rem,0.55em)] text-navy-400">건</span></p>
        </div>
        <div className="card kpi-box p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">인계 완료율</p>
          <p className="t-stat mt-1.5 text-navy-900">{handoverRate}<span className="ml-0.5 text-[max(0.9rem,0.55em)] text-navy-400">%</span></p>
        </div>
      </div>

      {/* 필터 */}
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1" data-history-status>
        {(['완료', '미입력'] as StatusFilter[]).map((st) => (
          <FilterChip key={st} active={status === st} onClick={() => setStatus(st)}>
            {st === '완료' ? '입력된 수거' : '지난 일정 · 미입력'}
          </FilterChip>
        ))}
      </div>
      <input data-history-search className="field-input mb-3" placeholder="거래처 · 기사 · 차량 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['전체', '의료폐기물', '일회용기저귀'] as WasteFilter[]).map((w) => (
          <FilterChip key={w} active={waste === w} onClick={() => setWaste(w)}>{w}</FilterChip>
        ))}
      </div>
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['전체', '정기', '추가', '긴급'] as KindFilter[]).map((k) => (
          <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>{k}</FilterChip>
        ))}
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['전체', '최근 7일', '이번 달', '지난 달'] as PeriodFilter[]).map((p) => (
          <FilterChip key={p} active={period === p} onClick={() => setPeriod(p)}>{p}</FilterChip>
        ))}
      </div>

      {/*  ── 몇 건 중 몇 건을 보고 있는가 (0082) ──────────────────────────
           위 KPI 는 「전체 수거건수 5,634건」이라고 하는데 표에는 60줄만
           있었습니다. 안내는 표 **아래**, 긴 스크롤 끝에 작은 회색 글씨로
           한 줄 있었을 뿐이고, 더 볼 방법도 없었습니다.
           숫자 둘이 어긋나 보이면 「자료가 없어졌나」로 읽힙니다. */}
      {rows.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          <p data-history-count className="t-muted">
            {rows.length > shown ? `${num(rows.length)}건 중 ${num(shown)}건` : `${num(rows.length)}건 전부`}
          </p>
        </div>
      )}

      {/* 테이블 */}
      <div className="card overflow-x-auto p-1">
        <table className="w-full border-collapse text-left text-[0.98rem]">
          <thead>
            <tr className="bg-navy-50 text-navy-500">
              {['날짜', '거래처', '유형', '구분', '수거량', '기사', '차량', '처리장', '인계', '비고', ...(canRevert ? ['보기·수정'] : [])].map((h) => (
                <th key={h} className="whitespace-nowrap px-2.5 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r) => (
              <tr
                key={r.id}
                data-history-row={r.id}
                //  ⚠ 줄 아무 데나 눌러도 열립니다. 오른쪽 끝의 작은 글자를
                //    찾아 누르게 하지 않습니다 — 그게 「찾기 어렵다」의 정체였습니다.
                onClick={canRevert && r.completed && r.eventId ? () => { setError(''); setOpenId(r.eventId!) } : undefined}
                className={`border-t border-navy-100 text-navy-700 ${
                  canRevert && r.completed && r.eventId ? 'cursor-pointer transition hover:bg-teal-50/60' : ''
                }`}
              >
                <td className="whitespace-nowrap px-2.5 py-2 font-semibold">{r.date.slice(5)} {r.time}</td>
                <td className="whitespace-nowrap px-2.5 py-2 font-semibold">
                  {r.clientName}
                  {r.fromField && <span className="ml-1 rounded bg-teal-50 px-1 py-0.5 text-[0.98rem] font-bold text-teal-600">현장입력</span>}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.clientType}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.wasteType === '의료폐기물' ? '의료' : '기저귀'} · {r.kind}</td>
                <td className="whitespace-nowrap px-2.5 py-2 font-bold">{r.amount != null ? `${r.amount}kg` : '-'}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.driver}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.vehicleName}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.facility}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.handoverStatus ?? '예정'}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{r.note}</td>
                {canRevert && (
                  <td className="whitespace-nowrap px-2.5 py-2">
                    {/*  ⚠ 0074 — 예전에는 여기 「되돌리기」라는 작은 빨간 글자
                         하나뿐이었습니다. 대표님 말씀: 「의미가 애매한 작은
                         버튼을 찾아야 하는 구조」. 지금은 **줄 아무 데나** 눌러
                         상세를 열고, 거기서 고치거나 취소합니다. 이 칸은 그
                         길이 있다는 표시만 합니다. */}
                    {r.completed && r.eventId ? (
                      <button
                        data-history-open={r.id}
                        onClick={() => { setError(''); setOpenId(r.eventId!) }}
                        className="flex min-h-[2.25rem] items-center gap-1 rounded-lg px-2 text-[0.98rem] font-bold text-teal-700 transition hover:bg-teal-50"
                      >
                        <Pencil size={14} strokeWidth={2.5} /> 보기·수정
                      </button>
                    ) : (
                      //  왜 못 고치는지 적습니다 — 빈 칸이면 고장으로 보입니다.
                      //  ⚠ 0131 — 지난 일정의 미입력은 **여기서 바로 입력**하러 갑니다.
                      r.completed ? (
                        <span className="text-[0.95rem] text-navy-400">엑셀 기록</span>
                      ) : (
                        <button
                          data-history-input={r.id}
                          onClick={(e) => { e.stopPropagation(); navigate(`/collection?schedule=${r.id}`) }}
                          className="flex min-h-[2.25rem] items-center gap-1 rounded-lg px-2 text-[0.98rem] font-bold text-blue-600 transition hover:bg-blue-50"
                        >
                          수거 입력 ›
                        </button>
                      )
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={canRevert ? 11 : 10} className="px-3 py-4 text-center text-navy-400">
                {data.schedules.length === 0
                  ? '아직 수거 기록이 없습니다. 첫 수거를 입력하면 여기에 쌓입니다.'
                  : status === '미입력' ? '빠진 입력이 없습니다 — 지난 일정은 모두 입력됐습니다.' : '조건에 맞는 이력이 없습니다.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {error && (
        <p data-history-error className="mt-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.05rem] font-bold text-rose-600">
          {error}
        </p>
      )}
      {rows.length > shown && (
        <button
          data-history-more
          className="btn-ghost mt-3 min-h-[44px] w-full"
          onClick={() => setShown((n) => n + PAGE)}
        >
          {num(rows.length - shown)}건 더 보기
        </button>
      )}

      <CollectionRecord eventId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
