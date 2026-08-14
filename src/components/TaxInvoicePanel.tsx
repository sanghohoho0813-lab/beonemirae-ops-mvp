import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, FileSpreadsheet } from 'lucide-react'
import { useData } from '../context/DataContext'
import { SectionTitle, ExpandableSection } from './ui'
import { won } from '../lib/format'
import { taxInvoiceList, taxRowsToTsv } from '../lib/taxInvoice'

// ─────────────────────────────────────────────────────────────────────────────
// 세금계산서 발행 자료
//
//  청구를 확정하고 거래명세서를 뽑은 다음 순서가 세금계산서입니다.
//  그 값들 — 사업자등록번호·대표자·업태·종목·이메일 — 이 시스템에 없어서
//  세금계산서용 엑셀을 따로 두고 매달 금액을 옮겨 적었습니다.
//
//  여기서 만드는 것은 홈택스에 붙여 넣는 **참고 표**입니다. 시스템이
//  발행하지 않습니다. 부가세도 자동으로 정하지 않습니다 — 거래처마다
//  「별도/포함/면세」를 사람이 정할 때까지 확인 필요로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

export function TaxInvoicePanel({ month }: { month: string }) {
  const { data } = useData()
  const list = useMemo(() => taxInvoiceList(data, month), [data, month])
  const [copied, setCopied] = useState(false)

  if (list.ready.length === 0 && list.needsCheck.length === 0) return null

  async function copy() {
    const tsv = taxRowsToTsv(list.ready)
    try {
      await navigator.clipboard.writeText(tsv)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      window.alert('자동 복사가 막혀 있습니다. 표를 직접 선택해 복사해 주세요.')
    }
  }

  return (
    <section data-tax className="space-y-2.5">
      <SectionTitle>세금계산서 발행 자료</SectionTitle>

      <div className="card p-5">
        {/*
          폰에서는 세 칸을 나란히 두면 「2,500,000원」이 석 줄로 쪼개져
          읽을 수 없습니다. 좁은 화면에서는 한 줄에 하나씩 눕힙니다.
        */}
        <div className="divide-y divide-navy-100 border-b border-navy-100 pb-3 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:px-2 sm:py-0 sm:text-center">
            <p className="t-label text-navy-500">공급가액</p>
            <p data-tax-supply className="text-[1.15rem] font-extrabold leading-none tabular-nums text-navy-900 sm:mt-1.5 sm:text-[1.6rem]">{won(list.supplyTotal)}</p>
          </div>
          <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:px-2 sm:py-0 sm:text-center">
            <p className="t-label text-navy-500">세액</p>
            <p data-tax-vat className="text-[1.15rem] font-extrabold leading-none tabular-nums text-navy-900 sm:mt-1.5 sm:text-[1.6rem]">{won(list.vatTotal)}</p>
          </div>
          <div className="flex items-baseline justify-between gap-2 py-2 sm:block sm:px-2 sm:py-0 sm:text-center">
            <p className="t-label text-navy-500">합계</p>
            <p data-tax-total className="text-[1.15rem] font-extrabold leading-none tabular-nums text-teal-600 sm:mt-1.5 sm:text-[1.6rem]">
              {won(list.grandTotal)}
            </p>
          </div>
        </div>

        <p className="t-caption mt-3 break-keep">
          발행할 수 있는 {list.ready.length}곳의 합계입니다. 세액은 공급가액의 10%를 원 단위로 반올림한 값이라
          세무대리인 기준과 1원 차이가 날 수 있습니다 — 발행 전에 한 번 보십시오.
        </p>

        {list.ready.length > 0 && (
          <>
            <div className="-mx-1 mt-3 overflow-x-auto">
              <table data-tax-table className="w-full min-w-[46rem] text-left">
                <thead className="t-label text-navy-500">
                  <tr className="border-b border-navy-100">
                    <th className="py-2 pr-2">거래처</th>
                    <th className="py-2 pr-2">사업자등록번호</th>
                    <th className="py-2 pr-2">대표자</th>
                    <th className="py-2 pr-2">이메일</th>
                    <th className="py-2 pr-2 text-right">공급가액</th>
                    <th className="py-2 pr-2 text-right">세액</th>
                    <th className="py-2 text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {list.ready.map((r) => (
                    <tr key={r.paymentId} data-tax-row={r.clientId} className="border-b border-navy-50">
                      <td className="py-2 pr-2 font-bold text-navy-800">{r.clientName}</td>
                      <td className="py-2 pr-2 tabular-nums text-navy-600">{r.bizNo}</td>
                      <td className="py-2 pr-2 text-navy-600">{r.bizCeo || '—'}</td>
                      <td className="py-2 pr-2 text-navy-500">{r.taxEmail || '—'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-navy-800">{won(r.supply ?? 0)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-navy-600">{won(r.vat ?? 0)}</td>
                      <td className="py-2 text-right font-bold tabular-nums text-navy-900">{won(r.total ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end">
              <button data-tax-copy className="btn-ghost" onClick={() => void copy()}>
                <Copy size={16} strokeWidth={2.4} /> {copied ? '복사했습니다' : '엑셀로 복사'}
              </button>
            </div>
          </>
        )}
      </div>

      {/*
        확인이 필요한 것은 금액을 비워 둡니다. 사업자등록번호나 부가세
        방식이 없는 채로 숫자를 만들어 보여 주면, 그 숫자가 그대로
        홈택스에 들어갑니다.
      */}
      {list.needsCheck.length > 0 && (
        <div data-tax-check className="card border-amber-200 bg-amber-50/50 p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <FileSpreadsheet size={19} className="mt-0.5 shrink-0 text-amber-600" strokeWidth={2.5} />
            <div className="min-w-0 flex-1">
              <p className="t-body font-extrabold text-navy-900">
                발행 전에 확인할 거래처 {list.needsCheck.length}곳
              </p>
              <p className="t-caption mt-1 break-keep">
                사업자등록번호와 부가세 처리 방식은 계약서를 보고 사람이 넣어야 합니다. 시스템이 짐작해서 넣으면 틀린
                세금계산서가 나갑니다.{' '}
                <Link data-tax-clients-link to="/pricing" className="font-bold text-amber-700 underline underline-offset-2">
                  거래처 점검에서 한 번에 입력
                </Link>
              </p>
            </div>
          </div>
          <ExpandableSection label={`${list.needsCheck.length}곳 보기`}>
            <div className="divide-y divide-amber-100">
              {list.needsCheck.map((r) => (
                <div key={r.paymentId} data-tax-check-row={r.clientId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-1 basis-[9rem] break-keep font-bold text-navy-800">{r.clientName}</span>
                  <span className="t-caption break-keep text-amber-700">{r.blockers.join(' · ')}</span>
                  <span className="shrink-0 tabular-nums text-navy-500">청구 {won(r.billed)}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </div>
      )}
    </section>
  )
}
