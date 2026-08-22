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
    const bgOf = (el) => {
      let n = el
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor
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
      const ratio = contrast(fg, bgOf(el))
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
    let tight = 0
    const sorted = [...boxes].sort((a, b) => a.y - b.y)
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i].y - (sorted[i - 1].y + sorted[i - 1].h)
      if (gap >= 0 && gap < 8) tight += 1
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
