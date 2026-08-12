-- ─────────────────────────────────────────────────────────────────────────────
-- 04. 가입 승인 검증 (0021)
--
--  여기서 확인하는 것은 하나입니다 —
--  「스스로 가입한 사람이 권한을 가질 수 있는가」
--
--  화면을 고쳐서 막는 것이 아니라 DB 가 막는지를 봅니다. 그래서 이 파일은
--  앱을 통하지 않고 auth.users 에 직접 넣습니다. 실제 공격자도 앱을 거치지
--  않습니다 — signUp 요청 한 줄을 직접 보냅니다.
--
--  실행
--    psql -d verify -v ON_ERROR_STOP=1 -f supabase/test/00_harness.sql
--    (migrations 0001~0021 적용)
--    psql -d verify -v ON_ERROR_STOP=1 -f supabase/test/04_signup_approval.sql
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

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 1. 스스로 가입 — 무엇을 적어 넣든 현장 + 승인 대기 ────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
--
--  공격자가 실제로 보낼 수 있는 요청입니다.
--    supabase.auth.signUp({ email, password, options: { data: { role: 'admin' } } })
--  options.data 는 raw_user_meta_data 로 들어갑니다. app_metadata 는 브라우저에서
--  넣을 방법이 없으므로 여기서도 비워 둡니다 — 그게 공개 가입의 실제 모습입니다.

insert into auth.users (email, raw_user_meta_data) values
  ('attacker@example.com',  '{"name":"침입자","role":"admin"}'),
  ('attacker2@example.com', '{"name":"침입자2","role":"office"}'),
  ('attacker3@example.com', '{"name":"침입자3","role":"client","client_id":"00000000-0000-0000-0000-000000000001"}'),
  ('newbie@example.com',    '{"name":"새직원"}');

do $$ begin
  perform test_assert(
    (select bool_and(role = 'field') from public.profiles where email like '%@example.com'),
    'user_metadata.role 을 무엇으로 넣어도 전부 현장(field)');
  perform test_assert(
    (select bool_and(not active) from public.profiles where email like '%@example.com'),
    '가입 계정은 전부 비활성 (승인 전에는 아무것도 못 봄)');
  perform test_assert(
    (select bool_and(approved_at is null) from public.profiles where email like '%@example.com'),
    '가입 계정은 전부 승인 대기 (approved_at NULL)');
  perform test_assert(
    (select bool_and(client_id is null) from public.profiles where email like '%@example.com'),
    'client_id 를 적어 넣어도 소속이 붙지 않음');
  perform test_assert(
    (select name from public.profiles where email = 'newbie@example.com') = '새직원',
    '이름은 본인이 적은 값 그대로 (권한이 아니라 표시용)');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 2. 승인 대기 계정은 서버가 막습니다 ───────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
--
--  화면에서 메뉴를 숨기는 것과는 다른 이야기입니다. 토큰을 들고 직접
--  요청해도 데이터가 나오지 않아야 합니다.

do $$
declare v_clients integer; v_profiles integer; v_audit integer;
begin
  perform as_postgres();
  --  볼거리를 하나 만들어 둡니다. 없으면 "0건"이 막혀서인지 원래 없어서인지
  --  구분이 안 됩니다.
  insert into public.clients (name, type, address)
  values ('검증병원', '병원', '서울시 강남구') on conflict do nothing;

  perform login_as('attacker@example.com');

  perform test_assert(public.auth_role() is null, '승인 대기 → auth_role() 이 NULL');
  perform test_assert(not public.is_active_user(), '승인 대기 → is_active_user() 거짓');
  perform test_assert(not public.is_admin(), '승인 대기 → is_admin() 거짓');
  perform test_assert(not public.is_staff(), '승인 대기 → is_staff() 거짓');

  select count(*) into v_clients  from public.clients;
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_audit    from public.audit_logs;

  perform test_assert(v_clients = 0,  '승인 대기 → 거래처 목록 0건 (RLS 차단)');
  perform test_assert(v_profiles = 1, '승인 대기 → 계정 목록은 자기 것 1건만');
  perform test_assert(v_audit = 0,    '승인 대기 → 감사기록 0건');

  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 3. 스스로 승인할 수 없습니다 ──────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
--
--  자기 프로필 한 줄은 읽을 수 있습니다(승인 대기 안내를 띄우려면 필요).
--  읽을 수 있으면 고칠 수도 있는지 확인해야 합니다.

do $$
declare v_blocked boolean;
begin
  perform login_as('attacker@example.com');

  -- (1) 스스로 활성화
  begin
    update public.profiles set active = true where id = auth.uid();
    v_blocked := not found;
  exception when others then v_blocked := true;
  end;
  perform test_assert(v_blocked, '본인이 active 를 켤 수 없음');

  -- (2) 스스로 역할 올리기
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    v_blocked := not found;
  exception when others then v_blocked := true;
  end;
  perform test_assert(v_blocked, '본인이 역할을 올릴 수 없음');

  -- (3) 승인된 척하기 — approved_at 을 채우면 승인 대기 목록에서 사라집니다.
  --     active 는 여전히 못 바꾸므로 권한이 열리지는 않지만, 관리자 눈에
  --     띄지 않게 되어 그대로 방치됩니다.
  begin
    update public.profiles set approved_at = now() where id = auth.uid();
    v_blocked := not found;
  exception when others then v_blocked := true;
  end;
  perform test_assert(v_blocked, '본인이 approved_at 을 채울 수 없음');

  -- (4) 이름은 바꿀 수 있어야 합니다 (막아야 할 것만 막혔는지 확인)
  update public.profiles set name = '이름변경' where id = auth.uid();
  perform test_assert(
    (select name from public.profiles where id = auth.uid()) = '이름변경',
    '이름은 본인이 바꿀 수 있음 (과하게 막지 않음)');

  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 4. 승인은 관리자만 ────────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('boss@beonemirae.test',  '{"name":"대표"}',     '{"role":"admin"}'),
  ('desk@beonemirae.test',  '{"name":"사무실"}',   '{"role":"office"}');

