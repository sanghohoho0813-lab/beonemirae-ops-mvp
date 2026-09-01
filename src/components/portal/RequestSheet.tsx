import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Send, Siren, Truck } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { PortalSheet, SheetStep, ChoiceGrid, type ChoiceItem } from '../PortalSheet'
import { toast } from '../PortalToast'
import { BRAND_IMG } from '../../lib/brandAssets'
import { useSchemaAtLeast } from '../../lib/schemaGate'
import {
  AMOUNT_LEVELS, PICKUP_REASONS, URGENT_REASONS,
  amountAnchor, amountHint, amountKgOf, buildRequestContent, dayChoices, wasteChoicesFor,
  type AmountLevel,
} from '../../lib/portalRequestDraft'
import type { Client } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 요청 · 긴급 수거 — **고르기만 하면 끝납니다** (0089)
//
//  대표님: 「사용자가 가능한 한 글자를 직접 입력하지 않고, 선택 → 선택 →
//  수량/일정 선택 → 완료 만으로 대부분의 업무를 끝낼 수 있도록 한다」
//
//  ── 예전 창과 무엇이 다른가 ─────────────────────────────────────────────
//   예전에는 「내용」이 **빈 칸**이었고, 그것을 채워야만 보낼 수 있었습니다.
//   병원 담당자는 폐기물이 본업이 아니라, 빈 칸 앞에서 무엇을 적어야 할지
//   몰라 결국 전화를 겁니다. 이제 메모는 **선택**이고, 고른 것만으로 보낼
//   수 있습니다.
//
//  ⚠ 고른 것은 요청 글에 **그대로** 들어갑니다(lib/portalRequestDraft.ts).
//    배차 담당이 읽는 글이라, 병원이 안 한 말을 저희가 섞지 않습니다.
//
//  ⚠ 「소량·보통·많음」은 kg 이 아닙니다. 그 병원의 **실제 최근 평균**이
//    있을 때만 환산하고, 근거를 화면에 적습니다. 없으면 kg 을 비웁니다.
// ─────────────────────────────────────────────────────────────────────────────

