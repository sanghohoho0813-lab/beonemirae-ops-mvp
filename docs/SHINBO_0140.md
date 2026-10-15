# 0140 · 신용보증기금 발표 시연 — 클릭 순서 · AI 연결 · 아침 확인

> **AI 상태: 실제 외부 AI 호출 확인됨 (2026-10-15).** 대표님이 Supabase 대시보드에 붙여넣기 판으로
> `ai-triage` 를 배포하고 Gemini 키(`AQ.…`)를 Secret 으로 넣은 뒤, 시연 요청으로 실제 호출 성공 —
> 모델 `gemini-3.1-flash-lite` · 4.9초 · 「긴급수거 + 자재·용기 · 긴급도 높음」.
> 기본 모델 `gemini-2.5-flash-lite` 는 이 계정에서 404 라 같은 요청 안에서 `gemini-3.1-flash-lite` 로 넘어갔습니다
> (넘어가는 한 번을 없애려면 Secret `AI_MODEL=gemini-3.1-flash-lite`).

## 발표 클릭 순서 (AI 먼저 · 60~90초)

1. 관리자 계정 로그인 → 사이드바 **오늘 업무 › 신보 발표 시연** (`발표용` 표)
2. **AI 요청 분석 시연 시작** — 시연 요청을 준비하고 요청함의 그 요청으로 바로 갑니다
   (요청 카드에 보라색 테두리 · 안내 카드 「STEP 1 / 7 AI가 병원 요청을 읽고 업무 판단을 보조합니다」)
3. 그 요청의 **회신 남기기** → **AI 분석 실행**
4. 결과를 짚기 — `긴급수거` · `긴급도 높음` → AI 요약 → 핵심 요구사항 → AI 회신 초안 → 판단 근거,
   제목 옆과 아래에 **「AI 제안 → 담당자 최종 확인」**
5. **초안 사용** → 회신 칸에서 담당자가 고침 → **회신 저장** (AI 는 상태 · 일정 · 전송을 바꾸지 않음)
6. 안내 카드 **전체 운영 흐름 계속 보기** → 대시보드 → 수거 입력 → 병원 포털 → 성과 화면 → 마무리

전체 흐름부터 보여 줄 때는 2 대신 **전체 운영 흐름 시연**.

## 시연 요청 — 운영 자료와 섞이지 않게

- 시연용 거래처(시연 표 `is_demo_generated`)가 있으면 그것을, 없으면 **「시연용 병원」 하나만**
  만듭니다. 주소 · 연락처 · 사업자 정보는 비워 둡니다(지어내지 않음).
- 시연 요청: 「폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전 수거 부탁드리고 63L 용기도 10개 부탁드립니다.」
  — 처리 완료 전의 같은 요청이 있으면 그것을 씁니다. 두 번 눌러도 하나.
- 시연용 거래처는 성과 · 실증 · IR · 준비도 숫자에서 빠지고, 그 요청의 AI 호출은 `request_triage_demo`
  로 따로 기록됩니다. 실제 거래처는 읽기만 합니다.
- 만들어진 거래처에 시연 표가 붙지 않았으면(옛 서버 등) 요청을 넣지 않고 멈추고 까닭을 보여 줍니다.

## 발표 전에 대표님이 할 것 (AI 연결)

### 명령어 없이 — Supabase 대시보드에서 붙여 넣기 (권장)

1. Edge Functions › Secrets › `AI_API_KEY` = Gemini 키(`AQ.…`) — 넣었으면 건너뜀
2. GitHub 에서 [`docs/deploy/ai-triage-dashboard.ts`](deploy/ai-triage-dashboard.ts) 열기 → 오른쪽 위 **Copy raw file**(복사 아이콘)
3. Supabase 대시보드 › **Edge Functions**
   - 목록에 `ai-triage` 가 **있으면**: 눌러서 **Code** → 전체 지우고 붙여 넣기 → **Deploy updates**
   - **없으면**: **Deploy a new function › Via Editor** → 이름 `ai-triage`(정확히) → 전체 지우고 붙여 넣기 → **Deploy function**
4. 앱 › 신보 발표 시연 › 발표 준비 › **지금 AI 연결 확인**
   - `Invalid JWT` 가 나오면: 함수 화면 **Details** 의 JWT 확인(Verify JWT) 끄기 → Save. 함수가 로그인 · 역할을 스스로 다시 확인합니다.

이 파일은 `python3 scripts/bundle_ai_triage.py` 로 원본에서 만듭니다(내용 그대로 · 같은 폴더 import 만 뺌 · Claude 연결 제외).
검사: `deno run --config supabase/functions/ai-triage/deno.json -A supabase/test/dashboard_bundle_smoke.ts`

### CLI 로 (개발 PC)

```bash
supabase login
supabase link --project-ref <프로젝트 ref>
supabase secrets set AI_API_KEY=<Gemini 키>   # AQ.… · AIza… 이면 Gemini 로 자동 (sk-ant-… = Claude · 그 밖 = OpenAI 호환)
# (선택) supabase secrets set AI_MODEL=<모델>    # 기본 gemini-2.5-flash-lite (이전 세대 · 가장 쌈 · 무료 등급)
supabase functions deploy ai-triage
```

