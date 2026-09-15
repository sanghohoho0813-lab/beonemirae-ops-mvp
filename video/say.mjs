import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { speakAll } from './tts/index.mjs'
import { voiceoverTiming } from './voiceover.mjs'

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
//
//  ⚠ 0117 — **직접 녹음한 파일이 있으면 TTS 를 만들지 않습니다.**
//    video/audio/voiceover.wav (또는 .mp3 / .m4a) 가 있으면 그 파일 하나를
//    쓰고, config 의 voiceover.marks 에 적힌 시각으로 장면을 나눕니다.
//    내놓는 것(timing.json)의 모양은 똑같으므로 **녹화·자막·합치기 코드는
//    그대로**입니다 — 다시 녹음하시면 marks 숫자만 고치면 됩니다.
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

// ── ① 직접 녹음한 파일이 있는가 ──────────────────────────────────────────────
CFG.__cfgName = cfgPath.replace(ROOT + '/', '')
let VO = null
try {
  VO = voiceoverTiming(CFG, NAR.scenes, ROOT)
} catch (e) {
  //  ⚠ 여기서 걸리는 것은 「무엇을 적어야 하는지」이지 프로그램 오류가
  //    아닙니다. 쌓아 놓은 호출 기록은 도움이 안 되므로 말만 보여 줍니다.
  console.error(String(e.message ?? e))
  process.exit(1)
}

const res = VO ?? await speakAll(NAR.scenes, {
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

const timing = {
  provider: res.provider,
  voice: res.voice,
  totalSec: res.totalSec,
  //  직접 녹음일 때만 — 파일 하나를 통째로 붙이는 데 필요한 것들
  ...(VO ? { file: VO.file, offsetSec: VO.offsetSec, fileSec: VO.fileSec, endSec: VO.endSec, gapSec: VO.gapSec } : {}),
  scenes,
}
//  ⚠ 일부만 만든 것으로 timing.json 을 덮어쓰면 녹화가 장면을 못 찾습니다.
writeFileSync(join(OUT, only ? 'timing.sample.json' : 'timing.json'), JSON.stringify(timing, null, 2))

if (VO) {
  console.log(`── 직접 녹음한 음성 ──`)
  console.log(`  파일     ${VO.file}  (${VO.fileSec.toFixed(2)}초)`)
  console.log(`  쓰는 구간 ${VO.offsetSec.toFixed(2)}초 ~ ${VO.endSec.toFixed(2)}초  →  영상 ${VO.totalSec.toFixed(2)}초`)
  console.log(`  ⚠ 다시 녹음하시면 ${CFG.__cfgName} 의 voiceover.marks 만 고치면 됩니다.`)
} else {
  console.log(`── 음성 (${res.provider})${only ? ` · ${only.join(',')} 만` : ''} ──`)
}
for (const s of scenes) {
  const head = VO ? `${s.startSec.toFixed(1).padStart(5)}s +` : '       '
  console.log(`  ${head}${s.id.padEnd(6)} ${String(s.text.length).padStart(3)}자  ${s.sec.toFixed(2)}초  자막 ${s.cues.length}조각`)
  for (const c of s.cues) console.log(`         ${(c.ms / 1000).toFixed(1)}s  ${c.lines.join(' / ')}`)
}
console.log(`  합계 ${res.totalSec.toFixed(2)}초`)
