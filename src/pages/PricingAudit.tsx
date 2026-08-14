import { useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Search, Tags } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { PricingModal } from '../components/Settlement'
import { FilterChip, EmptyState } from '../components/ui'
import { Stagger, StaggerItem } from '../components/motion'
import { auditPricing, type PriceRow } from '../lib/priceAudit'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 단가 점검
//
//  거래처에 단가를 넣지 않으면 기본 단가(의료 950원/kg)로 조용히 청구됩니다.
//  계약이 860원인 병원에 950원짜리 명세서가 나가도 화면에는 아무 표시가
//  없었고, 확인하려면 거래처를 하나씩 열어 「단가」 창을 띄워야 했습니다.
//
//  이 화면은 단가를 새로 계산하지 않습니다. 정산이 쓰는 값을 그대로 옮겨
//  적고, 기본 단가로 굴러가는 곳을 위로 올려 줍니다. 고치는 창은 거래처
//  화면에 있던 것과 같은 창입니다 — 저장 경로가 둘이 되면 안 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = '확인 필요' | '전체' | '계약 단가'

export function PricingAudit() {
  const { data, updateClient } = useData()
  const audit = useMemo(() => auditPricing(data), [data])
  const [filter, setFilter] = useState<Filter>('확인 필요')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Client | null>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return audit.rows
      .filter((r) =>
        filter === '전체' ? true : filter === '확인 필요' ? r.onDefault.length > 0 : r.onDefault.length === 0,
      )
      .filter((r) => (q ? r.clientName.toLowerCase().includes(q) : true))
  }, [audit.rows, filter, query])

  const need = audit.onDefault.length

  return (
    <div>
      <PageHeader title="거래처 단가" subtitle="지금 어떤 단가로 청구되고 있는지" />

      {/* 요약 — 고쳐야 할 곳이 몇 곳인지 */}
      <div data-price-summary className="card mb-4 grid grid-cols-3 divide-x divide-navy-100">
        <div className="px-4 py-4 text-center">
          <p className="t-label text-navy-500">거래처</p>
          <p className="t-stat mt-1 tabular-nums text-navy-900">{audit.total}곳</p>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="t-label text-navy-500">계약 단가</p>
          <p className="t-stat mt-1 tabular-nums text-emerald-600">{audit.total - need}곳</p>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="t-label text-navy-500">기본 단가</p>
          <p className={`t-stat mt-1 tabular-nums ${need > 0 ? 'text-rose-500' : 'text-navy-900'}`}>{need}곳</p>
        </div>
      </div>

      {/*
        경고는 「몇 곳이 기본 단가인가」가 아니라 「그중 이미 청구가 나간 곳」이
        핵심입니다. 아직 수거도 청구도 없는 신규 거래처는 급하지 않습니다.
      */}
      {audit.onDefaultBilled.length > 0 && (
        <div data-price-warn className="card mb-4 border-rose-200 bg-rose-50/50 p-5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-500" strokeWidth={2.6} />
            <div className="min-w-0 flex-1">
              <p className="t-body font-extrabold text-navy-900">
                이미 청구가 나간 거래처 {audit.onDefaultBilled.length}곳이 기본 단가로 계산되고 있습니다
              </p>
              <p className="t-caption mt-1 break-keep">
                계약 단가를 넣지 않으면 의료폐기물 950원/kg · 일회용기저귀 660원/kg 이 그대로 쓰입니다. 계약서와
                다르면 명세서 금액과 미수금이 함께 틀어집니다.
              </p>
              <p className="t-caption mt-1.5 break-keep text-navy-500">
                {audit.onDefaultBilled.slice(0, 6).map((r) => r.clientName).join(' · ')}
                {audit.onDefaultBilled.length > 6 && ` 외 ${audit.onDefaultBilled.length - 6}곳`}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {(['확인 필요', '계약 단가', '전체'] as Filter[]).map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === '확인 필요' ? `확인 필요 ${need}` : f}
          </FilterChip>
        ))}
      </div>

      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-300" />
        <input
          className="field-input w-full pl-11"
          placeholder="거래처 이름으로 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={filter === '확인 필요' ? '기본 단가로 굴러가는 거래처가 없습니다' : '해당하는 거래처가 없습니다'}
          subtitle={
            filter === '확인 필요'
              ? '모든 거래처에 계약 단가가 들어가 있습니다.'
              : '다른 조건으로 찾아 보세요.'
          }
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:items-start">
          {list.map((r) => (
            <Row
              key={r.clientId}
              row={r}
              onEdit={() => {
                const c = data.clients.find((x) => x.id === r.clientId)
                if (c) setEditing(c)
              }}
            />
          ))}
        </Stagger>
      )}

      {/*  거래처 화면과 같은 창입니다 — 저장 경로가 둘이면 규칙이 갈립니다. */}
      {editing && (
        <PricingModal
          open
          client={editing}
          onClose={() => setEditing(null)}
          onSave={(pricing) => {
            void updateClient(editing.id, { pricing })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function Row({ row, onEdit }: { row: PriceRow; onEdit: () => void }) {
  const warn = row.onDefault.length > 0
  const supplies = row.paidSupplies.filter((s) => s.own)
  return (
    <StaggerItem>
      {/*  StaggerItem 은 data-tour 외의 속성을 DOM 으로 넘기지 않습니다.
          카드 자체에 표시를 달아야 화면 검증에서 이 행을 집을 수 있습니다. */}
      <div data-price-row={row.clientId} className={`card p-4 ${warn ? 'border-rose-200' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 font-extrabold text-navy-900">{row.clientName}</span>
        <span className="pill shrink-0 bg-navy-50 text-navy-500">{row.mode === '수거구분없음' ? '수거 구분 없음' : row.mode}</span>
      </div>

      {row.terms.length === 0 ? (
        <p className="t-caption mt-2 break-keep text-amber-700">
          의료폐기물·일회용기저귀 중 무엇을 수거하는지 지정되지 않았습니다 — 거래처 정보에서 먼저 정해 주세요.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {row.terms.map((t) => (
            <li key={t.label} className="flex items-baseline justify-between gap-2">
              <span className="t-caption shrink-0">{t.label}</span>
              <span className="min-w-0 text-right">
                <b className={`t-cell tabular-nums ${t.own ? 'text-navy-800' : 'text-rose-600'}`}>{t.value}</b>
                {!t.own && <span className="pill ml-1.5 bg-rose-100 text-rose-600">기본값</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {row.diaperVatPct > 0 && (
        <p className="t-caption mt-1.5 text-navy-500">지정폐기물 부가세 {row.diaperVatPct}% 별도</p>
      )}

      {/*
        계약으로 정한 물품 단가만 적습니다. 합성수지 2·5·20L 은 넣지 않아도
        회사 기본 판매가가 붙는데, 그것까지 줄줄이 적으면 모든 카드에 같은
        세 줄이 반복되어 정작 봐야 할 계약 단가가 묻힙니다. 박스 개당으로
        정산하는 곳(서울온케어 35L 8,000원 등)은 여기에 나옵니다.
      */}
      {supplies.length > 0 && (
        <p data-price-supplies className="t-caption mt-1.5 break-keep text-navy-500">
          계약 물품 {supplies.map((s) => `${s.label} ${s.price.toLocaleString('ko-KR')}원`).join(' · ')}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-navy-100 pt-2.5">
        <p className="t-muted min-w-0">
          청구 {row.billedMonths}개월 · 수거 {row.collections}건
        </p>
        <button data-price-edit={row.clientId} className="btn-ghost shrink-0" onClick={onEdit}>
          <Pencil size={16} strokeWidth={2.4} /> 단가
        </button>
      </div>
      </div>
    </StaggerItem>
  )
}
