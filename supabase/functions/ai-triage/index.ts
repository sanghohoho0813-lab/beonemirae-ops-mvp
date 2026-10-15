// ═══════════════════════════════════════════════════════════════════════════
//  Edge Function: ai-triage — 병원 요청 AI 분석 (업무 보조)
//
//  고객 요청 화면 「AI 요청 분석」이 부릅니다:
//    supabase.functions.invoke('ai-triage', { body: { requestId } })
//
//  처리 흐름 · 권한 · 기록 규칙은 handler.ts, 프롬프트 · 결과 검사는 triage.ts,
//  모델 호출은 gemini.ts(Google) · anthropic.ts(Claude) · provider.ts(OpenAI 호환) 에 있습니다. 이 파일은 Supabase 와 fetch 를 이어 줄 뿐입니다.
//
//  ── Secret (supabase secrets set …) ───────────────────────────────────
//   AI_API_KEY      필수. 모델 회사 API 키 — 서버에만 둡니다(브라우저 · 저장소 금지)
//   AI_PROVIDER     선택. gemini | anthropic | openai — 비우면 키 모양으로 고름
//                         (AQ.… · AIza… = gemini · sk-ant-… = anthropic · 그 밖 = openai)
//   AI_MODEL        선택. 기본 gemini=gemini-2.5-flash-lite · anthropic=claude-opus-5-5 · openai=gpt-4o-mini
//   AI_API_URL      선택. gemini: 기본 https://generativelanguage.googleapis.com/v1beta (시험 때만 바꿈)
//                         openai: 기본 https://api.openai.com/v1/chat/completions (OpenAI 호환 주소면 무엇이든)
//                         anthropic: 비우면 Anthropic 기본 주소 (시험 때만 바꿈)
//   AI_TEMPERATURE  선택. gemini · openai · 기본 0.2 · 빈 값이면 보내지 않음 (temperature 를 안 받는 모델)
//   SUPABASE_URL · SUPABASE_ANON_KEY 는 Supabase 가 자동으로 넣어 줍니다.
//
//  ⚠ 사용자의 로그인 토큰으로 DB 를 읽고 씁니다(관리자 권한 키를 쓰지 않음) —
//    RLS 가 그대로 걸립니다. 직원이 못 읽는 것은 이 함수도 못 읽습니다.
//  배포 · 시험 절차: 같은 폴더 README.md
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleTriage } from './handler.ts'
import { chatJson } from './provider.ts'
import { claudeJson } from './anthropic.ts'
import { GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL, geminiJson, pickAi } from './gemini.ts'

const KEY0 = (Deno.env.get('AI_API_KEY') ?? '').trim()
const { provider: PROVIDER, model: MODEL, url: API_URL } = pickAi({
  key: KEY0,
  provider: Deno.env.get('AI_PROVIDER'),
  model: Deno.env.get('AI_MODEL'),
  url: Deno.env.get('AI_API_URL'),
})
const TEMP_RAW = Deno.env.get('AI_TEMPERATURE')
const TEMPERATURE = TEMP_RAW === '' ? null : Number.isFinite(Number(TEMP_RAW ?? '0.2')) ? Number(TEMP_RAW ?? '0.2') : 0.2
//  화면은 35초까지 기다립니다 — 서버가 먼저 끝내고 실패를 기록하도록 20초.
const MODEL_TIMEOUT_MS = 20_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return json({ error: 'POST 만 받습니다' }, 405)

  try {
    const auth = req.headers.get('Authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    let body: unknown = null
    try {
      body = await req.json()
    } catch {
      body = null
    }
    const key = KEY0

    const res = await handleTriage(body, {
      getUser: async () => {
        if (!token) return null
        const { data } = await sb.auth.getUser(token)
        return data.user ? { id: data.user.id } : null
      },
      getProfile: async (id) => {
        const { data } = await sb.from('profiles').select('role, active, name').eq('id', id).maybeSingle()
        return data ? { role: String(data.role), active: Boolean(data.active), name: String(data.name ?? '') } : null
      },
      getRequest: async (id) => {
        //  ⚠ 필요한 칸만 읽습니다 — 병원명 · 요청자 이름은 읽지도 않습니다.
        const { data } = await sb
          .from('client_requests')
          .select('id, client_id, content, kind, urgent, desired_date, demo_session_id')
          .eq('id', id)
          .maybeSingle()
        if (!data) return null
        let demo = !!data.demo_session_id
        if (!demo) {
          const { data: c } = await sb.from('clients').select('is_demo_generated').eq('id', data.client_id).maybeSingle()
          demo = !!c?.is_demo_generated
        }
        return {
          id: String(data.id),
          content: String(data.content ?? ''),
          kind: data.kind ? String(data.kind) : null,
          urgent: Boolean(data.urgent),
          desiredDate: data.desired_date ? String(data.desired_date).slice(0, 10) : null,
          demo,
        }
      },
      insertCall: async (row) => {
        const { data, error } = await sb.from('ai_calls').insert(row).select('id').maybeSingle()
        if (error) {
          console.error('ai_calls 기록 실패', error.message)
          return null
        }
        return data ? String(data.id) : null
      },
      callModel: (system, user) =>
        PROVIDER === 'anthropic'
          ? claudeJson({ apiKey: key, baseURL: API_URL || undefined, model: MODEL, system, user, timeoutMs: MODEL_TIMEOUT_MS })
          : PROVIDER === 'gemini'
          ? geminiJson({
              apiKey: key, base: API_URL, model: MODEL, system, user, timeoutMs: MODEL_TIMEOUT_MS, temperature: TEMPERATURE,
              //  기본 모델을 Google 이 내렸을 때(404)만 한 번 — AI_MODEL 을 직접 정했으면 그대로
              fallbackModel: MODEL === GEMINI_DEFAULT_MODEL ? GEMINI_FALLBACK_MODEL : null,
            })
          : chatJson({ apiKey: key, url: API_URL, model: MODEL, system, user, timeoutMs: MODEL_TIMEOUT_MS, temperature: TEMPERATURE }),
      hasKey: key.length > 0,
      model: MODEL,
      now: () => Date.now(),
    })
    return json(res.body, res.status)
  } catch (e) {
    return json({ error: `처리 실패: ${String(e).slice(0, 200)}` }, 500)
  }
})
