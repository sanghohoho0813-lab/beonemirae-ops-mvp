import { useCallback, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Loader2, RotateCw } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import { BizPlanProvider, type LoadState } from '../components/bizPlan/Provider'
import { DocView } from '../components/bizPlan/DocView'
import { RequestInbox } from '../components/bizPlan/RequestInbox'
import { VersionsTab } from '../components/bizPlan/VersionsTab'
import { ExportTab } from '../components/bizPlan/ExportTab'
import { MembersTab } from '../components/bizPlan/MembersTab'
import { usePlan, when } from '../components/bizPlan/parts'
import {
  BIZPLAN_DOC_TITLE, BIZPLAN_ENABLED, BIZPLAN_MENU_NAME, BIZPLAN_NAME, BIZPLAN_SUB, DOC_STATUSES, OPEN_REQ, summarize,
} from '../lib/bizPlan'

// ─────────────────────────────────────────────────────────────────────────────
// 제출 예정 사업계획서 — 신보 뉴본펭귄 (/bizplan) · 0146
//
//  더보기(폰) · 사이드바(PC)의 「제출 예정 사업계획서」로 엽니다(「뉴본펭귄 사전 설문」 옆).
//  담당 한 분이 쓰고, 대표님 · 이사님이 읽고 확인 표시 · 수정요청을 남깁니다.
//  **요청은 문서를 바꾸지 않습니다.** 담당이 보고 반영(또는 보류 · 반려 + 까닭)합니다.
//
//   탭: 문서 · 요청함 · 기록·버전 · 내보내기 · 참여자(관리할 수 있는 분만)
//   주소: ?tab=inbox|versions|export|members · ?f=항목키 (그 항목을 엶)
//
//  ⚠ 여는 것 · 고치는 것은 **서버가** 막습니다(bizplan_require). 화면은 따라갈 뿐입니다.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'doc' | 'inbox' | 'versions' | 'export' | 'members'
const TABS: Tab[] = ['doc', 'inbox', 'versions', 'export', 'members']

export function BizPlanPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'doc'
  const focus = params.get('f')
  const filterParam = params.get('filter')

  const exit = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }
  const setTab = useCallback(
    (t: Tab) => {
      const p = new URLSearchParams(params)
      if (t === 'doc') p.delete('tab')
      else p.set('tab', t)
      setParams(p, { replace: true })
      window.scrollTo({ top: 0 })
    },
    [params, setParams],
  )
  const openField = useCallback(
    (key: string | null) => {
      const p = new URLSearchParams(params)
      p.delete('tab')
      if (key) p.set('f', key)
      else p.delete('f')
      setParams(p, { replace: true })
    },
    [params, setParams],
  )

  if (!BIZPLAN_ENABLED) return <Notice title="지금은 열지 않습니다" body="사업계획서 공동 검토 기간이 끝났습니다." onExit={exit} />

  return (
    <BizPlanProvider onOpenField={openField} fallback={(s, retry) => <Fallback s={s} retry={retry} onExit={exit} />}>
      <Screen
        tab={tab}
        setTab={setTab}
        focus={focus}
        openField={openField}
        onExit={exit}
        filter={filterParam}
        onFilter={(f) => {
          const p = new URLSearchParams(params)
          p.delete('tab')
          p.delete('f')
          if (f) p.set('filter', f)
          else p.delete('filter')
          setParams(p, { replace: true })
        }}
      />
    </BizPlanProvider>
  )
}

