-- ─────────────────────────────────────────────────────────────────────────────
-- 실사용 전환 검증 — 실제 PostgreSQL 에서 실행되는 단언(assertion) 모음
--
--  "코드상 가능해 보임"이 아니라 실제 DB 에서 통과해야 합니다.
--  실패하면 exception 이 발생해 스크립트가 즉시 중단됩니다.
--
--  실행: psql -d beonemirae -v ON_ERROR_STOP=1 -f supabase/test/01_verify.sql
-- ─────────────────────────────────────────────────────────────────────────────

\set QUIET on
\pset pager off

create or replace function test_ok(msg text) returns void language plpgsql as $$
begin raise notice ' OK  | %', msg; end $$;

create or replace function test_assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond then raise notice ' OK  | %', msg;
  else raise exception 'FAIL | %', msg;
  end if;
end $$;

/** 지정한 사용자로 로그인한 것처럼 세션을 설정합니다 (Supabase 와 동일한 방식) */
create or replace function login_as(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is null then raise exception '테스트 계정 없음: %', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace function logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end $$;

create or replace function as_postgres() returns void language plpgsql as $$
begin execute 'reset role'; end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 3. Auth 계정 3종 ──────────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
-- 실제 Supabase 에서는 Auth 가 하는 일을 여기서는 auth.users 직접 삽입으로 재현.
-- 비밀번호는 넣지 않습니다(auth.users 가 관리하며 이 프로젝트는 저장하지 않음).
--
--  역할은 raw_app_meta_data 에 넣습니다 (0021). 관리자가 만든 계정이 지나는
--  길과 같습니다. raw_user_meta_data 는 가입하는 본인이 쓰는 자리라 트리거가
--  더 이상 역할을 읽지 않습니다 — 읽으면 스스로 관리자가 될 수 있습니다.
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('admin@beonemirae.test',  '{"name":"대표관리자"}',  '{"role":"admin"}'),
  ('office@beonemirae.test', '{"name":"사무실담당"}',  '{"role":"office"}'),
  ('field@beonemirae.test',  '{"name":"현장담당"}',    '{"role":"field"}');

do $$ begin
  perform test_assert((select count(*) from public.profiles) = 3, '계정 3개 → profiles 자동 생성');
  perform test_assert((select role from public.profiles where email='admin@beonemirae.test') = 'admin',
    'app_metadata.role=admin 반영');
  perform test_assert((select role from public.profiles where email='office@beonemirae.test') = 'office',
    'app_metadata.role=office 반영');
  perform test_assert((select role from public.profiles where email='field@beonemirae.test') = 'field',
    'app_metadata.role=field 반영');
  perform test_assert((select bool_and(active and approved_at is not null) from public.profiles),
    '관리자가 만든 계정은 승인된 상태로 생성');
  perform test_assert((select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name in ('password','encrypted_password','pw')) = 0,
    'profiles 에 비밀번호 컬럼 없음');
end $$;

-- 검증용 기초 데이터 (관리자 권한으로 생성)
insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver)
values ('의료 1호', '의료폐기물', 1.0, 1000, 800, '김기사'),
       ('기저귀 1호', '일회용기저귀', 2.5, 2500, 2000, '박기사');
insert into public.office_stock (id, corrugated_box, plastic_container, bag, needle_box)
values (1, 100, 100, 100, 100)
on conflict (id) do update set corrugated_box=100, plastic_container=100, bag=100, needle_box=100;

-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── 4. RLS 실제 DB 차단 ───────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

-- 4-1. 비로그인(anon) 은 어떤 운영 테이블도 볼 수 없다
do $$
declare n int; blocked boolean := false;
begin
  perform logout();
  begin
    select count(*) into n from public.clients;
    -- 권한이 살아 있어도 RLS 로 0건이어야 함
    blocked := (n = 0);
  exception when insufficient_privilege then blocked := true;
  end;
  perform as_postgres();
  perform test_assert(blocked, '비로그인(anon) 거래처 조회 차단');
end $$;

do $$
declare n int; blocked boolean := false;
begin
  perform logout();
  begin
    select count(*) into n from public.collection_events;
    blocked := (n = 0);
  exception when insufficient_privilege then blocked := true;
  end;
  perform as_postgres();
  perform test_assert(blocked, '비로그인(anon) 감사기록 조회 차단');
