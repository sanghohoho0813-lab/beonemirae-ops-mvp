import { useMemo, useState } from 'react'
import { ClipboardList, Hospital, PackagePlus, Siren } from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { usePortalSheet, useRequestDetail } from '../lib/portalSheet'
import { requestsForClient } from '../lib/ops'
import { PageShell, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { PortalEmpty, PortalPageHead, PortalStickyBar, RequestCard } from '../components/portal/PortalUi'

// ─────────────────────────────────────────────────────────────────────────────
// 요청 내역 (포털 1차 고도화)
//
//  「지난번에 요청드린 건 어떻게 됐나요」를 전화로 묻지 않도록, 보낸 요청이
//  **지금 어디까지 왔는지**(접수 → 확인 중 → 일정 확정 → 처리 완료)와
//  비원미래 회신을 한곳에 모읍니다.
//
//  ⚠ 새 표를 만들지 않았습니다. 홈 「최근 요청」과 **같은 기록**
//    (client_requests)을 전부 보여 줄 뿐입니다. 서버(RLS)가 이 병원 것만 줍니다.
//  ⚠ 전화로 말씀하셔서 비원미래가 대신 올린 요청도 여기 같이 나옵니다.
//    앱으로만 요청하시라는 화면이 아닙니다 — 어떻게 요청하셨든 진행 상태는
//    여기서 보실 수 있다는 화면입니다.
//
//  포털 3차 — 요청마다 큰 카드 + 진행 막대를 그리던 것을 **활동 목록 한 줄**로
//    바꿨습니다. 목록에는 지금 상태 칩만, 접수 → 처리 완료 단계와 담당자 안내는
//    줄을 누르면 올라오는 요청 상세에서 봅니다.
//  포털 3차 시안(적용 · 대표님 「맘에 든다」) — 다시 **주문 내역처럼 요청 하나 = 카드 하나**
//    (상태 알약 · 얇은 단계 막대 · 비원미래 회신). 새 요청 단추는 폰에서 아래에 늘 떠 있습니다.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'open' | 'done'

export function PortalRequests() {
  const { data } = useData()
  const { client } = usePortalClient()
  const { open } = usePortalSheet()
  const detail = useRequestDetail()
  const [filter, setFilter] = useState<Filter>('all')

  const all = useMemo(() => (client ? requestsForClient(data, client.id) : []), [data, client])
  const openCount = all.filter((r) => r.status !== '처리 완료').length
  const rows = all.filter((r) =>
    filter === 'open' ? r.status !== '처리 완료' : filter === 'done' ? r.status === '처리 완료' : true,
  )

  if (!client) {
    return (
      <PageShell>
        <LoadGate
          loadingTitle="병원 정보를 불러오는 중입니다"
          empty={<EmptyState icon={Hospital} title="연결된 병원 정보를 찾을 수 없습니다" />}
        />
      </PageShell>
    )
  }

  const FILTERS: { v: Filter; l: string; n: number }[] = [
    { v: 'all', l: '전체', n: all.length },
    { v: 'open', l: '진행 중', n: openCount },
    { v: 'done', l: '완료', n: all.length - openCount },
  ]

  const filters =
    all.length > 0 ? (
      //  포털 4차 — 흔한 앱의 거르기 칩(알약 셋). 고른 것은 짙은 면입니다.
      <div role="group" aria-label="요청 상태로 보기" data-req-filters className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            type="button"
            data-req-filter={f.v}
            aria-pressed={filter === f.v}
            onClick={() => setFilter(f.v)}
            className={`p-chip ${filter === f.v ? 'p-chip-on' : ''}`}
          >
            <span className="break-keep">{f.l}</span>
            <span
              className={`min-w-[1.6rem] rounded-full px-1.5 text-center tabular-nums ${
                filter === f.v ? 'bg-white/15 text-white' : 'bg-navy-100 text-navy-700'
              }`}
            >
              {f.n}
            </span>
          </button>
        ))}
      </div>
    ) : null

  return (
    <PageShell className="!space-y-4">
      {/*  요청이 하나도 없으면 거르기 단추를 안 둡니다 — 「0건」 셋은 소음입니다. */}
      <PortalPageHead title="요청 내역" sub="전화로 말씀하신 요청도 함께 표시됩니다.">
        {filters}
      </PortalPageHead>

      {rows.length === 0 ? (
        <div className="p-card">
        <LoadGate
          loadingTitle="요청 내역을 불러오는 중입니다"
          empty={
            <PortalEmpty
              icon={ClipboardList}
              title={
                all.length === 0
                  ? '아직 요청하신 내역이 없습니다'
                  : filter === 'open'
                    ? '진행 중인 요청이 없습니다'
                    : '처리 완료된 요청이 없습니다'
              }
              subtitle={
                all.length === 0
                  ? '아래 단추로 요청하시면 처리 상태가 여기에 표시됩니다.'
                  : '「전체」를 누르면 모든 요청을 보실 수 있습니다.'
              }
            />
          }
        />
        </div>
      ) : (
        <ul data-req-list className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} onOpen={() => detail.open(r.id)} />
          ))}
        </ul>
      )}

      {/*  새 요청 — 여기서 바로. 홈까지 돌아가지 않으셔도 됩니다. */}
      <PortalStickyBar>
        <button
          type="button"
          data-req-new="urgent"
          onClick={() => open('urgent')}
          className="flex min-h-[3.5rem] shrink-0 items-center justify-center gap-2 rounded-[16px] bg-rose-50 px-4 text-[1.05rem] font-extrabold text-rose-700 transition hover:bg-rose-100 sm:px-6"
        >
          <Siren size={20} strokeWidth={2.4} aria-hidden="true" className="shrink-0" /> <span className="break-keep">긴급수거</span>
        </button>
        <button
          type="button"
          data-req-new="supply"
          onClick={() => open('supply')}
          className="flex min-h-[3.5rem] flex-1 items-center justify-center gap-2 rounded-[16px] bg-teal-600 px-3 text-[1.05rem] font-extrabold text-white transition hover:bg-teal-700 sm:flex-none sm:px-6"
        >
          <PackagePlus size={20} strokeWidth={2.4} aria-hidden="true" className="shrink-0" /> <span className="break-keep">자재·용기 요청</span>
        </button>
      </PortalStickyBar>
    </PageShell>
  )
}
