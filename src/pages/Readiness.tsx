import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, CircleDashed, CircleAlert, CircleHelp, Printer, ArrowRight,
  ClipboardCheck, Landmark,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { readinessOf, readinessCounts, READY_LABEL, READY_GROUP_LABEL, type ReadyState, type ReadyGroup } from '../lib/readiness'
import { surveyTotals, SURVEY_TASKS, SURVEY_TAKEN_ON } from '../lib/opsSurvey'
import { performanceSummary } from '../lib/performance'
import { breadthLine, BREADTH_RULE_NOTE } from '../lib/evidenceBase'
import { COMPANY_FACTS, FACT_STATUS_LABEL, factsToConfirm } from '../lib/companyFacts'
import { GrowthChain } from '../components/GrowthChain'

// ─────────────────────────────────────────────────────────────────────────────
//  실증 준비 상태 (/readiness) — 0096 「심사 준비도」를 0106 에서 고침
//
//  「합격 점검표」처럼 읽히지 않게 두 갈래로 나눕니다.
//   위:   시스템이 지금 데이터로 확인하는 것 — 채우는 곳으로 가는 단추와 함께
//   아래: 사람이 서류로 확인해야 하는 기업 증빙 — 값과 출처·확인 상태만
//  그리고 인쇄해서 들고 갈 한 장. 모든 숫자는 성과 화면과 같은 함수에서
//  그 자리에서 계산됩니다 — 따로 적어 둔 숫자가 없어 어긋날 수 없습니다.
//
//  ⚠ 점수를 내지 않습니다. 화면 수·코드 줄 수·자동검사 수를 성과 대신
//    내세우지 않습니다. 비어 있으면 비어 있다고 나옵니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_META: Record<ReadyState, { icon: typeof CheckCircle2; chip: string; icls: string }> = {
  ok:      { icon: CheckCircle2, chip: 'bg-emerald-50 text-emerald-700', icls: 'text-emerald-600' },
  partial: { icon: CircleDashed, chip: 'bg-amber-50 text-amber-700',     icls: 'text-amber-600' },
  missing: { icon: CircleAlert,  chip: 'bg-rose-50 text-rose-700',       icls: 'text-rose-600' },
  manual:  { icon: CircleHelp,   chip: 'bg-navy-100 text-navy-600',      icls: 'text-navy-500' },
}

