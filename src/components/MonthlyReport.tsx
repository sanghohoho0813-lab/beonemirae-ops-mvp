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
import { PlannedBadge, ExpandableSection } from './ui'

// ─────────────────────────────────────────────────────────────────────────────
// 병원별 월간 운영 리포트 — 병원에 제공하는 형태의 미리보기
//  상단 핵심 4개 → 유형·다음 수거·교육 → 특이사항 순으로 정리하고,
//  세부 공급 내역은 접기로 분리해 한 화면의 정보량을 줄였습니다.
//  PDF 자동 생성 / 이메일 자동 발송은 '개발 예정'입니다.
// ─────────────────────────────────────────────────────────────────────────────

function changeStyle(pct: number) {
  if (pct === 0) return { icon: Minus, cls: 'text-navy-500' }
  return pct > 0 ? { icon: TrendingUp, cls: 'text-teal-600' } : { icon: TrendingDown, cls: 'text-amber-700' }
}

/** 리포트 상단 핵심 지표 1칸 */
function Stat({
  icon: Icon,
  label,
  value,
  sub,
  valueClass = 'text-navy-900',
}: {
  icon: typeof Scale
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="kpi-box rounded-2xl bg-navy-50 p-4">
      <p className="flex items-center gap-1.5 break-keep text-[1rem] font-bold leading-snug text-navy-400">
        <Icon size={15} className="shrink-0" /> {label}
      </p>
      {/* 값은 칸 폭에 맞춰 자동 축소 — '1.1톤'·'+25%' 가 칸 밖으로 나가지 않게 */}
      <p className={`t-stat mt-2 ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1.5 break-keep text-[1.03rem] leading-snug text-navy-400">{sub}</p>}
    </div>
  )
}

export function MonthlyReportView({ report }: { report: MonthlyReport; compact?: boolean }) {
  const [year, month] = report.month.split('-')
  const cmpLabel = report.partialMonth ? '전월 동기 대비' : '전월 대비'
  const ch = changeStyle(report.changePct)
  const supplyTotal = report.supplies.reduce((s, x) => s + x.count, 0)

  return (
    <div className="card overflow-hidden">
      {/* 헤더 — 병원명 + 이번 달 총 수거량 */}
      <div className="bg-navy-900 px-5 py-6 text-white sm:px-7">
        <p className="text-[1rem] font-bold tracking-wider text-teal-300">
          {year}년 {Number(month)}월 운영 리포트
        </p>
        <h3 className="mt-1.5 break-keep text-[1.62rem] font-extrabold leading-tight tracking-tight sm:text-[1.9rem]">
          {report.client.name}
        </h3>
        <p className="mt-1 text-[1.07rem] text-navy-300">{report.client.type} · 수거주기 {report.client.collectionCycle}</p>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        {/* 핵심 4개 */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Scale} label="총 수거량" value={weight(report.totalKg)} />
          <Stat icon={Repeat} label="수거 횟수" value={`${report.visits}회`} />
          <Stat icon={Package} label="자재 공급" value={`${supplyTotal}개`} />
          <Stat
            icon={ch.icon}
            label={cmpLabel}
            value={`${report.changePct > 0 ? '+' : ''}${report.changePct}%`}
            sub={`${report.partialMonth ? '전월 동기' : '전월'} ${weight(report.prevKg)}`}
            valueClass={ch.cls}
          />
        </div>

        {/* 폐기물 유형 */}
        <section>
          <h4 className="mb-2.5 text-[1.15rem] font-bold text-navy-700">폐기물 유형</h4>
          {report.byWaste.length === 0 ? (
            <p className="rounded-2xl bg-navy-50 px-4 py-3.5 text-[1.12rem] text-navy-400">
              이번 달 완료된 수거 내역이 없습니다.
            </p>
          ) : (
            <div className="space-y-1.5">
              {report.byWaste.map((w) => (
                <div key={w.type} className="flex items-center gap-3 rounded-2xl bg-navy-50 px-4 py-3.5">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${
                      w.type === '의료폐기물' ? 'bg-teal-500' : 'bg-slate2-500'
                    }`}
                  />
                  <p className="min-w-0 flex-1 break-keep text-[1.12rem] font-bold leading-snug text-navy-700">{w.type}</p>
                  <p className="min-w-0 break-keep text-right text-[1.12rem] font-extrabold text-navy-900">
                    {weight(w.kg)}
                    <span className="ml-1.5 inline-block text-[0.9rem] font-semibold text-navy-400">{w.count}회</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 다음 수거 · 긴급 · 교육 */}
        {/*  ⚠ 0082 — `sm:grid-cols-3` 이었습니다. 여기서 `sm:` 은 **화면 폭**을
             봅니다. 그런데 이 리포트는 /reports 에서 오른쪽 좁은 칸(379px)
             안에 들어갑니다. 화면은 1280px 이니 3열이 되고, 한 칸이 98px 이
             되어 아이콘을 빼면 글자 자리가 30px — 「다음 수거 예상」이
             한 글자씩 세로로 6줄이 됐습니다.
             화면 폭이 아니라 **자기가 놓인 칸**을 기준으로 접히도록
             flex-wrap 으로 바꿉니다. 라이브러리를 더하지 않습니다. */}
        <div className="flex flex-wrap gap-2.5 [&>*]:min-w-[13rem] [&>*]:flex-1">
          <div className="flex items-center gap-3 rounded-2xl bg-navy-50 px-4 py-3.5">
            <CalendarClock size={19} className="shrink-0 text-navy-400" />
            <div className="min-w-0">
              <p className="text-[1rem] font-bold text-navy-400">다음 수거 예상</p>
              <p className="break-keep text-[1.12rem] font-extrabold text-navy-900">
                {report.nextPredicted ? report.nextPredicted.slice(5).replace('-', '/') : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-navy-50 px-4 py-3.5">
            <AlertTriangle size={19} className="shrink-0 text-navy-400" />
            <div className="min-w-0">
              <p className="text-[1rem] font-bold text-navy-400">긴급수거</p>
              <p className="break-keep text-[1.12rem] font-extrabold text-navy-900">
                {report.urgentCount > 0 ? `${report.urgentCount}건` : '없음'}
              </p>
            </div>
          </div>
          <div
            className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 ${
              report.education.needed ? 'bg-amber-50' : 'bg-navy-50'
            }`}
          >
            <GraduationCap size={19} className={`shrink-0 ${report.education.needed ? 'text-amber-700' : 'text-navy-400'}`} />
            <div className="min-w-0">
              <p className={`text-[1rem] font-bold ${report.education.needed ? 'text-amber-700' : 'text-navy-400'}`}>
                배출자 교육
              </p>
              {/*  ⚠ 교육일을 안 적어 뒀으면 「정상」이 아닙니다 — **모르는**
                   것입니다. 예전에는 거래처 id 를 해시해 개월 수를 지어내고
                   그 위에서 「정상 / 임박」을 단정했습니다(0060). */}
              <p data-edu-state className="break-keep text-[1.12rem] font-extrabold leading-snug text-navy-900">
                {!report.education.known
                  ? '교육일 미입력'
                  : report.education.needed
                    ? '주기 도래 임박'
                    : '정상'}
              </p>
              {!report.education.known && (
                <p className="t-muted mt-0.5 break-keep text-navy-400">
                  거래처 정보에 마지막 교육일을 넣으면 계산합니다
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 관리 특이사항 */}
        <section>
          <h4 className="mb-2.5 text-[1.15rem] font-bold text-navy-700">관리 특이사항</h4>
          <ul className="space-y-1.5">
            {report.notes.map((n) => (
              <li
                key={n}
                className="flex items-start gap-2.5 rounded-2xl bg-navy-50 px-4 py-3 text-[1.12rem] leading-snug text-navy-600"
              >
                <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                <span className="min-w-0 break-keep">{n}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 세부 내역 — 접기 */}
        <ExpandableSection label="세부 내역 보기" openLabel="세부 내역 접기">
          <div className="space-y-2">
            <p className="text-[1.07rem] font-bold text-navy-500">자재·소모품 공급 내역</p>
            {report.supplies.length === 0 ? (
              <p className="rounded-2xl bg-navy-50 px-4 py-3 text-[1.07rem] text-navy-400">
                이번 달 공급 내역이 없습니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {report.supplies.map((s) => (
                  <span
                    key={s.type}
                    className="break-keep rounded-xl bg-navy-50 px-3.5 py-2.5 text-[1.07rem] font-semibold text-navy-600"
                  >
                    {s.type} <span className="font-extrabold text-navy-900">{s.count}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="pt-1 text-[1rem] text-navy-400">
              배출자 교육 이력은 시연용 파생값이며, 실제 적용 시 교육 이력 데이터와 연동됩니다.
            </p>
          </div>
        </ExpandableSection>

        {/* 발송 — 개발 예정 */}
        <div className="border-t border-navy-100 pt-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <button disabled className="btn-ghost flex-1 cursor-not-allowed opacity-60">
              <FileDown size={18} strokeWidth={2.4} /> PDF 내보내기
            </button>
            <button disabled className="btn-ghost flex-1 cursor-not-allowed opacity-60">
              <Mail size={18} strokeWidth={2.4} /> 병원 담당자 발송
            </button>
            <PlannedBadge />
          </div>
          <p className="mt-2.5 break-keep text-[1rem] leading-snug text-navy-400">
            현재는 화면 미리보기까지 제공합니다. PDF 자동 생성·이메일 발송은 개발 예정입니다.
          </p>
        </div>
      </div>
    </div>
  )
}
