import { useMemo, useState } from 'react'
import { CalendarClock, HelpCircle, Headset, MessageSquare, PackagePlus, Phone, ReceiptText, ScrollText, Send, Siren, type LucideIcon } from 'lucide-react'
import { CLIENT_TEL, COMPANY_HOURS } from '../lib/brand'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { useAuth } from '../context/AuthContext'
import { PageShell, EmptyState } from '../components/ui'
import { PortalEmpty, PortalPageHead, PortalStickyBar, SectionHead } from '../components/portal/PortalUi'
import { LoadGate } from '../components/LoadState'
import { INQUIRY_TOPICS, type InquiryTopic } from '../types'
import { prettyDate } from '../lib/format'

//  포털 3차 시안 — 문의 종류를 아이콘 칸으로 (색만으로 가르지 않게 아이콘 · 이름 둘 다)
const TOPIC_LOOK: Record<string, { icon: LucideIcon; tone: string }> = {
  '수거 일정': { icon: CalendarClock, tone: 'bg-teal-50 text-teal-700' },
  자재: { icon: PackagePlus, tone: 'bg-orange-50 text-orange-700' },
  정산: { icon: ReceiptText, tone: 'bg-emerald-50 text-emerald-700' },
  긴급수거: { icon: Siren, tone: 'bg-rose-50 text-rose-600' },
  계약: { icon: ScrollText, tone: 'bg-violet-50 text-violet-700' },
  기타: { icon: MessageSquare, tone: 'bg-navy-100 text-navy-700' },
}

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
//
//  포털 3차 — 카드 · 말풍선 · 「비」 얼굴을 걷었습니다. 보낸 문의는 목록 한 줄씩,
//    답은 요청 상세와 같은 「담당자 안내」 칸 하나입니다(채팅방처럼 꾸미지 않습니다).
// ─────────────────────────────────────────────────────────────────────────────