function Screen({ tab, setTab, focus, openField, onExit, filter, onFilter }: { tab: Tab; setTab: (t: Tab) => void; focus: string | null; openField: (k: string | null) => void; onExit: () => void; filter: string | null; onFilter: (f: string | null) => void }) {
  const { data, fields, isEditor } = usePlan()
  const sum = useMemo(() => summarize(fields, data.requests, data.checks), [fields, data.requests, data.checks])
  const openReq = data.requests.filter((r) => OPEN_REQ.includes(r.status)).length
  const latest = useMemo(() => {
    let at = data.doc.updated_at ?? ''
    let by = data.doc.updated_by ?? ''
    for (const f of data.fields)
      if (f.updated_at && f.updated_at > at) {
        at = f.updated_at
        by = f.updated_by
      }
    return { at, by }
  }, [data])

  const tabs: [Tab, ReactNode][] = [
    ['doc', '문서'],
    ['inbox', <>요청함{openReq > 0 && <span data-tab-badge className="ml-1 rounded-full bg-orange-500 px-1.5 text-[0.8rem] text-white">{openReq}</span>}</>],
    ['versions', '기록·버전'],
    ['export', '내보내기'],
  ]
  if (data.can_manage) tabs.push(['members', '참여자'])

  return (
    <div className="min-h-[100dvh] bg-app pb-24" data-bizplan-page data-bizplan-role={data.me.role}>
      {/*  위 띠 — 돌아가기 · 이름 · 나 */}
      <header className="sticky top-0 z-30 border-b border-navy-100 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-[3.6rem] max-w-[1600px] items-center gap-2 px-3 sm:px-5">
          <button type="button" data-bizplan-exit onClick={onExit} aria-label="앱으로 돌아가기" className="flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center gap-1 rounded-full px-2 text-navy-700 hover:bg-navy-50">
            <ArrowLeft size={20} strokeWidth={2.4} /> <span className="hidden text-[0.95rem] font-bold sm:inline">AX로</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8rem] font-bold text-navy-400">{BIZPLAN_MENU_NAME}</p>
            <p className="truncate text-[1.02rem] font-extrabold text-navy-900">{BIZPLAN_NAME}</p>
          </div>
          <span data-bizplan-me className="flex shrink-0 items-center gap-1.5">
            <span className="hidden text-[0.9rem] font-bold text-navy-700 sm:inline">
              {data.me.name}
              {data.me.title ? ` · ${data.me.title}` : ''}
            </span>
            <span className={`rounded-full px-3 py-1.5 text-[0.85rem] font-extrabold ${isEditor ? 'bg-teal-50 text-teal-800' : 'bg-navy-50 text-navy-700'}`} title={isEditor ? '본문을 고치고 수정요청을 처리합니다' : '읽고 · 확인 표시 · 수정요청을 남깁니다'}>
              {isEditor ? '담당' : '검토'}
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 pt-4 sm:px-5">
        {/*  한눈에 — 상태 · 진행률 · 남은 일 */}
        <section data-bizplan-summary className="space-y-3 rounded-[22px] bg-white p-3.5 ring-1 ring-navy-100 sm:p-5 print:hidden">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
            <div className="min-w-0">
              <h1 className="break-keep text-[1.12rem] font-black leading-snug text-navy-900 sm:text-[1.45rem]">{BIZPLAN_DOC_TITLE}</h1>
              <p className="break-keep text-[0.85rem] font-semibold text-navy-500 sm:text-[0.92rem]">{BIZPLAN_SUB}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span data-doc-status={data.doc.status} className="rounded-full bg-navy-900 px-3 py-1 text-[0.88rem] font-extrabold text-white sm:py-1.5 sm:text-[0.92rem]">
                {data.doc.status}
              </span>
              {data.doc.version_label && <span className="rounded-full bg-teal-50 px-3 py-1 text-[0.88rem] font-extrabold text-teal-800 sm:py-1.5 sm:text-[0.92rem]">{data.doc.version_label}</span>}
              {data.doc.locked_label && <span className="rounded-full bg-navy-50 px-3 py-1 text-[0.85rem] font-bold text-navy-600 sm:py-1.5">제출본 {data.doc.locked_label}</span>}
            </div>
          </div>

          {/*  문서 단계 — 지금 어디인지 (폰은 위 글자 하나로) */}
          <ol className="hidden grid-cols-5 gap-1 sm:grid" aria-label="문서 단계">
            {DOC_STATUSES.map((s, i) => {
              const at = DOC_STATUSES.indexOf(data.doc.status)
              return (
                <li key={s} className={`rounded-lg px-2 py-1.5 text-center text-[0.85rem] font-extrabold ${i === at ? 'bg-navy-900 text-white' : i < at ? 'bg-navy-100 text-navy-600' : 'bg-navy-50 text-navy-400'}`}>
                  {s}
                </li>
              )
            })}
          </ol>

          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[0.9rem] font-bold text-navy-700 sm:text-[0.95rem]">
                작성 <b data-sum-written>{sum.written}</b>/{sum.total}칸 · 최종 확인 <b data-sum-final>{sum.final}</b>칸
              </span>
              <span data-sum-progress className="text-[1.05rem] font-black tabular-nums text-navy-900 sm:text-[1.1rem]">{sum.progress}%</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-navy-100" aria-hidden="true">
              <span className="bg-navy-900" style={{ width: `${sum.total ? (sum.final / sum.total) * 100 : 0}%` }} />
              <span className="bg-teal-400" style={{ width: `${sum.total ? ((sum.written - sum.final) / sum.total) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <Kpi label="검토 완료" n={sum.final} hint="최종 확인 완료" tone="navy" hook="final" />
            <Kpi label="수정 필요" n={sum.requested} hint="수정 요청 있음" tone="orange" hook="requested" />
            <Kpi label="미확인" n={sum.needCheck} hint="확인 필요 · 출처·기준일 대조" tone="amber" hook="check" />
            <Kpi label="미처리 요청" n={openReq} hint="수정요청 접수 · 검토 중" tone="orange" hook="open" onClick={() => setTab('inbox')} />
          </div>
          {sum.restale > 0 && (
            <button
              type="button"
              data-sum-recheck={sum.restale}
              onClick={() => onFilter('재확인 필요')}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-left text-[0.95rem] font-bold text-amber-900 ring-1 ring-amber-200"
            >
              <span className="min-w-0 flex-1 break-keep">재확인 필요 {sum.restale}항목 — 동의한 뒤 문장이 바뀌었습니다</span>
              <span className="shrink-0 text-[0.88rem]">보기 ›</span>
            </button>
          )}
          {latest.at && (
            <p data-sum-latest className="text-[0.85rem] text-navy-500 sm:text-[0.9rem]">
              최종 수정 · {latest.by} {when(latest.at)}
            </p>
          )}
        </section>

        {/*  탭 */}
        <div role="tablist" aria-label="사업계획서 화면" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
          {tabs.map(([k, lb]) => (
            <button
              key={k}
              type="button"
              role="tab"
              data-bizplan-tab={k}
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-[46px] shrink-0 whitespace-nowrap rounded-xl px-3.5 text-[0.98rem] sm:px-4 sm:text-[1rem] font-extrabold transition ${tab === k ? 'bg-navy-900 text-white shadow-sm' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'}`}
            >
              {lb}
            </button>
          ))}
        </div>

        {tab === 'doc' && <DocView focus={focus} onFocus={openField} initialFilter={filter} />}
        {tab === 'inbox' && <RequestInbox onGo={(k) => openField(k)} />}
        {tab === 'versions' && <VersionsTab onGo={(k) => openField(k)} />}
        {tab === 'export' && <ExportTab onGo={(k) => openField(k)} />}
        {tab === 'members' && data.can_manage && <MembersTab />}
      </main>
    </div>
  )
}

