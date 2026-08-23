import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, History, Loader2, Wrench } from 'lucide-react'
import { Modal } from './Modal'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { STOCK_KEYS } from '../lib/collection'
import { correctStock, stockLedger, type StockMove } from '../lib/repo'
import type { OfficeStock } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 최근 재고 변동 + 정정 (0074)
//
//  대표님 말씀: 「단순히 현재재고 숫자를 몰래 덮어쓰는 방식보다, 최근 재고
//  변동이력에서 무엇 때문에 숫자가 바뀌었는지 확인하고 정정할 수 있는 구조」.
//
//  ⚠ material_transactions 는 지금까지 **쓰기만 하고 한 번도 읽지 않았습니다.**
//    입고도 공급도 취소도 전부 이 표에 쌓여 있었는데 보여 주는 화면이
//    없어서, 「재고가 왜 이 숫자지」에 답할 방법이 없었습니다.
//
//  ⚠ 정정은 숫자를 덮어쓰지 않습니다. 「조정 −1 · 입고 오류 정정」처럼
//    **이유가 붙은 한 줄**을 더하고, 재고는 그만큼만 움직입니다.
// ─────────────────────────────────────────────────────────────────────────────

const LABEL = Object.fromEntries(STOCK_KEYS.map((k) => [k.key, k.label])) as Record<string, string>

//  왜 바뀌었는지 한눈에 — 색은 방향(들어옴/나감)이 아니라 **종류**를 말합니다.
const KIND_TONE: Record<StockMove['kind'], string> = {
  입고: 'bg-teal-50 text-teal-700',
  공급: 'bg-navy-100 text-navy-600',
  조정: 'bg-amber-50 text-amber-800',
  취소: 'bg-sky-50 text-sky-700',
}

