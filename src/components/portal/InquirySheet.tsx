import { useMemo, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { PortalSheet, SheetStep, ChoiceGrid, type ChoiceItem } from '../PortalSheet'
import { toast } from '../PortalToast'
import { BRAND_IMG } from '../../lib/brandAssets'
import { INQUIRY_TOPICS, type InquiryTopic } from '../../types'
import { prettyDate } from '../../lib/format'
import type { Client } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// 상담 · 문의 창 (0089)
//
//  대표님: 「카테고리에 따라 흔한 질문 Quick Select 제공 … 사용자가 선택하면
//  기본 문의 내용이 자동 구성되도록 할 수 있다」
//
//  ⚠ 아래 「자주 묻는 것」은 병원이 **실제로 전화로 물어보던 말**을 그대로
//    적은 것입니다. 저희가 만들어 낸 예시 문장이 아닙니다.
//
//  ⚠ 고른 것이 그대로 제목이 됩니다. 병원이 제목을 지어낼 이유가 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

const COMMON: Record<InquiryTopic, string[]> = {
  '수거 일정': ['다음 수거일이 언제인가요?', '일정을 변경하고 싶습니다', '기사님 방문시간을 알고 싶습니다'],
  자재: ['용기가 부족합니다', '주문한 물품은 언제 오나요?', '다른 규격이 필요합니다'],
  정산: ['이번 달 청구금액을 확인하고 싶습니다', '입금이 확인되었나요?', '세금계산서를 받고 싶습니다', '미수금을 확인하고 싶습니다'],
  긴급수거: ['오늘 안에 수거가 필요합니다', '격리폐기물이 발생했습니다'],
  계약: ['계약 내용을 확인하고 싶습니다', '단가를 확인하고 싶습니다', '계약 기간을 확인하고 싶습니다'],
  기타: [],
}

const STATUS_TONE: Record<string, string> = {
  접수: 'bg-navy-100 text-navy-600',
  '확인 중': 'bg-amber-50 text-amber-700',
  '답변 완료': 'bg-emerald-50 text-emerald-600',
}

export function InquirySheet({
  open,
  client,
  onClose,
}: {
  open: boolean
  client: Client
  onClose: () => void
}) {
  const { data, addInquiry } = useData()
  const { profile } = useAuth()

  const [topic, setTopic] = useState<InquiryTopic | ''>('')
  const [quick, setQuick] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mine = useMemo(
    () =>
      (data.inquiries ?? [])
        .filter((q) => q.clientId === client.id)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.inquiries, client.id],
  )

  const topicItems: ChoiceItem[] = INQUIRY_TOPICS.map((t) => ({ value: t, label: t }))
  const quickItems: ChoiceItem[] = topic
    ? COMMON[topic].map((q) => ({ value: q, label: q }))
    : []

  //  ⚠ 제목은 **고른 것**입니다. 아무것도 안 고르고 직접 적으셨으면 그 글의
  //    첫 줄을 제목으로 씁니다 — 저희가 제목을 지어내지 않습니다.
  const subject = quick || body.trim().split('\n')[0].slice(0, 60)
  const canSend = topic !== '' && subject !== ''

  const send = async () => {
    if (!canSend || busy || !topic) return
    setBusy(true)
    setError(null)
    const res = await addInquiry({
      clientId: client.id,
      topic,
      subject,
      //  고른 것과 적으신 것이 다르면 둘 다 남깁니다.
      body: body.trim() || quick,
      askedByName: profile?.name ?? '병원 담당자',
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? '문의를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    setTopic('')
    setQuick('')
    setBody('')
    onClose()
    toast('문의가 접수되었습니다. 담당자가 확인하고 답변드리겠습니다.')
  }

  return (
    <PortalSheet
      name="ask"
      hero={BRAND_IMG.heroSecondary}
      open={open}
      onClose={onClose}
      title="상담 · 문의"
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <MessageSquare size={15} strokeWidth={2.5} className="shrink-0 text-teal-600" />
          {client.name} · 자주 묻는 것을 고르시면 그대로 접수됩니다.
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2.5">
          <p data-ask-summary className="t-muted min-w-0 flex-1 break-keep">
            {canSend ? `${topic} · ${subject}` : '무엇에 대한 문의인지 먼저 골라 주세요.'}
          </p>
          <button
            data-ask-send
            onClick={() => void send()}
            disabled={!canSend || busy}
            className="flex min-h-[3rem] shrink-0 items-center gap-2 rounded-2xl bg-navy-900 px-5 text-[1.08rem] font-extrabold text-white transition hover:bg-navy-800 disabled:opacity-40"
          >
            <Send size={18} strokeWidth={2.5} />
            {busy ? '보내는 중…' : '문의 보내기'}
          </button>
        </div>
      }
    >
      {error && (
        <div data-ask-error className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-rose-100">
          <p className="t-body break-keep font-bold text-rose-700">{error}</p>
          <p className="t-muted mt-1 break-keep">고르신 것은 그대로 있습니다.</p>
        </div>
      )}

      <SheetStep no={1} title="무엇에 대한 문의인가요?">
        <ChoiceGrid
          name="topic"
          items={topicItems}
          value={topic}
          onPick={(v) => {
            setTopic(v === topic ? '' : (v as InquiryTopic))
            setQuick('')
          }}
        />
      </SheetStep>

      {topic && quickItems.length > 0 && (
        <SheetStep no={2} title="이런 내용이신가요?" hint="고르시면 그대로 접수됩니다">
          <ChoiceGrid
            name="quick"
            cols={1}
            items={quickItems}
            value={quick}
            onPick={(v) => setQuick(v === quick ? '' : v)}
          />
        </SheetStep>
      )}

      {topic && (
        <SheetStep
          no={quickItems.length > 0 ? 3 : 2}
          title="더 적으실 것이 있으신가요?"
          hint={quick ? '선택 — 안 적으셔도 됩니다' : '직접 적으셔도 됩니다'}
        >
          <textarea
            data-ask-body
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="예: 3층 병동 용기가 특히 빨리 찹니다."
            className="field-input w-full resize-none"
          />
        </SheetStep>
      )}

      {/*  ⚠ 보낸 문의와 답변을 **같은 창에서** 봅니다. 이것 때문에 화면을
           옮기게 하지 않습니다. */}
      {mine.length > 0 && (
        <section className="mt-5 border-t border-navy-100 pt-4">
          <h3 className="t-body mb-2.5 break-keep font-extrabold text-navy-900">보낸 문의</h3>
          <ul data-ask-recent className="grid gap-2">
            {mine.slice(0, 5).map((q) => (
              <li key={q.id} className="rounded-xl bg-white px-4 py-3 ring-1 ring-navy-100">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="pill shrink-0 bg-navy-50 text-navy-600">{q.topic}</span>
                  <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-800">{q.subject}</span>
                  <span className={`pill shrink-0 ${STATUS_TONE[q.status] ?? 'bg-navy-100 text-navy-500'}`}>
                    {q.status}
                  </span>
                  <span className="t-muted shrink-0">{prettyDate(q.createdAt.slice(0, 10))}</span>
                </div>
                {q.reply && (
                  <p className="t-body mt-2 break-keep rounded-lg bg-sky-50 px-3 py-2 leading-snug text-sky-900">
                    <b className="font-extrabold">비원미래 답변</b> · {q.reply}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </PortalSheet>
  )
}
