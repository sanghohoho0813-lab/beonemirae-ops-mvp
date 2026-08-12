import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { readWorkbook } from '../lib/xlsx'
import {
  analyzeWorkbook,
  clientPatch,
  planCounts,
  reconcile,
  type ImportIssue,
  type ImportPlan,
  type PlannedRow,
} from '../lib/excelImport'
import { ITEM_BY_KEY, settlementFor, type ItemKey } from '../lib/billing'
import { importExcelRows } from '../lib/repo'
import { friendlyError } from '../lib/supabase'
import { won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 기존 거래처 엑셀 가져오기
//
//  흐름은 한 방향입니다.
//    파일 고르기 → 무엇이 들어 있는지 읽기 → 거래처 고르기 →
//    이미 있는 것과 맞춰 보기 → 무엇을 넣을지 눈으로 확인 → 가져오기 →
//    엑셀 합계와 시스템 합계 대조
//
//  가운데의 「눈으로 확인」을 건너뛰지 않습니다. 몇 년치 기록을 사람이 한 번도
//  보지 않은 채 DB 에 넣으면, 나중에 숫자가 이상해도 어디서 온 것인지 알 수
//  없습니다.
//
//  넣지 않는 것을 분명히 보여 줍니다 — 날짜가 없어 만들 수 없는 달, 이미
//  있어서 건너뛰는 줄, 값이 달라 사람이 정해야 하는 줄.
// ─────────────────────────────────────────────────────────────────────────────

type Phase = '대기' | '읽는 중' | '확인' | '넣는 중' | '완료'

export function ExcelImport() {
  const { mode } = useAuth()
  const { data, reload } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('대기')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number; conflict: number; clientFields: number } | null>(null)

  const clients = useMemo(
    () => data.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [data.clients],
  )

  const checked = useMemo(
    () => (plan && clientId ? reconcile(plan, data, clientId) : plan),
    [plan, clientId, data],
  )
  const counts = checked ? planCounts(checked) : null
  const target = clients.find((c) => c.id === clientId)

  async function pick(file: File) {
    setError(null)
    setResult(null)
    setPhase('읽는 중')
    try {
      //  원본은 읽기만 합니다 — 브라우저가 파일을 고쳐 쓰는 일은 없습니다.
      const sheets = await readWorkbook(await file.arrayBuffer())
      const next = analyzeWorkbook(sheets, file.name)
      setPlan(next)
      //  같은 이름의 거래처가 있으면 미리 골라 둡니다. 없으면 사람이 고릅니다 —
      //  이름만 보고 새 거래처를 만들어 버리면 같은 병원이 둘이 됩니다.
      const hit = next.client
        ? clients.find((c) => c.name.replace(/\s/g, '') === next.client!.name.replace(/\s/g, ''))
        : undefined
      setClientId(hit?.id ?? '')
      setPhase('확인')
    } catch (e) {
      setError(friendlyError(e))
      setPhase('대기')
    }
  }

  async function run() {
    if (!checked || !clientId) return
    const rows = checked.rows.filter((r) => r.status === '등록 예정')
    const c = planCounts(checked)
    if (
      !window.confirm(
        `${target?.name} 에 ${rows.length}건을 넣습니다.\n\n` +
          `등록 ${c.willImport}건 · 건너뜀 ${c.skip}건 · 충돌 ${c.conflict}건 · 오류 ${c.error}건\n` +
          `확인 필요 ${c.needsCheck}건은 넣지 않습니다.\n\n` +
          '이미 있는 기록은 덮어쓰지 않습니다. 진행할까요?',
      )
    ) {
      return
    }
    setPhase('넣는 중')
    setError(null)
    try {
      const res = await importExcelRows({
        clientId,
        rows,
        clientPatch: checked.client ? clientPatch(checked.client, target) : null,
        file: checked.fileName,
        summary: { months: checked.monthly, counts: c },
      })
      setResult(res)
      await reload()
      setPhase('완료')
    } catch (e) {
      setError(friendlyError(e))
      setPhase('확인')
    }
  }

  if (mode !== 'live') {
    return (
      <p className="t-body break-keep font-bold text-navy-400">
        엑셀 가져오기는 서버에 로그인한 실제 운영 모드에서만 쓸 수 있습니다.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* 1. 파일 */}
      <div className="rounded-2xl border border-dashed border-navy-200 bg-navy-50/40 p-4 sm:p-5">
        <input
          ref={fileRef}
          id="excel-file"
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pick(f)
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <FileSpreadsheet size={22} className="shrink-0 text-navy-500" />
          <p className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">
            {plan ? plan.fileName : '거래처 관리 엑셀(.xlsx) 을 고르세요'}
          </p>
          <button className="btn-navy shrink-0" onClick={() => fileRef.current?.click()}>
            {phase === '읽는 중' ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} strokeWidth={2.4} />}
            파일 고르기
          </button>
        </div>
        <p className="t-muted mt-2 break-keep">
          원본 파일은 읽기만 하고 고치지 않습니다. 여기서 바로 저장되지 않고, 무엇이 들어갈지 확인한 뒤에
          넣습니다.
        </p>
      </div>

      {error && <p className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{error}</p>}

      {checked && (
        <>
          {/* 2. 읽은 내용 */}
          <div className="card p-4 sm:p-5">
            <p className="t-card mb-3 break-keep text-navy-900">파일에서 읽은 것</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <Line k="거래처" v={checked.client?.name ?? '읽지 못함'} />
              <Line k="연도" v={checked.year ? `${checked.year}년` : '읽지 못함'} />
              <Line
                k="계약"
                v={
                  checked.client?.contractStart
                    ? `${checked.client.contractStart} ~ ${checked.client.contractEnd ?? '미정'}`
                    : '없음'
                }
              />
              <Line
                k="결제조건"
                v={checked.client?.paymentTerms || '없음'}
              />
              <Line k="단가" v={`${Object.keys(checked.client?.pricing ?? {}).length}개 품목`} />
              <Line k="월별 합계" v={`${checked.monthly.length}개 달`} />
              {/*  정산 규칙 — 월정액·부가세 별도는 금액이 크게 달라지는 계약이라
                   숨기지 않고 여기서 바로 보여 줍니다 (오남한양·해올·목동현대웰). */}
              {(() => {
                const p = checked.client?.pricing ?? {}
                const fm = p.medicalMonthly?.sale
                const fd = p.diaperMonthly?.sale
                const vt = p.diaperVatPct?.sale
                const parts = [
                  fm ? `의료 월정액 ${fm.toLocaleString()}원` : '',
                  fd ? `지정 월정액 ${fd.toLocaleString()}원` : '',
                  vt ? `지정 부가세 별도 ${vt}%` : '',
                ].filter(Boolean)
                return parts.length ? <Line k="정산 규칙" v={parts.join(' · ')} /> : null
              })()}
            </dl>

            <div className="mt-4">
              <label className="t-muted mb-1 block break-keep font-bold text-navy-500" htmlFor="import-client">
                어느 거래처로 넣을까요
              </label>
              <select
                id="import-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="field-input"
              >
                <option value="">거래처를 선택하세요</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!clientId && (
                <p className="t-muted mt-2 break-keep text-amber-700">
                  같은 이름의 거래처를 찾지 못했습니다. 이름만 보고 새로 만들면 같은 병원이 둘이 될 수 있어,
                  거래처는 만들지 않습니다 — 「거래처」 화면에서 먼저 등록한 뒤 다시 오세요.
                </p>
              )}
            </div>
          </div>

          {/* 3. 넣기 전 건수 */}
          {clientId && counts && (
            <div className="card p-4 sm:p-5">
              <p className="t-card mb-3 break-keep text-navy-900">넣기 전에 확인하세요</p>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
                <Count label="등록 예정" n={counts.willImport} tone="teal" />
                <Count label="건너뜀" n={counts.skip} tone="navy" />
                <Count label="충돌" n={counts.conflict} tone="amber" />
                <Count label="오류" n={counts.error} tone="rose" />
                <Count label="확인 필요" n={counts.needsCheck} tone="amber" />
              </div>
              <p className="t-muted mt-3 break-keep">
                「건너뜀」은 이미 같은 기록이 있는 것, 「충돌」은 같은 날인데 값이 다른 것입니다. 둘 다 덮어쓰지
                않습니다. 「확인 필요」는 엑셀에 날짜가 없는 등 시스템이 임의로 정할 수 없는 것들입니다.
              </p>

              {phase !== '완료' && (
                <button
                  className="btn-navy mt-4 disabled:opacity-40"
                  disabled={counts.willImport === 0 || phase === '넣는 중'}
                  onClick={() => void run()}
                >
                  {phase === '넣는 중' ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={17} strokeWidth={2.4} />
                  )}
                  {counts.willImport}건 가져오기
                </button>
              )}
            </div>
          )}

          {/* 4. 결과 + 대조 */}
          {result && <ImportResult plan={checked} clientId={clientId} result={result} />}

          {/* 5. 무엇을 넣는지 / 왜 안 넣는지 */}
          {clientId && <RowTable rows={checked.rows} />}
          {checked.issues.length > 0 && <IssueList plan={checked} />}
        </>
      )}
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 gap-2 rounded-xl bg-navy-50 px-3.5 py-2.5">
      <dt className="t-muted shrink-0 font-bold text-navy-400">{k}</dt>
      <dd className="t-body min-w-0 flex-1 break-keep font-bold text-navy-900">{v}</dd>
    </div>
  )
}

