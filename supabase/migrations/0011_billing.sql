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
