-- ═══════════════════════════════════════════════════════════════════════════
--  0070 (제안) — 테스트자료 표시 · 호차 고정 · 3.5톤 등록과 예약 · 차량 구분 해제
--
--  ⚠ 아직 **실행하지 않았습니다.** 운영 자료의 이름을 바꾸고 권한 규칙을
--     손대는 SQL이라, 대표님이 읽어 보시고 직접 실행하시도록 남깁니다.
--
--  ⚠⚠ **0067 을 먼저 실행하셔야 합니다.** 이 파일의 ③ book_visit 은 0067 의
--      내용을 이어받습니다. 0067 없이 이것만 실행하면 방문 목적(정기/추가/
--      긴급)이 빠진 옛 함수로 되돌아갑니다.
--
--  ── 무엇이 바뀌나 ────────────────────────────────────────────────────────
--
--   A. 테스트로 만든 자료 앞에 **[Test용]** 을 붙입니다 (지우지 않습니다)
--   B. 기사님별 **담당 호차 고정** — 백광호 1 · 김진환 2 · 김준기 3 · 오대성 4
--   C. **3.5톤 트럭**을 차량으로 등록합니다 (본사 대기 · 공용)
--   D. **차량 구분 검사 해제** — 어느 차로든 어느 폐기물이든 저장됩니다
--   E. **차량 예약** 표와 함수 — 3.5톤을 누가 언제 쓰는지 서로 보이게
--
--  ── ⚠ D 는 잃는 것이 있습니다. 꼭 읽어 주세요 ────────────────────────────
--
--   지금까지 「기저귀 차에 의료폐기물을 실었다」는 **저장 단계에서 막혔습니다.**
--   그 검사 옆에는 **「법으로 분리 운행입니다」**라고 적혀 있었습니다.
--   없애 달라고 하셔서 없앱니다. 없애면:
--     · 어떤 차로 무엇을 실어도 그대로 저장됩니다.
--     · 무엇을 실었는지는 수거 기록에 그대로 남으므로 나중에 대조는 됩니다.
--     · 앱에서는 **막지 않되 「구분이 다릅니다」라고 한 줄 알려 줍니다**
--       (저장은 그대로 됩니다). 이것도 필요 없으시면 말씀해 주세요.
--   되돌리는 SQL 은 맨 아래에 있습니다.
--
--  ── 기존 데이터에 미치는 영향 ────────────────────────────────────────────
--   · 수거·자재·청구·입금 **금액 기록은 한 줄도 안 바뀝니다.**
--   · A 는 이름(text)만 바꿉니다. id 가 그대로라 연결된 기록도 그대로입니다.
--   · B 는 profiles.vehicle_id 네 줄. C 는 vehicles 한 줄 추가.
--   · E 는 표를 하나 새로 만듭니다 (기존 표 안 건드림).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── A. 테스트 자료에 [Test용] 붙이기 ───────────────────────────────────────
--
--   ⚠ 지우지 않습니다. 지우면 그 자료로 남긴 기록의 주인이 사라집니다.
--     **이름만** 바꿔서, 화면 어디에서 보든 한눈에 갈리게 합니다.
--   ⚠ 이미 붙어 있는 것은 다시 붙이지 않습니다 (여러 번 실행해도 안전).

update public.clients
   set name = '[Test용]' || regexp_replace(name, '^\[검증\]\s*', ''), updated_at = now()
 where name like '[검증]%' and name not like '[Test용]%';

update public.vehicles
   set name = '[Test용]' || regexp_replace(name, '^\[검증\]\s*', ''), updated_at = now()
 where name like '[검증]%' and name not like '[Test용]%';

--  검증용 차량은 배차 목록에서 내립니다 — 목록에 남아 있으면 눌립니다.
update public.vehicles set active = false, updated_at = now()
 where name like '[Test용]%' and active;

--  로그인 계정 — 「[검증]…」과 「…(테스트용)」
update public.profiles
   set name = '[Test용]' || regexp_replace(name, '^\[검증\]\s*', '')
 where name like '[검증]%' and name not like '[Test용]%';

update public.profiles
   set name = '[Test용]' || name
 where (name ilike '%테스트%' or name ilike '%test%')
   and name not like '[Test용]%';

--  직원 명부에도 같은 규칙
update public.staff
   set name = '[Test용]' || regexp_replace(name, '^\[검증\]\s*', ''), updated_at = now()
 where (name like '[검증]%' or name ilike '%테스트%' or name ilike '%test%')
   and name not like '[Test용]%';

