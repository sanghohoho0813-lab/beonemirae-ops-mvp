# SQL Editor 붙여넣기용 묶음

`supabase/migrations/` 의 파일 11개를 **실행 순서 그대로** 3개로 묶은 것입니다.
내용은 원본과 같습니다 — 편의를 위해 이어 붙이기만 했습니다.

Supabase 대시보드 → SQL Editor 에서 아래 순서로 **각각 한 번씩** Run 합니다.

| 순서 | 파일 | 들어 있는 것 |
|---|---|---|
| 1 | `RUN_1_of_3.sql` | 0001 스키마 · 0002 RLS · 0003 함수 · 0004 권한 |
| 2 | `RUN_2_of_3.sql` | 0005 `user_role` 에 `client` 추가 |
| 3 | `RUN_3_of_3.sql` | 0006 포털 · 0007 무결성 · 0008~0010 · 0011 정산 |

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
