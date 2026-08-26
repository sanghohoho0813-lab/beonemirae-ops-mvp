import { ArrowLeft, Building2, Eye, Repeat } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { portalPath, PORTAL_SELECT_PATH, type PortalPage } from '../lib/portalClient'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 「지금 보고 계신 것은 병원 화면입니다」 (0085 → 0088)
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
//
//  ⚠ 0088 — 「병원 변경」을 **여기에만** 두었습니다. 병원을 바꾸는 일은
//    눌러서 하는 것이지, 메뉴를 옮기다 저절로 일어나는 일이 아닙니다.
//    (0088 이전에는 메뉴만 눌러도 고르는 화면이 나왔습니다 — 대표님 신고)
// ─────────────────────────────────────────────────────────────────────────────

export function PortalPreviewBar({ client, page }: { client: Client | null; page: PortalPage }) {
  const navigate = useNavigate()
  return (
    <div
      data-portal-preview
      className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 lg:px-8"
    >
      {/*  ⚠ 0088 — 폰에서 이 띠가 **979px** 이 됐습니다(390×844 실측).
           `flex-1` 은 basis 가 0 이라, 옆에 shrink-0 단추가 셋이 되자 글자칸이
           0 에 가깝게 눌리면서 한국어가 **한 글자씩** 줄바꿈됐습니다.
           그 바람에 「수거 요청」이 y=1,442px 로 밀렸습니다.
           폰에서는 글자칸을 **한 줄 통째로** 쓰게 하고, 단추는 그 아래로
           내려보냅니다. 넓은 화면은 지금까지대로 한 줄입니다. */}
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-2">
        <p className="t-muted flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-keep font-bold text-amber-900 sm:w-auto sm:flex-1">
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[0.95rem] font-extrabold text-amber-800">
            <Eye size={15} strokeWidth={2.6} /> 관리자 미리보기
          </span>
          {client ? (
            <>
              <b data-preview-name className="min-w-0 break-keep text-amber-900">{client.name}</b>
              {/*  ⚠ 폰에서는 접습니다. 위의 「관리자 미리보기 · 병원명」이
                   이미 같은 말을 하고 있고, 이 문장 하나 때문에 띠가
                   한 줄 더 길어지면 정작 「수거 요청」이 밀립니다. */}
              <span className="hidden break-keep sm:inline">
                담당자에게 보이는 화면입니다 — 비원미래 전체 자료가 아닙니다.
              </span>
            </>
          ) : (
            <span className="break-keep">어느 병원 화면을 보실지 골라 주세요.</span>
          )}
        </p>
        {/*  병원 변경 (0088) — **누를 때만** 고르는 화면이 열립니다.
             ⚠ 지금 보던 화면을 기억해 두고 갑니다. 리포트를 보다 병원을
               바꾸면 새 병원의 **리포트**가 나와야지, 첫 화면으로 돌아가면
               고르고 또 눌러야 합니다. */}
        <Link
          data-portal-change
          to={page ? `${PORTAL_SELECT_PATH}?back=${page}` : PORTAL_SELECT_PATH}
          className="flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl border-2 border-amber-400 bg-white px-3.5 text-[1.02rem] font-extrabold text-amber-800 transition hover:bg-amber-100"
        >
          <Repeat size={16} strokeWidth={2.6} /> 병원 변경
        </Link>
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
// 어느 병원 화면을 볼 것인가
//
//  ⚠ 예전에는 목록의 **첫 병원**을 슬쩍 보여 줬습니다. 그러면 대표님은
//    그것을 「지금 보려던 그 병원」으로 읽습니다. 아무거나 보여 주느니
//    묻는 편이 낫습니다.
//
//  ⚠ 0088 — 이 화면은 이제 **자기 주소(/portal/select)를 가집니다.**
//    예전에는 「병원을 못 정했다」는 상태일 때 아무 화면에서나 이 목록이
//    본문 자리에 끼어들었습니다. 그래서 메뉴를 누를 때마다 튀어나왔습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalClientPicker({ clients, back = '' }: { clients: Client[]; back?: PortalPage }) {
  return (
    <div className="w-full">
      <h1 className="t-page break-keep text-navy-900">어느 병원 화면을 보시겠습니까?</h1>
      <p className="t-body mt-2.5 break-keep text-navy-500">
        고른 병원의 담당자에게 실제로 보이는 화면을 그대로 엽니다. 거래처 화면에서 「병원 화면 보기」를
        누르셔도 같은 곳으로 옵니다.
      </p>
      {clients.length === 0 ? (
        <p className="t-body mt-6 break-keep rounded-2xl bg-navy-50 px-5 py-4 text-navy-500">
          등록된 거래처가 없습니다.
        </p>
      ) : (
        <ul data-portal-picker className="mt-6 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <li key={c.id}>
              {/*  ⚠ **보던 화면 그대로** 새 병원으로 갑니다. 리포트를 보다
                   병원을 바꿨는데 첫 화면이 나오면 다시 리포트를 눌러야
                   합니다 — 대표님이 신고하신 「원점 복귀」가 그것입니다. */}
              <Link
                data-portal-pick={c.id}
                to={portalPath(c.id, back)}
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
