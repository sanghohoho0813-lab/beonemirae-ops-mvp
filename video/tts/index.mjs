import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { piper } from './piper.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  음성 공급자 — **여기 한 곳만 갈아 끼웁니다** (0114)
//
//   녹화(record.mjs)도 자막도 영상 합치기(mux.mjs)도 「어느 회사 음성인지」를
//   모릅니다. 셋이 아는 것은 아래 두 가지뿐입니다.
//
//     · 장면마다 wav 파일이 하나씩 있다
//     · 그 파일이 몇 초짜리인지 timing.json 에 적혀 있다
//
//   그래서 나중에 ElevenLabs·OpenAI·Google 로 바꿀 때 **이 폴더에 파일 하나를
//   더 만들고 아래 PROVIDERS 에 한 줄 더하면 끝**입니다. 녹화·자막·합치기
//   코드는 손대지 않습니다.
//
//   공급자가 지켜야 할 약속 (interface)
//     name        'piper' 처럼 config 에 적는 이름
//     check()     못 쓸 상태면 **무엇을 어떻게 갖추면 되는지** 적어 던집니다
//     synth(text, outWav, voice)  그 문장을 wav 로 만듭니다
//
//   ⚠ 열쇠(API key)가 필요한 공급자는 **환경변수로만** 받습니다. 코드·깃·
//     문서에 적지 않습니다 (이 저장소의 오래된 규칙입니다).
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS = {
  piper,
  //  나중에 여기에 한 줄씩 더합니다 —
  //    elevenlabs,   (ELEVENLABS_API_KEY)
  //    openai,       (OPENAI_API_KEY)
  //    google,       (GOOGLE_APPLICATION_CREDENTIALS)
}

export function getProvider(name) {
  const p = PROVIDERS[name]
  if (!p) {
    throw new Error(
      `모르는 음성 공급자입니다: ${name}\n`
      + `  쓸 수 있는 것: ${Object.keys(PROVIDERS).join(', ')}\n`
      + '  새로 붙이려면 video/tts/<이름>.mjs 를 만들고 video/tts/index.mjs 의 PROVIDERS 에 더하세요.')
  }
  return p
}

/** wav 파일의 길이(초) — 머리말만 읽습니다 (ffprobe 없이) */
export function wavSeconds(file) {
  const b = readFileSync(file)
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error(`wav 가 아닙니다: ${file}`)
  }
  //  fmt / data 조각을 차례로 훑습니다 (조각 순서는 만드는 쪽마다 다릅니다)
  let pos = 12
  let byteRate = 0
  let dataLen = 0
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4)
    const size = b.readUInt32LE(pos + 4)
    if (id === 'fmt ') byteRate = b.readUInt32LE(pos + 16)
    if (id === 'data') { dataLen = size; break }
    pos += 8 + size + (size % 2)
  }
  if (!byteRate || !dataLen) throw new Error(`wav 길이를 못 읽었습니다: ${file}`)
  return dataLen / byteRate
}

/**
 * 장면 대사를 전부 읽어 wav 로 만들고 길이를 잽니다.
 *
 *  같은 문장이면 다시 만들지 않습니다 — 화면 타이밍만 손보는 동안 음성을
 *  매번 새로 뽑을 이유가 없습니다 (piper 는 한 문장에 2~4초 걸립니다).
 */
export function speakAll(scenes, { provider, voice, outDir, force = false }) {
  const engine = getProvider(provider)
  engine.check()
  mkdirSync(outDir, { recursive: true })

  const stampPath = join(outDir, 'source.json')
  const stamp = JSON.stringify({ provider, voice, scenes: scenes.map((s) => [s.id, s.text]) })
  const same = !force && existsSync(stampPath) && readFileSync(stampPath, 'utf8') === stamp

  const out = []
  for (const s of scenes) {
    const wav = join(outDir, `${s.id}.wav`)
    if (!same || !existsSync(wav)) engine.synth(s.text, wav, voice)
    out.push({ id: s.id, text: s.text, wav, sec: Number(wavSeconds(wav).toFixed(3)) })
  }
  writeFileSync(stampPath, stamp)
  return { provider, voice, scenes: out, totalSec: Number(out.reduce((a, s) => a + s.sec, 0).toFixed(3)) }
}