export function Readiness() {
  const { data } = useData()
  const navigate = useNavigate()
  const items = useMemo(() => readinessOf(data), [data])
  const counts = readinessCounts(items)
  const survey = useMemo(() => surveyTotals(), [])
  const perf = useMemo(
    () => performanceSummary(data, 'all', undefined, { changes: data.opsChanges, afterSurvey: data.afterSurvey ?? null }),
    [data],
  )
  const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const groups: ReadyGroup[] = ['system', 'company']
  const toConfirm = factsToConfirm()
  const realClients = data.clients.filter((c) => !c.isDemoGenerated).length

  return (
    <PageShell>
      <PageHeader
        title="실증 준비 상태"
        subtitle="시스템이 지금 데이터로 확인하는 것과, 사람이 서류로 확인해야 하는 것을 가릅니다"
        action={
          <button onClick={() => window.print()} className="btn-ghost shrink-0 print:hidden">
            <Printer size={17} strokeWidth={2.4} /> 브리핑 인쇄
          </button>
        }
      />

      {/* ── 요약 줄 — 점수가 아니라 개수입니다 ── */}
      <div data-ready-counts className="card mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 print:hidden">
        <p className="t-body font-extrabold text-navy-900">
          준비됨 <b className="text-emerald-600">{counts.ok}</b>
          <span className="mx-2 text-navy-200">·</span>채우는 중 <b className="text-amber-600">{counts.partial}</b>
          <span className="mx-2 text-navy-200">·</span>비어 있음 <b className="text-rose-600">{counts.missing}</b>
          <span className="mx-2 text-navy-200">·</span>사람이 확인 <b className="text-navy-500">{counts.manual}</b>
        </p>
        <p className="t-muted min-w-0 break-keep">
          점수는 내지 않습니다. 이 화면은 통과 여부를 매기는 표가 아니라 「지금 무엇을 보여 줄 수 있는가」입니다.
        </p>
      </div>

      {/* ── 항목별 점검 (두 갈래) ── */}
      {groups.map((g) => (
        <section key={g} data-ready-group={g} className="print:hidden">
          <SectionTitle>{READY_GROUP_LABEL[g]}</SectionTitle>
          <div className="grid gap-3">
            {items.filter((it) => it.group === g).map((it) => {
              const m = STATE_META[it.state]
              const Icon = m.icon
              return (
                <div key={it.key} data-ready-item={it.key} data-ready-state={it.state} className="card px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Icon size={20} strokeWidth={2.4} className={`shrink-0 ${m.icls}`} />
                    <p className="t-body min-w-0 flex-1 break-keep font-extrabold text-navy-900">{it.label}</p>
                    <span className={`pill shrink-0 ${m.chip}`}>{READY_LABEL[it.state]}</span>
                    <span data-ready-value className="t-body w-full break-keep tabular-nums font-bold text-navy-700 sm:w-auto sm:max-w-[28rem]">{it.value}</span>
                  </div>
                  <p className="t-muted mt-2 break-keep leading-snug">{it.why}</p>
                  {it.note && <p className="t-muted mt-1 break-keep leading-snug text-navy-400">{it.note}</p>}
                  {it.where && (
                    <button
                      data-ready-go={it.key}
                      onClick={() => navigate(it.where!.to)}
                      className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl bg-navy-50 px-3.5 font-bold text-navy-700 transition hover:bg-navy-100"
                    >
                      {it.where.label} <ArrowRight size={16} strokeWidth={2.6} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {/* ── 대표님이 원본으로 확인해 주실 것 ── */}
      <section data-ready-confirm className="print:hidden">
        <SectionTitle>대표·이사가 제공해야 하는 서류 · 사실 (짧은 목록)</SectionTitle>
        <div className="card px-5 py-4">
          <ul className="grid gap-1.5">
            {toConfirm.map((f) => (
              <li key={f.key} className="t-body flex flex-wrap items-baseline gap-x-2 break-keep text-navy-700">
                <b className="text-navy-900">{f.label}</b>
                <span className="text-navy-500">— {f.toConfirm}</span>
              </li>
            ))}
            <li className="t-body break-keep text-navy-700">
              <b className="text-navy-900">자재 규격 목록</b> — 합성수지·골판지 실제 규격 이름 (시스템 13종과 다름, 0104 이후 미확정)
            </li>
          </ul>
        </div>
      </section>

      {/* ── 인쇄용 브리핑 한 장 ── */}
      <section data-ready-brief className="mt-8">
        <SectionTitle action={<span className="pill bg-navy-100 text-navy-500 print:hidden">인쇄하면 이 장만 나옵니다</span>}>
          심사 브리핑 — 한 장
        </SectionTitle>
        <div className="card space-y-5 p-6 print:border-0 print:shadow-none">
          <div>
            <p className="flex items-center gap-2 text-[1.15rem] font-extrabold text-navy-900">
              <Landmark size={19} strokeWidth={2.4} className="shrink-0 text-navy-500" />
              ㈜비원미래 — 의료폐기물 수거·운반 AX 실증 현황
            </p>
            <p className="t-muted mt-1">작성 기준 {todayStr} · 모든 숫자는 이 화면을 여는 순간 실데이터에서 계산합니다 · 줄마다 출처와 확인 상태를 적습니다</p>
          </div>

          {/* 1. 회사 사실 — 출처와 확인 상태 */}
          <div>
            <p className="t-body font-extrabold text-navy-800">1. 회사 사실 — 값 옆의 상태가 값만큼 중요합니다</p>
            <table className="mt-2 w-full text-left">
              <tbody>
                {COMPANY_FACTS.map((f) => (
                  <tr key={f.key} data-brief-fact={f.key} className="border-t border-navy-100 align-top">
                    <td className="t-body py-1.5 pr-3 font-bold text-navy-800">{f.label}</td>
                    <td className="t-body py-1.5 pr-3 text-navy-700">{f.value}</td>
                    <td className="t-caption py-1.5 text-navy-500">{FACT_STATUS_LABEL[f.status]} · {f.source}</td>
                  </tr>
                ))}
                <tr className="border-t border-navy-100 align-top">
                  <td className="t-body py-1.5 pr-3 font-bold text-navy-800">시스템 등록 거래처</td>
                  <td className="t-body py-1.5 pr-3 text-navy-700">{realClients}곳</td>
                  <td className="t-caption py-1.5 text-navy-500">시스템 집계 · 대표 전달 「약 53곳」과 별도</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2. 도입 전 — 조사 실측 */}
          <div>
            <p className="t-body font-extrabold text-navy-800">2. 도입 전 실측 (운영이사 업무 조사 · {SURVEY_TAKEN_ON})</p>
            <ul className="t-body mt-1.5 grid gap-1 text-navy-700">
              <li>· 차량 5대 · 주간 방문 {survey.weekVisits}곳 · 주간 이동 {survey.weekKm.toLocaleString()}km</li>
              <li>
                · 사람이 붙잡고 있던 사무업무 하루 {SURVEY_TASKS.reduce((s, t) => s + t.minH, 0)}~
                {Math.round(SURVEY_TASKS.reduce((s, t) => s + t.maxH, 0) * 10) / 10}시간
                (배차 · 일정 · 엑셀 정리, 답변 원문 보존)
              </li>
            </ul>
          </div>

          {/* 3. 도입 후 — 시스템 실측 (지금 값) */}
          <div>
            <p className="t-body font-extrabold text-navy-800">3. 도입 후 실측 — 이 순간의 시스템 값 (성과 화면과 같은 기준)</p>
            <ul className="t-body mt-1.5 grid gap-1 text-navy-700">
              <li data-brief-breadth>· {breadthLine(perf.fieldCount, perf.breadth)}{perf.practiceCount > 0 ? ` · 연습 입력 ${perf.practiceCount}건 제외` : ''}</li>
              <li>· 수거 입력 {perf.collectionCount}건 (실제 현장 {perf.fieldCount}건 · 시연 {perf.demoCount}건) → 1회 입력 → 자동 반영 {perf.autoLink.total}건</li>
              <li>
                · 대표 성과값 상태: {perf.breadthOk
                  ? '내부 표시 기준 충족 (건수·기간·병원·기사·커버리지)'
                  : `실증 중 — 아직 모자란 것: ${perf.breadthGaps.join(' · ')} (부풀리지 않고 「측정 중」으로 표기)`}
              </li>
              <li>· 같은 범위로 견준 개선율 {perf.ready.confirmed}/{perf.ready.total}개 · 측정값 있음 {perf.ready.measured}개 · {perf.confounding.note}</li>
            </ul>
            <p className="t-caption mt-1.5 break-keep text-navy-500">{BREADTH_RULE_NOTE}</p>
          </div>

          {/* 4. 성장 → 병목 → AX → 측정 → 투자 → 목표 */}
          <div>
            <p className="t-body font-extrabold text-navy-800">4. 성장 → 병목 → AX 로 바뀐 업무 → 측정 → 투자 필요 → 다음 목표</p>
            <div className="mt-2">
              <GrowthChain data={data} summary={perf} compact />
            </div>
          </div>

          {/* 5. 준비 항목 표 — 지금 상태 그대로 */}
          <div>
            <p className="t-body font-extrabold text-navy-800">5. 준비 현황 — 비어 있는 것도 그대로 적습니다</p>
            <table className="mt-2 w-full text-left">
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} className="border-t border-navy-100 align-top">
                    <td className="t-body py-1.5 pr-3 font-bold text-navy-800">{it.label}</td>
                    <td className="t-body py-1.5 pr-3 text-navy-600">{it.value}</td>
                    <td className="t-body py-1.5 text-navy-500">{READY_LABEL[it.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 6. 원칙 */}
          <div className="rounded-2xl bg-navy-50 px-4 py-3.5 print:border print:border-navy-200">
            <p className="t-body flex items-start gap-2 break-keep leading-snug text-navy-700">
              <ClipboardCheck size={17} strokeWidth={2.4} className="mt-0.5 shrink-0 text-teal-600" />
              <span>
                이 시스템은 <b>표본이 모자라면 개선율을 내지 않고, 다른 범위끼리 견주지 않으며, 셀 수 없으면 0 이 아니라 「못 셌다」로 표기</b>합니다.
                위 표의 「비어 있음」과 「사람이 확인」은 감춘 것이 아니라 이 원칙의 결과입니다.
              </span>
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
