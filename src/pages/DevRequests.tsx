import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Inbox, Loader2, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, FilterChip } from '../components/ui'
import { FeedbackButton } from '../components/FeedbackSheet'
import { useAuth, ROLE_LABEL } from '../context/AuthContext'
import { loadDevRequests, updateDevRequest, type DevRequestRow } from '../lib/repo'
import { DEV_REQUEST_STATUSES, DEV_STATUS_STYLE, type DevRequestStatus } from '../lib/devRequests'
import {
  GROUP_LABEL, USAGE_LABEL, WORK_LABEL, answerLabel, isFeedbackV2, parseResponse, summarize,
  MANAGEMENT_STEPS, stepsFor, type FeedbackQuestion, type ParsedFeedback, type RespondentGroup,
} from '../lib/feedbackV2'
import { friendlyError } from '../lib/supabase'
import { EXCEL_TOPIC, parseExcelChecks } from '../lib/excelCheck'
import { prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 피드백 (관리자 전용)
//
//  현장·사무실·대표가 남긴 후기가 한 화면에 쌓입니다. 누가 언제 무엇을
//  답했는지 그대로 남고, 지울 수 없습니다(0022) — 불편했다는 기록이
//  사라지면 같은 문제가 반복돼도 알 수 없습니다.
//
//  ── 숫자를 어떻게 읽어야 하는가 (0100) ──────────────────────────────────
//
//  ⚠ 여기 나오는 평균은 **느낌 점수**입니다. 「사용성 4.2」는 「업무시간이
//    20% 줄었다」와 전혀 다른 말입니다. 시간·비용이 실제로 줄었는지는
//    시스템 기록(입력 시각·건수)과 도입 전후 비교로만 말할 수 있습니다.
//    이 화면은 그 숫자를 만들어 내지 않습니다.
//  ⚠ 몇 명이 답했는지를 늘 함께 씁니다. 한 사람이 매긴 4.5 와 열 사람이
//    매긴 4.5 는 다른 것인데, 평균만 보이면 같아 보입니다.
//  ⚠ 「아직 판단하기 어려워요」는 평균에 넣지 않고 따로 셉니다. 3점으로
//    치면 「보통이다」가 되는데, 그분은 보통이라고 말한 적이 없습니다.
//
//  예전 형식(v1 「주제 › 선택지」)으로 들어온 답도 그대로 보입니다.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = '남은 것' | '전체'

/** 화면에서 쓰기 좋게 한 줄로 — v2 는 풀어서, v1 은 있는 그대로 */
interface Item {
  row: DevRequestRow
  v2: ParsedFeedback | null
  /** 여러 사람이 함께 고른 것을 셀 때 쓰는 「고른 말」 */
  picks: string[]
}

export function DevRequests() {
  const { mode } = useAuth()
  const [rows, setRows] = useState<DevRequestRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('남은 것')

  const load = useCallback(async () => {
    if (mode !== 'live') return
    setBusy(true)
    setError(null)
    try {
      setRows(await loadDevRequests())
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }, [mode])

  useEffect(() => {
    void load()
  }, [load])

  const change = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  //  엑셀 병행 확인(하루 한 줄)은 피드백이 아니라 측정 응답입니다 — 따로 묶습니다.
  const excel = useMemo(() => parseExcelChecks(rows), [rows])
  const items: Item[] = useMemo(
    () =>
      rows
        .filter((row) => !row.topics.includes(EXCEL_TOPIC))
        .map((row) => {
          const v2 = isFeedbackV2(row.topics) ? parseResponse(row.topics) : null
          return { row, v2, picks: v2 ? [...v2.benefits, ...v2.pains] : row.topics }
        }),
    [rows],
  )

  const open = useMemo(() => items.filter((i) => i.row.status !== '처리 완료'), [items])
  const shown = tab === '남은 것' ? open : items

  //  여러 사람이 고른 것 — 한 사람의 불편과 모두의 불편은 다릅니다.
  const hot = useMemo(() => {
    const count = new Map<string, number>()
    for (const i of open) for (const t of i.picks) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
  }, [open])

  if (mode !== 'live') {
    return (
      <div>
        <PageHeader title="사용자 피드백" subtitle="직원·관리자가 남긴 후기" />
        <p className="t-body break-keep font-bold text-navy-400">
          피드백은 서버에 로그인한 실제 운영 모드에서만 볼 수 있습니다.
        </p>
      </div>
    )
  }

  const v2Items = items.filter((i) => i.v2)

  return (
    <div>
      <PageHeader
        title="사용자 피드백"
        subtitle={`남은 것 ${open.length}건 · 전체 ${rows.length}건`}
        action={<FeedbackButton className="btn-navy" label="피드백 남기기" />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['남은 것', '전체'] as Tab[]).map((t) => (
          <FilterChip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === '남은 것' ? `남은 것 ${open.length}` : `전체 ${rows.length}`}
          </FilterChip>
        ))}
        <button onClick={() => void load()} disabled={busy} className="btn-ghost ml-auto disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />}
          새로고침
        </button>
      </div>

      {error && (
        <p className="t-body mb-3 break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{error}</p>
      )}

      {/* 관점별 모아 보기 — 답이 하나라도 있을 때만 */}
      {v2Items.length > 0 && (
        <div className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(['management', 'staff'] as RespondentGroup[]).map((g) => (
              <GroupSummary
                key={g}
                group={g}
                list={v2Items.filter((i) => i.v2?.group === g).map((i) => i.v2!)}
              />
            ))}
          </div>
          <p className="t-muted mt-2 break-keep text-navy-500">
            느낌 점수입니다. 실제로 시간이 얼마나 줄었는지는 시스템 기록과 도입 전후 비교로 따로 확인합니다 —
            이 점수를 절감률로 바꾸지 않습니다.
          </p>
        </div>
      )}

      {/* 여러 사람이 같이 고른 것 — 먼저 볼 것 */}
      {hot.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="t-card mb-2 break-keep text-amber-900">여러 사람이 함께 고른 항목</p>
          <ul className="space-y-1.5">
            {hot.map(([t, n]) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 rounded-lg bg-amber-500 px-2 py-0.5 text-[0.95rem] font-extrabold text-white">
                  {n}명
                </span>
                <span className="t-body min-w-0 break-keep font-bold text-amber-900">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === '남은 것' ? '남은 것이 없습니다' : '아직 들어온 피드백이 없습니다'}
          subtitle="직원분들은 「더보기 → 사용 후기 남기기」에서 남길 수 있습니다."
        />
      ) : (
        <ul className="space-y-2.5">
          {excel.length > 0 && tab !== '남은 것' && (
            <li data-excel-checks className="card p-4 sm:p-5">
              <p className="t-body font-extrabold text-navy-900">엑셀·카톡 병행 확인 — 하루 한 줄 응답 {excel.length}건</p>
              <p className="t-muted mt-1 break-keep">
                다시 적은 날 {excel.filter((c) => c.reentries > 0).length}일 · 없었던 날 {excel.filter((c) => c.reentries === 0).length}일.
                성과 화면 「같은 정보를 다시 적는 횟수」의 근거입니다.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {excel.slice(0, 10).map((c) => (
                  <li key={c.id} className="t-caption flex flex-wrap gap-x-2 text-navy-600">
                    <span className="tabular-nums text-navy-500">{c.date}</span>
                    <span className="font-bold text-navy-800">{c.who}</span>
                    <span>{c.reentries === 0 ? '없음' : `${c.reentries}건 — ${c.items || '이유 미기재'}`}</span>
                  </li>
                ))}
                {excel.length > 10 && <li className="t-caption text-navy-400">… 외 {excel.length - 10}건</li>}
              </ul>
            </li>
          )}
          {shown.map((i) => (
            <li key={i.row.id} data-dev-request={i.row.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="t-body break-keep font-extrabold text-navy-900">{i.row.requesterName}</span>
                <span className="pill bg-navy-50 text-navy-500">{ROLE_LABEL[i.row.requesterRole]}</span>
                <span className={`pill ${DEV_STATUS_STYLE[i.row.status]}`}>{i.row.status}</span>
                <span className="t-muted ml-auto shrink-0 text-navy-400">
                  {prettyDate(i.row.createdAt.slice(0, 10))}
                </span>
              </div>

              {i.v2 ? <V2Body v2={i.v2} /> : <LegacyBody topics={i.row.topics} />}

              {i.row.message && (
                <p className="t-body mt-3 whitespace-pre-wrap break-keep rounded-2xl bg-navy-50 px-4 py-3 font-medium text-navy-700">
                  {i.row.message}
                </p>
              )}

              <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-navy-50 pt-3.5">
                <span className="t-muted mr-1 shrink-0 font-bold text-navy-500">처리</span>
                {DEV_REQUEST_STATUSES.map((s) => (
                  <button
                    key={s}
                    disabled={busy || i.row.status === s}
                    onClick={() => void change(() => updateDevRequest(i.row.id, { status: s as DevRequestStatus }))}
                    className={`rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-100 ${
                      i.row.status === s ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500 hover:text-navy-800'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <AdminNote
                row={i.row}
                busy={busy}
                onSave={(note) => change(() => updateDevRequest(i.row.id, { adminNote: note }))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 관점 하나의 모아 보기.
 *
 *  ⚠ 몇 명이 답했는지를 제목에 먼저 씁니다. 「사용성 4.6」만 크게 써 두면
 *    한 사람이 답한 것도 회사 전체 평가처럼 읽힙니다.
 */
function GroupSummary({ group, list }: { group: RespondentGroup; list: ParsedFeedback[] }) {
  const s = summarize(list)
  const answered = s.categories.reduce((a, c) => a + c.answered, 0)
  const unsure = s.categories.reduce((a, c) => a + c.unsure, 0)
  const asked = answered + unsure

  return (
    <div data-fb-summary={group} className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="t-card min-w-0 break-keep text-navy-900">{GROUP_LABEL[group]}</p>
        <span data-fb-people className="pill shrink-0 bg-teal-50 text-teal-700">{s.people}명 답변</span>
      </div>

      {s.people === 0 ? (
        <p className="t-muted mt-2.5 break-keep text-navy-400">아직 답한 분이 없습니다.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {s.categories.map((c) => (
              <li key={c.key} data-fb-cat={c.key} className="flex items-baseline gap-2">
                <span className="t-muted w-[5.5rem] shrink-0 break-keep font-bold text-navy-500">{c.label}</span>
                <span className="t-body shrink-0 font-extrabold tabular-nums text-navy-900">
                  {c.avg === null ? '—' : `${c.avg.toFixed(1)} / 5`}
                </span>
                <span className="t-muted ml-auto shrink-0 tabular-nums text-navy-400">
                  {c.answered}문항{c.unsure > 0 ? ` · 판단 어려움 ${c.unsure}` : ''}
                </span>
              </li>
            ))}
          </ul>

          {s.unsureRatio !== null && (
            <p className="t-muted mt-2.5 break-keep text-navy-500">
              「아직 판단하기 어려워요」 {unsure} / {asked}문항 ({Math.round(s.unsureRatio * 100)}%)
            </p>
          )}

          {s.usage.length > 0 && (
            <p className="t-muted mt-1 break-keep text-navy-500">
              사용 정도 — {s.usage.map(([u, n]) => `${USAGE_LABEL[u]} ${n}명`).join(' · ')}
            </p>
          )}

          <TopPicks label="가장 많이 고른 체감 변화" list={s.benefits} people={s.people} tone="teal" />
          <TopPicks label="가장 많이 고른 불편한 곳" list={s.pains} people={s.people} tone="rose" />
        </>
      )}
    </div>
  )
}

/** 많이 고른 순 세 가지 — 「n명 / 전체 m명」으로 함께 씁니다 */
function TopPicks({
  label, list, people, tone,
}: {
  label: string
  list: [string, number][]
  people: number
  tone: 'teal' | 'rose'
}) {
  if (list.length === 0) return null
  const color = tone === 'teal' ? 'bg-teal-50 text-teal-800' : 'bg-rose-50 text-rose-700'
  return (
    <div className="mt-3">
      <p className="t-muted mb-1.5 break-keep font-bold text-navy-500">{label}</p>
      <ul className="space-y-1">
        {list.slice(0, 3).map(([t, n]) => (
          <li key={t} className="flex items-baseline gap-2">
            <span className={`pill shrink-0 tabular-nums ${color}`}>{n}명 / {people}명</span>
            <span className="t-muted min-w-0 break-keep font-bold text-navy-700">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ALL_STEPS = [...MANAGEMENT_STEPS, ...stepsFor('staff', 'field'), ...stepsFor('staff', 'office')]
const QUESTION_BY_ID = new Map<string, FeedbackQuestion>(
  ALL_STEPS.flatMap((s) => s.questions).map((q) => [q.id, q]),
)

/** v2 답변 한 건 — 요약 한 줄, 자세히는 눌러서 */
function V2Body({ v2 }: { v2: ParsedFeedback }) {
  const [openDetail, setOpenDetail] = useState(false)
  const entries = Object.entries(v2.answers)
  const scored = entries.filter(([, v]) => v !== 'na') as [string, 1 | 2 | 3 | 4 | 5][]
  const unsure = entries.length - scored.length
  const avg = scored.length > 0 ? scored.reduce((a, [, v]) => a + v, 0) / scored.length : null

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {v2.group && <span className="pill bg-teal-50 text-teal-700">{GROUP_LABEL[v2.group]}</span>}
        {v2.workType && <span className="pill bg-navy-50 text-navy-500">{WORK_LABEL[v2.workType]}</span>}
        {v2.usage && <span className="pill bg-navy-50 text-navy-500">사용 {USAGE_LABEL[v2.usage]}</span>}
      </div>

      <p className="t-body mt-2 break-keep font-bold text-navy-800">
        {entries.length}문항 답변
        {avg !== null ? ` · 평균 ${avg.toFixed(1)} / 5` : ''}
        {unsure > 0 ? ` · 아직 판단 어려움 ${unsure}` : ''}
      </p>

      {(v2.benefits.length > 0 || v2.pains.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v2.benefits.map((b) => (
            <span key={b} className="pill bg-teal-50 text-teal-800">{b}</span>
          ))}
          {v2.pains.map((p) => (
            <span key={p} className="pill bg-rose-50 text-rose-700">{p}</span>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <>
          <button
            data-fb-detail
            onClick={() => setOpenDetail((v) => !v)}
            className="t-muted mt-2 flex min-h-[2.75rem] items-center gap-1 font-bold text-teal-700 transition hover:text-teal-800"
          >
            {openDetail ? <ChevronUp size={15} strokeWidth={2.6} /> : <ChevronDown size={15} strokeWidth={2.6} />}
            문항별 답변 {openDetail ? '접기' : '보기'}
          </button>
          {openDetail && (
            <ul className="mt-1 space-y-1.5 border-t border-navy-50 pt-2.5">
              {entries.map(([id, v]) => {
                const q = QUESTION_BY_ID.get(id)
                return (
                  <li key={id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="pill shrink-0 bg-navy-50 text-navy-600">
                      {v === 'na' ? '판단 어려움' : `${v}점`}
                    </span>
                    <span className="t-muted min-w-0 break-keep font-bold text-navy-700">
                      {q ? q.text : id}
                      {q && v !== 'na' ? ` — ${answerLabel(q.scale, v)}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/** 예전(v1) 형식 — 「주제 › 선택지」. 그대로 보여 줍니다 */
function LegacyBody({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null
  return (
    <ul className="mt-3 space-y-1.5">
      {topics.map((t) => {
        const [subject, option] = t.includes(' › ') ? t.split(' › ') : ['', t]
        return (
          <li key={t} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {subject && <span className="pill shrink-0 bg-teal-50 text-teal-700">{subject}</span>}
            <span className="t-body min-w-0 break-keep font-bold text-navy-800">{option}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** 관리자 메모 — 무엇을 하기로 했는지 적어 둡니다 (보낸 사람에게도 보입니다) */
function AdminNote({
  row,
  busy,
  onSave,
}: {
  row: DevRequestRow
  busy: boolean
  onSave: (note: string) => void
}) {
  const [text, setText] = useState(row.adminNote)
  const dirty = text.trim() !== row.adminNote.trim()

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="처리 메모 (예: 다음 배포에 반영)"
          aria-label={`${row.requesterName} 피드백 처리 메모`}
          className="field-input min-w-0 flex-1"
        />
        <button
          disabled={busy || !dirty}
          onClick={() => onSave(text)}
          className="btn-ghost shrink-0 disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </div>
  )
}
