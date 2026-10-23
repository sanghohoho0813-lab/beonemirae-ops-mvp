-- ─────────────────────────────────────────────────────────────────────────────
-- 54. 사업계획서 V2 (0147) — 확인 표시와 문장 판 번호 · 제출 전 점검 · 참여자 관리 대표만
--
--  확인하는 것
--   0) 0146 때 쌓인 기록(53 이 남긴 것)에 판 번호 · 그때 문장이 바르게 채워졌다
--   1) 이사님이 10,000원 문장에 동의 → 담당이 12,000원으로 고침 →
--        이사님 동의는 10,000원 문장에 대한 것으로 **남고**, 지금 문장은 「재확인 필요」,
--        다시 동의하면 12,000원 문장(새 판)에 대한 동의가 **따로** 남는다
--   2) 그사이 내용이 바뀌었으면 옛 화면에서 누른 동의는 서버가 거절(PT409 — 40001 은 PostgREST 가 끝없이 재시도)
--   3) 판 번호 없는 예전 모양 호출은 거절 · 상태/근거만 바꾸거나 요청을 남겨도 판은 그대로 ·
--      표 안 숫자 한 칸만 바뀌어도 판이 오른다 · 내용을 고치면 「최종 확인 완료」 유지 불가
--   4) 제출 전 점검 — 차단(필수 · 처리 전 요청 · 자금 합계) / 확인(재확인 · 미정 · 추정 표시 ·
--      작성기간 · 매출 숫자 · 보증신청>차입) / 예외 승인은 까닭 10자 이상 · 버전에 함께 남음
--   5) 참여자 관리는 대표·관리자만 (담당은 못 함)
--   6) 관련 설문 응답은 참여자만 읽음
--   7) 새 칸이 생긴 기록 표도 여전히 지우기 · 고치기 막힘, 도움 함수는 화면에서 못 부름
--
--  실행 (로컬 PostgreSQL) — 53 다음에:
--    … → PROPOSAL_0146 → 53_bizplan.sql → PROPOSAL_0147 → 54_bizplan_v2.sql
--    (53 은 0146 동작을 검사합니다. 0147 뒤에는 참여자 관리 · 확인 표시 · 제출본 확정 방식이 바뀌어 54 가 맡습니다)
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

--  담당 저장 — 지금 판 번호(rev)를 읽어서
create or replace function save(p_key text, p_value jsonb, p_status text default '초안 입력 완료', p_basis jsonb default null)
returns jsonb language plpgsql as $$
declare v_rev int;
begin
  perform as_postgres();
  select rev into v_rev from public.bizplan_fields where key = p_key;
  perform login_as('bpeditor@dev.test');
  return public.bizplan_save_field(p_key, p_value, p_status, p_basis, '검사', coalesce(v_rev, 0));
end $$;
create or replace function crev(p_key text) returns int language sql security definer as $$ select content_rev from public.bizplan_fields where key = p_key $$;
grant execute on function crev(text) to authenticated;
create or replace function pf_codes(p jsonb, p_level text) returns text[] language sql as $$
  select coalesce(array_agg(distinct i->>'code'), '{}') from jsonb_array_elements(p->'items') i where i->>'level' = p_level
$$;
create or replace function pf_has(p jsonb, p_code text, p_key text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(p->'items') i where i->>'code' = p_code and (p_key is null or i->>'key' = p_key))
$$;

\echo '── 0. 0146 때 기록에 판 번호 · 그때 문장 채움 (53 이 남긴 자료) ─────────────────'
do $$
declare n int;
begin
  perform as_postgres();
  select count(*) into n from public.bizplan_checks where content_rev is null or value_snapshot is null;
  perform test_assert(n = 0, '확인 표시마다 판 번호 · 그때 문장이 있음');
  select count(*) into n from public.bizplan_fields f
   where f.content_rev <> (select count(*) from public.bizplan_revisions r
                            where r.doc_id = f.doc_id and r.key = f.key and r.before_value is distinct from r.after_value);
  perform test_assert(n = 0, '항목 판 번호 = 내용이 바뀐 기록 수');
  select count(*) into n from public.bizplan_checks c join public.bizplan_fields f on f.doc_id = c.doc_id and f.key = c.key
   where c.content_rev = f.content_rev and c.value_snapshot is distinct from f.value;
  perform test_assert(n = 0, '지금 판에 대한 표시는 지금 문장과 같음');
  perform test_assert(exists (select 1 from public.bizplan_checks where key = 's1.company'), '53 의 확인 표시가 지워지지 않고 남음');
