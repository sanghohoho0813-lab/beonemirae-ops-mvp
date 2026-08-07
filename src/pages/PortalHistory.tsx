import { useMemo } from 'react'
import { useData } from '../context/DataContext'
import { PageShell, EmptyState } from '../components/ui'
import { collectionHistory } from '../lib/ops'
import { prettyDate, weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 수거 이력
//
//  병원이 인증·실사 때 매번 비원미래에 전화해서 받던 자료를 직접 확인할 수
//  있게 합니다. 내부 배차·차량 정보는 보여주지 않고, 병원에 필요한 항목만
//  (날짜 · 구분 · 배출량 · 용기 · 인계 여부) 남깁니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalHistory() {
  const { data } = useData()
  const client = data.clients[0]
  const rows = useMemo(() => (client ? collectionHistory(data, client.id, 40) : []), [data, client])
  const done = rows.filter((r) => r.amountKg != null)

  if (!client) {
    return (
      <PageShell>
        <EmptyState icon="🏥" title="연결된 병원 정보를 찾을 수 없습니다" />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div>
        <h1 className="t-page text-navy-900">수거 이력</h1>
        <p className="t-body mt-2.5 break-keep font-medium text-navy-400">
          {client.name} · 최근 {done.length}건 · 인증·실사 자료로 그대로 쓰실 수 있습니다
        </p>
      </div>

      {done.length === 0 ? (
        <EmptyState icon="📋" title="아직 수거 기록이 없습니다" subtitle="첫 수거가 완료되면 여기에 표시됩니다." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-navy-100">
                {['수거일', '구분', '배출량', '용기', '처리장 인계'].map((h) => (
                  <th key={h} className="t-label whitespace-nowrap px-4 py-3.5 text-navy-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {done.map((r) => (
                <tr key={r.id} className="border-b border-navy-50 last:border-0">
                  <td className="t-cell whitespace-nowrap px-4 py-3.5 font-bold text-navy-900">
                    {prettyDate(r.date)}
                  </td>
                  <td className="t-cell px-4 py-3.5 text-navy-600">{r.wasteType}</td>
                  <td className="t-cell whitespace-nowrap px-4 py-3.5 font-bold text-navy-900">
                    {weight(r.amountKg ?? 0)}
                  </td>
                  <td className="t-cell px-4 py-3.5 text-navy-600">
                    {r.containerType} {r.containerCount}개
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`pill ${r.handedOver ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}>
                      {r.handedOver ? '인계 완료' : (r.handoverStatus ?? '처리 중')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="t-muted break-keep">
        수거대장 PDF 자동 발급과 올바로 시스템 연동은 개발 예정입니다. 지금 필요하시면 담당자(1533-8876)에게
        요청해 주세요.
      </p>
    </PageShell>
  )
}
