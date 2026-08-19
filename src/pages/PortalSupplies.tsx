import { useMemo, useState } from 'react'
import { CheckCircle2, Package, Truck } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { supplyNeedsFor } from '../lib/supplyNeeds'
import { prettyDate, won } from '../lib/format'
import type { Product, ProductOrder } from '../types'
import { LoadFailedState, LoadingState, useLoadState } from '../components/LoadState'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 포털 — 필요한 물품 요청
//
//  쇼핑몰이 아닙니다. 순서가 다릅니다.
//
//   쇼핑몰   상품 목록 → 마음에 드는 것 고르기 → 결제 → 배송
//   여기     **당신 병원이 이만큼 쓰고 있습니다** → 이번에 이만큼 필요해
//            보입니다 → 다음 수거 때 같이 가져다 드릴까요
//
//  추천에는 **반드시 근거가 붙습니다.** 「최근 2.1개월 동안 3번 · 모두 36개
//  (한 달 17.1개꼴) · 마지막 8월 2일 (13일 전) · 평균 30일에 한 번」처럼
//  병원이 스스로 판단할 수 있는 숫자를 그대로 보여 줍니다.
//
//  자료가 모자라면 **추천하지 않습니다.** 지어낸 추천은 한 번만 틀려도
//  다시는 안 믿습니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  요청: 'bg-navy-50 text-navy-600',
  확인: 'bg-sky-50 text-sky-700',
  준비: 'bg-violet-50 text-violet-700',
  전달예정: 'bg-amber-100 text-amber-700',
  전달완료: 'bg-emerald-50 text-emerald-700',
  취소: 'bg-navy-50 text-navy-400',
}

