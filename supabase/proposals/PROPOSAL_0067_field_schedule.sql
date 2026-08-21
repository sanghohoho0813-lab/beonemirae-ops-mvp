-- ═══════════════════════════════════════════════════════════════════════════
--  0067 (제안) — 현장 기사가 「본인 일정」을 스스로 운영하게 하는 최소 변경
--
--  ⚠ 아직 **실행하지 않았습니다.** 권한(RLS)을 바꾸는 SQL 이라 대표님이
--     읽어 보시고 직접 실행하시도록 남깁니다.
--
--  ── 먼저 확인한 것 ────────────────────────────────────────────────────────
--
--   대표님 요청을 지금 서버가 어디까지 받아 주는지, 격리 DB 에 실제 토큰
--   조건을 걸고 하나씩 두들겨 봤습니다 (xl/db_fieldsched.mjs).
--
--     ✅ 이미 되는 것 — **고칠 것 없음**
--        · 현장이 일정을 넣는 것            (달력 ＋ 가 서버에서 이미 됩니다)
--        · 현장이 확정 일정을 지우는 것      → 막힘 (delete = is_staff)
--        · 병원 계정이 일정을 넣는 것        → 막힘
--        · 배정된 거래처 일정만 보이는 것    → 0056 이 이미 막습니다
--        · 계정별 담당 차량 칸               → profiles.vehicle_id 이미 있음
--
--     ⚠ 열려 있는 것 — **이 파일이 닫습니다**
--        ① 현장이 **관리자가 확정한 일정을 고칠 수 있습니다**
--        ② 현장이 **다른 기사 일정을 고칠 수 있습니다**
--        ③ 기사가 **자기 담당 차량을 스스로 바꿀 수 있습니다**
--           (관리자 전용 함수는 막혀 있는데, profiles 표를 직접 고치는
--            길이 열려 있습니다. 차량을 자동으로 쓰게 바꾸면 이 값이
--            **기록의 근거**가 되므로 그전에 닫아야 합니다.)
--
--     ➕ 없는 것 / 막혀 있는 것
--        ④ 같은 날 **방문 순서**를 적을 칸이 없습니다 (시간으로만 정렬).
--        ⑤ 앱이 쓰는 **방문 예약 함수**(book_visit)가 사무실·관리자 전용
--           입니다. 표는 열려 있는데 함수가 막혀 있어서, 달력 ＋ 를 화면
--           에서 열어 줘도 서버가 거절합니다.
--
--  ── 기존 데이터에 미치는 영향 ────────────────────────────────────────────
--
--   · 수거·자재·청구·입금 기록은 **한 줄도 안 바뀝니다.**
--   · ④ 는 칸을 하나 더합니다. 기본값 null 이라 기존 줄은 그대로이고,
--     null 이면 지금까지처럼 시간순으로 정렬됩니다.
--   · ①②③ 은 **막는 방향**입니다. 관리자·사무실 권한은 그대로입니다.
--     현장이 지금 하던 일 중 **막히는 것**은 「남의 일정·확정 일정 고치기」
--     와 「자기 차량 바꾸기」뿐입니다 — 둘 다 원래 하면 안 되는 일입니다.
--
--  ── 실행하면 얻는 것 ─────────────────────────────────────────────────────
--
--   · 기사님이 달력에서 **본인 일정만** 넣고 고칠 수 있습니다.
--   · 사무실이 짜 준 일정은 기사님이 못 건드립니다 (요청/승인은 그대로).
--   · 담당 차량이 관리자만 정하는 값이 되어, 수거 기록의 차량을 믿을 수
--     있습니다.
--   · 같은 날 방문 순서를 기사님이 직접 정할 수 있습니다.
--
--  ── 되돌리기 ─────────────────────────────────────────────────────────────
--   맨 아래 주석에 원래대로 돌리는 SQL 을 적어 두었습니다.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ④ 같은 날 방문 순서 ────────────────────────────────────────────────────
--    작은 정수 하나입니다. null 이면 「정하지 않음」 — 지금처럼 시간순입니다.
alter table public.schedules
  add column if not exists visit_order smallint;

comment on column public.schedules.visit_order is
  '같은 날 방문 순서 (1,2,3…). null 이면 정하지 않음 — 시간순으로 봅니다 (0067).';

-- ── ①② 일정 수정 범위 ─────────────────────────────────────────────────────
--
--    관리자·사무실은 지금까지와 똑같습니다.
--    현장은 **자기가 만든 일정**만 고칩니다. 사무실이 만든 확정 일정은
--    보기만 하고, 바꾸고 싶으면 「이 일정에 의견 내기」로 요청합니다.
--
--    ⚠ created_by 가 비어 있는 **옛날 줄**은 현장이 못 고칩니다. 누가 만든
--      것인지 알 수 없는 것을 현장에 열어 주면 ①②를 닫는 뜻이 없습니다.
drop policy if exists schedules_update on public.schedules;
create policy schedules_update on public.schedules
  for update using (
    case
      when public.is_staff() then true
      when public.auth_role() = 'field' then
        created_by = auth.uid()
        and public.can_see_client(client_id)
      else false
    end
  ) with check (
    case
      when public.is_staff() then true
      when public.auth_role() = 'field' then
        created_by = auth.uid()
        and public.can_see_client(client_id)
      else false
    end
  );

