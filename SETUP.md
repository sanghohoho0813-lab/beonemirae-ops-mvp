# 실사용 전환 설정 가이드 (4단계)

이 문서는 비원미래 운영관리 MVP를 **실제 직원이 로그인해서 쓰는 업무 시스템**으로
띄우기 위해 필요한 외부 설정을 정리한 것입니다.

> 코드는 모두 구현되어 있지만, **Supabase 프로젝트는 아직 생성되어 있지 않습니다.**
> 아래 절차를 한 번 수행하면 실제 로그인·DB 저장·다중 기기 동기화가 동작합니다.
> 설정 전에는 앱이 기존과 동일하게 **시연 모드(브라우저 저장)** 로 동작합니다.

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

> 이 4개 파일은 로컬 Supabase(Postgres 17.6) 및 PostgreSQL 16 에서 **실제로 적용·검증**되었습니다.

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

### 테스트용 계정 구성 (권장)

| 역할 | 예시 이메일 | 확인할 것 |
|---|---|---|
| 대표 · 관리자 (`admin`) | daepyo@beonemirae.co.kr | 전체 메뉴 · 설정 · 감사로그 |
| 사무실 담당자 (`office`) | office@beonemirae.co.kr | 설정/감사로그 접근 차단 확인 |
| 현장 담당자 (`field`) | field@beonemirae.co.kr | 미수금·성과·통계 숨김 / 수거 입력 정상 |

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

```bash
# 로컬 Supabase 전체 스택 (Docker 필요)
npx supabase start
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -f supabase/test/01_verify.sql      # RLS·트랜잭션·감사로그 단언 65건
bash supabase/test/02_concurrency.sh  # 두 세션 동시 완료 방지 6건
```

`supabase/test/00_harness.sql` 은 Supabase 없이 순수 PostgreSQL 로 검증할 때만 씁니다
(실제 Supabase 프로젝트에는 적용하지 마세요 — auth 스키마가 이미 존재합니다).

---

## 7. 동작 확인 체크리스트

- [ ] 로그아웃 상태에서 `/` 접속 → 로그인 화면으로 이동
- [ ] 관리자 로그인 → 전체 메뉴 노출
- [ ] 새로고침 → 로그인 유지
- [ ] 현장 계정 로그인 → 미수금·통계·성과·설정 메뉴 안 보임
- [ ] 현장 계정으로 `/receivables` 직접 입력 → 접근 차단 화면
- [ ] 수거 입력 저장 → 오늘 일정 완료 · 수거이력 · 자재 차감 · 감사로그 동시 반영
- [ ] 같은 일정을 두 번 완료 시도 → `이미 완료 처리된 일정입니다` 차단
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
