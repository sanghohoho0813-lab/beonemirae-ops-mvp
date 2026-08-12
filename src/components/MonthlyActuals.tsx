import { FileSpreadsheet } from 'lucide-react'
import type { ClientMonthlyActual } from '../types'
import { useData } from '../context/DataContext'
import { won, weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 엑셀에서 가져온 월 실적
//
//  거래처 관리 엑셀의 「정산금 세부내역」에는 월 합계만 있는 달이 많습니다.
//  날짜를 알 수 없어 수거 기록으로 만들 수 없지만(없는 수거일을 지어내면
//  안 됩니다), 그 달의 수거량과 매출은 회사의 실제 실적입니다.
//
//  그래서 월 단위 그대로 저장하고(0025) 여기서 보여 줍니다. 시스템이 수거
//  기록에서 직접 계산한 값과는 **근거가 다르므로 섞지 않고** 따로 둡니다.
//  화면에도 어느 파일에서 온 값인지 적어, 나중에 숫자가 이상하면 원본을
//  찾아갈 수 있게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 어느 화면에 놓이는지 — 안내 문구만 달라집니다 */
type Purpose = 'settlement' | 'report' | 'billing'

const NOTE: Record<Purpose, string> = {
  settlement:
    '아래 달들은 엑셀에 월 합계만 있어 수거 기록으로 만들지 않았습니다. 금액은 엑셀에 적힌 그대로입니다.',
  report:
    '아래 달들은 엑셀에서 옮겨 온 월 실적입니다. 날짜별 기록이 없어 월간 리포트는 만들지 못하지만, 수거량·매출은 그대로 확인하실 수 있습니다.',
  billing:
    '아래 달들은 엑셀에 적힌 매출입니다. 어느 달이 입금됐는지는 파일에 없어 청구·미수금으로 만들지 않았습니다 — 대표님이 확인하신 뒤 잡아 주세요.',
}

export function MonthlyActuals({
  rows,
  purpose,
  showMoney = true,
}: {
  rows: ClientMonthlyActual[]
  purpose: Purpose
  showMoney?: boolean
}) {
  const { data } = useData()
  if (rows.length === 0) return null
  const sorted = rows.slice().sort((a, b) => b.month.localeCompare(a.month))

  //  「날짜별 기록 있음」은 저장된 표시가 아니라 **지금 DB 상태**로 판정합니다.
  //  가져올 당시에는 없던 달에 나중에 현장 입력이 들어올 수 있고, 그때 저장된
  //  표시는 그대로라 화면이 틀린 말을 하게 됩니다.
  const clientId = sorted[0]?.clientId
  const datedMonths = new Set(
    data.schedules
      .filter((s) => s.clientId === clientId && s.status === '완료' && s.actualAmount != null)
      .map((s) => s.date.slice(0, 7)),
  )
  //  파일 이름은 보통 하나입니다. 여러 개면 전부 적습니다.
  const files = [...new Set(sorted.map((r) => r.sourceFile).filter(Boolean))]

  const totalKg = sorted.reduce((s, r) => s + r.medicalKg + r.diaperKg, 0)
  const totalRevenue = sorted.reduce((s, r) => s + r.revenue, 0)

  return (
    <section data-monthly-actuals className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
          <FileSpreadsheet size={18} strokeWidth={2.3} />
        </span>
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">엑셀에서 가져온 월 실적</p>
        <span className="pill shrink-0 bg-navy-50 text-navy-500">{sorted.length}개월</span>
      </div>
      <p className="t-muted mt-2 break-keep">{NOTE[purpose]}</p>

      <div className="-mx-4 mt-3 overflow-x-auto px-4">
        <table className="w-full min-w-[30rem] border-collapse text-[1rem]">
          <thead>
            <tr className="bg-navy-50 text-navy-500">
              <th className="px-2.5 py-2 text-left font-bold">달</th>
              <th className="px-2.5 py-2 text-right font-bold">의료폐기물</th>
              <th className="px-2.5 py-2 text-right font-bold">일회용기저귀</th>
              {showMoney && <th className="px-2.5 py-2 text-right font-bold">매출</th>}
              <th className="px-2.5 py-2 text-left font-bold">비고</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.month} data-actual-month={r.month} className="border-b border-navy-100">
                <td className="whitespace-nowrap px-2.5 py-2 font-bold text-navy-800">{r.month}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {r.medicalKg > 0 ? weight(r.medicalKg) : '—'}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {r.diaperKg > 0 ? weight(r.diaperKg) : '—'}
                </td>
                {showMoney && (
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums text-navy-900">{won(r.revenue)}</td>
                )}
                <td className="px-2.5 py-2 text-left">
                  {/*  날짜별 기록이 함께 있는 달인지 밝힙니다. 있는 달은 시스템이
                       계산한 정산·명세서가 따로 있고, 그쪽이 근거가 더 낫습니다. */}
                  {datedMonths.has(r.month) ? (
                    <span className="t-muted text-teal-700">날짜별 기록 있음</span>
                  ) : (
                    <span className="t-muted text-navy-400">월 합계만</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-navy-50/60 font-extrabold text-navy-900">
              <td className="px-2.5 py-2">합계</td>
              <td colSpan={2} className="px-2.5 py-2 text-right tabular-nums">
                {weight(totalKg)}
              </td>
              {showMoney && <td className="px-2.5 py-2 text-right tabular-nums">{won(totalRevenue)}</td>}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {files.length > 0 && (
        <p className="t-muted mt-2.5 break-all text-navy-400">출처 · {files.join(' · ')}</p>
      )}
    </section>
  )
}
