-- ════════════════════════════════════════════════════════════════════════════
-- 0106 — 실증이 일하면서 쌓이게: 운영 변화 기록 · 추천 노출 · 배차 결정 ·
--        마감 때 계기판·대기시간 · 도입 후 같은 범위 조사 · AI 호출 기록
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. 지우는 것 없습니다.
--     기존 표·행·정책은 그대로이고, 표 5개와 칸 몇 개를 **더할 뿐**입니다.
--
--  ── 왜 필요한가 (0106 요구) ─────────────────────────────────────────────
--   ① 차량·인력·거점·계약 변화의 적용일이 없으면 성과 비교에서 AX 효과와
--      그 변화의 효과를 가를 수 없습니다.                    → ops_changes
--   ② 추천 → 주문 전환율은 지금 「그날 추천을 되짚어 계산」한 값이라 병원이
--      실제로 봤다는 증거가 아닙니다. 노출을 그때 남깁니다.  → recommendation_views
--   ③ 배차 제안을 담당자가 적용했는지 · 왜 바꿨는지 · 결과가 어땠는지가
--      어디에도 남지 않습니다.                                → dispatch_decisions
--   ④ 운행거리·처리시설 대기시간은 칸 자체가 없습니다. 지도 API 전까지
--      계기판과 시계로 시작합니다.                           → day_closes 칸 4개
--   ⑤ 「수거 1건 행정시간」이 도입 전(사무 전체)과 도입 후(입력 화면)의
--      범위가 달랐습니다. 도입 후 **같은 범위** 조사값 칸을 둡니다.
--                                                            → performance_baselines 칸 5개
--   ⑥ AI 를 붙이면 입력·결과·담당자 수정·실패·처리시간이 남아야 합니다.
--                                                            → ai_calls
--
--  ── 순서 ──────────────────────────────────────────────────────────────
--   PROPOSAL_0079 · 0083 · 0087 이 먼저 실행돼 있어야 합니다 (판 87).
--   아래 첫 블록이 확인하고, 아니면 아무것도 바꾸지 않고 멈춥니다.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare v integer;
begin
  begin
    select public.app_schema_version() into v;
  exception when undefined_function then
    v := 0;
  end;
  if v < 87 then
    raise exception '먼저 PROPOSAL_0079 · 0083 · 0087 을 순서대로 실행해 주세요 (지금 판 %, 필요 87). 아무것도 바꾸지 않았습니다.', v;
  end if;
end $$;

-- ── ① 운영 변화 기록 ───────────────────────────────────────────────────────
create table if not exists public.ops_changes (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('ax_start','feature','vehicle','staff','base','contract','price','other')),
  title         text not null,
  --  계획은 계획입니다. 저장했다고 운영 데이터가 바뀌지 않습니다.
  status        text not null default 'planned' check (status in ('planned','applied')),
  effective_on  date,
  note          text not null default '',
  created_by    uuid references public.profiles(id),
  created_name  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ops_changes_on_idx on public.ops_changes(effective_on);
alter table public.ops_changes enable row level security;

drop policy if exists ops_changes_select on public.ops_changes;
create policy ops_changes_select on public.ops_changes
  for select using (public.is_staff());
drop policy if exists ops_changes_write on public.ops_changes;
create policy ops_changes_write on public.ops_changes
  for insert with check (public.auth_role() in ('admin','office'));
drop policy if exists ops_changes_update on public.ops_changes;
create policy ops_changes_update on public.ops_changes
  for update using (public.auth_role() in ('admin','office'))
  with check (public.auth_role() in ('admin','office'));
--  삭제 정책 없음 = 기록은 지워지지 않습니다. 틀렸으면 status·note 로 고칩니다.
grant select, insert, update on public.ops_changes to authenticated;
comment on table public.ops_changes is
  '운영 변화 기록 (0106). AX 시작·기능·차량·인력·거점·계약·단가 변화의 적용일. 성과 비교 구간에 겹치면 화면이 「복합 개선」으로 표시합니다.';

-- ── ② 추천 노출 · 채택 ────────────────────────────────────────────────────
create table if not exists public.recommendation_views (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  shown_on      date not null,
  shown_at      timestamptz not null default now(),
  viewer_id     uuid references public.profiles(id),
  viewer_role   text not null default '',
  --  그때 화면에 떠 있던 추천 그대로 [{key,label,suggestQty}] — 규칙이 나중에
  --  바뀌어도 과거 노출은 그대로입니다.
  items         jsonb not null default '[]'::jsonb,
  rule_version  text not null default '',
  action        text not null default 'shown' check (action in ('shown','ordered','dismissed')),
  order_id      uuid,
  created_at    timestamptz not null default now()
);
create index if not exists reco_views_client_idx on public.recommendation_views(client_id, shown_on);
alter table public.recommendation_views enable row level security;

