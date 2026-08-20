-- ═══════════════════════════════════════════════════════════════════════════
--  0064 — 병원에게 매입원가를, 현장에게 동료 개인정보를 닫습니다
--
--  ✅ **2026-08-20 운영 DB 에 적용 완료.** (대표님이 SQL Editor 에서 실행)
--     적용 뒤 실제 토큰으로 확인했습니다 —
--       병원 · products.cost_price  → HTTP 403
--       현장 · staff.insured_from   → HTTP 403
--       병원 · 상품 목록(원가 빼고) → 정상
--       현장 · 직원 이름·담당        → 정상
--
--  ⚠ 이 파일은 처음에 supabase/proposals/ 에 있었습니다. 운영에 적용한 뒤
--     migrations/ 로 옮겼습니다 — **여기 없으면 새 환경을 만들거나 복원할 때
--     이 수정이 통째로 빠집니다.** 그러면 새로 세운 DB 에서는 병원이 다시
--     원가를 봅니다.
--
--  ── 왜 필요한가 ──────────────────────────────────────────────────────────
--
--   ① 병원 계정이 상품의 **매입원가(products.cost_price)** 를 읽습니다.
--      실제 토큰으로 확인했습니다 — 지금은 매입가가 0원이라 무해하지만,
--      대표님이 파일럿용 매입가를 넣는 **바로 그 순간** 병원이 우리 마진을
--      봅니다. 「9,000원에 파는데 5,200원에 사 오는구나」가 보입니다.
--
--      0063 이 거래처 돈 칸을 닫은 것과 같은 문제인데, 상품은 병원도
--      **목록을 봐야** 해서 표 전체를 닫을 수 없습니다. 칸만 닫습니다.
--
--   ② 현장 직원이 **동료 전원의 4대보험 자격취득일**을 읽습니다.
--      (staff.insured_from · staff.insurance)
--      업무에 필요 없는 개인정보입니다. 이름·담당은 그대로 두고 이 둘만 닫습니다.
--
--  ── 기존 데이터에 미치는 영향 ────────────────────────────────────────────
--
--   **없습니다.** 값을 지우거나 바꾸지 않습니다. 누가 읽을 수 있는지만
--   바꿉니다 (권한 변경 · 데이터 변경 아님).
--
--  ── 실행 후 얻는 것 ──────────────────────────────────────────────────────
--
--   · 병원 계정 → 상품 목록·판매가는 그대로 보이고, 매입원가만 안 보입니다
--   · 현장 계정 → 동료 이름·담당은 그대로 보이고, 보험 칸만 안 보입니다
--   · 사무실·관리자 → 아래 새 함수로 예전과 똑같이 봅니다
--
--  ── 실행 순서 ⚠ 이 순서를 지켜 주세요 ────────────────────────────────────
--
--   처음에 제가 「SQL 먼저, 앱 나중」이라고 적었는데 **틀렸습니다.**
--   그러면 SQL 을 돌린 순간부터 앱 재배포 전까지 사무실 소모품 화면의
--   원가·이익 칸이 빈 채로 보입니다. 반대로 앱을 먼저 배포하면 아직 없는
--   함수를 부릅니다. 어느 쪽이든 틈이 생깁니다.
--
--   ⚠⚠ 그리고 이건 「칸이 비어 보인다」 정도가 아닙니다. 확인해 보니 앱은
--      지금 이렇게 읽습니다.
--
--          products.select('*')
--          staff.select('*').order('insured_from')
--
--      별표(*)는 「있는 칸 전부」입니다. 아래에서 칸 권한을 거두는 순간 이
--      요청이 **permission denied(403) 로 통째로 거절**됩니다. 소모품 화면과
--      직원 명부가 **빈 화면이 아니라 오류**가 됩니다.
--      staff 는 하나 더 — `order('insured_from')`. 권한을 거둔 칸으로
--      정렬하는 것만으로도 요청이 거절됩니다.
--      (0063 때 거래처에서 똑같은 함정을 만났습니다. 그래서 여기 적어 둡니다)
--
--   그래서 **앱이 두 상태를 모두 견디게 먼저 고친 뒤**에 SQL 을 돌립니다.
--
--   1. (제가) 앱을 이렇게 고칩니다 — **세 가지 다** 해야 합니다.
--      · products / staff 를 별표 대신 **칸 이름을 적어** 읽기
--        (그래야 칸 권한을 거둬도 403 이 안 납니다)
--      · staff 정렬을 insured_from → name 으로
--      · 원가는 product_costs() 로 읽되, **함수가 없으면 조용히 예전
--        방식으로** (client_billing_terms 와 같은 방식)
--      이러면 SQL 전에도 후에도 화면이 멀쩡합니다.
--   2. 앱 배포 → 화면이 그대로인지 확인
--   3. 이 파일을 SQL Editor 에 붙여넣고 Run
--   4. CHECK_PILOT_SAFETY.sql 을 다시 돌려 ⑥⑦ 이 「통과」인지 확인
--   5. (제가) 앱의 EXPECTED_SCHEMA_VERSION 을 64 로 올리고 배포
--
--   ⚠ 1·5 번은 **아직 안 했습니다.** 승인해 주시면 그때 하겠습니다.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① 상품 매입원가 ────────────────────────────────────────────────────────
--
--   ⚠ PostgreSQL 은 **표 단위 권한이 남아 있으면 칸 단위 권한을 무시합니다.**
--     그래서 표 권한을 먼저 거두고 칸을 하나씩 열어 줍니다 (0063 과 같은 순서).
--     여기서 순서를 바꾸면 아무 효과가 없는데 「닫았다」고 착각하게 됩니다.
revoke select on public.products from authenticated;