export function PortalSupplies() {
  const { data, requestProductOrder } = useData()
  const { profile } = useAuth()
  const clientId = profile?.clientId ?? ''
  const today = useMemo(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }), [])

  const needs = useMemo(() => supplyNeedsFor(data, clientId, today), [data, clientId, today])
  //  단가가 0 인 물건은 병원에 보이지 않습니다.
  //
  //   서버(0050)도 「판매가 0원이면 공급 가능으로 못 켠다」로 막지만, 그
  //   전에 들어간 줄이나 표를 직접 고친 줄이 있을 수 있습니다. 0원짜리
  //   주문이 한 건이라도 들어오면 그 금액이 그대로 확정 판매금액으로
  //   박힙니다(0048 은 주문 시점 단가를 snapshot 합니다).
  const products = useMemo(
    () => (data.products ?? []).filter((p) => p.active && p.available && p.salePrice > 0),
    [data.products],
  )
  const myOrders = useMemo(
    () =>
      (data.productOrders ?? [])
        .filter((o) => o.clientId === clientId)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [data.productOrders, clientId],
  )

  //  다음 방문 예정 — 「그때 같이 가져다 주세요」의 근거입니다.
  const nextVisit = useMemo(() => {
    return (data.schedules ?? [])
      .filter((s) => s.clientId === clientId && s.status !== '완료' && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
  }, [data.schedules, clientId, today])

  const [qty, setQty] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [withPickup, setWithPickup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  //  같은 저장 시도는 한 번만 — 다시 눌러도 주문이 두 개가 되지 않습니다.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const loadState = useLoadState()

  //  추천 물품 ↔ 실제 파는 상품 잇기. 파는 상품이 없으면 추천만 보여 줍니다.
  const productFor = (stockKey: string): Product | undefined =>
    products.find((p) => p.stockKey === stockKey)

  const picked = Object.entries(qty).filter(([, n]) => n > 0)
  const total = picked.reduce((s, [id, n]) => {
    const p = products.find((x) => x.id === id)
    return s + (p ? p.salePrice * n : 0)
  }, 0)

  const bump = (id: string, n: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + n) }))

  async function send() {
    if (picked.length === 0) return
    setBusy(true)
    setMsg(null)
    const r = await requestProductOrder({
      clientId,
      items: picked.map(([productId, n]) => ({ productId, qty: n })),
      note: note.trim(),
      deliverScheduleId: withPickup ? (nextVisit?.id ?? null) : null,
      deliverOn: withPickup ? (nextVisit?.date ?? null) : null,
      requestId,
    })
    setBusy(false)
    if (r.ok) {
      setQty({})
      setNote('')
      setRequestId(crypto.randomUUID())
      setMsg({ ok: true, text: '요청이 접수되었습니다. 확인 뒤 연락드리겠습니다.' })
    } else {
      //  실패를 숨기지 않습니다 — 같은 표를 그대로 두어 다시 눌러도 안전합니다.
      setMsg({ ok: false, text: r.error ?? '요청을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.' })
    }
  }

  return (
    <div>
      <PageHeader
        title="필요한 물품"
        subtitle="쓰시는 양을 보고 이번에 필요할 물품을 알려 드립니다 — 다음 수거 때 같이 가져다 드립니다"
      />

      {/* ── 이번에 필요한 물품 ────────────────────────────────────────────── */}
      <div data-needs className="card mb-4 p-5">
        <p className="t-card font-extrabold text-navy-900">이번에 필요해 보이는 물품</p>
        {needs.needs.length === 0 ? (
          <p data-needs-blocked className="t-body mt-2 break-keep text-navy-500">
            {needs.blocked}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {needs.needs.map((n) => {
              const p = productFor(n.stockKey)
              return (
                <li key={n.stockKey} data-need={n.stockKey} className="rounded-2xl bg-navy-50/60 p-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <b className="t-body text-navy-900">{n.label}</b>
                    {n.due && <span className="pill bg-amber-100 text-amber-700">이번에 필요</span>}
                    <span className="t-cell tabular-nums text-navy-700">약 {n.suggestQty}개</span>
                  </div>
                  {/*  근거 — 이게 없으면 그냥 팔려는 말입니다 */}
                  <p data-need-why className="t-caption mt-1 break-keep text-navy-600">
                    {n.why}
                  </p>
                  {n.dueOn && (
                    <p className="t-caption mt-0.5 break-keep text-navy-500">
                      이대로면 {prettyDate(n.dueOn)}쯤 필요합니다
                    </p>
                  )}
                  {p ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button data-need-add={n.stockKey} className="btn-ghost" onClick={() => bump(p.id, n.suggestQty)}>
                        ＋ {n.suggestQty}개 담기
                      </button>
                      <span className="t-muted">
                        {p.name} {p.spec} · {won(p.salePrice)}/{p.unit}
                      </span>
                    </div>
                  ) : (
                    <p className="t-muted mt-1.5">이 물품은 아직 주문 목록에 없습니다 — 전화로 요청해 주세요.</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── 담은 것 · 보내기 ──────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div data-order-box className="card mb-4 p-5">
          <p className="t-card font-extrabold text-navy-900">주문할 물품</p>
          {/*  병원도 **사진으로 고릅니다.** 이름만 늘어놓으면 「비닐장갑」과
               「멸균 수술장갑」을 잘못 고릅니다 — 그러면 다음 수거 때 엉뚱한
               물건이 갑니다. 폰 2칸 → PC 4칸. */}
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <li
                key={p.id}
                data-product={p.id}
                className="flex flex-col rounded-2xl bg-white p-3 ring-1 ring-navy-50"
              >
                {/*  사진 자리 — 실제 제품 사진이 정해지면 여기 들어갑니다.
                    없는 사진을 지어내지 않습니다. */}
                <span className="mb-2.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-navy-50 text-navy-300">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Package size={34} strokeWidth={1.8} />
                  )}
                </span>
                <b className="t-body break-keep leading-snug text-navy-900">{p.name}</b>
                <span className="t-cell mt-0.5 break-keep text-navy-500">{p.spec}</span>
                <span className="t-body mt-1 tabular-nums font-bold text-navy-800">
                  {won(p.salePrice)}
                  <span className="t-muted ml-1 font-medium">/{p.unit}</span>
                </span>
                <span className="mt-auto flex items-center justify-center gap-2 pt-2.5">
                  <button data-qty-minus={p.id} className="btn-ghost px-3" onClick={() => bump(p.id, -1)}>
                    −
                  </button>
                  <b data-qty={p.id} className="t-body w-8 text-center tabular-nums text-navy-900">
                    {qty[p.id] ?? 0}
                  </b>
                  <button data-qty-plus={p.id} className="btn-ghost px-3" onClick={() => bump(p.id, 1)}>
                    ＋
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {/*  이 사업모델의 핵심 — 어차피 가는 차에 실어 보냅니다 */}
          <label
            data-with-pickup
            className={`mt-3.5 flex cursor-pointer items-start gap-2.5 rounded-2xl p-3.5 ${
              withPickup ? 'bg-teal-50/70 ring-1 ring-teal-200' : 'bg-navy-50/60'
            }`}
          >
            <input
              type="checkbox"
              /* 기본 체크박스는 폰에서 13px 입니다 — 손가락으로 못 맞춥니다 */
              className="mt-0.5 h-5 w-5 shrink-0 accent-teal-600"
              checked={withPickup}
              onChange={(e) => setWithPickup(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="t-body flex flex-wrap items-center gap-1.5 font-bold text-navy-900">
                <Truck size={16} strokeWidth={2.4} className="text-teal-600" />
                다음 수거 때 같이 받기
              </span>
              <span className="t-caption mt-0.5 block break-keep text-navy-600">
                {nextVisit
                  ? `다음 방문 예정 ${prettyDate(nextVisit.date)} — 그때 함께 가져다 드립니다. 배송비가 따로 들지 않습니다.`
                  : '아직 다음 방문 일정이 잡히지 않았습니다 — 일정이 정해지면 그때 함께 가져다 드립니다.'}
              </span>
            </span>
          </label>

          <input
            data-order-note
            className="field-input mt-2.5 w-full"
            placeholder="남기실 말씀 (예: 3층 창고에 넣어 주세요)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="t-body font-extrabold text-navy-900">
              {picked.length === 0 ? (
                <span className="text-navy-400">담은 물품이 없습니다</span>
              ) : (
                <>
                  {picked.length}가지 · <span className="tabular-nums">{won(total)}</span>
                  <span className="t-muted ml-1.5">(부가세 별도)</span>
                </>
              )}
            </p>
            <button
              data-order-send
              className="btn-primary"
              disabled={picked.length === 0 || busy}
              onClick={() => void send()}
            >
              {busy ? '보내는 중…' : '요청 보내기'}
            </button>
          </div>
          <p className="t-muted mt-2 break-keep">
            지금 결제하지 않습니다. 요청을 보내시면 확인 뒤 연락드리고, 물품은 다음 수거 방문 때 전달합니다.
          </p>
          {msg && (
            <p
              data-order-msg
              className={`t-body mt-2.5 rounded-xl px-3 py-2 font-bold ${
                msg.ok ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-600'
              }`}
            >
              {msg.ok && <CheckCircle2 size={15} className="mr-1 inline -translate-y-px" />}
              {msg.text}
            </p>
          )}
        </div>
      )}

      {/*  아직 파는 물품을 한 번도 등록하지 않은 상태. 빈 화면을 그냥 두면
          병원 눈에는 「고장」으로 보입니다 — 그대로 적습니다. */}
      {products.length === 0 &&
        (loadState === 'ready' ? (
          <div data-no-products className="card mb-4 p-5">
            <p className="t-body break-keep text-navy-600">
              아직 주문하실 수 있는 물품이 준비되지 않았습니다. 필요하신 것은 전화로 말씀해 주세요.
            </p>
          </div>
        ) : loadState === 'failed' ? (
          <LoadFailedState />
        ) : (
          //  자료가 오기 전에 「준비되지 않았습니다」라고 하면, 물품이 있는데도
          //  병원은 주문을 포기하고 전화를 겁니다.
          <LoadingState title="주문하실 수 있는 물품을 불러오는 중입니다" />
        ))}

      {/* ── 지난 요청 ─────────────────────────────────────────────────────── */}
      {myOrders.length > 0 && (
        <div data-my-orders className="card p-5">
          <p className="t-card font-extrabold text-navy-900">요청하신 내역</p>
          <ul className="mt-3 flex flex-col gap-2">
            {myOrders.slice(0, 10).map((o: ProductOrder) => (
              <li key={o.id} data-my-order={o.id} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-navy-50">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`pill ${STATUS_TONE[o.status] ?? 'bg-navy-50 text-navy-500'}`}>{o.status}</span>
                  <span className="t-caption text-navy-500">{prettyDate(o.requestedAt.slice(0, 10))} 요청</span>
                  {o.deliverOn && (
                    <span className="t-caption text-teal-700">{prettyDate(o.deliverOn)} 수거 때 전달</span>
                  )}
                </div>
                <p className="t-body mt-1 break-keep text-navy-800">
                  {o.items.map((i) => `${i.name} ${i.spec} ${i.qty}${i.unit}`).join(' · ')}
                </p>
                <p className="t-muted mt-0.5 tabular-nums">
                  {won(o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0))} (부가세 별도)
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