end $$;

-- 4-2. 관리자가 거래처를 만든다 (office 도 가능해야 함)
do $$
declare v_id uuid;
begin
  perform login_as('office@beonemirae.test');
  insert into public.clients (name, type, address, manager, phone, collection_cycle)
  values ('한양의료재단', '병원', '남양주시 A로 1', '김담당', '031-000-0001', '주 2회')
  returning id into v_id;
  perform as_postgres();
  perform test_assert(v_id is not null, '사무실 담당자 거래처 생성 가능');
end $$;

-- 4-3. 현장 담당자는 거래처를 만들 수 없다
do $$
declare blocked boolean := false;
begin
  perform login_as('field@beonemirae.test');
  begin
    insert into public.clients (name, type) values ('무단생성', '의원');
  exception
    when insufficient_privilege then blocked := true;
    when others then blocked := (sqlstate = '42501');
  end;
  perform as_postgres();
  perform test_assert(blocked, '현장 담당자 거래처 생성 차단 (RLS)');
end $$;

-- 4-4. 현장 담당자는 거래처를 조회할 수 있다 (업무상 필요)
do $$
declare n int;
begin
  perform login_as('field@beonemirae.test');
  select count(*) into n from public.clients;
  perform as_postgres();
  perform test_assert(n = 1, '현장 담당자 거래처 조회 가능 (업무 필요)');
end $$;

-- 4-5. 미수금 / 매출 — 현장 담당자는 DB 레벨에서 조회 자체가 0건
do $$
declare v_client uuid; n int;
begin
  select id into v_client from public.clients limit 1;
  insert into public.payments (client_id, billing_month, amount, status)
  values (v_client, '2026-08', 1500000, '미수금');
  insert into public.sales_leads (key, client_id, client_name, kind, title, month, est_value, stage)
  values (v_client || '::추가수거::2026-08', v_client, '한양의료재단', '추가수거', '추가 수거 제안', '2026-08', 300000, '제안');

  perform login_as('field@beonemirae.test');
  select count(*) into n from public.payments;
  perform test_assert(n = 0, '현장 담당자 미수금 조회 차단 (DB 레벨 0건)');
  select count(*) into n from public.sales_leads;
  perform test_assert(n = 0, '현장 담당자 매출 전환 조회 차단 (DB 레벨 0건)');
  perform as_postgres();
end $$;

-- 4-6. 사무실 담당자는 미수금/매출을 볼 수 있다
do $$
declare n int;
begin
  perform login_as('office@beonemirae.test');
  select count(*) into n from public.payments;
  perform test_assert(n = 1, '사무실 담당자 미수금 조회 가능');
  select count(*) into n from public.sales_leads;
  perform test_assert(n = 1, '사무실 담당자 매출 전환 조회 가능');
  perform as_postgres();
end $$;

-- 4-7. 사용자 관리 — 관리자만 전체 조회
do $$
declare n int;
begin
  perform login_as('field@beonemirae.test');
  select count(*) into n from public.profiles;
  perform test_assert(n = 1, '현장 담당자는 본인 프로필만 조회 (사용자 관리 차단)');
  perform login_as('office@beonemirae.test');
  select count(*) into n from public.profiles;
  perform test_assert(n = 1, '사무실 담당자도 본인 프로필만 조회');
  perform login_as('admin@beonemirae.test');
  select count(*) into n from public.profiles;
  perform test_assert(n = 3, '관리자는 전체 사용자 조회 가능');
  perform as_postgres();
end $$;

-- 4-8. 권한 우회 시도 — 본인 role 을 admin 으로 바꿀 수 있는가
do $$
declare blocked boolean := false; v_role public.user_role;
begin
  perform login_as('field@beonemirae.test');
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
  exception when others then blocked := true;
  end;
  perform as_postgres();
  select role into v_role from public.profiles where email='field@beonemirae.test';
  perform test_assert(v_role = 'field', '권한 우회 차단 — 본인 역할 승격 불가 (현재 역할: ' || v_role || ')');
end $$;

