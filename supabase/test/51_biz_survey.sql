-- ─────────────────────────────────────────────────────────────────────────────
-- 51. 사업계획서 사전 설문 (0144) — 권한 · 링크 · 답변 분리 검증
--
--  확인하는 것
--   1) 로그인 안 한 사람 · 사무실 · 현장 · 병원은 설문 표를 직접 못 읽고 못 쓴다
--   2) 관리자만 링크를 만들고 두 분 답변 전체를 본다 (사무실·현장·병원은 못 함)
--   3) 링크 열쇠는 해시로만 남는다 (열쇠 원문이 표 어디에도 없다)
--   4) 링크로 들어온 사람은 **자기 답변만** — 대표님 링크로 이사님 답을 못 본다
--   5) 틀린 · 만료된 · 폐기된 링크는 막힌다. 새 링크를 만들면 예전 링크는 폐기
--   6) 자동 저장 → 다시 열면 이어서 · 제출 · 제출 후 수정 · 제출 이력
--   7) 설문 관리자 지정(이메일)이 있으면 그 계정만 관리자
--   8) 답변 모양이 이상하거나 너무 크면 거절
--
--  실행 (로컬 PostgreSQL)
--    psql -d verify -f supabase/test/00_harness.sql
--    (migrations 0001~0064 적용)
--    psql -d verify -f supabase/proposals/PROPOSAL_0144_biz_survey.sql
--    psql -d verify -v ON_ERROR_STOP=1 -f supabase/test/51_biz_survey.sql
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
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end $$;

create or replace function as_postgres() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

