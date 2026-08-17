-- 비원미래 운영 DB — 46차 (0060)
-- 배출자 교육일을 실제로 적을 자리. RUN_1~45 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0060_education_date.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();   → 60
--              select public.app_health_check();      → ok: true
--
-- ────────────────────────────────────────────────────────────────────────────
-- 왜 필요한가 — 앱이 교육 이력을 **지어내고 있었습니다**
--
--   화면:  「배출자 교육 제안 · 예상 +15만원」
--          「교육 이력 23개월 경과 — 법정 주기(2년) 도래 임박」
--
--   실제:  거래처 id 를 해시해서 만든 숫자였습니다.
--
--   시스템에 교육 이력을 넣는 자리가 아예 없는데, 화면은 법정 주기가
--   임박했다고 단정하고 금액까지 붙였습니다. 그 숫자는 거래처마다 늘 같게
--   나와서 일관돼 보이고, 그래서 더 믿게 됩니다. 이걸 보고 병원에
--   「교육 하실 때 됐습니다」라고 전화하면 근거가 0입니다.
--
-- 이 SQL 이 하는 일
--   clients.education_at — 마지막 배출자 교육을 **실제로 한 날**
--
--   앱은 이 날짜가 있을 때만 「몇 개월 지났다」를 계산합니다. 비어 있으면
--   아무 말도 하지 않습니다. 거래처 정보 화면에 넣는 칸이 함께 생깁니다.
--
-- ⚠ 지난 자료를 추정해서 채우지 않습니다. **비어 있는 것이 사실입니다.**
--   한 곳이라도 넣어 두면 그 값이 화면에 확정처럼 뜨는데, 아무도 그것이
--   추정이었다는 것을 기억하지 못합니다.
--
-- 기존 데이터에 미치는 영향
--   · 표를 만들지도 지우지도 않습니다. 칸 하나만 늘립니다 (nullable).
--   · 기존 줄은 전부 비어 있는 채로 시작합니다.
--   · 금액·청구·수거에는 한 칸도 닿지 않습니다.
--   · RLS 는 한 줄도 안 건드립니다.
--   · 두 번 실행해도 안전합니다.
--
-- 실행 순서
--   1) 이 파일을 Supabase SQL Editor 에 통째로 붙여 넣고 실행
--   2) select public.app_schema_version();  → 60 이 나오면 끝

-- ════════════════════════════════════════════════════════════════════════════
-- 0060 — 배출자 교육일을 실제로 적을 자리
--
--  대표님이 「수거이력에 성상이 이상하게 뜬다」고 하신 뒤, 같은 방식으로
--  **지어내고 있던 값이 더 있는지** 전수로 훑었습니다. 나왔습니다.
--
--   화면:  「배출자 교육 제안 · 예상 +15만원」
--          「교육 이력 23개월 경과 — 법정 주기(2년) 도래 임박」
--          「최근 교육 23개월 전」
--
--   실제:  educationMonthsAgo = 6 + (거래처 id 를 해시한 값 % 22)
--
--  **거래처 id 를 해시해서 만든 숫자**였습니다. 시스템에 교육 이력을 넣는
--  자리가 아예 없는데, 화면은 법정 주기가 임박했다고 단정하고 금액까지
--  붙여 두었습니다. 그 숫자는 거래처마다 항상 같게 나와서 **일관돼 보이고,
--  그래서 더 믿게 됩니다.**
--
--  이걸 보고 병원에 「교육 하실 때 됐습니다」라고 전화하면, 근거가 0입니다.
--
-- ── 이 마이그레이션이 하는 일 ───────────────────────────────────────────────
--
--   clients.education_at — 마지막 배출자 교육을 **실제로 한 날**
--
--  앱에서는 이 날짜가 있을 때만 「몇 개월 지났다」를 계산합니다. 비어 있으면
--  아무 말도 하지 않고, 「채워야 할 값」에만 조용히 올립니다.
--
--  ⚠ 지난 자료를 **추정해서 채우지 않습니다.** 비어 있는 것이 사실입니다.
--    한 곳이라도 넣어 두면 그 값이 화면에 확정처럼 뜨는데, 아무도 그것이
--    추정이었다는 것을 기억하지 못합니다.
--
-- ── 기존 데이터 영향 ────────────────────────────────────────────────────────
--   · 표를 만들지도 지우지도 않습니다. 칸 하나만 늘립니다 (nullable).
--   · 기존 줄은 전부 비어 있는 채로 시작합니다 — 그게 사실입니다.
--   · 금액·청구·수거에는 한 칸도 닿지 않습니다.
--   · RLS 는 한 줄도 안 건드립니다.
--   · 두 번 실행해도 안전합니다.
--
--  실행 순서: RUN_1 ~ RUN_45 뒤에 실행합니다.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.clients
  add column if not exists education_at date;

comment on column public.clients.education_at is
  '마지막 배출자 교육을 실제로 한 날 (0060). 비어 있으면 앱이 아무 말도 하지 않습니다 — 예전에는 거래처 id 를 해시해 지어냈습니다.';


create or replace function public.app_health_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_missing text[] := '{}';
  v_name    text;
  v_pair    text[];
  v_rls     text[];