end $$;

--  깨끗한 문서에서 (로컬 검증 DB 의 사업계획서 표만)
set session_replication_role = replica;
delete from public.bizplan_check_log; delete from public.bizplan_checks;
delete from public.bizplan_request_log; delete from public.bizplan_requests;
delete from public.bizplan_revisions; delete from public.bizplan_versions;
delete from public.bizplan_fields; delete from public.bizplan_doc; delete from public.bizplan_members;
set session_replication_role = origin;
do $$
begin
  perform login_as('bpboss@dev.test');
  perform public.bizplan_member_set(pid('bpdir@dev.test'), 'reviewer', '이사');
  perform public.bizplan_member_set(pid('bpeditor@dev.test'), 'editor', '사업계획 담당');
  perform as_postgres();
end $$;

\echo '── 1. 10,000원에 동의 → 12,000원으로 고침 → 재확인 필요 → 새 문장에 동의 ─────────'
do $$
declare r jsonb; c record; n int;
begin
  r := save('s11.prod.bm_b', to_jsonb('요금 A안 월 10,000원 (검사용)'::text));
  perform test_assert((r->'field'->>'content_rev')::int = 1, '첫 저장 — 내용 판 1');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  r := public.bizplan_check('s11.prod.bm_b', '동의', '', 1);
  perform test_assert((r->>'content_rev')::int = 1, '이사님 동의 — 판 1 에 대해');
  perform as_postgres();
  perform login_as('bpboss@dev.test');
  r := public.bizplan_check('s11.prod.bm_b', '동의', '', 1);
  perform as_postgres();

  r := save('s11.prod.bm_b', to_jsonb('요금 A안 월 12,000원 (검사용)'::text), '최종 확인 완료');
  perform test_assert((r->'field'->>'content_rev')::int = 2, '담당이 12,000원으로 고침 — 판 2');
  perform test_assert(r->'field'->>'status' = '수정 반영 완료', '내용을 고치면서 「최종 확인 완료」는 유지 안 됨 → 「수정 반영 완료」');
  perform test_assert((r->>'stale_checks')::int = 2, '두 분의 동의가 「변경 전 문장에 대한 동의」가 됨');
  perform as_postgres();
  perform test_assert((select reason from public.bizplan_revisions where key = 's11.prod.bm_b' order by id desc limit 1) like '%최종 확인을 다시%', '기록에 까닭이 남음');

  select * into c from public.bizplan_checks where key = 's11.prod.bm_b' and profile_id = pid('bpdir@dev.test');
  perform test_assert(c.mark = '동의' and c.content_rev = 1 and c.value_snapshot = to_jsonb('요금 A안 월 10,000원 (검사용)'::text),
                      '이사님 동의는 지워지지 않고 10,000원 문장(판 1)에 대한 동의로 남음');
  perform login_as('bpdir@dev.test');
  r := public.bizplan_open();
  perform test_assert((select count(*) from jsonb_array_elements(r->'checks') x
                        where x->>'key' = 's11.prod.bm_b' and (x->>'content_rev')::int < 2) = 2,
                      '화면 자료 — 두 표시 모두 판 1 (지금 판 2 → 재확인 필요로 보임)');
  perform test_assert(r->>'api' = '147' and (select (x->>'content_rev')::int from jsonb_array_elements(r->'fields') x where x->>'key' = 's11.prod.bm_b') = 2,
                      '화면 자료 — 항목 판 2 · 서버 0147');

  --  옛 화면(판 1)을 보고 누른 동의 — 거절
  perform test_assert(state_of($q$select public.bizplan_check('s11.prod.bm_b', '동의', '', 1)$q$) = 'PT409', '판 1 화면에서 누른 동의 — 거절(PT409 · HTTP 409)');
  perform test_assert(err_of($q$select public.bizplan_check('s11.prod.bm_b', '동의', '', 1)$q$) like '%새 내용을 확인한 뒤%', '거절 까닭 — 새 내용을 확인한 뒤');
  perform as_postgres();
  perform test_assert((select content_rev from public.bizplan_checks where key = 's11.prod.bm_b' and profile_id = pid('bpdir@dev.test')) = 1, '거절된 동의는 아무것도 바꾸지 않음');

  --  새 문장을 보고 다시 동의
  perform login_as('bpdir@dev.test');
  r := public.bizplan_check('s11.prod.bm_b', '동의', '12,000원 확인', 2);
  perform as_postgres();
  select * into c from public.bizplan_checks where key = 's11.prod.bm_b' and profile_id = pid('bpdir@dev.test');
  perform test_assert(c.content_rev = 2 and c.value_snapshot = to_jsonb('요금 A안 월 12,000원 (검사용)'::text), '재확인 — 12,000원 문장(판 2)에 대한 동의');
  select count(*) into n from public.bizplan_check_log where key = 's11.prod.bm_b' and profile_id = pid('bpdir@dev.test') and mark = '동의';
  perform test_assert(n = 2, '확인 기록 — 이사님 동의 두 번(판 1 · 판 2)이 모두 남음');
  perform test_assert(exists (select 1 from public.bizplan_check_log where key = 's11.prod.bm_b' and profile_id = pid('bpdir@dev.test')
                               and content_rev = 1 and value_snapshot = to_jsonb('요금 A안 월 10,000원 (검사용)'::text)),
                      '확인 기록 — 10,000원 문장에 대한 동의 그대로');
  perform login_as('bpdir@dev.test');
  r := public.bizplan_history('s11.prod.bm_b');
  perform test_assert((select count(distinct (x->>'content_rev')) from jsonb_array_elements(r->'check_log') x where x->>'name' = '홍현주') = 2
                      and exists (select 1 from jsonb_array_elements(r->'check_log') x where x->'value_snapshot' = to_jsonb('요금 A안 월 10,000원 (검사용)'::text)),
                      '기록 보기 — 판 번호 · 그때 문장과 함께');
  r := public.bizplan_preflight();
  perform test_assert(pf_has(r, 'stale_confirm', 's11.prod.bm_b')
                      and (select i->>'msg' from jsonb_array_elements(r->'items') i where i->>'code' = 'stale_confirm' and i->>'key' = 's11.prod.bm_b') like '%송명근%'
                      and (select i->>'msg' from jsonb_array_elements(r->'items') i where i->>'code' = 'stale_confirm' and i->>'key' = 's11.prod.bm_b') not like '%홍현주%',
                      '점검 — 재확인 안 한 대표님만 「재확인 필요」');
  perform as_postgres();
