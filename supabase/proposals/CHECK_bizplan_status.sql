-- ════════════════════════════════════════════════════════════════════════════
-- 사업계획서(0146 · 0147) 운영 DB 상태 확인 — **읽기만** 합니다 (아무것도 바꾸지 않음)
--
--  Supabase SQL Editor 에 붙여 넣고 실행하면 표 한 장이 나옵니다. 0146 · 0147 · 초안을
--  실행하기 전 · 후에 한 번씩 돌려 보시면 무엇이 들어갔는지 확인할 수 있습니다.
--  표가 없으면 「없음」으로 나오고 오류가 나지 않습니다.
-- ════════════════════════════════════════════════════════════════════════════

with t as (
  select to_regclass('public.bizplan_fields') is not null as has146,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bizplan_fields' and column_name = 'content_rev') as has147,
         to_regclass('public.biz_survey_responses') is not null as has_survey
),
q as (
  select (select has146 from t) as has146, (select has147 from t) as has147, (select has_survey from t) as has_survey
)
select 1 as "순서", '서버 판 번호 (app_schema_version)' as "항목",
       coalesce((xpath('/row/v/text()', query_to_xml('select public.app_schema_version()::text as v', false, true, '')))[1]::text, '-') as "상태"
union all
select 2, '사업계획서 표 (0146)', case when has146 then '있음' else '없음 — PROPOSAL_0146 실행 전' end from q
union all
select 3, '확인 표시 판 번호 · 제출 전 점검 (0147)',
       case when has147 and to_regprocedure('public.bizplan_preflight()') is not null then '있음'
            when has146 then '없음 — PROPOSAL_0147 실행 전' else '-' end from q
union all
select 4, '항목 줄 수 / 내용 있는 칸',
       case when has146 then (xpath('/row/v/text()', query_to_xml(
         $x$select count(*) || ' / ' || count(*) filter (where value <> '""'::jsonb and value <> '{}'::jsonb and value <> '[]'::jsonb) as v from public.bizplan_fields$x$,
         false, true, '')))[1]::text else '-' end from q
union all
select 5, '초안 입력 기록 (V0.1 · V0.2)',
       case when has146 then (xpath('/row/v/text()', query_to_xml(
         $x$select 'V0.1 ' || count(*) filter (where reason = '1차 초안 입력 (V0.1)') || '칸 · V0.2 ' || count(*) filter (where reason = '초안 보완 입력 (V0.2)') || '칸' as v from public.bizplan_revisions$x$,
         false, true, '')))[1]::text else '-' end from q
union all
select 6, '수정요청 (처리 전 / 전체 · 초안 갱신 요청)',
       case when has146 then (xpath('/row/v/text()', query_to_xml(
         $x$select count(*) filter (where status in ('접수','검토 중')) || ' / ' || count(*) || ' · 초안 갱신 ' || count(*) filter (where requester_name = '초안 갱신 (V0.2)') as v from public.bizplan_requests$x$,
         false, true, '')))[1]::text else '-' end from q
union all
select 7, '확인 표시 (지금 / 판 번호 없는 것)',
       case when has147 then (xpath('/row/v/text()', query_to_xml(
         $x$select count(*) || ' / ' || count(*) filter (where content_rev is null) as v from public.bizplan_checks$x$, false, true, '')))[1]::text
            when has146 then (xpath('/row/v/text()', query_to_xml($x$select count(*)::text as v from public.bizplan_checks$x$, false, true, '')))[1]::text
            else '-' end from q
union all
select 8, '버전 (제출본 표시 *)',
       case when has146 then coalesce((xpath('/row/v/text()', query_to_xml(
         $x$select string_agg(label || case when is_submission then '*' else '' end, ', ' order by created_at) as v from public.bizplan_versions$x$,
         false, true, '')))[1]::text, '없음') else '-' end from q
union all
select 9, '문서 상태',
       case when has146 then coalesce((xpath('/row/v/text()', query_to_xml(
         $x$select status || ' · ' || coalesce(nullif(version_label, ''), '버전 전') as v from public.bizplan_doc$x$, false, true, '')))[1]::text, '문서 줄 없음 (처음 열 때 생김)') else '-' end from q
union all
select 10, '참여자 (담당 / 검토 · 꺼짐)',
       case when has146 then (xpath('/row/v/text()', query_to_xml(
         $x$select count(*) filter (where member_role = 'editor' and active) || ' / ' || count(*) filter (where member_role = 'reviewer' and active) || ' · ' || count(*) filter (where not active) as v from public.bizplan_members$x$,
         false, true, '')))[1]::text else '-' end from q
union all
select 11, '사전 설문 답지 (0144 · 0145)',
       case when has_survey then (xpath('/row/v/text()', query_to_xml(
         $x$select coalesce(string_agg(respondent || ' ' || status, ', '), '답지 없음') as v from public.biz_survey_responses$x$, false, true, '')))[1]::text
            else '설문 표 없음' end from q
order by 1;
