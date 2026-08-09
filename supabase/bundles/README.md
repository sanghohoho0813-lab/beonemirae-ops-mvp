# SQL Editor 붙여넣기용 묶음

`supabase/migrations/` 의 파일들을 **실행 순서 그대로** 묶은 것입니다.
내용은 원본과 같습니다 — 편의를 위해 이어 붙이기만 했습니다.

Supabase 대시보드 → SQL Editor 에서 아래 순서로 **각각 한 번씩** Run 합니다.

| 순서 | 파일 | 들어 있는 것 |
|---|---|---|
| 1 | `RUN_1_of_3.sql` | 0001 스키마 · 0002 RLS · 0003 함수 · 0004 권한 |
| 2 | `RUN_2_of_3.sql` | 0005 `user_role` 에 `client` 추가 |
| 3 | `RUN_3_of_3.sql` | 0006 포털 · 0007 무결성 · 0008~0010 · 0011 정산 |
| 4 | `RUN_4_security_fix.sql` | 0012 본인 프로필 소속(client_id) 변경 차단 |
| 5 | `RUN_5_supply_guard.sql` | 0013 공급 수량 음수 차단 — 없던 재고가 생기는 구멍 |
| 6 | `RUN_6_request_handler.sql` | 0014 회신만 남겼을 때도 처리자 기록 |

### 4번은 왜 따로인가 — 실제 운영 DB 에서 찾은 구멍입니다

병원 계정이 자기 `profiles.client_id` 를 **다른 병원 것으로 바꿔** 그 병원의
거래처·일정·요청을 통째로 열어 볼 수 있었습니다. 실제 계정 두 개로 교차 접근을
시도해 확인했고, 확인 직후 원래 값으로 되돌려 두었습니다.

0002 의 정책이 `role` 과 `active` 는 고정하고 있었지만, `client_id` 는 0006 에서
나중에 생긴 컬럼이라 그 목록에 빠져 있었습니다. 역할이 아니라 소속을 바꾸는
방식이라 「권한 상승 차단」 검사에도 걸리지 않았습니다.

4번을 Run 하면 막힙니다. 확인:

```
node supabase/test/06_cross_client.mjs   # 「소속 병원 바꿔치기 차단」 이 PASS 로
bash supabase/test/run_all.sh            # 05~08 전체 + READY 판정
```

실행 절차와 그 뒤에 할 일은
[`docs/onboarding/07_RUN4_SECURITY_FIX.md`](../../docs/onboarding/07_RUN4_SECURITY_FIX.md)
에 정리해 두었습니다.

**2번을 따로 두는 이유**: `ALTER TYPE ... ADD VALUE` 는 같은 트랜잭션 안에서
그 값을 쓸 수 없습니다. 2번을 먼저 커밋해야 3번이 `client` 역할을 참조할 수 있습니다.
셋을 합치거나 순서를 바꾸면 실패합니다.

## 실행 후 확인

```sql
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r')                          as 테이블,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity)     as rls활성,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') as 정책,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal)                     as 트리거;
```

기대값 **테이블 18 / rls활성 18 / 정책 55 / 트리거 25**.
숫자가 다르면 어느 단계에서 멈췄는지 알 수 있습니다.


---

## 5번 — 공급 수량 음수 차단 (0013)

동시성·무결성 검사를 돌리다 찾았습니다. `complete_collection` 은 "공급이
있었는가"를 네 수량의 **합**으로 판단합니다. 그래서 음수를 섞으면 합은 양수인데
개별 값은 음수인 상태가 통과합니다.

```
supplied = { corrugatedBox: -3, plasticContainer: 10 }
  → 합계 7 > 0 이므로 "공급 있음"
  → 재고 차감식이  corrugated_box - (-3)  이 되어 골판지가 3개 늘어남
  → 원장은 qty > 0 만 기록하므로 그 3개는 어디에도 안 남음
```

실측했습니다. 골판지 200 → **203**, `materials.box_count = -3`, 원장에는 골판지
항목 없음. 창고에 없던 물건이 장부에 생기고, 재고와 원장이 어긋난 채 굳습니다.

화면(QtyField)은 0 미만을 만들 수 없지만, 토큰만 있으면 화면을 거치지 않고
바로 보낼 수 있습니다. DB 함수가 최종 방어선인데 그것이 비어 있었습니다.

확인:

```
node supabase/test/10_integrity.mjs   # 「공급 수량 음수 거부」 3건이 PASS 로
bash supabase/test/run_all.sh         # 05~10 전체 + READY 판정
```


---

## 6번 — 회신만 남겼을 때도 처리자 기록 (0014)

포털 왕복(병원 요청 → 사무실 회신 → 병원 확인)을 실제 화면으로 밟다 찾았습니다.

사무실이 상태를 그대로 두고 **회신만 남기면 `handled_by`·`handled_at` 이 비어
있습니다.** 상태까지 함께 바꾸면 기록됩니다.

```
접수 상태에서 회신만   →  handled_by 비어 있음   ← 문제
상태를 '확인 중'으로   →  handled_by 기록됨
```

0010 이 "상태를 '접수'로 되돌리는 것은 처리 취소이므로 기록하지 않는다"는 뜻으로
`if new.status = '접수' then return new;` 라고 썼는데, 이 조건이 **"원래 접수였고
앞으로도 접수인" 정상 경로까지** 함께 걸러 냅니다. 사무실이 상태를 옮기기 전에
답부터 적는 것은 흔한 순서이고 그것도 처리입니다.

병원과 주고받은 기록은 실사 자료로 씁니다. "누가 답했는지 모르는 회신"이 남으면
그 자료의 값이 떨어집니다.

확인:

```
node supabase/test/14_portal_flow.mjs   # 「처리한 사람이 자동으로 기록됨」 이 PASS 로
```
