import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Boxes, Check, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { countStockItem, receiveStockItems, stockItems, type StockItem } from '../lib/repo'
import { SUPPLY_ITEMS, itemsOf } from '../lib/billing'
import { STOCK_KEYS } from '../lib/collection'
import { QtyField } from './ui'
import { Modal } from './Modal'

// ─────────────────────────────────────────────────────────────────────────────
// 규격별 재고 — 2L 합성수지 … 기저귀비닐 40L (0079)
//
//  대표님: 「2L 합성수지 ~ 기저귀비닐 40L 까지도 수량을 실시간으로 확인할 수
//  있게 해줘. 지금은 4개밖에 없어서 불편해.」
//
//  ⚠ 왜 4개뿐이었는지는 화면 문제가 아니었습니다. 서버가 숫자를 넉 장만
//    들고 있었습니다. 0079 에서 규격별로 들고 있게 했습니다.
//
//  ⚠ **「모름」과 「0 개」를 절대 같이 그리지 않습니다.** 골판지 480 개가
//    63L 몇 개인지 아무도 모릅니다. 그럴듯하게 나눠 채우면 대표님은 그
//    숫자를 믿고 발주하시게 됩니다. 세기 전에는 「아직 안 세어 봄」입니다.
// ─────────────────────────────────────────────────────────────────────────────

//  규격을 재고 칸으로 묶습니다 — 「이 규격이 어느 칸에서 빠지는가」.
const GROUPS = STOCK_KEYS.map((b) => ({
  ...b,
  items: SUPPLY_ITEMS.filter((i) => i.bucket === b.key),
})).filter((g) => g.items.length > 0)

/** 「쓰는 것만 보기」를 껐는지 — 이 브라우저에 기억합니다 */
const SHOW_ALL_KEY = 'beonemirae-ops:stock-show-all'
/** 최근 이만큼 안에 한 번이라도 나간 규격을 「쓰는 것」으로 봅니다 */
const RECENT_DAYS = 90

