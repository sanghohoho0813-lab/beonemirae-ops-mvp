-- 비원미래 운영 DB — 3차 (0006~0011)
-- 2차가 끝난 뒤에 실행합니다.


-- ══════════════════════════════════════ 0006_portal.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 병원 고객 서비스 (5단계 — 병원 운영지원 서비스 확장)
--
--  이번 단계에서 제품이 바뀌는 지점은 하나입니다.
--   기존 : 비원미래 직원만 쓰는 내부 운영 시스템
--   이후 : 병원도 자기 병원의 수거 현황을 보고, 필요한 것을 직접 요청하고,
--          비원미래의 데이터 기반 제안을 받아 수락할 수 있는 서비스
--
--  이를 위해 필요한 최소한만 추가합니다.
--   1) profiles.client_id  — 병원 계정이 어느 거래처 소속인지
--   2) client_requests     — 병원이 올린 실제 요청 (이전에는 화면용 파생값이었음)
--   3) sales_leads 확장    — 제안을 병원에 '공유'하고 병원이 직접 수락
--   4) 병원 계정용 RLS     — 자기 병원 데이터만, 그것도 필요한 것만
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0) 기존 헬퍼의 의미를 명확히 합니다 ─────────────────────────────────────
-- is_active_user() 는 기존 정책 전반에서 "로그인한 사람"으로 쓰이고 있었습니다.
-- 병원 계정이 생긴 지금 그대로 두면 병원이 전 거래처 데이터를 보게 됩니다.
-- 그래서 '비원미래 내부 직원'으로 좁히고, 병원은 아래에서 명시적으로만 허용합니다.
create or replace function public.is_active_user() returns boolean
language sql stable as $$ select public.auth_role() in ('admin','office','field') $$;

-- 로그인한 병원 계정인지
create or replace function public.is_client_user() returns boolean
language sql stable as $$ select public.auth_role() = 'client' $$;

-- ── 1) 병원 계정 ↔ 거래처 연결 ──────────────────────────────────────────────
-- (아래 auth_client_id() 가 이 컬럼을 참조하므로 컬럼을 먼저 만듭니다)
alter table public.profiles
  add column if not exists client_id uuid references public.clients(id) on delete set null;

-- 로그인한 병원 계정이 소속된 거래처 id (직원이면 null)
create or replace function public.auth_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles
  where id = auth.uid() and active and role = 'client'
$$;

-- 병원 계정은 반드시 소속 거래처가 있어야 합니다(어느 병원인지 모르는 병원 계정 금지).
alter table public.profiles drop constraint if exists profiles_client_needs_client_id;
alter table public.profiles add constraint profiles_client_needs_client_id
  check (role <> 'client' or client_id is not null);

-- 가입 트리거: 초대 메타데이터에 client_id 가 함께 있을 때만 병원 역할을 부여합니다.
-- (client_id 없이 role='client' 로 초대되면 위 제약에 걸려 계정 생성이 실패하므로,
--  조용히 실패하는 대신 안전한 기본값으로 떨어뜨립니다.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_requested public.user_role;
  v_client    uuid := nullif(new.raw_user_meta_data->>'client_id', '')::uuid;
  v_role      public.user_role;
begin
  v_requested := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'field');

  if (select count(*) from public.profiles) = 0 then
    v_role := 'admin';          -- 최초 계정은 관리자
    v_client := null;
  elsif v_requested = 'client' and v_client is null then
    v_role := 'field';          -- 소속 병원이 없는 병원 계정은 만들지 않습니다
  else
    v_role := v_requested;
  end if;

  insert into public.profiles (id, email, name, role, client_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    v_role,
    case when v_role = 'client' then v_client else null end
  );
  return new;
end $$;

-- ── 2) 병원 요청 ────────────────────────────────────────────────────────────
create table public.client_requests (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  kind           text not null check (kind in ('긴급수거','추가수거','소모품','교육·자료','기타')),
  content        text not null default '',
  desired_date   date,
  urgent         boolean not null default false,
  status         text not null default '접수' check (status in ('접수','확인 중','일정 반영','처리 완료')),
  -- portal = 병원이 직접 올린 요청 / staff = 전화·카톡을 비원미래가 대신 접수
  source         text not null default 'portal' check (source in ('portal','staff')),
  requester_name text not null default '',
  -- 비원미래 회신 — 병원 포털에 그대로 표시됩니다
  reply          text not null default '',
  handled_by     uuid references public.profiles(id),
  handled_at     timestamptz,
  demo_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create trigger client_requests_touch before update on public.client_requests
  for each row execute function public.touch_updated_at();
create index client_requests_client_idx on public.client_requests(client_id, created_at desc);
create index client_requests_open_idx on public.client_requests(status) where status <> '처리 완료';

-- ── 3) 제안을 병원에 공유 ───────────────────────────────────────────────────
alter table public.sales_leads
  add column if not exists shared_with_client   boolean not null default false,
  add column if not exists shared_at            timestamptz,
  add column if not exists client_message       text not null default '',
  add column if not exists client_responded_at  timestamptz;

-- ── 4) RLS ──────────────────────────────────────────────────────────────────
alter table public.client_requests enable row level security;

-- 비원미래 직원: 전체 열람·처리
create policy client_requests_staff_read on public.client_requests
  for select using (public.is_active_user());
create policy client_requests_staff_write on public.client_requests
  for insert with check (public.is_active_user());
create policy client_requests_staff_update on public.client_requests
  for update using (public.is_staff()) with check (public.is_staff());
-- 요청 기록은 지우지 않습니다. 시연 데이터 정리를 위해 관리자에게만 예외를 둡니다.
create policy client_requests_admin_delete on public.client_requests
  for delete using (public.is_admin());

-- 병원 계정: 자기 병원 요청만 보고, 자기 병원 요청만 등록
create policy client_requests_client_read on public.client_requests
  for select using (public.is_client_user() and client_id = public.auth_client_id());
create policy client_requests_client_write on public.client_requests
  for insert with check (
    public.is_client_user()
    and client_id = public.auth_client_id()
    and source = 'portal'
    and status = '접수'
  );
-- 병원은 등록한 요청의 상태·회신을 바꿀 수 없습니다(update 정책 없음).

-- 병원 계정이 볼 수 있는 것 — 자기 병원에 한해, 필요한 것만
-- (차량·미수금·감사로그·다른 병원 데이터는 정책이 없으므로 기본 차단됩니다)
create policy clients_portal_read on public.clients
  for select using (public.is_client_user() and id = public.auth_client_id());

create policy schedules_portal_read on public.schedules
  for select using (public.is_client_user() and client_id = public.auth_client_id());

create policy materials_portal_read on public.materials
  for select using (public.is_client_user() and client_id = public.auth_client_id());

-- 병원에 공유한 제안만 보입니다(내부 추천 단계는 보이지 않습니다).
create policy sales_leads_portal_read on public.sales_leads
  for select using (
    public.is_client_user()
    and client_id = public.auth_client_id()
    and shared_with_client
  );

-- ── 5) 병원의 제안 응답 (수락 / 보류) ───────────────────────────────────────
-- 컬럼 단위 권한을 RLS 로 표현하면 복잡해지므로 함수로 좁게 엽니다.
-- 병원은 '공유된 제안'의 단계만 수락/보류로 바꿀 수 있고, 금액·내용은 못 바꿉니다.
create or replace function public.respond_to_proposal(p_lead_id uuid, p_accept boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor  profiles%rowtype;
  v_lead   sales_leads%rowtype;
  v_stage  text;
  v_now    timestamptz := now();
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role <> 'client' then
    raise exception '병원 담당자 계정만 제안에 응답할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_lead from sales_leads where id = p_lead_id for update;
  if not found or v_lead.client_id is distinct from v_actor.client_id then
    raise exception '해당 제안을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not v_lead.shared_with_client then
    raise exception '아직 전달되지 않은 제안입니다.' using errcode = 'P0001';
  end if;

  v_stage := case when p_accept then '수락' else '보류' end;

  update sales_leads
     set stage = v_stage,
         client_responded_at = v_now,
         -- 수락이 아니면 실제 매출은 남기지 않습니다(유령 값 방지).
         actual_revenue = case when p_accept then actual_revenue else null end,
         actual_revenue_at = case when p_accept then actual_revenue_at else null end,
         updated_by = v_actor.id
   where id = v_lead.id;

  insert into sales_lead_events (lead_id, stage, actor_id) values (v_lead.id, v_stage, v_actor.id);

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, summary)
  values (v_actor.id, v_actor.name, 'client', 'proposal.respond', 'sales_leads',
          v_lead.id::text, v_lead.client_id, v_lead.client_name, '병원 포털',
          format('%s — 병원이 제안을 %s (%s)', v_lead.client_name, v_stage, v_lead.title));

  return jsonb_build_object('ok', true, 'stage', v_stage);
