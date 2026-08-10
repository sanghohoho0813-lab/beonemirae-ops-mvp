-- ─────────────────────────────────────────────────────────────────────────────
-- 0016. 아무도 들어올 수 없게 되는 것을 막습니다
--
--  사용자 관리 화면은 자기 계정을 중지하지 못하게 막고 있습니다. 그런데
--  화면만 막혀 있었고 서버는 막지 않았습니다. 실제로 재현했습니다.
--
--    PATCH /rest/v1/profiles?id=eq.<본인 uuid>   { "active": false }   → 200
--    PATCH /rest/v1/profiles?id=eq.<본인 uuid>   { "role": "office" }  → 200
--
--  지금 이 시스템의 관리자는 한 명입니다. 그 한 명이 위 두 가지 중 하나를
--  하면, 계정을 관리할 수 있는 사람이 아무도 남지 않습니다. 사용자 추가도,
--  역할 변경도, 설정도 전부 관리자 전용이기 때문입니다. 그 뒤로는 Supabase
--  service 키를 쥔 사람이 DB 를 직접 고쳐야 풀립니다.
--
--  화면 조작 실수로는 잘 안 나지만, 브라우저 주소창이나 확장 프로그램,
--  잘못 만든 스크립트 한 줄로도 날 수 있는 종류입니다. 그리고 한 번 나면
--  대표님이 스스로 복구할 방법이 없습니다.
--
--  막는 것 세 가지
--   1) 자기 계정을 스스로 중지하는 것
--   2) 마지막 남은 관리자를 중지하는 것
--   3) 마지막 남은 관리자의 역할을 관리자가 아닌 것으로 바꾸는 것
--
--  막지 않는 것
--   · 관리자가 두 명 이상이면 서로를 중지하거나 역할을 바꿀 수 있습니다.
--   · auth.uid() 가 없는 경로(service_role)는 그대로 둡니다. 잠긴 상태를
--     푸는 유일한 열쇠가 그쪽이므로 그 문까지 잠그면 안 됩니다.
--
--  적용 후에는 supabase/test/37_admin_lockout.mjs 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_admin_lockout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_admins integer;
begin
  -- service_role 등 로그인 세션이 없는 경로는 건드리지 않습니다.
  -- (잠긴 계정을 되살리는 길이 여기뿐입니다)
  if auth.uid() is null then
    return new;
  end if;

  -- 1. 자기 계정을 스스로 중지
  if old.active and not new.active and new.id = auth.uid() then
    raise exception '자기 계정은 중지할 수 없습니다. 다른 관리자에게 요청해 주세요.'
      using errcode = 'P0001';
  end if;

  -- 살아 있는 관리자 수 (지금 바꾸려는 이 줄은 아직 예전 값입니다)
  select count(*) into v_active_admins
    from profiles where role = 'admin' and active;

  -- 2. 마지막 남은 관리자를 중지
  if old.role = 'admin' and old.active and not new.active and v_active_admins <= 1 then
    raise exception '관리자가 한 명뿐입니다. 다른 관리자를 먼저 지정한 뒤에 중지해 주세요.'
      using errcode = 'P0001';
  end if;

  -- 3. 마지막 남은 관리자의 역할을 내림
  if old.role = 'admin' and old.active and new.role <> 'admin' and v_active_admins <= 1 then
    raise exception '관리자가 한 명뿐입니다. 다른 관리자를 먼저 지정한 뒤에 역할을 바꿔 주세요.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_admin_lockout on public.profiles;
create trigger profiles_guard_admin_lockout
  before update on public.profiles
  for each row execute function public.guard_admin_lockout();