-- 4-9. 감사로그 — 관리자만 조회, 아무도 수정·삭제 불가
do $$
declare n int; blocked boolean := false;
begin
  insert into public.audit_logs (actor_name, action, entity, summary)
  values ('테스트', 'test.seed', 'test', '검증용 로그');

  perform login_as('field@beonemirae.test');
  select count(*) into n from public.audit_logs;
  perform test_assert(n = 0, '현장 담당자 감사로그 조회 차단');

  perform login_as('office@beonemirae.test');
  select count(*) into n from public.audit_logs;
  perform test_assert(n = 0, '사무실 담당자 감사로그 조회 차단');

  perform login_as('admin@beonemirae.test');
  select count(*) into n from public.audit_logs;
  perform test_assert(n >= 1, '관리자 감사로그 조회 가능');

  begin
    update public.audit_logs set summary = '조작 시도';
    blocked := false;
  exception when others then blocked := true;
  end;
  perform test_assert(blocked, '감사로그 수정 차단 (관리자도 불가)');

  blocked := false;
  begin
    delete from public.audit_logs;
    blocked := false;
  exception when others then blocked := true;
  end;
  perform test_assert(blocked, '감사로그 삭제 차단 (관리자도 불가)');
  perform as_postgres();
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── 5. CRUD ───────────────────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

-- 거래처 수정 / 비활성화
do $$
declare v_id uuid; v_name text; v_active boolean;
begin
  perform login_as('office@beonemirae.test');
  select id into v_id from public.clients limit 1;
  update public.clients set manager = '이담당', phone = '031-000-9999' where id = v_id;
  select manager into v_name from public.clients where id = v_id;
  perform test_assert(v_name = '이담당', '거래처 수정');

  update public.clients set active = false where id = v_id;
  perform as_postgres();
  select active into v_active from public.clients where id = v_id;
  perform test_assert(v_active = false, '거래처 비활성화 (hard delete 아님)');
  update public.clients set active = true where id = v_id;   -- 이후 테스트용 복구
end $$;

-- 일정 생성 / 수정 (현장 담당자도 가능해야 함)
do $$
declare v_client uuid; v_sched uuid; v_status text;
begin
  select id into v_client from public.clients limit 1;
  perform login_as('field@beonemirae.test');
  insert into public.schedules (date, client_id, waste_type, scheduled_time, status, expected_amount)
  values (current_date, v_client, '의료폐기물', '10:00', '예정', 150)
  returning id into v_sched;
  perform test_assert(v_sched is not null, '현장 담당자 일정 생성 가능');

  update public.schedules set scheduled_time = '11:00' where id = v_sched;
  select scheduled_time into v_status from public.schedules where id = v_sched;
  perform test_assert(v_status = '11:00', '일정 수정');
  perform as_postgres();
end $$;

-- 현장 메모 생성 / 완료 / 보관
do $$
declare v_client uuid; v_note uuid; v_done boolean; v_arch boolean;
begin
  select id into v_client from public.clients limit 1;
  perform login_as('field@beonemirae.test');
  insert into public.site_notes (client_id, kind, content)
  values (v_client, '주의', '지하 1층 하역장 이용') returning id into v_note;
  perform test_assert(v_note is not null, '현장 메모 DB 저장');

  update public.site_notes set done = true where id = v_note;
  select done into v_done from public.site_notes where id = v_note;
  perform test_assert(v_done, '현장 메모 완료 처리');

  perform as_postgres();
  update public.site_notes set archived = true where id = v_note;
  select archived into v_arch from public.site_notes where id = v_note;
  perform test_assert(v_arch, '현장 메모 보관 처리 (삭제 아님)');
  update public.site_notes set archived = false, done = false where id = v_note;
end $$;

-- 자재 입고 / 재고 수정
do $$
declare v_box int;
begin
  perform login_as('office@beonemirae.test');
  update public.office_stock set corrugated_box = corrugated_box + 50 where id = 1;
  insert into public.material_transactions (kind, item, qty, memo)
  values ('입고', 'corrugatedBox', 50, '정기 입고');
  select corrugated_box into v_box from public.office_stock where id = 1;
  perform as_postgres();
  perform test_assert(v_box = 150, '자재 입고 → 재고 반영 (100 → 150)');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── 6. complete_collection 트랜잭션 ───────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_client uuid; v_vehicle uuid; v_sched uuid; v_res jsonb;
  v_stock_before int; v_stock_after int;
  v_ev int; v_mat int; v_audit int; v_status text; v_amount int;
