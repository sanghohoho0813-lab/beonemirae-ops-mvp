import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Download, Eye, Link2, Loader2, RefreshCw, ShieldOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { FilterChip } from '../ui'
import {
  QUESTIONS, RESPONDENTS, RESPONDENT_KEYS, SECTIONS, STATE_LABEL, SURVEY_TITLE,
  csvText, differs, documentText, fmtDateTime, jsonText, progressOf, stateOf, summaryLines,
  type Question, type Respondent, type ResponseRow,
} from '../../lib/bizSurvey'
import { SurveyError, adminLoad, issueInvite, revokeInvite, surveyLink, type AdminData, type InviteRow } from '../../lib/bizSurveyApi'

// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 사전 설문 — 관리자 화면 (사용자 피드백 › 사업계획서 사전 설문) · 0144
//
//  할 수 있는 것
//   · 대표님 · 이사님 각각 링크 만들기(만료일) · 폐기 — 링크는 만들 때 **한 번만** 보입니다
//   · 응답 여부 · 응답 중 / 제출 완료 / 제출 후 수정됨 / 일부 미응답
//   · 질문별 두 분 답 나란히 · 의견이 다른 질문 · 미정·추가 논의 필요만 모아 보기
//   · 전체 답변 복사 · 미확정 사항 복사 · JSON · CSV 내보내기 · 미리보기
//
//  ⚠ 서버가 「설문 관리자」로 인정한 계정만 데이터가 옵니다(biz_survey_admin_load).
//    화면에서 거르지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'diff' | 'open'

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

