-- ─────────────────────────────────────────────────────────────────────────────
-- 55. 사업계획서 V3 (0148) — 사업화전략 모델 · 대표님/이사님 결정 · 반영 요청
--
--  확인하는 것
--   1) 참여자만 연다 · 모델은 담당만 고친다(판 번호 · 까닭 · 기록) · 주민번호 모양 거절
--   2) 결정은 「검토」 참여자(대표님 · 이사님)만 · 보고 있던 숫자 판(assump_rev)이 아니면 거절(PT409)
--      · 두 분이 다르면 합의 아님 · 「추후 결정」은 합의 아님 · 직접 입력은 값까지 같아야 합의
--   3) 심사 질문 · 출처만 고치면 숫자 판은 그대로(결정 유지) · 숫자를 고치면 이전 결정은 남고 합의가 풀림
--   4) 반영 요청 — 담당만 · 합의 전 결정에 기대면 **아무것도 만들지 않음** · 만들어도 본문은 그대로,
--      기존 수정요청(접수)로만 · 담당이 반영하면 기존 0147 규칙대로 확인 표시가 「재확인 필요」
--   5) 실제 사용 건수 — 참여자만 · 시연 기록은 빼고 셈
--   6) 기록 표는 고치기 · 지우기 막힘 · 표 직접 접근 · 도움 함수는 화면에서 못 부름
--
--  실행 (로컬 PostgreSQL) — … → PROPOSAL_0147 → 54_bizplan_v2.sql → PROPOSAL_0148 → 이 파일
--  검사용 모델은 가상 · 중립 숫자입니다(회사 숫자 없음).
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
  if v_id is null then raise exception '테스트 계정 없음: % (53 을 먼저)', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function as_postgres() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', false); execute 'reset role'; end $$;
