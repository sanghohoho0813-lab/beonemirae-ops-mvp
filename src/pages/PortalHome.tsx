import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CLIENT_TEL } from '../lib/brand'
import { Check, CheckCircle2, Hospital, Sparkles } from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { usePortalSheet, useRequestDetail } from '../lib/portalSheet'
import { PageShell, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { TourBanner } from '../components/TourEntry'
import { portalSummary } from '../lib/portal'
import { portalTodos } from '../lib/portalActivity'
import { collectionHistory } from '../lib/ops'
import { prettyDate, today, weight, won } from '../lib/format'
import { PortalHero, PortalActions } from '../components/PortalHero'
import { PortalFooter } from '../components/PortalFooter'
import { FeedRow, QuietEmpty, SectionHead } from '../components/portal/PortalUi'
import { Stagger, StaggerItem } from '../components/motion'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 홈 (포털 3차 — 「앱 화면」)
//
//  대표님 브리프: 「B2B SaaS 카드형 대시보드 느낌을 줄이고 실제 모바일 앱에
//  가까운 UI로 — 카드는 다음 수거 · 빠른 요청 · 꼭 강조할 상태에만」.
//
//  ── 화면 순서 ───────────────────────────────────────────────────────────
//   1) 다음 수거            짙은 칸 하나 (화면에서 유일한 「카드」)
//   2) 빠른 요청            긴급(빨강) · 자재(파랑) 면 + 작은 둘
//   3) 확인이 필요한 것     ← 있을 때만, 목록
//   4) 최근 요청            활동 목록 다섯 줄 — 누르면 요청 상세
//   5) 최근 수거            날짜 · 품목 · 무게 세 줄
//   6) 우리 병원 등록 정보   평평한 목록
//
//   PC(lg 이상): 왼쪽 = 다음 수거 + 최근 요청 · 오른쪽 = 빠른 요청 + 최근 수거.
//   관리자 대시보드처럼 통계 칸을 늘어놓지 않습니다.
//
//  ⚠ 칸을 나누는 것은 상자가 아니라 **제목 · 여백 · 구분선**입니다.
//  ⚠ 「이 병원 것만」은 그대로 — 서버(RLS)가 이 병원 것만 주고 화면은 고를 뿐.
// ─────────────────────────────────────────────────────────────────────────────

const TODO_TONE = {
  info: 'bg-teal-500',
  good: 'bg-emerald-500',
  warn: 'bg-rose-500',
} as const

//  위 두 칸과 아래 두 칸이 **같은 세로선**에 서도록 같은 틀을 씁니다.
const COLS = 'grid gap-x-12 lg:grid-cols-2'

export function PortalHome() {
  const { data } = useData()
  const { client, path } = usePortalClient()
  const { open } = usePortalSheet()
  const detail = useRequestDetail()
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

  //  최근 수거 — **실제로 끝난 것만**(무게가 적힌 것).
  const recentPickups = useMemo(() => {
    if (!client) return []
    const t = today()
    return collectionHistory(data, client.id, 40)
      .filter((r) => r.amountKg != null && r.date <= t)
      .slice(0, 3)
  }, [data, client])

  if (!client || !s) {
    //  ⚠ 자료가 오기 전에 「없다」고 하면 연결된 병원도 전화를 겁니다.
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
    <div className="space-y-9 sm:space-y-10">
      <div className={`${COLS} gap-y-4`}>
        <PortalHero client={client} s={s} />
        <PortalActions
          onUrgent={() => open('urgent')}
          onSupply={() => open('supply')}
          onPickup={() => open('pickup')}
          onAsk={() => open('ask')}
        />
      </div>

      {/*  ── 확인이 필요한 것 ── 없으면 **이 칸 자체가 없습니다**(0089). */}
      {todos.length > 0 && (
        <section data-portal-todos>
          <SectionHead title="확인이 필요한 것" />
          <ul className="p-list">
            {todos.slice(0, 3).map((t) => {
              const Row = (
                <>
                  <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${TODO_TONE[t.tone]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="p-body block font-extrabold">{t.title}</span>
                    <span className="p-sub mt-0.5 block">{t.detail}</span>
                  </span>
                </>
              )
              return (
                <li key={t.key} data-todo={t.key}>
                  {t.sheet ? (
                    <button
                      onClick={() => open(t.sheet!)}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-xl px-2 py-3.5 text-left transition hover:bg-navy-50"
                    >
                      {Row}
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 py-3.5">{Row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/*  ── 최근 요청 · 최근 수거 ── 상자 없이, 제목과 구분선으로.
           0103 — 두 칸이 차례로 떠오릅니다(움직임 줄이기 설정에서는 꺼짐). */}
      <Stagger data-portal-cards className={`${COLS} items-start gap-y-9`}>
        <StaggerItem>
          <section data-portal-requests data-tour="portal-requests" className="scroll-mt-4">
            <SectionHead
              title="최근 요청"
              more={{ label: '전체 보기', onClick: () => navigate(path('requests')), data: 'requests' }}
            />
            {s.allRequests.length === 0 ? (
              <QuietEmpty>최근 요청이 없습니다.</QuietEmpty>
            ) : (
              <ul className="p-list">
                {s.allRequests.slice(0, 5).map((r) => (
                  <FeedRow key={r.id} r={r} onOpen={() => detail.open(r.id)} />
                ))}
              </ul>
            )}
          </section>
        </StaggerItem>
        <StaggerItem>
          <section data-portal-recent data-tour="portal-report">
            <SectionHead
              title="최근 수거"
              more={{ label: '수거 이력', onClick: () => navigate(path('history')), data: 'history' }}
            />
            {recentPickups.length === 0 ? (
              <QuietEmpty>아직 수거 기록이 없습니다. 첫 수거가 끝나면 여기에 표시됩니다.</QuietEmpty>
            ) : (
              //  ⚠ 끝난 수거라 「완료」 배지를 줄마다 달지 않습니다 — 작은 체크 하나.
              //    처리장에 아직 안 넘어간 것만 글자로 적습니다.
              <ul className="p-list">
                {recentPickups.map((r) => (
                  <li key={r.id} data-recent-pickup={r.id} className="flex items-center gap-3.5 py-3.5">
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        r.handedOver ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-50 text-navy-500'
                      }`}
                    >
                      <Check size={17} strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="p-body block font-extrabold">{prettyDate(r.date)}</span>
                      <span className="p-sub mt-0.5 block">
                        {r.wasteType}
                        {!r.handedOver && ' · 처리장 인계 전'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[1.2rem] font-extrabold tabular-nums text-navy-900">
                      {weight(r.amountKg ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </StaggerItem>
      </Stagger>

      {/*  ── 비원미래가 보낸 제안 ── */}
      {(s.pendingProposals.length > 0 || s.acceptedProposals.length > 0) && <ProposalList s={s} />}

      {/*  처음 오신 분께만 — 사용 방법 둘러보기. 한 번 보시면 사라집니다. */}
      <TourBanner tourId="client" />

      <PortalFooter client={client} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 비원미래가 보낸 제안 — 병원이 **누르면 수락**됩니다
// ─────────────────────────────────────────────────────────────────────────────

function ProposalList({ s }: { s: ReturnType<typeof portalSummary> }) {
  const { respondProposal } = useData()
  return (
    <section data-portal-proposals>
      <SectionHead title="비원미래가 제안드립니다" />
      <p className="p-sub -mt-1 mb-3">우리 병원 데이터 기준</p>
      {/*  ⚠ 답을 기다리는 제안만 면 하나로 강조합니다(누르면 바로 반영되는 일).
           수락한 것은 목록 한 줄입니다. */}
      <div className="space-y-3">
        {s.pendingProposals.map((l) => (
          <div key={l.id} className="rounded-[18px] bg-navy-50 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-teal-700">
                <Sparkles size={20} strokeWidth={2.3} />
              </span>
              <p className="p-body min-w-0 flex-1 break-keep font-extrabold">{l.title}</p>
              {l.estValue > 0 && <span className="p-sub shrink-0 font-bold">예상 {won(l.estValue)}</span>}
            </div>
            {l.clientMessage && <p className="p-body mt-3 break-keep text-navy-700">{l.clientMessage}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => respondProposal(l.id, true)} className="btn-primary flex-1 shadow-none">
                <Check size={18} strokeWidth={2.6} /> 수락하겠습니다
              </button>
              <button onClick={() => respondProposal(l.id, false)} className="btn-ghost flex-1">
                나중에 검토
              </button>
            </div>
          </div>
        ))}
      </div>
      {s.acceptedProposals.length > 0 && (
        <ul className="p-list">
          {s.acceptedProposals.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-3.5">
              <CheckCircle2 size={19} aria-hidden="true" className="shrink-0 text-emerald-600" strokeWidth={2.4} />
              <p className="p-body min-w-0 flex-1 break-keep font-bold">{l.title}</p>
              <span className="p-sub shrink-0 font-bold text-emerald-700">수락함</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
