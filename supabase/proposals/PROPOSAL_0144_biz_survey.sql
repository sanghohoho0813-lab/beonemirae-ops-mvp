-- ════════════════════════════════════════════════════════════════════════════
-- 0144 — 사업계획서 사전 설문 (신보 뉴본펭귄 · 임시)
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. 지우는 것 없습니다.
--     기존 표·행·정책·함수는 그대로이고, **표 넷 · 함수 아홉**을 더할 뿐입니다.
--     판 번호(app_schema_version)도 바꾸지 않습니다 — 다른 기능의 판 확인에
--     영향을 주지 않습니다. 화면은 이 함수들이 있는지만 보고 켜집니다.
--
--  ── 무엇을 하나 ──────────────────────────────────────────────────────────
--
--   대표님(송명근) · 이사님(홍현주) 두 분께 카카오톡으로 보낼 **개인별 초대
--   링크**로 설문에 답하게 합니다. 로그인 · 가입이 필요 없습니다.
--
--    · 링크 = 추측할 수 없는 무작위 열쇠(32자). 서버에는 **열쇠의 해시만**
--      저장합니다 — 이 표를 누가 읽어도 링크를 다시 만들 수 없습니다.
--    · 링크마다 만료일이 있고, 관리자가 언제든 폐기할 수 있습니다.
--      새 링크를 만들면 그 사람의 예전 링크는 자동으로 폐기됩니다.
--    · 링크로 들어온 사람은 **자기 답변만** 읽고 고칩니다. 다른 사람 답변을
--      읽는 길이 없습니다.
--    · 두 분 답변 전체를 보는 것은 **관리자(대표·관리자 역할)** 뿐입니다.
--      더 좁히려면 아래 「설문 관리자 지정」에 이메일을 넣으세요 — 그러면
--      그 이메일 계정만 봅니다.
--    · 사무실 · 현장 · 병원 계정, 로그인 안 한 사람은 표를 직접 읽지도 쓰지도
--      못합니다(RLS 켜고 정책 없음). 모든 접근은 아래 함수를 거칩니다.
--
--   수거 · 청구 · 개발 요청 등 기존 업무 데이터와는 **표가 완전히 따로**입니다.
--
--  ── 나중에 치울 때 ───────────────────────────────────────────────────────
--   화면은 src/lib/bizSurvey.ts 의 BIZ_SURVEY_ENABLED = false 로 숨깁니다.
--   데이터까지 지우는 SQL 은 일부러 넣지 않았습니다 — 필요해지면 따로 드립니다.
-- ════════════════════════════════════════════════════════════════════════════

--  무작위 열쇠 · 해시 — pgcrypto (Supabase 에는 extensions 스키마에 이미 있습니다).
--  없을 때만 만듭니다. 함수들은 search_path 에 public · extensions 를 둬서 어느 쪽에
--  있든 찾습니다.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── 1. 표 ─────────────────────────────────────────────────────────────────────

--  응답자 — 두 분 고정. 이름은 화면 표시용입니다.
--  'ceo' = 송명근 대표님 · 'director' = 홍현주 이사님

--  초대 링크 (열쇠는 해시만)
create table if not exists public.biz_survey_invites (
  id            uuid primary key default gen_random_uuid(),
  respondent    text not null check (respondent in ('ceo','director')),
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz
);
create index if not exists biz_survey_invites_resp_idx on public.biz_survey_invites(respondent, created_at desc);

--  답변 — 사람마다 한 줄. 질문 id 별로 구조화된 jsonb ({"q1": {...}, ...})
create table if not exists public.biz_survey_responses (
  respondent          text primary key check (respondent in ('ceo','director')),
  answers             jsonb not null default '{}'::jsonb,
  status              text not null default 'draft' check (status in ('draft','submitted')),
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  first_submitted_at  timestamptz,
  submitted_at        timestamptz,
  save_count          integer not null default 0
);

--  제출 이력 — 제출할 때마다 그 순간의 답을 한 장씩 남깁니다 (수정 이력)
create table if not exists public.biz_survey_revisions (
  id           uuid primary key default gen_random_uuid(),
  respondent   text not null check (respondent in ('ceo','director')),
  answers      jsonb not null,
  submitted_at timestamptz not null default now()
);
create index if not exists biz_survey_revisions_resp_idx on public.biz_survey_revisions(respondent, submitted_at desc);

--  설문 관리자 지정 (선택) — 비어 있으면 대표·관리자(admin) 역할 모두가 관리자입니다.
--  한 줄이라도 넣으면 **그 이메일 계정만** 두 분 답변을 봅니다.
create table if not exists public.biz_survey_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

