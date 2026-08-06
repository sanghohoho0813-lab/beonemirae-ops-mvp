-- ─────────────────────────────────────────────────────────────────────────────
-- PostgREST 롤 권한
--
--  Supabase 는 public 스키마에 default privileges 가 설정되어 있어 대개
--  자동으로 부여되지만, 프로젝트 설정에 의존하지 않도록 명시적으로 부여합니다.
--
--  실제 접근 제어는 RLS(0002_rls.sql)가 담당합니다. 여기서는 "테이블에 말을
--  걸 수 있는지"만 열어 주고, "무엇을 볼 수 있는지"는 정책이 결정합니다.
--
--  anon(비로그인)에게는 아무 권한도 주지 않습니다 — 로그인해야만 운영 데이터에
--  접근할 수 있어야 하기 때문입니다.
-- ─────────────────────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated, service_role;

-- 로그인 사용자: 테이블 접근 가능(단, 행 단위 제한은 RLS 가 적용)
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 서버 전용 롤
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 감사로그는 기록만 가능하고 수정·삭제는 아무도 할 수 없습니다.
-- (RLS 에 update/delete 정책이 없고, 여기서 권한 자체도 회수합니다)
revoke update, delete on public.audit_logs from authenticated;

-- 비로그인(anon)은 어떤 운영 테이블에도 접근할 수 없습니다.
revoke all on all tables in schema public from anon;

-- 이후 추가되는 테이블에도 동일하게 적용
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
