import { useMemo, useState } from 'react'
import { RotateCcw, Star } from 'lucide-react'
import {
  SCENARIO_IDS, cnt, compute, eok, man, pct, type B2BStructure, type Patch, type Result, type ScenarioId,
} from '../../../lib/bizStrategy'
import { Card, Delta, KindBadge, Lines, More, WarningList, useStrategy } from './ctx'

// ② 시나리오 비교 — 안정 · 성장 · 도전을 나란히. 숫자 표는 펼쳐야 보입니다.
//   A · B · C 는 실현 확률이 아니라 「조건별 사업목표 모델」입니다.

export function Scenarios() {
  const s = useStrategy()
  const results = useMemo(
    () => Object.fromEntries(SCENARIO_IDS.map((id) => [id, compute(s.model, id, s.viewPicks, [], s.appFallback, true)])) as Record<ScenarioId, Result>,
    [s.model, s.viewPicks, s.appFallback],
  )
  return (
    <div className="space-y-4" data-strategy-scenarios>
      <p className="break-keep px-1 text-[0.95rem] text-navy-600">
        세 안은 <b>조건이 다른 사업목표 모델</b>입니다. 실현 가능성의 통계적 확률이 아닙니다. 「추천」은 담당의 제안일 뿐 확정이 아니며, 대표님 · 이사님이 ③에서 고르십니다.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {SCENARIO_IDS.map((id) => <ScenarioCard key={id} r={results[id]} />)}
      </div>
      <Formula />
      <Sandbox />
    </div>
  )
}

