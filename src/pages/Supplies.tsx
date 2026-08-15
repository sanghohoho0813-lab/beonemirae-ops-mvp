import { useEffect, useMemo, useState } from 'react'
import { Boxes, Package, TrendingUp, Truck } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { PageShell, FilterChip, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { productSales, type ProductSales } from '../lib/repo'
import { prettyDate, won } from '../lib/format'
import { monthRevenue } from '../lib/revenue'
import type { Product, ProductOrder, ProductOrderStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 소모품 주문 — 사무실
//
//  병원이 올린 요청을 **실제 매출로** 잇는 자리입니다.
//
//    요청 → 확인 → 준비 → 전달예정 → 전달완료
//
//  재고는 이 화면이 건드리지 않습니다. **서버가 전달완료에서 한 번만** 뺍니다
//  (0048). 화면이 재고를 같이 만지면 두 번 빠지는 자리가 생깁니다.
//
//  실적은 **전달완료만** 셉니다. 요청·확인·준비는 아직 매출이 아닙니다 —
//  기존 청구·입금을 나눠 온 것과 같은 규칙입니다.
// ─────────────────────────────────────────────────────────────────────────────

const FLOW: ProductOrderStatus[] = ['요청', '확인', '준비', '전달예정', '전달완료']
const STATUS_TONE: Record<string, string> = {
  요청: 'bg-rose-50 text-rose-600',
  확인: 'bg-sky-50 text-sky-700',
  준비: 'bg-violet-50 text-violet-700',
  전달예정: 'bg-amber-100 text-amber-700',
  전달완료: 'bg-emerald-50 text-emerald-700',
  취소: 'bg-navy-50 text-navy-400',
}
const STOCK_LABEL: Record<string, string> = {
  corrugated_box: '골판지 전용박스',
  plastic_container: '합성수지 전용용기',
  bag: '전용 봉투',
  needle_box: '합성수지 바늘통',
}

type Tab = '주문' | '상품' | '실적'

export function Supplies() {
  const { data, setProductOrderStatus, saveProduct } = useData()
  const { role, mode } = useAuth()
  const [tab, setTab] = useState<Tab>('주문')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const nameOf = (id: string) => data.clients.find((c) => c.id === id)?.name ?? '알 수 없는 거래처'
  const orders = useMemo(
    () => (data.productOrders ?? []).slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [data.productOrders],
  )
  const open = orders.filter((o) => o.status !== '전달완료' && o.status !== '취소')
  const amountOf = (o: ProductOrder) => o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0)

  async function move(o: ProductOrder, next: ProductOrderStatus) {
    setBusy(o.id)
    setMsg(null)
    const r = await setProductOrderStatus(o.id, next)
    setBusy('')
    if (!r.ok) setMsg({ ok: false, text: r.error ?? '상태를 바꾸지 못했습니다.' })
    else if (next === '전달완료') setMsg({ ok: true, text: `${nameOf(o.clientId)} 전달 완료 — 재고에서 빠졌습니다.` })
  }

  return (
    <PageShell>
      <PageHeader
        title="소모품 주문"
        subtitle="병원이 쓰는 만큼 추천하고, 다음 수거 때 함께 전달합니다 — 배송비 없는 추가매출"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['주문', '상품', '실적'] as Tab[]).map((t) => (
          <FilterChip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === '주문' ? `주문 ${open.length}` : t}
          </FilterChip>
        ))}
      </div>

      {msg && (
        <div
          data-supply-msg
          className={`card mb-3 p-4 font-bold ${
            msg.ok ? 'border-teal-200 bg-teal-50/60 text-teal-700' : 'border-rose-200 bg-rose-50/60 text-rose-600'
          }`}
        >
          {msg.text}
        </div>
      )}

      {tab === '주문' && <OrdersTab orders={orders} nameOf={nameOf} amountOf={amountOf} busy={busy} onMove={move} />}
      {tab === '상품' && <ProductsTab products={data.products ?? []} canEdit={role === 'admin'} onSave={saveProduct} />}
      {tab === '실적' && <SalesTab live={mode === 'live'} />}
    </PageShell>
  )
}

