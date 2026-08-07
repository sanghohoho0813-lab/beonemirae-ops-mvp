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
