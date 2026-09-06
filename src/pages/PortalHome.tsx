import { useMemo } from 'react'
import { CLIENT_TEL } from '../lib/brand'
import {
  Check, CheckCircle2, ClipboardList, FileBarChart, Hospital,
  MessageSquare, PackagePlus, ReceiptText, ShieldCheck, Siren, Sparkles, Truck,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { usePortalSheet } from '../lib/portalSheet'
import { PageShell, SectionTitle, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { TourBanner } from '../components/TourEntry'
import { portalSummary } from '../lib/portal'
import { outstandingOf } from '../lib/selectors'
import { PortalHero, PortalActionCard, type PortalAction } from '../components/PortalHero'
import { PortalInsightPanel } from '../components/PortalInsightPanel'
import { PortalFooter } from '../components/PortalFooter'
import { portalInsights } from '../lib/portalInsight'
import { recentActivity, portalTodos } from '../lib/portalActivity'
import { prettyDate, weight, won } from '../lib/format'
import { REQUEST_KIND_LABEL } from '../types'
import { BRAND_IMG } from '../lib/brandAssets'
import { BrandImg } from '../components/BrandImg'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 담당자의 **작업 화면** (0089)
//
//  대표님: 「페이지 이동형 고객 포털 → 홈 화면에서 대부분의 업무가 끝나는
//  작업형 Customer Platform 으로 전환한다」
//
//  ── 무엇이 바뀌었나 ─────────────────────────────────────────────────────
//   예전에는 카드를 누르면 **다른 화면으로 갔습니다.** 물품을 주문하려면
//   화면을 옮기고, 끝나면 돌아와야 했습니다. 병원 담당자는 폐기물이 본업이
//   아니라, 화면을 옮길 때마다 「지금 어디에 있지」를 다시 생각해야 합니다.
//
//   이제 카드를 누르면 **있던 자리에 그대로 있고 위에 창만 뜹니다.**
//   창을 닫으면 하던 자리로 돌아옵니다. 옮길 화면이 없으니 길을 잃을 일도
//   없습니다.
//
//  ── 화면 순서 ───────────────────────────────────────────────────────────
//   1) 우리 병원 · 다음 수거     (머리 칸)
//   2) 지금 확인이 필요한 것     ← 있을 때만
//   3) 지금 하실 수 있는 일       ← 8칸, 전부 창을 엽니다
//   4) 배출 분석 (규칙 기반)
//   5) 최근 활동
//   6) 병원 등록 정보 · 상담센터
// ─────────────────────────────────────────────────────────────────────────────

const TODO_TONE = {
  info: { chip: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  good: { chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  warn: { chip: 'bg-rose-50 text-rose-600', dot: 'bg-rose-500' },
} as const

const ACT_TONE: Record<string, string> = {
  수거: 'bg-teal-50 text-teal-700',
  주문: 'bg-cyan-50 text-cyan-700',
  정산: 'bg-sky-50 text-sky-700',
  문의: 'bg-violet-50 text-violet-700',
  요청: 'bg-amber-50 text-amber-700',
}

export function PortalHome() {
  const { data } = useData()
  //  ⚠ 「어느 병원인가」는 한 곳에서 정합니다(lib/portalClient.ts).
  const { client } = usePortalClient()
  //  ⚠ 「지금 무슨 창이 열려 있는가」는 주소 뒤(?do=)에 있습니다 —
  //    새로고침해도 창이 살아 있습니다.
  const { open } = usePortalSheet()

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
  const openOrders = useMemo(
    () =>
      (data.productOrders ?? []).filter(
        (o) => client && o.clientId === client.id && o.status !== '전달완료' && o.status !== '취소',
      ),
    [data.productOrders, client],
  )

  //  ⚠ 「분석」 칸. **규칙 기반입니다** (lib/portalInsight.ts).
  //    AI 라고 부르지 않습니다 — 지금 계산은 뺄셈과 나눗셈입니다.
  const insight = useMemo(
    () => (client ? portalInsights(data, client) : { items: [], why: null }),
    [data, client],
  )

  const todos = useMemo(
    () =>
      client && s
        ? portalTodos(data, client, { date: s.nextDate, isEstimate: s.nextIsEstimate })
        : [],
    [data, client, s],
  )
  const activity = useMemo(() => (client ? recentActivity(data, client) : []), [data, client])

  //  ── 여덟 칸 ─────────────────────────────────────────────────────────────
  //
  //   ⚠ 「수거 요청」과 「용기·봉투 주문」이 **첫 화면 안**에 있어야 합니다.
  //     이건 이사님 통화에서 나온 기존 판단이고 검사로도 못박혀 있습니다
  //     (check_flow390 ①②). 병원이 급한 것은 **용기가 모자란 것**인데,
  //     안 보이면 그냥 전화를 겁니다. 그래서 이 둘을 맨 앞에 둡니다.
  //
  //   ⚠ 「다음 수거 일정」은 위 머리 칸이 이미 크게 말하고 있습니다. 카드로
  //     또 두면 같은 말을 두 번 하면서 첫 줄을 잡아먹습니다.
  const ACTIONS: PortalAction[] = useMemo(() => {
    if (!s) return []
    return [
      {
        no: '01', label: '수거 요청', icon: Truck, tone: 'teal', cta: 'collect',
        onClick: () => open('pickup'),
        desc: '정기 수거 외에 한 번 더 필요할 때',
      },
      {
        no: '02', label: '용기 · 봉투 주문', icon: PackagePlus, tone: 'cyan', cta: 'supplies',
        onClick: () => open('supply'),
        value: openOrders.length > 0 ? `진행 중 ${openOrders.length}건` : undefined,
        desc: '전용 용기 · 봉투 · 바늘통이 부족할 때',
      },
      {
        no: '03', label: '긴급 수거 요청', icon: Siren, tone: 'rose',
        onClick: () => open('urgent'),
        desc: '보관기한이 임박했거나 배출량이 갑자기 늘었을 때',
      },
      {
        no: '04', label: '상담 · 문의', icon: MessageSquare, tone: 'aqua',
        onClick: () => open('ask'),
        value: myInquiries.length > 0 ? `보낸 문의 ${myInquiries.length}건` : undefined,
        desc: '수거 일정 · 자재 · 정산 등 궁금한 점을 남겨 주세요',
      },
      {
        no: '05', label: '수거 이력', icon: ClipboardList, tone: 'blue',
        onClick: () => open('history'),
        value: s.monthVisits > 0 ? `이번 달 ${s.monthVisits}회` : undefined,
        desc: '지난 수거 내역과 수거량을 확인하실 수 있습니다',
      },
      {
        no: '06', label: '월간 배출 리포트', icon: FileBarChart, tone: 'emerald',
        onClick: () => open('report'),
        value: s.monthKg > 0 ? weight(s.monthKg) : undefined,
        desc: '이번 달 배출 현황과 추이를 한 장으로',
      },
      {
        no: '07', label: '정산 현황', icon: ReceiptText, tone: 'sky',
        onClick: () => open('billing'),
        value: owed > 0 ? `미납 ${won(owed)}` : undefined,
        desc: owed > 0 ? '아직 입금되지 않은 청구가 있습니다' : '월별 청구 금액과 입금 상태',
      },
      {
        no: '08', label: '증빙자료', icon: ShieldCheck, tone: 'violet',
        onClick: () => open('docs'),
        desc: '인증·실사에 그대로 쓰실 수 있는 자료',
      },
    ]
  }, [s, owed, myInquiries.length, openOrders.length, open])

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

  return (
    <PageShell>
      <PortalHero client={client} s={s} />

      {/*  ── 지금 하실 수 있는 일 ────────────────────────────────────────────
           ⚠ 여덟 칸 **전부 창을 엽니다.** 화면을 옮기지 않습니다. */}
      <section>
        {/*  ⚠ 폰에서는 제목 줄을 접습니다. 이 75px 때문에 「수거 요청」이
             화면 밖으로 밀린 적이 있습니다 — 번호 붙은 카드는 제목 없이도
             무엇인지 스스로 말합니다. */}
        <div className="hidden sm:block">
          <SectionTitle>지금 하실 수 있는 일</SectionTitle>
        </div>
        <div data-portal-actions data-tour="portal-request" className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          {ACTIONS.map((a) => (
            <PortalActionCard key={a.no} a={a} />
          ))}
        </div>
      </section>

      {/*  ── 지금 확인이 필요한 것 ──────────────────────────────────────────
           ⚠ 없으면 **이 칸 자체가 없습니다.** 대표님: 「0건이면 영역을
             과도하게 크게 보여주지 않는다」. 늘 떠 있는 칸은 곧 안 보게
             됩니다.

           ⚠ **여덟 칸 아래**입니다. 위에 뒀더니 390px 폰에서 이 칸(138px)
             때문에 「수거 요청」이 y=955px 로 밀려 첫 화면 밖으로 나갔습니다
             (check_flow390 이 잡았습니다). 대표님이 주신 화면 순서도
             「A 머리 → B 지금 하실 수 있는 일 → C 최근 상태·알림」이라
             이쪽이 맞습니다. 매일 누르는 것이 먼저입니다. */}
      {todos.length > 0 && (
        <section data-portal-todos>
          <SectionTitle>지금 확인이 필요한 항목</SectionTitle>
          <ul className="card divide-y divide-navy-50">
            {todos.slice(0, 4).map((t) => {
              const tone = TODO_TONE[t.tone]
              const Row = (
                <>
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="t-body block break-keep font-extrabold leading-snug text-navy-900">
                      {t.title}
                    </span>
                    <span className="t-muted mt-0.5 block break-keep leading-snug">{t.detail}</span>
                  </span>
                </>
              )
              return (
                <li key={t.key} data-todo={t.key}>
                  {t.sheet ? (
                    <button
                      onClick={() => open(t.sheet!)}
                      className="flex min-h-[3.5rem] w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-navy-50"
                    >
                      {Row}
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 px-5 py-4">{Row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/*  시스템 소개·둘러보기 — 할 수 있는 일 **아래**입니다. */}
      <TourBanner tourId="client" />

      {/*  ── 내 요청 진행 상태 + 배출 분석 ───────────────────────────────────
           시안에서 분석 칸은 **오른쪽 옆**입니다. 넓은 화면에서는 그렇게 둡니다.
           ⚠ 폰에서는 위아래로 쌓이는데, 그때 순서가 「요청 상태 → 분석」이어야
             합니다. 분석은 읽을거리고 요청 상태는 내가 지금 기다리는 것입니다. */}
      {/*  ⚠ 0091 — 화면이 넓어지면 옆칸도 같이 넓힙니다. 1,840px 본문 옆에
           22rem(352px) 만 붙어 있으면 한쪽만 늘어난 것처럼 보입니다. */}
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section data-portal-requests>
          <SectionTitle
            action={
              s.openRequests.length > 0 ? (
                <span className="t-label whitespace-nowrap text-rose-600">
                  진행 중 {s.openRequests.length}건
                </span>
              ) : undefined
            }
          >
            내 요청 진행 상태
          </SectionTitle>
          {s.allRequests.length === 0 ? (
            <div className="card px-5 py-5">
              <p className="t-body break-keep leading-snug text-navy-500">
                아직 올린 요청이 없습니다. 위 「수거 요청」을 누르시면 접수 → 확인 중 → 일정 반영 → 처리
                완료까지 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            <ul className="card divide-y divide-navy-50">
              {s.allRequests.slice(0, 5).map((r) => (
                <li key={r.id} data-req-row={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {/*  ⚠ **저장값을 그대로 적지 않습니다.** `소모품` 은 DB
                         CHECK 값이라 못 바꾸지만, 병원 화면에 그대로 적으면
                         판매 상품 목록처럼 읽혀서 정작 용기가 없어 못 버리는
                         병원이 이 칸을 안 누르고 전화를 겁니다.
                         (0089 에서 이 변환을 빠뜨렸고 check_portalhome 이
                          잡았습니다) */}
                    <span className="pill shrink-0 bg-navy-50 text-navy-600">
                      {REQUEST_KIND_LABEL[r.type] ?? r.type}
                    </span>
                    {r.urgent && <span className="pill shrink-0 bg-rose-50 text-rose-600">긴급</span>}
                    <span
                      className={`pill shrink-0 ${
                        r.status === '처리 완료'
                          ? 'bg-emerald-50 text-emerald-700'
                          : r.status === '일정 반영'
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="t-muted ml-auto shrink-0">{r.when}</span>
                  </div>
                  <p className="t-body mt-2 whitespace-pre-line break-keep leading-snug text-navy-700">
                    {r.content}
                  </p>
                  {/*  ⚠ 적어 주신 것만 다시 보여 드립니다 (0087). */}
                  {(r.desiredDate || r.wasteType || r.expectedKg != null) && (
                    <p data-req-detail={r.id} className="t-muted mt-1.5 break-keep">
                      {[
                        r.desiredDate ? `희망일 ${prettyDate(r.desiredDate)}` : null,
                        r.wasteType,
                        r.expectedKg != null ? `예상 ${r.expectedKg}kg` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {r.reply && (
                    <p className="t-body mt-2.5 break-keep rounded-xl bg-sky-50 px-3.5 py-3 leading-snug text-sky-900">
                      <b className="font-extrabold">비원미래 회신</b> · {r.reply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <PortalInsightPanel result={insight} />
      </div>

      {/*  ── 비원미래가 보낸 제안 ── */}
      {(s.pendingProposals.length > 0 || s.acceptedProposals.length > 0) && (
        <ProposalList s={s} />
      )}

      {/*  ── 최근 활동 (0089) ───────────────────────────────────────────────
           ⚠ 표를 새로 만들지 않았습니다. 이미 있는 자료를 시각 순으로
             세울 뿐입니다(lib/portalActivity.ts). */}
      <section data-portal-activity>
        <SectionTitle>최근 활동</SectionTitle>
        {activity.length === 0 ? (
          <div className="card px-5 py-5">
            <p className="t-body break-keep leading-snug text-navy-500">
              아직 기록이 없습니다. 첫 수거가 끝나면 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-navy-50">
            {activity.map((a) => (
              <li key={a.key} data-activity={a.kind} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`pill shrink-0 ${ACT_TONE[a.kind] ?? 'bg-navy-50 text-navy-600'}`}>
                  {a.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body block break-keep font-bold leading-snug text-navy-900">
                    {a.title}
                  </span>
                  {a.tail && <span className="t-muted block break-keep leading-snug">{a.tail}</span>}
                </span>
                <span className="t-muted shrink-0 tabular-nums">{prettyDate(a.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*  ── 신뢰 띠 (0095) — 맨 아래, 업무를 밀지 않는 자리 ────────────────
           ⚠ 적힌 세 가지는 전부 **이 포털에 실제로 있는 기능**입니다.
             「무사고 1,248일」처럼 서버에 없는 숫자는 넣지 않습니다. */}
      {/*  ⚠ 0098 — 글자 높이만큼만 띠가 생겨서 넓은 화면에서 9:1 이 됐고,
           원본(2.33:1)의 세로를 네 배 가까이 잘라 **직원들 얼굴이
           잘렸습니다.** 최소 높이를 줘서 덜 자르고, 남길 자리도 정합니다. */}
      <section
        data-portal-trust
        className="relative flex min-h-[15rem] items-center overflow-hidden rounded-3xl bg-navy-950 shadow-lg sm:min-h-[19rem]"
      >
        <BrandImg src={BRAND_IMG.trustBanner} className="absolute inset-0 h-full w-full" />
        {/*  ⚠ 0098 — 띠를 키워 사람이 다 보이게 했더니 사진이 밝아져
             글자 대비가 아슬해졌습니다. 글이 있는 왼쪽을 더 덮고,
             글줄 폭도 어두운 자리 안으로 묶습니다. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-navy-950/92 via-navy-950/80 to-navy-950/55"
        />
        <div className="relative max-w-[34rem] px-5 py-6 text-white sm:px-8 sm:py-8">
          <p className="break-keep text-[1.2rem] font-extrabold leading-snug sm:text-[1.5rem]">
            병원 폐기물, 기록으로 관리합니다
          </p>
          <p className="t-body mt-1.5 break-keep leading-snug text-navy-100">
            수거 한 건 한 건이 이 화면에서 확인하시는 기록으로 남습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['수거 이력 · 무게 확인', '처리장 인계 확인', '월간 배출 리포트'].map((t) => (
              <span key={t} className="rounded-full bg-white/15 px-3.5 py-1.5 text-[1rem] font-bold backdrop-blur-sm">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <PortalFooter client={client} />
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 비원미래가 보낸 제안 — 병원이 **누르면 수락**됩니다
// ─────────────────────────────────────────────────────────────────────────────

function ProposalList({ s }: { s: ReturnType<typeof portalSummary> }) {
  const { respondProposal } = useData()
  return (
    <section>
      <SectionTitle action={<span className="pill bg-accent-50 text-accent-700">우리 병원 데이터 기준</span>}>
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
  )
}
