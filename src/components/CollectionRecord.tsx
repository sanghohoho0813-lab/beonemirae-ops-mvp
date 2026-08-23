import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Loader2, Pencil, Undo2 } from 'lucide-react'
import { Modal } from './Modal'
import { QtyField } from './ui'
import { TimeField } from './TimeField'
import { RevertReasonFields } from './RevertReason'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { CONTAINER_KEYS, STOCK_KEYS, EMPTY_CONTAINERS, EMPTY_SUPPLIED, containerTotal } from '../lib/collection'
import { SUPPLY_ITEMS, itemsOf, stockDeltaOf, type ItemCounts, type ItemKey } from '../lib/billing'
import { prettyDate, weight } from '../lib/format'
import type { ContainerBreakdown, WasteType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 수거기록 상세 — 누르면 열리고, 여기서 고치거나 취소합니다 (0074)
//
//  대표님 말씀: 「되돌리기처럼 의미가 애매한 작은 버튼을 찾아야 하는 구조보다,
//  수거기록 자체를 누르면 상세를 보고 바로 수정 / 기록 취소할 수 있는 구조」.
//
//  ⚠ 예전에는 고치는 길이 **오늘 일정 화면 안에만** 있었고, 거기서도
//    수거량과 메모 두 칸만 바꿨습니다. 게다가 그 길은 schedules 표를 직접
//    고쳐서 **수거이력·자재·재고는 그대로 두었습니다** — 일정에는 320kg,
//    수거이력에는 100kg 인 상태가 남습니다. 여기서는 서버 함수 하나
//    (amend_collection)가 되돌리고 다시 넣습니다.
//
//  ⚠ 거래처는 못 바꿉니다. 병원을 바꾸는 것은 고치기가 아니라 **다른
//    기록**이고, 그렇게 하면 그 병원의 청구가 조용히 바뀝니다.
//
//  ⚠ 「용기」와 「공급 자재」는 다른 것입니다. 용기는 병원에서 **가져온** 것,
//    자재는 창고에서 **주고 온** 것입니다. 자재만 재고가 줄어듭니다.
// ─────────────────────────────────────────────────────────────────────────────

export function CollectionRecord({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const { data, clientById, amendCollection, revertCollection } = useData()
  const { role, mode } = useAuth()
  const staff = role === 'admin' || role === 'office'
  //  고치는 것은 사무실·관리자만입니다(서버도 그렇게 막습니다).
  const canAmend = useSchemaAtLeast(74) === true && staff && mode === 'live'
  //  ⚠ **취소는 기사님도 하십니다.** 서버가 「본인이 입력한 수거만」으로
  //    막고 있어서(0008), 남의 것을 누르면 서버가 이유를 말해 줍니다.
  //    이 길이 없으면 기사님이 자기 오타를 고칠 방법이 사무실 전화뿐입니다 —
  //    없애려던 그 전화입니다. 취소하고 다시 넣으면 재고·자재까지 정확히
  //    되돌아갑니다(revert_collection).
  const canCancel = mode === 'live' && (staff || role === 'field')

  //  ⚠ 창 하나 안에서 **단계만** 바꿉니다. 창 안에서 다른 창을 열면, 뒤 창이
  //    닫히며 부르는 history.back() 이 방금 뜬 앞 창을 곧바로 다시 닫습니다
  //    (useHistoryDismiss 가 뒤로 가기와 창을 이어 놓았기 때문입니다).
  //    실제로 「기록 취소」를 누르면 아무 일도 안 일어난 것처럼 보였습니다.
  const [mode2, setMode2] = useState<'view' | 'edit' | 'cancel'>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const ev = useMemo(() => data.events.find((e) => e.id === eventId) ?? null, [data.events, eventId])
  const sched = useMemo(
    () => (ev ? data.schedules.find((s) => s.id === ev.scheduleId) ?? null : null),
    [data.schedules, ev],
  )
  const supplies = useMemo(
    () => (ev ? data.materials.filter((m) => ev.materialIds.includes(m.id)) : []),
    [data.materials, ev],
  )
  //  이 기록에 매달린 규격별 공급량 — 여러 줄이면 합칩니다.
  const suppliedNow = useMemo(() => {
    const out: ItemCounts = {}
    for (const m of supplies) {
      for (const [k, n] of Object.entries(itemsOf(m))) out[k as ItemKey] = (out[k as ItemKey] ?? 0) + (n ?? 0)
    }
    return out
  }, [supplies])

  // ── 고칠 값 ────────────────────────────────────────────────────────────
  const [amount, setAmount] = useState('')
  const [atTime, setAtTime] = useState('')
  const [memo, setMemo] = useState('')
  const [waste, setWaste] = useState<WasteType>('의료폐기물')
  const [containers, setContainers] = useState<ContainerBreakdown>({ ...EMPTY_CONTAINERS })
  const [items, setItems] = useState<ItemCounts>({})
  const [reason, setReason] = useState('')
  const [showAll, setShowAll] = useState(false)

  //  기록이 바뀌면(다른 줄을 눌렀거나 고친 뒤) 칸을 다시 채웁니다.
  useEffect(() => {
    setMode2('view')
    setError('')
    setDone('')
    setReason('')
    setShowAll(false)
    if (!ev) return
    setAmount(String(ev.amountKg))
    setAtTime(sched?.actualTime || sched?.scheduledTime || '')
    setMemo(sched?.memo ?? ev.note ?? '')
    setWaste(ev.wasteType)
    setContainers({ ...EMPTY_CONTAINERS, ...(sched?.containers ?? {}) })
    setItems({ ...suppliedNow })
  }, [ev, sched, suppliedNow])

  if (!eventId) return null

  const client = ev ? clientById(ev.clientId) : null
  const stock = data.officeStock
  const suppliedBuckets = { ...EMPTY_SUPPLIED, ...stockDeltaOf(items) }
  //  ⚠ 지금 이 기록이 이미 물고 있는 만큼은 **되돌아온 뒤 다시 나갑니다.**
  //    그래서 실제로 더 필요한 것은 「새 값 − 지금 값」입니다. 이 계산을 안 하면
  //    재고 45개에 40개짜리 기록을 41개로 고칠 때 「모자란다」고 잘못 막습니다.
  const heldNow = { ...EMPTY_SUPPLIED, ...stockDeltaOf(suppliedNow) }
  const over = STOCK_KEYS.some(({ key }) => suppliedBuckets[key] - heldNow[key] > stock[key])
  const changed =
    ev != null &&
    (Number(amount) !== ev.amountKg ||
      atTime !== (sched?.actualTime || sched?.scheduledTime || '') ||
      memo !== (sched?.memo ?? '') ||
      waste !== ev.wasteType ||
      JSON.stringify(containers) !== JSON.stringify({ ...EMPTY_CONTAINERS, ...(sched?.containers ?? {}) }) ||
      JSON.stringify(items) !== JSON.stringify(suppliedNow))
  const ready = changed && reason.trim().length > 0 && Number(amount) > 0 && atTime !== '' && !over

  async function save() {
    if (!ev || !ready) return
    setBusy(true)
    setError('')
    const r = await amendCollection(ev.id, reason.trim(), {
      wasteType: waste,
      vehicleId: sched?.vehicleId ?? '',
      driverName: sched?.driverName ?? '',
      actualAmount: Number(amount),
      actualTime: atTime,
      date: sched?.date,
      containers,
      handoverStatus: sched?.handoverStatus ?? '수거 완료',
      supplied: suppliedBuckets,
      suppliedItems: items,
      memo,
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.errors.join(' ') || '고치지 못했습니다.')
      return
    }
    //  ⚠ 고치고 나면 **이 기록은 취소됨이 되고 새 기록이 생깁니다.** 창을 그대로
    //    두면 취소된 기록을 보고 있게 되므로 닫습니다.
    setDone('고쳤습니다.')
    setTimeout(onClose, 700)
  }

  async function doRevert() {
    if (!ev || reason.trim().length === 0) return
    setBusy(true)
    setError('')
    const r = await revertCollection(ev.id, reason.trim())
    setBusy(false)
    if (!r.ok) {
      setError(r.errors.join(' ') || '취소하지 못했습니다.')
      return
    }
    setDone('이 기록을 취소했습니다.')
    setTimeout(onClose, 700)
  }

  const shownItems = SUPPLY_ITEMS.filter((it) => showAll || (items[it.key as ItemKey] ?? 0) > 0 || (suppliedNow[it.key as ItemKey] ?? 0) > 0)
  const hiddenCount = SUPPLY_ITEMS.length - shownItems.length

  return (
    <>
      <Modal
        open={eventId !== null}
        title={mode2 === 'edit' ? '수거기록 수정' : mode2 === 'cancel' ? '수거기록 취소' : '수거기록'}
        onClose={onClose}
        footer={
          mode2 === 'cancel' ? (
            <>
              <button className="btn-ghost flex-1" onClick={() => setMode2('view')} disabled={busy}>
                되돌아가기
              </button>
              <button
                data-record-revert-go
                className="btn-primary flex-1 disabled:opacity-50"
                disabled={reason.trim().length === 0 || busy}
                onClick={() => void doRevert()}
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Undo2 size={17} strokeWidth={2.5} />}
                기록 취소
              </button>
            </>
          ) : mode2 === 'edit' ? (
            <>
              <button className="btn-ghost flex-1" onClick={() => setMode2('view')} disabled={busy}>
                되돌아가기
              </button>
              <button
                data-record-save
                className="btn-primary flex-1 disabled:opacity-50"
                disabled={!ready || busy}
                onClick={() => void save()}
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Pencil size={17} strokeWidth={2.5} />}
                이대로 고치기
              </button>
            </>
          ) : ev && !ev.reverted && (canCancel || canAmend) ? (
            <>
              {canCancel && (
                <button
                  data-record-revert
                  className="btn-ghost flex-1 !text-rose-600"
                  onClick={() => { setReason(''); setError(''); setMode2('cancel') }}
                >
                  <Undo2 size={17} strokeWidth={2.5} /> 기록 취소
                </button>
              )}
              {canAmend ? (
                <button data-record-edit className="btn-primary flex-1" onClick={() => setMode2('edit')}>
                  <Pencil size={17} strokeWidth={2.5} /> 수정
                </button>
              ) : (
                <button className="btn-ghost flex-1" onClick={onClose}>
                  닫기
                </button>
              )}
            </>
          ) : (
            <button className="btn-ghost flex-1" onClick={onClose}>
              닫기
            </button>
          )
        }
      >
        {!ev ? (
          <p data-record-gone className="t-body break-keep text-navy-500">
            이 수거 기록을 찾을 수 없습니다. 화면을 새로 고쳐 보세요.
          </p>
        ) : (
          <div data-record={ev.id}>
            {/*  머리 — 어느 병원 · 언제 · 얼마. 이 셋이 「이 기록이 맞나」의 전부입니다. */}
            <div className="rounded-2xl bg-navy-50 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Link
                  to={`/clients/${ev.clientId}`}
                  data-record-client
                  className="break-keep text-[1.25rem] font-extrabold text-navy-900 underline-offset-4 hover:underline"
                >
                  {client?.name ?? ev.clientName}
                </Link>
                <ArrowRight size={14} className="shrink-0 text-navy-400" />
                <span className="t-caption text-navy-500">거래처 열기</span>
              </div>
              <p className="t-body mt-0.5 break-keep text-navy-600">
                {prettyDate(sched?.date ?? ev.at.slice(0, 10))} · {sched?.actualTime || sched?.scheduledTime || '시간 미기재'} ·{' '}
                {ev.wasteType}
              </p>
              {ev.reverted && (
                <p data-record-reverted className="mt-1.5 inline-flex rounded-lg bg-rose-100 px-2 py-0.5 text-[1rem] font-extrabold text-rose-700">
                  취소된 기록입니다
                </p>
              )}
            </div>

            {mode2 === 'cancel' ? (
              <div className="mt-3 flex flex-col gap-3">
                <p className="break-keep text-[1.05rem] leading-relaxed text-navy-600">
                  일정·수거이력·자재·재고·요청 상태가 입력 전으로 되돌아갑니다. 그 달 정산·청구 금액도
                  같이 바뀝니다. <b className="text-navy-800">기록을 지우는 것은 아닙니다</b> — 원본은
                  「취소됨」으로 남습니다.
                </p>
                <p className="t-caption break-keep text-navy-500">
                  이미 확정한 청구에 들어간 수거는 서버가 막습니다. 청구를 먼저 취소해 주세요.
                </p>
                <RevertReasonFields reason={reason} onChange={setReason} />
                {!staff && (
                  <p className="t-caption break-keep leading-snug text-navy-500">
                    취소한 뒤 <b className="text-navy-700">수거 입력에서 다시 넣으시면 됩니다.</b>{' '}
                    자재와 재고도 함께 되돌아갑니다.
                  </p>
                )}
              </div>
            ) : mode2 === 'view' ? (
              <dl className="mt-3 flex flex-col gap-2">
                <Row label="수거량">
                  <b data-record-amount className="text-[1.3rem] font-extrabold tabular-nums text-navy-900">
                    {weight(ev.amountKg)}
                  </b>
                </Row>
                <Row label="기사">{sched?.driverName || '안 적혀 있음'}</Row>
                <Row label="차량">{data.vehicles.find((v) => v.id === sched?.vehicleId)?.name ?? '-'}</Row>
                <Row label="인계">{sched?.handoverStatus ?? '-'}</Row>
                <Row label="넣은 사람">
                  {ev.role} · {ev.at.slice(11, 16)}
                </Row>
                <Row label="가져온 용기">
                  {containerTotal({ ...EMPTY_CONTAINERS, ...(sched?.containers ?? {}) }) > 0
                    ? CONTAINER_KEYS.filter((c) => (sched?.containers?.[c.key] ?? 0) > 0)
                        .map((c) => `${c.label} ${sched?.containers?.[c.key]}`)
                        .join(' · ')
                    : '없음'}
                </Row>
                {/*  ⚠ 용기와 다른 줄로 둡니다 — 방향이 반대라서 한 줄에 있으면 섞입니다. */}
                <Row label="주고 온 자재">
                  {Object.keys(suppliedNow).length > 0 ? (
                    <span data-record-supply>
                      {SUPPLY_ITEMS.filter((it) => (suppliedNow[it.key as ItemKey] ?? 0) > 0)
                        .map((it) => `${it.label} ${suppliedNow[it.key as ItemKey]}`)
                        .join(' · ')}
                      <span className="t-caption ml-1 text-navy-500">(회사 재고에서 나갔습니다)</span>
                    </span>
                  ) : (
                    '없음'
                  )}
                </Row>
                {(sched?.memo || ev.note) && <Row label="특이사항">{sched?.memo || ev.note}</Row>}
              </dl>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <label className="field-label">실제 수거량 (kg)</label>
                  <input
                    data-record-amount-input
                    type="number"
                    inputMode="numeric"
                    className="field-input"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <TimeField label="실제 수거 시간" value={atTime} onChange={setAtTime} />
                <div>
                  <label className="field-label">구분</label>
                  <div className="flex gap-2">
                    {(['의료폐기물', '일회용기저귀'] as WasteType[]).map((w) => (
                      <button
                        key={w}
                        type="button"
                        data-record-waste={w}
                        onClick={() => setWaste(w)}
                        className={`min-h-[3rem] flex-1 rounded-2xl text-[1.05rem] font-extrabold transition active:scale-[0.98] ${
                          waste === w ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                <Fold title="가져온 용기" desc="병원에서 배출되어 우리가 가져온 수량입니다 — 재고와 무관합니다">
                  {CONTAINER_KEYS.map(({ key, label }) => (
                    <QtyField
                      key={key}
                      row
                      label={label}
                      value={containers[key]}
                      onChange={(v) => setContainers((c) => ({ ...c, [key]: v }))}
                    />
                  ))}
                </Fold>

                <Fold title="주고 온 자재" desc="회사 창고에서 나간 수량입니다 — 고치면 재고도 함께 정정됩니다">
                  {shownItems.map((it) => {
                    const bucket = it.bucket!
                    const need = suppliedBuckets[bucket] - heldNow[bucket]
                    return (
                      //  ⚠ 검사가 규격을 콕 집을 수 있게 표시를 답니다. 「숫자칸 중
                      //    몇 번째」로 세면 줄 하나만 늘어도 엉뚱한 칸을 집습니다.
                      <div key={it.key} data-record-supply-item={it.key}>
                        <QtyField
                          row
                          label={it.label}
                          value={items[it.key as ItemKey] ?? 0}
                          danger={need > stock[bucket]}
                          hint={need > stock[bucket] ? `창고에 ${stock[bucket]}개 남았습니다` : undefined}
                          onChange={(v) =>
                            setItems((cur) => {
                              const next = { ...cur }
                              if (v > 0) next[it.key as ItemKey] = v
                              else delete next[it.key as ItemKey]
                              return next
                            })
                          }
                        />
                      </div>
                    )
                  })}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      data-record-supply-more
                      onClick={() => setShowAll(true)}
                      className="mt-2 w-full rounded-2xl bg-navy-50 py-2.5 text-[1.02rem] font-bold text-navy-600"
                    >
                      다른 규격 {hiddenCount}개 보기
                    </button>
                  )}
                  {/*  ⚠ 「지금 69 → 저장 후 65」. 결과를 미리 보여 주지 않으면
                       고친 뒤에 재고 화면을 따로 열어 확인하게 됩니다. */}
                  <div data-record-stock-preview className="mt-2.5 flex flex-col gap-1">
                    {STOCK_KEYS.map(({ key, label }) => {
                      const delta = suppliedBuckets[key] - heldNow[key]
                      if (delta === 0 && suppliedBuckets[key] === 0) return null
                      const after = stock[key] - delta
                      return (
                        <span key={key} className="t-caption tabular-nums text-navy-600">
                          {label} <b className="text-navy-900">{stock[key]}</b>
                          {delta !== 0 && (
                            <>
                              {' → '}
                              <b className={after < 0 ? 'text-rose-600' : 'text-teal-700'}>{after}</b>
                              <span className="text-navy-500">
                                {' '}
                                ({delta > 0 ? `${delta}개 더 나감` : `${-delta}개 돌아옴`})
                              </span>
                            </>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </Fold>

                <div>
                  <label className="field-label">특이사항</label>
                  <textarea
                    className="field-input"
                    rows={2}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="없으면 비워 두세요"
                  />
                </div>

                <div>
                  <label className="field-label">
                    왜 고치시나요? <span className="text-rose-600">*</span>
                  </label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {['수거량을 잘못 적었습니다', '시간을 잘못 적었습니다', '자재 수량이 틀렸습니다', '구분을 잘못 골랐습니다'].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setReason(q)}
                        className={`min-h-[2.5rem] rounded-xl px-3 text-[1rem] font-bold transition active:scale-95 ${
                          reason === q ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <input
                    data-record-reason
                    className="input"
                    maxLength={200}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="직접 적으셔도 됩니다"
                  />
                </div>

                {!changed && (
                  <p className="t-caption break-keep text-navy-500">아직 바꾼 것이 없습니다.</p>
                )}
                {over && (
                  <p data-record-over className="t-body break-keep font-bold text-rose-600">
                    창고에 있는 것보다 많이 주고 온 것으로 적을 수 없습니다.
                  </p>
                )}
                <p className="t-caption break-keep leading-snug text-navy-500">
                  고치면 원본은 <b>「취소됨」</b>으로 남고 새 기록이 생깁니다. 자재·재고·병원 요청도 함께 정정됩니다.
                </p>
              </div>
            )}

            {error && (
              <p data-record-error className="mt-3 flex items-start gap-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.02rem] font-bold text-rose-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" strokeWidth={2.3} /> {error}
              </p>
            )}
            {done && (
              <p data-record-done className="mt-3 break-keep rounded-2xl bg-teal-50 px-4 py-3 text-[1.02rem] font-bold text-teal-700">
                {done}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-navy-50 pb-2 last:border-0">
      <dt className="w-[6.5rem] shrink-0 break-keep text-[1.02rem] font-bold text-navy-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-keep text-[1.08rem] text-navy-800">{children}</dd>
    </div>
  )
}

function Fold({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-navy-100 p-3">
      <p className="text-[1.05rem] font-extrabold text-navy-900">{title}</p>
      <p className="t-caption mb-1.5 break-keep text-navy-500">{desc}</p>
      <div className="divide-y divide-navy-50">{children}</div>
    </div>
  )
}
