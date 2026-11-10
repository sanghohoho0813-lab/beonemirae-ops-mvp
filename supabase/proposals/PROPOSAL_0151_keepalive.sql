-- ════════════════════════════════════════════════════════════════════════════
-- 0151 — 서버 유지 신호 기록 (Supabase 무료 프로젝트 일시정지 막기)
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. **안 해도 유지 신호는 갑니다** — 이 파일은
--     신호가 실제 DB 쓰기 한 줄이 되게 하고, 설정 화면에서 「마지막 유지 신호」를 볼 수 있게 합니다.
--     지우는 것 없습니다. 새 표 1개(한 줄짜리)와 함수 2개만 더합니다. 여러 번 실행해도 됩니다.
--     업무 자료 · 판 번호(app_schema_version)는 건드리지 않습니다.
--
--  ── 왜 ─────────────────────────────────────────────────────────────────────────
--   Supabase 무료 프로젝트는 「지난 1주일 동안 사용자 DB 활동이 충분하지 않으면」 일시정지됩니다.
--   앱의 /api/keepalive 가 이 함수를 부릅니다(설정 화면의 「지금 유지 신호 보내기」 · 켜 두셨다면 예약 호출).
--
--  ── 무엇을 하나 ────────────────────────────────────────────────────────────────
--   1. app_heartbeat — 한 줄짜리 표(id = 1). 마지막 신호 시각 · 누적 횟수 · 처음 시각.
--      누구도 직접 읽거나 고칠 수 없습니다(RLS · 권한 없음). 아래 함수로만 닿습니다.
--   2. app_ping() — 로그인 없이(anon) 부를 수 있는 **유일하게 쓰는** 함수.
--      한 줄의 시각 · 횟수만 고칩니다. **5분에 한 번만** 고치므로 누가 계속 불러도 그 이상 쓰이지 않습니다.
--      인자를 받지 않고, 업무 표를 읽지도 쓰지도 않습니다.
--   3. app_heartbeat_status() — 로그인한 사람이 「마지막 유지 신호」를 읽는 함수(설정 화면).
--
--  끝에 한 줄로 「0151 · 표 1/1 · 함수 2/2 · 신호 1번」이 나오면 됩니다.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.app_heartbeat (
  id       int primary key check (id = 1),
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  pings    bigint not null default 0
);
alter table public.app_heartbeat enable row level security;
revoke all on table public.app_heartbeat from public, anon, authenticated;

create or replace function public.app_ping()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  --  5분에 한 번만 고칩니다. 그 사이에 또 불리면 읽기만 하고 같은 시각을 돌려줍니다.
  insert into public.app_heartbeat as h (id, last_at, pings)
  values (1, now(), 1)
  on conflict (id) do update
    set last_at = now(), pings = h.pings + 1
    where h.last_at < now() - interval '5 minutes';
  select last_at into v_at from public.app_heartbeat where id = 1;
  return jsonb_build_object('ok', true, 'at', v_at);
end
$$;
revoke all on function public.app_ping() from public;
grant execute on function public.app_ping() to anon, authenticated;

create or replace function public.app_heartbeat_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('first_at', first_at, 'last_at', last_at, 'pings', pings) from public.app_heartbeat where id = 1),
    '{}'::jsonb)
$$;
revoke all on function public.app_heartbeat_status() from public, anon;
grant execute on function public.app_heartbeat_status() to authenticated;

-- ── 확인 한 줄 (첫 신호를 한 번 남깁니다) ─────────────────────────────────────────
select public.app_ping() is not null as "첫 신호";
select '0151 · 표 ' || (select count(*) from unnest(array['app_heartbeat']) t where to_regclass('public.' || t) is not null) || '/1'
    || ' · 함수 ' || (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('app_ping', 'app_heartbeat_status')) || '/2'
    || ' · 신호 ' || (select pings from public.app_heartbeat where id = 1) || '번' as "확인";
