# Supabase 구축 — STEP 1 ~ 9

새 고객사 Supabase 를 처음부터 만드는 절차입니다.
**모든 AX 고객사 공통이라 그대로 반복하시면 됩니다.**

이 문서의 순서는 빈 데이터베이스에 실제로 `0001`~`0011` 을 적용해 보고 확정한 것입니다.
(결과: 테이블 18 / RLS 활성 18 / 정책 55 / 트리거 25 / 초기 데이터 0건)

---

## STEP 1. 고객사 명의로 계정·Organization 만들기

프로젝트는 **고객사 명의**로 만듭니다. 우리 계정에 만들면 나중에 이관이 번거롭고,
고객사가 결제 주체가 되지 못합니다.

1. 고객사 담당자 이메일로 https://supabase.com 가입
2. New organization — 이름은 고객사명, plan 은 **Free** 로 시작
3. Organization → Team → **개발자(우리) 계정을 초대**
   - 역할은 `Developer` 로 충분합니다 (`Owner` 는 고객사가 유지)

> Free plan 은 프로젝트가 **7일간 요청이 없으면 일시 정지**됩니다.
> 실사용 테스트가 시작되면 정지되지 않지만, 계약 후 테스트 시작까지 텀이 길면
> 주 1회 접속해 두거나 Pro 로 올리세요.

## STEP 2. 프로젝트 생성

1. New project
2. Name — 고객사 프로젝트명
3. Database Password — **강한 비밀번호 생성 후 고객사 비밀번호 관리도구에 보관.
   이 문서나 코드에 적지 않습니다.**
4. Region — **Northeast Asia (Seoul)**
5. 생성 완료까지 2~3분

## STEP 3. Data API 설정

Project Settings → API (또는 Data API)

| 설정 | 값 | 이유 |
|---|---|---|
| Exposed schemas | `public` | 앱은 `public` 만 씁니다 |
| **Expose new tables via Data API** | **끄기** | 새 테이블이 자동으로 API 에 열리지 않게 |
| Max rows | 기본값 | |

> "새 테이블 자동 노출"을 켜 두면 나중에 테이블을 추가했을 때
> RLS 를 붙이기 전에 API 에 먼저 열립니다. 꺼 두는 편이 안전합니다.

## STEP 4. 공개 가입 차단 (필수)

Authentication → Sign In / Providers → Email

- **Enable Sign Ups → 끄기**
- Confirm email → 상황에 맞게 (관리자가 `Auto Confirm` 으로 만들면 꺼도 됩니다)

이 제품은 SaaS 가입 화면이 아니라 **사내 업무 시스템**입니다.
계정은 관리자만 발급합니다.

> 확인: 끈 뒤 `/auth/v1/signup` 을 호출하면 `422 signup_disabled` 가 돌아옵니다.

## STEP 5. Migration 적용

SQL Editor 에서 **번호 순서대로** 실행합니다. 건너뛰면 안 됩니다.

```
supabase/migrations/
  0001_schema.sql          테이블 · 인덱스 · handle_new_user 트리거
  0002_rls.sql             RLS 활성화 + 정책
  0003_functions.sql       complete_collection / revert_collection 등
  0004_grants.sql          anon · authenticated 권한
  0005_client_role.sql     user_role 에 'client' 추가   ← 0006 과 반드시 분리
  0006_portal.sql          병원 포털 (client_requests · sales_leads 공유)
  0007_integrity.sql       추가 수거 허용 · 중복 저장 차단 · 재고 음수 방지
  0008_guard_message.sql   권한 거부 문구 정정
  0009_actor_stamp.sql     created_by / updated_by 자동 기록
  0010_request_handler.sql 병원 요청 처리자(handled_by) 자동 기록
  0011_billing.sql         거래처 계약·단가 · 규격별 자재 공급 · 거래처 문서함
```

주의할 점:

- `0005` 는 `ALTER TYPE ... ADD VALUE` 라 **같은 트랜잭션에서 사용할 수 없습니다.**
  그래서 `0006` 과 파일이 분리되어 있습니다. 합치지 마세요.
- `0001` 은 `auth.users` 를 참조합니다. 호스팅 Supabase 는 프로젝트 생성 시
  `auth` 스키마가 이미 있으므로 그대로 실행하면 됩니다.
- 실패하면 **원인을 고치고 그 파일만 다시** 실행합니다.
  스키마를 통째로 갈아엎지 마세요.

### 적용 후 확인

SQL Editor 에서:

```sql
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r')                        as 테이블,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity)   as rls활성,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') as 정책,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal)                   as 트리거;
```

기대값: **테이블 18 / rls활성 18 / 정책 55 / 트리거 25**

RLS 가 빠진 테이블이 없는지도 확인합니다 (결과가 0행이어야 합니다):

```sql
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
```

## STEP 6. 계정 발급

Authentication → Users → **Add user**

- `Auto Confirm User` 켜기
- User Metadata 에 역할을 적습니다:

