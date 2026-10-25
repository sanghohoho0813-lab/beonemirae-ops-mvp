import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { metrics, type QAItem } from '../../../lib/bizStrategy'
import { FIELD_BY_KEY } from '../../../lib/bizPlan'
import { usePlan } from '../parts'
import { KindBadge, Lines, More, StateChip, useStrategy } from './ctx'

// ④ 신보 심사 대응 — 「악마판사」 질문마다: 지금 설명할 수 있는 답 · 뒷받침 자료 · 아직 확인 안 된 것 ·
//    추가 검증 계획 · 관련 사업계획서 칸. 확인되지 않은 것을 그럴듯한 답으로 덮지 않습니다.

const STATUS_TONE: Record<QAItem['status'], string> = {
  '설명 가능': 'bg-teal-50 text-teal-800 ring-teal-200',
  '보완 필요': 'bg-amber-50 text-amber-800 ring-amber-300',
  '근거 부족': 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function Review() {
  const s = useStrategy()
  const qa = s.model.qa
  const areas = [...new Set(qa.map((q) => q.area))]
  const [area, setArea] = useState<string>('전체')
  const mt = useMemo(() => metrics(s.result), [s.result])
  const list = area === '전체' ? qa : qa.filter((q) => q.area === area)
  const count = (st: QAItem['status']) => qa.filter((q) => q.status === st).length
  return (
    <div className="space-y-4" data-strategy-review>
      <div className="space-y-2 rounded-[22px] bg-white p-4 ring-1 ring-navy-100 sm:p-5">
        <h2 className="text-[1.12rem] font-black text-navy-900">심사위원이 물을 질문 {qa.length}개</h2>
        <p className="break-keep text-[0.95rem] text-navy-600">방어는 회피가 아니라 사실 · 숫자 · 조건을 정확히 말하는 것입니다. 확인되지 않은 부분은 「아직 확인 안 됨」으로 그대로 둡니다.</p>
        <p className="flex flex-wrap gap-1.5 text-[0.9rem] font-bold">
          <span className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${STATUS_TONE['설명 가능']}`}>설명 가능 {count('설명 가능')}</span>
          <span className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${STATUS_TONE['보완 필요']}`}>보완 필요 {count('보완 필요')}</span>
          <span className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${STATUS_TONE['근거 부족']}`}>근거 부족 {count('근거 부족')}</span>
        </p>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="질문 분야">
        {['전체', ...areas].map((a) => (
          <button key={a} type="button" role="tab" aria-selected={area === a} data-qa-area={a} onClick={() => setArea(a)}
            className={`min-h-[42px] shrink-0 rounded-full px-3.5 text-[0.93rem] font-extrabold ${area === a ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200'}`}>
            {a} {a === '전체' ? qa.length : qa.filter((q) => q.area === a).length}
          </button>
        ))}
      </div>
      {list.map((q) => <QACard key={q.id} q={q} mt={mt} />)}
      {s.model.research.length > 0 && <Sources />}
    </div>
  )
}

