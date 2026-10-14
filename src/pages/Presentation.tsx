import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ArrowRight, CheckCircle2, Circle, AlertTriangle, BookOpen, PlayCircle, ChevronRight, Presentation as PresentIcon } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { usePresenter } from '../context/PresenterContext'
import { canAccess } from '../lib/access'
import { today } from '../lib/format'
import { CLOSING, FLOW, PRESENTER_CLIENT_KEY, PRESENTER_STEPS, kstStamp } from '../lib/presenter'
import { DemoResetButton } from '../components/DemoControls'
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

type Mark = 'ok' | 'todo' | 'warn'

export function Presentation() {
  const navigate = useNavigate()
  const { data } = useData()
  const { role, mode } = useAuth()
  const presenter = usePresenter()

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

  const showFlow = !presenter.active || presenter.index === 0
  const showClose = presenter.active && presenter.index === PRESENTER_STEPS.length - 1
  const startAt = (index: number) => presenter.start({ clientId: chosen?.id ?? null, index })

  return (
    <div data-presentation className="mx-auto w-full max-w-[1100px] space-y-6">
      {/* 상단 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[1.05rem] font-extrabold text-teal-700">심사 시연</p>
          <h1 className="t-page break-keep text-navy-900">발표 가이드</h1>
        </div>
        <button
          onClick={() => { if (presenter.active) presenter.stop(); navigate('/') }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-navy-500 shadow-card transition active:scale-95"
          aria-label="닫기"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── 마무리 (7단계) ─────────────────────────────────────────────── */}
      {showClose && (
        <section data-presenter-close className="rounded-[22px] bg-navy-900 px-6 py-7 text-white sm:px-9 sm:py-9">
          <p className="text-[1.08rem] font-extrabold text-teal-300">마무리</p>
          <ol className="mt-3 flex flex-wrap items-center gap-2 text-[1.3rem] font-black sm:text-[1.6rem]">
            {CLOSING.flow.map((f, i) => (
              <li key={f} className="flex items-center gap-2">
                {i > 0 && <ArrowRight size={22} strokeWidth={2.8} aria-hidden="true" className="text-teal-300" />}
                {f}
              </li>
            ))}
          </ol>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { k: '구현됨', items: CLOSING.built, tone: 'text-teal-300' },
              { k: '실증 단계', items: CLOSING.piloting, tone: 'text-amber-300' },
              { k: '향후 계획', items: CLOSING.planned, tone: 'text-navy-200' },
            ].map((col) => (
              <div key={col.k} data-close-col={col.k} className="rounded-[16px] bg-white/5 px-4 py-4">
                <p className={`text-[1.05rem] font-extrabold ${col.tone}`}>{col.k}</p>
                <ul className="mt-2 space-y-1.5">
                  {col.items.map((it) => (
                    <li key={it} className="break-keep text-[1.05rem] leading-snug text-white">
                      {it}
                      {/*  AI 는 코드가 있어도 실제 호출 성공 기록이 있어야 「구현됨」만으로 둡니다 */}
                      {col.k === '구현됨' && it.startsWith('AI') && !aiOk && (
                        <span data-close-ai-unverified className="ml-1.5 whitespace-nowrap text-[0.98rem] font-bold text-amber-300">· 실제 호출 확인 전</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p data-close-message className="mt-6 break-keep text-[1.2rem] font-bold leading-relaxed text-white sm:text-[1.35rem]">
            {CLOSING.message}
          </p>
        </section>
      )}

      {/* ── 시작 · 전체 흐름 (0단계) ───────────────────────────────────── */}
      {showFlow && (
        <section className="rounded-[22px] bg-navy-900 px-6 py-7 text-white sm:px-9 sm:py-9">
          <p className="text-[1.08rem] font-extrabold text-teal-300">비원미래 AX 운영시스템 — 실제 업무 흐름</p>
          <p className="mt-2 break-keep text-[1.3rem] font-black leading-snug sm:text-[1.7rem]">
            병원 요청부터 현장 수거, 내부 운영, AI 업무보조까지 하나의 데이터 흐름으로 연결합니다.
          </p>
          <ol data-presenter-flow className="mt-6 flex flex-wrap items-center gap-2">
            {FLOW.map((f, i) => (
              <li key={f} className="flex items-center gap-2">
                {i > 0 && <ChevronRight size={20} strokeWidth={2.8} aria-hidden="true" className="text-teal-300" />}
                <span className="rounded-full bg-white/10 px-4 py-2 text-[1.08rem] font-extrabold">{f}</span>
              </li>
            ))}
          </ol>
          {!presenter.active ? (
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                data-presenter-start
                onClick={() => startAt(0)}
                className="flex min-h-[3.5rem] items-center gap-2 rounded-[14px] bg-teal-500 px-6 text-[1.2rem] font-black text-white transition hover:bg-teal-600"
              >
                <PresentIcon size={22} strokeWidth={2.4} /> 심사 시연 시작
              </button>
            </div>
          ) : (
            <p className="mt-6 break-keep text-[1.05rem] font-bold text-navy-200">
              안내 카드가 화면을 옮겨도 따라다닙니다. 「시연 시작」을 누르면 첫 화면으로 갑니다.
            </p>
          )}
        </section>
      )}

      {presenter.active && !showFlow && !showClose && (
        <div data-presenter-running className="flex flex-wrap items-center gap-3 rounded-[16px] bg-teal-50 px-5 py-4">
          <p className="min-w-0 flex-1 break-keep text-[1.08rem] font-bold text-navy-900">
            시연 진행 중 — STEP {presenter.index} 「{PRESENTER_STEPS[presenter.index].title}」
          </p>
          <button type="button" onClick={() => presenter.goTo(presenter.index)} className="flex min-h-[2.75rem] items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[1.02rem] font-extrabold text-white">
            그 화면으로 <ArrowRight size={17} strokeWidth={2.6} />
          </button>
          <button type="button" data-presenter-end onClick={presenter.stop} className="flex min-h-[2.75rem] items-center rounded-full bg-white px-4 text-[1.02rem] font-extrabold text-navy-800">
            발표 가이드 종료
          </button>
        </div>
      )}

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
  )
}
