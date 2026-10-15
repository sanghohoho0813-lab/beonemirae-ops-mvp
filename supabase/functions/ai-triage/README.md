# ai-triage — 병원 요청 AI 분석 (배포 · 설정 · 확인)

고객 요청 화면의 회신 창 「AI 요청 분석 · 회신 초안」이 부르는 서버 함수입니다.
병원 요청 **하나**를 외부 LLM 이 읽고 요청 종류 · 긴급도 · 요약 · 핵심 요구사항 ·
회신 초안 · 판단 근거를 **제안**합니다. 최종 판단과 회신은 담당자가 합니다.

> 지금 상태: **배포됨 · 실제 AI 호출 확인됨 (2026-10-15, Gemini `gemini-3.1-flash-lite`, 4.9초).**
> 대시보드 붙여넣기 판(`docs/deploy/ai-triage-dashboard.ts`)으로 배포했습니다. 원본을 고치면
> `python3 scripts/bundle_ai_triage.py` 로 다시 만들어 같은 자리에 붙여 넣습니다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `index.ts` | Deno 진입점 — Supabase(로그인 사용자 토큰) · fetch 를 이어 줌 |
| `handler.ts` | 흐름: 로그인 → 역할(관리자 · 사무실 · 사용 중) → DB 에서 요청 읽기 → 모델 → 검사 → `ai_calls` 기록 |
| `triage.ts` | 시스템 프롬프트 · 개인정보 가림 · 엄격한 JSON 검사(지어낸 숫자 · 확정 약속 차단) |
| `provider.ts` | 모델 호출 어댑터 — OpenAI 호환 Chat Completions · JSON 모드 · 20초 제한 |
| `gemini.ts` | 모델 호출 어댑터 — Google Gemini 기본 REST(`generateContent`) · 키는 `x-goog-api-key` 헤더(새 `AQ.` 키 · 옛 `AIza` 키 모두) · JSON 모드 · 기본 `gemini-2.5-flash-lite`(이전 세대 · 가장 쌈 · 무료 등급 있음), 그 모델이 없어졌으면(404) 한 번만 `gemini-3.1-flash-lite` · 키 모양으로 회사 고르기(`pickAi`) |
| `anthropic.ts` | 모델 호출 어댑터 — Claude (Anthropic 공식 SDK `npm:@anthropic-ai/sdk@0.130.0`) · 기본 `claude-opus-5-5` · effort low · 거절 시 권장 모델로 한 번 더(`fallbacks: "default"`) · 20초 제한 |
| `deno.json` | 저장소 맨 위 `package.json` 을 따라가지 않게 (`nodeModulesDir: none`) |

## 배포 — 대표님 PC 에서 약 5분

```bash
# 0) Supabase CLI 설치 · 로그인 · 프로젝트 연결 (처음 한 번)
#    설치: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <프로젝트 ref>      # 대시보드 주소 /project/<ref> 의 그 값

# 1) 키 등록 — 서버에만 둡니다 (브라우저 · 저장소 · VITE_* 금지)
#    어느 회사 키든 하나만 넣으면 됩니다. 키 모양으로 고릅니다:
#      AQ.… 또는 AIza… → Google Gemini     sk-ant-… → Claude(Anthropic)     그 밖 → OpenAI 호환
#    (CLI 대신 Supabase 대시보드 › Edge Functions › Secrets 에서 이름 AI_API_KEY 로 넣어도 같습니다)
supabase secrets set AI_API_KEY=<모델 회사에서 발급한 키>

# 2) (선택) 회사 · 모델 · 주소를 직접 정하기
#    AI_PROVIDER=gemini | anthropic | openai   (비우면 위처럼 키 모양으로)
#    기본 모델: gemini → gemini-2.5-flash-lite · anthropic → claude-opus-5-5 · openai → gpt-4o-mini
#    (Gemini 에서 더 좋은 글을 원하면 AI_MODEL=gemini-3.8-flash — 값이 조금 더 듦)
#    OpenAI 호환 다른 회사면 AI_API_URL 에 그 회사의 chat/completions 주소를 넣습니다.
#    지금 계정에서 쓸 수 있는 모델 이름으로 맞춰 주세요. 이름이 틀리면 404 실패로 기록됩니다.
supabase secrets set AI_MODEL=<쓸 모델 이름>
#    (gemini · openai) temperature 를 받지 않는 모델이면 빈 값으로:  supabase secrets set AI_TEMPERATURE=

# 3) 배포 (저장소 맨 위 폴더에서)
supabase functions deploy ai-triage
```

`SUPABASE_URL` · `SUPABASE_ANON_KEY` 는 Supabase 가 함수에 자동으로 넣어 줍니다.
`supabase/config.toml` 의 `[functions.ai-triage] verify_jwt = true` 로 로그인 토큰이 없는
호출은 함수에 닿기 전에 막히고, 함수 안에서 역할을 다시 확인합니다.

## 배포 후 확인 — 실제 호출이 되는지

**가장 빠른 길 (0140):** 관리자 계정 → 사이드바 **신보 발표 시연** → 「시연 준비 상태」의
**「지금 AI 연결 확인」** — 시연용 거래처의 시연 요청 하나로 실제 외부 AI 를 부르고,
`✓ 성공 · 모델 · 초 · 「긴급수거 · 긴급도 높음」` 또는 `✕ 실패 — 까닭` 을 그대로 보여 줍니다.
(시연용 거래처 · 시연 요청이 없으면 하나만 만듭니다 — 주소 · 연락처는 비움, 실적에서 빠짐.)

