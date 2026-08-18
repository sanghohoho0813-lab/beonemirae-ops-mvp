-- ─────────────────────────────────────────────────────────────────────────────
-- 0062 — 잡아 둔 일정을 고치고, 현장이 의견을 낼 수 있게
--
--  대표님 요청 네 가지입니다.
--
--   ① 대표·사무실이 **오늘·앞으로의 일정**을 지우거나 상세를 고칠 수 있게.
--      · 지우기(무르기)와 날짜 옮기기는 0059 에 이미 있습니다.
--      · 없던 것은 **상세 고치기** — 시각·차량·예상량·메모. update_visit 을 만듭니다.
--
--   ② 현장 담당자는 배정받은 일정을 **직접 지우지 못합니다.** 대신 의견을
--      냅니다 — 「이 날짜보다 화요일이 낫습니다」 같은 것. 저장하면 대표·
--      사무실 화면에 뜹니다.
--
--   ③ 수거이력에 잘못 올라간 것을 지울 수 있게 — 함수는 이미 있습니다
--      (revert_collection, 0016). 화면에만 붙이면 되므로 여기서는 안 만듭니다.
--
--   ④ 엑셀로 가져온 월 실적을 대표·사무실이 고칠 수 있게.
--      ⚠ 이건 **매출이 바뀌는 일**입니다. 감사기록에 이전 값을 통째로 남깁니다.
--
-- ── 무엇을 못 하게 막았는가 ─────────────────────────────────────────────────
--
--   · 완료된 수거는 고치지도 옮기지도 못합니다 — 정산·청구·매출이 거기서
--     나옵니다. 잘못 넣은 것은 수거 입력에서 되돌립니다.
--   · 현장 담당자는 일정을 못 고치고 못 지웁니다 (is_staff 가 아니라 office/admin).
--   · 확정한 청구가 있는 달의 월 실적은 못 고칩니다 — 청구서와 어긋납니다.
--   · 의견은 **자기가 낸 것만** 봅니다. 남의 의견은 사무실·관리자만 봅니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 현장 의견 ────────────────────────────────────────────────────────────────
--
--  「일정 바꿔 주세요」를 전화로 하면 기록이 안 남고, 대표님은 누가 무엇을
--  말했는지 나중에 못 찾습니다. 화면에 남기면 그대로 이력이 됩니다.
create table if not exists public.schedule_feedback (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  kind        text not null default '기타'
              check (kind in ('일정변경','요일변경','현장상황','기타')),
  body        text not null,
  status      text not null default '접수'
              check (status in ('접수','확인','반영','반려')),
  reply       text not null default '',
  request_id  uuid,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  handled_by  uuid references public.profiles(id),
  handled_at  timestamptz,
  updated_at  timestamptz not null default now()
);

comment on table public.schedule_feedback is
  '현장 담당자가 배정된 일정에 대해 낸 의견. 지우기는 못 하고 의견만 냅니다.';

create index if not exists schedule_feedback_open_idx
  on public.schedule_feedback (created_at desc)
  where status in ('접수','확인');
create index if not exists schedule_feedback_schedule_idx
  on public.schedule_feedback (schedule_id);

--  같은 의견을 두 번 보내지 않게 (0055 와 같은 방식) — 지하 주차장에서
--  응답이 늦어 두 번 눌러도 의견은 하나입니다.
create unique index if not exists schedule_feedback_request_uniq
  on public.schedule_feedback (request_id)
  where request_id is not null;

alter table public.schedule_feedback enable row level security;

--  직접 쓰기는 막습니다. 넣고 고치는 길은 아래 함수뿐입니다.
revoke all on table public.schedule_feedback from authenticated;
grant select on table public.schedule_feedback to authenticated;

drop policy if exists schedule_feedback_read on public.schedule_feedback;
create policy schedule_feedback_read on public.schedule_feedback
  for select to authenticated
  using (
    public.is_admin()
    or public.auth_role() = 'office'
    --  현장 담당자는 **자기가 낸 것만** 봅니다.
    or created_by = auth.uid()
  );

