# 실사용 전환 설정 가이드 (4단계)

이 문서는 비원미래 운영관리 MVP를 **실제 직원이 로그인해서 쓰는 업무 시스템**으로
띄우기 위해 필요한 외부 설정을 정리한 것입니다.

> 코드는 모두 구현되어 있지만, **Supabase 프로젝트는 아직 생성되어 있지 않습니다.**
> 아래 절차를 한 번 수행하면 실제 로그인·DB 저장·다중 기기 동기화가 동작합니다.
> 설정 전에는 앱이 기존과 동일하게 **시연 모드(브라우저 저장)** 로 동작합니다.

> **새 고객사를 구축하는 경우** 이 문서 대신
> [`docs/onboarding/`](./docs/onboarding/README.md) 를 보세요.
> 프로젝트 생성부터 계정 발급·검증까지 STEP 1~9 로 정리되어 있고,
> 고객사별로 복사해서 쓰는 프로필·체크리스트 양식이 함께 있습니다.
> 이 문서는 비원미래 기준 상세 설명으로 남겨 둡니다.

---

## 1. Supabase 프로젝트 생성

1. https://supabase.com 에서 프로젝트를 만듭니다. (Region: `Northeast Asia (Seoul)` 권장)
2. 생성 후 **Project Settings → API** 에서 아래 두 값을 복사합니다.
   - `Project URL`
   - `anon` `public` key

> ⚠️ `service_role` 키는 **절대** 프론트엔드나 저장소에 넣지 않습니다.
> 이 앱은 anon key 만 사용하며, 데이터 보호는 RLS 가 담당합니다.

---

## 2. 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 만듭니다. (`.gitignore` 에 이미 포함되어 있어야 합니다)

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

배포 환경(Vercel / Netlify 등)에서는 같은 이름으로 환경변수를 등록합니다.

설정 후 개발 서버를 재시작하면 로그인 화면이 활성화됩니다.

---

## 3. 스키마 적용

Supabase 대시보드 → **SQL Editor** 에서 아래 순서대로 실행합니다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | 테이블 · 인덱스 · 트리거 |
| 2 | `supabase/migrations/0002_rls.sql` | Row Level Security 정책 |
| 3 | `supabase/migrations/0003_functions.sql` | 수거 완료 트랜잭션 · 취소 · 시연 초기화 |
| 4 | `supabase/migrations/0004_grants.sql` | PostgREST 롤 권한 |
| 5 | `supabase/migrations/0005_client_role.sql` | 병원 고객 역할(`client`) 추가 |
| 6 | `supabase/migrations/0006_portal.sql` | 병원 요청 테이블 · 포털 RLS · 제안 응답 함수 |
| 7 | `supabase/migrations/0007_integrity.sql` | 중복 수거 차단(추가 수거는 허용) · 재고 음수 차단 |
| 8 | `supabase/migrations/0008_guard_message.sql` | 병원 계정 권한 거부 문구 정정 |
| 9 | `supabase/migrations/0009_actor_stamp.sql` | `created_by` / `updated_by` 자동 기록 |
| 10 | `supabase/migrations/0010_request_handler.sql` | 병원 요청 처리자(`handled_by`) 자동 기록 |
| 11 | `supabase/migrations/0011_billing.sql` | 거래처 계약·단가 · 규격별 자재 공급 · 거래처 문서함 |

> **0005 와 0006 은 반드시 따로 실행해야 합니다.** Postgres 는 `ALTER TYPE ... ADD VALUE`
> 로 추가한 enum 값을 같은 트랜잭션에서 쓸 수 없어, 값 추가와 이를 쓰는 정책을 분리했습니다.

> 이 파일들은 PostgreSQL 16 + GoTrue + PostgREST 로 구성한 실제 Supabase 스택에서
> **빈 데이터베이스에 0001~0010 을 순서대로 적용해 검증**했습니다.
> (결과: 테이블 18 · RLS 활성 18 · 정책 55 · 초기 데이터 0건)

