import { useState } from 'react'
import { PackagePlus } from 'lucide-react'
import { useData } from '../context/DataContext'
import type { OfficeStock } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 사무실 자재 재고 — 지금 얼마나 있고, 새로 들어온 만큼 채웁니다
//
//  재고는 수거 입력의 「동시 공급」과 자재 화면의 「공급 등록」으로 줄어듭니다.
//  그런데 채우는 길이 화면에 없었습니다. 줄기만 하니 언젠가 0 이 되고, 그
//  순간 서버가 "사무실 재고보다 많이 공급할 수 없습니다" 로 막습니다 —
//  현장이 실제로 준 자재를 기록조차 못 하게 됩니다.
//
//  실제 사용량으로 계산해 보면 먼 얘기가 아닙니다. 더원요양병원 한 곳의
//  한 달 사용량이 63L 박스 180개 · 12L 박스 400개 · 기저귀비닐 800개입니다.
//  지금 사무실 재고는 박스 103 · 봉투 200 이므로 한 달을 넘기지 못합니다.
//
//  그래서 '창고에 들어온 만큼 적는' 칸만 둡니다. 새 기능이라기보다,
//  이미 있던 재고 기능이 계속 돌아가게 하는 데 필요한 최소한입니다.
//  (원장 material_transactions 에 '입고' 로 남아 나중에 되짚을 수 있습니다)
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS: { key: keyof OfficeStock; label: string }[] = [
  { key: 'corrugatedBox', label: '골판지 전용박스' },
  { key: 'plasticContainer', label: '합성수지 전용용기' },
  { key: 'bag', label: '전용 봉투' },
  { key: 'needleBox', label: '합성수지 바늘통' },
]

const EMPTY: Record<string, string> = {}

export function StockCard() {
  const { data, receiveStock } = useData()
  const stock = data.officeStock
  const [add, setAdd] = useState<Record<string, string>>(EMPTY)
  //  저장 시도 표 (0043) — 다시 눌러도 재고가 두 번 늘지 않게.
  //  성공하면 새 표를 만듭니다(다음 입고는 따로 세어야 하므로).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [memo, setMemo] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const total = FIELDS.reduce((s, f) => s + (Number(add[f.key]) || 0), 0)

  function save() {
    if (total <= 0) return
    const patch: Partial<OfficeStock> = {}
    for (const f of FIELDS) {
      const n = Number(add[f.key]) || 0
      if (n > 0) patch[f.key] = n
    }
    receiveStock(patch, memo.trim(), requestId)
    setRequestId(crypto.randomUUID())
    setDone(
      FIELDS.filter((f) => Number(add[f.key]) > 0)
        .map((f) => `${f.label} +${Number(add[f.key])}`)
        .join(' · '),
    )
    setAdd(EMPTY)
    setMemo('')
    setTimeout(() => setDone(null), 4000)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {FIELDS.map((f) => (
          <div key={f.key} className="min-w-0 rounded-2xl bg-navy-50 px-3.5 py-3">
            <p className="t-muted break-keep">{f.label}</p>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="t-card tabular-nums text-navy-900">
                {(stock?.[f.key] ?? 0).toLocaleString('ko-KR')}
              </span>
              <span className="t-muted">개</span>
            </div>
            <label className="mt-2 block">
              <span className="sr-only">{f.label} 입고 수량</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="입고 +"
                aria-label={`${f.label} 입고 수량`}
                className="no-spinner w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[1.05rem] font-bold text-navy-900 outline-none ring-1 ring-navy-100 focus:ring-2 focus:ring-teal-400"
                value={add[f.key] ?? ''}
                onChange={(e) => setAdd({ ...add, [f.key]: e.target.value })}
              />
            </label>
          </div>
        ))}
      </div>

      <input
        className="field-input"
        placeholder="사유·거래처 (예: 3월 정기 입고)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <button className="btn-navy w-full disabled:opacity-40" disabled={total <= 0} onClick={save}>
        <PackagePlus size={18} strokeWidth={2.4} /> 입고 등록
      </button>

      {done && (
        <p className="t-muted break-keep rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-emerald-700">
          입고를 반영했습니다 — {done}
        </p>
      )}
      <p className="t-muted break-keep">
        수거 입력에서 자재를 함께 공급하면 이 재고에서 자동으로 빠집니다. 여기서는 창고에 들어온 수량만
        적어 주세요.
      </p>
    </div>
  )
}
