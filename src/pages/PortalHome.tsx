import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  MessageSquare,
  Package,
  PlusCircle,
  Scale,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageShell, SectionTitle, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { portalSummary } from '../lib/portal'
import { REQUEST_KINDS, type RequestKind, type RequestStatus } from '../types'
import { prettyDate, today, weight, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 첫 화면 — "우리 병원에서 지금 필요한 것"
//
//  1) 다음 수거가 언제인지
//  2) 필요한 것을 바로 요청
//  3) 올린 요청이 어떻게 처리되고 있는지
//  4) 비원미래가 보낸 제안에 수락 / 보류
//
//  숫자는 전부 실제 수거 기록에서 나옵니다. 없으면 '아직 없음'으로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<RequestStatus, string> = {
  접수: 'bg-navy-100 text-navy-600',
  '확인 중': 'bg-amber-50 text-amber-700',
  '일정 반영': 'bg-sky-50 text-sky-700',
  '처리 완료': 'bg-teal-50 text-teal-700',
}

const KIND_HINT: Record<RequestKind, string> = {
  긴급수거: '보관기한이 임박했거나 배출량이 갑자기 늘었을 때',
  추가수거: '정기 수거 외에 한 번 더 필요할 때',
  소모품: '전용 용기 · 봉투 · 바늘통이 부족할 때',
  '교육·자료': '배출자 교육, 수거대장·명세 등 자료가 필요할 때',
  기타: '그 밖의 문의',
}