create or replace function public.touch_schedule_feedback()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists schedule_feedback_touch on public.schedule_feedback;
create trigger schedule_feedback_touch before update on public.schedule_feedback
  for each row execute function public.touch_schedule_feedback();

-- ── 의견 내기 ────────────────────────────────────────────────────────────────
create or replace function public.submit_schedule_feedback(
  p_schedule_id uuid,
  p_kind        text,
  p_body        text,
  p_request_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s   public.schedules%rowtype;
  v_id  uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_kind text := coalesce(nullif(btrim(p_kind), ''), '기타');
begin
  --  ⚠ 병원 안내를 **먼저** 합니다. is_active_user() 는 admin/office/field 만
  --    참이라, 순서를 바꾸면 병원 담당자가 「승인된 계정만」이라는 엉뚱한
  --    문구를 보게 됩니다 — 자기 계정이 잘못된 줄 알고 전화하십니다.
  if public.is_client_user() then
    raise exception '병원 담당자는 포털의 「수거 요청」을 이용해 주세요.' using errcode = 'P0001';
  end if;
  if not public.is_active_user() then
    raise exception '승인된 계정만 의견을 낼 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_schedule_id is null then
    raise exception '어느 방문에 대한 의견인지 정해 주세요.' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception '의견 내용을 적어 주세요.' using errcode = 'P0001';
  end if;
  if length(v_body) > 1000 then
    raise exception '의견이 너무 깁니다 (1000자까지).' using errcode = 'P0001';
  end if;
  if v_kind not in ('일정변경','요일변경','현장상황','기타') then
    raise exception '의견 종류가 올바르지 않습니다: %', v_kind using errcode = 'P0001';
  end if;

  select * into v_s from public.schedules where id = p_schedule_id;
  if not found then
    raise exception '그 방문을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  ⚠ 다시 눌러도 하나입니다. 같은 표(request_id)면 있던 것을 돌려줍니다.
  if p_request_id is not null then
    select id into v_id from public.schedule_feedback where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_id, 'duplicated', true);
    end if;
  end if;

  insert into public.schedule_feedback (schedule_id, client_id, kind, body, request_id, created_by)
  values (p_schedule_id, v_s.client_id, v_kind, v_body, p_request_id, auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'duplicated', false);
exception
  when unique_violation then
    select id into v_id from public.schedule_feedback where request_id = p_request_id;
    return jsonb_build_object('id', v_id, 'duplicated', true);
end;
$$;

revoke all on function public.submit_schedule_feedback(uuid, text, text, uuid) from public;
grant execute on function public.submit_schedule_feedback(uuid, text, text, uuid) to authenticated;

-- ── 의견 처리 (대표·사무실) ──────────────────────────────────────────────────
create or replace function public.handle_schedule_feedback(
  p_id     uuid,
  p_status text,
  p_reply  text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.auth_role() = 'office') then
    raise exception '의견 처리는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_status not in ('접수','확인','반영','반려') then
    raise exception '처리 상태가 올바르지 않습니다: %', p_status using errcode = 'P0001';
  end if;

  update public.schedule_feedback
     set status     = p_status,
         reply      = coalesce(btrim(p_reply), ''),
         handled_by = auth.uid(),
         handled_at = case when p_status in ('접수') then null else now() end
   where id = p_id;

  if not found then
    raise exception '그 의견을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.handle_schedule_feedback(uuid, text, text) from public;
grant execute on function public.handle_schedule_feedback(uuid, text, text) to authenticated;

