-- 비원미래 운영 DB — 41차 (0055)
-- 병원 요청·현장 메모도 「다시 눌러도 안전」하게. RUN_1~40 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0055_request_note_dedup.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();   → 55
--              select public.app_health_check();      → ok: true
--
-- 왜 필요한가
--   병원 담당자가 지하 주차장에서 「추가 수거 요청」을 누릅니다. 응답이 늦어
--   안 눌린 줄 알고 한 번 더 누르면 **같은 요청이 두 줄** 들어옵니다.
--   이사님 화면에는 두 건으로 보이고, 최악은 추가 수거를 두 번 나가는 것입니다.
--   현장 메모도 같습니다.
--
--   입금(0042)·자재 공급·재고 입고(0043)·거래처 등록(0045)은 이미 막아 뒀고,
--   남아 있던 두 곳이 이것입니다.
--
-- 기존 데이터에 미치는 영향
--   · 두 표(client_requests · site_notes)에 칸이 하나씩 늘어납니다.
--   · 기존 줄은 전부 null 이고 부분 색인이라 서로 부딪히지 않습니다 —
--     **이미 있는 중복도 그대로 둡니다**(지우면 어느 쪽이 맞는지 사람이
--     볼 기회가 사라집니다).
--   · 옛 화면이 표 없이 보내도 지금까지와 똑같이 동작합니다.
--   · **RLS 는 한 줄도 안 건드립니다.** 병원 격리 규칙은 그대로입니다.
--   · 돈을 담은 표는 하나도 안 건드립니다.
--   · 두 번 실행해도 안전합니다.
--
-- 실행 순서
--   1) 이 파일을 Supabase SQL Editor 에 통째로 붙여 넣고 실행
--   2) select public.app_schema_version();  → 55 가 나오면 끝

-- ════════════════════════════════════════════════════════════════════════════
-- 0055 — 병원 요청·현장 메모도 「다시 눌러도 안전」하게
--
--  입금(0042)·자재 공급·재고 입고(0043)·거래처 등록(0045)은 이미 막아 뒀습니다.
--  남아 있던 두 곳이 병원 요청과 현장 메모입니다.
--
--  실제로 벌어지는 일
--
--   병원 담당자가 「추가 수거 요청」을 누릅니다. 지하 주차장이나 엘리베이터
--   안이라 응답이 늦습니다. 안 눌린 줄 알고 한 번 더 누릅니다.
--   → **같은 요청이 두 줄** 들어옵니다.
--
--   이사님 화면에는 같은 병원의 같은 요청이 두 건으로 보입니다. 하나를
--   처리하고 나머지도 처리하려다 「이거 아까 그거 아닌가?」로 전화가
--   한 번 더 갑니다. 최악은 **추가 수거를 두 번 나가는 것**입니다.
--
--   현장 메모도 같습니다. 기사님이 차 안에서 저장을 두 번 눌러 같은 메모가
--   두 줄이 되면, 다음 사람이 「두 번 적을 만큼 중요한 일인가」로 읽습니다.
--
-- ── 무엇을 바꾸고, 무엇을 안 바꾸는가 ───────────────────────────────────────
--
--  바꾸는 것 — 두 표에 **저장시도 표(request_id)** 한 칸씩. 화면이 「이번
--  저장 시도」마다 표를 하나 만들어 보내고, 다시 눌러도 **같은 표**를
--  보냅니다. 두 번째는 색인이 막습니다(0042·0043·0045 와 같은 방식).
--
--  ⚠ **RLS 는 한 줄도 건드리지 않습니다.** 지금 규칙이 이미 맞습니다 —
--    병원 계정은 자기 병원 요청만, source='portal', status='접수' 로만
--    넣을 수 있습니다(0006). 여기에 손대면 그게 더 위험합니다.
--    SECURITY DEFINER 함수도 만들지 않습니다. 권한 판단을 옮겨 적는
--    순간 실수할 자리가 생기고, 얻는 것은 없습니다.
--
--  ⚠ 돈을 담은 표는 하나도 안 건드립니다. 청구·입금·재고·수거 그대로입니다.
--
-- ── 기존 데이터 영향 ────────────────────────────────────────────────────────
--   · 두 표에 칸이 하나씩 늘어납니다. 기존 줄은 전부 null 이고, 부분 색인이라
--     null 은 서로 부딪히지 않습니다 — **이미 있는 중복도 그대로 둡니다.**
--     (지우면 어느 쪽이 맞는지 사람이 볼 기회가 사라집니다)
--   · 옛 화면이 request_id 없이 보내도 지금까지와 똑같이 동작합니다.
--   · 두 번 실행해도 안전합니다.
--
--  실행 순서: RUN_1 ~ RUN_40 뒤에 실행합니다.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.client_requests
  add column if not exists request_id uuid;

comment on column public.client_requests.request_id is
  '한 번의 「보내기」 시도 (0055). 같은 표가 두 번 오면 두 번째는 색인이 막습니다. 옛 화면은 null 로 보내고 지금까지처럼 동작합니다.';

create unique index if not exists client_requests_request_uniq
  on public.client_requests (request_id) where request_id is not null;


alter table public.site_notes
  add column if not exists request_id uuid;

comment on column public.site_notes.request_id is
  '한 번의 「저장」 시도 (0055). 같은 표가 두 번 오면 두 번째는 색인이 막습니다.';

create unique index if not exists site_notes_request_uniq
  on public.site_notes (request_id) where request_id is not null;


-- ── 자가진단 목록 넓히기 ────────────────────────────────────────────────────
--
--  ⚠ 마이그레이션마다 이 목록을 함께 늘려야 합니다. 안 늘리면 색인이 사라져
--    중복 방어가 풀려도 진단이 「이상 없음」이라고 거짓말합니다.

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
    'month_close_marks'
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
    ['profiles','approved_at'], ['app_errors','kind'],
    ['staff','waste_scope'], ['tax_filings','base_exempt'],
    ['product_order_items','unit_price'], ['product_orders','delivered_at'],
    ['tax_filings','confirmed_at'], ['products','category'],
    ['month_close_marks','marked_name'],
    ['client_requests','request_id'], ['site_notes','request_id']
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
    'month_close_marks_uniq',
    'client_requests_request_uniq','site_notes_request_uniq'
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

  --  병원 계정이 남의 병원 요청을 넣을 수 있으면 격리가 뚫린 것입니다.
  --  0006 이 만든 정책이 살아 있는지 이름으로 확인합니다.
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
as $$ select 55 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
