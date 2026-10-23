-- ─────────────────────────────────────────────────────────────────────────────
-- 53. 신보 뉴본펭귄 사업계획서 — 공동작성 · 검토 (0146) 검증
--
--  확인하는 것
--   1) 참여자만 연다 — 로그인 안 함 · 현장 · 병원 · 등록 안 된 사무실 직원은 못 연다,
--      대표·관리자는 등록 없이 「검토」, 등록된 사무실(이사님)은 「검토」, 등록된 담당은 「담당」
--   2) 참여자 관리는 대표·관리자 · 담당만, 현장 · 병원 계정은 참여자가 될 수 없다
--   3) 검토자는 문서를 직접 못 고친다 — 수정요청 · 확인 표시만. 요청은 내용을 바꾸지 않는다
--   4) 담당 저장 — 판 번호(rev), 기록 한 줄, 동시 저장은 덮어쓰지 않고 「충돌」로 돌아온다
--   5) 개인정보 · 계좌 · 서명 칸과 주민등록번호 모양은 저장을 거절한다
--   6) 요청 처리 — 반영(기록과 잇기) · 보류/반려(까닭 필수 · 상태 되돌림) · 끝난 요청은 다시 못 바꿈
--   7) 확인 표시는 사람마다 따로
--   8) 버전 — 같은 이름 거절, 남은 요청이 있으면 제출본 확정 거절, 확정 뒤 수정은 「수정 중」 · 확정본은 그대로
--   9) 기록 · 요청 · 버전은 지우거나 고칠 수 없다 (서버 관리자 계정으로도), 표는 직접 못 읽는다
--
--  실행 (로컬 PostgreSQL)
--    00_harness.sql → migrations 0001~0064 → (PROPOSAL_0144 · 0145) → PROPOSAL_0146
--    psql -d verify -v ON_ERROR_STOP=1 -f supabase/test/53_bizplan.sql
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
create or replace function err_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return ''; exception when others then return sqlerrm; end $$;
grant execute on function blocked(text) to anon, authenticated;
grant execute on function err_of(text) to anon, authenticated;
grant execute on function test_assert(boolean, text) to anon, authenticated;

--  깨끗한 문서에서 시작 (로컬 검증 DB 의 사업계획서 표만 — 기록 표는 지우기를 서버가 막으므로
--  검증 DB 에서만 잠깐 트리거를 건너뜁니다)
set session_replication_role = replica;
delete from public.bizplan_check_log;
delete from public.bizplan_checks;
delete from public.bizplan_request_log;
delete from public.bizplan_requests;
delete from public.bizplan_revisions;
delete from public.bizplan_versions;
delete from public.bizplan_fields;
delete from public.bizplan_doc;
delete from public.bizplan_members;
set session_replication_role = origin;

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('bpboss@dev.test',  '{"name":"송명근"}',   '{"role":"admin"}'),
  ('bpdir@dev.test',   '{"name":"홍현주"}',   '{"role":"office"}'),
  ('bpeditor@dev.test','{"name":"계획담당"}', '{"role":"office"}'),
  ('bpclerk@dev.test', '{"name":"사무직원"}', '{"role":"office"}'),
  ('bpdrive@dev.test', '{"name":"김기사"}',   '{"role":"field"}'),
  ('bphosp@dev.test',  '{"name":"병원"}',     '{"role":"client"}')
on conflict do nothing;
insert into public.profiles (id, email, name, role, active)
select u.id, u.email, u.raw_user_meta_data->>'name',
       (case when u.raw_app_meta_data->>'role' = 'client' then 'field' else u.raw_app_meta_data->>'role' end)::public.user_role, true
  from auth.users u where u.email like 'bp%@dev.test'
on conflict (id) do update set role = excluded.role, active = true, email = excluded.email, name = excluded.name;
do $$
declare v_c uuid;
begin
  insert into public.clients (name, type, address, collection_cycle) values ('계획검사병원', '병원', '검사로 3', '주 1회') returning id into v_c;
  update public.profiles set role = 'client', client_id = v_c where email = 'bphosp@dev.test';
end $$;

create or replace function pid(p_email text) returns uuid language sql as $$ select id from public.profiles where email = p_email $$;
grant execute on function pid(text) to authenticated;

