-- ─────────────────────────────────────────────────────────────────────────────
-- 52. 뉴본펭귄 사전 설문 — 앱 안에서 바로 (0145) 검증
--
--  확인하는 것
--   1) 대표·관리자 · 사무실(이사님)만 답지를 열고 저장 · 제출한다
--   2) 현장 · 병원 · 로그인 안 한 사람은 열지도 쓰지도 못한다
--   3) 답지는 하나 — 대표님이 쓰다 이사님이 이어 써도 같은 답지, 마지막 작성자가 남는다
--   4) 제출 · 제출 후 수정 · 이력, 관리 화면(admin_load)에 그대로 보인다
--   5) 표는 여전히 직접 못 읽는다 (0144 규칙 그대로)
--
--  실행 (로컬 PostgreSQL)
--    00_harness.sql → migrations 0001~0064 → PROPOSAL_0144 → PROPOSAL_0145
--    psql -d verify -v ON_ERROR_STOP=1 -f supabase/test/52_newborn_survey_inapp.sql
-- ─────────────────────────────────────────────────────────────────────────────

\set QUIET on
\pset pager off

create or replace function test_assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond then raise notice ' OK  | %', msg;
  else raise exception 'FAIL | %', msg;
  end if;
end $$;

create or replace function login_as(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is null then raise exception '테스트 계정 없음: %', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', false); execute 'set role anon'; end $$;
create or replace function as_postgres() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', false); execute 'reset role'; end $$;
create or replace function blocked(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return true; end $$;
grant execute on function blocked(text) to anon, authenticated;
grant execute on function test_assert(boolean, text) to anon, authenticated;

--  깨끗한 답지에서 시작 (로컬 검증 DB 의 설문 표만)
delete from public.biz_survey_revisions;
delete from public.biz_survey_responses;
delete from public.biz_survey_admins;

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('nbboss@dev.test',  '{"name":"송명근"}', '{"role":"admin"}'),
  ('nbdir@dev.test',   '{"name":"홍현주"}', '{"role":"office"}'),
  ('nbdrive@dev.test', '{"name":"김기사"}', '{"role":"field"}'),
  ('nbhosp@dev.test',  '{"name":"병원"}',   '{"role":"client"}')
on conflict do nothing;
insert into public.profiles (id, email, name, role, active)
select u.id, u.email, u.raw_user_meta_data->>'name',
       (case when u.raw_app_meta_data->>'role' = 'client' then 'field' else u.raw_app_meta_data->>'role' end)::public.user_role, true
  from auth.users u where u.email like 'nb%@dev.test'
on conflict (id) do update set role = excluded.role, active = true, email = excluded.email, name = excluded.name;
do $$
declare v_c uuid;
begin
  insert into public.clients (name, type, address, collection_cycle) values ('설문검사병원2', '병원', '검사로 2', '주 1회') returning id into v_c;
  update public.profiles set role = 'client', client_id = v_c where email = 'nbhosp@dev.test';
end $$;

\echo '── 1. 열 수 있는 사람 · 없는 사람 ─────────────────────────────────────'
do $$
declare e text;
begin
  perform as_anon();
  perform test_assert(blocked('select public.biz_survey_my_open()'), '로그인 안 함 — 열기 막힘');
  perform test_assert(blocked($q$select public.biz_survey_my_save('{}')$q$), '로그인 안 함 — 저장 막힘');
  perform as_postgres();
  foreach e in array array['nbdrive@dev.test','nbhosp@dev.test'] loop
    perform login_as(e);
    perform test_assert(blocked('select public.biz_survey_my_open()'), e || ' — 열기 막힘');
    perform test_assert(blocked($q$select public.biz_survey_my_save('{"q1":{"choice":"있음"}}')$q$), e || ' — 저장 막힘');
    perform test_assert(blocked($q$select public.biz_survey_my_submit('{}')$q$), e || ' — 제출 막힘');
    perform test_assert(not public.biz_survey_can_answer(), e || ' — 답할 수 없는 계정');
    perform as_postgres();
  end loop;
end $$;

\echo '── 2. 대표님이 쓰고 · 이사님이 이어 쓰기 (답지 하나) ─────────────────'
do $$
declare r jsonb;
begin
  perform login_as('nbboss@dev.test');
  r := public.biz_survey_my_open();
  perform test_assert(r->'answers' = '{}'::jsonb and r->>'status' = 'draft', '대표님 — 빈 답지 (기본값을 답으로 넣지 않음)');
  perform public.biz_survey_my_save('{"q3":{"choice":"40~50만원"}}');
  perform as_postgres();

  perform login_as('nbdir@dev.test');
  r := public.biz_survey_my_open();
  perform test_assert(r->'answers'->'q3'->>'choice' = '40~50만원', '이사님이 열면 대표님이 쓴 답이 이어서 보임 (답지 하나)');
  perform test_assert(r->>'edited_by' = '송명근', '마지막 작성자 — 송명근');
  perform public.biz_survey_my_save('{"q3":{"choice":"40~50만원"},"q22":{"choice":"협의 필요"}}');
  r := public.biz_survey_my_open();
  perform test_assert(r->>'edited_by' = '홍현주' and r->>'edited_role' = 'office', '이사님이 이어 쓰면 마지막 작성자 — 홍현주');
  perform test_assert(blocked(format('select public.biz_survey_my_save(%L)', '[1]')), '답 모양이 객체가 아니면 거절');
  perform test_assert(blocked('select public.biz_survey_admin_load()'), '이사님(사무실) — 관리 화면 자료는 못 봄');
  perform test_assert(blocked('select * from public.biz_survey_responses'), '이사님 — 표 직접 읽기 막힘');
  perform as_postgres();
end $$;

\echo '── 3. 제출 · 제출 후 수정 · 관리 화면 ─────────────────────────────────'
do $$
declare r jsonb; s1 timestamptz;
begin
  perform login_as('nbboss@dev.test');
  r := public.biz_survey_my_submit('{"q3":{"choice":"40~50만원"},"q22":{"choice":"5억원"}}');
  r := public.biz_survey_my_open();
  perform test_assert(r->>'status' = 'submitted' and r->>'submitted_at' is not null, '제출 → 제출 완료');
  s1 := (r->>'submitted_at')::timestamptz;
  perform public.biz_survey_my_save('{"q3":{"choice":"60~80만원"},"q22":{"choice":"5억원"}}');
  r := public.biz_survey_my_open();
  perform test_assert(r->>'status' = 'submitted' and (r->>'updated_at')::timestamptz > s1, '제출 뒤 고쳐도 제출 상태 · 최종 수정일이 뒤');
  r := public.biz_survey_admin_load();
  perform test_assert(jsonb_array_length(r->'responses') = 1, '관리 화면 — 답지 하나');
  perform test_assert((r->'responses'->0->>'edited_by') = '송명근', '관리 화면 — 마지막 작성자 보임');
  perform test_assert(jsonb_array_length(r->'revisions') = 1, '관리 화면 — 제출 이력 1');
  perform as_postgres();
end $$;

\echo '── 52 끝 ──'
