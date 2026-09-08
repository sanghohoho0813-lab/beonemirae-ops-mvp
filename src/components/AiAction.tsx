import { useState } from 'react'
import { Sparkles, ShieldCheck, Database, Wrench, Plug } from 'lucide-react'
import { Modal } from './Modal'
import { aiSpec, type AiSpecId, type AiSpec } from '../lib/aiSpecs'

// ─────────────────────────────────────────────────────────────────────────────
//  AI 자리 단추 — 화면마다 하나씩 서는 「여기에 AI 가 붙습니다」 (0094)
//
//  대표님: 「버튼 누르면 어떤 방식으로 이 기능들이 실행되는지, 뭘 위한건지
//  이런것도 다 나와야하고」
//
//  ⚠ **바깥으로 나가는 통신이 한 줄도 없습니다.** fetch · axios · supabase
//    호출 없음. 이 단추는 글을 여는 단추입니다.
//  ⚠ **가짜 결과를 만들지 않습니다.** 눌러도 추천·예측·절감률이 안 나옵니다.
//    창 맨 위 첫 문장이 「아직 켜지지 않은 기능입니다」인 이유입니다.
//    한 번 지어낸 숫자는 실사에서 반드시 근거를 묻습니다.
//  ⚠ 실제 운영 단추(저장·확정·보내기)보다 **더 튀면 안 됩니다.** 그래서
//    채운 색을 쓰지 않고 테두리와 옅은 배경으로만 세웁니다. 보조 단추보다는
//    한 단계 위, 핵심 단추보다는 한 단계 아래입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 「2단계」 딱지 — 단추와 창에서 같은 모양을 씁니다 */
export function StageBadge({ stage, className = '', suffix = true }: { stage: string; className?: string; suffix?: boolean }) {
  return (
    <span
      data-ai-badge
      //  ⚠ 0.85rem(13.6px) 이었습니다. 폰에서 16px 미만 글자는 안 됩니다 —
      //    검사(check_scale)가 잡았습니다. 딱지라고 작게 두면 결국 못 읽습니다.
      className={`shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[1rem] font-extrabold leading-tight tracking-tight text-violet-700 ${className}`}
    >
      {stage}{suffix ? ' · 아직 안 켜짐' : ''}
    </span>
  )
}

/** 창 안의 한 묶음 */
function Block({
  icon: Icon, title, tone = 'navy', children,
}: {
  icon: typeof Database
  title: string
  tone?: 'navy' | 'rose'
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[1.02rem] font-extrabold text-navy-500">
        <Icon size={16} strokeWidth={2.4} className={tone === 'rose' ? 'text-rose-500' : 'text-navy-400'} />
        {title}
      </p>
      {children}
    </div>
  )
}