export function RequestSheet({
  open,
  urgent,
  client,
  onClose,
}: {
  open: boolean
  /** 긴급 수거인가 */
  urgent: boolean
  client: Client
  onClose: () => void
}) {
  const { data, addRequest } = useData()
  const { profile } = useAuth()
  //  0087 의 두 칸(폐기물 유형·예상량)이 서버에 있어야 보냅니다.
  const canDetail = useSchemaAtLeast(87) === true

  const [reasons, setReasons] = useState<string[]>([])
  const [day, setDay] = useState('')
  const [wastes, setWastes] = useState<string[]>([])
  const [level, setLevel] = useState<AmountLevel | null>(null)
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  //  한 번의 「보내기」에 하나. 실패해도 바뀌지 않습니다 (0055).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const anchor = useMemo(() => amountAnchor(data, client), [data, client])
  const wasteOpts = useMemo(() => wasteChoicesFor(client), [client])

  //  ⚠ 0093 — 날짜를 **창이 열릴 때마다** 다시 계산합니다.
  //
  //   이 창은 레이아웃에 붙어 있어서 **닫아도 사라지지 않습니다.** 그래서
  //   `useMemo(..., [])` 로 한 번만 계산해 두면, 자정을 넘긴 뒤에도 어제
  //   날짜를 「오늘」이라고 보여 줍니다. 병원이 그걸 보고 고르면 **지난
  //   날짜**가 희망일로 저장됩니다.
  //   요양병원 데스크는 화면을 켜 둔 채로 쓰는 곳이라 실제로 넘어갑니다.
  const [days, setDays] = useState(() => dayChoices())

  const reasonItems: ChoiceItem[] = (urgent ? URGENT_REASONS : PICKUP_REASONS).map((r) => ({
    value: r.value, label: r.label,
  }))
  const dayItems: ChoiceItem[] = [
    ...(urgent ? [{ value: 'asap', label: '가능한 가장 빠르게', note: '일정을 보고 연락드립니다' }] : []),
    ...days.map((d) => ({ value: d.value, label: d.label, note: d.note })),
  ]
  const wasteItems: ChoiceItem[] = wasteOpts.map((w) => ({ value: w.value, label: w.label }))
  const amountItems: ChoiceItem[] = AMOUNT_LEVELS.map((l) => ({
    value: l, label: l, note: amountHint(l, anchor),
  }))

  //  ⚠ 창을 열 때마다 날짜를 새로 잡고, **지나간 날짜를 골라 둔 상태면
  //    지웁니다.** 고른 것 자체는 남겨 둡니다 — 실수로 닫으셨을 때 처음부터
  //    다시 고르게 하지 않으려는 것입니다. 다만 지난 날짜만은 남기면 안
  //    됩니다.
  useEffect(() => {
    if (!open) return
    const fresh = dayChoices()
    setDays(fresh)
    setDay((d) => (d && d !== 'asap' && d < fresh[0].value ? '' : d))
  }, [open])

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  //  ⚠ **하나라도 고르면 보낼 수 있습니다.** 다 채우라고 막으면, 급한
  //    병원이 「모르겠는 칸」 때문에 못 보냅니다.
  const canSend = reasons.length > 0 || day !== '' || wastes.length > 0 || level != null || memo.trim() !== ''

  const reset = () => {
    setReasons([]); setDay(''); setWastes([]); setLevel(null); setMemo(''); setError(null)
  }

  const send = async () => {
    if (!canSend || busy) return
    setBusy(true)
    setError(null)

    const picked = wasteOpts.filter((w) => wastes.includes(w.value))
    const content = buildRequestContent({
      reasons, wastes: picked, level, anchor, memo, urgent,
    })

    //  ⚠ 유형이 **한 가지일 때만** 칸에 저장합니다. 의료폐기물과 기저귀를
    //    같이 고르셨으면 어느 쪽으로 셀지 저희가 정할 일이 아닙니다 —
    //    그때는 글에만 남기고 칸은 비웁니다.
    const stores = [...new Set(picked.map((w) => w.store))]
    const wasteType = stores.length === 1 ? stores[0] : null

    const res = await addRequest({
      clientId: client.id,
      kind: urgent ? '긴급수거' : '추가수거',
      content: content || (urgent ? '긴급 수거 요청' : '추가 수거 요청'),
      //  ⚠ 「가능한 가장 빠르게」는 날짜가 아닙니다. 날짜 칸을 비우고
      //    글에 남깁니다 — 오늘 날짜를 임의로 넣으면 확정처럼 읽힙니다.
      desiredDate: day && day !== 'asap' ? day : null,
      urgent,
      wasteType: canDetail ? wasteType : null,
      expectedKg: canDetail && level ? amountKgOf(level, anchor) : null,
      source: 'portal',
      requesterName: profile?.name ?? '병원 담당자',
      requestId,
    })

    setBusy(false)
    if (!res.ok) {
      //  ⚠ 고르신 것을 **지우지 않습니다.** 다시 보내면 됩니다.
      //    requestId 도 그대로라 두 번 눌러도 요청은 하나입니다.
      setError(res.error ?? '요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    setRequestId(crypto.randomUUID())
    reset()
    onClose()
    toast(urgent ? '긴급 수거 요청이 접수되었습니다.' : '수거 요청이 접수되었습니다.')
  }

  return (
    <PortalSheet
      name={urgent ? 'urgent' : 'pickup'}
      hero={urgent ? BRAND_IMG.serviceUrgent : BRAND_IMG.servicePickup}
      open={open}
      onClose={onClose}
      title={urgent ? '긴급 수거 요청' : '수거 요청'}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          {urgent ? (
            <Siren size={15} strokeWidth={2.5} className="shrink-0 text-rose-500" />
          ) : (
            <Truck size={15} strokeWidth={2.5} className="shrink-0 text-teal-600" />
          )}
          {client.name} · 고르기만 하시면 됩니다. 적으실 것은 없습니다.
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2.5">
          {/*  ⚠ 무엇이 보내지는지 단추 위에 적어 둡니다. 「보내기」만 있으면
               병원 담당자는 무엇이 갔는지 모른 채 누릅니다. */}
          <p data-req-summary className="t-muted min-w-0 flex-1 break-keep">
            {canSend
              ? [
                  reasons[0],
                  day === 'asap' ? '가능한 빠르게' : day ? days.find((d) => d.value === day)?.label : null,
                  level,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '하나만 고르셔도 보낼 수 있습니다.'}
          </p>
          <button
            data-req-send
            onClick={() => void send()}
            disabled={!canSend || busy}
            className={`flex min-h-[3rem] shrink-0 items-center gap-2 rounded-2xl px-5 text-[1.08rem] font-extrabold text-white transition disabled:opacity-40 ${
              urgent ? 'bg-rose-600 hover:bg-rose-700' : 'bg-navy-900 hover:bg-navy-800'
            }`}
          >
            <Send size={18} strokeWidth={2.5} />
            {busy ? '보내는 중…' : urgent ? '긴급 수거 요청하기' : '수거 요청하기'}
          </button>
        </div>
      }
    >
      {error && (
        <div data-req-error className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-rose-100">
          <p className="t-body break-keep font-bold text-rose-700">{error}</p>
          <p className="t-muted mt-1 break-keep">
            고르신 것은 그대로 있습니다. 통신 상태를 확인한 뒤 다시 보내 주세요.
          </p>
        </div>
      )}

      <SheetStep no={1} title={urgent ? '어떤 상황이신가요?' : '어떤 요청이신가요?'} hint="여러 개 고르셔도 됩니다">
        <ChoiceGrid
          name="reason"
          multi
          items={reasonItems}
          value={reasons}
          onPick={(v) => setReasons((p) => toggle(p, v))}
        />
      </SheetStep>

      <SheetStep no={2} title="언제 방문이 필요하신가요?">
        <ChoiceGrid name="day" items={dayItems} value={day} onPick={(v) => setDay(v === day ? '' : v)} />
        {/*  ⚠ 날짜를 직접 고르는 길도 남깁니다 — 「다음 주 화요일」 같은
             경우가 있습니다. 다만 **빠른 선택 아래**에 둡니다. */}
        <label className="mt-2.5 flex min-h-[3.25rem] items-center gap-2.5 rounded-2xl bg-white px-4 ring-1 ring-navy-200">
          <CalendarDays size={18} strokeWidth={2.4} className="shrink-0 text-navy-400" />
          <span className="t-muted shrink-0 break-keep">날짜 직접 고르기</span>
          <input
            data-req-date
            type="date"
            value={day && day !== 'asap' && !days.some((d) => d.value === day) ? day : ''}
            onChange={(e) => setDay(e.target.value)}
            className="t-body min-h-[2.75rem] min-w-0 flex-1 bg-transparent text-right font-bold text-navy-900 outline-none"
          />
        </label>
      </SheetStep>

      {wasteItems.length > 0 && (
        <SheetStep no={3} title="어떤 폐기물인가요?" hint="여러 개 고르셔도 됩니다">
          <ChoiceGrid
            name="waste"
            multi
            items={wasteItems}
            value={wastes}
            onPick={(v) => setWastes((p) => toggle(p, v))}
          />
        </SheetStep>
      )}

      <SheetStep
        no={wasteItems.length > 0 ? 4 : 3}
        title="예상 배출량"
        hint={
          anchor.usual != null
            ? `최근 ${anchor.from}회 평균 ${anchor.usual}kg 기준입니다`
            : '기록이 아직 적어 kg 으로는 환산하지 않습니다'
        }
      >
        <ChoiceGrid
          name="amount"
          items={amountItems}
          value={level ?? ''}
          onPick={(v) => setLevel(v === level ? null : (v as AmountLevel))}
        />
        {/*  ⚠ **반드시 적습니다.** 고르신 단계는 kg 으로 환산되어 요청에
             함께 나갑니다(배차가 차를 고르는 데 씁니다). 그 사실을 안 적으면
             병원 담당자는 「내가 적은 숫자대로 청구되나」 싶어 아예 안
             고르십니다. 청구는 **실제로 실은 무게**로만 합니다.
             (check_portal86 이 이 문장이 사라진 것을 잡아냈습니다) */}
        <p data-amount-note className="t-muted mt-2 break-keep leading-snug">
          어림잡은 값이면 됩니다. 차를 고르는 데만 씁니다 — 청구는 실제 수거량으로 합니다.
        </p>
      </SheetStep>

      <SheetStep
        no={wasteItems.length > 0 ? 5 : 4}
        title="더 알려 주실 것이 있으신가요?"
        hint="선택 — 안 적으셔도 됩니다"
      >
        <input
          data-req-memo
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 경비실에 연락 후 후문으로 들어와 주세요"
          className="field-input min-h-[3.25rem] w-full"
        />
      </SheetStep>
    </PortalSheet>
  )
}