Supabase CLI를 쓰는 경우:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

---

## 4. 공개 가입 차단

**Authentication → Providers → Email** 에서

- `Enable Email provider` : **켬**
- `Allow new users to sign up` : **끔** ← 반드시 꺼야 외부인 가입이 막힙니다
- `Confirm email` : 운영 정책에 따라 선택 (끄면 관리자가 만든 계정으로 바로 로그인 가능)

---

## 5. 계정 생성

**Authentication → Users → Add user** 로 계정을 만듭니다.
비밀번호는 Supabase 가 해시로 보관하며, 이 앱의 DB(`profiles`)에는 저장되지 않습니다.

계정을 만들면 `profiles` 행이 자동 생성됩니다.

- **맨 처음 만든 계정은 자동으로 `admin`** 이 됩니다.
- 이후 계정은 기본 `field`(현장 담당자)로 생성되며,
  관리자가 앱의 **설정 → 사용자 계정** 에서 역할을 바꿉니다.

계정 생성 시 `User Metadata` 에 아래를 넣으면 이름·역할이 처음부터 지정됩니다.

```json
{ "name": "홍길동", "role": "field" }
```

### 병원 담당자 계정 (`client`)

병원 계정은 **소속 거래처가 반드시 있어야** 만들어집니다. 먼저 앱에서 해당 병원을
거래처로 등록한 뒤, `clients.id` 를 확인해 아래처럼 초대합니다.

```sql
-- 거래처 id 확인
select id, name from public.clients where name = '의료법인한양의료재단';
```

```json
{ "name": "감염관리팀 김주현", "role": "client", "client_id": "위에서 확인한 uuid" }
```

- `client_id` 없이 `role: "client"` 로 초대하면 **병원 계정이 만들어지지 않고** 안전하게
  `field` 로 떨어집니다 (소속 병원을 모르는 병원 계정을 금지).
- 병원 계정은 로그인하면 `/portal` 로만 들어가며, 비원미래 내부 화면은 화면·DB 양쪽에서
  차단됩니다. 자기 병원의 거래처 정보 · 수거일정 · 자재공급 · 자기 요청 · **자기에게
  공유된 제안** 만 조회할 수 있습니다.
- 미수금·차량·감사로그·다른 병원 데이터에는 RLS 정책 자체가 없어 접근이 불가능합니다.

### 테스트용 계정 구성 (권장)

| 역할 | 예시 이메일 | 확인할 것 |
|---|---|---|
| 대표 · 관리자 (`admin`) | daepyo@beonemirae.co.kr | 전체 메뉴 · 설정 · 감사로그 |
| 사무실 담당자 (`office`) | office@beonemirae.co.kr | 설정/감사로그 접근 차단 확인 |
| 현장 담당자 (`field`) | field@beonemirae.co.kr | 미수금·성과·통계 숨김 / 수거 입력 정상 |
| 병원 담당자 (`client`) | manager@hanyang-test.kr | 포털만 보임 · 자기 병원 데이터만 조회 |

> 비밀번호는 코드나 문서에 적지 않습니다. 계정 생성 시 대표님이 직접 정하고,
> 첫 로그인 후 각자 변경하도록 안내해 주세요.

---

## 6. 초기 데이터 넣기

두 가지 방법이 있습니다.

**(A) 앱에서 직접 등록** — 거래처 화면에서 실제 거래처를 추가합니다. (권장)

**(B) 브라우저 데이터 가져오기** — 기존에 이 브라우저에서 쓰던 데이터를 올립니다.
관리자로 로그인 → **설정 → 브라우저 데이터 가져오기** →
`현재 브라우저 데이터 확인하기` 로 건수를 확인한 뒤 실행합니다.

