import { useMemo, useState } from 'react'
import { Minus, Package, Plus, Send, Truck } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { PortalSheet, SheetStep, ChoiceGrid } from '../PortalSheet'
import { toast } from '../PortalToast'
import { BRAND_IMG, productImageOf } from '../../lib/brandAssets'
import { won, prettyDate } from '../../lib/format'
import { supplyChoicesFor, buildSupplyContent } from '../../lib/portalSupply'
import { requestsForClient } from '../../lib/ops'
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
//
//  ── 0092 — 고를 것이 하나도 없었습니다 ─────────────────────────────────
//
//   대표님: 「용기 봉투 주문 눌렀을 때 모두 등록이 안 돼 있거든」.
//
//   이 창이 `products` 표만 보고 있었습니다. 그 표는 **따로 파는 상품**용
//   이고 아직 비어 있습니다. 정작 병원이 필요한 것은 저희가 매주 갖다
//   드리는 **13 규격 용기·봉투**이고, 그건 기사님이 자재 공급을 입력할 때
//   쓰는 목록에 이미 있습니다(lib/billing.ts ITEMS).
//
//   그래서 창을 둘로 나눴습니다 —
//     ① 정기 공급 용기·봉투 (13 규격)  → 요청함으로 (금액 없음)
//     ② 구매 품목 (products)            → 지금까지의 주문 흐름 그대로
//
//   ⚠ ①에 **판매가를 지어내지 않았습니다.** 거래처별 단가는 계약 자료이고,
//     화면에서 만들어 붙이면 그 값이 그대로 청구서에 박힙니다.
//     「무엇을 몇 개」만 보냅니다. 금액은 지금까지처럼 **실제 공급한 수량**
//     으로 정산에서 계산됩니다.
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
  const { data, requestProductOrder, addRequest } = useData()
  const { profile } = useAuth()

  //  ⚠ 0092 — **저희가 매주 갖다 드리는 13 규격.** 기사님이 자재 공급을
  //    입력할 때 쓰는 것과 같은 목록입니다(lib/portalSupply.ts).
  const specs = useMemo(() => supplyChoicesFor(data, client), [data, client])

  //  단가가 0 인 물건은 병원에 보이지 않습니다 (0048 은 주문 시점 단가를
  //  그대로 확정 판매금액으로 씁니다 — 0원이 한 건 들어가면 그대로 박힙니다).
  const products = useMemo(
    () => (data.products ?? []).filter((p) => p.active && p.available && p.salePrice > 0),
    [data.products],
  )

  //  ⚠ 정기 공급 용기 요청은 요청함(`소모품`)에 있습니다. 주문(products)과
  //    자리가 다르므로 따로 읽습니다.
  const mySupplyRequests = useMemo(
    () =>
      requestsForClient(data, client.id)
        .filter((r) => r.type === '소모품')
        .slice(0, 8),
    [data, client.id],
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

  //  ⚠ 두 묶음의 수량을 **따로** 셉니다. 하나는 요청함으로, 하나는 주문으로
  //    가기 때문에 섞으면 어느 쪽이 얼마인지 알 수 없습니다.
  const [specQty, setSpecQty] = useState<Record<string, number>>({})
  const [qty, setQty] = useState<Record<string, number>>({})
  const [why, setWhy] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const picked = Object.entries(qty).filter(([, n]) => n > 0)
  const pickedSpecs = Object.entries(specQty)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => {
      const it = specs.find((x) => x.key === k)
      return { key: k, label: it?.label ?? k, unit: it?.unit ?? '개', qty: n }
    })
  const total = picked.reduce((s, [id, n]) => {
    const p = products.find((x) => x.id === id)
    return s + (p ? p.salePrice * n : 0)
  }, 0)

  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }))
  const bump = (id: string, d: number) => set(id, (qty[id] ?? 0) + d)
  const setSpec = (k: string, n: number) => setSpecQty((q) => ({ ...q, [k]: Math.max(0, n) }))
  const bumpSpec = (k: string, d: number) => setSpec(k, (specQty[k] ?? 0) + d)

  const anyPicked = picked.length > 0 || pickedSpecs.length > 0

  const send = async () => {
    if (!anyPicked || busy) return
    setBusy(true)
    setError(null)

    //  ① 정기 공급 용기·봉투 → 요청함(`소모품`).
    //     ⚠ 금액이 없습니다. 계약 단가는 계약 자료이고, 실제 청구는
    //       **실제 공급한 수량**으로 정산에서 계산됩니다.
    if (pickedSpecs.length > 0) {
      const res = await addRequest({
        clientId: client.id,
        kind: '소모품',
        content: buildSupplyContent(pickedSpecs, why, note),
        desiredDate: nextVisit?.date ?? null,
        urgent: false,
        source: 'portal',
        requesterName: profile?.name ?? '병원 담당자',
        requestId,
      })
      if (!res.ok) {
        setBusy(false)
        //  ⚠ 고르신 것을 **지우지 않습니다.** 다시 보내면 됩니다.
        setError(res.error ?? '요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
    }

    //  ② 따로 파는 상품 → 지금까지의 주문 흐름 그대로.
    if (picked.length > 0) {
      const res = await requestProductOrder({
        clientId: client.id,
        items: picked.map(([productId, n]) => ({ productId, qty: n })),
        //  ⚠ 고른 사유만 남깁니다. 안 고르셨으면 빈 글입니다 —
        //    저희가 「정기 보충」이라고 채우지 않습니다.
        note: [why, note.trim()].filter(Boolean).join(' · '),
        //  어차피 가는 차에 실어 보냅니다 — 이 사업모델의 핵심입니다.
        deliverScheduleId: nextVisit?.id ?? null,
        deliverOn: nextVisit?.date ?? null,
        requestId,
      })
      if (!res.ok) {
        setBusy(false)
        setError(res.error ?? '주문을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
    }

    setBusy(false)
    setRequestId(crypto.randomUUID())
    setQty({})
    setSpecQty({})
    setWhy('')
    setNote('')
    onClose()
    toast('용기·봉투 요청이 접수되었습니다.')
  }

  return (
    <PortalSheet
      name="supply"
      hero={BRAND_IMG.serviceSupply}
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
            {anyPicked ? (
              <>
                {pickedSpecs.length + picked.length}종
                {/*  ⚠ 금액은 **따로 파는 상품이 있을 때만** 적습니다.
                     정기 공급 용기는 계약 단가로 정산에서 계산되므로 여기서
                     합계를 적으면 그것이 청구액인 줄 아십니다. */}
                {picked.length > 0 && (
                  <>
                    {' · 구매 품목 '}
                    <b className="text-navy-900">{won(total)}</b>
                  </>
                )}
                <span className="ml-1"> — 지금 결제하지 않습니다</span>
              </>
            ) : (
              '필요하신 만큼 수량을 올려 주세요.'
            )}
          </p>
          <button
            data-supply-send
            onClick={() => void send()}
            disabled={!anyPicked || busy}
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

      {/*  ── ① 정기 공급 용기·봉투 (0092) ────────────────────────────────
           저희가 매주 갖다 드리는 13 규격입니다. 기사님이 자재 공급을
           입력할 때 쓰는 것과 **같은 목록**입니다.
           ⚠ 받아 보신 것을 위로 올립니다. 그렇다고 나머지를 숨기지는
             않습니다 — 처음 필요해진 규격을 주문할 길이 없어집니다. */}
      <SheetStep no={1} title="어떤 용기가 필요하신가요?" hint="＋ 를 누르거나 빠른 수량을 고르세요">
        {specs.length === 0 ? (
          <p data-supply-empty className="t-body break-keep rounded-2xl bg-navy-50 px-5 py-5 leading-snug text-navy-500">
            이 병원에 등록된 수거 품목이 없어 용기 목록을 만들 수 없습니다. 상담센터로 말씀해 주시면
            바로 확인해 드리겠습니다.
          </p>
        ) : (
          <ul className="grid gap-2">
            {specs.map((it) => {
              const n = specQty[it.key] ?? 0
              return (
                <li
                  key={it.key}
                  data-spec-item={it.key}
                  className={`rounded-2xl bg-white p-3 transition ${
                    n > 0 ? 'ring-2 ring-navy-900' : 'ring-1 ring-navy-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <Package size={20} strokeWidth={2.1} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-body flex flex-wrap items-center gap-x-1.5 break-keep font-extrabold leading-snug text-navy-900">
                        {it.label}
                        {/*  ⚠ **단가는 안 보여 줍니다** — 거래처별 단가는
                             계약 자료입니다. 다만 「정산에 반영되는지」는
                             그 병원 자신의 계약 사실이라 알려 드립니다.
                             모르고 많이 주문하시면 청구서를 보고 놀랍니다. */}
                        {it.billable && (
                          <span className="pill shrink-0 bg-amber-50 text-amber-700">정산 반영</span>
                        )}
                      </p>
                      {/*  ⚠ 「지난번 10개」는 **실제 공급 기록**에서만 옵니다.
                           기록이 없으면 아무 말도 안 합니다. */}
                      {it.lastQty != null && it.lastOn && (
                        <p className="t-muted mt-0.5 break-keep">
                          지난번 {it.lastQty}
                          {it.unit} · {prettyDate(it.lastOn)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        data-spec-minus={it.key}
                        aria-label={`${it.label} 줄이기`}
                        onClick={() => bumpSpec(it.key, -1)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-600 transition hover:bg-navy-100"
                      >
                        <Minus size={18} strokeWidth={2.8} />
                      </button>
                      <b data-spec-qty={it.key} className="t-body w-9 text-center tabular-nums text-navy-900">
                        {n}
                      </b>
                      <button
                        data-spec-plus={it.key}
                        aria-label={`${it.label} 늘리기`}
                        onClick={() => bumpSpec(it.key, 1)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white transition hover:bg-navy-800"
                      >
                        <Plus size={18} strokeWidth={2.8} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        data-spec-quick={`${it.key}:${q}`}
                        onClick={() => setSpec(it.key, q)}
                        className={`min-h-[2.5rem] rounded-full px-3.5 text-[1rem] font-bold transition ${
                          n === q ? 'bg-teal-500 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                        }`}
                      >
                        {q}
                        {it.unit}
                      </button>
                    ))}
                    {n > 0 && (
                      <button
                        data-spec-clear={it.key}
                        onClick={() => setSpec(it.key, 0)}
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
        )}
      </SheetStep>

      {/*  ── ② 따로 파는 상품 — **등록된 것이 있을 때만** ───────────────── */}
      {products.length > 0 && (
        <SheetStep no={2} title="구매하실 물품" hint="정기 공급 외에 따로 사시는 물품입니다">
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
                      {(() => {
                        //  DB 사진 → 같은 규격의 대표 사진 → 아이콘 (0095)
                        const img = p.imageUrl || productImageOf(p.name, p.spec)
                        return img ? (
                          <img src={img} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        ) : (
                          <Package size={24} strokeWidth={2} />
                        )
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-body break-keep font-extrabold leading-snug text-navy-900">{p.name}</p>
                      <p className="t-muted mt-0.5 break-keep">
                        {p.spec && `${p.spec} · `}
                        {won(p.salePrice)}/{p.unit}
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
      )}

      <SheetStep no={products.length > 0 ? 3 : 2} title="어떤 이유이신가요?" hint="선택 — 안 고르셔도 됩니다">
        <ChoiceGrid name="why" items={WHY} value={why} onPick={(v) => setWhy(v === why ? '' : v)} />
        <input
          data-supply-note
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="남기실 말씀 (예: 3층 창고에 넣어 주세요)"
          className="field-input mt-2.5 min-h-[3.25rem] w-full"
        />
      </SheetStep>

      {/*  ── 최근에 요청하신 용기 (0092) ─────────────────────────────────
           ⚠ 정기 공급 용기는 요청함(`소모품`)으로 갑니다. 그 진행 상태를
             여기서 바로 보여 드립니다 — 내부 담당자가 보는 것과 **같은
             기록**입니다. */}
      {mySupplyRequests.length > 0 && (
        <section className="mt-5 border-t border-navy-100 pt-4">
          <h3 className="t-body mb-2.5 break-keep font-extrabold text-navy-900">최근 용기 요청</h3>
          <ul data-supply-reqs className="grid gap-2">
            {mySupplyRequests.slice(0, 4).map((r) => (
              <li
                key={r.id}
                data-supply-req={r.id}
                className="rounded-xl bg-white px-4 py-3 ring-1 ring-navy-100"
              >
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="t-muted shrink-0 tabular-nums">{r.when.slice(0, 10)}</span>
                  <span
                    className={`pill ml-auto shrink-0 ${
                      r.status === '처리 완료'
                        ? 'bg-emerald-50 text-emerald-700'
                        : r.status === '일정 반영'
                          ? 'bg-sky-50 text-sky-700'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="t-body mt-1 whitespace-pre-line break-keep leading-snug text-navy-800">
                  {r.content}
                </p>
                {r.reply && (
                  <p className="t-muted mt-1.5 break-keep leading-snug text-sky-800">
                    비원미래 회신 · {r.reply}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
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
