import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0082 — 자재 관리 화면이 사람이 볼 수 있는 크기인가
//
//   대표님이 이 화면을 여는 이유는 「지금 재고가 얼마인가」입니다.
//   그런데 그 아래로 **지금까지의 모든 공급**이 딸려 나왔습니다. 재 봤습니다 —
//
//     공급 1,408건 · 화면 안 칸 21,958개 · 누를 것 1,464개
//     폰 화면 길이 **255,996px** = 폰 화면 300장
//
//   회사가 오래 굴러갈수록 더 나빠지는 종류의 문제입니다.
//
//   ⚠ 확인하는 것은 「짧아졌나」가 아니라 **「짧아졌는데도 다 닿을 수 있나」**
//     입니다. 조용히 잘라 놓고 짧다고 하면 「내 기록이 없어졌다」가 됩니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

async function open(w = 1280) {
  const state = { profile: { ...W.profileFor('admin'), font_scale: 'normal' }, reqs: 0, writes: [], schemaVersion: 79 }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 1024 ? 844 : 900 }, isMobile: w < 1024, hasTouch: w < 1024 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/materials`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(400)
  return { ctx, p, state }
}
const cards = (p) => p.locator('[data-supply-line]').count()

// ── ① 사람이 볼 수 있는 크기인가 ────────────────────────────────────────────
{
  const { ctx, p } = await open(390)
  const m = await p.evaluate(() => ({
    nodes: document.querySelectorAll('main *').length,
    taps: document.querySelectorAll('main button, main a, main select').length,
    h: document.documentElement.scrollHeight,
  }))
  //  ⚠ 기준은 「예전보다 낫다」가 아니라 **사람이 감당하는 크기**입니다.
  //    폰 화면 한 장이 844px 이므로 30장(≈25,000px)을 넘으면 실오라기입니다.
  ok(m.h < 25000, '**폰에서 화면 길이가 사람이 감당할 범위** (예전 255,996px)', `${m.h}px · 폰 ${Math.round(m.h / 844)}장`)
  ok(m.nodes < 3000, '화면 안 칸이 폭발하지 않음 (예전 21,958개)', `${m.nodes}개`)
  ok(m.taps < 300, '누를 것이 폭발하지 않음 (예전 1,464개)', `${m.taps}개`)
  await ctx.close()
}

// ── ② 조용히 자르지 않는가 ──────────────────────────────────────────────────
{
  const { ctx, p } = await open()
  const n = await cards(p)
  ok(n > 0 && n <= 30, '처음에는 최근 30건만 그린다', `${n}건`)
  const cnt = flat(await p.locator('[data-supply-count]').innerText())
  //  ⚠ 제일 중요한 줄입니다. 「몇 건 중 몇 건」이 안 적혀 있으면 자른 것이
  //    아니라 **없어진 것**으로 보입니다.
  ok(/전체 [\d,]+건 중 [\d,]+건/.test(cnt), '**「전체 몇 건 중 몇 건」이라고 적는다**', cnt)
  ok(/전체 1,408건/.test(cnt), '전체 건수가 실제 건수와 같다', cnt)
  await ctx.close()
}

// ── ③ 더 볼 수 있는가 ───────────────────────────────────────────────────────
{
  const { ctx, p } = await open()
  const before = await cards(p)
  const more = p.locator('[data-supply-more]')
  ok((await more.count()) === 1, '「더 보기」가 있다')
  ok(/[\d,]+건 더 보기/.test(flat(await more.innerText())), '몇 건이 더 있는지 적혀 있다',
    flat(await more.innerText()))
  const box = await more.boundingBox()
  ok((box?.height ?? 0) >= 44, '「더 보기」가 누를 만한 크기', `${Math.round(box?.height ?? 0)}px`)
  await more.click()
  await p.waitForTimeout(500)
  const after = await cards(p)
  ok(after === before + 30, '**누르면 30건이 더 나온다**', `${before} → ${after}`)
  await ctx.close()
}

// ── ④ 거래처로 좁힐 수 있는가 ───────────────────────────────────────────────
{
  const { ctx, p } = await open()
  const sel = p.locator('[data-supply-filter]')
  ok((await sel.count()) === 1, '거래처로 좁히는 칸이 있다')
  //  ⚠ 고르면 0건이 나오는 이름이 목록에 있으면 「고장인가?」가 됩니다.
  const opts = await sel.locator('option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean))
  ok(opts.length > 0, '고를 거래처가 있다', `${opts.length}곳`)
  await sel.selectOption(opts[0])
  await p.waitForTimeout(500)
  const names = await p.locator('[data-supply-line]').evaluateAll((els) =>
    els.map((e) => e.closest('li')?.innerText?.split('\n')[0] ?? ''))
  ok(names.length > 0, '**고른 거래처의 기록이 나온다**', `${names.length}건`)
  ok(new Set(names).size === 1, '고른 거래처 것만 나온다', [...new Set(names)].join(' / '))
  const cnt = flat(await p.locator('[data-supply-count]').innerText())
  ok(/^[\d,]+건 중 [\d,]+건$/.test(cnt), '건수 표시도 좁힌 기준으로 바뀐다', cnt)
  //  되돌릴 수 있어야 합니다.
  await sel.selectOption('')
  await p.waitForTimeout(500)
  ok(/전체 1,408건/.test(flat(await p.locator('[data-supply-count]').innerText())), '**전체로 되돌아온다**')
  await ctx.close()
}

// ── ⑤ 좁혔는데 30건을 넘으면 다시 30건부터 ─────────────────────────────────
{
  const { ctx, p } = await open()
  await p.locator('[data-supply-more]').click()
  await p.waitForTimeout(400)
  ok((await cards(p)) === 60, '먼저 60건까지 펼쳐 둔다')
  const sel = p.locator('[data-supply-filter]')
  const opts = await sel.locator('option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean))
  await sel.selectOption(opts[0])
  await p.waitForTimeout(500)
  //  ⚠ 안 되돌리면 3건짜리 거래처를 골랐는데 「더 보기」가 남은 것처럼 보입니다.
  ok((await cards(p)) <= 30, '**거래처를 바꾸면 처음부터 다시 본다**', `${await cards(p)}건`)
  await ctx.close()
}

// ── ⑥ 정작 보러 온 것이 그대로 있는가 ───────────────────────────────────────
{
  //  ⚠ 이 화면을 여는 이유는 재고입니다. 목록을 줄이다가 재고를 밀어내면
  //    고친 것이 아니라 옮긴 것입니다.
  const { ctx, p } = await open()
  ok((await p.locator('[data-stock-now]').count()) === 4, '재고 넉 장 카드가 그대로 있다',
    `${await p.locator('[data-stock-now]').count()}장`)
  ok((await p.locator('[data-spec-stock]').count()) === 13, '규격별 재고 13가지도 그대로 있다',
    `${await p.locator('[data-spec-stock]').count()}가지`)
  ok(flat(await p.locator('main').innerText()).includes('공급 내역'), '「공급 내역」도 그대로 있다')

  //  재고가 목록보다 **위에** 있어야 합니다.
  const y = await p.evaluate(() => {
    const st = document.querySelector('[data-stock-now]')
    const list = document.querySelector('[data-supply-line]')
    return { stock: st ? Math.round(st.getBoundingClientRect().top + scrollY) : -1,
      list: list ? Math.round(list.getBoundingClientRect().top + scrollY) : -1 }
  })
  ok(y.stock >= 0 && y.stock < y.list, '**재고가 공급 내역보다 위에 있다**', `재고 y=${y.stock} · 목록 y=${y.list}`)
  ok(y.stock < 900, '**재고가 첫 화면 안에 있다** — 이 화면을 여는 이유입니다', `y=${y.stock}px`)
  await ctx.close()
}

await b.close()