- 시연용으로 생성된 거래처와 시연 세션 기록은 **올라가지 않습니다.**
- 이름+주소가 같은 거래처는 중복 생성하지 않고 기존 것에 연결합니다.
- 서버가 새 id 를 발급하므로 id 충돌이 없습니다.

차량(`vehicles`)은 초기 데이터가 없으므로 SQL Editor 에서 한 번 넣어 주세요.

```sql
insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver) values
  ('의료폐기물 1호', '의료폐기물', 1.0, 1000, 800, '기사명'),
  ('기저귀 1호',   '일회용기저귀', 2.5, 2500, 2000, '기사명');
```

---

## 6-1. 검증 스크립트 (선택)

저장소에 실제 DB 검증 스크립트가 포함되어 있습니다. 로컬에서 다시 확인하려면:

**A. 실제 Supabase 프로젝트에서 (권장)**

```bash
npx supabase start                    # 또는 실제 프로젝트의 DB_URL
psql "$DB_URL" -f supabase/test/01_verify.sql   # RLS·트랜잭션·감사로그 66건
psql "$DB_URL" -f supabase/test/03_portal.sql   # 병원 포털 RLS 27건
PGDATABASE=... bash supabase/test/02_concurrency.sh  # 동시 완료 방지 6건
```

**B. Docker 없이 순수 PostgreSQL 로 (스키마·RLS·트랜잭션만 확인)**

Supabase 를 띄울 수 없는 환경에서는 `00_harness.sql` 이 `auth.uid()` / `auth.role()` 을
흉내 내 같은 단언을 그대로 돌릴 수 있습니다. 로그인(GoTrue)과 PostgREST 는 빠지므로
**DB 계층만** 검증되는 점을 기억하세요.

```bash
createdb rlsqa
psql -d rlsqa -f supabase/test/00_harness.sql
for f in supabase/migrations/0*.sql; do psql -v ON_ERROR_STOP=1 -d rlsqa -f "$f"; done
psql -d rlsqa -f supabase/test/01_verify.sql
psql -d rlsqa -f supabase/test/03_portal.sql
```

> `00_harness.sql` 은 순수 PostgreSQL 검증 전용입니다.
> **실제 Supabase 프로젝트에는 적용하지 마세요** — auth 스키마가 이미 존재합니다.

---

## 6-2. 라이브 검증 (실제 프로젝트에서 한 번에 확인)

위 SQL 검증은 DB 안에서 세션을 흉내 내 확인합니다.
`supabase/test/05_live.mjs` 는 그 바깥, **앱이 실제로 통신하는 경로**를 확인합니다.

- 로그인 → GoTrue (`/auth/v1/token`, refresh 포함)
- 데이터 접근 → PostgREST (`/rest/v1/…`) + 실제 발급된 JWT
- 권한 → 메뉴 숨김이 아니라 **서버 응답 코드**로 차단되는지
- 수거 완료 → `complete_collection` 결과가 DB 에 전부 남는지
- 두 세션 동기화 · demo/live 분리

### 실행

```bash
# 1) 키는 셸에만 넣습니다 (파일로 저장하거나 커밋하지 마세요)
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJ..."            # 프론트와 같은 공개 키
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."    # 이 스크립트에서만 사용
export TEST_ADMIN_PW='…' TEST_OFFICE_PW='…' TEST_FIELD_PW='…' TEST_CLIENT_PW='…'

# 2) 검증용 계정·데이터 준비 (이미 있으면 건너뜁니다)
node supabase/test/05_live.mjs --setup

# 3) 검증  — 마지막에 YES/NO 표가 출력됩니다
node supabase/test/05_live.mjs

# 4) 검증용 데이터 정리
node supabase/test/05_live.mjs --cleanup
```

`SERVICE_ROLE` 키는 계정 생성과 "DB 에 실제로 남았는지" 확인에만 씁니다.
**프론트엔드 번들에는 들어가지 않습니다.** 검증이 끝나면 셸을 닫거나 `unset` 하세요.