end $$;

-- ── 6) 수거 완료 시 병원 요청 자동 종료 ─────────────────────────────────────
-- 기존 complete_collection 은 파생 요청 id 를 request_overrides 에 기록했습니다.
-- 이제 요청이 실제 행이므로, 해당 거래처의 열린 요청을 직접 닫습니다.
--  · 수거를 하면 긴급수거·추가수거 요청이 닫히고
--  · 자재를 함께 공급했으면 소모품 요청도 닫힙니다
create or replace function public.close_requests_on_collection(
  p_client_id uuid, p_supplied boolean, p_actor uuid, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_closed jsonb := '[]'::jsonb; r record;
begin
  -- security definer 이므로 호출자를 직접 검사합니다.
  -- (병원 계정이 이 함수를 직접 불러 요청을 임의로 닫는 것을 막습니다)
  if not exists (
    select 1 from profiles
    where id = auth.uid() and active and role in ('admin','office','field')
  ) then
    raise exception '권한이 없습니다.' using errcode = 'P0001';
  end if;

  for r in
    update client_requests
       set status = '처리 완료', handled_by = p_actor, handled_at = p_now,
           reply = case when reply = '' then '수거 완료로 처리되었습니다.' else reply end
     where client_id = p_client_id
       and status <> '처리 완료'
       and (kind in ('긴급수거','추가수거') or (p_supplied and kind = '소모품'))
    returning id, kind, status
  loop
    v_closed := v_closed || jsonb_build_object('requestId', r.id, 'from', '접수', 'to', '처리 완료');
  end loop;
  return v_closed;
end $$;

-- complete_collection 에서 위 함수를 호출하도록 4)단계만 교체합니다.
create or replace function public.complete_collection(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor        profiles%rowtype;
  v_client       clients%rowtype;
  v_vehicle      vehicles%rowtype;
  v_schedule     schedules%rowtype;
  v_stock        office_stock%rowtype;
  v_event_id     uuid := gen_random_uuid();
  v_schedule_id  uuid;
  v_created      boolean := false;
  v_material_id  uuid;
  v_material_ids uuid[] := '{}';
  v_before       jsonb;
  v_stock_before jsonb;
  v_req_updates  jsonb := '[]'::jsonb;
  v_now          timestamptz := now();
  v_today        date := (v_now at time zone 'Asia/Seoul')::date;
  v_amount       integer := (p->>'actualAmount')::integer;
  v_demo         text := nullif(p->>'demoSessionId', '');
  v_origin       text;
  v_sup_box      integer := coalesce((p->'supplied'->>'corrugatedBox')::integer, 0);
  v_sup_plastic  integer := coalesce((p->'supplied'->>'plasticContainer')::integer, 0);
  v_sup_bag      integer := coalesce((p->'supplied'->>'bag')::integer, 0);
  v_sup_needle   integer := coalesce((p->'supplied'->>'needleBox')::integer, 0);
  v_supplied_any boolean;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role = 'client' then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  v_supplied_any := (v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) > 0;
  v_origin := case when v_demo is null then 'field' else 'demo' end;

  select * into v_client from clients where id = (p->>'clientId')::uuid and active;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception '실제 수거량은 0kg보다 커야 합니다.' using errcode = 'P0001';
  end if;

  if coalesce(p->>'actualTime', '') = '' then
    raise exception '실제 수거 시간을 입력해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_vehicle from vehicles where id = (p->>'vehicleId')::uuid;
  if not found then
    raise exception '배차 차량을 선택해 주세요.' using errcode = 'P0001';
  end if;
  if v_vehicle.waste_type <> (p->>'wasteType') then
    raise exception '% 수거에는 % 차량만 배차할 수 있습니다. (선택한 차량: %)',
      p->>'wasteType', p->>'wasteType', v_vehicle.waste_type using errcode = 'P0001';
  end if;

  -- ── 1) 일정 ─────────────────────────────────────────────────────────────
  if coalesce(p->>'scheduleId', '') <> '' then
    select * into v_schedule from schedules where id = (p->>'scheduleId')::uuid for update;
    if not found then
      raise exception '선택한 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_schedule.status = '완료' then
      raise exception '이미 완료 처리된 일정입니다. (중복 완료 방지)' using errcode = 'P0001';
    end if;

    v_before := jsonb_build_object(
      'status', v_schedule.status,
      'actualAmount', v_schedule.actual_amount,
      'handoverStatus', v_schedule.handover_status
    );

    update schedules set
      status = '완료',
      actual_amount = v_amount,
      actual_time = p->>'actualTime',
      completed_at = v_now,
      containers = p->'containers',
      driver_name = p->>'driverName',
      handover_status = p->>'handoverStatus',
      handover_at = case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      memo = coalesce(p->>'memo', ''),
      waste_type = p->>'wasteType',
      vehicle_id = v_vehicle.id,
      event_id = v_event_id,
      origin = v_origin,
      demo_session_id = v_demo,
      updated_by = v_actor.id
    where id = v_schedule.id;

    v_schedule_id := v_schedule.id;
  else
    v_created := true;
    v_before := jsonb_build_object('status', '예정', 'actualAmount', null, 'handoverStatus', null);
    insert into schedules (
      date, client_id, waste_type, vehicle_id, scheduled_time, status,
      expected_amount, actual_amount, actual_time, completed_at, containers,
      driver_name, handover_status, handover_at, memo, event_id, origin,
      demo_session_id, created_by, updated_by
    ) values (
      v_today, v_client.id, p->>'wasteType', v_vehicle.id, p->>'actualTime', '완료',
      v_amount, v_amount, p->>'actualTime', v_now, p->'containers',
      p->>'driverName', p->>'handoverStatus',
      case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      coalesce(p->>'memo', ''), v_event_id, v_origin,
      v_demo, v_actor.id, v_actor.id
    ) returning id into v_schedule_id;
  end if;

  -- ── 2) 재고 차감 ────────────────────────────────────────────────────────
  select * into v_stock from office_stock where id = 1 for update;
  v_stock_before := jsonb_build_object(
    'corrugatedBox', v_stock.corrugated_box,
    'plasticContainer', v_stock.plastic_container,
    'bag', v_stock.bag,
    'needleBox', v_stock.needle_box
  );

  if v_sup_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_sup_box using errcode = 'P0001';
  end if;
  if v_sup_plastic > v_stock.plastic_container then
    raise exception '사무실 합성수지 전용용기 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.plastic_container, v_sup_plastic using errcode = 'P0001';
  end if;
  if v_sup_bag > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_sup_bag using errcode = 'P0001';
  end if;
  if v_sup_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_sup_needle using errcode = 'P0001';
  end if;

  -- ── 3) 자재 공급 이력 + 원장 ────────────────────────────────────────────
  if v_supplied_any then
    insert into materials (
      date, client_id, box_count, vinyl_count, needle_box_count,
      is_additional_request, memo, origin, demo_session_id, created_by
    ) values (
      v_today, v_client.id, v_sup_box, v_sup_bag, v_sup_plastic + v_sup_needle,
      coalesce((p->>'isAdditional')::boolean, false), '수거 완료 시 동시공급',
      v_origin, v_demo, v_actor.id
    ) returning id into v_material_id;

    v_material_ids := array[v_material_id];

    update office_stock set
      corrugated_box    = corrugated_box - v_sup_box,
      plastic_container = plastic_container - v_sup_plastic,
      bag               = bag - v_sup_bag,
      needle_box        = needle_box - v_sup_needle,
      updated_by        = v_actor.id
    where id = 1;

    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '공급', item, -qty, v_client.id, v_material_id, v_event_id, '수거 완료 시 동시공급', v_actor.id
    from (values
      ('corrugatedBox', v_sup_box),
      ('plasticContainer', v_sup_plastic),
      ('bag', v_sup_bag),
      ('needleBox', v_sup_needle)
    ) as t(item, qty)
    where qty > 0;
  end if;

  -- ── 4) 병원 요청 자동 종료 (실제 요청 행을 직접 닫습니다) ───────────────
  v_req_updates := public.close_requests_on_collection(v_client.id, v_supplied_any, v_actor.id, v_now);

  -- ── 5) 감사기록 ────────────────────────────────────────────────────────
  insert into collection_events (
    id, at, actor_id, actor_name, actor_role, screen, action, schedule_id,
    created_schedule, client_id, client_name, waste_type, amount_kg,
    before_state, material_ids, stock_before, request_updates, note,
    demo_session_id, input_duration_ms
  ) values (
    v_event_id, v_now, v_actor.id, v_actor.name, v_actor.role,
    coalesce(p->>'screen', ''), '수거 완료', v_schedule_id,
    v_created, v_client.id, v_client.name, p->>'wasteType', v_amount,
    v_before, v_material_ids, v_stock_before, v_req_updates,
    coalesce(p->>'memo', ''), v_demo,
    nullif(p->>'inputDurationMs', '')::integer
  );

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.complete', 'schedules',
          v_schedule_id::text, v_client.id, v_client.name, coalesce(p->>'screen',''),
          v_before,
          jsonb_build_object('actualAmount', v_amount, 'handoverStatus', p->>'handoverStatus'),
          format('%s 수거 완료 · %skg%s%s', v_client.name, v_amount,
                 case when v_supplied_any then format(' · 자재 %s개 공급',
                   v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) else '' end,
                 case when jsonb_array_length(v_req_updates) > 0
                   then format(' · 병원 요청 %s건 처리', jsonb_array_length(v_req_updates)) else '' end));

  return jsonb_build_object('eventId', v_event_id, 'scheduleId', v_schedule_id, 'createdSchedule', v_created);
