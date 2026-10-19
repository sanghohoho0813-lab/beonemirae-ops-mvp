-- ════════════════════════════════════════════════════════════════════════════
-- 0145 — 뉴본펭귄 사전 설문: 링크 없이 앱 안에서 바로 (0144 다음에 실행)
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. 지우는 것 없습니다.
--     0144 에서 만든 표에 **칸 둘**을 더하고, **함수 넷**을 더할 뿐입니다.
--     판 번호(app_schema_version)는 바꾸지 않습니다.
--
--  ── 바뀌는 것 ────────────────────────────────────────────────────────────
--   대표님: 「링크 필요 없이 · 두 분 중 한 분만 답하면 되고 · 시작하기 누르면 바로」.
--
--    · 로그인한 **대표·관리자(admin) 또는 사무실(office, 이사님)** 계정이 앱 안의
--      「뉴본펭귄 사전 설문 › 시작하기」로 바로 답합니다. 링크를 보낼 필요가 없습니다.
--    · 답지는 **하나**입니다(두 분 중 누가 이어서 써도 같은 답지). 마지막으로 고친
--      사람의 이름 · 역할이 남습니다.
--    · 현장 · 병원 계정, 로그인 안 한 사람은 열지도 쓰지도 못합니다.
--    · 두 분 답 전체를 모아 보는 관리 화면(사용자 피드백 › 뉴본펭귄 사전 설문)은
--      0144 그대로 설문 관리자(admin)만 봅니다.
--
--   0144 의 초대 링크 함수는 그대로 남지만 화면에서는 더 쓰지 않습니다.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'biz_survey_responses') then
    raise exception '먼저 PROPOSAL_0144_biz_survey.sql 을 실행해 주세요. 아무것도 바꾸지 않았습니다.';
  end if;
end $$;

-- ── 1. 마지막으로 고친 사람 (칸 둘 · 기존 줄은 빈 값) ─────────────────────────
alter table public.biz_survey_responses add column if not exists edited_by   text not null default '';
alter table public.biz_survey_responses add column if not exists edited_role text not null default '';

-- ── 2. 누가 답할 수 있나 — 대표·관리자 · 사무실(이사님) ──────────────────────
create or replace function public.biz_survey_can_answer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('admin','office'), false)
$$;

--  공동 답지 하나 — 0144 의 'ceo' 줄을 「대표님 · 이사님 공동 답변」으로 씁니다.
--  (표의 응답자 칸 제약을 고치지 않으려고 — 고치려면 지우는 문장이 필요합니다)

create or replace function public.biz_survey_my_open()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.biz_survey_responses%rowtype;
begin
  if not public.biz_survey_can_answer() then
    raise exception '뉴본펭귄 사전 설문은 대표님 · 이사님 계정만 열 수 있습니다.' using errcode = '42501';
  end if;
  insert into public.biz_survey_responses(respondent) values ('ceo') on conflict (respondent) do nothing;
  select * into r from public.biz_survey_responses where respondent = 'ceo';
  return jsonb_build_object(
    'answers', r.answers, 'status', r.status, 'updated_at', r.updated_at,
    'submitted_at', r.submitted_at, 'first_submitted_at', r.first_submitted_at,
    'edited_by', r.edited_by, 'edited_role', r.edited_role
  );
end $$;

create or replace function public.biz_survey_my_save(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_at timestamptz := clock_timestamp(); v_name text; v_role text;
begin
  if not public.biz_survey_can_answer() then
    raise exception '뉴본펭귄 사전 설문은 대표님 · 이사님 계정만 쓸 수 있습니다.' using errcode = '42501';
  end if;
  perform public.biz_survey_check_answers(p_answers);
  select name, role::text into v_name, v_role from public.profiles where id = auth.uid();
  insert into public.biz_survey_responses(respondent, answers, updated_at, save_count, edited_by, edited_role)
  values ('ceo', p_answers, v_at, 1, coalesce(v_name, ''), coalesce(v_role, ''))
  on conflict (respondent) do update
     set answers = excluded.answers, updated_at = v_at,
         save_count = public.biz_survey_responses.save_count + 1,
         edited_by = excluded.edited_by, edited_role = excluded.edited_role;
  return jsonb_build_object('updated_at', v_at);
end $$;

create or replace function public.biz_survey_my_submit(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_at timestamptz := clock_timestamp(); v_name text; v_role text;
begin
  if not public.biz_survey_can_answer() then
    raise exception '뉴본펭귄 사전 설문은 대표님 · 이사님 계정만 제출할 수 있습니다.' using errcode = '42501';
  end if;
  perform public.biz_survey_check_answers(p_answers);
  select name, role::text into v_name, v_role from public.profiles where id = auth.uid();
  insert into public.biz_survey_responses(respondent, answers, status, updated_at, first_submitted_at, submitted_at, save_count, edited_by, edited_role)
  values ('ceo', p_answers, 'submitted', v_at, v_at, v_at, 1, coalesce(v_name, ''), coalesce(v_role, ''))
  on conflict (respondent) do update
     set answers = excluded.answers, status = 'submitted', updated_at = v_at,
         first_submitted_at = coalesce(public.biz_survey_responses.first_submitted_at, v_at),
         submitted_at = v_at,
         save_count = public.biz_survey_responses.save_count + 1,
         edited_by = excluded.edited_by, edited_role = excluded.edited_role;
  insert into public.biz_survey_revisions(respondent, answers, submitted_at) values ('ceo', p_answers, v_at);
  return jsonb_build_object('updated_at', v_at, 'submitted_at', v_at);
end $$;

revoke all on function public.biz_survey_can_answer() from public, anon;
revoke all on function public.biz_survey_my_open() from public, anon;
revoke all on function public.biz_survey_my_save(jsonb) from public, anon;
revoke all on function public.biz_survey_my_submit(jsonb) from public, anon;
grant execute on function public.biz_survey_can_answer() to authenticated;
grant execute on function public.biz_survey_my_open() to authenticated;
grant execute on function public.biz_survey_my_save(jsonb) to authenticated;
grant execute on function public.biz_survey_my_submit(jsonb) to authenticated;

-- ── 바로 확인 — 한 줄로 「칸 2 · 함수 4」가 나오면 끝입니다 ──────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'biz_survey_responses'
      and column_name in ('edited_by','edited_role')) as "칸 (2)",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('biz_survey_can_answer','biz_survey_my_open','biz_survey_my_save','biz_survey_my_submit')) as "함수 (4)";