export function StockItems() {
  const { role, mode } = useAuth()
  const { data } = useData()
  //  ⚠ 0105 — 이사님: 「골판지 6종·합성수지 6종을 재고에도 다 따로 보여 주면
  //    화면이 너무 복잡해질 것 같아 걱정」. 규격을 **없애지 않고 접습니다** —
  //    최근 90일에 한 번이라도 나간 규격과 세어 둔 규격만 펼치고, 나머지는
  //    「접힘 n개」로 둡니다. 「전부 보기」로 언제든 폅니다.
  //  ⚠ 나간 기록이 하나도 없으면 접지 않습니다 — 무엇을 쓰는지 알 근거가
  //    없는데 접으면 그냥 숨긴 것입니다.
  const recentKeys = (() => {
    const cut = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString().slice(0, 10)
    const keys = new Set<string>()
    for (const m of data.materials ?? []) {
      if (m.date < cut) continue
      for (const [k, n] of Object.entries(itemsOf(m))) if ((n ?? 0) > 0) keys.add(k)
    }
    return keys
  })()
  const hasUsage = recentKeys.size > 0
  const [showAll, setShowAll] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SHOW_ALL_KEY) === '1' } catch { return false }
  })
  const fold = hasUsage && !showAll
  const toggleShowAll = () => setShowAll((v) => {
    try { window.localStorage.setItem(SHOW_ALL_KEY, v ? '0' : '1') } catch { /* 사생활 모드 */ }
    return !v
  })
  const ready = useSchemaAtLeast(79) === true
  const staff = role === 'admin' || role === 'office'

  const [rows, setRows] = useState<StockItem[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  //  세어 넣기
  const [counting, setCounting] = useState<string | null>(null)
  const [countQty, setCountQty] = useState(0)
  const [countWhy, setCountWhy] = useState('')
  //  입고
  const [add, setAdd] = useState<Record<string, number>>({})
  const [memo, setMemo] = useState('')
  const [done, setDone] = useState('')
  const [reqId, setReqId] = useState(() => crypto.randomUUID())

  const load = useCallback(async () => {
    if (!ready) return
    try {
      setRows(await stockItems())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '규격별 재고를 불러오지 못했습니다.')
    }
  }, [ready])

  useEffect(() => { void load() }, [load])

  //  ⚠ 서버가 아직 판 79 가 아니면 **아무것도 그리지 않습니다.** 빈 칸을
  //    0 으로 채워 두면 그게 곧 거짓말입니다.
  if (!ready) return null

  const byItem = new Map((rows ?? []).map((r) => [r.item, r]))
  const unknownCount = (rows ?? []).filter((r) => r.qty == null).length
  const addTotal = Object.values(add).reduce((s, n) => s + (n ?? 0), 0)

  async function doCount() {
    if (!counting) return
    setBusy(true); setError('')
    try {
      await countStockItem(counting, countQty, countWhy.trim())
      await load()
      setCounting(null)
      setCountWhy('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '세어 넣지 못했습니다.')
    }
    setBusy(false)
  }

  async function doReceive() {
    if (addTotal <= 0) return
    setBusy(true); setError('')
    const picked = Object.fromEntries(Object.entries(add).filter(([, n]) => n > 0))
    try {
      await receiveStockItems(picked, memo.trim(), reqId)
      await load()
      setReqId(crypto.randomUUID())
      setDone(
        Object.entries(picked)
          .map(([k, n]) => `${SUPPLY_ITEMS.find((i) => i.key === k)?.label ?? k} +${n}`)
          .join(' · '),
      )
      setAdd({})
      setMemo('')
      window.setTimeout(() => setDone(''), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '입고를 적지 못했습니다.')
    }
    setBusy(false)
  }

  const countingLabel = SUPPLY_ITEMS.find((i) => i.key === counting)?.label ?? ''

  return (
    <section data-spec-stocks className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <Boxes size={18} strokeWidth={2.2} />
        </span>
        <h3 className="t-card min-w-0 flex-1 break-keep text-navy-900">규격별 재고</h3>
        {hasUsage && (
          <button
            data-spec-showall
            aria-pressed={showAll}
            onClick={toggleShowAll}
            className={`flex min-h-[2.5rem] items-center gap-1.5 rounded-xl px-3 text-[1rem] font-bold transition active:scale-95 ${
              showAll ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
            }`}
          >
            {showAll ? '쓰는 것만' : '전부 보기'}
          </button>
        )}
        <button
          data-spec-reload
          onClick={() => void load()}
          className="flex min-h-[2.5rem] items-center gap-1.5 rounded-xl bg-navy-50 px-3 text-[1rem] font-bold text-navy-600 transition active:scale-95"
        >
          <RefreshCw size={15} strokeWidth={2.4} /> 새로 보기
        </button>
      </div>

      {/*  ⚠ 세기 전에는 숫자가 없습니다. 그 이유를 먼저 말해 둡니다 —
           안 그러면 「왜 안 나오지」가 됩니다. */}
      {unknownCount > 0 && (
        <p data-spec-notyet className="mb-3 break-keep rounded-2xl bg-amber-50 px-4 py-3 text-[1.03rem] leading-snug text-amber-800">
          <b>{unknownCount}개 규격은 아직 안 세어 봤습니다.</b> 창고에 있는 골판지 전체 수는
          알지만, 그중 63L 이 몇 개인지는 저장된 적이 없습니다. <b>지어내지 않습니다</b> —
          한 번 세어 넣으시면 그때부터 공급·입고에 맞춰 저절로 따라갑니다.
        </p>
      )}

      {error && (
        <p data-spec-error className="mb-3 flex items-start gap-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.03rem] font-bold text-rose-700">
          <AlertCircle size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {rows == null ? (
        <p className="t-body text-navy-400">규격별 재고를 불러오는 중입니다…</p>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => {
            //  접을 줄: 최근에 안 나갔고 세어 둔 적도 없는 규격
            const hiddenOf = (key: string) => {
              const r = byItem.get(key)
              return fold && !recentKeys.has(key) && (!r || r.qty == null)
            }
            const hiddenN = g.items.filter((it) => hiddenOf(it.key)).length
            //  묶음 합계 — 센 것만 더합니다. 하나라도 안 센 규격이 있으면 「일부 미집계」.
            const known = g.items.map((it) => byItem.get(it.key)?.qty).filter((q): q is number => q != null)
            const total = known.reduce((s, q) => s + q, 0)
            const unknownN = g.items.length - known.length
            return (
            <div key={g.key} data-spec-group={g.key}>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 px-1">
                <p className="text-[1.02rem] font-extrabold text-navy-500">{g.label}</p>
                <span data-spec-total={g.key} className="text-[1rem] font-bold tabular-nums text-navy-700">
                  {known.length > 0 ? `합계 ${total.toLocaleString('ko-KR')}${g.items[0]?.unit ?? ''}` : ''}
                  {unknownN > 0 && (
                    <span className="ml-1 font-medium text-amber-700">
                      {known.length > 0 ? `· ${unknownN}개 규격 미집계` : '아직 안 세어 봄'}
                    </span>
                  )}
                </span>
              </div>
              {/*  ⚠ 0082 — xl 에서 3칸이었습니다. PC 기본 글자를 16px 바닥에
                   맞추자(15.8→17.8px) 한 칸이 248px 로 좁아지면서, 오른쪽의
                   「아직 안 세어 봄」+「세기」가 자리를 다 먹고 **라벨이 7px 로
                   눌려** 「63L 박스」가 한 글자씩 세로로 5줄이 됐습니다.
                   글자를 키우면 칸도 같이 넓어져야 합니다. */}
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.items.map((it) => {
                  const r = byItem.get(it.key)
                  const unknown = !r || r.qty == null
                  return (
                    <li
                      key={it.key}
                      data-spec-stock={it.key}
                      data-spec-folded={hiddenOf(it.key) ? '1' : undefined}
                      className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ${
                        unknown ? 'bg-amber-50' : 'bg-navy-50'
                      }${hiddenOf(it.key) ? ' hidden' : ''}`}
                    >
                      {/*  ⚠ min-w-0 만 두면 0 까지 눌립니다. 「63L 박스」가
                           한 줄로 들어갈 만큼은 반드시 남겨 둡니다. */}
                      <span className="min-w-[5.5rem] flex-1 break-keep text-[1.05rem] font-bold text-navy-800">
                        {it.label}
                      </span>
                      {unknown ? (
                        //  ⚠ 0 이라고 적지 않습니다.
                        <span data-spec-unknown={it.key} className="shrink-0 break-keep text-[1rem] font-extrabold text-amber-700">
                          아직 안 세어 봄
                        </span>
                      ) : (
                        <span data-spec-qty={it.key} className="shrink-0 text-[1.2rem] font-extrabold tabular-nums text-navy-900">
                          {r!.qty!.toLocaleString('ko-KR')}
                          <span className="ml-0.5 text-[0.98rem] font-bold text-navy-400">{it.unit}</span>
                        </span>
                      )}
                      {staff && mode === 'live' && (
                        <button
                          data-spec-count={it.key}
                          onClick={() => { setCounting(it.key); setCountQty(r?.qty ?? 0); setCountWhy(''); setError('') }}
                          className="min-h-[2.5rem] shrink-0 rounded-xl bg-white px-2.5 text-[1rem] font-bold text-navy-600 ring-1 ring-navy-100 transition active:scale-95"
                        >
                          {unknown ? '세기' : '고치기'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {hiddenN > 0 && (
                <p data-spec-hidden={g.key} className="mt-1.5 px-1 text-[0.98rem] font-bold text-navy-400">
                  최근 {RECENT_DAYS}일에 안 나간 규격 {hiddenN}개 접힘 — 위 「전부 보기」로 폅니다
                </p>
              )}
            </div>
            )
          })}
        </div>
      )}

      {/*  ── 규격으로 입고 ────────────────────────────────────────────────
           ⚠ 위 넉 장 카드의 입고는 「골판지 100개」까지만 적을 수 있었습니다.
             그래서 63L 인지 12L 인지는 영영 알 수 없었습니다. */}
      {staff && mode === 'live' && rows != null && (
        <div className="mt-5 border-t border-navy-100 pt-4">
          <p className="mb-2 text-[1.05rem] font-extrabold text-navy-700">창고에 들어온 자재 적기</p>
          <p className="mb-3 break-keep text-[1rem] leading-snug text-navy-500">
            규격으로 적으면 넉 장 카드의 칸 합계도 같이 늘어납니다. <b className="text-navy-700">아직 안 세어 본
            규격은 「모름」 그대로</b> 둡니다 — 들어온 수는 알아도 원래 몇 개였는지는 모르니까요.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {/*  ⚠ QtyField 는 data-* 를 안 받습니다 (TypeScript 는 하이픈이 든
                 이름을 조용히 넘깁니다 — 붙인 줄 알았는데 화면에는 없습니다).
                 그래서 겉을 한 겹 싸서 이름표를 답니다. */}
            {SUPPLY_ITEMS.map((it) => (
              <div key={it.key} data-spec-add={it.key}>
                <QtyField
                  label={it.label}
                  value={add[it.key] ?? 0}
                  onChange={(n) => setAdd((a) => ({ ...a, [it.key]: n }))}
                />
              </div>
            ))}
          </div>
          <input
            data-spec-memo
            className="input mt-3"
            maxLength={200}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="어디서 들어왔는지 (예: 8월 발주분)"
          />
          {done && (
            <p data-spec-done className="mt-2 flex items-center gap-1.5 break-keep text-[1.03rem] font-bold text-teal-700">
              <Check size={16} strokeWidth={2.6} /> {done}
            </p>
          )}
          <button
            data-spec-receive
            disabled={addTotal <= 0 || busy}
            onClick={() => void doReceive()}
            className="btn-primary mt-3 w-full disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : null}
            {addTotal > 0 ? `${addTotal}개 입고로 적기` : '수량을 넣어 주세요'}
          </button>
        </div>
      )}

      {/*  ── 세어 넣기 ────────────────────────────────────────────────────
           ⚠ 더하기가 아니라 **그 수로 정합니다.** 창고에서 센 수입니다. */}
      <Modal
        open={counting !== null}
        title={`${countingLabel} 세어 넣기`}
        onClose={() => setCounting(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setCounting(null)} disabled={busy}>
              그만두기
            </button>
            <button
              data-spec-count-go
              className="btn-primary flex-1 disabled:opacity-50"
              disabled={busy}
              onClick={() => void doCount()}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={17} strokeWidth={2.6} />}
              이 수로 정하기
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="break-keep text-[1.05rem] leading-relaxed text-navy-600">
            창고에서 <b className="text-navy-900">직접 센 수</b>를 적어 주세요. 더하는 것이 아니라
            <b className="text-navy-900"> 그 수로 정해집니다.</b> 누가·언제·얼마에서 얼마로 바꿨는지
            재고 변동에 남습니다.
          </p>
          <div data-spec-count-qty>
            <QtyField label={`${countingLabel} 센 수량`} value={countQty} onChange={setCountQty} />
          </div>
          <div>
            <label className="field-label">왜 세었나요? (안 적으셔도 됩니다)</label>
            <input
              data-spec-count-why
              className="input"
              maxLength={200}
              value={countWhy}
              onChange={(e) => setCountWhy(e.target.value)}
              placeholder="예: 월말 창고 실사"
            />
          </div>
          {error && (
            <p className="break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.03rem] font-bold text-rose-700">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </section>
  )
}