begin
  select id into v_client from public.clients where active limit 1;
  select id into v_vehicle from public.vehicles where waste_type = '의료폐기물' limit 1;
  select id into v_sched from public.schedules where status = '예정' limit 1;
  select corrugated_box into v_stock_before from public.office_stock where id = 1;

  perform login_as('field@beonemirae.test');
  v_res := public.complete_collection(jsonb_build_object(
    'scheduleId', v_sched, 'clientId', v_client, 'wasteType', '의료폐기물',
    'vehicleId', v_vehicle, 'driverName', '김기사', 'actualAmount', 171,
    'actualTime', '10:42',
    'containers', jsonb_build_object('corrugated',2,'plastic',1,'bag',0,'etc',0),
    'handoverStatus', '인계 완료',
    'supplied', jsonb_build_object('corrugatedBox',2,'plasticContainer',0,'bag',1,'needleBox',0),
    'isAdditional', false, 'memo', '정상 수거', 'screen', '수거 입력',
    'inputDurationMs', 185000, 'demoSessionId', null,
    'closeRequests', '[]'::jsonb
  ));
  perform as_postgres();

  -- 1) 일정 완료
  select status, actual_amount into v_status, v_amount from public.schedules where id = v_sched;
  perform test_assert(v_status = '완료' and v_amount = 171, '① 일정 완료 + 실제 수거량 반영 (171kg)');

  -- 2) 감사기록(수거이력)
  select count(*) into v_ev from public.collection_events
   where id = (v_res->>'eventId')::uuid and action = '수거 완료';
  perform test_assert(v_ev = 1, '② 수거이력/감사기록 생성');

  -- 3) 자재 공급
  select count(*) into v_mat from public.materials where client_id = v_client;
  perform test_assert(v_mat = 1, '③ 자재 공급 이력 생성');

  -- 4) 재고 차감
  select corrugated_box into v_stock_after from public.office_stock where id = 1;
  perform test_assert(v_stock_after = v_stock_before - 2,
    format('④ 사무실 재고 차감 (%s → %s)', v_stock_before, v_stock_after));

  -- 5) 자재 원장
  perform test_assert((select count(*) from public.material_transactions where event_id = (v_res->>'eventId')::uuid) = 2,
    '⑤ 자재 원장 기록 (박스·봉투 2건)');

  -- 6) 감사로그 (작업자 정보 포함)
  select count(*) into v_audit from public.audit_logs
   where action = 'collection.complete' and actor_name = '현장담당' and actor_role = 'field';
  perform test_assert(v_audit = 1, '⑥ 감사로그 — 작업자 이름·역할 기록');

  -- 7) AX 성과 이벤트 (입력 소요시간 = 성과 측정 원천)
  perform test_assert((select input_duration_ms from public.collection_events
    where id = (v_res->>'eventId')::uuid) = 185000, '⑦ AX 성과 측정값(입력 소요시간) 기록');

  -- 8) 실제 현장 데이터로 태깅 (시연 아님)
  perform test_assert((select demo_session_id is null from public.collection_events
    where id = (v_res->>'eventId')::uuid), '⑧ 실제 현장 데이터로 기록 (demo_session_id 없음)');
end $$;

-- 6-2. 실패 시 롤백 — 재고 초과 공급
do $$
declare
  v_client uuid; v_vehicle uuid; v_stock_before int; v_stock_after int;
  v_sched_before int; v_sched_after int; v_ev_before int; v_ev_after int;
  v_failed boolean := false; v_msg text;
