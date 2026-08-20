import { useEffect, useMemo, useState } from 'react'
import { Boxes, Package, TrendingUp, Truck } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { PageShell, FilterChip, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
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
  //  처음 열면 **상품**입니다 — 들어온 주문이 아니라 파는 물건이 먼저 보입니다.
  //
  //   예전 기본값은 「주문」이었습니다. 그런데 아직 주문이 한 건도 없는 지금은
  //   이 화면을 눌러도 「아직 들어온 주문이 없습니다」 한 줄만 나옵니다.
  //   무엇을 파는지, 사진이 어떻게 나가는지, 어느 품목에 단가가 비었는지를
  //   보려면 한 번 더 눌러야 했습니다.
  //
  //   들어온 주문을 놓칠 걱정은 없습니다 — 위 「주문 N」 칩에 처리할 건수가
  //   그대로 찍히고, 오늘 일정·대시보드에도 따로 뜹니다.
  const [tab, setTab] = useState<Tab>('상품')
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
            {t === '주문' ? (
              <span data-supply-tab="주문" className="inline-flex items-center gap-1.5">
                주문
                {/*
                  처리할 주문이 있는데 다른 칸을 보고 있으면 **붉게** 띄웁니다.
                  기본 화면이 「상품」이 된 뒤로, 들어온 주문이 이 숫자 하나에
                  걸립니다 — 회색 숫자로 두면 놓칩니다.
                */}
                <b
                  data-open-orders={open.length}
                  className={`min-w-[1.4rem] rounded-full px-1.5 py-0.5 text-[0.86rem] tabular-nums ${
                    open.length > 0 && tab !== '주문'
                      ? 'bg-rose-500 text-white'
                      : tab === '주문'
                        ? 'bg-white/25 text-white'
                        : 'bg-navy-50 text-navy-400'
                  }`}
                >
                  {open.length}
                </b>
              </span>
            ) : (
              <span data-supply-tab={t}>{t}</span>
            )}
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
      <LoadGate
        loadingTitle="주문을 불러오는 중입니다"
        empty={
          <EmptyState
            icon={Package}
            title="아직 들어온 주문이 없습니다"
            subtitle="병원 포털의 「필요한 물품」에서 요청이 올라오면 여기에 표시됩니다. 먼저 「상품」 탭에서 파실 물품을 등록해 주세요."
          />
        }
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
  const empty = {
    name: '', spec: '', unit: '개', salePrice: 0, costPrice: 0, stockKey: '',
    available: true, category: '', imageUrl: '', description: '',
  }
  const [form, setForm] = useState<Record<string, unknown>>(empty)
  const [editing, setEditing] = useState<Product | null>(null)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  //  분류별로 묶어 보여 줍니다. 분류가 없는 것은 맨 아래 「기타」로 갑니다 —
  //  숨기지 않습니다.
  const grouped = useMemo(() => {
    const m = new Map<string, Product[]>()
    for (const p of products) {
      const k = p.category?.trim() || '기타'
      m.set(k, [...(m.get(k) ?? []), p])
    }
    for (const list of m.values()) list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    return [...m.entries()].sort((a, b) => {
      if (a[0] === '기타') return 1
      if (b[0] === '기타') return -1
      return (a[1][0]?.sort ?? 0) - (b[1][0]?.sort ?? 0)
    })
  }, [products])

  //  단가를 아직 안 정한 것 — 병원 화면에 안 뜨는 물품입니다.
  const needPrice = useMemo(() => products.filter((p) => p.salePrice <= 0), [products])

  //  이미 쓰고 있는 분류 — 새로 만들 때 골라 쓰게 합니다(오타로 갈리지 않게).
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category?.trim()).filter((c): c is string => !!c))].sort(),
    [products],
  )

  async function save() {
    setErr('')
    //  ⚠ **원가를 못 받은 채로 저장하면 기존 원가가 0원이 됩니다.**
    //
    //   서버 함수(upsert_product)는 원가를 반드시 받습니다. 화면이 못 받은
    //   값을 「없으니 0」으로 채워 보내면 그 순간 진짜 원가가 지워집니다.
    //   자료를 망가뜨리느니 저장을 막고 이유를 말합니다.
    //   (사무실·관리자는 원가를 받으므로 평소에는 이 길로 오지 않습니다)
    if (editing && editing.costPrice == null) {
      setErr(
        '이 계정에서는 매입원가를 읽지 못해 상품을 수정할 수 없습니다. ' +
          '지금 저장하면 원가가 0원으로 덮어써집니다. 관리자 계정으로 수정해 주세요.',
      )
      return
    }
    const r = await onSave({
      id: editing?.id,
      name: String(form.name ?? '').trim(),
      spec: String(form.spec ?? ''),
      unit: String(form.unit ?? '개'),
      salePrice: Number(form.salePrice ?? 0),
      costPrice: Number(form.costPrice ?? 0),
      stockKey: form.stockKey ? String(form.stockKey) : null,
      available: !!form.available,
      category: String(form.category ?? ''),
      imageUrl: String(form.imageUrl ?? '').trim(),
      description: String(form.description ?? ''),
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

      {/*  단가를 아직 안 정한 물건이 있으면 맨 위에 그 수를 적습니다.
          품목만 있고 값이 없으면 병원 화면에는 하나도 안 뜹니다 — 그 사실을
          숨기면 「등록했는데 왜 안 보이지」가 됩니다. */}
      {needPrice.length > 0 && (
        <p data-product-needprice className="card mb-3 bg-amber-50 p-4 t-body break-keep text-amber-900">
          <b>단가를 정하지 않은 물품이 {needPrice.length}가지</b> 있습니다 — 판매가를 넣어야 병원 화면에 뜹니다.
          품목·규격만 미리 만들어 둔 것이라 <b>지어낸 가격은 넣지 않았습니다.</b>
        </p>
      )}

      {products.length === 0 ? (
        <LoadGate
          loadingTitle="상품을 불러오는 중입니다"
          empty={
            <EmptyState
              icon={Boxes}
              title="등록된 상품이 없습니다"
              subtitle="파실 물품을 등록하면 병원 포털에 나오고, 그때부터 요청을 받을 수 있습니다."
            />
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(([cat, list]) => (
            <div key={cat} data-product-group={cat}>
              <p className="t-label mb-1.5 text-navy-500">
                {cat} <span className="text-navy-300">· {list.length}가지</span>
              </p>
              {/*  물건은 **사진으로 고릅니다.** 한 줄에 하나씩 작은 아이콘만
                   두면 30가지 중에서 원하는 것을 찾기가 어렵습니다.
                   폰 2칸 → 태블릿 3칸 → PC 4칸 → 큰 화면 5칸. */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {list.map((p) => (
                  <div key={p.id} data-product-row={p.id} className="card flex flex-col p-3">
                    {/*  사진 자리. 실제 제품 사진이 정해지면 여기 들어갑니다 —
                        없는 사진을 지어내지 않습니다. 정사각형으로 잡아 두어
                        사진이 들어와도 칸이 흔들리지 않습니다. */}
                    <span
                      data-product-thumb={p.id}
                      className="mb-2.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-navy-50 text-navy-300 ring-1 ring-navy-100"
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <Package size={38} strokeWidth={1.8} />
                      )}
                    </span>
                    <b className="t-body break-keep leading-snug text-navy-900">{p.name}</b>
                    <span className="t-cell mt-0.5 break-keep text-navy-500">{p.spec}</span>
                    <span className="t-muted mt-0.5 break-keep">
                      {p.unit} 단위
                      {p.stockKey ? ` · 재고 ${STOCK_LABEL[p.stockKey] ?? p.stockKey}` : ''}
                      {p.imageUrl ? '' : ' · 사진 없음'}
                    </span>
                    <span className="mt-2 flex flex-wrap items-baseline gap-x-2">
                      {p.salePrice > 0 ? (
                        <>
                          <b className="t-body tabular-nums text-navy-900">{won(p.salePrice)}</b>
                          {/*  ⚠ 원가를 못 받았으면 **0원이라고 적지 않습니다.**
                               원가 0원은 「이익 100%」라는 뜻이 되어, 못 본 것과
                               재 봤더니 0원인 것이 같은 숫자로 섞입니다.
                               (0064 뒤에는 사무실·관리자만 원가를 받습니다) */}
                          <span data-product-cost={p.id} className="t-muted tabular-nums">
                            {p.costPrice == null ? '원가 미확인' : `원가 ${won(p.costPrice)}`}
                          </span>
                        </>
                      ) : (
                        <b data-product-noprice={p.id} className="t-body text-amber-700">
                          단가 미정
                        </b>
                      )}
                    </span>
                    <span className="mt-auto flex items-center gap-2 pt-2.5">
                      {!p.available && <span className="pill bg-navy-50 text-navy-400">공급 불가</span>}
                      {canEdit && (
                        <button
                          data-product-edit={p.id}
                          className="btn-ghost ml-auto shrink-0"
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
                    </span>
                  </div>
                ))}
              </div>
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
        <div className="mt-2 grid grid-cols-2 gap-2">
          <span>
            <label className="field-label">규격</label>
            <input
              data-product-spec
              className="field-input w-full"
              placeholder="20L · 100매입"
              value={String(form.spec ?? '')}
              onChange={(e) => setForm({ ...form, spec: e.target.value })}
            />
          </span>
          <span>
            <label className="field-label">단위</label>
            <input
              data-product-unit
              className="field-input w-full"
              placeholder="개 · 박스 · 팩"
              value={String(form.unit ?? '')}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </span>
        </div>
        <label className="field-label mt-2">분류</label>
        <input
          data-product-category
          className="field-input w-full"
          list="product-categories"
          placeholder="위생·감염관리"
          value={String(form.category ?? '')}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <datalist id="product-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <p className="t-muted mt-1 break-keep">화면에서 묶어 보여 줄 때만 씁니다 — 재고와는 상관없습니다.</p>
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
        <label className="field-label mt-2">사진 주소</label>
        <div className="flex items-center gap-2.5">
          {/*  넣기 전에 어떻게 보일지 그 자리에서 보여 줍니다. */}
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy-50 text-navy-300 ring-1 ring-navy-100">
            {String(form.imageUrl ?? '') ? (
              <img src={String(form.imageUrl)} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package size={20} strokeWidth={2.2} />
            )}
          </span>
          <input
            data-product-image
            className="field-input w-full"
            placeholder="https://… (비워 두면 기본 아이콘)"
            value={String(form.imageUrl ?? '')}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
        </div>
        <p className="t-muted mt-1 break-keep">
          실제 제품 사진이 정해지면 넣어 주세요. <b className="text-navy-600">없는 사진을 지어내지 않습니다</b> — 비워
          두면 기본 아이콘이 그대로 나갑니다.
        </p>
        <label className="field-label mt-2">병원에 보이는 설명</label>
        <input
          data-product-desc
          className="field-input w-full"
          placeholder="규격(S/M/L)은 주문하실 때 적어 주세요"
          value={String(form.description ?? '')}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <label className="mt-2.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.available}
            onChange={(e) => setForm({ ...form, available: e.target.checked })}
          />
          <span className="t-body text-navy-800">지금 공급할 수 있음 (끄면 병원이 주문할 수 없습니다)</span>
        </label>
        <p className="t-muted mt-1 break-keep">
          판매가가 0원이면 켤 수 없습니다 — 0원짜리 주문이 들어오면 돈이 틀립니다.
        </p>
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