\echo '── 1. 누가 여나 ───────────────────────────────────────────────────────────'
do $$
declare e text; r jsonb;
begin
  perform as_anon();
  perform test_assert(blocked('select public.bizplan_open()'), '로그인 안 함 — 못 엶');
  perform as_postgres();
  foreach e in array array['bpdrive@dev.test','bphosp@dev.test','bpclerk@dev.test','bpeditor@dev.test','bpdir@dev.test'] loop
    perform login_as(e);
    perform test_assert(blocked('select public.bizplan_open()'), e || ' — 등록 전에는 못 엶 (현장 · 병원 · 사무실)');
    perform test_assert(public.bizplan_my_role() is null, e || ' — 역할 없음');
    perform as_postgres();
  end loop;
  perform login_as('bpboss@dev.test');
  perform test_assert(public.bizplan_my_role() = 'reviewer', '대표·관리자 — 등록 없이 「검토」');
  r := public.bizplan_open();
  perform test_assert(r->'me'->>'name' = '송명근' and (r->>'can_manage')::boolean, '대표·관리자 — 열림 · 참여자 관리 가능');
  perform test_assert(jsonb_array_length(r->'fields') = 0 and r->'doc'->>'status' = '초안 작성 중', '빈 문서 — 지어낸 내용 없음 · 「초안 작성 중」');
  perform test_assert(r->'locked_keys' ? 's2.ceo_rrn' and r->'locked_keys' ? 's10.account', '저장하지 않는 칸 목록을 화면에 알려 줌');
  perform as_postgres();
end $$;

\echo '── 2. 참여자 관리 ─────────────────────────────────────────────────────────'
do $$
begin
  perform login_as('bpclerk@dev.test');
  perform test_assert(blocked(format('select public.bizplan_member_set(%L, %L, %L)', pid('bpclerk@dev.test'), 'editor', '셀프')), '등록 안 된 사무실 — 자기를 등록 못 함');
  perform as_postgres();
  perform login_as('bpboss@dev.test');
  perform public.bizplan_member_set(pid('bpdir@dev.test'), 'reviewer', '이사');
  perform public.bizplan_member_set(pid('bpeditor@dev.test'), 'editor', '사업계획 담당');
  perform public.bizplan_member_set(pid('bpboss@dev.test'), 'reviewer', '대표');
  perform test_assert(blocked(format('select public.bizplan_member_set(%L, %L)', pid('bpdrive@dev.test'), 'reviewer')), '현장 계정은 참여자가 될 수 없음');
  perform test_assert(blocked(format('select public.bizplan_member_set(%L, %L)', pid('bphosp@dev.test'), 'reviewer')), '병원 계정은 참여자가 될 수 없음');
  perform test_assert(blocked(format('select public.bizplan_member_set(%L, %L)', pid('bpdir@dev.test'), 'owner')), '역할은 담당 · 검토 둘뿐');
  perform test_assert(jsonb_array_length(public.bizplan_members_list()->'members') = 3, '참여자 셋');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  perform test_assert(public.bizplan_my_role() = 'reviewer', '이사님(사무실) — 등록 뒤 「검토」');
  perform test_assert(blocked('select public.bizplan_members_list()'), '검토자는 참여자 관리 못 함');
  perform as_postgres();
  perform login_as('bpclerk@dev.test');
  perform test_assert(blocked('select public.bizplan_open()'), '등록 안 된 사무실 직원 — 여전히 못 엶');
  perform as_postgres();
  perform login_as('bpeditor@dev.test');
  perform test_assert(public.bizplan_my_role() = 'editor' and public.bizplan_can_manage(), '담당 — 「담당」 · 참여자 관리 가능');
  perform as_postgres();
end $$;