begin
  -- 중복 완료 unique 제약에 먼저 걸리지 않도록 '재고 테스트 전용' 거래처를 씁니다.
  insert into public.clients (name, type, address) values ('재고테스트병원', '의원', '테스트로 1')
  returning id into v_client;
  select id into v_vehicle from public.vehicles where waste_type = '의료폐기물' limit 1;
  select corrugated_box into v_stock_before from public.office_stock where id = 1;
  select count(*) into v_sched_before from public.schedules;
  select count(*) into v_ev_before from public.collection_events;

  perform login_as('field@beonemirae.test');
  begin
    perform public.complete_collection(jsonb_build_object(
      'scheduleId', null, 'clientId', v_client, 'wasteType', '의료폐기물',
      'vehicleId', v_vehicle, 'driverName', '김기사', 'actualAmount', 200,
      'actualTime', '14:00',
      'containers', jsonb_build_object('corrugated',1,'plastic',0,'bag',0,'etc',0),
      'handoverStatus', '수거 완료',
      -- 재고(148)보다 많은 9999 요청 → 실패해야 함
      'supplied', jsonb_build_object('corrugatedBox',9999,'plasticContainer',0,'bag',0,'needleBox',0),
      'isAdditional', false, 'memo', '재고 초과 테스트', 'screen', '수거 입력',
      'closeRequests', '[]'::jsonb
    ));
  exception when others then
    v_failed := true;
    v_msg := sqlerrm;
  end;
  perform as_postgres();

  select corrugated_box into v_stock_after from public.office_stock where id = 1;
  select count(*) into v_sched_after from public.schedules;
  select count(*) into v_ev_after from public.collection_events;

  perform test_assert(v_failed, '재고 초과 공급 차단 — ' || left(coalesce(v_msg,''), 45));
  perform test_assert(v_stock_after = v_stock_before, '롤백 ① 재고 변화 없음');
  perform test_assert(v_sched_after = v_sched_before, '롤백 ② 일정 생성 안 됨 (부분 저장 없음)');
  perform test_assert(v_ev_after = v_ev_before, '롤백 ③ 감사기록 생성 안 됨');
end $$;

-- 6-3. 차량 구분 불일치 차단
do $$
declare v_client uuid; v_wrong uuid; v_failed boolean := false; v_msg text;
begin
  select id into v_client from public.clients where active limit 1;
  select id into v_wrong from public.vehicles where waste_type = '일회용기저귀' limit 1;
  perform login_as('field@beonemirae.test');
  begin
    perform public.complete_collection(jsonb_build_object(
      'scheduleId', null, 'clientId', v_client, 'wasteType', '의료폐기물',
      'vehicleId', v_wrong, 'driverName', '박기사', 'actualAmount', 100,
      'actualTime', '15:00', 'containers', '{}'::jsonb, 'handoverStatus', '수거 완료',
      'supplied', jsonb_build_object('corrugatedBox',0,'plasticContainer',0,'bag',0,'needleBox',0),
      'isAdditional', false, 'memo', '', 'screen', '수거 입력', 'closeRequests', '[]'::jsonb));
  exception when others then v_failed := true; v_msg := sqlerrm;
  end;
  perform as_postgres();
  perform test_assert(v_failed, '차량 폐기물 구분 불일치 차단 — ' || left(coalesce(v_msg,''), 40));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── 7. 중복 / 동시 수정 ───────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

-- 7-1. 이미 완료된 일정 재완료 차단
do $$
declare v_client uuid; v_vehicle uuid; v_sched uuid; v_failed boolean := false; v_msg text;
begin
  select id into v_client from public.clients where active limit 1;
  select id into v_vehicle from public.vehicles where waste_type = '의료폐기물' limit 1;
  select id into v_sched from public.schedules where status = '완료' limit 1;
  perform login_as('office@beonemirae.test');
  begin
    perform public.complete_collection(jsonb_build_object(
      'scheduleId', v_sched, 'clientId', v_client, 'wasteType', '의료폐기물',
      'vehicleId', v_vehicle, 'driverName', '김기사', 'actualAmount', 100,
      'actualTime', '16:00', 'containers', '{}'::jsonb, 'handoverStatus', '수거 완료',
      'supplied', jsonb_build_object('corrugatedBox',0,'plasticContainer',0,'bag',0,'needleBox',0),
      'isAdditional', false, 'memo', '', 'screen', '오늘 일정', 'closeRequests', '[]'::jsonb));
  exception when others then v_failed := true; v_msg := sqlerrm;
  end;
  perform as_postgres();
  perform test_assert(v_failed, '이미 완료된 일정 재완료 차단 — ' || left(coalesce(v_msg,''), 40));
end $$;

