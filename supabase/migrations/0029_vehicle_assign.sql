-- ─────────────────────────────────────────────────────────────────────────────
-- 0029. 차량 배정 — 예정 일정에 차를 붙이고, 되돌리기
--
--  왜 필요한가
--
--   0028 로 「언제 어디를」은 자동으로 만들어집니다. 그런데 차량이 비어
--   있어서, 만들어진 예정이 오늘 일정에 「기사 미지정」으로 뜨고 배차
--   화면에서도 0곳으로 잡힙니다. 남은 한 칸을 채웁니다.
--
--   어느 차를 붙일지 고르는 판단은 화면(lib/vehiclePlan.ts)이 하고,
--   대표님이 차량별 적재율·정차 수를 눈으로 확인한 뒤 누릅니다. 이
--   함수는 **확인된 목록만** 받아 저장합니다.
--
--  서버가 다시 막는 것 — 화면을 믿지 않습니다
--
--   · 폐기물 구분이 다른 차량은 붙이지 않습니다. 의료폐기물과 기저귀는
--     법으로 분리 운행입니다. 화면이 잘못 보내도 여기서 거부합니다.
--   · 이미 끝난 수거(완료)에는 손대지 않습니다. 지난 운행 기록을 나중에
--     바꾸는 길을 열어 두면 그 기록을 근거로 쓸 수 없습니다.
--   · 이미 차량이 정해진 일정도 손대지 않습니다 — 덮어쓰기 없음.
--   · 지난 날짜에는 배정하지 않습니다 (한국 시각 기준).
--   · 한 번에 1000건까지.
--
--  되돌리기
--
--   붙인 차량을 떼어냅니다. 아직 예정인 건만 떼고, 그 사이에 수거를
--   다녀온 건은 그대로 둡니다.
--
--  표 변경 없음 — schedules.vehicle_id 를 채우고 비우는 것이 전부입니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 차량 배정 ────────────────────────────────────────────────────────────────
--
--  p_rows 한 줄의 모양
--    { "scheduleId": uuid, "vehicleId": uuid }

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

    --  법으로 분리 운행입니다 — 구분이 다르면 어떤 경우에도 붙이지 않습니다.
    if v_veh.waste_type <> v_sched.waste_type then
      raise exception '% 일정에 % 차량(%)을 붙일 수 없습니다. 분리 운행 대상입니다.',
        v_sched.waste_type, v_veh.waste_type, v_veh.name using errcode = 'P0001';
    end if;
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

revoke all on function public.assign_schedule_vehicles(jsonb) from public;
grant execute on function public.assign_schedule_vehicles(jsonb) to authenticated;


-- ── 배정 되돌리기 ────────────────────────────────────────────────────────────
--
--  방금 붙인 차량을 떼어냅니다. 그 사이에 수거를 다녀온 건은 그대로 둡니다 —
--  되돌리기가 운행 기록을 지우는 일이 되어서는 안 됩니다.

create or replace function public.unassign_schedule_vehicles(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleared integer := 0;
  v_kept    integer := 0;
begin
  if not public.is_staff() then
    raise exception '차량 배정 되돌리기는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception '되돌릴 일정이 없습니다.' using errcode = 'P0001';
  end if;

  update public.schedules set vehicle_id = null
   where id = any(p_ids) and status <> '완료' and completed_at is null and event_id is null;
  get diagnostics v_cleared = row_count;

  select count(*) into v_kept
    from public.schedules
   where id = any(p_ids) and (status = '완료' or completed_at is not null or event_id is not null);

  insert into public.audit_logs
    (action, entity, entity_id, before_data, summary, screen, source)
  values
    ('schedule.assign.undo', 'schedules', null,
     jsonb_build_object('cleared', v_cleared, 'kept', v_kept, 'ids', to_jsonb(p_ids)),
     format('차량 배정 되돌리기 — %s건 해제%s',
            v_cleared,
            case when v_kept > 0 then format(' · 이미 수거한 %s건은 그대로 둠', v_kept) else '' end),
     '일정 편성', 'app');

  return jsonb_build_object('cleared', v_cleared, 'kept', v_kept);
end;
$$;

revoke all on function public.unassign_schedule_vehicles(uuid[]) from public;
grant execute on function public.unassign_schedule_vehicles(uuid[]) to authenticated;

comment on function public.assign_schedule_vehicles(jsonb) is
  '확인된 차량 배정을 저장 (0029). 구분이 다른 차량·완료 건·지난 날짜는 거부하고, 이미 배정된 건은 건너뜁니다.';
comment on function public.unassign_schedule_vehicles(uuid[]) is
  '차량 배정 되돌리기 (0029). 아직 수거하지 않은 건만 해제합니다.';
