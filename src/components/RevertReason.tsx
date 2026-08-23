
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

//  ⚠ 0076 — 여기 있던 `RevertReasonModal` 을 지웠습니다.
//
//   되돌리기가 **수거기록 상세 시트 한 곳**으로 모였습니다(0074·0076).
//   수거 입력·수거이력·오늘 일정·대시보드가 전부 그 시트를 씁니다.
//   쓰이지 않는 창을 남겨 두면 검사만 통과하면서 「이것도 있다」는
//   착각을 만듭니다 — 다음 사람이 둘 중 어느 것을 고쳐야 할지 모릅니다.
//   사유를 고르는 칸(RevertReasonFields)은 그대로 씁니다.