function Count({ label, n, tone }: { label: string; n: number; tone: 'teal' | 'navy' | 'amber' | 'rose' }) {
  const color =
    tone === 'teal' ? 'text-teal-600' : tone === 'amber' ? 'text-amber-600' : tone === 'rose' ? 'text-rose-600' : 'text-navy-500'
  return (
    <div className="kpi-box min-w-0 rounded-2xl bg-navy-50 px-3.5 py-3">
      <p className="t-muted break-keep">{label}</p>
      <p className={`t-stat mt-1 tabular-nums ${n > 0 ? color : 'text-navy-300'}`}>{n}건</p>
    </div>
  )
}

/** 가져온 뒤 — 엑셀 합계와 시스템 합계를 자동으로 맞춰 봅니다 */
function ImportResult({
  plan,
  clientId,
  result,
}: {
  plan: ImportPlan
  clientId: string
  result: { inserted: number; skipped: number; conflict: number; clientFields: number }
}) {
  const { data } = useData()
  const rows = plan.monthly.filter((m) => m.hasDated)
  return (
    <div className="card p-4 sm:p-5">
      <p className="t-card mb-1 break-keep text-navy-900">가져오기 결과</p>
      <p className="t-body break-keep font-bold text-emerald-700">
        {result.inserted}건을 넣었습니다 · 건너뜀 {result.skipped}건 · 충돌 {result.conflict}건
        {result.clientFields > 0 && ` · 거래처 정보 ${result.clientFields}칸`}
      </p>

      <p className="t-card mb-2 mt-4 break-keep text-navy-900">엑셀 합계 ↔ 시스템 합계</p>
      {rows.length === 0 ? (
        <p className="t-muted break-keep">날짜가 있는 달이 없어 대조할 것이 없습니다.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[34rem] border-collapse text-[1rem]">
            <thead>
              <tr className="bg-navy-50 text-navy-500">
                <Th>달</Th>
                <Th className="text-right">엑셀 매출</Th>
                <Th className="text-right">시스템 매출</Th>
                <Th className="text-right">차이</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const sys = settlementFor(data, clientId, m.month).revenue
                const gap = Math.round(sys - m.revenue)
                return (
                  <tr key={m.month} className="border-b border-navy-100">
                    <Td>{m.month}</Td>
                    <Td className="text-right tabular-nums">{won(m.revenue)}</Td>
                    <Td className="text-right tabular-nums">{won(sys)}</Td>
                    <Td className={`text-right tabular-nums font-bold ${gap === 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                      {gap === 0 ? '같음' : won(gap)}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="t-muted mt-2 break-keep">
        날짜가 없어 넣지 못한 달은 여기 나오지 않습니다. 그 달의 엑셀 합계는 아래 「확인 필요」에 그대로
        적어 두었습니다.
      </p>
    </div>
  )
}

function RowTable({ rows }: { rows: PlannedRow[] }) {
  if (!rows.length) return null
  const tone: Record<string, string> = {
    '등록 예정': 'bg-teal-50 text-teal-700',
    건너뜀: 'bg-navy-100 text-navy-500',
    충돌: 'bg-amber-50 text-amber-700',
    오류: 'bg-rose-50 text-rose-600',
  }
  return (
    <div className="card p-4 sm:p-5">
      <p className="t-card mb-3 break-keep text-navy-900">한 줄씩 — 무엇이 들어가고 무엇이 빠지는가</p>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[38rem] border-collapse text-[1rem]">
          <thead>
            <tr className="bg-navy-50 text-navy-500">
              <Th>날짜</Th>
              <Th>내용</Th>
              <Th>상태</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-navy-100 align-top">
                <Td className="whitespace-nowrap">
                  {r.date}
                  {r.dateFrom === '윗줄' && <span className="t-muted block text-navy-400">윗줄에서 이어받음</span>}
                </Td>
                <Td>
                  {r.kind === '수거'
                    ? `${r.wasteType} ${r.kg.toLocaleString()}kg`
                    : Object.entries(r.items)
                        //  화면에는 내부 이름(box35)이 아니라 품목 이름(35L 박스)을 보여 줍니다
                        .map(([k, v]) => `${ITEM_BY_KEY[k as ItemKey]?.label ?? k} ${v}개`)
                        .join(' · ')}
                  <span className="t-muted block text-navy-400">{r.where}</span>
                </Td>
                <Td>
                  <span className={`pill ${tone[r.status] ?? ''}`}>{r.status}</span>
                </Td>
                <Td className="break-keep text-navy-500">{r.reason ?? ''}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IssueList({ plan }: { plan: ImportPlan }) {
  //  같은 이유가 여러 줄로 나오는 것은 한 줄로 접습니다(excelImport.ts 의 group).
  //  더원요양병원 파일은 8줄 중 6줄이 "이 달은 수거 날짜가 없다" 로 같습니다.
  //  실제로 판단할 것은 3가지인데 8가지처럼 보이면, 처음 보는 분은 손도 대기
  //  어렵습니다. 몇 년치를 올리면 수십 줄이 됩니다. 접어 두기만 하고 내용은
  //  하나도 줄이지 않습니다 — 눌러서 전부 보실 수 있습니다.
  const blocks: { group: string | null; items: ImportIssue[] }[] = []
  for (const it of plan.issues) {
    const last = blocks[blocks.length - 1]
    if (it.group && last && last.group === it.group) last.items.push(it)
    else blocks.push({ group: it.group ?? null, items: [it] })
  }

  return (
    <div className="card p-4 sm:p-5">
      <p className="t-card mb-1 break-keep text-navy-900">넣지 않은 것 — 사람이 정해야 합니다</p>
      <p className="t-muted mb-3 break-keep">
        시스템이 임의로 정할 수 없는 것들입니다. 지어내서 넣지 않고 그대로 보여 드립니다.
      </p>
      <ul className="space-y-2">
        {blocks.map((b, i) =>
          b.group && b.items.length > 1 ? (
            <IssueGroup key={i} group={b.group} items={b.items} />
          ) : (
            b.items.map((it, j) => <IssueRow key={`${i}-${j}`} issue={it} />)
          ),
        )}
      </ul>
    </div>
  )
}

/** 같은 이유가 여러 줄 — 접어 두고 눌러서 펼칩니다 */
function IssueGroup({ group, items }: { group: string; items: ImportIssue[] }) {
  const [open, setOpen] = useState(false)
  return (
    <li data-issue-group={group} className="overflow-hidden rounded-2xl bg-navy-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition hover:bg-navy-100"
      >
        <span className="pill shrink-0 bg-amber-50 text-amber-700">확인 필요</span>
        <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-900">
          {group} {items.length}건
        </span>
        <ChevronDown
          size={17}
          className={`shrink-0 text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {/* 접혀 있을 때도 무엇인지 알 수 있게 첫 줄의 설명을 남겨 둡니다 */}
      {!open && items[0].hint && (
        <p className="t-muted -mt-1 break-keep px-3.5 pb-3 text-navy-500">{items[0].hint}</p>
      )}
      {open && (
        <ul className="space-y-1.5 border-t border-navy-200/60 px-3.5 py-3">
          {items.map((it, i) => (
            <li key={i}>
              <span className="t-muted mr-2 font-bold text-navy-400">{it.where}</span>
              <span className="t-body break-keep font-bold text-navy-900">{it.what}</span>
              {it.hint && <p className="t-muted mt-0.5 break-keep">{it.hint}</p>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function IssueRow({ issue: it }: { issue: ImportIssue }) {
  return (
    <li className="rounded-2xl bg-navy-50 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill shrink-0 ${it.level === '오류' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
          {it.level === '오류' ? <AlertTriangle size={13} className="mr-1 inline -translate-y-px" /> : null}
          {it.level}
        </span>
        <span className="t-muted shrink-0 font-bold text-navy-400">{it.where}</span>
      </div>
      <p className="t-body mt-1 break-keep font-bold text-navy-900">{it.what}</p>
      {it.hint && <p className="t-muted mt-0.5 break-keep">{it.hint}</p>}
    </li>
  )
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`border-b border-navy-200 px-2 py-2 text-left font-bold ${className}`}>{children}</th>
}
function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-2 ${className}`}>{children}</td>
}
