-- ─────────────────────────────────────────────────────────────────────────────
-- 05. 개발 요청함 검증 (0022)
--
--  확인하는 것
--   1) 누구든 요청을 보낼 수 있다 (현장 담당자가 주 사용자입니다)
--   2) 남의 이름으로 보낼 수 없다 — 요청자는 서버가 정합니다
--   3) 자기가 보낸 것만 보인다. 관리자는 전부 본다
--   4) 관리자만 상태를 바꾼다
--   5) 아무도 지울 수 없다 (불편했다는 기록이 사라지면 안 됩니다)
--
--  실행
--    psql -d verify -f supabase/test/00_harness.sql
--    (migrations 0001~0022 적용)
--    psql -d verify -v ON_ERROR_STOP=1 -f supabase/test/05_dev_requests.sql
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

create or replace function as_postgres() returns void language plpgsql as $$
begin execute 'reset role'; end $$;

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('boss@dev.test',  '{"name":"대표"}',   '{"role":"admin"}'),
  ('desk@dev.test',  '{"name":"사무실"}', '{"role":"office"}'),
  ('drive@dev.test', '{"name":"김기사"}', '{"role":"field"}');

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 1. 현장 담당자가 요청을 보냅니다 ──────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_id uuid; r public.dev_requests%rowtype;
begin
  perform login_as('drive@dev.test');
  insert into public.dev_requests (topics, message)
  values (array['거래처 정보가 실제와 다릅니다', '폰에서 입력이 느리거나 중간에 끊깁니다'],
          '지하 주차장에서 저장 버튼이 안 눌릴 때가 있습니다')
  returning id into v_id;
  perform as_postgres();

  select * into r from public.dev_requests where id = v_id;
  perform test_assert(r.requester_role = 'field', '요청자 역할이 현장으로 기록됨');
  perform test_assert(r.requester_name = '김기사', '요청자 이름이 서버에서 채워짐');
  perform test_assert(cardinality(r.topics) = 2, '고른 항목 2개가 그대로 저장됨');
  perform test_assert(r.status = '접수', '처음 상태는 접수');
end $$;

-- 남의 이름으로 보낼 수 있는가 — 보낸 값은 무시되어야 합니다
do $$
declare v_id uuid; r public.dev_requests%rowtype; v_boss uuid;
begin
  select id into v_boss from public.profiles where email = 'boss@dev.test';
  perform login_as('drive@dev.test');
  insert into public.dev_requests (requester_id, requester_name, requester_role, message)
  values (v_boss, '대표', 'admin', '남의 이름으로 보내기')
  returning id into v_id;
  perform as_postgres();

  select * into r from public.dev_requests where id = v_id;
  perform test_assert(r.requester_name = '김기사' and r.requester_role = 'field',
    '남의 이름·역할을 적어 보내도 실제 로그인한 사람으로 기록됨');
end $$;

-- 빈 요청은 받지 않습니다
do $$
declare v_blocked boolean;
begin
  perform login_as('drive@dev.test');
  begin
    insert into public.dev_requests (topics, message) values ('{}', '   ');
    v_blocked := false;
  exception when check_violation then v_blocked := true;
  end;
  perform test_assert(v_blocked, '아무것도 고르지 않고 아무것도 쓰지 않으면 거절');
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 2. 자기 것만 보이고, 관리자는 전부 봅니다 ─────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare n integer;
begin
  perform login_as('desk@dev.test');
  insert into public.dev_requests (topics) values (array['청구 금액이 기존 엑셀과 다릅니다']);
  select count(*) into n from public.dev_requests;
  perform test_assert(n = 1, '사무실 담당자에게는 자기가 보낸 1건만 보임');
  perform as_postgres();

  perform login_as('drive@dev.test');
  select count(*) into n from public.dev_requests;
  perform test_assert(n = 2, '현장 담당자에게는 자기가 보낸 2건만 보임');
  perform as_postgres();

  perform login_as('boss@dev.test');
  select count(*) into n from public.dev_requests;
  perform test_assert(n = 3, '관리자에게는 3건 전부 보임');
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 3. 상태 변경은 관리자만 ──────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_id uuid; n integer; r public.dev_requests%rowtype;
begin
  select id into v_id from public.dev_requests where requester_name = '김기사' limit 1;

  --  보낸 사람이 자기 요청 상태를 '처리 완료'로 바꿀 수 있는가
  perform login_as('drive@dev.test');
  update public.dev_requests set status = '처리 완료' where id = v_id;
  get diagnostics n = row_count;
  perform test_assert(n = 0, '보낸 사람이 자기 요청 상태를 바꿀 수 없음');
  perform as_postgres();

  perform login_as('desk@dev.test');
  update public.dev_requests set status = '처리 완료' where id = v_id;
  get diagnostics n = row_count;
  perform test_assert(n = 0, '사무실 담당자도 상태를 바꿀 수 없음');
  perform as_postgres();

  perform login_as('boss@dev.test');
  update public.dev_requests set status = '확인', admin_note = '다음 배포에 반영' where id = v_id;
  get diagnostics n = row_count;
  perform test_assert(n = 1, '관리자는 상태를 바꿀 수 있음');
  perform as_postgres();

  select * into r from public.dev_requests where id = v_id;
  perform test_assert(r.handled_at is not null, '처리 시각이 서버에서 기록됨');
  perform test_assert(r.handled_by = (select id from public.profiles where email = 'boss@dev.test'),
    '처리한 사람이 서버에서 기록됨');
  perform test_assert(r.admin_note = '다음 배포에 반영', '관리자 메모 저장됨');
end $$;

-- 보낸 사람도 상태가 바뀐 것을 봅니다 (또 보내지 않도록)
do $$
declare v_status text;
begin
  perform login_as('drive@dev.test');
  select status into v_status from public.dev_requests where requester_name = '김기사' and status <> '접수' limit 1;
  perform test_assert(v_status = '확인', '보낸 사람도 처리 상태를 확인할 수 있음');
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 4. 아무도 지울 수 없습니다 ───────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare n integer; total integer;
begin
  select count(*) into total from public.dev_requests;

  perform login_as('drive@dev.test');
  delete from public.dev_requests;
  get diagnostics n = row_count;
  perform test_assert(n = 0, '보낸 사람이 자기 요청을 지울 수 없음');
  perform as_postgres();

  perform login_as('boss@dev.test');
  delete from public.dev_requests;
  get diagnostics n = row_count;
  perform test_assert(n = 0, '관리자도 지울 수 없음 (불편했다는 기록은 남습니다)');
  perform as_postgres();

  perform test_assert((select count(*) from public.dev_requests) = total, '요청 건수 그대로');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 5. 승인 대기 계정은 요청도 보낼 수 없습니다 ──────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
--  0021 의 승인 대기 계정은 아무 데이터도 만들 수 없어야 합니다.
--  요청함이 그 예외가 되면, 승인받지 못한 사람이 관리자 화면에 글을 남깁니다.

insert into auth.users (email, raw_user_meta_data) values ('pending@dev.test', '{"name":"미승인"}');

do $$
declare v_blocked boolean;
begin
  perform login_as('pending@dev.test');
  begin
    insert into public.dev_requests (message) values ('승인 전에 보내기');
    v_blocked := false;
  exception when others then v_blocked := true;
  end;
  perform test_assert(v_blocked, '승인 대기 계정은 요청을 보낼 수 없음');
  perform as_postgres();
end $$;

\echo ''
\echo '  개발 요청함 검증 통과 — 누가 보냈는지 속일 수 없고, 지울 수 없습니다.'
\echo ''