-- ── 방문 상세 고치기 ─────────────────────────────────────────────────────────
--
--  날짜를 옮기는 것은 move_visit(0059) 이 합니다. 여기서는 **같은 날 안에서**
--  시각·차량·예상량·메모만 고칩니다. 날짜를 안 건드리므로 그 달 매출이
--  옮겨 갈 일이 없습니다.
create or replace function public.update_visit(
  p_schedule_id uuid,
  p_time        text default null,
  p_vehicle_id  uuid default null,
  p_expected    integer default null,
  p_memo        text default null,
  p_keep_vehicle boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s    public.schedules%rowtype;
  v_veh  public.vehicles%rowtype;
  v_time text;
  v_veh_id uuid;
begin
  if not (public.is_admin() or public.auth_role() = 'office') then
    raise exception '일정을 고치는 것은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_schedule_id is null then
    raise exception '고칠 방문을 정해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_s from public.schedules where id = p_schedule_id for update;
  if not found then
    raise exception '고칠 방문을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  ⚠ 완료된 수거는 실제로 다녀온 기록입니다. 정산·청구·매출이 여기서
  --  나옵니다. 잘못 넣은 것은 수거 입력에서 되돌린 뒤 다시 넣습니다.
  if v_s.status = '완료' then
    raise exception '이미 완료된 수거는 여기서 못 고칩니다. 수거 입력에서 되돌린 뒤 다시 넣어 주세요.'
      using errcode = 'P0001';
  end if;
  if v_s.canceled_at is not null then
    raise exception '이미 무른 방문입니다. 새로 잡아 주세요.' using errcode = 'P0001';
  end if;

  --  시각 — 안 보내면(null) 지금 값을 그대로. 빈 문자열은 「지우기」입니다.
  v_time := btrim(coalesce(p_time, v_s.scheduled_time, ''));
  if v_time <> '' and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '방문 시각이 올바르지 않습니다: % (예: 09:30)', v_time using errcode = 'P0001';
  end if;

  v_veh_id := case when p_keep_vehicle then v_s.vehicle_id else p_vehicle_id end;
  if v_veh_id is not null then
    select * into v_veh from public.vehicles where id = v_veh_id;
    if not found then
      raise exception '그 차량을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if not v_veh.active then
      raise exception '「%」는 지금 쓰지 않는 차량입니다.', v_veh.name using errcode = 'P0001';
    end if;
    --  폐기물 종류가 다른 차에 붙이면 그날 그 차가 못 싣습니다.
    if v_veh.waste_type <> v_s.waste_type then
      raise exception '「%」는 % 차량입니다. 이 방문은 %입니다.',
        v_veh.name, v_veh.waste_type, v_s.waste_type using errcode = 'P0001';
    end if;
  end if;

  --  예상량 — 안 보내면 그대로. 0 이상 100000kg 이하만 받습니다.
  if p_expected is not null and (p_expected < 0 or p_expected > 100000) then
    raise exception '예상 배출량이 올바르지 않습니다: %kg', p_expected using errcode = 'P0001';
  end if;
  if p_memo is not null and length(p_memo) > 1000 then
    raise exception '메모가 너무 깁니다 (1000자까지).' using errcode = 'P0001';
  end if;

  update public.schedules
     set scheduled_time = nullif(v_time, ''),
         vehicle_id     = v_veh_id,
         expected_amount = coalesce(p_expected, expected_amount),
         memo           = coalesce(btrim(p_memo), memo)
   where id = p_schedule_id;
end;
$$;

revoke all on function public.update_visit(uuid, text, uuid, integer, text, boolean) from public;
grant execute on function public.update_visit(uuid, text, uuid, integer, text, boolean) to authenticated;

-- ── 엑셀로 가져온 월 실적 고치기 ─────────────────────────────────────────────
--
--  ⚠ 이건 **매출이 바뀌는 일**입니다.
--   · 대표·사무실만 할 수 있습니다.
--   · 그 달에 **확정한 청구가 있으면 막습니다** — 청구서와 어긋납니다.
--   · 고치기 전 값을 감사기록에 통째로 남깁니다.
create or replace function public.update_monthly_actual(
  p_id         uuid,
  p_medical_kg numeric default null,
  p_diaper_kg  numeric default null,
  p_revenue    numeric default null,
  p_cost       numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.client_monthly_actuals%rowtype;
  v_rev numeric;
  v_cost numeric;
begin
  if not (public.is_admin() or public.auth_role() = 'office') then
    raise exception '월 실적 수정은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_row from public.client_monthly_actuals where id = p_id for update;
  if not found then
    raise exception '고칠 월 실적을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  확정한 청구가 있는 달은 못 고칩니다 — 청구서에 이미 나간 숫자입니다.
  if exists (
    select 1 from public.payments
     where client_id = v_row.client_id
       and billing_month = v_row.month
       and canceled_at is null
  ) then
    raise exception '% 월은 이미 청구를 확정했습니다. 청구를 취소한 뒤에 고쳐 주세요.', v_row.month
      using errcode = 'P0001';
  end if;

  if p_medical_kg is not null and p_medical_kg < 0 then
    raise exception '의료폐기물 수거량은 0보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_diaper_kg is not null and p_diaper_kg < 0 then
    raise exception '기저귀 수거량은 0보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_revenue is not null and p_revenue < 0 then
    raise exception '매출은 0보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception '원가는 0보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;

  v_rev  := coalesce(p_revenue, v_row.revenue);
  v_cost := coalesce(p_cost, v_row.cost);

  --  고치기 전 값을 통째로 남깁니다 — 나중에 「원래 얼마였나」를 물으면
  --  답할 데가 여기뿐입니다.
  insert into public.audit_logs (
    actor_id, actor_role, action, entity, entity_id, client_id, screen,
    before_data, after_data
  )
  values (
    auth.uid(), public.auth_role()::public.user_role,
    'monthly_actual.update', 'client_monthly_actuals', v_row.id::text,
    v_row.client_id, '월 실적 수정',
    jsonb_build_object(
      'month', v_row.month,
      'medicalKg', v_row.medical_kg, 'diaperKg', v_row.diaper_kg,
      'revenue', v_row.revenue, 'cost', v_row.cost, 'profit', v_row.profit
    ),
    jsonb_build_object(
      'month', v_row.month,
      'medicalKg', coalesce(p_medical_kg, v_row.medical_kg),
      'diaperKg', coalesce(p_diaper_kg, v_row.diaper_kg),
      'revenue', v_rev, 'cost', v_cost, 'profit', v_rev - v_cost
    )
  );

  update public.client_monthly_actuals
     set medical_kg = coalesce(p_medical_kg, medical_kg),
         diaper_kg  = coalesce(p_diaper_kg, diaper_kg),
         revenue    = v_rev,
         cost       = v_cost,
         --  이익은 **받지 않습니다.** 매출 − 원가로 여기서 계산합니다 —
         --  세 값을 따로 받으면 서로 안 맞는 줄이 생깁니다.
         profit     = v_rev - v_cost,
         updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.update_monthly_actual(uuid, numeric, numeric, numeric, numeric) from public;
grant execute on function public.update_monthly_actual(uuid, numeric, numeric, numeric, numeric) to authenticated;


-- ── 자가진단 ─────────────────────────────────────────────────────────────────
--  ⚠ 0061 의 것을 **그대로 떼어다** 새로 생긴 것만 더했습니다.
--    기억으로 다시 쓰면 있던 항목이 조용히 빠지고, 그러면 진단이
--    「이상 없음」이라고 거짓말합니다. 실제로 그런 적이 있습니다.
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
    'month_close_marks','client_assignments','staff_invites',
    'schedule_feedback'
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
    'has_live_billing',
    'submit_schedule_feedback','handle_schedule_feedback',
    'update_visit','update_monthly_actual',
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
    'client_assignments_profile_idx',
    'schedule_feedback_request_uniq','schedule_feedback_open_idx'
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

  --  현장이 남의 의견을 고치거나 지울 수 있으면 「의견은 기록」이 아닙니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'schedule_feedback'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 현장 의견 직접 쓰기가 열려 있음'::text;
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

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'schedule_feedback'
       and policyname = 'schedule_feedback_read'
  ) then
    v_missing := v_missing || '정책 schedule_feedback_read'::text;
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
as $$ select 62 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