drop policy if exists reco_views_select on public.recommendation_views;
create policy reco_views_select on public.recommendation_views
  for select using (
    public.is_staff()
    or client_id = (select client_id from public.profiles where id = auth.uid())
  );
drop policy if exists reco_views_insert on public.recommendation_views;
create policy reco_views_insert on public.recommendation_views
  for insert with check (
    public.is_active_user()
    and (public.is_staff() or client_id = (select client_id from public.profiles where id = auth.uid()))
  );
--  수정·삭제 정책 없음 = 노출 기록은 소급해서 만들지도, 지우지도 않습니다.
grant select, insert on public.recommendation_views to authenticated;
comment on table public.recommendation_views is
  '추천 노출·채택 기록 (0106). 병원 화면에 추천이 실제로 떠 있던 순간과, 그 뒤 주문에 담긴 것. 과거 노출은 소급 생성하지 않습니다.';

-- ── ③ 배차 제안 결정 ───────────────────────────────────────────────────────
create table if not exists public.dispatch_decisions (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  vehicle_id    text not null,
  vehicle_name  text not null default '',
  --  그때 화면이 제안한 것 그대로 {stops:[…], loadRate, urgentCount, materialCount, rule}
  proposal      jsonb not null default '{}'::jsonb,
  decision      text not null check (decision in ('applied','modified','rejected')),
  reason        text not null default '',
  decided_by    uuid references public.profiles(id),
  decided_name  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (date, vehicle_id)
);
alter table public.dispatch_decisions enable row level security;
drop policy if exists dispatch_decisions_select on public.dispatch_decisions;
create policy dispatch_decisions_select on public.dispatch_decisions
  for select using (public.is_staff());
drop policy if exists dispatch_decisions_insert on public.dispatch_decisions;
create policy dispatch_decisions_insert on public.dispatch_decisions
  for insert with check (public.auth_role() in ('admin','office'));
drop policy if exists dispatch_decisions_update on public.dispatch_decisions;
create policy dispatch_decisions_update on public.dispatch_decisions
  for update using (public.auth_role() in ('admin','office'))
  with check (public.auth_role() in ('admin','office'));
grant select, insert, update on public.dispatch_decisions to authenticated;
comment on table public.dispatch_decisions is
  '배차 제안 결정 (0106). 규칙 기반 제안을 담당자가 적용/수정/거절했는지와 이유. 결과(그날 실제 완료)는 schedules 에서 계산합니다.';

-- ── ④ 오늘 업무 마감 — 계기판 · 처리시설 대기 ──────────────────────────────
--  0073 이 이미 실행돼 있으면 표는 그대로이고 칸만 늡니다.
create table if not exists public.day_closes (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  profile_name text not null default '',
  date         date not null,
  note         text not null default '',
  summary      jsonb not null default '{}'::jsonb,
  closed_at    timestamptz not null default now(),
  unique (profile_id, date)
);
alter table public.day_closes add column if not exists odometer_start   integer;
alter table public.day_closes add column if not exists odometer_end     integer;
alter table public.day_closes add column if not exists facility_wait_min integer;
alter table public.day_closes add column if not exists facility_trips   smallint;
alter table public.day_closes enable row level security;
drop policy if exists day_closes_select on public.day_closes;
create policy day_closes_select on public.day_closes
  for select using (profile_id = auth.uid() or public.is_staff());
drop policy if exists day_closes_insert on public.day_closes;
create policy day_closes_insert on public.day_closes
  for insert with check (profile_id = auth.uid() and public.auth_role() in ('field','office','admin'));
grant select, insert on public.day_closes to authenticated;

