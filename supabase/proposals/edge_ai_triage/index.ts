// ═══════════════════════════════════════════════════════════════════════════
//  Edge Function: ai-triage — 병원 요청 글 1차 정리 (0096 · 배포 대기)
//
//  AI 자리 12곳(lib/aiSpecs.ts) 중 「요청 읽고 정리하기」 1곳의 서버 코드입니다.
//  브라우저에 API 키를 둘 수 없어(노출됨) 서버 함수가 대신 부릅니다.
//
//  ── 이 함수가 하는 것 ──────────────────────────────────────────────────
//   입력: 병원이 올린 요청 글 하나
//   출력: { kind, urgency, draft, basis } — 분류 · 급함 정도 · 회신 초안 · 근거
//
//  ── 이 함수가 절대 하지 않는 것 (aiSpecs.requestTriage 의 금지선 그대로) ──
//   · 회신을 자동으로 보내지 않습니다 — 초안을 돌려줄 뿐, 저장도 안 합니다
//   · 요청 상태를 바꾸지 않습니다 — DB 에 쓰기 자체가 없습니다
//   · 방문 날짜를 약속하지 않습니다 — 프롬프트로 금지 + 결과 검사로 이중 차단
//   · 금액·단가를 말하지 않습니다
//
//  ── 배포 (대표님 실행) ─────────────────────────────────────────────────
//   1) supabase secrets set AI_API_KEY=sk-...      ← 키는 서버에만
//   2) supabase functions deploy ai-triage
//   자세한 절차와 시험 방법: 같은 폴더 README.md
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODEL = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'
const API_URL = Deno.env.get('AI_API_URL') ?? 'https://api.openai.com/v1/chat/completions'

const KINDS = ['추가수거', '긴급수거', '소모품', '일정변경', '문의', '기타'] as const
const URGENCY = ['오늘', '이번 주', '여유 있음', '판단 불가'] as const

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    //  ── 인증 — 로그인한 직원만. 병원 계정도 익명도 안 됩니다. ──────────
    const auth = req.headers.get('Authorization') ?? ''
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) return json({ error: '로그인이 필요합니다' }, 401)
    const { data: me } = await sb
      .from('profiles').select('role').eq('id', u.user.id).maybeSingle()
    if (!me || !['admin', 'office'].includes(me.role)) {
      return json({ error: '내부 담당자만 쓸 수 있습니다' }, 403)
    }

    const key = Deno.env.get('AI_API_KEY')
    if (!key) return json({ error: 'AI_API_KEY 가 설정되지 않았습니다 — 아직 연결 전입니다' }, 503)

    const { content } = await req.json()
    if (typeof content !== 'string' || content.trim().length === 0) {
      return json({ error: '요청 글이 비어 있습니다' }, 400)
    }
    if (content.length > 4000) return json({ error: '글이 너무 깁니다(4000자 초과)' }, 400)

    //  ── 모델 호출 ──────────────────────────────────────────────────────
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '너는 의료폐기물 수거회사의 요청 분류 보조다. 병원이 올린 요청 글을 읽고 JSON 으로만 답한다: '
              + `{"kind": ${JSON.stringify(KINDS)} 중 하나, `
              + `"urgency": ${JSON.stringify(URGENCY)} 중 하나, `
              + '"draft": "담당자가 고쳐 쓸 회신 초안 (2~3문장, 존댓말)", '
              + '"basis": "그렇게 판단한 근거 한 문장"}. '
              + '반드시 지켜라: 방문 날짜·시간을 약속하지 마라. 금액·단가를 말하지 마라. '
              + '글에 없는 사실을 지어내지 마라. 확실하지 않으면 urgency 는 "판단 불가"로 하고 '
              + 'draft 에는 "담당자가 확인 후 연락드리겠습니다"를 포함해라.',
          },
          { role: 'user', content },
        ],
      }),
    })
    if (!res.ok) return json({ error: `모델 호출 실패 (${res.status})` }, 502)
    const out = await res.json()
    const parsed = JSON.parse(out.choices?.[0]?.message?.content ?? '{}')

    //  ── 결과 검사 — 프롬프트만 믿지 않습니다 ───────────────────────────
    if (!KINDS.includes(parsed.kind)) parsed.kind = '기타'
    if (!URGENCY.includes(parsed.urgency)) parsed.urgency = '판단 불가'
    const draft = String(parsed.draft ?? '')
    //  날짜 약속·금액이 초안에 스며들었으면 초안을 버리고 안전 문구로.
    if (/\d{1,2}\s*[월일시]|\d[\d,]*\s*원/.test(draft)) {
      parsed.draft = '요청 확인했습니다. 담당자가 일정을 확인한 뒤 연락드리겠습니다.'
      parsed.basis = `${parsed.basis ?? ''} (초안에 날짜·금액이 들어가 안전 문구로 대체)`.trim()
    }

    return json({
      kind: parsed.kind,
      urgency: parsed.urgency,
      draft: parsed.draft ?? '',
      basis: parsed.basis ?? '',
      model: MODEL,
    })
  } catch (e) {
    return json({ error: `처리 실패: ${String(e).slice(0, 200)}` }, 500)
  }
})
