import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { saveAfterSurvey } from '../lib/evidenceRepo'
import { SURVEY_TASKS } from '../lib/opsSurvey'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 도입 후 「같은 범위」 조사값 — 설정 › 기준값 아래 (0106)
//
//  도입 전 값은 「배차 일정관리 · 수거 일정관리 · 수거내역·거래명세서 엑셀
//  정리」 세 가지의 하루 시간을 방문 수로 나눈 것입니다. 도입 후 값도 **같은
//  세 가지**를 같은 방법으로 다시 물어야 견줄 수 있습니다. 입력 화면 시간으로
//  대신하지 않습니다.
//
//  ⚠ 판 106 이전이면 칸이 없어 저장할 수 없습니다 — 단추를 그리지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function AfterSurveyCard() {
  const { data, reload } = useData()
  const ready = useSchemaAtLeast(106)
  const cur = data.afterSurvey ?? null
  const [admin, setAdmin] = useState('')
  const [doc, setDoc] = useState('')
  const [on, setOn] = useState(today())
  const [source, setSource] = useState<'survey' | 'estimate'>('survey')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setAdmin(cur?.adminMinutesPerCollection == null ? '' : String(cur.adminMinutesPerCollection))
    setDoc(cur?.monthlyDocHours == null ? '' : String(cur.monthlyDocHours))
    setOn(cur?.surveyedOn ?? today())
    setSource(cur?.source ?? 'survey')
    setNote(cur?.note ?? '')
  }, [cur])

  async function save() {
    setBusy(true); setMsg(null)
    const a = admin.trim() === '' ? null : Number(admin)
    const d = doc.trim() === '' ? null : Number(doc)
    if ((a != null && !(a >= 0)) || (d != null && !(d >= 0))) {
      setMsg({ ok: false, text: '0 이상의 숫자만 넣어 주세요.' }); setBusy(false); return
    }
    try {
      await saveAfterSurvey({ adminMinutesPerCollection: a, monthlyDocHours: d, surveyedOn: on || null, source, note })
      await reload()
      setMsg({ ok: true, text: '저장했습니다 — 성과 화면의 「같은 범위」 지표에서 견줍니다.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '저장하지 못했습니다.' })
    }
    setBusy(false)
  }

  return (
    <div data-after-survey className="mt-4 rounded-2xl bg-navy-50 p-4">
      <p className="t-body font-extrabold text-navy-900">도입 후 같은 범위 조사값</p>
      <p className="t-muted mt-1 break-keep">
        도입 전과 <b className="text-navy-600">같은 세 가지 일</b>({SURVEY_TASKS.map((t) => t.label).join(' · ')})의 하루 시간을
        다시 물어, 방문 수로 나눈 값입니다. 입력 화면 시간으로 대신하지 않습니다 — 그건 다른 범위입니다.
      </p>
      {ready === false && (
        <p data-after-survey-gate className="t-caption mt-2 break-keep font-bold text-amber-800">
          칸이 아직 없습니다 — PROPOSAL_0106_evidence.sql 실행 후 넣을 수 있습니다.
        </p>
      )}
      {ready && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <label className="field-label">수거 1건 사무업무 시간 (분)
            <input data-after-admin type="number" min={0} step="0.5" inputMode="decimal" value={admin} onChange={(e) => setAdmin(e.target.value)} className="field-input mt-1" placeholder="미입력" />
          </label>
          <label className="field-label">월간 문서·정산 정리 시간 (시간)
            <input data-after-doc type="number" min={0} step="0.5" inputMode="decimal" value={doc} onChange={(e) => setDoc(e.target.value)} className="field-input mt-1" placeholder="미입력" />
          </label>
          <label className="field-label">조사한 날
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="field-input mt-1" />
          </label>
          <label className="field-label">출처
            <select value={source} onChange={(e) => setSource(e.target.value as 'survey' | 'estimate')} className="field-input mt-1">
              <option value="survey">업무 조사 응답 (담당자가 실제로 답함)</option>
              <option value="estimate">직접 입력 (추정)</option>
            </select>
          </label>
          <label className="field-label sm:col-span-2">어떻게 나온 숫자인지 (선택)
            <input value={note} onChange={(e) => setNote(e.target.value)} className="field-input mt-1" maxLength={300} placeholder="예: 이사님 9/20 답변 — 배차 20분 · 일정 40분 · 엑셀 1시간 ÷ 평일 방문 26곳" />
          </label>
          {msg && <p data-after-survey-msg className={`t-caption font-bold sm:col-span-2 ${msg.ok ? 'text-teal-700' : 'text-rose-600'}`}>{msg.text}</p>}
          <div className="sm:col-span-2">
            <button data-after-survey-save onClick={() => void save()} disabled={busy} className="btn-navy">
              {busy ? <Loader2 size={16} className="animate-spin" /> : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
