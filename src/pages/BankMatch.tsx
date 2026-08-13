import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, Landmark, Loader2, Upload } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { PageShell, SectionTitle, ExpandableSection, PrimaryButton } from '../components/ui'
import { readWorkbook, type Sheet } from '../lib/xlsx'
import {
  guessColumns,
  matchLines,
  readLines,
  summarize,
  type ColumnGuess,
  type MatchRow,
} from '../lib/bankImport'
import { won, prettyDate } from '../lib/format'
import { friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 통장 입금 대사
//
//  통장 입금내역 파일을 올려 미수 청구와 맞춰 붙입니다.
//
//  흐름은 한 방향입니다.
//    파일 고르기 → 어느 열이 날짜·금액·적요인지 확인 → 대사 결과 확인 →
//    「확실」만 기록 → 나머지는 화면에 남겨 사람이 처리
//
//  가운데의 「확인」을 건너뛰지 않습니다. 은행마다 파일이 달라 열 추정이
//  틀릴 수 있고, 돈 기록은 한번 틀리면 미수금이 통째로 어긋납니다.
// ─────────────────────────────────────────────────────────────────────────────

type Phase = '대기' | '읽는 중' | '확인' | '기록 중' | '완료'

/** CSV 를 아주 단순하게 나눕니다 (따옴표 안의 쉼표까지) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const LEVEL_STYLE: Record<string, string> = {
  확실: 'bg-teal-50 text-teal-700',
  '확인 필요': 'bg-amber-50 text-amber-700',
  '못 찾음': 'bg-navy-100 text-navy-500',
}

function LineRow({ r, onPick }: { r: MatchRow; onPick?: (paymentId: string) => void }) {
  return (
    <div data-bank-row={r.line.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3.5">
      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[0.98rem] font-bold ${LEVEL_STYLE[r.level]}`}>
        {r.already ? '이미 기록' : r.level}
      </span>
      <span className="shrink-0 rounded-lg bg-navy-50 px-2.5 py-1 text-[0.98rem] font-bold text-navy-600">
        {r.line.date}
      </span>
      <span className="shrink-0 tabular-nums font-extrabold text-navy-900">{won(r.line.amount)}</span>
      <span className="min-w-0 flex-1 basis-[8rem] break-keep font-semibold text-navy-700">
        {r.line.description || <span className="text-navy-300">적요 없음</span>}
      </span>
      {r.best && (
        <span className="shrink-0 break-keep font-bold text-teal-700">
          → {r.best.clientName} {r.best.month}월
        </span>
      )}
      <span className="w-full break-keep text-[0.98rem] text-navy-400 sm:w-auto">{r.reason}</span>
      {onPick && r.candidates.length > 0 && (
        <span className="flex w-full flex-wrap gap-1.5 sm:w-auto">
          {r.candidates.map((c) => (
            <button
              key={c.paymentId}
              type="button"
              data-bank-pick={`${r.line.ref}|${c.paymentId}`}
              onClick={() => onPick(c.paymentId)}
              className="rounded-xl bg-navy-50 px-2.5 py-1.5 text-[0.98rem] font-bold text-navy-700 transition hover:bg-navy-100"
            >
              {c.clientName} {c.month}월 · 남은 {won(c.outstanding)}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}

export function BankMatch() {
  const { data, addReceipt, reload } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('대기')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [fileName, setFileName] = useState('')
  const [cols, setCols] = useState<ColumnGuess | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: number; failed: { ref: string; error: string }[] } | null>(null)
  const [progress, setProgress] = useState(0)

  const lines = useMemo(() => (sheet && cols ? readLines(sheet, cols) : []), [sheet, cols])
  const rows = useMemo(() => matchLines(data, lines), [data, lines])
  const sum = useMemo(() => summarize(rows), [rows])

  const pick = async (r: MatchRow, paymentId: string) => {
    setError(null)
    const res = await addReceipt({
      paymentId,
      receivedOn: r.line.date,
      amount: r.line.amount,
      method: '계좌이체',
      memo: `통장 대사 · ${r.line.description}`.trim(),
      sourceRef: r.line.ref,
    })
    if (!res.ok) setError(res.error ?? '기록하지 못했습니다.')
  }

  const onFile = async (f: File) => {
    setPhase('읽는 중')
    setError(null)
    setResult(null)
    setFileName(f.name)
    try {
      let s: Sheet
      if (/\.csv$/i.test(f.name)) {
        const text = new TextDecoder('utf-8').decode(await f.arrayBuffer())
        if (text.includes('�')) {
          throw new Error(
            'CSV 글자가 깨져 있습니다. 은행에서 받은 파일을 엑셀로 열어 .xlsx 로 저장한 뒤 올려 주세요.',
          )
        }
        s = { name: f.name, rows: parseCsv(text) }
      } else {
        const sheets = await readWorkbook(await f.arrayBuffer())
        if (!sheets.length) throw new Error('시트를 읽지 못했습니다.')
        //  줄이 가장 많은 시트를 씁니다 (은행 파일은 보통 시트가 하나입니다).
        s = sheets.slice().sort((a, b) => b.rows.length - a.rows.length)[0]
      }
      setSheet(s)
      setCols(guessColumns(s))
      setPhase('확인')
    } catch (e) {
      setError(friendlyError(e))
      setPhase('대기')
    }
  }

  const applySure = async () => {
    const targets = rows.filter((r) => r.level === '확실' && r.best)
    setPhase('기록 중')
    setProgress(0)
    setError(null)
    const failed: { ref: string; error: string }[] = []
    let okCount = 0
    for (const [i, r] of targets.entries()) {
      const res = await addReceipt({
        paymentId: r.best!.paymentId,
        receivedOn: r.line.date,
        amount: r.line.amount,
        method: '계좌이체',
        memo: `통장 대사 · ${r.line.description}`.trim(),
        sourceRef: r.line.ref,
      })
      if (res.ok) okCount++
      else failed.push({ ref: r.line.ref, error: res.error ?? '알 수 없는 오류' })
      setProgress(i + 1)
    }
    await reload()
    setResult({ ok: okCount, failed })
    setPhase('완료')
  }

  const colSelect = (key: 'date' | 'amount' | 'description', label: string) => (
    <label className="flex items-center gap-2">
      <span className="shrink-0 text-[1.02rem] font-bold text-navy-600">{label}</span>
      <select
        value={cols ? cols[key] : -1}
        data-bank-col={key}
        onChange={(e) => cols && setCols({ ...cols, [key]: Number(e.target.value) })}
        className="field-input w-auto py-1.5"
      >
        <option value={-1}>— 없음 —</option>
        {(cols?.headers ?? []).map((h, i) => (
          <option key={i} value={i}>
            {i + 1}번째 열{h ? ` · ${h}` : ''}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <PageShell>
      <div data-bank-page>
        <PageHeader title="통장 입금 대사" subtitle="통장 입금내역 파일을 올려 미수 청구와 맞춰 붙입니다" />
      </div>

      <div className="card flex gap-3 p-4 sm:p-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500">
          <Landmark size={18} />
        </span>
        <div className="min-w-0 space-y-2 text-[1.05rem] leading-relaxed text-navy-600">
          <p>
            은행 서식을 코드에 박아 두지 않습니다. 파일을 읽어 <b className="text-navy-800">어느 열이 날짜·금액·적요인지
            추정</b>하고, 그 추정을 보여 드립니다. 틀리면 바로 고칠 수 있습니다.
          </p>
          <p>
            자동으로 기록하는 것은 <b className="text-navy-800">「확실」뿐</b>입니다 — 적요에 거래처 이름이 있고 금액이 남은
            미수와 정확히 같은 줄. 하나라도 어긋나면 「확인 필요」로 남겨 대표님이 고르게 합니다.
          </p>
          <p className="rounded-xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] text-navy-500">
            같은 통장 줄은 두 번 기록되지 않습니다(날짜·금액·적요로 확인). 파일을 다시 올려도 돈이 두 배가 되지 않습니다.
            출금 줄과 0원 줄은 읽지 않습니다.
          </p>
        </div>
      </div>

      {/* 파일 */}
      <div className="card p-4 sm:p-5">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={() => fileRef.current?.click()} disabled={phase === '읽는 중' || phase === '기록 중'}>
            <span data-bank-choose className="flex items-center gap-1.5">
              {phase === '읽는 중' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              통장 내역 파일 고르기
            </span>
          </PrimaryButton>
          <span className="break-keep text-[1.02rem] text-navy-500">
            {fileName || '엑셀(.xlsx) 또는 CSV'}
          </span>
        </div>
        {error && (
          <p data-bank-error className="mt-3 break-keep rounded-xl bg-rose-50 px-3.5 py-2.5 text-[1.02rem] font-semibold text-rose-600">
            {error}
          </p>
        )}
      </div>

      {/* 열 확인 */}
      {cols && sheet && (
        <section>
          <SectionTitle>어느 열이 무엇인지</SectionTitle>
          <div className="card p-4 sm:p-5" data-bank-cols>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {colSelect('date', '날짜')}
              {colSelect('amount', '입금액')}
              {colSelect('description', '적요·보낸분')}
            </div>
            <p className="mt-3 break-keep text-[0.98rem] text-navy-400">
              {cols.headerRow + 1}번째 줄을 머리글로 봤습니다 · 읽은 입금 줄 {lines.length.toLocaleString('ko-KR')}건
              {lines.length === 0 && ' — 열을 바꿔 보세요'}
            </p>
            <ExpandableSection label="파일 앞부분 그대로 보기">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-left text-[0.98rem]">
                  <tbody className="divide-y divide-navy-50">
                    {sheet.rows.slice(0, 8).map((row, i) => (
                      <tr key={i} className={i === cols.headerRow ? 'bg-navy-50 font-bold' : ''}>
                        {row.slice(0, 8).map((c, j) => (
                          <td key={j} className="px-2.5 py-1.5 text-navy-600">
                            {c == null ? '' : String(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ExpandableSection>
          </div>
        </section>
      )}

      {/* 대사 결과 */}
      {lines.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-bank-summary>
            <div className="card p-4">
              <p className="text-[1.03rem] font-semibold text-navy-400">확실 — 바로 기록</p>
              <p className="mt-1.5 text-2xl font-extrabold text-teal-600">
                {sum.sure}
                <span className="ml-0.5 text-base text-navy-300">건</span>
              </p>
              <p className="mt-0.5 text-[0.98rem] text-navy-400">{won(sum.sureAmount)}</p>
            </div>
            <div className="card p-4">
              <p className="text-[1.03rem] font-semibold text-navy-400">확인 필요</p>
              <p className="mt-1.5 text-2xl font-extrabold text-amber-600">
                {sum.check}
                <span className="ml-0.5 text-base text-navy-300">건</span>
              </p>
            </div>
            <div className="card p-4">
              <p className="text-[1.03rem] font-semibold text-navy-400">못 찾음</p>
              <p className="mt-1.5 text-2xl font-extrabold text-navy-900">
                {sum.none}
                <span className="ml-0.5 text-base text-navy-300">건</span>
              </p>
            </div>
            <div className="card p-4">
              <p className="text-[1.03rem] font-semibold text-navy-400">이미 기록</p>
              <p className="mt-1.5 text-2xl font-extrabold text-navy-400">
                {sum.already}
                <span className="ml-0.5 text-base text-navy-300">건</span>
              </p>
            </div>
          </div>

          <div className="card flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <PrimaryButton onClick={applySure} disabled={phase === '기록 중' || sum.sure === 0}>
              <span data-bank-apply>
                {phase === '기록 중'
                  ? `기록하는 중… ${progress}/${sum.sure}`
                  : `확실한 ${sum.sure}건 기록하기`}
              </span>
            </PrimaryButton>
            {sum.sure === 0 && (
              <p className="break-keep text-[1.03rem] text-navy-400">
                자동으로 기록할 수 있는 줄이 없습니다 — 아래에서 하나씩 골라 주세요.
              </p>
            )}
          </div>

          {result && (
            <div data-bank-result className="card flex gap-3 border-teal-200 bg-teal-50/60 p-4 sm:p-5">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-600" />
              <div className="min-w-0 text-[1.05rem] leading-relaxed text-navy-700">
                <p className="font-bold text-teal-700">입금 {result.ok.toLocaleString('ko-KR')}건을 기록했습니다</p>
                {result.failed.length > 0 && (
                  <p className="mt-1 text-rose-600">
                    {result.failed.length}건은 기록하지 못했습니다 — {result.failed[0].error}
                  </p>
                )}
                <p className="mt-1 text-navy-500">「결제·미수금」과 거래처 화면에 바로 반영됩니다.</p>
              </div>
            </div>
          )}

          {/* 확실 */}
          {sum.sure > 0 && (
            <section>
              <SectionTitle>확실 {sum.sure}건</SectionTitle>
              <div className="card divide-y divide-navy-100" data-bank-sure>
                {rows.filter((r) => r.level === '확실').map((r) => (
                  <LineRow key={r.line.ref} r={r} />
                ))}
              </div>
            </section>
          )}

          {/* 확인 필요 */}
          {sum.check > 0 && (
            <section>
              <SectionTitle>확인 필요 {sum.check}건</SectionTitle>
              <div className="card divide-y divide-navy-100" data-bank-check>
                {rows.filter((r) => r.level === '확인 필요').map((r) => (
                  <LineRow key={r.line.ref} r={r} onPick={(pid) => void pick(r, pid)} />
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1.5 px-1 text-[0.98rem] text-navy-400">
                <HelpCircle size={14} /> 버튼을 누르면 그 청구에 이 금액이 입금으로 기록됩니다. 금액이 남은 미수보다
                적으면 부분입금으로 남습니다.
              </p>
            </section>
          )}

          {/* 못 찾음 · 이미 기록 */}
          {(sum.none > 0 || sum.already > 0) && (
            <section>
              <SectionTitle>붙이지 못한 줄 {sum.none + sum.already}건</SectionTitle>
              <ExpandableSection label={`${sum.none + sum.already}건 보기`}>
                <div className="card divide-y divide-navy-100" data-bank-none>
                  {rows.filter((r) => r.level === '못 찾음').map((r) => (
                    <LineRow key={r.line.ref} r={r} />
                  ))}
                </div>
              </ExpandableSection>
              <p className="mt-2 flex items-center gap-1.5 px-1 text-[0.98rem] text-navy-400">
                <AlertTriangle size={14} /> 청구가 아직 없거나(정산 확정 전), 다른 명목의 입금일 수 있습니다. 지어내서
                붙이지 않았습니다.
              </p>
            </section>
          )}

          <p className="px-1 text-[0.98rem] text-navy-400">
            읽은 기간 {lines.length > 0 && `${prettyDate(lines[0].date)} ~ ${prettyDate(lines[lines.length - 1].date)}`} ·
            합계 {won(sum.totalAmount)} · 기록은 모두 감사로그에 남습니다.
          </p>
        </>
      )}
    </PageShell>
  )
}