검증용으로 만든 거래처·차량은 이름에 `[검증]` 접두사가 붙고 `--cleanup` 이 그것만
지우므로 실제 운영 데이터와 섞이지 않습니다.

> `--cleanup` 은 병원 계정의 소속 병원을 지우면서 역할을 `field` 로 되돌립니다.
> (`profiles` 에 "병원 계정은 소속 병원이 있어야 한다"는 제약이 있기 때문입니다)
> 다시 `--setup` 을 실행하면 원래대로 돌아옵니다.

---

## 6-3. 나머지 세 가지 검증

`05_live.mjs` 가 확인하지 못하는 부분이 셋 있었습니다. 각각 따로 둡니다.

| 스크립트 | 확인하는 것 | 왜 따로인가 |
|---|---|---|
| `06_cross_client.mjs` | 병원 A 가 병원 B 의 데이터를 못 보는가 | 병원이 하나뿐이면 교차 접근을 시험할 수 없습니다 |
| `07_settlement.mjs` | 유상/무상 구분 · 월 정산 · 거래명세서 | 한 번 입력한 것이 재입력 없이 정산까지 가는지 |
| `08_browser_live.mjs` | 브라우저에서 PC 입력 → 모바일 조회 | API 가 아니라 사람이 쓰는 경로 |
| `09_rls_matrix.mjs` | 18개 테이블 × 4역할 × 4조작 전수 | 정책 목록에서 하나 빠진 것은 눈으로 안 보입니다 |
| `10_integrity.mjs` | 동시 저장 · 값 검증 · 되돌리기 | 두 사람이 같은 순간에 누를 때가 사고 지점입니다 |
| `11_auth_boundary.mjs` | 공개 가입 · 토큰 위조 · 로그아웃 | 로그인이 되는지가 아니라 **안 되어야 할 때 안 되는지** |
| `12_settlement_edges.mjs` | 월 경계 · 규격 미상 · 단가 없음 | 월 마감 금액은 보통이 아닌 곳에서 틀립니다 |
| `13_multisession_audit.mjs` | 동시 수정 · 감사기록 | 두 사람이 같은 거래처를 고칠 때 값이 조용히 사라지는지 |

```bash
# 병원 간 격리 — 두 번째 검증 병원·계정을 만들고 서로를 찔러 봅니다
export TEST_CLIENT2_PW='…'
node supabase/test/06_cross_client.mjs

# 유상/무상 · 월 정산 (Node 22 이상 — src/lib/billing.ts 를 그대로 읽습니다)
node --experimental-strip-types supabase/test/07_settlement.mjs

# 브라우저 종단 검증 — 미리 빌드하고 preview 를 띄워 둡니다
npm run build && npx vite preview --port 4173 &
node supabase/test/08_browser_live.mjs

# 역할별 권한 전수 점검
node supabase/test/09_rls_matrix.mjs

# 동시 저장 · 무결성
node supabase/test/10_integrity.mjs

# Auth 경계
node supabase/test/11_auth_boundary.mjs

# 정산 경계값
node --experimental-strip-types supabase/test/12_settlement_edges.mjs

# 멀티세션 동시 수정 · 감사기록 (preview 필요)
node supabase/test/13_multisession_audit.mjs

# 위 전부를 한 번에 (05~09) + READY 판정
bash supabase/test/run_all.sh
```

`09` 는 18개 테이블 각각에 대해 네 역할이 읽기·넣기·수정·지우기를 실제로
시도하고, migration 을 읽어 옮긴 의도 표와 대조합니다. 판정은 응답 코드가
아니라 **DB 에 실제로 무엇이 남았는지**로 합니다 — SELECT 는 RLS 에 걸려도
200 + 빈 배열이고, 수정은 0건이어도 204 라서 응답만 보면 없는 안전을 있다고
착각하게 됩니다. 넣고 지우는 시도는 이 검사가 만든 임시 행에만 하고, 끝나면
계정 정보가 시작 때와 같은지 대조해 다르면 되돌립니다.

