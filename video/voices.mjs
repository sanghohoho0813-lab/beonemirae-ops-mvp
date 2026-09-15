import { listVoices } from './tts/elevenlabs.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  쓸 수 있는 목소리 목록 — 골라서 config 의 tts.voice.voiceId 에 적습니다.
//
//   고르는 기준 (대표님 지시)
//    · 한국어 발음이 자연스러울 것
//    · 광고처럼 들뜨거나 감정적이지 않을 것
//    · 30~40대 기업 담당자가 **차분히 설명하는** 느낌
//    · 또박또박하되 TTS 처럼 뚝뚝 끊지 말 것
//
//   ⚠ 열쇠는 환경변수로만 받습니다 — export ELEVENLABS_API_KEY=...
// ─────────────────────────────────────────────────────────────────────────────

const voices = await listVoices()
console.log(`── 목소리 ${voices.length}개 ──`)
for (const v of voices) {
  const l = v.labels ?? {}
  const tags = [l.language, l.accent, l.gender, l.age, l.use_case, l.description]
    .filter(Boolean).join(' · ')
  console.log(`  ${v.id}  ${v.name}`)
  if (tags) console.log(`      ${tags}`)
}
