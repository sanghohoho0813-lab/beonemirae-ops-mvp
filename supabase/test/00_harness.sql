-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase 호환 테스트 하네스
--
--  Supabase 호스팅 인스턴스 없이도 migration 과 RLS 를 "진짜 PostgreSQL"에서
--  실행·검증하기 위한 최소 환경입니다. Supabase 가 기본 제공하는 것 중
--  이 프로젝트가 실제로 사용하는 것만 재현합니다.
--
--    · auth 스키마와 auth.users 테이블
--    · auth.uid()  — request.jwt.claims 의 sub 를 읽는 방식(Supabase 와 동일)
--    · anon / authenticated / service_role 롤
--
--  주의: 이 파일은 Supabase 실제 프로젝트에는 적용하지 않습니다(이미 존재).
--        로컬 검증 전용입니다.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists auth;

create table if not exists auth.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique not null,
  encrypted_password   text,
  raw_user_meta_data   jsonb default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

-- Supabase 와 동일하게 JWT 클레임의 sub 를 현재 사용자 id 로 사용합니다.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', 'anon')
$$;

-- PostgREST 가 사용하는 롤들
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
