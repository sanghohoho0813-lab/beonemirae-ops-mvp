import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Printer, ReceiptText } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { PageShell, SectionTitle, ExpandableSection, PrimaryButton, SecondaryButton, EmptyState } from '../components/ui'
import { monthClose, recentMonths } from '../lib/monthClose'
import { confirmedInvoices, InvoiceBatch } from '../components/InvoiceBatch'
import { TaxInvoicePanel } from '../components/TaxInvoicePanel'
import { thisMonth, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 월말 청구
//
//  거래처 화면에서 한 곳씩 누르던 청구 확정을, 그 달 전체를 한 화면에서
//  보고 한 번에 합니다.
//
//  화면이 지키는 것
//   · 확정 전에 거래처마다 얼마·무엇으로·정기/추가인지 전부 보여 줍니다
//   · 기본 단가로 계산된 거래처는 체크를 꺼 두고 이유를 적습니다
//   · 확정한 금액과 명세서는 그 순간 그대로 굳습니다 (나중에 단가를 바꿔도)
//   · 이미 확정한 것은 목록에서 빠지고, 그 사실을 따로 적습니다
// ─────────────────────────────────────────────────────────────────────────────

export function MonthClose() {
  const { data, confirmBilling, reload, sync } = useData()
  //  월말 정산은 보통 달이 끝난 뒤에 합니다 — 지난달을 먼저 보여 줍니다.
  const months = useMemo(() => recentMonths(thisMonth()), [])
  const [month, setMonth] = useState(months[1] ?? months[0])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ ok: number; amount: number; failed: { name: string; error: string }[] } | null>(null)

  const close = useMemo(() => monthClose(data, month), [data, month])
  //  확정한 청구의 명세서 — 병원에 보낼 문서입니다.
  const invoices = useMemo(() => confirmedInvoices(data, month), [data, month])
  const [batchOpen, setBatchOpen] = useState(false)

  //  기본 단가가 섞인 곳은 처음부터 꺼 둡니다. 그 상태를 이 달 목록에
  //  맞춰 계산합니다 (달을 바꾸면 다시 판단합니다).
  const defaultOff = useMemo(
    () =>
      new Set(
        close.ready
          .filter((r) => r.defaultPriced.length > 0 || r.oddAmounts.length > 0)
          .map((r) => r.clientId),
      ),
    [close.ready],
  )
  const [touched, setTouched] = useState<string>('')
  const excluded = touched === month ? off : defaultOff

  const setExcluded = (next: Set<string>) => {
    setTouched(month)
    setOff(next)
  }
  const toggle = (id: string) => {
    const next = new Set(excluded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExcluded(next)
  }

  const picked = close.ready.filter((r) => !excluded.has(r.clientId))
  const pickedTotal = picked.reduce((s, r) => s + r.amount, 0)

  const run = async () => {
    if (
      !window.confirm(
        `${month.replace('-', '년 ')}월 청구 확정\n` +
          `거래처 ${picked.length}곳 · 합계 ${won(pickedTotal)}\n\n` +
          '확정하면 금액과 거래명세서가 그대로 고정됩니다. 이후 단가를 바꾸거나 ' +
          '수거가 더 들어와도 이 청구는 바뀌지 않습니다. 진행할까요?',
      )
    ) {
      return
    }
    setBusy(true)
    setProgress(0)
    setResult(null)
    const failed: { name: string; error: string }[] = []
    let okCount = 0
    let amount = 0
    for (const [i, r] of picked.entries()) {
      //  건마다 전체를 다시 읽지 않습니다 — 아래에서 한 번만 읽습니다.
      const res = await confirmBilling(r.clientId, month, { quiet: true })
      if (res.ok) {
        okCount++
        amount += r.amount
      } else {
        failed.push({ name: r.clientName, error: res.error ?? '알 수 없는 오류' })
      }
      setProgress(i + 1)
    }
    await reload()
    setBusy(false)
    setResult({ ok: okCount, amount, failed })
  }

  return (
    <PageShell>
      <div data-close-page>
        <PageHeader title="월말 청구" subtitle="그 달 전체를 한 번에 확인하고 청구로 확정합니다" />
      </div>

      <div className="card flex gap-3 p-4 sm:p-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500">
          <Info size={18} />
        </span>
        <div className="min-w-0 space-y-2 text-[1.05rem] leading-relaxed text-navy-600">
          <p>
            확정하면 <b className="text-navy-800">그 순간의 금액과 거래명세서가 그대로 굳습니다.</b> 나중에 단가를 바꿔도
            이미 확정한 청구는 바뀌지 않고, 확정 뒤에 들어온 수거는 「추가 청구」로 따로 잡힙니다.
          </p>
          <p>
            청구가 만들어져야 미수금과 <Link to="/bank" className="font-bold text-navy-800 underline">통장 대사</Link>가
            붙을 곳이 생깁니다 — 돈 흐름의 첫 단추입니다.
          </p>
        </div>
      </div>

      {/* 달 고르기 */}
      <section>
        <SectionTitle>청구할 달</SectionTitle>
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {months.map((m) => (
              <button
                key={m}
                type="button"
                data-close-month={m}
                onClick={() => {
                  setMonth(m)
                  setResult(null)
                  setTouched('')
                }}
                className={`rounded-2xl px-4 py-2.5 text-[1.05rem] font-bold transition ${
                  month === m ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                }`}
              >
                {m.replace('-', '년 ')}월
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5" data-close-summary>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">확정할 거래처</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-900">
            {picked.length}
            <span className="ml-0.5 text-base text-navy-300">곳</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">확정할 금액</p>
          <p className="mt-1.5 text-2xl font-extrabold text-teal-600">{won(pickedTotal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">기본 단가 섞임</p>
          <p className="mt-1.5 text-2xl font-extrabold text-amber-600">
            {close.defaultPricedCount}
            <span className="ml-0.5 text-base text-navy-300">곳</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">평소와 다른 수거량</p>
          <p className="mt-1.5 text-2xl font-extrabold text-rose-500">
            {close.oddAmountCount}
            <span className="ml-0.5 text-base text-navy-300">곳</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[1.03rem] font-semibold text-navy-400">이미 확정·대상 아님</p>
          <p className="mt-1.5 text-2xl font-extrabold text-navy-400">
            {close.skipped.length}
            <span className="ml-0.5 text-base text-navy-300">곳</span>
          </p>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <PrimaryButton onClick={run} disabled={busy || sync.saving || picked.length === 0}>
          <span data-close-confirm>
            {busy ? `확정하는 중… ${progress}/${picked.length}` : `${picked.length}곳 청구 확정하기`}
          </span>
        </PrimaryButton>
        {close.ready.length > 0 && (
          <SecondaryButton
            onClick={() =>
              setExcluded(
                excluded.size === 0 ? new Set(close.ready.map((r) => r.clientId)) : new Set<string>(),
              )
            }
            disabled={busy}
          >
            <span data-close-toggle-all>{excluded.size === 0 ? '전체 해제' : '전체 선택'}</span>
          </SecondaryButton>
        )}
        {close.ready.length === 0 && (
          <p className="break-keep text-[1.03rem] text-navy-400">이 달에 새로 확정할 청구가 없습니다.</p>
        )}
      </div>

      {/*
        확정한 명세서를 한 번에 뽑습니다.

         여기가 없으면 거래처 화면에 하나씩 들어가 달을 고르고 명세서를 열고
         인쇄해야 합니다 — 열여덟 곳이면 열여덟 번입니다. 그래서 거래명세서
         시트가 든 엑셀을 계속 함께 굴리게 됩니다.
      */}
      <div className="card flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <PrimaryButton onClick={() => setBatchOpen(true)} disabled={invoices.length === 0}>
          <span data-close-batch className="flex items-center gap-1.5">
            <Printer size={16} />
            {invoices.length === 0
              ? '보낼 명세서 없음'
              : `확정한 명세서 ${invoices.length}장 한 번에 인쇄`}
          </span>
        </PrimaryButton>
        <p className="min-w-0 flex-1 break-keep text-[1.02rem] text-navy-500">
          {invoices.length === 0
            ? '청구를 확정하면 그때 굳혀 둔 명세서를 여기서 한 번에 뽑을 수 있습니다.'
            : '병원마다 A4 한 장씩 끊어집니다 — 인쇄 창에서 「PDF로 저장」을 고르면 그대로 파일이 됩니다.'}
        </p>
      </div>

      {close.defaultPricedCount > 0 && (
        <div data-close-warn className="card flex gap-3 border-amber-200 bg-amber-50/60 p-4 sm:p-5">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="min-w-0 text-[1.05rem] leading-relaxed text-navy-700">
            <b className="text-amber-700">{close.defaultPricedCount}곳은 거래처 단가가 없어 시스템 기본 단가로 계산됐습니다.</b>{' '}
            그대로 확정하면 추정 금액이 병원에 나가는 청구서가 됩니다. 처음부터 체크를 꺼 두었으니, 단가를 넣거나 금액을
            확인한 뒤 직접 켜 주세요.{' '}
            <Link data-close-pricing-link to="/pricing" className="font-bold text-amber-700 underline underline-offset-2">
              거래처 점검에서 한 번에 확인
            </Link>
          </p>
        </div>
      )}

      {close.oddAmountCount > 0 && (
        <div data-close-odd-warn className="card flex gap-3 border-rose-200 bg-rose-50/60 p-4 sm:p-5">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-500" />
          <p className="min-w-0 text-[1.05rem] leading-relaxed text-navy-700">
            <b className="text-rose-600">{close.oddAmountCount}곳에 평소와 크게 다른 수거량이 섞여 있습니다.</b>{' '}
            현장에서 0 하나를 더 치면 청구액이 열 배가 됩니다. 처음부터 체크를 꺼 두었으니, 수거이력에서 그 날 기록을
            확인한 뒤 직접 켜 주세요. 실제로 그만큼 나온 달이면 그대로 확정하시면 됩니다.
          </p>
        </div>
      )}

      {result && (
        <div data-close-result className="card flex gap-3 border-teal-200 bg-teal-50/60 p-4 sm:p-5">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-600" />
          <div className="min-w-0 text-[1.05rem] leading-relaxed text-navy-700">
            <p className="font-bold text-teal-700">
              {result.ok.toLocaleString('ko-KR')}곳 · {won(result.amount)} 청구를 확정했습니다
            </p>
            {result.failed.length > 0 && (
              <p className="mt-1 text-rose-600">
                {result.failed.length}곳은 실패했습니다 — {result.failed[0].name}: {result.failed[0].error}
              </p>
            )}
            <p className="mt-1 text-navy-500">
              「미수금 관리」에 바로 잡히고, <Link to="/bank" className="font-bold underline">통장 대사</Link>에서 입금을
              붙일 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 확정 대상 */}
      <section>
        <SectionTitle>확정할 청구 {close.ready.length}건</SectionTitle>
        {close.ready.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="이 달에 확정할 청구가 없습니다"
            subtitle="수거 입력이 끝난 달을 골라 주세요. 이미 확정한 달이라면 아래 「이미 확정」에 나옵니다."
          />
        ) : (
          <div className="card divide-y divide-navy-100">
            {close.ready.map((r) => {
              const on = !excluded.has(r.clientId)
              return (
                <label
                  key={r.clientId}
                  data-close-row={r.clientId}
                  className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 p-4"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(r.clientId)}
                    disabled={busy}
                    className="h-5 w-5 shrink-0 accent-navy-700"
                  />
                  <span
                    className={`min-w-0 flex-1 basis-[10rem] break-keep font-bold ${
                      on ? 'text-navy-900' : 'text-navy-300 line-through'
                    }`}
                  >
                    {r.clientName}
                  </span>
                  {r.kind === '추가' && (
                    <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[0.95rem] font-bold text-violet-600">
                      추가 청구 · 이미 {won(r.alreadyBilled)}
                    </span>
                  )}
                  {r.defaultPriced.length > 0 && (
                    <span
                      data-close-default={r.clientId}
                      className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[0.95rem] font-bold text-amber-700"
                    >
                      기본 단가 · {r.defaultPriced.join(', ')}
                    </span>
                  )}
                  {/*
                    평소와 크게 다른 수거량 — 0 하나를 더 치면 청구액이 열
                    배가 됩니다. 여기가 병원에 나가기 전 마지막 자리입니다.
                  */}
                  {r.oddAmounts.length > 0 && (
                    <span
                      data-close-odd={r.clientId}
                      className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-[0.95rem] font-bold text-rose-600"
                    >
                      평소와 다른 수거량 ·{' '}
                      {r.oddAmounts
                        .slice(0, 2)
                        .map((o) => `${o.date.slice(5)} ${Math.round(o.kg).toLocaleString('ko-KR')}kg (평소 ${Math.round(o.median).toLocaleString('ko-KR')}kg)`)
                        .join(' · ')}
                      {r.oddAmounts.length > 2 && ` 외 ${r.oddAmounts.length - 2}건`}
                    </span>
                  )}
                  <span className="break-keep text-[0.98rem] text-navy-400">
                    수거 {r.collections}건 · 공급 {r.supplies}건
                  </span>
                  <span className="shrink-0 tabular-nums text-lg font-extrabold text-navy-900">{won(r.amount)}</span>
                </label>
              )
            })}
          </div>
        )}
      </section>

      {/* 월정액인데 그 달 수거가 없는 곳 — 사람이 봐야 합니다 */}
      {close.needsCheck.length > 0 && (
        <section>
          <SectionTitle>확인이 필요한 거래처 {close.needsCheck.length}곳</SectionTitle>
          <div className="card divide-y divide-navy-100" data-close-check>
            {close.needsCheck.map((r) => (
              <div key={r.clientId} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[0.95rem] font-bold text-amber-700">
                  월정액
                </span>
                <Link
                  to={`/clients/${r.clientId}`}
                  className="min-w-0 flex-1 basis-[10rem] break-keep font-bold text-navy-900 hover:underline"
                >
                  {r.clientName}
                </Link>
                <span className="break-keep text-[0.98rem] text-navy-500">{r.reason}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 break-keep px-1 text-[0.98rem] text-navy-400">
            수거가 한 건이라도 있어야 월정액을 청구합니다 — 계약 전·해지 후의 달에 기본요금이 저절로 나가지 않게 하는
            규칙입니다. 계약서상 받아야 할 달이면 거래처 화면에서 직접 청구해 주세요. 시스템이 대신 판단하지 않습니다.
          </p>
        </section>
      )}

      {/* 대상 아닌 곳 */}
      {close.skipped.length > 0 && (
        <section data-close-skipped-section>
          <SectionTitle>확정하지 않는 거래처 {close.skipped.length}곳</SectionTitle>
          <ExpandableSection label={`${close.skipped.length}곳 보기`}>
            <div className="card divide-y divide-navy-100" data-close-skipped>
              {close.skipped.map((r) => (
                <div key={r.clientId} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5">
                  <span className="min-w-0 flex-1 basis-[10rem] break-keep font-bold text-navy-700">{r.clientName}</span>
                  <span className="break-keep text-[0.98rem] text-navy-500">{r.reason}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </section>
      )}

      {/*  청구 확정 → 거래명세서 → 세금계산서. 순서대로 같은 화면에 둡니다. */}
      <TaxInvoicePanel month={month} />

      {batchOpen && (
        <InvoiceBatch invoices={invoices} month={month} onClose={() => setBatchOpen(false)} />
      )}

      <p className="px-1 text-[0.98rem] text-navy-400">
        확정한 청구는 되돌리지 않고 「취소」로 남깁니다 — 거래처 화면에서 할 수 있습니다. 확정·취소 모두 감사로그에
        남습니다.
      </p>
    </PageShell>
  )
}
