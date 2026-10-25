import { useContext, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { SCENARIO_IDS, clone, getPath, validate, type ScenarioId, type StrategyModel } from '../../../lib/bizStrategy'
import { BizPlanError } from '../../../lib/bizPlanApi'
import { revisionGet, strategySave } from '../../../lib/bizStrategyApi'
import { usePlan, when } from '../parts'
import { Card, More, StrategyContext } from './ctx'

// 자료 편집 · 기록 — 사업계획 담당만 (0148)
//
//  · 가정 숫자는 표로, 나머지(결정안 문장 · 심사 질문 · 출처 · 초안 문장)는 자료(JSON)로 고칩니다.
//  · 저장은 판 번호(rev)를 들고 갑니다. 그사이 다른 분이 고쳤으면 서버가 저장하지 않습니다.
//  · 숫자 · 가정 · 결정안이 바뀌면 대표님 · 이사님의 이전 결정은 지우지 않고 「재확인 필요」가 됩니다.
//    심사 질문 · 출처 · 초안 문장만 고치면 결정은 그대로입니다.

type Param = { path: string; label: string; unit: string; scale: number; kind?: 'num' | 'text' | 'select'; options?: [string, string][]; nullable?: boolean }

function flatten(v: unknown, prefix = '', out: Map<string, string> = new Map()): Map<string, string> {
  if (v != null && typeof v === 'object') {
    const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) out.set(prefix, Array.isArray(v) ? '[]' : '{}')
    for (const [k, x] of entries) flatten(x, prefix ? `${prefix}.${k}` : k, out)
  } else out.set(prefix, JSON.stringify(v))
  return out
}
export function changedPaths(a: unknown, b: unknown): { path: string; before: string; after: string }[] {
  const fa = flatten(a)
  const fb = flatten(b)
  const keys = [...new Set([...fa.keys(), ...fb.keys()])].sort()
  return keys.filter((k) => fa.get(k) !== fb.get(k)).map((k) => ({ path: k, before: fa.get(k) ?? '—', after: fb.get(k) ?? '—' }))
}
function setIn(obj: StrategyModel, path: string, value: unknown): StrategyModel {
  const m = clone(obj) as unknown as Record<string, unknown>
  const parts = path.split('.')
  let cur = m
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}
    cur = cur[parts[i]] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
  return m as unknown as StrategyModel
}

