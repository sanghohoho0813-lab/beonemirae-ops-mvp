import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Hospital, Send } from 'lucide-react'
import { REQUEST_KIND_LABEL, type AppData } from '../types'
import { serviceConversion } from '../lib/portal'
import { REQUEST_TONE, STATUS_TONE, TONE } from '../lib/tone'
import { openRequests } from '../lib/ops'
import { hideRequests } from '../lib/pilotMode'
import { allNextActions } from '../lib/insights'
import { wonShort } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 서비스 전환 (대시보드용)
//
//  이 카드 하나로 "병원의 행동이 어떻게 매출이 되는가"에 답합니다.
//  심사자가 숫자를 공부해야 이해하는 화면은 실패이므로, 규칙을 셋으로 줄였습니다.
//
//   1) 큰 숫자 네 개와 화살표만 둡니다 — 요청 → 처리 → 수락 → 실제 매출
//   2) 유형별로 한 줄씩 — 어떤 요청이 어떤 매출이 되는지
//   3) 비어 있는 칸에는 설명이 아니라 '지금 할 일' 버튼을 둡니다
//
//  숫자는 전부 실제 기록에서만 나옵니다. 예상 매출은 여기에 섞지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Node {
  label: string
  value: string
  sub: string
  on: boolean
  /** 이 칸이 비어 있을 때 무엇을 하면 되는지 */
  todo?: { label: string; to: string }
}

