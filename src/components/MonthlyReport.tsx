import {
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  AlertTriangle,
  GraduationCap,
  CalendarClock,
  FileDown,
  Mail,
  Scale,
  Repeat,
} from 'lucide-react'
import type { MonthlyReport } from '../lib/insights'
import { weight } from '../lib/format'
import { PlannedBadge } from './ui'

// ─────────────────────────────────────────────────────────────────────────────
// 병원별 월간 운영 리포트 — 병원에 제공하는 형태의 미리보기
//  · 현재는 화면 미리보기까지 구현되어 있습니다.
//  · PDF 자동 생성 / 이메일 자동 발송은 '개발 예정'으로 명확히 구분합니다.
// ─────────────────────────────────────────────────────────────────────────────

function ChangeChip({ pct, partial }: { pct: number; partial: boolean }) {
  const base = partial ? '전월 동기 대비' : '전월 대비'
  if (pct === 0) {
    return (
      <span className="pill bg-navy-100 text-navy-500">
        <Minus size={12} strokeWidth={3} /> {base} 동일
      </span>
    )
  }
  const up = pct > 0
  return (
    <span className={`pill ${up ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-600'}`}>
      {up ? <TrendingUp size={12} strokeWidth={3} /> : <TrendingDown size={12} strokeWidth={3} />}
      {base} {up ? '+' : ''}
      {pct}%
    </span>
  )
}