function QACard({ q, mt }: { q: QAItem; mt: Record<string, string> }) {
  const s = useStrategy()
  const plan = usePlan()
  return (
    <section data-anchor={`q-${q.id}`} data-qa={q.id} className="scroll-mt-20 space-y-2.5 rounded-[22px] bg-white p-4 ring-1 ring-navy-100 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-keep text-[1.06rem] font-black leading-snug text-navy-900">
          <span className="mr-1.5 rounded-md bg-navy-100 px-1.5 py-0.5 text-[0.8rem] font-extrabold text-navy-600">{q.area}</span>
          「{q.question}」
        </p>
        <span data-qa-status={q.status} className={`shrink-0 rounded-full px-2.5 py-1 text-[0.85rem] font-extrabold ring-1 ring-inset ${STATUS_TONE[q.status]}`}>{q.status}</span>
      </div>
      <div className="rounded-xl bg-teal-50/60 px-3 py-2">
        <p className="text-[0.85rem] font-extrabold text-teal-800">지금 설명할 수 있는 답</p>
        <p data-qa-answer className="mt-0.5 whitespace-pre-wrap break-keep text-[0.98rem] leading-relaxed text-navy-800">{q.answer}</p>
      </div>
      {(q.metrics?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5" data-qa-metrics>
          {q.metrics!.map((k) => (
            <span key={k} className="rounded-full bg-navy-50 px-2.5 py-1 text-[0.85rem] font-bold tabular-nums text-navy-700">
              {METRIC_NAME(k)}: {mt[k] ?? '계산 불가'}
            </span>
          ))}
          <span className="self-center text-[0.8rem] text-navy-400">지금 보기 기준 계산값</span>
        </div>
      )}
      <More label={`뒷받침 자료 ${q.evidence.length} · 아직 확인 안 된 것 ${q.gaps.length} · 검증 계획 ${q.plan.length}`} hook={`qa-${q.id}`}>
        <div className="space-y-2">
          <div className="rounded-xl bg-navy-50/50 px-3 py-2">
            <p className="mb-1 flex items-center gap-1.5 text-[0.88rem] font-extrabold text-navy-600">뒷받침 자료 <KindBadge kind="확인된 사실" small /></p>
            <Lines items={q.evidence} empty="아직 없음" />
          </div>
          <div className="rounded-xl bg-amber-50/70 px-3 py-2">
            <p className="mb-1 flex items-center gap-1.5 text-[0.88rem] font-extrabold text-amber-800">아직 확인되지 않은 부분 <KindBadge kind="추가 검증 필요" small /></p>
            <Lines items={q.gaps} empty="없음" />
          </div>
          <div className="rounded-xl bg-navy-50/50 px-3 py-2">
            <p className="mb-1 text-[0.88rem] font-extrabold text-navy-600">추가 검증 계획</p>
            <Lines items={q.plan} empty="없음" />
          </div>
        </div>
      </More>
      {((q.fields?.length ?? 0) > 0 || (q.decisions?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {(q.fields ?? []).map((k) => (
            <button key={k} type="button" data-qa-field={k} onClick={() => plan.openField(k)} className="inline-flex min-h-[38px] items-center gap-1 rounded-full bg-navy-50 px-3 text-[0.85rem] font-bold text-navy-700 hover:bg-navy-100">
              <ExternalLink size={13} /> {FIELD_BY_KEY.get(k)?.def.label?.replace(/\s+/g, ' ').slice(0, 24) ?? k}
            </button>
          ))}
          {(q.decisions ?? []).map((k) => {
            const d = s.model.decisions.find((x) => x.key === k)
            return d ? (
              <button key={k} type="button" data-qa-decision={k} onClick={() => s.goSection('decisions', `d-${k}`)} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-violet-50 px-3 text-[0.85rem] font-bold text-violet-800">
                결정 {d.no}. {d.title.slice(0, 16)} <StateChip state={s.states[k]} />
              </button>
            ) : null
          })}
        </div>
      )}
    </section>
  )
}

function METRIC_NAME(k: string): string {
  const [a, b, c] = k.split('.')
  const y = /^\d{4}$/.test(b ?? '') ? `${b}년 ` : /^\d{4}$/.test(c ?? '') ? `${c}년 ` : ''
  const map: Record<string, string> = {
    total: '전체 매출', legacy: '기존 사업', saas: 'SaaS 매출', b2b: 'B2B 매출',
    'saas.end': 'SaaS 연말 고객', 'saas.avg': 'SaaS 연평균 고객', 'saas.new': 'SaaS 신규', 'saas.arpu': '월 고객매출', 'saas.contacts': '필요 접촉',
    'saas.setup': '설정비', 'saas.referral': '추천 할인', 'b2b.gmv': 'B2B 거래총액', 'b2b.direct': '직접판매', 'b2b.broker': '중개 수수료',
    'b2b.service': '서비스 수수료', 'b2b.ads': '입점·광고', 'b2b.gross': 'B2B 매출총이익', 'b2b.contribution': 'B2B 기여이익', 'b2b.nwc': 'B2B 운전자금', 'b2b.purchase': '월 매입자금',
    'prod.rate': '업무시간 감소율', 'prod.save': '하루 절감', 'prod.yearHours': '연 절감시간', 'prod.value': '시간 가치',
    'funding.total': '예비예산', 'funding.guarantee': '보증 검토액', 'funding.check': '신보 확인 필요', 'funding.firstYear': '1차년도 사용분',
    'market.share': '시장 점유율', 'legacy.growth': '기존 사업 연 성장', 'legacy.base': '기준연도 매출',
  }
  const two = `${a}.${b}`
  if (map[two] && !/^\d{4}$/.test(b ?? '')) return y + map[two]
  if (k.startsWith('app.')) return `신보 ${b?.replace('y', '')}차년도 ${c === 'period' ? '기간' : '매출'}`
  return y + (map[a] ?? k)
}

function Sources() {
  const s = useStrategy()
  return (
    <section data-sources className="space-y-2 rounded-[22px] bg-white p-4 ring-1 ring-navy-100 sm:p-5">
      <h2 className="text-[1.08rem] font-black text-navy-900">조사자료 · 출처 {s.model.research.length}</h2>
      <p className="break-keep text-[0.9rem] text-navy-500">발표기관 · 발표일 · 기준연도 · 범위를 함께 적었습니다. 찾지 못한 숫자는 만들어 넣지 않았습니다.</p>
      <More label="출처 목록 보기" hook="sources">
        <ul className="space-y-2">
          {s.model.research.map((r) => (
            <li key={r.id} data-source={r.id} className="space-y-0.5 rounded-xl bg-navy-50/50 px-3 py-2">
              <p className="flex flex-wrap items-center gap-1.5 text-[0.85rem] font-bold text-navy-500">{r.topic} <KindBadge kind={r.kind} small /></p>
              <p className="break-keep text-[0.96rem] text-navy-800">{r.claim}{r.value ? ` — ${r.value}` : ''}</p>
              <p className="break-all text-[0.82rem] text-navy-500">
                {[r.publisher, r.title, r.published && `발표 ${r.published}`, r.baseYear && `기준 ${r.baseYear}`, r.scope, r.reliability].filter(Boolean).join(' · ')}
                {r.url && <> · <a href={r.url} target="_blank" rel="noreferrer noopener" className="font-bold text-teal-700 underline">원문</a></>}
              </p>
            </li>
          ))}
        </ul>
      </More>
    </section>
  )
}
