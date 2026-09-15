import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { speakAll } from './tts/index.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  0114 — 심사 시연 영상 ③  「대사를 음성으로 만들고, 길이를 잰다」
//
//   이 파일이 내놓는 것은 둘뿐입니다.
//     · video/out/voice/<장면>.wav
//     · video/out/voice/timing.json   ← 장면마다 몇 초짜리인지 + 자막 조각
//
//   녹화(record.mjs)는 timing.json 만 읽습니다. **어느 회사 음성인지 모릅니다.**
//   그래서 공급자를 바꿔도 녹화·자막·합치기 코드는 그대로입니다.
//
//  ── 자막을 어떻게 끊는가 ────────────────────────────────────────────────
//   ① 먼저 **문장** 단위로 끊습니다 (마침표).
//   ② 문장이 한 줄에 안 들어가면 **쉼표**에서 한 번 더 끊습니다.
//   ③ 그래도 길면 띄어쓰기에서 **두 줄까지만** 접습니다 — 세 줄은 안 만듭니다.
//   ④ 한 조각이 보이는 시간은 **글자 수에 비례**해 나눕니다. 말하는 속도가
//      글자 수를 따라가므로, 이것이 음성과 가장 잘 맞습니다.
//
//   ⚠ 문장을 줄이거나 바꾸지 않습니다. 읽는 말과 적히는 말이 같아야 합니다.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const cfgPath = process.argv.slice(2).find((a) => a.endsWith('.json')) ?? join(ROOT, 'video/config.beonemirae.json')
const CFG = JSON.parse(readFileSync(cfgPath, 'utf8'))
const NAR = JSON.parse(readFileSync(join(ROOT, CFG.narration), 'utf8'))
const OUT = join(ROOT, CFG.out.dir, 'voice')

/** 자막 한 줄에 넣을 수 있는 글자 수 (한글 기준) */
const LINE = CFG.subtitle?.charsPerLine ?? 30
/** 한 조각은 최대 두 줄 */
const MAX_LINES = 2

/** 한 문장을 한 조각 안에서 **두 줄까지** 접습니다 */
function fold(s) {
  if (s.length <= LINE) return [s]
  const words = s.split(' ')
  const lines = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if (cur.length === 0) lines[lines.length - 1] = w
    else if (cur.length + 1 + w.length <= LINE) lines[lines.length - 1] = `${cur} ${w}`
    else lines.push(w)
  }
  return lines
}

/** 대사 한 덩어리 → 자막 조각들 */
function cuesOf(text) {
  //  ① 문장으로
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  const pieces = []
  for (const s of sentences) {
    if (fold(s).length <= MAX_LINES) { pieces.push(s); continue }
    //  ② 쉼표에서 한 번 더
    const parts = s.split(/(?<=,)\s+/).filter(Boolean)
    if (parts.length > 1) { pieces.push(...parts); continue }
    //  ③ 쉼표도 없으면 줄 수에 맞춰 잘라 냅니다
    const lines = fold(s)
    for (let i = 0; i < lines.length; i += MAX_LINES) {
      pieces.push(lines.slice(i, i + MAX_LINES).join(' '))
    }
  }
  //  ③ 마지막으로 각 조각을 두 줄로 접습니다
  return pieces.map((p) => ({ text: p, lines: fold(p).slice(0, MAX_LINES) }))
}

/** 조각마다 보이는 시간 — 글자 수에 비례 */
function spread(cues, sec) {
  const total = cues.reduce((a, c) => a + c.text.length, 0) || 1
  let used = 0
  return cues.map((c, i) => {
    const ms = i === cues.length - 1
      ? Math.round(sec * 1000) - used
      : Math.round((sec * 1000 * c.text.length) / total)
    used += ms
    return { ...c, ms }
  })
}

mkdirSync(OUT, { recursive: true })

const force = process.argv.includes('--force')
//  --only s1,s2  — 앞 두 장면만 시험해 볼 때 (목소리를 고르는 단계)
const onlyArg = process.argv.find((a) => a.startsWith('--only'))
const only = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1] ?? '')
    .split(',').map((x) => x.trim()).filter(Boolean)
  : null

const res = await speakAll(NAR.scenes, {
  provider: CFG.tts.provider,
  //  목소리 설정은 공급자마다 따로 둡니다 — 바꿔 끼울 때 값이 섞이지 않게.
  voice: CFG.tts.voices?.[CFG.tts.provider] ?? CFG.tts.voice ?? {},
  outDir: OUT,
  force,
  only,
})

const scenes = res.scenes.map((s) => {
  const meta = NAR.scenes.find((x) => x.id === s.id)
  return { ...s, label: meta?.label ?? s.id, cues: spread(cuesOf(s.text), s.sec) }
})

const timing = { provider: res.provider, voice: res.voice, totalSec: res.totalSec, scenes }
//  ⚠ 일부만 만든 것으로 timing.json 을 덮어쓰면 녹화가 장면을 못 찾습니다.
writeFileSync(join(OUT, only ? 'timing.sample.json' : 'timing.json'), JSON.stringify(timing, null, 2))

console.log(`── 음성 (${res.provider})${only ? ` · ${only.join(',')} 만` : ''} ──`)
for (const s of scenes) {
  console.log(`  ${s.id.padEnd(6)} ${String(s.text.length).padStart(3)}자  ${s.sec.toFixed(2)}초  자막 ${s.cues.length}조각`)
  for (const c of s.cues) console.log(`         ${(c.ms / 1000).toFixed(1)}s  ${c.lines.join(' / ')}`)
}
console.log(`  합계 ${res.totalSec.toFixed(2)}초`)