\echo '── 3. 검토자는 직접 못 고친다 · 요청은 내용을 안 바꾼다 ─────────────────────'
do $$
declare r jsonb; f record;
begin
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_save_field('s1.company', to_jsonb('주식회사 검사'::text), '초안 입력 완료',
         '{"kind":"사실","source":"검사 자료","asOf":"2026-10-23"}', '최초 초안', 0);
  perform test_assert((r->>'ok')::boolean and (r->'field'->>'rev')::int = 1, '담당 — 첫 저장 rev 1');
  perform as_postgres();

  perform login_as('bpdir@dev.test');
  perform test_assert(blocked($q$select public.bizplan_save_field('s1.company', '"바꿈"', null, null, '', 1)$q$), '검토자(이사님) — 직접 저장 막힘');
  perform test_assert(blocked($q$select public.bizplan_doc_set('공동 검토 중')$q$), '검토자 — 문서 상태 못 바꿈');
  perform test_assert(blocked($q$select public.bizplan_version_create('V0.9')$q$), '검토자 — 버전 못 만듦');
  r := public.bizplan_request_create('s1.company', '1. 기업체 현황 › 업체명', '사실관계 수정', '법인명 표기를 확인해 주세요', '주식회사 검사(정정)');
  perform test_assert(r->>'status' = '접수' and r->>'requester_name' = '홍현주' and r->>'requester_title' = '이사', '요청 — 접수 · 요청자 자동(홍현주 · 이사)');
  perform test_assert(r->'snapshot' = to_jsonb('주식회사 검사'::text) and r->>'suggestion' = '주식회사 검사(정정)', '요청 — 그때 내용 · 제안 문장 저장');
  perform test_assert(not (r ? 'requester_id'), '요청 — 계정 id 는 돌려주지 않음');
  r := public.bizplan_open();
  perform test_assert((r->'requests'->0->>'mine')::boolean and not (r->'requests'->0 ? 'requester_id'), '열기 — 내 요청 표시(mine) · 계정 id 는 안 보냄');
  perform test_assert(blocked($q$select public.bizplan_request_create('s1.company', 'x', '아무거나', '내용')$q$), '요청 유형은 정해진 8가지');
  perform test_assert(blocked($q$select public.bizplan_request_create('s1.company', 'x', '의견 또는 질문', '   ')$q$), '빈 요청 거절');
  perform as_postgres();
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_open();
  perform test_assert(not (r->'requests'->0->>'mine')::boolean, '열기 — 남의 요청은 mine 아님');
  perform as_postgres();
  select value, status, rev into f from public.bizplan_fields where key = 's1.company';
  perform test_assert(f.value = to_jsonb('주식회사 검사'::text), '요청만으로는 문서 내용이 안 바뀜');
  perform test_assert(f.status = '수정 요청 있음', '고치는 요청 → 항목 상태 「수정 요청 있음」');
end $$;

\echo '── 4. 담당 저장 · 동시 저장 충돌 ─────────────────────────────────────────'
do $$
declare r jsonb; n int;
begin
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_save_field('s11.mgmt.background', to_jsonb('첫 문장'::text), '초안 입력 완료', null, '초안', 0);
  perform test_assert((r->'field'->>'rev')::int = 1, '새 항목 rev 1');
  --  두 화면이 rev 1 을 들고 있다가 차례로 저장
  r := public.bizplan_save_field('s11.mgmt.background', to_jsonb('담당 A 의 고침'::text), null, null, 'A', 1);
  perform test_assert((r->>'ok')::boolean and (r->'field'->>'rev')::int = 2, '먼저 저장한 쪽 — 저장 (rev 2)');
  r := public.bizplan_save_field('s11.mgmt.background', to_jsonb('담당 B 의 고침'::text), null, null, 'B', 1);
  perform test_assert(not (r->>'ok')::boolean and (r->>'conflict')::boolean, '늦게 저장한 쪽 — 덮어쓰지 않고 「충돌」');
  perform test_assert(r->'field'->>'value' = '"담당 A 의 고침"' or r->'field'->'value' = to_jsonb('담당 A 의 고침'::text), '충돌 — 서버 내용(A)을 돌려줌');
  r := public.bizplan_save_field('s11.mgmt.background', to_jsonb('담당 B 의 고침'::text), null, null, 'B 다시', 2);
  perform test_assert((r->>'ok')::boolean and (r->'field'->>'rev')::int = 3, '서버 내용을 본 뒤 다시 저장 — 저장 (rev 3)');
  r := public.bizplan_save_field('s11.mgmt.background', to_jsonb('담당 B 의 고침'::text), null, null, '같음', 3);
  perform test_assert((r->>'unchanged')::boolean and (r->'field'->>'rev')::int = 3, '바뀐 것 없으면 기록을 늘리지 않음');
  perform as_postgres();
  select count(*) into n from public.bizplan_revisions where key = 's11.mgmt.background';
  perform test_assert(n = 3, '기록 — 저장 3번 = 3줄 (충돌한 저장은 기록 없음)');
  perform test_assert((select before_value = to_jsonb('담당 A 의 고침'::text) and after_value = to_jsonb('담당 B 의 고침'::text)
                         and actor_name = '계획담당' and reason = 'B 다시'
                         from public.bizplan_revisions where key = 's11.mgmt.background' order by id desc limit 1),
                      '기록 — 바꾸기 전 · 후 · 누가 · 왜');
