-- ─────────────────────────────────────────────────────────────────────────────
-- 0020. 계정 권한 변경은 어느 길로 들어와도 기록에 남습니다
--
--  「사용자 관리」 화면에서 역할을 바꾸거나 계정을 중지하면 감사기록이
--  남습니다. 그런데 그 기록을 남기는 쪽이 **화면(앱)** 이었습니다. 화면을
--  거치지 않으면 아무것도 남지 않습니다.
--
--  실제로 확인했습니다. 관리자 토큰으로 이렇게 보내면
--
--    PATCH /rest/v1/profiles?id=eq.<현장 담당자>   { "active": false }   → 204
--
--  계정은 중지되는데 감사기록은 1109건 그대로였습니다. 브라우저 주소창,
--  확장 프로그램, 잘못 만든 스크립트 한 줄로도 이 길이 열립니다.
--
--  권한과 계정 상태는 "누가 언제 바꿨는가" 가 가장 중요한 자료입니다.
--  그것을 남기는 일을 화면에 맡기면, 화면을 안 쓰는 순간 남지 않습니다.
--  0015 에서 '누구' 를 서버가 정하게 한 것과 같은 이유로, '남기는 것' 자체도
--  서버가 합니다.
--
--  남기는 것 (셋 중 바뀐 것만)
--   · 역할          profile.role
--   · 사용/중지     profile.active
--   · 병원 소속     profile.client
--
--  남기지 않는 것
--   · 이름·글자 크기처럼 권한과 무관한 변경 (기록이 시끄러워지기만 합니다)
--
--  화면 쪽에서 남기던 것은 걷어냈습니다. 안 그러면 한 번 바꿀 때 같은 기록이
--  두 줄씩 쌓입니다.
--
--  적용 후에는 supabase/test/43_user_admin.mjs 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := coalesce(nullif(new.name, ''), new.email, new.id::text);
  v_old_cli text;
  v_new_cli text;
begin
  -- 역할
  if new.role is distinct from old.role then
    insert into public.audit_logs
      (action, entity, entity_id, before_data, after_data, summary, screen, source)
    values
      ('profile.role', 'profiles', new.id::text,
       jsonb_build_object('role', old.role), jsonb_build_object('role', new.role),
       format('권한 변경 — %s · %s → %s', v_name, old.role, new.role),
       'users', 'db');
  end if;

  -- 사용 / 중지
  if new.active is distinct from old.active then
    insert into public.audit_logs
      (action, entity, entity_id, before_data, after_data, summary, screen, source)
    values
      ('profile.active', 'profiles', new.id::text,
       jsonb_build_object('active', old.active), jsonb_build_object('active', new.active),
       format('계정 %s — %s', case when new.active then '사용' else '중지' end, v_name),
       'users', 'db');
  end if;

  -- 병원 소속
  if new.client_id is distinct from old.client_id then
    select name into v_old_cli from public.clients where id = old.client_id;
    select name into v_new_cli from public.clients where id = new.client_id;
    insert into public.audit_logs
      (action, entity, entity_id, client_id, client_name,
       before_data, after_data, summary, screen, source)
    values
      ('profile.client', 'profiles', new.id::text, new.client_id, coalesce(v_new_cli, ''),
       jsonb_build_object('clientId', old.client_id), jsonb_build_object('clientId', new.client_id),
       format('병원 계정 소속 변경 — %s · %s → %s',
              v_name, coalesce(v_old_cli, '없음'), coalesce(v_new_cli, '없음')),
       'users', 'db');
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_audit_change on public.profiles;
create trigger profiles_audit_change
  after update on public.profiles
  for each row execute function public.audit_profile_change();

comment on function public.audit_profile_change() is
  '계정의 역할·사용여부·병원소속이 바뀌면 어느 경로로 들어왔든 감사기록을 남깁니다 (0020).';
