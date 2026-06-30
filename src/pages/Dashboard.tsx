import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { StatusBadge, WasteBadge } from '../components/Badge'
import { InfoBanner } from '../components/InfoBanner'
import { Stagger, StaggerItem } from '../components/motion'
import { PageShell, SectionTitle, MetricCard } from '../components/ui'
import {
  additionalMaterialCount,
  monthlyCollected,
  outstandingTotal,
  todaySummary,
  vehicleTodaySummary,
} from '../lib/selectors'
import { prettyDate, today, weight, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 — "대표님이 휴대폰으로 한눈에 보는 화면"
// ─────────────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data, clientById } = useData()
  const navigate = useNavigate()
  const t = today()

  const summary = todaySummary(data)
  const monthly = monthlyCollected(data)
  const totalMonthly = monthly.의료폐기물 + monthly.일회용기저귀
  const outstanding = outstandingTotal(data)
  const addMaterials = additionalMaterialCount(data)
  const vehicles = vehicleTodaySummary(data)
  const confirmNeeded = data.payments.filter((p) => p.status === '확인필요').length

  // "오늘 먼저 확인할 일" — 조치가 필요한 항목만
  const alerts: { icon: string; label: string; count: number; tone: string; to: string }[] = []
  if (summary.긴급 > 0)
    alerts.push({ icon: '🚨', label: '긴급 수거', count: summary.긴급, tone: 'text-rose-500', to: '/today' })
  if (summary.지연 > 0)
    alerts.push({ icon: '⏰', label: '지연', count: summary.지연, tone: 'text-amber-500', to: '/today' })
  if (confirmNeeded > 0)
    alerts.push({ icon: '💳', label: '입금 확인 필요', count: confirmNeeded, tone: 'text-amber-500', to: '/receivables' })

  return (
    <PageShell>
      {/* 인사 영역 */}
      <div>
        <p className="text-[13px] font-medium text-navy-400">{prettyDate(t)} · 오늘의 운영 현황</p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-navy-900">
          대표님 한눈에 보기
        </h1>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[`거래처 ${data.clients.length}곳`, `차량 ${data.vehicles.length}대`, '월평균 105톤'].map((chip) => (
            <span key={chip} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy-500 shadow-card">
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* 오늘 먼저 확인할 일 — 밝은 카드 + 강조 뱃지 */}
      <section>
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            <p className="text-[15px] font-bold text-navy-700">오늘 먼저 확인할 일</p>
          </div>
          {alerts.length === 0 ? (
            <p className="mt-3 text-[15px] font-semibold text-navy-400">오늘은 급히 확인할 항목이 없어요 ✅</p>
          ) : (
            <div className="mt-3 space-y-2">
              {alerts.map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  className="pressable flex items-center gap-3 rounded-2xl bg-navy-50 px-4 py-3.5"
                >
                  <span className="text-xl">{a.icon}</span>
                  <span className="font-bold text-navy-800">{a.label}</span>
                  <span className={`ml-auto text-lg font-extrabold ${a.tone}`}>{a.count}건</span>
                  <span className="text-navy-300">›</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 오늘 수거 현황 — 2x2 */}
      <section>
        <SectionTitle>오늘 수거 현황</SectionTitle>
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StaggerItem>
            <MetricCard label="오늘 예정" value={summary.total} unit="건" tone="navy" size="lg" />
          </StaggerItem>
          <StaggerItem>
            <MetricCard label="완료" value={summary.완료} unit="건" tone="emerald" size="lg" />
          </StaggerItem>
          <StaggerItem>
            <MetricCard label="지연" value={summary.지연} unit="건" tone="amber" size="lg" />
          </StaggerItem>
          <StaggerItem>
            <MetricCard label="긴급" value={summary.긴급} unit="건" tone="rose" size="lg" />
          </StaggerItem>
        </Stagger>
      </section>

      {/* 이번 달 수거량 */}
      <section>
        <SectionTitle>이번 달 수거량</SectionTitle>
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StaggerItem>
            <MetricCard label="의료폐기물" value={weight(monthly.의료폐기물)} tone="rose" size="lg" hint="누적 실수거량" />
          </StaggerItem>
          <StaggerItem>
            <MetricCard label="일회용기저귀" value={weight(monthly.일회용기저귀)} tone="teal" size="lg" hint="누적 실수거량" />
          </StaggerItem>
          <StaggerItem>
            <MetricCard label="총 수거량" value={weight(totalMonthly)} tone="navy" size="lg" hint="월평균 목표 105톤" />
          </StaggerItem>
        </Stagger>
      </section>

      {/* 정산 · 자재 */}
      <section>
        <SectionTitle>정산 · 자재</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricCard label="미수금 합계" value={won(outstanding)} tone="amber" hint="미수금 관리 →" onClick={() => navigate('/receivables')} />
          <MetricCard label="이번 달 자재 추가요청" value={addMaterials} unit="건" tone="navy" hint="자재 관리 →" onClick={() => navigate('/materials')} />
        </div>
      </section>

      {/* 차량별 오늘 일정 */}
      <section>
        <SectionTitle action={<Link to="/today" className="text-[13px] font-bold text-teal-600">전체 일정 →</Link>}>
          차량별 오늘 일정
        </SectionTitle>
        <Stagger className="space-y-3">
          {vehicles.map(({ vehicle, total, done, items }) => (
            <StaggerItem key={vehicle.id}>
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WasteBadge type={vehicle.wasteType} />
                    <span className="font-bold text-navy-800">{vehicle.name}</span>
                    <span className="t-caption">· {vehicle.driver}</span>
                  </div>
                  <span className="text-sm font-bold text-navy-500">
                    {done}/{total}건 완료
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-navy-300">오늘 배정된 일정이 없습니다.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {items.map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium text-navy-600">
                          <span className="tabular-nums text-navy-400">{s.scheduledTime}</span>
                          {clientById(s.clientId)?.name ?? '알 수 없음'}
                        </span>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <InfoBanner />
    </PageShell>
  )
}
