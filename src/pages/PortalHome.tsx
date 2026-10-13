import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CLIENT_TEL } from '../lib/brand'
import { Check, CheckCircle2, ClipboardList, Hospital, ListChecks, Sparkles } from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { usePortalSheet } from '../lib/portalSheet'
import { PageShell, SectionTitle, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { TourBanner } from '../components/TourEntry'
import { portalSummary } from '../lib/portal'
import { portalTodos } from '../lib/portalActivity'
import { collectionHistory } from '../lib/ops'
import { weekStrip } from '../lib/portalWeek'
import { prettyDate, today, weight, won } from '../lib/format'
import { PortalHero, PortalActions } from '../components/PortalHero'
import { PortalFooter } from '../components/PortalFooter'
import { CardHead, QuietEmpty, RequestRow } from '../components/portal/PortalUi'
import { Stagger, StaggerItem } from '../components/motion'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 홈 (포털 1차 고도화)
//
//  대표님 브리프: 「5초 안에 ① 오늘 또는 다음 수거 일정 ② 급하게 요청할 곳
//  ③ 최근 요청과 처리 결과를 알 수 있어야 한다」.
//
//  ── 화면 순서 ───────────────────────────────────────────────────────────
//   1) 다음 수거                (언제 오나 — 확정인지 예상인지까지)
//   2) 큰 단추 둘               긴급수거 요청 · 자재·용기 요청
//      작은 단추 둘             추가수거 요청 · 문의하기
//   3) 확인이 필요한 것         ← 있을 때만
//   4) 최근 요청 · 최근 수거    (지금 어디까지 왔나 · 지난번 언제 가져갔나)
//   5) 비원미래 제안             ← 있을 때만
//   6) 우리 병원 등록 정보 · 상담센터
//
//  ── 예전 홈에서 옮긴 것 ─────────────────────────────────────────────────
//   · 같은 크기 카드 여덟 장 → 큰 단추 둘 + 작은 단추 둘. 수거 이력 · 정산 ·
//     증빙은 아래 메뉴(수거 이력 · 정산·증빙)로 갔습니다. 같은 일로 가는 길이
//     둘이면 병원 담당자는 어느 쪽이 맞는지 고민합니다(0089 와 같은 원칙).
//   · 배출 분석 → 「월간 배출 리포트」 창 안으로. 읽을거리라 첫 화면에서
//     매일 볼 것은 아닙니다.
//   · 최근 활동 → 「최근 요청」·「최근 수거」 두 칸으로 나눴습니다.
//   · 사진 띠(신뢰 띠) · 회사 소개 사진 → 뺐습니다. 매일 쓰는 업무 화면에서
//     회사 소개는 스크롤만 길게 합니다(폰에서 홈이 4,533px 이었습니다).
//
//  ⚠ 「이 병원 것만」은 그대로입니다 — 자료는 서버(RLS)가 이 병원 것만 주고,
//    화면은 그 안에서 고르기만 합니다.
// ─────────────────────────────────────────────────────────────────────────────

const TODO_TONE = {
  info: 'bg-sky-500',
  good: 'bg-emerald-500',
  warn: 'bg-rose-500',
} as const

export function PortalHome() {
  const { data } = useData()
  //  ⚠ 「어느 병원인가」는 한 곳에서 정합니다(lib/portalClient.ts).
  const { client, path } = usePortalClient()
  //  ⚠ 「지금 무슨 창이 열려 있는가」는 주소 뒤(?do=)에 있습니다 —
  //    새로고침해도 창이 살아 있습니다.
  const { open } = usePortalSheet()
  const navigate = useNavigate()

  const s = useMemo(() => (client ? portalSummary(data, client) : null), [data, client])

  //  ⚠ 「다음 수거」는 위 첫 칸이 이미 크게 말합니다. 할 일에 또 두지 않습니다.
  const todos = useMemo(
    () =>
      client && s
        ? portalTodos(data, client, { date: s.nextDate, isEstimate: s.nextIsEstimate }).filter((t) => t.key !== 'next')
        : [],
    [data, client, s],
  )

  //  앞으로 7일 (포털 2차) — 등록된 일정만 칠하고, 수거주기 예상은 따로 표시.
  const week = useMemo(() => (client && s ? weekStrip(data, client, s, today()) : []), [data, client, s])

  //  최근 수거 — **실제로 끝난 것만**(무게가 적힌 것). 예정은 위 첫 칸이 말합니다.
  const recentPickups = useMemo(() => {
    if (!client) return []
    const t = today()
    return collectionHistory(data, client.id, 40)
      .filter((r) => r.amountKg != null && r.date <= t)
      .slice(0, 3)
  }, [data, client])

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
      {/*  ⚠ 폰에서는 위아래로, 넓은 화면(xl)에서는 「다음 수거 | 요청하기」를
           나란히 둡니다 — PC 첫 화면에서 스크롤 없이 둘 다 보입니다. */}
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-2 xl:gap-5">
        <PortalHero client={client} s={s} week={week} />
        <PortalActions
          onUrgent={() => open('urgent')}
          onSupply={() => open('supply')}
          onPickup={() => open('pickup')}
          onAsk={() => open('ask')}
        />
      </div>

      {/*  ── 확인이 필요한 것 ── 없으면 **이 칸 자체가 없습니다.**
           대표님: 「0건이면 영역을 과도하게 크게 보여주지 않는다」. */}
      {todos.length > 0 && (
        <section data-portal-todos className="card overflow-hidden">
          <CardHead title="확인이 필요한 것" icon={ListChecks} />
          <ul className="divide-y divide-navy-50">
            {todos.slice(0, 3).map((t) => {
              const Row = (
                <>
                  <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${TODO_TONE[t.tone]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="t-body block break-keep font-extrabold leading-snug text-navy-900">{t.title}</span>
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

      {/*  ── 최근 요청 · 최근 수거 ──────────────────────────────────────────
           ⚠ 0103 — 두 칸이 차례로 떠오릅니다(0.05초 간격). 움직임 줄이기
             설정에서는 framer 가 알아서 끕니다(App 의 MotionConfig). */}
      <Stagger data-portal-cards className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <StaggerItem>
          <section data-portal-requests data-tour="portal-requests" className="card overflow-hidden">
            <CardHead
              title="최근 요청"
              icon={ClipboardList}
              more={{ label: '요청 내역', onClick: () => navigate(path('requests')), data: 'requests' }}
            />
            {s.allRequests.length === 0 ? (
              <QuietEmpty>최근 요청이 없습니다.</QuietEmpty>
            ) : (
              <ul className="divide-y divide-navy-50">
                {s.allRequests.slice(0, 3).map((r) => (
                  <RequestRow key={r.id} r={r} compact />
                ))}
              </ul>
            )}
          </section>
        </StaggerItem>
        <StaggerItem>
          <section data-portal-recent data-tour="portal-report" className="card overflow-hidden">
            <CardHead
              title="최근 수거"
              icon={CheckCircle2}
              more={{ label: '수거 이력', onClick: () => navigate(path('history')), data: 'history' }}
            />
            {recentPickups.length === 0 ? (
              <QuietEmpty>아직 수거 기록이 없습니다. 첫 수거가 끝나면 여기에 표시됩니다.</QuietEmpty>
            ) : (
              //  포털 2차 — 시간 순서가 보이도록 **세로 줄로 이은 타임라인**.
              <ol className="px-5 py-4">
                {recentPickups.map((r, i) => (
                  <li key={r.id} data-recent-pickup={r.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                    {i < recentPickups.length - 1 && (
                      <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-9 w-0.5 rounded-full bg-navy-100" />
                    )}
                    <span
                      aria-hidden="true"
                      className={`relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${
                        r.handedOver ? 'bg-emerald-100 text-emerald-700' : 'bg-navy-100 text-navy-600'
                      }`}
                    >
                      <Check size={17} strokeWidth={3} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <span className="t-body break-keep font-extrabold text-navy-900">{prettyDate(r.date)}</span>
                        <span className="ml-auto text-[1.15rem] font-extrabold tabular-nums text-navy-900">
                          {weight(r.amountKg ?? 0)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <span className="t-muted break-keep">{r.wasteType}</span>
                        <span
                          className={`pill ml-auto ring-1 ${
                            r.handedOver
                              ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                              : 'bg-navy-50 text-navy-700 ring-navy-100'
                          }`}
                        >
                          {/*  ⚠ 「처리 완료」라고 쓰지 않습니다 — 저희가 아는 것은
                               처리장에 **넘겼다**까지입니다. 수거 이력과 같은 말을 씁니다. */}
                          {r.handedOver ? '인계 완료' : '수거 완료'}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </StaggerItem>
      </Stagger>

      {/*  ── 비원미래가 보낸 제안 ── */}
      {(s.pendingProposals.length > 0 || s.acceptedProposals.length > 0) && <ProposalList s={s} />}

      {/*  처음 오신 분께만 — 사용 방법 둘러보기. 한 번 보시면 사라집니다. */}
      <TourBanner tourId="client" />

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