export function ModelEditor({ bootstrap }: { bootstrap?: { rev: number; reload: () => Promise<void> } }) {
  const ctx = useContext(StrategyContext)
  const plan = usePlan()
  const base = ctx?.model ?? null
  const rev = ctx?.rev ?? bootstrap?.rev ?? 0
  const reload = ctx?.reload ?? bootstrap!.reload
  const [mode, setMode] = useState<'form' | 'json' | 'log'>(base ? 'form' : 'json')
  const [draft, setDraft] = useState<StrategyModel | null>(base ? clone(base) : null)
  const [json, setJson] = useState(base ? JSON.stringify(base, null, 2) : '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'err' | 'ok'; text: string } | null>(null)
  const [conflict, setConflict] = useState<{ by: string; at: string } | null>(null)

  const parsed = useMemo<{ model: StrategyModel | null; error: string | null }>(() => {
    if (mode !== 'json') return { model: draft, error: null }
    if (!json.trim()) return { model: null, error: '자료(JSON)를 붙여 넣어 주세요.' }
    try {
      return { model: JSON.parse(json) as StrategyModel, error: null }
    } catch (e) {
      return { model: null, error: `JSON 모양이 틀렸습니다 — ${(e as Error).message.slice(0, 120)}` }
    }
  }, [mode, json, draft])
  const target = parsed.model
  const errors = target ? validate(target) : []
  const changes = target ? changedPaths(base ?? {}, target) : []

  async function save() {
    if (!target) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await strategySave(target, rev, reason.trim())
      if (!r.ok) {
        setConflict({ by: r.updated_by, at: r.updated_at })
        setMsg({ tone: 'err', text: `${r.updated_by || '다른 분'}님이 먼저 고쳤습니다(${when(r.updated_at)}). 저장하지 않았습니다 — 덮어쓰지 않습니다.` })
        return
      }
      await reload()
      setReason('')
      const stale = 'stale_decisions' in r && r.stale_decisions ? ` 숫자가 바뀌어 대표님 · 이사님 결정 ${r.stale_decisions}개가 「재확인 필요」가 되었습니다.` : ''
      const text = r.unchanged ? '바뀐 것이 없어 그대로 두었습니다.' : `저장했습니다 · 판 ${r.rev}${r.assumption_changed ? ` · 숫자 판 ${r.assump_rev}` : ' (숫자 판 그대로)'}.${stale}`
      setMsg({ tone: 'ok', text })
      plan.notify(text)
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof BizPlanError ? e.message : '저장하지 못했습니다. 고친 내용은 그대로 있습니다.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" data-model-editor>
      {base && (
        <div role="tablist" className="flex gap-1.5">
          {([['form', '가정 숫자'], ['json', '자료 전체(JSON)'], ['log', '고친 기록']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} data-editor-mode={k} onClick={() => { setMode(k); if (k === 'json' && draft) setJson(JSON.stringify(draft, null, 2)); if (k === 'form' && parsed.model && mode === 'json') setDraft(parsed.model) }}
              className={`min-h-[44px] flex-1 rounded-xl text-[0.95rem] font-extrabold ${mode === k ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200'}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      {mode === 'form' && draft && <ParamForm model={draft} onChange={setDraft} />}
      {mode === 'json' && (
        <Card hook="json" title={base ? '자료 전체 (JSON)' : '처음 자료 넣기 (JSON)'} sub="결정안 문장 · 심사 질문 · 출처 · 초안 문장도 여기서 고칩니다. 회사 숫자를 저장소 파일에 두지 말고 여기(서버)에만 두세요.">
          <textarea data-model-json spellCheck={false} className="field-input min-h-[18rem] font-mono text-[0.82rem] leading-snug" value={json} onChange={(e) => setJson(e.target.value)} />
        </Card>
      )}
      {mode === 'log' && ctx && <RevisionLog />}

      {mode !== 'log' && (
        <Card hook="save" title="저장" sub={`지금 판 ${rev}${ctx ? ` · 숫자 판 ${ctx.assumpRev}` : ''}`}>
          {parsed.error && <p data-model-parse-error className="text-[0.92rem] font-bold text-rose-600">{parsed.error}</p>}
          {errors.length > 0 && (
            <ul data-model-errors={errors.length} className="space-y-1 rounded-xl bg-rose-50 px-3 py-2 text-[0.92rem] font-bold text-rose-700">
              {errors.slice(0, 12).map((e, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{e}</li>)}
            </ul>
          )}
          {changes.length > 0 && (
            <More label={`바뀌는 곳 ${changes.length}개 보기`} hook="changes">
              <ChangeList items={changes} />
            </More>
          )}
          <label className="block">
            <span className="mb-1 block text-[0.9rem] font-bold text-navy-600">무엇을 왜 고쳤나 (필수 · 기록에 남음)</span>
            <input data-model-reason className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 견적서 받은 금액으로 외주개발비 수정" />
          </label>
          {msg && <p data-model-msg={msg.tone} className={`break-keep text-[0.95rem] font-bold ${msg.tone === 'err' ? 'text-rose-600' : 'text-teal-700'}`}>{msg.text}</p>}
          <div className="flex flex-wrap gap-2">
            {conflict && (
              <button type="button" className="btn-ghost" data-model-reload onClick={() => { void reload(); setConflict(null); setMsg(null) }}>서버 내용 다시 불러오기 (내 고친 것은 버림)</button>
            )}
            <button type="button" data-model-save className="btn-primary flex-1" disabled={busy || !target || errors.length > 0 || changes.length === 0 || reason.trim().length < 2 || !!conflict} onClick={() => void save()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 저장 ({changes.length}곳)
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

function ChangeList({ items }: { items: { path: string; before: string; after: string }[] }) {
  return (
    <ul className="max-h-[22rem] space-y-1 overflow-y-auto text-[0.85rem]">
      {items.slice(0, 120).map((c) => (
        <li key={c.path} data-change={c.path} className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
          <span className="block break-all font-bold text-navy-600">{c.path}</span>
          <span className="block break-all text-rose-700 line-through decoration-rose-300">{c.before.slice(0, 200)}</span>
          <span className="block break-all text-teal-800">{c.after.slice(0, 200)}</span>
        </li>
      ))}
      {items.length > 120 && <li className="text-navy-400">… {items.length - 120}곳 더</li>}
    </ul>
  )
}

function ParamForm({ model, onChange }: { model: StrategyModel; onChange: (m: StrategyModel) => void }) {
  const [sc, setSc] = useState<ScenarioId>(model.meta.recommended)
  const [year, setYear] = useState<number>(model.meta.years[model.meta.years.length - 1])
  const [text, setText] = useState<Record<string, string>>({})
  const P = (path: string, label: string, unit: string, scale = 1, extra: Partial<Param> = {}): Param => ({ path, label, unit, scale, ...extra })
  const sp = `scenarios.${sc}`
  const yp = `${sp}.saas.years.${year}`
  const bp = `${sp}.b2b.years.${year}`
  const groups: [string, Param[]][] = [
    ['기본', [
      P('meta.applicationMonth', '신보 접수 예정월 (YYYY-MM, 비우면 작성일 칸)', '', 1, { kind: 'text' }),
      P('meta.asOf', '자료 기준일', '', 1, { kind: 'text' }),
      P('meta.recommended', '추천 시나리오 (확정 아님)', '', 1, { kind: 'select', options: SCENARIO_IDS.map((x) => [x, `${x} ${model.scenarios[x].name}`]) }),
      P('legacy.baseAmount', `${model.segments.legacy} 기준연도(${model.meta.baseYear}) 매출`, '억원', 1e8),
    ]],
    [`시나리오 ${sc} 전체`, [
      P(`${sp}.legacyTarget`, `${model.segments.legacy} 마지막 해 목표`, '억원', 1e8),
      P(`${sp}.saas.startCustomers`, `SaaS ${model.meta.years[0]}년 초 유료고객`, '곳'),
    ]],
    [`시나리오 ${sc} · ${year}년 SaaS`, [
      P(`${yp}.endTarget`, '연말 유료고객 목표', '곳'),
      P(`${yp}.churnRate`, '연 이탈률', '%', 0.01),
      P(`${yp}.trialMonths`, '무료 체험', '개월'),
      P(`${yp}.timing`, '가입 시점', '', 1, { kind: 'select', options: [['even', '고르게'], ['front', '상반기에 많이'], ['back', '하반기에 많이']] }),
      P(`${yp}.priceFactor`, '요금 배수(할인 등)', '배'),
      ...model.saasCatalog.plans.map((p) => P(`${yp}.mix.${p.id}`, `${p.name} 비중`, '%', 0.01)),
      ...model.saasCatalog.options.map((o) => P(`${yp}.adoption.${o.id}`, `${o.name} 채택률`, '%', 0.01)),
      P(`${yp}.setupPaidShare`, '유료 설정 비율', '%', 0.01),
      P(`${yp}.setupAvgFee`, '유료 설정 평균', '만원', 1e4),
      P(`${yp}.referral.referrerCost`, '추천 1건 — 기존 고객 혜택', '원'),
      P(`${yp}.referral.refereeCost`, '추천 1건 — 신규 고객 혜택', '원'),
      ...model.channels.flatMap((c) => [
        P(`${yp}.channelShare.${c.id}`, `${c.name} — 신규 비중`, '%', 0.01),
        P(`${yp}.funnel.${c.id}.demoRate`, `${c.name} — 접촉→시연`, '%', 0.01),
        P(`${yp}.funnel.${c.id}.signupRate`, `${c.name} — 시연→가입`, '%', 0.01),
        P(`${yp}.funnel.${c.id}.paidRate`, `${c.name} — 가입→유료`, '%', 0.01),
      ]),
    ]],
    [`시나리오 ${sc} · ${year}년 B2B`, [
      P(`${bp}.goodsHospitals`, '상품 구매 기관 (연평균)', '곳'),
      P(`${bp}.monthlySpend`, '기관당 월 구매액', '만원', 1e4),
      P(`${bp}.serviceContracts`, '전문 서비스 계약', '건'),
      P(`${bp}.serviceAvg`, '서비스 계약 평균액', '만원', 1e4),
      P(`${bp}.serviceFeeRate`, '서비스 수수료율', '%', 0.01),
      P(`${bp}.adsRevenue`, '입점 · 광고 매출 (연)', '만원', 1e4),
    ]],
    ['요금 · B2B 공통', [
      ...model.saasCatalog.plans.map((p, i) => P(`saasCatalog.plans.${i}.price`, `${p.name} 월 구독료`, '원')),
      ...model.saasCatalog.options.map((o, i) => P(`saasCatalog.options.${i}.price`, `${o.name} 월 추가요금`, '원')),
      P('b2b.grossMargin', '상품 매출총이익률', '%', 0.01),
      P('b2b.shippingRate', '배송 · 반품비율', '%', 0.01),
      P('b2b.paymentFeeRate', '결제수수료율', '%', 0.01),
      P('b2b.couponRate', '쿠폰 · 할인 비용률', '%', 0.01),
      P('b2b.brokerTakeRate', '중개 상품 수수료율', '%', 0.01),
      P('b2b.arDays', '매출채권 회수기간', '일'),
      P('b2b.apDays', '매입채무 지급기간', '일'),
      P('b2b.inventoryDays', '재고 보유일', '일'),
      P('b2b.opsCostPerHospitalMonth', '기관당 월 지원 · 운영비', '원'),
      P('b2b.fixedOpsCostYear', '고정 운영비 (연)', '만원', 1e4),
      P('b2b.directShare', '혼합형 직접판매 비중', '%', 0.01),
    ]],
    ['자금', [
      P('funding.total', '예비예산 총액', '만원', 1e4),
      P('funding.applyTarget', '신청 검토 금액', '만원', 1e4),
      P('funding.ownFunds', '자기자금 (모르면 비움)', '만원', 1e4, { nullable: true }),
      ...model.funding.items.flatMap((it, i) => [
        P(`funding.items.${i}.amount`, `${it.name} 금액`, '만원', 1e4),
        P(`funding.items.${i}.eligibility`, `${it.name} 보증 인정`, '', 1, { kind: 'select', options: [['적격 가능', '적격 가능'], ['신보 확인 필요', '신보 확인 필요'], ['별도 자금 권장', '별도 자금 권장']] }),
        P(`funding.items.${i}.firstYearShare`, `${it.name} 1차년도 사용 비율`, '%', 0.01),
      ]),
    ]],
  ]

  const show = (p: Param) => {
    if (text[p.path] != null) return text[p.path]
    const v = getPath(model, p.path)
    if (v == null) return ''
    if (typeof v === 'number') return String(Math.round((v / p.scale) * 1e6) / 1e6)
    return String(v)
  }
  const set = (p: Param, raw: string) => {
    setText((t) => ({ ...t, [p.path]: raw }))
    if (p.kind === 'text' || p.kind === 'select') return onChange(setIn(model, p.path, raw))
    if (raw.trim() === '' && p.nullable) return onChange(setIn(model, p.path, null))
    const n = Number(raw.replace(/,/g, ''))
    if (raw.trim() !== '' && Number.isFinite(n)) onChange(setIn(model, p.path, Math.round(n * p.scale * 1e6) / 1e6))
  }

  return (
    <div className="space-y-4" data-param-form>
      <div className="flex flex-wrap gap-2">
        <div role="radiogroup" aria-label="시나리오" className="flex gap-1">
          {SCENARIO_IDS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={sc === x} data-form-sc={x} onClick={() => { setSc(x); setText({}) }} className={`min-h-[44px] rounded-xl px-3.5 font-extrabold ${sc === x ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200'}`}>{x}</button>
          ))}
        </div>
        <div role="radiogroup" aria-label="연도" className="flex gap-1">
          {model.meta.years.map((y) => (
            <button key={y} type="button" role="radio" aria-checked={year === y} data-form-year={y} onClick={() => { setYear(y); setText({}) }} className={`min-h-[44px] rounded-xl px-3.5 font-extrabold ${year === y ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200'}`}>{y}</button>
          ))}
        </div>
      </div>
      {groups.map(([title, ps]) => (
        <Card key={title} hook={`form-${title}`} title={title}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {ps.map((p) => (
              <label key={p.path} className="block">
                <span className="mb-1 block break-keep text-[0.86rem] font-bold text-navy-600">{p.label}</span>
                <span className="flex items-center gap-1.5">
                  {p.kind === 'select' ? (
                    <select data-param={p.path} className="input min-h-[44px]" value={show(p)} onChange={(e) => set(p, e.target.value)}>
                      {p.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : (
                    <input data-param={p.path} inputMode={p.kind === 'text' ? 'text' : 'decimal'} className="input min-h-[44px] tabular-nums" value={show(p)} onChange={(e) => set(p, e.target.value)} />
                  )}
                  {p.unit && <span className="shrink-0 text-[0.85rem] text-navy-500">{p.unit}</span>}
                </span>
              </label>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

function RevisionLog() {
  const ctx = useContext(StrategyContext)!
  const [open, setOpen] = useState<number | null>(null)
  const [detail, setDetail] = useState<{ path: string; before: string; after: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  async function show(id: number) {
    setOpen(id)
    setDetail(null)
    setBusy(true)
    try {
      const r = await revisionGet(id)
      setDetail(changedPaths(r.before_model ?? {}, r.after_model))
    } catch {
      setDetail([])
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card hook="revisions" title={`고친 기록 ${ctx.open.revisions.length}`} sub="지울 수 없습니다 · 누르면 바뀐 곳을 봅니다">
      <ul className="space-y-1.5">
        {ctx.open.revisions.map((r) => (
          <li key={r.id}>
            <button type="button" data-revision={r.id} onClick={() => void show(r.id)} className="flex min-h-[44px] w-full flex-col rounded-xl bg-navy-50/60 px-3 py-2 text-left hover:bg-navy-100">
              <span className="text-[0.95rem] font-bold text-navy-800">판 {r.rev} · 숫자 판 {r.assump_rev} — {r.reason}</span>
              <span className="text-[0.82rem] text-navy-500">{when(r.at)} · {r.actor_name} · {r.sections.join(', ')}</span>
            </button>
            {open === r.id && (busy ? <p className="flex items-center gap-1.5 px-3 py-2 text-[0.9rem] text-navy-500"><Loader2 size={15} className="animate-spin" /> 불러오는 중</p> : detail && <div className="px-1 pt-2"><ChangeList items={detail} /></div>)}
          </li>
        ))}
      </ul>
    </Card>
  )
}
