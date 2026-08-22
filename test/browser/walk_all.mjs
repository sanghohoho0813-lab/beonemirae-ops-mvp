import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  ─────────────────────────────────────────────────────────────────────────
//  눌러서 도는 전수 점검 — 역할별로 사람처럼 눌러 다니며 결함을 찾습니다
//
//   주소는 **맨 처음 한 번만** 칩니다. 그다음은 전부 눌러서 갑니다.
//   찾는 것:
//     ① 눌러도 아무 일이 없는 단추 (무반응)
//     ② 눌렀더니 빈 화면 / 오류 글이 뜨는 곳
//     ③ 화면을 여는 순간 콘솔에 터지는 오류
//     ④ 눌러 들어갔을 때만 저장이 꺼져 있는 곳  ← 0071 에서 찾은 그 종류
//  ─────────────────────────────────────────────────────────────────────────

const ROLES = (process.env.ROLES ?? 'field,admin,office,client').split(',')
const DEPTH2 = process.env.DEPTH2 !== '0'
const b = await chromium.launch({ executablePath: EXEC })
const findings = []
const note = (kind, role, where, what, detail = '') => {
  findings.push({ kind, role, where, what, detail })
  console.log(`${kind} | ${role} | ${where} | ${what}${detail ? ` — ${detail}` : ''}`)
}

