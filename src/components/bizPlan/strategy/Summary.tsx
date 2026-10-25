import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cnt, eok, man, mil, pct, roundNote, ymText, ym } from '../../../lib/bizStrategy'
import { BizPlanError } from '../../../lib/bizPlanApi'
import { usageStats, type UsageMonth } from '../../../lib/bizStrategyApi'
import { Card, KindBadge, Lines, More, StateChip, WarningList, useStrategy } from './ctx'

// ① 핵심 요약 — 전체 매출 전망 · 부문 비교 · 자금 · 생산성 근거 · 아직 정하지 않은 것

export function Summary() {
  const s = useStrategy()
  const { result: r, model: m } = s
  const last = r.years[r.years.length - 1]
  const segs = [
    { k: 'legacy', name: m.segments.legacy, v: last.legacy, tone: 'bg-navy-700' },
    { k: 'saas', name: m.segments.saas, v: last.saas.net, tone: 'bg-teal-500' },
    { k: 'b2b', name: m.segments.b2b, v: last.b2b.revenue, tone: 'bg-violet-500' },
  ]
  const note = roundNote(segs.map((x) => x.v), last.total, 'eok')
  const undecided = m.decisions.filter((d) => s.states[d.key] !== '합의')
  const risks = r.warnings.filter((w) => w.level !== 'info')
  const appSet = ym(m.meta.applicationMonth)
  const pfMonth = ym(s.open.preflight_month)

  return (
    <div className="space-y-4" data-strategy-summary>
      {s.isDecider && (
        <div role="radiogroup" aria-label="보기 기준" className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[0.92rem] font-bold text-navy-500">보기 기준</span>
          {(['agreed', 'mine'] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={s.basis === b} data-view-basis={b} onClick={() => s.setBasis(b)}
              className={`min-h-[40px] rounded-full px-3.5 text-[0.92rem] font-extrabold ${s.basis === b ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200'}`}>
              {b === 'agreed' ? '두 분 합의' : '내 선택'}
            </button>
          ))}
          <span className="text-[0.85rem] text-navy-400">고르지 않은 결정은 추천안으로 미리 계산 · 저장 안 됨</span>
        </div>
      )}

      <Card
        hook="hero"
        title={<>{r.years[r.years.length - 1].year}년 전체 매출 전망</>}
        sub={<>시나리오 「{r.scenario.name}」 기준 · {s.basis === 'mine' ? '내 선택' : '합의된 결정'} + 나머지는 추천안</>}
        right={<KindBadge kind="사업화 목표" />}
      >
        <p data-hero-total className="text-[2.1rem] font-black tabular-nums leading-none text-navy-900 sm:text-[2.6rem]">{eok(last.total)}<span className="ml-1 text-[1.1rem] font-extrabold text-navy-500">원</span></p>
        <p className="break-keep text-[0.95rem] text-navy-600">목표 시뮬레이션입니다. 계약 · 확정 매출이 아닙니다. 기존 사업 {r.base}년 숫자는 결산 전 {m.legacy.baseKind}입니다.</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-navy-100" aria-hidden="true">
          {segs.map((x) => <span key={x.k} className={x.tone} style={{ width: `${last.total > 0 ? (x.v / last.total) * 100 : 0}%` }} />)}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {segs.map((x) => (
            <div key={x.k} data-seg={x.k} className="rounded-2xl bg-navy-50/70 px-2.5 py-2">
              <p className="flex items-center gap-1.5 break-keep text-[0.85rem] font-bold text-navy-500"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${x.tone}`} />{x.name}</p>
              <p className="text-[1.15rem] font-black tabular-nums text-navy-900 sm:text-[1.3rem]">{eok(x.v)}</p>
            </div>
          ))}
        </div>
        {note && <p data-round-note className="text-[0.85rem] text-navy-500">※ {note}</p>}
        <More label="연도별 숫자 보기 (달력 기준 · 신보 차년도 기준)" hook="years">
          <YearTable />
        </More>
      </Card>

      {appSet != null && pfMonth != null && appSet !== pfMonth && (
        <p data-month-mismatch className="rounded-xl bg-amber-50 px-3 py-2 text-[0.95rem] font-bold text-amber-900 ring-1 ring-amber-200">
          접수 예정월이 다릅니다 — 이 화면은 {ymText(appSet)}, 제출 전 점검은 {ymText(pfMonth)}(작성일 칸 · 없으면 이번 달) 기준입니다. 작성일 칸과 접수 예정월을 맞춰 주세요.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card hook="funding" title={`자금 ${eok(r.funding.total)} 배분 요약`} sub={`자금 안: ${r.funding.option?.name ?? '정하지 않음'}`} right={<KindBadge kind="경영진 결정 필요" />}>
          <dl className="grid grid-cols-2 gap-2 text-[0.95rem]">
            <Stat label="보증 검토액" value={r.funding.guarantee === r.funding.guaranteeMax ? eok(r.funding.guarantee) : `${eok(r.funding.guarantee)} ~ ${eok(r.funding.guaranteeMax)}`} hook="guarantee" />
            <Stat label="신보 확인 필요" value={eok(r.funding.byEligibility['신보 확인 필요'])} hook="check" />
            <Stat label="별도 자금 권장" value={eok(r.funding.byEligibility['별도 자금 권장'])} hook="outside" />
            <Stat label="1차년도 사용분" value={eok(r.funding.firstYear)} hook="first" />
          </dl>
          <p className="break-keep text-[0.9rem] text-navy-500">예비예산은 보증 신청금액이 아닙니다. 신보 담당자 확인 없이 모든 항목을 보증금액에 넣지 않습니다.</p>
          <button type="button" className="btn-ghost w-full" onClick={() => s.goSection('decisions', 'd-funding')}>자금배분 결정 보기</button>
        </Card>
        <Productivity />
      </div>

      <Card hook="undecided" title="아직 정하지 않은 것" sub={`결정 ${m.decisions.length - undecided.length}/${m.decisions.length} 합의`}>
        {undecided.length === 0 ? (
          <p className="text-[1rem] font-bold text-teal-700">모든 결정이 합의되었습니다. ⑤ 적용 전 확인에서 사업계획서 반영을 준비합니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {undecided.map((d) => (
              <li key={d.key}>
                <button type="button" data-undecided={d.key} onClick={() => s.goSection('decisions', `d-${d.key}`)} className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-navy-50/70 px-3 py-2 text-left hover:bg-navy-100">
                  <span className="min-w-0 break-keep text-[0.98rem] font-bold text-navy-800">{d.no}. {d.title}</span>
                  <StateChip state={s.states[d.key]} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(m.facts?.length ?? 0) > 0 && (
        <Card hook="facts" title="사실과 목표를 나눠서" sub="모든 문장에 성격을 붙였습니다 — 목표를 확정된 실적처럼 쓰지 않습니다">
          <ul className="space-y-2">
            {m.facts!.map((f) => (
              <li key={f.id} data-fact={f.kind} className="flex flex-col gap-1 rounded-xl bg-navy-50/50 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
                <KindBadge kind={f.kind} small />
                <span className="min-w-0 break-keep text-[0.98rem] text-navy-800">
                  {f.text}
                  {(f.src || f.asOf) && <span className="block text-[0.85rem] text-navy-400">{[f.src, f.asOf].filter(Boolean).join(' · ')}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {risks.length > 0 && (
        <Card hook="risks" title="계산이 알려 주는 위험 · 확인할 것">
          <WarningList items={risks} limit={6} />
          {risks.length > 6 && (
            <More label={`나머지 ${risks.length - 6}개`} hook="risks-more">
              <WarningList items={risks.slice(6)} />
            </More>
          )}
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, hook }: { label: string; value: string; hook?: string }) {
  return (
    <div data-stat={hook} className="rounded-2xl bg-navy-50/70 px-3 py-2">
      <dt className="text-[0.85rem] font-bold text-navy-500">{label}</dt>
      <dd className="text-[1.15rem] font-black tabular-nums text-navy-900">{value}</dd>
    </div>
  )
}

function YearTable() {
  const { result: r, model: m } = useStrategy()
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table data-year-table className="w-full min-w-[30rem] text-[0.92rem] tabular-nums">
          <thead>
            <tr className="text-left text-navy-500">
              <th className="py-1.5 pr-2 font-bold">달력 기준 (1.1~12.31)</th>
              {r.years.map((y) => <th key={y.year} className="px-2 py-1.5 text-right font-bold">{y.year}년</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100 text-navy-800">
            <Row label={m.segments.legacy} vals={r.years.map((y) => eok(y.legacy))} />
            <Row label={m.segments.saas} vals={r.years.map((y) => eok(y.saas.net))} />
            <Row label={m.segments.b2b} vals={r.years.map((y) => eok(y.b2b.revenue))} />
            <Row label="합계" vals={r.years.map((y) => eok(y.total))} strong />
            <Row label="SaaS 연말 · 연평균 유료고객" vals={r.years.map((y) => `${cnt(y.saas.endCustomers, 0)} · ${cnt(y.saas.avgPaying)}곳`)} />
            <Row label="B2B 거래총액(GMV · 매출 아님)" vals={r.years.map((y) => eok(y.b2b.gmv))} muted />
            <Row label="B2B 기여이익" vals={r.years.map((y) => eok(y.b2b.contribution))} />
          </tbody>
        </table>
      </div>
      {r.windows ? (
        <div className="overflow-x-auto">
          <table data-window-table className="w-full min-w-[30rem] text-[0.92rem] tabular-nums">
            <thead>
              <tr className="text-left text-navy-500">
                <th className="py-1.5 pr-2 font-bold">신보 차년도 (백만원)</th>
                {r.windows.map((w) => <th key={w.no} className="px-2 py-1.5 text-right font-bold">{w.no}차 {ymText(w.from)}~{ymText(w.to)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100 text-navy-800">
              <Row label={m.segments.legacy} vals={r.windows.map((w) => String(mil(w.legacy)))} />
              <Row label={m.segments.saas} vals={r.windows.map((w) => String(mil(w.saas)))} />
              <Row label={m.segments.b2b} vals={r.windows.map((w) => String(mil(w.b2b)))} />
              <Row label="합계(부문 합)" vals={r.windows.map((w) => String(mil(w.legacy) + mil(w.saas) + mil(w.b2b)))} strong />
            </tbody>
          </table>
          <p className="mt-1 text-[0.85rem] text-navy-500">신보 1차년도 = 접수월 다음 달부터 12개월 — 달력 연도와 다른 숫자입니다.</p>
        </div>
      ) : (
        <p className="text-[0.92rem] text-amber-800">접수 예정월이 없어 신보 차년도 숫자를 만들지 않았습니다.</p>
      )}
    </div>
  )
}

function Row({ label, vals, strong, muted }: { label: string; vals: string[]; strong?: boolean; muted?: boolean }) {
  return (
    <tr className={strong ? 'font-black text-navy-900' : muted ? 'text-navy-400' : ''}>
      <td className="break-keep py-1.5 pr-2">{label}</td>
      {vals.map((v, i) => <td key={i} className="px-2 py-1.5 text-right">{v}</td>)}
    </tr>
  )
}

function Productivity() {
  const { model: m, result: r } = useStrategy()
  const p = m.productivity
  const pr = r.productivity
  const [usage, setUsage] = useState<{ months: UsageMonth[]; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function load() {
    setBusy(true)
    setErr(null)
    try {
      setUsage(await usageStats(12))
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card hook="productivity" title="AX 도입 뒤 업무 변화" sub={`${p.who} · ${p.task}`} right={<KindBadge kind={p.kind} />}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-navy-50/70 px-3 py-2">
          <p className="text-[0.85rem] font-bold text-navy-500">하루 업무 (전 → 후)</p>
          <p data-prod-minutes className="text-[1.1rem] font-black tabular-nums text-navy-900">{p.beforeMin[0]}~{p.beforeMin[1]}분 → {p.afterMax}분 이내</p>
        </div>
        <div className="rounded-2xl bg-navy-50/70 px-3 py-2">
          <p className="text-[0.85rem] font-bold text-navy-500">해당 업무 시간 감소율</p>
          <p data-prod-rate className="text-[1.1rem] font-black tabular-nums text-navy-900">{pct(pr.rate[0])}~{pct(pr.rate[1])}</p>
        </div>
      </div>
      <dl className="space-y-1 text-[0.95rem] text-navy-700">
        <div className="flex justify-between gap-2"><dt>하루 절감</dt><dd className="font-bold tabular-nums">{pr.saveMin[0]}~{pr.saveMin[1]}분</dd></div>
        <div className="flex justify-between gap-2"><dt>월 {p.daysMonth}일 기준</dt><dd className="font-bold tabular-nums">{cnt(pr.monthHours[0], 0)}~{cnt(pr.monthHours[1], 0)}시간</dd></div>
        <div className="flex justify-between gap-2"><dt>연 {p.daysYear}일 기준</dt><dd className="font-bold tabular-nums">{cnt(pr.yearHours[0], 0)}~{cnt(pr.yearHours[1], 0)}시간</dd></div>
        <div className="flex justify-between gap-2"><dt>시간당 {man(p.hourlyValue)}원 가정</dt><dd data-prod-value className="font-bold tabular-nums">{man(pr.value[0])}~{man(pr.value[1])}원 상당</dd></div>
      </dl>
      <p className="break-keep rounded-xl bg-amber-50 px-3 py-2 text-[0.9rem] font-semibold text-amber-900">
        한 분의 해당 업무 시간입니다 — 회사 전체 직원의 효율이 아닙니다. 금액은 확보된 업무시간의 경제적 가치이며 실제 현금 인건비 절감액이 아닙니다.
        {p.src ? ` (출처: ${p.src}${p.asOf ? ` · ${p.asOf}` : ''})` : ''}
      </p>
      {(p.unmeasured?.length ?? 0) > 0 && (
        <More label="측정하지 않은 개선 (시간을 만들어 넣지 않음)" hook="unmeasured">
          <Lines items={p.unmeasured} />
        </More>
      )}
      {(p.evidenceTodo?.length ?? 0) > 0 && (
        <More label="더 모으면 좋은 실증자료" hook="evidence-todo">
          <Lines items={p.evidenceTodo} />
        </More>
      )}
      {!usage ? (
        <button type="button" data-usage-load className="btn-ghost w-full" disabled={busy} onClick={() => void load()}>
          {busy && <Loader2 size={16} className="animate-spin" />} 실제 시스템 사용 기록 보기 (달별)
        </button>
      ) : (
        <div data-usage className="space-y-1.5">
          <p className="text-[0.9rem] font-bold text-navy-600">실제 사용 기록 <KindBadge kind="확인된 사실" small /></p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-[0.88rem] tabular-nums">
              <thead><tr className="text-left text-navy-500"><th className="py-1 pr-2">달</th><th className="px-1 text-right">수거 입력</th><th className="px-1 text-right">기사 입력</th><th className="px-1 text-right">평균 입력</th><th className="px-1 text-right">병원 요청(포털·대신)</th><th className="px-1 text-right">자재 주문</th></tr></thead>
              <tbody className="divide-y divide-navy-100">
                {usage.months.map((u) => (
                  <tr key={u.month} data-usage-month={u.month}>
                    <td className="py-1 pr-2">{u.month}</td>
                    <td className="px-1 text-right">{u.collections}</td>
                    <td className="px-1 text-right">{u.field_inputs}</td>
                    <td className="px-1 text-right">{u.avg_input_sec != null ? `${u.avg_input_sec}초` : '—'}</td>
                    <td className="px-1 text-right">{u.requests_portal}·{u.requests_staff}</td>
                    <td className="px-1 text-right">{u.supply_orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[0.82rem] text-navy-400">{usage.note}</p>
        </div>
      )}
      {err && <p className="text-[0.9rem] font-bold text-rose-600">{err}</p>}
    </Card>
  )
}