```json
{"name": "홍길동", "role": "admin"}
{"name": "김사무", "role": "office"}
{"name": "박현장", "role": "field"}
{"name": "이간호", "role": "client", "client_id": "<clients 테이블의 병원 id>"}
```

지켜야 할 것:

1. **가장 먼저 만든 계정은 트리거가 자동으로 `admin` 이 됩니다.**
   고객사 대표/이사 계정을 **첫 번째로** 만드세요.
2. `client` 역할은 `client_id` 가 **반드시** 있어야 합니다.
   없으면 트리거가 `field` 로 낮춥니다 (소속 없는 병원 계정을 만들지 않기 위해).
   → 병원 계정은 STEP 8 에서 거래처를 등록한 **뒤에** 만드세요.
3. 비밀번호는 관리도구에 보관하고, 최초 로그인 후 변경을 안내합니다.

발급 후 확인:

```sql
select email, name, role, client_id, active from public.profiles order by role;
```

## STEP 7. 환경변수

Project Settings → API 에서 복사합니다.

| 변수 | 값 | 넣는 곳 |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | Vercel 환경변수 |
| `VITE_SUPABASE_ANON_KEY` | **anon / public** 키 | Vercel 환경변수 |

- **`service_role` 키는 프론트엔드에 절대 넣지 않습니다.** 번들에 들어가면
  RLS 가 통째로 무력화됩니다. 이 제품은 `anon` 키만으로 동작합니다.
- 로컬 개발은 `.env.local` 에 넣습니다 (`.gitignore` 에 이미 포함).
- 환경변수가 없으면 앱은 **시연 모드**로만 뜹니다. 가짜 연결을 만들지 않습니다.

## STEP 8. 초기 데이터

SQL 을 직접 쓰지 않고 **화면에서** 넣습니다.
관리자로 로그인하면 대시보드와 오늘 일정에 **「시작하기」 체크리스트**가 뜹니다.
네 가지가 끝나면 저절로 사라집니다.

| 순서 | 항목 | 화면 | 비고 |
|---|---|---|---|
| 1 | 운행 차량 등록 | 설정 → 운행 차량 | **차량이 없으면 수거 입력을 못 합니다** |
| 2 | 거래처 등록 | 거래처 → ＋ 추가 | 병원 계정을 쓸 거면 여기서 먼저 |
| 3 | 첫 수거 완료 입력 | 수거 입력 | 자동 연결이 도는지 확인 |
| 4 | 도입 전 기준값 입력 | 설정 → 도입 전 기준값 | AX 성과 비교 기준 |

추가로 권장:

- 설정 → **실증 시작일** 지정 (이 날짜부터가 성과 집계 대상)
- 자재 관리 → 사무실 재고 입고 (자재 동시공급을 쓸 경우)

> 폐기물 구분(의료폐기물·일회용기저귀)과 거래처 유형은 DB `CHECK` 제약으로
> 고정되어 있습니다. 고객사 업종이 다르면 [`04_CLIENT_SPECIFIC.md`](./04_CLIENT_SPECIFIC.md) 참고.

## STEP 9. 라이브 검증

계정을 전달하기 **전에** 반드시 돌립니다.

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_ANON_KEY="…"           # 공개 키
export SUPABASE_SERVICE_ROLE_KEY="…"   # 이 스크립트에서만. 끝나면 unset
export TEST_ADMIN_PW='…' TEST_OFFICE_PW='…' TEST_FIELD_PW='…' TEST_CLIENT_PW='…'

node supabase/test/05_live.mjs --setup     # 검증용 계정·데이터 준비
node supabase/test/05_live.mjs             # 63건 + YES/NO 표
node supabase/test/05_live.mjs --cleanup   # 검증용 데이터만 삭제
```

- 검증용 거래처·차량은 이름에 `[검증]` 접두사가 붙고 `--cleanup` 이 그것만 지웁니다.
- 사람이 직접 확인해야 하는 항목은 [`03_LIVE_TEST_CHECKLIST.md`](./03_LIVE_TEST_CHECKLIST.md).
- 끝나면 `unset SUPABASE_SERVICE_ROLE_KEY` 하거나 셸을 닫으세요.

---

## 자주 막히는 곳

| 증상 | 원인 | 해결 |
|---|---|---|
| 로그인 화면에 "서버 연결이 설정되지 않았습니다" | 환경변수 없음 | STEP 7 |
| 로그인은 되는데 화면이 비어 있음 | 초기 데이터 없음 | STEP 8 — 정상입니다 |
| 병원 계정이 `field` 로 생성됨 | `client_id` 누락 | STEP 6-2 |
| 수거 입력에서 저장 버튼이 안 눌림 | 차량 미등록 | STEP 8-1 |
| `type "user_role" already exists` | `0005` 를 먼저 실행함 | 번호 순서대로 |
| `relation "auth.users" does not exist` | `auth` 스키마 없음 | 호스팅 Supabase 에서는 발생하지 않음 |
| 첫 계정이 의도와 달리 admin 이 됨 | 트리거 사양 | 대표 계정을 첫 번째로 |