--  표는 직접 못 읽고 못 씁니다 — RLS 를 켜고 정책을 두지 않습니다.
alter table public.biz_survey_invites   enable row level security;
alter table public.biz_survey_responses enable row level security;
alter table public.biz_survey_revisions enable row level security;
alter table public.biz_survey_admins    enable row level security;
revoke all on public.biz_survey_invites, public.biz_survey_responses,
              public.biz_survey_revisions, public.biz_survey_admins from anon, authenticated;

-- ── 2. 안쪽 도우미 (밖에서 못 부름) ───────────────────────────────────────────

--  열쇠 → 응답자. 맞지 않거나 · 만료 · 폐기면 오류(어느 쪽인지는 말하지 않음)
create or replace function public.biz_survey_resolve(p_token text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_resp text;
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 128 then
    raise exception '설문 링크가 올바르지 않거나 만료되었습니다.' using errcode = '28000';
  end if;
  select id, respondent into v_id, v_resp from public.biz_survey_invites
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and revoked_at is null and expires_at > now();
  if v_resp is null then
    raise exception '설문 링크가 올바르지 않거나 만료되었습니다.' using errcode = '28000';
  end if;
  update public.biz_survey_invites set last_used_at = now() where id = v_id;
  return v_resp;
end $$;

--  지금 로그인한 사람이 설문 관리자인가
create or replace function public.biz_survey_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
     and (
       not exists (select 1 from public.biz_survey_admins)
       or exists (
         select 1 from public.biz_survey_admins a
           join public.profiles p on lower(p.email) = lower(a.email)
          where p.id = auth.uid()
       )
     )
$$;

--  답변 크기 · 모양 확인 (질문 id 별 객체 · 200KB 이하)
create or replace function public.biz_survey_check_answers(p_answers jsonb)
returns void language plpgsql immutable as $$
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception '답변 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if length(p_answers::text) > 200000 then
    raise exception '답변이 너무 깁니다.' using errcode = '22023';
  end if;
end $$;

revoke all on function public.biz_survey_resolve(text) from public, anon, authenticated;
revoke all on function public.biz_survey_check_answers(jsonb) from public, anon, authenticated;
revoke all on function public.biz_survey_is_admin() from public, anon;
grant execute on function public.biz_survey_is_admin() to authenticated;

-- ── 3. 응답자 함수 (링크 열쇠로만) ───────────────────────────────────────────

--  열기 — 내 답변 · 상태
create or replace function public.biz_survey_open(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_resp text; r public.biz_survey_responses%rowtype; v_exp timestamptz;
begin
  v_resp := public.biz_survey_resolve(p_token);
  insert into public.biz_survey_responses(respondent) values (v_resp) on conflict (respondent) do nothing;
  select * into r from public.biz_survey_responses where respondent = v_resp;
  select expires_at into v_exp from public.biz_survey_invites
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  return jsonb_build_object(
    'respondent', v_resp,
    'answers', r.answers,
    'status', r.status,
    'updated_at', r.updated_at,
    'submitted_at', r.submitted_at,
    'first_submitted_at', r.first_submitted_at,
    'expires_at', v_exp
  );
end $$;

--  자동 저장 — 상태는 그대로(제출한 뒤 고쳐도 「제출」로 남고, 고친 시각이 남습니다)
create or replace function public.biz_survey_save(p_token text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_resp text; v_at timestamptz := clock_timestamp();
begin
  v_resp := public.biz_survey_resolve(p_token);
  perform public.biz_survey_check_answers(p_answers);
  insert into public.biz_survey_responses(respondent, answers, updated_at, save_count)
  values (v_resp, p_answers, v_at, 1)
  on conflict (respondent) do update
     set answers = excluded.answers, updated_at = v_at,
         save_count = public.biz_survey_responses.save_count + 1;
  return jsonb_build_object('updated_at', v_at);
end $$;

--  제출 — 답을 저장하고 「제출」로 표시, 이력 한 장
create or replace function public.biz_survey_submit(p_token text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_resp text; v_at timestamptz := clock_timestamp();
begin
  v_resp := public.biz_survey_resolve(p_token);
  perform public.biz_survey_check_answers(p_answers);
  insert into public.biz_survey_responses(respondent, answers, status, updated_at, first_submitted_at, submitted_at, save_count)
  values (v_resp, p_answers, 'submitted', v_at, v_at, v_at, 1)
  on conflict (respondent) do update
     set answers = excluded.answers, status = 'submitted', updated_at = v_at,
         first_submitted_at = coalesce(public.biz_survey_responses.first_submitted_at, v_at),
         submitted_at = v_at,
         save_count = public.biz_survey_responses.save_count + 1;
  insert into public.biz_survey_revisions(respondent, answers, submitted_at) values (v_resp, p_answers, v_at);
  return jsonb_build_object('updated_at', v_at, 'submitted_at', v_at);
end $$;

revoke all on function public.biz_survey_open(text) from public;
revoke all on function public.biz_survey_save(text, jsonb) from public;
revoke all on function public.biz_survey_submit(text, jsonb) from public;
grant execute on function public.biz_survey_open(text) to anon, authenticated;
grant execute on function public.biz_survey_save(text, jsonb) to anon, authenticated;
grant execute on function public.biz_survey_submit(text, jsonb) to anon, authenticated;

-- ── 4. 관리자 함수 ────────────────────────────────────────────────────────────

--  전체 보기 — 두 분 답변 · 링크(열쇠 없이) · 제출 이력
create or replace function public.biz_survey_admin_load()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.biz_survey_is_admin() then
    raise exception '설문 관리자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'responses', coalesce((select jsonb_agg(to_jsonb(r) order by r.respondent) from public.biz_survey_responses r), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'respondent', i.respondent, 'created_at', i.created_at, 'expires_at', i.expires_at,
        'revoked_at', i.revoked_at, 'last_used_at', i.last_used_at) order by i.created_at desc)
      from public.biz_survey_invites i), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'respondent', v.respondent, 'submitted_at', v.submitted_at) order by v.submitted_at desc)
      from public.biz_survey_revisions v), '[]'::jsonb)
  );