end $$;

\echo '── 2. 판 번호가 오르는 때 · 안 오르는 때 ────────────────────────────────────'
do $$
declare r jsonb;
begin
  r := save('s11.prod.bm_b', to_jsonb('요금 A안 월 12,000원 (검사용)'::text), '확인 필요', '{"kind":"계획","source":"검사"}');
  perform test_assert(crev('s11.prod.bm_b') = 2, '상태 · 근거만 바꾸면 판 그대로 (동의 유지)');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  perform public.bizplan_request_create('s11.prod.bm_b', 'x', '숫자 변경', '가격 다시 보기', '');
  perform as_postgres();
  perform test_assert(crev('s11.prod.bm_b') = 2, '수정요청을 남겨도 판 그대로');
  r := save('s11.prod.bm_b', to_jsonb('요금 A안 월 12,000원 (검사용)'::text), null);
  perform test_assert((r->>'unchanged')::boolean and crev('s11.prod.bm_b') = 2, '같은 내용 다시 저장 — 기록도 판도 그대로');
  --  표 안 숫자 한 칸
  r := save('s9.working', '[{"item":"외주개발","amount":"120"},{"item":"인건비","amount":"80"}]');
  perform as_postgres();
  perform login_as('bpboss@dev.test');
  perform public.bizplan_check('s9.working', '동의', '', 1);
  perform as_postgres();
  r := save('s9.working', '[{"item":"외주개발","amount":"150"},{"item":"인건비","amount":"80"}]');
  perform test_assert(crev('s9.working') = 2 and (r->>'stale_checks')::int = 1, '표 안 숫자 한 칸(120→150)만 바뀌어도 판 2 · 대표님 동의는 재확인 필요');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  perform test_assert(err_of($q$select public.bizplan_check('s9.working', '동의', '')$q$) like '%새로 고쳐%', '판 번호 없는 예전 모양 호출 — 거절');
  perform as_postgres();
