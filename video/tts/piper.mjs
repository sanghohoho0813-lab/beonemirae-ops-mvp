import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
//  Piper — 한국어 음성 (오프라인 · 무료 · 열쇠 불필요)
//
//   · 인터넷 없이 돕니다. 대사가 바깥으로 나가지 않습니다.
//   · 같은 문장이면 **언제나 같은 소리**가 나옵니다 (영상을 다시 뽑아도 같음).
//   · 상용 서비스보다 억양이 평탄합니다 — 바꾸려면 video/tts/index.mjs 에
//     공급자를 하나 더 붙이면 됩니다. 이 파일은 그대로 둡니다.
//
//  준비 (한 번만)
//    python3 -m venv video/.piper/venv
//    video/.piper/venv/bin/pip install piper-tts
//    curl -sSLo video/.piper/ko_KR-kss-medium.onnx \
//      https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx
//    curl -sSLo video/.piper/ko_KR-kss-medium.onnx.json \
//      https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx.json
//
//  다른 자리에 두었다면 환경변수로 알려 주세요 — PIPER_PYTHON · PIPER_MODEL.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const HOME = join(ROOT, 'video/.piper')

const PY = () => process.env.PIPER_PYTHON || join(HOME, 'venv/bin/python')
const MODEL = () => process.env.PIPER_MODEL || join(HOME, 'ko_KR-kss-medium.onnx')

export const piper = {
  name: 'piper',

  check() {
    const miss = []
    if (!existsSync(PY())) miss.push(`파이썬: ${PY()}`)
    if (!existsSync(MODEL())) miss.push(`목소리 파일: ${MODEL()}`)
    if (miss.length === 0) return
    throw new Error(
      'piper 를 못 찾았습니다 — ' + miss.join(' · ') + '\n'
      + '  준비하는 법은 video/tts/piper.mjs 맨 위에 적어 두었습니다.\n'
      + '  다른 자리에 두었다면 PIPER_PYTHON · PIPER_MODEL 로 알려 주세요.')
  },

  /**
   * 한 문장을 wav 로.
   *
   *  voice 에서 쓰는 것
   *    lengthScale     말 속도. 1.0 이 기본이고 **클수록 느립니다**.
   *    noiseScale      목소리 떨림 (작을수록 또박또박, 클수록 사람 같음)
   *    noiseW          발음 길이의 흔들림
   *    sentenceSilence 마침표 뒤 쉬는 시간(초)
   */
  synth(text, outWav, voice = {}) {
    const a = ['-m', MODEL(), '-f', outWav]
    if (voice.lengthScale != null) a.push('--length-scale', String(voice.lengthScale))
    if (voice.noiseScale != null) a.push('--noise-scale', String(voice.noiseScale))
    if (voice.noiseW != null) a.push('--noise-w-scale', String(voice.noiseW))
    if (voice.sentenceSilence != null) a.push('--sentence-silence', String(voice.sentenceSilence))
    execFileSync(PY(), ['-m', 'piper', ...a], { input: text, stdio: ['pipe', 'ignore', 'pipe'] })
    if (!existsSync(outWav)) throw new Error(`음성을 못 만들었습니다: ${outWav}`)
  },
}
