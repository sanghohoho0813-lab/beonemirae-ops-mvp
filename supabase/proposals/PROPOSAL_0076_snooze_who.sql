-- ════════════════════════════════════════════════════════════════════════════
-- 0076 — 요청 「나중에 보기」 · 공용차를 **누가** 잡았는지
--
--  ① 요청 보류   대표님: 「더원요양병원 요청 2건이 검증으로 몇 주째 뜨고
--                있는데 당분간 안 뜨게. 숨겨두기 같은 걸 할 수 있게 해줘야지」
--  ② 예약자 이름 대표님: 「3.5톤 예약 누르면 누가 눌렀는지도 같이 뜨게」
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 요청을 잠시 내려 둡니다 ──────────────────────────────────────────────
--
--  ⚠ **지우지 않습니다.** 지우면 나중에 「그 요청 어떻게 됐지」에 답할 수
--    없습니다. 「처리 완료」로 바꾸지도 않습니다 — 안 한 일을 했다고 적는
--    것이라 그게 제일 나쁩니다.
--
--  ⚠ 「언제까지」를 반드시 받습니다. 기한 없는 숨김은 **영원히 안 보이는
--    것**과 같고, 그러면 진짜 잊힙니다. 그날이 지나면 저절로 돌아옵니다.
alter table public.client_requests
  add column if not exists snoozed_until date,
  add column if not exists snooze_reason text not null default '';

comment on column public.client_requests.snoozed_until is
  '이 날짜까지 목록에서 내려 둠 (0076). 지나면 저절로 돌아옵니다.';

create index if not exists client_requests_snooze_idx
  on public.client_requests (snoozed_until) where snoozed_until is not null;

create or replace function public.snooze_request(
  p_id     uuid,
  p_until  date,
  p_reason text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_req   client_requests%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or not public.is_staff() then
    raise exception '요청을 내려 두는 것은 사무실 담당자와 관리자만 할 수 있습니다.'
      using errcode = 'P0001';
  end if;

  select * into v_req from client_requests where id = p_id for update;
  if not found then
    raise exception '그 요청을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  p_until 이 null 이면 **다시 꺼내는** 것입니다.
  if p_until is not null then
    if p_until <= v_today then
      raise exception '언제까지 내려 둘지 오늘 이후 날짜로 정해 주세요.' using errcode = 'P0001';
    end if;
    --  ⚠ 한 해를 넘기지 못하게 합니다. 「영원히」와 다를 바 없어집니다.
    if p_until > v_today + 365 then
      raise exception '최대 1년까지만 내려 둘 수 있습니다. 그보다 길면 처리 완료로 닫아 주세요.'
        using errcode = 'P0001';
    end if;
  end if;

  update client_requests
     set snoozed_until = p_until,
         snooze_reason = case when p_until is null then '' else coalesce(btrim(p_reason), '') end
   where id = p_id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role,
          case when p_until is null then 'request.unsnooze' else 'request.snooze' end,
          'client_requests', p_id::text, v_req.client_id, '병원 요청',
          jsonb_build_object('snoozedUntil', v_req.snoozed_until),
          jsonb_build_object('snoozedUntil', p_until, 'reason', coalesce(btrim(p_reason), '')),
          case when p_until is null
               then '요청을 다시 꺼냄'
               else format('요청을 %s까지 내려 둠%s', p_until,
                           case when coalesce(btrim(p_reason), '') = '' then ''
                                else ' — ' || btrim(p_reason) end) end);

  return jsonb_build_object('id', p_id, 'snoozedUntil', p_until);
end $$;

revoke all on function public.snooze_request(uuid, date, text) from public;
grant execute on function public.snooze_request(uuid, date, text) to authenticated;

comment on function public.snooze_request(uuid, date, text) is
  '요청을 기한까지 내려 두기 (0076). 지우지도 「처리 완료」로 바꾸지도 않습니다.';

-- ── ② 공용차를 누가 잡았는지 ───────────────────────────────────────────────
--
--  ⚠ 이름을 **예약하는 순간 그 줄에 얼려 둡니다.** 현장 계정은 남의 프로필을
--    못 읽습니다(RLS). 화면이 이름을 쓰려고 프로필 읽기 권한을 열면, 그
--    순간 기사님이 남의 개인정보를 전부 읽게 됩니다. 마감 기록(0073)에서
--    쓴 방법과 같습니다.
alter table public.vehicle_reservations
  add column if not exists profile_name text not null default '';

comment on column public.vehicle_reservations.profile_name is
  '잡은 사람 이름 — 예약 순간에 얼려 둔 값 (0076). 프로필 읽기 권한을 열지 않으려고.';

--  이미 잡혀 있는 예약에도 이름을 채웁니다. 이건 **지어내는 것이 아니라**
--  이미 우리 DB 에 있는 값을 옮겨 적는 것입니다.
update public.vehicle_reservations r
   set profile_name = coalesce(p.name, '')
  from public.profiles p
 where p.id = r.profile_id and coalesce(r.profile_name, '') = '';

create or replace function public.reserve_vehicle(
  p_vehicle_id uuid,
  p_date       date,
  p_note       text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_veh   vehicles%rowtype;
  v_held  vehicle_reservations%rowtype;
  v_id    uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if v_actor.role = 'client' then
    raise exception '병원 계정에서는 차량을 예약할 수 없습니다.' using errcode = 'P0001';
  end if;

  select * into v_veh from vehicles where id = p_vehicle_id and active;
  if not found then
    raise exception '그 차량을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_date < v_today then
    raise exception '지난 날짜는 예약할 수 없습니다.' using errcode = 'P0001';
  end if;

  --  ⚠ 줄을 잠그고 확인합니다. 화면에서만 막으면 두 사람이 같은 순간에
  --    누를 때 둘 다 통과합니다.
  select * into v_held from vehicle_reservations
   where vehicle_id = p_vehicle_id and date = p_date for update;
  if found then
    --  ⚠ 누가 잡았는지 **말해 줍니다.** 「이미 예약됨」만 뜨면 결국 전화를 겁니다.
    raise exception '%은(는) %에 이미 %님이 잡으셨습니다.',
      v_veh.name, to_char(p_date, 'MM월 DD일'),
      coalesce(nullif(v_held.profile_name, ''), '다른 분') using errcode = 'P0001';
  end if;

  insert into vehicle_reservations (vehicle_id, date, profile_id, profile_name, note, created_by, updated_by)
  values (p_vehicle_id, p_date, v_actor.id, coalesce(v_actor.name, ''), coalesce(p_note, ''),
          v_actor.id, v_actor.id)
  returning id into v_id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          summary, screen, source)
  values (v_actor.id, v_actor.name, v_actor.role, 'vehicle.reserve', 'vehicle_reservations', v_id::text,
          format('%s %s 예약', v_veh.name, to_char(p_date, 'MM월 DD일')), '차량 예약', 'app');

  return jsonb_build_object('id', v_id, 'who', coalesce(v_actor.name, ''));
end $$;

revoke all on function public.reserve_vehicle(uuid, date, text) from public;
grant execute on function public.reserve_vehicle(uuid, date, text) to authenticated;

comment on function public.reserve_vehicle(uuid, date, text) is
  '공용 차량 예약 (0070 → 0076). 잡은 사람 이름을 그 줄에 함께 남깁니다.';

-- ── 판(schema) 번호 ─────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 76 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   아래가 각각 2 · 76 이어야 합니다.
select count(*) as "새 칸" from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'client_requests' and column_name = 'snoozed_until')
     or (table_name = 'vehicle_reservations' and column_name = 'profile_name'));
select public.app_schema_version() as "판 번호";
