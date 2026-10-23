import { useCallback, useEffect, useState } from 'react'
import { Ban, ChevronDown, Info, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { FIELD_BY_KEY, PREFLIGHT_LABEL, type Preflight, type PreflightItem } from '../../lib/bizPlan'
import { BizPlanError, preflight } from '../../lib/bizPlanApi'
import { usePlan, when } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 제출 전 점검 (0147 · 서버 bizplan_preflight)
//
//   차단 — 고치기 전에는 제출본 확정 불가 (필수 칸 · 처리 전 수정요청 · 자금소요(A)≠조달(B))
//   확인 — 담당이 확인하고 까닭을 적으면 예외로 확정 가능 (재확인 · 미정 · 추정 표시 · 기간 …)
//   안내 — 제출 직전 원본 서식에 직접 적는 칸
//  판단은 서버가 합니다. 이 화면은 그 결과를 묶어서 보여 주고 항목으로 데려갑니다.
// ─────────────────────────────────────────────────────────────────────────────

export function usePreflight() {
  const { data } = usePlan()
  const on = (data.api ?? 0) >= 147
  const [pf, setPf] = useState<Preflight | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!on) return
    setBusy(true)
    setErr(null)
    try {
      setPf(await preflight())
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '점검하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }, [on])
  //  문서가 바뀌면 다시 점검
  useEffect(() => {
    void load()
  }, [load, data])
  return { on, pf, busy, err, load }
}

const LEVEL = {
  block: { title: '고쳐야 확정할 수 있음', icon: Ban, box: 'bg-rose-50 ring-rose-200', text: 'text-rose-800' },
  warn: { title: '확인 필요 — 까닭을 적고 예외로 확정할 수 있음', icon: TriangleAlert, box: 'bg-amber-50 ring-amber-200', text: 'text-amber-900' },
  info: { title: '안내', icon: Info, box: 'bg-navy-50 ring-navy-100', text: 'text-navy-700' },
} as const

export function PreflightView({ state, onGo, compact = false }: { state: ReturnType<typeof usePreflight>; onGo: (key: string) => void; compact?: boolean }) {
  const { pf, busy, err, load, on } = state
  if (!on) {
    return (
      <p data-preflight-off className="break-keep rounded-xl bg-navy-50 px-3.5 py-3 text-[0.95rem] text-navy-600">
        제출 전 점검은 서버에 PROPOSAL_0147 을 실행한 뒤에 쓸 수 있습니다.
      </p>
    )
  }
  return (
    <section data-preflight={pf ? `${pf.blocks}/${pf.warns}` : ''} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[1.02rem] font-extrabold text-navy-900">
          제출 전 점검
          {pf && (
            <span className="ml-2 text-[0.95rem] font-bold">
              <span className={pf.blocks ? 'text-rose-700' : 'text-navy-500'}>차단 {pf.blocks}</span>
              <span className="text-navy-300"> · </span>
              <span className={pf.warns ? 'text-amber-800' : 'text-navy-500'}>확인 {pf.warns}</span>
            </span>
          )}
        </h3>
        <button type="button" data-preflight-reload onClick={() => void load()} disabled={busy} className="btn-ghost min-h-[40px] px-3 text-[0.92rem]">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} 다시 점검
        </button>
      </div>
      {err && <p className="text-[0.95rem] font-bold text-rose-600">{err}</p>}
      {pf && (
        <>
          <p className="text-[0.85rem] text-navy-500">
            {when(pf.at)} 기준 · 접수월 {pf.submit_month} 로 봄 (작성일 칸 · 없으면 오늘)
          </p>
          {(['block', 'warn', 'info'] as const).map((lv) => {
            const items = pf.items.filter((i) => i.level === lv)
            if (items.length === 0) return null
            return <LevelGroup key={lv} level={lv} items={items} onGo={onGo} open={!compact && lv === 'block'} />
          })}
          {pf.blocks === 0 && pf.warns === 0 && (
            <p data-preflight-clear className="rounded-xl bg-teal-50 px-3.5 py-3 text-[0.98rem] font-bold text-teal-800 ring-1 ring-teal-200">
              차단 · 확인 항목이 없습니다.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function LevelGroup({ level, items, onGo, open }: { level: 'block' | 'warn' | 'info'; items: PreflightItem[]; onGo: (key: string) => void; open: boolean }) {
  const L = LEVEL[level]
  const byCode = new Map<string, PreflightItem[]>()
  for (const i of items) byCode.set(i.code, [...(byCode.get(i.code) ?? []), i])
  return (
    <div data-preflight-level={level} className={`space-y-1 rounded-xl px-3 py-2.5 ring-1 ${L.box}`}>
      <p className={`flex items-center gap-1.5 text-[0.98rem] font-extrabold ${L.text}`}>
        <L.icon size={16} strokeWidth={2.5} aria-hidden="true" /> {L.title} · {items.length}
      </p>
      {[...byCode.entries()].map(([code, list]) => (
        <details key={code} open={open} data-preflight-code={code} className="rounded-lg bg-white/70 px-2.5 py-1">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-[0.95rem] font-bold text-navy-800">
            <span className="min-w-0 flex-1 break-keep">{PREFLIGHT_LABEL[code] ?? code}</span>
            <span className="shrink-0 rounded-full bg-navy-100 px-2 text-[0.85rem]">{list.length}</span>
            <ChevronDown size={15} className="shrink-0 text-navy-400" />
          </summary>
          <ul className="space-y-0.5 pb-1.5">
            {list.map((i, n) => {
              const ref = i.key ? FIELD_BY_KEY.get(i.key) : undefined
              return (
                <li key={n} className="break-keep text-[0.92rem] text-navy-700">
                  {ref ? (
                    <button type="button" data-preflight-go={i.key} onClick={() => onGo(i.key!)} className="min-h-[36px] text-left font-bold text-teal-700 underline-offset-2 hover:underline">
                      {ref.path} ›
                    </button>
                  ) : null}
                  <span className={ref ? 'ml-1' : ''}>{i.msg}</span>
                </li>
              )
            })}
          </ul>
        </details>
      ))}
    </div>
  )
}
