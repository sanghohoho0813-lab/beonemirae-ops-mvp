import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { aiAssist } from '../lib/evidenceRepo'
import { aiMetaLine } from '../lib/aiVendor'
import { openRequests, todayProgress } from '../lib/ops'
import { planGaps } from '../lib/planGap'
import { dunningSummary } from '../lib/dunning'
import { today } from '../lib/format'
import { REQUEST_KINDS } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 업무 보조 AI 세 가지 (0141 · 신보 발표) — 화면 쪽
//
//   AiBriefingCard  대시보드 「AI 오늘 브리핑」 — 오늘 숫자(건수 · 금액)만 보내고 먼저 챙길 일 셋
//   AiFieldNote     수거 입력 「AI로 메모 정리」 — 특이사항 칸 글 → 요약 · 확인할 점 · 후속 조치 제안
//   AiDunningBox    독촉 문구 「AI로 다시 쓰기」 — 병원 이름 · 금액은 안 보내고 {병원명} {금액} 자리를 여기서 채움
//
//  ⚠ 셋 다 실제 서버 함수(ai-triage) → 실제 모델 호출입니다. 실패하면 까닭을 그대로 보여 주고,
//    결과를 지어내지 않습니다. 저장 · 전송 · 상태 변경은 하지 않습니다 — 담당자가 고르고 고쳐 씁니다.
// ─────────────────────────────────────────────────────────────────────────────

/** AI 를 부를 수 있는 자리인가 — 운영 연결 · 관리자 · 사무실 (요청 분석과 같은 기준) */
export function useCanAi(): boolean {
  const { role, mode } = useAuth()
  const ready = useSchemaAtLeast(106) === true
  return ready && mode === 'live' && (role === 'admin' || role === 'office')
}

type State<T> = { busy: boolean; error: string; result: (T & { model: string }) | null; ms: number | null; logged: boolean }
const idle = { busy: false, error: '', result: null, ms: null, logged: true }

function useAssist<T>(task: 'briefing' | 'field_note' | 'dunning') {
  const { profile } = useAuth()
  const [st, setSt] = useState<State<T>>(idle)
  const run = async (input: unknown) => {
    if (st.busy) return
    setSt((s) => ({ ...s, busy: true, error: '' }))
    const r = await aiAssist<T>(task, input, profile?.name ?? '')
    if (r.ok) setSt({ busy: false, error: '', result: r.result, ms: r.ms, logged: r.logged })
    else setSt((s) => ({ ...s, busy: false, error: r.error }))
  }
  return { st, run, reset: () => setSt(idle) }
}

/** 공통 틀 — 제목 · 「AI 제안 → 담당자 확인」 · 실행 단추 · 기다림 · 실패 · 결과 · 아래 줄 */
function AiShell({
  attr, title, desc, runLabel, onRun, busy, hasResult, error, meta, disabled = false, disabledNote, children,
}: {
  attr: string
  title: string
  desc?: string
  runLabel: ReactNode
  onRun: () => void
  busy: boolean
  hasResult: boolean
  error: string
  meta?: string
  disabled?: boolean
  disabledNote?: string
  children?: ReactNode
}) {
  return (
    <section data-ai-assist={attr} className="rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={20} strokeWidth={2.4} className="shrink-0 text-violet-600" />
        {/*  0142 — 칸이 좁으면(수거 입력 왼쪽 칸) 단추가 글 아래로 내려갑니다. 글이 세로로 좁게 눌리지 않게. */}
        <div className="min-w-0 flex-1 basis-[16rem]">
          <p className="break-keep text-[1.12rem] font-black text-violet-950">
            {title}
            <span className="ml-2 inline-block rounded-full bg-white px-2.5 py-0.5 align-middle text-[0.88rem] font-extrabold text-violet-800 ring-1 ring-violet-200">
              AI 제안 → 담당자 확인
            </span>
          </p>
          {desc && <p className="mt-0.5 break-keep text-[0.98rem] text-violet-900/80">{desc}</p>}
        </div>
        <button
          type="button"
          data-ai-assist-run={attr}
          onClick={onRun}
          disabled={busy || disabled}
          aria-busy={busy}
          className={`inline-flex min-h-[3rem] shrink-0 items-center gap-1.5 rounded-full px-5 text-[1.02rem] font-extrabold transition disabled:opacity-50 ${
            hasResult && !busy ? 'bg-white text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100' : 'bg-violet-600 text-white shadow-md hover:bg-violet-700'
          }`}
        >
          {busy ? <><Loader2 size={18} className="animate-spin" /> 분석 중…</> : hasResult ? '다시 하기' : <><Sparkles size={18} strokeWidth={2.4} /> {runLabel}</>}
        </button>
      </div>
      {disabled && disabledNote && <p className="mt-2 break-keep text-[0.98rem] text-violet-900/80">{disabledNote}</p>}
      {busy && (
        <p data-ai-assist-busy className="mt-3 flex items-center gap-2 break-keep rounded-xl bg-white px-3.5 py-3 text-[1.05rem] font-bold text-violet-900">
          <Loader2 size={20} className="shrink-0 animate-spin text-violet-600" /> AI가 읽고 있습니다… (보통 3~5초)
        </p>
      )}
      {error && !busy && (
        <div data-ai-assist-error role="status" className="mt-3 rounded-xl bg-white px-3.5 py-3">
          <p className="break-keep text-[1.02rem] font-bold text-rose-700">AI 결과를 받지 못했습니다. 업무는 그대로 진행할 수 있습니다.</p>
          <p className="t-caption mt-0.5 break-keep text-navy-500">까닭: {error}</p>
        </div>
      )}
      {hasResult && !busy && children}
      {hasResult && !busy && meta && <p data-ai-assist-meta className="mt-2.5 break-keep text-[0.95rem] font-semibold text-navy-500">{meta}</p>}
    </section>
  )
}

