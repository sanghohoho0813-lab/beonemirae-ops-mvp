import { useMemo, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { SectionTitle, EmptyState, FilterChip } from './ui'
import { INQUIRY_STATUSES, type InquiryStatus } from '../types'
import { prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 문의 처리 — 내부 화면 (0083)
//
//  대표님: 「고객이 등록하면 내부 관리자가 한 화면에서 확인할 수 있게 한다.」
//
//  ⚠ 수거 요청 목록과 **같은 화면**에 두되 **다른 칸**입니다. 섞으면
//    요청함에 질문이 쌓여서 정작 오늘 나갈 수거가 묻힙니다.
//
//  ⚠ 답은 표를 직접 고치지 않고 서버 함수를 부릅니다 — 그래야 **누가 언제
//    답했는지**가 반드시 같이 남습니다(0083 answer_inquiry).
//
//  ⚠ 판 82 이하이면 이 칸을 **아예 그리지 않습니다.** 표가 없는데 화면만
//    있으면 눌러도 안 되는 단추가 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<InquiryStatus, string> = {
  접수: 'bg-rose-50 text-rose-500',
  '확인 중': 'bg-amber-50 text-amber-700',
  '답변 완료': 'bg-emerald-50 text-emerald-600',
}

type Filter = '처리 대기' | '전체'

export function InquiryInbox() {
  const { data, replyInquiry } = useData()
  const { role, mode } = useAuth()
  const [filter, setFilter] = useState<Filter>('처리 대기')
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const all = data.inquiries ?? []
  const rows = useMemo(
    () =>
      all
        .filter((q) => (filter === '처리 대기' ? q.status !== '답변 완료' : true))
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [all, filter],
  )
  const waiting = all.filter((q) => q.status !== '답변 완료').length

  //  답하기는 사무실·관리자만 (서버도 같은 규칙입니다).
  const canAnswer = mode !== 'live' || role === 'admin' || role === 'office'

  async function answer(id: string, status: InquiryStatus) {
    setBusy(true)
    setError(null)
    const res = await replyInquiry(id, status, draft.trim() || undefined)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? '답변을 저장하지 못했습니다.')
      return
    }
    setOpenId(null)
    setDraft('')
  }

  return (
    <section data-inquiry-inbox>
      <SectionTitle
        action={
          waiting > 0 ? (
            <span data-inq-waiting className="pill bg-rose-50 text-rose-500">답변 대기 {waiting}건</span>
          ) : undefined
        }
      >
        병원 문의
      </SectionTitle>

      <div className="mb-2.5 flex flex-wrap gap-2">
        {(['처리 대기', '전체'] as Filter[]).map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</FilterChip>
        ))}
      </div>

      {rows.length === 0 ? (
        //  ⚠ 「불러오는 중」과 구분하지 않습니다 — 문의는 판 82 이하에서
        //    아예 안 내려오는 것이 정상이라, 「없다」가 맞는 말입니다.
        <EmptyState
          icon={MessageSquare}
          title={filter === '처리 대기' ? '답변을 기다리는 문의가 없습니다' : '아직 접수된 문의가 없습니다'}
          subtitle="병원이 포털에서 문의를 남기면 여기에 바로 표시됩니다."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((q) => (
            <li key={q.id} data-inq-item={q.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="t-body min-w-0 break-keep font-extrabold text-navy-900">{q.clientName || '알 수 없음'}</span>
                <span className="pill bg-navy-50 text-navy-600">{q.topic}</span>
                <span className={`pill ${TONE[q.status]}`}>{q.status}</span>
                <span className="t-muted ml-auto shrink-0">{prettyDate(q.createdAt.slice(0, 10))}</span>
              </div>
              <p className="t-body mt-2 break-keep font-bold text-navy-800">{q.subject}</p>
              <p className="t-muted mt-1 break-keep leading-snug">{q.body}</p>
              {q.askedByName && <p className="t-muted mt-1 break-keep">보낸 사람 · {q.askedByName}</p>}

              {q.reply && (
                <div className="mt-3 rounded-2xl bg-teal-50 px-4 py-3">
                  <p className="t-muted break-keep font-extrabold text-teal-700">보낸 답변</p>
                  <p className="t-body mt-1 break-keep text-navy-800">{q.reply}</p>
                </div>
              )}

              {canAnswer && (
                openId === q.id ? (
                  <div className="mt-3">
                    <label className="field-label" htmlFor={`ans-${q.id}`}>병원에 보낼 답변</label>
                    <textarea
                      id={`ans-${q.id}`}
                      data-inq-answer={q.id}
                      rows={3}
                      className="field-input"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="병원 화면에 그대로 보입니다."
                    />
                    {error && <p className="t-muted mt-2 break-keep font-bold text-rose-500">{error}</p>}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {INQUIRY_STATUSES.map((st) => (
                        <button
                          key={st}
                          data-inq-set={`${q.id}:${st}`}
                          disabled={busy}
                          onClick={() => answer(q.id, st)}
                          className={`min-h-[44px] rounded-2xl px-4 text-[1.05rem] font-bold transition disabled:opacity-40 ${
                            st === '답변 완료' ? 'bg-teal-500 text-white' : 'bg-navy-50 text-navy-700 hover:bg-navy-100'
                          }`}
                        >
                          {st === '답변 완료' ? '답변 보내고 완료' : `${st}로 두기`}
                        </button>
                      ))}
                      <button
                        onClick={() => { setOpenId(null); setDraft(''); setError(null) }}
                        className="btn-ghost min-h-[44px]"
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    data-inq-open={q.id}
                    onClick={() => { setOpenId(q.id); setDraft(q.reply); setError(null) }}
                    className="btn-ghost mt-3 min-h-[44px]"
                  >
                    <Send size={17} strokeWidth={2.4} /> {q.reply ? '답변 고치기' : '답변하기'}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
