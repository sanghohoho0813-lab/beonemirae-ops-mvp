import { useMemo } from 'react'
import { CLIENT_TEL } from '../lib/brand'
import { Hospital, ClipboardList } from 'lucide-react'
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
        <EmptyState icon={Hospital} title="연결된 병원 정보를 찾을 수 없습니다" />
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
        <EmptyState icon={ClipboardList} title="아직 수거 기록이 없습니다" subtitle="첫 수거가 완료되면 여기에 표시됩니다." />
      ) : (
        <>
        {/*  ── 폰에서는 표 대신 카드 ───────────────────────────────────────
             표가 640px 인데 폰의 칸은 354px 입니다 — **가로로 286px 밀렸습니다.**
             병원 담당자는 「용기」와 「처리장 인계」를 보려고 옆으로 밀어야
             했고, 밀 수 있다는 표시도 없었습니다. 인증·실사 때 쓰는 자료라
             안 보이면 결국 전화를 겁니다.
             넓은 화면은 표 그대로입니다 — 여러 줄을 한눈에 견주는 데는 표가
             낫습니다. */}
        <div data-portal-hist-cards className="card divide-y divide-navy-50 sm:hidden">
          {done.map((r) => (
            <div key={r.id} data-portal-hist-card={r.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <b className="t-body break-keep text-navy-900">{prettyDate(r.date)}</b>
                <span className="t-muted text-navy-500">{r.wasteType}</span>
                <span
                  data-portal-hist-handover={r.id}
                  className={`pill ml-auto shrink-0 ${r.handedOver ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}
                >
                  {r.handedOver ? '인계 완료' : (r.handoverStatus ?? '처리 중')}
                </span>
              </div>
              <p className="t-card mt-1 break-keep text-navy-900">{weight(r.amountKg ?? 0)}</p>
              {/*  ⚠ 용기를 **안 적었으면 「미기재」**입니다. 0 으로 채우지
                   않습니다 — 「안 적었다」와 「0개였다」는 다른 말이고,
                   병원은 이 숫자를 사실로 읽습니다.
                   예전에는 여기가 그냥 「개」 한 글자만 떠 있었습니다. */}
              <p className="t-muted mt-0.5 break-keep text-navy-500">
                {r.containerType
                  ? `용기 ${r.containerType}${r.containerCount != null ? ` (${r.containerCount}개)` : ''}`
                  : '용기 미기재'}
              </p>
            </div>
          ))}
        </div>

        <div className="card hidden overflow-x-auto sm:block">
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
                    {r.containerType
                      ? `${r.containerType}${r.containerCount != null ? ` ${r.containerCount}개` : ''}`
                      : '미기재'}
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
        </>
      )}

      <p className="t-muted break-keep">
        수거대장 PDF 자동 발급과 올바로 시스템 연동은 개발 예정입니다. 지금 필요하시면 담당자({CLIENT_TEL})에게
        요청해 주세요.
      </p>
    </PageShell>
  )
}
