import { useCallback, useEffect, useMemo, useState } from 'react'
import { CLIENT_TEL } from '../lib/brand'
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
  History,
  ReceiptText,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageShell, SectionTitle, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { Modal } from '../components/Modal'
import { TourBanner } from '../components/TourEntry'
import { portalSummary } from '../lib/portal'
import { outstandingOf } from '../lib/selectors'
import { PortalHero, PortalActionCard, type PortalAction } from '../components/PortalHero'
import { REQUEST_TONE, STATUS_TONE, TONE } from '../lib/tone'
import { REQUEST_KINDS, REQUEST_KIND_LABEL, type RequestKind, type RequestStatus } from '../types'
import { prettyDate, weight, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 첫 화면 — "병원이 왜 로그인하는가"에 화면으로 답합니다.
//
//  화면 순서 자체가 답입니다. 행동 → 내 행동의 상태 → 지나간 기록 순입니다.
//   0) 다음 수거는 언제인가 (제목 아래 한 줄)
//   1) 지금 할 수 있는 일 — 수거 요청 / 자재·용기 요청을 크게, 나머지는 작게
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
 *  primary   병원이 여기 들어오는 이유 두 가지. 화면을 열자마자 보입니다.
 *  secondary 덜 급하거나 덜 잦은 것. 같은 자리에 작게 둡니다.
 *  (기타 문의는 요청 창 안에서 고릅니다)
 *
 * ── 두 번째 버튼이 「소모품 주문」이었습니다 ───────────────────────────────
 *
 *  이사님 통화 기준으로 병원이 급한 것은 **용기가 모자란 것**입니다. 물건을
 *  사겠다는 뜻이 아닙니다. 「소모품 주문」이라고 적어 두면 판매 상품 목록처럼
 *  읽혀서, 정작 용기가 없어 못 버리는 병원이 이 칸을 안 누르고 전화를 겁니다.
 *  그래서 **글자만** 「자재·용기 요청」으로 바꿨습니다.
 *
 *  가는 곳은 그대로 물품 화면입니다. 자유 글 요청으로 보내면 「20L 용기
 *  10개요」가 요청 한 줄로만 남고 품목·수량·단가가 붙은 **주문**이 되지
 *  않아, 전달해도 그 달 청구에 안 실립니다. 파는 기능을 없앤 것이 아니라
 *  **파는 것처럼 부르지 않는 것**입니다.
 */
const SECONDARY: { kind: RequestKind; label: string }[] = [
  { kind: '긴급수거', label: '긴급 수거' },
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
  const [sendError, setSendError] = useState<string | null>(null)
  //  한 번의 「보내기」에 하나. 실패해도 바뀌지 않습니다 (0055).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const start = useCallback((k: RequestKind) => {
    setSendError(null)
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

  //  ⚠ 값은 **있는 것만** 적습니다. 「0건」과 「아직 없음」은 다른 말이고,
  //    없는 것을 0 으로 적으면 병원이 그 0 을 사실로 믿습니다.
  const owed = useMemo(
    () =>
      client
        ? data.payments
            .filter((p) => p.clientId === client.id && p.status !== '취소' && !p.canceledAt)
            .reduce((a, p) => a + outstandingOf(data, p), 0)
        : 0,
    [data, client],
  )
  const myInquiries = useMemo(
    () => (data.inquiries ?? []).filter((q) => !client || q.clientId === client.id),
    [data.inquiries, client],
  )

  const ACTIONS: PortalAction[] = useMemo(() => {
    if (!s) return []
    return [
      {
        no: '01', label: '다음 수거 일정', icon: CalendarClock, to: '/portal/history',
        value: s.nextDate ? prettyDate(s.nextDate) : '예정 없음',
        desc: s.nextIsEstimate ? '수거주기로 본 예상입니다' : '확정된 방문 일정입니다',
      },
      {
        no: '02', label: '긴급 수거 요청', icon: Siren, accent: true,
        onClick: () => start('긴급수거'),
        desc: '보관기한이 임박했거나 배출량이 갑자기 늘었을 때',
      },
      {
        no: '03', label: '용기 · 봉투 요청', icon: PackagePlus, to: '/portal/supplies',
        desc: '전용 용기 · 봉투 · 바늘통이 부족할 때',
      },
      {
        no: '04', label: '수거 이력', icon: History, to: '/portal/history',
        value: s.monthVisits > 0 ? `이번 달 ${s.monthVisits}회` : undefined,
        desc: '지난 수거 내역과 수거량을 확인하실 수 있습니다',
      },
      {
        no: '05', label: '월간 배출 리포트', icon: FileBarChart, to: '/portal/report',
        value: s.monthKg > 0 ? `${Math.round(s.monthKg).toLocaleString('ko-KR')}kg` : undefined,
        desc: '이번 달 배출 현황과 추이를 한 장으로',
      },
      {
        no: '06', label: '정산 내역', icon: ReceiptText, to: '/portal/billing',
        value: owed > 0 ? `미납 ${won(owed)}` : undefined,
        desc: owed > 0 ? '아직 입금되지 않은 청구가 있습니다' : '월별 청구 금액과 입금 상태',
      },
      {
        no: '07', label: '문의하기', icon: MessageSquare, to: '/portal/support',
        value: myInquiries.length > 0 ? `보낸 문의 ${myInquiries.length}건` : undefined,
        desc: '수거 일정 · 자재 · 정산 등 궁금한 점을 남겨 주세요',
      },
      {
        no: '08', label: '수거 요청', icon: Truck,
        onClick: () => start('추가수거'),
        desc: '정기 수거 외에 한 번 더 필요할 때',
      },
    ]
  }, [s, owed, myInquiries.length, start])

  if (!client || !s) {
    //  ⚠ 자료가 오기 전에 「연결된 병원 정보를 찾을 수 없습니다」라고 하면
    //     연결돼 있는 병원도 전화를 겁니다 (실사용 검증에서 실제로 떴습니다).
    //     확인된 뒤에만 「없다」고 말합니다.
    return (
      <PageShell>
        <LoadGate
          loadingTitle="병원 정보를 불러오는 중입니다"
          empty={
            <EmptyState
              icon={Hospital}
              title="연결된 병원 정보를 찾을 수 없습니다"
              subtitle={`비원미래 담당자에게 계정 연결을 요청해 주세요. (${CLIENT_TEL})`}
            />
          }
        />
      </PageShell>
    )
  }

  const submit = async () => {
    if (!content.trim()) return
    //  서버가 실제로 받았을 때만 '접수되었습니다' 를 보여 줍니다.
    //  예전에는 결과를 기다리지 않아서, 통신이 끊긴 채로 보내도 접수된
    //  것처럼 보였습니다. 병원은 기다리는데 요청은 없는 상태가 됩니다.
    const res = await addRequest({
      clientId: client.id,
      kind,
      content: content.trim(),
      desiredDate: desired || null,
      urgent,
      source: 'portal',
      requesterName: profile?.name ?? '병원 담당자',
      //  이번 시도의 표 (0055). 실패해서 다시 누르면 **같은 값**이 갑니다 —
      //  지하 주차장에서 응답이 늦어 두 번 눌러도 요청은 하나입니다.
      requestId,
    })
    if (!res.ok) {
      //  적은 내용을 지우지 않고 창을 열어 둡니다 — 다시 보내면 됩니다.
      //  requestId 도 그대로 둡니다. 새로 만들면 두 번째가 새 요청이 됩니다.
      setSendError(res.error ?? '요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    setSendError(null)
    //  보내진 뒤에는 다음 요청을 위해 새 표를 만듭니다.
    setRequestId(crypto.randomUUID())
    setContent('')
    setUrgent(false)
    setDesired('')
    setOpen(false)
    setSent(true)
  }

  return (
    <PageShell>
      {/*  0083 — 대표님이 주신 시안의 짙은 남색 머리 칸.
           ⚠ 시안의 「기관 코드」·「안전 무사고 1,248일째」는 저희 서버에 없는
             값이라 **지어내지 않았습니다.** 실제로 아는 것(기관 구분·수거주기·
             다음 수거)을 같은 자리에 넣었습니다. */}
      <PortalHero client={client} s={s} />

      {sent && (
        <div data-req-sent className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-emerald-100">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" strokeWidth={2.4} />
          <p className="t-body min-w-0 flex-1 break-keep font-bold text-emerald-800">
            요청이 접수되었습니다. 비원미래 담당자가 확인하면 아래 진행 상태가 바뀌고 회신이 표시됩니다.
          </p>
          <button onClick={() => setSent(false)} className="shrink-0 text-emerald-600">
            <X size={18} />
          </button>
        </div>
      )}

      {/* ── 1. 지금 할 수 있는 일 — 전화를 걸기 전에 여기서 먼저 ──
           ⚠ 이 두 개가 **화면을 열자마자** 보여야 합니다. 예전에는 시스템
             소개 카드가 첫 화면을 다 차지해서, 「수거 요청」은 화면 맨 끝에
             겨우 걸치고 「자재·용기 요청」은 아예 보이지 않았습니다. 병원 담당자는
             폐기물이 본업이 아니라, 안 보이면 그냥 전화를 겁니다.
             소개 카드는 이 아래로 내렸습니다 — 없애지 않았습니다. */}
      {/*  ── 번호가 붙은 큰 칸 (0083) ────────────────────────────────────────
           시안의 01 · 02 · 03 … 배치입니다.
           ⚠ **누르면 실제로 되는 것만** 넣었습니다. 「준비중」 칸은 없습니다.
           ⚠ 숫자는 지금 자료에서 그대로 가져옵니다 — 없으면 안 적습니다. */}
      <section>
        <SectionTitle>지금 하실 수 있는 일</SectionTitle>
        <div data-portal-actions className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ACTIONS.map((a) => (
            <PortalActionCard key={a.no} a={a} as={a.to ? 'link' : 'button'} />
          ))}
        </div>
      </section>

      <section>
        <div data-tour="portal-request" className="grid gap-3 sm:grid-cols-2">
          <button
            data-portal-cta="collect"
            onClick={() => start('추가수거')}
            className="card pressable flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
          >
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16 ${TONE[REQUEST_TONE['추가수거']].tile}`}
            >
              <Truck size={29} strokeWidth={2.3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-card block break-keep text-navy-900">수거 요청</span>
              <span className="t-muted mt-1 block break-keep leading-snug">
                정기 수거 외에 한 번 더 필요할 때
              </span>
            </span>
            <ChevronRight size={22} className="shrink-0 text-navy-400" />
          </button>

          {/*  자유 글이 아니라 **물품 화면**으로 보냅니다 — 품목과 수량이 붙어야
              실제로 전달되고 그 달 청구에 실립니다. 위 주석 참고. */}
          <Link
            to="/portal/supplies"
            data-portal-cta="supplies"
            className="card pressable flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
          >
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16 ${TONE[REQUEST_TONE['소모품']].tile}`}
            >
              <PackagePlus size={29} strokeWidth={2.3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-card block break-keep text-navy-900">자재·용기 요청</span>
              <span className="t-muted mt-1 block break-keep leading-snug">
                전용 용기 · 봉투 · 바늘통이 부족할 때 — 다음 수거 때 가져다 드립니다
              </span>
            </span>
            <ChevronRight size={22} className="shrink-0 text-navy-400" />
          </Link>
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

      {/*  시스템 소개·둘러보기 — 할 수 있는 일 **아래**입니다.
          처음 오신 분께는 여전히 눈에 띄지만, 매일 쓰시는 분의 첫 화면을
          가리지는 않습니다. 「오늘 하루 보지 않기」도 그대로입니다. */}
      <TourBanner tourId="client" />

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
                    <span className={`pill ${kt.chip}`}>{REQUEST_KIND_LABEL[r.type]}</span>
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
                            i <= stepIdx ? 'text-navy-600' : 'text-navy-400'
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
              <ChevronRight size={20} className="shrink-0 text-navy-400" />
            </Link>
          )
        })}
      </div>

      {/* ── 요청 등록 ── */}
      <Modal
        open={open}
        title={`${REQUEST_KIND_LABEL[kind]} 요청`}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost flex-1">
              취소
            </button>
            <button
              onClick={() => void submit()}
              disabled={!content.trim()}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              <Send size={17} strokeWidth={2.4} /> 요청 보내기
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {sendError && (
            <div data-req-error className="rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-rose-100">
              <p className="t-body break-keep font-bold text-rose-700">{sendError}</p>
              <p className="t-muted mt-1 break-keep">
                적으신 내용은 그대로 있습니다. 통신 상태를 확인한 뒤 다시 보내 주세요.
              </p>
            </div>
          )}
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
                  {REQUEST_KIND_LABEL[k]}
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
