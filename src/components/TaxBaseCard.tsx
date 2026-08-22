import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, FileCheck2, Minus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { setTaxFilingConfirmed } from '../lib/repo'
import { taxBaseView, growthText, type TaxFiling } from '../lib/taxBase'
import { won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 국세청 신고 기준 매출 — 전년 동기 대비
//
//  이 화면의 다른 숫자는 **이 시스템에 쌓인 것**입니다. 여기 숫자는 회사가
//  실제로 국가에 신고한 과세표준입니다. 둘은 다릅니다 — 시스템은 2025년
//  중반부터 쌓이기 시작했고, 신고 자료는 2023년부터 있습니다.
//
//  대표님이 은행·세무사·투자 대화에서 쓰시는 숫자는 신고 자료 쪽입니다.
//  그래서 두 숫자를 섞지 않고 **따로, 출처를 밝혀서** 보여 줍니다.
//
//  비교는 **반기끼리만** 합니다. 상반기와 하반기를 맞대면 계절과 계약 시점이
//  섞여 「늘었다/줄었다」가 뜻을 잃습니다.
// ─────────────────────────────────────────────────────────────────────────────

const yy = (iso: string | null) => (iso ? iso.replace(/-/g, '.') : '')

function GrowthPill({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="pill bg-navy-50 text-navy-400">비교할 작년 없음</span>
  }
  const up = pct > 0
  const flat = pct === 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`pill inline-flex items-center gap-0.5 ${
        flat ? 'bg-navy-50 text-navy-500' : up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
      }`}
    >
      <Icon size={13} strokeWidth={2.8} />
      {growthText(pct)}
    </span>
  )
}