end $$;

\echo '── 5. 개인정보 · 계좌 · 서명은 저장하지 않음 ────────────────────────────────'
do $$
begin
  perform login_as('bpeditor@dev.test');
  perform test_assert(err_of($q$select public.bizplan_save_field('s2.ceo_rrn', '"800101-1234567"', null, null, '', 0)$q$) like '%저장하지 않습니다%', '주민등록번호 칸 — 거절');
  perform test_assert(blocked($q$select public.bizplan_save_field('s10.account', '"123-456-7890"', null, null, '', 0)$q$), '계좌번호 칸 — 거절');
  perform test_assert(blocked($q$select public.bizplan_save_field('sign.seal', '"(인)"', null, null, '', 0)$q$), '서명 칸 — 거절');
  perform test_assert(blocked($q$select public.bizplan_save_field('s1.homepage', '"대표 800101-1234567"', null, null, '', 0)$q$), '다른 칸에 주민번호 모양 — 거절');
  perform test_assert(blocked($q$select public.bizplan_save_field('s1.homepage', '[{"a":"900101 - 2345678"}]', null, null, '', 0)$q$), '표 안에 주민번호 모양 — 거절');
  perform test_assert(not blocked($q$select public.bizplan_save_field('s1.history', '[{"ym":"2026.06","text":"특허 출원 10-2026-0000000"}]', '초안 입력 완료', null, '', 0)$q$), '특허 번호 같은 다른 숫자는 저장됨');
  perform test_assert(blocked($q$select public.bizplan_save_field('S1.bad', '"x"', null, null, '', 0)$q$), '항목 이름 형식 검사');
  perform test_assert(blocked($q$select public.bizplan_save_field('s1.homepage', '"x"', '아무상태', null, '', 0)$q$), '상태 값 검사');
  perform as_postgres();
  perform test_assert(not exists (select 1 from public.bizplan_fields where key in ('s2.ceo_rrn','s10.account','sign.seal')), '그 칸들은 표에 아예 없음');
  perform test_assert(not exists (select 1 from public.bizplan_requests where body ~ '[0-9]{6}-[1-4][0-9]{6}'), '요청에도 없음');
  perform login_as('bpdir@dev.test');
  perform test_assert(blocked($q$select public.bizplan_request_create('s2.ceo_name', 'x', '사실관계 수정', '주민번호 800101-1234567 입니다')$q$), '요청 글에 주민번호 모양 — 거절');
  perform as_postgres();
end $$;