// ── 주문 ────────────────────────────────────────────────────────────────────
function OrdersTab({
  orders,
  nameOf,
  amountOf,
  busy,
  onMove,
}: {
  orders: ProductOrder[]
  nameOf: (id: string) => string
  amountOf: (o: ProductOrder) => number
  busy: string
  onMove: (o: ProductOrder, next: ProductOrderStatus) => void
}) {
  const [showDone, setShowDone] = useState(false)
  const list = showDone ? orders : orders.filter((o) => o.status !== '전달완료' && o.status !== '취소')

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="아직 들어온 주문이 없습니다"
        subtitle="병원 포털의 「필요한 물품」에서 요청이 올라오면 여기에 표시됩니다. 먼저 「상품」 탭에서 파실 물품을 등록해 주세요."
      />
    )
  }

  return (
    <>
      <button className="btn-ghost mb-3" onClick={() => setShowDone((v) => !v)}>
        {showDone ? '진행 중만 보기' : '끝난 것도 보기'}
      </button>
      <div className="flex flex-col gap-2.5">
        {list.map((o) => {
          const idx = FLOW.indexOf(o.status)
          const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null
          return (
            <div key={o.id} data-order={o.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`pill ${STATUS_TONE[o.status] ?? ''}`}>{o.status}</span>
                <b className="t-body text-navy-900">{nameOf(o.clientId)}</b>
                <span className="t-muted">{prettyDate(o.requestedAt.slice(0, 10))} 요청</span>
                {o.source === 'staff' && <span className="pill bg-navy-50 text-navy-500">대신 접수</span>}
                {o.deliverOn && (
                  <span data-order-pickup={o.id} className="pill bg-teal-50 text-teal-700">
                    <Truck size={12} className="mr-0.5 inline -translate-y-px" />
                    {prettyDate(o.deliverOn)} 수거 때
                  </span>
                )}
              </div>
              <p className="t-body mt-1.5 break-keep text-navy-800">
                {o.items.map((i) => `${i.name} ${i.spec} ${i.qty}${i.unit}`).join(' · ')}
              </p>
              <p className="t-cell mt-0.5 font-extrabold tabular-nums text-navy-900">
                {won(amountOf(o))} <span className="t-muted font-medium">(부가세 별도)</span>
              </p>
              {o.note && <p className="t-muted mt-1 break-keep">“{o.note}”</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {next && (
                  <button
                    data-order-next={o.id}
                    className={next === '전달완료' ? 'btn-primary' : 'btn-ghost'}
                    disabled={busy === o.id}
                    onClick={() => onMove(o, next)}
                  >
                    {next} 으로
                  </button>
                )}
                {o.status !== '전달완료' && o.status !== '취소' && (
                  <button
                    data-order-cancel={o.id}
                    className="btn-ghost text-rose-600"
                    disabled={busy === o.id}
                    onClick={() => onMove(o, '취소')}
                  >
                    취소
                  </button>
                )}
                {o.status === '전달완료' && (
                  <span className="t-muted self-center">
                    전달 완료 — 재고에서 빠졌습니다. 되돌릴 수 없습니다.
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── 상품 ────────────────────────────────────────────────────────────────────
function ProductsTab({
  products,
  canEdit,
  onSave,
}: {
  products: Product[]
  canEdit: boolean
  onSave: (p: Partial<Product> & { name: string }) => Promise<{ ok: boolean; error: string | null }>
}) {
  const empty = { name: '', spec: '', unit: '개', salePrice: 0, costPrice: 0, stockKey: '', available: true }
  const [form, setForm] = useState<Record<string, unknown>>(empty)
  const [editing, setEditing] = useState<Product | null>(null)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setErr('')
    const r = await onSave({
      id: editing?.id,
      name: String(form.name ?? '').trim(),
      spec: String(form.spec ?? ''),
      unit: String(form.unit ?? '개'),
      salePrice: Number(form.salePrice ?? 0),
      costPrice: Number(form.costPrice ?? 0),
      stockKey: form.stockKey ? String(form.stockKey) : null,
      available: !!form.available,
    } as Partial<Product> & { name: string })
    if (r.ok) {
      setAdding(false)
      setEditing(null)
    } else setErr(r.error ?? '저장하지 못했습니다.')
  }

  return (
    <>
      {canEdit && (
        <button
          data-product-add
          className="btn-primary mb-3"
          onClick={() => {
            setForm(empty)
            setEditing(null)
            setErr('')
            setAdding(true)
          }}
        >
          ＋ 상품 추가
        </button>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="등록된 상품이 없습니다"
          subtitle="파실 물품을 등록하면 병원 포털에 나오고, 그때부터 요청을 받을 수 있습니다."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((p) => (
            <div key={p.id} data-product-row={p.id} className="card flex flex-wrap items-center gap-x-3 gap-y-1.5 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-300">
                <Package size={18} strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1 basis-[10rem]">
                <b className="t-cell text-navy-900">{p.name}</b>
                <span className="t-muted ml-1.5">{p.spec}</span>
                <span className="t-muted mt-0.5 block">
                  {p.stockKey ? `재고 연결 · ${STOCK_LABEL[p.stockKey] ?? p.stockKey}` : '재고를 두지 않는 물품'}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <b className="t-cell tabular-nums text-navy-900">{won(p.salePrice)}</b>
                <span className="t-muted block tabular-nums">원가 {won(p.costPrice)}</span>
              </span>
              {!p.available && <span className="pill bg-navy-50 text-navy-400">공급 불가</span>}
              {canEdit && (
                <button
                  data-product-edit={p.id}
                  className="btn-ghost shrink-0"
                  onClick={() => {
                    setForm({ ...p, stockKey: p.stockKey ?? '' })
                    setEditing(p)
                    setErr('')
                    setAdding(true)
                  }}
                >
                  수정
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={adding}
        title={editing ? '상품 수정' : '상품 추가'}
        onClose={() => setAdding(false)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setAdding(false)}>
              취소
            </button>
            <button data-product-save className="btn-primary flex-1" onClick={() => void save()}>
              저장
            </button>
          </>
        }
      >
        {err && <p data-product-err className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">{err}</p>}
        <label className="field-label">품명</label>
        <input
          className="field-input w-full"
          value={String(form.name ?? '')}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <label className="field-label mt-2">규격</label>
        <input
          className="field-input w-full"
          placeholder="20L"
          value={String(form.spec ?? '')}
          onChange={(e) => setForm({ ...form, spec: e.target.value })}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <span>
            <label className="field-label">판매가</label>
            <input
              className="field-input w-full"
              inputMode="numeric"
              value={String(form.salePrice ?? 0)}
              onChange={(e) => setForm({ ...form, salePrice: e.target.value.replace(/[^0-9]/g, '') })}
            />
          </span>
          <span>
            <label className="field-label">원가</label>
            <input
              className="field-input w-full"
              inputMode="numeric"
              value={String(form.costPrice ?? 0)}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value.replace(/[^0-9]/g, '') })}
            />
          </span>
        </div>
        <label className="field-label mt-2">재고 연결</label>
        <select
          className="field-input w-full"
          value={String(form.stockKey ?? '')}
          onChange={(e) => setForm({ ...form, stockKey: e.target.value })}
        >
          <option value="">재고를 두지 않는 물품</option>
          {Object.entries(STOCK_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <p className="t-muted mt-1.5 break-keep">
          재고를 연결하면 <b className="text-navy-600">전달완료를 누를 때</b> 사무실 재고에서 그만큼 빠집니다. 같은
          물건을 자재용·판매용으로 두 번 등록하지 않기 위해서입니다.
        </p>
        <label className="mt-2.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.available}
            onChange={(e) => setForm({ ...form, available: e.target.checked })}
          />
          <span className="t-body text-navy-800">지금 공급할 수 있음 (끄면 병원이 주문할 수 없습니다)</span>
        </label>
      </Modal>
    </>
  )
}

// ── 실적 ────────────────────────────────────────────────────────────────────
function SalesTab({ live }: { live: boolean }) {
  const { data } = useData()
  const [sales, setSales] = useState<ProductSales | null>(null)
  const [state, setState] = useState<'loading' | 'done' | 'unavailable'>('loading')
  //  이번 달 1일 ~ 오늘 (한국 시간)
  const today = useMemo(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }), [])
  const from = `${today.slice(0, 7)}-01`

  useEffect(() => {
    if (!live) return
    let alive = true
    void productSales(from, today)
      .then((r) => {
        if (!alive) return
        setSales(r)
        setState(r ? 'done' : 'unavailable')
      })
      .catch(() => alive && setState('unavailable'))
    return () => {
      alive = false
    }
  }, [live, from, today])

  if (!live) return <EmptyState icon={TrendingUp} title="서버에 연결되어 있지 않습니다" subtitle="" />
  if (state === 'loading') return <p className="t-muted">확인하는 중…</p>
  if (state === 'unavailable' || !sales) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="판매 실적을 읽지 못했습니다"
        subtitle="이 DB 에는 판매 기능이 아직 없거나(RUN_34 미실행), 볼 권한이 없습니다."
      />
    )
  }

  //  ── 파생 숫자 ──────────────────────────────────────────────────────────
  //   나눗셈은 여기서만 합니다. 나눌 것이 없으면 **0 으로 만들지 않고**
  //   「—」로 둡니다 — 0원은 「한 곳당 0원어치 샀다」는 뜻이 되어 버립니다.
  const perClient = sales.clients > 0 ? Math.round(sales.revenue / sales.clients) : null
  //  0049 이전 서버는 이 칸을 안 보냅니다. 없는 것을 0 으로 바꾸지 않습니다.
  const repeat = typeof sales.repeatClients === 'number' ? sales.repeatClients : null

  //  ── 수거 매출과의 대조 ─────────────────────────────────────────────────
  //   상품 매출을 수거 매출에 **더하지 않습니다.** 나란히 놓고 비율만 봅니다.
  //   수거 쪽은 매출 현황 화면과 같은 계산(`monthRevenue`)을 그대로 씁니다 —
  //   여기서 따로 세면 두 화면의 숫자가 갈립니다.
  const pickupRevenue = monthRevenue(data, today.slice(0, 7)).total
  const shareText =
    pickupRevenue > 0 ? `${Math.round((sales.revenue / pickupRevenue) * 1000) / 10}%` : '—'

  const cells = [
    { label: '판매 매출', value: won(sales.revenue), tone: 'text-navy-900' },
    { label: '판매 원가', value: won(sales.cost), tone: 'text-navy-600' },
    { label: '판매 이익', value: won(sales.profit), tone: 'text-teal-700' },
    { label: '주문 건수', value: `${sales.orders}건`, tone: 'text-navy-900' },
    { label: '구매 거래처', value: `${sales.clients}곳`, tone: 'text-navy-900' },
    { label: '수거 때 전달', value: `${sales.withPickup}건`, tone: 'text-teal-700' },
    {
      label: '거래처당 추가매출',
      value: perClient == null ? '—' : won(perClient),
      tone: 'text-navy-900',
    },
    {
      label: '다시 산 곳',
      value: repeat == null ? '—' : `${repeat}곳`,
      tone: 'text-teal-700',
    },
    { label: '수거 매출 대비', value: shareText, tone: 'text-navy-600' },
  ]

  return (
    <>
      <div data-sales className="card grid grid-cols-2 gap-px overflow-hidden bg-navy-100 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label} data-sales-cell={c.label} className="bg-white px-3 py-4 text-center">
            <p className="t-label text-navy-500">{c.label}</p>
            <p className={`t-stat mt-1 tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="t-muted mt-3 break-keep">
        {today.slice(0, 7)} 1일부터 오늘까지, <b className="text-navy-600">실제로 전달한 것만</b> 셉니다 —
        요청·확인·준비는 아직 매출이 아닙니다. 이 숫자는 <b className="text-navy-600">수거 서비스 매출과 별개</b>인
        새로 생긴 매출입니다.
      </p>
      <p data-sales-note className="t-muted mt-1.5 break-keep">
        「다시 산 곳」은 <b className="text-navy-600">그전에도 받아 가신 적이 있는</b> 거래처입니다 — 한 번은 호의고
        두 번째부터가 매출입니다.{' '}
        {repeat == null && (
          <b className="text-amber-700">이 서버는 아직 「다시 산 곳」을 셀 수 없습니다(RUN_35 미실행).</b>
        )}{' '}
        「수거 매출 대비」의 밑값은 매출 현황 화면과 같은 이번 달 수거 매출({won(pickupRevenue)}, 진행 중)입니다.
        두 매출을 더하지 않습니다.
      </p>
      {sales.revenue === 0 && (
        <p data-sales-none className="t-muted mt-1.5 break-keep">
          아직 전달을 마친 주문이 없습니다. 실제 판매가 생기기 전에는 예상 실적을 실제 성과처럼 표시하지 않습니다.
        </p>
      )}
    </>
  )
}
