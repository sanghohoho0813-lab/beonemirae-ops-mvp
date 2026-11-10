-- ─────────────────────────────────────────────────────────────────────────────
-- 56. 서버 유지 신호 (0151) — app_ping · app_heartbeat_status
--
--  확인하는 것
--   1) 로그인 없이(anon) 유지 신호를 보낼 수 있다 — 그러나 표는 직접 읽지도 고치지도 못한다
--   2) 5분 안에 여러 번 불러도 한 번만 쓰인다 · 5분이 지나면 한 번 더 · 줄은 언제나 한 줄
--   3) 「마지막 유지 신호」는 로그인한 사람만 읽는다
--
--  실행 (로컬 PostgreSQL) — anon · authenticated 역할만 있으면 됩니다(다른 파일에 기대지 않음):
--    PROPOSAL_0151_keepalive.sql → 이 파일. 여러 번 실행해도 됩니다.
-- ─────────────────────────────────────────────────────────────────────────────

\set QUIET on
\pset pager off

create or replace function ka_assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond then raise notice ' OK  | %', msg;
  else raise exception 'FAIL | %', msg;
  end if;
end $$;
create or replace function ka_blocked(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return true; end $$;
grant execute on function ka_assert(boolean, text), ka_blocked(text) to anon, authenticated;

-- 1) 로그인 없이 신호만
set role anon;
select ka_assert((public.app_ping() ->> 'ok')::boolean, '1 로그인 없이 유지 신호를 보낼 수 있음');
select ka_assert(ka_blocked('select count(*) from public.app_heartbeat'), '1 anon — 표를 직접 읽지 못함');
select ka_assert(ka_blocked('update public.app_heartbeat set pings = 999'), '1 anon — 표를 직접 고치지 못함');
select ka_assert(ka_blocked('delete from public.app_heartbeat'), '1 anon — 표를 지우지 못함');
select ka_assert(ka_blocked('select public.app_heartbeat_status()'), '1 anon — 마지막 신호를 읽지 못함');
reset role;

-- 2) 5분에 한 번만 쓰임
update public.app_heartbeat set last_at = now() - interval '6 minutes', pings = 10 where id = 1;
set role anon;
select public.app_ping() \gset p1_
select public.app_ping() \gset p2_
select public.app_ping() \gset p3_
reset role;
select ka_assert((select pings from public.app_heartbeat where id = 1) = 11, '2 연달아 3번 불러도 한 번만 쓰임 (10 → 11)');
select ka_assert((select last_at from public.app_heartbeat where id = 1) > now() - interval '1 minute', '2 마지막 신호 시각이 지금으로');
update public.app_heartbeat set last_at = now() - interval '6 minutes' where id = 1;
set role anon;
select public.app_ping() \gset p4_
reset role;
select ka_assert((select pings from public.app_heartbeat where id = 1) = 12, '2 5분이 지나면 한 번 더 (11 → 12)');
select ka_assert((select count(*) from public.app_heartbeat) = 1, '2 줄은 언제나 한 줄');
select ka_assert(ka_blocked('insert into public.app_heartbeat (id) values (2)'), '2 둘째 줄은 만들 수 없음 (id = 1 만)');

-- 3) 마지막 신호 읽기 — 로그인한 사람만
set role authenticated;
select ka_assert((public.app_heartbeat_status() ->> 'pings')::int = 12, '3 로그인한 사람 — 누적 횟수를 읽음');
select ka_assert((public.app_heartbeat_status() ->> 'last_at') is not null, '3 로그인한 사람 — 마지막 신호 시각을 읽음');
select ka_assert(ka_blocked('select count(*) from public.app_heartbeat'), '3 로그인한 사람도 표는 직접 못 읽음');
select ka_assert(ka_blocked('update public.app_heartbeat set pings = 0'), '3 로그인한 사람도 표는 직접 못 고침');
reset role;

drop function ka_assert(boolean, text);
drop function ka_blocked(text);