-- ── B. 담당 호차 고정 ──────────────────────────────────────────────────────
--
--   출생연도 순입니다 (대표님 안내). 이름으로 찾습니다 — 못 찾으면 그 줄은
--   그냥 넘어갑니다. 실행 뒤 아래 확인표에서 네 명이 다 붙었는지 보세요.
--   ⚠ [Test용] 이 붙은 계정에는 차를 배정하지 않습니다.

update public.profiles p set vehicle_id = v.id
  from public.vehicles v
 where v.name = '1호차' and p.name = '백광호' and p.name not like '[Test용]%';
update public.profiles p set vehicle_id = v.id
  from public.vehicles v
 where v.name = '2호차' and p.name = '김진환' and p.name not like '[Test용]%';
update public.profiles p set vehicle_id = v.id
  from public.vehicles v
 where v.name = '3호차' and p.name = '김준기' and p.name not like '[Test용]%';
update public.profiles p set vehicle_id = v.id
  from public.vehicles v
 where v.name = '4호차' and p.name = '오대성' and p.name not like '[Test용]%';

-- ── C. 3.5톤 트럭 등록 ─────────────────────────────────────────────────────
--
--   본사 앞에 늘 서 있고, 필요한 분이 가서 몰고 나가는 공용차입니다.
--   ⚠ waste_type 칸은 표에서 못 비웁니다(반드시 하나를 적어야 합니다).
--     D 에서 구분 검사를 없애므로 **무엇을 실어도 막히지 않습니다.**
--     여기 적힌 값은 이제 「이 차의 주 용도」 정도의 표시일 뿐입니다.

insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver, active)
select '3.5톤 (공용)', '의료폐기물', 3.5, 3500, 2800, '', true
 where not exists (select 1 from public.vehicles where name = '3.5톤 (공용)');

