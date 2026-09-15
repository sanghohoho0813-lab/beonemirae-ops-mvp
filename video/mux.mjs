import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
//  0111 — 심사 시연 영상 ②  「webm → 어디서나 열리는 MP4」
//
//   Playwright 가 남기는 것은 webm 입니다. 카카오톡·메일·발표 노트북에서
//   바로 열리려면 H.264 MP4 여야 합니다.
//
//   ⚠ Playwright 가 들고 다니는 ffmpeg 는 **webm 전용**입니다 (MP4·음성 불가).
//     그래서 제대로 된 ffmpeg 를 따로 찾습니다 — 아래 순서로.
//   ⚠ 0114 — 음성을 여기서 붙입니다. 장면마다 「영상 몇 초 자리에서 말이
//     시작되는가」가 timeline.json 에 적혀 있으므로, 그 자리에 wav 를 놓고
//     하나로 섞습니다. **편집 프로그램이 필요 없습니다** — 녹화할 때 이미
//     음성 길이에 맞춰 화면을 붙잡아 두었기 때문입니다.
//   ⚠ 어느 회사 음성인지는 몰라도 됩니다. wav 와 시각만 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

const require_ = createRequire(import.meta.url)

/** ffmpeg 를 어디서 찾을지 — 환경변수 → ffmpeg-static → 시스템 */
function ffmpegPath() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG
  try {
    const p = require_('ffmpeg-static')
    const bin = typeof p === 'string' ? p : p?.default
    if (bin && existsSync(bin)) return bin
  } catch { /* 없으면 다음 자리 */ }
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return 'ffmpeg'
  } catch { /* 없습니다 */ }
  throw new Error(
    'ffmpeg 를 못 찾았습니다.\n'
    + '  · npm i -D ffmpeg-static  으로 넣거나\n'
    + '  · FFMPEG=/어딘가/ffmpeg 로 자리를 알려 주세요.\n'
    + '  ⚠ Playwright 가 들고 있는 ffmpeg 는 webm 전용이라 쓸 수 없습니다.')
}

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const cfgPath = process.argv.slice(2).find((a) => a.endsWith('.json')) ?? join(ROOT, 'video/config.beonemirae.json')
const CFG = JSON.parse(readFileSync(cfgPath, 'utf8'))
const OUT = join(ROOT, CFG.out.dir)
mkdirSync(OUT, { recursive: true })

const webm = join(OUT, CFG.out.webm)
const mp4 = join(OUT, process.argv.includes('--silent') ? (CFG.out.mp4Silent ?? 'silent-' + CFG.out.mp4) : CFG.out.mp4)
const tlPath = join(OUT, CFG.out.timeline)
if (!existsSync(webm)) throw new Error(`녹화본이 없습니다: ${webm}\n  먼저 node video/record.mjs 를 돌려 주세요.`)

const tl = existsSync(tlPath) ? JSON.parse(readFileSync(tlPath, 'utf8')) : { marks: [] }
const FF = ffmpegPath()
const { width, height } = CFG.output ?? CFG.viewport