comment on policy schedules_update on public.schedules is
  '관리자·사무실은 전부. 현장은 본인이 만든 · 본인 담당 거래처의 일정만 (0067).';

-- ── ① 일정 만들기도 본인 담당 거래처로 ─────────────────────────────────────
--    현장이 배정받지 않은 병원의 일정을 만들면, 만든 본인도 그 줄을 못 봅니다
--    (읽기는 배정 기준이라서). 만들자마자 사라지는 것이라 아예 막습니다.
drop policy if exists schedules_write on public.schedules;
create policy schedules_write on public.schedules
  for insert with check (
    case
      when public.is_staff() then true
      when public.auth_role() = 'field' then public.can_see_client(client_id)
      else false
    end
  );

comment on policy schedules_write on public.schedules is
  '관리자·사무실은 전부. 현장은 본인 담당 거래처만. 병원 계정은 못 넣음 (0067).';

-- ── ③ 담당 차량은 관리자만 ─────────────────────────────────────────────────
--    본인이 고칠 수 있는 것은 이름·글자크기뿐이라고 0021 에 적혀 있었는데,
--    0056 에서 vehicle_id 가 새로 생기면서 이 규칙에서 빠져 있었습니다.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role        = (select p.role        from public.profiles p where p.id = auth.uid())
    and active      = (select p.active      from public.profiles p where p.id = auth.uid())
    and client_id   is not distinct from
                      (select p.client_id   from public.profiles p where p.id = auth.uid())
    and email       = (select p.email       from public.profiles p where p.id = auth.uid())
    and approved_at is not distinct from
                      (select p.approved_at from public.profiles p where p.id = auth.uid())
    --  0067 — 담당 차량은 본인이 못 바꿉니다 (set_profile_vehicle 는 관리자 전용)
    and vehicle_id  is not distinct from
                      (select p.vehicle_id  from public.profiles p where p.id = auth.uid())
  );

comment on policy profiles_update_self on public.profiles is
  '본인은 이름·글자크기만. role/active/client_id/email/approved_at/vehicle_id 고정 (0012·0021·0067).';

-- ── ⑤ 방문 예약 함수 — 담당 기사도 본인 담당 거래처는 잡을 수 있게 ────────
--
--   ⚠ 표(RLS)는 이미 현장의 insert 를 받아 주는데, 앱이 쓰는 **함수**가
--     `is_staff()` 로 막고 있었습니다. 그래서 달력 ＋ 를 화면에서 열어 줘도
--     서버가 거절합니다. 화면만 열면 「눌리는데 안 되는 단추」가 됩니다.
--
--   아래 함수 본문은 0059 의 것을 **글자 그대로** 옮기고 두 곳만 고쳤습니다.
--     · 맨 위 권한 검사
--     · 새로 만드는 줄의 origin ('system' → 기사면 'field')
--   나머지(중복 방지·구분 검사·날짜 범위·차량 검사·요청 연결)는 그대로입니다.

--  ⚠⚠ **먼저 옛 함수를 지웁니다.** 인자를 하나 늘리면 파라미터 목록이 달라
--     `create or replace` 가 아니라 **덧붙이기(overload)** 가 됩니다. 그러면
--     8인자짜리와 9인자짜리가 같이 남아, 부를 때
--       ERROR: function public.book_visit(...) is not unique
--     로 **방문 예약이 통째로 죽습니다.** 격리 DB 에서 실제로 그렇게 났습니다.
drop function if exists public.book_visit(uuid, date, text, text, uuid, text, integer, uuid);

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

-- ── 판 번호 ────────────────────────────────────────────────────────────────
create or replace function public.app_schema_version() returns integer
language sql immutable as $$ select 67 $$;

commit;

-- ── 확인 ──────────────────────────────────────────────────────────────────
--  select public.app_schema_version();                        -- 67
--  select column_name from information_schema.columns
--   where table_name='schedules' and column_name='visit_order';  -- 한 줄
--
-- ── 되돌리기 ──────────────────────────────────────────────────────────────
--  alter table public.schedules drop column if exists visit_order;
--  drop policy if exists schedules_update on public.schedules;
--  create policy schedules_update on public.schedules
--    for update using (public.is_active_user()) with check (public.is_active_user());
--  drop policy if exists schedules_write on public.schedules;
--  create policy schedules_write on public.schedules
--    for insert with check (public.is_active_user());
--  (profiles_update_self 는 0021 의 정의로 되돌리면 됩니다 — vehicle_id 줄만 빼기)
--  create or replace function public.app_schema_version() returns integer
--  language sql immutable as $$ select 64 $$;
