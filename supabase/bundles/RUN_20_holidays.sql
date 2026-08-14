-- 비원미래 운영 DB — 21차 (0034)
-- 휴무일(공휴일·회사 휴무). 앞의 묶음(RUN_1~19)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0034_holidays.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0034. 휴무일 — 일정 편성이 쉬는 날에 방문을 잡지 않도록
--
--  무엇이 문제였나
--
--   일정 편성은 실제 수거 이력에서 요일 패턴을 찾아 예정을 만듭니다.
--   그래서 일요일에 안 가던 거래처는 일요일이 잡히지 않습니다. 그런데
--   **평일에 떨어지는 공휴일**(설·추석·광복절·대체공휴일 등)은 그냥
--   평일로 봅니다. 한 달치를 편성하면 그 달 공휴일만큼 잘못된 예정이
--   기사에게 나가고, 이사님이 그걸 손으로 지웁니다. 지우는 것을 잊으면
--   기사가 헛걸음합니다.
--
--  왜 표를 만들고 사람이 넣는가
--
--   공휴일은 해마다 바뀝니다. 대체공휴일 규칙이 바뀌고 임시공휴일이
--   생깁니다. 시스템에 목록을 박아 두면 그 해가 지나는 순간 조용히
--   틀립니다 — 진짜 일하는 날을 쉬는 날로 착각해 수거를 빠뜨리는 쪽이
--   더 위험합니다. 그래서 **넣은 날만** 휴무일로 봅니다. 아무것도 넣지
--   않으면 지금까지와 똑같이 동작합니다.
--
--   회사 자체 휴무(창립기념일·하계휴가)도 같은 표에 넣습니다. 일정
--   편성 입장에서는 「그날 안 간다」로 똑같기 때문입니다.
--
--  지키는 것
--
--   · 편성 화면이 이 표를 보고 그날을 **빼고** 만듭니다. 서버는 공휴일
--     저장을 막지 않습니다 — 명절에도 가야 하는 병원이 실제로 있고,
--     그건 사람이 정할 일입니다.
--   · 이미 만들어 둔 예정은 이 표를 넣는다고 사라지지 않습니다. 화면이
--     「이 날은 휴무일입니다」로 알려 주고 지울지는 사람이 정합니다.
--   · 넣고 지운 것은 감사기록에 남습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.holidays (
  day        date primary key,
  name       text not null default '',
  actor_id   uuid,
  actor_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;

drop policy if exists hol_read   on public.holidays;
drop policy if exists hol_write  on public.holidays;
drop policy if exists hol_update on public.holidays;
drop policy if exists hol_delete on public.holidays;

--  읽기는 로그인한 직원 전부 — 현장도 「오늘 쉬는 날인가」를 알아야 합니다.
--  넣고 지우는 것은 사무실·관리자.
create policy hol_read on public.holidays
  for select using (public.is_active_user());
create policy hol_write on public.holidays
  for insert with check (public.is_staff());
create policy hol_update on public.holidays
  for update using (public.is_staff()) with check (public.is_staff());
create policy hol_delete on public.holidays
  for delete using (public.is_staff());

grant select, insert, update, delete on public.holidays to authenticated;


-- ── 휴무일 일괄 입력 ────────────────────────────────────────────────────────
--
--  한 해치를 한 번에 붙여 넣는 자리입니다. 이미 있는 날짜는 이름만
--  덮어씁니다 — 「신정」을 「신정(대체)」로 고치는 일이 실제로 있습니다.

create or replace function public.set_holidays(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_row    jsonb;
  v_day    date;
  v_name   text;
  v_added  int := 0;
  v_kept   int := 0;
  v_days   text[] := '{}';
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '휴무일 입력은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '휴무일 목록이 없습니다.' using errcode = 'P0001';
  end if;
  --  한 번에 너무 많이 들어오면 실수입니다. 5년치도 넉넉히 들어갑니다.
  if jsonb_array_length(p_rows) > 400 then
    raise exception '한 번에 넣을 수 있는 휴무일은 400일까지입니다.' using errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    begin
      v_day := (v_row ->> 'day')::date;
    exception when others then
      raise exception '날짜를 읽을 수 없습니다: %', coalesce(v_row ->> 'day', '(없음)') using errcode = 'P0001';
    end;
    v_name := coalesce(nullif(trim(v_row ->> 'name'), ''), '휴무');

    if exists (select 1 from public.holidays where day = v_day) then
      update public.holidays set name = v_name where day = v_day;
      v_kept := v_kept + 1;
    else
      insert into public.holidays (day, name, actor_id, actor_name)
      values (v_day, v_name, v_actor.id, coalesce(v_actor.name, ''));
      v_added := v_added + 1;
    end if;
    v_days := v_days || to_char(v_day, 'YYYY-MM-DD');
  end loop;

  insert into public.audit_logs
    (action, entity, entity_id, after_data, summary, screen, source)
  values
    ('holiday.set', 'holidays', null,
     jsonb_build_object('added', v_added, 'updated', v_kept, 'days', to_jsonb(v_days)),
     format('휴무일 %s일 등록 · %s일 수정', v_added, v_kept),
     '일정 편성', 'app');

  return jsonb_build_object('added', v_added, 'updated', v_kept);
end;
$$;

revoke all on function public.set_holidays(jsonb) from public;
grant execute on function public.set_holidays(jsonb) to authenticated;


-- ── 휴무일 삭제 ─────────────────────────────────────────────────────────────

create or replace function public.delete_holiday(p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.holidays%rowtype;
begin
  if not public.is_staff() then
    raise exception '휴무일 삭제는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_before from public.holidays where day = p_day;
  if not found then
    raise exception '지울 휴무일을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  delete from public.holidays where day = p_day;

  insert into public.audit_logs
    (action, entity, entity_id, before_data, summary, screen, source)
  values
    ('holiday.delete', 'holidays', to_char(v_before.day, 'YYYY-MM-DD'),
     jsonb_build_object('day', to_char(v_before.day, 'YYYY-MM-DD'), 'name', v_before.name),
     format('휴무일 삭제 — %s %s', to_char(v_before.day, 'YYYY-MM-DD'), v_before.name),
     '일정 편성', 'app');

  return jsonb_build_object('day', to_char(v_before.day, 'YYYY-MM-DD'));
end;
$$;

revoke all on function public.delete_holiday(date) from public;
grant execute on function public.delete_holiday(date) to authenticated;

comment on table public.holidays is
  '휴무일 (0034). 공휴일·회사 휴무를 사람이 넣습니다 — 넣은 날만 편성에서 빠집니다.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 34 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0034). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