-- ── ① 수거 저장 — 차량 구분 검사 제거 ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_collection(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor        profiles%rowtype;
  --  ⚠ 0063 부터 clients 의 **돈 칸은 authenticated 가 못 읽습니다.**
  --    이 함수는 security definer 가 아니라 부르는 사람 권한으로 돕니다.
  --    그래서 `clients%rowtype` 으로 통째로 받으면 기사 계정에서
  --    「permission denied」가 나서 **수거 저장 자체가 막힙니다.**
  --    실제로 쓰는 것은 id 와 name 둘뿐이라 그 둘만 받습니다.
  v_client       record;
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
  --  0061 — 실제로 다녀온 **날**. 안 보내면 오늘입니다.
  v_date         date := coalesce(nullif(p->>'date','')::date, (v_now at time zone 'Asia/Seoul')::date);
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

  select id, name into v_client from clients where id = (p->>'clientId')::uuid and active;
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
  --  0070 — 차량 구분으로 막지 않습니다 (대표님 지시).
  --  ⚠ 이 자리에 있던 검사는 「기저귀 차에 의료폐기물을 실었다」를 **저장 단계에서
  --    막던** 것입니다. 없애면 그대로 저장됩니다. 무엇을 실었는지는
  --    수거 기록(waste_type)에 그대로 남으므로, 나중에 대조는 가능합니다.

  --  ── 0061 · 다녀온 날 ──────────────────────────────────────────────────
  --
  --   지금까지 직접 입력은 **무조건 오늘 날짜로** 저장했습니다. 기사님이
  --   저녁에, 또는 다음 날 아침에 넣으면 날짜가 하루 밀립니다. 평소에는
  --   기록만 어긋나지만 **월말에는 돈이 틀립니다** — 31일 수거를 1일에
  --   넣으면 그 달 청구에서 빠지고 다음 달에 붙습니다. 하루치 수거가
  --   통째로 다른 달로 갑니다.
  --
  --   그래서 날짜를 받되, 아래 셋을 서버가 막습니다.
  if v_date > v_today then
    raise exception '아직 오지 않은 날(%)에 다녀왔다고 기록할 수 없습니다.', v_date
      using errcode = 'P0001';
  end if;
  if v_date < v_today - 45 then
    raise exception '너무 오래된 날짜(%)입니다. 45일 앞까지만 넣습니다 — 지난 기록은 엑셀 가져오기로 넣어 주세요.', v_date
      using errcode = 'P0001';
  end if;
  --  ⚠ 제일 중요한 방어입니다. 이미 청구를 확정한 달에 수거를 더 넣으면
  --    **실적과 청구액이 어긋납니다.** 병원에 나간 청구서에는 없는 수거가
  --    장부에만 생깁니다. 정말 넣어야 하면 그 달 청구를 취소하고 다시
  --    확정하는 길이 이미 있습니다.
  --  ⚠ 직접 select 하면 안 됩니다. 이 함수는 부르는 사람의 권한으로 돌고,
  --    기사 계정은 payments 를 한 줄도 못 봅니다 — 그러면 항상 0건이라
  --    방어가 조용히 안 돕니다. 권한과 무관한 헬퍼를 씁니다.
  if public.has_live_billing(v_client.id, to_char(v_date, 'YYYY-MM')) and v_date <> v_today then
    raise exception '%의 % 청구는 이미 확정했습니다. 그 달에 수거를 더 넣으면 청구액과 어긋납니다 — 청구를 취소한 뒤에 넣어 주세요.',
      v_client.name, to_char(v_date, 'YYYY년 MM월') using errcode = 'P0001';
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
       where client_id = v_client.id and date = v_date
         and waste_type = p->>'wasteType'
         and status = '완료' and is_additional = false
       limit 1;
      if v_dup is not null then
        raise exception
          '% % 의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
          to_char(v_date, 'MM월 DD일'), v_client.name, p->>'wasteType' using errcode = 'P0001';
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
      v_date, v_client.id, p->>'wasteType', v_vehicle.id, p->>'actualTime', '완료',
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
      v_date, v_client.id, v_sup_box, v_sup_bag, v_sup_plastic + v_sup_needle,
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
end $function$;;

comment on function public.complete_collection(jsonb) is
  '수거 완료 통합 처리 (0013 → 0061 → 0063). 거래처는 id·name 만 읽습니다 — 돈 칸이 열 단위로 닫혔습니다.';


-- ── ⑦ 건강검사 ──────────────────────────────────────────────────────────────
--
--  ⚠ 아래는 0062 의 것을 **그대로 옮겨 온 뒤 0063 검사만 더한** 것입니다.
--    기억으로 다시 쓰면 지금까지 쌓아 온 검사 목록이 통째로 사라집니다.

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
    'client_billing_terms','clients_full',
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

  -- ── 0063. 현장 계정에서 돈을 **서버가** 막고 있는가 ────────────────────
  --
  --   화면에서 숨기는 것만으로는 끝나지 않습니다. 토큰만 있으면 표를 직접
  --   부를 수 있습니다. 아래 셋 중 하나라도 풀리면 기사 계정으로 단가·매출을
  --   그대로 받아 갈 수 있습니다.

  --  ① 거래처의 돈 칸 — authenticated 에게 **열 단위로** 닫혀 있어야 합니다.
  --    표 전체 select 권한이 남아 있으면 열 권한 회수가 아무 일도 안 합니다
  --    (PostgreSQL 은 표 권한이 있으면 열 권한을 먼저 봅니다) — 그래서
  --    「표 권한이 없다」와 「안전한 열만 있다」를 둘 다 봅니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'clients'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    v_missing := v_missing || '잠금 거래처 표 전체 읽기가 열려 있음 (돈 칸까지 열립니다)'::text;
  end if;
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'clients'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
       and column_name in ('pricing','monthly_flat_fee','payment_terms','payment_due_day',
                           'vat_mode','flat_fee_when_empty','flat_fee_policy_at',
                           'biz_no','biz_ceo','biz_type','biz_item','tax_email')
  ) then
    v_missing := v_missing || '잠금 거래처 단가·결제·세금 칸이 열려 있음'::text;
  end if;
  --  업무에 쓰는 칸까지 같이 닫아 버리면 기사님 화면이 통째로 빕니다.
  --  주소·연락처는 **열려 있어야 맞습니다** — 그것도 함께 봅니다.
  foreach v_name in array array['id','name','address','manager','phone','note'] loop
    if not exists (
      select 1 from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'clients'
         and grantee = 'authenticated' and privilege_type = 'SELECT'
         and column_name = v_name
    ) then
      v_missing := v_missing || ('열림 거래처 ' || v_name || ' 을(를) 현장이 못 읽음');
    end if;
  end loop;

  --  ② 월 실적(매출·원가·이익) · 상품(판매가·원가) · 문서함(단가표)
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'client_monthly_actuals'
       and policyname = 'cma_read' and qual like '%is_staff%'
  ) then
    v_missing := v_missing || '잠금 월 실적을 현장이 읽을 수 있음'::text;
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'products'
       and policyname = 'products_read' and qual like '%auth_role() IS NOT NULL%'
  ) then
    v_missing := v_missing || '잠금 상품 판매가·원가를 현장이 읽을 수 있음'::text;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'client_documents'
       and policyname = 'client_documents_read' and qual like '%is_staff%'
  ) then
    v_missing := v_missing || '잠금 거래처 문서함(단가표)을 현장이 읽을 수 있음'::text;
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