end $$;

-- 취소 시 자동으로 닫혔던 병원 요청을 되돌립니다.
create or replace function public.revert_collection(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_e     collection_events%rowtype;
  v_now   timestamptz := now();
  v_stock jsonb;
  r       record;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role = 'client' then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  select * into v_e from collection_events where id = p_event_id for update;

  if found and v_actor.role = 'field' and v_e.actor_id is distinct from v_actor.id then
    raise exception '본인이 입력한 수거만 취소할 수 있습니다.' using errcode = 'P0001';
  end if;
  if not found then
    raise exception '취소할 입력을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_e.reverted then
    raise exception '이미 취소된 입력입니다.' using errcode = 'P0001';
  end if;

  if v_e.created_schedule then
    delete from schedules where id = v_e.schedule_id;
  else
    update schedules set
      status          = coalesce(v_e.before_state->>'status', '예정'),
      actual_amount   = nullif(v_e.before_state->>'actualAmount', '')::integer,
      actual_time     = null,
      completed_at    = null,
      containers      = null,
      driver_name     = null,
      handover_status = nullif(v_e.before_state->>'handoverStatus', ''),
      handover_at     = null,
      event_id        = null,
      updated_by      = v_actor.id
    where id = v_e.schedule_id;
  end if;

  if array_length(v_e.material_ids, 1) is not null then
    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '취소', t.item, t.qty, v_e.client_id, m.id, v_e.id, '수거 완료 취소로 원복', v_actor.id
    from materials m
    cross join lateral (values
      ('corrugatedBox', m.box_count),
      ('bag', m.vinyl_count),
      ('needleBox', m.needle_box_count)
    ) as t(item, qty)
    where m.id = any(v_e.material_ids) and t.qty > 0;

    delete from materials where id = any(v_e.material_ids);
  end if;

  v_stock := v_e.stock_before;
  if v_stock ? 'corrugatedBox' then
    update office_stock set
      corrugated_box    = (v_stock->>'corrugatedBox')::int,
      plastic_container = (v_stock->>'plasticContainer')::int,
      bag               = (v_stock->>'bag')::int,
      needle_box        = (v_stock->>'needleBox')::int,
      updated_by        = v_actor.id
    where id = 1;
  end if;

  -- 자동으로 닫혔던 병원 요청을 다시 열어 둡니다(요청이 사라지지 않도록).
  for r in select value->>'requestId' as rid from jsonb_array_elements(v_e.request_updates)
  loop
    update client_requests
       set status = '접수', handled_by = null, handled_at = null,
           reply = case when reply = '수거 완료로 처리되었습니다.' then '' else reply end
     where id::text = r.rid;
    delete from request_overrides where request_id = r.rid;
  end loop;

  update collection_events set reverted = true, reverted_at = v_now where id = v_e.id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.revert', 'collection_events',
          v_e.id::text, v_e.client_id, v_e.client_name,
          format('%s 수거 완료 취소 · %skg', v_e.client_name, v_e.amount_kg));

  return jsonb_build_object('ok', true);
end $$;

-- 시연 초기화 대상에 병원 요청도 포함합니다.
create or replace function public.reset_demo_records(p_session_id text)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_counts jsonb;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role <> 'admin' then
    raise exception '시연 데이터 초기화는 관리자만 실행할 수 있습니다.' using errcode = 'P0001';
  end if;
  if coalesce(p_session_id, '') = '' then
    raise exception '시연 세션 id 가 필요합니다. (실제 운영 데이터는 초기화할 수 없습니다)'
      using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'schedules', (select count(*) from schedules where demo_session_id = p_session_id),
    'materials', (select count(*) from materials where demo_session_id = p_session_id),
    'events',    (select count(*) from collection_events where demo_session_id = p_session_id),
    'notes',     (select count(*) from site_notes where demo_session_id = p_session_id),
    'leads',     (select count(*) from sales_leads where demo_session_id = p_session_id),
    'requests',  (select count(*) from client_requests where demo_session_id = p_session_id)
  ) into v_counts;

  delete from client_requests  where demo_session_id = p_session_id;
  delete from sales_leads       where demo_session_id = p_session_id;
  delete from site_notes        where demo_session_id = p_session_id;
  delete from collection_events where demo_session_id = p_session_id;
  delete from materials         where demo_session_id = p_session_id;
  delete from schedules         where demo_session_id = p_session_id;
  delete from request_overrides where demo_session_id = p_session_id;
  delete from clients           where demo_session_id = p_session_id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'demo.reset', 'demo_session', p_session_id,
          format('시연 세션 %s 기록 삭제 (실제 운영 데이터 보존)', p_session_id));

  return v_counts;
end $$;

-- ── 7) 권한 ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.client_requests to authenticated;
revoke all on public.client_requests from anon;
grant execute on function public.respond_to_proposal(uuid, boolean) to authenticated;
grant execute on function public.close_requests_on_collection(uuid, boolean, uuid, timestamptz) to authenticated;

-- ══════════════════════════════════════ 0007_integrity.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 · 데이터 무결성 — 중복 수거 차단 · 재고 음수 차단
--
--  실사용 전환 점검(supabase/test/01_verify.sql)에서 실제로 실패한 항목을 막습니다.
--
--  1) 추가 수거(같은 날 한 번 더 방문)가 아예 저장되지 않았습니다.
--     0001 의 schedules_no_duplicate_completion 인덱스가
--     (거래처·날짜·구분) 완료 건을 하루 한 번으로 못박고 있어서,
--     제품이 지원하는 '추가 수거'가 DB 에서 막혔습니다. 그것도 사용자에게는
--     'duplicate key value violates unique constraint' 라는 원문 오류로 보였습니다.
--
--     · 실수로 두 번 저장하는 것은 계속 막아야 합니다
--       (통계·성과의 kg 이 이중 계상됩니다).
--     · 그러나 현장에서 같은 날 한 번 더 방문하는 추가 수거는 정상 업무입니다.
--
--     그래서 '추가 수거로 표시한 건'만 예외인 인덱스로 교체합니다.
--     동시 저장(두 기기에서 같은 순간)은 화면 검사로 막을 수 없으므로 인덱스를
--     최종 방어선으로 두고, 함수에서 읽을 수 있는 한국어 오류를 먼저 냅니다.
--
--  2) 사무실 재고가 음수가 될 수 있었습니다.
--     complete_collection 은 공급 전에 재고를 확인하지만 그 밖의 경로에서는
--     막히지 않았습니다. 컬럼 제약으로 못 박습니다.
--
--  complete_collection 은 0006 의 정의를 그대로 두고 위 두 가지만 덧댄 것입니다.
--  (0006 이 추가한 병원 요청 자동 종료 등은 손대지 않았습니다)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) 추가 수거 표시 ───────────────────────────────────────────────────────
alter table public.schedules
  add column if not exists is_additional boolean not null default false;

comment on column public.schedules.is_additional is
  '추가 수거 여부. 같은 날 같은 거래처를 한 번 더 방문한 건이면 true — 중복 방지 인덱스에서 제외됩니다.';

-- 기존 데이터 보정: 같은 (거래처·날짜·구분) 완료 건이 이미 여럿이면 가장 이른 건만
-- 정규 수거로 두고 나머지를 추가 수거로 표시합니다 (인덱스 생성이 실패하지 않도록).
with ranked as (
  select id,
         row_number() over (
           partition by client_id, date, waste_type
           order by coalesce(completed_at, created_at), id
         ) as rn
  from public.schedules
  where status = '완료'
)
update public.schedules s
   set is_additional = true
  from ranked r
 where s.id = r.id and r.rn > 1 and s.is_additional = false;

-- ── 2) 중복 수거 차단 (최종 방어선) — 추가 수거만 예외 ────────────────────
-- 기존 인덱스는 추가 수거까지 막으므로 걷어내고 아래 것으로 교체합니다.
drop index if exists public.schedules_no_duplicate_completion;

create unique index if not exists schedules_one_completion_per_day
  on public.schedules (client_id, date, waste_type)
  where status = '완료' and is_additional = false;