//  ⚠ 요청 상태 칩과 **같은 색**입니다 — 접수 회색 · 확인 중 파랑 · 끝 초록.
const STATUS_TONE = {
  접수: 'bg-navy-100 text-navy-800',
  '확인 중': 'bg-teal-50 text-teal-800',
  '답변 완료': 'bg-emerald-50 text-emerald-800',
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
    <PageShell className="!space-y-4">
      <PortalPageHead title="고객지원" sub="궁금한 점을 남겨 주시면 담당자가 확인하고 답변드립니다." />

      {/*  포털 2차 — 급하면 전화가 빠릅니다. 글로 남기는 길과 나란히 둡니다
           (앱으로만 하시라는 화면이 아닙니다). */}
      <a
        href={`tel:${CLIENT_TEL}`}
        data-support-call
        className="p-card flex items-center gap-4 transition hover:bg-teal-50"
      >
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
          <Headset size={24} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="p-sub block font-bold">전화 상담</span>
          <span className="block whitespace-nowrap text-[1.6rem] font-extrabold leading-tight tracking-tight tabular-nums text-navy-900">
            {CLIENT_TEL}
          </span>
          <span className="p-sub mt-0.5 block break-keep">{COMPANY_HOURS} · 급하시면 전화가 빠릅니다</span>
        </span>
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <Phone size={20} strokeWidth={2.4} />
        </span>
      </a>

      <section id="inq-new" className="p-card scroll-mt-4">
        <SectionHead title="무엇이 궁금하세요?" />

        {/*  포털 3차 시안 — 문의 종류 여섯 칸(아이콘 + 이름). 고른 칸은 짙은 테두리. */}
        <div id="inq-topic" role="group" aria-label="무엇에 대한 문의인가요?" className="mt-1 grid grid-cols-3 gap-2">
          {INQUIRY_TOPICS.map((t) => {
            const look = TOPIC_LOOK[t] ?? TOPIC_LOOK['기타']
            const Icon = look.icon
            const on = topic === t
            return (
              <button
                key={t}
                type="button"
                data-inq-topic={t}
                onClick={() => setTopic(t)}
                aria-pressed={on}
                className={`flex min-h-[5.6rem] flex-col items-center justify-center gap-1.5 rounded-[16px] px-1 py-2.5 text-center text-[1rem] font-bold transition ${
                  on ? 'bg-white text-navy-900 ring-2 ring-inset ring-navy-900' : 'text-navy-700 hover:bg-navy-50'
                }`}
              >
                <span aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${look.tone}`}>
                  <Icon size={22} strokeWidth={2.2} />
                </span>
                {/*  0147 — 세 칸 격자 · 가장 큰 글씨 · 아주 좁은 폰에서 「긴급수 / 거」로 끊겨 글자만 조금 줄임 */}
                <span className="break-keep max-[380px]:text-[0.9rem]">{t}</span>
              </button>
            )
          })}
        </div>

        <label className="field-label mt-5 cursor-pointer transition-colors hover:text-navy-900" htmlFor="inq-subject">제목</label>
        <input
          id="inq-subject"
          data-inq-subject
          className="field-input rounded-[14px]"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setSent(false) }}
          placeholder="예) 다음 주 수거 일정을 하루 당길 수 있을까요"
        />

        <label className="field-label mt-4 cursor-pointer transition-colors hover:text-navy-900" htmlFor="inq-body">내용</label>
        <textarea
          id="inq-body"
          data-inq-body
          rows={4}
          className="field-input rounded-[14px]"
          value={body}
          onChange={(e) => { setBody(e.target.value); setSent(false) }}
          placeholder="자세히 적어 주시면 더 정확히 답변드릴 수 있습니다."
        />

        {error && (
          <p data-inq-error className="mt-3 break-keep rounded-[14px] bg-rose-50 px-4 py-3 t-body font-bold text-rose-700">
            {error}
          </p>
        )}
        {sent && (
          <p data-inq-sent className="mt-3 break-keep rounded-[14px] bg-emerald-50 px-4 py-3 t-body font-bold text-emerald-800">
            문의가 접수되었습니다. 담당자가 확인하면 아래 목록의 상태가 바뀌고 답변이 표시됩니다.
          </p>
        )}

        <button
          data-inq-send
          disabled={!canSend}
          onClick={send}
          className="btn-primary mt-4 w-full shadow-none disabled:opacity-40"
        >
          <Send size={18} strokeWidth={2.4} /> {sending ? '보내는 중…' : '문의 보내기'}
        </button>
      </section>

      <section className="p-card pb-2 sm:pb-3">
        <SectionHead title="보낸 문의" />
        {mine.length === 0 ? (
          <LoadGate
            loadingTitle="문의를 불러오는 중입니다"
            empty={
              <PortalEmpty
                icon={HelpCircle}
                title="아직 보낸 문의가 없습니다"
                subtitle="위에서 문의를 남기시면 여기에 진행 상태가 표시됩니다."
              />
            }
          />
        ) : (
          <ul className="p-list border-t border-navy-100">
            {mine.map((q) => (
              <li key={q.id} data-inq-row={q.id} className="py-4">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="p-body break-keep font-extrabold">{q.subject}</p>
                    <p className="p-sub mt-0.5 break-keep">
                      {q.topic} · {prettyDate(q.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  <span className={`pill shrink-0 ${STATUS_TONE[q.status]}`}>{q.status}</span>
                </div>
                {q.body && q.body !== q.subject && (
                  <p className="p-body mt-2 whitespace-pre-line break-keep text-navy-700">{q.body}</p>
                )}
                {q.reply ? (
                  //  담당자 안내 — 요청 상세와 같은 모양
                  <div data-inq-reply={q.id} className="mt-3 rounded-[14px] bg-navy-50 px-4 py-3.5">
                    <p className="p-sub break-keep font-extrabold text-navy-800">비원미래 답변</p>
                    <p className="p-body mt-1 whitespace-pre-line break-keep">{q.reply}</p>
                  </div>
                ) : (
                  <p className="p-sub mt-2 break-keep">담당자 확인을 기다리고 있습니다. 답변이 오면 알림으로도 알려 드립니다.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*  포털 3차 시안 — 폰에서는 아래에 늘 떠 있는 「전화 · 문의 남기기」 */}
      <PortalStickyBar>
        <a
          href={`tel:${CLIENT_TEL}`}
          className="flex min-h-[3.5rem] shrink-0 items-center justify-center gap-2 rounded-[16px] bg-white px-4 text-[1.05rem] font-extrabold text-navy-800 ring-1 ring-inset ring-navy-200 transition hover:bg-navy-50 sm:hidden"
        >
          <Phone size={19} strokeWidth={2.4} aria-hidden="true" /> 전화
        </a>
        <button
          type="button"
          data-inq-jump
          onClick={() => {
            document.getElementById('inq-new')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            window.setTimeout(() => document.getElementById('inq-subject')?.focus(), 350)
          }}
          className="flex min-h-[3.5rem] flex-1 items-center justify-center gap-2 rounded-[16px] bg-teal-600 px-3 text-[1.05rem] font-extrabold text-white transition hover:bg-teal-700 sm:hidden"
        >
          <MessageSquare size={19} strokeWidth={2.4} aria-hidden="true" /> 문의 남기기
        </button>
      </PortalStickyBar>
    </PageShell>
  )
}