-- ── ② 차량 배정 — 차량 구분 검사 제거 ───────────────────────────────────────

create or replace function public.assign_schedule_vehicles(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     jsonb;
  v_sched   public.schedules%rowtype;
  v_veh     public.vehicles%rowtype;
  v_ids     uuid[] := '{}';
  v_set     integer := 0;
  v_skip    integer := 0;
  v_vcount  integer;
  v_first   date;
  v_last    date;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.is_staff() then
    raise exception '차량 배정은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception '배정할 목록이 목록 형태가 아닙니다.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception '배정할 일정이 없습니다.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception '한 번에 배정할 수 있는 일정은 1000건까지입니다 (요청 %건).',
      jsonb_array_length(p_rows) using errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    select * into v_sched from public.schedules
     where id = (v_row->>'scheduleId')::uuid for update;
    if not found then
      raise exception '배정할 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;

    select * into v_veh from public.vehicles
     where id = (v_row->>'vehicleId')::uuid and active;
    if not found then
      raise exception '사용 중인 차량이 아닙니다.' using errcode = 'P0001';
    end if;

    --  0070 — 차량 구분으로 막지 않습니다 (대표님 지시).
    --  ⚠ 여기 있던 검사에는 「법으로 분리 운행입니다」라고 적혀 있었습니다.
    --    없애 달라고 하셔서 없앱니다. 되돌리려면 이 파일 맨 아래를 보세요.
    if v_sched.status = '완료' then
      raise exception '이미 끝난 수거(%)의 차량은 바꾸지 않습니다.', v_sched.date using errcode = 'P0001';
    end if;
    if v_sched.date < v_today then
      raise exception '지난 날짜(%)의 일정에는 배정하지 않습니다.', v_sched.date using errcode = 'P0001';
    end if;

    --  이미 차가 정해져 있으면 손대지 않습니다.
    if v_sched.vehicle_id is not null then
      v_skip := v_skip + 1;
      continue;
    end if;

    update public.schedules set vehicle_id = v_veh.id where id = v_sched.id;
    v_ids := v_ids || v_sched.id;
    v_set := v_set + 1;
  end loop;

  select count(distinct vehicle_id), min(date), max(date)
    into v_vcount, v_first, v_last
    from public.schedules where id = any(v_ids);

  insert into public.audit_logs
    (action, entity, entity_id, after_data, summary, screen, source)
  values
    ('schedule.assign', 'schedules', null,
     jsonb_build_object('assigned', v_set, 'skipped', v_skip,
                        'vehicles', coalesce(v_vcount, 0),
                        'from', v_first, 'to', v_last, 'ids', to_jsonb(v_ids)),
     format('차량 배정 — %s건 배정 · %s건 건너뜀 (차량 %s대%s)',
            v_set, v_skip, coalesce(v_vcount, 0),
            case when v_first is null then ''
                 else format(' · %s ~ %s', v_first, v_last) end),
     '일정 편성', 'app');

  return jsonb_build_object('assigned', v_set, 'skipped', v_skip,
                            'vehicles', coalesce(v_vcount, 0),
                            'from', v_first, 'to', v_last,
                            'ids', to_jsonb(v_ids));
end;
$$;

-- ── ③ 방문 예약 — 차량 구분 검사 제거 ───────────────────────────────────────

create or replace function public.book_visit(
  p_client_id   uuid,
  p_date        date,
  p_waste_type  text,
  p_time        text    default '',
  p_vehicle_id  uuid    default null,
  p_memo        text    default '',
  p_expected    integer default null,
  p_request_id  uuid    default null,
  --  0067 — 방문 목적. **새 칸을 만들지 않습니다.** 이미 있는 두 칸에 담습니다.
  --    정기수거 → status '예정'  · is_additional false   (지금까지와 같음)
  --    추가수거 → status '예정'  · is_additional **true**
  --    긴급수거 → status **'긴급'** · is_additional false
  --    기타     → 정기와 같게 두고 메모에 적습니다
  p_purpose     text    default '정기수거'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client  public.clients%rowtype;
  v_veh     public.vehicles%rowtype;
  v_req     public.client_requests%rowtype;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_kg      integer := greatest(0, coalesce(p_expected, 0));
  v_memo    text := btrim(coalesce(p_memo, ''));
  v_time    text := btrim(coalesce(p_time, ''));
  v_purpose text := coalesce(nullif(btrim(p_purpose), ''), '정기수거');
  v_status  text;
  v_extra   boolean;
  v_id      uuid;
begin
  --  「누가」는 감사기록 트리거(0015)가 서버에서 직접 적습니다.
  --  ── 0067 — 담당 기사도 **본인 담당 거래처**는 스스로 잡습니다 ──────────
  --
  --   대표님 말씀: 기사님들이 몇 주치 일정을 미리 받아, 본인 일정 안에서
  --   방문 순서나 동선을 스스로 조정해 다닙니다.
  --
  --   ⚠ 남의 거래처는 못 잡습니다. can_see_client() 는 배정이 **하나도
  --     없으면** true 를 돌려주므로, 배정을 켜기 전에는 지금까지와 똑같이
  --     동작하고 배정을 켜는 순간 좁아집니다 (0056 과 같은 규칙).
  --   ⚠ 사무실·관리자 권한은 한 줄도 안 좁아집니다.
  if public.is_staff() then
    null;
  elsif public.auth_role() = 'field' then
    if not public.can_see_client(p_client_id) then
      raise exception '내 담당이 아닌 거래처입니다. 사무실에 요청해 주세요.' using errcode = 'P0001';
    end if;
  else
    raise exception '방문 예약은 사무실 담당자·관리자와 담당 기사만 할 수 있습니다.'
      using errcode = 'P0001';
  end if;

  if p_client_id is null or p_date is null then
    raise exception '거래처와 날짜를 모두 정해 주세요.' using errcode = 'P0001';
  end if;

  --  ⚠ 모르는 목적을 조용히 「정기」로 바꾸지 않습니다. 화면이 잘못 보내면
  --    그대로 알려 줘야 고칩니다 — 조용히 넘기면 몇 달 뒤에 발견합니다.
  if v_purpose not in ('정기수거', '추가수거', '긴급수거', '기타') then
    raise exception '방문 목적이 올바르지 않습니다: %', v_purpose using errcode = 'P0001';
  end if;
  v_status := case when v_purpose = '긴급수거' then '긴급' else '예정' end;
  v_extra  := (v_purpose = '추가수거');

  --  거래처 행을 잠그고 시작합니다 (0040 과 같은 이유). 두 사람이 같은
  --  순간에 같은 날을 잡아도 하나만 통과합니다.
  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not v_client.active then
    raise exception '거래 중이 아닌 거래처(%)에는 방문을 잡을 수 없습니다.', v_client.name
      using errcode = 'P0001';
  end if;

  if p_waste_type not in ('의료폐기물', '일회용기저귀') then
    raise exception '폐기물 구분이 올바르지 않습니다: %', coalesce(p_waste_type, '(없음)')
      using errcode = 'P0001';
  end if;

  --  그 거래처가 실제로 배출하지 않는 구분은 막습니다. 기저귀를 안 받는
  --  병원에 기저귀 방문이 잡히면 기사님이 헛걸음을 합니다.
  if p_waste_type = '의료폐기물' and not coalesce(v_client.collects_medical_waste, false) then
    raise exception '%는 의료폐기물을 배출하지 않는 거래처입니다. 거래처 정보를 먼저 확인해 주세요.', v_client.name
      using errcode = 'P0001';
  end if;
  if p_waste_type = '일회용기저귀' and not coalesce(v_client.collects_diaper, false) then
    raise exception '%는 일회용기저귀를 배출하지 않는 거래처입니다. 거래처 정보를 먼저 확인해 주세요.', v_client.name
      using errcode = 'P0001';
  end if;

  --  날짜 — 지난 날은 예정이 될 수 없고, 반년 너머는 오타일 가능성이 큽니다.
  if p_date < v_today then
    raise exception '지난 날짜(%)에는 방문을 잡을 수 없습니다. 이미 다녀온 것이면 수거 입력에 기록해 주세요.', p_date
      using errcode = 'P0001';
  end if;
  if p_date > v_today + 180 then
    raise exception '너무 먼 날짜(%)입니다. 반년 앞까지만 잡습니다 — 연도를 잘못 고르지 않았는지 확인해 주세요.', p_date
      using errcode = 'P0001';
  end if;

  --  시각은 'HH:MM' 이거나 비어 있어야 합니다. 형식이 흐트러지면 오늘 일정
  --  화면의 정렬이 무너집니다.
  if v_time <> '' and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '방문 시각이 올바르지 않습니다: % (예: 09:30)', v_time using errcode = 'P0001';
  end if;

  --  예상 수거량은 참고값입니다. 자릿수를 잘못 친 값이 그대로 남지 않게
  --  위쪽만 막습니다 (0013 과 같은 취지).
  if v_kg > 100000 then
    raise exception '예상 수거량(%kg)이 너무 큽니다. 자릿수를 확인해 주세요.', v_kg using errcode = 'P0001';
  end if;

  --  차량을 미리 정해 두는 경우 — 구분이 다르면 그 차는 그 폐기물을
  --  실을 수 없습니다.
  if p_vehicle_id is not null then
    select * into v_veh from public.vehicles where id = p_vehicle_id;
    if not found then
      raise exception '차량을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if not v_veh.active then
      raise exception '운행하지 않는 차량(%)입니다.', v_veh.name using errcode = 'P0001';
    end if;
    --  0070 — 차량 구분으로 막지 않습니다 (대표님 지시).
  end if;

  --  요청을 걸어 잡는 경우 — 남의 병원 요청을 걸 수 없습니다.
  if p_request_id is not null then
    select * into v_req from public.client_requests where id = p_request_id for update;
    if not found then
      raise exception '요청을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_req.client_id <> p_client_id then
      raise exception '다른 거래처의 요청입니다 — 요청을 올린 곳과 방문을 잡는 곳이 다릅니다.'
        using errcode = 'P0001';
    end if;
  end if;

  --  같은 날 같은 구분이 이미 있으면 잡지 않습니다.
  --
  --   ⚠ 「덮어쓰기」로 만들면 안 됩니다. 이미 기사님에게 나간 방문의 시각·
  --     차량이 조용히 바뀌면 현장이 어긋납니다. 있는 그대로 알려 주고
  --     사람이 판단하게 합니다.
  --  0059 — 무른 방문은 자리를 비켜 줍니다. 안 빼면 병원이 「역시 그날로
  --  다시 해 주세요」 했을 때 넣을 방법이 없어집니다.
  if exists (
    select 1 from public.schedules
     where client_id = p_client_id and date = p_date and waste_type = p_waste_type
       and coalesce(is_additional, false) = false
       and canceled_at is null
  ) then
    raise exception '%의 % % 방문은 이미 잡혀 있습니다. 같은 날 한 번 더 가야 하면, 그날 수거 입력에서 「추가 수거」로 기록해 주세요.',
      v_client.name, to_char(p_date, 'MM월 DD일'), p_waste_type using errcode = 'P0001';
  end if;

  --  여기까지 왔어도 다른 접속이 방금 넣었을 수 있습니다. 그때는 0040 의
  --  제약(schedules_planned_uniq)이 막고, 우리는 사람이 읽을 수 있는 말로
  --  바꿔 돌려줍니다.
  insert into public.schedules
    (date, client_id, waste_type, vehicle_id, scheduled_time, status,
     expected_amount, actual_amount, memo, origin, is_additional, booked_at)
  values
    (p_date, p_client_id, p_waste_type, p_vehicle_id, v_time, v_status,
     v_kg, null, v_memo,
     --  0067 — 누가 잡았는지 남깁니다. 사무실이 짠 확정 일정('system')과
     --  기사님이 스스로 잡은 것('field')을 화면이 구별해야 합니다.
     case when public.is_staff() then 'system' else 'field' end,
     v_extra, now())
  on conflict (client_id, date, waste_type)
    --  0059 — 색인에 canceled_at 조건이 붙었습니다. 여기 조건이 색인과
  --  **글자 하나까지 같아야** 합니다. 안 그러면 「제약을 찾을 수 없다」로
  --  방문 예약이 통째로 죽습니다.
  where status = '예정' and coalesce(is_additional, false) = false and canceled_at is null
    do nothing
  returning id into v_id;

  if v_id is null then
    raise exception '%의 % 방문을 다른 사람이 방금 잡았습니다. 화면을 새로 고쳐 확인해 주세요.',
      v_client.name, to_char(p_date, 'MM월 DD일') using errcode = 'P0001';
  end if;

  --  요청을 걸었으면 그 요청을 「일정 반영」으로 옮깁니다.
  --
  --   ⚠ 같은 트랜잭션 안에서 합니다. 방문만 생기고 요청이 그대로면 병원
  --     화면에는 「접수」로 남아 담당자가 한 번 더 전화를 겁니다.
  --   ⚠ 회신은 **덮어쓰지 않고 이어 붙입니다.** 사람이 적어 둔 말을
  --     시스템이 지우면 안 됩니다.
  if v_req.id is not null then
    update public.client_requests
       set status = case when status = '처리 완료' then status else '일정 반영' end,
           reply = btrim(
             case when btrim(coalesce(reply, '')) = '' then '' else reply || E'\n' end
             || to_char(p_date, 'MM월 DD일')
             || case when v_time <> '' then ' ' || v_time else '' end
             || ' 방문으로 잡았습니다.'
           ),
           handled_at = now()
     where id = v_req.id;
  end if;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('schedule.book', 'schedules', v_id::text, p_client_id, v_client.name,
     jsonb_build_object('date', p_date, 'wasteType', p_waste_type, 'time', v_time,
                        'vehicleId', p_vehicle_id, 'expected', v_kg,
                        'requestId', p_request_id),
     format('%s %s %s 방문 예약%s',
            v_client.name, to_char(p_date, 'YYYY-MM-DD'), p_waste_type,
            case when v_time <> '' then ' ' || v_time else '' end),
     '방문 예약', 'app');

  return jsonb_build_object(
    'id', v_id, 'date', p_date, 'wasteType', p_waste_type,
    'time', v_time, 'clientName', v_client.name,
    'requestUpdated', (v_req.id is not null)
  );
end;
$$;

-- ── E. 차량 예약 (3.5톤 공용차) ────────────────────────────────────────────
--
--   대표님 말씀: "1~4호차 직원 분들이 원할 때 3.5톤 트럭도 예약하는 방식으로
--   활용할 수 있어야 하고, 누군가 예약을 하면 병원 관계자를 제외한 모든
--   사람이 다 알 수 있어야 한다."
--
--   ⚠ 하루 단위입니다. 시간 단위로 쪼개면 「9시~11시」가 겹치는지 따지는
--     규칙이 필요하고, 현장에서 그렇게까지 정밀하게 쓰지 않습니다.
--     하루에 한 사람 — 그게 「누가 오늘 그 차를 쓰는가」의 답입니다.
--
--   ⚠ **병원 계정은 못 봅니다.** 우리 차를 누가 쓰는지는 병원이 알 일이
--     아닙니다. 현장·사무실·관리자는 전부 봅니다.

create table if not exists public.vehicle_reservations (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  date        date not null,
  profile_id  uuid not null references public.profiles(id),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);

--  같은 차를 같은 날 두 사람이 잡지 못하게 — **표 차원에서** 막습니다.
--  화면에서만 막으면 두 사람이 동시에 누를 때 둘 다 통과합니다.
create unique index if not exists vehicle_reservations_uniq
  on public.vehicle_reservations (vehicle_id, date);

create index if not exists vehicle_reservations_date
  on public.vehicle_reservations (date);

comment on table public.vehicle_reservations is
  '공용 차량(3.5톤) 하루 단위 예약. 병원 계정은 못 봅니다 (0070).';

alter table public.vehicle_reservations enable row level security;

--  읽기 — 직원 전부 (현장 포함). 병원은 제외.
drop policy if exists vehicle_reservations_read on public.vehicle_reservations;
create policy vehicle_reservations_read on public.vehicle_reservations
  for select using (public.auth_role() in ('admin', 'office', 'field'));

--  쓰기·지우기는 아래 함수로만 합니다 (표 직접 쓰기는 막습니다).
--  ⚠ 표를 열어 두면 남의 예약을 지울 수 있습니다.
drop policy if exists vehicle_reservations_write on public.vehicle_reservations;
drop policy if exists vehicle_reservations_update on public.vehicle_reservations;
drop policy if exists vehicle_reservations_delete on public.vehicle_reservations;

-- ── 예약하기 ───────────────────────────────────────────────────────────────
create or replace function public.reserve_vehicle(
  p_vehicle_id uuid,
  p_date       date,
  p_note       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_veh   public.vehicles%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_who   text;
  v_prev  record;
  v_id    uuid;
begin
  if public.auth_role() not in ('admin', 'office', 'field') then
    raise exception '차량 예약은 직원만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_vehicle_id is null or p_date is null then
    raise exception '차량과 날짜를 모두 정해 주세요.' using errcode = 'P0001';
  end if;
  if p_date < v_today then
    raise exception '지난 날짜(%)에는 예약할 수 없습니다.', p_date using errcode = 'P0001';
  end if;
  if p_date > v_today + 90 then
    raise exception '너무 먼 날짜(%)입니다. 3개월 앞까지만 잡습니다.', p_date using errcode = 'P0001';
  end if;

  select * into v_veh from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception '차량을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not v_veh.active then
    raise exception '운행하지 않는 차량(%)입니다.', v_veh.name using errcode = 'P0001';
  end if;

  --  ⚠ 이미 잡혀 있으면 **덮어쓰지 않습니다.** 누가 잡았는지 그대로
  --    알려 주고 사람이 판단하게 합니다 — 조용히 뺏으면 그날 현장이 엉킵니다.
  select r.*, p.name as who into v_prev
    from public.vehicle_reservations r
    join public.profiles p on p.id = r.profile_id
   where r.vehicle_id = p_vehicle_id and r.date = p_date;
  if found then
    if v_prev.profile_id = auth.uid() then
      raise exception '그 날은 이미 본인이 예약해 두셨습니다.' using errcode = 'P0001';
    end if;
    raise exception '%은 %월 %일에 %님이 이미 예약했습니다.',
      v_veh.name, to_char(p_date, 'MM'), to_char(p_date, 'DD'), v_prev.who
      using errcode = 'P0001';
  end if;

  insert into public.vehicle_reservations (vehicle_id, date, profile_id, note)
  values (p_vehicle_id, p_date, auth.uid(), btrim(coalesce(p_note, '')))
  returning id into v_id;

  select name into v_who from public.profiles where id = auth.uid();
  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('vehicle.reserve', 'vehicle_reservations', v_id::text,
          format('%s %s 예약 · %s', v_veh.name, to_char(p_date, 'MM월 DD일'), coalesce(v_who, '')),
          '차량 예약', 'app');

  return jsonb_build_object('id', v_id, 'vehicle', v_veh.name, 'date', p_date);
end;
$$;

-- ── 예약 무르기 ────────────────────────────────────────────────────────────
create or replace function public.release_vehicle(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicle_reservations%rowtype;
  v_veh text;
begin
  select * into v_row from public.vehicle_reservations where id = p_id for update;
  if not found then
    raise exception '그 예약을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  ⚠ 본인 예약만 뭅니다. 사무실·관리자는 전부 뺄 수 있습니다 —
  --    누군가 휴가를 갔는데 차가 계속 잡혀 있으면 아무도 못 씁니다.
  if v_row.profile_id <> auth.uid() and not public.is_staff() then
    raise exception '본인이 잡은 예약만 무를 수 있습니다.' using errcode = 'P0001';
  end if;

  select name into v_veh from public.vehicles where id = v_row.vehicle_id;
  delete from public.vehicle_reservations where id = p_id;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('vehicle.release', 'vehicle_reservations', p_id::text,
          format('%s %s 예약 무름', coalesce(v_veh, ''), to_char(v_row.date, 'MM월 DD일')),
          '차량 예약', 'app');

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reserve_vehicle(uuid, date, text) from public;
revoke all on function public.release_vehicle(uuid) from public;
grant execute on function public.reserve_vehicle(uuid, date, text) to authenticated;
grant execute on function public.release_vehicle(uuid) to authenticated;

-- ── 판 번호 ────────────────────────────────────────────────────────────────
create or replace function public.app_schema_version() returns integer
language sql immutable as $$ select 70 $$;

commit;

-- ── 확인 ──────────────────────────────────────────────────────────────────
--
--  select name, active from public.vehicles order by name;
--    → [Test용]검증차량 이 false, 「3.5톤 (공용)」이 true 로 보여야 합니다
--
--  select p.name as 기사, v.name as 담당차량
--    from public.profiles p left join public.vehicles v on v.id = p.vehicle_id
--   where p.role = 'field' order by p.name;
--    → 백광호 1호차 · 김진환 2호차 · 김준기 3호차 · 오대성 4호차
--
--  select name from public.clients where name like '[Test용]%';
--
-- ── 되돌리기 ──────────────────────────────────────────────────────────────
--
--  · 이름: '[Test용]' 을 '[검증]' 으로 되돌리면 됩니다.
--  · 호차: update public.profiles set vehicle_id = null where role = 'field';
--  · 3.5톤: delete from public.vehicles where name = '3.5톤 (공용)';
--  · 예약: drop table public.vehicle_reservations cascade;
--          drop function if exists public.reserve_vehicle(uuid, date, text);
--          drop function if exists public.release_vehicle(uuid);
--  · 차량 구분 검사: 0063 · 0029 · 0067 의 해당 함수를 그대로 다시 실행하면
--    검사가 되살아납니다 (그 파일들이 원본입니다).
--  · 판 번호: create or replace function public.app_schema_version()
--             returns integer language sql immutable as $$ select 67 $$;
