import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Phone,
  PlusCircle,
  Send,
  Smartphone,
  Siren,
  Truck,
  PackagePlus,
  GraduationCap,
  Inbox,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, EmptyState, FilterChip, KpiCard } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { clientRequests, type RequestItem } from '../lib/ops'
import { customerServiceStats } from '../lib/portal'
import { REQUEST_REVENUE, REQUEST_TONE, STATUS_TONE, TONE } from '../lib/tone'
import { REQUEST_KINDS, type RequestKind, type RequestStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 요청 (비원미래 담당자 화면)
//
//  병원 포털에서 올라온 요청과 전화·카톡으로 받아 대신 접수한 요청을 한 곳에서
//  처리합니다. 여기서 남긴 회신은 병원 포털에 그대로 보이고, 수거를 완료하면
//  관련 요청은 자동으로 닫힙니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 요청 유형 아이콘 — 무엇을 원하는 요청인지 글자 없이도 구분되게 */
const KIND_ICON: Record<RequestKind, typeof Siren> = {
  긴급수거: Siren,
  추가수거: Truck,
  소모품: PackagePlus,
  '교육·자료': GraduationCap,
  기타: MessageSquare,
}

const FLOW: RequestStatus[] = ['접수', '확인 중', '일정 반영', '처리 완료']

type Filter = '진행 중' | '전체' | '병원 직접' | '긴급'

export function Requests() {
  const { data, handleRequest, addRequest } = useData()
  const [filter, setFilter] = useState<Filter>('진행 중')
  const [replyTo, setReplyTo] = useState<RequestItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [nClient, setNClient] = useState('')
  const [nKind, setNKind] = useState<RequestKind>('추가수거')
  const [nContent, setNContent] = useState('')

  const all = useMemo(() => clientRequests(data), [data])
  const stats = useMemo(() => customerServiceStats(data), [data])

  const rows = all.filter((r) => {
    if (filter === '진행 중') return r.status !== '처리 완료'
    if (filter === '병원 직접') return r.source === 'portal'
    if (filter === '긴급') return r.urgent
    return true
  })

  const submitReply = () => {
    if (!replyTo) return
    handleRequest(replyTo.id, { reply: replyText.trim() })
    setReplyTo(null)
    setReplyText('')
  }

  const submitNew = () => {
    if (!nClient || !nContent.trim()) return
    addRequest({
      clientId: nClient,
      kind: nKind,
      content: nContent.trim(),
      source: 'staff',
      requesterName: '전화·카톡 접수',
    })
    setNContent('')
    setNewOpen(false)
  }

  return (
    <PageShell>
      <PageHeader
        title="병원 요청"
        subtitle="병원이 직접 올린 요청과 전화·카톡으로 받은 요청을 한 곳에서 처리합니다"
        action={
          <button onClick={() => setNewOpen(true)} className="btn-primary">
            <PlusCircle size={19} strokeWidth={2.4} /> 전화 요청 접수
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <KpiCard icon={AlertTriangle} label="처리 대기" value={stats.requestsOpen} unit="건" tone="rose" />
        <KpiCard icon={CheckCircle2} label="처리 완료" value={stats.requestsDone} unit="건" tone="teal" />
        <KpiCard
          icon={Smartphone}
          label="병원이 직접 등록"
          value={`${stats.portalRatio}%`}
          tone="navy"
          hint="나머지는 전화·카톡 대행 접수"
        />
        <KpiCard icon={Building2} label="요청한 병원" value={stats.activeClients} unit="곳" tone="navy" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(['진행 중', '전체', '병원 직접', '긴급'] as Filter[]).map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </FilterChip>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === '진행 중' ? '처리할 요청이 없습니다' : '요청이 없습니다'}
          subtitle="병원 담당자가 포털에서 요청을 올리면 여기에 바로 표시됩니다."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r, ri) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                {(() => {
                  const Icon = KIND_ICON[r.type]
                  return (
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[REQUEST_TONE[r.type]].tile}`}
                    >
                      <Icon size={20} strokeWidth={2.3} />
                    </span>
                  )
                })()}
                <Link
                  to={`/clients/${r.clientId}`}
                  className="t-card min-w-0 break-keep text-navy-900 hover:text-teal-700"
                >
                  {r.clientName}
                </Link>
                <span className={`pill ${TONE[REQUEST_TONE[r.type]].chip}`}>{r.type}</span>
                {r.urgent && (
                  <span className="pill bg-rose-50 text-rose-600">
                    <AlertTriangle size={13} strokeWidth={2.6} /> 긴급
                  </span>
                )}
                <span
                  className={`pill ${r.source === 'portal' ? 'bg-violet-50 text-violet-700' : 'bg-navy-100 text-navy-500'}`}
                >
                  {r.source === 'portal' ? (
                    <>
                      <Smartphone size={13} strokeWidth={2.6} /> 병원 직접
                    </>
                  ) : (
                    <>
                      <Phone size={13} strokeWidth={2.6} /> 전화 접수
                    </>
                  )}
                </span>
                <span className="t-muted ml-auto shrink-0">{r.when}</span>
              </div>

              <p className="t-body mt-2.5 break-keep leading-snug text-navy-700">{r.content}</p>
              <p className="t-muted mt-1.5 break-keep">
                {r.requesterName || '담당자 미기재'}
                {r.desiredDate && ` · 희망일 ${r.desiredDate}`}
              </p>

              {/* 이 요청이 어떤 매출로 이어지는지 — 요청 처리 = 영업 행동임을 명시 */}
              <p className="t-muted mt-2 flex flex-wrap items-center gap-1.5 break-keep">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[REQUEST_TONE[r.type]].dot}`} />
                연결되는 매출: <b className="font-extrabold text-navy-600">{REQUEST_REVENUE[r.type]}</b>
              </p>

              {r.reply && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-3">
                  <MessageSquare size={16} className="mt-0.5 shrink-0 text-sky-600" strokeWidth={2.3} />
                  <p className="t-body min-w-0 break-keep leading-snug text-sky-900">{r.reply}</p>
                </div>
              )}

              {/* 처리 단계 — 여기서 바꾼 상태가 병원 화면에 그대로 보입니다 */}
              <div
                data-tour={ri === 0 ? 'requests-list' : undefined}
                className="mt-4 flex flex-wrap items-center gap-1.5"
              >
                {FLOW.map((st) => (
                  <button
                    key={st}
                    onClick={() => handleRequest(r.id, { status: st })}
                    className={`rounded-full px-3.5 py-2 text-[1rem] font-extrabold transition ${
                      r.status === st ? TONE[STATUS_TONE[st]].chip : 'bg-navy-50 text-navy-400 hover:text-navy-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setReplyTo(r)
                    setReplyText(r.reply)
                  }}
                  className="t-btn ml-auto flex items-center gap-1 text-teal-700 hover:underline"
                >
                  회신 남기기 <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section>
        <SectionTitle>자동 처리 규칙</SectionTitle>
        <div className="card p-5">
          <p className="t-body break-keep leading-snug text-navy-600">
            수거 완료를 입력하면 해당 병원의 <b>긴급수거·추가수거</b> 요청이 자동으로 닫히고, 자재를 함께
            공급했으면 <b>소모품</b> 요청도 함께 닫힙니다. 교육·자료 요청은 별도 처리가 필요하므로 자동으로
            닫지 않습니다.
          </p>
        </div>
      </section>

      {/* 회신 */}
      <Modal
        open={!!replyTo}
        title="병원에 회신"
        onClose={() => setReplyTo(null)}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setReplyTo(null)} className="btn-ghost flex-1">
              취소
            </button>
            <button onClick={submitReply} className="btn-primary flex-1">
              <Send size={17} strokeWidth={2.4} /> 회신 저장
            </button>
          </div>
        }
      >
        <p className="t-muted mb-3 break-keep">
          {replyTo?.clientName} · {replyTo?.type} — 아래 내용이 병원 화면에 그대로 표시됩니다.
        </p>
        <textarea
          id="reply-text"
          rows={4}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="예: 내일 오전 방문 일정에 반영했습니다. 전용용기 10개 함께 가져가겠습니다."
          className="field-input w-full resize-none"
        />
      </Modal>

      {/* 전화·카톡 대행 접수 */}
      <Modal
        open={newOpen}
        title="전화 요청 접수"
        onClose={() => setNewOpen(false)}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setNewOpen(false)} className="btn-ghost flex-1">
              취소
            </button>
            <button
              onClick={submitNew}
              disabled={!nClient || !nContent.trim()}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              접수
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="field-label" htmlFor="nr-client">
              거래처
            </label>
            <select
              id="nr-client"
              value={nClient}
              onChange={(e) => setNClient(e.target.value)}
              className="field-input w-full"
            >
              <option value="">거래처를 선택하세요</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">요청 유형</label>
            <div className="flex flex-wrap gap-2">
              {REQUEST_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setNKind(k)}
                  className={`rounded-full px-4 py-2.5 text-[1.02rem] font-bold transition ${
                    nKind === k ? 'bg-navy-900 text-white' : `${TONE[REQUEST_TONE[k]].chip} hover:opacity-80`
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="nr-content">
              내용
            </label>
            <textarea
              id="nr-content"
              rows={3}
              value={nContent}
              onChange={(e) => setNContent(e.target.value)}
              placeholder="전화로 받은 요청 내용을 그대로 적어 주세요."
              className="field-input w-full resize-none"
            />
          </div>
        </div>
      </Modal>
    </PageShell>
  )
}
