import { createContext, useContext, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, FileClock, Lock, MessageSquareWarning, PenLine } from 'lucide-react'
import {
  columnTotal, diffLines, needsAlignment, plainText,
  type Basis, type CheckRow, type FieldDef, type FieldRow, type FieldStatus, type GridValue, type OpenData,
  type RefTable, type RequestRow, type TableRow, type Value,
} from '../../lib/bizPlan'

// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 화면 공용 부품 (0146)
//
//  상태는 **색만으로 말하지 않습니다** — 늘 글자(「확인 필요」 등)와 함께. 색은 옅게:
//   초안 = 흰 바탕 · 확인 필요 = 연한 노랑 테두리 · 수정 요청 = 연한 주황 테두리 ·
//   반영 완료 = 연한 청록 · 최종 확인 = 중립 + 완료 아이콘 · 작성 전 = 점선
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanCtx {
  data: OpenData
  fields: Map<string, FieldRow>
  requestsByKey: Map<string, RequestRow[]>
  checksByKey: Map<string, CheckRow[]>
  isEditor: boolean
  /** 서버에서 다시 읽기 */
  reload: () => Promise<void>
  /** 화면 아래 한 줄 알림 */
  notify: (msg: string) => void
  openRequest: (key: string) => void
  openEditor: (key: string, opts?: { requestId?: string; suggestion?: string }) => void
  openField: (key: string) => void
}
export const BizPlanContext = createContext<PlanCtx | null>(null)
export function usePlan(): PlanCtx {
  const c = useContext(BizPlanContext)
  if (!c) throw new Error('BizPlanContext 밖')
  return c
}

export const STATUS_STYLE: Record<FieldStatus, { card: string; badge: string }> = {
  '작성 전': { card: 'border-dashed border-navy-200 bg-white', badge: 'bg-navy-50 text-navy-500 ring-navy-200' },
  '초안 입력 완료': { card: 'border-navy-100 bg-white', badge: 'bg-white text-navy-700 ring-navy-200' },
  '확인 필요': { card: 'border-amber-300 bg-amber-50/40', badge: 'bg-amber-50 text-amber-800 ring-amber-300' },
  '수정 요청 있음': { card: 'border-orange-300 bg-orange-50/30', badge: 'bg-orange-50 text-orange-800 ring-orange-300' },
  '수정 반영 완료': { card: 'border-teal-200 bg-teal-50/50', badge: 'bg-teal-50 text-teal-800 ring-teal-200' },
  '최종 확인 완료': { card: 'border-navy-100 bg-white', badge: 'bg-navy-900 text-white ring-navy-900' },
}

