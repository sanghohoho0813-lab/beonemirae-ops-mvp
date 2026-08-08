import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Minus,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import type { AppData, Client } from '../types'
import {
  DEFAULT_PRICES,
  ITEMS,
  SUPPLY_ITEMS,
  WASTE_ITEMS,
  hasOwnPrice,
  priceOf,
  settlementFor,
  usageComparison,
  type ItemKey,
} from '../lib/billing'
import { won, wonShort } from '../lib/format'
import { Modal } from './Modal'
import { SectionTitle } from './ui'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 월 정산
//
//  사무실 담당자가 월말에 하던 일 —
//  거래처별 엑셀을 열고, 수거량을 옮겨 적고, 단가를 곱하고, 원가를 빼서
//  영업이익을 내는 것 — 을 화면에서 끝냅니다.
//
//  여기서 새로 입력하는 것은 단가뿐이고, 그것도 한 번만 정합니다.
//  수량은 전부 현장에서 이미 입력한 수거·공급 기록에서 옵니다.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** 최근 12개월 (오늘 포함) */
function recentMonths(today: string, n = 12): string[] {
  const [y, m] = today.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  })
}

export function SettlementPanel({
  data,
  client,
  month,
  onMonthChange,
  onOpenInvoice,
  onSavePricing,
}: {
  data: AppData
  client: Client
  month: string
  onMonthChange: (m: string) => void
  onOpenInvoice: () => void
  onSavePricing: (pricing: Client['pricing']) => void
}) {
  const [priceOpen, setPriceOpen] = useState(false)
  const s = useMemo(() => settlementFor(data, client.id, month), [data, client.id, month])
  const usage = useMemo(() => usageComparison(data, client.id, month), [data, client.id, month])
  const months = useMemo(() => recentMonths(month.length === 7 ? `${month}-01`.slice(0, 7) : month), [month])

  const empty = s.collections === 0 && s.supplies === 0

  return (
    <div className="space-y-3">
      {/* 월 선택 + 명세서 */}
      <div className="card flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <select
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="field-input w-auto min-w-[9rem]"
          aria-label="정산 월"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace('-', '년 ')}월
            </option>
          ))}
        </select>
        <p className="t-muted min-w-0 flex-1 break-keep">
          수거 {s.collections}건 · 공급 {s.supplies}건 집계
        </p>
        <button onClick={() => setPriceOpen(true)} className="btn-ghost shrink-0">
          <Pencil size={16} strokeWidth={2.4} /> 단가
        </button>
        <button onClick={onOpenInvoice} disabled={empty} className="btn-primary shrink-0 disabled:opacity-40">
          <FileText size={17} strokeWidth={2.4} /> 거래명세서
        </button>
      </div>

      {empty ? (
        <div className="card px-6 py-10 text-center">
          <p className="t-card break-keep text-navy-700">이 달에는 집계할 수거·공급이 없습니다</p>
          <p className="t-body mt-1.5 break-keep text-navy-400">
            현장에서 수거 완료를 입력하면 여기에 자동으로 쌓입니다.
          </p>
        </div>
      ) : (
        <>
          {/* 손익 요약 — 대표가 먼저 보는 세 숫자 */}
          <section className="card overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-navy-100">
              <Cell label="매출" value={s.revenue} tone="text-navy-900" />
              <Cell label="원가" value={s.cost} tone="text-navy-500" />
              <Cell
                label="예상 영업이익"
                value={s.profit}
                tone={s.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                sub={s.margin != null ? `${Math.round(s.margin * 100)}%` : undefined}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-navy-100 px-5 py-3.5 sm:grid-cols-4">
              <Small label="수거 매출" v={s.wasteRevenue} />
              <Small label="물품 매출" v={s.supplyRevenue} />
              <Small label="처리비" v={-s.disposalCost} />
              <Small label="자재비" v={-s.materialCost} />
            </div>
          </section>

          {s.hasLegacySupply && (
            <p className="t-muted flex items-start gap-2 break-keep rounded-2xl bg-amber-50 px-4 py-3 text-amber-700">
              <AlertTriangle size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              규격이 기록되지 않은 공급이 섞여 있습니다. 대표 규격으로 계산했으므로 자재비가 실제와 다를 수
              있습니다.
            </p>
          )}

          {/* 품목별 내역 */}
          <section className="card overflow-hidden">
            <div className="border-b border-navy-100 px-5 py-3.5">
              <p className="t-card text-navy-900">품목별 내역</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead className="t-label bg-navy-50 text-navy-500">
                  <tr>
                    <th className="px-4 py-2.5">품목</th>
                    <th className="px-4 py-2.5 text-right">수량</th>
                    <th className="px-4 py-2.5 text-right">판매단가</th>
                    <th className="px-4 py-2.5 text-right">매출</th>
                    <th className="px-4 py-2.5 text-right">원가</th>
                  </tr>
                </thead>
                <tbody className="t-cell divide-y divide-navy-50">
                  {[...s.wasteLines, ...s.supplyLines].map((l) => (
                    <tr key={l.key}>
                      <td className="px-4 py-2.5 font-bold text-navy-800">
                        {l.label}
                        {!l.billable && (
                          <span className="pill ml-1.5 bg-navy-50 text-navy-500">무상</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-navy-700">
                        {l.qty.toLocaleString()}
                        <span className="t-label text-navy-400"> {l.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-navy-500">
                        {l.salePrice != null ? l.salePrice.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-navy-900">
                        {l.revenue > 0 ? won(l.revenue) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-navy-500">
                        {l.cost > 0 ? `-${won(l.cost)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 자재 사용량 — 엑셀에서 따로 세던 것 */}
          {usage.length > 0 && (
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-navy-100 px-5 py-3.5">
                <p className="t-card min-w-0 flex-1 text-navy-900">자재 사용량</p>
                <p className="t-muted">직전 3개월 평균과 비교</p>
              </div>
              <ul className="divide-y divide-navy-50">
                {usage.map((u) => (
                  <li key={u.key} className="flex items-center gap-3 px-5 py-3">
                    <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">{u.label}</span>
                    <span className="t-cell shrink-0 tabular-nums text-navy-900">
                      {u.current.toLocaleString()}
                      <span className="t-label text-navy-400"> {u.unit}</span>
                    </span>
                    <span className="t-muted shrink-0 tabular-nums">평균 {u.average.toLocaleString()}</span>
                    <span className="w-[5.5rem] shrink-0 text-right">
                      {u.delta == null ? (
                        <span className="t-muted">—</span>
                      ) : (
                        <span
                          className={`t-label inline-flex items-center gap-0.5 font-extrabold ${
                            u.flag === 'high'
                              ? 'text-rose-600'
                              : u.flag === 'low'
                                ? 'text-sky-600'
                                : 'text-navy-400'
                          }`}
                        >
                          {u.flag === 'high' ? (
                            <ArrowUpRight size={14} strokeWidth={2.8} />
                          ) : u.flag === 'low' ? (
                            <ArrowDownRight size={14} strokeWidth={2.8} />
                          ) : (
                            <Minus size={14} strokeWidth={2.8} />
                          )}
                          {u.delta > 0 ? '+' : ''}
                          {Math.round(u.delta * 100)}%
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <PricingModal
        open={priceOpen}
        client={client}
        onClose={() => setPriceOpen(false)}
        onSave={(p) => {
          onSavePricing(p)
          setPriceOpen(false)
        }}
      />
    </div>
  )
}

function Cell({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: number
  tone: string
  sub?: string
}) {
  return (
    <div className="px-4 py-4 text-center sm:px-5">
      <p className="t-label text-navy-500">{label}</p>
      <p className={`t-kpi-sm mt-1 tabular-nums ${tone}`}>{wonShort(value)}</p>
      {sub && <p className="t-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function Small({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="t-muted shrink-0">{label}</span>
      <span className="t-cell tabular-nums text-navy-700">{v === 0 ? '—' : won(v)}</span>
    </div>
  )
}

// ── 단가 설정 ────────────────────────────────────────────────────────────────

function PricingModal({
  open,
  client,
  onClose,
  onSave,
}: {
  open: boolean
  client: Client
  onClose: () => void
  onSave: (p: Client['pricing']) => void
}) {
  const [draft, setDraft] = useState<Record<string, { sale: string; cost: string }>>(() => build(client))

  function build(c: Client) {
    const out: Record<string, { sale: string; cost: string }> = {}
    for (const it of ITEMS) {
      const p = priceOf(c, it.key)
      out[it.key] = { sale: p.sale == null ? '' : String(p.sale), cost: p.cost == null ? '' : String(p.cost) }
    }
    return out
  }

  function save() {
    const pricing: NonNullable<Client['pricing']> = {}
    for (const it of ITEMS) {
      const d = draft[it.key]
      const base = DEFAULT_PRICES[it.key] ?? { sale: null, cost: null }
      const sale = d.sale.trim() === '' ? null : Number(d.sale)
      const cost = d.cost.trim() === '' ? null : Number(d.cost)
      // 기본값과 같으면 저장하지 않습니다 — 기본 단가가 바뀌면 따라가게 하려는 것입니다.
      if (sale === base.sale && cost === base.cost) continue
      pricing[it.key] = { sale, cost }
    }
    onSave(pricing)
  }

  const row = (key: ItemKey, label: string, unit: string, billable: boolean) => (
    <tr key={key}>
      <td className="py-2 pr-2">
        <span className="t-body font-bold text-navy-800">{label}</span>
        <span className="t-label ml-1 text-navy-400">/{unit}</span>
        {!hasOwnPrice(client, key) && <span className="pill ml-1.5 bg-navy-50 text-navy-400">기본값</span>}
      </td>
      <td className="py-2 pr-2">
        {billable ? (
          <input
            type="number"
            inputMode="numeric"
            className="field-input w-full text-right"
            value={draft[key].sale}
            onChange={(e) => setDraft({ ...draft, [key]: { ...draft[key], sale: e.target.value } })}
            placeholder="무상"
          />
        ) : (
          <p className="t-muted py-2 text-right">무상 공급</p>
        )}
      </td>
      <td className="py-2">
        <input
          type="number"
          inputMode="numeric"
          className="field-input w-full text-right"
          value={draft[key].cost}
          onChange={(e) => setDraft({ ...draft, [key]: { ...draft[key], cost: e.target.value } })}
          placeholder="0"
        />
      </td>
    </tr>
  )

  return (
    <Modal
      open={open}
      title={`${client.name} 단가`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose}>
            취소
          </button>
          <button className="btn-primary flex-1" onClick={save}>
            저장
          </button>
        </>
      }
    >
      <p className="t-muted break-keep">
        한 번 정하면 매달 다시 입력하지 않습니다. 비워 두면 기본 단가를 씁니다.
      </p>

      <table className="w-full text-left">
        <thead className="t-label text-navy-500">
          <tr>
            <th className="pb-1">품목</th>
            <th className="w-[7.5rem] pb-1 text-right">판매단가</th>
            <th className="w-[7.5rem] pb-1 text-right">원가</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={3} className="pt-2">
              <SectionTitle>수거</SectionTitle>
            </td>
          </tr>
          {WASTE_ITEMS.map((i) => row(i.key, i.label, i.unit, true))}
          <tr>
            <td colSpan={3} className="pt-3">
              <SectionTitle>물품</SectionTitle>
            </td>
          </tr>
          {SUPPLY_ITEMS.map((i) => row(i.key, i.label, i.unit, i.billable))}
        </tbody>
      </table>

      <button
        onClick={() => setDraft(build({ ...client, pricing: undefined }))}
        className="btn-ghost w-full"
      >
        <RotateCcw size={16} strokeWidth={2.4} /> 기본 단가로 되돌리기
      </button>

      <p className="t-muted break-keep">
        폐기물 원가는 kg 당 소각·처리 비용입니다. 물품 원가는 개당 매입가입니다.
      </p>
    </Modal>
  )
}