export function AiSpecPanel({ spec }: { spec: AiSpec }) {
  return (
    <div data-ai-panel data-ai-spec={spec.id} className="space-y-4">
      {/*  ⚠ 제일 먼저 「아직 아니다」를 말합니다. 실사에서 화면만 보고
           「이미 AI 로 돌리고 있다」고 이해하면 그건 저희가 만든 오해입니다. */}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-600">
          <Sparkles size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[1.08rem] font-extrabold text-navy-900">
            아직 켜지지 않은 기능입니다 <StageBadge stage={spec.stage} />
          </p>
          <p data-ai-notyet className="mt-1 break-keep text-[1.02rem] leading-snug text-navy-600">
            지금은 <b className="text-navy-800">이 안내 화면까지만</b> 만들어 두었습니다. {spec.notYet}
          </p>
        </div>
      </div>

      <Block icon={Wrench} title="무엇을 위한 것인가">
        <div data-ai-why className="grid gap-2">
          {spec.why.split('\n').map((para) => (
            <p key={para.slice(0, 24)} className="break-keep text-[1.06rem] leading-relaxed text-navy-700">
              {para}
            </p>
          ))}
        </div>
      </Block>

      {/*  ⚠ 대표님이 제일 먼저 보실 자리입니다 — 「어떤 방식으로 실행되는지」.
           그래서 말이 아니라 **차례**로 적습니다. 몇 번째에 사람이 끼는지가
           한눈에 보여야 합니다. */}
      <Block icon={Plug} title="켜지면 이렇게 돕니다">
        <ol data-ai-how className="grid gap-2">
          {spec.how.map((s, i) => (
            <li key={s.title} className="flex items-start gap-2.5 rounded-2xl bg-navy-50 px-3.5 py-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[0.95rem] font-extrabold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block break-keep text-[1.03rem] font-bold text-navy-800">{s.title}</span>
                <span className="block break-keep text-[0.98rem] leading-snug text-navy-500">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </Block>

      {spec.planned && (
        <Block icon={Sparkles} title="예정 기능">
          <ul data-ai-planned className="grid gap-2 sm:grid-cols-2">
            {spec.planned.map((f) => (
              <li key={f.label} className="rounded-2xl bg-navy-50 px-3.5 py-2.5">
                <span className="block break-keep text-[1.03rem] font-bold text-navy-800">{f.label}</span>
                <span className="block break-keep text-[0.96rem] leading-snug text-navy-500">{f.desc}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Block icon={Database} title="무엇을 재료로 쓰는가">
          <ul data-ai-uses className="grid gap-1.5">
            {spec.uses.map((u) => (
              <li key={u} className="break-keep text-[1.01rem] leading-snug text-navy-600">· {u}</li>
            ))}
          </ul>
        </Block>

        {/*  ⚠ 이 칸을 빼면 안 됩니다. 실사에서 제일 먼저 나오는 물음이
             「그럼 청구도 AI 가 합니까」입니다. 답이 화면에 있어야 합니다. */}
        <Block icon={ShieldCheck} title="AI 가 정하지 않는 것" tone="rose">
          <ul data-ai-never className="grid gap-1.5">
            {spec.never.map((n) => (
              <li key={n} className="break-keep text-[1.01rem] leading-snug text-navy-700">· {n}</li>
            ))}
          </ul>
        </Block>
      </div>

      {/*  ⚠ 「무엇이 먼저 필요한가」를 적어 두면 실사에서 계획으로 읽히고,
           안 적으면 그냥 희망사항으로 읽힙니다. */}
      <div className="grid gap-2 rounded-2xl bg-navy-50 px-4 py-3.5">
        <p className="break-keep text-[0.99rem] leading-snug text-navy-600">
          <b className="text-navy-800">붙이기 전에 필요한 것</b> — <span data-ai-needs>{spec.needs}</span>
        </p>
        <p className="break-keep text-[0.99rem] leading-snug text-navy-600">
          <b className="text-navy-800">쓸 서비스</b> — <span data-ai-api>{spec.api}</span>
        </p>
      </div>
    </div>
  )
}

function AiSpecModal({ id, open, onClose }: { id: AiSpecId; open: boolean; onClose: () => void }) {
  const spec = aiSpec(id)
  return (
    <Modal
      open={open}
      title={spec.title}
      onClose={onClose}
      footer={<button className="btn-ghost flex-1" onClick={onClose}>닫기</button>}
    >
      <AiSpecPanel spec={spec} />
    </Modal>
  )
}

/**
 * 넓은 화면 — 화면 제목 오른쪽에 놓는 단추.
 * 폰에서는 얇은 줄로 바뀝니다(`variant="chip"`).
 */
export function AiButton({
  id, variant = 'bar', className = '',
}: {
  id: AiSpecId
  variant?: 'bar' | 'chip'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const spec = aiSpec(id)
  const chip = variant === 'chip'
  return (
    <>
      <button
        data-ai-open={id}
        onClick={() => setOpen(true)}
        className={
          chip
            ? `flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-left transition active:scale-[0.99] ${className}`
            : `flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-2 text-[1.05rem] font-extrabold text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-100 active:scale-95 ${className}`
        }
      >
        <Sparkles size={chip ? 17 : 18} strokeWidth={2.4} className="shrink-0 text-violet-600" />
        {chip ? (
          <span className="min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold text-violet-800">
            {spec.shortLabel}
          </span>
        ) : (
          spec.label
        )}
        {/*  단추 위 딱지는 짧게 — 「준비 중」. 320px 폰 헤더에서 긴 딱지가 날짜 칸을 세로로 짓눌렀습니다.
             단계 번호와 「아직 안 켜짐」은 창 안에서 그대로 보입니다. */}
        <StageBadge stage="준비 중" suffix={false} className="bg-white/80" />
      </button>
      <AiSpecModal id={id} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
