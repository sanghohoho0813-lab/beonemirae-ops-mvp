-- ════════════════════════════════════════════════════════════════════════════
-- 0054 — 「보냈습니다」를 기록할 수 있게 (월 마감 표시)
--
--  월 마감 진행상황에 여섯 단계가 있습니다.
--
--    수거 입력 → 정산 확인 → 청구 확정 → 거래명세서 → 세금계산서 → 입금 대사
--
--  이 중 넷은 시스템이 압니다. 그런데 **거래명세서**와 **세금계산서**는
--  시스템이 「뽑을 수 있음 / 발행할 수 있음」까지만 알고, 실제로 병원에
--  보냈는지·홈택스에 발행했는지는 모릅니다. 그래서 화면이 영원히
--  「준비됨」에 머물러 있었습니다.
--
--  결과가 두 가지로 나뉩니다.
--
--   · 이사님은 다 하고도 화면에서 확인할 방법이 없습니다. 「했나?」를
--     기억으로 답해야 하고, 달이 몇 개 밀리면 어느 달을 빠뜨렸는지
--     알 수 없습니다.
--   · 시스템은 계속 「아직 안 끝났습니다」처럼 보이는 상태로 남아 있어,
--     알림을 붙일 수도 없습니다 — 다 한 달에도 계속 울릴 테니까요.
--
--  ⚠ 시스템이 대신 판단하지 않습니다. **사람이 눌러 기록한 것만** 끝입니다.
--    자동으로 「보냈겠지」로 칠하면 안 보낸 명세서를 보냈다고 믿게 되고,
--    그건 병원에 청구서가 안 간 채로 한 달이 지나간다는 뜻입니다.
--
--  ⚠ 이 표는 **돈을 담지 않습니다.** 금액·청구·입금은 하나도 안 건드립니다.
--    「누가 언제 어느 달의 어느 단계를 했다고 표시했는가」만 담습니다.
--
--  기존 데이터 영향
--   · 표 하나가 새로 생깁니다(month_close_marks). 비어 있는 채로 시작합니다.
--   · 기존 표·금액·청구·입금·재고는 **하나도 바뀌지 않습니다.**
--   · 두 번 실행해도 안전합니다.
--
--  실행 순서: RUN_1 ~ RUN_39 뒤에 실행합니다.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.month_close_marks (
  id          bigserial primary key,
  --  YYYY-MM. 청구월과 같은 표기입니다(payments.billing_month).
  month       text not null,
  --  어느 단계인가 — 사람만 아는 두 가지로 한정합니다.
  --  시스템이 아는 단계(수거·정산·확정·대사)는 여기에 넣지 않습니다.
  --  넣으면 기록이 실제 자료와 어긋날 수 있고, 그때 어느 쪽이 맞는지
  --  아무도 모릅니다.
  step        text not null check (step in ('invoice_sent', 'tax_issued')),
  marked_at   timestamptz not null default now(),
  marked_by   uuid references public.profiles(id),
  --  누가 눌렀는지 이름을 굳혀 둡니다. 계정이 지워져도 기록은 남아야 합니다.
  marked_name text not null default '',
  note        text not null default ''
);

--  한 달에 한 단계는 한 줄. 다시 눌러도 두 줄이 되지 않습니다.
create unique index if not exists month_close_marks_uniq
  on public.month_close_marks (month, step);

create index if not exists month_close_marks_month_idx
  on public.month_close_marks (month);

comment on table public.month_close_marks is
  '사람이 「보냈다/발행했다」고 표시한 기록. 시스템이 알 수 없는 단계만 담습니다. 금액은 담지 않습니다.';

alter table public.month_close_marks enable row level security;

--  읽기는 직원 전체(대표·사무실·현장). 병원 계정('client')은 제외됩니다 —
--  is_active_user() 가 걸러 냅니다.
drop policy if exists month_close_marks_read on public.month_close_marks;
create policy month_close_marks_read on public.month_close_marks
  for select using (public.is_active_user());