\echo '── 6. 요청 처리 ───────────────────────────────────────────────────────────'
do $$
declare r jsonb; v_req uuid; v_req2 uuid; v_q uuid; f record; rv bigint;
begin
  select id into v_req from public.bizplan_requests where key = 's1.company';
  select rev into f from public.bizplan_fields where key = 's1.company';
  perform login_as('bpeditor@dev.test');
  perform test_assert(err_of(format('select public.bizplan_save_field(%L, %L, %L, null, %L, %s)', 's1.company', '"x"', '최종 확인 완료', '', f.rev))
                      like '%처리하지 않은 수정요청%', '남은 요청이 있으면 「최종 확인 완료」 거절');
  r := public.bizplan_request_update(v_req, '검토 중', '');
  perform test_assert(r->>'status' = '검토 중' and r->>'handler_name' = '계획담당', '접수 → 검토 중 (담당자 기록)');
  perform as_postgres();
  select rev into f from public.bizplan_fields where key = 's1.company';
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_save_field('s1.company', to_jsonb('주식회사 검사(정정)'::text), '수정 반영 완료', null, '이사님 요청대로 정정', f.rev, v_req);
  perform test_assert((r->>'ok')::boolean, '제안 문장 반영 저장 — 요청과 이음');
  rv := (r->>'revision')::bigint;
  perform test_assert(blocked(format('select public.bizplan_request_update(%L, %L, %L)', v_req, '반려', '이미 끝남')), '끝난 요청은 다시 못 바꿈');
  perform as_postgres();
  select status, applied_revision, resolution into f from public.bizplan_requests where id = v_req;
  perform test_assert(f.status = '반영 완료' and f.applied_revision = rv and f.resolution = '이사님 요청대로 정정', '요청 → 반영 완료 · 기록 번호 · 결과 글');

  --  반려 → 상태 되돌림 · 까닭 필수
  perform login_as('bpdir@dev.test');
  r := public.bizplan_request_create('s11.mgmt.background', '11 › 창업배경', '문장 수정', '조금 더 짧게', '');
  v_req2 := (r->>'id')::uuid;
  r := public.bizplan_request_create('s11.mgmt.background', '11 › 창업배경', '의견 또는 질문', '이 표현이 맞나요?', '');
  v_q := (r->>'id')::uuid;
  perform as_postgres();
  perform login_as('bpeditor@dev.test');
  perform test_assert(blocked(format('select public.bizplan_request_update(%L, %L, %L)', v_req2, '반려', '')), '반려는 까닭 없이 못 함');
  r := public.bizplan_request_update(v_req2, '반려', '원본 서식 분량에 맞춘 문장이라 유지');
  perform test_assert(r->>'status' = '반려' and r->>'resolution' = '원본 서식 분량에 맞춘 문장이라 유지', '반려 — 까닭 남음');
  perform as_postgres();
  select status into f from public.bizplan_fields where key = 's11.mgmt.background';
  perform test_assert(f.status = '초안 입력 완료', '반려 뒤 — 요청 전 상태로 되돌림 (질문은 상태와 무관)');
  perform test_assert((select status from public.bizplan_requests where id = v_q) = '접수', '질문 요청은 그대로 남음');
  perform test_assert((select count(*) from public.bizplan_request_log where request_id = v_req) = 3, '요청 상태 기록 — 접수 · 검토 중 · 반영 완료');
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_request_update(v_q, '보류', '다음 회의에서 결정');
  perform test_assert(r->>'status' = '보류', '보류 — 까닭과 함께');
  r := public.bizplan_request_update(v_q, '반영 완료', '답변: 맞습니다');
  perform test_assert(r->>'status' = '반영 완료', '보류했던 요청도 나중에 끝낼 수 있음');
  perform as_postgres();
end $$;

\echo '── 7. 확인 표시 — 사람마다 따로 ───────────────────────────────────────────'
do $$
declare n int;
begin
  perform login_as('bpboss@dev.test');
  perform public.bizplan_check('s1.company', '동의', '');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  perform public.bizplan_check('s1.company', '자료 확인 필요', '사업자등록증 대조');
  perform test_assert(blocked($q$select public.bizplan_check('s1.company', '대충 동의', '')$q$), '확인 표시는 정해진 넷');
  perform as_postgres();
  select count(*) into n from public.bizplan_checks where key = 's1.company';
  perform test_assert(n = 2, '대표님 동의 · 이사님 자료 확인 — 따로 두 줄 (한 분의 동의가 다른 분 확인을 대신하지 않음)');
  perform test_assert((select mark from public.bizplan_checks c join public.profiles p on p.id = c.profile_id where c.key = 's1.company' and p.email = 'bpdir@dev.test') = '자료 확인 필요', '이사님 표시 그대로');
  perform login_as('bpboss@dev.test');
  perform public.bizplan_check('s1.company', null, '');
  perform as_postgres();
  perform test_assert((select count(*) from public.bizplan_checks where key = 's1.company') = 1, '내 표시 지우기 — 내 것만');
  perform test_assert((select count(*) from public.bizplan_check_log where key = 's1.company') = 3, '확인 기록은 지운 것까지 남음 (누가 · 언제)');
end $$;

