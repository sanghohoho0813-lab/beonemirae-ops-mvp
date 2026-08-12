-- ─────────────────────────────────────────────────────────────────────────────
-- 병원 고객 서비스 RLS 검증
--
--  검증 목적은 하나입니다: 병원 계정이 자기 병원 것만 볼 수 있는가.
--  화면에서 숨기는 것과 무관하게 DB 가 실제로 막는지 확인합니다.
--
--  실행: psql -f supabase/test/03_portal.sql
-- ─────────────────────────────────────────────────────────────────────────────

set client_min_messages = notice;

create or replace function test_assert(label text, cond boolean) returns void
language plpgsql as $$
begin
  if cond then raise notice ' OK  | %', label;
  else raise exception 'FAIL | %', label; end if;
end $$;

-- 로그인 시뮬레이션 (PostgREST 가 하는 것과 동일하게 role + request.jwt.claims 설정)
create or replace function login_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id)::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function as_postgres() returns void
language plpgsql as $$ begin execute 'set local role postgres'; end $$;

-- 재실행 가능하도록 이전 테스트 데이터를 먼저 지웁니다 (실제 운영 DB 에서는 실행하지 않습니다)
do $$
begin
  delete from public.audit_logs;
  delete from public.sales_lead_events;
  delete from public.sales_leads;
  delete from public.client_requests;
  delete from public.materials;
  delete from public.schedules;
  delete from public.payments;
  -- 거래처를 지우면 병원 계정의 client_id 가 null 이 되어 제약에 걸리므로 역할부터 되돌립니다
  update public.profiles set role = 'field', client_id = null where role = 'client';
  delete from public.clients;
  delete from auth.users;
end $$;

do $$
declare
  v_admin   uuid := gen_random_uuid();
  v_office  uuid := gen_random_uuid();
  v_hosA    uuid := gen_random_uuid();   -- A병원 담당자
  v_hosB    uuid := gen_random_uuid();   -- B병원 담당자
  v_cA      uuid;
  v_cB      uuid;
  v_reqA    uuid;
  v_reqB    uuid;
  v_leadA   uuid;
  v_leadA2  uuid;
  n         integer;
  ok        boolean;