-- ── 3) 재고 음수 차단 ──────────────────────────────────────────────────────
alter table public.office_stock
  drop constraint if exists office_stock_non_negative;
alter table public.office_stock
  add constraint office_stock_non_negative check (
    corrugated_box >= 0 and plastic_container >= 0 and bag >= 0 and needle_box >= 0
  );

-- ── 4) complete_collection — 0006 정의 + 중복 차단 ─────────────────────────
create or replace function public.complete_collection(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor        profiles%rowtype;
  v_client       clients%rowtype;
  v_vehicle      vehicles%rowtype;
  v_schedule     schedules%rowtype;
  v_stock        office_stock%rowtype;
  v_event_id     uuid := gen_random_uuid();
  v_schedule_id  uuid;
  v_created      boolean := false;
  v_material_id  uuid;
  v_material_ids uuid[] := '{}';
  v_before       jsonb;
  v_stock_before jsonb;
  v_req_updates  jsonb := '[]'::jsonb;
  v_now          timestamptz := now();
  v_today        date := (v_now at time zone 'Asia/Seoul')::date;
  v_amount       integer := (p->>'actualAmount')::integer;
  v_demo         text := nullif(p->>'demoSessionId', '');
  v_origin       text;
  v_sup_box      integer := coalesce((p->'supplied'->>'corrugatedBox')::integer, 0);
  v_sup_plastic  integer := coalesce((p->'supplied'->>'plasticContainer')::integer, 0);
  v_sup_bag      integer := coalesce((p->'supplied'->>'bag')::integer, 0);
  v_sup_needle   integer := coalesce((p->'supplied'->>'needleBox')::integer, 0);
  v_supplied_any boolean;
  -- 0007: 같은 날 재방문(추가 수거)인지 — 중복 저장 차단에서 제외할 근거
  v_additional   boolean := coalesce((p->>'isAdditional')::boolean, false);
  v_dup          uuid;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role = 'client' then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  v_supplied_any := (v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) > 0;
  v_origin := case when v_demo is null then 'field' else 'demo' end;

  select * into v_client from clients where id = (p->>'clientId')::uuid and active;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception '실제 수거량은 0kg보다 커야 합니다.' using errcode = 'P0001';
  end if;

  if coalesce(p->>'actualTime', '') = '' then
    raise exception '실제 수거 시간을 입력해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_vehicle from vehicles where id = (p->>'vehicleId')::uuid;
  if not found then
    raise exception '배차 차량을 선택해 주세요.' using errcode = 'P0001';
  end if;
  if v_vehicle.waste_type <> (p->>'wasteType') then
    raise exception '% 수거에는 % 차량만 배차할 수 있습니다. (선택한 차량: %)',
      p->>'wasteType', p->>'wasteType', v_vehicle.waste_type using errcode = 'P0001';
  end if;

  -- ── 1) 일정 ─────────────────────────────────────────────────────────────
  if coalesce(p->>'scheduleId', '') <> '' then
    select * into v_schedule from schedules where id = (p->>'scheduleId')::uuid for update;
    if not found then
      raise exception '선택한 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_schedule.status = '완료' then
      raise exception '이미 완료 처리된 일정입니다. (중복 완료 방지)' using errcode = 'P0001';
    end if;

    v_before := jsonb_build_object(
      'status', v_schedule.status,
      'actualAmount', v_schedule.actual_amount,
      'handoverStatus', v_schedule.handover_status
    );

    update schedules set
      status = '완료',
      actual_amount = v_amount,
      actual_time = p->>'actualTime',
      completed_at = v_now,
      containers = p->'containers',
      driver_name = p->>'driverName',
      handover_status = p->>'handoverStatus',
      handover_at = case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      memo = coalesce(p->>'memo', ''),
      waste_type = p->>'wasteType',
      vehicle_id = v_vehicle.id,
      event_id = v_event_id,
      origin = v_origin,
      is_additional = v_additional,
      demo_session_id = v_demo,
      updated_by = v_actor.id
    where id = v_schedule.id;

    v_schedule_id := v_schedule.id;
  else
    -- 0007: 일정을 고르지 않고 직접 입력하는 경로에는 중복 검사가 없었습니다.
    --       저장을 두 번 누르면 완료 일정과 수거 이벤트가 두 벌 생겨 kg 이 이중 계상됩니다.
    --       같은 날 한 번 더 방문한 건은 '추가 수거'로 저장하면 그대로 허용됩니다.
    if not v_additional then
      select id into v_dup
        from schedules
       where client_id = v_client.id and date = v_today
         and waste_type = p->>'wasteType'
         and status = '완료' and is_additional = false
       limit 1;
      if v_dup is not null then
        raise exception
          '오늘 % 의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
          v_client.name, p->>'wasteType' using errcode = 'P0001';
      end if;
    end if;

    v_created := true;
    v_before := jsonb_build_object('status', '예정', 'actualAmount', null, 'handoverStatus', null);
    insert into schedules (
      date, client_id, waste_type, vehicle_id, scheduled_time, status,
      expected_amount, actual_amount, actual_time, completed_at, containers,
      driver_name, handover_status, handover_at, memo, event_id, origin,
      is_additional, demo_session_id, created_by, updated_by
    ) values (
      v_today, v_client.id, p->>'wasteType', v_vehicle.id, p->>'actualTime', '완료',
      v_amount, v_amount, p->>'actualTime', v_now, p->'containers',
      p->>'driverName', p->>'handoverStatus',
      case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      coalesce(p->>'memo', ''), v_event_id, v_origin,
      v_additional, v_demo, v_actor.id, v_actor.id
    ) returning id into v_schedule_id;
  end if;

  -- ── 2) 재고 차감 ────────────────────────────────────────────────────────
  select * into v_stock from office_stock where id = 1 for update;
  v_stock_before := jsonb_build_object(
    'corrugatedBox', v_stock.corrugated_box,
    'plasticContainer', v_stock.plastic_container,
    'bag', v_stock.bag,
    'needleBox', v_stock.needle_box
  );

  if v_sup_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_sup_box using errcode = 'P0001';
  end if;
  if v_sup_plastic > v_stock.plastic_container then
    raise exception '사무실 합성수지 전용용기 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.plastic_container, v_sup_plastic using errcode = 'P0001';
  end if;
  if v_sup_bag > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_sup_bag using errcode = 'P0001';
  end if;
  if v_sup_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_sup_needle using errcode = 'P0001';
  end if;

  -- ── 3) 자재 공급 이력 + 원장 ────────────────────────────────────────────
  if v_supplied_any then
    insert into materials (
      date, client_id, box_count, vinyl_count, needle_box_count,
      is_additional_request, memo, origin, demo_session_id, created_by
    ) values (
      v_today, v_client.id, v_sup_box, v_sup_bag, v_sup_plastic + v_sup_needle,
      coalesce((p->>'isAdditional')::boolean, false), '수거 완료 시 동시공급',
      v_origin, v_demo, v_actor.id
    ) returning id into v_material_id;

    v_material_ids := array[v_material_id];

    update office_stock set
      corrugated_box    = corrugated_box - v_sup_box,
      plastic_container = plastic_container - v_sup_plastic,
      bag               = bag - v_sup_bag,
      needle_box        = needle_box - v_sup_needle,
      updated_by        = v_actor.id
    where id = 1;

    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '공급', item, -qty, v_client.id, v_material_id, v_event_id, '수거 완료 시 동시공급', v_actor.id
    from (values
      ('corrugatedBox', v_sup_box),
      ('plasticContainer', v_sup_plastic),
      ('bag', v_sup_bag),
      ('needleBox', v_sup_needle)
    ) as t(item, qty)
    where qty > 0;
  end if;

  -- ── 4) 병원 요청 자동 종료 (실제 요청 행을 직접 닫습니다) ───────────────
  v_req_updates := public.close_requests_on_collection(v_client.id, v_supplied_any, v_actor.id, v_now);

  -- ── 5) 감사기록 ────────────────────────────────────────────────────────
  insert into collection_events (
    id, at, actor_id, actor_name, actor_role, screen, action, schedule_id,
    created_schedule, client_id, client_name, waste_type, amount_kg,
    before_state, material_ids, stock_before, request_updates, note,
    demo_session_id, input_duration_ms
  ) values (
    v_event_id, v_now, v_actor.id, v_actor.name, v_actor.role,
    coalesce(p->>'screen', ''), '수거 완료', v_schedule_id,
    v_created, v_client.id, v_client.name, p->>'wasteType', v_amount,
    v_before, v_material_ids, v_stock_before, v_req_updates,
    coalesce(p->>'memo', ''), v_demo,
    nullif(p->>'inputDurationMs', '')::integer
  );

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.complete', 'schedules',
          v_schedule_id::text, v_client.id, v_client.name, coalesce(p->>'screen',''),
          v_before,
          jsonb_build_object('actualAmount', v_amount, 'handoverStatus', p->>'handoverStatus'),
          format('%s 수거 완료 · %skg%s%s', v_client.name, v_amount,
                 case when v_supplied_any then format(' · 자재 %s개 공급',
                   v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) else '' end,
                 case when jsonb_array_length(v_req_updates) > 0
                   then format(' · 병원 요청 %s건 처리', jsonb_array_length(v_req_updates)) else '' end));

  return jsonb_build_object('eventId', v_event_id, 'scheduleId', v_schedule_id, 'createdSchedule', v_created);