\echo '── 8. 버전 · 제출본 ───────────────────────────────────────────────────────'
do $$
declare r jsonb; v_req uuid; snap jsonb; n int;
begin
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_version_create('V0.1', '최초 초안', false);
  perform test_assert((r->>'ok')::boolean, 'V0.1 저장');
  perform test_assert(blocked($q$select public.bizplan_version_create('V0.1', '덮어쓰기', false)$q$), '같은 버전 이름 — 거절 (덮어쓰지 않음)');
  perform test_assert(blocked($q$select public.bizplan_version_create('최종', '', false)$q$), '버전 이름 형식 (V0.1)');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  r := public.bizplan_request_create('s1.company', '1 › 업체명', '최종 확인 요청', '이대로 확정해도 됩니다', '');
  v_req := (r->>'id')::uuid;
  perform as_postgres();
  perform login_as('bpeditor@dev.test');
  perform test_assert(err_of($q$select public.bizplan_version_create('V1.0', '제출본', true)$q$) like '%처리하지 않은 수정요청%', '남은 요청이 있으면 제출본 확정 거절');
  perform public.bizplan_request_update(v_req, '반영 완료', '확인함');
  r := public.bizplan_version_create('V1.0', '신보 제출본', true);
  r := public.bizplan_open();
  perform test_assert(r->'doc'->>'status' = '제출본 확정' and r->'doc'->>'locked_label' = 'V1.0', '제출본 확정 — 문서 상태 · 확정 버전');
  perform test_assert(blocked($q$select public.bizplan_doc_set('제출본 확정')$q$), '「제출본 확정」은 버전 저장으로만');
  r := public.bizplan_save_field('s1.homepage', to_jsonb('https://example.test'::text), '초안 입력 완료', null, '확정 뒤 수정', 0);
  perform test_assert((r->>'ok')::boolean, '확정 뒤에도 담당은 고칠 수 있음 (새 버전으로)');
  r := public.bizplan_open();
  perform test_assert(r->'doc'->>'status' = '수정 중', '확정 뒤 고치면 「수정 중」');
  perform as_postgres();
  select snapshot into snap from public.bizplan_versions where label = 'V1.0';
  perform test_assert(coalesce(snap->'s1.homepage'->'value', 'null'::jsonb) <> to_jsonb('https://example.test'::text), '확정본(V1.0) 내용은 그대로 — 뒤 수정이 안 들어감');
  perform test_assert(snap->'s1.company'->'value' = to_jsonb('주식회사 검사(정정)'::text), '확정본에 그때 내용이 통째로');
  select id into n from public.bizplan_versions where label = 'V1.0';
  perform login_as('bpdir@dev.test');
  r := public.bizplan_version_get(n);
  perform test_assert(r->>'label' = 'V1.0' and r->>'is_submission' = 'true', '검토자도 확정본을 열어 볼 수 있음');
  r := public.bizplan_history('s1.company');
  perform test_assert(jsonb_array_length(r->'revisions') >= 2 and jsonb_array_length(r->'request_log') >= 3, '항목 기록 · 요청 기록을 볼 수 있음');
  perform test_assert(not ((r->'revisions'->0) ? 'actor_id'), '기록에 계정 id 는 안 실음');
  perform as_postgres();
end $$;

\echo '── 9. 지울 수 없다 · 표를 직접 못 읽는다 ──────────────────────────────────'
do $$
declare t text;
begin
  perform test_assert(blocked('delete from public.bizplan_revisions'), '기록 — 서버 관리자도 지우기 막힘');
  perform test_assert(blocked($q$update public.bizplan_revisions set reason = '바꿈'$q$), '기록 — 고치기 막힘');
  perform test_assert(blocked('delete from public.bizplan_versions'), '버전 — 지우기 막힘');
  perform test_assert(blocked($q$update public.bizplan_versions set note = '바꿈'$q$), '버전 — 고치기 막힘 (확정본 덮어쓰기 불가)');
  perform test_assert(blocked('delete from public.bizplan_requests'), '요청 — 지우기 막힘');
  perform test_assert(blocked('delete from public.bizplan_request_log'), '요청 기록 — 지우기 막힘');
  perform test_assert(blocked('delete from public.bizplan_check_log'), '확인 기록 — 지우기 막힘');
  foreach t in array array['bpboss@dev.test','bpeditor@dev.test'] loop
    perform login_as(t);
    perform test_assert(blocked('select * from public.bizplan_fields'), t || ' — 항목 표 직접 읽기 막힘');
    perform test_assert(blocked('select * from public.bizplan_requests'), t || ' — 요청 표 직접 읽기 막힘');
    perform test_assert(blocked($q$insert into public.bizplan_fields(doc_id, key) values ('newborn2026', 'zz')$q$), t || ' — 항목 표 직접 쓰기 막힘');
    perform as_postgres();
  end loop;
  --  등록을 끄면 바로 못 엶
  perform login_as('bpboss@dev.test');
  perform public.bizplan_member_set(pid('bpdir@dev.test'), 'reviewer', '이사', false);
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  perform test_assert(blocked('select public.bizplan_open()'), '참여자 끄면 — 이사님 계정도 바로 못 엶');
  perform as_postgres();
  perform login_as('bpboss@dev.test');
  perform public.bizplan_member_set(pid('bpdir@dev.test'), 'reviewer', '이사', true);
  perform as_postgres();
end $$;

\echo '── 끝 ─────────────────────────────────────────────────────────────────────'