end $$;

\echo '── 3. 참여자 관리는 대표·관리자만 ──────────────────────────────────────────'
do $$
begin
  perform login_as('bpeditor@dev.test');
  perform test_assert(not public.bizplan_can_manage(), '담당 — 참여자 관리 권한 없음');
  perform test_assert(blocked('select public.bizplan_members_list()'), '담당 — 참여자 목록(계정) 못 봄');
  perform test_assert(blocked(format('select public.bizplan_member_set(%L, %L, %L)', pid('bpclerk@dev.test'), 'editor', '추가')), '담당 — 다른 계정을 참여자로 못 넣음');
  perform test_assert(not ((public.bizplan_open()->>'can_manage')::boolean), '담당 화면 — 참여자 탭 없음');
  perform as_postgres();
  perform login_as('bpboss@dev.test');
  perform test_assert(public.bizplan_can_manage() and jsonb_array_length(public.bizplan_members_list()->'members') = 2, '대표·관리자 — 참여자 관리');
  perform as_postgres();
end $$;

\echo '── 4. 제출 전 점검 · 제출본 확정 ───────────────────────────────────────────'
do $$
declare r jsonb; k text; v_req uuid;
begin
  perform login_as('bpdir@dev.test');
  r := public.bizplan_preflight();
  perform test_assert(pf_has(r, 'required_blank', 's1.company') and pf_has(r, 'open_request', 's11.prod.bm_b'), '빈 필수 칸 · 처리 전 요청 — 차단 항목');
  perform test_assert(not pf_has(r, 'required_blank', 's1.homepage') and not pf_has(r, 'recommended_blank', 's1.homepage'), '홈페이지 같은 선택 칸은 비어도 안내 없음');
  perform test_assert(pf_has(r, 'annex_blank', null), '별첨이 모두 비면 「별첨 대상 보증인지 확인」 한 줄');
  perform test_assert(pf_has(r, 'by_hand', null) and (r->>'blocks')::int > 0, '직접 기입 칸 안내 · 차단 수');
  perform test_assert(blocked($q$select public.bizplan_submit('V1.0', '제출본', '충분히 긴 예외 사유입니다')$q$), '검토자는 제출본 확정 못 함');
  perform as_postgres();

  perform login_as('bpeditor@dev.test');
  perform test_assert(err_of($q$select public.bizplan_version_create('V1.0', '제출본', true)$q$) like '%제출 전 점검%', '예전 방식(버전 저장 + 제출본) — 점검 없이 확정 못 함');
  perform test_assert(err_of($q$select public.bizplan_submit('V1.0', '제출본', '충분히 긴 예외 사유입니다')$q$) like '%고쳐야 할 항목%', '차단 항목이 있으면 예외 승인으로도 확정 못 함');
  perform as_postgres();

  --  필수 칸 채우기 (검사용 글)
  foreach k in array array['cover.company','cover.ceo','sign.company','sign.ceo','s1.company','s1.ceo','s1.founded','s1.industry',
      's1.hq_addr','s1.hq_tel','s1.employees','s1.form','s2.ceo_name','s2.ceo_edu','s3.site_addr','s3.site_owner','s3.site_lease',
      's4.recent_sales','s10.bank','s10.holder','s11.mgmt.background','s11.mgmt.ceo','s11.mgmt.philosophy','s11.prod.bm_a',
      's11.prod.core_a','s11.prod.dev_a','s11.prod.growth_a','s11.market.target','s11.market.compete','s11.tech.core_a',
      's11.tech.rnd','s11.tech.diff','s11.plan.commercial','s11.plan.y1_note'] loop
    r := save(k, to_jsonb('검사용 내용 ' || k));
  end loop;
  r := save('s2.ceo_career', '[{"period":"2010~","place":"검사"}]');
  r := save('s4.sellers', '[{"name":"검사병원"}]');
  r := save('s11.plan.y1', '[{"segment":"수거","amount":"100","basis":"검사 (예상)"}]', '초안 입력 완료', '{"kind":"추정"}');
  r := save('s11.plan.sum_annual', '{"y2026":"120 (연말 예상)"}');
  r := save('s9.funding', '{"own":"30","loan":"250","guarantee":"300","etc":"0"}');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  r := public.bizplan_preflight();
  perform test_assert(not pf_has(r, 'required_blank', null), '필수 칸 다 채움 — 필수 누락 없음');
  perform test_assert(pf_has(r, 'funding_mismatch', 's9.funding'), '자금소요(A 230) ≠ 조달(B 280) — 차단');
  perform test_assert(pf_has(r, 'funding_guarantee', 's9.funding'), '보증신청(300) > 금융차입(250) — 확인');
  perform as_postgres();
  r := save('s9.funding', '{"own":"30","loan":"200","guarantee":"150","etc":"0"}');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  r := public.bizplan_preflight();
  perform test_assert(not pf_has(r, 'funding_mismatch', null) and not pf_has(r, 'funding_guarantee', null), 'A 230 = B 230 · 보증신청 ≤ 차입 — 통과');
  perform as_postgres();

  --  확인(예외 승인 가능) 항목들
  r := save('s11.prod.growth_b', to_jsonb('1년차 말 5개사 확보 미정'::text), '초안 입력 완료', '{"kind":"계획"}');
  r := save('s11.plan.y2_note', to_jsonb('2차년도 매출 500'::text), '초안 입력 완료', '{"kind":"추정"}');
  r := save('s11.plan.y3_note', to_jsonb('3차년도 매출 900 (목표)'::text), '초안 입력 완료', '{"kind":"추정"}');
  r := save('sign.date', to_jsonb('2026. 11. 5.'::text));
  r := save('a.periods', '{"y1":"26.2월~27.1월","y2":"27.2월~28.1월","y3":"28.2월~29.1월"}');
  r := save('a.sales_total', '{"y1":"120"}');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  r := public.bizplan_preflight();
  perform test_assert(pf_has(r, 'placeholder', 's11.prod.growth_b'), '「미정」이 남은 문장 — 확인');
  perform test_assert(pf_has(r, 'estimate_as_fact', 's11.plan.y2_note') and not pf_has(r, 'estimate_as_fact', 's11.plan.y3_note'), '추정인데 표시 없는 숫자만 — 「확정 실적처럼 읽힘」');
  perform test_assert(r->>'submit_month' = '2026.11' and pf_has(r, 'period_mismatch', 'a.periods'), '작성일 11월 → 1차년도는 2026.12 부터 — 원본 예시(26.2월) 기간은 확인');
  perform test_assert(pf_has(r, 'revenue_mismatch', 'a.sales_total'), '11번 1차년도 100 ≠ 별첨 120 — 확인');
  perform test_assert(pf_has(r, 'stale_confirm', 's9.working') and pf_has(r, 'finance_unconfirmed', 's9.working'), '재확인 필요 · 최종 확인 전 재무 숫자 — 확인');
  perform as_postgres();
  r := save('a.periods', '{"y1":"2026.12 ~ 2027.11","y2":"2027.12 ~ 2028.11","y3":"2028.12 ~ 2029.11"}');
  perform as_postgres();
  perform login_as('bpdir@dev.test');
  perform test_assert(not pf_has(public.bizplan_preflight(), 'period_mismatch', null), '1차년도 2026.12 시작 — 기간 맞음');
  perform as_postgres();

  --  남은 요청 처리 → 차단 0 → 예외 사유 없이는 확정 못 함 → 사유와 함께 확정
  select id into v_req from public.bizplan_requests where status in ('접수','검토 중') limit 1;
  perform login_as('bpeditor@dev.test');
  perform public.bizplan_request_update(v_req, '반영 완료', '검사에서 처리');
  r := public.bizplan_preflight();
  perform test_assert((r->>'blocks')::int = 0 and (r->>'warns')::int > 0, '차단 0 · 확인 ' || (r->>'warns') || '개');
  perform test_assert(err_of($q$select public.bizplan_submit('V1.0', '제출본', '')$q$) like '%까닭을 10자 이상%', '확인 항목이 남으면 — 까닭 없이 확정 못 함');
  perform test_assert(blocked($q$select public.bizplan_submit('V1.0', '제출본', '짧음')$q$), '까닭이 너무 짧으면 거절');
  r := public.bizplan_submit('V1.0', '신보 제출본', '재확인 남은 항목은 대표님 구두 확인 · 별첨은 대상 아님 확인');
  perform test_assert((r->>'ok')::boolean and r->>'label' = 'V1.0', '까닭과 함께 제출본 V1.0 확정');
  perform as_postgres();
  perform test_assert((select is_submission and override_reason like '재확인 남은%' and approved_by = '계획담당' and (preflight->>'warns')::int > 0
                         from public.bizplan_versions where label = 'V1.0'), '버전에 점검 결과 · 예외 사유 · 승인자가 함께 남음');
  perform test_assert((select status || '/' || locked_label from public.bizplan_doc) = '제출본 확정/V1.0', '문서 — 제출본 확정 · V1.0');
  perform test_assert((select reason from public.bizplan_revisions where key = '_version' order by id desc limit 1) like '%예외 승인%', '문서 기록에 예외 승인 한 줄');
  perform login_as('bpeditor@dev.test');
  r := public.bizplan_version_create('V1.1', '확정 뒤 작업본', false);
  perform test_assert((r->>'ok')::boolean, '제출본이 아닌 버전 저장은 그대로');
  perform as_postgres();
