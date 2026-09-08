import { useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import { createDevRequest } from '../lib/repo'
import { TRIAL_TASKS, TRIAL_TASK_LABEL, TRIAL_TOPIC, formatTrial, type Trial, type TrialTask } from '../lib/trials'
import { today } from '../lib/format'
import { KindChip } from './KindChip'

// ─────────────────────────────────────────────────────────────────────────────
// 업무 재현시험 — 같은 일을 예전 방식과 시스템으로 각각 해 보고 시간·오류를 적습니다 (0107)
//
//  현장 성과가 쌓이기 전에 오늘 바로 얻을 수 있는 초기 측정값입니다. 실제로 잰
//  값만 적습니다. 결과는 「업무 재현시험」 표시를 달고 실제 운영 성과와 따로 보입니다.
//  저장은 사용자 피드백 표(dev_requests)를 그대로 씁니다 — 새 표 없음.
// ─────────────────────────────────────────────────────────────────────────────

export function TrialCard({ trials, canWrite, onSaved }: { trials: Trial[]; canWrite: boolean; onSaved: () => void }) {
  const [task, setTask] = useState<TrialTask>('invoice')
  const [date, setDate] = useState(today())
  const [oldMin, setOldMin] = useState('')
  const [oldErr, setOldErr] = useState('0')
  const [newMin, setNewMin] = useState('')
  const [newErr, setNewErr] = useState('0')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const hint = TRIAL_TASKS.find((t) => t.task === task)?.hint ?? ''

  async function save() {
    const o = Number(oldMin), n = Number(newMin), oe = Number(oldErr), ne = Number(newErr)
    if (!(o > 0) || !(n > 0)) { setMsg({ ok: false, text: '두 방식의 소요 시간(분)을 실제로 재서 넣어 주세요 — 0 이나 빈칸은 안 됩니다.' }); return }
    if (!(oe >= 0) || !(ne >= 0)) { setMsg({ ok: false, text: '오류 건수는 0 이상의 정수입니다.' }); return }
    setBusy(true); setMsg(null)
    try {
      await createDevRequest({ topics: [TRIAL_TOPIC], message: formatTrial({ date, task, oldMin: o, oldErrors: oe, newMin: n, newErrors: ne, note }) })
      setMsg({ ok: true, text: '기록했습니다 — 요약의 「업무 재현시험」에 보입니다.' })
      setOldMin(''); setNewMin(''); setOldErr('0'); setNewErr('0'); setNote('')
      onSaved()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '저장하지 못했습니다.' })
    }
    setBusy(false)
  }

  return (
    <section data-trial-card className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <FlaskConical size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-card flex flex-wrap items-center gap-2 text-navy-900">업무 재현시험 <KindChip kind="업무 재현시험" /></p>
          <p className="t-muted mt-1 break-keep">
            같은 자료로 같은 결과물을 예전 방식과 시스템 방식으로 각각 만들고, <b className="text-navy-600">실제로 잰 시간과 오류 건수</b>만 적습니다.
            실험실 값이라 실제 운영 성과와 따로 표시하고, 회사 전체 절감으로 확대하지 않습니다.
          </p>
        </div>
      </div>

      {canWrite && (
        <div className="mt-4 grid gap-2.5 rounded-2xl bg-navy-50 p-4 sm:grid-cols-2">
          <label className="field-label sm:col-span-2">어떤 일
            <select data-trial-task value={task} onChange={(e) => setTask(e.target.value as TrialTask)} className="field-input mt-1">
              {TRIAL_TASKS.map((t) => <option key={t.task} value={t.task}>{t.label}</option>)}
            </select>
            <span className="t-caption mt-1 block break-keep font-medium text-navy-500">{hint}</span>
          </label>
          <label className="field-label">예전 방식 — 걸린 시간 (분)
            <input data-trial-old inputMode="decimal" value={oldMin} onChange={(e) => setOldMin(e.target.value)} className="field-input mt-1" placeholder="예: 25" />
          </label>
          <label className="field-label">예전 방식 — 오류 건수
            <input data-trial-old-err inputMode="numeric" value={oldErr} onChange={(e) => setOldErr(e.target.value)} className="field-input mt-1" />
          </label>
          <label className="field-label">시스템 방식 — 걸린 시간 (분)
            <input data-trial-new inputMode="decimal" value={newMin} onChange={(e) => setNewMin(e.target.value)} className="field-input mt-1" placeholder="예: 9" />
          </label>
          <label className="field-label">시스템 방식 — 오류 건수
            <input data-trial-new-err inputMode="numeric" value={newErr} onChange={(e) => setNewErr(e.target.value)} className="field-input mt-1" />
          </label>
          <label className="field-label">한 날
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input mt-1" />
          </label>
          <label className="field-label">무엇으로 (선택)
            <input data-trial-note value={note} onChange={(e) => setNote(e.target.value)} className="field-input mt-1" maxLength={120} placeholder="예: 8월 한양의료재단 명세서" />
          </label>
          {msg && <p data-trial-msg className={`t-caption font-bold sm:col-span-2 ${msg.ok ? 'text-teal-700' : 'text-rose-600'}`}>{msg.text}</p>}
          <div className="sm:col-span-2">
            <button data-trial-save onClick={() => void save()} disabled={busy} className="btn-navy">
              {busy ? <Loader2 size={16} className="animate-spin" /> : '기록'}
            </button>
          </div>
        </div>
      )}

      {trials.length > 0 && (
        <ul data-trial-list className="mt-4 flex flex-col gap-1.5">
          {trials.slice(0, 12).map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-white px-3 py-2 ring-1 ring-navy-50">
              <span className="t-caption tabular-nums text-navy-500">{t.date}</span>
              <b className="t-body text-navy-900">{TRIAL_TASK_LABEL[t.task]}</b>
              <span className="t-body tabular-nums text-navy-700">예전 {t.oldMin}분 (오류 {t.oldErrors}) → 시스템 {t.newMin}분 (오류 {t.newErrors})</span>
              {t.note && <span className="t-caption text-navy-500">{t.note}</span>}
              <span className="t-caption ml-auto text-navy-400">{t.who}</span>
            </li>
          ))}
        </ul>
      )}
      {trials.length === 0 && <p className="t-muted mt-3 break-keep">아직 기록이 없습니다. 첫 시험은 거래명세서 한 장이면 됩니다 — 10분이면 첫 측정값이 생깁니다.</p>}
    </section>
  )
}
