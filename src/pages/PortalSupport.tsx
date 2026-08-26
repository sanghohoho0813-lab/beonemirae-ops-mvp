import { useMemo, useState } from 'react'
import { HelpCircle, Send } from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { useAuth } from '../context/AuthContext'
import { PageShell, SectionTitle, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { INQUIRY_TOPICS, type InquiryTopic } from '../types'
import { prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 문의 (0083)
//
//  대표님: 「완전한 채팅 시스템을 만들 필요는 없다. 티켓 방식의 간단한
//  문의관리 구조면 충분하다.」
//
//  ⚠ 수거 요청과 **다른 자리**입니다. 「와 주세요」는 작업 지시라 일정으로
//    이어지고, 「이건 어떻게 되나요」는 대화입니다. 섞으면 요청함에 질문이
//    쌓여 정작 오늘 나갈 수거가 묻힙니다.
//
//  ⚠ 병원은 올린 뒤 **못 고칩니다.** 서버도 그렇게 막혀 있습니다(0083 RLS).
//    답은 비원미래가 씁니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE = {
  접수: 'bg-navy-100 text-navy-600',
  '확인 중': 'bg-amber-50 text-amber-700',
  '답변 완료': 'bg-emerald-50 text-emerald-600',
} as const

export function PortalSupport() {
  const { data, addInquiry } = useData()
  const { profile } = useAuth()
  //  ⚠ 0085 — 「어느 병원인가」는 한 곳에서 정합니다(lib/portalClient.ts).
  //    예전의 `data.clients[0]` 은 직원 계정에서 **첫 병원**을 골랐습니다.
  const { client } = usePortalClient()

  const [topic, setTopic] = useState<InquiryTopic>('수거 일정')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const mine = useMemo(
    () =>
      (data.inquiries ?? [])
        .filter((q) => !client || q.clientId === client.id)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.inquiries, client],
  )

  if (!client) {
    return (
      <PageShell>
        <LoadGate
          loadingTitle="병원 정보를 불러오는 중입니다"
          empty={<EmptyState icon={HelpCircle} title="병원 정보를 찾을 수 없습니다" subtitle="담당자에게 문의해 주세요." />}
        />
      </PageShell>
    )
  }

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending

  async function send() {
    //  ⚠ 위에서 client 가 없으면 이미 화면을 안 그립니다. 그래도 한 번 더
    //    봅니다 — 없는 병원 이름으로 문의가 올라가면 서버가 거절합니다.
    if (!client) return
    setSending(true)
    setError(null)
    const res = await addInquiry({
      clientId: client.id,
      topic,
      subject,
      body,
      askedByName: profile?.name ?? '병원 담당자',
    })
    setSending(false)
    if (!res.ok) {
      //  ⚠ 적은 내용을 지우지 않습니다 — 다시 보내면 됩니다.
      setError(res.error ?? '문의를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    setSubject('')
    setBody('')
    setSent(true)
  }

  return (
    <PageShell>
      <div>
        <h1 className="t-page break-keep text-navy-900">문의하기</h1>
        <p className="t-body mt-2 break-keep text-navy-500">
          수거 일정 · 자재 · 정산 등 궁금한 점을 남겨 주시면 담당자가 확인하고 답변드립니다.
        </p>
      </div>

      <section className="card p-5 sm:p-6">
        <SectionTitle size="sub">새 문의</SectionTitle>

        <label className="field-label mt-4" htmlFor="inq-topic">무엇에 대한 문의인가요?</label>
        <div id="inq-topic" className="flex flex-wrap gap-2">
          {INQUIRY_TOPICS.map((t) => (
            <button
              key={t}
              data-inq-topic={t}
              onClick={() => setTopic(t)}
              className={`min-h-[44px] rounded-2xl px-4 text-[1.05rem] font-bold transition ${
                topic === t ? 'bg-teal-500 text-white shadow-sm' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="field-label mt-5" htmlFor="inq-subject">제목</label>
        <input
          id="inq-subject"
          data-inq-subject
          className="field-input"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setSent(false) }}
          placeholder="예) 다음 주 수거 일정을 하루 당길 수 있을까요"
        />

        <label className="field-label mt-4" htmlFor="inq-body">내용</label>
        <textarea
          id="inq-body"
          data-inq-body
          rows={4}
          className="field-input"
          value={body}
          onChange={(e) => { setBody(e.target.value); setSent(false) }}
          placeholder="자세히 적어 주시면 더 정확히 답변드릴 수 있습니다."
        />

        {error && (
          <p data-inq-error className="mt-3 break-keep rounded-2xl bg-rose-50 px-4 py-3 t-body font-bold text-rose-500">
            {error}
          </p>
        )}
        {sent && (
          <p data-inq-sent className="mt-3 break-keep rounded-2xl bg-emerald-50 px-4 py-3 t-body font-bold text-emerald-600">
            문의가 접수되었습니다. 담당자가 확인하면 아래 목록의 상태가 바뀌고 답변이 표시됩니다.
          </p>
        )}

        <button
          data-inq-send
          disabled={!canSend}
          onClick={send}
          className="btn-primary mt-4 w-full disabled:opacity-40"
        >
          <Send size={18} strokeWidth={2.4} /> {sending ? '보내는 중…' : '문의 보내기'}
        </button>
      </section>

      <section>
        <SectionTitle>보낸 문의</SectionTitle>
        {mine.length === 0 ? (
          <LoadGate
            loadingTitle="문의를 불러오는 중입니다"
            empty={
              <EmptyState
                icon={HelpCircle}
                title="아직 보낸 문의가 없습니다"
                subtitle="위에서 문의를 남기시면 여기에 진행 상태가 표시됩니다."
              />
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {mine.map((q) => (
              <li key={q.id} data-inq-row={q.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span className="pill bg-navy-50 text-navy-600">{q.topic}</span>
                  <span className={`pill ${STATUS_TONE[q.status]}`}>{q.status}</span>
                  <span className="t-muted ml-auto shrink-0">{prettyDate(q.createdAt.slice(0, 10))}</span>
                </div>
                <p className="t-body mt-2 break-keep font-extrabold text-navy-900">{q.subject}</p>
                <p className="t-muted mt-1 break-keep leading-snug">{q.body}</p>
                {q.reply ? (
                  <div data-inq-reply={q.id} className="mt-3 rounded-2xl bg-teal-50 px-4 py-3">
                    <p className="t-muted break-keep font-extrabold text-teal-700">비원미래 답변</p>
                    <p className="t-body mt-1 break-keep text-navy-800">{q.reply}</p>
                  </div>
                ) : (
                  //  ⚠ 「답변 대기」를 회색으로 조용히 적습니다. 병원이 뭘
                  //    잘못한 것이 아닙니다.
                  <p className="t-muted mt-3 break-keep">담당자 확인을 기다리고 있습니다.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