export function PortalHome() {
  const { data, addRequest, respondProposal } = useData()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<RequestKind>('추가수거')
  const [content, setContent] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [desired, setDesired] = useState('')
  const [sent, setSent] = useState(false)

  const client = data.clients[0]
  const s = useMemo(() => (client ? portalSummary(data, client) : null), [data, client])

  if (!client || !s) {
    return (
      <PageShell>
        <EmptyState
          icon="🏥"
          title="연결된 병원 정보를 찾을 수 없습니다"
          subtitle="비원미래 담당자에게 계정 연결을 요청해 주세요. (1533-8876)"
        />
      </PageShell>
    )
  }

  const submit = () => {
    if (!content.trim()) return
    addRequest({
      clientId: client.id,
      kind,
      content: content.trim(),
      desiredDate: desired || null,
      urgent,
      source: 'portal',
      requesterName: profile?.name ?? '병원 담당자',
    })
    setContent('')
    setUrgent(false)
    setDesired('')
    setOpen(false)
    setSent(true)
  }

  return (
    <PageShell>
      <div>
        <h1 className="t-page text-navy-900">{client.name}</h1>
        <p className="t-body mt-2.5 font-medium text-navy-400">
          {prettyDate(today())} · 수거주기 {client.collectionCycle || '미설정'}
        </p>
      </div>

      {sent && (
        <div className="flex items-start gap-3 rounded-2xl bg-teal-50 px-5 py-4 ring-1 ring-teal-100">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-teal-600" strokeWidth={2.4} />
          <p className="t-body min-w-0 break-keep font-bold text-teal-800">
            요청이 접수되었습니다. 비원미래 담당자가 확인하면 아래 진행 상태가 바뀝니다.
          </p>
          <button onClick={() => setSent(false)} className="ml-auto shrink-0 text-teal-600">
            <X size={18} />
          </button>
        </div>
      )}

      {/* ── 1. 다음 수거 ── */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-navy-900 px-5 py-5 sm:px-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-300">
            <CalendarClock size={26} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-label break-keep text-navy-300">다음 수거 예정</p>
            <p className="t-kpi-sm mt-1.5 break-keep text-white">
              {s.nextDate ? prettyDate(s.nextDate) : '예정된 수거가 없습니다'}
              {s.nextTime && <span className="ml-2 text-teal-300">{s.nextTime}</span>}
            </p>
            {s.nextIsEstimate && (
              <p className="t-muted mt-1.5 break-keep text-navy-300">
                수거주기로 계산한 예상일입니다 · 확정 일정은 담당자가 배정하면 표시됩니다
              </p>
            )}
          </div>
          <button onClick={() => setOpen(true)} className="btn-primary shrink-0">
            <PlusCircle size={19} strokeWidth={2.4} /> 수거·소모품 요청
          </button>
        </div>

        <div className="grid grid-cols-1 gap-px bg-navy-100 sm:grid-cols-3">
          {[
            { icon: Clock, label: '최근 수거', value: s.lastDate ? prettyDate(s.lastDate) : '기록 없음' },
            { icon: Scale, label: '최근 배출량', value: s.lastKg != null ? weight(s.lastKg) : '—' },
            { icon: Package, label: '이번 달', value: `${weight(s.monthKg)} · ${s.monthVisits}회` },
          ].map((x) => {
            const Icon = x.icon
            return (
              <div key={x.label} className="flex items-center gap-3 bg-white px-5 py-4">
                <Icon size={20} className="shrink-0 text-navy-300" strokeWidth={2.2} />
                <div className="min-w-0">
                  <p className="t-muted break-keep">{x.label}</p>
                  <p className="t-body mt-0.5 break-keep font-extrabold text-navy-900">{x.value}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 2. 비원미래가 보낸 제안 ── */}
      {(s.pendingProposals.length > 0 || s.acceptedProposals.length > 0) && (
        <section>
          <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">비원미래 제안</span>}>
            우리 병원 데이터를 보고 제안드립니다
          </SectionTitle>
          <div className="space-y-3">
            {s.pendingProposals.map((l) => (
              <div key={l.id} className="card p-5 ring-1 ring-teal-100">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles size={19} className="shrink-0 text-teal-600" strokeWidth={2.3} />
                  <p className="t-card min-w-0 flex-1 break-keep text-navy-900">{l.title}</p>
                  {l.estValue > 0 && (
                    <span className="pill shrink-0 bg-navy-50 text-navy-600">예상 {won(l.estValue)}</span>
                  )}
                </div>
                {l.clientMessage && (
                  <p className="t-body mt-2.5 break-keep leading-snug text-navy-600">{l.clientMessage}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => respondProposal(l.id, true)} className="btn-primary flex-1">
                    <Check size={18} strokeWidth={2.6} /> 수락하겠습니다
                  </button>
                  <button onClick={() => respondProposal(l.id, false)} className="btn-ghost flex-1">
                    나중에 검토
                  </button>
                </div>
              </div>
            ))}
            {s.acceptedProposals.map((l) => (
              <div key={l.id} className="card flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-4">
                <CheckCircle2 size={19} className="shrink-0 text-teal-600" strokeWidth={2.4} />
                <p className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">{l.title}</p>
                <span className="pill shrink-0 bg-teal-50 text-teal-700">수락함</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 3. 요청 진행 상태 ── */}
      <section>
        <SectionTitle
          action={
            <button onClick={() => setOpen(true)} className="t-btn text-teal-700 hover:underline">
              새 요청
            </button>
          }
        >
          요청 진행 상태
        </SectionTitle>
        {s.allRequests.length === 0 ? (
          <div className="card p-6">
            <p className="t-body break-keep text-navy-500">
              아직 올린 요청이 없습니다. 긴급 수거, 전용 용기, 교육 자료가 필요하면 위 버튼으로 바로 요청하실 수
              있습니다.
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-navy-50">
            {s.allRequests.slice(0, 8).map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill bg-navy-50 text-navy-600">{r.type}</span>
                  {r.urgent && (
                    <span className="pill bg-rose-50 text-rose-600">
                      <AlertTriangle size={13} strokeWidth={2.6} /> 긴급
                    </span>
                  )}
                  <span className={`pill ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  <span className="t-muted ml-auto shrink-0">{r.when}</span>
                </div>
                <p className="t-body mt-2 break-keep leading-snug text-navy-700">{r.content}</p>
                {r.reply && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-teal-50/70 px-3.5 py-3">
                    <MessageSquare size={16} className="mt-0.5 shrink-0 text-teal-600" strokeWidth={2.3} />
                    <p className="t-body min-w-0 break-keep leading-snug text-teal-800">{r.reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 요청 등록 ── */}
      <Modal
        open={open}
        title="수거 · 소모품 요청"
        onClose={() => setOpen(false)}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost flex-1">
              취소
            </button>
            <button onClick={submit} disabled={!content.trim()} className="btn-primary flex-1 disabled:opacity-50">
              <Send size={17} strokeWidth={2.4} /> 요청 보내기
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="field-label">무엇이 필요하신가요?</label>
            <div className="flex flex-wrap gap-2">
              {REQUEST_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full px-4 py-2.5 text-[1.02rem] font-bold transition ${
                    kind === k ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500 hover:text-navy-700'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <p className="t-muted mt-2 break-keep">{KIND_HINT[kind]}</p>
          </div>

          <div>
            <label className="field-label" htmlFor="req-content">
              내용
            </label>
            <textarea
              id="req-content"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="예: 격리환자 발생으로 배출량이 늘었습니다. 이번 주 중 추가 수거 부탁드립니다."
              className="field-input w-full resize-none"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="req-date">
              희망일 (선택)
            </label>
            <input
              id="req-date"
              type="date"
              value={desired}
              onChange={(e) => setDesired(e.target.value)}
              className="field-input w-full"
            />
          </div>

          <button
            onClick={() => setUrgent((v) => !v)}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${
              urgent ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-navy-50'
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                urgent ? 'bg-rose-500 text-white' : 'bg-white text-transparent ring-1 ring-navy-200'
              }`}
            >
              <Check size={15} strokeWidth={3.2} />
            </span>
            <span className="t-body min-w-0 break-keep font-bold text-navy-700">
              긴급합니다 (보관기한 임박 · 격리폐기물 발생 등)
            </span>
          </button>
        </div>
      </Modal>
    </PageShell>
  )
}