do $$
declare v_blocked boolean; v_err text;
begin
  perform test_assert(
    (select role from public.profiles where email = 'boss@beonemirae.test') = 'admin'
    and (select active from public.profiles where email = 'boss@beonemirae.test'),
    'app_metadata 로 만든 계정은 지정한 역할 + 바로 사용');

  -- 승인 대기 계정이 스스로 승인 함수를 부를 수 있는가
  perform login_as('attacker@example.com');
  begin
    perform public.admin_approve_user(
      (select id from public.profiles where email = 'attacker@example.com'), 'admin');
    v_blocked := false;
  exception when others then v_blocked := true; v_err := sqlerrm;
  end;
  perform test_assert(v_blocked, '승인 대기 계정은 승인 함수를 부를 수 없음 — ' || coalesce(v_err, ''));

  -- 사무실 담당자(정상 계정이지만 관리자 아님)가 부를 수 있는가
  perform login_as('desk@beonemirae.test');
  begin
    perform public.admin_approve_user(
      (select id from public.profiles where email = 'attacker@example.com'), 'office');
    v_blocked := false;
  exception when others then v_blocked := true; v_err := sqlerrm;
  end;
  perform test_assert(v_blocked, '사무실 담당자도 승인할 수 없음 — ' || coalesce(v_err, ''));

  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 5. 관리자가 승인하면 그때부터 열립니다 ────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_id uuid; v_clients integer;
begin
  select id into v_id from public.profiles where email = 'newbie@example.com';

  perform login_as('boss@beonemirae.test');
  perform public.admin_approve_user(v_id, 'field');
  perform as_postgres();

  perform test_assert(
    (select active and approved_at is not null and role = 'field'
       from public.profiles where id = v_id),
    '승인 → 활성 + 승인시각 기록 + 지정한 역할');

  perform login_as('newbie@example.com');
  select count(*) into v_clients from public.clients;
  perform test_assert(v_clients > 0, '승인 후 거래처가 보임');
  perform test_assert(public.auth_role() = 'field', '승인 후 역할이 현장으로 잡힘');
  perform as_postgres();
end $$;

-- 승인할 때 역할을 올려 지정할 수도 있어야 합니다 (현장 → 사무실)
do $$
declare v_id uuid;
begin
  select id into v_id from public.profiles where email = 'attacker2@example.com';
  perform login_as('boss@beonemirae.test');
  perform public.admin_approve_user(v_id, 'office');
  perform as_postgres();
  perform test_assert(
    (select role = 'office' and active from public.profiles where id = v_id),
    '승인하면서 사무실 담당자로 지정 가능');
end $$;

-- 이미 승인된 계정을 다시 승인하면 거절합니다 (역할 변경은 목록에서)
do $$
declare v_blocked boolean; v_err text; v_id uuid;
begin
  select id into v_id from public.profiles where email = 'newbie@example.com';
  perform login_as('boss@beonemirae.test');
  begin
    perform public.admin_approve_user(v_id, 'admin');
    v_blocked := false;
  exception when others then v_blocked := true; v_err := sqlerrm;
  end;
  perform test_assert(v_blocked, '이미 승인된 계정 재승인 차단 — ' || coalesce(v_err, ''));
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 6. 거절 = 계정 삭제, 단 승인된 적 없는 계정만 ─────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_id uuid; v_blocked boolean; v_err text;
begin
  select id into v_id from public.profiles where email = 'attacker3@example.com';
  perform login_as('boss@beonemirae.test');
  perform public.admin_reject_user(v_id);
  perform as_postgres();

  perform test_assert(
    not exists (select 1 from public.profiles where id = v_id),
    '거절 → 프로필 삭제');
  perform test_assert(
    not exists (select 1 from auth.users where id = v_id),
    '거절 → 로그인 계정까지 삭제 (다시 가입은 가능)');

  -- 쓰던 계정을 이 길로 지울 수는 없어야 합니다
  select id into v_id from public.profiles where email = 'newbie@example.com';
  perform login_as('boss@beonemirae.test');
  begin
    perform public.admin_reject_user(v_id);
    v_blocked := false;
  exception when others then v_blocked := true; v_err := sqlerrm;
  end;
  perform test_assert(v_blocked, '승인된 계정은 거절로 삭제할 수 없음 — ' || coalesce(v_err, ''));
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 7. 감사기록 ──────────────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_approve integer; v_reject integer; v_noise integer; v_actor text;
begin
  select count(*) into v_approve from public.audit_logs where action = 'profile.approve';
  select count(*) into v_reject  from public.audit_logs where action = 'profile.reject';
  select count(*) into v_noise   from public.audit_logs
   where action in ('profile.role', 'profile.active')
     and entity_id in (select id::text from public.profiles where email like '%@example.com');

  perform test_assert(v_approve = 2, '승인 2건이 profile.approve 로 남음');
  perform test_assert(v_reject  = 1, '거절 1건이 profile.reject 로 남음');
  perform test_assert(v_noise   = 0, '승인 한 번에 기록 한 줄 (역할·활성 중복 없음)');

  select actor_name into v_actor from public.audit_logs
   where action = 'profile.approve' order by at desc limit 1;
  perform test_assert(v_actor is not null and v_actor <> '', '승인 기록에 승인한 사람이 남음 — ' || coalesce(v_actor, ''));
end $$;

\echo ''
\echo '  전부 통과했습니다 — 스스로 가입한 계정은 승인 전까지 아무것도 할 수 없습니다.'
\echo ''
