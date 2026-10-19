import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Copy, Download, Eye, Loader2, RefreshCw, Star } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { FilterChip } from '../ui'
import {
  QUESTIONS, SECTIONS, STATE_LABEL, SURVEY_MENU_NAME, SURVEY_PATH, SURVEY_TITLE,
  csvText, documentText, fmtDateTime, jsonText, progressOf, stateOf, summaryLines,
  type Question, type ResponseRow,
} from '../../lib/bizSurvey'
import { SurveyError, adminLoad, type AdminData } from '../../lib/bizSurveyApi'

// ─────────────────────────────────────────────────────────────────────────────
// 뉴본펭귄 사전 설문 — 관리자 화면 (사용자 피드백 › ★ 뉴본펭귄 사전 설문) · 0144 · 0145
//
//  대표님: 「링크 필요 없이 · 두 분 중 한 분만 답하면 되고 · 시작하기 누르면 바로 ·
//  다 입력하고 나면 관리자 요청 화면에 딱 나오도록」.
//
//  할 수 있는 것
//   · 「시작하기」 — 이 계정으로 바로 답합니다(대표·관리자 · 사무실 계정). 답지는 하나.
//   · 상태(작성 전 / 작성 중 / 제출 완료 / 제출 후 수정 중) · 마지막 작성자 · 최종 수정 · 제출 이력
//   · 섹션별 답변 전체 · 미정·미응답만 모아 보기
//   · 전체 답변 복사 · 미확정 사항 복사 · JSON · CSV 내보내기 · 미리보기(저장 안 됨)
//
//  ⚠ 서버가 「설문 관리자」로 인정한 계정만 데이터가 옵니다(biz_survey_admin_load).
//    화면에서 거르지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'open'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 파일 이름에 붙이는 한국 시각 (예: 20261019-1530) */
const stamp = () => {
  const k = new Date(Date.now() + 9 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}-${p(k.getUTCHours())}${p(k.getUTCMinutes())}`
}

function statusOf(row: ResponseRow | undefined) {
  const p = progressOf('shared', row?.answers ?? {})
  if (row?.status === 'submitted') {
    const edited = !!row.updated_at && !!row.submitted_at && Date.parse(row.updated_at) > Date.parse(row.submitted_at) + 1000
    return { key: edited ? 'edited' : 'submitted', label: edited ? '제출 후 수정 중' : '제출 완료', tone: 'bg-teal-600 text-white', p }
  }
  if (p.answered > 0) return { key: 'progress', label: '작성 중', tone: 'bg-amber-100 text-amber-900', p }
  return { key: 'none', label: '작성 전', tone: 'bg-navy-100 text-navy-600', p }
}

export function SurveyAdmin() {
  const { mode } = useAuth()
  const live = mode === 'live'
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<SurveyError | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!live) return
    setBusy(true)
    try {
      setData(await adminLoad())
      setError(null)
    } catch (e) {
      setError(e instanceof SurveyError ? e : new SurveyError('other', String(e)))
    } finally {
      setBusy(false)
    }
  }, [live])

  useEffect(() => {
    void load()
  }, [load])

  //  공동 답지 = 0144 의 'ceo' 줄 (0145). 예전 링크로 받은 이사님 줄이 있으면 따로 알려 드립니다.
  const row = useMemo(() => data?.responses.find((r) => r.respondent === 'ceo'), [data])
  const legacy = useMemo(() => {
    const r = data?.responses.find((x) => x.respondent === 'director')
    return r && progressOf('shared', r.answers ?? {}).answered > 0 ? r : undefined
  }, [data])
  const revisions = (data?.revisions ?? []).filter((v) => v.respondent === 'ceo').map((v) => v.submitted_at)
  const st = statusOf(row)

  const say = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash((f) => (f === msg ? null : f)), 2600)
  }
  const copy = async (text: string, what: string) => say((await copyText(text)) ? `${what} 복사했습니다` : '복사하지 못했습니다 — 길게 눌러 직접 복사해 주세요')

  const isOpenQ = (q: Question) => stateOf(q, row?.answers?.[q.id]) !== 'done'
  const openCount = QUESTIONS.filter(isOpenQ).length
  const shownQs = QUESTIONS.filter((q) => (filter === 'all' ? true : isOpenQ(q)))
  const startLabel = st.key === 'none' ? '시작하기' : st.key === 'progress' ? '이어서 답하기' : '답변 확인 · 수정하기'

  return (
    <div data-survey-admin className="space-y-4">
      {/* ── 한 장 — 상태 · 시작하기 ── */}
      <section
        data-survey-admin-card="shared"
        data-survey-admin-status={st.key}
        className="space-y-3 rounded-3xl bg-gradient-to-br from-amber-50 via-white to-teal-50 p-4 ring-2 ring-inset ring-amber-300 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex min-w-[11rem] flex-1 items-center gap-1.5 break-keep text-[1.2rem] font-extrabold text-navy-900">
            <Star size={20} strokeWidth={2.4} className="shrink-0 fill-amber-400 text-amber-500" />
            {SURVEY_MENU_NAME}
          </p>
          <span className={`pill ${st.tone}`}>{st.label}</span>
          {row?.status === 'submitted' && st.p.left > 0 && <span className="pill bg-navy-100 text-navy-600">일부 미응답 {st.p.left}</span>}
        </div>
        <p className="t-body break-keep text-navy-700">
          {SURVEY_TITLE} · 7개 섹션 26문항. <b className="text-navy-900">대표님 · 이사님 중 한 분만</b> 답하시면 됩니다. 링크 없이 아래
          「{startLabel}」을 누르면 바로 시작하고, 다른 분이 열어도 같은 답지에 이어집니다.
        </p>
        <p data-survey-admin-progress className="t-body font-bold text-navy-800">
          {st.p.answered} / {st.p.total} 답함 · 미정·논의 {st.p.unsure} · 추후 확인 {st.p.left}
        </p>
        <ul className="t-caption space-y-0.5 text-navy-500">
          {row?.edited_by && st.p.answered > 0 && <li data-survey-admin-editor>마지막 작성 {row.edited_by}</li>}
          {row?.updated_at && st.p.answered > 0 && <li>최종 수정 {fmtDateTime(row.updated_at)}</li>}
          {row?.first_submitted_at && <li>처음 제출 {fmtDateTime(row.first_submitted_at)}</li>}
          {revisions.length > 0 && (
            <li data-survey-admin-revisions>
              제출 이력 {revisions.length}회 — {revisions.slice(0, 4).map(fmtDateTime).join(' · ')}
              {revisions.length > 4 ? ' …' : ''}
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link to={SURVEY_PATH} data-survey-start-link className="btn-primary min-h-[3.2rem] flex-1 sm:flex-none sm:px-6">
            {startLabel} <ArrowRight size={18} strokeWidth={2.4} />
          </Link>
          <Link to="/survey-preview" data-survey-preview-link className="btn-ghost">
            <Eye size={16} strokeWidth={2.4} /> 미리보기 (저장 안 됨)
          </Link>
        </div>
      </section>

      {flash && (
        <p data-survey-flash role="status" className="rounded-2xl bg-teal-50 px-4 py-3 font-bold text-teal-800">
          {flash}
        </p>
      )}

      {!live && (
        <p className="t-body break-keep rounded-2xl bg-navy-50 px-4 py-3 font-bold text-navy-600">
          답하기 · 답변 보기는 서버에 로그인한 실제 운영 모드에서만 됩니다. 미리보기는 지금도 눌러 볼 수 있습니다.
        </p>
      )}
      {error && (
        <div data-survey-admin-error={error.kind} className="rounded-2xl bg-amber-50 px-4 py-3">
          <p className="t-body break-keep font-bold text-amber-900">{error.message}</p>
          {error.kind === 'missing' && (
            <p className="t-caption mt-1 break-keep text-amber-800">
              Supabase SQL Editor 에서 PROPOSAL_0144_biz_survey.sql → PROPOSAL_0145_newborn_survey_inapp.sql 순서로 한 번씩 실행하면 켜집니다. 기존 표 · 데이터는 건드리지 않습니다.
            </p>
          )}
        </div>
      )}

      {legacy && (
        <div data-survey-legacy className="flex flex-wrap items-center gap-2 rounded-2xl bg-navy-50 px-4 py-3">
          <p className="t-body min-w-0 flex-1 break-keep text-navy-700">
            예전 링크 방식으로 받은 이사님 답지가 따로 있습니다 ({progressOf('shared', legacy.answers ?? {}).answered}개 답함).
          </p>
          <button type="button" data-survey-legacy-copy onClick={() => void copy(documentText(legacy), '예전 답지를')} className="btn-ghost">
            <Copy size={16} strokeWidth={2.4} /> 예전 답지 복사
          </button>
        </div>
      )}

      {/* ── 도구 ── */}
      <div className="flex flex-wrap gap-2">
        <button type="button" data-survey-copy-all disabled={!data} onClick={() => void copy(documentText(row), '전체 답변을')} className="btn-navy disabled:opacity-50">
          <Copy size={16} strokeWidth={2.4} /> 전체 답변 복사
        </button>
        <button
          type="button"
          data-survey-copy-open
          disabled={!data}
          onClick={() => void copy(documentText(row, { onlyOpen: true }), '미확정 사항을')}
          className="btn-ghost disabled:opacity-50"
        >
          <Copy size={16} strokeWidth={2.4} /> 미확정 사항 복사
        </button>
        <button type="button" data-survey-json disabled={!data} onClick={() => download(`뉴본펭귄_사전설문_${stamp()}.json`, jsonText(row), 'application/json')} className="btn-ghost disabled:opacity-50">
          <Download size={16} strokeWidth={2.4} /> JSON
        </button>
        <button type="button" data-survey-csv disabled={!data} onClick={() => download(`뉴본펭귄_사전설문_${stamp()}.csv`, csvText(row), 'text/csv;charset=utf-8')} className="btn-ghost disabled:opacity-50">
          <Download size={16} strokeWidth={2.4} /> CSV (엑셀)
        </button>
        {live && (
          <button type="button" onClick={() => void load()} disabled={busy} className="btn-ghost disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />} 새로고침
          </button>
        )}
      </div>

      {/* ── 답변 — 섹션별 ── */}
      {data && (
        <section data-survey-results className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              전체 {QUESTIONS.length}
            </FilterChip>
            <FilterChip active={filter === 'open'} onClick={() => setFilter('open')}>
              <span data-survey-filter="open">미정 · 미응답 {openCount}</span>
            </FilterChip>
          </div>
          {shownQs.length === 0 ? (
            <p className="t-body rounded-2xl bg-navy-50 px-4 py-4 text-navy-500">해당하는 질문이 없습니다.</p>
          ) : (
            SECTIONS.map((s) => {
              const qs = shownQs.filter((q) => q.section === s.id)
              if (!qs.length) return null
              return (
                <div key={s.id} className="space-y-2">
                  <p className="px-1 text-[0.95rem] font-extrabold text-teal-700">
                    SECTION {s.no} · {s.title}
                  </p>
                  {qs.map((q) => (
                    <ResultCard key={q.id} q={q} row={row} />
                  ))}
                </div>
              )
            })
          )}
        </section>
      )}
    </div>
  )
}

function ResultCard({ q, row }: { q: Question; row: ResponseRow | undefined }) {
  const a = row?.answers?.[q.id]
  const st = stateOf(q, a)
  const lines = summaryLines(q, a)
  return (
    <div data-survey-result-q={q.id} data-survey-result-state={st} className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold text-navy-900">
          Q{q.no}. {q.title}
          {q.core ? ' ★' : ''}
        </p>
        <span className={`pill ${st === 'done' ? 'bg-teal-50 text-teal-700' : st === 'unsure' ? 'bg-amber-100 text-amber-800' : 'bg-navy-100 text-navy-500'}`}>
          {STATE_LABEL[st]}
        </span>
      </div>
      {lines.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {lines.map((l, i) => (
            <li key={i} className="break-keep text-[0.98rem] text-navy-800">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[0.98rem] text-navy-400">추후 확인 (미응답)</p>
      )}
    </div>
  )
}
