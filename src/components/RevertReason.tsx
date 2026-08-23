import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Undo2 } from 'lucide-react'
import { Modal } from './Modal'
import { useData } from '../context/DataContext'
import { useSchemaAtLeast } from '../lib/schemaGate'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 완료 되돌리기 — **왜** 되돌리는지 (0088)
//
//  되돌리기 자체는 예전부터 됩니다. 안 남는 것이 **이유**였습니다.
//  이 화면 한 번에 자재·재고·요청·그 달 청구까지 같이 되돌아가는데, 나중에
//  「이 날 왜 취소됐지」를 물으면 아무도 답을 못 했습니다.
//
//  ⚠ 지우는 것이 아닙니다. 원본은 그대로 남고 「취소됨」이 됩니다.
//  ⚠ 사유는 **판 73 부터** 받습니다. 그 전 서버에는 저장할 자리가 없어서
//    받아 봐야 버려집니다 — 받는 척하지 않습니다.
//  ⚠ 자주 쓰는 이유를 단추로 둡니다. 폰에서 한 손으로 글자를 치는 것은
//    현장에서 실제로 잘 안 합니다. 다만 **고르면 그대로 저장**되는 값이라
//    「기타」는 직접 적게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 자주 쓰는 취소 이유.
 *  ⚠ 수거기록 상세도 **같은 목록**을 씁니다 — 두 벌이면 한쪽만 고쳐집니다.
 */
export const REVERT_REASONS = ['잘못 입력했습니다', '중복으로 입력했습니다', '수거량을 잘못 적었습니다', '다른 거래처에 입력했습니다', '방문이 취소됐습니다']

/**
 * 사유를 고르는 칸 — 창(Modal) 없이 **내용만**.
 *
 *  ⚠ 이렇게 뽑아 둔 이유가 있습니다. 창 안에서 다른 창을 열면 **뒤 창이 닫히며
 *    부르는 history.back() 이, 방금 뜬 앞 창을 곧바로 다시 닫습니다.**
 *    (useHistoryDismiss 가 뒤로 가기와 창을 이어 놓았기 때문입니다.)
 *    그래서 창을 겹치지 않고 **한 창 안에서 단계만 바꿉니다.**
 */
export function RevertReasonFields({
  reason,
  onChange,
}: {
  reason: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-[1.05rem] font-extrabold text-navy-900">
        왜 되돌리시나요? <span className="text-rose-600">*</span>
      </p>
      <div data-revert-quick className="mt-2 flex flex-wrap gap-2">
        {REVERT_REASONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onChange(q)}
            className={`min-h-[2.5rem] rounded-xl px-3 text-[1rem] font-bold transition active:scale-95 ${
              reason === q ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'
            }`}
          >
            {q}
          </button>
        ))}
      </div>
      <input
        data-revert-reason
        value={reason}
        onChange={(e) => onChange(e.target.value)}
        placeholder="직접 적으셔도 됩니다"
        maxLength={200}
        className="input mt-2.5"
      />
    </div>
  )
}

export function RevertReasonModal({
  eventId,
  label,
  onClose,
  onDone,
}: {
  /** 되돌릴 입력. null 이면 닫혀 있습니다 */
  eventId: string | null
  /** 「8월 23일 OO병원」 — 무엇을 되돌리는지 사람 말로 */
  label?: string
  onClose: () => void
  onDone?: (r: { ok: boolean; errors: string[] }) => void
}) {
  const { revertCollection } = useData()
  //  ⚠ null(아직 모름) 과 false(옛 서버) 를 구분합니다. 모르는 동안에는
  //    사유를 강제하지 않습니다 — 못 누르는 단추를 만들지 않습니다.
  const needReason = useSchemaAtLeast(73) === true
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  //  다른 줄을 되돌리려고 열면 앞 줄의 사유가 남아 있으면 안 됩니다.
  useEffect(() => {
    if (eventId) { setReason(''); setError('') }
  }, [eventId])

  const ready = !needReason || reason.trim().length > 0

  async function go() {
    if (!eventId || !ready) return
    setBusy(true)
    setError('')
    const r = await revertCollection(eventId, needReason ? reason.trim() : '')
    setBusy(false)
    if (!r.ok) {
      setError(r.errors.join(' ') || '되돌리지 못했습니다.')
      onDone?.({ ok: false, errors: r.errors })
      return
    }
    onDone?.({ ok: true, errors: [] })
    onClose()
  }

  return (
    <Modal
      open={eventId !== null}
      title="수거 완료 되돌리기"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            닫기
          </button>
          <button
            data-revert-go
            className="btn-primary flex-1 disabled:opacity-50"
            disabled={!ready || busy}
            onClick={() => void go()}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Undo2 size={18} strokeWidth={2.5} />}
            되돌리기
          </button>
        </>
      }
    >
      {label && (
        <p data-revert-label className="break-keep text-[1.12rem] font-extrabold text-navy-900">{label}</p>
      )}
      <p className="mt-1.5 break-keep text-[1.05rem] leading-relaxed text-navy-600">
        일정·수거이력·자재·재고·요청 상태가 입력 전으로 되돌아갑니다. 그 달 정산·청구 금액도 같이 바뀝니다.
        <b className="text-navy-800"> 기록을 지우는 것은 아닙니다</b> — 원본은 「취소됨」으로 남습니다.
      </p>
      {/*  ⚠ 이 한 줄은 **판 73 부터만** 적습니다. 그 전 서버에는 막는 자리가
           없습니다 — 없는 보호장치를 있다고 적어 두면 사람은 그 말을 믿고
           누릅니다. (예전 화면이 정확히 그랬습니다.) */}
      {needReason && (
        <p data-revert-billguard className="t-caption mt-1.5 break-keep text-navy-500">
          이미 확정한 청구에 들어간 수거는 서버가 막습니다. 청구를 먼저 취소해 주세요.
        </p>
      )}

      {needReason && (
        <div className="mt-4">
          <RevertReasonFields reason={reason} onChange={setReason} />
          {!ready && (
            <p className="t-caption mt-1.5 text-navy-500">사유를 적어야 되돌릴 수 있습니다.</p>
          )}
        </div>
      )}

      {error && (
        <p data-revert-error className="mt-3 flex items-start gap-2 break-keep rounded-2xl bg-rose-50 px-4 py-3 text-[1.02rem] font-bold text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" strokeWidth={2.3} /> {error}
        </p>
      )}
    </Modal>
  )
}