create or replace function blocked(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return true; end $$;
create or replace function err_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return ''; exception when others then return sqlerrm; end $$;
create or replace function state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return ''; exception when others then return sqlstate; end $$;
create or replace function pid(p_email text) returns uuid language sql as $$ select id from public.profiles where email = p_email $$;
grant execute on function blocked(text), err_of(text), state_of(text), test_assert(boolean, text), pid(text) to authenticated;

--  검사용 모델 (가상 · 중립) — 결정 3개: 시나리오(직접 입력 가능) · 자금(직접 입력 없음) · 구조
create or replace function t_model(p_saas int default 36, p_qa text default '질문 1') returns jsonb language sql as $$
  select jsonb_build_object(
    'version', 1,
    'meta', jsonb_build_object('title', '검사', 'baseYear', 2026, 'years', jsonb_build_array(2027, 2028, 2029), 'applicationMonth', '2026-11', 'recommended', 'B'),
    'scenarios', jsonb_build_object('A', jsonb_build_object('legacyTarget', 100), 'B', jsonb_build_object('legacyTarget', 200, 'saasEnd', p_saas), 'C', jsonb_build_object('legacyTarget', 300)),
    'decisions', jsonb_build_array(
      jsonb_build_object('key', 'scenario', 'no', 1, 'title', '전체 목표', 'options', jsonb_build_array(jsonb_build_object('id', 'A'), jsonb_build_object('id', 'B'), jsonb_build_object('id', 'C')), 'custom', jsonb_build_object('kind', 'number')),
      jsonb_build_object('key', 'funding', 'no', 10, 'title', '자금배분', 'options', jsonb_build_array(jsonb_build_object('id', 'A'), jsonb_build_object('id', 'B'))),
      jsonb_build_object('key', 'structure', 'no', 8, 'title', 'B2B 매출구조', 'options', jsonb_build_array(jsonb_build_object('id', 'direct'), jsonb_build_object('id', 'broker')))),
    'qa', jsonb_build_array(jsonb_build_object('id', 'q1', 'question', p_qa)),
    'research', '[]'::jsonb)
$$;
grant execute on function t_model(int, text) to authenticated;
create or replace function srev(out r int, out a int) language sql security definer as $$ select rev, assump_rev from public.bizplan_strategy where doc_id = 'newborn2026' $$;
create or replace function agreed(p_key text) returns boolean language sql security definer as $$
  select public.bizplan_decision_agreed('newborn2026', p_key, (select assump_rev from public.bizplan_strategy where doc_id = 'newborn2026')) $$;
create or replace function decide(p_email text, p_key text, p_choice text, p_custom jsonb default null) returns jsonb language plpgsql as $$
declare a int;
begin
  perform as_postgres();
  select assump_rev into a from public.bizplan_strategy where doc_id = 'newborn2026';
  perform login_as(p_email);
  return public.bizplan_decide(p_key, p_choice, p_custom, '', a, '{}'::jsonb);
end $$;
grant execute on function srev(), agreed(text) to authenticated;

--  깨끗하게 (로컬 검증 DB 의 사업화전략 표만 — 사업계획서 본문 · 요청 · 기록은 그대로)
set session_replication_role = replica;
delete from public.bizplan_strategy_log; delete from public.bizplan_decision_log; delete from public.bizplan_decisions;
delete from public.bizplan_strategy_revisions; delete from public.bizplan_strategy;
set session_replication_role = origin;
do $$
begin
  perform login_as('bpboss@dev.test');
  perform public.bizplan_member_set(pid('bpboss@dev.test'), 'reviewer', '대표');
  perform public.bizplan_member_set(pid('bpdir@dev.test'), 'reviewer', '이사');
  perform public.bizplan_member_set(pid('bpeditor@dev.test'), 'editor', '사업계획 담당');
  perform as_postgres();
end $$;

\echo '── 1. 열기 · 모델 저장 (담당만 · 판 번호 · 까닭 · 기록) ─────────────────────────'
do $$
declare r jsonb; n int;
begin
  perform login_as('bpclerk@dev.test');
  perform test_assert(state_of('select public.bizplan_strategy_open()') = '42501', '참여자가 아닌 사무 계정은 못 엶');
  perform login_as('bpdrive@dev.test');
  perform test_assert(state_of('select public.bizplan_strategy_open()') = '42501', '기사 계정은 못 엶');
  perform login_as('bphosp@dev.test');
  perform test_assert(state_of('select public.bizplan_strategy_open()') = '42501', '병원 계정은 못 엶');

  perform login_as('bpdir@dev.test');
  r := public.bizplan_strategy_open();
  perform test_assert((r->>'api')::int = 148 and r->'strategy' = 'null'::jsonb, '이사님 — 열림 · 아직 자료 없음(null)');
  perform test_assert((r->>'is_decider')::boolean and jsonb_array_length(r->'deciders') = 2, '이사님은 결정할 분 · 결정할 분 2명(대표 · 이사)');
  perform test_assert(r->>'preflight_month' ~ '^20[0-9]{2}\.[0-9]{2}$', '접수월(제출 전 점검과 같은 규칙)을 함께 줌');
  perform test_assert(state_of($q$select public.bizplan_strategy_save(t_model(), 0, '이사가 고침')$q$) = '42501', '이사님(검토)은 모델을 못 고침 — 담당만');

  perform login_as('bpeditor@dev.test');
  perform test_assert(not (public.bizplan_strategy_open()->>'is_decider')::boolean, '담당은 결정할 분이 아님');
  perform test_assert(state_of($q$select public.bizplan_strategy_save(t_model(), 0, '')$q$) = '22023', '까닭 없이 저장 안 됨');
  perform test_assert(state_of($q$select public.bizplan_strategy_save('{"version":2}'::jsonb, 0, '모양 틀림')$q$) = '22023', '모양이 틀린 자료 거절');
  perform test_assert(state_of($q$select public.bizplan_strategy_save(t_model(36, '주민 900101-1234567'), 0, '검사')$q$) = '22023', '주민등록번호 모양이 있으면 거절');
  r := public.bizplan_strategy_save(t_model(), 0, '처음 넣음');
  perform test_assert((r->>'ok')::boolean and (r->>'rev')::int = 1 and (r->>'assump_rev')::int = 1, '첫 저장 — 판 1 · 숫자 판 1');
  r := public.bizplan_strategy_save(t_model(40), 0, '옛 화면에서 저장');
  perform test_assert((r->>'conflict')::boolean and (r->>'rev')::int = 1 and r->'model' = t_model(), '판 번호가 다르면 저장 안 하고 서버 내용을 돌려줌 (덮어쓰지 않음)');
  r := public.bizplan_strategy_save(t_model(), 1, '같은 내용');
  perform test_assert((r->>'unchanged')::boolean and (r->>'rev')::int = 1, '같은 내용이면 판도 기록도 그대로');
  perform as_postgres();
  select count(*) into n from public.bizplan_strategy_revisions;
  perform test_assert(n = 1 and (select before_model is null and after_model = t_model() and reason = '처음 넣음' and actor_name = '계획담당' from public.bizplan_strategy_revisions limit 1),
                      '기록 한 줄 — 바꾸기 전(없음) · 후 · 까닭 · 누가');
  perform test_assert((select count(*) from public.bizplan_strategy_log where step = '모델 저장') = 1, '단계 기록 「모델 저장」');
end $$;

\echo '── 2. 결정 — 검토 참여자만 · 보고 있던 숫자 판 · 합의 / 의견 조율 ─────────────────'
do $$
declare r jsonb;
begin
  perform login_as('bpeditor@dev.test');
  perform test_assert(state_of($q$select public.bizplan_decide('scenario', 'B', null, '', 1, '{}')$q$) = '42501', '담당은 결정을 남기지 못함');
  perform login_as('bpclerk@dev.test');
  perform test_assert(state_of($q$select public.bizplan_decide('scenario', 'B', null, '', 1, '{}')$q$) = '42501', '참여자가 아니면 못 남김');
  perform login_as('bpboss@dev.test');
  perform test_assert(state_of($q$select public.bizplan_decide('scenario', 'B', null, '', 0, '{}')$q$) = 'PT409', '보고 있던 숫자 판(0)이 지금(1)과 다르면 거절 — PT409');
  perform test_assert(state_of($q$select public.bizplan_decide('scenario', 'Z', null, '', 1, '{}')$q$) = '22023', '없는 안은 거절');
  perform test_assert(state_of($q$select public.bizplan_decide('nope', 'B', null, '', 1, '{}')$q$) = '22023', '없는 결정 항목은 거절');
  perform test_assert(state_of($q$select public.bizplan_decide('funding', 'custom', '5'::jsonb, '', 1, '{}')$q$) = '22023', '직접 입력이 없는 결정에 직접 입력 거절');
  perform test_assert(state_of($q$select public.bizplan_decide('scenario', 'custom', '""'::jsonb, '', 1, '{}')$q$) = '22023', '직접 입력 값이 비면 거절');
  r := public.bizplan_decide('scenario', 'B', null, '대표 의견', 1, '{"마지막해매출":"1.00억"}');
  perform test_assert((r->>'ok')::boolean and not (r->>'agreed')::boolean, '대표님 B — 이사님이 아직 → 합의 아님 (미선택을 대신 채우지 않음)');
  perform as_postgres();
  perform test_assert(not exists (select 1 from public.bizplan_decisions where profile_id = pid('bpdir@dev.test')), '이사님 결정은 저장되지 않음 (고른 것만 저장)');
  perform test_assert((select basis->>'마지막해매출' from public.bizplan_decisions where profile_id = pid('bpboss@dev.test') and dkey = 'scenario') = '1.00억', '고를 때 본 숫자도 함께 남김');

  r := decide('bpdir@dev.test', 'scenario', 'C');
  perform as_postgres();
  perform test_assert(not (r->>'agreed')::boolean and not agreed('scenario'), '이사님 C — 대표님 B 와 달라 합의 아님 (의견 조율 필요)');
  r := decide('bpdir@dev.test', 'scenario', 'B');
  perform as_postgres();
  perform test_assert((r->>'agreed')::boolean and agreed('scenario'), '이사님도 B → 합의');
  perform test_assert((select count(*) from public.bizplan_decision_log where dkey = 'scenario') = 3, '결정 기록 3줄 (대표 B · 이사 C · 이사 B) — 바꾼 것도 남음');

  perform decide('bpboss@dev.test', 'funding', '추후 결정');
  perform decide('bpdir@dev.test', 'funding', '추후 결정');
  perform as_postgres();
  perform test_assert(not agreed('funding'), '두 분 다 「추후 결정」 → 합의 아님');
  perform decide('bpboss@dev.test', 'scenario', 'custom', '30'::jsonb);
  perform decide('bpdir@dev.test', 'scenario', 'custom', '31'::jsonb);
  perform as_postgres();
  perform test_assert(not agreed('scenario'), '직접 입력 30 vs 31 → 합의 아님');
  perform decide('bpdir@dev.test', 'scenario', 'custom', '30'::jsonb);
  perform as_postgres();
  perform test_assert(agreed('scenario'), '직접 입력 30 · 30 → 합의');
  perform decide('bpboss@dev.test', 'scenario', 'B');
  perform decide('bpdir@dev.test', 'scenario', 'B');
  perform as_postgres();
end $$;

\echo '── 3. 질문만 고치면 결정 유지 · 숫자를 고치면 「재확인 필요」(지우지 않음) ───────────'
do $$
declare r jsonb; v record;
begin
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_strategy_save(t_model(36, '질문 1 — 답 보강'), 1, '심사 질문 답 보강');
  perform test_assert((r->>'rev')::int = 2 and (r->>'assump_rev')::int = 1 and not (r->>'assumption_changed')::boolean and (r->>'stale_decisions')::int = 0,
                      '심사 질문만 고침 → 판 2 · 숫자 판 1 그대로 · 재확인 필요 0');
  perform as_postgres();
  perform test_assert(agreed('scenario'), '합의 유지');
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_strategy_save(t_model(40, '질문 1 — 답 보강'), 2, 'SaaS 목표 36 → 40');
  perform test_assert((r->>'assump_rev')::int = 2 and (r->>'assumption_changed')::boolean and (r->>'stale_decisions')::int >= 4,
                      '숫자를 고침 → 숫자 판 2 · 이전 결정들은 「재확인 필요」');
  perform test_assert(r->'sections' ? 'scenarios' and not r->'sections' ? 'qa', '바뀐 부분 = scenarios');
  perform as_postgres();
  perform test_assert(not agreed('scenario'), '숫자가 바뀌면 합의가 풀림 — 바뀐 숫자를 보고 다시 골라야 함');
  perform test_assert((select count(*) from public.bizplan_decisions where dkey = 'scenario' and choice = 'B' and assump_rev = 1) = 2, '이전 결정(숫자 판 1)은 지우지 않고 남음');
  select before_model, after_model into v from public.bizplan_strategy_revisions order by id desc limit 1;
  perform test_assert(v.before_model = t_model(36, '질문 1 — 답 보강') and v.after_model = t_model(40, '질문 1 — 답 보강'), '기록에 바꾸기 전 · 후 모델');
  perform login_as('bpdir@dev.test');
  perform test_assert(state_of($q$select public.bizplan_decide('scenario', 'B', null, '', 1, '{}')$q$) = 'PT409', '옛 화면(숫자 판 1)에서 고르면 거절');
end $$;

\echo '── 4. 반영 요청 — 담당만 · 합의 전이면 아무것도 안 만듦 · 본문은 그대로 ─────────────'
do $$
declare r jsonb; n0 int; n1 int; v_before jsonb; v_status text; it jsonb;
begin
  it := jsonb_build_array(
    jsonb_build_object('key', 's11.plan.y1', 'label', '1차년도', 'req_type', '숫자 변경', 'body', '시나리오 B 기준', 'suggestion', '기존 100 · SaaS 10',
                       'value', jsonb_build_array(jsonb_build_object('segment', '기존', 'amount', '100', 'basis', '가정 ' || txid_current())), 'decisions', jsonb_build_array('scenario')),
    jsonb_build_object('key', 'a.periods', 'label', '차년도 기간', 'req_type', '숫자 변경', 'suggestion', '2026.12 ~ 2027.11',
                       'value', jsonb_build_object('y1', '2026.12 ~ 2027.11'), 'decisions', '[]'::jsonb));
  perform as_postgres();
  select count(*) into n0 from public.bizplan_requests;
  select value into v_before from public.bizplan_fields where key = 's11.plan.y1';

  perform login_as('bpdir@dev.test');
  perform test_assert(state_of(format('select public.bizplan_strategy_propose(2, %L::jsonb)', it)) = '42501', '이사님(검토)은 반영 요청을 만들지 못함 — 담당만');
  perform login_as('bpeditor@dev.test');
  perform test_assert(state_of(format('select public.bizplan_strategy_propose(1, %L::jsonb)', it)) = 'PT409', '옛 숫자 판으로 만든 초안은 거절');
  perform test_assert(err_of(format('select public.bizplan_strategy_propose(2, %L::jsonb)', it)) like '%합의 전%전체 목표%', '「전체 목표」 합의 전 → 거절 (까닭에 결정 이름)');
  perform test_assert(state_of($q$select public.bizplan_strategy_propose(2, '[]'::jsonb)$q$) = '22023', '빈 목록 거절');
  perform test_assert(state_of($q$select public.bizplan_strategy_propose(2, '[{"key":"s10.account","value":"1"}]'::jsonb)$q$) = '22023', '서버에 두지 않는 칸(계좌번호)은 거절');
  perform test_assert(state_of($q$select public.bizplan_strategy_propose(2, '[{"key":"a.periods"},{"key":"a.periods"}]'::jsonb)$q$) = '22023', '같은 칸 두 번은 거절');
  perform test_assert(state_of($q$select public.bizplan_strategy_propose(2, '[{"key":"a.periods","decisions":["nope"]}]'::jsonb)$q$) = '22023', '모르는 결정에 기대면 거절');
  perform as_postgres();
  select count(*) into n1 from public.bizplan_requests;
  perform test_assert(n1 = n0, '거절된 반영 요청은 하나도 만들어지지 않음');

  perform decide('bpboss@dev.test', 'scenario', 'B');
  perform decide('bpdir@dev.test', 'scenario', 'B');
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_strategy_propose(2, it, '첫 반영 요청');
  perform test_assert((r->>'ok')::boolean and jsonb_array_length(r->'requests') = 2, '합의 뒤 → 칸 2개 수정요청');
  perform as_postgres();
  perform test_assert((select value from public.bizplan_fields where key = 's11.plan.y1') is not distinct from v_before, '사업계획서 본문은 그대로 (자동 반영 없음)');
  select status into v_status from public.bizplan_fields where key = 's11.plan.y1';
  perform test_assert(v_status = '수정 요청 있음', '항목 상태는 기존 규칙대로 「수정 요청 있음」');
  perform test_assert((select count(*) from public.bizplan_requests where source = 'strategy' and status = '접수'
                         and id in (select (x->>'request_id')::uuid from jsonb_array_elements(r->'requests') x)
                         and body like '[사업화전략 검토 · 숫자 판 2]%계약 · 확정 매출이 아닙니다%') = 2, '요청 2건 — 접수 · 출처 표시 · 「확정 매출 아님」');
  perform test_assert((select suggested_value from public.bizplan_requests where key = 's11.plan.y1' and source = 'strategy' order by created_at desc limit 1)
                      = it->0->'value', '표 모양 제안이 그대로 남음 (담당이 비교 후 반영)');
  perform test_assert((select detail->'decisions'->'scenario'->>'choice' from public.bizplan_strategy_log where step = '반영 요청' order by id desc limit 1) = 'B',
                      '단계 기록 「반영 요청」 — 그때 합의된 결정(B)과 함께');
end $$;

\echo '── 5. 담당이 반영 → 기존 규칙: 요청 닫힘 · 확인 표시 재확인 필요 ─────────────────'
do $$
declare r jsonb; rq uuid; sv jsonb; f record; c record;
begin
  perform as_postgres();
  select id, suggested_value into rq, sv from public.bizplan_requests where key = 's11.plan.y1' and source = 'strategy' and status = '접수' order by created_at desc limit 1;
  select rev, content_rev into f from public.bizplan_fields where key = 's11.plan.y1';
  perform login_as('bpdir@dev.test');
  perform public.bizplan_check('s11.plan.y1', '동의', '바꾸기 전 문장에 동의', f.content_rev);
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_save_field('s11.plan.y1', sv, '수정 반영 완료', null, '사업화전략 반영', f.rev, rq);
  perform test_assert((r->>'ok')::boolean and (r->>'stale_checks')::int = 1, '반영 저장 — 이사님 동의 1개가 「재확인 필요」');
  perform as_postgres();
  perform test_assert((select status from public.bizplan_requests where id = rq) = '반영 완료', '요청은 「반영 완료」');
  select * into c from public.bizplan_checks where key = 's11.plan.y1' and profile_id = pid('bpdir@dev.test');
  perform test_assert(c.content_rev < (select content_rev from public.bizplan_fields where key = 's11.plan.y1'), '이전 동의는 바꾸기 전 판에 묶인 채 남음');
end $$;
do $$
declare r jsonb;
begin
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_open();
  perform test_assert(exists (select 1 from jsonb_array_elements(r->'requests') x where x->>'source' = 'strategy' and x ? 'suggested_value'),
                      '기존 문서 열기(bizplan_open)에도 제안 모양 · 출처가 함께 옴');
end $$;

\echo '── 6. 실제 사용 건수 — 참여자만 · 시연 기록 제외 ────────────────────────────────'
do $$
declare r jsonb; m jsonb;
begin
  perform as_postgres();
  insert into public.collection_events(actor_id, actor_name, actor_role, action, waste_type, amount_kg, input_duration_ms, demo_session_id, at)
  values (pid('bpdrive@dev.test'), '기사', 'field', '수거 완료', '의료폐기물', 10, 60000, null, now()),
         (pid('bpdrive@dev.test'), '기사', 'field', '수거 완료', '의료폐기물', 10, 120000, null, now()),
         (pid('bpdrive@dev.test'), '기사', 'field', '수거 완료', '의료폐기물', 10, 30000, 'demo-x', now()),
         (pid('bpdrive@dev.test'), '기사', 'field', '수거 완료', '의료폐기물', 10, 30000, null, now() - interval '3 years');
  perform login_as('bpclerk@dev.test');
  perform test_assert(state_of('select public.bizplan_usage_stats()') = '42501', '참여자가 아니면 못 봄');
  perform login_as('bpdir@dev.test');
  r := public.bizplan_usage_stats(12);
  perform test_assert(jsonb_array_length(r->'months') = 12, '최근 12개월 달별');
  m := r->'months'->11;
  perform test_assert((m->>'collections')::int >= 2 and (m->>'field_inputs')::int >= 2, '이번 달 실제 수거 입력 (시연 제외)');
  perform as_postgres();
  perform test_assert((m->>'collections')::int = (select count(*) from public.collection_events
                        where action = '수거 완료' and not reverted and demo_session_id is null
                          and date_trunc('month', at at time zone 'Asia/Seoul') = date_trunc('month', now() at time zone 'Asia/Seoul')),
                      '건수 = 시연 · 취소를 뺀 실제 기록 수');
  set session_replication_role = replica;
  delete from public.collection_events where actor_name = '기사' and waste_type = '의료폐기물' and amount_kg = 10;
  set session_replication_role = origin;
end $$;

\echo '── 7. 기록은 고칠 수 없음 · 표 직접 접근 · 도움 함수 ────────────────────────────'
do $$
begin
  perform as_postgres();
  perform set_config('t.last_rev', (select max(id) from public.bizplan_strategy_revisions)::text, false);
  perform test_assert(blocked('update public.bizplan_strategy_revisions set reason = $x$고침$x$'), '모델 기록 — 고치기 막힘');
  perform test_assert(blocked('delete from public.bizplan_decision_log'), '결정 기록 — 지우기 막힘');
  perform test_assert(blocked('delete from public.bizplan_strategy_log'), '단계 기록 — 지우기 막힘');
  perform login_as('bpdir@dev.test');
  perform test_assert(blocked('select * from public.bizplan_strategy'), '모델 표를 직접 읽지 못함 (함수로만)');
  perform test_assert(blocked('select * from public.bizplan_decisions'), '결정 표를 직접 읽지 못함');
  perform test_assert(blocked($q$update public.bizplan_decisions set choice = 'C'$q$), '결정 표를 직접 고치지 못함');
  perform test_assert(blocked($q$select public.bizplan_decision_agreed('newborn2026', 'scenario', 2)$q$), '도움 함수(합의 판단)는 화면에서 못 부름');
  perform test_assert(blocked('select public.bizplan_deciders()'), '도움 함수(결정할 분)는 화면에서 못 부름');
  perform test_assert((public.bizplan_strategy_revision_get(current_setting('t.last_rev')::bigint))->>'reason' = 'SaaS 목표 36 → 40', '참여자는 기록 한 줄을 열어 봄');
  perform login_as('bpclerk@dev.test');
  perform test_assert(state_of('select public.bizplan_strategy_revision_get(1)') = '42501', '참여자가 아니면 기록도 못 봄');
  perform as_postgres();
end $$;

\echo '55 · 사업화전략 검사 끝'

\echo '── 8. 결정할 분이 1명뿐이면 합의로 세지 않음 ─────────────────────────────────────'
do $$
begin
  perform login_as('bpboss@dev.test');
  perform public.bizplan_member_set(pid('bpboss@dev.test'), 'reviewer', '대표', false);
  perform as_postgres();
  perform test_assert(jsonb_array_length(public.bizplan_deciders()) = 1, '대표님 참여 끔 → 결정할 분 1명');
  perform decide('bpdir@dev.test', 'structure', 'direct');
  perform as_postgres();
  perform test_assert(not agreed('structure'), '이사님 혼자 고르면 합의 아님 (두 분이 필요)');
  perform login_as('bpboss@dev.test');
  perform public.bizplan_member_set(pid('bpboss@dev.test'), 'reviewer', '대표', true);
  perform as_postgres();
  perform decide('bpboss@dev.test', 'structure', 'direct');
  perform as_postgres();
  perform test_assert(agreed('structure'), '대표님 다시 참여 · 같은 안 → 합의');
end $$;
\echo '55 · 끝 (결정할 분 규칙)'