export function CustomerServiceCard({ data, demo = false }: { data: AppData; demo?: boolean }) {
  const c = serviceConversion(data)
  //  Pilot 동안 병원 요청은 안 씁니다 (0080)
  const open = hideRequests() ? [] : openRequests(data)
  // 다음 할 일이 정확히 그 화면으로 가도록, 대상 거래처를 미리 찾아 둡니다.
  // (제안 전달과 매출 입력은 모두 거래처 상세에 있습니다)
  //
  // 병원 화면은 로그인한 병원 하나만 보여 주므로, 같은 조건이면 그 병원을 먼저
  // 고릅니다. 그래야 "제안 전달 → 병원 화면에서 수락"이 한 줄로 이어집니다.
  const portalClientId = data.clients[0]?.id
  const actions = allNextActions(data)
  const firstLeadClient =
    (actions.find((a) => a.clientId === portalClientId) ?? actions[0])?.clientId ?? null
  const pendingRevenueLeads = (data.leads ?? []).filter((l) => l.stage === '수락' && l.actualRevenue == null)
  const revenuePendingClient =
    (pendingRevenueLeads.find((l) => l.clientId === portalClientId) ?? pendingRevenueLeads[0])?.clientId ??
    firstLeadClient

  const nodes: Node[] = [
    {
      label: '병원 요청',
      value: `${c.requested}건`,
      sub: '이번 달 접수',
      on: c.requested > 0,
      todo: { label: '병원 계정 만들기', to: '/settings' },
    },
    {
      label: '처리 완료',
      value: `${c.handled}건`,
      sub: c.requested > c.handled ? `대기 ${c.requested - c.handled}건` : '대기 없음',
      on: c.handled > 0,
      todo: { label: '요청 처리하기', to: '/requests' },
    },
    {
      label: '병원 수락',
      value: `${c.accepted}건`,
      sub: c.proposed > 0 ? `제안 ${c.proposed}건 중` : '제안 전달 전',
      on: c.accepted > 0,
      // 제안을 아직 안 보냈으면 보내는 화면으로, 보냈으면 병원이 누르는 화면으로.
      // 다음 할 일이 늘 '지금 눌러야 할 그 화면'을 가리키게 합니다.
      todo:
        c.proposed > 0
          ? { label: '병원 화면에서 수락', to: '/portal' }
          : { label: '제안 전달하기', to: firstLeadClient ? `/clients/${firstLeadClient}` : '/clients' },
    },
    {
      label: '실제 추가 매출',
      value: c.revenue > 0 ? wonShort(c.revenue) : '—',
      sub: c.revenuePending > 0 ? `${c.revenuePending}건 매출 미입력` : '수거료 외',
      on: c.revenue > 0,
      todo: { label: '매출 입력하기', to: revenuePendingClient ? `/clients/${revenuePendingClient}` : '/clients' },
    },
  ]

  // 왼쪽부터 처음으로 비어 있는 칸 = 지금 해야 할 일
  const nextTodo = nodes.find((n) => !n.on)?.todo

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-6">
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">병원의 행동이 매출이 되는 흐름</p>
        {demo && <span className="pill shrink-0 bg-amber-50 text-amber-700">시연 데이터</span>}
        {/* 시연에서 "병원은 이 화면을 봅니다"를 한 번에 보여주기 위한 바로가기 */}
        <Link to="/portal" className="t-btn flex shrink-0 items-center gap-1 text-navy-500 hover:underline">
          <Hospital size={16} strokeWidth={2.4} /> 병원 화면
        </Link>
        <Link to="/requests" className="t-btn flex shrink-0 items-center gap-1 text-teal-700 hover:underline">
          요청 처리 <ChevronRight size={16} />
        </Link>
      </div>

      {/* ① 큰 숫자 네 개 — 화살표로 이어 읽습니다 */}
      <div
        data-tour="customer"
        className="flex gap-px overflow-x-auto border-t border-navy-100 bg-navy-100 lg:grid lg:grid-cols-4 lg:overflow-visible"
      >
        {nodes.map((n, i) => (
          <div
            key={n.label}
            className="kpi-box relative flex w-[10.5rem] shrink-0 flex-col bg-white px-4 py-4 sm:w-[12rem] lg:w-auto 2xl:px-5"
          >
            {i < nodes.length - 1 && (
              <ArrowRight
                size={16}
                strokeWidth={2.6}
                className="pointer-events-none absolute right-1.5 top-4 text-navy-200"
              />
            )}
            <p className="t-label break-keep text-navy-500">{n.label}</p>
            {/* 칸 폭에 맞춰 자동 축소 — '123만원' 같은 값이 칸 밖으로 나가지 않게 */}
            <p className={`t-stat mt-1.5 ${n.on ? 'text-navy-900' : 'text-navy-300'}`}>{n.value}</p>
            <p className="t-muted mt-auto break-keep pt-1.5">{n.sub}</p>
          </div>
        ))}
      </div>

      {/* ② 유형별 한 줄 — 어떤 요청이 어떤 매출이 되었는가 */}
      {c.started && (
        <div className="divide-y divide-navy-50 border-t border-navy-100">
          {c.rows
            .filter((r) => r.requested > 0 || r.revenue > 0)
            .map((r) => (
              <div key={r.label} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 sm:px-6">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[REQUEST_TONE[r.kind]].dot}`} />
                <span className="t-body min-w-0 flex-1 break-keep font-extrabold text-navy-900">{r.label}</span>
                <span className="t-body shrink-0 whitespace-nowrap text-navy-500">
                  요청 {r.requested}건 <span className="text-navy-300">→</span> 처리 {r.handled}건{' '}
                  <span className="text-navy-300">→</span>
                </span>
                <span
                  className={`t-body shrink-0 whitespace-nowrap font-extrabold ${
                    r.revenue > 0 ? 'text-emerald-600' : 'text-navy-300'
                  }`}
                >
                  {r.revenue > 0 ? wonShort(r.revenue) : r.revenuePending > 0 ? '매출 미입력' : '—'}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* ③ 비어 있는 칸이 있으면 설명 대신 버튼 — 시연에서도 그 자리에서 이어집니다 */}
      {nextTodo && (
        <Link
          to={nextTodo.to}
          className="flex w-full items-center justify-center gap-1.5 border-t border-navy-100 bg-teal-50 py-3.5 text-[1.08rem] font-extrabold text-teal-700 transition hover:bg-teal-50"
        >
          <Send size={17} strokeWidth={2.5} /> 다음 할 일 · {nextTodo.label}
          <ChevronRight size={17} />
        </Link>
      )}

      {/* 지금 들어와 있는 요청 — 각 요청이 어떤 매출로 이어지는지 함께 표시 */}
      {open.length > 0 && (
        <div className="divide-y divide-navy-50 border-t border-navy-100">
          {open.slice(0, 3).map((r) => (
            <Link
              key={r.id}
              to="/requests"
              className="flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-navy-50 sm:px-6"
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[REQUEST_TONE[r.type]].dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="t-body break-keep font-extrabold text-navy-900">{r.clientName}</span>
                  <span className={`pill ${TONE[REQUEST_TONE[r.type]].chip}`}>{REQUEST_KIND_LABEL[r.type]}</span>
                  <span className={`pill ${TONE[STATUS_TONE[r.status]].chip}`}>{r.status}</span>
                </div>
                <p className="t-muted mt-1 break-keep">
                  {r.content.length > 40 ? r.content.slice(0, 40) + '…' : r.content}
                </p>
              </div>
              <ChevronRight size={17} className="shrink-0 text-navy-300" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
