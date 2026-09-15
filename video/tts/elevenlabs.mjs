import { writeFileSync } from 'node:fs'

// ─────────────────────────────────────────────────────────────────────────────
//  ElevenLabs — 심사 영상용 한국어 음성
//
//   Piper 는 열쇠 없이 도는 대신 억양이 평탄합니다. 심사 자리에서 쓸 목소리는
//   여기서 만듭니다. Piper 는 **열쇠가 없을 때를 위한 예비**로 남겨 둡니다.
//
//  열쇠
//    ELEVENLABS_API_KEY 를 **환경변수로만** 받습니다.
//    코드·깃·문서 어디에도 적지 않습니다 (이 저장소의 오래된 규칙).
//
//      export ELEVENLABS_API_KEY=...
//      npm run video:voices          # 쓸 수 있는 목소리 목록
//      npm run video:say -- --only s1,s2   # 앞 두 장면만 시험
//
//  목소리 고르는 기준 (config 의 tts.voice)
//    · 한국어 발음이 자연스러울 것 (labels 에 korean / multilingual 표시)
//    · 광고처럼 들뜨지 않을 것 — 30~40대 담당자가 **차분히 설명하는** 느낌
//    · 또박또박하되 TTS 처럼 뚝뚝 끊지 말 것
//
//  장면마다 말투가 달라지지 않게 하는 것들
//    · 여섯 장면 모두 **같은 voice · 같은 model · 같은 settings**
//    · stability 를 높게(0.5 이상) 두면 장면 간 편차가 줄어듭니다
//    · 앞뒤 문장을 previous_text · next_text 로 함께 보냅니다 —
//      문장 사이 호흡과 연결감이 살아납니다
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://api.elevenlabs.io/v1'

const key = () => process.env.ELEVENLABS_API_KEY || ''

/** 24kHz 16bit 모노 PCM 에 wav 머리말을 붙입니다 (mp3 변환 없이 길이를 잴 수 있게) */
function wrapWav(pcm, rate = 24000) {
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + pcm.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)          // PCM
  head.writeUInt16LE(1, 22)          // 모노
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28)   // byteRate = rate × 2바이트
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([head, pcm])
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': key(), ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ElevenLabs ${res.status} ${path}\n  ${body.slice(0, 300)}`)
  }
  return res
}

/** 쓸 수 있는 목소리 목록 — 고를 때 보라고 만든 것입니다 */
export async function listVoices() {
  const res = await api('/voices')
  const { voices } = await res.json()
  return (voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    labels: v.labels ?? {},
    description: v.description ?? '',
  }))
}

export const elevenlabs = {
  name: 'elevenlabs',

  check(voice = {}) {
    if (!key()) {
      throw new Error(
        'ELEVENLABS_API_KEY 가 없습니다.\n'
        + '  환경변수로만 받습니다 — 코드·깃에는 저장하지 않습니다.\n'
        + '    export ELEVENLABS_API_KEY=...\n'
        + '  목소리를 아직 안 고르셨으면: npm run video:voices')
    }
    if (!voice.voiceId) {
      throw new Error(
        '어떤 목소리로 읽을지 정해야 합니다 (config 의 tts.voice.voiceId).\n'
        + '  npm run video:voices 로 목록을 보고 고르세요.\n'
        + '  기준: 한국어가 자연스럽고, 광고처럼 들뜨지 않으며, 차분히 설명하는 느낌.')
    }
  },

  /**
   * 한 문장을 wav 로.
   *
   *  voice 에서 쓰는 것
   *    voiceId          목소리 (필수)
   *    model            기본 eleven_multilingual_v2
   *    stability        높을수록 장면 간 편차가 적습니다 (0~1)
   *    similarityBoost  목소리 일관성 (0~1)
   *    style            0 에 가까울수록 담백합니다 — 광고 톤을 피합니다
   *    speed            1.0 이 기본, 낮을수록 여유 (0.7~1.2)
   *    speakerBoost     또렷함
   *
   *  ctx.prev / ctx.next 는 앞뒤 장면의 문장입니다. 읽지는 않고, **어떻게
   *  이어지는 말인지** 참고만 합니다 — 문장 사이 호흡이 자연스러워집니다.
   */
  async synth(text, outWav, voice = {}, ctx = {}) {
    this.check(voice)
    const body = {
      text,
      model_id: voice.model ?? 'eleven_multilingual_v2',
      language_code: voice.languageCode ?? undefined,
      previous_text: ctx.prev || undefined,
      next_text: ctx.next || undefined,
      voice_settings: {
        stability: voice.stability ?? 0.55,
        similarity_boost: voice.similarityBoost ?? 0.8,
        style: voice.style ?? 0.05,
        use_speaker_boost: voice.speakerBoost ?? true,
        speed: voice.speed ?? 0.95,
      },
    }
    const res = await api(
      `/text-to-speech/${voice.voiceId}?output_format=pcm_24000`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    )
    const pcm = Buffer.from(await res.arrayBuffer())
    if (pcm.length < 1000) throw new Error(`음성이 비어 있습니다 (${pcm.length}바이트)`)
    writeFileSync(outWav, wrapWav(pcm, 24000))
  },
}