export function TaxBaseCard() {
  const { data, reload } = useData()
  const { mode, role } = useAuth()
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const filings = (data.taxFilings ?? []) as TaxFiling[]

  //  확정 표시는 **대표님만** 누릅니다. 종이(증명서 발급일)만으로는 확정인지
  //  알 수 없고, 아는 사람이 대표님뿐이기 때문입니다.
  const canConfirm = mode === 'live' && role === 'admin'

  async function mark(id: number, confirmed: boolean) {
    setBusy(id)
    setErr('')
    try {
      await setTaxFilingConfirmed(id, confirmed)
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '바꾸지 못했습니다.')
    }
    setBusy(null)
  }
  const today = useMemo(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }), [])
  const view = useMemo(() => taxBaseView(filings, today), [filings, today])

  //  자료가 없으면 이 칸을 아예 그리지 않습니다 — 없는 일을 만들어 내지 않습니다.
  if (filings.length === 0) return null

  const latest = view.latest
  //  「지금 대표님이 가장 궁금한 것」 — 가장 최근 반기가 작년 같은 반기보다
  //  얼마나 늘었는가. 확정 전이면 그 사실을 함께 적습니다.
  return (
    <div data-tax-base className="card mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-card break-keep font-extrabold text-navy-900">국세청 신고 기준 매출</p>
          <p className="t-muted mt-0.5 break-keep">
            부가가치세 과세표준 — 이 시스템에 쌓인 매출과 별개로, 실제 신고한 값입니다.
          </p>
        </div>
        <span className="pill shrink-0 bg-navy-50 text-navy-500">
          <FileCheck2 size={13} className="mr-0.5 inline -translate-y-px" />
          증명 {yy(view.issuedOn)} 발급
        </span>
      </div>

      {latest && (
        <div data-tax-latest className="mt-3.5 rounded-2xl bg-navy-50 px-4 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="t-body font-extrabold text-navy-900">{latest.label}</span>
            <span className="t-stat tabular-nums text-navy-900">{won(latest.filing.baseTotal)}</span>
            <GrowthPill pct={latest.growthPct} />
          </div>
          <p className="t-caption mt-1.5 break-keep text-navy-600">
            {latest.prev ? (
              <>
                작년 같은 반기 {won(latest.prev.baseTotal)} →{' '}
                <b className="text-navy-900">
                  {latest.diff != null && latest.diff >= 0 ? '+' : ''}
                  {latest.diff != null ? won(latest.diff) : ''}
                </b>
              </>
            ) : (
              '작년 같은 반기 자료가 없어 비교하지 않습니다.'
            )}
          </p>
          {latest.provisional && (
            <p data-tax-provisional className="t-caption mt-1.5 break-keep text-amber-700">
              확정 전입니다 — {latest.provisionalWhy}. 확정 자료가 나오면 같은 기간으로 다시 넣으면 덮어써집니다.
              {canConfirm && (
                <>
                  {' '}
                  <button
                    data-tax-confirm={latest.filing.id}
                    className="font-extrabold underline"
                    disabled={busy === latest.filing.id}
                    onClick={() => void mark(latest.filing.id, true)}
                  >
                    {busy === latest.filing.id ? '바꾸는 중…' : '확정된 값입니다'}
                  </button>
                </>
              )}
            </p>
          )}
          {err && <p className="t-caption mt-1 text-rose-600">{err}</p>}
        </div>
      )}

      {/* 반기별 — 위가 최근 */}
      <div className="mt-3.5 overflow-x-auto">
        <table data-tax-table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-navy-100">
              <th className="t-label py-2 pr-2 font-bold text-navy-500">과세기간</th>
              <th className="t-label py-2 pr-2 text-right font-bold text-navy-500">계</th>
              <th className="t-label py-2 pr-2 text-right font-bold text-navy-500">과세분</th>
              <th className="t-label py-2 pr-2 text-right font-bold text-navy-500">면세분</th>
              <th className="t-label py-2 text-right font-bold text-navy-500">전년 동기</th>
            </tr>
          </thead>
          <tbody>
            {[...view.halves].reverse().map((h) => (
              <tr key={`${h.year}-${h.half}`} data-tax-row={`${h.year}-${h.half}`} className="border-b border-navy-50">
                <td className="py-2 pr-2">
                  <span className="t-cell font-bold text-navy-800">{h.label}</span>
                  {h.provisional && <span className="pill ml-1.5 bg-amber-100 text-amber-700">확정 전</span>}
                  {/*  사람이 확인해 준 것은 그렇게 적습니다 — 다시 되돌릴 수도
                      있어야 합니다(잘못 눌렀을 때 손쓸 방법). */}
                  {h.confirmed && canConfirm && (
                    <button
                      data-tax-unconfirm={h.filing.id}
                      className="pill ml-1.5 bg-emerald-50 text-emerald-700"
                      disabled={busy === h.filing.id}
                      onClick={() => void mark(h.filing.id, false)}
                      title="눌러서 「확정 전」으로 되돌립니다"
                    >
                      확정
                    </button>
                  )}
                  {h.confirmed && !canConfirm && (
                    <span className="pill ml-1.5 bg-emerald-50 text-emerald-700">확정</span>
                  )}
                </td>
                <td className="t-cell py-2 pr-2 text-right font-extrabold tabular-nums text-navy-900">
                  {won(h.filing.baseTotal)}
                </td>
                <td className="t-cell py-2 pr-2 text-right tabular-nums text-navy-600">{won(h.filing.baseTaxed)}</td>
                <td className="t-cell py-2 pr-2 text-right tabular-nums text-navy-600">{won(h.filing.baseExempt)}</td>
                <td className="py-2 text-right">
                  <GrowthPill pct={h.growthPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 연도별 — 두 반기가 다 있는 해만 전년과 비교합니다 */}
      {view.years.length > 1 && (
        <div data-tax-years className="mt-3.5 flex flex-wrap gap-2">
          {view.years.map((y) => (
            <div key={y.year} className="rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-navy-100">
              <p className="t-label text-navy-500">
                {y.year}년{y.halves < 2 ? ' (반기만)' : ''}
              </p>
              <p className="t-cell mt-0.5 font-extrabold tabular-nums text-navy-900">{won(y.total)}</p>
              <div className="mt-1">
                <GrowthPill pct={y.growthPct} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="t-muted mt-3 break-keep">
        면세분이 큰 것은 정상입니다 — <b className="text-navy-600">의료폐기물 수집·운반은 면세</b>입니다. 계 = 과세분 +
        면세분이며, 과세분만 매출로 읽으면 회사 규모를 실제보다 훨씬 작게 보게 됩니다. 증명번호 {view.sourceNo}.
      </p>
    </div>
  )
}
