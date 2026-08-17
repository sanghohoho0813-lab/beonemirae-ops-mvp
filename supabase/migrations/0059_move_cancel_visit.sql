-- ════════════════════════════════════════════════════════════════════════════
-- 0059 — 잡아 둔 방문을 옮기고 무를 수 있게
--
--  0058 로 날짜를 정해 방문을 **잡을** 수 있게 됐습니다. 그런데 그다음이
--  없습니다.
--
--   병원: 「그날 말고 다음 주 화요일로 해 주세요.」
--   ...화면에서 할 수 있는 것이 없습니다.
--
--  잘못 잡은 방문도 마찬가지입니다. 지우는 길이 화면에 없어서 그대로
--  남고, 그날 기사가 나갑니다. 잡는 길만 만들고 무르는 길을 안 만든 것은
--  **되돌릴 수 없는 기능**을 만든 것과 같습니다.
--
--  더 조용한 문제가 하나 더 있습니다. 병원이 취소한 방문은 '예정'인 채로
--  날짜만 지나갑니다. 시스템은 그것을 **「수거 입력이 밀렸다」**고 셉니다.
--  지워지지 않는 빨간 줄이 매달 쌓이고, 사람은 곧 그 알림을 안 보게 됩니다.
--  알림이 죽는 가장 흔한 방식입니다.
--
-- ── 이 마이그레이션이 하는 일 ───────────────────────────────────────────────
--
--   ① schedules.canceled_at · cancel_reason — 무른 방문임을 남기는 칸
--   ② move_visit(...)   — 날짜·시각·차량을 옮깁니다
--   ③ cancel_visit(...) — 무릅니다 (지우지 않습니다)
--
--  ⚠ **지우지 않고 무릅니다.** 지워 버리면 「그 병원이 8월 20일 방문을
--    취소했다」는 사실이 사라집니다. 나중에 「왜 그 주에 안 갔냐」는 말이
--    나왔을 때 답할 근거가 없어집니다. payments 의 canceled_at(0037)과
--    같은 방식입니다.
--
--  ⚠ **status 목록은 안 건드립니다.** '취소'를 상태에 새로 넣으면, 지금
--    「완료가 아니면 대기」로 보는 자리 열두 곳이 전부 새 값을 만나게 됩니다.
--    한 곳만 빠뜨려도 무른 방문이 배차에 남거나 미수거로 잡힙니다.
--    칸을 따로 두고, 앱은 그 한 칸만 봅니다.
--
--  ⚠ **완료된 수거는 못 옮기고 못 무릅니다.** 그것은 실제로 다녀온 기록이고
--    정산·청구·매출로 이어집니다. 고치려면 수거 입력에서 정정합니다.
--
-- ── 서버가 막는 것 ──────────────────────────────────────────────────────────
--   · 사무실·관리자만 (기사는 남의 일정을 옮기지 않습니다)
--   · 완료된 수거 · 이미 무른 방문
--   · 지난 날짜로 옮기기 · 반년 너머로 옮기기
--   · 옮길 날에 같은 구분 방문이 이미 있으면 거부 (같은 날 두 번 안 갑니다)
--   · 차량 구분이 다른 배정
--   · 무를 때 **이유를 반드시 적게** — 나중에 「왜 안 갔지」에 답할 수 있게
--
-- ── 기존 데이터 영향 ────────────────────────────────────────────────────────
--   · 표를 만들지도 지우지도 않습니다. 칸 둘만 늘립니다 —
--     canceled_at(nullable) · cancel_reason(기본값 '').
--   · 이미 있는 일정·수거·청구는 한 줄도 안 바뀝니다.
--   · RLS 는 한 줄도 안 건드립니다.
--   · 두 번 실행해도 안전합니다.
--
--  실행 순서: RUN_1 ~ RUN_44 뒤에 실행합니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 무른 방문임을 남기는 칸 ──────────────────────────────────────────────

alter table public.schedules
  add column if not exists canceled_at   timestamptz,
  add column if not exists cancel_reason text not null default '';

comment on column public.schedules.canceled_at is
  '무른 방문 (0059). 지우지 않고 남깁니다 — 「그 주에 왜 안 갔나」에 답할 근거입니다.';
comment on column public.schedules.cancel_reason is
  '무른 이유 (0059). 비워 둘 수 없습니다.';

