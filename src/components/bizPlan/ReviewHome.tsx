import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronRight, Loader2, Scale, Wallet } from 'lucide-react'
import { REVIEW_KEYS, FIELD_BY_KEY, isEditable, currentChecks } from '../../lib/bizPlan'
import { resolveDecision } from '../../lib/bizStrategy'
import { strategyOpen, type StrategyOpen } from '../../lib/bizStrategyApi'
import { DocView } from './DocView'
import { usePlan } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 확인 · 결정 — 대표님 · 이사님이 사업계획서(/bizplan)를 열면 처음 보는 화면
//
//  ① 사업화전략 결정(0148) — 고르실 것이 몇 개 남았는지 · 의견 조율이 필요한 것
//  ② 자금소요 및 조달계획(9번 · 별첨 1차년도 소요자금) — 칸마다 확인 표시 · 수정요청 (문서 보기 그대로)
//  나머지 장은 담당이 작성했습니다 — 「사업계획서 전문」(맨 아래 단추 · 탭)에서 필요할 때만 봅니다.
//
//  이 화면은 아무것도 저장하지 않습니다. 고르기 · 확인 표시 · 수정요청은 각 화면의 기존 흐름 그대로입니다.
// ─────────────────────────────────────────────────────────────────────────────

type Load = { kind: 'loading' } | { kind: 'fail' } | { kind: 'ready'; data: StrategyOpen }

export function ReviewHome({ focus, onFocus, onDecide, onFullDoc }: {
  focus: string | null
  onFocus: (key: string | null) => void
  /** 사업화전략 ③ 결정으로 (결정 하나를 고르면 그 자리로) */
  onDecide: (key?: string) => void
  onFullDoc: () => void
}) {
  const { data, fields, checksByKey } = usePlan()
  const [st, setSt] = useState<Load>({ kind: 'loading' })
  useEffect(() => {
    let live = true
    strategyOpen()
      .then((d) => live && setSt({ kind: 'ready', data: d }))
      .catch(() => live && setSt({ kind: 'fail' }))
    return () => {
      live = false
    }
  }, [])

  //  ② 자금 칸 — 내가 지금 문장에 확인 표시를 남긴 칸 수
  const money = useMemo(() => {
    const keys = [...REVIEW_KEYS].filter((k) => {
      const d = FIELD_BY_KEY.get(k)?.def
      return d && isEditable(d)
    })
    const mine = keys.filter((k) => currentChecks(checksByKey.get(k) ?? [], fields.get(k)).some((c) => c.profile_id === data.me.id)).length
    return { n: keys.length, mine }
  }, [checksByKey, fields, data.me.id])

  return (
    <div className="space-y-4" data-review-home>
      <div className="px-1">
        <h2 className="break-keep text-[1.15rem] font-black text-navy-900 sm:text-[1.25rem]">대표님 · 이사님께서 보실 것</h2>
        <p className="break-keep text-[0.95rem] text-navy-600">아래 두 가지만 보시고 고르거나 확인해 주세요. 나머지는 담당이 작성했습니다.</p>
      </div>

      <Decisions st={st} myId={data.me.id} onDecide={onDecide} />

      <section className="space-y-3" data-review-money>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 ring-1 ring-navy-100">
          <Wallet size={22} className="shrink-0 text-teal-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="break-keep text-[1.05rem] font-extrabold text-navy-900">② 자금소요 및 조달계획 — 확인</p>
            <p className="break-keep text-[0.9rem] text-navy-500">칸을 누르면 「동의」 표시나 수정요청을 남기실 수 있습니다. 누르셔도 본문은 바뀌지 않습니다.</p>
          </div>
          <span data-review-money-mine={money.mine} className="shrink-0 rounded-full bg-navy-50 px-3 py-1 text-[0.9rem] font-extrabold text-navy-700">
            내 확인 {money.mine}/{money.n}칸
          </span>
        </div>
        <DocView mode="review" focus={focus} onFocus={onFocus} />
      </section>

      <button
        type="button"
        data-review-fulldoc
        onClick={onFullDoc}
        className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-navy-200 transition hover:bg-navy-50"
      >
        <BookOpen size={20} className="shrink-0 text-navy-500" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-extrabold text-navy-800">사업계획서 전문 보기</span>
          <span className="block break-keep text-[0.88rem] text-navy-500">기업 현황 · 사업 내용 · 추진계획 등 나머지 장 — 필요할 때만 열어 보세요</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-navy-400" aria-hidden="true" />
      </button>
    </div>
  )
}