// ── ① AI 오늘 브리핑 ─────────────────────────────────────────────────────────

type Briefing = { headline: string; items: { title: string; detail: string }[]; note: string }

/** 브리핑에 보내는 것 — 숫자뿐 (거래처 이름 · 요청 글 · 연락처는 보내지 않음) */
export function briefingInput(data: ReturnType<typeof useData>['data']) {
  const p = todayProgress(data)
  const open = openRequests(data)
  const kinds: Record<string, number> = {}
  for (const r of open) if ((REQUEST_KINDS as string[]).includes(r.type)) kinds[r.type] = (kinds[r.type] ?? 0) + 1
  const dun = dunningSummary(data)
  return {
    date: today(),
    visitsPlanned: p.planned,
    visitsDone: p.done,
    openRequests: open.length,
    urgentRequests: open.filter((r) => r.urgent).length,
    requestKinds: kinds,
    unscheduledClients: planGaps(data).length,
    overdueClients: dun.rows.length,
    overdueAmount: Math.round(dun.total),
  }
}

export function AiBriefingCard() {
  const can = useCanAi()
  const { data } = useData()
  const { st, run } = useAssist<Briefing>('briefing')
  if (!can) return null
  const r = st.result
  return (
    <div className="mb-3">
      <AiShell
        attr="briefing"
        title="AI 오늘 브리핑"
        desc="오늘 숫자(방문 · 요청 · 미수)만 AI에 보내 「먼저 챙길 일」을 정리합니다. 거래처 이름은 보내지 않습니다."
        runLabel="AI 브리핑 받기"
        onRun={() => void run(briefingInput(data))}
        busy={st.busy}
        hasResult={!!r}
        error={st.error}
        meta={r ? aiMetaLine(r.model, st.ms) + (st.logged ? '' : ' · 호출 기록을 남기지 못했습니다') : undefined}
      >
        {r && (
          <div data-ai-briefing className="mt-3 rounded-xl bg-white px-4 py-3.5 ring-1 ring-violet-100">
            <p data-ai-briefing-headline className="break-keep text-[1.15rem] font-black text-navy-950">{r.headline}</p>
            <ol className="mt-2.5 space-y-2">
              {r.items.map((it, i) => (
                <li key={i} data-ai-briefing-item className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[0.95rem] font-black text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-keep text-[1.08rem] font-extrabold text-navy-900">{it.title}</span>
                    {it.detail && <span className="block break-keep text-[1rem] text-navy-700">{it.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {r.note && <p className="mt-2.5 break-keep text-[1rem] text-navy-600">{r.note}</p>}
          </div>
        )}
      </AiShell>
    </div>
  )
}

// ── ② AI 현장 메모 정리 ──────────────────────────────────────────────────────

type FieldNote = { summary: string; issues: string[]; followups: { kind: string; text: string }[]; cleaned: string }

export function AiFieldNote({ memo, onApply }: { memo: string; onApply: (text: string) => void }) {
  const can = useCanAi()
  const { st, run } = useAssist<FieldNote>('field_note')
  const [applied, setApplied] = useState(false)
  if (!can) return null
  const r = st.result
  const short = memo.trim().length < 4
  return (
    <div className="mt-3">
      <AiShell
        attr="field_note"
        title="AI 메모 정리"
        desc="급하게 적은 메모를 사무실이 바로 쓸 수 있게 정리하고, 후속 조치를 제안합니다."
        runLabel="AI로 메모 정리"
        onRun={() => { setApplied(false); void run({ memo }) }}
        busy={st.busy}
        hasResult={!!r}
        error={st.error}
        disabled={short}
        disabledNote={short ? '특이사항 칸에 메모를 먼저 적어 주세요 (4자 이상).' : undefined}
        meta={r ? aiMetaLine(r.model, st.ms) + (st.logged ? '' : ' · 호출 기록을 남기지 못했습니다') : undefined}
      >
        {r && (
          <div data-ai-field-note className="mt-3 space-y-2.5 rounded-xl bg-white px-4 py-3.5 ring-1 ring-violet-100">
            <div>
              <p className="text-[0.98rem] font-extrabold text-violet-800">요약</p>
              <p data-ai-field-summary className="break-keep text-[1.08rem] font-bold text-navy-950">{r.summary}</p>
            </div>
            {r.issues.length > 0 && (
              <div>
                <p className="text-[0.98rem] font-extrabold text-violet-800">확인할 점</p>
                <ul className="list-disc space-y-0.5 pl-5 text-[1.02rem] text-navy-900">{r.issues.map((x) => <li key={x} className="break-keep">{x}</li>)}</ul>
              </div>
            )}
            {r.followups.length > 0 && (
              <div>
                <p className="text-[0.98rem] font-extrabold text-violet-800">후속 조치 제안 <span className="font-semibold text-navy-500">(자동으로 등록하지 않습니다)</span></p>
                <ul className="mt-1 space-y-1">
                  {r.followups.map((f, i) => (
                    <li key={i} data-ai-followup={f.kind} className="flex items-start gap-2 break-keep text-[1.02rem] text-navy-900">
                      <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-[0.9rem] font-extrabold text-violet-800">{f.kind}</span>
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg bg-violet-50 px-3 py-2.5">
              <p className="text-[0.98rem] font-extrabold text-violet-800">특이사항 정리본</p>
              <p data-ai-field-cleaned className="break-keep text-[1.05rem] text-navy-950">{r.cleaned}</p>
              <button
                type="button"
                data-ai-field-apply
                onClick={() => { onApply(r.cleaned); setApplied(true) }}
                className="mt-2 inline-flex min-h-[2.75rem] items-center rounded-full bg-violet-600 px-4 text-[1rem] font-extrabold text-white hover:bg-violet-700"
              >
                {applied ? '특이사항 칸에 넣었습니다 — 저장은 아래 「수거 완료 저장」' : '정리본으로 바꾸기'}
              </button>
            </div>
          </div>
        )}
      </AiShell>
    </div>
  )
}

// ── ③ AI 독촉 문자 초안 ──────────────────────────────────────────────────────

export function AiDunningBox({
  months, oldestMonth, fill, onText,
}: {
  months: number
  oldestMonth: string
  /** {병원명} · {금액} 을 실제 값으로 — 이 값은 AI 에 보내지 않습니다 */
  fill: { name: string; amount: string }
  onText: (text: string | null) => void
}) {
  const can = useCanAi()
  const { st, run } = useAssist<{ message: string }>('dunning')
  const [tone, setTone] = useState<'soft' | 'firm'>('soft')
  const r = st.result
  //  자리표시자를 이 화면에서만 채웁니다 (이름 · 금액은 AI 에 간 적이 없음)
  const text = r && !st.busy ? r.message.split('{병원명}').join(fill.name).split('{금액}').join(fill.amount) : null
  useEffect(() => { if (text) onText(text) }, [text, onText])
  if (!can) return null
  const go = async (t: 'soft' | 'firm') => {
    setTone(t)
    onText(null)
    await run({ months, oldestMonth, tone: t })
  }
  return (
    <div className="mb-3">
      <AiShell
        attr="dunning"
        title="AI 문구 다시 쓰기"
        desc="병원 이름 · 금액은 AI에 보내지 않습니다. 밀린 기간과 말투만 보내고, 이름 · 금액은 이 화면에서 채웁니다."
        runLabel="AI로 부드럽게"
        onRun={() => void go('soft')}
        busy={st.busy}
        hasResult={!!r}
        error={st.error}
        meta={r ? aiMetaLine(r.model, st.ms) : undefined}
      >
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" data-ai-dunning-tone="soft" onClick={() => void go('soft')} className={`rounded-full px-4 py-2 text-[0.98rem] font-extrabold ${tone === 'soft' ? 'bg-violet-600 text-white' : 'bg-white text-violet-800 ring-1 ring-violet-200'}`}>부드럽게</button>
          <button type="button" data-ai-dunning-tone="firm" onClick={() => void go('firm')} className={`rounded-full px-4 py-2 text-[0.98rem] font-extrabold ${tone === 'firm' ? 'bg-violet-600 text-white' : 'bg-white text-violet-800 ring-1 ring-violet-200'}`}>정중하지만 분명하게</button>
          <span className="self-center text-[0.95rem] text-navy-500">아래 문구 칸이 AI 초안으로 바뀝니다 — 고쳐서 보내세요</span>
        </div>
      </AiShell>
    </div>
  )
}
