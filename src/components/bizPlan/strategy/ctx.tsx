import { createContext, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Clock3, RotateCcw, Scale } from 'lucide-react'
import type { Decider, DecisionRow, DecisionState, Kind, Pick, Result, StrategyModel, Warning } from '../../../lib/bizStrategy'
import type { StrategyOpen } from '../../../lib/bizStrategyApi'

// ─────────────────────────────────────────────────────────────────────────────
// 사업화전략 화면 공용 (0148)
//
//  · 숫자의 성격은 **색만으로 말하지 않습니다** — 늘 글자(「사업화 목표」 등)와 함께.
//  · 「보기 기준」 — 합의된 결정만 반영(나머지는 추천안으로 미리보기) / 내 선택으로 보기.
//    어느 쪽이든 **화면 계산일 뿐 저장되지 않습니다.** 저장되는 것은 결정 단추를 누른 것뿐.
// ─────────────────────────────────────────────────────────────────────────────

export type ViewBasis = 'agreed' | 'mine'

export interface StrategyCtx {
  open: StrategyOpen
  model: StrategyModel
  rev: number
  assumpRev: number
  deciders: Decider[]
  rows: DecisionRow[]
  isEditor: boolean
  isDecider: boolean
  myId: string
  /** 제출 전 점검과 같은 접수월(월 번호) — 모델에 접수 예정월이 없을 때 */
  appFallback: number | null
  /** 합의된 결정 */
  agreed: Record<string, Pick>
  /** 내가 고른 것(지금 숫자 판) */
  mine: Record<string, Pick>
  states: Record<string, DecisionState>
  basis: ViewBasis
  setBasis: (b: ViewBasis) => void
  /** 지금 보기 기준 + 고르지 않은 것은 추천안 (화면 계산용) */
  viewPicks: Record<string, Pick>
  result: Result
  reload: () => Promise<void>
  notify: (m: string) => void
  goSection: (s: Section, anchor?: string) => void
  /** 사업계획서의 다른 탭으로 (기록·버전 등) */
  goTab: (tab: string) => void
  /** 결정 카드에 미리 넣어 둘 의견(직접 수치 수정에서 넘김) — 저장은 사람이 누를 때만 */
  noteDraft: Record<string, string>
  setNoteDraft: (key: string, text: string) => void
}
export type Section = 'summary' | 'scenarios' | 'decisions' | 'review' | 'apply' | 'edit'

export const StrategyContext = createContext<StrategyCtx | null>(null)
export function useStrategy(): StrategyCtx {
  const c = useContext(StrategyContext)
  if (!c) throw new Error('StrategyContext 밖')
  return c
}

// ── 숫자의 성격 ───────────────────────────────────────────────────────────────
const KIND_TONE: Record<Kind, string> = {
  '확인된 사실': 'bg-teal-50 text-teal-800 ring-teal-200',
  '산출된 추정치': 'bg-sky-50 text-sky-800 ring-sky-200',
  '사업화 목표': 'bg-violet-50 text-violet-800 ring-violet-200',
  '추가 검증 필요': 'bg-amber-50 text-amber-800 ring-amber-300',
  '경영진 결정 필요': 'bg-rose-50 text-rose-700 ring-rose-200',
}
export function KindBadge({ kind, small = false }: { kind: Kind; small?: boolean }) {
  return (
    <span data-kind={kind} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-extrabold ring-1 ring-inset ${small ? 'px-2 py-0.5 text-[0.8rem]' : 'px-2.5 py-1 text-[0.85rem]'} ${KIND_TONE[kind] ?? KIND_TONE['추가 검증 필요']}`}>
      {kind}
    </span>
  )
}

// ── 결정 상태 ─────────────────────────────────────────────────────────────────
const STATE_STYLE: Record<DecisionState, { cls: string; Icon: typeof CheckCircle2 }> = {
  합의: { cls: 'bg-teal-50 text-teal-800 ring-teal-200', Icon: CheckCircle2 },
  '의견 조율 필요': { cls: 'bg-rose-50 text-rose-700 ring-rose-200', Icon: Scale },
  '결정 대기': { cls: 'bg-navy-50 text-navy-600 ring-navy-200', Icon: CircleDashed },
  '재확인 필요': { cls: 'bg-amber-50 text-amber-800 ring-amber-300', Icon: RotateCcw },
  '추후 결정': { cls: 'bg-white text-navy-500 ring-navy-200', Icon: Clock3 },
}
export function StateChip({ state }: { state: DecisionState }) {
  const s = STATE_STYLE[state]
  return (
    <span data-decision-state={state} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.88rem] font-extrabold ring-1 ring-inset ${s.cls}`}>
      <s.Icon size={14} strokeWidth={2.6} aria-hidden="true" /> {state}
    </span>
  )
}

export function WarningList({ items, limit }: { items: Warning[]; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items
  if (list.length === 0) return null
  return (
    <ul className="space-y-1.5" data-warnings={items.length}>
      {list.map((w, i) => (
        <li
          key={i}
          data-warning={w.code}
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[0.95rem] font-semibold ${w.level === 'risk' ? 'bg-rose-50 text-rose-800' : w.level === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-navy-50/70 text-navy-700'}`}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-keep">
            <b className="mr-1">{w.level === 'risk' ? '위험' : w.level === 'warn' ? '확인' : '참고'}</b>
            {w.msg}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Card({ title, sub, right, children, hook }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; hook?: string }) {
  return (
    <section data-st-card={hook} className="min-w-0 space-y-3 rounded-[22px] bg-white p-4 ring-1 ring-navy-100 sm:p-5">
      {(title || right) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="break-keep text-[1.12rem] font-black text-navy-900 sm:text-[1.2rem]">{title}</h2>}
            {sub && <p className="mt-0.5 break-keep text-[0.92rem] text-navy-500">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

/** 접었다 펴는 자세히 — 처음부터 숫자 표를 다 보여 주지 않습니다 */
export function More({ label, children, hook, open: start = false }: { label: ReactNode; children: ReactNode; hook?: string; open?: boolean }) {
  const [open, setOpen] = useState(start)
  return (
    <div data-more={hook}>
      <button
        type="button"
        aria-expanded={open}
        data-more-toggle={hook}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-navy-50/70 px-3 py-2 text-left text-[0.95rem] font-extrabold text-navy-700 hover:bg-navy-100"
      >
        <span className="min-w-0 break-keep">{label}</span>
        <ChevronDown size={18} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  )
}

export function Lines({ items, empty }: { items?: string[]; empty?: string }) {
  if (!items || items.length === 0) return empty ? <p className="text-[0.92rem] text-navy-400">{empty}</p> : null
  return (
    <ul className="space-y-1">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2 break-keep text-[0.95rem] text-navy-700">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-300" />
          <span className="min-w-0">{x}</span>
        </li>
      ))}
    </ul>
  )
}

/** 억원 변화 */
export function Delta({ v, unit = '억' }: { v: number; unit?: string }) {
  const e = Math.round(v / 1e6) / 100
  if (e === 0) return <span className="text-navy-400">변화 없음</span>
  return <span className={e > 0 ? 'text-teal-700' : 'text-rose-600'}>{e > 0 ? '+' : '−'}{Math.abs(e).toFixed(2)}{unit}</span>
}