- Gemini 는 Google 기본 REST(`generateContent`, 키는 `x-goog-api-key` 헤더)로 부릅니다(`gemini.ts`).
  키가 `AQ.…`(새 형식) 또는 `AIza…` 로 시작하면 다른 설정 없이 됩니다.
- 키는 CLI 대신 Supabase 대시보드 › Edge Functions › Secrets 에 이름 `AI_API_KEY` 로 넣어도 같습니다.
  **함수 배포(`functions deploy`)는 CLI 로 한 번 해야 합니다** — 새 파일(`gemini.ts`)이 서버에 올라가야 합니다.

- 키는 서버 Secret 에만. 채팅 · 저장소 · `VITE_*` · 브라우저에 넣지 않습니다.
- 앱(Vercel)이 이 브랜치의 최신 커밋을 배포하고 있는지 확인 — 아니면 병합하거나 그 배포를 운영으로 올립니다.

## 내일 아침 반드시 직접 확인

1. 신보 발표 시연 → 맨 아래 **발표 준비** 펼치기 → **지금 AI 연결 확인** → `✓ 성공 · 모델 · 초` (실패면 까닭대로 위 단계)
2. 「발표 준비」 옆 **주황 점이 사라짐**(AI 실제 호출 성공 기록이 생김) → 「발표 준비」를 다시 접어 둠
3. 위 클릭 순서 1~6 을 한 번 끝까지 (AI 응답은 보통 수 초 — 화면은 35초까지 기다립니다)
4. 발표장 인터넷 · 프로젝터 글자 크기 · 새로고침 한 번 (준비 상태의 직접 체크 세 칸)

## 바뀐 것

| 곳 | 바뀐 것 |
|---|---|
| `supabase/functions/ai-triage/anthropic.ts`(신규) · `index.ts` | Claude 공식 SDK 어댑터 추가 — 키 모양 또는 `AI_PROVIDER` 로 고름. OpenAI 호환 길(`provider.ts`)은 그대로 |
| `supabase/functions/ai-triage/gemini.ts`(신규) · `provider.ts` | **Google Gemini** — `AQ.…` · `AIza…` 키면 자동 · 기본 `gemini-2.5-flash-lite` · Gemini 오류(400/401 키 · 403 · 404 · 429 · 503)를 까닭대로 · 오류 문구에서 키 가림 |
| `src/lib/nav.ts` · `Layout.tsx` · `MoreMenu.tsx` | 「오늘 업무」에 **신보 발표 시연**(`발표용`) · AX·심사의 「심사 시연」은 뺌(같은 주소 한 자리) · 폰 더보기 맨 위 |
| `src/pages/Presentation.tsx` | 첫 화면: 라벨 · 제목 · 한 줄 설명 · **AI 요청 분석 시연 시작**(가장 큼) · 전체 운영 흐름 시연 · 흐름 한 줄 · 현재 시스템 상태 · **지금 AI 연결 확인** |
| `src/lib/presenter.ts` · `PresenterContext.tsx` · `PresenterCard.tsx` | 「AI 먼저」 차례(같은 단계 · 다른 순서) · AI 단계 문구 · 「전체 운영 흐름 계속 보기」 |
| `src/context/usePrepareDemo.ts`(신규) · `repo.ts`(시연 표는 시연 거래처를 만들 때만 보냄) | 시연 요청 준비 — 있으면 그대로, 없으면 하나만 |
| `src/pages/Requests.tsx` | `?focus=` 로 그 요청 카드로 · AI 결과 순서 · 「AI 제안 → 담당자 최종 확인」 |

## 발표장 화면 (프로젝터에 그대로 보임)

- 시작 화면에 보이는 것: 제목 · 「AI 요청 분석 시연 시작」 · 「전체 운영 흐름 시연」 · 흐름 한 줄 · 현재 상태 네 칸.
  준비 점검 · 단계 목록 · 60초 연습 · 표현 가이드 · 성과 요약 바로 가기는 접힌 **발표 준비** 안에만 있습니다.
- 안내 카드: **설명**(읽을 문장) · **▶ 누를 곳** 두 칸 + 이전/다음.
- 발표 중(안내 카드가 켜져 있거나 시작 화면)에는 AX 코치 · 설정 안내 · 하루 질문 · 「사용 후기 남기기」를 숨깁니다
  (`<html data-presenting>` · `[data-hide-presenting]`). 「발표 가이드 종료」 뒤에는 그대로 돌아옵니다.

## 검사

`check_shinbo140`(위 순서 그대로 · 두 번 눌러도 하나 · 연결 확인 성공/실패 · 기존 화면 · 폰) ·
`supabase/test/anthropic_adapter_test.ts`(Claude SDK 헤더 · 본문 · 오류 분류, `deno test`) ·
`supabase/test/gemini_adapter_test.ts`(키 모양으로 고르기 · x-goog-api-key · JSON 모드 · 404 때 한 번만 안정 모델 · 오류 문구 · 키 가림) ·
`check_presenter139` · `check_ai_triage_ui` · `check_nav` · `ai_triage_e2e`.
여기서 AI 자리는 시험용 응답입니다 — 실제 호출은 위 「지금 AI 연결 확인」으로만 증명됩니다.
