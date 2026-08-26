import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PortalSheet, ChoiceGrid, type ChoiceItem } from '../PortalSheet'
import { collectionHistory } from '../../lib/ops'
import { prettyDate, weight, today } from '../../lib/format'
import type { Client } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 이력 서랍 (0089)
//
//  대표님: 「PC 오른쪽 Drawer … 사용자가 Dashboard context를 잃지 않는 것이
//  중요하다」
//
//  ⚠ 전체 화면(/portal/.../history)은 **그대로 둡니다.** 인증 심사처럼
//    오래 들여다볼 때는 그쪽이 낫습니다. 서랍은 「잠깐 확인」용입니다.
//
//  ⚠ 인쇄는 **진짜로 됩니다.** 브라우저 인쇄에서 「PDF로 저장」을 고르면
//    파일이 나옵니다. 안 되는 다운로드 단추를 만들지 않기로 한 것과
//    어긋나지 않습니다 — 이건 실제로 동작합니다.
// ─────────────────────────────────────────────────────────────────────────────

const RANGES = [
  { value: '1', label: '최근 1개월' },
  { value: '3', label: '최근 3개월' },
  { value: '6', label: '최근 6개월' },
  { value: 'all', label: '전체' },
]

const monthsAgo = (iso: string, n: number) => {
  const d = new Date(iso)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

export function HistoryDrawer({
  open,
  client,
  onClose,
}: {
  open: boolean
  client: Client
  onClose: () => void
}) {
  const { data } = useData()
  const [range, setRange] = useState('3')
  const [type, setType] = useState('all')

  const all = useMemo(
    () => collectionHistory(data, client.id, 2000).filter((r) => r.amountKg != null),
    [data, client.id],
  )

  //  ⚠ 실제로 나온 유형만 고르게 합니다. 기저귀를 안 맡기는 병원에
  //    그 단추를 띄우면 눌러 보고 빈 화면이 됩니다.
  const types = useMemo(
    () => [...new Set(all.map((r) => r.wasteType))].filter(Boolean).sort(),
    [all],
  )

  const rows = useMemo(() => {
    const cut = range === 'all' ? '' : monthsAgo(today(), Number(range))
    return all.filter((r) => {
      if (cut && r.date < cut) return false
      if (type !== 'all' && r.wasteType !== type) return false
      return true
    })
  }, [all, range, type])

  const totalKg = rows.reduce((a, r) => a + (r.amountKg ?? 0), 0)

  const typeItems: ChoiceItem[] = [
    { value: 'all', label: '전부' },
    ...types.map((t) => ({ value: t, label: t })),
  ]

  return (
    <PortalSheet
      name="history"
      kind="drawer"
      open={open}
      onClose={onClose}
      title="수거 이력"
      subtitle={`${client.name} · 인증·실사 자료로 그대로 쓰실 수 있습니다`}
      footer={
        <div className="flex flex-wrap items-center gap-2.5">
          <p data-drawer-total className="t-body min-w-0 flex-1 break-keep font-extrabold text-navy-900">
            {rows.length}건 · {weight(totalKg)}
          </p>
          {/*  ⚠ 진짜로 되는 단추만 답니다. 인쇄 창에서 「PDF로 저장」을
               고르시면 파일이 나옵니다. */}
          <button
            data-drawer-print
            onClick={() => window.print()}
            className="flex min-h-[2.75rem] shrink-0 items-center gap-2 rounded-2xl bg-navy-50 px-4 text-[1.02rem] font-extrabold text-navy-700 transition hover:bg-navy-100"
          >
            <Printer size={17} strokeWidth={2.5} /> 인쇄 · PDF 저장
          </button>
        </div>
      }
    >
      <div className="mb-4 space-y-2.5">
        <ChoiceGrid name="range" items={RANGES} value={range} onPick={setRange} />
        {types.length > 1 && (
          <ChoiceGrid name="wastefilter" items={typeItems} value={type} onPick={setType} />
        )}
      </div>

      {rows.length === 0 ? (
        <p data-drawer-empty className="t-body break-keep rounded-2xl bg-navy-50 px-5 py-5 leading-snug text-navy-500">
          {all.length === 0
            ? '아직 수거 기록이 없습니다. 첫 수거가 완료되면 여기에 표시됩니다.'
            : '고르신 기간에 수거 기록이 없습니다. 기간을 「전체」로 바꿔 보세요.'}
        </p>
      ) : (
        <ul data-drawer-rows className="divide-y divide-navy-100 rounded-2xl bg-white ring-1 ring-navy-100">
          {rows.map((r) => (
            <li key={r.id} data-drawer-row={r.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <b className="t-body break-keep text-navy-900">{prettyDate(r.date)}</b>
                <span className="t-muted text-navy-500">{r.wasteType}</span>
                <b className="t-body ml-auto shrink-0 tabular-nums text-navy-900">
                  {weight(r.amountKg ?? 0)}
                </b>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {/*  ⚠ 용기를 **안 적었으면 「미기재」**입니다. 0 으로 채우지
                     않습니다 — 「안 적었다」와 「0개였다」는 다른 말입니다. */}
                <span className="t-muted break-keep text-navy-500">
                  {r.containerType
                    ? `용기 ${r.containerType}${r.containerCount != null ? ` (${r.containerCount}개)` : ''}`
                    : '용기 미기재'}
                </span>
                {/*  ⚠ 기사님 성함은 병원이 이미 아는 이름입니다 — 매주 오십니다. */}
                {r.driver && r.driver !== '-' && (
                  <span className="t-muted break-keep text-navy-500">· {r.driver}</span>
                )}
                <span
                  className={`pill ml-auto shrink-0 ${
                    r.handedOver ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'
                  }`}
                >
                  {r.handedOver ? '인계 완료' : (r.handoverStatus ?? '처리 중')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PortalSheet>
  )
}