export function StockLedger() {
  const { data, reload } = useData()
  const { role, mode } = useAuth()
  const staff = role === 'admin' || role === 'office'
  const canCorrect = useSchemaAtLeast(74) === true && staff && mode === 'live'

  const [rows, setRows] = useState<StockMove[] | null>(null)
  const [fix, setFix] = useState<keyof OfficeStock | null>(null)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (mode !== 'live' || !staff) return
    stockLedger(30)
      .then(setRows)
      .catch(() => setRows([]))
  }, [mode, staff])

  useEffect(load, [load])

  if (mode !== 'live' || !staff) return null

  const stock = data.officeStock
  const n = Number(qty)
  const after = fix ? stock[fix] + (Number.isFinite(n) ? n : 0) : 0
  //  ⚠ 있는 것보다 많이 빼는 것은 **누르기 전에** 막습니다. 서버도 막지만
  //    (0074), 눌러 보고 나서 빨간 글자를 읽게 하는 것은 한 번 더 하는 일입니다.
  const ready = fix !== null && Number.isInteger(n) && n !== 0 && reason.trim().length > 0 && after >= 0

  async function save() {
    if (!fix || !ready) return
    setBusy(true)
    setError('')
    try {
      await correctStock(fix, n, reason.trim())
      await reload()
      load()
      setFix(null)
      setQty('')
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '바로잡지 못했습니다.')
    }
    setBusy(false)
  }

  return (
    <div data-stock-ledger className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <History size={18} strokeWidth={2.4} className="shrink-0 text-navy-500" />
        <p className="text-[1.08rem] font-extrabold text-navy-900">최근 재고 변동</p>
        <p className="t-caption break-keep text-navy-500">숫자가 왜 바뀌었는지</p>
        {canCorrect && (
          <button
            data-stock-fix-open
            onClick={() => { setFix('corrugatedBox'); setError('') }}
            className="ml-auto flex min-h-[2.5rem] items-center gap-1.5 rounded-xl bg-amber-50 px-3 text-[1rem] font-extrabold text-amber-800 transition active:scale-95"
          >
            <Wrench size={15} strokeWidth={2.5} /> 숫자 바로잡기
          </button>
        )}
      </div>

      {rows === null ? (
        <p className="t-caption mt-2 text-navy-400">불러오는 중입니다…</p>
      ) : rows.length === 0 ? (
        //  ⚠ 「없다」와 「못 읽었다」를 구분해 적습니다.
        <p data-stock-ledger-empty className="t-body mt-2 break-keep text-navy-500">
          아직 변동 기록이 없습니다. 입고하거나 수거하면서 자재를 드리면 여기에 쌓입니다.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              data-stock-move={r.id}
              className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-2xl bg-navy-50 px-3.5 py-2.5"
            >
              <span className={`pill shrink-0 ${KIND_TONE[r.kind]}`}>{r.kind}</span>
              <span className="break-keep text-[1.05rem] font-bold text-navy-900">
                {LABEL[r.item] ?? r.item}
              </span>
              <span
                data-stock-move-qty
                className={`shrink-0 tabular-nums text-[1.12rem] font-extrabold ${
                  r.qty > 0 ? 'text-teal-700' : 'text-navy-700'
                }`}
              >
                {r.qty > 0 ? '+' : ''}
                {r.qty}
              </span>
              {r.clientName && <span className="t-caption break-keep text-navy-600">{r.clientName}</span>}
              <span className="t-caption ml-auto shrink-0 tabular-nums text-navy-400">
                {r.at.slice(5, 10).replace('-', '/')} {new Date(r.at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}
              </span>
              {r.memo && (
                <span className="t-caption w-full basis-full break-keep text-navy-600">{r.memo}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={fix !== null}
        title="재고 숫자 바로잡기"
        onClose={() => setFix(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setFix(null)} disabled={busy}>
              닫기
            </button>
            <button
              data-stock-fix-go
              className="btn-primary flex-1 disabled:opacity-50"
              disabled={!ready || busy}
              onClick={() => void save()}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Wrench size={17} strokeWidth={2.5} />}
              이대로 바로잡기
            </button>
          </>
        }
      >
        <p className="t-body break-keep leading-relaxed text-navy-600">
          숫자를 <b className="text-navy-800">덮어쓰지 않습니다.</b> 「조정 −1 · 입고 오류 정정」처럼
          이유가 붙은 한 줄이 남고, 재고는 그만큼만 움직입니다.
        </p>

        <div className="mt-3">
          <label className="field-label">어떤 품목인가요?</label>
          <div className="grid grid-cols-2 gap-2">
            {STOCK_KEYS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                data-stock-fix-item={key}
                onClick={() => setFix(key)}
                className={`min-h-[3rem] break-keep rounded-2xl px-2 text-[1.02rem] font-extrabold transition active:scale-[0.98] ${
                  fix === key ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'
                }`}
              >
                {label}
                <span className={`block text-[0.95rem] font-bold ${fix === key ? 'text-navy-200' : 'text-navy-500'}`}>
                  지금 {stock[key]}개
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="field-label">몇 개를 더하거나 뺄까요?</label>
          <input
            data-stock-fix-qty
            type="number"
            inputMode="numeric"
            className="field-input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="예: -1  (11개로 잘못 적었으면)"
          />
          {/*  ⚠ 결과를 미리 보여 줍니다. 「−1 을 넣으면 몇 개가 되지」를
               머릿속으로 계산하게 하지 않습니다. */}
          {fix && Number.isFinite(n) && n !== 0 && (
            <p data-stock-fix-preview className="t-body mt-1.5 tabular-nums break-keep text-navy-600">
              {LABEL[fix]} <b className="text-navy-900">{stock[fix]}</b> →{' '}
              <b className={after < 0 ? 'text-rose-600' : 'text-teal-700'}>{after}</b>개
              {after < 0 && <span className="ml-1 font-bold text-rose-600">— 있는 것보다 많이 뺄 수 없습니다</span>}
            </p>
          )}
        </div>

        <div className="mt-3">
          <label className="field-label">
            왜 바로잡나요? <span className="text-rose-600">*</span>
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {['입고 수량을 잘못 적었습니다', '창고를 세어 보니 달랐습니다', '파손·폐기했습니다'].map((q) => (
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
            data-stock-fix-reason
            className="input"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="직접 적으셔도 됩니다"
          />
        </div>

        {error && (
          <p data-stock-fix-error className="mt-3 flex items-start gap-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.02rem] font-bold text-rose-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" strokeWidth={2.3} /> {error}
          </p>
        )}
      </Modal>
    </div>
  )
}
