import { useEffect, useState } from 'react'
import { Table2, Check, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createDevRequest, loadDevRequests } from '../lib/repo'
import { EXCEL_TOPIC, formatExcelCheck, parseExcelChecks } from '../lib/excelCheck'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 「오늘 엑셀·카톡에 다시 적은 것이 있었나요?」 — 하루 한 줄 (0106)
//
//  사무실·관리자 첫 화면에 한 줄. 답하지 않아도 아무것도 막지 않습니다.
//  답하면 그날은 사라집니다. 저장은 dev_requests(사용자 피드백)를 그대로
//  씁니다 — 새 표 없이, 관리자가 이미 읽을 수 있는 자리입니다.
//
//  ⚠ 「없음」과 「안 답함」은 다릅니다. 안 답한 날은 지표에서 세지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function ExcelCheckLine() {
  const { role, mode, profile } = useAuth()
  const [state, setState] = useState<'loading' | 'ask' | 'detail' | 'saving' | 'done' | 'hidden'>('loading')
  const [items, setItems] = useState('')
  const [error, setError] = useState<string | null>(null)
  const date = today()

  useEffect(() => {
    let alive = true
    if (mode !== 'live' || !profile || (role !== 'admin' && role !== 'office')) {
      setState('hidden')
      return
    }
    loadDevRequests()
      .then((rows) => {
        if (!alive) return
        //  내가 오늘 이미 답했으면 다시 묻지 않습니다 (관리자는 남의 답도 보이지만 본인 것만 봅니다).
        const mine = parseExcelChecks(rows.filter((r) => r.requesterId === profile.id)).some((c) => c.date === date)
        setState(mine ? 'hidden' : 'ask')
      })
      .catch(() => alive && setState('ask'))
    return () => { alive = false }
  }, [mode, profile, role, date])

  if (state === 'hidden' || state === 'loading') return null

  async function save(reentries: number) {
    setState('saving')
    setError(null)
    try {
      await createDevRequest({ topics: [EXCEL_TOPIC], message: formatExcelCheck(date, reentries, items) })
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
      setState(reentries > 0 ? 'detail' : 'ask')
    }
  }

  if (state === 'done') {
    return (
      <p data-excel-check="done" className="flex items-center gap-2 rounded-2xl bg-teal-50 px-4 py-3 text-[1.02rem] font-bold text-teal-800">
        <Check size={17} strokeWidth={2.6} /> 기록했습니다 — 성과 화면의 「다시 적는 횟수」에 반영됩니다.
      </p>
    )
  }

  return (
    <div data-excel-check={state} className="rounded-2xl bg-white px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Table2 size={17} className="shrink-0 text-navy-400" />
        <p className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">
          오늘 엑셀·카톡에 <b className="text-navy-900">같은 내용을 다시 적은 것</b>이 있었나요?
        </p>
        {state !== 'detail' && (
          <div className="flex gap-2">
            <button data-excel-none onClick={() => void save(0)} disabled={state === 'saving'} className="btn-ghost min-h-[2.75rem]">
              {state === 'saving' ? <Loader2 size={16} className="animate-spin" /> : '없음'}
            </button>
            <button data-excel-yes onClick={() => setState('detail')} disabled={state === 'saving'} className="btn-navy min-h-[2.75rem]">
              있음
            </button>
          </div>
        )}
      </div>
      {state === 'detail' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            data-excel-items
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder="무엇 때문에? 예: 거래처 단가, 자재 규격 (쉼표로 구분)"
            className="input min-w-0 flex-1"
            maxLength={200}
          />
          <button data-excel-save onClick={() => void save(Math.max(1, items.split(',').filter((s) => s.trim()).length))} className="btn-navy min-h-[2.75rem]">
            기록
          </button>
          <button onClick={() => setState('ask')} className="btn-ghost min-h-[2.75rem]">취소</button>
        </div>
      )}
      {error && <p data-excel-error className="t-caption mt-2 font-bold text-rose-600">{error}</p>}
      <p className="t-caption mt-1.5 break-keep text-navy-400">
        답하지 않아도 됩니다. 답한 날만 셉니다 — 「없음」과 「안 답함」은 다르게 셉니다.
      </p>
    </div>
  )
}