-- 7-2. 같은 거래처·날짜·구분 중복 수거 등록 차단 (DB unique index)
--
--  '같은 날'의 기준은 complete_collection 과 같아야 합니다. 이 함수는 한국시간
--  기준으로 오늘 날짜를 씁니다(현장 업무 기준). 그래서 여기서도 먼저 한국시간
--  오늘로 정상 수거를 한 건 저장한 뒤, 같은 조건으로 한 번 더 시도합니다.
do $$
declare v_client uuid; v_vehicle uuid; v_failed boolean := false; v_msg text; v_add_ok boolean := true;
begin
  --  앞 구간(7-1 등)이 이미 오늘 수거를 저장한 거래처를 다시 고르면
  --  ① 1회차부터 중복 차단에 걸려 이 블록 전체가 엎어집니다(실측).
  --  오늘 완료 수거가 없는 거래처를 골라야 ①/②가 뜻대로 동작합니다.
  select c.id into v_client from public.clients c
   where c.active and not exists (
     select 1 from public.schedules s
      where s.client_id = c.id
        and s.date = (now() at time zone 'Asia/Seoul')::date
        and s.status = '완료' and s.waste_type = '의료폐기물')
   limit 1;
  if v_client is null then
    insert into public.clients (name, type, address) values ('[중복검증] 병원', '병원', '')
    returning id into v_client;
  end if;
  select id into v_vehicle from public.vehicles where waste_type = '의료폐기물' limit 1;
  perform login_as('field@beonemirae.test');

  -- ① 오늘(KST) 정상 수거 1건
  perform public.complete_collection(jsonb_build_object(
    'scheduleId', null, 'clientId', v_client, 'wasteType', '의료폐기물',
    'vehicleId', v_vehicle, 'driverName', '김기사', 'actualAmount', 88,
    'actualTime', '17:00', 'containers', '{}'::jsonb, 'handoverStatus', '수거 완료',
    'supplied', jsonb_build_object('corrugatedBox',0,'plasticContainer',0,'bag',0,'needleBox',0),
    'isAdditional', false, 'memo', '중복 검증 1회차', 'screen', '수거 입력', 'closeRequests', '[]'::jsonb));

  -- ② 같은 조건으로 한 번 더 → 막혀야 함
  begin
    perform public.complete_collection(jsonb_build_object(
      'scheduleId', null, 'clientId', v_client, 'wasteType', '의료폐기물',
      'vehicleId', v_vehicle, 'driverName', '김기사', 'actualAmount', 88,
      'actualTime', '17:00', 'containers', '{}'::jsonb, 'handoverStatus', '수거 완료',
      'supplied', jsonb_build_object('corrugatedBox',0,'plasticContainer',0,'bag',0,'needleBox',0),
      'isAdditional', false, 'memo', '중복 시도', 'screen', '수거 입력', 'closeRequests', '[]'::jsonb));
  exception when others then v_failed := true; v_msg := sqlerrm;
  end;
  perform test_assert(v_failed, '중복 수거 등록 차단 (같은 거래처·날짜·구분) — ' || left(coalesce(v_msg,''), 40));

  -- ③ 추가 수거로 표시하면 같은 날이어도 저장되어야 합니다 (정상 업무)
  v_msg := null;
  begin
    perform public.complete_collection(jsonb_build_object(
      'scheduleId', null, 'clientId', v_client, 'wasteType', '의료폐기물',
      'vehicleId', v_vehicle, 'driverName', '김기사', 'actualAmount', 40,
      'actualTime', '19:00', 'containers', '{}'::jsonb, 'handoverStatus', '수거 완료',
      'supplied', jsonb_build_object('corrugatedBox',0,'plasticContainer',0,'bag',0,'needleBox',0),
      'isAdditional', true, 'memo', '추가 수거', 'screen', '수거 입력', 'closeRequests', '[]'::jsonb));
  exception when others then v_add_ok := false; v_msg := sqlerrm;
  end;
  perform as_postgres();
  perform test_assert(v_add_ok, '추가 수거는 같은 날에도 저장 허용 — ' || left(coalesce(v_msg,''), 40));
end $$;

-- 7-3. 수거 완료 취소 → 원복
do $$
declare
  v_evt uuid; v_sched uuid; v_status text; v_stock int; v_stock_orig int;
  v_mat int; v_reverted boolean;