/** ffmpeg 가 스스로 말하는 길이 (ffprobe 없이) */
function seconds(file) {
  let txt = ''
  try { execFileSync(FF, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { txt = String(e.stderr ?? '') }
  const m = txt.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

//  ── 앞부분을 얼마나 잘라야 하는가 ──────────────────────────────────────────
//   녹화가 **언제 시작되는지**는 우리가 정하지 못합니다(브라우저가 첫 프레임을
//   만드는 순간). 대신 끝나는 시점은 확실합니다 — 브라우저를 닫는 순간입니다.
//   그래서 끝에서부터 되짚습니다.
//
//     잘라 낼 앞부분 = 영상 전체 길이 − (본문 시작부터 닫을 때까지)
//
//   시계로만 앞에서부터 셌더니 2초쯤 어긋나 장면 시각이 맞지 않았습니다.
const webmSec = seconds(webm)
const trimSec = webmSec !== null && tl.closeOffsetSec
  ? Math.max(0, Number((webmSec - tl.closeOffsetSec).toFixed(2)))
  : 0

//  ── 음성 트랙 ──────────────────────────────────────────────────────────────
//   두 가지 길이 있습니다. **둘 다 하는 일은 같습니다** — 소리를 제자리에
//   놓는 것뿐입니다.
//
//    ① 직접 녹음한 파일 하나 (0117)  — 대본을 한 번에 읽은 wav/mp3.
//       파일 안에서 첫 장면이 시작하는 시각(offsetSec)을 영상의 첫 장면
//       자리(scenes[0].at)에 맞춰 통째로 밀거나 당깁니다.
//    ② 장면별 wav (TTS)             — 각자의 시작 시각만큼 밀어 섞습니다.
//
//  --silent 이면 음성을 붙이지 않습니다 — 화면만 먼저 확인할 때 씁니다.
const SILENT = process.argv.includes('--silent')
const voice = SILENT ? null : (tl.voice ?? null)
const VO = voice?.provider === 'voiceover' ? voice : null

let inputs = []
let aChain = null

if (VO) {
  const file = resolve(join(ROOT, VO.file))
  if (!existsSync(file)) {
    throw new Error(`녹음 파일이 없습니다: ${file}\n  video/audio/ 에 넣고 node video/say.mjs 부터 다시 돌려 주세요.`)
  }
  inputs = [file]
  //  파일의 offsetSec 지점이 영상의 at 초 자리에 오게 — 양수면 밀고, 음수면
  //  앞을 잘라 냅니다. 이 한 줄이 「다시 녹음하면 숫자만 바꾸면 된다」의 전부입니다.
  const shift = Number(((VO.scenes[0]?.at ?? 0) - VO.offsetSec).toFixed(3))
  const place = shift >= 0
    ? `adelay=${Math.round(shift * 1000)}|${Math.round(shift * 1000)}`
    : `atrim=start=${(-shift).toFixed(3)},asetpts=PTS-STARTPTS`
  aChain = `[1:a]aresample=44100,aformat=channel_layouts=mono,${place},alimiter=limit=0.95[aout]`
} else {
  const wavs = (voice?.scenes ?? []).map((s) => ({ ...s, file: join(OUT, voice.dir, `${s.id}.wav`) }))
  const missing = wavs.filter((w) => !existsSync(w.file))
  if (voice && missing.length) {
    throw new Error(`음성 파일이 없습니다: ${missing.map((w) => w.file).join(', ')}\n  먼저 node video/say.mjs 를 돌려 주세요.`)
  }
  inputs = wavs.map((w) => w.file)
  const filters = wavs.map((w, i) =>
    //  adelay 는 밀리초입니다. 44100Hz 로 맞춰 둬야 섞을 때 떨어지지 않습니다.
    `[${i + 1}:a]aresample=44100,adelay=${Math.round(w.at * 1000)}|${Math.round(w.at * 1000)}[v${i}]`)
  const mixIn = wavs.map((_, i) => `[v${i}]`).join('')
  aChain = wavs.length
    ? `${filters.join(';')};${mixIn}amix=inputs=${wavs.length}:normalize=0,alimiter=limit=0.95[aout]`
    : null
}

//  앞부분(자료 읽는 동안)을 잘라 내고, 30fps 고정 · H.264 로 다시 씁니다.
//  ⚠ -ss 는 **영상 입력에만** 겁니다. 출력 쪽에 걸면 음성까지 같이 밀려서
//    말과 화면이 어긋납니다.
const args = [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-ss', String(trimSec), '-i', webm,
  ...inputs.flatMap((f) => ['-i', f]),
  ...(aChain ? ['-filter_complex', `${aChain};[0:v]scale=${width}:${height}:flags=lanczos,fps=${CFG.fps}[vout]`]
    : ['-vf', `scale=${width}:${height}:flags=lanczos,fps=${CFG.fps}`]),
  ...(aChain ? ['-map', '[vout]', '-map', '[aout]'] : []),
  //  끝도 잘라 냅니다. 녹화는 브라우저를 닫을 때까지 이어져서, 마지막 장면
  //  뒤에 2~3초가 덤으로 붙습니다 — 영상이 끝난 줄 모르고 멈춰 있게 됩니다.
  ...(tl.bodySec ? ['-t', String(tl.bodySec)] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  ...(aChain ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '1'] : ['-an']),
  mp4,
]
execFileSync(FF, args, { stdio: 'inherit' })

let info = ''
try {
  execFileSync(FF, ['-hide_banner', '-i', mp4], { stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  info = String(e.stderr ?? '')
}
const d = info.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
const sec = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null
const stream = (info.match(/Stream #0:0.*\n?/) ?? [''])[0].trim()
const astream = (info.match(/Stream #0:1.*\n?/) ?? [''])[0].trim()
const size = statSync(mp4).size

console.log('')
console.log(`  MP4      ${mp4}`)
console.log(`  크기     ${(size / 1024 / 1024).toFixed(1)} MB`)
console.log(`  길이     ${sec === null ? '?' : sec.toFixed(2)}초`)
console.log(`  영상     ${stream || `${width}x${height} @ ${CFG.fps}fps`}`)
if (astream) console.log(`  음성     ${astream}`)
if (voice) {
  console.log(VO
    ? `  내레이션 직접 녹음 · ${VO.file} (${VO.offsetSec.toFixed(2)}~${VO.endSec.toFixed(2)}초 구간)`
    : `  내레이션 ${voice.provider} · ${inputs.length}장면`)
}

if (sec !== null) {
  const { minSec, maxSec } = CFG.length
  if (sec < minSec || sec > maxSec) {
    console.log(`  ⚠ 목표 길이(${minSec}~${maxSec}초)를 벗어났습니다 — config 의 hold 값을 조정하세요.`)
    process.exitCode = 1
  }
}
if (tl.marks?.length) {
  console.log('')
  console.log('  장면 (영상 시작 기준)')
  for (const m of tl.marks) console.log(`    ${String(m.sec.toFixed(1)).padStart(5)}s  ${m.label}`)
}