begin
  if not public.is_admin() then
    raise exception '자가진단은 관리자만 볼 수 있습니다.' using errcode = 'P0001';
  end if;

  foreach v_name in array array[
    'clients','vehicles','schedules','materials','material_transactions','office_stock',
    'payments','payment_receipts','client_prices','client_monthly_actuals','revenue_overrides',
    'operating_costs','holidays','site_notes','client_requests','request_overrides',
    'audit_logs','collection_events','profiles','dev_requests','client_documents',
    'sales_leads','sales_lead_events','experiment_settings','performance_baselines',
    'app_errors','staff','tax_filings',
    'products','product_orders','product_order_items',
    'month_close_marks','client_assignments','staff_invites'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('표 ' || v_name);
    end if;
  end loop;

  foreach v_pair slice 1 in array array[
    ['clients','flat_fee_when_empty'], ['clients','flat_fee_policy_at'],
    ['clients','name_key'], ['clients','request_id'],
    ['clients','collect_time'], ['clients','disposal_site'],
    ['clients','diaper_cycle'], ['clients','biz_no'], ['clients','vat_mode'],
    ['payments','snapshot'], ['payments','canceled_at'],
    ['payment_receipts','source_ref'], ['payment_receipts','request_id'],
    ['materials','request_id'], ['material_transactions','request_id'],
    ['schedules','plan_batch'], ['schedules','is_additional'],
    ['schedules','booked_at'],
    ['schedules','canceled_at'], ['schedules','cancel_reason'],
    ['clients','education_at'],
    ['profiles','approved_at'], ['app_errors','kind'],
    ['staff','waste_scope'], ['tax_filings','base_exempt'],
    ['product_order_items','unit_price'], ['product_orders','delivered_at'],
    ['tax_filings','confirmed_at'], ['products','category'],
    ['month_close_marks','marked_name'],
    ['client_requests','request_id'], ['site_notes','request_id'],
    ['profiles','vehicle_id'], ['staff_invites','client_ids']
  ] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_pair[1] and column_name = v_pair[2]
    ) then
      v_missing := v_missing || ('칸 ' || v_pair[1] || '.' || v_pair[2]);
    end if;
  end loop;

  foreach v_name in array array[
    'confirm_billing','cancel_billing','add_payment_receipt','delete_payment_receipt',
    'supply_materials','receive_stock','delete_material','complete_collection',
    'create_planned_schedules','set_revenue_override','delete_revenue_override',
    'set_flat_fee_policy','create_client','client_name_key',
    'record_app_error','recent_app_errors','upsert_staff','set_staff_active','upsert_tax_filing',
    'request_product_order','set_product_order_status','upsert_product','product_sales_summary',
    'admin_approve_user','admin_confirm_email','delete_client','app_schema_version',
    'set_tax_filing_confirmed','set_month_close_mark',
    'upsert_staff_invite','delete_staff_invite','set_client_drivers','set_profile_vehicle',
    'has_assignments','can_see_client','book_visit',
    'move_visit','cancel_visit','undo_schedule_batch',
    'is_admin','is_staff','is_active_user','auth_role'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    ) then
      v_missing := v_missing || ('함수 ' || v_name);
    end if;
  end loop;

  foreach v_name in array array[
    'payment_receipts_request_uniq','materials_request_uniq','material_tx_request_uniq',
    'clients_request_uniq','clients_name_key_idx','staff_name_uniq','product_orders_request_uniq',
    'schedules_planned_uniq','schedules_one_completion_per_day','products_category_idx',
    'schedules_live_planned_idx',
    'month_close_marks_uniq',
    'client_requests_request_uniq','site_notes_request_uniq',
    'client_assignments_profile_idx'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('색인 ' || v_name);
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger where tgname = 'clients_name_key_trg' and not tgisinternal
  ) then
    v_missing := v_missing || '방아쇠 clients_name_key_trg'::text;
  end if;
  --  가입할 때 초대를 적용하는 방아쇠 — 없으면 사전 등록이 조용히 아무 일도
  --  안 하고, 기사님은 승인 대기에 걸린 채 기다립니다.
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    v_missing := v_missing || '방아쇠 on_auth_user_created'::text;
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'payments'
       and grantee = 'authenticated' and privilege_type = 'DELETE'
  ) then
    v_missing := v_missing || '잠금 payments 삭제 권한이 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'payment_receipts'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 payment_receipts 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'clients'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then
    v_missing := v_missing || '잠금 clients 직접 등록이 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'app_errors'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 app_errors 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('staff', 'tax_filings')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 직원·신고매출 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('products', 'product_orders', 'product_order_items')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 상품·주문 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'month_close_marks'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 마감 표시 직접 쓰기가 열려 있음'::text;
  end if;
  --  기사가 자기 담당을 스스로 늘릴 수 있으면 「배정된 곳만 본다」가
  --  아무 뜻이 없습니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('client_assignments', 'staff_invites')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 배정·사전등록 직접 쓰기가 열려 있음'::text;
  end if;

  foreach v_name in array array[
    'client_requests_client_write', 'client_requests_client_read'
  ] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'client_requests' and policyname = v_name
    ) then
      v_missing := v_missing || ('정책 ' || v_name);
    end if;
  end loop;

  select coalesce(array_agg('RLS ' || c.relname order by c.relname), '{}') into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  v_missing := v_missing || v_rls;

  return jsonb_build_object(
    'version', public.app_schema_version(),
    'ok', array_length(v_missing, 1) is null,
    'missing', to_jsonb(v_missing),
    'checkedAt', (now() at time zone 'Asia/Seoul')
  );
end;
$$;

revoke all on function public.app_health_check() from public;
grant execute on function public.app_health_check() to authenticated;


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 60 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
