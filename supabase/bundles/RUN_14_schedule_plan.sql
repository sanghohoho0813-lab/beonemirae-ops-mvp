-- 비원미래 운영 DB — 14차 (0028)
-- 수거 일정 자동 편성. 앞의 묶음(RUN_1~13)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0028_schedule_plan.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0028. 수거 일정 자동 편성 — 예정 일정 일괄 생성 + 되돌리기
--
--  왜 필요한가
--
--   매일 아침 어느 병원을 도는지 사람이 정하고 있습니다. 거래처가 늘수록
--   이 일이 하루 한 시간 반 가까이 걸리고, 빠뜨리면 그대로 미수거입니다.
--   실제 수거 기록이 2천 건 넘게 쌓였으니 「이 병원은 화·금」을 기록에서
--   읽어 다음 몇 주치 예정을 한 번에 만들 수 있습니다.
--
--   무슨 요일인지 고르는 판단은 화면(lib/schedulePlan.ts)이 하고, 대표님이
--   목록을 눈으로 확인한 뒤 누릅니다. 이 함수는 **확인된 목록만** 받아
--   저장합니다. 서버가 스스로 일정을 지어내지 않습니다.
--
--  무엇을 만드는가 — 「예정」이지 「이력」이 아닙니다
--
--   status='예정', actual_amount=null 로 넣습니다. 수거이력·정산·매출에는
--   잡히지 않습니다. 현장에서 수거 입력을 해야 완료가 되고 그때부터
--   실적이 됩니다. expected_amount 는 같은 요일 실제 수거량의 중앙값이며
--   배차 적재율 계산에만 쓰입니다.
--
--  안전장치
--
--   · 같은 (거래처·날짜·구분) 일정이 이미 있으면 만들지 않고 건너뜁니다.
--     어떤 상태든(예정·완료·지연·긴급) 손대지 않습니다 — 덮어쓰기 없음.
--   · 지난 날짜에는 만들지 않습니다. 과거를 채우는 것은 실적 조작입니다.
--   · 한 번에 최대 500건. 실수로 몇 년치를 만들 수 없게 막습니다.
--   · plan_batch 로 묶어 두어, 잘못 만들면 통째로 되돌릴 수 있습니다.
--     되돌리기는 **아직 손대지 않은 예정만** 지웁니다 — 이미 수거한 건은
--     남깁니다.
--   · 관리자·사무실만 (is_staff). 현장 담당자는 편성하지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 어느 편성으로 만들어진 줄인지 ───────────────────────────────────────────
alter table public.schedules
  add column if not exists plan_batch uuid;

comment on column public.schedules.plan_batch is
  '자동 편성 묶음 id (0028). 같은 번 편성으로 만들어진 예정끼리 묶여 통째로 되돌릴 수 있습니다.';

create index if not exists schedules_plan_batch_idx
  on public.schedules (plan_batch)
  where plan_batch is not null;


-- ── 예정 일정 일괄 생성 ─────────────────────────────────────────────────────
--
--  p_rows 한 줄의 모양
--    { "clientId": uuid, "date": "YYYY-MM-DD",
--      "wasteType": "의료폐기물"|"일회용기저귀",
--      "expectedAmount": 정수, "basis": "최근 12주 화요일 11회" }

