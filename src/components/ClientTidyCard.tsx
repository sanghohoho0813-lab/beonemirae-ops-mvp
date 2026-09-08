import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronUp, ListChecks } from 'lucide-react'
import type { Client } from '../types'
import { useData } from '../context/DataContext'
import { TIDY_GROUP_LABEL, TIDY_GROUP_ORDER, TIDY_GROUP_WHY, tidyClients, type TidyGroup } from '../lib/clientTidy'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 정리 도우미 카드 — 거래처 화면 맨 위 (0105)
//
//  「뒤죽박죽인 게 보인다」를 「여기서부터 하나씩」으로 바꾸는 칸입니다.
//  묶음(청구에 닿는 것 → 매일 쓰는 것 → 나중 것 → 겹침) 순서로 보여 주고,
//  한 줄을 누르면 그 거래처의 **수정 창이 바로 열린** 채로 갑니다.
//
//  ⚠ 정리할 것이 0 이면 **한 줄로 줄어듭니다** — 「전부 정리됨」. 늘 큰 칸이
//    떠 있으면 곧 안 보게 됩니다.
//  ⚠ 접은 상태는 이 브라우저에 기억합니다 — 매번 다시 접게 하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const FOLD_KEY = 'beonemirae-ops:client-tidy-fold'
const SHOW_EACH = 5

export function ClientTidyCard({ clients }: { clients: Client[] }) {
  const navigate = useNavigate()
  const { data } = useData()
  const report = useMemo(() => tidyClients(clients, { assignments: data.clientAssignments }), [clients, data.clientAssignments])
  const [folded, setFolded] = useState<boolean>(() => {
    try { return window.localStorage.getItem(FOLD_KEY) === '1' } catch { return false }
  })
  const [more, setMore] = useState<Record<TidyGroup, boolean>>({ 돈: false, 매일: false, 나중: false, 겹침: false })

  const toggleFold = () => {
    setFolded((v) => {
      try { window.localStorage.setItem(FOLD_KEY, v ? '0' : '1') } catch { /* 사생활 모드 */ }
      return !v
    })
  }

  if (report.clients === 0) return null

  const total = report.issues.length
  if (total === 0 && report.demoMixed === 0) {
    return (
      <div data-tidy-card data-tidy-clean className="mb-3 flex items-center gap-2.5 rounded-2xl bg-accent-50 px-4 py-3">
        <CheckCircle2 size={19} strokeWidth={2.4} className="shrink-0 text-accent-700" />
        <p className="t-body min-w-0 break-keep font-bold text-accent-800">
          거래처 {report.clients}곳 전부 정리됐습니다 — 빈칸도, 겹치는 이름도 없습니다.
        </p>
      </div>
    )
  }

  return (
    <section data-tidy-card className="card mb-3 p-4 sm:p-5">
      <button
        data-tidy-fold
        onClick={toggleFold}
        aria-expanded={!folded}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ListChecks size={18} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-card block break-keep text-navy-900">
            정리할 것 <b data-tidy-total className="text-amber-700">{total}건</b>
            <span className="t-muted ml-2 font-bold text-navy-500">
              거래처 {report.clients}곳 중 {report.clean}곳은 깨끗
            </span>
          </span>
          <span className="t-muted mt-0.5 block break-keep">
            {TIDY_GROUP_ORDER.filter((g) => report.byGroup[g] > 0)
              .map((g) => `${TIDY_GROUP_LABEL[g]} ${report.byGroup[g]}`)
              .join(' · ')}
            {report.demoMixed > 0 ? ` · 시연용 ${report.demoMixed}곳 섞여 있음` : ''}
          </span>
        </span>
        {folded ? <ChevronDown size={19} className="shrink-0 text-navy-400" /> : <ChevronUp size={19} className="shrink-0 text-navy-400" />}
      </button>

      {!folded && (
        <div className="mt-4 space-y-4">
          {TIDY_GROUP_ORDER.map((g) => {
            const list = report.issues.filter((i) => i.group === g)
            if (list.length === 0) return null
            const shown = more[g] ? list : list.slice(0, SHOW_EACH)
            return (
              <div key={g} data-tidy-group={g}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="h-4 w-1 shrink-0 self-center rounded-full bg-amber-400" />
                  <p className="t-body min-w-0 break-keep font-extrabold text-navy-900">
                    {TIDY_GROUP_LABEL[g]} <span className="text-amber-700">{list.length}</span>
                  </p>
                </div>
                <p className="t-muted mb-2 break-keep pl-3 text-navy-500">{TIDY_GROUP_WHY[g]}</p>
                <ul className="space-y-1.5 pl-3">
                  {shown.map((it) => (
                    <li key={it.key}>
                      <button
                        data-tidy-item={it.key}
                        onClick={() => navigate(it.to)}
                        className="flex min-h-[2.75rem] w-full items-center gap-2 rounded-2xl bg-navy-50 px-3.5 py-2 text-left transition hover:bg-navy-100"
                      >
                        <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-800">
                          {it.clientName}
                          <span className="ml-2 font-medium text-navy-500">{it.label}</span>
                        </span>
                        <span className="t-muted shrink-0 font-bold text-teal-700">
                          {it.group === '겹침' ? '보기' : '채우기'} →
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {list.length > SHOW_EACH && (
                  <button
                    data-tidy-more={g}
                    onClick={() => setMore((m) => ({ ...m, [g]: !m[g] }))}
                    className="t-muted mt-1.5 min-h-[2.5rem] pl-3 font-bold text-teal-700"
                  >
                    {more[g] ? '접기' : `${list.length - SHOW_EACH}곳 더 보기`}
                  </button>
                )}
              </div>
            )
          })}
          {report.demoMixed > 0 && (
            <p data-tidy-demo className="t-muted break-keep rounded-2xl bg-navy-50 px-3.5 py-2.5 text-navy-600">
              실제 거래처 사이에 <b>시연용 {report.demoMixed}곳</b>이 섞여 있습니다. 숫자가 섞이지 않게 「시연용」
              필터로 확인한 뒤 정리해 주세요.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
