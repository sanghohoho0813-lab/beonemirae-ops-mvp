import { existsSync, readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
//  0115 — 「화면이 깜빡이는가」를 눈이 아니라 **숫자로** 확인합니다
//
//   장면이 바뀌는 순간 화면 전체가 갑자기 밝아지거나 어두워지면, 보는 사람은
//   내용이 아니라 그 번쩍임을 먼저 봅니다. 영상은 한 번 뽑고 나면 눈으로 다시
//   훑어야 알 수 있어서, 매번 놓치기 쉽습니다.
//
//   그래서 프레임마다 **평균 밝기(Y)** 를 재고, 앞 프레임과의 차이가 큰
//   자리를 찍어 줍니다. ffmpeg 의 signalstats 가 프레임마다 값을 뱉으므로
//   그림을 따로 뜯지 않아도 됩니다.
//
//   두 가지를 봅니다.
//     밝기 튐   |ΔY| — 화면 전체가 밝아졌다 어두워지는 것
//     장면 바뀜 scene — 그림이 통째로 바뀌는 것 (화면 이동은 당연히 큽니다)
//
//   ⚠ 화면을 옮기는 순간(라우트 전환)은 **원래 크게 바뀝니다.** 그건 깜빡임이
//     아니라 이동입니다. 그래서 timeline.json 의 장면 시각 옆에 같이 적어
//     「전환 때문인지 아닌지」를 사람이 판단할 수 있게 합니다.
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

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const cfgPath = process.argv.find((a) => a.endsWith('.json')) ?? join(ROOT, 'video/config.beonemirae.json')
const CFG = JSON.parse(readFileSync(cfgPath, 'utf8'))
const OUT = join(ROOT, CFG.out.dir)
const file = process.argv[2] && !process.argv[2].startsWith('--') && !process.argv[2].endsWith('.json')
  ? process.argv[2]
  : join(OUT, CFG.out.mp4)

/** 이 값을 넘는 밝기 변화만 알립니다 (0~255 척도) */
const JUMP = Number(process.env.FLICKER_JUMP ?? 6)

if (!existsSync(file)) throw new Error(`영상이 없습니다: ${file}`)
const FF = ffmpegPath()

//  ⚠ metadata=print 는 **stderr** 로 나옵니다. execFileSync 는 성공하면
//    stdout 만 돌려주므로 stderr 를 못 받습니다 — spawnSync 로 직접 읽습니다.
const run = spawnSync(FF, [
  '-hide_banner', '-nostats', '-loglevel', 'info', '-i', file,
  '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG',
  '-f', 'null', '-',
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const log = String(run.stderr ?? '')

//  frame:0  pts_time:0
//  lavfi.signalstats.YAVG=112.345
const frames = []
const re = /pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g
let m
while ((m = re.exec(log)) !== null) frames.push({ t: Number(m[1]), y: Number(m[2]) })

if (frames.length < 2) {
  console.log('  프레임을 못 읽었습니다 — ffmpeg 에 signalstats 가 없을 수 있습니다.')
  process.exit(0)
}

//  ── 무엇을 「깜빡임」으로 볼 것인가 ───────────────────────────────────────
//   프레임 사이 차이만 보면, **부드럽게 어두워지는 것**도 크게 잡힙니다.
//   밝은 화면(222)에서 어두운 화면(40)으로 0.3초에 걸쳐 내려가면 프레임마다
//   20씩 변하는 것이 당연합니다. 그건 전환이지 깜빡임이 아닙니다.
//
//   깜빡임은 둘 중 하나입니다.
//     ① 튐   — 확 바뀌었다가 **곧 되돌아오는 것** (번쩍)
//     ② 뚝   — 한두 프레임 만에 **끝나 버리는 큰 변화** (계단)
//   그 밖에 같은 방향으로 여러 프레임에 걸쳐 가는 것은 「부드러운 전환」으로
//   따로 셉니다 — 몇 초에 걸쳐 갔는지 함께 적습니다.
const HARD = Number(process.env.FLICKER_HARD ?? 25)   // 이만큼 넘게 변하면 큰 변화
const SPIKE = Number(process.env.FLICKER_SPIKE ?? 10) // 되돌아옴을 볼 최소 크기

const spikes = []
const cuts = []
const ramps = []
let i = 1
while (i < frames.length) {
  const d = frames[i].y - frames[i - 1].y
  if (Math.abs(d) < 6) { i += 1; continue }
  //  같은 방향으로 이어지는 동안을 한 덩어리로 봅니다.
  let j = i
  while (j + 1 < frames.length && Math.sign(frames[j + 1].y - frames[j].y) === Math.sign(d)
         && Math.abs(frames[j + 1].y - frames[j].y) >= 2) j += 1
  const total = frames[j].y - frames[i - 1].y
  const secs = frames[j].t - frames[i - 1].t
  const nFrames = j - i + 1

  //  ① 튐 — 이 덩어리 뒤 0.3초 안에 절반 넘게 되돌아오는가
  const backIdx = Math.min(frames.length - 1, j + Math.round(0.3 / (frames[1].t - frames[0].t || 0.033)))
  const back = frames[backIdx].y - frames[j].y
  const returned = Math.abs(total) >= SPIKE && Math.sign(back) === -Math.sign(total)
    && Math.abs(back) >= Math.abs(total) * 0.5

  if (returned) spikes.push({ t: frames[i].t, d: total, secs })
  else if (Math.abs(total) >= HARD && nFrames <= 2) cuts.push({ t: frames[i].t, d: total, secs })
  else if (Math.abs(total) >= HARD) ramps.push({ t: frames[i - 1].t, d: total, secs })
  i = j + 1
}

//  장면 시각을 옆에 붙여 「전환 때문인지」 바로 알 수 있게 합니다.
const tlPath = join(OUT, CFG.out.timeline)
const marks = existsSync(tlPath) ? (JSON.parse(readFileSync(tlPath, 'utf8')).marks ?? []) : []
const near = (t) => {
  const hit = marks.filter((k) => Math.abs(k.sec - t) <= 1.2).sort((a, b) => Math.abs(a.sec - t) - Math.abs(b.sec - t))[0]
  return hit ? `  (${hit.sec.toFixed(1)}s ${hit.label})` : ''
}

const ys = frames.map((f) => f.y)
console.log(`── 깜빡임 검사 · ${file.split('/').pop()} ──`)
console.log(`  프레임 ${frames.length}개 · 평균 밝기 ${(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(1)} (${Math.min(...ys).toFixed(1)} ~ ${Math.max(...ys).toFixed(1)})`)

const bad = [...spikes.map((x) => ({ ...x, kind: '튐  (번쩍였다 되돌아옴)' })),
  ...cuts.map((x) => ({ ...x, kind: '뚝  (한두 프레임 만에 큰 변화)' }))]
  .sort((a, b) => a.t - b.t)

if (bad.length === 0) {
  console.log('  ✅ 번쩍이거나 뚝 끊기는 자리 없음')
} else {
  console.log(`  ⚠ ${bad.length}곳`)
  for (const x of bad) {
    console.log(`    ${x.t.toFixed(2)}s  ${x.kind} — 밝기 ${x.d > 0 ? '+' : ''}${x.d.toFixed(0)} (${x.secs.toFixed(2)}초)${near(x.t)}`)
  }
}
if (ramps.length) {
  console.log('')
  console.log(`  부드러운 전환 ${ramps.length}곳 (깜빡임 아님)`)
  for (const r of ramps) {
    console.log(`    ${r.t.toFixed(2)}s  밝기 ${r.d > 0 ? '+' : ''}${r.d.toFixed(0)} 을 ${r.secs.toFixed(2)}초에 걸쳐${near(r.t)}`)
  }
}
