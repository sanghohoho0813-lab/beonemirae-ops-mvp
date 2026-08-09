-- ─────────────────────────────────────────────────────────────────────────────
-- 0013. 공급 수량 음수 차단 — 없던 재고가 생기는 구멍
--
--  실제 운영 DB 에 동시성·무결성 검사를 돌리다 찾았습니다.
--
--  complete_collection 은 "공급이 있었는가"를 네 수량의 합으로 판단합니다.
--  그래서 음수를 섞으면 합은 양수인데 개별 값은 음수인 상태가 통과합니다.
--
--    supplied = { corrugatedBox: -3, plasticContainer: 10 }
--      → 합계 7 > 0 이므로 "공급 있음"
--      → 재고 차감식이  corrugated_box - (-3)  이 되어 골판지가 3개 늘어남
--      → 원장은 qty > 0 만 기록하므로 그 3개는 어디에도 안 남음
--
--  실측: 골판지 200 → 203, materials.box_count = -3, 원장에는 골판지 없음.
--  재고와 원장이 어긋난 채로 굳고, 나중에 실사할 때 원인을 찾을 수 없습니다.
--
--  화면은 음수를 못 만들지만(QtyField 는 0 이 하한), 토큰만 있으면 화면을
--  거치지 않고 보낼 수 있습니다. DB 함수가 최종 방어선인데 그것이 비어 있었습니다.
--
--  고치는 것 두 가지
--   1) 함수에서 음수를 사람이 읽을 문장으로 거절합니다 (규격별 items 포함).
--   2) materials 에도 CHECK 를 겁니다 — 함수를 거치지 않는 경로가 생기더라도
--      음수 자재 기록이 테이블에 남지 않도록.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) 테이블 차원의 최종 방어선 ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_counts_non_negative') then
    alter table public.materials
      add constraint materials_counts_non_negative
      check (box_count >= 0 and vinyl_count >= 0 and needle_box_count >= 0);
  end if;
end $$;

comment on constraint materials_counts_non_negative on public.materials is
  '공급 수량은 음수일 수 없습니다 (0013). 음수가 들어오면 재고가 늘어나는 방향으로 반영됩니다.';

-- ── 2) 수거 완료 함수 — 음수 공급을 사람이 읽을 문장으로 거절 ────────────────
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

  -- 0013: 공급 수량은 음수일 수 없습니다.
  --
  --  실제 운영 DB 를 찔러 보다 찾은 구멍입니다. 아래처럼 음수를 섞어 보내면
  --    supplied = { corrugatedBox: -3, plasticContainer: 10 }
  --  합계가 7 이라 "공급이 있다"로 판단되고, 재고 차감식이
  --    corrugated_box = corrugated_box - (-3)
  --  이 되어 골판지 재고가 3개 늘어납니다. 창고에 없던 물건이 생깁니다.
  --  게다가 원장(material_transactions)은 qty > 0 인 항목만 남기므로 그 3개는
  --  기록조차 되지 않습니다. 재고와 원장이 어긋난 채로 굳습니다.
  --
  --  화면(QtyField)은 0 미만을 못 만들지만, DB 함수가 최종 방어선입니다.
  --  토큰만 있으면 화면을 거치지 않고 바로 보낼 수 있습니다.
  if v_sup_box < 0 or v_sup_plastic < 0 or v_sup_bag < 0 or v_sup_needle < 0 then
    raise exception '공급 수량은 0보다 작을 수 없습니다. (골판지 % · 합성수지 % · 봉투 % · 바늘통 %)',
      v_sup_box, v_sup_plastic, v_sup_bag, v_sup_needle using errcode = 'P0001';
  end if;

  -- 규격별 수량(items)도 같습니다. 이 값이 그대로 정산 단가에 곱해지므로
  -- 음수가 들어가면 매출·원가가 마이너스로 잡힙니다.
  if jsonb_typeof(p->'suppliedItems') = 'object' then
    if exists (
      select 1 from jsonb_each_text(p->'suppliedItems') as t(k, v)
       where v ~ '^-' and (v)::numeric < 0
    ) then
      raise exception '규격별 공급 수량은 0보다 작을 수 없습니다.' using errcode = 'P0001';
    end if;
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

comment on function public.complete_collection(jsonb) is
  '수거 완료 통합 처리 — 일정·이력·자재·재고·요청·감사기록을 한 트랜잭션으로 반영합니다. 같은 날 중복 저장은 막고 추가 수거만 허용하며, 공급 수량은 음수를 거절합니다 (0013).';
