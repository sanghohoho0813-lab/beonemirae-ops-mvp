-- ════════════════════════════════════════════════════════════════════════════
-- 0077 — 「이 일정 누가 넣었지?」에 답합니다 · 기사님이 본인 일정을 정리합니다
--
--  대표님: 「남양주백병원 09:00 같은 일정처럼 "이게 누가 넣은 일정인지
--  모르겠다"는 상황이 다시 생기지 않게 해줘.」
--
--  ── 왜 몰랐나 ──────────────────────────────────────────────────────────
--
--   schedules 에 created_by 칸은 **있었는데 아무도 안 채우고 있었습니다.**
--   book_visit 의 insert 문에 그 칸이 아예 없습니다. 게다가 채웠더라도
--   기사 계정은 남의 프로필을 못 읽어(RLS) 이름을 못 보여 줍니다.
--
--   그래서 두 가지를 합니다.
--     ① 넣는 **순간** 이름과 경로를 그 줄에 적습니다 (얼려 둡니다)
--     ② 이미 있는 줄은 **저장된 사실로부터** 채웁니다 — 지어내지 않습니다
-- ════════════════════════════════════════════════════════════════════════════

alter table public.schedules
  add column if not exists created_by_name text not null default '',
  add column if not exists created_via     text not null default '';

comment on column public.schedules.created_by_name is
  '넣은 사람 이름 — 넣는 순간 얼려 둔 값 (0077). 기사 계정은 남의 프로필을 못 읽습니다.';
comment on column public.schedules.created_via is
  '어떻게 생긴 일정인지 (0077): 사무실 배정 / 기사 직접 추가 / 병원 요청 / 자동 편성 / 엑셀·초기 자료 / 시연 자료 / 알 수 없음';

-- ── ① 넣는 순간 적습니다 ───────────────────────────────────────────────────
--
--  ⚠ insert 하는 자리가 열 군데가 넘습니다(book_visit · 자동 편성 · 수거 입력 ·
--    엑셀 가져오기 …). 그 열 곳을 하나씩 고치면 **다음에 하나 더 생길 때
--    또 빠집니다.** 들어오는 길목 하나에 둡니다.
--  ⚠ 이미 값이 들어 있으면 덮지 않습니다 — 부르는 쪽이 더 정확히 아는
--    경우(병원 요청 연계)를 존중합니다.
create or replace function public.stamp_schedule_origin()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_actor profiles%rowtype;
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  select * into v_actor from profiles where id = new.created_by;

  if coalesce(new.created_by_name, '') = '' then
    new.created_by_name := coalesce(v_actor.name, '');
  end if;

  if coalesce(new.created_via, '') = '' then
    new.created_via := case
      --  자동 편성은 묶음 번호를 답니다 (0028) — 가장 확실한 표시입니다.
      when new.plan_batch is not null              then '자동 편성'
      when new.origin in ('seed', 'migrated')      then '엑셀·초기 자료'
      when new.origin = 'demo'                     then '시연 자료'
      when v_actor.role = 'field'                  then '기사 직접 추가'
      when v_actor.role in ('admin', 'office')     then '사무실 배정'
      --  ⚠ 모르면 **모른다고 적습니다.** 그럴듯한 값을 넣으면 그 줄을 보고
      --    엉뚱한 사람에게 물어보게 됩니다.
      else '알 수 없음' end;
  end if;
  return new;
end $$;

drop trigger if exists stamp_schedule_origin on public.schedules;
create trigger stamp_schedule_origin
  before insert on public.schedules
  for each row execute function public.stamp_schedule_origin();

-- ── ② 이미 있는 줄 — 저장된 사실로부터 ─────────────────────────────────────
--
--  ⚠ 지어내지 않습니다. 여기서 쓰는 것은 전부 그 줄에 이미 적혀 있던 값
--    (origin · plan_batch · created_by) 입니다.
update public.schedules s
   set created_by_name = coalesce(p.name, '')
  from public.profiles p
 where p.id = s.created_by and coalesce(s.created_by_name, '') = '';

update public.schedules s
   set created_via = case
     when s.plan_batch is not null                                    then '자동 편성'
     when s.origin in ('seed', 'migrated')                            then '엑셀·초기 자료'
     when s.origin = 'demo'                                           then '시연 자료'
     when p.role = 'field'                                            then '기사 직접 추가'
     when p.role in ('admin', 'office')                               then '사무실 배정'
     --  사람이 날짜를 정해 잡은 흔적은 있는데 누구인지 모르는 줄입니다.
     when s.booked_at is not null                                     then '알 수 없음'
     else '알 수 없음' end
  from public.profiles p
 where coalesce(s.created_via, '') = '' and p.id = s.created_by;

