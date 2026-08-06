import { useNavigate } from 'react-router-dom'
import { ChevronRight, StickyNote } from 'lucide-react'
import type { AppData } from '../types'
import { schedulesOn } from '../lib/selectors'
import { nextActionsFor } from '../lib/insights'
import { today, weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 거래처 운영 현황
//  오늘 일정이 있는 병원을 기준으로 일정·추천·현장 메모를 한 줄로 묶어 보여줍니다.
//  각 병원의 데이터가 하나의 대시보드로 연결되어 있음을 보여주는 것이 목적입니다.
// ─────────────────────────────────────────────────────────────────────────────

export function TodayClients({ data, limit = 4 }: { data: AppData; limit?: number }) {
  const navigate = useNavigate()
  const t = today()
  const list = schedulesOn(data, t)
  const notes = data.notes ?? []

  // 오늘 일정이 있는 거래처 (중복 제거, 등장 순서 유지)
  const ids: string[] = []
  for (const s of list) if (!ids.includes(s.clientId)) ids.push(s.clientId)

  const rows = ids.slice(0, limit).map((id) => {
    const client = data.clients.find((c) => c.id === id)!
    const mine = list.filter((s) => s.clientId === id)
    const done = mine.filter((s) => s.status === '완료')
    const doneKg = done.reduce((a, s) => a + (s.actualAmount ?? 0), 0)
    const openNotes = notes.filter((n) => n.clientId === id && !n.done).length
    const action = nextActionsFor(data, client).find((a) => a.kind !== '정기수거')
    const materials = data.materials.filter((m) => m.clientId === id && m.date === t)
    const materialCount = materials.reduce((a, m) => a + m.boxCount + m.vinylCount + m.needleBoxCount, 0)
    return { client, total: mine.length, doneCount: done.length, doneKg, openNotes, action, materialCount }
  })

  if (rows.length === 0) return null

  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-navy-50">
        {rows.map((r) => (
          <button
            key={r.client.id}
            onClick={() => navigate(`/clients/${r.client.id}`)}
            className="flex w-full items-start gap-4 px-5 py-5 text-left transition hover:bg-navy-50"
          >
            <div className="min-w-0 flex-1">
              <p className="t-card text-navy-900">{r.client.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* 오늘 수거 상태 */}
                <span
                  className={`rounded-lg px-2.5 py-1 text-[0.95rem] font-bold ${
                    r.doneCount > 0 ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-600'
                  }`}
                >
                  {r.doneCount > 0 ? `수거 완료 ${weight(r.doneKg)}` : `오늘 수거 예정 ${r.total}건`}
                </span>
                {/* 자재 공급 */}
                {r.materialCount > 0 && (
                  <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-[0.95rem] font-bold text-sky-700">
                    자재 공급 {r.materialCount}개
                  </span>
                )}
                {/* 추천 행동 */}
                {r.action && (
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[0.95rem] font-bold text-amber-700">
                    {r.action.title}
                  </span>
                )}
                {/* 현장 메모 */}
                {r.openNotes > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-navy-100 px-2.5 py-1 text-[0.95rem] font-bold text-navy-600">
                    <StickyNote size={13} strokeWidth={2.6} /> 현장 메모 {r.openNotes}건
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={20} className="mt-1 shrink-0 text-navy-300" />
          </button>
        ))}
      </div>
      <button
        onClick={() => navigate('/clients')}
        className="flex w-full items-center justify-center gap-1.5 border-t border-navy-100 py-4 t-body font-bold text-navy-600 transition hover:bg-navy-50"
      >
        전체 거래처 보기 <ChevronRight size={18} />
      </button>
    </div>
  )
}
