import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Phone,
  PlusCircle,
  Send,
  Smartphone,
  Siren,
  Truck,
  PackagePlus,
  GraduationCap,
  Inbox,
  CalendarPlus,
  Clock,
  Undo2,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePresenter } from '../context/PresenterContext'
import { useAuth } from '../context/AuthContext'
import { canSeeMoney } from '../lib/access'
import { PageShell, SectionTitle, EmptyState, FilterChip, KpiCard } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { PageHeader } from '../components/PageHeader'
import { InquiryInbox } from '../components/InquiryInbox'
import { BookVisitModal } from '../components/BookVisit'
import { Modal } from '../components/Modal'
import { clientRequests, type RequestItem } from '../lib/ops'
import { customerServiceStats } from '../lib/portal'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { snoozeRequest } from '../lib/repo'
import { prettyDate, shiftDays, today } from '../lib/format'
import { REQUEST_REVENUE, REQUEST_TONE, STATUS_TONE, TONE } from '../lib/tone'
import { REQUEST_KINDS, REQUEST_KIND_LABEL, type RequestKind, type RequestStatus } from '../types'
import { AiButton } from '../components/AiAction'
import { aiAssist, aiTriageRequest, markAiCallEdited, type TriageResult } from '../lib/evidenceRepo'
import { planInput, type PlanResult } from '../lib/requestPlan'
import { AiRequestPlan, PLAN_EMPTY, type PlanView } from '../components/AiRequestPlan'
import { Sparkles, Loader2 } from 'lucide-react'
import { aiVendor } from '../lib/aiVendor'
import { dispatchHint } from '../lib/dispatchHint'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 요청 (비원미래 담당자 화면)
//
//  병원 포털에서 올라온 요청과 전화·카톡으로 받아 대신 접수한 요청을 한 곳에서
//  처리합니다. 여기서 남긴 회신은 병원 포털에 그대로 보이고, 수거를 완료하면
//  관련 요청은 자동으로 닫힙니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 요청 유형 아이콘 — 무엇을 원하는 요청인지 글자 없이도 구분되게 */
const KIND_ICON: Record<RequestKind, typeof Siren> = {
  긴급수거: Siren,
  추가수거: Truck,
  소모품: PackagePlus,
  '교육·자료': GraduationCap,
  기타: MessageSquare,
}

const FLOW: RequestStatus[] = ['접수', '확인 중', '일정 반영', '처리 완료']

/** 요청 하나에 대한 AI 분석 상태 (0138) */
interface AiView {
  busy: boolean
  callId: string | null
  result: TriageResult | null
  ms: number | null
  error: string | null
  /** 서버가 호출 기록을 남겼는가 */
  logged: boolean
  /** 담당자가 「초안 사용」을 눌렀는가 */
  usedDraft: boolean
}
const AI_EMPTY: AiView = { busy: false, callId: null, result: null, ms: null, error: null, logged: true, usedDraft: false }
/** 긴급도 색 — 높음만 빨강 */
const AI_URGENCY_TONE: Record<string, string> = {
  높음: 'bg-rose-50 text-rose-700',
  보통: 'bg-amber-50 text-amber-800',
  낮음: 'bg-navy-100 text-navy-700',
}

type Filter = '진행 중' | '전체' | '병원 직접' | '긴급' | '내려 둔 것'