grant select (
  id, name, spec, unit, sale_price,
  stock_key, available, image_url, description, active, category, sort,
  created_at, updated_at
) on public.products to authenticated;
--  ↑ cost_price 가 **빠져 있습니다.** 이것이 이 migration 의 전부입니다.

--   사무실·관리자는 원가를 봐야 합니다 (이익 계산·상품 등록).
--   칸 권한은 역할을 못 가리므로(모두 authenticated), 함수로 돌려줍니다.
create or replace function public.product_costs()
returns table (id uuid, cost_price integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.cost_price
    from public.products p
   where public.is_staff()      -- 사무실·관리자만. 현장·병원은 빈 결과입니다
$$;

comment on function public.product_costs() is
  '상품 매입원가 (0064). 사무실·관리자만. 병원·현장은 빈 결과 — 오류가 아니라 빈 값입니다.';

revoke all on function public.product_costs() from public;
grant execute on function public.product_costs() to authenticated;

-- ── ② 직원 개인정보 (4대보험) ──────────────────────────────────────────────
revoke select on public.staff from authenticated;

grant select (
  id, name, position, waste_scope, profile_id, active, note,
  created_at, updated_at
) on public.staff to authenticated;
--  ↑ insured_from · insurance 가 **빠져 있습니다.**

create or replace function public.staff_hr()
returns table (id uuid, name text, insured_from date, insurance jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.insured_from, s.insurance
    from public.staff s
   where public.is_admin()      -- 관리자만
$$;

comment on function public.staff_hr() is
  '직원 4대보험 자격취득일 (0064). 관리자만. 다른 역할은 빈 결과입니다.';

revoke all on function public.staff_hr() from public;
grant execute on function public.staff_hr() to authenticated;

-- ── ③ 판(schema) 번호 올리기 ───────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer
language sql
immutable
as $$ select 64 $$;

-- ── ④ 바로 확인 ────────────────────────────────────────────────────────────
--   실행 직후 이 두 줄이 **빈 값**이어야 합니다.
select column_name as "아직 열려 있는 원가 칸"
  from information_schema.column_privileges
 where table_schema='public' and table_name='products'
   and column_name='cost_price' and grantee='authenticated' and privilege_type='SELECT';

select column_name as "아직 열려 있는 보험 칸"
  from information_schema.column_privileges
 where table_schema='public' and table_name='staff'
   and column_name in ('insured_from','insurance')
   and grantee='authenticated' and privilege_type='SELECT';
