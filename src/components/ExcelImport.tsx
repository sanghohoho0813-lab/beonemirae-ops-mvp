import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
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
  type PlanCounts,
  type PlannedRow,
} from '../lib/excelImport'
import { ITEM_BY_KEY, settlementFor, type ItemKey } from '../lib/billing'
import { importExcelRows } from '../lib/repo'
import { emptyClientForm } from './ClientForm'
import { friendlyError } from '../lib/supabase'
import { won } from '../lib/format'
import { findNameMatches, sameClientName } from '../lib/clientName'

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
  const { data, reload, addClient } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('대기')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number; conflict: number; clientFields: number; months: number } | null>(null)
  const [creating, setCreating] = useState(false)

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

  //  이 파일에서 실제로 저장될 것 — 날짜별 기록 + 월 실적.
  //
  //   예전에는 날짜별 기록만 셌습니다. 그래서 오남한양병원처럼 명세서에
  //   날짜가 없는 파일은 「등록 예정 0건」이 되어 **가져오기 버튼이 잠겼고**,
  //   8개월치 월 실적을 저장할 방법이 아예 없었습니다. 이미 한 번 넣은
  //   파일을 다시 올릴 때도 전부 「건너뜀」이라 같은 상태가 됐습니다.
  //   월 실적 기능을 정작 필요한 경우에 쓸 수 없었던 것입니다.
  const newMonths = checked
    ? checked.monthly.filter(
        (m) => !(data.monthlyActuals ?? []).some((a) => a.clientId === clientId && a.month === m.month),
      ).length
    : 0
  const savable = (counts?.willImport ?? 0) + newMonths

  //  파일의 거래처가 아직 시스템에 없을 때, 이름이 비슷한 곳이 있는지 봅니다.
  //  「서울인화스포츠마취통증」과 「…의학과의원」처럼 한쪽이 다른 쪽의 앞부분인
  //  경우가 실제로 있어, 그대로 새로 만들면 같은 병원이 둘이 됩니다.
  const matches = findNameMatches(checked?.client?.name ?? '', clients)
  const similar = matches.map((m) => m.client)

  /**
   * 파일 내용 그대로 거래처를 새로 만들고, 이어서 그 거래처로 가져옵니다.
   *
   *  예전에는 "「거래처」 화면에서 먼저 등록한 뒤 다시 오세요" 였습니다.
   *  거래처가 10곳이면 상호·계약일·결제조건을 열 번 옮겨 적고 열 번 되돌아
   *  와야 했습니다. 파일에 이미 다 적혀 있는 값입니다.
   *
   *  그래도 자동으로 만들지는 않습니다 — 누를 때만 만듭니다. 이름만 보고
   *  말없이 만들면 같은 병원이 둘이 되는 사고가 그대로 남습니다.
   */
  async function createClientFromFile(allowDuplicate = false) {
    const prof = checked?.client
    if (!prof?.name) return
    setCreating(true)
    setError(null)
    try {
      const created = await addClient({
        ...emptyClientForm,
        name: prof.name,
        contractStart: prof.contractStart,
        contractEnd: prof.contractEnd,
        paymentTerms: prof.paymentTerms,
        paymentDueDay: prof.paymentDueDay,
        //  단가·정산규칙도 파일에서 그대로. 여기서 넣어 두면 가져오기 직후
        //  바로 이 거래처의 정산·명세서가 실제 계약대로 계산됩니다.
        pricing: Object.keys(prof.pricing).length ? prof.pricing : undefined,
      }, { allowDuplicate })
      if (created) setClientId(created.id)
      else setError('거래처를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setCreating(false)
    }
  }

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
      //  이름 맞대보기는 서버(0045)와 같은 규칙을 씁니다 — 띄어쓰기·(주)·
      //  의료법인만 다른 이름도 같은 곳으로 봅니다. 규칙이 갈리면 화면이
      //  「새로 만들기」를 권하고 서버가 그걸 막습니다.
      const hit = next.client
        ? clients.find((c) => sameClientName(c.name, next.client!.name))
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
        `${target?.name} 에 넣습니다.\n\n` +
          `수거·자재 ${rows.length}건` +
          (newMonths > 0 ? `\n엑셀 월 실적 ${newMonths}개월` : '') +
          `\n\n건너뜀 ${c.skip}건 · 충돌 ${c.conflict}건 · 오류 ${c.error}건\n` +
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
        //  월 합계 — 날짜가 없어 수거로 만들 수 없는 달의 실적입니다.
        //  이것을 넘기지 않으면 거래처 화면이 텅 빈 채로 남습니다(0025).
        monthly: checked.monthly,
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
      <div className="rounded-2xl border border-dashed border-navy-200 bg-navy-50 p-4 sm:p-5">
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
              {/*  파일의 거래처가 시스템에 없을 때.
                   예전에는 "「거래처」 화면에서 먼저 등록한 뒤 다시 오세요" 라고만
                   했습니다. 상호·계약일·결제조건·단가가 파일에 이미 다 적혀 있는데
                   사람이 옮겨 적고 되돌아와야 했습니다. 여기서 바로 만듭니다 —
                   다만 **누를 때만** 만듭니다. */}
              {!clientId && checked.client?.name && (
                <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3.5">
                  <p className="t-body break-keep font-bold text-amber-800">
                    「{checked.client.name}」 은(는) 아직 등록된 거래처가 아닙니다.
                  </p>
                  {similar.length > 0 ? (
                    <>
                      <p className="t-muted mt-1.5 break-keep text-amber-700">
                        이름이 비슷한 거래처가 있습니다 — {similar.map((c) => `「${c.name}」`).join(', ')}.
                        같은 병원이라면 위에서 그 거래처를 고르세요. 정말 다른 곳일 때만 새로 만드세요.
                      </p>
                      <button
                        className="btn-ghost mt-2.5"
                        disabled={creating}
                        onClick={() => {
                          if (window.confirm(`비슷한 이름의 거래처가 이미 있습니다.\n\n「${checked.client!.name}」 을(를) 그래도 새 거래처로 만들까요?`))
                            //  사람이 「그래도」를 눌렀으므로 다른 병원이라는 판단입니다.
                            //  서버가 그 판단을 기록에 남깁니다 (0045).
                            void createClientFromFile(true)
                        }}
                      >
                        {creating ? <Loader2 size={16} className="animate-spin" /> : null}
                        그래도 새 거래처로 만들기
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="t-muted mt-1.5 break-keep text-amber-700">
                        파일에 적힌 상호·계약기간·결제조건·단가를 그대로 넣어 새로 만듭니다. 만든 뒤에 바로
                        이어서 가져올 수 있습니다.
                      </p>
                      <button
                        data-create-client
                        className="btn-navy mt-2.5"
                        disabled={creating}
                        onClick={() => void createClientFromFile()}
                      >
                        {creating ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} strokeWidth={2.4} />}
                        「{checked.client.name}」 거래처로 만들기
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3. 넣기 전 건수 */}
          {clientId && counts && (
            <div className="card p-4 sm:p-5">
              {/*  판정 — "틀린 내용이 없는가"를 화면이 먼저 답합니다.
                   건수 5칸만 보여 주면 그 숫자들이 괜찮은 것인지 사람이 매번
                   판단해야 합니다. 넣지 못하는 것(오류)과 사람이 정해야 하는
                   것(충돌·확인 필요)이 하나도 없으면 그대로 옮겨도 되는 파일입니다. */}
              <Verdict counts={counts} name={target?.name ?? ''} />
              <p className="t-card mb-3 mt-4 break-keep text-navy-900">넣기 전에 확인하세요</p>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
                <Count label="등록 예정" n={counts.willImport} tone="teal" />
                <Count label="월 실적" n={newMonths} tone="teal" />
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
                  data-import-run
                  className="btn-navy mt-4 disabled:opacity-40"
                  disabled={savable === 0 || phase === '넣는 중'}
                  onClick={() => void run()}
                >
                  {phase === '넣는 중' ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={17} strokeWidth={2.4} />
                  )}
                  {(() => {
                    //  무엇이 저장되는지 그대로 적습니다 — 날짜 기록이 없고
                    //  월 실적만 있는 파일이 실제로 있습니다(오남한양·남양주백).
                    const parts = [
                      counts.willImport > 0 ? `${counts.willImport}건` : '',
                      newMonths > 0 ? `월 실적 ${newMonths}개월` : '',
                    ].filter(Boolean)
                    const what = parts.join(' + ') || '가져올 것 없음'
                    return counts.error + counts.conflict + counts.needsCheck === 0
                      ? `이상 없음 — ${what} 그대로 옮기기`
                      : `${what} 가져오기`
                  })()}
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

/**
 * 이 파일을 그대로 옮겨도 되는지에 대한 한 줄 답.
 *
 *  「틀린 내용 없으면 그대로 옮기고 싶다」가 실제 요구입니다. 그런데
 *  건수 5칸(등록·건너뜀·충돌·오류·확인 필요)만 있으면, 그 숫자 조합이
 *  괜찮은 것인지 사람이 매번 해석해야 합니다. 해석을 여기서 합니다.
 *
 *   · 오류      = 시스템이 넣을 수 없는 줄 (금액 안 맞음·미래 날짜 등)
 *   · 충돌      = 이미 있는데 값이 다름 — 어느 쪽이 맞는지는 사람이 정함
 *   · 확인 필요 = 날짜가 없는 등 임의로 정하면 안 되는 것
 *
 *  셋 다 0 이면 그대로 옮겨도 되는 파일입니다. 「건너뜀」은 이미 같은 값이
 *  들어 있다는 뜻이라 문제가 아닙니다.
 */
function Verdict({ counts, name }: { counts: PlanCounts; name: string }) {
  const needsEye = counts.error + counts.conflict + counts.needsCheck
  const clean = needsEye === 0   // 「안내」는 판정을 막지 않습니다
  const parts = [
    counts.error > 0 ? `넣을 수 없는 줄 ${counts.error}건` : '',
    counts.conflict > 0 ? `값이 다른 줄 ${counts.conflict}건` : '',
    counts.needsCheck > 0 ? `확인 필요 ${counts.needsCheck}건` : '',
  ].filter(Boolean)

  return (
    <div
      data-verdict={clean ? 'clean' : 'check'}
      className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 ${clean ? 'bg-teal-50' : 'bg-amber-50'}`}
    >
      {clean ? (
        <CheckCircle2 size={20} strokeWidth={2.4} className="mt-0.5 shrink-0 text-teal-600" />
      ) : (
        <AlertTriangle size={20} strokeWidth={2.4} className="mt-0.5 shrink-0 text-amber-700" />
      )}
      <div className="min-w-0">
        <p className={`t-body break-keep font-extrabold ${clean ? 'text-teal-800' : 'text-amber-800'}`}>
          {clean
            ? `이상 없습니다 — ${name} 로 그대로 옮겨도 됩니다`
            : `${parts.join(' · ')} — 아래에서 확인해 주세요`}
        </p>
        <p className={`t-muted mt-1 break-keep ${clean ? 'text-teal-700' : 'text-amber-700'}`}>
          {clean
            ? counts.skip > 0
              ? `${counts.willImport}건이 새로 들어가고, 이미 있는 ${counts.skip}건은 그대로 둡니다.`
              : `${counts.willImport}건이 새로 들어갑니다. 금액·수량은 파일과 하나도 다르지 않습니다.`
            : '표시된 것들은 넣지 않습니다. 나머지는 그대로 옮길 수 있습니다.'}
          {counts.info > 0 ? ` 옮기지 않는 항목 ${counts.info}건은 아래 「안내」에 적어 두었습니다.` : ''}
        </p>
      </div>
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
    tone === 'teal' ? 'text-teal-600' : tone === 'amber' ? 'text-amber-700' : tone === 'rose' ? 'text-rose-600' : 'text-navy-500'
  return (
    <div className="kpi-box min-w-0 rounded-2xl bg-navy-50 px-3.5 py-3">
      <p className="t-muted break-keep">{label}</p>
      <p className={`t-stat mt-1 tabular-nums ${n > 0 ? color : 'text-navy-400'}`}>{n}건</p>
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
  const onlyInfo = plan.issues.every((i) => i.level === '안내')

  return (
    <div className="card p-4 sm:p-5">
      {/*  「안내」만 있을 때는 사람이 정할 것이 없습니다 — 제목이 맞아야 합니다.
           남는 것이 안내뿐인데 "사람이 정해야 합니다" 라고 적혀 있으면,
           이상 없는 파일인데도 뭔가 걸린 것처럼 읽힙니다. */}
      {onlyInfo ? (
        <>
          <p className="t-card mb-1 break-keep text-navy-900">넣지 않은 것 — 알려만 드립니다</p>
          <p className="t-muted mb-3 break-keep">
            파일에 있지만 일부러 옮기지 않은 것입니다. 지금 하실 일은 없습니다.
          </p>
        </>
      ) : (
        <>
          <p className="t-card mb-1 break-keep text-navy-900">넣지 않은 것 — 사람이 정해야 합니다</p>
          <p className="t-muted mb-3 break-keep">
            시스템이 임의로 정할 수 없는 것들입니다. 지어내서 넣지 않고 그대로 보여 드립니다.
          </p>
        </>
      )}
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
        <span
          className={`pill shrink-0 ${
            it.level === '오류'
              ? 'bg-rose-50 text-rose-600'
              : it.level === '안내'
                ? 'bg-navy-100 text-navy-500'
                : 'bg-amber-50 text-amber-700'
          }`}
        >
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