exception
  -- 두 기기에서 같은 순간에 저장하면 사전 검사를 둘 다 통과할 수 있습니다.
  -- 최종 방어선인 부분 UNIQUE 인덱스가 막고, 여기서 사람이 읽을 문장으로 바꿉니다.
  when unique_violation then
    if sqlerrm like '%schedules_one_completion_per_day%' then
      raise exception
        '오늘 이 거래처의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
        p->>'wasteType' using errcode = 'P0001';
    end if;
    raise;
end $$;

comment on function public.complete_collection(jsonb) is
  '수거 완료 통합 처리 — 일정·이력·자재·재고·요청·감사기록을 한 트랜잭션으로 반영합니다. 같은 날 같은 거래처의 중복 저장은 막고, 추가 수거만 예외로 허용합니다.';

-- ══════════════════════════════════════ 0008_guard_message.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 0008. 권한 거부 메시지 정정
--
--  실제 Supabase 에 붙여 병원(client) 계정으로 complete_collection /
--  revert_collection 을 직접 호출해 보니, 차단은 정상이지만 사용자에게
--  "로그인이 필요합니다." 라는 사실과 다른 문구가 전달되고 있었습니다.
--  이미 로그인한 사용자에게 다시 로그인하라고 안내하면 원인을 찾을 수 없습니다.
--
--  차단 동작(어떤 경우에 막히는지)은 그대로 두고 문구만 나눕니다.
--    · 세션이 없거나 비활성 계정  → 로그인이 필요합니다.
--    · 병원 계정                  → 권한 안내
--
--  두 함수 모두 앞부분 가드만 바뀌고 본문 로직은 0007 과 동일합니다.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_collection(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor        profiles%rowtype;
  v_client       clients%rowtype;
  v_vehicle      vehicles%rowtype;
  v_schedule     schedules%rowtype;
  v_stock        office_stock%rowtype;
  v_event_id     uuid := gen_random_uuid();
  v_schedule_id  uuid;
  v_created      boolean := false;
  v_material_id  uuid;
  v_material_ids uuid[] := '{}';
  v_before       jsonb;
  v_stock_before jsonb;
  v_req_updates  jsonb := '[]'::jsonb;
  v_now          timestamptz := now();
  v_today        date := (v_now at time zone 'Asia/Seoul')::date;
  v_amount       integer := (p->>'actualAmount')::integer;
  v_demo         text := nullif(p->>'demoSessionId', '');
  v_origin       text;
  v_sup_box      integer := coalesce((p->'supplied'->>'corrugatedBox')::integer, 0);
  v_sup_plastic  integer := coalesce((p->'supplied'->>'plasticContainer')::integer, 0);
  v_sup_bag      integer := coalesce((p->'supplied'->>'bag')::integer, 0);
  v_sup_needle   integer := coalesce((p->'supplied'->>'needleBox')::integer, 0);
  v_supplied_any boolean;
  -- 0007: 같은 날 재방문(추가 수거)인지 — 중복 저장 차단에서 제외할 근거
  v_additional   boolean := coalesce((p->>'isAdditional')::boolean, false);
  v_dup          uuid;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if v_actor.role = 'client' then
    raise exception '병원 계정에서는 수거 입력을 할 수 없습니다. 비원미래 담당자에게 요청해 주세요.'
      using errcode = 'P0001';
  end if;

  v_supplied_any := (v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) > 0;
  v_origin := case when v_demo is null then 'field' else 'demo' end;

  select * into v_client from clients where id = (p->>'clientId')::uuid and active;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception '실제 수거량은 0kg보다 커야 합니다.' using errcode = 'P0001';
  end if;

  if coalesce(p->>'actualTime', '') = '' then
    raise exception '실제 수거 시간을 입력해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_vehicle from vehicles where id = (p->>'vehicleId')::uuid;
  if not found then
    raise exception '배차 차량을 선택해 주세요.' using errcode = 'P0001';
  end if;
  if v_vehicle.waste_type <> (p->>'wasteType') then
    raise exception '% 수거에는 % 차량만 배차할 수 있습니다. (선택한 차량: %)',
      p->>'wasteType', p->>'wasteType', v_vehicle.waste_type using errcode = 'P0001';
  end if;

  -- ── 1) 일정 ─────────────────────────────────────────────────────────────
  if coalesce(p->>'scheduleId', '') <> '' then
    select * into v_schedule from schedules where id = (p->>'scheduleId')::uuid for update;
    if not found then
      raise exception '선택한 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_schedule.status = '완료' then
      raise exception '이미 완료 처리된 일정입니다. (중복 완료 방지)' using errcode = 'P0001';
    end if;

    v_before := jsonb_build_object(
      'status', v_schedule.status,
      'actualAmount', v_schedule.actual_amount,
      'handoverStatus', v_schedule.handover_status
    );

    update schedules set
      status = '완료',
      actual_amount = v_amount,
      actual_time = p->>'actualTime',
      completed_at = v_now,
      containers = p->'containers',
      driver_name = p->>'driverName',
      handover_status = p->>'handoverStatus',
      handover_at = case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      memo = coalesce(p->>'memo', ''),
      waste_type = p->>'wasteType',
      vehicle_id = v_vehicle.id,
      event_id = v_event_id,
      origin = v_origin,
      is_additional = v_additional,
      demo_session_id = v_demo,
      updated_by = v_actor.id
    where id = v_schedule.id;

    v_schedule_id := v_schedule.id;
  else
    -- 0007: 일정을 고르지 않고 직접 입력하는 경로에는 중복 검사가 없었습니다.
    --       저장을 두 번 누르면 완료 일정과 수거 이벤트가 두 벌 생겨 kg 이 이중 계상됩니다.
    --       같은 날 한 번 더 방문한 건은 '추가 수거'로 저장하면 그대로 허용됩니다.
    if not v_additional then
      select id into v_dup
        from schedules
       where client_id = v_client.id and date = v_today
         and waste_type = p->>'wasteType'
         and status = '완료' and is_additional = false
       limit 1;
      if v_dup is not null then
        raise exception
          '오늘 % 의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
          v_client.name, p->>'wasteType' using errcode = 'P0001';
      end if;
    end if;

    v_created := true;
    v_before := jsonb_build_object('status', '예정', 'actualAmount', null, 'handoverStatus', null);
    insert into schedules (
      date, client_id, waste_type, vehicle_id, scheduled_time, status,
      expected_amount, actual_amount, actual_time, completed_at, containers,
      driver_name, handover_status, handover_at, memo, event_id, origin,
      is_additional, demo_session_id, created_by, updated_by
    ) values (
      v_today, v_client.id, p->>'wasteType', v_vehicle.id, p->>'actualTime', '완료',
      v_amount, v_amount, p->>'actualTime', v_now, p->'containers',
      p->>'driverName', p->>'handoverStatus',
      case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      coalesce(p->>'memo', ''), v_event_id, v_origin,
      v_additional, v_demo, v_actor.id, v_actor.id
    ) returning id into v_schedule_id;
  end if;

  -- ── 2) 재고 차감 ────────────────────────────────────────────────────────
  select * into v_stock from office_stock where id = 1 for update;
  v_stock_before := jsonb_build_object(
    'corrugatedBox', v_stock.corrugated_box,
    'plasticContainer', v_stock.plastic_container,
    'bag', v_stock.bag,
    'needleBox', v_stock.needle_box
  );

  if v_sup_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_sup_box using errcode = 'P0001';
  end if;
  if v_sup_plastic > v_stock.plastic_container then
    raise exception '사무실 합성수지 전용용기 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.plastic_container, v_sup_plastic using errcode = 'P0001';
  end if;
  if v_sup_bag > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_sup_bag using errcode = 'P0001';
  end if;
  if v_sup_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_sup_needle using errcode = 'P0001';
  end if;

  -- ── 3) 자재 공급 이력 + 원장 ────────────────────────────────────────────
  if v_supplied_any then
    insert into materials (
      date, client_id, box_count, vinyl_count, needle_box_count,
      is_additional_request, memo, origin, demo_session_id, created_by
    ) values (
      v_today, v_client.id, v_sup_box, v_sup_bag, v_sup_plastic + v_sup_needle,
      coalesce((p->>'isAdditional')::boolean, false), '수거 완료 시 동시공급',
      v_origin, v_demo, v_actor.id
    ) returning id into v_material_id;

    v_material_ids := array[v_material_id];

    update office_stock set
      corrugated_box    = corrugated_box - v_sup_box,
      plastic_container = plastic_container - v_sup_plastic,
      bag               = bag - v_sup_bag,
      needle_box        = needle_box - v_sup_needle,
      updated_by        = v_actor.id
    where id = 1;

    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '공급', item, -qty, v_client.id, v_material_id, v_event_id, '수거 완료 시 동시공급', v_actor.id
    from (values
      ('corrugatedBox', v_sup_box),
      ('plasticContainer', v_sup_plastic),
      ('bag', v_sup_bag),
      ('needleBox', v_sup_needle)
    ) as t(item, qty)
    where qty > 0;
  end if;

  -- ── 4) 병원 요청 자동 종료 (실제 요청 행을 직접 닫습니다) ───────────────
  v_req_updates := public.close_requests_on_collection(v_client.id, v_supplied_any, v_actor.id, v_now);

  -- ── 5) 감사기록 ────────────────────────────────────────────────────────
  insert into collection_events (
    id, at, actor_id, actor_name, actor_role, screen, action, schedule_id,
    created_schedule, client_id, client_name, waste_type, amount_kg,
    before_state, material_ids, stock_before, request_updates, note,
    demo_session_id, input_duration_ms
  ) values (
    v_event_id, v_now, v_actor.id, v_actor.name, v_actor.role,
    coalesce(p->>'screen', ''), '수거 완료', v_schedule_id,
    v_created, v_client.id, v_client.name, p->>'wasteType', v_amount,
    v_before, v_material_ids, v_stock_before, v_req_updates,
    coalesce(p->>'memo', ''), v_demo,
    nullif(p->>'inputDurationMs', '')::integer
  );

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.complete', 'schedules',
          v_schedule_id::text, v_client.id, v_client.name, coalesce(p->>'screen',''),
          v_before,
          jsonb_build_object('actualAmount', v_amount, 'handoverStatus', p->>'handoverStatus'),
          format('%s 수거 완료 · %skg%s%s', v_client.name, v_amount,
                 case when v_supplied_any then format(' · 자재 %s개 공급',
                   v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) else '' end,
                 case when jsonb_array_length(v_req_updates) > 0
                   then format(' · 병원 요청 %s건 처리', jsonb_array_length(v_req_updates)) else '' end));

  return jsonb_build_object('eventId', v_event_id, 'scheduleId', v_schedule_id, 'createdSchedule', v_created);