`07` 은 화면이 쓰는 계산 함수(`src/lib/billing.ts`)를 그대로 불러 씁니다.
검증용으로 바꾼 단가·결제조건은 끝나기 전에 원래 값으로 되돌립니다.

`08` 은 `.env.local` 에 실제 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 가
있어야 합니다. 없으면 앱이 시연 모드로 떠서 로그인 화면이 나오지 않습니다.
Playwright 경로가 다르면 `PLAYWRIGHT_MODULE` · `CHROMIUM_PATH` 로 지정합니다.
방화벽이 Chromium 의 TLS 1.3 을 끊는 망에서는 `CHROMIUM_TLS12=1` 을 붙입니다
(인증서 검증은 그대로 켜 둔 채 버전만 낮춥니다).

---

## 7. 동작 확인 체크리스트

- [ ] 로그아웃 상태에서 `/` 접속 → 로그인 화면으로 이동
- [ ] 관리자 로그인 → 전체 메뉴 노출
- [ ] 새로고침 → 로그인 유지
- [ ] 현장 계정 로그인 → 미수금·통계·성과·설정 메뉴 안 보임
- [ ] 현장 계정으로 `/receivables` 직접 입력 → 접근 차단 화면
- [ ] 수거 입력 저장 → 오늘 일정 완료 · 수거이력 · 자재 차감 · 감사로그 동시 반영
- [ ] 같은 일정을 두 번 완료 시도 → `이미 완료 처리된 일정입니다` 차단
- [ ] 같은 거래처를 같은 날 다시 직접 입력 → `이미 저장되어 있습니다 … 추가 수거로 저장해 주세요` 안내
- [ ] 같은 건을 `추가 수거`로 표시하고 저장 → 정상 저장 (같은 날 재방문은 실제 업무)
- [ ] 저장 중에 버튼을 다시 눌러도 두 번 저장되지 않음
- [ ] 다른 브라우저에서 로그인 → 같은 데이터 확인
- [ ] 관리자 → 감사로그에 작업자 이름·역할·시간 기록 확인

---

## 8. 보안 점검

| 항목 | 상태 |
|---|---|
| anon key 만 프론트엔드 사용 | ✅ `src/lib/supabase.ts` |
| service_role key 프론트엔드 미사용 | ✅ 코드에 존재하지 않음 |
| RLS 전 테이블 활성화 | ✅ `0002_rls.sql` |
| 비밀번호 직접 저장 안 함 | ✅ `auth.users` 만 보관 |
| 감사로그 수정·삭제 불가 | ✅ update/delete 정책 없음 |
| 환경변수 분리 | ✅ `.env.local` (커밋 금지) |

수집하는 개인정보는 **직원 이메일·이름**, **거래처 담당자명·연락처**뿐입니다.
환자 정보나 그 밖의 민감정보는 저장하지 않습니다.

---

## 9. 시연 모드와 실제 운영의 분리

| | 시연 모드 | 실제 운영 |
|---|---|---|
| 저장 위치 | 이 브라우저(localStorage) | Supabase |
| 진입 조건 | 로그아웃 상태 / 환경변수 미설정 | 로그인 상태 |
| 시연 초기화 | 사용 가능 | **차단** |
| 전체 초기화 · 거래처 세트 전환 | 사용 가능 | **차단** |
| 데이터 혼합 | 없음 — 서로 다른 저장소라 섞이지 않음 | |

실제 운영 중에는 시연용 버튼이 화면에서 사라지고, 코드 레벨에서도 동작하지
않습니다(`DataContext` 의 `live` 가드). 서버 측에서도 `reset_demo_records()` 는
`demo_session_id` 가 있는 행만 지우며, 실제 운영 데이터(`demo_session_id is null`)는
어떤 경우에도 삭제되지 않습니다.
