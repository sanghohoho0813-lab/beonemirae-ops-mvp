import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { guideById, openGuide, PICK, type FieldGuide as Guide } from '../lib/fieldGuides'
import { FieldGuidePicker } from './FieldGuidePicker'

// ─────────────────────────────────────────────────────────────────────────────
// 옆에서 알려 주는 사용 안내 (0069)
//
//  ── 예전 것과 무엇이 다른가 ───────────────────────────────────────────────
//
//   예전에는 화면 전체에 막을 한 장 덮었습니다 (「투어 중 실수로 화면이
//   조작되지 않게」). 그래서 기사님은 **읽기만** 하고 한 번도 눌러 보지
//   못한 채 끝났습니다. 다 보고 나서 「그래서 어디를 누르라고?」가 됩니다.
//
//   여기서는 막을 **네 조각으로 잘라** 짚은 곳 둘레만 덮습니다. 가운데는
//   뚫려 있어서 **그 자리는 진짜로 눌립니다.** 기사님이 직접 눌러 보면서
//   익히고, 누르면 다음 단계로 넘어갑니다.
//
//  ── 지키는 것 ─────────────────────────────────────────────────────────────
//   · 기다리게 하지 않습니다 — 단계가 바뀌면 그 자리에서 바뀝니다.
//   · 짚을 것이 화면에 없으면 그 단계는 **건너뜁니다.** 없는 것을 가리키며
//     설명하지 않습니다 (예전 투어가 실제로 그 상태였습니다).
//   · 설명은 화면 아래 한 줄 띠입니다. 큰 상자로 화면을 덮지 않습니다.
//   · 끝나면 하던 자리로 돌아갑니다.
// ─────────────────────────────────────────────────────────────────────────────

const PAD = 6

/**
 *  같은 이름표가 **폰용·PC용 두 벌** 붙어 있는 화면이 있습니다
 *  (오늘 목록이 그렇습니다). 첫 번째를 그냥 집으면 폰에서 숨어 있는
 *  PC용을 짚어, 아무것도 없는 곳에 동그라미가 그려집니다.
 *  **지금 눈에 보이는 것**을 집습니다.
 */
