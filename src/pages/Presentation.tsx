import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ArrowRight, CheckCircle2, Circle, AlertTriangle, BookOpen, PlayCircle, ChevronRight, ChevronDown, Sparkles, Loader2, Settings2, Route as RouteIcon } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { usePresenter } from '../context/PresenterContext'
import { canAccess } from '../lib/access'
import { today } from '../lib/format'
import { AI_ORDER, CLOSING, FLOW, FULL_ORDER, PRESENTER_CLIENT_KEY, PRESENTER_STEPS, ROADMAP, kstStamp } from '../lib/presenter'
import { usePrepareDemo } from '../context/usePrepareDemo'
import { aiTriageRequest } from '../lib/evidenceRepo'
import { DemoResetButton } from '../components/DemoControls'
import { loadDevRequests, missingParts } from '../lib/repo'
import { parseTrials, type Trial } from '../lib/trials'
import { IR_WINDOW_DAYS, irSummary } from '../lib/irSummary'
import { AFTER_SURVEY } from '../lib/opsSurvey'
import { TourButton } from '../components/TourEntry'

// ─────────────────────────────────────────────────────────────────────────────
// 심사 시연 (/presentation) — 0139 Presenter Mode 시작 화면
//
//  예전에는 슬라이드 6장 · 글 목록 9단계 · 60초 투어가 **서로 다른 순서**를 말했고,
//  슬라이드에서 실제 화면으로 넘어가는 순간 안내가 사라졌습니다. 이제
//
//   · 「심사 시연 시작」 하나 → 화면을 옮겨도 따라다니는 안내 카드(PresenterCard)
//   · 시연 준비 상태 — 화면이 확인할 수 있는 것만 자동 ✓, 나머지는 직접 체크
//   · 0단계(전체 흐름) · 7단계(마무리)는 이 화면 위에 크게
//   · 60초 투어는 「빠른 연습」으로 남김 (실제 기록 1건으로 한 바퀴)
//
//  ⚠ 숫자를 만들지 않습니다. 예전 화면 맨 아래 「105톤 규모」(출처 미확정)와
//    「상세 시연 자료」(/demo — 49곳 · 105톤이 남아 있음) 연결은 뺐습니다.
//
//  0140 신보 발표 — 첫 화면 우선순위만 바꿨습니다(기능은 그대로 아래에).
//   · 가장 큰 단추 = 「AI 요청 분석 시연 시작」 → 시연 요청을 준비(없으면 시연용 거래처
//     안에 하나만)하고 요청함의 그 요청으로 바로. 두 번째 = 「전체 운영 흐름 시연」.
//   · 「AI 연결 확인」 — 실제 외부 AI 를 시연 요청 하나로 불러 성공 · 실패 까닭을 그대로.
//   · 이 화면은 발표장에 그대로 켜 둡니다 — 보이는 것은 제목 · 시작 단추 · 흐름 · 현재 상태뿐.
//     준비 점검 · 단계 목록 · 연습 · 표현 가이드 · 성과 요약 바로 가기는 접힌 「발표 준비」 안에.
// ─────────────────────────────────────────────────────────────────────────────

const SAY_DO = [
  '구현됨 · 실증 단계 · 측정 중 · 개발 예정으로 나눠 말하기',
  'AI 는 업무 보조 — 최종 판단과 회신은 담당자',
  '병원 포털은 추가 채널 (전화 · 문자도 그대로)',
  '성과는 측정한 것만, 나머지는 측정 예정',
]
const SAY_DONT = [
  'AI 가 자동으로 배차합니다',
  'AI 가 수거량을 예측합니다',
  '완전 자동화 · 전체 업무가 AI 로',
  '병원 전체가 사용 중',
  '생산성 00% 향상 · 처리시간 00% 감소',
]
const MANUAL = ['인터넷 연결', '프로젝터 화면 · 글자 크기', '브라우저 새로고침 한 번']
const MANUAL_KEY = 'beonemirae-ops:presenter-manual'
const PREP_KEY = 'beonemirae-ops:presenter-prep-open'

type Mark = 'ok' | 'todo' | 'warn'
const fmtNum = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1))