export function MonthlyReportView({ report, compact = false }: { report: MonthlyReport; compact?: boolean }) {
  const [year, month] = report.month.split('-')

  return (
    <div className="card overflow-hidden">
      {/* 리포트 헤더 */}
      <div className="bg-navy-900 px-5 py-4 text-white sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold tracking-wider text-teal-300">MONTHLY OPERATION REPORT</p>
            <h3 className="mt-1 truncate text-lg font-extrabold tracking-tight">{report.client.name}</h3>
            <p className="mt-0.5 text-[0.8125rem] text-navy-300">
              {year}년 {Number(month)}월 운영 리포트 · {report.client.type}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-right">
            <p className="text-[0.6875rem] text-navy-300">이번 달 총 수거량</p>
            <p className="text-xl font-extrabold leading-tight">{weight(report.totalKg)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {/* 핵심 수치 */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl bg-navy-50 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-navy-400">
              <Scale size={13} /> 총 수거량
            </p>
            <p className="mt-1.5 whitespace-nowrap text-lg font-extrabold text-navy-900">{weight(report.totalKg)}</p>
            <div className="mt-2">
              <ChangeChip pct={report.changePct} partial={report.partialMonth} />
            </div>
          </div>
          <div className="rounded-2xl bg-navy-50 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-navy-400">
              <Repeat size={13} /> 수거 횟수
            </p>
            <p className="mt-1.5 whitespace-nowrap text-lg font-extrabold text-navy-900">
              {report.visits}
              <span className="ml-0.5 text-sm text-navy-400">회</span>
            </p>
            <p className="mt-2 text-[0.6875rem] text-navy-400">
              {report.partialMonth ? '전월 동기' : '전월'} {weight(report.prevKg)}
            </p>
          </div>
          <div className="rounded-2xl bg-navy-50 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-navy-400">
              <AlertTriangle size={13} /> 긴급수거
            </p>
            <p className="mt-1.5 whitespace-nowrap text-lg font-extrabold text-navy-900">
              {report.urgentCount}
              <span className="ml-0.5 text-sm text-navy-400">건</span>
            </p>
            <p className="mt-2 text-[0.6875rem] text-navy-400">{report.urgentCount > 0 ? '대응 완료' : '해당 없음'}</p>
          </div>
          <div className="rounded-2xl bg-navy-50 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-navy-400">
              <CalendarClock size={13} /> 다음 수거 예상
            </p>
            <p className="mt-1.5 whitespace-nowrap text-lg font-extrabold text-navy-900">
              {report.nextPredicted ? report.nextPredicted.slice(5).replace('-', '/') : '—'}
            </p>
            <p className="mt-2 text-[0.6875rem] text-navy-400">수거주기 {report.client.collectionCycle}</p>
          </div>
        </div>

        {/* 폐기물 유형별 */}
        <section>
          <h4 className="mb-2 text-[0.875rem] font-bold text-navy-700">폐기물 유형별 수거 현황</h4>
          {report.byWaste.length === 0 ? (
            <p className="rounded-2xl bg-navy-50 px-4 py-3 text-sm text-navy-400">이번 달 완료된 수거 내역이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {report.byWaste.map((w) => {
                const pct = report.totalKg > 0 ? Math.round((w.kg / report.totalKg) * 100) : 0
                return (
                  <div key={w.type} className="flex items-center gap-3 rounded-2xl bg-navy-50 px-4 py-3">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        w.type === '의료폐기물' ? 'bg-teal-500' : 'bg-slate2-500'
                      }`}
                    />
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-navy-700">{w.type}</p>
                    <p className="shrink-0 text-sm font-semibold text-navy-500">{w.count}회</p>
                    <p className="shrink-0 whitespace-nowrap text-sm font-extrabold text-navy-900">{weight(w.kg)}</p>
                    <p className="w-10 shrink-0 text-right text-xs font-bold text-navy-400">{pct}%</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 자재·소모품 공급 */}
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[0.875rem] font-bold text-navy-700">
            <Package size={15} className="text-navy-400" /> 자재·소모품 공급
          </h4>
          {report.supplies.length === 0 ? (
            <p className="rounded-2xl bg-navy-50 px-4 py-3 text-sm text-navy-400">이번 달 공급 내역이 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {report.supplies.map((s) => (
                <span key={s.type} className="rounded-xl bg-navy-50 px-3 py-2 text-[0.8125rem] font-semibold text-navy-600">
                  {s.type} <span className="font-extrabold text-navy-900">{s.count}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {!compact && (
          <>
            {/* 배출자 교육 */}
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-[0.875rem] font-bold text-navy-700">
                <GraduationCap size={15} className="text-navy-400" /> 배출자 교육
              </h4>
              <div
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                  report.education.needed ? 'bg-amber-50' : 'bg-navy-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${report.education.needed ? 'text-amber-700' : 'text-navy-700'}`}>
                    최근 교육 {report.education.monthsAgo}개월 전
                  </p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    {report.education.needed
                      ? '법정 주기(2년) 도래 임박 — 교육 일정 안내 권장'
                      : '법정 주기 내 정상 상태입니다'}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-[0.625rem] font-bold text-navy-400">
                  시연 파생값
                </span>
              </div>
            </section>

            {/* 관리 특이사항 */}
            <section>
              <h4 className="mb-2 text-[0.875rem] font-bold text-navy-700">관리 특이사항</h4>
              <ul className="space-y-1.5">
                {report.notes.map((n) => (
                  <li key={n} className="flex items-start gap-2 rounded-2xl bg-navy-50 px-4 py-2.5 text-sm text-navy-600">
                    <span className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {/* 발송 — 개발 예정 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 pt-4">
          <button
            disabled
            title="PDF 자동 생성은 개발 예정입니다"
            className="btn-ghost flex-1 cursor-not-allowed opacity-60"
          >
            <FileDown size={16} strokeWidth={2.4} /> PDF 내보내기
          </button>
          <button
            disabled
            title="이메일 자동 발송은 개발 예정입니다"
            className="btn-ghost flex-1 cursor-not-allowed opacity-60"
          >
            <Mail size={16} strokeWidth={2.4} /> 병원 담당자 발송
          </button>
          <PlannedBadge />
        </div>
        <p className="-mt-3 text-xs text-navy-400">
          현재는 화면 미리보기까지 제공합니다. PDF 자동 생성·이메일 자동 발송은 개발 예정입니다.
        </p>
      </div>
    </div>
  )
}