--  살아 있는 예정만 빨리 찾기 위한 색인. 오늘 일정·배차·미수거가 전부
--  이 조건으로 훑습니다.
create index if not exists schedules_live_planned_idx
  on public.schedules (date)
  where status <> '완료' and canceled_at is null;


-- ── 2. 같은 날 중복을 막는 제약을 「무른 것 제외」로 ─────────────────────────
--
--  0040 의 제약은 '예정'이면 무조건 하나만 허용합니다. 그대로 두면 **무른
--  방문이 그 자리를 계속 차지해** 같은 날 다시 잡을 수 없습니다. 병원이
--  「역시 그날로 다시 해 주세요」 하면 넣을 방법이 없어집니다.
drop index if exists public.schedules_planned_uniq;
create unique index if not exists schedules_planned_uniq
  on public.schedules (client_id, date, waste_type)
  where status = '예정' and coalesce(is_additional, false) = false and canceled_at is null;

comment on index public.schedules_planned_uniq is
  '같은 거래처·날짜·구분의 살아 있는 예정은 하나만 (0040 → 0059). 무른 방문은 자리를 비켜 줍니다.';


-- ── 2-1. 색인이 바뀌었으니 그 색인을 쓰는 함수도 함께 ──────────────────────
--
--  ⚠ `on conflict (...) where ...` 의 조건은 **색인의 조건과 글자 하나까지
--    같아야** 합니다. 다르면 Postgres 가 「맞는 제약을 찾을 수 없다」며
--    거절하고, 방문 예약과 일정 편성이 **통째로 죽습니다.** 색인만 바꾸고
--    함수를 안 고치면 SQL 을 실행한 그 순간부터 일정을 못 만듭니다.
--
--  아래 둘은 0058·0040 의 함수를 **그대로 옮겨 온 뒤 그 한 줄만** 고친
--  것입니다. 기억으로 다시 쓰면 지키던 검사가 조용히 빠집니다.

