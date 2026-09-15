import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
//  0117 — **직접 녹음한 음성 한 개**를 쓰는 길
//
//   대표님이 전체 대본을 한 번에 읽은 파일 하나(video/audio/voiceover.wav 또는
//   .mp3)를 그대로 씁니다. 장면마다 따로 녹음할 필요가 없습니다.
//
//   대신 **그 파일 안에서 각 장면이 시작하는 시각**만 알려 주시면 됩니다.
//   config 의 voiceover.marks 에 적습니다.
//
//       "marks": {
//         "s1": "0:00.4",              ← 시작만 적으면, 다음 장면 직전까지
//         "s2": ["0:11.2", "0:17.9"],  ← 끝까지 적으면 그 구간만 (자막이 정확)
//         ...
//         "end": "0:52.8"              ← 마지막 말이 끝나는 시각
//       }
//
//   다시 녹음하시면 **이 숫자만 고치면** 영상이 다시 만들어집니다.
//   음성을 분석해 자동으로 찾아 주는 것은 만들지 않았습니다 — 지금 필요한
//   것은 그게 아니고, 손으로 적는 편이 확실합니다.
//
//   ⚠ 파일이 없으면 이 길은 조용히 비켜섭니다. 그때는 예전처럼 TTS 가
//     장면별 음성을 만듭니다 (video/tts/).
// ─────────────────────────────────────────────────────────────────────────────

const require_ = createRequire(import.meta.url)

function ffmpegPath() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG
  try {
    const p = require_('ffmpeg-static')
    const bin = typeof p === 'string' ? p : p?.default
    if (bin && existsSync(bin)) return bin
  } catch { /* 다음 자리 */ }
  return 'ffmpeg'
}

/** "1:02.5" · "62.5" · 62.5 → 62.5 (초) */
export function toSeconds(v) {
  if (typeof v === 'number') return v
  const s = String(v).trim()
  const parts = s.split(':').map(Number)
  if (!parts.length || parts.some((n) => Number.isNaN(n))) throw new Error(`시각을 못 읽었습니다: ${v}`)
  return parts.reduce((a, n) => a * 60 + n, 0)
}