export function Presentation() {
  const navigate = useNavigate()
  const { data, reload } = useData()
  const { role, mode, profile } = useAuth()
  const presenter = usePresenter()
  const { prepare } = usePrepareDemo()
  const step = PRESENTER_STEPS[presenter.index]
  const [aiStart, setAiStart] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const [aiCheck, setAiCheck] = useState<{ busy: boolean; ok: boolean | null; text: string }>({ busy: false, ok: null, text: '' })
  const [prepOpen, setPrepOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem(PREP_KEY) === '1' } catch { return false }
  })

  //  시연 거래처 — 기기에 기억 (다음 연습 때 다시 고르지 않게)
  const [clientId, setClientId] = useState<string>(() => {
    try { return localStorage.getItem(PRESENTER_CLIENT_KEY) ?? '' } catch { return '' }
  })
  const clients = useMemo(
    () => [...data.clients].sort((a, b) => Number(!!b.isDemoGenerated) - Number(!!a.isDemoGenerated) || a.name.localeCompare(b.name, 'ko')),
    [data.clients],
  )
  const chosen = clients.find((c) => c.id === clientId) ?? null
  //  처음이면 시연용 거래처를 먼저 제안 — 한 번만 (대표님이 비우면 다시 채우지 않음)
  const suggested = useRef(false)
  useEffect(() => {
    if (suggested.current || clients.length === 0) return
    suggested.current = true
    if (!clientId) {
      const demo = clients.find((c) => c.isDemoGenerated)
      if (demo) setClientId(demo.id)
    }
  }, [clientId, clients])
  useEffect(() => {
    try { if (clientId) localStorage.setItem(PRESENTER_CLIENT_KEY, clientId) } catch { /* noop */ }
    if (presenter.active && clientId && presenter.clientId !== clientId) presenter.setClient(clientId)
  }, [clientId, presenter])

  const [manual, setManual] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(MANUAL_KEY) ?? '[]') as string[] } catch { return [] }
  })
  const toggleManual = (k: string) =>
    setManual((m) => {
      const next = m.includes(k) ? m.filter((x) => x !== k) : [...m, k]
      try { sessionStorage.setItem(MANUAL_KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })

  //  ── 시연 준비 상태 — 화면이 확인할 수 있는 것만 자동 ─────────────────────
  const t = today()
  const todayVisits = data.schedules.filter((s) => s.date === t && s.status !== '완료' && !s.canceledAt).length
  const aiOk = (data.aiCalls ?? []).filter((c) => c.ok).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  const aiLastFail = (data.aiCalls ?? []).filter((c) => !c.ok).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  const checks: { key: string; label: string; mark: Mark; detail: string }[] = [
    { key: 'admin', label: '관리자 계정', mark: role === 'admin' ? 'ok' : 'warn', detail: role === 'admin' ? '관리자로 로그인됨' : '관리자 계정으로 들어와야 모든 단계가 열립니다' },
    { key: 'live', label: '운영 자료 연결', mark: mode === 'live' ? 'ok' : 'warn', detail: mode === 'live' ? '실제 운영 DB 와 연결됨' : '시연 모드 — 실제 운영 기록이 아닙니다' },
    {
      key: 'client', label: '시연 거래처',
      mark: !chosen ? 'todo' : chosen.isDemoGenerated ? 'ok' : 'warn',
      detail: !chosen
        ? '아래에서 고르세요 — 병원 요청 · 회신 확인 단계에서 씁니다'
        : chosen.isDemoGenerated
          ? `${chosen.name} (시연용 — 운영 실적에서 빠짐)`
          : `${chosen.name} — 실제 거래처입니다. 시연 요청 · 수거 기록이 이 병원 기록으로 남습니다`,
    },
    { key: 'visit', label: '오늘 예정 방문', mark: todayVisits > 0 ? 'ok' : 'todo', detail: todayVisits > 0 ? `${todayVisits}건 — 수거 입력 단계에서 고를 수 있음` : '없음 — 수거 입력에서 직접 입력으로 저장합니다' },
    { key: 'requests', label: '고객 요청 화면', mark: canAccess(role, '/requests') ? 'ok' : 'warn', detail: canAccess(role, '/requests') ? '열 수 있음' : '이 계정으로는 열 수 없습니다' },
    {
      key: 'ai', label: 'AI 실제 호출',
      mark: aiOk ? 'ok' : 'todo',
      detail: data.aiCalls == null
        ? '호출 기록 표를 읽지 못함 — 시연 전에 요청 하나로 직접 실행해 보세요'
        : aiOk
          ? `최근 성공 ${kstStamp(aiOk.createdAt)}${aiOk.model ? ` · ${aiOk.model}` : ''}`
          : `아직 성공한 호출이 없습니다 — 키 등록 · 배포 뒤 요청 하나로 실행해 보세요${aiLastFail ? ` (최근 실패: ${aiLastFail.error.slice(0, 40)})` : ''}`,
    },
    { key: 'start', label: '실증 시작일', mark: data.experiment?.startDate ? 'ok' : 'todo', detail: data.experiment?.startDate ? `${data.experiment.startDate} — 성과 화면의 실증기간` : '설정에서 정하면 성과 화면에 실증기간이 나옵니다' },
  ]

  const showFlow = !presenter.active || step.key === 'intro'
  const showClose = presenter.active && step.key === 'close'

  //  ── 실증 결과 (0141 · 마무리 화면) — 성과 화면(/performance/ir)과 **같은 계산**(irSummary).
  //   실제로 잰 것만 숫자로: 도입 전 업무조사 · 재현시험(예전 방식 vs 시스템) · 최근 30일 실제 사용 기록.
  //   안 잰 칸은 「측정 중」 — 예상치 · 목표치를 실적처럼 쓰지 않습니다.
  const liveMode = mode === 'live'
  const staffRole = role === 'admin' || role === 'office'
  const [trials, setTrials] = useState<Trial[] | null | undefined>(undefined)
  useEffect(() => {
    if (!showClose) return
    if (!staffRole || !liveMode) { setTrials(null); return }
    let alive = true
    loadDevRequests().then((rows) => alive && setTrials(parseTrials(rows))).catch(() => alive && setTrials(null))
    return () => { alive = false }
  }, [showClose, staffRole, liveMode])
  const ir = useMemo(
    () => irSummary(data, { live: liveMode, trials: trials ?? null, trialsReason: '재현시험 기록을 읽지 못했습니다', unreadable: missingParts.filter((m) => /고객 문의/.test(m)) }),
    [data, liveMode, trials],
  )
  const showRoadmap = presenter.active && step.key === 'roadmap'
  const startAt = (index: number) => presenter.start({ clientId: chosen?.id ?? null, order: FULL_ORDER, pos: index })

  //  AI 먼저 — 시연 요청을 준비하고(있으면 그대로) 요청함의 그 요청으로 바로 (60~90초)
  const startAi = async () => {
    if (aiStart.busy) return
    setAiStart({ busy: true, error: null })
    try {
      const prep = await prepare()
      setClientId(prep.clientId)
      presenter.start({ order: AI_ORDER, pos: 0, clientId: prep.clientId, demoRequestId: prep.requestId, since: prep.since })
      setAiStart({ busy: false, error: null })
    } catch (e) {
      setAiStart({ busy: false, error: e instanceof Error ? e.message : '시연 요청을 준비하지 못했습니다.' })
    }
  }

  //  실제 외부 AI 를 시연 요청 하나로 불러 봅니다 — 성공 · 실패 까닭을 그대로 (서버가 ai_calls 에 기록)
  const checkAi = async () => {
    if (aiCheck.busy) return
    setAiCheck({ busy: true, ok: null, text: '' })
    try {
      const prep = await prepare()
      const r = await aiTriageRequest({ requestId: prep.requestId, actorName: profile?.name ?? '', demo: true })
      if (r.ok) {
        setAiCheck({ busy: false, ok: true, text: `성공 · ${r.result.model || '모델 이름 없음'} · ${(r.ms / 1000).toFixed(1)}초 · 「${r.result.kind} · 긴급도 ${r.result.urgency}」` })
      } else {
        setAiCheck({ busy: false, ok: false, text: r.error })
      }
    } catch (e) {
      setAiCheck({ busy: false, ok: false, text: e instanceof Error ? e.message : '확인하지 못했습니다.' })
    }
    void reload()
  }

  const systemStatus: { k: string; label: string; state: string; tone: string }[] = [
    { k: 'ops', label: '운영 기능', state: '구현됨', tone: 'bg-teal-50 text-teal-800' },
    { k: 'portal', label: '병원 포털', state: '실증 단계', tone: 'bg-amber-50 text-amber-800' },
    //  ⚠ 심사위원에게 보이는 칸 — 구현 사실(외부 AI API 연동)만. 실제 호출 성공 여부는 아래 「발표 준비」에서 확인
    { k: 'ai', label: 'AI 요청 분석', state: '외부 AI API 연동', tone: 'bg-teal-50 text-teal-800' },
    { k: 'perf', label: '성과 측정', state: '진행 중', tone: 'bg-navy-100 text-navy-700' },
  ]

  return (
    <div data-presentation className="mx-auto w-full max-w-[1100px] space-y-6">
      {/* 상단 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p data-presenter-eyebrow className="text-[1.05rem] font-extrabold text-teal-700">신용보증기금 발표 시연</p>
          <h1 className="t-page break-keep text-navy-900">비원미래 AX 운영시스템</h1>
          <p className="mt-1.5 break-keep text-[1.12rem] font-semibold leading-snug text-navy-600">
            현장의 업무 데이터를 하나로 연결하고, AI가 담당자의 판단과 고객 대응을 보조합니다.
          </p>
        </div>
        <button
          onClick={() => { if (presenter.active) presenter.stop(); navigate('/') }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-navy-500 shadow-card transition active:scale-95"
          aria-label="닫기"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── AI 고도화 계획 (0141) — 지금 쓰는 AI · 다음 · 그다음, 큰 글씨 세 칸 ──────────── */}
      {showRoadmap && (
        <section data-presenter-roadmap className="rounded-[22px] bg-navy-900 px-6 py-7 text-white sm:px-9 sm:py-9">
          <p className="text-[1.1rem] font-extrabold text-teal-300">AI 고도화 계획</p>
          <h2 className="mt-1.5 break-keep text-[1.7rem] font-black leading-tight sm:text-[2.1rem]">
            지금 쓰는 AI에서 시작해, 쌓이는 데이터로 넓혀 갑니다
          </h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[
              { k: 'now', title: '지금 · 실제 사용 중', items: ROADMAP.now, box: 'bg-teal-500/15 ring-1 ring-teal-300/40', tone: 'text-teal-300', mark: '✓' },
              { k: 'next', title: '다음 · 개발 예정', items: ROADMAP.next, box: 'bg-violet-500/15 ring-1 ring-violet-300/40', tone: 'text-violet-200', mark: '→' },
              { k: 'later', title: '그다음 · 데이터 축적 후', items: ROADMAP.later, box: 'bg-white/5 ring-1 ring-white/15', tone: 'text-navy-200', mark: '○' },
            ].map((col) => (
              <div key={col.k} data-roadmap-col={col.k} className={`rounded-[18px] px-5 py-5 ${col.box}`}>
                <p className={`text-[1.15rem] font-black ${col.tone}`}>{col.title}</p>
                <ul className="mt-3 space-y-2.5">
                  {col.items.map((it) => (
                    <li key={it} className="flex items-start gap-2.5 break-keep text-[1.2rem] font-bold leading-snug text-white">
                      <span aria-hidden="true" className={`shrink-0 ${col.tone}`}>{col.mark}</span>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-5 break-keep text-[1.05rem] font-semibold text-navy-200">
            「개발 예정」 · 「데이터 축적 후」 칸은 아직 없는 기능입니다. AI는 계속 제안만 하고, 확정은 담당자가 합니다.
          </p>
        </section>
      )}

      {/* ── 마무리 — 큰 문장 하나 (0141 · 작은 글씨 세 칸은 뺌) ─────────────── */}
      {showClose && (
        <section data-presenter-close className="rounded-[22px] bg-navy-900 px-6 py-9 text-white sm:px-10 sm:py-12">
          <ol className="flex flex-wrap items-center gap-2.5 text-[1.4rem] font-black sm:text-[1.8rem]">
            {CLOSING.flow.map((f, i) => (
              <li key={f} className="flex items-center gap-2.5">
                {i > 0 && <ArrowRight size={24} strokeWidth={2.8} aria-hidden="true" className="text-teal-300" />}
                {f}
              </li>
            ))}
          </ol>
          {/*  실증 결과 — 큰 숫자 세 칸 (실제로 잰 것만) */}
          {/*  ① 도입 전 → 도입 후 (사용하신 분들의 답변 · 0141) — 가장 크게 */}
          <div data-close-before-after className="mt-7 grid gap-3.5 lg:grid-cols-2">
            <div data-close-result="admin" className="rounded-[18px] bg-teal-500/20 px-6 py-6 ring-1 ring-teal-300/40">
              <p className="text-[1.15rem] font-extrabold text-teal-200">하루 사무업무</p>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[2.8rem] font-black leading-none tabular-nums sm:text-[3.2rem]">
                <span className="whitespace-nowrap">{fmtNum(ir.baseline.minH)}~{fmtNum(ir.baseline.maxH)}<span className="ml-1 text-[1.4rem] font-extrabold text-teal-100">시간</span></span>
                <ArrowRight size={32} strokeWidth={2.8} aria-label="에서" className="text-teal-300" />
                <span className="whitespace-nowrap">{AFTER_SURVEY.admin.afterMaxMin}분<span className="ml-1 text-[1.4rem] font-extrabold text-teal-100">이내</span></span>
              </p>
              <p data-close-cut className="mt-3.5 inline-block rounded-[12px] bg-teal-400 px-3.5 py-2 text-[1.3rem] font-black text-navy-950">
                <span className="whitespace-nowrap">하루 {fmtNum(ir.after.cutMinH)}시간 이상 줄어듦</span>{' · '}
                <span className="whitespace-nowrap">한 달 약 {ir.after.monthCutMinH}시간 이상</span>
              </p>
              <p className="mt-2.5 break-keep text-[1rem] text-teal-100">
                {AFTER_SURVEY.admin.who} 답변 — 도입 전 업무조사({ir.baseline.takenOn}) · 도입 후({AFTER_SURVEY.takenOn}) · 줄어든 양은 두 답변으로 계산한 최소치
              </p>
            </div>
            <div data-close-result="field" className="rounded-[18px] bg-teal-500/20 px-6 py-6 ring-1 ring-teal-300/40">
              <p className="text-[1.15rem] font-extrabold text-teal-200">현장 기사 · 퇴근 후 카톡 정리</p>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[2.8rem] font-black leading-none tabular-nums sm:text-[3.2rem]">
                <span className="whitespace-nowrap">{AFTER_SURVEY.field.beforeMinMin}분<span className="ml-1 text-[1.4rem] font-extrabold text-teal-100">이상</span></span>
                <ArrowRight size={32} strokeWidth={2.8} aria-label="에서" className="text-teal-300" />
                <span className="whitespace-nowrap">{AFTER_SURVEY.field.afterMin}분</span>
              </p>
              <p className="mt-3 break-keep text-[1rem] text-teal-100">
                {AFTER_SURVEY.field.who} 답변 ({AFTER_SURVEY.takenOn}) — 현장에서 클릭 몇 번으로 바로 입력
              </p>
            </div>
          </div>
          {/*  ② 함께 보는 근거 — 재현시험 · 실제 사용 기록 */}
          <div data-close-results className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
            <div data-close-result="trial" data-close-trial={ir.trial.state} className="rounded-[18px] bg-white/10 px-5 py-5">
              <p className="text-[1.05rem] font-extrabold text-navy-200">같은 업무 처리 시간 · 재현시험</p>
              {ir.trial.state === 'measured' ? (
                <>
                  <p className="mt-2 flex items-center gap-2 whitespace-nowrap text-[2.2rem] font-black leading-none tabular-nums">
                    {fmtNum(ir.trial.main.oldMedianMin)}<span className="text-[1.2rem] font-extrabold text-navy-200">분</span>
                    <ArrowRight size={26} strokeWidth={2.8} aria-label="에서" className="text-teal-300" />
                    {fmtNum(ir.trial.main.newMedianMin)}<span className="text-[1.2rem] font-extrabold text-navy-200">분</span>
                  </p>
                  <p className="mt-2.5 break-keep text-[0.98rem] text-navy-200">
                    {ir.trial.main.label} · 재현시험 {ir.trial.main.n}회{ir.trial.main.n > 1 ? ' 중앙값' : ''} — 같은 자료로 예전 방식과 시스템을 실제로 잰 값
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[2rem] font-black leading-none text-navy-200">측정 중</p>
                  <p className="mt-2.5 break-keep text-[0.98rem] text-navy-200">
                    {ir.trial.state === 'unavailable' ? ir.trial.reason : '업무 재현시험으로 잽니다'}
                  </p>
                </>
              )}
            </div>
            <div data-close-result="usage" className="rounded-[18px] bg-white/10 px-5 py-5">
              <p className="text-[1.05rem] font-extrabold text-navy-200">실제 사용 · 최근 {IR_WINDOW_DAYS}일</p>
              {ir.usage.state === 'ok' ? (
                <>
                  <p className="mt-2 whitespace-nowrap text-[2.2rem] font-black leading-none tabular-nums">
                    {ir.usage.records.toLocaleString('ko-KR')}<span className="ml-1 text-[1.3rem] font-extrabold text-navy-200">건</span>
                    <span className="ml-3 text-[1.7rem]">{ir.usage.users}</span><span className="ml-1 text-[1.3rem] font-extrabold text-navy-200">명</span>
                  </p>
                  <p className="mt-2.5 break-keep text-[0.98rem] text-navy-200">
                    수거 입력 {ir.usage.byKind.collections} · 병원 요청 {ir.usage.byKind.requests} · 문의 {ir.usage.byKind.inquiries} — 운영 DB 기록 · 시연 제외
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[2.2rem] font-black leading-none text-navy-200">확인 전</p>
                  <p className="mt-2.5 break-keep text-[0.98rem] text-navy-200">{ir.usage.reason}</p>
                </>
              )}
            </div>
          </div>
          {!liveMode && <p data-close-demo className="mt-3 text-[1rem] font-bold text-amber-300">시연 모드 — 실제 운영 기록이 아닙니다</p>}
          <p data-close-message className="mt-7 break-keep text-[1.3rem] font-black leading-relaxed text-white sm:text-[1.55rem]">
            {CLOSING.message}
          </p>
        </section>
      )}

      {/* ── 시작 — AI 먼저 · 전체 흐름 (0140) ───────────────────────────── */}
      {showFlow && (
        <section data-presenter-hero className="rounded-[22px] bg-navy-900 px-6 py-7 text-white sm:px-9 sm:py-8">
          {!presenter.active ? (
            <>
              <button
                type="button"
                data-presenter-ai-start
                onClick={() => void startAi()}
                disabled={aiStart.busy}
                aria-busy={aiStart.busy}
                className="flex min-h-[4rem] w-full items-center justify-center gap-2.5 rounded-[16px] bg-teal-500 px-6 text-[1.3rem] font-black text-white transition hover:bg-teal-600 disabled:opacity-70 sm:w-auto sm:justify-start"
              >
                {aiStart.busy ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} strokeWidth={2.4} />}
                {aiStart.busy ? '준비 중…' : 'AI 요청 분석 시연 시작'}
              </button>
              <p className="mt-2.5 break-keep text-[1.05rem] font-semibold leading-snug text-navy-100">
                병원이 남긴 요청을 AI가 읽고 요청 유형 · 긴급도 · 핵심 내용 · 회신 초안을 제안합니다.
              </p>
              {aiStart.error && (
                <p data-presenter-ai-start-error role="alert" className="mt-2 break-keep rounded-xl bg-rose-500/15 px-3 py-2 text-[1.02rem] font-bold text-rose-100">
                  {aiStart.error}
                </p>
              )}
              <button
                type="button"
                data-presenter-start
                onClick={() => startAt(0)}
                className="mt-5 flex min-h-[3.25rem] items-center gap-2 rounded-[14px] bg-white/10 px-5 text-[1.1rem] font-extrabold text-white ring-1 ring-white/20 transition hover:bg-white/15"
              >
                <RouteIcon size={20} strokeWidth={2.4} /> 전체 운영 흐름 시연
              </button>
            </>
          ) : null}
          <ol data-presenter-flow aria-label="전체 운영 흐름" className={`flex flex-wrap items-center gap-2 ${presenter.active ? '' : 'mt-6'}`}>
            {FLOW.map((f, i) => (
              <li key={f} className="flex items-center gap-2">
                {i > 0 && <ChevronRight size={20} strokeWidth={2.8} aria-hidden="true" className="text-teal-300" />}
                <span className="rounded-full bg-white/10 px-4 py-2 text-[1.05rem] font-extrabold">{f}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── 현재 시스템 상태 — 과장 없이 (AI 는 실제 성공 기록이 있어야 「확인됨」) ── */}
      {showFlow && (
        <section data-system-status aria-label="현재 시스템 상태" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {systemStatus.map((x) => (
            <div key={x.k} data-system-item={x.k} className="rounded-[16px] bg-white px-4 py-3.5 ring-1 ring-navy-100">
              <p className="text-[1rem] font-extrabold text-navy-600">{x.label}</p>
              <p className={`mt-1.5 inline-block break-keep rounded-full px-3 py-1 text-[0.98rem] font-extrabold ${x.tone}`}>{x.state}</p>
            </div>
          ))}
        </section>
      )}

      {presenter.active && !showFlow && !showClose && !showRoadmap && (
        <div data-presenter-running className="flex flex-wrap items-center gap-3 rounded-[16px] bg-teal-50 px-5 py-4">
          <p className="min-w-0 flex-1 break-keep text-[1.08rem] font-bold text-navy-900">
            시연 진행 중 — 「{step.title}」
          </p>
          <button type="button" onClick={() => presenter.goTo(presenter.pos)} className="flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[1.02rem] font-extrabold text-white">
            그 화면으로 <ArrowRight size={17} strokeWidth={2.6} />
          </button>
          <button type="button" data-presenter-end onClick={presenter.stop} className="flex min-h-[2.75rem] items-center rounded-full bg-white px-4 text-[1.02rem] font-extrabold text-navy-800">
            발표 가이드 종료
          </button>
        </div>
      )}

      {/*  ── 발표 준비 — 발표 전에만 펼칩니다 (0140 정리) ─────────────────────
           ⚠ 이 화면은 발표장 프로젝터에 그대로 켜 둡니다. 점검표 · 표현 가이드 · 연습 도구처럼
             심사위원이 보면 애매한 것은 모두 이 접힌 칸 안에 둡니다. 기본은 접힘(탭마다 기억). */}
      <details
        data-presenter-prep
        open={prepOpen}
        onToggle={(e) => {
          const o = (e.currentTarget as HTMLDetailsElement).open
          setPrepOpen(o)
          try { sessionStorage.setItem(PREP_KEY, o ? '1' : '') } catch { /* noop */ }
        }}
        className="rounded-[16px] bg-white px-5 py-4 ring-1 ring-navy-100"
      >
        <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center gap-2 text-[1.05rem] font-extrabold text-navy-600">
          <Settings2 size={18} strokeWidth={2.4} className="text-navy-400" /> 발표 준비
          {!aiOk && <span data-prep-ai-dot aria-label="AI 연결 확인 필요" className="h-2.5 w-2.5 rounded-full bg-amber-500" />}
          <ChevronDown size={18} strokeWidth={2.6} className="ml-auto text-navy-400" />
        </summary>
        <div className="mt-4 space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* ── 시연 준비 상태 ───────────────────────────────────────────── */}
          <section data-presenter-ready aria-label="시연 준비 상태">
            <h2 className="p-title">시연 준비 상태</h2>
            <p className="p-sub mt-0.5">화면이 확인할 수 있는 것만 자동으로 ✓ 합니다.</p>
            <ul className="mt-3 divide-y divide-navy-100 border-y border-navy-100">
              {checks.map((c) => (
                <li key={c.key} data-ready={c.key} data-ready-mark={c.mark} className="flex items-start gap-3 py-3">
                  {c.mark === 'ok' ? (
                    <CheckCircle2 size={22} strokeWidth={2.4} aria-label="확인됨" className="mt-0.5 shrink-0 text-teal-600" />
                  ) : c.mark === 'warn' ? (
                    <AlertTriangle size={22} strokeWidth={2.4} aria-label="주의" className="mt-0.5 shrink-0 text-amber-600" />
                  ) : (
                    <Circle size={22} strokeWidth={2.4} aria-label="확인 필요" className="mt-0.5 shrink-0 text-navy-300" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="p-body block font-extrabold">{c.label}</span>
                    <span className="p-sub block break-keep">{c.detail}</span>
                    {c.key === 'ai' && (
                      <span className="mt-2 block">
                        {mode === 'live' ? (
                          <button
                            type="button"
                            data-ai-check
                            onClick={() => void checkAi()}
                            disabled={aiCheck.busy}
                            aria-busy={aiCheck.busy}
                            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-violet-50 px-4 text-[1rem] font-extrabold text-violet-800 ring-1 ring-violet-200 transition hover:bg-violet-100 disabled:opacity-60"
                          >
                            {aiCheck.busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={2.4} />}
                            {aiCheck.busy ? 'AI 부르는 중…' : '지금 AI 연결 확인 (시연 요청으로 실제 호출)'}
                          </button>
                        ) : (
                          <span className="p-sub block">운영 연결(실제 DB)에서만 확인할 수 있습니다.</span>
                        )}
                        {aiCheck.ok !== null && (
                          <span
                            data-ai-check-result={aiCheck.ok ? 'ok' : 'fail'}
                            role="status"
                            className={`mt-1.5 block break-keep text-[1rem] font-bold ${aiCheck.ok ? 'text-teal-700' : 'text-rose-700'}`}
                          >
                            {aiCheck.ok ? `✓ ${aiCheck.text}` : `✕ 실패 — ${aiCheck.text}`}
                          </span>
                        )}
                      </span>
                    )}
                    {c.key === 'client' && (
                      <select
                        data-presenter-client
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="field-input mt-2 rounded-[14px] py-3"
                        aria-label="시연 거래처"
                      >
                        <option value="">시연 거래처 고르기</option>
                        {clients.map((c2) => (
                          <option key={c2.id} value={c2.id}>
                            {c2.isDemoGenerated ? '[시연용] ' : ''}{c2.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </li>
              ))}
              {MANUAL.map((m) => (
                <li key={m} className="py-1">
                  <label className="flex min-h-[3rem] cursor-pointer items-center gap-3">
                    <input type="checkbox" data-ready-manual={m} checked={manual.includes(m)} onChange={() => toggleManual(m)} className="h-5 w-5 accent-teal-600" />
                    <span className="p-body">{m} <span className="p-sub">(직접 확인)</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {/* ── 오늘 보여드릴 흐름 ─────────────────────────────────────────── */}
          <section data-presenter-outline aria-label="시연 순서">
            <h2 className="p-title">시연 순서 · 5~7분</h2>
            <p className="p-sub mt-0.5">아무 단계나 눌러 그 단계부터 시작할 수 있습니다.</p>
            <ol className="mt-3 divide-y divide-navy-100 border-y border-navy-100">
              {PRESENTER_STEPS.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    data-presenter-jump={i}
                    onClick={() => startAt(i)}
                    className={`-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-navy-50 ${presenter.active && presenter.index === i ? 'bg-teal-50' : ''}`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[1rem] font-black text-white">{i}</span>
                    <span className="min-w-0 flex-1">
                      <span className="p-body block font-extrabold">{s.title}</span>
                      <span className="p-sub block break-keep">{s.show}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/*  빠른 연습 — 60초 시연 투어 (0109). 실제 기록 1건으로 한 바퀴. */}
        <section data-demo-tour className="rounded-[16px] bg-navy-50 px-5 py-4">
          <p className="flex items-center gap-2 text-[1.08rem] font-extrabold text-navy-900">
            <PlayCircle size={20} strokeWidth={2.4} className="text-teal-700" /> 빠른 연습 — 60초 시연 투어
          </p>
          <p className="mt-1 break-keep text-[1.02rem] leading-snug text-navy-600">
            AX 코치 → 수거 입력 → 저장 결과 → 다시 AX 코치. 다섯 단계입니다.
            <b className="text-navy-900"> ②③단계는 직접 누르셔야 하고, 저장되는 수거 1건은 실제 기록입니다.</b>
          </p>
          <TourButton tourId="demo" className="btn-ghost mt-3 bg-white" label="60초 시연 투어 시작" />
        </section>

        {/*  발표 표현 · 시연 초기화 — 접어 둠 */}
        <details className="rounded-[16px] bg-white px-5 py-4 ring-1 ring-navy-100">
          <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center gap-2 text-[1.08rem] font-extrabold text-navy-800">
            <BookOpen size={18} className="text-teal-600" /> 발표 표현 가이드
            <span className="ml-auto text-[0.98rem] font-semibold text-navy-500">펼치기</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div data-say-do className="rounded-[14px] bg-teal-50 p-4">
              <p className="text-[1rem] font-extrabold text-teal-800">이렇게 말하기</p>
              <ul className="mt-1.5 space-y-1 text-[1rem] leading-snug text-navy-700">
                {SAY_DO.map((x) => <li key={x}>· {x}</li>)}
              </ul>
            </div>
            <div data-say-dont className="rounded-[14px] bg-rose-50 p-4">
              <p className="text-[1rem] font-extrabold text-rose-700">쓰지 않는 말</p>
              <ul className="mt-1.5 space-y-1 text-[1rem] leading-snug text-navy-700">
                {SAY_DONT.map((x) => <li key={x}>✕ {x}</li>)}
              </ul>
            </div>
          </div>
          {mode !== 'live' && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-navy-50 p-3">
              <p className="text-[1rem] leading-snug text-navy-600">시연 모드에서 바꾼 것을 기준 상태로 되돌립니다.</p>
              <DemoResetButton />
            </div>
          )}
        </details>

        {/*  발표용 성과 요약 — 바로 가기 (0137) */}
        <button
          type="button"
          data-open-ir
          onClick={() => navigate('/performance/ir')}
          className="flex w-full items-center gap-3 rounded-[16px] bg-teal-50 px-5 py-4 text-left transition hover:bg-teal-100"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[1.07rem] font-extrabold text-navy-900">발표용 성과 요약 열기</span>
            <span className="mt-0.5 block text-[1rem] leading-snug text-navy-600">도입 전 업무부담 → 동일 업무 처리 → 실제 사용 — 확인된 것만 한 화면에</span>
          </span>
          <ChevronRight size={20} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-teal-700" />
        </button>
        </div>
      </details>
    </div>
  )
}