--  ⚠ 같은 이름의 2인자 함수를 남겨 두면 호출이 모호해집니다. 지우고 다시 만듭니다.
drop function if exists public.close_day(date, text);
create or replace function public.close_day(
  p_date           date,
  p_note           text    default '',
  p_odometer_start integer default null,
  p_odometer_end   integer default null,
  p_wait_min       integer default null,
  p_trips          integer default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_sum   jsonb;
  v_id    uuid;
  v_open  integer := 0;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role = 'client' then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if p_date > (now() at time zone 'Asia/Seoul')::date
     or p_date < (now() at time zone 'Asia/Seoul')::date - 1 then
    raise exception '오늘 또는 어제만 마감할 수 있습니다.' using errcode = 'P0001';
  end if;
  --  ⚠ 값이 있으면 말이 되는 값이어야 합니다. 없으면 없는 대로 둡니다 — 0 으로 채우지 않습니다.
  if p_odometer_start is not null and p_odometer_end is not null and p_odometer_end < p_odometer_start then
    raise exception '도착 계기판이 출발보다 작습니다.' using errcode = 'P0001';
  end if;
  if p_wait_min is not null and (p_wait_min < 0 or p_wait_min > 1440) then
    raise exception '대기시간은 0~1440분 사이여야 합니다.' using errcode = 'P0001';
  end if;
  if p_trips is not null and (p_trips < 0 or p_trips > 20) then
    raise exception '처리시설 방문 횟수는 0~20 사이여야 합니다.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
           'planned', count(*),
           'done',    count(*) filter (where status = '완료'),
           'left',    count(*) filter (where status <> '완료'),
           'kg',      coalesce(sum(actual_amount) filter (where status = '완료'), 0)
         )
    into v_sum
    from schedules
   where date = p_date
     and (vehicle_id = v_actor.vehicle_id or updated_by = v_actor.id);

  if to_regclass('public.vehicle_reservations') is not null then
    execute 'select count(*) from public.vehicle_reservations where profile_id = $1 and date = $2'
       into v_open using v_actor.id, p_date;
  end if;
  v_sum := v_sum || jsonb_build_object('openVehicles', v_open);

  insert into day_closes (profile_id, profile_name, date, note, summary,
                          odometer_start, odometer_end, facility_wait_min, facility_trips)
  values (v_actor.id, coalesce(v_actor.name, ''), p_date, coalesce(p_note, ''), v_sum,
          p_odometer_start, p_odometer_end, p_wait_min, p_trips)
  on conflict (profile_id, date) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('already', true, 'summary', v_sum);
  end if;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'day.close', 'day_closes', v_id::text,
          p_date::text || ' 업무 마감'
          || case when p_odometer_start is not null and p_odometer_end is not null
                  then ' · ' || (p_odometer_end - p_odometer_start)::text || 'km' else '' end
          || case when p_wait_min is not null then ' · 대기 ' || p_wait_min::text || '분' else '' end);

  return jsonb_build_object('already', false, 'summary', v_sum);
end $$;
revoke all on function public.close_day(date, text, integer, integer, integer, integer) from public;
grant execute on function public.close_day(date, text, integer, integer, integer, integer) to authenticated;

-- ── ⑤ 도입 후 같은 범위 조사값 ───────────────────────────────────────────
alter table public.performance_baselines add column if not exists after_admin_minutes_per_collection numeric;
alter table public.performance_baselines add column if not exists after_monthly_doc_hours numeric;
alter table public.performance_baselines add column if not exists after_surveyed_on date;
alter table public.performance_baselines add column if not exists after_source text
  check (after_source is null or after_source in ('survey','estimate'));
alter table public.performance_baselines add column if not exists after_note text not null default '';
comment on column public.performance_baselines.after_admin_minutes_per_collection is
  '도입 후 수거 1건당 사무업무 분 — 도입 전과 **같은 범위**(배차·일정·엑셀 정리)로 다시 조사한 값 (0106)';

-- ── ⑥ AI 호출 기록 ─────────────────────────────────────────────────────────
create table if not exists public.ai_calls (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'request_triage',
  request_id  uuid,
  input       text not null default '',
  output      jsonb,
  model       text not null default '',
  ok          boolean not null default false,
  error       text not null default '',
  ms          integer,
  actor_id    uuid references public.profiles(id),
  actor_name  text not null default '',
  --  담당자가 초안을 고쳤는가 — AI 결과가 그대로 쓰였는지의 근거
  edited      boolean not null default false,
  edited_note text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.ai_calls enable row level security;
drop policy if exists ai_calls_select on public.ai_calls;
create policy ai_calls_select on public.ai_calls for select using (public.auth_role() in ('admin','office'));
drop policy if exists ai_calls_insert on public.ai_calls;
create policy ai_calls_insert on public.ai_calls for insert with check (public.auth_role() in ('admin','office'));
drop policy if exists ai_calls_update on public.ai_calls;
create policy ai_calls_update on public.ai_calls
  for update using (public.auth_role() in ('admin','office')) with check (public.auth_role() in ('admin','office'));
grant select, insert, update (edited, edited_note) on public.ai_calls to authenticated;
comment on table public.ai_calls is
  'AI 호출 기록 (0106). 입력·결과·모델·성공/실패·처리시간·담당자 수정 여부. 실제 연결 전에는 비어 있습니다.';

-- ── 판 번호 ──────────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 106 $$;

-- ── 바로 확인 — 아래가 각각 5 · 106 · 4 · 5 이어야 합니다 ───────────────
select count(*) as "새 표 5개" from information_schema.tables
 where table_schema='public'
   and table_name in ('ops_changes','recommendation_views','dispatch_decisions','day_closes','ai_calls');
select public.app_schema_version() as "판 번호";
select count(*) as "마감 칸 4개" from information_schema.columns
 where table_name='day_closes'
   and column_name in ('odometer_start','odometer_end','facility_wait_min','facility_trips');
select count(*) as "도입 후 조사 칸 5개" from information_schema.columns
 where table_name='performance_baselines' and column_name like 'after_%';