end $$;

--  링크 만들기 — 열쇠는 이 응답에서 **한 번만** 돌려줍니다. 그 사람의 예전 링크는 폐기.
create or replace function public.biz_survey_issue_invite(p_respondent text, p_days integer default 14)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; v_id uuid; v_exp timestamptz;
begin
  if not public.biz_survey_is_admin() then
    raise exception '설문 관리자만 링크를 만들 수 있습니다.' using errcode = '42501';
  end if;
  if p_respondent not in ('ceo','director') then
    raise exception '응답자가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception '유효 기간은 1~60일입니다.' using errcode = '22023';
  end if;
  v_token := rtrim(translate(encode(gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  v_exp := now() + make_interval(days => p_days);
  update public.biz_survey_invites set revoked_at = now()
   where respondent = p_respondent and revoked_at is null;
  insert into public.biz_survey_invites(respondent, token_hash, created_by, expires_at)
  values (p_respondent, encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), v_exp)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'respondent', p_respondent, 'token', v_token, 'expires_at', v_exp);
end $$;

--  링크 폐기
create or replace function public.biz_survey_revoke_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.biz_survey_is_admin() then
    raise exception '설문 관리자만 링크를 폐기할 수 있습니다.' using errcode = '42501';
  end if;
  update public.biz_survey_invites set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

revoke all on function public.biz_survey_admin_load() from public, anon;
revoke all on function public.biz_survey_issue_invite(text, integer) from public, anon;
revoke all on function public.biz_survey_revoke_invite(uuid) from public, anon;
grant execute on function public.biz_survey_admin_load() to authenticated;
grant execute on function public.biz_survey_issue_invite(text, integer) to authenticated;
grant execute on function public.biz_survey_revoke_invite(uuid) to authenticated;

comment on table public.biz_survey_responses is
  '사업계획서 사전 설문 답변 (0144 · 임시). 대표님(ceo)·이사님(director) 각 한 줄. '
  '업무 데이터와 분리. 직접 접근 금지 — biz_survey_* 함수로만.';

-- ── 5. (선택) 설문 관리자 지정 ───────────────────────────────────────────────
--  두 분 답변을 **특정 계정만** 보게 하려면 아래 줄 앞의 -- 를 지우고 이메일을 넣어
--  실행하세요. 비워 두면 대표·관리자 역할 모두가 봅니다.
-- insert into public.biz_survey_admins(email) values ('관리자 이메일') on conflict do nothing;

-- ── 바로 확인 — 한 줄로 「표 4 · 함수 9」가 나오면 끝입니다 ──────────────────
--  (SQL Editor 는 마지막 결과 하나만 보여 줍니다 — 그래서 한 줄로 모았습니다)
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name like 'biz_survey_%') as "표 (4)",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'biz_survey_%') as "함수 (9)";