--  무엇이든 실행해 보고 막혔는지(오류) 돌려줍니다
create or replace function blocked(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;
grant execute on function blocked(text) to anon, authenticated;
grant execute on function test_assert(boolean, text) to anon, authenticated;

--  깨끗한 답지에서 시작 (로컬 검증 DB 의 설문 표만 — 다른 검사가 남긴 줄을 치웁니다)
delete from public.biz_survey_revisions;
delete from public.biz_survey_responses;
delete from public.biz_survey_invites;
delete from public.biz_survey_admins;

--  계정 — 역할은 서버가 정한 그대로 (profiles)
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('svboss@dev.test',  '{"name":"대표"}',   '{"role":"admin"}'),
  ('svplan@dev.test',  '{"name":"기획"}',   '{"role":"admin"}'),
  ('svdesk@dev.test',  '{"name":"사무실"}', '{"role":"office"}'),
  ('svdrive@dev.test', '{"name":"김기사"}', '{"role":"field"}'),
  ('svhosp@dev.test',  '{"name":"병원"}',   '{"role":"client"}')
on conflict do nothing;
--  병원 계정은 거래처가 있어야 합니다(profiles_client_needs_client_id) — 일단 현장으로 만들고 바꿉니다
insert into public.profiles (id, email, name, role, active)
select u.id, u.email, u.raw_user_meta_data->>'name',
       (case when u.raw_app_meta_data->>'role' = 'client' then 'field' else u.raw_app_meta_data->>'role' end)::public.user_role, true
  from auth.users u where u.email like 'sv%@dev.test'
on conflict (id) do update set role = excluded.role, active = true, email = excluded.email;
do $$
declare v_c uuid;
begin
  insert into public.clients (name, type, address, collection_cycle) values ('설문검사병원', '병원', '검사로 1', '주 1회') returning id into v_c;
  update public.profiles set role = 'client', client_id = v_c where email = 'svhosp@dev.test';
end $$;

create temp table tok (who text primary key, token text, id uuid);
grant all on tok to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 1. 표는 직접 못 읽고 못 쓴다 ──────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare e text;
begin
  perform as_anon();
  perform test_assert(blocked('select * from public.biz_survey_responses'), '로그인 안 함 — 답변 표 읽기 막힘');
  perform test_assert(blocked('select * from public.biz_survey_invites'), '로그인 안 함 — 링크 표 읽기 막힘');
  perform test_assert(blocked($q$insert into public.biz_survey_responses(respondent) values ('ceo')$q$), '로그인 안 함 — 답변 표 쓰기 막힘');
  perform as_postgres();
  foreach e in array array['svdesk@dev.test','svdrive@dev.test','svhosp@dev.test','svboss@dev.test'] loop
    perform login_as(e);
    perform test_assert(blocked('select * from public.biz_survey_responses'), e || ' — 답변 표 직접 읽기 막힘 (관리자도 함수로만)');
    perform test_assert(blocked('select * from public.biz_survey_revisions'), e || ' — 이력 표 직접 읽기 막힘');
    perform as_postgres();
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 2. 링크 만들기 · 관리자 보기는 관리자만 ───────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare e text;
begin
  perform as_anon();
  perform test_assert(blocked('select public.biz_survey_admin_load()'), '로그인 안 함 — 관리자 보기 막힘');
  perform test_assert(blocked($q$select public.biz_survey_issue_invite('ceo', 14)$q$), '로그인 안 함 — 링크 만들기 막힘');
  perform as_postgres();
  foreach e in array array['svdesk@dev.test','svdrive@dev.test','svhosp@dev.test'] loop
    perform login_as(e);
    perform test_assert(blocked('select public.biz_survey_admin_load()'), e || ' — 관리자 보기 막힘');
    perform test_assert(blocked($q$select public.biz_survey_issue_invite('director', 14)$q$), e || ' — 링크 만들기 막힘');
    perform as_postgres();
  end loop;
end $$;

do $$
declare r jsonb;
begin
  perform login_as('svplan@dev.test');
  r := public.biz_survey_issue_invite('ceo', 14);
  insert into tok values ('ceo', r->>'token', (r->>'id')::uuid);
  r := public.biz_survey_issue_invite('director', 7);
  insert into tok values ('director', r->>'token', (r->>'id')::uuid);
  perform test_assert(length((select token from tok where who='ceo')) >= 30, '관리자 — 대표님 링크 열쇠 받음 (32자)');
  perform test_assert(blocked($q$select public.biz_survey_issue_invite('someone', 14)$q$), '응답자는 대표님·이사님 둘뿐');
  perform test_assert(blocked($q$select public.biz_survey_issue_invite('ceo', 365)$q$), '유효 기간은 60일까지');
  r := public.biz_survey_admin_load();
  perform test_assert(jsonb_array_length(r->'invites') = 2, '관리자 보기 — 링크 2개');
  perform test_assert(position('token' in (r->'invites')::text) = 0, '관리자 보기에도 열쇠(해시 포함)는 안 나옴');
  perform as_postgres();
end $$;

do $$
begin
  perform test_assert(
    not exists (select 1 from public.biz_survey_invites i join tok t on t.token = i.token_hash),
    '표에는 열쇠 원문이 없다 (해시만)');
  perform test_assert(
    (select count(*) from public.biz_survey_invites i join tok t on i.token_hash = encode(digest(t.token,'sha256'),'hex')) = 2,
    '해시는 sha256 으로 맞는다');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 3. 링크로 들어온 사람은 자기 답변만 ────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; ceo text; dir text;
begin
  select token into ceo from tok where who='ceo';
  select token into dir from tok where who='director';
  perform as_anon();
  r := public.biz_survey_open(ceo);
  perform test_assert(r->>'respondent' = 'ceo' and r->>'status' = 'draft', '대표님 링크 → 대표님 답지 (작성 중)');
  perform test_assert(r->'answers' = '{}'::jsonb, '처음엔 빈 답지 — 기본값을 답으로 넣지 않음');
  perform public.biz_survey_save(ceo, '{"q1":{"choice":"있음"},"q3":{"choice":"40~50만원"}}');
  r := public.biz_survey_open(ceo);
  perform test_assert(r->'answers'->'q3'->>'choice' = '40~50만원', '자동 저장 → 다시 열면 이어서');
  r := public.biz_survey_open(dir);
  perform test_assert(r->>'respondent' = 'director' and r->'answers' = '{}'::jsonb, '이사님 링크 → 이사님 답지 (대표님 답이 안 섞임)');
  perform public.biz_survey_save(dir, '{"q3":{"choice":"20~30만원"}}');
  r := public.biz_survey_open(ceo);
  perform test_assert(r->'answers'->'q3'->>'choice' = '40~50만원', '이사님이 저장해도 대표님 답은 그대로');
  perform test_assert(blocked($q$select public.biz_survey_open('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')$q$), '틀린 링크 — 막힘');
  perform test_assert(blocked($q$select public.biz_survey_open('')$q$), '빈 링크 — 막힘');
  perform test_assert(blocked($q$select public.biz_survey_save('short', '{}')$q$), '짧은 열쇠 — 저장 막힘');
  perform test_assert(blocked(format('select public.biz_survey_save(%L, %L)', ceo, '[1,2]')), '답변 모양이 객체가 아니면 거절');
  perform test_assert(blocked(format('select public.biz_survey_save(%L, jsonb_build_object(''q1'', repeat(''가'', 210000)))', ceo)), '너무 큰 답변은 거절');
  perform test_assert(blocked('select public.biz_survey_resolve(''x'')'), '안쪽 도우미(열쇠 풀기)는 밖에서 못 부름');
  perform as_postgres();
end $$;

do $$
declare r jsonb; ceo text;
begin
  select token into ceo from tok where who='ceo';
  --  병원 계정이 링크를 손에 넣어도 그 링크 주인 것만 — 다른 길은 없음
  perform login_as('svhosp@dev.test');
  r := public.biz_survey_open(ceo);
  perform test_assert(r->>'respondent' = 'ceo', '로그인한 사람이 열어도 링크 주인 답지만 (계정과 무관)');
  perform test_assert(blocked('select public.biz_survey_admin_load()'), '병원 계정 — 링크가 있어도 두 분 전체는 못 봄');
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 4. 제출 · 제출 후 수정 · 이력 ──────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; ceo text; s1 timestamptz;
begin
  select token into ceo from tok where who='ceo';
  perform as_anon();
  perform public.biz_survey_submit(ceo, '{"q1":{"choice":"있음"},"q3":{"choice":"40~50만원"},"q22":{"choice":"협의 필요"}}');
  r := public.biz_survey_open(ceo);
  perform test_assert(r->>'status' = 'submitted' and r->>'submitted_at' is not null, '제출 → 제출 완료 · 제출일');
  s1 := (r->>'submitted_at')::timestamptz;
  perform pg_sleep(0.05);
  perform public.biz_survey_save(ceo, '{"q1":{"choice":"있음"},"q3":{"choice":"60~80만원"},"q22":{"choice":"협의 필요"}}');
  r := public.biz_survey_open(ceo);
  perform test_assert(r->>'status' = 'submitted' and (r->>'updated_at')::timestamptz > s1, '제출 후 고치면 — 제출 상태 그대로 · 최종 수정일이 뒤');
  perform public.biz_survey_submit(ceo, '{"q1":{"choice":"있음"},"q3":{"choice":"60~80만원"},"q22":{"choice":"5억원"}}');
  r := public.biz_survey_open(ceo);
  perform test_assert((r->>'first_submitted_at')::timestamptz = s1, '처음 제출일은 남는다');
  perform as_postgres();
  perform test_assert((select count(*) from public.biz_survey_revisions where respondent='ceo') = 2, '제출 이력 2장 (수정 이력)');
  perform test_assert((select count(*) from public.biz_survey_revisions where respondent='director') = 0, '이사님은 제출 전 — 이력 없음');
  perform login_as('svboss@dev.test');
  r := public.biz_survey_admin_load();
  perform test_assert(jsonb_array_length(r->'responses') = 2 and jsonb_array_length(r->'revisions') = 2, '관리자 — 두 분 답변 · 이력이 보임');
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 5. 만료 · 폐기 · 새 링크 ───────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; dir text; old text; new_tok text; v_id uuid;
begin
  select token, id into dir, v_id from tok where who='director';
  update public.biz_survey_invites set expires_at = now() - interval '1 minute' where id = v_id;
  perform as_anon();
  perform test_assert(blocked(format('select public.biz_survey_open(%L)', dir)), '만료된 링크 — 막힘');
  perform test_assert(blocked(format('select public.biz_survey_save(%L, %L)', dir, '{}')), '만료된 링크 — 저장도 막힘');
  perform as_postgres();
  update public.biz_survey_invites set expires_at = now() + interval '1 day' where id = v_id;

  perform login_as('svplan@dev.test');
  perform public.biz_survey_revoke_invite(v_id);
  perform as_postgres();
  perform as_anon();
  perform test_assert(blocked(format('select public.biz_survey_open(%L)', dir)), '폐기한 링크 — 막힘');
  perform as_postgres();

  select token into old from tok where who='ceo';
  perform login_as('svplan@dev.test');
  r := public.biz_survey_issue_invite('ceo', 14);
  new_tok := r->>'token';
  perform as_postgres();
  perform as_anon();
  perform test_assert(blocked(format('select public.biz_survey_open(%L)', old)), '새 링크를 만들면 예전 링크는 폐기');
  r := public.biz_survey_open(new_tok);
  perform test_assert(r->>'respondent' = 'ceo' and r->'answers'->'q3'->>'choice' = '60~80만원', '새 링크로 들어가도 답은 그대로 이어짐');
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 6. 설문 관리자 지정 ────────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  insert into public.biz_survey_admins(email) values ('SVPLAN@dev.test');
  perform login_as('svboss@dev.test');
  perform test_assert(blocked('select public.biz_survey_admin_load()'), '지정이 있으면 — 지정 안 된 관리자는 막힘');
  perform test_assert(not public.biz_survey_is_admin(), '지정 안 된 관리자 — 관리자 아님');
  perform as_postgres();
  perform login_as('svplan@dev.test');
  perform test_assert(jsonb_array_length(public.biz_survey_admin_load()->'responses') = 2, '지정된 계정(대소문자 무관) — 볼 수 있음');
  perform as_postgres();
  perform login_as('svdesk@dev.test');
  perform test_assert(not public.biz_survey_is_admin(), '사무실 — 관리자 아님');
  perform as_postgres();
  delete from public.biz_survey_admins;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 7. 기존 업무 표와 섞이지 않음 ──────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  perform test_assert(
    not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name in ('dev_requests','clients','collection_events')
                   and column_name like '%survey%'),
    '기존 업무 표에 설문 칸을 더하지 않음');
  perform test_assert(
    (select count(*) from information_schema.tables where table_schema='public' and table_name like 'biz_survey_%') = 4,
    '설문 표는 따로 4개');
end $$;

\echo '── 51 끝 ──'