begin
  -- ── 준비 (RLS 우회) ──────────────────────────────────────────────────────
  --  역할은 raw_app_meta_data 로 넣습니다 (0021). 관리자가 만든 계정이 지나는
  --  길입니다. 이 자리가 비어 있으면 「스스로 가입」으로 보아 승인 대기
  --  (active=false) 로 만들어지고, 그러면 아래 검사가 전부 0건이 됩니다 —
  --  RLS 가 막아서인지 계정이 잠겨서인지 구분이 안 됩니다.
  --
  --  병원 계정은 여기서 role='client' 로 만들 수 없습니다. 소속 거래처가 아직
  --  없어서 제약(profiles_client_needs_client_id)에 걸립니다. 거래처를 만든
  --  뒤에 아래에서 바꿉니다.
  insert into auth.users (id, email, raw_app_meta_data) values
    (v_admin,  'admin@test.local',  '{"role":"admin"}'),
    (v_office, 'office@test.local', '{"role":"office"}'),
    (v_hosA,   'a@hospital.local',  '{"role":"field"}'),
    (v_hosB,   'b@hospital.local',  '{"role":"field"}');

  perform test_assert('app_metadata 로 지정한 역할이 반영됨',
    (select role from public.profiles where id = v_admin) = 'admin'
    and (select role from public.profiles where id = v_office) = 'office');
  perform test_assert('관리자가 만든 계정은 승인된 상태 (바로 사용 가능)',
    (select bool_and(active and approved_at is not null) from public.profiles));

  insert into public.clients (name, type, address, collection_cycle)
    values ('A병원', '병원', 'A로 1', '주 2회') returning id into v_cA;
  insert into public.clients (name, type, address, collection_cycle)
    values ('B병원', '병원', 'B로 2', '주 1회') returning id into v_cB;

  update public.profiles set role = 'client', client_id = v_cA where id = v_hosA;
  update public.profiles set role = 'client', client_id = v_cB where id = v_hosB;

  -- 소속 거래처 없는 병원 계정은 만들 수 없어야 합니다
  begin
    update public.profiles set client_id = null where id = v_hosA;
    perform test_assert('소속 없는 병원 계정 차단', false);
  exception when check_violation then
    perform test_assert('소속 거래처 없는 병원 계정은 제약으로 차단', true);
  end;

  insert into public.schedules (date, client_id, waste_type, scheduled_time, status, expected_amount)
    values (current_date, v_cA, '의료폐기물', '10:00', '예정', 100);
  insert into public.schedules (date, client_id, waste_type, scheduled_time, status, expected_amount)
    values (current_date, v_cB, '의료폐기물', '11:00', '예정', 120);

  insert into public.materials (date, client_id, box_count) values (current_date, v_cA, 5);
  insert into public.materials (date, client_id, box_count) values (current_date, v_cB, 7);

  insert into public.payments (client_id, billing_month, amount)
    values (v_cA, to_char(current_date, 'YYYY-MM'), 500000);

  insert into public.sales_leads (key, client_id, client_name, kind, title, month, est_value, stage,
                                  shared_with_client, client_message)
    values ('kA::소모품공급::m', v_cA, 'A병원', '소모품공급', '소모품 공급 제안',
            to_char(current_date, 'YYYY-MM'), 45000, '제안', true, '전용용기 10개 제안드립니다')
    returning id into v_leadA;
  -- 아직 공유하지 않은 내부 추천 — 병원에 보이면 안 됩니다
  insert into public.sales_leads (key, client_id, client_name, kind, title, month, est_value, stage)
    values ('kA::추가수거::m', v_cA, 'A병원', '추가수거', '추가 수거 제안',
            to_char(current_date, 'YYYY-MM'), 120000, '추천')
    returning id into v_leadA2;

  -- ── 1) 병원 계정: 자기 거래처만 보임 ─────────────────────────────────────
  perform login_as(v_hosA);
  select count(*) into n from public.clients;
  perform test_assert('병원 A — 거래처는 자기 병원 1곳만 조회', n = 1);
  perform test_assert('병원 A — 조회되는 거래처가 A병원',
    (select name from public.clients) = 'A병원');

  select count(*) into n from public.schedules;
  perform test_assert('병원 A — 수거일정은 자기 것만', n = 1);

  select count(*) into n from public.materials;
  perform test_assert('병원 A — 자재공급은 자기 것만', n = 1);

  -- ── 2) 병원 계정: 내부 데이터 접근 차단 ──────────────────────────────────
  select count(*) into n from public.payments;
  perform test_assert('병원 A — 미수금(payments) 조회 불가', n = 0);

  select count(*) into n from public.vehicles;
  perform test_assert('병원 A — 차량 조회 불가', n = 0);

  select count(*) into n from public.site_notes;
  perform test_assert('병원 A — 내부 현장메모 조회 불가', n = 0);

  select count(*) into n from public.collection_events;
  perform test_assert('병원 A — 수거 이벤트(감사기록) 조회 불가', n = 0);

  select count(*) into n from public.audit_logs;
  perform test_assert('병원 A — 감사로그 조회 불가', n = 0);

  select count(*) into n from public.profiles;
  perform test_assert('병원 A — 다른 사용자 프로필 조회 불가 (본인만)', n = 1);

  -- ── 3) 제안: 공유된 것만 보임 ────────────────────────────────────────────
  select count(*) into n from public.sales_leads;
  perform test_assert('병원 A — 공유된 제안만 조회 (내부 추천 제외)', n = 1);
  perform test_assert('병원 A — 조회된 제안이 공유 건',
    (select id from public.sales_leads) = v_leadA);

  -- ── 4) 요청 등록 ─────────────────────────────────────────────────────────
  insert into public.client_requests (client_id, kind, content, source, requester_name)
    values (v_cA, '긴급수거', '격리환자 발생 — 추가 수거 요청', 'portal', 'A병원 담당자')
    returning id into v_reqA;
  perform test_assert('병원 A — 자기 병원 요청 등록 성공', v_reqA is not null);

  -- 다른 병원 이름으로는 등록 불가
  begin
    insert into public.client_requests (client_id, kind, content, source)
      values (v_cB, '긴급수거', '남의 병원 요청', 'portal');
    perform test_assert('병원 A — 다른 병원 요청 등록 차단', false);
  exception when insufficient_privilege then
    perform test_assert('병원 A — 다른 병원 이름으로 요청 등록 차단', true);
  end;

  -- 요청 상태를 스스로 바꿀 수 없어야 합니다 (update 정책 없음 → 0행 영향)
  update public.client_requests set status = '처리 완료' where id = v_reqA;
  get diagnostics n = row_count;
  perform test_assert('병원 A — 자기 요청 상태를 직접 바꿀 수 없음', n = 0);

  -- ── 5) 제안 응답 (수락) ──────────────────────────────────────────────────
  perform public.respond_to_proposal(v_leadA, true);
  perform as_postgres();
  perform test_assert('병원 수락 → stage=수락',
    (select stage from public.sales_leads where id = v_leadA) = '수락');
  perform test_assert('병원 수락 → 응답 시각 기록',
    (select client_responded_at is not null from public.sales_leads where id = v_leadA));
  perform test_assert('병원 수락 → 감사로그 기록',
    exists (select 1 from public.audit_logs where action = 'proposal.respond'));

  -- 공유하지 않은 제안에는 응답할 수 없어야 합니다
  perform login_as(v_hosA);
  begin
    perform public.respond_to_proposal(v_leadA2, true);
    perform test_assert('공유되지 않은 제안 응답 차단', false);
  exception when others then
    perform test_assert('공유되지 않은 제안에는 응답 불가', true);
  end;

  -- 다른 병원의 제안에도 응답 불가
  perform login_as(v_hosB);
  begin
    perform public.respond_to_proposal(v_leadA, false);
    perform test_assert('다른 병원 제안 응답 차단', false);
  exception when others then
    perform test_assert('다른 병원의 제안에는 응답 불가', true);
  end;

  -- ── 6) 병원 B 는 A 의 요청을 볼 수 없습니다 ──────────────────────────────
  select count(*) into n from public.client_requests;
  perform test_assert('병원 B — 병원 A 의 요청 조회 불가', n = 0);

  -- ── 7) 직원은 모든 요청을 보고 처리할 수 있습니다 ────────────────────────
  perform login_as(v_office);
  select count(*) into n from public.client_requests;
  perform test_assert('사무실 담당자 — 전체 병원 요청 조회', n = 1);

  update public.client_requests set status = '일정 반영', reply = '내일 오전 방문 예정입니다' where id = v_reqA;
  get diagnostics n = row_count;
  perform test_assert('사무실 담당자 — 요청 상태·회신 수정 가능', n = 1);

  -- 병원 계정은 수거 완료를 실행할 수 없어야 합니다
  perform login_as(v_hosA);
  begin
    perform public.complete_collection('{"clientId":"00000000-0000-0000-0000-000000000000"}'::jsonb);
    perform test_assert('병원 계정 수거 완료 차단', false);
  exception when others then
    perform test_assert('병원 계정은 수거 완료를 실행할 수 없음', true);
  end;

  -- 병원 계정은 close_requests_on_collection 을 직접 부를 수 없어야 합니다
  begin
    perform public.close_requests_on_collection(v_cA, true, v_hosA, now());
    perform test_assert('병원 계정 요청 강제 종료 차단', false);
  exception when others then
    perform test_assert('병원 계정은 요청 자동종료 함수를 직접 호출할 수 없음', true);
  end;

  perform as_postgres();
  raise notice '───────────────────────────────────────';
  raise notice ' 병원 고객 서비스 RLS 검증 통과';
end $$;