function anchor(at: string): Element | null {
  const all = [...document.querySelectorAll(`[data-guide="${at}"]`)]
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

export function FieldGuide({
  guideId,
  onClose,
}: {
  guideId: string | null
  onClose: () => void
}) {
  //  '__pick__' 은 「무엇을 볼지 고르는」 자리입니다 — 안내 자체가 아닙니다.
  //  ⚠ 「사용 방법」 들어가는 문이 도움말 시트와 더보기 두 군데라, 둘 다
  //    같은 곳으로 오게 합니다. 문마다 다른 것이 나오면 기사님이 헷갈립니다.
  const picking = guideId === PICK
  const guide: Guide | null = guideId && !picking ? guideById(guideId) : null
  const navigate = useNavigate()
  const { pathname } = useLocation()
  //  ⚠ 열린 경로(`/clients/`)에서 **어디로 데려갈지** 정하려면 거래처가
  //    필요합니다 (0076).
  const { data } = useData()
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  //  안내를 시작한 자리 — 끝나면 여기로 돌려보냅니다
  const cameFrom = useRef<string>(pathname)

  const step = guide?.steps[i] ?? null
  const last = !!guide && i >= guide.steps.length - 1

  useEffect(() => {
    if (guideId) {
      cameFrom.current = pathname
      setI(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideId])

  //  그 단계의 화면으로 옮깁니다. 이미 그 화면이면 아무 일도 안 합니다.
  //
  //  ⚠ 0076 — 예전에는 **열린 경로면 아무 데도 안 갔습니다.**
  //    `if (!okHere && !step.route.endsWith('/')) navigate(...)`
  //    그래서 기사님이 「다음」으로만 넘기면 거래처 목록에 선 채로
  //    「주소와 전화번호가 여기 있습니다」를 읽게 됐습니다. 짚을 것이 없으니
  //    테두리도 없어서, **엉뚱한 데를 보며 설명만 흘렀습니다.**
  //    이제 열린 경로에도 데려갈 곳(land)을 정해 두고 실제로 옮깁니다.
  useEffect(() => {
    if (!step) return
    //  '/clients/' 처럼 끝이 열린 경로는 「그 아래 어디든」이라는 뜻입니다.
    const okHere = step.route.endsWith('/')
      ? pathname.startsWith(step.route)
      : pathname === step.route
    if (okHere) return
    if (!step.route.endsWith('/')) {
      navigate(step.route)
      return
    }
    if (step.land === 'firstClient') {
      //  ⚠ 거래처가 아직 안 왔으면(서버에서 오는 중) 옮기지 않습니다.
      //    다음 렌더에 다시 옵니다 — 없는 곳으로 데려가지 않습니다.
      const first = data.clients[0]
      if (first) navigate(`/clients/${first.id}`)
    }
  }, [step, pathname, navigate, data.clients])

  //  ── 짚을 곳 찾기 ────────────────────────────────────────────────────────
  //   ⚠ 화면이 막 바뀐 직후에는 아직 그려지지 않았을 수 있습니다. 몇 번
  //     다시 봅니다. 그래도 없으면 **그 단계를 건너뜁니다** — 없는 것을
  //     가리키며 설명하면 기사님이 화면에서 그것을 찾다가 포기합니다.
  const findTarget = useCallback(() => {
    if (!step?.at) return null
    const el = anchor(step.at)
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return { el, r }
  }, [step])

  useEffect(() => {
    if (!guide || !step) return
    let alive = true
    let tries = 0
    const tick = () => {
      if (!alive) return
      if (!step.at) { setRect(null); return }
      const hit = findTarget()
      if (hit) {
        //  화면 밖이면 끌어옵니다 — 짚어 놓고 안 보이면 소용이 없습니다.
        const r = hit.r
        //  ⚠ 「아래 190px」처럼 숫자를 박아 두면 띠가 두 줄이 되는 순간
        //    다시 가려집니다. 띠를 **실제로 재서** 피합니다.
        const bar0 = document.querySelector('[data-guide-bar]')
        const barTop0 = bar0 ? bar0.getBoundingClientRect().top : window.innerHeight - 190
        if (r.top < 8 || r.bottom > barTop0 - 12) {
          hit.el.scrollIntoView({ block: 'center', behavior: 'auto' })
          //  ⚠ 굴린 **직후**에 자리를 읽으면 굴리기 전 자리가 나옵니다.
          //    그러면 테두리가 엉뚱한 것을 감쌉니다 — 실제로 「날짜 줄」을
          //    설명하면서 「수거 입력 시작」 단추를 감싸고 있었습니다.
          //    자리가 더 안 움직일 때까지 몇 프레임 지켜본 뒤 읽습니다.
          let lastTop = Number.NaN
          let same = 0
          const settle = () => {
            if (!alive) return
            const now = hit.el.getBoundingClientRect()
            if (Math.abs(now.top - lastTop) < 0.5) same += 1
            else same = 0
            lastTop = now.top
            if (same >= 2) { setRect(now); return }
            window.requestAnimationFrame(settle)
          }
          window.requestAnimationFrame(settle)
        } else {
          setRect(r)
        }
        return
      }
      tries += 1
      //  ⚠ 처음에는 「못 찾으면 그 단계를 건너뛴다」로 만들었습니다. 그런데
      //    실제 계정으로 해 보니 거래처 목록이 서버에서 오는 사이에 건너뛰어,
      //    「병원 정보 보기」 안내가 **네 단계 중 한 단계만 나오고 끝나**
      //    버렸습니다. 건너뛰는 것이 조용해서 더 나쁩니다.
      //
      //    그래서 건너뛰지 않습니다. 짚을 것이 아직(또는 끝내) 없으면
      //    **어둡게 덮지 않고 설명만** 아래에 띄웁니다. 기사님은 실제 화면을
      //    그대로 보면서 문장을 읽습니다 — 예전처럼 화면을 캄캄하게 덮고
      //    글자만 띄우는 것보다 낫습니다.
      if (tries > 60) { setRect(null); return }
      window.setTimeout(tick, 50)
    }
    tick()
    return () => { alive = false }
  }, [guide, step, i, findTarget, onClose])

  //  ── 자리를 계속 따라갑니다 ──────────────────────────────────────────────
  //
  //   ⚠ 한 번 재고 마는 것으로는 부족했습니다. 도움말 시트가 닫히면서
  //     **스크롤을 원래대로 되돌리는데**, 그때 scroll 이벤트가 안 납니다.
  //     그래서 안내는 「굴린 뒤 자리」를 들고 있고 화면은 굴리기 전으로
  //     돌아가, 테두리가 엉뚱한 것을 감싸고 있었습니다.
  //     (실제로 「날짜 줄」을 설명하면서 「수거 입력 시작」 단추를 감쌌습니다.)
  //
  //   그래서 이벤트만 믿지 않고 **짧게 계속 다시 잽니다.** 값이 같으면
  //   그리지 않으므로 거의 공짜입니다.
  useEffect(() => {
    if (!step?.at) return
    let raf = 0
    const on = () => {
      const hit = findTarget()
      const next = hit ? hit.r : null
      setRect((cur) => {
        if (!cur && !next) return cur
        if (cur && next && Math.abs(cur.top - next.top) < 0.5 && Math.abs(cur.left - next.left) < 0.5
          && Math.abs(cur.height - next.height) < 0.5) return cur
        return next
      })
    }
    //  ⚠ 다시 재기만 해서는 모자랐습니다. 시트가 닫히며 스크롤을 되돌리면
    //    짚을 것이 **안내 띠 뒤로 숨어** 버립니다. 그러면 테두리는 맞는데
    //    가려져서 누를 수가 없습니다 — 실제로 그 상태였습니다.
    //    숨었으면 **다시 끌어올립니다.**
    const keepVisible = () => {
      const hit = findTarget()
      if (!hit) return
      const bar = document.querySelector('[data-guide-bar]')
      const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight
      if (hit.r.top < 8 || hit.r.bottom > barTop - 12) {
        hit.el.scrollIntoView({ block: 'center', behavior: 'auto' })
      }
    }
    //  ⚠ 200ms 마다만 보면 그 사이에 **틀린 자리가 보입니다.** 시트가 닫히며
    //    스크롤이 되돌아간 순간이 딱 그 틈에 걸렸습니다. 기사님 눈에는
    //    테두리가 엉뚱한 데 떴다가 튀는 것으로 보입니다.
    //    그래서 ① 스크롤이 움직이면 **그 자리에서** 바로잡고
    //         ② 처음 1초는 매 프레임 지켜봅니다 (시트가 닫히는 동안).
    const fix = () => { keepVisible(); on() }
    const t0 = Date.now()
    const loop = () => {
      fix()
      raf = window.setTimeout(loop, Date.now() - t0 < 1200 ? 30 : 250)
    }
    loop()
    window.addEventListener('scroll', fix, true)
    window.addEventListener('resize', fix)
    return () => {
      window.clearTimeout(raf)
      window.removeEventListener('scroll', fix, true)
      window.removeEventListener('resize', fix)
    }
  }, [step, findTarget])

  //  ── 눌러서 다음으로 ─────────────────────────────────────────────────────
  //   짚은 자리는 뚫려 있어 **진짜로 눌립니다.** 눌린 것을 알아채고 다음으로
  //   넘어갑니다 — 기사님이 「보고만」 있지 않고 직접 해 봅니다.
  useEffect(() => {
    if (!step?.tapToGo || !step.at) return
    const el = anchor(step.at)
    if (!el) return
    const on = () => {
      //  화면이 바뀌는 데 시간이 조금 걸립니다. 그 뒤에 다음 단계로.
      window.setTimeout(() => setI((n) => Math.min(n + 1, (guide?.steps.length ?? 1) - 1)), 220)
    }
    el.addEventListener('click', on)
    return () => el.removeEventListener('click', on)
  }, [step, guide])

  //  화면이 바뀌면 설명도 즉시 따라갑니다
  useEffect(() => {
    if (!guide || !step?.goesTo) return
    if (pathname.startsWith(step.goesTo) && i < guide.steps.length - 1) setI((n) => n + 1)
  }, [pathname, guide, step, i])

  const dim = useMemo(() => {
    if (!rect) return null
    const t = Math.max(0, rect.top - PAD)
    const l = Math.max(0, rect.left - PAD)
    const w = rect.width + PAD * 2
    const h = rect.height + PAD * 2
    return { t, l, w, h }
  }, [rect])

  if (picking) {
    return (
      <div className="fixed inset-0 z-[95] flex items-end justify-center">
        <button aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-navy-950/50" />
        <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 sm:max-w-[30rem] sm:rounded-3xl">
          <FieldGuidePicker onPick={(id) => openGuide(id)} />
          <button
            data-guide-pick-close
            onClick={onClose}
            className="mt-4 min-h-[3.25rem] w-full rounded-2xl bg-navy-50 text-[1.1rem] font-extrabold text-navy-600 transition active:scale-[0.98]"
          >
            닫기
          </button>
        </div>
      </div>
    )
  }

  if (!guide || !step) return null

  const finish = () => {
    onClose()
    if (cameFrom.current && cameFrom.current !== window.location.pathname) navigate(cameFrom.current)
  }

  return (
    <div data-guide-on className="pointer-events-none fixed inset-0 z-[90]">
      {/*
        ── 막을 네 조각으로 ────────────────────────────────────────────────
        가운데(짚은 곳)는 덮지 않습니다. 그래서 그 자리는 **진짜로 눌립니다.**
        예전처럼 한 장으로 덮으면 기사님은 아무것도 눌러 볼 수 없습니다.
      */}
      {dim ? (
        <>
          <div className="pointer-events-auto absolute left-0 right-0 top-0 bg-navy-950/55" style={{ height: dim.t }} />
          <div className="pointer-events-auto absolute left-0 bg-navy-950/55" style={{ top: dim.t, height: dim.h, width: dim.l }} />
          <div className="pointer-events-auto absolute right-0 bg-navy-950/55" style={{ top: dim.t, height: dim.h, left: dim.l + dim.w }} />
          <div className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-navy-950/55" style={{ top: dim.t + dim.h }} />
          {/*  짚은 자리 테두리 — 누르는 것을 막지 않게 pointer-events 를 끕니다 */}
          <div
            data-guide-spot
            className="pointer-events-none absolute rounded-2xl ring-4 ring-teal-400"
            style={{ top: dim.t, left: dim.l, width: dim.w, height: dim.h }}
          />
        </>
      ) : (
        //  ⚠ 짚을 것이 없을 때 **화면 전체를 덮지 않습니다.** 예전 투어가
        //    딱 그랬습니다 — 캄캄한 배경에 글자만. 기사님은 지금 무엇을
        //    보고 있는지 잃어버립니다. 여기서는 실제 화면을 그대로 두고
        //    아래 설명 띠만 얹습니다.
        null
      )}

      {/*  설명 띠 — 화면 아래. 큰 상자로 덮지 않습니다. */}
      <div
        data-guide-bar
        className="pointer-events-auto absolute inset-x-0 bottom-0 bg-white px-4 pb-5 pt-4 shadow-[0_-8px_28px_rgba(8,15,28,0.18)]"
      >
        <div className="mb-2 flex items-center gap-2">
          <span data-guide-title className="text-[1.05rem] font-extrabold text-teal-700">{guide.title}</span>
          <span data-guide-count className="text-[1.05rem] font-bold text-navy-400">
            {i + 1} / {guide.steps.length}
          </span>
          <button
            data-guide-skip
            onClick={finish}
            className="ml-auto flex min-h-[2.75rem] items-center gap-1 rounded-xl px-3 text-[1.05rem] font-bold text-navy-500 transition active:scale-95"
          >
            <X size={17} strokeWidth={2.5} /> 그만보기
          </button>
        </div>

        {/*  한 문장. 큰 글자. */}
        <p data-guide-say className="break-keep text-[1.22rem] font-bold leading-snug text-navy-900">
          {step.say}
        </p>

        {/*  ⚠ 0076 — 짚어야 할 것이 있는데 **못 찾았을 때** 솔직히 말합니다.
             예전에는 아무 말 없이 설명만 흘러서, 기사님이 화면에서 그것을
             찾다가 「이 안내는 엉뚱한 데를 보고 있다」고 느꼈습니다.
             (그게 정확한 관찰이었습니다.) */}
        {step.at && !rect && (
          <p data-guide-nospot className="mt-1.5 break-keep text-[1.02rem] font-bold text-amber-700">
            지금 화면에는 이 자리가 없습니다 — 다음으로 넘어가셔도 됩니다.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            data-guide-prev
            onClick={() => setI((n) => Math.max(0, n - 1))}
            disabled={i === 0}
            className="flex min-h-[3.25rem] items-center gap-1 rounded-2xl bg-navy-50 px-4 text-[1.1rem] font-extrabold text-navy-600 transition active:scale-[0.97] disabled:opacity-40"
          >
            <ChevronLeft size={19} strokeWidth={2.5} /> 이전
          </button>
          <button
            data-guide-next
            onClick={() => (last ? finish() : setI((n) => n + 1))}
            className="flex min-h-[3.25rem] flex-1 items-center justify-center gap-1 rounded-2xl bg-navy-900 text-[1.15rem] font-extrabold text-white transition active:scale-[0.98]"
          >
            {last ? '다 봤습니다' : '다음'}
            {!last && <ChevronRight size={19} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  )
}
