import { useEffect, useRef, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 화면의 창 — 모달과 서랍 (0089)
//
//  대표님: 「카드 클릭 → 현재 화면 유지 → Modal 중앙 등장 → background dim →
//  작업 완료 → Modal 닫힘 → Dashboard 정보 즉시 업데이트」
//
//  ── 왜 새로 만들었나 ────────────────────────────────────────────────────
//   기존 Modal 은 「짧은 입력창」용입니다(max-w-lg). 이번 창들은 성격이
//   다릅니다 — 고르는 단추가 여럿이고, 서랍은 표를 담습니다.
//   기존 Modal 은 **그대로 둡니다**(내부 화면 수십 곳이 씁니다).
//
//  ── 폰에서는 작은 팝업으로 억지로 두지 않습니다 ─────────────────────────
//   대표님: 「모바일에서는 bottom sheet 또는 full-screen modal」.
//   390px 에서 가운데 작은 창을 띄우면 고르는 단추가 두 줄로 접히고
//   손가락이 안 닿습니다. 폰에서는 아래에서 올라와 화면을 거의 채웁니다.
//
//  ⚠ 아래 CTA 는 **고정**입니다. 고르는 항목이 길어지면 「요청 보내기」가
//    화면 밖으로 나가는데, 그러면 병원 담당자는 다 골라 놓고 보낼 방법을
//    못 찾습니다.
// ─────────────────────────────────────────────────────────────────────────────

// ── 뒤 화면 스크롤 잠금 — **세어서** 풉니다 (0093) ──────────────────────────
//
//  창이 몇 개 열려 있는지 세고, 0 이 될 때만 되돌립니다.
//  겹쳐 열려도 마지막 하나가 닫힐 때 정확히 한 번 풀립니다.
let lockCount = 0
let lockPrev = ''

function lockScroll() {
  if (lockCount === 0) lockPrev = document.body.style.overflow
  lockCount += 1
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) document.body.style.overflow = lockPrev
}

type SheetKind = 'form' | 'wide' | 'drawer'

const BOX: Record<SheetKind, string> = {
  //  고르는 창 — 단추 두 줄이 편히 들어가는 폭
  form: 'sm:max-w-[34rem]',
  //  리포트처럼 숫자가 여러 칸인 창
  wide: 'sm:max-w-[56rem]',
  //  서랍 — PC 에서는 오른쪽에 붙습니다
  drawer: '',
}

