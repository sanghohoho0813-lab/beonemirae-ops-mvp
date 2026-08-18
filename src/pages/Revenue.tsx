import { useMemo, useState } from 'react'
import { Pencil, Undo2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { PageShell, SectionTitle, PrimaryButton, SecondaryButton } from '../components/ui'
import { Modal } from '../components/Modal'
import { RevenueKpis } from '../components/RevenueKpis'
import { TaxBaseCard } from '../components/TaxBaseCard'
import {
  monthRevenue,
  revenueSummary,
  SOURCE_WHY,
  type RevenueSource,
} from '../lib/revenue'
import { thisMonth, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 매출 현황
//
//  대표가 「우리 얼마 벌고 있나」에 답하는 화면입니다.
//
//  한 달에 하나의 값
//
//   거래처 × 월 마다 딱 하나만 채택합니다 — 직접입력 > 확정 > Excel 실적 >
//   추정. 같은 거래처의 같은 달이 두 번 더해지지 않습니다. 어느 것을 썼는지
//   줄마다 표시합니다.
//
//  직접입력·조정
//
//   계약서에는 있는데 시스템에 기록이 없는 달, 엑셀 값이 실제와 다른 달을
//   바로잡습니다. **사유를 반드시 적어야 하고**, 기존 값이 있으면 그 값을
//   보여 준 뒤 다시 확인받습니다. 조용히 덮어쓰지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_STYLE: Record<RevenueSource, string> = {
  직접입력: 'bg-violet-50 text-violet-700',
  확정: 'bg-teal-50 text-teal-700',
  'Excel 실적': 'bg-sky-50 text-sky-700',
  추정: 'bg-amber-50 text-amber-700',
}

function SourceChip({ source }: { source: RevenueSource }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.95rem] font-bold ${SOURCE_STYLE[source]}`}>
      {source}
    </span>
  )
}

export function Revenue() {
  const { data, saveRevenueOverride, removeRevenueOverride } = useData()
  const summary = useMemo(() => revenueSummary(data), [data])
  const [month, setMonth] = useState(thisMonth())
  const m = useMemo(() => monthRevenue(data, month), [data, month])

  const [edit, setEdit] = useState<{ clientId: string; name: string } | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const max = Math.max(1, ...summary.trend.map((p) => p.total))

  //  거래처별 기여 — 이 달 상위부터. 화면을 길게 만들지 않도록 접어 둡니다.
  const [allRows, setAllRows] = useState(false)
  const rows = allRows ? m.rows : m.rows.slice(0, 8)

  function openEdit(clientId: string, name: string) {
    const cur = (data.revenueOverrides ?? []).find((o) => o.clientId === clientId && o.month === month)
    setAmount(cur ? String(cur.amount) : '')
    setReason(cur?.reason ?? '')
    setEdit({ clientId, name })
    setMsg(null)
  }

  async function save() {
    if (!edit) return
    const n = Number(amount.replace(/[,\s]/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      setMsg({ ok: false, text: '금액을 숫자로 넣어 주세요 (0원 이상).' })
      return
    }
    if (!reason.trim()) {
      setMsg({ ok: false, text: '사유를 적어 주세요. 몇 달 뒤에 왜 이 금액인지 답할 수 있어야 합니다.' })
      return
    }
    //  기존 값이 있으면 조용히 덮지 않습니다 — 무엇이 바뀌는지 보여 주고 확인.
    const row = m.rows.find((r) => r.clientId === edit.clientId)
    if (
      row &&
      !window.confirm(
        `${edit.name} ${month.replace('-', '년 ')}월 매출\n\n` +
          `지금 값 ${won(row.amount)} (${row.source})\n` +
          `→ 직접입력 ${won(n)}\n\n` +
          '이 달의 회사 매출이 바뀝니다. 사유와 함께 기록에 남습니다. 진행할까요?',
      )
    ) {
      return
    }
    setBusy(true)
    const r = await saveRevenueOverride({ clientId: edit.clientId, month, amount: n, reason: reason.trim() })
    setBusy(false)
    if (r.ok) {
      setEdit(null)
      setMsg({
        ok: true,
        text:
          r.before == null
            ? `${edit.name} ${month} 매출을 ${won(n)}으로 넣었습니다.`
            : `${edit.name} ${month} 매출을 ${won(r.before)} → ${won(n)}으로 조정했습니다.`,
      })
    } else {
      setMsg({ ok: false, text: r.error ?? '저장하지 못했습니다.' })
    }
  }

  async function undo(clientId: string, name: string) {
    if (!window.confirm(`${name} ${month} 매출 조정을 되돌립니다.\n확정 청구 · Excel 실적 · 추정 순서로 돌아갑니다.`)) return
    const r = await removeRevenueOverride(clientId, month)
    setMsg({ ok: r.ok, text: r.ok ? `${name} ${month} 조정을 되돌렸습니다.` : (r.error ?? '되돌리지 못했습니다.') })
  }

  return (
    <PageShell>
      <PageHeader title="매출 현황" subtitle="한 달에 하나의 값만 집계합니다 — 어느 것을 썼는지 함께 표시합니다" />

      <RevenueKpis />

      {/*
        이 화면의 다른 숫자는 시스템에 쌓인 것이고, 아래는 국세청에 신고한
        값입니다. 둘을 섞지 않고 출처를 밝혀서 따로 보여 줍니다.
      */}
      <TaxBaseCard />

      {msg && (
        <div
          data-revenue-msg
          className={`card p-4 text-[1.05rem] font-bold ${msg.ok ? 'border-teal-200 bg-teal-50/60 text-teal-700' : 'border-rose-200 bg-rose-50/60 text-rose-600'}`}
        >
          {msg.text}
        </div>
      )}

      {/* 12개월 추이 — 막대 하나에 한 달. 진행 중인 달은 빗금으로 구분합니다 */}
      <section>
        <SectionTitle>최근 12개월 매출</SectionTitle>
        <div className="card p-4 sm:p-5" data-revenue-trend>
          <div className="flex items-end gap-1.5 sm:gap-2.5" style={{ height: 160 }}>
            {summary.trend.map((p) => (
              <button
                key={p.month}
                type="button"
                data-revenue-bar={p.month}
                onClick={() => setMonth(p.month)}
                title={`${p.month} · ${won(p.total)}`}
                /*  ⚠ 누르는 자리를 **기둥 전체 높이**로 잡습니다.
                    items-end 라 버튼이 제 내용 높이(작은 달은 34px)밖에 안 돼서,
                    폰에서 막대 위쪽 빈 곳을 눌러도 아무 일이 없었습니다.
                    self-stretch 로 160px 을 다 차지하게 하면 기둥 어디를 눌러도
                    그 달이 열립니다 — 보이는 막대 모양은 그대로입니다. */
                className="flex min-w-0 flex-1 flex-col justify-end gap-1 self-stretch rounded-t-lg transition hover:opacity-80"
              >
                <span className="block text-center text-[0.82rem] font-bold tabular-nums text-navy-400 sm:text-[0.9rem]">
                  {p.total > 0 ? Math.round(p.total / 10000).toLocaleString('ko-KR') : ''}
                </span>
                <span
                  className={`block w-full rounded-t-md ${
                    month === p.month ? 'bg-navy-800' : p.partial ? 'bg-navy-200' : 'bg-teal-400'
                  }`}
                  style={{ height: Math.max(3, Math.round((p.total / max) * 118)) }}
                />
                <span className="block text-center text-[0.82rem] font-semibold text-navy-400 sm:text-[0.9rem]">
                  {p.month.slice(5)}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 break-keep text-[0.96rem] text-navy-400">
            단위 만원 · 회색 막대는 아직 끝나지 않은 달입니다 (평균·예상 계산에서 뺍니다). 막대를 누르면 그 달
            내역을 봅니다.
          </p>
        </div>
      </section>

      {/* 그 달 내역 */}
      <section>
        <SectionTitle
          action={
            <span className="pill bg-navy-50 text-navy-600">
              {month.replace('-', '년 ')}월 · {won(m.total)}
            </span>
          }
        >
          거래처별 매출
        </SectionTitle>

        {/* 이 달 숫자가 무엇으로 이루어졌는지 */}
        <div className="card mb-3 flex flex-wrap gap-x-4 gap-y-2 p-4" data-revenue-mix>
          {(Object.keys(m.bySource) as RevenueSource[])
            .filter((s) => m.bySource[s] > 0)
            .map((s) => (
              <span key={s} className="flex items-center gap-2">
                <SourceChip source={s} />
                <span className="tabular-nums font-bold text-navy-800">{won(m.bySource[s])}</span>
              </span>
            ))}
          {m.total === 0 && <span className="text-[1.02rem] text-navy-400">이 달에는 집계된 매출이 없습니다.</span>}
        </div>

        {m.rows.length > 0 && (
          <div className="card divide-y divide-navy-100">
            {rows.map((r) => (
              <div key={r.clientId} data-revenue-row={r.clientId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-4">
                <span className="min-w-0 flex-1 basis-[9rem] break-keep font-bold text-navy-900">{r.clientName}</span>
                <SourceChip source={r.source} />
                {r.replaced && (
                  <span data-revenue-replaced={r.clientId} className="shrink-0 break-keep text-[0.96rem] text-navy-400">
                    {r.replaced.source} {won(r.replaced.amount)} 대신
                  </span>
                )}
                {r.reason && (
                  <span className="shrink-0 break-keep text-[0.96rem] text-navy-400">사유 · {r.reason}</span>
                )}
                <span className="shrink-0 tabular-nums text-lg font-extrabold text-navy-900">{won(r.amount)}</span>
                <span className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    data-revenue-edit={r.clientId}
                    onClick={() => openEdit(r.clientId, r.clientName)}
                    className="rounded-full bg-navy-50 px-3 py-1.5 text-[0.98rem] font-bold text-navy-600 transition hover:bg-navy-100"
                  >
                    <Pencil size={13} className="mr-1 inline -translate-y-px" />
                    직접입력
                  </button>
                  {r.source === '직접입력' && (
                    <button
                      type="button"
                      data-revenue-undo={r.clientId}
                      onClick={() => void undo(r.clientId, r.clientName)}
                      className="rounded-full bg-white px-3 py-1.5 text-[0.98rem] font-bold text-navy-500 transition hover:bg-navy-100"
                    >
                      <Undo2 size={13} className="mr-1 inline -translate-y-px" />
                      되돌리기
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {m.rows.length > rows.length && (
          <button
            type="button"
            data-revenue-more-rows
            onClick={() => setAllRows(true)}
            className="mt-2 w-full rounded-2xl bg-navy-50 py-2.5 text-[1.02rem] font-bold text-navy-600 transition hover:bg-navy-100"
          >
            나머지 {m.rows.length - rows.length}곳 보기
          </button>
        )}

        {/*  기록이 아예 없는 거래처도 넣을 수 있어야 합니다 */}
        <details className="mt-3">
          <summary className="cursor-pointer px-1 text-[1.02rem] font-bold text-navy-500">
            이 달에 안 잡힌 거래처에 매출 넣기
          </summary>
          <div className="card mt-2 flex flex-wrap gap-2 p-4">
            {data.clients
              .filter((c) => !m.rows.some((r) => r.clientId === c.id))
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-revenue-add={c.id}
                  onClick={() => openEdit(c.id, c.name)}
                  className="rounded-2xl bg-navy-50 px-3.5 py-2 text-[1rem] font-bold text-navy-600 transition hover:bg-navy-100"
                >
                  {c.name}
                </button>
              ))}
          </div>
        </details>
      </section>

      {/* 출처가 무슨 뜻인지 */}
      <section>
        <SectionTitle>숫자의 출처</SectionTitle>
        <div className="card divide-y divide-navy-100" data-revenue-legend>
          {(Object.keys(SOURCE_WHY) as RevenueSource[]).map((s, i) => (
            <div key={s} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5">
              <span className="w-6 shrink-0 text-[0.95rem] font-black text-navy-300">{i + 1}</span>
              <SourceChip source={s} />
              <span className="min-w-0 flex-1 break-keep text-[1.02rem] text-navy-600">{SOURCE_WHY[s]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 break-keep px-1 text-[0.98rem] leading-snug text-navy-400">
          거래처 한 곳의 한 달은 위에서부터 처음 만나는 것 <b className="text-navy-600">하나만</b> 씁니다. 같은
          달이 두 번 더해지지 않습니다.
        </p>
      </section>

      {edit && (
        <Modal open title={`${edit.name} · ${month.replace('-', '년 ')}월 매출`} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <p className="break-keep text-[1.02rem] leading-relaxed text-navy-500">
              계약서에는 있는데 기록이 없는 달, 엑셀 값이 실제와 다른 달을 바로잡습니다. 넣은 값이 그 달 이
              거래처의 매출로 쓰입니다.
            </p>
            <label className="block">
              <span className="t-label block text-navy-500">매출액 (원)</span>
              <input
                data-revenue-amount
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예: 1250000"
                className="field-input mt-1 w-full"
              />
            </label>
            <label className="block">
              <span className="t-label block text-navy-500">사유 (필수)</span>
              <input
                data-revenue-reason
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 계약서상 월정액 · 시스템 기록 누락분"
                className="field-input mt-1 w-full"
              />
            </label>
            {msg && !msg.ok && (
              <p data-revenue-modal-error className="break-keep rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[1.02rem] font-bold text-rose-600">
                {msg.text}
              </p>
            )}
            <div className="flex gap-2">
              <PrimaryButton onClick={() => void save()} disabled={busy}>
                <span data-revenue-save>{busy ? '저장하는 중…' : '저장'}</span>
              </PrimaryButton>
              <SecondaryButton onClick={() => setEdit(null)}>취소</SecondaryButton>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}