function Kpi({ label, n, hint, tone, hook, onClick }: { label: string; n: number; hint: string; tone: 'navy' | 'orange' | 'amber'; hook: string; onClick?: () => void }) {
  const c = { navy: 'text-navy-900', orange: n > 0 ? 'text-orange-700' : 'text-navy-900', amber: n > 0 ? 'text-amber-700' : 'text-navy-900' }[tone]
  //  폰은 네 칸 한 줄(숫자 + 이름), PC 는 설명까지
  const body = (
    <>
      <span className={`block text-[1.3rem] font-black tabular-nums leading-tight sm:order-2 sm:text-[1.5rem] ${c}`}>{n}</span>
      <span className="block break-keep text-[0.8rem] font-bold leading-tight text-navy-500 sm:order-1 sm:text-[0.9rem]">{label}</span>
      <span className="hidden break-keep text-[0.8rem] font-semibold text-navy-400 sm:order-3 sm:block">{hint}</span>
    </>
  )
  const cls = 'flex flex-col rounded-2xl bg-navy-50/70 px-2 py-2 text-center sm:px-3 sm:py-2.5 sm:text-left'
  return onClick ? (
    <button type="button" data-kpi={hook} onClick={onClick} title={hint} className={`${cls} transition hover:bg-navy-100`}>
      {body}
    </button>
  ) : (
    <div data-kpi={hook} title={hint} className={cls}>
      {body}
    </div>
  )
}

function Fallback({ s, retry, onExit }: { s: Exclude<LoadState, { kind: 'ready' }>; retry: () => void; onExit: () => void }) {
  if (s.kind === 'loading')
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-app px-6">
        <p className="flex items-center gap-2.5 text-[1.05rem] font-bold text-navy-500" data-bizplan-loading>
          <Loader2 size={20} className="animate-spin" /> 사업계획서를 여는 중…
        </p>
      </div>
    )
  const k = s.error.kind
  return (
    <Notice
      title={k === 'denied' ? '참여자만 열 수 있습니다' : k === 'missing' ? '아직 서버 준비 전입니다' : '사업계획서를 열 수 없습니다'}
      body={s.error.message}
      hook={k}
      onExit={onExit}
      onRetry={k === 'offline' || k === 'other' ? retry : undefined}
    />
  )
}

function Notice({ title, body, hook, onExit, onRetry }: { title: string; body: string; hook?: string; onExit: () => void; onRetry?: () => void }) {
  return (
    <div data-bizplan-fail={hook ?? 'off'} className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-app px-6 text-center">
      <BrandLogo size="md" />
      <AlertTriangle size={30} className="text-amber-600" />
      <h1 className="break-keep text-[1.3rem] font-extrabold text-navy-900">{title}</h1>
      <p className="max-w-sm break-keep text-[1.05rem] leading-relaxed text-navy-600">{body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <button type="button" data-bizplan-retry onClick={onRetry} className="btn-primary">
            <RotateCw size={18} /> 다시 시도
          </button>
        )}
        <button type="button" data-bizplan-exit onClick={onExit} className="btn-ghost">
          <ArrowLeft size={18} strokeWidth={2.4} /> 앱으로 돌아가기
        </button>
      </div>
    </div>
  )
}
