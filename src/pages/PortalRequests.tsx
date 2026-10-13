import { useMemo, useState } from 'react'
import { ClipboardList, Hospital, PackagePlus, Siren } from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { usePortalSheet } from '../lib/portalSheet'
import { requestsForClient } from '../lib/ops'
import { PageShell, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { RequestRow } from '../components/portal/PortalUi'

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
// ─────────────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'open' | 'done'

export function PortalRequests() {
  const { data } = useData()
  const { client } = usePortalClient()
  const { open } = usePortalSheet()
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
    { v: 'done', l: '처리 완료', n: all.length - openCount },
  ]

  return (
    <PageShell>
      <div>
        <h1 className="t-page text-navy-900">요청 내역</h1>
        <p className="t-body mt-2.5 break-keep text-navy-500">
          보내신 요청이 지금 어디까지 진행됐는지 보실 수 있습니다. 전화로 말씀하신 요청도 함께 표시됩니다.
        </p>
      </div>

      {/*  새 요청 — 여기서 바로. 홈까지 돌아가지 않으셔도 됩니다. */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          data-req-new="urgent"
          onClick={() => open('urgent')}
          className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[1.05rem] font-extrabold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-50"
        >
          <Siren size={20} strokeWidth={2.4} aria-hidden="true" /> 긴급수거 요청
        </button>
        <button
          type="button"
          data-req-new="supply"
          onClick={() => open('supply')}
          className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[1.05rem] font-extrabold text-teal-800 ring-1 ring-teal-200 transition hover:bg-teal-50"
        >
          <PackagePlus size={20} strokeWidth={2.4} aria-hidden="true" /> 자재·용기 요청
        </button>
      </div>

      {/*  요청이 하나도 없으면 거르기 단추를 안 둡니다 — 「0건」 셋은 소음입니다. */}
      {all.length > 0 && (
      <div role="group" aria-label="요청 상태로 보기" data-req-filters className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            type="button"
            data-req-filter={f.v}
            aria-pressed={filter === f.v}
            onClick={() => setFilter(f.v)}
            className={`min-h-[2.75rem] rounded-full px-4 py-2 text-[1.02rem] font-bold transition ${
              filter === f.v ? 'bg-navy-900 text-white' : 'bg-white text-navy-700 ring-1 ring-navy-200 hover:bg-navy-50'
            }`}
          >
            {f.l} {f.n}건
          </button>
        ))}
      </div>
      )}

      {rows.length === 0 ? (
        <LoadGate
          loadingTitle="요청 내역을 불러오는 중입니다"
          empty={
            <EmptyState
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
                  ? '위 단추로 요청하시면 처리 상태가 여기에 표시됩니다.'
                  : '「전체」를 누르면 모든 요청을 보실 수 있습니다.'
              }
            />
          }
        />
      ) : (
        <ul data-req-list className="card divide-y divide-navy-50 overflow-hidden">
          {rows.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </PageShell>
  )
}
