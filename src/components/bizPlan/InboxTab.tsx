import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Loader2, RotateCw } from 'lucide-react'
import { PageHeader } from '../PageHeader'
import { BIZPLAN_NAME, BIZPLAN_PATH, OPEN_REQ } from '../../lib/bizPlan'
import { BizPlanProvider } from './Provider'
import { RequestInbox } from './RequestInbox'
import { usePlan } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 피드백 › 사업계획서 수정요청 (0146)
//
//  기존 요청함(사용자 피드백 · dev_requests)과 **따로** 둡니다 — 상태가 다르고
//  (접수 → 검토 중 → 반영 완료 / 보류 / 반려), 사업계획서 참여자만 봐야 하기 때문입니다.
//  처리는 여기서 바로 하고, 「위치로 이동」은 사업계획서 화면의 그 항목을 엽니다.
// ─────────────────────────────────────────────────────────────────────────────

export function BizPlanInboxTab() {
  const navigate = useNavigate()
  const go = useCallback((key: string) => navigate(`${BIZPLAN_PATH}?f=${encodeURIComponent(key)}`), [navigate])
  return (
    <div data-devreq-bizplan>
      <PageHeader title="사업계획서 수정요청" subtitle={`${BIZPLAN_NAME} · 대표님 · 이사님이 남긴 요청`} />
      <BizPlanProvider
        onOpenField={go}
        fallback={(s, retry) =>
          s.kind === 'loading' ? (
            <p className="flex items-center gap-2 py-8 text-[1rem] font-bold text-navy-500">
              <Loader2 size={18} className="animate-spin" /> 불러오는 중…
            </p>
          ) : (
            <div data-bizplan-fail={s.error.kind} className="space-y-2 rounded-2xl bg-amber-50 px-4 py-4 ring-1 ring-amber-200">
              <p className="flex items-start gap-2 break-keep text-[1rem] font-bold text-amber-900">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {s.error.message}
              </p>
              {(s.error.kind === 'offline' || s.error.kind === 'other') && (
                <button type="button" onClick={retry} className="btn-ghost">
                  <RotateCw size={16} /> 다시 시도
                </button>
              )}
            </div>
          )
        }
      >
        <Inner onGo={go} />
      </BizPlanProvider>
    </div>
  )
}

function Inner({ onGo }: { onGo: (key: string) => void }) {
  const { data } = usePlan()
  const open = data.requests.filter((r) => OPEN_REQ.includes(r.status)).length
  return (
    <div className="space-y-3">
      <Link to={BIZPLAN_PATH} data-devreq-bizplan-open className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-navy-100 transition hover:bg-navy-50">
        <span className="min-w-0 flex-1">
          <span className="block text-[1.02rem] font-extrabold text-navy-900">사업계획서 열기</span>
          <span className="block text-[0.9rem] text-navy-500">
            {data.doc.status} · 처리 전 요청 {open}건{data.doc.version_label ? ` · ${data.doc.version_label}` : ''}
          </span>
        </span>
        <ChevronRight size={18} className="text-navy-400" />
      </Link>
      <RequestInbox onGo={onGo} />
    </div>
  )
}