create or replace function public.book_visit(
  p_client_id   uuid,
  p_date        date,
  p_waste_type  text,
  p_time        text    default '',
  p_vehicle_id  uuid    default null,
  p_memo        text    default '',
  p_expected    integer default null,
  p_request_id  uuid    default null
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
  v_id      uuid;
begin
  --  「누가」는 감사기록 트리거(0015)가 서버에서 직접 적습니다.
  if not public.is_staff() then
    raise exception '방문 예약은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_client_id is null or p_date is null then
    raise exception '거래처와 날짜를 모두 정해 주세요.' using errcode = 'P0001';
  end if;

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
    if v_veh.waste_type <> p_waste_type then
      raise exception '%는 % 차량입니다 — % 방문에 배정할 수 없습니다.',
        v_veh.name, v_veh.waste_type, p_waste_type using errcode = 'P0001';
    end if;
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
    (p_date, p_client_id, p_waste_type, p_vehicle_id, v_time, '예정',
     v_kg, null, v_memo, 'system', false, now())
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

revoke all on function public.book_visit(uuid, date, text, text, uuid, text, integer, uuid) from public;
grant execute on function public.book_visit(uuid, date, text, text, uuid, text, integer, uuid) to authenticated;

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
  --  넣기가 제약에 막혔는지 보는 값 (0040)
  v_id      uuid;
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
    --  0059 — 무른 방문은 자리를 비켜 줍니다. 안 빼면 취소한 날에
    --  자동 편성이 「이미 있다」며 건너뛰어 그 주가 통째로 빕니다.
    if exists (
      select 1 from public.schedules
       where client_id = v_client and date = v_date and waste_type = v_type
         and canceled_at is null
    ) then
      v_skip := v_skip + 1;
      continue;
    end if;

    --  여기까지 왔어도 다른 접속이 방금 넣었을 수 있습니다(0040). 그때는
    --  제약이 막고, 우리는 「건너뜀」으로 셉니다 — 편성 전체가 실패하지 않게.
    insert into public.schedules
      (date, client_id, waste_type, status, expected_amount, actual_amount,
       memo, origin, is_additional, plan_batch)
    values
      (v_date, v_client, v_type, '예정', v_kg, null,
       coalesce(nullif(v_row->>'basis', ''), '자동 편성'), 'system', false, v_batch)
    on conflict (client_id, date, waste_type)
      --  0059 — 색인에 canceled_at 조건이 붙었습니다. 여기 조건이 색인과
    --  **글자 하나까지 같아야** 합니다. 안 그러면 「제약을 찾을 수 없다」로
    --  방문 예약·일정 편성이 통째로 죽습니다.
    where status = '예정' and coalesce(is_additional, false) = false and canceled_at is null
      do nothing
    returning id into v_id;

    if v_id is null then
      v_skip := v_skip + 1;
    else
      v_ins := v_ins + 1;
    end if;
    v_id := null;
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


-- ── 3. 옮기기 ───────────────────────────────────────────────────────────────

create or replace function public.move_visit(
  p_schedule_id uuid,
  p_date        date,
  p_time        text default null,
  p_vehicle_id  uuid default null,
  p_keep_vehicle boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s      public.schedules%rowtype;
  v_client public.clients%rowtype;
  v_veh    public.vehicles%rowtype;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_time   text;
  v_veh_id uuid;
  v_old    date;
begin
  if not public.is_staff() then
    raise exception '방문을 옮기는 것은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_schedule_id is null or p_date is null then
    raise exception '옮길 방문과 날짜를 모두 정해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_s from public.schedules where id = p_schedule_id for update;
  if not found then
    raise exception '옮길 방문을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  ⚠ 완료된 수거는 실제로 다녀온 기록입니다. 정산·청구·매출이 여기서
  --  나옵니다. 날짜를 옮기면 그 달 매출이 통째로 옮겨 갑니다.
  if v_s.status = '완료' then
    raise exception '이미 완료된 수거는 옮길 수 없습니다. 잘못 입력한 것이면 수거 입력에서 고쳐 주세요.'
      using errcode = 'P0001';
  end if;
  if v_s.canceled_at is not null then
    raise exception '이미 무른 방문입니다. 새로 잡아 주세요.' using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = v_s.client_id;

  if p_date < v_today then
    raise exception '지난 날짜(%)로는 옮길 수 없습니다.', p_date using errcode = 'P0001';
  end if;
  if p_date > v_today + 180 then
    raise exception '너무 먼 날짜(%)입니다. 반년 앞까지만 옮깁니다.', p_date using errcode = 'P0001';
  end if;

  --  시각 — 안 보내면(null) 지금 값을 그대로 둡니다. 빈 문자열은 「지우기」입니다.
  v_time := coalesce(p_time, v_s.scheduled_time, '');
  v_time := btrim(v_time);
  if v_time <> '' and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '방문 시각이 올바르지 않습니다: % (예: 09:30)', v_time using errcode = 'P0001';
  end if;

  --  차량 — p_keep_vehicle 이면 지금 차를 그대로, 아니면 보낸 값으로.
  v_veh_id := case when p_keep_vehicle then v_s.vehicle_id else p_vehicle_id end;
  if v_veh_id is not null then
    select * into v_veh from public.vehicles where id = v_veh_id;
    if not found then
      raise exception '차량을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_veh.waste_type <> v_s.waste_type then
      raise exception '%는 % 차량입니다 — % 방문에 배정할 수 없습니다.',
        v_veh.name, v_veh.waste_type, v_s.waste_type using errcode = 'P0001';
    end if;
  end if;

  --  옮길 날에 같은 구분이 이미 있으면 안 됩니다. 같은 날 두 번 가지 않습니다.
  if exists (
    select 1 from public.schedules
     where client_id = v_s.client_id and date = p_date and waste_type = v_s.waste_type
       and coalesce(is_additional, false) = false and canceled_at is null
       and id <> v_s.id
  ) then
    raise exception '%의 % % 방문이 그날 이미 있습니다. 다른 날짜를 골라 주세요.',
      v_client.name, to_char(p_date, 'MM월 DD일'), v_s.waste_type using errcode = 'P0001';
  end if;

  v_old := v_s.date;
  update public.schedules
     set date = p_date, scheduled_time = v_time, vehicle_id = v_veh_id
   where id = v_s.id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, after_data, summary, screen, source)
  values
    ('schedule.move', 'schedules', v_s.id::text, v_s.client_id, v_client.name,
     jsonb_build_object('date', v_old, 'time', v_s.scheduled_time, 'vehicleId', v_s.vehicle_id),
     jsonb_build_object('date', p_date, 'time', v_time, 'vehicleId', v_veh_id),
     format('%s 방문을 %s → %s 로 옮김', v_client.name,
            to_char(v_old, 'YYYY-MM-DD'), to_char(p_date, 'YYYY-MM-DD')),
     '방문 예약', 'app');

  return jsonb_build_object('id', v_s.id, 'from', v_old, 'to', p_date, 'clientName', v_client.name);
end;
$$;

revoke all on function public.move_visit(uuid, date, text, uuid, boolean) from public;
grant execute on function public.move_visit(uuid, date, text, uuid, boolean) to authenticated;

comment on function public.move_visit(uuid, date, text, uuid, boolean) is
  '잡아 둔 방문의 날짜·시각·차량을 옮깁니다 (0059). 완료된 수거는 못 옮깁니다.';


-- ── 4. 무르기 ───────────────────────────────────────────────────────────────

create or replace function public.cancel_visit(
  p_schedule_id uuid,
  p_reason      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s      public.schedules%rowtype;
  v_client public.clients%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_staff() then
    raise exception '방문을 무르는 것은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  --  ⚠ 이유를 반드시 받습니다. 「취소됨」만 남으면 나중에 「왜 그 주에
  --  안 갔냐」는 말이 나왔을 때 답할 근거가 없습니다.
  if v_reason = '' then
    raise exception '무르는 이유를 적어 주세요 (예: 병원 요청으로 다음 주로 미룸).' using errcode = 'P0001';
  end if;
  if length(v_reason) > 300 then
    raise exception '이유가 너무 깁니다 (300자까지).' using errcode = 'P0001';
  end if;

  select * into v_s from public.schedules where id = p_schedule_id for update;
  if not found then
    raise exception '무를 방문을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_s.status = '완료' then
    raise exception '이미 완료된 수거는 무를 수 없습니다. 실제로 다녀온 기록이고 정산·청구로 이어집니다.'
      using errcode = 'P0001';
  end if;
  --  두 번 눌러도 같은 결과입니다 — 오류로 막지 않습니다(무른 것은 무른 것).
  if v_s.canceled_at is not null then
    return jsonb_build_object('id', v_s.id, 'alreadyCanceled', true);
  end if;

  select * into v_client from public.clients where id = v_s.client_id;

  update public.schedules
     set canceled_at = now(), cancel_reason = v_reason
   where id = v_s.id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, after_data, summary, screen, source)
  values
    ('schedule.cancel', 'schedules', v_s.id::text, v_s.client_id, v_client.name,
     jsonb_build_object('date', v_s.date, 'status', v_s.status),
     jsonb_build_object('reason', v_reason),
     format('%s %s 방문 무름 — %s', v_client.name, to_char(v_s.date, 'YYYY-MM-DD'), v_reason),
     '방문 예약', 'app');

  return jsonb_build_object('id', v_s.id, 'date', v_s.date, 'clientName', v_client.name,
                            'alreadyCanceled', false);
end;
$$;

revoke all on function public.cancel_visit(uuid, text) from public;
grant execute on function public.cancel_visit(uuid, text) to authenticated;

comment on function public.cancel_visit(uuid, text) is
  '잡아 둔 방문을 무릅니다 (0059). 지우지 않고 이유와 함께 남깁니다. 완료된 수거는 못 무릅니다.';


-- ── 5. 되돌리기가 무른 방문을 건드리지 않게 ─────────────────────────────────
--
--  자동 편성 「되돌리기」는 그 batch 의 '예정'을 지웁니다. 무른 방문까지
--  지우면 「취소했다」는 기록이 사라집니다 — 지우지 않고 남기기로 한 뜻이
--  거기서 무너집니다.

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
     --  0059 — 무른 방문은 지우지 않습니다. 지우면 「그 병원이 취소했다」는
     --  기록이 사라져, 남기기로 한 뜻이 여기서 무너집니다.
     and canceled_at is null
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


-- ── 6. 자가진단 ─────────────────────────────────────────────────────────────

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
    'month_close_marks','client_assignments','staff_invites'
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
    'client_assignments_profile_idx'
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
as $$ select 59 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