export function Requests() {
  const { data, handleRequest, addRequest, reload } = useData()
  //  ── 현장 담당자에게는 「연결되는 매출」을 안 적습니다 ────────────────────
  //
  //   이 화면은 현장 담당자도 엽니다 — 병원이 올린 요청을 보고 가야 하기
  //   때문입니다. 그런데 요청마다 「연결되는 매출: 추가 수거 매출」이 함께
  //   붙어 있었습니다. 금액은 아니지만 **영업 정보**입니다.
  //
  //   전수 감사(check_fieldperm)에서 현장 화면 7곳을 훑다가 잡았습니다.
  //   요청 자체는 그대로 보입니다 — 지운 것은 그 한 줄뿐입니다.
  //
  //   시연에는 로그인이 없어 role 이 null 입니다. 역할만 보고 가리면 시연에서
  //   이 줄이 통째로 사라져, 「요청 처리가 곧 영업」이라는 설명이 없어집니다.
  const { role, mode } = useAuth()
  const showRevenueLine = mode !== 'live' || canSeeMoney(role)
  //  ── 요청을 그 자리에서 날짜로 바꾸기 (0058) ─────────────────────────────
  //
  //   지금까지 「일정 반영」은 **말**이었습니다. 눌러도 일정이 생기지 않아
  //   사람이 따로 기억해 두었다가 그날 아침에 챙겨야 했습니다. 잊으면
  //   병원에는 「반영했습니다」라고 적혀 있는데 차는 안 갑니다 — 가장 나쁜
  //   방식으로 신뢰가 깨집니다. 이제 날짜를 잡으면 진짜 일정이 생기고,
  //   그 결과로 요청이 「일정 반영」으로 넘어갑니다.
  const [bookFor, setBookFor] = useState<RequestItem | null>(null)
  const [filter, setFilter] = useState<Filter>('진행 중')
  //  문의 표는 판 83 부터입니다 (0083).
  const schema83 = useSchemaAtLeast(83)
  const [replyTo, setReplyTo] = useState<RequestItem | null>(null)
  const [replyText, setReplyText] = useState('')
  //  0106 — 저장 결과를 그 자리에 적습니다. 예전에는 저장 전에 창이 닫혔고 실패해도 표시가 없었습니다.
  const [saveMsg, setSaveMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  //  그 병원에 오늘 이후로 잡힌(무르지 않은·아직 안 끝난) 방문이 있는가 (0131)
  const hasUpcoming = (clientId: string) =>
    data.schedules.some((x) => x.clientId === clientId && x.date >= today() && x.status !== '완료' && !x.canceledAt)
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyErr, setReplyErr] = useState<string | null>(null)
  //  0106 · 0138 — AI 요청 분석 (서버 함수 ai-triage). 판 106 + 사무실·관리자 + 실운영에서만 칸이 있습니다.
  //  서버도 역할을 다시 확인합니다. 키·배포가 없으면 실패를 그대로 적습니다 — 가짜 초안을 만들지 않습니다.
  //  ⚠ AI 결과는 **요청마다** 따로 둡니다. 창을 닫았다 다시 열면 같은 요청의 최근 결과를
  //    다시 보여 주고(다시 부르지 않음 — 비용), 다른 요청의 결과가 섞이지 않습니다.
  const ready106 = useSchemaAtLeast(106) === true
  const [aiByReq, setAiByReq] = useState<Record<string, AiView>>({})
  //  연타 방지 — 상태가 다음 그림에 반영되기 전 두 번째 누름도 막습니다.
  const aiBusy = useRef<Set<string>>(new Set())
  const ai: AiView = (replyTo && aiByReq[replyTo.id]) || AI_EMPTY
  const setAiFor = (id: string, patch: Partial<AiView>) => setAiByReq((m) => ({ ...m, [id]: { ...(m[id] ?? AI_EMPTY), ...patch } }))
  //  0142 — AI 처리 계획 (요청 분석과 **같이** 부름 · 요청마다 따로)
  const [planByReq, setPlanByReq] = useState<Record<string, PlanView & { used: boolean }>>({})
  const plan = (replyTo && planByReq[replyTo.id]) || { ...PLAN_EMPTY, used: false }
  const setPlanFor = (id: string, patch: Partial<PlanView & { used: boolean }>) =>
    setPlanByReq((m) => ({ ...m, [id]: { ...PLAN_EMPTY, ...(m[id] ?? { used: false }), ...patch } }))
  const { profile } = useAuth()
  const canAi = ready106 && mode === 'live' && (role === 'admin' || role === 'office')
  const [newOpen, setNewOpen] = useState(false)
  //  ── 요청 잠시 내려 두기 (0076) ────────────────────────────────────────
  const canSnooze = useSchemaAtLeast(76) === true && (role === 'admin' || role === 'office') && mode === 'live'
  const [snoozeFor, setSnoozeFor] = useState<RequestItem | null>(null)
  const [snoozeDays, setSnoozeDays] = useState(30)
  const [snoozeWhy, setSnoozeWhy] = useState('')
  const [snoozeErr, setSnoozeErr] = useState('')
  const [snoozeBusy, setSnoozeBusy] = useState(false)
  const [newError, setNewError] = useState<string | null>(null)
  //  한 번의 「접수」에 하나. 실패해도 바뀌지 않습니다 (0055).
  const [newRequestId, setNewRequestId] = useState(() => crypto.randomUUID())
  const [nClient, setNClient] = useState('')
  const [nKind, setNKind] = useState<RequestKind>('추가수거')
  const [nContent, setNContent] = useState('')

  const all = useMemo(() => clientRequests(data), [data])
  const stats = useMemo(() => customerServiceStats(data), [data])

  //  ⚠ 0076 — **잠시 내려 둔 것**은 「진행 중」에서 뺍니다. 대표님 지적:
  //    검증용 요청 2건이 몇 주째 떠 있었습니다. 늘 떠 있는 숫자는 곧 안 보게
  //    되고, 그러면 진짜 요청이 와도 눈에 안 들어옵니다.
  //  ⚠ 지운 것도 처리한 것도 아닙니다 — 「내려 둔 것」에서 언제든 볼 수 있고,
  //    기한이 지나면 저절로 돌아옵니다.
  const t = today()
  const isSnoozed = (r: RequestItem) => !!r.snoozedUntil && r.snoozedUntil > t
  const snoozedCount = all.filter((r) => r.status !== '처리 완료' && isSnoozed(r)).length

  const rows = all.filter((r) => {
    if (filter === '내려 둔 것') return r.status !== '처리 완료' && isSnoozed(r)
    if (isSnoozed(r) && filter !== '전체') return false
    if (filter === '진행 중') return r.status !== '처리 완료'
    if (filter === '병원 직접') return r.source === 'portal'
    //  긴급 칸은 **아직 할 일**만 — 끝난 긴급이 섞이면 지금 급한 게 묻힙니다 (0131)
    if (filter === '긴급') return r.urgent && r.status !== '처리 완료'
    return true
  })

  //  ── ?focus=<요청 id> — 발표 가이드의 AI 시연이 그 요청으로 바로 데려옵니다 (0140) ──
  //   목록에서 찾지 않게 그 카드로 내려 주고 테두리를 둡니다. 거르기 때문에 안 보이면 「전체」로.
  const [sp] = useSearchParams()
  const focusId = sp.get('focus')
  const focusInAll = !!focusId && all.some((r) => r.id === focusId)
  const focusShown = !!focusId && rows.some((r) => r.id === focusId)
  useEffect(() => {
    if (focusInAll && !focusShown) setFilter('전체')
  }, [focusInAll, focusShown])
  //  발표 중(0140) — 시연 요청으로 왔으면 **그 요청만** 보입니다. 프로젝터에 다른 병원(실제 거래처)의
  //  요청 글 · 이름이 비치지 않게. 발표 가이드를 끝내면 원래 목록 그대로.
  const presenter = usePresenter()
  const demoOnly = presenter.active && focusInAll
  const listRows = demoOnly ? all.filter((r) => r.id === focusId) : rows
  const focusScrolled = useRef('')
  useEffect(() => {
    if (!focusId || !focusShown || focusScrolled.current === focusId) return
    focusScrolled.current = focusId
    requestAnimationFrame(() => document.querySelector('[data-req-focus]')?.scrollIntoView({ block: 'center' }))
  }, [focusId, focusShown])

  async function doSnooze() {
    if (!snoozeFor) return
    setSnoozeBusy(true)
    setSnoozeErr('')
    try {
      await snoozeRequest(snoozeFor.id, shiftDays(snoozeDays), snoozeWhy.trim())
      await reload()
      setSnoozeFor(null)
    } catch (e) {
      setSnoozeErr(e instanceof Error ? e.message : '내려 두지 못했습니다.')
    }
    setSnoozeBusy(false)
  }

  async function unsnooze(id: string) {
    try {
      await snoozeRequest(id, null, '')
      await reload()
    } catch (e) {
      setSnoozeErr(e instanceof Error ? e.message : '다시 꺼내지 못했습니다.')
    }
  }

  const submitReply = async () => {
    if (!replyTo) return
    setReplyBusy(true); setReplyErr(null)
    const text = replyText.trim()
    const res = await handleRequest(replyTo.id, { reply: text })
    setReplyBusy(false)
    if (!res.ok) {
      //  창을 닫지 않습니다 — 적은 글이 사라지면 그 통화 내용은 어디에도 없습니다.
      setReplyErr(res.error ?? '회신을 저장하지 못했습니다. 다시 시도해 주세요.')
      return
    }
    //  AI 초안이 그대로 쓰이지 않았으면 그 사실을 남깁니다 — 「AI 결과가 그대로 쓰였나」의 근거.
    //  고쳐 썼는지([수정]) · 초안을 안 썼는지([초안 미사용])를 메모 앞에 적습니다.
    const view = aiByReq[replyTo.id]
    if (view?.callId && view.result && view.result.draft.trim() !== text) {
      markAiCallEdited(view.callId, `${view.usedDraft ? '[수정]' : '[초안 미사용]'} ${text}`.slice(0, 300))
        .catch(() => { /* 기록 실패는 회신을 되돌리지 않습니다 */ })
    }
    setSaveMsg((m) => ({ ...m, [replyTo.id]: { ok: true, text: '회신 저장됨 — 병원 화면에 보입니다' } }))
    setAiByReq((m) => {
      const next = { ...m }
      delete next[replyTo.id]
      return next
    })
    setReplyTo(null)
    setReplyText('')
  }

  const setStatus = async (r: RequestItem, st: RequestStatus) => {
    setSaveMsg((m) => ({ ...m, [r.id]: { ok: true, text: '저장 중…' } }))
    const res = await handleRequest(r.id, { status: st })
    setSaveMsg((m) => ({ ...m, [r.id]: res.ok ? { ok: true, text: `「${st}」 저장됨` } : { ok: false, text: res.error ?? '저장 실패 — 다시 눌러 주세요' } }))
  }

  const runAi = async () => {
    if (!replyTo || !canAi) return
    const id = replyTo.id
    if (aiBusy.current.has(id)) return
    aiBusy.current.add(id)
    setAiFor(id, { busy: true, error: null })
    //  시연 요청이면 서버에 닿지 못한 실패 기록도 시연으로 남깁니다 (운영 실적과 분리).
    const src = data.requests.find((x) => x.id === id)
    const demo = !!src?.demoSessionId || !!data.clients.find((c) => c.id === src?.clientId)?.isDemoGenerated
    //  0142 — 처리 계획은 따로 기다립니다(분석 결과는 먼저 보이고, 계획은 이어서 채워짐)
    setPlanFor(id, { busy: true, error: '', result: null, used: false })
    const planRun = (async () => {
      const r = await aiAssist<PlanResult>('request_plan', planInput(data, replyTo), profile?.name ?? '')
      if (r.ok) setPlanFor(id, { busy: false, error: '', result: r.result, ms: r.ms, logged: r.logged })
      else setPlanFor(id, { busy: false, error: r.error, result: null, ms: r.ms })
    })()
    try {
      const res = await aiTriageRequest({ requestId: id, actorName: profile?.name ?? '', demo })
      if (res.ok) setAiFor(id, { busy: false, callId: res.callId, result: res.result, ms: res.ms, error: null, logged: res.logged, usedDraft: false })
      else setAiFor(id, { busy: false, callId: res.callId, result: null, ms: res.ms, error: res.error })
      await planRun
    } finally {
      aiBusy.current.delete(id)
    }
  }

  //  ⚠ 0143 — 대표님: 「초안 사용 눌러도 반응이 없다」. 실제로는 넣었는데, 회신 칸이 창 맨 아래(AI 칸 밑)에
  //    있어 눈에 안 보였습니다. 넣은 뒤 회신 칸으로 화면을 옮기고 잠깐 테두리를 밝힙니다.
  //    (손가락 화면에서는 글자판이 튀어나오지 않게 포커스는 주지 않습니다)
  const replyBox = useRef<HTMLTextAreaElement>(null)
  const [replyFlash, setReplyFlash] = useState(false)
  const showReplyBox = () => {
    requestAnimationFrame(() => {
      const el = replyBox.current
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      try { if (!window.matchMedia('(pointer: coarse)').matches) el.focus({ preventScroll: true }) } catch { /* noop */ }
      setReplyFlash(true)
      window.setTimeout(() => setReplyFlash(false), 1800)
    })
  }

  //  「초안 사용」 — 사람이 눌러야 회신 칸에 들어갑니다(자동으로 넣지 않습니다).
  const applyDraft = () => {
    if (!replyTo || !ai.result) return
    setReplyText(ai.result.draft)
    setAiFor(replyTo.id, { usedDraft: true })
    showReplyBox()
  }

  const submitNew = async () => {
    if (!nClient || !nContent.trim()) return
    //  전화로 받아 적은 내용입니다. 저장되지 않았는데 창이 닫히면
    //  그 통화 내용은 어디에도 남지 않습니다. 서버가 받은 뒤에 닫습니다.
    const res = await addRequest({
      clientId: nClient,
      kind: nKind,
      content: nContent.trim(),
      source: 'staff',
      requesterName: '전화·카톡 접수',
      //  통화 중에 두 번 눌러도 접수는 하나입니다 (0055).
      requestId: newRequestId,
    })
    if (!res.ok) {
      setNewError(res.error ?? '접수하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    setNewError(null)
    setNContent('')
    setNewOpen(false)
    setNewRequestId(crypto.randomUUID())
  }

  return (
    <PageShell>
      <PageHeader
        title="고객 요청"
        subtitle="병원이 포털에서 올린 요청·문의와 전화·카톡으로 받은 요청을 한 곳에서 처리합니다"
        action={
          //  ⚠ 실제 업무 단추(전화 요청 접수)가 **먼저**입니다. AI 자리는
          //    그 옆에 섭니다 — 아직 안 되는 것이 되는 것보다 앞에 오면 안 됩니다.
          <div data-hide-presenting className="flex flex-wrap items-center gap-2">
            <button onClick={() => { setNewError(null); setNewOpen(true) }} className="btn-primary">
              <PlusCircle size={19} strokeWidth={2.4} /> 전화 요청 접수
            </button>
            <AiButton id="requestTriage" />
            <AiButton id="portalAsk" />
          </div>
        }
      />

      <div data-hide-presenting className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <KpiCard icon={AlertTriangle} label="처리 대기" value={stats.requestsOpen} unit="건" tone="rose" />
        <KpiCard icon={CheckCircle2} label="처리 완료" value={stats.requestsDone} unit="건" tone="teal" />
        <KpiCard
          icon={Smartphone}
          label="병원이 직접 등록"
          value={`${stats.portalRatio}%`}
          tone="navy"
          hint="나머지는 전화·카톡 대행 접수"
        />
        <KpiCard icon={Building2} label="요청한 병원" value={stats.activeClients} unit="곳" tone="navy" />
      </div>

      <div data-hide-presenting className="flex flex-wrap gap-2">
        {/*  ⚠ 「내려 둔 것」은 **있을 때만** 칩을 그립니다. 늘 있으면 그것도
             또 하나의 늘 떠 있는 것이 됩니다. */}
        {([
          '진행 중', '전체', '병원 직접', '긴급',
          ...(snoozedCount > 0 ? (['내려 둔 것'] as Filter[]) : []),
        ] as Filter[]).map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
            {f === '내려 둔 것' && ` ${snoozedCount}`}
          </FilterChip>
        ))}
      </div>

      {listRows.length === 0 ? (
        <LoadGate
          loadingTitle="요청을 불러오는 중입니다"
          empty={
            <EmptyState
              icon={Inbox}
              title={filter === '진행 중' ? '처리할 요청이 없습니다' : '요청이 없습니다'}
              subtitle="병원 담당자가 포털에서 요청을 올리면 여기에 바로 표시됩니다."
            />
          }
        />
      ) : (
        <div className="space-y-3">
          {listRows.map((r, ri) => (
            <div
              key={r.id}
              data-req-focus={r.id === focusId ? '' : undefined}
              className={`card p-5 ${r.id === focusId ? 'ring-2 ring-violet-300' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                {(() => {
                  const Icon = KIND_ICON[r.type]
                  return (
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[REQUEST_TONE[r.type]].tile}`}
                    >
                      <Icon size={20} strokeWidth={2.3} />
                    </span>
                  )
                })()}
                <Link
                  to={`/clients/${r.clientId}`}
                  className="t-card -my-2 flex min-h-[2.75rem] min-w-0 items-center break-keep py-2 text-navy-900 hover:text-teal-700"
                >
                  {r.clientName}
                </Link>
                <span className={`pill ${TONE[REQUEST_TONE[r.type]].chip}`}>{REQUEST_KIND_LABEL[r.type]}</span>
                {/*  ⚠ 내려 둔 것은 **왜·언제까지**를 그 자리에 적습니다.
                     안 적으면 「전체」에서 보고 「이건 왜 안 뜨지」가 됩니다. */}
                {isSnoozed(r) && (
                  <span data-snoozed={r.id} className="pill bg-navy-100 text-navy-600">
                    {prettyDate(r.snoozedUntil ?? '')}까지 내려 둠
                    {r.snoozeReason ? ` · ${r.snoozeReason}` : ''}
                  </span>
                )}
                {r.urgent && (
                  <span className="pill bg-rose-50 text-rose-600">
                    <AlertTriangle size={13} strokeWidth={2.6} /> 긴급
                  </span>
                )}
                <span
                  className={`pill ${r.source === 'portal' ? 'bg-violet-50 text-violet-700' : 'bg-navy-100 text-navy-500'}`}
                >
                  {r.source === 'portal' ? (
                    <>
                      <Smartphone size={13} strokeWidth={2.6} /> 병원 직접
                    </>
                  ) : (
                    <>
                      <Phone size={13} strokeWidth={2.6} /> 전화 접수
                    </>
                  )}
                </span>
                <span className="t-muted ml-auto shrink-0">{r.when}</span>
              </div>

              <p className="t-body mt-2.5 break-keep leading-snug text-navy-700">{r.content}</p>
              <p className="t-muted mt-1.5 break-keep">
                {r.requesterName || '담당자 미기재'}
                {r.desiredDate && ` · 희망일 ${r.desiredDate}`}
                {/*  ⚠ 0087 — 병원이 적어 준 것만 답니다. 안 적었으면 이 자리에
                     아무것도 안 나옵니다 — 저희가 짐작해 채우면 그 값을 보고
                     차를 고르게 되고, 틀리면 헛걸음입니다. */}
                {r.wasteType && ` · ${r.wasteType}`}
                {r.expectedKg != null && ` · 병원 어림 ${r.expectedKg}kg`}
              </p>

              {/* 이 요청이 어떤 매출로 이어지는지 — 요청 처리 = 영업 행동임을 명시.
                  현장 담당자에게는 안 적습니다 (위 주석 참고). */}
              {showRevenueLine && (
                <p data-req-revenue className="t-muted mt-2 flex flex-wrap items-center gap-1.5 break-keep">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[REQUEST_TONE[r.type]].dot}`} />
                  연결되는 매출: <b className="font-extrabold text-navy-600">{REQUEST_REVENUE[r.type]}</b>
                </p>
              )}

              {r.reply && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-3">
                  <MessageSquare size={16} className="mt-0.5 shrink-0 text-sky-600" strokeWidth={2.3} />
                  <p className="t-body min-w-0 break-keep leading-snug text-sky-900">{r.reply}</p>
                </div>
              )}

              {/* 처리 단계 — 여기서 바꾼 상태가 병원 화면에 그대로 보입니다 */}
              <div
                data-tour={ri === 0 ? 'requests-list' : undefined}
                className="mt-4 flex flex-wrap items-center gap-1.5"
              >
                {FLOW.map((st) => (
                  <button
                    key={st}
                    data-req-status={st}
                    onClick={() => void setStatus(r, st)}
                    className={`rounded-full px-3.5 py-2 text-[1rem] font-extrabold transition ${
                      r.status === st ? TONE[STATUS_TONE[st]].chip : 'bg-navy-50 text-navy-400 hover:text-navy-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
                {/*  수거로 이어지는 요청에만 붙입니다. 소모품·교육 요청에
                     방문 예약을 띄우면 엉뚱한 방문이 잡힙니다. */}
                {(r.type === '긴급수거' || r.type === '추가수거') && r.status !== '처리 완료' && (
                  <button
                    data-book-req={r.id}
                    onClick={() => setBookFor(r)}
                    className="t-btn flex items-center gap-1 rounded-full bg-navy-800 px-3.5 py-2 font-extrabold text-white"
                  >
                    <CalendarPlus size={15} strokeWidth={2.5} /> 날짜 잡기
                  </button>
                )}
                {/*  ⚠ 0076 — 지금 못 하는 요청을 기한까지 내려 둡니다.
                     지우지도, 「처리 완료」로 바꾸지도 않습니다 — 안 한 일을
                     했다고 적는 것이 제일 나쁩니다. 기한이 지나면 돌아옵니다. */}
                {canSnooze && r.status !== '처리 완료' && (
                  isSnoozed(r) ? (
                    <button
                      data-unsnooze={r.id}
                      onClick={() => void unsnooze(r.id)}
                      className="t-btn flex items-center gap-1 rounded-full bg-amber-100 px-3.5 py-2 font-extrabold text-amber-800"
                    >
                      <Undo2 size={15} strokeWidth={2.5} /> 다시 꺼내기
                    </button>
                  ) : (
                    <button
                      data-snooze={r.id}
                      onClick={() => { setSnoozeFor(r); setSnoozeDays(30); setSnoozeWhy(''); setSnoozeErr('') }}
                      className="t-btn flex items-center gap-1 rounded-full bg-navy-50 px-3.5 py-2 font-extrabold text-navy-600"
                    >
                      <Clock size={15} strokeWidth={2.5} /> 나중에 보기
                    </button>
                  )
                )}
                <button
                  data-presenter="reply-open"
                  onClick={() => {
                    setReplyTo(r)
                    setReplyText(r.reply)
                  }}
                  className="-mr-2 ml-auto flex min-h-[2.75rem] items-center gap-1 px-2 text-teal-700 t-btn hover:underline"
                >
                  회신 남기기 <ChevronRight size={16} />
                </button>
              </div>
              {saveMsg[r.id] && (
                <p data-req-save={saveMsg[r.id].ok ? 'ok' : 'fail'} className={`t-caption mt-2 break-keep font-bold ${saveMsg[r.id].ok ? 'text-teal-700' : 'text-rose-600'}`}>
                  {saveMsg[r.id].text}
                </p>
              )}
              {/*  ⚠ 0131 — 수거 요청을 「일정 반영」으로 바꿨는데 이 병원에 **잡힌 방문이 없으면**
                   병원 화면에는 예약된 것처럼 보이고 차는 안 갑니다(0058 과 같은 사고).
                   막지는 않습니다 — 대신 바로 날짜를 잡을 길을 같은 자리에 둡니다. */}
              {(r.type === '긴급수거' || r.type === '추가수거') && r.status === '일정 반영' && !hasUpcoming(r.clientId) && (
                <p data-req-no-visit={r.id} className="t-caption mt-2 flex flex-wrap items-center gap-2 break-keep font-bold text-amber-800">
                  이 병원에 잡힌 방문이 아직 없습니다 — 병원에는 예약된 것으로 보입니다.
                  <button
                    type="button"
                    onClick={() => setBookFor(r)}
                    className="rounded-full bg-navy-800 px-3 py-1.5 text-[0.98rem] font-extrabold text-white"
                  >
                    날짜 잡기
                  </button>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {bookFor && (
        <BookVisitModal
          open
          onClose={() => setBookFor(null)}
          client={data.clients.find((c) => c.id === bookFor.clientId)}
          requestId={bookFor.id}
          //  0141 — 희망일이 없으면 요청 글의 「오늘 · 내일 · 모레」만 미리 (추측 날짜는 넣지 않음), 차량은 「누가 갈 수 있나」 후보
          desiredDate={bookFor.desiredDate ?? (() => { const h = dispatchHint(data, bookFor); return h.why.startsWith('요청 글') ? h.date : null })()}
          defaultVehicleId={dispatchHint(data, bookFor).pick?.vehicleId ?? null}
          defaultMemo={`${REQUEST_KIND_LABEL[bookFor.type]} 요청 — ${bookFor.content}`.slice(0, 120)}
        />
      )}

      <section data-hide-presenting>
        <SectionTitle>자동 처리 규칙</SectionTitle>
        <div className="card p-5">
          <p className="t-body break-keep leading-snug text-navy-600">
            수거 완료를 입력하면 해당 병원의 <b>긴급수거·추가수거</b> 요청이 자동으로 닫히고, 자재를 함께
            공급했으면 <b>자재·용기</b> 요청도 함께 닫힙니다. 교육·자료 요청은 별도 처리가 필요하므로 자동으로
            닫지 않습니다.
          </p>
        </div>
      </section>

      {/* 회신 */}
      <Modal
        open={!!replyTo}
        wide={presenter.active}
        title="병원에 회신"
        onClose={() => { if (!replyBusy) { setReplyTo(null); setReplyErr(null) } }}
        footer={
          <div className="flex w-full flex-col gap-2">
            {replyErr && <p data-reply-error className="t-caption break-keep font-bold text-rose-600">{replyErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setReplyTo(null); setReplyErr(null) }} disabled={replyBusy} className="btn-ghost flex-1">
                취소
              </button>
              <button data-reply-save onClick={() => void submitReply()} disabled={replyBusy} className="btn-primary flex-1">
                {replyBusy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={2.4} />} 회신 저장
              </button>
            </div>
          </div>
        }
      >
        <p className="t-muted mb-3 break-keep">
          {replyTo?.clientName} · {replyTo ? REQUEST_KIND_LABEL[replyTo.type] : ''} — 아래 내용이 병원 화면에 그대로
          표시됩니다.
        </p>
        {replyTo?.content && (
          <p className="t-caption mb-3 whitespace-pre-wrap break-keep rounded-xl bg-navy-50 px-3 py-2 text-navy-600">{replyTo.content}</p>
        )}
        {canAi && replyTo && (
          //  0140 — 발표 화면에서 한눈에: 번호 순서(① 종류 ② 긴급도 ③ 요약 ④ 요구사항 ⑤ 회신 초안) · 큰 글씨
          <div data-ai-triage className="mb-3 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={20} strokeWidth={2.4} className="shrink-0 text-violet-600" />
              <p className="min-w-0 flex-1 break-keep text-[1.15rem] font-black text-violet-950">
                AI 요청 분석
                {/*  창이 길어도 늘 보이는 자리 — AI 는 제안, 결정은 담당자 (0140 발표) */}
                <span data-ai-human-badge className="ml-2 inline-block rounded-full bg-white px-2.5 py-0.5 align-middle text-[0.9rem] font-extrabold text-violet-800 ring-1 ring-violet-200">
                  AI 제안 → 담당자 최종 확인
                </span>
              </p>
              <button
                data-ai-triage-run
                onClick={() => void runAi()}
                disabled={ai.busy}
                aria-busy={ai.busy}
                className={`inline-flex min-h-[3rem] items-center gap-1.5 rounded-full px-5 text-[1.05rem] font-extrabold transition disabled:opacity-60 ${
                  ai.result && !ai.busy ? 'bg-white text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100' : 'bg-violet-600 text-white shadow-md hover:bg-violet-700'
                }`}
              >
                {ai.busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> 분석 중…
                  </>
                ) : ai.error ? '다시 시도' : ai.result ? '다시 분석' : (
                  <>
                    <Sparkles size={18} strokeWidth={2.4} /> AI 분석 실행
                  </>
                )}
              </button>
            </div>

            {ai.busy && (
              <p data-ai-triage-busy className="mt-3 flex items-center gap-2 break-keep rounded-xl bg-white px-3.5 py-3 text-[1.08rem] font-bold text-violet-900">
                <Loader2 size={20} className="shrink-0 animate-spin text-violet-600" /> AI가 요청 글을 읽고 있습니다… (보통 3~5초)
              </p>
            )}

            {ai.error && !ai.busy && (
              <div data-ai-triage-error role="status" className="mt-3 rounded-xl bg-white px-3.5 py-3">
                <p className="break-keep text-[1.02rem] font-bold text-rose-700">
                  AI 분석을 불러오지 못했습니다. 요청 처리는 그대로 진행할 수 있습니다.
                </p>
                <p className="t-caption mt-0.5 break-keep text-navy-500">까닭: {ai.error}</p>
              </div>
            )}

            {ai.result && !ai.busy && (
              <ol data-ai-triage-result className="mt-4 space-y-2.5">
                <AiRow n={1} label="요청 종류">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span data-ai-kind={ai.result.kind} className="rounded-full bg-navy-900 px-3.5 py-1 text-[1.1rem] font-extrabold text-white">
                      {REQUEST_KIND_LABEL[ai.result.kind as RequestKind] ?? ai.result.kind}
                    </span>
                    {ai.result.alsoKinds.map((k) => (
                      <span key={k} data-ai-also={k} className="rounded-full bg-white px-3 py-1 text-[1.02rem] font-bold text-navy-800 ring-1 ring-navy-200">
                        + {REQUEST_KIND_LABEL[k as RequestKind] ?? k}
                      </span>
                    ))}
                  </span>
                </AiRow>
                <AiRow n={2} label="긴급도">
                  <span data-ai-urgency={ai.result.urgency} className={`inline-block rounded-full px-3.5 py-1 text-[1.1rem] font-black ${AI_URGENCY_TONE[ai.result.urgency] ?? 'bg-navy-100 text-navy-700'}`}>
                    {ai.result.urgency}
                  </span>
                </AiRow>
                <AiRow n={3} label="AI 요약">
                  <p data-ai-summary className="break-keep text-[1.12rem] font-bold leading-snug text-navy-950">{ai.result.summary}</p>
                </AiRow>
                {ai.result.points.length > 0 && (
                  <AiRow n={4} label="핵심 요구사항">
                    <ul data-ai-points className="list-disc space-y-0.5 pl-5 text-[1.08rem] font-semibold text-navy-900">
                      {ai.result.points.map((x) => <li key={x} className="break-keep">{x}</li>)}
                    </ul>
                  </AiRow>
                )}
                <AiRow n={ai.result.points.length > 0 ? 5 : 4} label="AI 회신 초안">
                  <div className="rounded-xl bg-white px-3.5 py-3 ring-2 ring-violet-200">
                    <p data-ai-draft className="whitespace-pre-wrap break-keep text-[1.08rem] leading-relaxed text-navy-950">{ai.result.draft}</p>
                    <button
                      type="button"
                      data-ai-use-draft
                      onClick={applyDraft}
                      className="mt-2.5 inline-flex min-h-[3rem] items-center gap-1.5 rounded-full bg-violet-600 px-5 text-[1.02rem] font-extrabold text-white shadow-md transition hover:bg-violet-700"
                    >
                      {ai.usedDraft ? '회신 칸에 넣었습니다 ↓ 아래에서 고쳐 「회신 저장」' : '초안 사용 — 아래 칸에서 고쳐 저장'}
                    </button>
                  </div>
                </AiRow>
                {/*  0141 — 「누가 갈 수 있나」: 일정표에서 바로 계산 (AI 가 아님 · 확정은 담당자의 「날짜 잡기」) */}
                {(() => {
                  const h = dispatchHint(data, replyTo)
                  if (h.loads.length === 0) return null
                  return (
                    <AiRow n={ai.result.points.length > 0 ? 6 : 5} label="갈 수 있는 기사 · 일정표 기준">
                      <div data-dispatch-hint className="rounded-xl bg-white px-3.5 py-3 ring-1 ring-violet-100">
                        <p className="break-keep text-[1.02rem] font-bold text-navy-800">
                          {h.date.slice(5).replace('-', '월 ')}일 기준 <span className="font-medium text-navy-500">({h.why})</span>
                        </p>
                        {h.pick && (
                          <p data-dispatch-pick className="mt-1.5 break-keep text-[1.12rem] font-black text-navy-950">
                            추천 — {h.pick.vehicleName}{h.pick.driver ? ` · ${h.pick.driver}` : ''}
                            <span className="ml-1.5 text-[1rem] font-bold text-violet-700">{h.pickWhy}</span>
                          </p>
                        )}
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {h.loads.map((l) => (
                            <li
                              key={l.vehicleId}
                              data-dispatch-load={l.vehicleId}
                              className={`rounded-full px-3 py-1 text-[0.98rem] font-bold ${h.pick?.vehicleId === l.vehicleId ? 'bg-violet-600 text-white' : 'bg-navy-50 text-navy-700'}`}
                            >
                              {l.vehicleName} {l.visits}곳{l.regular ? ' · 늘 가던 차량' : ''}{l.alreadyThere ? ' · 이미 방문 예정' : ''}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 break-keep text-[0.95rem] text-navy-500">
                          그날 차량별 방문 수 · 최근에 이 병원을 맡은 차량으로 계산 — 회신 저장 뒤 요청 카드의 「날짜 잡기」에 이 날짜 · 차량이 미리 들어갑니다(바꿀 수 있음).
                        </p>
                      </div>
                    </AiRow>
                  )
                })()}
                <li className="list-none pt-1">
                  <p data-ai-basis className="break-keep rounded-lg bg-white/70 px-3 py-2 text-[0.98rem] text-navy-700">판단 근거: {ai.result.basis}</p>
                  <p data-ai-meta className="mt-1.5 break-keep text-[0.95rem] font-semibold text-navy-500">
                    실제 AI 응답{aiVendor(ai.result.model) && ` · ${aiVendor(ai.result.model)}`} · {ai.result.model ? `모델 ${ai.result.model}` : '모델 이름 없음'}
                    {ai.ms != null && ` · ${(ai.ms / 1000).toFixed(1)}초`}
                    {!ai.logged && ' · 호출 기록을 남기지 못했습니다'}
                  </p>
                </li>
              </ol>
            )}

            {/*  0142 — AI 처리 계획: 원하는 것 · 시스템이 다시 확인(차량 · 재고 · 이력) · 처리 순서 · 주의 · 구체 회신 */}
            {/*  ⚠ 0143 안정화 — 분석이 끝난 뒤에만 그립니다. 처리 계획이 먼저 오면 그 아래 단추로 화면을 내렸다가
                 분석 결과가 위에 끼어들며 단추가 화면 밖으로 밀려났습니다(어느 쪽이 먼저 올지는 정해져 있지 않음). */}
            {!ai.busy && (plan.busy || plan.error || plan.result) && (
              <AiRequestPlan
                data={data}
                clientId={replyTo.clientId}
                hint={dispatchHint(data, replyTo)}
                plan={plan}
                usedReply={plan.used}
                onUseReply={(t) => { setReplyText(t); setPlanFor(replyTo.id, { used: true }); showReplyBox() }}
                hideOldServer={presenter.active}
              />
            )}

            {/*  AI 는 제안만 — 발표 화면에서 반드시 보이게 (심사위원이 「AI 가 자동 확정」으로 오해하지 않게) */}
            <div data-ai-disclaimer className="mt-3 rounded-xl bg-violet-100/70 px-3.5 py-3">
              <p data-ai-human-check className="break-keep text-[1.05rem] font-extrabold text-violet-900">AI 제안 → 담당자 최종 확인</p>
              <p className="mt-0.5 break-keep text-[0.98rem] text-violet-900">
                AI는 초안을 제안하며, 최종 판단과 회신은 담당자가 수행합니다. AI는 요청 상태를 바꾸거나 일정을 확정하거나 병원에 보내지 않습니다.
              </p>
            </div>
          </div>
        )}
        <label htmlFor="reply-text" className="mb-1.5 block break-keep text-[1rem] font-extrabold text-navy-800">회신 — 병원 화면에 그대로 보입니다</label>
        <textarea
          id="reply-text"
          ref={replyBox}
          rows={4}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="예: 내일 오전 방문 일정에 반영했습니다. 전용용기 10개 함께 가져가겠습니다."
          data-reply-flash={replyFlash ? '1' : undefined}
          className={`field-input w-full resize-none transition-shadow ${replyFlash ? 'ring-4 ring-violet-400' : ''}`}
        />
      </Modal>

      {/* 전화·카톡 대행 접수 */}
      <Modal
        open={newOpen}
        title="전화 요청 접수"
        onClose={() => setNewOpen(false)}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setNewOpen(false)} className="btn-ghost flex-1">
              취소
            </button>
            <button
              onClick={() => void submitNew()}
              disabled={!nClient || !nContent.trim()}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              접수
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {newError && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-rose-100">
              <p className="t-body break-keep font-bold text-rose-700">{newError}</p>
              <p className="t-muted mt-1 break-keep">적으신 내용은 그대로 있습니다.</p>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="nr-client">
              거래처
            </label>
            <select
              id="nr-client"
              value={nClient}
              onChange={(e) => setNClient(e.target.value)}
              className="field-input w-full"
            >
              <option value="">거래처를 선택하세요</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">요청 유형</label>
            <div className="flex flex-wrap gap-2">
              {REQUEST_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setNKind(k)}
                  className={`rounded-full px-4 py-2.5 text-[1.02rem] font-bold transition ${
                    nKind === k ? 'bg-navy-900 text-white' : `${TONE[REQUEST_TONE[k]].chip} hover:opacity-80`
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="nr-content">
              내용
            </label>
            <textarea
              id="nr-content"
              rows={3}
              value={nContent}
              onChange={(e) => setNContent(e.target.value)}
              placeholder="전화로 받은 요청 내용을 그대로 적어 주세요."
              className="field-input w-full resize-none"
            />
          </div>
        </div>
      </Modal>
      {/*  ── 요청 잠시 내려 두기 (0076) ──────────────────────────────────
           대표님: 「검증용 요청 2건이 몇 주째 떠 있는데 당분간 안 뜨게」.
           ⚠ 반드시 **언제까지**를 받습니다. 기한 없는 숨김은 영원히 안 보이는
             것과 같고, 그러면 진짜 잊힙니다. */}
      <Modal
        open={snoozeFor !== null}
        title="이 요청 나중에 보기"
        onClose={() => setSnoozeFor(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setSnoozeFor(null)} disabled={snoozeBusy}>
              닫기
            </button>
            <button
              data-snooze-go
              className="btn-primary flex-1 disabled:opacity-50"
              disabled={snoozeBusy}
              onClick={() => void doSnooze()}
            >
              <Clock size={17} strokeWidth={2.5} /> {shiftDays(snoozeDays)}까지 내려 두기
            </button>
          </>
        }
      >
        {snoozeFor && (
          <>
            <p className="break-keep text-[1.12rem] font-extrabold text-navy-900">
              {snoozeFor.clientName} · {snoozeFor.type}
            </p>
            <p className="t-body mt-1 break-keep leading-relaxed text-navy-600">
              목록에서 잠시 내려 둡니다. <b className="text-navy-800">지우는 것도, 「처리 완료」로
              바꾸는 것도 아닙니다</b> — 그 날짜가 지나면 저절로 다시 올라옵니다.
            </p>

            <div className="mt-4">
              <label className="field-label">언제까지</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { d: 7, label: '1주일' },
                  { d: 30, label: '1개월' },
                  { d: 90, label: '3개월' },
                  { d: 180, label: '6개월' },
                ].map((o) => (
                  <button
                    key={o.d}
                    type="button"
                    data-snooze-days={o.d}
                    onClick={() => setSnoozeDays(o.d)}
                    className={`min-h-[3rem] flex-1 rounded-2xl px-3 text-[1.05rem] font-extrabold transition active:scale-[0.98] ${
                      snoozeDays === o.d ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p data-snooze-until className="t-caption mt-1.5 tabular-nums text-navy-500">
                {prettyDate(shiftDays(snoozeDays))}에 다시 올라옵니다.
              </p>
            </div>

            <div className="mt-3">
              <label className="field-label">왜 내려 두나요? (없으면 비워 두세요)</label>
              <input
                data-snooze-why
                className="input"
                maxLength={200}
                value={snoozeWhy}
                onChange={(e) => setSnoozeWhy(e.target.value)}
                placeholder="예: 검증용 요청 — 테스트 끝나면 정리"
              />
            </div>

            {snoozeErr && (
              <p data-snooze-error className="t-body mt-3 break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-700">
                {snoozeErr}
              </p>
            )}
          </>
        )}
      </Modal>

      {/*  0083 — 병원 문의. 수거 요청과 **같은 화면**에 두되 **다른 칸**입니다.
           섞으면 요청함에 질문이 쌓여 정작 오늘 나갈 수거가 묻힙니다.
           ⚠ 판 82 이하이면 아예 안 그립니다 — 표가 없는데 화면만 있으면
             눌러도 안 되는 단추가 됩니다. */}
      {schema83 && <div data-hide-presenting className="contents"><InquiryInbox /></div>}

    </PageShell>
  )
}

/** AI 결과 한 줄 — 번호 · 이름 · 값 (0140 발표 화면에서 한눈에) */
function AiRow({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <li className="flex list-none items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[0.95rem] font-black text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.98rem] font-extrabold text-violet-800">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  )
}
