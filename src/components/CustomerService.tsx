import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Handshake, Inbox, Smartphone } from 'lucide-react'
import type { AppData } from '../types'
import { customerServiceStats } from '../lib/portal'
import { openRequests } from '../lib/ops'
import { won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 서비스 현황 (대시보드용)
//
//  이번 확장의 핵심 — "병원이 실제로 쓰고 있는가"를 실제 기록으로만 보여줍니다.
//  숫자를 만들어 내지 않으며, 아직 없으면 무엇을 하면 되는지 안내합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function CustomerServiceCard({ data }: { data: AppData }) {
  const s = customerServiceStats(data)
  const open = openRequests(data)
  const urgent = open.filter((r) => r.urgent).length
  const started = s.requestsTotal > 0 || s.proposalsShared > 0

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-6">
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">병원 고객 서비스</p>
        <Link to="/requests" className="t-btn flex shrink-0 items-center gap-1 text-teal-700 hover:underline">
          요청 처리 <ChevronRight size={16} />
        </Link>
      </div>

      {!started ? (
        <div className="border-t border-navy-100 px-5 py-5 sm:px-6">
          <p className="t-body break-keep leading-snug text-navy-600">
            병원 담당자 계정을 만들면 병원이 직접 수거·소모품을 요청하고 월간 리포트를 확인할 수 있습니다.
            여기에는 실제로 오간 요청과 제안만 집계됩니다.
          </p>
          <Link to="/settings" className="btn-navy mt-4 inline-flex">
            병원 계정 만들기 안내
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border-t border-navy-100 bg-navy-100 lg:grid-cols-4">
            {[
              { icon: Inbox, label: '처리 대기 요청', value: `${s.requestsOpen}건`, tone: s.requestsOpen > 0 },
              { icon: Smartphone, label: '병원 직접 등록', value: `${s.portalRatio}%`, tone: s.portalRatio > 0 },
              {
                icon: Handshake,
                label: '제안 → 수락',
                value: `${s.proposalsAccepted} / ${s.proposalsShared}건`,
                tone: s.proposalsAccepted > 0,
              },
              {
                icon: AlertTriangle,
                label: '수락 건 실제 매출',
                value: s.acceptedRevenue > 0 ? won(s.acceptedRevenue) : '미입력',
                tone: s.acceptedRevenue > 0,
              },
            ].map((x) => {
              const Icon = x.icon
              return (
                <div key={x.label} className="bg-white px-5 py-4">
                  <p className="t-muted flex items-center gap-1.5 break-keep">
                    <Icon size={14} className="shrink-0" strokeWidth={2.4} /> {x.label}
                  </p>
                  <p className={`t-kpi-sm mt-1.5 break-keep ${x.tone ? 'text-navy-900' : 'text-navy-300'}`}>
                    {x.value}
                  </p>
                </div>
              )
            })}
          </div>

          {open.length > 0 && (
            <div className="divide-y divide-navy-50 border-t border-navy-100">
              {open.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  to="/requests"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 transition hover:bg-navy-50 sm:px-6"
                >
                  <span className="t-body min-w-0 break-keep font-extrabold text-navy-900">{r.clientName}</span>
                  <span className="pill bg-navy-50 text-navy-600">{r.type}</span>
                  {r.urgent && <span className="pill bg-rose-50 text-rose-600">긴급</span>}
                  <span className="t-muted min-w-0 flex-1 break-keep">{r.content}</span>
                  <ChevronRight size={17} className="shrink-0 text-navy-300" />
                </Link>
              ))}
            </div>
          )}

          {urgent > 0 && (
            <p className="t-muted break-keep border-t border-navy-100 px-5 py-3 text-rose-600 sm:px-6">
              긴급 요청 {urgent}건이 아직 처리되지 않았습니다.
            </p>
          )}
        </>
      )}
    </section>
  )
}
