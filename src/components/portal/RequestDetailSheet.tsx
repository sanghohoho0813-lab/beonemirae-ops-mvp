import { useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { requestsForClient } from '../../lib/ops'
import { useRequestDetail } from '../../lib/portalSheet'
import { prettyDate } from '../../lib/format'
import { portalKindLabel, shortDateTime } from '../../lib/portalLabels'
import { PortalSheet } from '../PortalSheet'
import { StatusTimeline, kindIcon } from './PortalUi'
import type { Client } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// 요청 상세 — 아래에서 올라오는 창 (포털 3차)
//
//  대표님 브리프: 「요청 상세에서만 전체 progress — 현재 단계가 강하게, 이전
//  단계는 완료, 다음 단계는 muted · 비원미래 회신은 채팅창처럼 과하게 만들기보다
//  "담당자 안내" 영역으로 깔끔하게」.
//
//  ⚠ 새 자료가 없습니다. 목록과 같은 기록(client_requests)을 한 건 크게 볼 뿐입니다.
//  ⚠ 이 병원 요청에서만 찾습니다 — 주소에 남의 요청 id 를 넣어도 안 열립니다.
// ─────────────────────────────────────────────────────────────────────────────

export function RequestDetailSheet({ client }: { client: Client }) {
  const { data } = useData()
  const { id, close } = useRequestDetail()
  const r = useMemo(
    () => (id ? (requestsForClient(data, client.id).find((x) => x.id === id) ?? null) : null),
    [data, client.id, id],
  )

  return (
    <PortalSheet
      name="request"
      open={!!r}
      onClose={close}
      title={r ? portalKindLabel(r.type) : '요청'}
      //  머리 아이콘 = 목록 줄의 아이콘. 긴급만 빨강입니다.
      icon={r ? kindIcon(r.type) : undefined}
      tone={r?.type === '긴급수거' ? 'rose' : 'navy'}
      subtitle={r ? `${shortDateTime(r.when)} 요청${r.source === 'staff' ? ' · 전화 접수' : ''}` : undefined}
      footer={
        <button
          type="button"
          data-req-detail-close
          onClick={close}
          className="flex min-h-[3.25rem] w-full items-center justify-center rounded-[14px] bg-navy-900 px-5 text-[1.08rem] font-extrabold text-white transition hover:bg-navy-800"
        >
          닫기
        </button>
      }
    >
      {r && (
        <div data-req-detail-body={r.id} className="space-y-7">
          {/*  ⚠ 「지금 상태」를 따로 또 적지 않습니다 — 아래 단계의 「지금」이 그것입니다. */}
          <section>
            <h3 className="p-title mb-3">진행 단계</h3>
            <StatusTimeline status={r.status} />
          </section>

          <section>
            <h3 className="p-title mb-2">요청 내용</h3>
            <p className="p-body whitespace-pre-line">{r.content}</p>
            {(r.desiredDate || r.wasteType || r.expectedKg != null) && (
              <p data-req-detail={r.id} className="p-sub mt-2">
                {[
                  r.desiredDate ? `희망일 ${prettyDate(r.desiredDate)}` : null,
                  r.wasteType,
                  r.expectedKg != null ? `예상 ${r.expectedKg}kg` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </section>

          {/*  담당자 안내 — 말풍선이 아니라 차분한 안내 칸 하나 */}
          <section data-req-reply={r.id}>
            <h3 className="p-title mb-2">담당자 안내</h3>
            {r.reply ? (
              <p className="p-body rounded-[14px] bg-navy-50 px-4 py-3.5">
                <span className="sr-only">비원미래 회신 · </span>
                {r.reply}
              </p>
            ) : (
              <p className="p-sub">아직 안내가 없습니다. 담당자가 확인하면 여기에 표시됩니다.</p>
            )}
          </section>
        </div>
      )}
    </PortalSheet>
  )
}