export function PortalSheet({
  open,
  title,
  subtitle,
  kind = 'form',
  onClose,
  children,
  footer,
  name,
  hero,
}: {
  open: boolean
  title: string
  subtitle?: ReactNode
  kind?: SheetKind
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 검사와 안내가 이 창을 찾는 이름 */
  name: string
  /**
   *  머리 사진 (0095) — 창이 무엇에 대한 것인지 한눈에 보이는 얇은 띠.
   *  ⚠ 장식입니다. 정보는 전부 글자로 있으므로 alt 를 비웁니다.
   *  ⚠ 얇게(7rem) 고정합니다 — 사진이 크면 정작 고를 것이 밀립니다.
   */
  hero?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  //  ⚠ 창이 열려 있는 동안 뒤 화면이 같이 스크롤되면, 창을 닫았을 때
  //    엉뚱한 자리에 와 있습니다.
  //
  //  ⚠ 0093 — 「열기 전 값을 기억했다 되돌리기」로 하지 않습니다.
  //    창 하나에서 다른 창으로 바로 넘어가는 길이 있습니다(증빙 → 이력).
  //    그때 두 창이 잠깐 겹치면, 나중 창이 **앞 창이 걸어 둔 hidden 을
  //    「원래 값」으로 기억**했다가 닫을 때 되돌려 놓습니다. 그러면 화면이
  //    영영 안 굴러갑니다 — 병원 담당자에게는 그냥 「먹통」입니다.
  //    지금 구조에서는 안 겹치는 것을 확인했지만, 창이 하나 더 늘면
  //    언제든 겹칩니다. **세어서** 마지막 창이 닫힐 때만 풉니다.
  useEffect(() => {
    if (!open) return
    lockScroll()
    return unlockScroll
  }, [open])

  //  ⚠ Esc 로 닫힙니다. PC 에서 제일 빠른 닫기입니다.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const isDrawer = kind === 'drawer'

  return (
    <AnimatePresence>
      {open && (
        <div
          ref={boxRef}
          data-portal-sheet={name}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`fixed inset-0 z-[70] flex ${
            isDrawer ? 'items-stretch justify-end' : 'items-end justify-center sm:items-center'
          }`}
        >
          {/*  뒤 화면을 어둡게 — 지금 하는 일에 집중하도록 */}
          <motion.div
            data-sheet-dim
            className="absolute inset-0 bg-navy-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            className={
              isDrawer
                ? 'relative z-10 flex h-full w-full flex-col bg-app shadow-2xl sm:max-w-[40rem]'
                : `relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-app shadow-2xl sm:rounded-3xl ${BOX[kind]}`
            }
            initial={
              isDrawer
                ? { x: '100%', opacity: 0.7 }
                : { y: '100%', opacity: 0.7 }
            }
            animate={isDrawer ? { x: 0, opacity: 1 } : { y: 0, opacity: 1 }}
            exit={isDrawer ? { x: '100%', opacity: 0.7 } : { y: '100%', opacity: 0.7 }}
            transition={{ type: 'spring', stiffness: 340, damping: 36 }}
          >
            {/*  머리 — 무슨 창인지. 스크롤해도 남습니다. */}
            <div className="flex shrink-0 items-start gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <h2 className="t-card break-keep text-navy-900">{title}</h2>
                {subtitle && <p className="t-muted mt-1 break-keep leading-snug">{subtitle}</p>}
              </div>
              {/*  ⚠ 닫기는 44px 이상입니다. 요양병원 담당자분들이 쓰십니다. */}
              <button
                data-sheet-close
                onClick={onClose}
                aria-label="닫기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-navy-500 transition hover:bg-navy-50"
              >
                <X size={22} strokeWidth={2.4} />
              </button>
            </div>

            {/*  본문 — 여기만 스크롤됩니다 */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {hero && (
                <img
                  data-sheet-hero
                  src={hero}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="mb-5 h-28 w-full rounded-2xl object-cover sm:h-32"
                />
              )}
              {children}
            </div>

            {/*  아래 CTA — 고정. 다 골라 놓고 보낼 방법을 못 찾으면 안 됩니다. */}
            {footer && (
              <div
                className="shrink-0 border-t border-navy-100 bg-white px-5 py-4 sm:px-6"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 고르는 단추들 — **타이핑을 줄이려고** 만들었습니다 (0089)
//
//  대표님: 「사용자가 입력해야 할 내용보다 선택할 수 있는 내용을 먼저
//  보여준다」 · 「타이핑은 정말 필요한 경우에만」
//
//  ⚠ 병원 담당자는 폐기물이 본업이 아닙니다. 빈 칸을 주면 무엇을 적어야
//    할지 몰라서 전화를 겁니다. 고를 것을 주면 고릅니다.
// ─────────────────────────────────────────────────────────────────────────────

export function SheetStep({
  no,
  title,
  hint,
  children,
}: {
  no: number
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section data-sheet-step={no} className="mb-5 last:mb-0">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-[0.9rem] font-black text-white">
          {no}
        </span>
        <h3 className="t-body min-w-0 break-keep font-extrabold text-navy-900">{title}</h3>
        {hint && <span className="t-muted break-keep">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export interface ChoiceItem {
  value: string
  label: string
  /** 아래 작은 글씨 — 「평소보다 많음」처럼 근거가 있을 때만 */
  note?: string
}

/**
 * 고르는 단추 묶음.
 *
 *  ⚠ 한 줄에 두 개까지만 둡니다. 셋을 넣으면 390px 에서 한 칸이 110px 이 되어
 *    「격리 의료폐기물」이 세 줄로 접힙니다.
 */
export function ChoiceGrid({
  items,
  value,
  onPick,
  multi = false,
  name,
  cols = 2,
}: {
  items: ChoiceItem[]
  /** 하나 고르기면 문자열, 여러 개면 배열 */
  value: string | string[]
  onPick: (v: string) => void
  multi?: boolean
  name: string
  cols?: 1 | 2
}) {
  const on = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v)
  return (
    <div
      data-choice={name}
      className={`grid gap-2 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}
    >
      {items.map((it) => {
        const picked = on(it.value)
        return (
          <button
            key={it.value}
            type="button"
            data-choice-item={it.value}
            data-picked={picked ? '1' : undefined}
            aria-pressed={picked}
            onClick={() => onPick(it.value)}
            className={`flex min-h-[3.25rem] items-center gap-2.5 rounded-2xl px-4 py-3 text-left transition ${
              picked
                ? 'bg-navy-900 text-white ring-2 ring-navy-900'
                : 'bg-white text-navy-800 ring-1 ring-navy-200 hover:ring-navy-400'
            }`}
          >
            {/*  ⚠ 고른 것을 색만으로 구분하지 않습니다. 색만 쓰면 화면 색을
                 바꾸신 분이나 색을 잘 못 가리는 분이 못 알아봅니다. */}
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                picked ? 'bg-teal-400 text-navy-900' : 'bg-navy-100 text-transparent'
              } ${multi ? '' : 'rounded-full'}`}
            >
              <Check size={13} strokeWidth={3.4} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="t-body block break-keep font-bold">{it.label}</span>
              {it.note && (
                <span className={`t-muted mt-0.5 block break-keep ${picked ? 'text-navy-200' : ''}`}>
                  {it.note}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