create or replace function public.create_planned_schedules(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     jsonb;
  v_batch   uuid := gen_random_uuid();
  v_client  uuid;
  v_date    date;
  v_type    text;
  v_kg      integer;
  v_ins     integer := 0;
  v_skip    integer := 0;
  v_clients integer;
  v_first   date;
  v_last    date;
  --  「오늘」은 한국 시각 기준입니다 (0027 과 같은 기준).
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  --  「누가」는 감사기록 트리거(0015)가 서버에서 직접 적습니다.
  if not public.is_staff() then
    raise exception '일정 편성은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception '편성할 일정이 목록 형태가 아닙니다.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception '만들 일정이 없습니다.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception '한 번에 만들 수 있는 일정은 500건까지입니다 (요청 %건). 기간을 나눠 주세요.',
      jsonb_array_length(p_rows) using errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_client := (v_row->>'clientId')::uuid;
    v_date   := (v_row->>'date')::date;
    v_type   := v_row->>'wasteType';
    v_kg     := greatest(0, coalesce((v_row->>'expectedAmount')::numeric, 0))::integer;

    if v_client is null or v_date is null then
      raise exception '거래처나 날짜가 빠진 줄이 있습니다.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.clients where id = v_client and active) then
      raise exception '거래 중이 아닌 거래처에는 일정을 만들 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_type not in ('의료폐기물', '일회용기저귀') then
      raise exception '폐기물 구분이 올바르지 않습니다: %', coalesce(v_type, '(없음)') using errcode = 'P0001';
    end if;
    if v_date < v_today then
      raise exception '지난 날짜(%)에는 예정을 만들지 않습니다.', v_date using errcode = 'P0001';
    end if;
    if v_date > v_today + 180 then
      raise exception '너무 먼 날짜(%)입니다. 반년 앞까지만 편성합니다.', v_date using errcode = 'P0001';
    end if;

    --  이미 있으면 손대지 않습니다 (상태 무관).
    if exists (
      select 1 from public.schedules
       where client_id = v_client and date = v_date and waste_type = v_type
    ) then
      v_skip := v_skip + 1;
      continue;
    end if;

    insert into public.schedules
      (date, client_id, waste_type, status, expected_amount, actual_amount,
       memo, origin, is_additional, plan_batch)
    values
      (v_date, v_client, v_type, '예정', v_kg, null,
       coalesce(nullif(v_row->>'basis', ''), '자동 편성'), 'system', false, v_batch);
    v_ins := v_ins + 1;
  end loop;

  select count(distinct client_id), min(date), max(date)
    into v_clients, v_first, v_last
    from public.schedules where plan_batch = v_batch;

  insert into public.audit_logs
    (action, entity, entity_id, after_data, summary, screen, source)
  values
    ('schedule.plan', 'schedules', v_batch::text,
     jsonb_build_object('batch', v_batch, 'inserted', v_ins, 'skipped', v_skip,
                        'clients', coalesce(v_clients, 0),
                        'from', v_first, 'to', v_last),
     format('수거 일정 자동 편성 — %s건 생성 · %s건 건너뜀 (거래처 %s곳%s)',
            v_ins, v_skip, coalesce(v_clients, 0),
            case when v_first is null then ''
                 else format(' · %s ~ %s', v_first, v_last) end),
     '일정 편성', 'app');

  return jsonb_build_object('batch', v_batch, 'inserted', v_ins, 'skipped', v_skip,
                            'clients', coalesce(v_clients, 0),
                            'from', v_first, 'to', v_last);
end;
$$;

revoke all on function public.create_planned_schedules(jsonb) from public;
grant execute on function public.create_planned_schedules(jsonb) to authenticated;


-- ── 편성 되돌리기 ───────────────────────────────────────────────────────────
--
--  잘못 만들었을 때 통째로 지웁니다. 단, **아직 손대지 않은 예정만** 지웁니다.
--  이미 수거를 다녀왔거나 상태가 바뀐 줄은 남깁니다 — 되돌리기가 실적을
--  지우는 일이 되어서는 안 됩니다.

create or replace function public.undo_schedule_batch(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_del  integer := 0;
  v_kept integer := 0;
begin
  if not public.is_staff() then
    raise exception '편성 되돌리기는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_batch is null then
    raise exception '되돌릴 편성을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  delete from public.schedules
   where plan_batch = p_batch
     and status = '예정'
     and actual_amount is null
     and completed_at is null
     and event_id is null;
  get diagnostics v_del = row_count;

  select count(*) into v_kept from public.schedules where plan_batch = p_batch;

  insert into public.audit_logs
    (action, entity, entity_id, before_data, summary, screen, source)
  values
    ('schedule.plan.undo', 'schedules', p_batch::text,
     jsonb_build_object('batch', p_batch, 'deleted', v_del, 'kept', v_kept),
     format('수거 일정 편성 되돌리기 — %s건 삭제%s',
            v_del,
            case when v_kept > 0 then format(' · 이미 진행된 %s건은 그대로 둠', v_kept) else '' end),
     '일정 편성', 'app');

  return jsonb_build_object('deleted', v_del, 'kept', v_kept);
end;
$$;

revoke all on function public.undo_schedule_batch(uuid) from public;
grant execute on function public.undo_schedule_batch(uuid) to authenticated;

comment on function public.create_planned_schedules(jsonb) is
  '확인된 예정 일정 목록을 저장 (0028). 중복·과거일은 만들지 않고, 한 번에 500건까지입니다.';
comment on function public.undo_schedule_batch(uuid) is
  '자동 편성 되돌리기 (0028). 손대지 않은 예정만 지우고 진행된 건은 남깁니다.';