end $$;

\echo '── 5. 관련 설문 응답 — 참여자만 · 읽기만 ────────────────────────────────────'
do $$
declare r jsonb; before_cnt int;
begin
  insert into public.biz_survey_responses(respondent, answers) values ('ceo', '{"q3":{"choice":"20~30만원"}}')
  on conflict (respondent) do nothing;
  select count(*) into before_cnt from public.biz_survey_responses;
  perform login_as('bpdir@dev.test');
  r := public.bizplan_survey();
  perform test_assert(jsonb_typeof(r) = 'array' and exists (select 1 from jsonb_array_elements(r) x where x->>'respondent' = 'ceo' and x->'answers' ? 'q3'),
                      '참여자 — 설문 답지를 읽음');
  perform as_postgres();
  perform test_assert((select count(*) from public.biz_survey_responses) = before_cnt, '읽기만 — 답지 줄 수 그대로');
  perform login_as('bpclerk@dev.test');
  perform test_assert(blocked('select public.bizplan_survey()'), '참여자가 아닌 사무실 직원 — 못 읽음');
  perform as_postgres();
  perform login_as('bpdrive@dev.test');
  perform test_assert(blocked('select public.bizplan_survey()'), '현장 — 못 읽음');
  perform as_postgres();
end $$;

\echo '── 6. 기록은 여전히 지울 수 없고 · 도움 함수는 화면에서 못 부름 ───────────────────'
do $$
begin
  perform test_assert(blocked($q$update public.bizplan_check_log set content_rev = 99$q$), '확인 기록 — 판 번호 고치기 막힘');
  perform test_assert(blocked($q$update public.bizplan_versions set override_reason = '바꿈'$q$), '확정본 예외 사유 — 고치기 막힘');
  perform test_assert(blocked('delete from public.bizplan_check_log'), '확인 기록 — 지우기 막힘');
  perform login_as('bpeditor@dev.test');
  perform test_assert(blocked('select public.bizplan_backfill_0147()'), '판 번호 채우기 함수 — 화면에서 못 부름');
  perform test_assert(blocked($q$select public.bizplan__make_version('V9.9', '', true, null, '')$q$), '버전 만들기 속 함수 — 점검을 건너뛰어 못 부름');
  perform test_assert(blocked('select * from public.bizplan_checks'), '확인 표 직접 읽기 막힘');
  perform test_assert(blocked($q$select public.bizplan__num('1')$q$) and blocked('select public.bizplan_rules()'), '계산용 도움 함수도 화면에서 못 부름');
  perform as_postgres();
end $$;

\echo '── 끝 ─────────────────────────────────────────────────────────────────────'