export function SurveyAdmin() {
  const { mode } = useAuth()
  const live = mode === 'live'
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<SurveyError | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [flash, setFlash] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ respondent: Respondent; link: string; expires_at: string } | null>(null)

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

  const rows = useMemo(() => {
    const m: Partial<Record<Respondent, ResponseRow>> = {}
    for (const r of data?.responses ?? []) m[r.respondent] = r
    return m
  }, [data])

  const say = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash((f) => (f === msg ? null : f)), 2600)
  }

  async function issue(who: Respondent, days: number) {
    setBusy(true)
    try {
      const r = await issueInvite(who, days)
      setIssued({ respondent: who, link: surveyLink(r.token), expires_at: r.expires_at })
      await load()
    } catch (e) {
      setError(e instanceof SurveyError ? e : new SurveyError('other', String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(inv: InviteRow) {
    if (!window.confirm(`${RESPONDENTS[inv.respondent].label} 링크를 폐기할까요?\n폐기하면 그 링크로는 더 열 수 없습니다. (답변은 그대로 남습니다)`)) return
    setBusy(true)
    try {
      await revokeInvite(inv.id)
      if (issued?.respondent === inv.respondent) setIssued(null)
      await load()
      say('링크를 폐기했습니다')
    } catch (e) {
      setError(e instanceof SurveyError ? e : new SurveyError('other', String(e)))
    } finally {
      setBusy(false)
    }
  }

  const diffCount = QUESTIONS.filter((q) => differs(q, rows.ceo?.answers?.[q.id], rows.director?.answers?.[q.id])).length
  const isOpenQ = (q: Question) =>
    RESPONDENT_KEYS.some((who) => !(q.onlyFor && q.onlyFor !== who) && stateOf(q, rows[who]?.answers?.[q.id]) !== 'done')
  const openCount = QUESTIONS.filter(isOpenQ).length
  const shownQs = QUESTIONS.filter((q) =>
    filter === 'all' ? true : filter === 'diff' ? differs(q, rows.ceo?.answers?.[q.id], rows.director?.answers?.[q.id]) : isOpenQ(q),
  )

  return (
    <div data-survey-admin className="space-y-4">
      <div className="rounded-2xl bg-navy-50 px-4 py-3">
        <p className="t-muted break-keep">
          신용보증기금 뉴본펭귄 사업계획서 준비용 임시 설문입니다. 대표님 · 이사님께 <b className="text-navy-700">각자 링크</b>를 만들어
          카카오톡으로 보내 주세요. 링크를 연 분은 로그인 없이 <b className="text-navy-700">자기 답만</b> 보고 고칩니다. 두 분 답을 함께 보는 것은
          이 화면(설문 관리자)뿐입니다.
        </p>
      </div>

      {flash && (
        <p data-survey-flash role="status" className="rounded-2xl bg-teal-50 px-4 py-3 font-bold text-teal-800">
          {flash}
        </p>
      )}

      {!live && (
        <p className="t-body break-keep rounded-2xl bg-navy-50 px-4 py-3 font-bold text-navy-600">
          링크 만들기 · 답변 보기는 서버에 로그인한 실제 운영 모드에서만 됩니다. 아래 미리보기는 지금도 눌러 볼 수 있습니다.
        </p>
      )}
      {error && (
        <div data-survey-admin-error={error.kind} className="rounded-2xl bg-amber-50 px-4 py-3">
          <p className="t-body break-keep font-bold text-amber-900">{error.message}</p>
          {error.kind === 'missing' && (
            <p className="t-caption mt-1 break-keep text-amber-800">
              Supabase SQL Editor 에서 supabase/proposals/PROPOSAL_0144_biz_survey.sql 을 한 번 실행하면 켜집니다. 기존 표 · 데이터는 건드리지 않습니다.
            </p>
          )}
        </div>
      )}

      {/* ── 두 분 진행 상태 · 링크 ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {RESPONDENT_KEYS.map((who) => (
          <RespondentCard
            key={who}
            who={who}
            row={rows[who]}
            invites={(data?.invites ?? []).filter((i) => i.respondent === who)}
            revisions={(data?.revisions ?? []).filter((v) => v.respondent === who).map((v) => v.submitted_at)}
            canManage={live && !!data}
            busy={busy}
            issued={issued?.respondent === who ? issued : null}
            onIssue={(days) => void issue(who, days)}
            onRevoke={(inv) => void revoke(inv)}
            onCopy={async (t, what) => say((await copyText(t)) ? `${what} 복사했습니다` : '복사하지 못했습니다 — 길게 눌러 직접 복사해 주세요')}
          />
        ))}
      </div>

      {/* ── 도구 ── */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-survey-copy-all
          disabled={!data}
          onClick={async () => say((await copyText(documentText(rows))) ? '전체 답변을 복사했습니다' : '복사하지 못했습니다')}
          className="btn-navy disabled:opacity-50"
        >
          <Copy size={16} strokeWidth={2.4} /> 전체 답변 복사
        </button>
        <button
          type="button"
          data-survey-copy-open
          disabled={!data}
          onClick={async () => say((await copyText(documentText(rows, { onlyOpen: true }))) ? '미확정 사항을 복사했습니다' : '복사하지 못했습니다')}
          className="btn-ghost disabled:opacity-50"
        >
          <Copy size={16} strokeWidth={2.4} /> 미확정 사항 복사
        </button>
        <button type="button" data-survey-json disabled={!data} onClick={() => download(`사업계획서_사전설문_${stamp()}.json`, jsonText(rows), 'application/json')} className="btn-ghost disabled:opacity-50">
          <Download size={16} strokeWidth={2.4} /> JSON
        </button>
        <button type="button" data-survey-csv disabled={!data} onClick={() => download(`사업계획서_사전설문_${stamp()}.csv`, csvText(rows), 'text/csv;charset=utf-8')} className="btn-ghost disabled:opacity-50">
          <Download size={16} strokeWidth={2.4} /> CSV (엑셀)
        </button>
        <Link to="/survey-preview/ceo" data-survey-preview-link="ceo" className="btn-ghost">
          <Eye size={16} strokeWidth={2.4} /> 미리보기 · 대표님
        </Link>
        <Link to="/survey-preview/director" data-survey-preview-link="director" className="btn-ghost">
          <Eye size={16} strokeWidth={2.4} /> 미리보기 · 이사님
        </Link>
        {live && (
          <button type="button" onClick={() => void load()} disabled={busy} className="btn-ghost disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />} 새로고침
          </button>
        )}
      </div>

      {/* ── 질문별 비교 ── */}
      {data && (
        <section data-survey-compare className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              전체 {QUESTIONS.length}
            </FilterChip>
            <FilterChip active={filter === 'diff'} onClick={() => setFilter('diff')}>
              <span data-survey-filter="diff">의견 다름 {diffCount}</span>
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
                    <CompareCard key={q.id} q={q} rows={rows} />
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

function statusOf(row: ResponseRow | undefined, who: Respondent, hasLink: boolean) {
  const p = progressOf(who, row?.answers ?? {})
  if (row?.status === 'submitted') {
    const edited = !!row.updated_at && !!row.submitted_at && Date.parse(row.updated_at) > Date.parse(row.submitted_at) + 1000
    return { key: edited ? 'edited' : 'submitted', label: edited ? '제출 후 수정 중' : '제출 완료', tone: 'bg-teal-600 text-white', p }
  }
  if (p.answered > 0) return { key: 'progress', label: '응답 중', tone: 'bg-amber-50 text-amber-800', p }
  if (hasLink) return { key: 'sent', label: '링크 보냄 · 응답 전', tone: 'bg-navy-100 text-navy-600', p }
  return { key: 'none', label: '링크 없음', tone: 'bg-navy-50 text-navy-500', p }
}

function RespondentCard({
  who,
  row,
  invites,
  revisions,
  canManage,
  busy,
  issued,
  onIssue,
  onRevoke,
  onCopy,
}: {
  who: Respondent
  row: ResponseRow | undefined
  invites: InviteRow[]
  revisions: string[]
  canManage: boolean
  busy: boolean
  issued: { link: string; expires_at: string } | null
  onIssue: (days: number) => void
  onRevoke: (inv: InviteRow) => void
  onCopy: (text: string, what: string) => void
}) {
  const [days, setDays] = useState(14)
  const now = Date.now()
  const active = invites.find((i) => !i.revoked_at && Date.parse(i.expires_at) > now) ?? null
  const st = statusOf(row, who, !!active)
  const kakao = issued
    ? `[비원미래] ${SURVEY_TITLE}\n${RESPONDENTS[who].label} 전용 링크입니다 (${fmtDateTime(issued.expires_at)}까지).\n${issued.link}\n\n중간에 닫으셔도 이 링크로 이어서 하실 수 있습니다.`
    : ''
  return (
    <div data-survey-admin-card={who} data-survey-admin-status={st.key} className="card space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-[8.5rem] flex-1 break-keep text-[1.12rem] font-extrabold text-navy-900">{RESPONDENTS[who].label}</p>
        <span className={`pill ${st.tone}`}>{st.label}</span>
        {row?.status === 'submitted' && st.p.left > 0 && <span className="pill bg-navy-100 text-navy-600">일부 미응답 {st.p.left}</span>}
      </div>
      <p data-survey-admin-progress className="t-body text-navy-700">
        {st.p.answered} / {st.p.total} 답함 · 미정·논의 {st.p.unsure} · 추후 확인 {st.p.left}
      </p>
      <ul className="t-caption space-y-0.5 text-navy-500">
        {row?.updated_at && st.p.answered > 0 && <li>최종 수정 {fmtDateTime(row.updated_at)}</li>}
        {row?.first_submitted_at && <li>처음 제출 {fmtDateTime(row.first_submitted_at)}</li>}
        {revisions.length > 0 && (
          <li data-survey-admin-revisions>
            제출 이력 {revisions.length}회 — {revisions.slice(0, 4).map(fmtDateTime).join(' · ')}
            {revisions.length > 4 ? ' …' : ''}
          </li>
        )}
        {active ? (
          <li>
            링크 유효 · {fmtDateTime(active.expires_at)}까지{active.last_used_at ? ` · 마지막 열람 ${fmtDateTime(active.last_used_at)}` : ' · 아직 열어 보지 않음'}
          </li>
        ) : (
          invites.length > 0 && <li>쓸 수 있는 링크 없음 (만료 · 폐기)</li>
        )}
      </ul>

      {issued && (
        <div data-survey-issued className="space-y-2 rounded-2xl bg-teal-50 p-3.5 ring-1 ring-inset ring-teal-100">
          <p className="break-keep text-[0.98rem] font-extrabold text-teal-900">새 링크 — 지금 한 번만 보입니다. 잃어버리면 새로 만드세요.</p>
          <input readOnly value={issued.link} onFocus={(e) => e.currentTarget.select()} data-survey-issued-link className="field-input !py-3 text-[0.92rem]" />
          <div className="flex flex-wrap gap-2">
            <button type="button" data-survey-copy-link onClick={() => onCopy(issued.link, '링크를')} className="btn-primary">
              <Link2 size={16} strokeWidth={2.4} /> 링크 복사
            </button>
            <button type="button" data-survey-copy-kakao onClick={() => onCopy(kakao, '카카오톡 문구를')} className="btn-ghost">
              <Copy size={16} strokeWidth={2.4} /> 카톡 문구 복사
            </button>
          </div>
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="링크 유효 기간"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="field-input !w-auto !py-2.5 text-[0.98rem]"
          >
            <option value={7}>7일</option>
            <option value={14}>14일</option>
            <option value={30}>30일</option>
          </select>
          <button type="button" data-survey-issue={who} disabled={busy} onClick={() => onIssue(days)} className="btn-navy disabled:opacity-50">
            <Link2 size={16} strokeWidth={2.4} /> {active ? '새 링크로 바꾸기' : '링크 만들기'}
          </button>
          {active && (
            <button type="button" data-survey-revoke={who} disabled={busy} onClick={() => onRevoke(active)} className="btn-ghost disabled:opacity-50">
              <ShieldOff size={16} strokeWidth={2.4} /> 링크 폐기
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CompareCard({ q, rows }: { q: Question; rows: Partial<Record<Respondent, ResponseRow>> }) {
  const diff = differs(q, rows.ceo?.answers?.[q.id], rows.director?.answers?.[q.id])
  return (
    <div data-survey-compare-q={q.id} data-survey-diff={diff ? 'yes' : undefined} className={`card p-4 ${diff ? 'ring-2 ring-amber-300' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold text-navy-900">
          Q{q.no}. {q.title}
          {q.core ? ' ★' : ''}
        </p>
        {diff && <span className="pill bg-amber-100 text-amber-900">의견 다름</span>}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {RESPONDENT_KEYS.map((who) => {
          const na = !!q.onlyFor && q.onlyFor !== who
          const a = rows[who]?.answers?.[q.id]
          const st = stateOf(q, a)
          const lines = summaryLines(q, a)
          return (
            <div key={who} data-survey-compare-who={who} className="rounded-xl bg-navy-50 px-3 py-2.5">
              <p className="flex flex-wrap items-center gap-1.5 text-[0.92rem] font-extrabold text-navy-500">
                {RESPONDENTS[who].title}
                {!na && (
                  <span className={`rounded-full px-2 py-0.5 text-[0.8rem] ${st === 'done' ? 'bg-teal-50 text-teal-700' : st === 'unsure' ? 'bg-amber-100 text-amber-800' : 'bg-white text-navy-500'}`}>
                    {STATE_LABEL[st]}
                  </span>
                )}
              </p>
              {na ? (
                <p className="mt-1 text-[0.98rem] text-navy-400">해당 없음 (이사님 확인 항목)</p>
              ) : lines.length ? (
                <ul className="mt-1 space-y-0.5">
                  {lines.map((l, i) => (
                    <li key={i} className="break-keep text-[0.98rem] text-navy-800">
                      {l}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[0.98rem] text-navy-400">추후 확인 (미응답)</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