function ScenarioCard({ r }: { r: Result }) {
  const s = useStrategy()
  const m = s.model
  const sc = r.scenario
  const last = r.years[r.years.length - 1]
  const sum3 = r.years.reduce((a, y) => a + y.total, 0)
  const rec = m.meta.recommended === r.sel
  const org = m.original?.[r.sel]
  const warns = r.warnings.filter((w) => w.level !== 'info')
  return (
    <section data-scenario={r.sel} className={`flex min-w-0 flex-col gap-3 rounded-[22px] bg-white p-4 ring-1 sm:p-5 ${rec ? 'ring-2 ring-teal-500' : 'ring-navy-100'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-navy-900 px-2.5 py-1 text-[0.85rem] font-black text-white">{r.sel}</span>
        <h3 className="text-[1.15rem] font-black text-navy-900">{sc.name}</h3>
        {rec && <span data-recommended className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[0.85rem] font-extrabold text-teal-800"><Star size={13} /> 추천 · 확정 아님</span>}
      </div>
      <p className="break-keep text-[0.95rem] text-navy-600">{sc.summary}</p>
      <div>
        <p className="text-[0.85rem] font-bold text-navy-500">{last.year}년 전체 매출 <KindBadge kind="사업화 목표" small /></p>
        <p data-sc-total className="text-[1.9rem] font-black tabular-nums leading-tight text-navy-900">{eok(last.total)}</p>
        <p className="text-[0.88rem] text-navy-500">3년 합 {eok(sum3)}</p>
      </div>
      <dl className="grid grid-cols-3 gap-1.5 text-center">
        {[
          [m.segments.legacy, last.legacy],
          [m.segments.saas, last.saas.net],
          [m.segments.b2b, last.b2b.revenue],
        ].map(([n, v]) => (
          <div key={n as string} className="rounded-xl bg-navy-50/70 px-1.5 py-1.5">
            <dt className="break-keep text-[0.78rem] font-bold leading-tight text-navy-500">{n}</dt>
            <dd className="text-[1rem] font-black tabular-nums text-navy-900">{eok(v as number)}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1 text-[0.93rem] text-navy-700">
        <p>필요한 SaaS 유료고객 — 연말 <b data-sc-end>{cnt(last.saas.endCustomers, 0)}곳</b> · 연평균 {cnt(last.saas.avgPaying)}곳 · 그해 신규 {cnt(last.saas.newCustomers)}곳</p>
        <p>월 고객매출 {man(last.saas.arpu)}원 (요금제 비중 · 부가 기능 채택률로 계산)</p>
        <p>B2B 거래총액 {eok(last.b2b.gmv)} 중 회사 매출 {eok(last.b2b.revenue)} · 기여이익 {eok(last.b2b.contribution)}</p>
        <p>기존 사업 연평균 성장 {pct(r.legacyGrowth)}</p>
      </div>
      {org && (org.total != null || org.saas != null) && (
        <p data-sc-original className="break-keep rounded-xl bg-navy-50/70 px-3 py-2 text-[0.88rem] text-navy-600">
          기존 자료 {org.total != null ? `전체 ${eok(org.total)}` : ''}{org.saas != null ? ` · SaaS ${eok(org.saas)}` : ''}{org.b2b != null ? ` · B2B ${eok(org.b2b)}` : ''} → 다시 계산 전체 {eok(last.total)} (<Delta v={last.total - (org.total ?? last.total)} />)
          <span className="block text-[0.82rem] text-navy-400">차이는 가입 시점 · 이탈 · 무료 체험 · 추천 할인 · 설정비 계산 방식 때문입니다 — 아래 「계산 방법」</span>
        </p>
      )}
      {(sc.conditions?.length ?? 0) > 0 && (
        <More label="달성 조건" hook={`cond-${r.sel}`}>
          <Lines items={sc.conditions} />
        </More>
      )}
      {(sc.risks?.length ?? 0) + warns.length > 0 && (
        <More label={`위험 · 검증 필요 ${(sc.risks?.length ?? 0) + warns.length}`} hook={`risk-${r.sel}`}>
          <Lines items={sc.risks} />
          <WarningList items={warns} />
        </More>
      )}
      <More label="연도별 자세히" hook={`years-${r.sel}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-[0.88rem] tabular-nums">
            <thead><tr className="text-left text-navy-500"><th className="py-1 pr-2"></th>{r.years.map((y) => <th key={y.year} className="px-1 text-right">{y.year}</th>)}</tr></thead>
            <tbody className="divide-y divide-navy-100 text-navy-800">
              <tr><td className="py-1 pr-2">{m.segments.legacy}</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{eok(y.legacy)}</td>)}</tr>
              <tr><td className="py-1 pr-2">{m.segments.saas}</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{eok(y.saas.net)}</td>)}</tr>
              <tr><td className="py-1 pr-2">{m.segments.b2b}</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{eok(y.b2b.revenue)}</td>)}</tr>
              <tr className="font-black"><td className="py-1 pr-2">합계</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{eok(y.total)}</td>)}</tr>
              <tr><td className="py-1 pr-2">연말 · 연평균 고객</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{cnt(y.saas.endCustomers, 0)} · {cnt(y.saas.avgPaying)}</td>)}</tr>
              <tr><td className="py-1 pr-2">신규 · 이탈</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{cnt(y.saas.newCustomers)} · {cnt(y.saas.churned)}</td>)}</tr>
              <tr><td className="py-1 pr-2">설정비 · 추천할인</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{eok(y.saas.setup)} · {eok(y.saas.referral)}</td>)}</tr>
              <tr className="text-navy-400"><td className="py-1 pr-2">B2B 거래총액</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{eok(y.b2b.gmv)}</td>)}</tr>
              <tr><td className="py-1 pr-2">B2B 운전자금</td>{r.years.map((y) => <td key={y.year} className="px-1 text-right">{eok(y.b2b.nwc)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <FunnelTable r={r} />
      </More>
    </section>
  )
}

function FunnelTable({ r }: { r: Result }) {
  const { model: m } = useStrategy()
  const last = r.years[r.years.length - 1]
  return (
    <div className="space-y-1">
      <p className="text-[0.88rem] font-bold text-navy-600">{last.year}년 신규 고객 경로 (전환율은 가정 — 시장 자료 아님)</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-[0.85rem] tabular-nums">
          <thead><tr className="text-left text-navy-500"><th className="py-1 pr-2">경로</th><th className="px-1 text-right">접촉</th><th className="px-1 text-right">시연</th><th className="px-1 text-right">가입</th><th className="px-1 text-right">유료</th></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {m.channels.map((c) => {
              const f = last.saas.funnel[c.id]
              const v = (n: number) => (Number.isFinite(n) ? cnt(n) : '계산 불가')
              return (
                <tr key={c.id} data-funnel={c.id}>
                  <td className="break-keep py-1 pr-2">{c.name}</td>
                  <td className="px-1 text-right">{v(f.contacts)}</td><td className="px-1 text-right">{v(f.demos)}</td><td className="px-1 text-right">{v(f.signups)}</td><td className="px-1 text-right">{v(f.paid)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Formula() {
  return (
    <Card hook="formula" title="계산 방법" sub="같은 식으로 세 안을 계산합니다 — 금액은 원 단위로 계산하고 표시할 때만 반올림">
      <More label="식 보기" hook="formula">
        <Lines items={[
          'SaaS 신규 가입 = (연말 목표 − 연초 고객 × 남는 비율¹²) ÷ Σ(달별 가입 비중 × 남는 비율^(남은 달)) — 남는 비율 = (1 − 연 이탈률)^(1/12)',
          '연평균 고객 = 12달 고객 수의 평균 — 연중에 가입하므로 연말 고객보다 적습니다',
          '월 고객매출 = Σ(요금제 비중 × 월 구독료) + Σ(부가 기능 채택률 × 월 추가요금) — 부가세 별도',
          'SaaS 매출 = 결제 고객(무료 체험 중 제외) × 월 고객매출 + 신규 × 유료 설정 비율 × 평균 설정비 − 추천 신규 × 추천 혜택 비용',
          'B2B 상품: 직접판매는 거래총액 전부를 매출(총액), 중개는 수수료만 매출(순액) — K-IFRS 1115 본인 · 대리인 판단은 실제 계약 구조로 확인 필요',
          'B2B 기여이익 = 매출 − 매입원가 − 배송 · 반품 − 결제수수료 − 쿠폰 · 할인 − 고객지원 · 운영비',
          'B2B 운전자금 = 매출채권(회수일) + 재고(보유일) − 매입채무(지급일) — 이익과 현금은 다릅니다',
          '기존 사업 = 기준연도 추정에서 마지막 해 목표까지 같은 비율로 성장한다고 가정',
          '신보 n차년도 = 접수월 다음 달부터 12개월씩 — 같은 월별 숫자를 다르게 묶은 것',
          'AI 사용량 초과요금은 실제 API 원가 측정 전이라 매출에 넣지 않았습니다',
        ]} />
      </More>
    </Card>
  )
}

// ── 직접 수치 수정 — 화면에서만 계산 (저장 안 됨) ─────────────────────────────────
function Sandbox() {
  const s = useStrategy()
  const m = s.model
  const last = m.meta.years[m.meta.years.length - 1]
  const [sel, setSel] = useState<ScenarioId>(s.result.sel)
  const sc = m.scenarios[sel]
  const sy = sc.saas.years[String(last)]
  const by = sc.b2b.years[String(last)]
  const [v, setV] = useState<Record<string, string>>({})
  const num = (k: string) => (v[k] != null && v[k] !== '' && Number.isFinite(Number(v[k])) ? Number(v[k]) : null)

  const patches: Patch[] = []
  const P = (path: string, val: unknown) => patches.push({ path, value: val })
  if (num('legacy') != null) P(`scenarios.${sel}.legacyTarget`, num('legacy')! * 1e8)
  if (num('end') != null) P(`scenarios.${sel}.saas.years.${last}.endTarget`, num('end'))
  if (num('churn') != null) P(`scenarios.${sel}.saas.years.${last}.churnRate`, num('churn')! / 100)
  for (const o of m.saasCatalog.options) if (num(`opt.${o.id}`) != null) P(`scenarios.${sel}.saas.years.${last}.adoption.${o.id}`, num(`opt.${o.id}`)! / 100)
  if (num('hosp') != null) P(`scenarios.${sel}.b2b.years.${last}.goodsHospitals`, num('hosp'))
  if (num('spend') != null) P(`scenarios.${sel}.b2b.years.${last}.monthlySpend`, num('spend')! * 1e4)
  if (num('svc') != null) P(`scenarios.${sel}.b2b.years.${last}.serviceContracts`, num('svc'))
  if (v.structure) P('b2b.structure', v.structure as B2BStructure)
  if (num('direct') != null) P('b2b.directShare', num('direct')! / 100)

  const base = useMemo(() => compute(m, sel, s.viewPicks, [], s.appFallback, true), [m, sel, s.viewPicks, s.appFallback])
  const key = JSON.stringify(patches)
  const after = useMemo(() => compute(m, sel, s.viewPicks, patches, s.appFallback, true), [m, sel, s.viewPicks, s.appFallback, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const bl = base.years[base.years.length - 1]
  const al = after.years[after.years.length - 1]
  const scenarioDecision = m.decisions.find((d) => d.options.some((o) => o.patch?.some((p) => p.path === 'select.scenario')))

  const field = (k: string, label: string, unit: string, ph: string | number) => (
    <label key={k} className="block">
      <span className="mb-1 block break-keep text-[0.88rem] font-bold text-navy-600">{label}</span>
      <span className="flex items-center gap-1.5">
        <input data-sandbox={k} inputMode="decimal" className="input min-h-[44px] tabular-nums" value={v[k] ?? ''} placeholder={String(ph)} onChange={(e) => setV((o) => ({ ...o, [k]: e.target.value.replace(/[^0-9.]/g, '') }))} />
        <span className="shrink-0 text-[0.88rem] text-navy-500">{unit}</span>
      </span>
    </label>
  )

  function toOpinion() {
    if (!scenarioDecision) return
    const lines = [
      `[직접 수치 수정 · 시나리오 ${sel}] 화면 계산 — ${last}년 전체 ${eok(bl.total)} → ${eok(al.total)}`,
      ...patches.map((p) => `· ${p.path.split('.').slice(-2).join('.')} = ${typeof p.value === 'number' ? Math.round((p.value as number) * 1000) / 1000 : String(p.value)}`),
    ]
    s.setNoteDraft(scenarioDecision.key, lines.join('\n'))
    s.goSection('decisions', `d-${scenarioDecision.key}`)
  }

  return (
    <Card hook="sandbox" title="직접 수치 수정" sub="화면에서만 다시 계산합니다 — 저장되지 않습니다. 빈칸은 지금 값(회색 글자) 그대로">
      <div role="radiogroup" aria-label="시나리오" className="flex gap-1.5">
        {SCENARIO_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={sel === id} data-sandbox-sc={id} onClick={() => { setSel(id); setV({}) }}
            className={`min-h-[44px] flex-1 rounded-xl text-[0.95rem] font-extrabold ${sel === id ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600'}`}>
            {id} {m.scenarios[id].name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {field('legacy', `${m.segments.legacy} ${last}년 목표`, '억원', Math.round(sc.legacyTarget / 1e6) / 100)}
        {field('end', `SaaS ${last}년 연말 유료고객`, '곳', sy.endTarget)}
        {field('churn', `SaaS ${last}년 연 이탈률`, '%', Math.round(sy.churnRate * 1000) / 10)}
        {m.saasCatalog.options.map((o) => field(`opt.${o.id}`, `${o.name} 채택률`, '%', Math.round((sy.adoption[o.id] ?? 0) * 1000) / 10))}
        {field('hosp', `B2B ${last}년 상품 구매 기관(연평균)`, '곳', by.goodsHospitals)}
        {field('spend', '기관당 월 구매액', '만원', by.monthlySpend / 1e4)}
        {field('svc', '전문 서비스 계약', '건', by.serviceContracts)}
        <label className="block">
          <span className="mb-1 block text-[0.88rem] font-bold text-navy-600">B2B 매출구조</span>
          <select data-sandbox="structure" className="input min-h-[44px]" value={v.structure ?? ''} onChange={(e) => setV((o) => ({ ...o, structure: e.target.value }))}>
            <option value="">지금 값 ({m.b2b.structure === 'direct' ? '직접판매' : m.b2b.structure === 'broker' ? '중개' : '혼합'})</option>
            <option value="direct">직접판매 (총액)</option>
            <option value="broker">중개 (수수료)</option>
            <option value="mixed">혼합</option>
          </select>
        </label>
        {field('direct', '혼합형 직접판매 비중', '%', Math.round(m.b2b.directShare * 100))}
      </div>
      <div data-sandbox-result className="grid grid-cols-2 gap-2 rounded-2xl bg-navy-50/70 p-3 sm:grid-cols-4">
        <Out label={`${last}년 전체`} a={bl.total} b={al.total} />
        <Out label="SaaS" a={bl.saas.net} b={al.saas.net} />
        <Out label="B2B 매출" a={bl.b2b.revenue} b={al.b2b.revenue} />
        <Out label="B2B 기여이익" a={bl.b2b.contribution} b={al.b2b.contribution} />
      </div>
      <p className="text-[0.88rem] text-navy-500">연평균 유료고객 {cnt(bl.saas.avgPaying)} → {cnt(al.saas.avgPaying)}곳 · 월 고객매출 {man(bl.saas.arpu)} → {man(al.saas.arpu)}원 · B2B 거래총액 {eok(bl.b2b.gmv)} → {eok(al.b2b.gmv)}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" data-sandbox-reset onClick={() => setV({})} disabled={patches.length === 0}><RotateCcw size={16} /> 처음 값으로</button>
        {s.isDecider && scenarioDecision && (
          <button type="button" className="btn-ghost" data-sandbox-note disabled={patches.length === 0} onClick={toOpinion}>
            이 계산을 의견란에 옮기기 (저장은 직접)
          </button>
        )}
      </div>
    </Card>
  )
}

function Out({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div>
      <p className="text-[0.82rem] font-bold text-navy-500">{label}</p>
      <p className="text-[1.05rem] font-black tabular-nums text-navy-900">{eok(b)}</p>
      <p className="text-[0.82rem] font-bold tabular-nums"><Delta v={b - a} /></p>
    </div>
  )
}
