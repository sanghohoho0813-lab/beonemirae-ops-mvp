import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileBarChart, Search, ChevronRight, Building2, Scale, Users, TrendingUp, Gauge } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, KpiCard, EmptyState } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { MonthlyReportView } from '../components/MonthlyReport'
import { clientMonthlyReport } from '../lib/insights'
import { thisMonth } from '../lib/format'
import { weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 운영 리포트 (/reports)
//  병원별 월간 운영 리포트 — 수거량·횟수·유형·자재·특이사항을 한 장으로 정리해
//  병원 담당자에게 제공할 수 있는 형태로 보여줍니다. (PDF·메일 발송은 개발 예정)
// ─────────────────────────────────────────────────────────────────────────────

export function Reports() {
  const { data } = useData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const month = thisMonth()

  const reports = useMemo(
    () => data.clients.map((c) => clientMonthlyReport(data, c, month)),
    [data, month],
  )

  const selectedId = params.get('client') ?? reports[0]?.client.id ?? ''
  const selected = reports.find((r) => r.client.id === selectedId) ?? reports[0]

  const filtered = q.trim()
    ? reports.filter((r) => r.client.name.toLowerCase().includes(q.trim().toLowerCase()))
    : reports

  // 이번 달 전체 요약
  const totalKg = reports.reduce((s, r) => s + r.totalKg, 0)
  const totalVisits = reports.reduce((s, r) => s + r.visits, 0)
  const activeClients = reports.filter((r) => r.visits > 0).length
  const growing = reports.filter((r) => r.changePct >= 15).length

  if (reports.length === 0) {
    return (
      <PageShell>
        <PageHeader title="운영 리포트" subtitle="병원별 월간 운영 리포트" />
        <EmptyState icon="📄" title="거래처가 없습니다" subtitle="거래처를 등록하면 월간 리포트가 생성됩니다." />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="운영 리포트"
        subtitle={`${month.replace('-', '년 ')}월 · 병원별 월간 운영 리포트`}
        action={
          <button onClick={() => navigate('/performance')} className="btn-ghost shrink-0">
            <Gauge size={17} strokeWidth={2.4} /> AX 도입 성과
          </button>
        }
      />

      {/* 이번 달 리포트 요약 */}
      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <KpiCard icon={Scale} label="이번 달 총 수거량" value={weight(totalKg)} tone="teal" />
        <KpiCard icon={FileBarChart} label="수거 횟수" value={totalVisits} unit="회" tone="navy" />
        <KpiCard icon={Users} label="리포트 발행 대상" value={activeClients} unit="곳" tone="navy" hint={`전체 ${reports.length}곳`} />
        <KpiCard icon={TrendingUp} label="배출량 증가 병원" value={growing} unit="곳" tone="amber" hint="수거주기 조정 검토" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        {/* 좌: 거래처 목록 */}
        <section className="min-w-0">
          <SectionTitle>거래처 선택</SectionTitle>
          <div className="card p-3">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-300" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="병원명 검색"
                className="w-full rounded-2xl border-0 bg-navy-50 py-3 pl-11 pr-3 text-[1.12rem] font-medium text-navy-900 outline-none ring-1 ring-transparent transition placeholder:text-navy-300 focus:bg-white focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div className="mt-2 max-h-[420px] space-y-1 overflow-y-auto lg:max-h-[560px]">
              {filtered.map((r) => {
                const active = r.client.id === selected?.client.id
                return (
                  <button
                    key={r.client.id}
                    onClick={() => setParams({ client: r.client.id })}
                    className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition ${
                      active ? 'bg-teal-500 text-white' : 'hover:bg-navy-50'
                    }`}
                  >
                    <Building2 size={18} className={`shrink-0 ${active ? 'text-white/80' : 'text-navy-300'}`} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block break-keep text-[1.12rem] font-bold leading-snug ${
                          active ? 'text-white' : 'text-navy-800'
                        }`}
                      >
                        {r.client.name}
                      </span>
                      <span
                        className={`mt-0.5 block break-keep text-[1rem] leading-snug ${
                          active ? 'text-white/75' : 'text-navy-400'
                        }`}
                      >
                        {weight(r.totalKg)} · {r.visits}회
                      </span>
                    </span>
                    <ChevronRight size={17} className={`shrink-0 ${active ? 'text-white/70' : 'text-navy-300'}`} />
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-[1.12rem] text-navy-400">검색 결과가 없습니다.</p>
              )}
            </div>
          </div>
        </section>

        {/* 우: 선택된 리포트 */}
        <section className="min-w-0">
          <SectionTitle
            action={
              selected && (
                <button
                  onClick={() => navigate(`/clients/${selected.client.id}`)}
                  className="pill bg-navy-50 text-navy-500 transition hover:bg-navy-100"
                >
                  거래처 상세 <ChevronRight size={13} />
                </button>
              )
            }
          >
            월간 운영 리포트
          </SectionTitle>
          {selected && <MonthlyReportView report={selected} />}
        </section>
      </div>
    </PageShell>
  )
}
