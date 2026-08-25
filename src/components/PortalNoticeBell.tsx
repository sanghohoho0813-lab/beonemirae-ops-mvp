import { useState } from 'react'
import { Bell, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PortalNotice } from '../lib/portalNotices'

// ─────────────────────────────────────────────────────────────────────────────
// 알림센터 (0083)
//
//  ⚠ 알림은 저장하지 않고 **지금 자료로** 만듭니다(lib/portalNotices.ts).
//    그래서 「읽음」이 없습니다 — 처리하면 저절로 사라집니다.
//    안 읽은 개수가 아니라 **지금 알려 드릴 것의 개수**입니다.
//
//  ⚠ 할 말이 없으면 종에 숫자를 안 답니다. 0 을 빨갛게 달아 두면 매일
//    「뭔가 안 한 게 있나」로 읽힙니다.
// ─────────────────────────────────────────────────────────────────────────────

const TONE = {
  info: 'bg-teal-50 text-teal-700',
  good: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-700',
} as const

export function PortalNoticeBell({ notices }: { notices: PortalNotice[] }) {
  const [open, setOpen] = useState(false)
  const n = notices.length
  return (
    <>
      <button
        data-portal-bell
        aria-label={n > 0 ? `알림 ${n}건` : '알림'}
        onClick={() => setOpen(true)}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white transition hover:bg-white/20"
      >
        <Bell size={20} strokeWidth={2.3} />
        {n > 0 && (
          <span
            data-portal-bell-count
            className="absolute -right-1 -top-1 flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-teal-500 px-1 text-[0.9rem] font-black text-white ring-2 ring-navy-900"
          >
            {n}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-navy-950/40 p-3 sm:p-5">
          <div
            data-portal-notices
            className="card max-h-[80vh] w-full max-w-[26rem] overflow-y-auto p-0"
            role="dialog"
            aria-label="알림"
          >
            <div className="sticky top-0 flex items-center gap-3 border-b border-navy-100 bg-white px-5 py-4">
              <p className="t-card min-w-0 flex-1 break-keep text-navy-900">알림</p>
              <button
                data-portal-notices-close
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-navy-400 hover:bg-navy-50"
                aria-label="닫기"
              >
                <X size={19} />
              </button>
            </div>
            {n === 0 ? (
              //  ⚠ 없으면 없다고 합니다. 채우려고 없는 말을 만들지 않습니다.
              <p className="t-body break-keep px-5 py-8 text-center text-navy-500">
                지금 알려 드릴 것이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-navy-50">
                {notices.map((x) => {
                  const body = (
                    <>
                      <span className={`pill shrink-0 ${TONE[x.tone]}`}>
                        {x.tone === 'warn' ? '확인' : x.tone === 'good' ? '완료' : '안내'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="t-body block break-keep font-extrabold text-navy-900">{x.title}</span>
                        <span className="t-muted mt-1 block break-keep leading-snug">{x.detail}</span>
                      </span>
                      {x.to && <ChevronRight size={18} className="mt-1 shrink-0 text-navy-400" />}
                    </>
                  )
                  return (
                    <li key={x.key} data-portal-notice={x.key}>
                      {x.to ? (
                        <Link
                          to={x.to}
                          onClick={() => setOpen(false)}
                          className="flex min-h-[3.5rem] items-start gap-3 px-5 py-4 transition hover:bg-navy-50"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 px-5 py-4">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
