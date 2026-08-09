# RUN_4 실행 → 최종 확인

지금 남은 것은 **SQL 한 번 붙여넣기**와 **재검증 한 번**입니다.
그 앞의 것은 전부 끝나 있습니다.

---

## 왜 이것 하나가 남았나

실제 운영 DB 에서 병원 계정 두 개로 서로를 찔러 보다 구멍을 하나 찾았습니다.

병원 계정이 **자기 `profiles.client_id` 를 다른 병원 것으로 바꿀 수 있었습니다.**
바꾸고 나면 RLS 는 "이 사람의 소속"을 기준으로 판단하므로, 그 순간부터 남의
병원 거래처·일정·자재·요청이 전부 열립니다. 거래처 하나를 통째로 넘겨다볼 수
있는 경로였습니다.

원인은 `0002_rls.sql` 의 `profiles_update_self` 가 `role` 과 `active` 는
고정하면서 `client_id` 는 빠뜨린 것입니다. `client_id` 는 `0006`(포털)에서
나중에 생긴 컬럼이라 그 목록에 못 들어갔습니다. 역할이 아니라 소속을 바꾸는
방식이라 「권한 상승 차단」 검사에도 걸리지 않았습니다.

확인 즉시 원래 값으로 되돌려 두었고, 지금 DB 는 정상 상태입니다.
고치는 SQL 은 정책 하나를 교체하는 40줄이며, DDL 이라 SQL Editor 에서만
실행할 수 있습니다.

---

## 1) SQL 실행 (1분)

Supabase 대시보드 → **SQL Editor** → `supabase/bundles/RUN_4_security_fix.sql`
내용을 붙여넣고 **Run**.

바뀌는 것은 `profiles_update_self` 정책 하나입니다.

- 본인이 바꿀 수 있는 것: **이름 · 글자크기**
- 본인이 못 바꾸는 것: `role` · `active` · `client_id` · `email` · `id`
- 관리자는 `profiles_admin_all` 로 그대로 다 바꿀 수 있습니다

앱이 본인 프로필을 고칠 때 실제로 보내는 값은 `name` 과 `font_scale` 둘뿐이라
(`src/context/AuthContext.tsx` 의 `updateProfile`), 이 변경으로 막히는 화면은
없습니다. 그래도 「본인 이름·글자크기는 그대로 수정 가능」 검사를 넣어 두었으니
재검증에서 함께 확인됩니다.

---

## 2) 재검증 (한 번에)

```bash
# 키는 셸에만 (끝나면 unset)
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_ANON_KEY="sb_publishable_…"
export SUPABASE_SERVICE_ROLE_KEY="sb_secret_…"
export TEST_ADMIN_PW='…' TEST_OFFICE_PW='…' TEST_FIELD_PW='…' \
       TEST_CLIENT_PW='…' TEST_CLIENT2_PW='…'

# 브라우저 검증(08)까지 하려면 미리 띄워 둡니다
npm run build && npx vite preview --port 4173 &

bash supabase/test/run_all.sh
```

마지막 줄이 이렇게 나오면 끝입니다.

```
  PASS   05 · 라이브 전반 (Auth · RLS · CRUD · 수거 · 감사 · Demo/Live)
  PASS   06 · 병원 간 격리 · 권한 상승 차단
  PASS   07 · 유상/무상 · 월 정산 · 거래명세서
  PASS   08 · 브라우저 종단 (PC 입력 → 모바일 조회)

READY FOR DIRECTOR/STAFF TEST: YES
```

`06` 안에서 **「병원A → 소속 병원 바꿔치기 차단」** 이 PASS 로 바뀌는지가
이번 SQL 의 확인 지점입니다. 지금은 그 한 줄만 FAIL 입니다.

---

## 3) 그다음 (원장님/직원 테스트가 끝난 뒤)

```bash
node supabase/test/05_live.mjs --cleanup     # '[검증]' 붙은 것만 삭제
```

- `[검증]` 접두사가 붙은 거래처·차량·일정·요청만 지웁니다. 실제 운영 데이터는
  건드리지 않습니다.
- 두 번째 검증 병원(`[검증]두번째검증병원`)과 `client2@` 계정도 이때 함께
  정리하면 됩니다.

### 키 회전

`sb_secret_…` (service role) 키는 **대시보드에서 한 번 회전(rotate)** 해 주세요.
작업 중 채팅으로 오간 값입니다. 앱 번들·`.env.local`·커밋 어디에도 들어가 있지
않은 것은 확인했지만, 노출된 키는 바꾸는 것이 원칙입니다.

회전 후에는 위 `export SUPABASE_SERVICE_ROLE_KEY` 만 새 값으로 바꾸면 됩니다.
앱은 publishable 키만 쓰므로 재배포가 필요 없습니다.

---

## 지금까지 확인된 것 (RUN_4 앞에서)

| 검증 | 결과 |
|---|---|
| `05_live.mjs` — Auth · RLS · CRUD · 수거 트랜잭션 · 감사 · 멀티세션 · Demo/Live | 66 / 0 |
| `06_cross_client.mjs` — 병원 간 격리 · 권한 상승 차단 | 14 / **1** |
| `07_settlement.mjs` — 유상/무상 · 월 정산 · 거래명세서 | 28 / 0 |
| `08_browser_live.mjs` — 브라우저 PC(1440) 입력 → 모바일(390) 조회 | 35 / 0 |

`06` 의 1건이 이 문서가 다루는 그 항목입니다.
