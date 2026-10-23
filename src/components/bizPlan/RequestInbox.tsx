import { useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import { FilterChip } from '../ui'
import { OPEN_REQ, REQ_TYPES, type ReqType, type RequestRow } from '../../lib/bizPlan'
import { RequestCard } from './FieldPanel'
import { usePlan } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 수정요청함 — 모든 항목의 요청을 한곳에 (0146)
//
//  접수 → 검토 중 → 반영 완료 / 보류 / 반려. 담당은 여기서 바로 처리하고,
//  검토하는 분은 내가 남긴 요청이 어떻게 됐는지 봅니다. 「위치로 이동」은 문서의
//  그 항목을 엽니다.
// ─────────────────────────────────────────────────────────────────────────────

type View = '처리 전' | '전체' | '반영 완료' | '보류' | '반려' | '내가 남긴 것'

export function RequestInbox({ onGo }: { onGo: (key: string) => void }) {
  const { data } = usePlan()
  const [view, setView] = useState<View>('처리 전')
  const [type, setType] = useState<ReqType | null>(null)
  const all = data.requests
  const count = (v: View) => all.filter((r) => matches(v, r, data.me.name)).length
  const shown = useMemo(
    () => all.filter((r) => matches(view, r, data.me.name) && (!type || r.req_type === type)),
    [all, view, type, data.me.name],
  )
  const types = REQ_TYPES.filter((t) => all.some((r) => r.req_type === t))

  return (
    <div className="space-y-3" data-bizplan-inbox>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(['처리 전', '전체', '반영 완료', '보류', '반려', '내가 남긴 것'] as View[]).map((v) => (
          <FilterChip key={v} active={view === v} onClick={() => setView(v)}>
            <span data-inbox-view={v}>{v} {count(v)}</span>
          </FilterChip>
        ))}
      </div>
      {types.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setType(null)} className={`min-h-[40px] shrink-0 rounded-full px-3 text-[0.92rem] font-bold ${type == null ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-600'}`}>
            유형 전체
          </button>
          {types.map((t) => (
            <button key={t} type="button" data-inbox-type={t} onClick={() => setType(type === t ? null : t)} className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full px-3 text-[0.92rem] font-bold ${type === t ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-600'}`}>
              {t}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-10 text-center ring-1 ring-navy-100">
          <Inbox size={28} className="text-navy-300" />
          <p className="break-keep text-[1.02rem] font-bold text-navy-600">
            {view === '처리 전' ? '처리할 수정요청이 없습니다.' : '해당하는 요청이 없습니다.'}
          </p>
          <p className="break-keep text-[0.92rem] text-navy-400">문서에서 항목을 열고 「수정 요청」을 누르면 여기에 쌓입니다.</p>
        </div>
      ) : (
        <div className="grid gap-2.5 xl:grid-cols-2">
          {shown.map((r) => (
            <RequestCard key={r.id} r={r} showTarget onGo={() => onGo(r.key)} />
          ))}
        </div>
      )}
    </div>
  )
}

function matches(v: View, r: RequestRow, me: string): boolean {
  if (v === '전체') return true
  if (v === '처리 전') return OPEN_REQ.includes(r.status)
  if (v === '내가 남긴 것') return r.mine ?? r.requester_name === me
  return r.status === v
}
