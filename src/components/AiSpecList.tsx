import { useState } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'
import { AI_SPEC_ORDER, aiSpec, type AiSpecId } from '../lib/aiSpecs'
import { AiSpecPanel, StageBadge } from './AiAction'
import { Modal } from './Modal'

// ─────────────────────────────────────────────────────────────────────────────
//  AI 자리 **전체 목록** — 활용 계획 화면에 한 장으로 (0094)
//
//  화면마다 흩어져 있는 단추를 한 곳에 모아 놓은 것입니다. 실사에서
//  「AI 를 어디에 어떻게 쓸 겁니까」를 물으면, 화면을 열두 번 옮겨 다니는
//  대신 이 한 장을 보여 드리면 됩니다.
//
//  ⚠ 여기도 **바깥으로 나가는 통신이 없습니다.** 목록과 글뿐입니다.
//  ⚠ 「12가지 AI 기능」처럼 적지 않습니다. **12군데가 아직 안 켜져 있습니다**가
//    사실입니다. 세는 말을 앞세우면 되는 것처럼 읽힙니다.
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_NOTE: Record<string, string> = {
  '2단계': 'Pilot 자료가 쌓이면',
  '3단계': '한 해치 기록이 쌓여야',
}

export function AiSpecList() {
  const [open, setOpen] = useState<AiSpecId | null>(null)
  const spec = open ? aiSpec(open) : null
  return (
    <>
      <p data-ailist-basis className="t-muted mb-3 flex items-start gap-2 break-keep rounded-2xl bg-navy-50 px-4 py-3.5 leading-snug">
        <Sparkles size={17} strokeWidth={2.4} className="mt-0.5 shrink-0 text-violet-500" />
        <span>
          아래 자리들은 <b className="text-navy-700">아직 한 곳도 켜지지 않았습니다.</b> 지금 화면에 보이는
          모든 숫자와 문장은 쌓인 기록을 정해 둔 규칙으로 계산한 것입니다.
          각 줄을 누르시면 무엇을 위한 것인지, 켜지면 어떻게 도는지, 사람이 무엇을 정하는지 나옵니다.
        </span>
      </p>

      <ul data-ailist className="grid gap-2 lg:grid-cols-2">
        {AI_SPEC_ORDER.map((id) => {
          const s = aiSpec(id)
          return (
            <li key={id}>
              <button
                data-ailist-item={id}
                onClick={() => setOpen(id)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl border border-navy-100 bg-white px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50/50 active:scale-[0.995]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                  <Sparkles size={17} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="break-keep text-[1.06rem] font-extrabold text-navy-900">{s.title}</b>
                    <StageBadge stage={s.stage} />
                  </span>
                  <span className="mt-0.5 block break-keep text-[0.99rem] leading-snug text-navy-500">
                    {s.where} · {STAGE_NOTE[s.stage] ?? ''} 붙일 자리입니다
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-navy-300" />
              </button>
            </li>
          )
        })}
      </ul>

      <Modal
        open={spec != null}
        title={spec?.title ?? ''}
        onClose={() => setOpen(null)}
        footer={<button className="btn-ghost flex-1" onClick={() => setOpen(null)}>닫기</button>}
      >
        {spec && <AiSpecPanel spec={spec} />}
      </Modal>
    </>
  )
}
