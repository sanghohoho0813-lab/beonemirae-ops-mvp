# ai-triage 배포 절차 — 대표님 실행

AI 12자리 중 첫 연결 「요청 읽고 정리하기」의 서버 함수입니다.
**아직 배포 전이며, 배포 전까지 화면 어디에도 "AI 연결됨"으로 표시되지 않습니다.**

## 왜 서버 함수인가
API 키를 브라우저에 두면 화면을 여는 누구나 키를 볼 수 있습니다.
키는 Supabase 서버에만 두고, 브라우저는 이 함수를 부릅니다.

## 배포 (PC 에서 5분)

```bash
# 1) Supabase CLI 로그인 + 프로젝트 연결 (최초 1회)
supabase login
supabase link --project-ref <프로젝트 ref>

# 2) 함수 폴더로 복사 (proposals 는 제안 보관소라 배포 대상이 아닙니다)
mkdir -p supabase/functions/ai-triage
cp supabase/proposals/edge_ai_triage/index.ts supabase/functions/ai-triage/index.ts

# 3) 키 설정 — OpenAI 에서 발급 (platform.openai.com)
supabase secrets set AI_API_KEY=sk-...

# 4) 배포
supabase functions deploy ai-triage
```

## 시험 (배포 직후)

```bash
curl -s -X POST "https://<프로젝트>.supabase.co/functions/v1/ai-triage" \
  -H "Authorization: Bearer <직원 계정의 access token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"3층 창고가 거의 다 찼습니다. 이번 주 안에 한 번 더 와주실 수 있나요?"}'
```

기대 응답: `{"kind":"추가수거","urgency":"이번 주","draft":"...","basis":"...","model":"..."}`

## 비용·한도
- 기본 모델은 환경변수 `AI_MODEL` 로 바꿀 수 있습니다.
- 요청 글 4,000자 제한 — 한 번 호출에 수십 원 수준이나, **정확한 단가는
  OpenAI 요금표에서 확인하세요. 여기 적으면 바뀔 때마다 틀립니다.**

## 이 함수가 하지 않는 것
- 회신 자동 발송 ✗ (초안만 반환, 저장도 안 함)
- 요청 상태 변경 ✗ (DB 쓰기 없음)
- 병원 계정 사용 ✗ (내부 담당자 role 만)
- 날짜·금액 약속 ✗ (프롬프트 금지 + 응답 검사 이중 차단)

## 배포 후 다음 단계 (개발 쪽)
배포되면 알려 주세요 — 고객 요청 화면의 「AI 요청 정리」가 실제로 이 함수를
부르고 초안을 담당자에게 보여 주는 화면 연결(1일 작업)을 진행합니다.
그 전까지 화면은 지금대로 「아직 켜지지 않은 기능입니다」를 유지합니다.
