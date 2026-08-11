// ─────────────────────────────────────────────────────────────────────────────
// 배포본이 로그인 없이 열리지 않는가 (빌드 산출물 검사 · 서버 불필요)
//
//  실제로 이런 일이 있었습니다 — Vercel 배포본에 VITE_SUPABASE_URL /
//  VITE_SUPABASE_ANON_KEY 를 넣지 않았고, 그때의 앱은 "설정이 없으면
//  시연 모드" 규칙을 그대로 따랐습니다. 그 결과 로그인한 적 없는 사람에게
//  대시보드·거래처·미수금·감사로그가 전부 열렸고, 로그인한 계정이 없으니
//  로그아웃 버튼도 없었습니다.
//
//  그래서 이 검사는 **빌드된 파일**을 직접 봅니다.
//   1) 운영 빌드(dist)에 Supabase 주소가 실제로 박혀 있는가
//   2) 운영 빌드가 시연 모드로 켜져 있지 않은가
//   3) service_role 키가 번들에 섞여 들어가지 않았는가
//
//  실행
//    npm run build
//    node supabase/test/50_build_gate.mjs
//
//  · 아무 데도 접속하지 않습니다. 파일만 읽습니다.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = process.env.DIST_DIR || 'dist'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))

console.log(`\n════ 배포본 점검 (${DIST}) ════`)

if (!existsSync(join(DIST, 'assets'))) {
  no(`${DIST}/assets 가 없습니다`, 'npm run build 를 먼저 실행하세요')
  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  process.exit(1)
}

const files = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
const js = files.map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n')
console.log(`   자바스크립트 ${files.length}개 · ${(js.length / 1024 / 1024).toFixed(1)}MB`)

// ── 1. Supabase 주소가 박혀 있는가 ──────────────────────────────────────────
//  '*.supabase.co' 는 라이브러리가 갖고 있는 문자열이라 이것만으로는 안 됩니다.
//  기대하는 주소를 알려 주면 그 주소가 실제로 들어갔는지 대조하고,
//  모르면 연결 주소로 보이는 것이 하나라도 있는지만 봅니다.
const want = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const mask = (u) => u.replace(/\/\/([^.:/]{0,4})[^.:/]*/, '//$1…')
if (want) {
  check(js.includes(want), 'Supabase 주소가 빌드에 들어 있음',
    js.includes(want) ? mask(want) : `${mask(want)} 가 없습니다 — VITE_SUPABASE_URL 없이 빌드되었습니다`)
} else {
  const urlHit = js.match(/https?:\/\/(?:[a-z0-9-]+\.supabase\.co|127\.0\.0\.1:\d+|localhost:\d+)/i)
  check(!!urlHit, 'Supabase 주소가 빌드에 들어 있음',
    urlHit ? mask(urlHit[0]) : 'VITE_SUPABASE_URL 없이 빌드되었습니다')
}

//  공개 키(anon)도 있어야 로그인이 됩니다. 값은 찍지 않습니다.
//
//  키 형식이 두 가지입니다 — 예전 JWT(eyJ…)와 요즘 sb_publishable_… 입니다.
//  JWT 모양만 찾았더니, 번들 어딘가의 다른 JWT 문자열에 걸려 키가 없는데도
//  통과했습니다. 기대하는 값을 알려 주면 그 값으로 대조합니다.
const wantAnon = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
const hasAnon = wantAnon
  ? js.includes(wantAnon)
  : /sb_publishable_[A-Za-z0-9_-]{10,}/.test(js) ||
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(js)
check(hasAnon, '공개 키(anon)가 빌드에 들어 있음',
  hasAnon ? '(값은 찍지 않습니다)' : 'VITE_SUPABASE_ANON_KEY 없이 빌드되었습니다')

// ── 2. 시연 모드로 켜져 있지 않은가 ─────────────────────────────────────────
//  시연 빌드에만 있는 버튼 문구입니다. 운영 빌드에 이게 살아 있으면
//  로그인 없이 둘러보기가 열립니다.
const demoButton = js.includes('시연 모드로 둘러보기')
if (DIST === 'dist') {
  check(!demoButton || hasAnon, '운영 빌드가 시연 모드가 아님',
    demoButton && !hasAnon ? '설정도 없고 시연 버튼도 살아 있습니다 — 로그인 없이 열립니다' : '')
}

// ── 3. service_role 키가 섞이지 않았는가 ────────────────────────────────────
//  service_role 키는 RLS 를 통째로 무시합니다. 브라우저에 가면 안 됩니다.
//  요즘 키는 sb_secret_… 입니다. 예전 형식(service_role JWT)도 함께 봅니다.
const roleLeak = /"?service_role"?\s*:/.test(js) || /SUPABASE_SERVICE_ROLE/.test(js) ||
  /sb_secret_[A-Za-z0-9_-]{10,}/.test(js)
check(!roleLeak, 'service_role 키가 번들에 없음', roleLeak ? '★ 즉시 키를 교체하세요' : '')

console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
console.log(`배포해도 되는 빌드: ${fail === 0 ? 'YES' : 'NO'}`)
process.exit(fail === 0 ? 0 : 1)
