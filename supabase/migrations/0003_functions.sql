-- ─────────────────────────────────────────────────────────────────────────────
-- 수거 완료 통합 커맨드 (핵심 1) — DB 트랜잭션
--
--  현장에서 "한 번" 입력한 수거정보가 아래를 한 트랜잭션 안에서 처리합니다.
--   일정 완료(또는 생성) → 수거이력 → 자재 공급 → 재고 차감 → 자재 원장
--   → 병원 요청 자동 종료 → 감사기록(collection_events)
--
--  Postgres 함수는 단일 트랜잭션에서 실행되므로, 중간에 raise exception 이
--  발생하면 앞선 변경이 전부 롤백됩니다. "일부만 저장되는 상태"가 없습니다.
--
--  동시성: 대상 일정과 재고 행을 FOR UPDATE 로 잠가, 두 직원이 동시에 같은
--  일정을 완료하거나 재고를 초과 차감하는 것을 막습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.complete_collection(p jsonb)
returns jsonb
language plpgsql
security invoker            -- 호출자의 RLS 를 그대로 적용합니다.
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
  r              record;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  v_supplied_any := (v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) > 0;
  v_origin := case when v_demo is null then 'field' else 'demo' end;

  -- ── 검증 ────────────────────────────────────────────────────────────────
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

  -- ── 1) 일정: 기존 예정 완료 처리 또는 직접 입력 시 신규 완료 일정 생성 ──
  if coalesce(p->>'scheduleId', '') <> '' then
    -- FOR UPDATE: 다른 직원이 동시에 같은 일정을 완료하지 못하게 잠급니다.
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

  -- ── 2) 재고 차감 (행 잠금 후 확인 → 초과 차감 불가) ─────────────────────
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

  -- ── 4) 병원 요청 자동 종료 (긴급수거 / 자재공급 요청) ──────────────────
  --     요청 목록은 파생 계산이라 프론트에서 대상 id 를 넘겨줍니다.
  if jsonb_typeof(p->'closeRequests') = 'array' then
    for r in select value->>'requestId' as rid, value->>'from' as from_status
             from jsonb_array_elements(p->'closeRequests')
    loop
      insert into request_overrides (request_id, status, changed_at, by, demo_session_id, updated_by)
      values (r.rid, '처리 완료', v_now, '수거 완료 자동 반영', v_demo, v_actor.id)
      on conflict (request_id) do update
        set status = '처리 완료', changed_at = v_now,
            by = '수거 완료 자동 반영', updated_by = v_actor.id;
      v_req_updates := v_req_updates || jsonb_build_object(
        'requestId', r.rid, 'from', r.from_status, 'to', '처리 완료');
    end loop;
  end if;

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
          format('%s 수거 완료 · %skg%s', v_client.name, v_amount,
                 case when v_supplied_any then format(' · 자재 %s개 공급',
                   v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) else '' end));

  return jsonb_build_object('eventId', v_event_id, 'scheduleId', v_schedule_id, 'createdSchedule', v_created);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 수거 완료 취소 — 일정/자재/재고/요청을 원복하고 감사기록은 유지합니다.
-- ─────────────────────────────────────────────────────────────────────────────
-- security definer 인 이유:
--  취소는 자재 공급 이력을 되돌려야 하는데, materials 에 DELETE 정책을 열어 주면
--  누구나 임의의 자재 기록을 지울 수 있게 됩니다. 그래서 정책을 넓히는 대신
--  이 함수 안에서만 정리하고, 권한 검사는 아래에서 직접 수행합니다.
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
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  select * into v_e from collection_events where id = p_event_id for update;

  -- 현장 담당자는 본인이 입력한 건만 취소할 수 있습니다.
  -- (관리자·사무실은 다른 사람의 입력도 정정할 수 있어야 합니다)
  if found and v_actor.role = 'field' and v_e.actor_id is distinct from v_actor.id then
    raise exception '본인이 입력한 수거만 취소할 수 있습니다.' using errcode = 'P0001';
  end if;
  if not found then
    raise exception '취소할 입력을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_e.reverted then
    raise exception '이미 취소된 입력입니다.' using errcode = 'P0001';
  end if;

  -- 1) 일정 원복
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

  -- 2) 자재 이력 제거 — 되돌린 공급분을 원장에 '취소'로 남기고 삭제합니다.
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

  -- 3) 재고 복원 — 이벤트에 기록해 둔 차감 전 재고로 되돌립니다.
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

  -- 4) 요청 오버라이드 원복
  for r in select value->>'requestId' as rid from jsonb_array_elements(v_e.request_updates)
  loop
    delete from request_overrides where request_id = r.rid;
  end loop;

  -- 5) 감사기록은 삭제하지 않고 취소 표시
  update collection_events set reverted = true, reverted_at = v_now where id = v_e.id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.revert', 'collection_events',
          v_e.id::text, v_e.client_id, v_e.client_name,
          format('%s 수거 완료 취소 · %skg', v_e.client_name, v_e.amount_kg));

  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 시연 데이터 초기화 — demo_session_id 가 있는 기록만 정리합니다.
-- 실제 운영 데이터(demo_session_id is null)는 절대 건드리지 않습니다.
-- 관리자만 실행할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────
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
    'leads',     (select count(*) from sales_leads where demo_session_id = p_session_id)
  ) into v_counts;

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
