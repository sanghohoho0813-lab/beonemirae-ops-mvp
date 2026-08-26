import { useMemo, useState } from 'react'
import { Minus, Package, Plus, Send, Truck } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PortalSheet, SheetStep, ChoiceGrid } from '../PortalSheet'
import { toast } from '../PortalToast'
import { won } from '../../lib/format'
import type { Client } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// 용기·봉투 주문 창 (0089)
//
//  대표님: 「주문 사유를 입력하게 하지 않아도 된다」 ·
//  「빠른 수량 선택 — 5개 / 10개 / 20개 / 30개」
//
//  ⚠ 병원이 제일 급한 것은 **용기가 모자란 것**입니다. 그런데 예전에는
//    화면을 옮겨 가야 했고, 옮겨 간 화면에서 다시 병원을 고르라고 했습니다
//    (0088 에서 고쳤습니다). 이제 첫 화면에서 창만 뜹니다.
//
//  ⚠ 「자주 주문하시는 수량」은 **그 병원의 실제 지난 주문**에서 냅니다.
//    지어낸 기본값을 넣지 않습니다 — 기록이 없으면 안 보여 줍니다.
// ─────────────────────────────────────────────────────────────────────────────

const QUICK = [5, 10, 20, 30]

const WHY = [
  { value: '정기 보충', label: '정기 보충' },
  { value: '부족', label: '지금 부족합니다' },
  { value: '추가 사용 예정', label: '추가 사용 예정' },
]