exception
  -- 두 기기에서 같은 순간에 저장하면 사전 검사를 둘 다 통과할 수 있습니다.
  -- 최종 방어선인 부분 UNIQUE 인덱스가 막고, 여기서 사람이 읽을 문장으로 바꿉니다.
  when unique_violation then
    if sqlerrm like '%schedules_one_completion_per_day%' then
      raise exception
        '오늘 이 거래처의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
        p->>'wasteType' using errcode = 'P0001';
    end if;
    raise;
end $function$;

CREATE OR REPLACE FUNCTION public.revert_collection(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor profiles%rowtype;
  v_e     collection_events%rowtype;
  v_now   timestamptz := now();
  v_stock jsonb;
  r       record;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if v_actor.role = 'client' then
    raise exception '병원 계정에서는 수거 입력을 할 수 없습니다. 비원미래 담당자에게 요청해 주세요.'
      using errcode = 'P0001';
  end if;

  select * into v_e from collection_events where id = p_event_id for update;

  if found and v_actor.role = 'field' and v_e.actor_id is distinct from v_actor.id then
    raise exception '본인이 입력한 수거만 취소할 수 있습니다.' using errcode = 'P0001';
  end if;
  if not found then
    raise exception '취소할 입력을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_e.reverted then
    raise exception '이미 취소된 입력입니다.' using errcode = 'P0001';
  end if;

  if v_e.created_schedule then
    delete from schedules where id = v_e.schedule_id;
  else
    update schedules set
      status          = coalesce(v_e.before_state->>'status', '예정'),
      actual_amount   = nullif(v_e.before_state->>'actualAmount', '')::integer,
      actual_time     = null,
      completed_at    = null,
      containers      = null,
      driver_name     = null,
      handover_status = nullif(v_e.before_state->>'handoverStatus', ''),
      handover_at     = null,
      event_id        = null,
      updated_by      = v_actor.id
    where id = v_e.schedule_id;
  end if;

  if array_length(v_e.material_ids, 1) is not null then
    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '취소', t.item, t.qty, v_e.client_id, m.id, v_e.id, '수거 완료 취소로 원복', v_actor.id
    from materials m
    cross join lateral (values
      ('corrugatedBox', m.box_count),
      ('bag', m.vinyl_count),
      ('needleBox', m.needle_box_count)
    ) as t(item, qty)
    where m.id = any(v_e.material_ids) and t.qty > 0;

    delete from materials where id = any(v_e.material_ids);
  end if;

  v_stock := v_e.stock_before;
  if v_stock ? 'corrugatedBox' then
    update office_stock set
      corrugated_box    = (v_stock->>'corrugatedBox')::int,
      plastic_container = (v_stock->>'plasticContainer')::int,
      bag               = (v_stock->>'bag')::int,
      needle_box        = (v_stock->>'needleBox')::int,
      updated_by        = v_actor.id
    where id = 1;
  end if;

  -- 자동으로 닫혔던 병원 요청을 다시 열어 둡니다(요청이 사라지지 않도록).
  for r in select value->>'requestId' as rid from jsonb_array_elements(v_e.request_updates)
  loop
    update client_requests
       set status = '접수', handled_by = null, handled_at = null,
           reply = case when reply = '수거 완료로 처리되었습니다.' then '' else reply end
     where id::text = r.rid;
    delete from request_overrides where request_id = r.rid;
  end loop;

  update collection_events set reverted = true, reverted_at = v_now where id = v_e.id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.revert', 'collection_events',
          v_e.id::text, v_e.client_id, v_e.client_name,
          format('%s 수거 완료 취소 · %skg', v_e.client_name, v_e.amount_kg));

  return jsonb_build_object('ok', true);
end $function$;

-- ══════════════════════════════════════ 0009_actor_stamp.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 0009. 작성자·수정자 자동 기록
--
--  실제 Supabase 에 붙여 화면에서 거래처를 등록해 보니 clients.created_by 가
--  비어 있었습니다. complete_collection 처럼 함수를 거치는 경로는 실행자를
--  직접 적어 두지만, 화면에서 바로 INSERT/UPDATE 하는 일반 CRUD 는 아무도
--  채우지 않기 때문입니다.
--
--  감사로그(audit_logs)에는 실행자가 남아 있어 "누가 했는가"는 추적할 수
--  있지만, 행 자체를 봤을 때 작성자를 알 수 없으면 실사 자료로 쓰기 어렵습니다.
--
--  그래서 created_by / updated_by 를 가진 테이블에 트리거 하나를 붙여
--  로그인한 사용자를 자동으로 기록합니다.
--
--    · INSERT — created_by / updated_by 가 비어 있을 때만 채웁니다.
--                (complete_collection 처럼 이미 적어 둔 값은 건드리지 않습니다)
--    · UPDATE — updated_by 를 실행자로 덮고, created_by 는 바꾸지 않습니다.
--
--  auth.uid() 가 없는 경로(서버 배치 등)에서는 아무것도 하지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_has_created boolean;
  v_has_updated boolean;
begin
  if v_actor is null then
    return new;
  end if;

  select
    count(*) filter (where attname = 'created_by') > 0,
    count(*) filter (where attname = 'updated_by') > 0
    into v_has_created, v_has_updated
  from pg_attribute
  where attrelid = tg_relid and attnum > 0 and not attisdropped;

  if tg_op = 'INSERT' then
    if v_has_created then
      new := jsonb_populate_record(
        new,
        jsonb_build_object('created_by', coalesce(to_jsonb(new) ->> 'created_by', v_actor::text))
      );
    end if;
    if v_has_updated then
      new := jsonb_populate_record(
        new,
        jsonb_build_object('updated_by', coalesce(to_jsonb(new) ->> 'updated_by', v_actor::text))
      );
    end if;
  else
    if v_has_updated then
      new := jsonb_populate_record(new, jsonb_build_object('updated_by', v_actor::text));
    end if;
    if v_has_created then
      -- 작성자는 수정으로 바뀌지 않습니다.
      new := jsonb_populate_record(
        new,
        jsonb_build_object('created_by', coalesce(to_jsonb(old) ->> 'created_by', to_jsonb(new) ->> 'created_by'))
      );
    end if;
  end if;

  return new;
end;
$$;

-- created_by / updated_by 를 가진 모든 테이블에 붙입니다 (멱등).
do $$
declare
  r record;
