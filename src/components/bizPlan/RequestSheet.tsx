import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Modal } from '../Modal'
import { FIELD_BY_KEY, REQ_TYPES, plainText, type ReqType } from '../../lib/bizPlan'
import { BizPlanError, createRequest } from '../../lib/bizPlanApi'
import { ValueView, usePlan, who } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 수정 요청 남기기 — 참여자 누구나 (0146)
//
//  대표님 · 이사님이 폰에서 읽다가 바로 남기는 창입니다. 항목 이름 · 지금 내용 ·
//  요청자 · 시각은 자동으로 들어가고, 고를 것(요청 유형)과 적을 것(요청 내용)만 남깁니다.
//  ⚠ 요청은 **문서를 바꾸지 않습니다.** 담당자가 확인하고 반영(또는 보류 · 반려 + 까닭)합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function RequestSheet({ fieldKey, onClose }: { fieldKey: string; onClose: () => void }) {
  const { data, fields, reload, notify } = usePlan()
  const ref = FIELD_BY_KEY.get(fieldKey)
  const row = fields.get(fieldKey)
  const [type, setType] = useState<ReqType | null>(null)
  const [body, setBody] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [showNow, setShowNow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!ref) return null
  const def = ref.def
  const nowText = plainText(def, row?.value)
  const canSuggest = def.kind !== 'notice' && def.kind !== 'offline'
  const ready = !!type && body.trim().length > 0

  async function send() {
    if (!type || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createRequest({ key: fieldKey, label: ref!.path, type, body: body.trim(), suggestion: suggestion.trim() })
      await reload()
      notify('수정 요청을 남겼습니다 · 담당자가 처리하면 결과가 이 항목에 보입니다.')
      onClose()
    } catch (e) {
      setError(e instanceof BizPlanError ? e.message : '보내지 못했습니다. 적은 내용은 그대로 있습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="수정 요청"
      onClose={() => !busy && onClose()}
      layout="sticky"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error && <p data-req-error className="break-keep text-[0.95rem] font-bold text-rose-600">{error}</p>}
          {!ready && <p data-req-missing className="break-keep text-center text-[0.92rem] font-bold text-navy-500">{!type ? '요청 유형을 고르고 내용을 적으면 보낼 수 있습니다' : '요청 내용을 적어 주세요'}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button type="button" data-req-send className="btn-primary flex-[2]" disabled={busy || !ready} onClick={() => void send()}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : null} 요청 보내기
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" data-request-sheet={fieldKey}>
        <div className="rounded-xl bg-navy-50 px-3.5 py-3">
          <p className="text-[0.85rem] font-bold text-navy-500">수정 대상 항목</p>
          <p data-req-target className="break-keep text-[1.02rem] font-extrabold text-navy-900">{ref.path}</p>
          <button type="button" className="mt-1 inline-flex min-h-[40px] items-center gap-1 text-[0.95rem] font-bold text-teal-700" onClick={() => setShowNow((v) => !v)}>
            지금 작성된 내용 {showNow ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showNow && (
            <div className="mt-1 max-h-60 overflow-y-auto rounded-lg bg-white p-2.5">
              <ValueView def={def} value={row?.value} />
            </div>
          )}
        </div>

        <fieldset>
          <legend className="field-label">요청 유형</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {REQ_TYPES.map((x) => (
              <button
                key={x}
                type="button"
                data-req-type={x}
                aria-pressed={type === x}
                onClick={() => setType(x)}
                className={`min-h-[46px] break-keep rounded-xl px-2 text-[0.98rem] font-bold transition ${type === x ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'}`}
              >
                {x}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="field-label">요청 내용</span>
          <textarea data-req-body className="field-input w-full resize-y" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="예: 2025년 매출은 결산 기준 5.6억입니다. 재무제표 보고 고쳐 주세요." />
        </label>

        {canSuggest && (
          <label className="block">
            <span className="field-label flex flex-wrap items-center gap-2">
              제안하는 수정문장 (선택)
              {nowText && (
                <button type="button" data-req-copy-now className="rounded-full bg-teal-50 px-3 py-1 text-[0.88rem] font-bold text-teal-700" onClick={() => setSuggestion(nowText)}>
                  지금 문장으로 시작
                </button>
              )}
            </span>
            <textarea data-req-suggestion className="field-input w-full resize-y" rows={suggestion ? Math.min(12, suggestion.split('\n').length + 2) : 3} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} placeholder="직접 고친 문장을 적으면 담당자가 비교해 보고 반영합니다" />
          </label>
        )}

        <p className="break-keep text-[0.9rem] text-navy-500">
          요청자 · <b className="text-navy-700">{who(data.me.name, data.me.title)}</b> · 보내는 시각이 자동으로 남습니다. 요청만으로 문서가 바뀌지는 않습니다.
        </p>
      </div>
    </Modal>
  )
}