--  직접 쓰기는 막습니다. 아래 함수로만 씁니다 — 누가 눌렀는지를 화면이
--  보내면 남의 이름으로 표시할 수 있습니다.
revoke insert, update, delete on public.month_close_marks from authenticated;
grant select on public.month_close_marks to authenticated;
grant usage, select on sequence public.month_close_marks_id_seq to authenticated;


/**
 * 「보냈습니다 / 발행했습니다」를 켜거나 끕니다.
 *
 *  · 관리자만 — 마감을 끝났다고 선언하는 일입니다.
 *  · 다시 눌러도 안전합니다(같은 상태면 아무것도 하지 않습니다).
 *  · 되돌릴 수 있습니다. 잘못 눌렀을 때 손쓸 방법이 있어야 합니다.
 *  · 누가 눌렀는지 이름을 그 자리에서 굳혀 둡니다.
 */
create or replace function public.set_month_close_mark(
  p_month text,
  p_step  text,
  p_done  boolean,
  p_note  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_name   text;
begin
  if not public.is_admin() then
    raise exception '마감 표시는 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception '월은 2026-08 형태로 넣어 주세요.' using errcode = 'P0001';
  end if;
  if p_step not in ('invoice_sent', 'tax_issued') then
    raise exception '알 수 없는 단계입니다 — 거래명세서 발송(invoice_sent) · 세금계산서 발행(tax_issued) 만 표시할 수 있습니다.'
      using errcode = 'P0001';
  end if;

  --  아직 오지 않은 달을 「보냈다」고 표시할 수는 없습니다. 명세서는
  --  그 달이 끝나야 나옵니다 — 미래를 끝났다고 적으면 알림이 조용해지고
  --  실제로는 아무것도 안 한 채 지나갑니다.
  if coalesce(p_done, false)
     and p_month > to_char((now() at time zone 'Asia/Seoul'), 'YYYY-MM') then
    raise exception '아직 오지 않은 달(%)은 보냈다고 표시할 수 없습니다.', p_month
      using errcode = 'P0001';
  end if;

  select true into v_exists
    from public.month_close_marks
   where month = p_month and step = p_step
   for update;

  if coalesce(v_exists, false) = coalesce(p_done, false) then
    return jsonb_build_object('month', p_month, 'step', p_step,
                              'done', coalesce(v_exists, false), 'changed', false);
  end if;

  select coalesce(nullif(trim(name), ''), email, '이름 없음') into v_name
    from public.profiles where id = auth.uid();

  if coalesce(p_done, false) then
    insert into public.month_close_marks (month, step, marked_by, marked_name, note)
    values (p_month, p_step, auth.uid(), coalesce(v_name, ''), coalesce(p_note, ''))
    on conflict (month, step) do update
      set marked_at = now(), marked_by = auth.uid(),
          marked_name = coalesce(v_name, ''), note = coalesce(p_note, '');
  else
    delete from public.month_close_marks where month = p_month and step = p_step;
  end if;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('month_close.mark', 'month_close_marks', p_month || '|' || p_step,
          format('%s %s %s', p_month,
                 case p_step when 'invoice_sent' then '거래명세서 발송' else '세금계산서 발행' end,
                 case when coalesce(p_done, false) then '표시함' else '표시 해제' end),
          '월 마감', 'app');

  return jsonb_build_object('month', p_month, 'step', p_step,
                            'done', coalesce(p_done, false), 'changed', true);
end;
$$;

revoke all on function public.set_month_close_mark(text, text, boolean, text) from public;
grant execute on function public.set_month_close_mark(text, text, boolean, text) to authenticated;


-- ── 자가진단 목록 넓히기 ────────────────────────────────────────────────────
--
--  ⚠ 마이그레이션마다 이 목록을 함께 늘려야 합니다. 안 늘리면 표·색인·함수가
--    사라져도 진단이 「이상 없음」이라고 거짓말합니다.

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
    ['month_close_marks','marked_name']
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
    'month_close_marks_uniq'
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
  --  마감 표시를 표에서 직접 켤 수 있으면 「누가 눌렀는가」가 무의미해집니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'month_close_marks'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 마감 표시 직접 쓰기가 열려 있음'::text;
  end if;

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
as $$ select 54 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
