import { useState } from 'react'
import { ClipboardList, Loader2 } from 'lucide-react'
import { FIELD_BY_KEY, plainText } from '../../lib/bizPlan'
import { BizPlanError, surveySheets, type SurveySheet } from '../../lib/bizPlanApi'
import { answerView, factsOf, mismatchHints, surveyQuestionsFor } from '../../lib/bizPlanSurvey'
import type { Answer } from '../../lib/bizSurvey'
import { usePlan, when } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 관련 설문 응답 보기 (0147) — 사전 설문 실제 답지를 읽기만 합니다
//  답이 본문과 달라 보여도 자동으로 고치지 않습니다. 「다를 수 있음」만 알려 주고,
//  어느 쪽이 맞는지는 담당 · 대표님 · 이사님이 정합니다.
// ─────────────────────────────────────────────────────────────────────────────

let cache: Promise<SurveySheet[] | null> | null = null
const loadSheets = () => {
  if (!cache) cache = surveySheets().catch((e) => ((cache = null), Promise.reject(e)))
  return cache
}

const WHO: Record<string, string> = { ceo: '공동 답지 (대표님 · 이사님)', director: '이사님 개인 답지' }

export function SurveyLink({ fieldKey }: { fieldKey: string }) {
  const { data, fields } = usePlan()
  const qs = surveyQuestionsFor(fieldKey)
  const [sheets, setSheets] = useState<SurveySheet[] | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (qs.length === 0 || (data.api ?? 0) < 147) return null
  const ref = FIELD_BY_KEY.get(fieldKey)
  const text = ref ? plainText(ref.def, fields.get(fieldKey)?.value) : ''

  async function open() {
    setBusy(true)
    setErr(null)
    try {
      setSheets(await loadSheets())
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '설문 응답을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const answered = (sheets ?? []).filter((s) => Object.keys(s.answers ?? {}).length > 0)
  return (
    <section className="space-y-2" data-survey-link={qs.map((q) => q.id).join(',')}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[1.02rem] font-extrabold text-navy-900">관련 설문 응답 <span className="text-[0.9rem] font-bold text-navy-400">{qs.map((q) => `Q${q.no}`).join(' · ')}</span></h3>
        {sheets === undefined && (
          <button type="button" data-survey-open onClick={() => void open()} disabled={busy} className="btn-ghost min-h-[40px] px-3 text-[0.92rem]">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />} 응답 보기
          </button>
        )}
      </div>
      {err && <p className="text-[0.92rem] font-bold text-rose-600">{err}</p>}
      {sheets === null && <p className="text-[0.92rem] text-navy-500">사전 설문 서버(0144 · 0145)가 없습니다.</p>}
      {sheets && answered.length === 0 && <p data-survey-empty className="text-[0.92rem] text-navy-500">아직 설문 응답이 없습니다.</p>}
      {answered.map((s) => {
        const hints = qs.flatMap((q) => mismatchHints(text, factsOf(q, s.answers?.[q.id] as Answer | undefined)))
        return (
          <div key={s.respondent} data-survey-sheet={s.respondent} className="space-y-1.5 rounded-xl bg-navy-50/60 px-3 py-2.5">
            <p className="text-[0.85rem] font-bold text-navy-500">
              {WHO[s.respondent] ?? s.respondent} · {s.status === 'submitted' ? '제출됨' : '작성 중'}
              {s.updated_at ? ` · ${when(s.updated_at)}` : ''}
              {s.edited_by ? ` · 마지막 ${s.edited_by}` : ''}
            </p>
            {qs.map((q) => {
              const v = answerView(q, s.answers?.[q.id] as Answer | undefined)
              return (
                <div key={q.id} data-survey-q={q.id} className="text-[0.93rem]">
                  <p className="font-bold text-navy-800">
                    Q{q.no}. {q.title} <span className="font-semibold text-navy-400">· {v.state}</span>
                  </p>
                  {v.lines.map((l, i) => (
                    <p key={i} className="break-keep text-navy-700">— {l}</p>
                  ))}
                </div>
              )
            })}
            {hints.length > 0 && (
              <ul data-survey-mismatch={hints.length} className="space-y-0.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[0.9rem] font-bold text-amber-900 ring-1 ring-amber-200">
                {hints.map((h, i) => (
                  <li key={i} className="break-keep">{h}</li>
                ))}
                <li className="font-semibold text-amber-800">자동으로 고치지 않습니다 — 맞는 쪽을 정해 근거 메모에 남겨 주세요.</li>
              </ul>
            )}
          </div>
        )
      })}
      <p className="text-[0.85rem] text-navy-400">설문에 답했다고 본문이 확정되지는 않습니다.</p>
    </section>
  )
}
