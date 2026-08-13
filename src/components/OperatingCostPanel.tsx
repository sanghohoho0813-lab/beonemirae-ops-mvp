import { useState } from 'react'
import { Wallet, Check, X } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { won } from '../lib/format'
import { COST_CATEGORIES, COST_HINT, type CostCategory, type MonthlyPnl } from '../lib/pnl'

// ─────────────────────────────────────────────────────────────────────────────
// 월 운영비 입력 (0030)
//
//  인건비·유류비처럼 회사 전체에 나가는 돈입니다. 시스템이 추정하지 않고
//  대표님이 실제 나간 금액을 넣습니다. 이 값이 있어야 「기여이익」이
//  「영업이익」이 됩니다.
//
//  넣는 것은 관리자만입니다(서버 0030 도 같은 기준으로 막습니다). 사무실
//  담당자에게는 읽기만 보입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 숫자만 남기고 3자리마다 쉼표 — 금액 칸은 이렇게 쳐야 손에 맞습니다 */
const digits = (s: string) => s.replace(/[^\d]/g, '')
const comma = (s: string) => (s === '' ? '' : Number(s).toLocaleString('ko-KR'))

function Row({
  month,
  category,
  current,
  memo,
  canEdit,
}: {
  month: string
  category: CostCategory
  current: number | null
  memo: string
  canEdit: boolean
}) {
  const { setCost, removeCost } = useData()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(current == null ? '' : String(current))
  const [note, setNote] = useState(memo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = () => {
    setAmount(current == null ? '' : String(current))
    setNote(memo)
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    const r = await setCost({ month, category, amount: Number(amount || 0), memo: note })
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '저장하지 못했습니다.')
      return
    }
    setEditing(false)
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    const r = await removeCost(month, category)
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '지우지 못했습니다.')
      return
    }
    setEditing(false)
  }

  return (
    <div data-cost-row={category} className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 basis-[9rem]">
          <span className="block break-keep font-bold text-navy-800">{category}</span>
          <span className="block break-keep text-[0.95rem] text-navy-400">{COST_HINT[category]}</span>
        </span>

        {editing ? (
          <>
            <input
              value={comma(amount)}
              onChange={(e) => setAmount(digits(e.target.value))}
              inputMode="numeric"
              aria-label={`${category} 금액`}
              data-cost-input={category}
              className="field-input w-36 text-right tabular-nums"
              placeholder="0"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={`${category} 메모`}
              className="field-input w-40"
              placeholder="메모 (선택)"
            />
            <button
              onClick={save}
              disabled={busy}
              data-cost-save={category}
              className="btn-primary flex items-center gap-1 !px-3 !py-2"
            >
              <Check size={15} /> 저장
            </button>
            <button onClick={() => setEditing(false)} disabled={busy} className="btn-ghost !px-3 !py-2">
              <X size={15} />
            </button>
            {current != null && (
              <button onClick={remove} disabled={busy} data-cost-remove={category} className="btn-ghost !px-3 !py-2 !text-rose-500">
                지우기
              </button>
            )}
          </>
        ) : (
          <>
            <span
              data-cost-amount={category}
              className={`shrink-0 tabular-nums ${current == null ? 'text-navy-300' : 'font-extrabold text-navy-800'}`}
            >
              {current == null ? '미입력' : won(current)}
            </span>
            {memo && <span className="break-keep text-[0.95rem] text-navy-400">{memo}</span>}
            {canEdit && (
              <button onClick={open} data-cost-edit={category} className="btn-ghost !px-3 !py-2">
                {current == null ? '넣기' : '고치기'}
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="mt-1.5 text-[0.98rem] font-semibold text-rose-500">{error}</p>}
    </div>
  )
}

export function OperatingCostPanel({ pnl }: { pnl: MonthlyPnl }) {
  const { role } = useAuth()
  const canEdit = role === 'admin'
  const byCat = new Map(pnl.costs.map((c) => [c.category, c]))

  return (
    <div className="card overflow-hidden" data-cost-panel>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-navy-100 px-5 py-3">
        <Wallet size={17} className="shrink-0 text-navy-400" />
        <p className="t-card min-w-0 flex-1 text-navy-900">
          {pnl.month.replace('-', '년 ')}월 운영비
        </p>
        <span className="shrink-0 tabular-nums font-extrabold text-navy-800">
          {pnl.operatingCost == null ? '미입력' : won(pnl.operatingCost)}
        </span>
      </div>

      <div className="divide-y divide-navy-50">
        {COST_CATEGORIES.map((c) => {
          const row = byCat.get(c)
          return (
            <Row
              key={c}
              month={pnl.month}
              category={c}
              current={row ? row.amount : null}
              memo={row?.memo ?? ''}
              canEdit={canEdit}
            />
          )
        })}
      </div>

      <p className="break-keep bg-navy-50 px-5 py-3 text-[0.98rem] leading-relaxed text-navy-500">
        {canEdit
          ? '실제로 나간 금액을 넣어 주세요. 시스템이 추정하지 않습니다 — 넣은 항목만 영업이익에서 빠집니다.'
          : '운영비 입력은 대표님만 할 수 있습니다.'}
        {pnl.missing.length > 0 && pnl.operatingCost != null && (
          <>
            {' '}
            <b className="text-amber-600">
              아직 {pnl.missing.join(' · ')}이(가) 빠져 있어 영업이익이 실제보다 큽니다.
            </b>
          </>
        )}
      </p>
    </div>
  )
}
