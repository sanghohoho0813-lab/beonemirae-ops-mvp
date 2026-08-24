import { useState } from 'react'
import { Sparkles, Waypoints, Clock, ListOrdered, Truck, TrendingDown } from 'lucide-react'
import { Modal } from './Modal'

// ─────────────────────────────────────────────────────────────────────────────
// AI 동선 추천 — **2단계 예정 기능의 입구만** 만들어 둡니다
//
//  대표님: 「정책자금/실사 때 향후 AX 확장 방향이 자연스럽게 보이도록,
//  TMAP + GPT 기반 동선 최적화 진입 UI 만 먼저 추가해줘. 이번 작업에서는
//  실제 TMAP API 나 GPT API 를 연결하지 않는다.」
//
//  ⚠ 화면에 보이는 이름은 **T맵 · ChatGPT** 로 적습니다 (0080). 대표님:
//    「TMAP GPT 이렇게 표시돼있는데 T맵, ChatGPT 라고 명확히 적어줘.」
//    영문 약자는 읽는 사람이 무엇인지 한 번 더 생각하게 만듭니다.
//
//  ⚠ 그래서 이 파일에는 **바깥으로 나가는 통신이 한 줄도 없습니다.**
//    fetch · axios · supabase 호출 없음. 키도, 주소도 없습니다.
//  ⚠ 그리고 **가짜 결과를 만들지 않습니다.** 추천 경로도, 절감률 숫자도
//    지어내지 않습니다. 한 번 지어낸 숫자는 실사에서 반드시 근거를 묻습니다.
//  ⚠ 「지금 AI 가 최적화하고 있다」로 읽힐 문구를 쓰지 않습니다. 아래
//    안내문 첫 줄이 「아직 켜지지 않았습니다」인 이유입니다.
//
//  ⚠ 기존 배차·편성 로직은 손대지 않았습니다. 이 파일은 화면에 얹히기만
//    하고, 어떤 일정·배차 값도 읽거나 바꾸지 않습니다 (props 도 없습니다).
// ─────────────────────────────────────────────────────────────────────────────

/** 예정 기능 — 넷만 둡니다. 늘어놓을수록 「이미 되는 것」처럼 보입니다. */
const PLANNED = [
  { icon: Clock, label: '실시간 교통 반영', desc: 'T맵의 실제 도로·교통 정보' },
  { icon: ListOrdered, label: '방문순서 추천', desc: '그날 갈 곳의 순서' },
  { icon: Truck, label: '기사·차량별 일정 분석', desc: '적재·인계시간까지 함께' },
  { icon: TrendingDown, label: '이동거리·운행시간 절감', desc: '실제 운행기록으로 검증' },
] as const

/** 「2단계」 딱지 — 버튼과 모달에서 같은 모양을 씁니다 */
function StageBadge({ className = '' }: { className?: string }) {
  return (
    <span
      data-routeai-badge
      //  ⚠ 0.85rem(13.6px) 이었습니다. 폰에서 16px 미만 글자는 안 됩니다 —
      //    검사(check_scale)가 잡았습니다. 딱지라고 작게 두면 결국 못 읽습니다.
      className={`shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[1rem] font-extrabold leading-tight tracking-tight text-violet-700 ${className}`}
    >
      2단계
    </span>
  )
}

function RouteAiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title="AI 동선 최적화"
      onClose={onClose}
      footer={
        <button className="btn-ghost flex-1" onClick={onClose}>
          닫기
        </button>
      }
    >
      <div data-routeai-panel className="space-y-3.5">
        {/*  ⚠ 제일 먼저 「아직 아니다」를 말합니다. 실사에서 화면만 보고
             「이미 AI 로 돌리고 있다」고 이해하면 그건 저희가 만든 오해입니다. */}
        <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-600">
            <Waypoints size={18} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[1.08rem] font-extrabold text-navy-900">
              아직 켜지지 않은 기능입니다 <StageBadge />
            </p>
            <p data-routeai-notyet className="mt-1 break-keep text-[1.02rem] leading-snug text-navy-600">
              지금은 <b className="text-navy-800">이 안내 화면까지만</b> 만들어 두었습니다.
              T맵이나 ChatGPT 에 연결하지 않았고, 경로나 절감 효과를 계산하지도 않습니다.
            </p>
          </div>
        </div>

        <p className="break-keep text-[1.08rem] leading-relaxed text-navy-700">
          <b className="text-navy-900">T맵</b>의 실제 도로·교통 정보와 <b className="text-navy-900">ChatGPT</b> 의
          업무조건 분석을 함께 써서, <b className="text-navy-900">기사님별 방문 순서와 이동 동선을 추천</b>하는
          기능입니다.
        </p>
        <p className="break-keep text-[1.05rem] leading-relaxed text-navy-600">
          실제 운행데이터와 Pilot 결과를 축적한 후 <b className="text-navy-800">2단계 AX 기능</b>으로 적용할
          예정입니다.
        </p>

        <div>
          <p className="mb-2 text-[1.02rem] font-extrabold text-navy-500">예정 기능</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PLANNED.map(({ icon: Icon, label, desc }) => (
              <li key={label} className="flex items-start gap-2.5 rounded-2xl bg-navy-50 px-3.5 py-2.5">
                <Icon size={17} strokeWidth={2.2} className="mt-0.5 shrink-0 text-violet-600" />
                <span className="min-w-0">
                  <span className="block break-keep text-[1.03rem] font-bold text-navy-800">{label}</span>
                  <span className="block break-keep text-[0.96rem] leading-snug text-navy-500">{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/*  ⚠ 순서가 중요합니다 — 좌표가 없으면 T맵을 붙여도 계산할 것이
             없습니다. 「무엇이 먼저 필요한가」를 적어 두면 실사에서
             계획으로 읽히고, 안 적으면 그냥 희망사항으로 읽힙니다. */}
        <p className="break-keep rounded-2xl bg-navy-50 px-4 py-3 text-[0.98rem] leading-snug text-navy-500">
          붙이기 전에 필요한 것 — 거래처 <b className="text-navy-700">주소의 좌표</b>와 Pilot 기간의
          <b className="text-navy-700"> 실제 출발·도착 기록</b>입니다. 이 둘이 쌓여야 추천이 맞는지 확인할 수
          있습니다.
        </p>
      </div>
    </Modal>
  )
}

/**
 * PC — 「일정 편성」·「배차·경로」 화면 우측 상단에 놓는 버튼.
 *
 *  ⚠ 저장·배차확정 같은 **실제 운영 버튼보다 더 튀면 안 됩니다.** 그래서
 *    채운 색(btn-primary)을 쓰지 않고 **테두리와 옅은 배경**으로만 세웁니다.
 *    보조버튼(btn-ghost)보다는 한 단계 위, 핵심 버튼보다는 한 단계 아래입니다.
 */
export function RouteAiButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        data-routeai-open
        onClick={() => setOpen(true)}
        className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-2 text-[1.05rem] font-extrabold text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-100 active:scale-95 ${className}`}
      >
        <Sparkles size={18} strokeWidth={2.4} className="shrink-0 text-violet-600" />
        AI 동선 추천
        <StageBadge className="bg-white/80" />
      </button>
      <RouteAiModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * 모바일 — 오늘 일정 위쪽에 놓는 얇은 줄.
 *
 *  ⚠ 폰에서 기사님이 제일 먼저 봐야 하는 것은 **오늘 갈 곳**입니다.
 *    그래서 **새 줄을 만들지 않고** 이미 있는 날짜 줄 오른쪽에 얹습니다 —
 *    처음에는 날짜 띠 아래 한 줄로 뒀는데 오늘 갈 곳 첫 줄이 55px 밀렸습니다.
 */
export function RouteAiChip({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        data-routeai-open
        onClick={() => setOpen(true)}
        className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-left transition active:scale-[0.99] ${className}`}
      >
        <Sparkles size={17} strokeWidth={2.4} className="shrink-0 text-violet-600" />
        <span className="min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold text-violet-800">
          추천 동선
        </span>
        <StageBadge className="bg-white/80" />
      </button>
      <RouteAiModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