function Decisions({ st, myId, onDecide }: { st: Load; myId: string; onDecide: (key?: string) => void }) {
  const sum = useMemo(() => {
    if (st.kind !== 'ready' || !st.data.strategy) return null
    const d = st.data
    const rev = d.strategy!.assump_rev
    const items = d.strategy!.model.decisions.map((dec) => {
      const res = resolveDecision(dec.key, d.decisions, d.deciders, rev)
      const picked = d.decisions.some((r) => r.key === dec.key && r.profile_id === myId && r.assump_rev === rev && !!r.choice)
      return { key: dec.key, no: dec.no, title: dec.title, state: res.state, picked }
    })
    return {
      items,
      isDecider: d.is_decider,
      left: items.filter((x) => !x.picked),
      agreed: items.filter((x) => x.state === '합의').length,
      split: items.filter((x) => x.state === '의견 조율 필요').length,
      //  눌러서 바로 갈 결정 — 내가 아직 안 고른 것 · 두 분 선택이 갈린 것
      todo: items.filter((x) => (d.is_decider && !x.picked) || x.state === '의견 조율 필요'),
    }
  }, [st, myId])

  return (
    <section className="space-y-3 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-navy-100" data-review-decisions>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Scale size={22} className="shrink-0 text-teal-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="break-keep text-[1.05rem] font-extrabold text-navy-900">① 사업화전략 — 고르실 것</p>
          <p className="break-keep text-[0.9rem] text-navy-500">3개년 매출 · 가격 · 자금배분 등. 두 분이 같은 안을 고르면 합의로 봅니다. 고르셔도 본문은 바로 바뀌지 않습니다.</p>
        </div>
      </div>
      {st.kind === 'loading' && (
        <p className="flex items-center gap-2 text-[0.92rem] font-bold text-navy-500">
          <Loader2 size={16} className="animate-spin" /> 불러오는 중…
        </p>
      )}
      {st.kind === 'fail' && <p data-review-decisions-fail className="break-keep text-[0.92rem] font-bold text-navy-500">결정 현황을 불러오지 못했습니다 — 아래 단추로 사업화전략 화면에서 보실 수 있습니다.</p>}
      {st.kind === 'ready' && !sum && <p className="break-keep text-[0.92rem] font-bold text-navy-500">아직 사업화전략 자료가 올라오지 않았습니다.</p>}
      {sum && (
        <>
          <div className="flex flex-wrap gap-1.5 text-[0.92rem] font-extrabold">
            {sum.isDecider && (
              <span data-review-left={sum.left.length} className={`rounded-full px-3 py-1 ${sum.left.length > 0 ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200' : 'bg-teal-50 text-teal-800'}`}>
                {sum.left.length > 0 ? `남은 것 ${sum.left.length}개` : '모두 고르셨습니다'} · 전체 {sum.items.length}개
              </span>
            )}
            <span data-review-agreed={sum.agreed} className="rounded-full bg-navy-50 px-3 py-1 text-navy-700">합의 {sum.agreed}/{sum.items.length}</span>
            {sum.split > 0 && (
              <span data-review-split={sum.split} className="rounded-full bg-amber-50 px-3 py-1 text-amber-900 ring-1 ring-amber-200">의견 조율 필요 {sum.split}</span>
            )}
          </div>
          {sum.todo.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="고르실 결정">
              {sum.todo.map((x) => (
                <li key={x.key}>
                  <button
                    type="button"
                    data-review-decision={x.key}
                    onClick={() => onDecide(x.key)}
                    className={`inline-flex min-h-[44px] items-center gap-1 rounded-full px-3.5 text-[0.95rem] font-bold ring-1 ring-inset ${x.state === '의견 조율 필요' ? 'bg-amber-50 text-amber-900 ring-amber-300' : 'bg-white text-navy-800 ring-navy-200 hover:bg-navy-50'}`}
                  >
                    {x.no}. {x.title}
                    {x.state === '의견 조율 필요' && <span className="text-[0.8rem] font-extrabold">· 의견 조율</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button type="button" data-review-decide onClick={() => onDecide()} className="btn-primary min-h-[48px] w-full justify-center sm:w-auto">
        결정 화면으로 가기 <ChevronRight size={18} />
      </button>
    </section>
  )
}