또는 직접:

1. 관리자 또는 사무실 계정으로 로그인 → **고객 요청** → 요청 하나의 **회신 남기기**
2. **AI 분석 실행** → 2~10초 안에 「긴급수거 · 긴급도 높음 · 요약 · 회신 초안」이 보이면 성공
3. 실패하면 칸에 까닭이 그대로 나옵니다

| 화면의 까닭 | 할 일 |
|---|---|
| `AI_API_KEY 가 서버에 등록되지 않았습니다` | 위 1) |
| `AI 키가 올바르지 않습니다 (401)` · Gemini 는 `(400)` | 키 다시 발급 · 등록 (앞뒤 빈칸 · 따옴표 없이) |
| `AI 키에 이 모델을 쓸 권한이 없습니다 (403)` | Gemini: AI Studio 에서 키를 만든 프로젝트 · 「Gemini API 만」 제한 확인 |
| `AI 모델 이름을 찾지 못했습니다 (404)` | `AI_MODEL` 을 계정에서 쓸 수 있는 이름으로 |
| `AI 사용량 한도에 걸렸습니다 (429)` | 모델 회사 결제 · 한도 확인 (Gemini 무료 등급은 분당 횟수가 작음 — 연달아 누르지 않기) |
| `AI 서버가 바쁩니다 (503)` | 잠시 뒤 다시 · 계속이면 `AI_MODEL` 을 다른 안정 모델로 |
| `서버 함수에 닿지 못했습니다 — …not found` | 위 3) 배포 |

4. Supabase **SQL Editor** 에서 기록 확인 (읽기만):

```sql
-- 최근 AI 호출 20건 — 성공 · 실패 · 모델 · 처리시간
select created_at at time zone 'Asia/Seoul' as 시각, kind, ok, model, ms, error, actor_name, edited
from public.ai_calls order by created_at desc limit 20;

-- 실제 운영 요청에 대한 호출 수 (시연 요청 제외)
select count(*) filter (where ok) as 성공, count(*) filter (where not ok) as 실패
from public.ai_calls where kind = 'request_triage';
```

## AI 가 읽는 것 · 하지 않는 것

- **읽는 것(모델에 보내는 것 전부)**: 그 요청의 글(전화번호 · 주민번호 · 메일은 가림, 2,000자까지),
  병원이 고른 요청 종류, 「급함」 표시, 희망일. 보낸 글은 `ai_calls.input` 에 그대로 남습니다.
- **보내지 않는 것**: 병원명 · 요청자 이름 · 매출 · 미수 · 정산 · 다른 거래처 · 수거 이력.
- **하지 않는 것**: 요청 상태 변경 · 회신 전송 · 일정 확정 · 배차 · 수거량 · 재고 · 정산 변경.
  이 함수가 쓰는 곳은 `ai_calls`(호출 기록) 한 곳뿐입니다.
- **결과 검사**: 종류는 `긴급수거 · 추가수거 · 소모품 · 교육·자료 · 기타`, 긴급도는
  `높음 · 보통 · 낮음` 만. 빠지거나 범위 밖이거나 JSON 이 아니면 **실패**입니다.
  회신 초안에 요청 글에 없는 숫자 · 시각(예: 「10시」)이 있거나 「방문하겠습니다 ·
  배차되었습니다」 같은 확정 약속이 있으면 **실패**로 돌려 담당자가 다시 시도하거나 직접 씁니다
  (고정 문구로 갈아끼우지 않습니다).

## 시연 기록 분리

시연 세션(`demo_session_id`) · 시연용 거래처의 요청에 대한 호출은 `kind = 'request_triage_demo'`
로 남습니다. 준비도 화면의 「AI 실제 사용 기록」은 `request_triage` 만 셉니다(요청이 시연이거나
지워졌으면 그것도 뺍니다).

## 검사

- `node test/browser/check_ai_triage_core.mjs` — 이 폴더의 코드를 그대로 불러 권한 · 검사 · 기록 시험
- `test/browser/check_ai_triage_ui.mjs` — 화면 (전체 회귀 `test/browser/run.sh` 에 포함)
- `DENO_BIN=… node supabase/test/ai_triage_e2e.mjs` — **이 함수 코드를 Deno 로 띄워** 병원 요청 →
  AI 분석 → 회신 → 포털까지. 모델 자리는 시험용 응답이므로 「실제 외부 AI 응답」은 증명하지 않습니다.

## 남은 일 (알고 있는 것)

- `ai_calls` 는 지금 직원 계정이 브라우저에서도 넣을 수 있습니다(판 106 권한). 서버에 닿지 못한
  실패를 브라우저가 기록하는 데 쓰고 있습니다. 기록 위조까지 막으려면 다음 판에서 브라우저
  insert 를 막고 함수가 service role 로 쓰게 바꿉니다 — SQL 이 필요해 이번에는 하지 않았습니다.
- 토큰 수는 `ai_calls.output.usage` 에만 남깁니다(성공 · 형식 실패). 비용 계산 칸은 만들지 않았습니다.