--  넣은 사람이 아예 안 적힌 옛 줄 — 그래도 origin 은 압니다.
update public.schedules s
   set created_via = case
     when s.plan_batch is not null               then '자동 편성'
     when s.origin in ('seed', 'migrated')       then '엑셀·초기 자료'
     when s.origin = 'demo'                      then '시연 자료'
     when s.origin = 'system'                    then '사무실 배정'
     else '알 수 없음' end
 where coalesce(s.created_via, '') = '';

-- ── ③ 병원 요청으로 잡힌 방문은 그렇게 적습니다 ────────────────────────────
--
--  ⚠ book_visit 본문을 통째로 다시 쓰지 않습니다. 200줄짜리를 베끼면 다음에
--    한쪽만 고쳐집니다. **요청을 걸고 잡은 경우에만** 그 줄을 한 번 더
--    손봐 주는 얇은 껍데기를 씌웁니다.
create or replace function public.book_visit_via(
  p_client_id  uuid,
  p_date       date,
  p_waste_type text,
  p_time       text    default '',
  p_vehicle_id uuid    default null,
  p_memo       text    default '',
  p_expected   integer default null,
  p_request_id uuid    default null,
  p_purpose    text    default '정기수거'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_out jsonb;
begin
  v_out := public.book_visit(p_client_id, p_date, p_waste_type, p_time, p_vehicle_id,
                             p_memo, p_expected, p_request_id, p_purpose);
  if p_request_id is not null and (v_out->>'id') is not null then
    update public.schedules set created_via = '병원 요청' where id = (v_out->>'id')::uuid;
  end if;
  return v_out;
end $$;

-- ── ④ 기사님이 **본인이 넣은** 미완료 일정을 정리합니다 ────────────────────
--
--  대표님: 「본인이 직접 추가한 미완료 일정 → 본인이 수정/취소 가능」
--
--  ⚠ 기존 cancel_visit / move_visit 은 사무실 전용입니다. 그 함수를 열면
--    기사님이 **사무실이 짠 일정까지** 무를 수 있게 됩니다. 열지 않고,
--    조건이 훨씬 좁은 함수를 따로 둡니다.
--  ⚠ 지우지 않습니다. 「무름」으로 남기고 누가·언제·왜를 적습니다 —
--    기존 구조(0059)를 그대로 씁니다.
create or replace function public.cancel_my_visit(
  p_schedule_id uuid,
  p_reason      text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor  profiles%rowtype;
  v_s      schedules%rowtype;
  v_client clients%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  if v_reason = '' then
    raise exception '무르는 이유를 적어 주세요 (예: 병원이 오늘은 쉰다고 합니다).' using errcode = 'P0001';
  end if;
  if length(v_reason) > 300 then
    raise exception '이유가 너무 깁니다 (300자까지).' using errcode = 'P0001';
  end if;

  select * into v_s from schedules where id = p_schedule_id for update;
  if not found then
    raise exception '무를 방문을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  사무실·관리자는 기존 함수를 그대로 씁니다(조건이 더 넓습니다).
  if not public.is_staff() then
    --  ⚠ **본인이 넣은 것만.** 사무실이 짠 일정을 기사님이 무르면, 사무실은
    --    왜 안 갔는지 모른 채 다음 날 병원 전화를 받습니다.
    --  ⚠ 문구를 「사무실에서 잡은 일정입니다」로만 두면, **다른 기사님이 넣은
    --    일정**일 때 거짓말이 됩니다. 확실히 아는 것만 말합니다 —
    --    「내가 넣은 것이 아니다」.
    if v_s.created_by is distinct from v_actor.id then
      raise exception '내가 넣은 일정이 아닙니다(%). 못 가시게 되면 사무실에 말씀해 주세요.',
        coalesce(nullif(v_s.created_via, ''), '경로 모름') using errcode = 'P0001';
    end if;
  end if;

  if v_s.status = '완료' then
    raise exception '이미 수거를 입력한 일정입니다. 잘못 넣으셨으면 그 수거기록을 지워 주세요.'
      using errcode = 'P0001';
  end if;
  if v_s.event_id is not null then
    raise exception '수거기록이 붙어 있는 일정입니다. 그 수거기록을 먼저 정리해 주세요.'
      using errcode = 'P0001';
  end if;
  --  두 번 눌러도 같은 결과입니다.
  if v_s.canceled_at is not null then
    return jsonb_build_object('id', v_s.id, 'alreadyCanceled', true);
  end if;

  select * into v_client from clients where id = v_s.client_id;

  update schedules set canceled_at = now(), cancel_reason = v_reason, updated_by = v_actor.id
   where id = v_s.id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, before_data, after_data, summary, screen, source)
  values (v_actor.id, v_actor.name, v_actor.role, 'schedule.cancel', 'schedules', v_s.id::text,
          v_s.client_id, coalesce(v_client.name, ''),
          jsonb_build_object('date', v_s.date, 'status', v_s.status, 'createdVia', v_s.created_via),
          jsonb_build_object('reason', v_reason),
          format('%s %s 방문 무름 — %s', coalesce(v_client.name, '거래처'),
                 to_char(v_s.date, 'YYYY-MM-DD'), v_reason),
          '오늘 일정', 'app');

  return jsonb_build_object('id', v_s.id, 'alreadyCanceled', false);
end $$;

--  시간 바꾸기 — 같은 조건으로 좁힙니다. 날짜를 옮기는 것은 사무실 일입니다
--  (다른 날 배차·동선이 함께 바뀝니다).
create or replace function public.retime_my_visit(
  p_schedule_id uuid,
  p_time        text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_s     schedules%rowtype;
  v_t     text := btrim(coalesce(p_time, ''));
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if v_t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시간을 24시간 형식(예: 14:30)으로 적어 주세요.' using errcode = 'P0001';
  end if;

  select * into v_s from schedules where id = p_schedule_id for update;
  if not found then
    raise exception '고칠 방문을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if not public.is_staff() and v_s.created_by is distinct from v_actor.id then
    raise exception '내가 넣은 일정이 아닙니다(%). 시간이 바뀌면 사무실에 말씀해 주세요.',
      coalesce(nullif(v_s.created_via, ''), '경로 모름') using errcode = 'P0001';
  end if;
  if v_s.status = '완료' or v_s.event_id is not null then
    raise exception '이미 수거를 입력한 일정입니다. 그 수거기록에서 시간을 고쳐 주세요.'
      using errcode = 'P0001';
  end if;
  if v_s.canceled_at is not null then
    raise exception '이미 무른 방문입니다.' using errcode = 'P0001';
  end if;

  update schedules set scheduled_time = v_t, updated_by = v_actor.id where id = v_s.id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, before_data, after_data, summary, screen, source)
  values (v_actor.id, v_actor.name, v_actor.role, 'schedule.retime', 'schedules', v_s.id::text,
          v_s.client_id,
          jsonb_build_object('time', v_s.scheduled_time),
          jsonb_build_object('time', v_t),
          format('%s 방문 시간 %s → %s', to_char(v_s.date, 'YYYY-MM-DD'), v_s.scheduled_time, v_t),
          '오늘 일정', 'app');

  return jsonb_build_object('id', v_s.id, 'time', v_t);
end $$;

revoke all on function public.book_visit_via(uuid, date, text, text, uuid, text, integer, uuid, text) from public;
revoke all on function public.cancel_my_visit(uuid, text) from public;
revoke all on function public.retime_my_visit(uuid, text) from public;
grant execute on function public.book_visit_via(uuid, date, text, text, uuid, text, integer, uuid, text) to authenticated;
grant execute on function public.cancel_my_visit(uuid, text) to authenticated;
grant execute on function public.retime_my_visit(uuid, text) to authenticated;

comment on function public.cancel_my_visit(uuid, text) is
  '본인이 넣은 미완료 방문 무르기 (0077). 사무실이 잡은 일정과 수거기록이 붙은 일정은 막습니다.';
comment on function public.retime_my_visit(uuid, text) is
  '본인이 넣은 미완료 방문 시간 바꾸기 (0077). 날짜 이동은 사무실 일입니다.';

-- ── 판(schema) 번호 ─────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 77 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   ① 이 0 이어야 합니다 (경로를 모르는 일정이 남아 있지 않아야 합니다)
--   ② 77 이어야 합니다
select count(*) as "경로 안 적힌 일정" from public.schedules where coalesce(created_via, '') = '';
select public.app_schema_version() as "판 번호";
