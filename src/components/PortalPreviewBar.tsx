import { ArrowLeft, Building2, Eye } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 「지금 보고 계신 것은 병원 화면입니다」 (0085)
//
//  대표님: 「대표/이사/개발자/관리자 계정이 특정 병원 포털을 확인하고 있다는
//  점이 명확하게 보여야 한다. 다만 일반 고객에게는 보이지 않아야 한다.」
//
//  ⚠ 이 띠가 없으면 제일 위험한 일이 생깁니다 — 대표님이 병원 화면을 보고
//    계신 줄 모르고 「우리 미수금이 왜 이것뿐이지」라고 판단하시는 것입니다.
//    병원 화면은 **그 병원 것만** 보여 줍니다.
//
//  ⚠ 돌아가는 길을 **브라우저 뒤로가기에 맡기지 않습니다.** 포털 안에서
//    몇 화면 돌아다니다 뒤로가기를 누르면 포털 안을 거슬러 올라갑니다.
//    정해진 주소로 곧장 돌아갑니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalPreviewBar({ client }: { client: Client | null }) {
  const navigate = useNavigate()
  return (
    <div
      data-portal-preview
      className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 lg:px-8"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[0.95rem] font-extrabold text-amber-800">
          <Eye size={15} strokeWidth={2.6} /> 고객 화면 미리보기
        </span>
        <p className="t-muted min-w-0 flex-1 break-keep font-bold text-amber-900">
          {client ? (
            <>
              지금 <b className="text-amber-900">{client.name}</b> 담당자에게 보이는 화면입니다 — 비원미래
              전체 자료가 아닙니다.
            </>
          ) : (
            '어느 병원 화면을 보실지 아래에서 골라 주세요.'
          )}
        </p>
        {/*  ⚠ 돌아가는 단추는 **항상** 있습니다. 병원을 안 골랐을 때도요 —
             길을 잃는 것이 제일 나쁩니다. */}
        <button
          data-portal-back
          onClick={() => navigate('/')}
          className="flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 text-[1.02rem] font-extrabold text-white transition hover:bg-navy-900"
        >
          <ArrowLeft size={17} strokeWidth={2.6} /> BUSINESS AX로 돌아가기
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 어느 병원 화면을 볼 것인가 — 직원이 안 골랐을 때
//
//  ⚠ 예전에는 목록의 **첫 병원**을 슬쩍 보여 줬습니다. 그러면 대표님은
//    그것을 「지금 보려던 그 병원」으로 읽습니다. 아무거나 보여 주느니
//    묻는 편이 낫습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalClientPicker({ clients }: { clients: Client[] }) {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 lg:px-8">
      <h1 className="t-page break-keep text-navy-900">어느 병원 화면을 보시겠습니까?</h1>
      <p className="t-body mt-2.5 break-keep text-navy-500">
        고른 병원의 담당자에게 실제로 보이는 화면을 그대로 엽니다. 거래처 화면에서 「병원 화면
        미리보기」를 누르셔도 같은 곳으로 옵니다.
      </p>
      {clients.length === 0 ? (
        <p className="t-body mt-6 break-keep rounded-2xl bg-navy-50 px-5 py-4 text-navy-500">
          등록된 거래처가 없습니다.
        </p>
      ) : (
        <ul data-portal-picker className="mt-6 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                data-portal-pick={c.id}
                to={`/portal?client=${c.id}`}
                className="card flex min-h-[3.5rem] items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  <Building2 size={20} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body block break-keep font-extrabold text-navy-900">{c.name}</span>
                  <span className="t-muted block break-keep">
                    {c.type || '구분 미설정'} · {c.collectionCycle || '수거주기 미설정'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