export function StatusBadge({ status }: { status: FieldStatus }) {
  const Icon =
    status === '최종 확인 완료' ? CheckCircle2
      : status === '확인 필요' ? AlertTriangle
        : status === '수정 요청 있음' ? MessageSquareWarning
          : status === '수정 반영 완료' ? FileClock
            : status === '작성 전' ? CircleDashed
              : PenLine
  return (
    <span data-status-badge={status} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.9rem] font-extrabold ring-1 ring-inset ${STATUS_STYLE[status].badge}`}>
      <Icon size={14} strokeWidth={2.6} aria-hidden="true" /> {status}
    </span>
  )
}

/** 「10/23 14:20」 (한국 시각) */
export function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function who(name: string, title?: string) {
  return [name, title].filter(Boolean).join(' ')
}

// ── 값 보기 ──────────────────────────────────────────────────────────────────
export function ValueView({ def, value, compact = false }: { def: FieldDef; value: Value | null | undefined; compact?: boolean }) {
  if (def.kind === 'notice') {
    return (
      <div className="space-y-1.5 rounded-xl bg-navy-50/70 px-3.5 py-3 text-[0.98rem] leading-relaxed text-navy-700">
        {def.text.map((x, i) => (
          <p key={i} className="break-keep">{x}</p>
        ))}
      </div>
    )
  }
  if (def.kind === 'offline') {
    return (
      <p data-offline-field className="flex items-start gap-2 rounded-xl bg-navy-50 px-3.5 py-3 text-[0.98rem] font-semibold text-navy-600">
        <Lock size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="break-keep">{def.hint ?? '이 시스템에 저장하지 않습니다 — 제출 직전 원본 서식에 직접 적습니다.'}</span>
      </p>
    )
  }
  const empty = <p className="text-[1rem] font-semibold text-navy-400">(아직 비어 있음)</p>
  if (def.kind === 'table') {
    const rows = (Array.isArray(value) ? value : []) as TableRow[]
    const shown = def.rowLabels ? def.rowLabels.map((lb, i) => ({ lb, r: rows[i] ?? {} })) : rows.map((r) => ({ lb: '', r }))
    const nonEmpty = shown.filter(({ lb, r }) => lb || def.columns.some((c) => String(r?.[c.key] ?? '').trim()))
    if (!def.rowLabels && nonEmpty.length === 0) return empty
    const totals = (def.totals ?? []).map((k) => [k, columnTotal(rows, k)] as const).filter(([, n]) => n != null)
    return (
      <div className="space-y-2">
        {/*  PC — 표 */}
        <div className="hidden overflow-x-auto rounded-xl ring-1 ring-navy-100 sm:block">
          <table className="w-full border-collapse text-left text-[0.95rem]">
            <thead className="bg-navy-50 text-navy-600">
              <tr>
                {def.rowLabels && <th className="whitespace-nowrap px-2.5 py-2 font-bold">구분</th>}
                {def.columns.map((c) => (
                  <th key={c.key} className="px-2.5 py-2 font-bold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nonEmpty.map(({ lb, r }, i) => (
                <tr key={i} className="border-t border-navy-100 align-top text-navy-800">
                  {def.rowLabels && <td className="px-2.5 py-2 font-semibold text-navy-600">{lb}</td>}
                  {def.columns.map((c) => (
                    <td key={c.key} className={`whitespace-pre-wrap break-keep px-2.5 py-2 ${c.num ? 'tabular-nums' : ''}`}>{r?.[c.key] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/*  폰 — 줄마다 카드 (가로로 밀지 않게) */}
        <div className="space-y-2 sm:hidden">
          {nonEmpty.map(({ lb, r }, i) => (
            <div key={i} data-table-row className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-navy-100">
              {lb && <p className="mb-1 break-keep text-[0.95rem] font-extrabold text-navy-700">{lb}</p>}
              {def.columns
                .filter((c) => String(r?.[c.key] ?? '').trim() || !compact)
                .map((c) => (
                  <p key={c.key} className="break-keep text-[0.98rem] leading-snug text-navy-800">
                    <span className="font-bold text-navy-500">{c.label} </span>
                    <span className="whitespace-pre-wrap">{r?.[c.key] || '—'}</span>
                  </p>
                ))}
            </div>
          ))}
        </div>
        {totals.length > 0 && (
          <p data-table-total className="text-[0.95rem] font-bold text-navy-600">
            합계 · {totals.map(([k, n]) => `${def.columns.find((c) => c.key === k)?.label ?? k} ${n!.toLocaleString('ko-KR')}`).join(' · ')}
          </p>
        )}
      </div>
    )
  }
  if (def.kind === 'grid') {
    const g = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as GridValue
    const any = def.cells.some((c) => String(g[c.key] ?? '').trim())
    if (!any) return empty
    return (
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {def.cells.map((c) => (
          <div key={c.key} className="flex min-w-0 items-baseline gap-2 border-b border-navy-50 py-1">
            <dt className="shrink-0 break-keep text-[0.93rem] font-bold text-navy-500">{c.label}</dt>
            <dd className={`min-w-0 flex-1 break-keep text-right text-[1rem] font-semibold text-navy-900 ${c.num ? 'tabular-nums' : ''}`}>
              {g[c.key] || <span className="text-navy-300">—</span>}
              {def.unit && g[c.key] && c.num ? <span className="ml-0.5 text-[0.85rem] text-navy-400">{def.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    )
  }
  const s = typeof value === 'string' ? value : ''
  if (!s.trim()) return empty
  return (
    <p className={`whitespace-pre-wrap break-keep text-[1.02rem] leading-relaxed text-navy-900 ${compact ? 'line-clamp-4' : ''}`}>
      {s}
      {def.unit ? <span className="ml-1 text-navy-500">{def.unit}</span> : null}
    </p>
  )
}

// ── 근거 한 줄 ────────────────────────────────────────────────────────────────
export function BasisLine({ basis }: { basis: Basis | null | undefined }) {
  if (!basis || (!basis.kind && !basis.source && !basis.note && !basis.asOf)) return null
  return (
    <div data-basis className="space-y-0.5 text-[0.9rem] leading-snug">
      {(basis.kind || basis.source || basis.asOf) && (
        <p className="break-keep text-navy-500">
          {basis.kind && <span data-basis-kind={basis.kind} className="mr-1.5 rounded-md bg-navy-100 px-1.5 py-0.5 font-extrabold text-navy-700">{basis.kind}</span>}
          {basis.source && <span>출처 {basis.source}</span>}
          {basis.asOf && <span> · 기준일 {basis.asOf}</span>}
        </p>
      )}
      {basis.note && <p className="break-keep font-semibold text-amber-800">확인할 것 · {basis.note}</p>}
    </div>
  )
}

// ── 확인 표시 (사람마다) ────────────────────────────────────────────────────────
export function ChecksLine({ checks }: { checks: CheckRow[] }) {
  if (checks.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {needsAlignment(checks) && (
        <span data-align-needed className="rounded-full bg-violet-100 px-2.5 py-1 text-[0.85rem] font-extrabold text-violet-800">의견 조율 필요</span>
      )}
      {checks.map((c) => (
        <span key={c.profile_id} data-check-chip={c.mark} className="rounded-full bg-navy-50 px-2.5 py-1 text-[0.85rem] font-bold text-navy-700 ring-1 ring-inset ring-navy-100">
          {who(c.name, c.title)} · {c.mark} <span className="font-semibold text-navy-400">{when(c.at)}</span>
        </span>
      ))}
    </div>
  )
}

// ── 바꾸기 전 · 후 ──────────────────────────────────────────────────────────────
export function DiffView({ def, before, after, labels = ['바꾸기 전', '바꾼 뒤'] }: { def: FieldDef; before: Value | null; after: Value | null; labels?: [string, string] }) {
  const a = plainText(def, before)
  const b = plainText(def, after)
  if (a === b) return <p className="text-[0.92rem] font-semibold text-navy-400">내용은 같습니다.</p>
  const lines = diffLines(a, b)
  return (
    <div data-diff className="overflow-hidden rounded-xl ring-1 ring-navy-100">
      {!a.trim() && <p className="bg-navy-50/60 px-3 py-1 text-[0.85rem] font-semibold text-navy-400">{labels[0]}: (비어 있었음)</p>}
      <p className="flex gap-3 bg-navy-50 px-3 py-1.5 text-[0.85rem] font-bold text-navy-500">
        <span className="text-rose-700">− {labels[0]}</span>
        <span className="text-teal-700">+ {labels[1]}</span>
      </p>
      <div className="max-h-72 overflow-y-auto">
        {lines.map((x, i) => (
          <p
            key={i}
            data-diff-op={x.op}
            className={`whitespace-pre-wrap break-keep px-3 py-0.5 text-[0.93rem] leading-snug ${
              x.op === 'del' ? 'bg-rose-50 text-rose-800 line-through decoration-rose-300' : x.op === 'add' ? 'bg-teal-50 text-teal-900' : 'text-navy-600'
            }`}
          >
            {x.op === 'del' ? '− ' : x.op === 'add' ? '+ ' : '  '}
            {x.text || ' '}
          </p>
        ))}
      </div>
    </div>
  )
}

// ── 참고 표 (작성 참고사항 · 작성요령) ─────────────────────────────────────────
export function RefTableView({ t }: { t: RefTable }) {
  return (
    <div className="space-y-1.5">
      {t.title && <p className="break-keep text-[0.98rem] font-bold text-navy-700">{t.title}</p>}
      <div className="overflow-x-auto rounded-xl ring-1 ring-navy-100">
        <table className="w-full min-w-[32rem] border-collapse text-left text-[0.9rem]">
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className={i === 0 ? 'bg-navy-50 font-bold text-navy-600' : 'border-t border-navy-100 align-top text-navy-700'}>
                {r.map((c, j) => (
                  <td key={j} className="break-keep px-2.5 py-1.5">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Pill({ children, tone = 'navy' }: { children: ReactNode; tone?: 'navy' | 'amber' | 'orange' | 'teal' | 'rose' | 'violet' }) {
  const c = {
    navy: 'bg-navy-50 text-navy-700',
    amber: 'bg-amber-50 text-amber-800',
    orange: 'bg-orange-50 text-orange-800',
    teal: 'bg-teal-50 text-teal-800',
    rose: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-800',
  }[tone]
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[0.85rem] font-extrabold ${c}`}>{children}</span>
}

export const REQ_TONE: Record<string, 'navy' | 'amber' | 'orange' | 'teal' | 'rose' | 'violet'> = {
  접수: 'orange',
  '검토 중': 'amber',
  '반영 완료': 'teal',
  보류: 'violet',
  반려: 'rose',
}

// ── 복사 · 내려받기 ─────────────────────────────────────────────────────────────
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 파일 이름용 「20261023_1420」 (한국 시각) */
export function stamp(d = new Date()): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000).toISOString()
  return `${k.slice(0, 10).replace(/-/g, '')}_${k.slice(11, 16).replace(':', '')}`
}
