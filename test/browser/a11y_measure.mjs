//  a11y_field.mjs 의 계측부를 그대로 떼어 낸 것입니다 (자를 두 벌 만들지 않습니다).
//  ⚠ 로그인 계정이 없어도 도는 시늉본 화면에서 같은 자로 재기 위해서입니다.
export async function measure(p, SMALL = 16) {
  return await p.evaluate((SMALL) => {
    const vis = (el) => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
    }
    const root = document.querySelector('main') ?? document.body
    const all = [...root.querySelectorAll('*')].filter(vis)

    //  ── 글자 크기 ─────────────────────────────────────────────────────────
    //   ⚠ 글자를 **직접 담고 있는** 태그만 셉니다. 부모까지 세면 같은 글자를
    //     여러 번 세게 됩니다.
    const textEls = all.filter((el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0))
    const sizes = textEls.map((el) => ({
      px: Math.round(parseFloat(getComputedStyle(el).fontSize)),
      color: getComputedStyle(el).color,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 26),
    }))
    const small = sizes.filter((s) => s.px < SMALL)

    //  ── 읽기 어려운 글자 = **대비가 낮은** 글자 ───────────────────────────
    //
    //   ⚠ 처음에는 「밝은 회색이면 흐린 것」으로 셌습니다. 그러니 **어두운
    //     바탕 위의 흰 글자**까지 흐린 것으로 세었습니다 — 날짜 띠의 오늘
    //     칸(진한 남색 바탕 + 흰 글자)이 그렇게 잡혔습니다. 그건 오히려
    //     가장 잘 보이는 글자입니다. 자가 틀리면 고친 뒤 숫자도 못 믿습니다.
    //
    //   그래서 **실제 배경색과의 대비**를 계산합니다 (WCAG 기준 4.5:1).
    const lum = (r, g, b) => {
      const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const parse = (c) => { const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null }
    //  배경은 투명일 수 있습니다 — 색이 칠해진 조상을 찾아 올라갑니다.
    //
    //  ⚠ 0082 — 여기 **자가 틀려 있었습니다.**
    //
    //    `bg-gradient-to-br from-navy-800 to-navy-900` 같은 칸은 색을
    //    `background-color` 가 아니라 `background-image`(linear-gradient) 로
    //    칠합니다. 그래서 `backgroundColor` 는 투명이고, 자는 그대로 위로
    //    올라가 **흰 배경**을 찾아냈습니다. 결과는 「진한 남색 위 흰 글자가
    //    1.1:1 — 거의 안 보임」. 실제로는 가장 잘 보이는 글자입니다.
    //
    //    이 상태로 숫자를 믿으면, 멀쩡한 히어로 칸의 흰 글자를 어둡게
    //    바꿔서 **진짜로 안 보이게** 만들게 됩니다. 자가 틀리면 고친 뒤
    //    숫자도 못 믿습니다.
    //
    //    그라데이션의 색 정지점을 읽어 **가장 불리한 정지점**으로 잽니다.
    //    (그라데이션은 자리마다 색이 다르므로, 제일 안 좋은 자리를 기준으로
    //     삼는 것이 맞습니다 — 통과시키려고 유리한 쪽을 고르지 않습니다)
    const stopsOf = (img) => {
      const out = []
      const re = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g
      let m
      while ((m = re.exec(img))) {
        //  거의 투명한 정지점은 배경 노릇을 못 합니다 — 건너뜁니다.
        if (m[4] !== undefined && Number(m[4]) <= 0.5) continue
        out.push([+m[1], +m[2], +m[3]])
      }
      return out
    }
    const bgOf = (el, fg) => {
      let n = el
      while (n && n !== document.documentElement) {
        const st = getComputedStyle(n)
        //  ── 그라데이션이 먼저입니다 — 배경색보다 위에 그려집니다 ──────────
        const img = st.backgroundImage
        if (img && img !== 'none' && /gradient/.test(img)) {
          const stops = stopsOf(img)
          if (stops.length) {
            if (!fg) return stops[0]
            //  글자와 **가장 대비가 낮은** 정지점을 고릅니다.
            let worst = stops[0]
            let worstR = Infinity
            for (const s of stops) {
              const a = lum(...fg) + 0.05
              const b = lum(...s) + 0.05
              const rr = a > b ? a / b : b / a
              if (rr < worstR) { worstR = rr; worst = s }
            }
            return worst
          }
        }
        const bg = st.backgroundColor
        const a = bg.match(/rgba?\([^)]*?,\s*([\d.]+)\)$/)
        if (bg && bg !== 'transparent' && (!a || Number(a[1]) > 0.5)) { const p = parse(bg); if (p) return p }
        n = n.parentElement
      }
      return [255, 255, 255]
    }
    const contrast = (fg, bg) => {
      const a = lum(...fg) + 0.05, b2 = lum(...bg) + 0.05
      return a > b2 ? a / b2 : b2 / a
    }
    //  ⚠ 기준을 무조건 4.5:1 로 두면 **큰 굵은 글자**까지 걸립니다. 실제
    //    기준(WCAG)은 큰 글자(18.66px 이상 굵게 · 24px 이상)는 3:1 입니다 —
    //    큰 글자는 얇은 글자보다 잘 읽히기 때문입니다.
    //    이건 기준을 낮추는 것이 아니라 **맞는 자를 쓰는 것**입니다.
    //    (통과시키려고 숫자를 만지는 것과는 다릅니다 — 파란 저장 단추의
    //     흰 글자를 「안 보인다」고 세면 그 자는 틀린 것입니다.)
    const grayish = textEls.map((el, i) => {
      const st = getComputedStyle(el)
      const fg = parse(st.color)
      if (!fg) return null
      const px = parseFloat(st.fontSize)
      const bold = Number(st.fontWeight) >= 700
      const big = px >= 24 || (px >= 18.66 && bold)
      const need = big ? 3 : 4.5
      const ratio = contrast(fg, bgOf(el, fg))
      return ratio < need ? { ...sizes[i], ratio: Math.round(ratio * 10) / 10, need } : null
    }).filter(Boolean)

    //  ── 누를 것 ───────────────────────────────────────────────────────────
    const taps = all.filter((el) =>
      ['BUTTON', 'A', 'SELECT', 'INPUT', 'TEXTAREA'].includes(el.tagName) || el.getAttribute('role') === 'button')
    const boxes = taps.map((el) => {
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top),
        t: (el.textContent ?? el.getAttribute('aria-label') ?? el.tagName).replace(/\s+/g, ' ').trim().slice(0, 20) }
    })
    const tooSmall = boxes.filter((x) => x.h < 44 || x.w < 44)
    //  서로 붙어 있는 것 — 세로 간격 8px 미만
    //
    //  ⚠ 떠 있는 것(position: fixed·sticky)은 **문서 흐름 위에 얹혀** 있습니다.
    //    화면 아래 떠 있는 ＋ 단추를 흐름 안 요소처럼 세면, 그 아래 우연히
    //    걸린 목록 줄과 「4px 붙었다」로 잡힙니다. 실제로는 겹쳐 떠 있는
    //    것이지 나란히 있는 것이 아닙니다. 흐름 안 것끼리만 견줍니다.
    const flow = taps.filter((el) => {
      const pos = getComputedStyle(el).position
      return pos !== 'fixed' && pos !== 'sticky'
    })
    //  ⚠ 0099 — **가로로 겹치는 것끼리만** 견줍니다. 전에는 세로 순서만
    //    보고 「바로 다음 것」과 간격을 쟀는데, 달력에서 한 칸의 오른쪽
    //    아래 표식(x≈604)과 **다음 줄 왼쪽 끝** 날짜(x≈26)가 7px 로 잡혔습니다.
    //    가로로 578px 떨어진 두 단추는 손가락이 굵어도 함께 누를 수 없습니다.
    //    자가 틀린 것이지 화면이 틀린 것이 아닙니다.
    let tight = 0
    const boxes2 = flow.map((el) => {
      const r = el.getBoundingClientRect()
      return { y: Math.round(r.top + window.scrollY), h: Math.round(r.height),
        x: Math.round(r.left), w: Math.round(r.width) }
    }).sort((a, b) => a.y - b.y)
    for (let i = 1; i < boxes2.length; i += 1) {
      const b = boxes2[i]
      //  위쪽에 있는 것들 중 가로로 겹치면서 세로 간격이 8px 미만인 것을 찾습니다
      for (let j = i - 1; j >= 0 && boxes2[j].y + boxes2[j].h > b.y - 8; j -= 1) {
        const a = boxes2[j]
        const gap = b.y - (a.y + a.h)
        const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0
        if (gap >= 0 && gap < 8 && xOverlap) { tight += 1; break }
      }
    }

    return {
      h: document.documentElement.scrollHeight,
      textCount: sizes.length,
      small: small.length,
      smallList: small.slice(0, 6).map((s) => `${s.px}px "${s.text}"`),
      minPx: sizes.length ? Math.min(...sizes.map((s) => s.px)) : 0,
      gray: grayish.length,
      grayList: grayish.slice(0, 14).map((s) => `${s.px}px 대비 ${s.ratio}:1 (기준 ${s.need}) "${s.text}"`),
      grayPct: sizes.length ? Math.round((grayish.length / sizes.length) * 100) : 0,
      taps: boxes.length,
      tooSmall: tooSmall.length,
      tooSmallList: tooSmall.slice(0, 5).map((x) => `${x.h}×${x.w} "${x.t}"`),
      tight,
    }
  }, SMALL)
}