/** 음성 파일이 몇 초짜리인지 — ffmpeg 가 스스로 말한 것으로 */
export function audioSeconds(file) {
  const FF = ffmpegPath()
  let txt = ''
  try { execFileSync(FF, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { txt = String(e.stderr ?? '') }
  const m = txt.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
  if (!m) throw new Error(`음성 길이를 못 읽었습니다: ${file}`)
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** 녹음 파일이 어디 있는지 — 적어 둔 것 → video/audio/voiceover.{wav,mp3,m4a} */
export function findVoiceover(CFG, root) {
  const cand = [
    CFG.voiceover?.file,
    'video/audio/voiceover.wav',
    'video/audio/voiceover.mp3',
    'video/audio/voiceover.m4a',
  ].filter(Boolean)
  for (const rel of cand) {
    const p = resolve(join(root, rel))
    if (existsSync(p)) return { rel, path: p }
  }
  return null
}

/** 12.4 → "0:12.4" */
function clock(sec) {
  const m = Math.floor(sec / 60)
  const r = sec - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`
}

/** 글자 수 비례로 나눈 시각 — **출발점일 뿐입니다** */
function guessMarks(scenes, total) {
  const sum = scenes.reduce((a, s) => a + s.text.length, 0) || 1
  let acc = 0
  return scenes.map((s) => {
    const at = clock(Number(((acc / sum) * total).toFixed(1)))
    acc += s.text.length
    return { id: s.id, at, head: s.text.slice(0, 16) + (s.text.length > 16 ? '…' : '') }
  })
}

/**
 * 직접 녹음한 음성이 준비돼 있으면 장면 시간표를 만들어 돌려줍니다.
 * 없으면 null — 부르는 쪽이 TTS 로 넘어갑니다.
 */
export function voiceoverTiming(CFG, scenes, root) {
  const vo = CFG.voiceover
  if (vo?.enabled === false) return null
  const found = findVoiceover(CFG, root)
  if (!found) return null

  const total = audioSeconds(found.path)
  const ids = scenes.map((s) => s.id)
  const marks = vo?.marks ?? {}
  const missing = ids.filter((id) => marks[id] == null)
  if (missing.length) {
    //  손으로 적으실 때의 **출발점**을 같이 드립니다 — 글자 수 비례로 나눈
    //  것이라 맞지 않습니다. 반드시 들어 보고 고치셔야 합니다.
    throw new Error(
      `voiceover.marks 에 아직 안 적은 장면이 있습니다: ${missing.join(', ')}\n`
      + `  음성 파일: ${found.rel} · ${total.toFixed(1)}초\n`
      + `  ${CFG.__cfgName ?? 'config'} 의 voiceover.marks 에 각 장면이 시작하는 시각을 적어 주세요.\n\n`
      + `  ── 글자 수로 대충 나눠 본 출발점 (⚠ 들어 보고 꼭 고치세요) ──\n`
      + `  "marks": {\n${guessMarks(scenes, total).map((g) => `    "${g.id}": "${g.at}",   // ${g.head}`).join('\n')}\n`
      + `    "end": "${clock(total)}"\n  }`)
  }

  //  장면 사이의 숨 — 끝 시각을 따로 적지 않았을 때, 다음 장면 시작에서
  //  이만큼 앞을 그 장면의 끝으로 봅니다 (자막이 전환까지 끌려가지 않게).
  const GAP = vo?.gapSec ?? 0.6

  const start = {}
  const endOf = {}
  for (const id of ids) {
    const m = marks[id]
    if (Array.isArray(m)) { start[id] = toSeconds(m[0]); endOf[id] = toSeconds(m[1]) }
    else start[id] = toSeconds(m)
  }
  const last = ids[ids.length - 1]
  const endSec = marks.end != null ? toSeconds(marks.end) : (endOf[last] ?? total)

  //  시각이 순서대로인지 — 어긋나면 영상이 엉뚱하게 늘어집니다.
  for (let i = 1; i < ids.length; i += 1) {
    if (start[ids[i]] <= start[ids[i - 1]]) {
      throw new Error(`voiceover.marks 순서가 어긋났습니다: ${ids[i - 1]}(${start[ids[i - 1]]}) → ${ids[i]}(${start[ids[i]]})`)
    }
  }
  if (endSec <= start[last]) throw new Error('voiceover.marks.end 가 마지막 장면보다 앞입니다.')
  if (endSec > total + 0.5) {
    throw new Error(`voiceover.marks.end(${endSec}초)가 음성 길이(${total.toFixed(1)}초)보다 깁니다.`)
  }

  const first = start[ids[0]]
  const out = scenes.map((s, i) => {
    const nextStart = i + 1 < ids.length ? start[ids[i + 1]] : endSec
    //  말이 끝나는 시각 — 적어 두었으면 그것, 아니면 다음 장면에서 숨만큼 앞
    const stop = endOf[s.id] ?? (i + 1 < ids.length ? Math.max(start[s.id] + 0.5, nextStart - GAP) : endSec)
    return {
      id: s.id,
      text: s.text,
      //  이 장면이 **영상 안에서** 몇 초째에 시작하는가 (첫 장면이 0)
      startSec: Number((start[s.id] - first).toFixed(3)),
      //  말이 이어지는 길이 — 자막을 이 안에서 나눕니다
      sec: Number((stop - start[s.id]).toFixed(3)),
      //  다음 장면이 시작할 때까지 — 화면 전환에 쓸 수 있는 시간
      untilNextSec: Number((nextStart - start[s.id]).toFixed(3)),
    }
  })

  return {
    provider: 'voiceover',
    file: found.rel,
    //  음성 파일 안에서 첫 장면이 시작하는 시각 — mux 가 이만큼 당겨 붙입니다
    offsetSec: Number(first.toFixed(3)),
    fileSec: Number(total.toFixed(3)),
    endSec: Number(endSec.toFixed(3)),
    gapSec: GAP,
    scenes: out,
    totalSec: Number((endSec - first).toFixed(3)),
  }
}