export function SupplySheet({
  open,
  client,
  onClose,
}: {
  open: boolean
  client: Client
  onClose: () => void
}) {
  const { data, requestProductOrder } = useData()

  //  단가가 0 인 물건은 병원에 보이지 않습니다 (0048 은 주문 시점 단가를
  //  그대로 확정 판매금액으로 씁니다 — 0원이 한 건 들어가면 그대로 박힙니다).
  const products = useMemo(
    () => (data.products ?? []).filter((p) => p.active && p.available && p.salePrice > 0),
    [data.products],
  )

  const myOrders = useMemo(
    () =>
      (data.productOrders ?? [])
        .filter((o) => o.clientId === client.id)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [data.productOrders, client.id],
  )

  //  ⚠ 「지난번에 몇 개 받으셨는지」 — 실제 주문에서만 냅니다.
  const lastQty = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of myOrders) {
      for (const it of o.items ?? []) {
        //  ⚠ 재고 품목(productId 없음)은 건너뜁니다 — 이어 붙일 짝이 없습니다.
        if (it.productId && !m.has(it.productId)) m.set(it.productId, it.qty)
      }
    }
    return m
  }, [myOrders])

  //  ⚠ 다음 방문 — 「그때 같이 가져다 드립니다」의 근거입니다.
  //    없으면 그렇다고 말합니다.
  const nextVisit = useMemo(() => {
    const t = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
    return (data.schedules ?? [])
      .filter((s) => s.clientId === client.id && s.status !== '완료' && !s.canceledAt && s.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
  }, [data.schedules, client.id])

  const [qty, setQty] = useState<Record<string, number>>({})
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const picked = Object.entries(qty).filter(([, n]) => n > 0)
  const total = picked.reduce((s, [id, n]) => {
    const p = products.find((x) => x.id === id)
    return s + (p ? p.salePrice * n : 0)
  }, 0)

  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }))
  const bump = (id: string, d: number) => set(id, (qty[id] ?? 0) + d)

  const send = async () => {
    if (picked.length === 0 || busy) return
    setBusy(true)
    setError(null)
    const res = await requestProductOrder({
      clientId: client.id,
      items: picked.map(([productId, n]) => ({ productId, qty: n })),
      //  ⚠ 고른 사유만 남깁니다. 안 고르셨으면 빈 글입니다 —
      //    저희가 「정기 보충」이라고 채우지 않습니다.
      note: why,
      //  어차피 가는 차에 실어 보냅니다 — 이 사업모델의 핵심입니다.
      deliverScheduleId: nextVisit?.id ?? null,
      deliverOn: nextVisit?.date ?? null,
      requestId,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? '주문을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    setRequestId(crypto.randomUUID())
    setQty({})
    setWhy('')
    onClose()
    toast('용기·봉투 주문이 접수되었습니다.')
  }

  return (
    <PortalSheet
      name="supply"
      open={open}
      onClose={onClose}
      title="용기 · 봉투 주문"
      subtitle={
        //  ⚠ 어느 병원 것인지 **창 안에도** 적습니다. 대표님: 「병원 포털
        //    모든 화면에서 현재 어떤 병원의 데이터인지 확인 가능하게 한다」.
        //    창은 화면 위에 뜨는 것이라 뒤의 병원 이름이 가려집니다.
        <span className="flex flex-wrap items-center gap-1.5">
          <Truck size={15} strokeWidth={2.5} className="shrink-0 text-teal-600" />
          {client.name} ·{' '}
          {nextVisit
            ? `다음 방문(${nextVisit.date}) 때 함께 가져다 드립니다 — 배송비가 따로 들지 않습니다.`
            : '아직 다음 방문 일정이 잡히지 않았습니다 — 일정이 정해지면 그때 함께 가져다 드립니다.'}
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2.5">
          <p data-supply-total className="t-muted min-w-0 flex-1 break-keep">
            {picked.length > 0 ? (
              <>
                {picked.length}종 · 합계 <b className="text-navy-900">{won(total)}</b>
                <span className="ml-1">— 지금 결제하지 않습니다</span>
              </>
            ) : (
              '필요하신 만큼 수량을 올려 주세요.'
            )}
          </p>
          <button
            data-supply-send
            onClick={() => void send()}
            disabled={picked.length === 0 || busy}
            className="flex min-h-[3rem] shrink-0 items-center gap-2 rounded-2xl bg-navy-900 px-5 text-[1.08rem] font-extrabold text-white transition hover:bg-navy-800 disabled:opacity-40"
          >
            <Send size={18} strokeWidth={2.5} />
            {busy ? '보내는 중…' : '주문하기'}
          </button>
        </div>
      }
    >
      {error && (
        <div data-supply-error className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-rose-100">
          <p className="t-body break-keep font-bold text-rose-700">{error}</p>
        </div>
      )}

      {products.length === 0 ? (
        //  ⚠ 자료가 없을 때 「고장」처럼 보이지 않게, 왜 없는지 적습니다.
        <p data-supply-empty className="t-body break-keep rounded-2xl bg-navy-50 px-5 py-5 leading-snug text-navy-500">
          지금 주문하실 수 있는 품목이 등록되어 있지 않습니다. 필요하신 것은 상담센터로 말씀해 주시면
          바로 준비해 드리겠습니다.
        </p>
      ) : (
        <>
          <SheetStep no={1} title="무엇이 필요하신가요?" hint="＋ 를 누르거나 빠른 수량을 고르세요">
            <ul className="grid gap-2.5">
              {products.map((p) => {
                const n = qty[p.id] ?? 0
                const last = lastQty.get(p.id)
                return (
                  <li
                    key={p.id}
                    data-supply-item={p.id}
                    className={`rounded-2xl bg-white p-3.5 transition ${
                      n > 0 ? 'ring-2 ring-navy-900' : 'ring-1 ring-navy-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy-50 text-navy-400">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <Package size={24} strokeWidth={2} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="t-body break-keep font-extrabold leading-snug text-navy-900">{p.name}</p>
                        <p className="t-muted mt-0.5 break-keep">
                          {p.spec && `${p.spec} · `}
                          {won(p.salePrice)}/{p.unit}
                          {/*  ⚠ 지난 주문이 **있을 때만** 적습니다. */}
                          {last != null && ` · 지난번 ${last}${p.unit}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          data-qty-minus={p.id}
                          aria-label={`${p.name} 줄이기`}
                          onClick={() => bump(p.id, -1)}
                          className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-600 transition hover:bg-navy-100"
                        >
                          <Minus size={18} strokeWidth={2.8} />
                        </button>
                        <b data-qty={p.id} className="t-body w-9 text-center tabular-nums text-navy-900">
                          {n}
                        </b>
                        <button
                          data-qty-plus={p.id}
                          aria-label={`${p.name} 늘리기`}
                          onClick={() => bump(p.id, 1)}
                          className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white transition hover:bg-navy-800"
                        >
                          <Plus size={18} strokeWidth={2.8} />
                        </button>
                      </div>
                    </div>
                    {/*  빠른 수량 — 누르는 횟수를 줄입니다 */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {QUICK.map((q) => (
                        <button
                          key={q}
                          data-qty-quick={`${p.id}:${q}`}
                          onClick={() => set(p.id, q)}
                          className={`min-h-[2.5rem] rounded-full px-3.5 text-[1rem] font-bold transition ${
                            n === q ? 'bg-teal-500 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                          }`}
                        >
                          {q}
                          {p.unit}
                        </button>
                      ))}
                      {n > 0 && (
                        <button
                          data-qty-clear={p.id}
                          onClick={() => set(p.id, 0)}
                          className="min-h-[2.5rem] rounded-full px-3.5 text-[1rem] font-bold text-navy-400 transition hover:bg-navy-50"
                        >
                          지우기
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </SheetStep>

          <SheetStep no={2} title="어떤 이유이신가요?" hint="선택 — 안 고르셔도 됩니다">
            <ChoiceGrid name="why" items={WHY} value={why} onPick={(v) => setWhy(v === why ? '' : v)} />
          </SheetStep>
        </>
      )}

      {/*  ⚠ 최근 주문 상태를 **같은 창 안에서** 보여 줍니다. 이것 때문에
           화면을 옮기게 하지 않습니다. */}
      {myOrders.length > 0 && (
        <section className="mt-5 border-t border-navy-100 pt-4">
          <h3 className="t-body mb-2.5 break-keep font-extrabold text-navy-900">최근 주문</h3>
          <ul data-supply-recent className="grid gap-2">
            {myOrders.slice(0, 4).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-white px-4 py-3 ring-1 ring-navy-100"
              >
                <span className="t-muted shrink-0 tabular-nums">{o.requestedAt.slice(0, 10)}</span>
                <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-800">
                  {(o.items ?? []).map((i) => `${i.name} ${i.qty}`).join(' · ') || '주문'}
                </span>
                <span
                  data-order-status={o.id}
                  className={`pill shrink-0 ${
                    o.status === '전달완료'
                      ? 'bg-emerald-50 text-emerald-700'
                      : o.status === '취소'
                        ? 'bg-navy-100 text-navy-500'
                        : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {o.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PortalSheet>
  )
}