begin
  for r in
    select distinct c.relname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and a.attname in ('created_by', 'updated_by')
       and a.attnum > 0
       and not a.attisdropped
  loop
    execute format('drop trigger if exists %I on public.%I', r.relname || '_stamp_actor', r.relname);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.stamp_actor()',
      r.relname || '_stamp_actor', r.relname
    );
  end loop;
end $$;

-- ══════════════════════════════════════ 0010_request_handler.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 0010. 병원 요청 처리자 자동 기록
--
--  실제 계정으로 병원 요청 왕복(병원 등록 → 사무실 처리 → 병원 확인)을 돌려 보니,
--  화면에서 상태를 바꾸거나 회신을 남겨도 client_requests.handled_by 가 비어
--  있었습니다. handled_at(언제)은 남는데 handled_by(누가)는 남지 않습니다.
--
--  같은 컬럼이 수거 완료 자동처리(complete_collection)에서는 채워지므로,
--  "자동으로 닫힌 요청은 처리자가 있고 사람이 처리한 요청은 없는" 상태였습니다.
--  병원과 주고받은 기록은 실사 자료로 쓰이므로 담당자가 비어 있으면 곤란합니다.
--
--  규칙
--    · 상태나 회신이 바뀔 때, 직원(admin·office·field)이 한 변경이면 기록합니다.
--    · 병원 계정이 자기 요청을 고치는 것은 '처리'가 아니므로 기록하지 않습니다.
--    · 상태를 '접수'로 되돌리는 경우(수거 취소 시 요청 재오픈)는 그대로 비웁니다.
--
--  0009 의 stamp_actor 는 created_by/updated_by 전용이라 이 컬럼은 다루지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_request_handler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role  public.user_role;
begin
  if v_actor is null then
    return new;
  end if;

  -- '접수'로 되돌리는 것은 처리 취소입니다 — 호출자가 넣은 값을 그대로 둡니다.
  if new.status = '접수' then
    return new;
  end if;

  if new.status is not distinct from old.status
     and new.reply is not distinct from old.reply then
    return new;
  end if;

  select role into v_role from public.profiles where id = v_actor and active;
  if v_role is null or v_role = 'client' then
    return new;
  end if;

  new.handled_by := v_actor;
  new.handled_at := coalesce(new.handled_at, now());
  return new;
end;
$$;

drop trigger if exists client_requests_stamp_handler on public.client_requests;
create trigger client_requests_stamp_handler
  before update on public.client_requests
  for each row execute function public.stamp_request_handler();

-- ══════════════════════════════════════ 0011_billing.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 0011. 거래처 계약·단가 + 규격별 자재 공급
--
--  실제로 쓰던 거래처 관리 엑셀(「정산금 세부내역」 / 「거래명세서」)을 흡수하기
--  위해 필요한 최소 컬럼만 추가합니다. 새 테이블은 문서함 하나뿐입니다.
--
--  왜 이 컬럼들이 필요한가
--
--   · 계약기간·결제조건 — 거래명세서의 결제기한이 매달 손으로 적히고 있었습니다.
--     거래처에 한 번 정해 두면 명세서가 알아서 계산합니다.
--   · pricing — 폐기물 kg 단가와 물품 개당 단가. 엑셀에서는 거래처 파일마다
--     같은 단가를 다시 적고 있었습니다.
--   · materials.items — 자재를 규격별로 기록합니다. 63L 박스와 12L 박스는
--     매입가가 3배 차이라(1,045 vs 341) 규격 없이는 원가를 낼 수 없습니다.
--     기존 3칸(box_count/vinyl_count/needle_box_count)은 화면·통계 호환을 위해
--     그대로 두고 합계로 유지합니다.
--
--  단가는 왜 별도 테이블이 아니라 jsonb 인가
--   품목이 10개 안팎이고 항상 거래처 단위로 통째로 읽고 씁니다.
--   행으로 쪼개면 조회 때마다 조인이 붙고 얻는 게 없습니다.
--   단가 이력이 필요해지면 그때 테이블로 분리합니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 거래처 계약 ──────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists contract_start   date,
  add column if not exists contract_end     date,
  add column if not exists payment_terms    text not null default '',
  add column if not exists payment_due_day  integer,
  add column if not exists monthly_flat_fee integer,
  add column if not exists pricing          jsonb;

-- 결제일은 익월 며칠 — 1~31 을 벗어난 값은 실수입니다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_payment_due_day_check') then
    alter table public.clients
      add constraint clients_payment_due_day_check
      check (payment_due_day is null or (payment_due_day between 1 and 31));
  end if;
end $$;

-- 계약 종료일이 시작일보다 앞설 수 없습니다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_contract_period_check') then
    alter table public.clients
      add constraint clients_contract_period_check
      check (contract_start is null or contract_end is null or contract_end >= contract_start);
  end if;
end $$;

-- 계약 만료 조회용 (향후 만료 알림)
create index if not exists clients_contract_end_idx
  on public.clients (contract_end)
  where contract_end is not null;

-- ── 규격별 자재 공급 ─────────────────────────────────────────────────────────
alter table public.materials
  add column if not exists items jsonb;

comment on column public.materials.items is
  '규격별 공급 수량. 예: {"box63":180,"box12":400,"plastic20":30}. 정산·거래명세서가 이 값을 사용합니다.';

-- ── 거래처 문서함 ────────────────────────────────────────────────────────────
--
--  사업자등록증·폐기물처리계획증명서·계약서 등을 거래처에 연결합니다.
--  파일 자체는 Supabase Storage 에 올리고 여기에는 경로만 남깁니다.
--  (Storage 버킷 생성과 업로드 정책은 실제 프로젝트 연결 후 별도로 진행합니다)
create table if not exists public.client_documents (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  kind        text not null,
  title       text not null default '',
  /** Storage 객체 경로 (버킷 내부 경로). 아직 업로드 전이면 null */
  storage_path text,
  /** 문서 자체의 유효기간 — 증명서류는 갱신이 필요합니다 */
  valid_until date,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  constraint client_documents_kind_check check (
    kind = any (array['사업자등록증', '폐기물처리계획증명서', '계약서', '단가표', '기타'])
  )
);

create index if not exists client_documents_client_idx
  on public.client_documents (client_id, kind);

alter table public.client_documents enable row level security;

-- 직원은 읽고 쓰고, 삭제는 관리자만. 병원 계정은 접근하지 않습니다.
drop policy if exists client_documents_read on public.client_documents;
create policy client_documents_read on public.client_documents
  for select using (public.is_active_user());

drop policy if exists client_documents_write on public.client_documents;
create policy client_documents_write on public.client_documents
  for insert with check (public.is_staff());

drop policy if exists client_documents_update on public.client_documents;
create policy client_documents_update on public.client_documents
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists client_documents_delete on public.client_documents;
create policy client_documents_delete on public.client_documents
  for delete using (public.is_admin());

grant select, insert, update, delete on public.client_documents to authenticated;

-- 0009 의 작성자 자동 기록 트리거를 새 테이블에도 붙입니다.
drop trigger if exists client_documents_stamp_actor on public.client_documents;
create trigger client_documents_stamp_actor
  before insert or update on public.client_documents
  for each row execute function public.stamp_actor();

drop trigger if exists client_documents_touch on public.client_documents;
create trigger client_documents_touch
  before update on public.client_documents
  for each row execute function public.touch_updated_at();

-- ── 수거 완료 시 규격별 공급 기록 ────────────────────────────────────────────
--
--  complete_collection 은 자재 공급 행을 만들 때 3칸만 채우고 있었습니다.
--  화면에서 규격별로 입력한 값(p->'suppliedItems')을 그대로 items 에 남겨야
--  정산이 규격 단가로 계산할 수 있습니다. 재고 차감은 지금처럼 4칸 기준입니다.

