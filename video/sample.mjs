import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
//  목소리 시청용 — 앞 두 장면(S1+S2)만 이어 붙여 들려 드립니다 (약 15~20초).
//
//    npm run video:say -- --only s1,s2     # 먼저 이 둘만 만들고
//    npm run video:sample                  # 하나로 이어 붙입니다
//
//  전체 영상을 만들기 전에 **목소리만** 먼저 판단하시라고 둔 자리입니다.
// ─────────────────────────────────────────────────────────────────────────────

const require_ = createRequire(import.meta.url)
const ff = (() => {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG
  try {
    const p = require_('ffmpeg-static')
    return typeof p === 'string' ? p : p?.default
  } catch { return 'ffmpeg' }
})()

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const CFG = JSON.parse(readFileSync(process.argv.slice(2).find((a) => a.endsWith('.json')) ?? join(ROOT, 'video/config.beonemirae.json'), 'utf8'))
const OUT = join(ROOT, CFG.out.dir)
const VOICE = join(OUT, 'voice')

const ids = (process.argv.find((a) => a.startsWith('--only'))?.split('=')[1] ?? 's1,s2').split(',')
const files = ids.map((id) => join(VOICE, `${id.trim()}.wav`))
const missing = files.filter((f) => !existsSync(f))
if (missing.length) {
  throw new Error(
    `음성이 없습니다: ${missing.join(', ')}\n`
    + `  먼저 돌려 주세요:  node video/say.mjs --only ${ids.join(',')}`)
}

const list = join(OUT, 'sample-list.txt')
const { writeFileSync } = await import('node:fs')
writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'))

const out = join(OUT, `voice-sample-${CFG.tts.provider}.m4a`)
execFileSync(ff, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'concat', '-safe', '0', '-i', list,
  '-c:a', 'aac', '-b:a', '128k', out,
], { stdio: 'inherit' })

let info = ''
try { execFileSync(ff, ['-hide_banner', '-i', out], { stdio: ['ignore', 'pipe', 'pipe'] }) }
catch (e) { info = String(e.stderr ?? '') }
const d = info.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
console.log(`  시청용 음성  ${out}`)
console.log(`  장면        ${ids.join(' + ')}`)
if (d) console.log(`  길이        ${(Number(d[2]) * 60 + Number(d[3])).toFixed(2)}초`)
console.log(`  공급자      ${CFG.tts.provider}`)