begin
  select id, schedule_id into v_evt, v_sched from public.collection_events
   where action='수거 완료' and not reverted limit 1;
  select (stock_before->>'corrugatedBox')::int into v_stock_orig
   from public.collection_events where id = v_evt;

  perform login_as('office@beonemirae.test');
  perform public.revert_collection(v_evt);
  perform as_postgres();

  select status into v_status from public.schedules where id = v_sched;
  select corrugated_box into v_stock from public.office_stock where id = 1;
  select count(*) into v_mat from public.materials;
  select reverted into v_reverted from public.collection_events where id = v_evt;

  perform test_assert(v_status = '예정', '취소 ① 일정 원복 (완료 → 예정)');
  perform test_assert(v_stock = v_stock_orig, format('취소 ② 재고 원복 (%s)', v_stock));
  perform test_assert(v_mat = 0, '취소 ③ 자재 공급 이력 제거');
  perform test_assert(v_reverted, '취소 ④ 감사기록은 삭제하지 않고 취소 표시');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── 9. 실제 / 시연 데이터 분리 ────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_client uuid; v_vehicle uuid; v_demo_client uuid;
  v_real_before int; v_real_after int; v_counts jsonb; v_blocked boolean := false;
begin
  select id into v_vehicle from public.vehicles where waste_type='의료폐기물' limit 1;

  -- 시연 세션 데이터 생성
  insert into public.clients (name, type, is_demo_generated, demo_session_id)
  values ('시연병원', '의원', true, 'demo_sess_1') returning id into v_demo_client;
  insert into public.schedules (date, client_id, waste_type, scheduled_time, status, expected_amount, origin, demo_session_id)
  values (current_date, v_demo_client, '의료폐기물', '09:00', '예정', 50, 'demo', 'demo_sess_1');
  insert into public.site_notes (client_id, kind, content, demo_session_id)
  values (v_demo_client, '기타', '시연용 메모', 'demo_sess_1');

  select count(*) into v_real_before from public.schedules where demo_session_id is null;

  -- 9-1. 관리자가 아닌 사용자는 시연 초기화를 실행할 수 없다
  perform login_as('office@beonemirae.test');
  begin
    perform public.reset_demo_records('demo_sess_1');
  exception when others then v_blocked := true;
  end;
  perform test_assert(v_blocked, '시연 초기화 — 관리자 외 실행 차단');

  -- 9-2. 세션 id 없이(=실제 운영 데이터 대상) 실행 불가
  v_blocked := false;
  perform login_as('admin@beonemirae.test');
  begin
    perform public.reset_demo_records('');
  exception when others then v_blocked := true;
  end;
  perform test_assert(v_blocked, '시연 초기화 — 세션 id 없이 실행 차단 (실제 데이터 보호)');

  -- 9-3. 실제 초기화 → 시연 데이터만 삭제
  v_counts := public.reset_demo_records('demo_sess_1');
  perform as_postgres();

  select count(*) into v_real_after from public.schedules where demo_session_id is null;
  perform test_assert((select count(*) from public.schedules where demo_session_id='demo_sess_1') = 0,
    '시연 초기화 — 시연 일정 삭제');
  perform test_assert((select count(*) from public.clients where demo_session_id='demo_sess_1') = 0,
    '시연 초기화 — 시연 거래처 삭제');
  perform test_assert(v_real_after = v_real_before,
    format('시연 초기화 — 실제 운영 데이터 보존 (%s건 유지)', v_real_after));
  perform test_assert((select count(*) from public.profiles) = 3,
    '시연 초기화 — 사용자 계정 영향 없음');
  perform test_assert((select count(*) from public.collection_events where demo_session_id is null) >= 1,
    '시연 초기화 — 실제 성과 데이터(수거 이벤트) 보존');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── 10. 감사로그 기록 내용 ────────────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  select * into r from public.audit_logs where action = 'collection.complete' limit 1;
  perform test_assert(r.actor_id is not null, '감사로그 actor_id 기록');
  perform test_assert(r.actor_name = '현장담당', '감사로그 actor_name 기록 (' || r.actor_name || ')');
  perform test_assert(r.actor_role = 'field', '감사로그 actor_role 기록 (' || r.actor_role || ')');
  perform test_assert(r.at is not null, '감사로그 작업시간 기록');
  perform test_assert(r.client_name <> '', '감사로그 거래처 기록 (' || r.client_name || ')');
  perform test_assert(r.before_data is not null, '감사로그 변경 전 기록');
  perform test_assert(r.after_data is not null, '감사로그 변경 후 기록');
  perform test_assert(r.screen <> '', '감사로그 입력 화면 기록 (' || r.screen || ')');
  raise notice '      └ 예시: % / % / %', r.actor_name, r.actor_role, r.summary;
end $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════════'
\echo ' 모든 단언 통과'
\echo '════════════════════════════════════════════════════════════════════'
