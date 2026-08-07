import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Handshake,
  Inbox,
  Send,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { AppData } from '../types'
import { customerServiceStats } from '../lib/portal'
import { openRequests } from '../lib/ops'
import { REQUEST_REVENUE, REQUEST_TONE, STATUS_TONE, TONE, type Tone } from '../lib/tone'
import { won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 서비스 → 추가 매출 (대시보드용)
//
//  이 카드 하나로 "병원의 행동이 어떻게 매출이 되는가"에 답합니다.
//
//    병원 요청  →  비원미래 처리  →  데이터 기반 제안  →  병원 수락  →  실제 매출
//
//  숫자는 전부 실제 기록에서만 나옵니다. 아직 없으면 만들지 않고,
//  무엇을 하면 되는지 안내로 대체합니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Stage {
  icon: LucideIcon
  label: string
  value: string
  sub: string
  tone: Tone
  on: boolean
}

export function CustomerServiceCard({ data }: { data: AppData }) {
  const s = customerServiceStats(data)
  const open = openRequests(data)
  const started = s.requestsTotal > 0 || s.proposalsShared > 0

  const stages: Stage[] = [
    {
      icon: Inbox,
      label: '병원 요청',
      value: `${s.requestsTotal}건`,
      sub: `병원 직접 ${s.portalRatio}%`,
      tone: 'violet',
      on: s.requestsTotal > 0,
    },
    {
      icon: CheckCircle2,
      label: '비원미래 처리',
      value: `${s.requestsDone}건`,
      sub: s.requestsOpen > 0 ? `대기 ${s.requestsOpen}건` : '대기 없음',
      tone: 'sky',
      on: s.requestsDone > 0,
    },
    {
      icon: Send,
      label: '데이터 기반 제안',
      value: `${s.proposalsShared}건`,
      sub: '병원에 전달',
      tone: 'orange',
      on: s.proposalsShared > 0,
    },
    {
      icon: Handshake,
      label: '병원 수락',
      value: `${s.proposalsAccepted}건`,
      sub: s.proposalsShared > 0 ? `수락률 ${Math.round((s.proposalsAccepted / s.proposalsShared) * 100)}%` : '—',
      tone: 'emerald',
      on: s.proposalsAccepted > 0,
    },
    {
      icon: Wallet,
      label: '실제 추가 매출',
      value: s.acceptedRevenue > 0 ? won(s.acceptedRevenue) : '미입력',
      sub: '수거료 외 매출',
      tone: 'teal',
      on: s.acceptedRevenue > 0,
    },
  ]

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-6">
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">병원의 행동이 매출이 되는 흐름</p>
        <Link to="/requests" className="t-btn flex shrink-0 items-center gap-1 text-teal-700 hover:underline">
          요청 처리 <ChevronRight size={16} />
        </Link>
      </div>

      {!started ? (
        <div className="border-t border-navy-100 px-5 py-5 sm:px-6">
          <p className="t-body break-keep leading-snug text-navy-600">
            병원 담당자 계정을 만들면 병원이 직접 수거·소모품을 요청하고 월간 리포트를 확인합니다. 그 요청과 제안이
            여기에 실제 기록으로 쌓입니다.
          </p>
          <Link to="/settings" className="btn-navy mt-4 inline-flex">
            병원 계정 만들기 안내
          </Link>
        </div>
      ) : (
        <>
          {/* 5단계 흐름 — 색이 왼쪽(병원)에서 오른쪽(매출)으로 이어집니다 */}
          <div className="grid gap-px border-t border-navy-100 bg-navy-100 sm:grid-cols-2 xl:grid-cols-5">
            {stages.map((x, i) => {
              const Icon = x.icon
              return (
                <div
                  key={x.label}
                  // 좁은 폭에서는 2열로 접히므로, 마지막 칸이 빈 칸을 남기지 않게 한 줄을 채웁니다
                  className={`kpi-box flex flex-col bg-white px-5 py-4 xl:px-4 2xl:px-5 ${
                    i === stages.length - 1 ? 'sm:col-span-2 xl:col-span-1' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        x.on ? TONE[x.tone].tile : 'bg-navy-50 text-navy-300'
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.3} />
                    </span>
                    {i < stages.length - 1 && (
                      <ArrowRight size={17} className="ml-auto hidden shrink-0 text-navy-200 xl:block" strokeWidth={2.6} />
                    )}
                  </div>
                  <p className="t-label mt-2.5 break-keep text-navy-500">{x.label}</p>
                  {/* 칸 폭에 맞춰 자동 축소 — '미입력'·'123만원' 같은 값이 칸 밖으로 나가지 않게 */}
                  <p className={`t-stat mt-1 ${x.on ? 'text-navy-900' : 'text-navy-300'}`}>{x.value}</p>
                  <p className="t-muted mt-auto break-keep pt-1">{x.sub}</p>
                </div>
              )
            })}
          </div>

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
                      <span className={`pill ${TONE[REQUEST_TONE[r.type]].chip}`}>{r.type}</span>
                      <span className={`pill ${TONE[STATUS_TONE[r.status]].chip}`}>{r.status}</span>
                    </div>
                    <p className="t-muted mt-1 break-keep">
                      {r.content.length > 40 ? r.content.slice(0, 40) + '…' : r.content}
                      <span className="ml-1.5 font-bold text-navy-500">· {REQUEST_REVENUE[r.type]}</span>
                    </p>
                  </div>
                  <ChevronRight size={17} className="shrink-0 text-navy-300" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
