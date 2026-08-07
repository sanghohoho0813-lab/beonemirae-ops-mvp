import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileBarChart,
  GraduationCap,
  MessageSquare,
  Package,
  PackagePlus,
  Scale,
  Send,
  Siren,
  Sparkles,
  Truck,
  X,
  Hospital,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageShell, SectionTitle, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { TourBanner } from '../components/TourEntry'
import { portalSummary } from '../lib/portal'
import { REQUEST_TONE, STATUS_TONE, TONE } from '../lib/tone'
import { REQUEST_KINDS, type RequestKind, type RequestStatus } from '../types'
import { prettyDate, weight, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 첫 화면 — "병원이 왜 로그인하는가"에 화면으로 답합니다.
//
//  화면 순서 자체가 답입니다. 행동 → 내 행동의 상태 → 지나간 기록 순입니다.
//   0) 다음 수거는 언제인가 (제목 아래 한 줄)
//   1) 지금 할 수 있는 일 — 긴급 수거 / 소모품을 크게, 나머지는 작게
//   2) 내 요청이 지금 어디까지 왔는가 (회신까지)
//   3) 비원미래가 우리 병원 데이터를 보고 무엇을 제안했는가 → 수락
//   4) 우리 병원 수거 현황 (최근 기록)
//   5) 월간 리포트 · 수거 이력 (인증·실사 자료를 직접)
//
//  색은 요청 유형·상태 구분에만 씁니다. 병원 담당자는 폐기물이 본업이 아니라
//  겸직인 경우가 많아, 읽을 것보다 '누를 것'이 먼저 보이게 두었습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 요청 유형별 아이콘 — 무엇을 요청하는지 글자 없이도 구분되게 */
const KIND_ICON: Record<RequestKind, typeof Siren> = {
  긴급수거: Siren,
  추가수거: Truck,
  소모품: PackagePlus,
  '교육·자료': GraduationCap,
  기타: MessageSquare,
}

const KIND_HINT: Record<RequestKind, string> = {
  긴급수거: '보관기한이 임박했거나 배출량이 갑자기 늘었을 때',
  추가수거: '정기 수거 외에 한 번 더 필요할 때',
  소모품: '전용 용기 · 봉투 · 바늘통이 부족할 때',
  '교육·자료': '배출자 교육, 수거대장·명세 등 자료가 필요할 때',
  기타: '그 밖의 문의',
}

/**
 * 첫 화면의 행동 버튼 — 다 같은 크기로 늘어놓지 않습니다.
 *
 *  primary   전화로 가장 많이 오는 두 가지. 크게 둡니다.
 *  secondary 덜 급한 두 가지. 같은 자리에 작게 둡니다.
 *  (기타 문의는 요청 창 안에서만 고릅니다)
 */
const PRIMARY: { kind: RequestKind; label: string; caption: string }[] = [
  { kind: '긴급수거', label: '긴급 수거 요청', caption: '보관기한 임박 · 오늘 중 수거' },
  { kind: '소모품', label: '소모품 요청', caption: '전용 용기 · 봉투가 부족할 때' },
]
const SECONDARY: { kind: RequestKind; label: string }[] = [
  { kind: '추가수거', label: '추가 수거' },
  { kind: '교육·자료', label: '교육·자료' },
]

const STATUS_STEPS: RequestStatus[] = ['접수', '확인 중', '일정 반영', '처리 완료']

export function PortalHome() {
  const { data, addRequest, respondProposal } = useData()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<RequestKind>('추가수거')
  const [content, setContent] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [desired, setDesired] = useState('')
  const [sent, setSent] = useState(false)

  const start = useCallback((k: RequestKind) => {
    setKind(k)
    setUrgent(k === '긴급수거')
    setContent('')
    setDesired('')
    setOpen(true)
  }, [])

  // 투어 마지막 단계의 「수거 요청해보기」가 여기로 옵니다 — 설명이 곧바로 행동이 되게.
  useEffect(() => {
    const onAsk = () => start('긴급수거')
    window.addEventListener('beonemirae:portal-request', onAsk)
    return () => window.removeEventListener('beonemirae:portal-request', onAsk)
  }, [start])

  const client = data.clients[0]
  const s = useMemo(() => (client ? portalSummary(data, client) : null), [data, client])

  if (!client || !s) {
    return (
      <PageShell>
        <EmptyState
          icon={Hospital}
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
      {/* 로그인하면 가장 먼저 궁금한 것 — 다음에 언제 오는가. 한 줄로 끝냅니다. */}
      <div>
        <h1 className="t-page break-keep text-navy-900">무엇을 도와드릴까요?</h1>
        <p className="t-body mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 break-keep font-medium text-navy-400">
          <CalendarClock size={19} strokeWidth={2.4} className="shrink-0 text-teal-500" />
          <span className="font-bold text-navy-700">
            다음 수거 {s.nextDate ? prettyDate(s.nextDate) : '예정 없음'}
            {s.nextTime && ` ${s.nextTime}`}
          </span>
          {s.nextIsEstimate && <span className="pill bg-navy-100 text-navy-500">수거주기 기준 예상</span>}
          <span className="text-navy-300">·</span>
          <span>수거주기 {client.collectionCycle || '미설정'}</span>
        </p>
      </div>

      {sent && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-emerald-100">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" strokeWidth={2.4} />
          <p className="t-body min-w-0 flex-1 break-keep font-bold text-emerald-800">
            요청이 접수되었습니다. 비원미래 담당자가 확인하면 아래 진행 상태가 바뀌고 회신이 표시됩니다.
          </p>
          <button onClick={() => setSent(false)} className="shrink-0 text-emerald-600">
            <X size={18} />
          </button>
        </div>
      )}

      <TourBanner tourId="client" />

      {/* ── 1. 지금 할 수 있는 일 — 전화를 걸기 전에 여기서 먼저 ── */}
      <section>
        <div data-tour="portal-request" className="grid gap-3 sm:grid-cols-2">
          {PRIMARY.map((q) => {
            const Icon = KIND_ICON[q.kind]
            const t = TONE[REQUEST_TONE[q.kind]]
            return (
              <button
                key={q.kind}
                onClick={() => start(q.kind)}
                className="card pressable flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
              >
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16 ${t.tile}`}
                >
                  <Icon size={29} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-card block break-keep text-navy-900">{q.label}</span>
                  <span className="t-muted mt-1 block break-keep leading-snug">{q.caption}</span>
                </span>
                <ChevronRight size={22} className="shrink-0 text-navy-300" />
              </button>
            )
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {SECONDARY.map((q) => {
            const Icon = KIND_ICON[q.kind]
            const t = TONE[REQUEST_TONE[q.kind]]
            return (
              <button
                key={q.kind}
                onClick={() => start(q.kind)}
                className="card pressable flex items-center gap-2.5 px-4 py-3.5 text-left transition hover:shadow-lg"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.tile}`}>
                  <Icon size={18} strokeWidth={2.3} />
                </span>
                <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">{q.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 2. 내 요청 진행 상태 — 내가 한 행동이 지금 어디까지 왔는가 ── */}
      <section>
        <SectionTitle
          action={
            s.allRequests.length > 0 ? (
              <span className="t-label whitespace-nowrap text-navy-400">
                {s.openRequests.length > 0 && (
                  <span className="text-rose-600">진행 중 {s.openRequests.length}건</span>
                )}
                {s.openRequests.length > 0 && s.allRequests.length > s.openRequests.length && ' · '}
                {s.allRequests.length > s.openRequests.length &&
                  `완료 ${s.allRequests.length - s.openRequests.length}건`}
              </span>
            ) : undefined
          }
        >
          내 요청 진행 상태
        </SectionTitle>
        {s.allRequests.length === 0 ? (
          <div className="card px-5 py-5">
            <p className="t-body break-keep leading-snug text-navy-500">
              아직 올린 요청이 없습니다. 위에서 요청하시면 접수 → 확인 중 → 일정 반영 → 처리 완료까지 여기에
              표시됩니다.
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-navy-50">
            {s.allRequests.slice(0, 8).map((r, ri) => {
              const Icon = KIND_ICON[r.type]
              const kt = TONE[REQUEST_TONE[r.type]]
              const stepIdx = STATUS_STEPS.indexOf(r.status)
              return (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kt.tile}`}>
                      <Icon size={18} strokeWidth={2.3} />
                    </span>
                    <span className={`pill ${kt.chip}`}>{r.type}</span>
                    {r.urgent && (
                      <span className="pill bg-rose-50 text-rose-600">
                        <AlertTriangle size={13} strokeWidth={2.6} /> 긴급
                      </span>
                    )}
                    <span className={`pill ${TONE[STATUS_TONE[r.status]].chip}`}>{r.status}</span>
                    <span className="t-muted ml-auto shrink-0">{r.when}</span>
                  </div>

                  <p className="t-body mt-2.5 break-keep leading-snug text-navy-700">{r.content}</p>

                  {/* 진행 단계 — 지금 어디까지 왔는지 한 줄로
                      (모바일에서는 단계 이름이 잘리므로 막대 + 한 줄 요약으로 대체) */}
                  <div className="mt-3" data-tour={ri === 0 ? 'portal-requests' : undefined}>
                    <div className="flex items-center gap-1">
                      {STATUS_STEPS.map((st, i) => (
                        <span
                          key={st}
                          className={`h-1.5 min-w-0 flex-1 rounded-full ${
                            i <= stepIdx ? TONE[STATUS_TONE[r.status]].dot : 'bg-navy-100'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5 hidden items-center gap-1 sm:flex">
                      {STATUS_STEPS.map((st, i) => (
                        <span
                          key={st}
                          className={`t-tab min-w-0 flex-1 truncate ${
                            i <= stepIdx ? 'text-navy-600' : 'text-navy-300'
                          }`}
                        >
                          {st}
                        </span>
                      ))}
                    </div>
                    <p className="t-muted mt-1.5 break-keep sm:hidden">
                      {STATUS_STEPS.length}단계 중 {stepIdx + 1}단계 · {r.status}
                    </p>
                  </div>

                  {r.reply && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-3">
                      <MessageSquare size={16} className="mt-0.5 shrink-0 text-sky-600" strokeWidth={2.3} />
                      <p className="t-body min-w-0 break-keep leading-snug text-sky-900">
                        <span className="font-bold">비원미래 회신</span> · {r.reply}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 3. 비원미래가 보낸 제안 ── */}
      {(s.pendingProposals.length > 0 || s.acceptedProposals.length > 0) && (
        <section>
          <SectionTitle
            action={<span className="pill bg-accent-50 text-accent-700">우리 병원 데이터 기준</span>}
          >
            비원미래가 제안드립니다
          </SectionTitle>
          <div className="space-y-3">
            {s.pendingProposals.map((l) => (
              <div key={l.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                    <Sparkles size={20} strokeWidth={2.3} />
                  </span>
                  <p className="t-card min-w-0 flex-1 break-keep text-navy-900">{l.title}</p>
                  {l.estValue > 0 && (
                    <span className="pill shrink-0 bg-navy-100 text-navy-600">예상 {won(l.estValue)}</span>
                  )}
                </div>
                {l.clientMessage && (
                  <p className="t-body mt-3 break-keep leading-snug text-navy-600">{l.clientMessage}</p>
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
                <CheckCircle2 size={19} className="shrink-0 text-emerald-600" strokeWidth={2.4} />
                <p className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">{l.title}</p>
                <span className="pill shrink-0 bg-emerald-50 text-emerald-700">수락함</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 4. 우리 병원 수거 현황 — 지나간 기록이라 행동 아래에 둡니다 ── */}
      <section>
        <SectionTitle>우리 병원 수거 현황</SectionTitle>
        <div
          data-tour="portal-status"
          className="card grid grid-cols-1 gap-px overflow-hidden bg-navy-100 sm:grid-cols-3"
        >
          {[
            { icon: Clock, label: '최근 수거', value: s.lastDate ? prettyDate(s.lastDate) : '기록 없음', tone: 'sky' as const },
            { icon: Scale, label: '최근 배출량', value: s.lastKg != null ? weight(s.lastKg) : '—', tone: 'blue' as const },
            { icon: Package, label: '이번 달', value: `${weight(s.monthKg)} · ${s.monthVisits}회`, tone: 'emerald' as const },
          ].map((x) => {
            const Icon = x.icon
            return (
              <div key={x.label} className="flex items-center gap-3 bg-white px-5 py-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[x.tone].tile}`}>
                  <Icon size={19} strokeWidth={2.3} />
                </span>
                <div className="min-w-0">
                  <p className="t-muted break-keep">{x.label}</p>
                  <p className="t-body mt-0.5 break-keep font-extrabold text-navy-900">{x.value}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 5. 리포트 · 이력 바로가기 ── */}
      <div data-tour="portal-report" className="grid gap-3 sm:grid-cols-2">
        {[
          {
            to: '/portal/report',
            icon: FileBarChart,
            tone: 'sky' as const,
            title: '월간 운영 리포트',
            desc: '배출량·수거 횟수·용기 공급을 매달 정리',
          },
          {
            to: '/portal/history',
            icon: Clock,
            tone: 'sky' as const,
            title: '수거 이력',
            desc: '인증·실사에 그대로 쓰는 전체 수거 기록',
          },
        ].map((x) => {
          const Icon = x.icon
          return (
            <Link
              key={x.to}
              to={x.to}
              className="card pressable flex items-center gap-3.5 p-4 transition hover:shadow-lg sm:gap-4 sm:p-5"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${TONE[x.tone].tile}`}
              >
                <Icon size={23} strokeWidth={2.3} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-body break-keep font-extrabold text-navy-900">{x.title}</p>
                <p className="t-muted mt-1 break-keep leading-snug">{x.desc}</p>
              </div>
              <ChevronRight size={20} className="shrink-0 text-navy-300" />
            </Link>
          )
        })}
      </div>

      {/* ── 요청 등록 ── */}
      <Modal
        open={open}
        title={`${kind} 요청`}
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
                    kind === k ? 'bg-navy-900 text-white' : `${TONE[REQUEST_TONE[k]].chip} hover:opacity-80`
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