CREATE OR REPLACE FUNCTION public.complete_collection(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor        profiles%rowtype;
  v_client       clients%rowtype;
  v_vehicle      vehicles%rowtype;
  v_schedule     schedules%rowtype;
  v_stock        office_stock%rowtype;
  v_event_id     uuid := gen_random_uuid();
  v_schedule_id  uuid;
  v_created      boolean := false;
  v_material_id  uuid;
  v_material_ids uuid[] := '{}';
  v_before       jsonb;
  v_stock_before jsonb;
  v_req_updates  jsonb := '[]'::jsonb;
  v_now          timestamptz := now();
  v_today        date := (v_now at time zone 'Asia/Seoul')::date;
  v_amount       integer := (p->>'actualAmount')::integer;
  v_demo         text := nullif(p->>'demoSessionId', '');
  v_origin       text;
  v_sup_box      integer := coalesce((p->'supplied'->>'corrugatedBox')::integer, 0);
  v_sup_plastic  integer := coalesce((p->'supplied'->>'plasticContainer')::integer, 0);
  v_sup_bag      integer := coalesce((p->'supplied'->>'bag')::integer, 0);
  v_sup_needle   integer := coalesce((p->'supplied'->>'needleBox')::integer, 0);
  v_supplied_any boolean;
  -- 0007: 같은 날 재방문(추가 수거)인지 — 중복 저장 차단에서 제외할 근거
  v_additional   boolean := coalesce((p->>'isAdditional')::boolean, false);
  v_dup          uuid;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if v_actor.role = 'client' then
    raise exception '병원 계정에서는 수거 입력을 할 수 없습니다. 비원미래 담당자에게 요청해 주세요.'
      using errcode = 'P0001';
  end if;

  v_supplied_any := (v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) > 0;
  v_origin := case when v_demo is null then 'field' else 'demo' end;

  select * into v_client from clients where id = (p->>'clientId')::uuid and active;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception '실제 수거량은 0kg보다 커야 합니다.' using errcode = 'P0001';
  end if;

  if coalesce(p->>'actualTime', '') = '' then
    raise exception '실제 수거 시간을 입력해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_vehicle from vehicles where id = (p->>'vehicleId')::uuid;
  if not found then
    raise exception '배차 차량을 선택해 주세요.' using errcode = 'P0001';
  end if;
  if v_vehicle.waste_type <> (p->>'wasteType') then
    raise exception '% 수거에는 % 차량만 배차할 수 있습니다. (선택한 차량: %)',
      p->>'wasteType', p->>'wasteType', v_vehicle.waste_type using errcode = 'P0001';
  end if;

  -- ── 1) 일정 ─────────────────────────────────────────────────────────────
  if coalesce(p->>'scheduleId', '') <> '' then
    select * into v_schedule from schedules where id = (p->>'scheduleId')::uuid for update;
    if not found then
      raise exception '선택한 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_schedule.status = '완료' then
      raise exception '이미 완료 처리된 일정입니다. (중복 완료 방지)' using errcode = 'P0001';
    end if;

    v_before := jsonb_build_object(
      'status', v_schedule.status,
      'actualAmount', v_schedule.actual_amount,
      'handoverStatus', v_schedule.handover_status
    );

    update schedules set
      status = '완료',
      actual_amount = v_amount,
      actual_time = p->>'actualTime',
      completed_at = v_now,
      containers = p->'containers',
      driver_name = p->>'driverName',
      handover_status = p->>'handoverStatus',
      handover_at = case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      memo = coalesce(p->>'memo', ''),
      waste_type = p->>'wasteType',
      vehicle_id = v_vehicle.id,
      event_id = v_event_id,
      origin = v_origin,
      is_additional = v_additional,
      demo_session_id = v_demo,
      updated_by = v_actor.id
    where id = v_schedule.id;

    v_schedule_id := v_schedule.id;
  else
    -- 0007: 일정을 고르지 않고 직접 입력하는 경로에는 중복 검사가 없었습니다.
    --       저장을 두 번 누르면 완료 일정과 수거 이벤트가 두 벌 생겨 kg 이 이중 계상됩니다.
    --       같은 날 한 번 더 방문한 건은 '추가 수거'로 저장하면 그대로 허용됩니다.
    if not v_additional then
      select id into v_dup
        from schedules
       where client_id = v_client.id and date = v_today
         and waste_type = p->>'wasteType'
         and status = '완료' and is_additional = false
       limit 1;
      if v_dup is not null then
        raise exception
          '오늘 % 의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
          v_client.name, p->>'wasteType' using errcode = 'P0001';
      end if;
    end if;

    v_created := true;
    v_before := jsonb_build_object('status', '예정', 'actualAmount', null, 'handoverStatus', null);
    insert into schedules (
      date, client_id, waste_type, vehicle_id, scheduled_time, status,
      expected_amount, actual_amount, actual_time, completed_at, containers,
      driver_name, handover_status, handover_at, memo, event_id, origin,
      is_additional, demo_session_id, created_by, updated_by
    ) values (
      v_today, v_client.id, p->>'wasteType', v_vehicle.id, p->>'actualTime', '완료',
      v_amount, v_amount, p->>'actualTime', v_now, p->'containers',
      p->>'driverName', p->>'handoverStatus',
      case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      coalesce(p->>'memo', ''), v_event_id, v_origin,
      v_additional, v_demo, v_actor.id, v_actor.id
    ) returning id into v_schedule_id;
  end if;

  -- ── 2) 재고 차감 ────────────────────────────────────────────────────────
  select * into v_stock from office_stock where id = 1 for update;
  v_stock_before := jsonb_build_object(
    'corrugatedBox', v_stock.corrugated_box,
    'plasticContainer', v_stock.plastic_container,
    'bag', v_stock.bag,
    'needleBox', v_stock.needle_box
  );

  if v_sup_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_sup_box using errcode = 'P0001';
  end if;
  if v_sup_plastic > v_stock.plastic_container then
    raise exception '사무실 합성수지 전용용기 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.plastic_container, v_sup_plastic using errcode = 'P0001';
  end if;
  if v_sup_bag > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_sup_bag using errcode = 'P0001';
  end if;
  if v_sup_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_sup_needle using errcode = 'P0001';
  end if;

  -- ── 3) 자재 공급 이력 + 원장 ────────────────────────────────────────────
  if v_supplied_any then
    insert into materials (
      date, client_id, box_count, vinyl_count, needle_box_count,
      is_additional_request, memo, origin, demo_session_id, created_by, items
    ) values (
      v_today, v_client.id, v_sup_box, v_sup_bag, v_sup_plastic + v_sup_needle,
      coalesce((p->>'isAdditional')::boolean, false), '수거 완료 시 동시공급',
      v_origin, v_demo, v_actor.id,
      -- 0011: 규격별 공급 수량. 정산·거래명세서가 이 값으로 단가를 적용합니다.
      nullif(p->'suppliedItems', 'null'::jsonb)
    ) returning id into v_material_id;

    v_material_ids := array[v_material_id];

    update office_stock set
      corrugated_box    = corrugated_box - v_sup_box,
      plastic_container = plastic_container - v_sup_plastic,
      bag               = bag - v_sup_bag,
      needle_box        = needle_box - v_sup_needle,
      updated_by        = v_actor.id
    where id = 1;

    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '공급', item, -qty, v_client.id, v_material_id, v_event_id, '수거 완료 시 동시공급', v_actor.id
    from (values
      ('corrugatedBox', v_sup_box),
      ('plasticContainer', v_sup_plastic),
      ('bag', v_sup_bag),
      ('needleBox', v_sup_needle)
    ) as t(item, qty)
    where qty > 0;
  end if;

  -- ── 4) 병원 요청 자동 종료 (실제 요청 행을 직접 닫습니다) ───────────────
  v_req_updates := public.close_requests_on_collection(v_client.id, v_supplied_any, v_actor.id, v_now);

  -- ── 5) 감사기록 ────────────────────────────────────────────────────────
  insert into collection_events (
    id, at, actor_id, actor_name, actor_role, screen, action, schedule_id,
    created_schedule, client_id, client_name, waste_type, amount_kg,
    before_state, material_ids, stock_before, request_updates, note,
    demo_session_id, input_duration_ms
  ) values (
    v_event_id, v_now, v_actor.id, v_actor.name, v_actor.role,
    coalesce(p->>'screen', ''), '수거 완료', v_schedule_id,
    v_created, v_client.id, v_client.name, p->>'wasteType', v_amount,
    v_before, v_material_ids, v_stock_before, v_req_updates,
    coalesce(p->>'memo', ''), v_demo,
    nullif(p->>'inputDurationMs', '')::integer
  );

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.complete', 'schedules',
          v_schedule_id::text, v_client.id, v_client.name, coalesce(p->>'screen',''),
          v_before,
          jsonb_build_object('actualAmount', v_amount, 'handoverStatus', p->>'handoverStatus'),
          format('%s 수거 완료 · %skg%s%s', v_client.name, v_amount,
                 case when v_supplied_any then format(' · 자재 %s개 공급',
                   v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) else '' end,
                 case when jsonb_array_length(v_req_updates) > 0
                   then format(' · 병원 요청 %s건 처리', jsonb_array_length(v_req_updates)) else '' end));

  return jsonb_build_object('eventId', v_event_id, 'scheduleId', v_schedule_id, 'createdSchedule', v_created);
exception
  -- 두 기기에서 같은 순간에 저장하면 사전 검사를 둘 다 통과할 수 있습니다.
  -- 최종 방어선인 부분 UNIQUE 인덱스가 막고, 여기서 사람이 읽을 문장으로 바꿉니다.
  when unique_violation then
    if sqlerrm like '%schedules_one_completion_per_day%' then
      raise exception
        '오늘 이 거래처의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
        p->>'wasteType' using errcode = 'P0001';
    end if;
    raise;
end $function$;
