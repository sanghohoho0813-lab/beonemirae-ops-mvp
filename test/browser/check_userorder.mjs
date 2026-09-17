import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'

//  0124 — 사용자 관리 목록의 **순서와 크기**만 봅니다 (권한·기능 변경 없음)
//
//   위: 지금 일하는 사람 — 대표·관리자 → 사무실 → 현장 → 병원
//   아래: 테스트 계정 · 중지된 계정을 한 묶음으로 작게
//
//   ⚠ 지우거나 숨기지 않습니다. 줄은 전부 그대로 있고 자리만 바뀝니다 —
//     퇴사자·테스트 계정도 눌러서 역할을 바꾸거나 다시 켤 수 있어야 합니다.

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const b = await chromium.launch({ executablePath: EXEC })

const P = (id, name, email, role, extra = {}) => ({
  id, email, name, role, font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
  client_id: role === 'client' ? '00000000-0000-0000-0000-0000000000c1' : null, vehicle_id: null,
  created_at: '2026-01-01T00:00:00Z', ...extra,
})

const prof = { ...W.profileFor('admin'), font_scale: 'normal' }
//  일부러 뒤섞어 둡니다 — 화면이 정렬한다는 것을 보려면 들어온 순서가 달라야 합니다.
const LIST = [
  P('t1', '테스트 기사', 'driver.test@beonemirae.co.kr', 'field'),
  P('u-field', '백광호', 'baek@beonemirae.co.kr', 'field'),
  P('u-client', '오남한양병원 원무과', 'onam@beonemirae.co.kr', 'client'),
  P('t2', 'QA 계정', 'qa@beonemirae.co.kr', 'office'),
  P('u-off', '홍현주', 'hong@beonemirae.co.kr', 'office'),
  { ...prof, id: prof.id, name: '송현근', role: 'admin' },
  P('u-dev', '개발자', 'dev@beonemirae.co.kr', 'admin'),
  P('u-quit', '김준기', 'kim@beonemirae.co.kr', 'field', { active: false }),
]

const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 122 }
W.wire(ctx, state)
const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
await ctx.route('**/rest/v1/profiles*', (r) => {
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const id = (r.request().url().match(/id=eq\.([^&]+)/) ?? [])[1]
  const rows = id ? LIST.filter((x) => x.id === id) : LIST
  return json(r, single ? (rows[0] ?? null) : rows)
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => {
  window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
  window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
}, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }])
await p.goto(`${W.BASE}/users`, { waitUntil: 'domcontentloaded' })
await W.settle(p, state)
await p.locator('[data-user-row]').first().waitFor({ state: 'visible', timeout: 15000 })
await p.waitForTimeout(400)

// ① 아무도 사라지지 않았다
const ids = await p.locator('[data-user-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-user-row')))
ok('① 계정이 하나도 빠지지 않음 (숨기지 않고 자리만 옮김)', ids.length === LIST.length, `${ids.length} / ${LIST.length}`)

// ② 위쪽 — 대표·관리자 → 사무실 → 현장 → 병원
const main = ids.slice(0, 4)
ok('② 맨 위는 대표·관리자 둘', main.slice(0, 2).every((x) => [prof.id, 'u-dev'].includes(x)), main.join(','))
ok('② 그다음 사무실(홍현주)', main[2] === 'u-off', main.join(','))
ok('② 그다음 현장(백광호)', main[3] === 'u-field', main.join(','))
ok('② 병원 계정은 직원 다음', ids.indexOf('u-client') === 4, String(ids.indexOf('u-client')))

// ③ 아래쪽 — 테스트 · 중지된 계정
const quiet = await p.locator('[data-user-quiet]').evaluateAll((els) => els.map((e) => e.getAttribute('data-user-row')))
ok('③ 아래 묶음은 테스트 2개 + 중지 1개', quiet.length === 3, quiet.join(','))
ok('③ 「테스트 기사」가 아래로', quiet.includes('t1'))
ok('③ 「QA 계정」이 아래로', quiet.includes('t2'))
ok('③ 중지된 퇴사자 계정이 아래로', quiet.includes('u-quit'))
ok('③ 실제 쓰는 계정은 아래로 내려가지 않음', !quiet.some((x) => ['u-off', 'u-field', 'u-client', 'u-dev', prof.id].includes(x)), quiet.join(','))
ok('③ 아래 묶음이 목록의 **맨 끝**', ids.slice(-3).every((x) => quiet.includes(x)), ids.join(','))

// ④ 머리글 한 번, 개수까지
const head = await p.locator('[data-user-quiet-head]').count()
const headText = head ? (await p.locator('[data-user-quiet-head]').innerText()).replace(/\s+/g, ' ') : ''
ok('④ 묶음 머리글이 한 번만', head === 1, String(head))
ok('④ 머리글에 개수가 적힘', /테스트 · 중지된 계정 3개/.test(headText), headText)

// ⑤ 작게 — 글자·여백이 위쪽 줄보다 작다
const size = await p.evaluate(() => {
  const pick = (sel) => {
    const row = document.querySelector(sel)
    if (!row) return null
    const nameEl = row.querySelector('.t-body')
    return {
      pad: parseFloat(getComputedStyle(row).paddingTop),
      font: nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 0,
      opacity: parseFloat(getComputedStyle(row).opacity),
    }
  }
  return { top: pick('[data-user-row]:not([data-user-quiet])'), quiet: pick('[data-user-quiet]') }
})
ok('⑤ 아래 줄 여백이 더 좁음', (size.quiet?.pad ?? 9) < (size.top?.pad ?? 0), JSON.stringify(size))
ok('⑤ 아래 줄 글자가 더 작음', (size.quiet?.font ?? 99) < (size.top?.font ?? 0), JSON.stringify(size))
ok('⑤ 아래 줄이 살짝 흐림 (가려지지는 않음)', (size.quiet?.opacity ?? 1) < 1 && (size.quiet?.opacity ?? 0) >= 0.6, JSON.stringify(size))

// ⑥ 아래로 내려가도 손댈 수 있다 — 역할·사용여부 단추가 그대로 있음
//   ⚠ 0129 — 예전에는 그 줄의 `select`(담당 차량)로 「손댈 수 있는가」를 쟀습니다.
//     0128 에서 차량 고르는 칸을 없앴으므로, 이제 **역할 단추**로 봅니다 —
//     원래 지키려던 것은 「중지된 계정도 눌러서 바꿀 수 있는가」입니다.
const canEdit = await p.locator('[data-user-row="u-quit"] button').count()
const roleBtns = await p.locator('[data-user-row="u-quit"] button').evaluateAll((els) =>
  els.map((e) => (e.textContent ?? '').trim()))
ok('⑥ 중지된 계정도 역할·상태를 그대로 바꿀 수 있음', canEdit >= 1, `${canEdit}개`)
ok('⑥ 역할 단추가 실제로 있음', roleBtns.some((t) => /현장|사무실|관리자|대표/.test(t)), roleBtns.join(','))

// ⑦ 가로 밀림 0
const of = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
ok('⑦ 가로로 안 밀림', of === 0, `${of}px`)

await ctx.close()
console.log(`\n합계 ${pass + fail}검사 · 실패 ${fail}`)
await b.close()
if (fail > 0) process.exitCode = 1
