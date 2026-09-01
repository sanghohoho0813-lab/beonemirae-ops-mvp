import { CalendarClock, Workflow } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { PLANNED_DETAIL } from '../lib/nav'

// ─────────────────────────────────────────────────────────────────────────────
//  「추가 개발 예정」 미리보기 (0095)
//
//  전에는 잠긴 회색 글이었습니다. 눌러도 아무 일도 없으니, 회사가 어디까지
//  가려는지 궁금한 사람(직원·심사자)이 알 길이 없었습니다.
//  이제 누르면 **무엇을 검토 중인지**와 **지금은 어떻게 하는지**가 나옵니다.
//
//  ⚠ 되는 척하지 않습니다. 첫 줄이 「계획 중」 딱지입니다. 날짜도 성능도
//    약속하지 않습니다. 404 도, 빈 화면도 없습니다 — 이 작은 창이 전부입니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PlannedPreview({ label, onClose }: { label: string | null; onClose: () => void }) {
  const navigate = useNavigate()
  const d = label ? PLANNED_DETAIL[label] : undefined
  return (
    <Modal
      open={label != null}
      title={label ?? ''}
      onClose={onClose}
      footer={
        <div className="flex w-full gap-2">
          <button
            className="btn-ghost flex-1"
            onClick={() => {
              onClose()
              navigate('/roadmap')
            }}
          >
            <Workflow size={17} strokeWidth={2.4} /> 활용 계획 전체 보기
          </button>
          <button className="btn-primary flex-1" onClick={onClose}>확인</button>
        </div>
      }
    >
      <div data-planned-preview={label ?? ''} className="space-y-3.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-[1rem] font-extrabold text-amber-800">
            계획 중 · 아직 없는 기능입니다
          </span>
        </p>
        <p className="t-body break-keep leading-relaxed text-navy-700">{d?.what}</p>
        <p className="t-body flex items-start gap-2 break-keep rounded-2xl bg-navy-50 px-4 py-3 leading-snug text-navy-600">
          <CalendarClock size={17} strokeWidth={2.3} className="mt-0.5 shrink-0 text-navy-400" />
          <span>
            <b className="text-navy-800">지금은</b> — {d?.now}
          </span>
        </p>
      </div>
    </Modal>
  )
}