async function fresh(role, viewport) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role) }
  const ctx = await b.newContext({ viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  const consoleErrors = []
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)) })
  p.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 120)}`))
  //  ⚠ 새 탭으로 여는 바깥 링크(올바로 등)는 이 창에서는 아무 일도 안 일어난
  //    것처럼 보입니다. 실제로는 새 탭이 떴습니다. 세어 둡니다.
  const opened = { n: 0 }
  ctx.on('page', (np) => { opened.n += 1; np.close().catch(() => {}) })
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  //  ⚠ 주소를 치는 것은 여기 한 번뿐입니다
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 700, 30000)
  return { ctx, p, state, consoleErrors, opened }
}

/** 경로(라벨 목록)를 눌러서 되짚어 갑니다 */
async function replay(p, state, path) {
  for (const lb of path) {
    const hit = await W.clickLabel(p, lb)
    if (!hit) return false
    await p.waitForTimeout(250)
    await W.settle(p, state, 450, 12000)
  }
  return true
}

for (const role of ROLES) {
  const viewport = role === 'field' ? { width: 390, height: 844 } : { width: 1440, height: 1000 }
  console.log(`\n══ ${role} (${viewport.width}px) ═══════════════════════════════════`)

  //  ── 1단계: 첫 화면에서 눌러 갈 수 있는 곳을 모읍니다 ────────────────────
  const first = await fresh(role, viewport)
  if (first.consoleErrors.length) {
    note('결함', role, '첫 화면', '콘솔 오류', first.consoleErrors.slice(0, 2).join(' / '))
  }
  const doors = await W.targets(first.p, 40)
  const startSnap = await W.snap(first.p)
  console.log(`   첫 화면 ${startSnap.path} · 눌러 볼 것 ${doors.length}개`)
  if (process.env.SHOW) console.log(`   문: ${doors.map((d) => d.label).join(' | ')}`)
  await first.ctx.close()

  const screens = []   // { path:[라벨…], snap }

  //  ── 2단계: 한 번씩 눌러 봅니다 (매번 새 화면에서 — 앞선 누름이 안 섞이게) ──
  for (const d of doors) {
    const s = await fresh(role, viewport)
    //  ① 굴려 놓고 ② 그 상태로 지문을 뜬 뒤 ③ 누릅니다 — 굴린 것이
    //     「달라졌다」로 세어지지 않도록.
    const f = await W.focusLabel(s.p, d.label)
    if (!f) { await s.ctx.close(); continue }
    //  ⚠ 지금 보고 있는 화면의 메뉴를 다시 누른 것은 결함이 아닙니다.
    if (f.sameHere || f.outward) { await s.ctx.close(); continue }
    await s.p.waitForTimeout(150)
    const before = await W.snap(s.p)
    const hit = await W.pressLabel(s.p, d.label)
    if (!hit) { await s.ctx.close(); continue }
    await s.p.waitForTimeout(350)
    await W.settle(s.p, s.state, 500, 20000)
    const after = await W.snap(s.p)

    const wrote = s.state.writes.length > 0

    if (W.same(before, after) && !wrote && s.opened.n === 0) {
      note('무반응', role, before.path, `「${d.label}」 눌러도 아무 일 없음`)
    }
    if (after.blank) {
      note('결함', role, after.path, `「${d.label}」 눌렀더니 **빈 화면**`)
    }
    if (W.ERR.test(after.head)) {
      note('확인', role, after.path, `「${d.label}」 뒤 안내글`, after.head.slice(0, 70))
    }
    if (s.consoleErrors.length) {
      note('결함', role, after.path, `「${d.label}」 뒤 콘솔 오류`, s.consoleErrors.slice(0, 2).join(' / '))
    }
    if (after.path !== before.path && !after.blank) screens.push({ path: [d.label], snap: after })
    await s.ctx.close()
  }
  console.log(`   눌러서 닿은 화면 ${screens.length}곳${screens.length ? ' — ' + screens.map((x) => `${x.path[0]}→${x.snap.path}`).join(' | ') : ''}`)

  //  ── 3단계: 그 화면들 안에서 한 번 더 눌러 봅니다 ────────────────────────
  if (DEPTH2) {
    for (const sc of screens) {
      const probe = await fresh(role, viewport)
      if (!(await replay(probe.p, probe.state, sc.path))) { await probe.ctx.close(); continue }
      const inner = await W.targets(probe.p, 14)
      const here = (await W.snap(probe.p)).path
      await probe.ctx.close()

      for (const t of inner) {
        const s = await fresh(role, viewport)
        if (!(await replay(s.p, s.state, sc.path))) { await s.ctx.close(); continue }
        const f = await W.focusLabel(s.p, t.label)
        if (!f) { await s.ctx.close(); continue }
        if (f.sameHere || f.outward) { await s.ctx.close(); continue }
        await s.p.waitForTimeout(150)
        const before = await W.snap(s.p)
        s.state.writes.length = 0
        const hit = await W.pressLabel(s.p, t.label)
        if (!hit) { await s.ctx.close(); continue }
        await s.p.waitForTimeout(350)
        await W.settle(s.p, s.state, 500, 20000)
        const after = await W.snap(s.p)

        const wrote = s.state.writes.length > 0

        if (W.same(before, after) && !wrote && s.opened.n === 0) {
          note('무반응', role, `${here} ← ${sc.path.join(' → ')}`, `「${t.label}」 눌러도 아무 일 없음`)
        }
        if (after.blank) note('결함', role, after.path, `${sc.path.join(' → ')} → 「${t.label}」 뒤 **빈 화면**`)
        if (s.consoleErrors.length) {
          note('결함', role, after.path, `${sc.path.join(' → ')} → 「${t.label}」 뒤 콘솔 오류`,
            s.consoleErrors.slice(0, 2).join(' / '))
        }

        //  ④ 눌러 들어갔을 때만 저장이 꺼져 있는가 (0071 결함과 같은 종류)
        const stuck = await s.p.evaluate(() => {
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 }
          const saves = [...document.querySelectorAll('button')].filter((e) =>
            vis(e) && /저장|완료 처리|확정|등록하기/.test(e.innerText ?? ''))
          const dis = saves.filter((e) => e.disabled)
          if (!dis.length) return null
          const inputs = [...document.querySelectorAll('main input, main select, main textarea')].filter(vis)
          const empty = inputs.filter((e) => !String(e.value ?? '').trim()).length
          return { disabled: dis.map((e) => e.innerText.trim().slice(0, 20)), inputs: inputs.length, empty }
        })
        if (stuck && stuck.inputs > 0 && stuck.empty === 0) {
          note('결함', role, after.path, `${sc.path.join(' → ')} → 「${t.label}」 — **다 채웠는데 저장이 꺼져 있음**`,
            stuck.disabled.join(','))
        }
        await s.ctx.close()
      }
    }
  }
}

await b.close()
console.log(`\n─────────────────────────────────────────────`)
const byKind = {}
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1
console.log(`전수 점검 — 결함 ${byKind['결함'] ?? 0} · 무반응 ${byKind['무반응'] ?? 0} · 확인 ${byKind['확인'] ?? 0}`)
