-- ─────────────────────────────────────────────────────────────────────────────
-- 0015. 감사기록의 '누가' 를 서버가 정합니다
--
--  화면(감사로그)에는 이렇게 적혀 있습니다.
--
--    "감사로그는 수정·삭제할 수 없습니다 (관리자도 동일)"
--
--  실제로 확인해 보니 수정·삭제는 정말 막혀 있었습니다(403). 그런데 새로
--  써 넣는 것은 막혀 있지 않았고, 그때 '누가 했는지'를 클라이언트가 보낸
--  값 그대로 저장하고 있었습니다.
--
--  그래서 현장 담당자 계정으로 이런 요청을 보내면
--
--    POST /rest/v1/audit_logs
--    { "actor_id": "<관리자 uuid>", "actor_name": "검증 관리자",
--      "actor_role": "admin", "action": "collection.complete", ... }
--
--  대표님 이름으로 된 기록이 그대로 남았습니다(201). 실제로 재현했습니다.
--  감사로그는 "누가 무엇을 했는가"가 전부인 자료입니다. 돈이나 폐기물 처리
--  책임을 두고 다툼이 생겼을 때 이 기록을 근거로 쓸 수 없게 됩니다.
--
--  고치는 방법
--   · 로그인한 사용자가 있으면 actor_id / actor_name / actor_role 을
--     그 사람의 profiles 값으로 덮어씁니다. 클라이언트가 무엇을 보내든
--     '누가' 는 서버가 정합니다.
--   · auth.uid() 가 없는 경로(서버 배치·검증 스크립트의 service_role)는
--     그대로 둡니다. 그쪽은 이미 서버를 신뢰하는 자리입니다.
--
--  나머지 칸(action·summary·before·after 등)은 그대로 둡니다. 무엇을 했는지는
--  부르는 쪽만 알기 때문입니다. 중요한 것은 '누가' 를 속일 수 없게 하는 것입니다.
--
--  적용 후에는 supabase/test/34_audit_integrity.mjs 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles%rowtype;
begin
  if auth.uid() is null then
    -- 로그인 세션이 없는 경로(service_role 등)는 건드리지 않습니다.
    return new;
  end if;

  select * into v_actor from profiles where id = auth.uid();
  if not found then
    -- 프로필이 없는 사용자는 '누구' 를 특정할 수 없으므로 기록을 남기지 못합니다.
    raise exception '감사기록을 남길 수 없는 계정입니다.' using errcode = 'P0001';
  end if;

  new.actor_id   := v_actor.id;
  new.actor_name := v_actor.name;
  new.actor_role := v_actor.role;
  return new;
end;
$$;

drop trigger if exists audit_logs_stamp_actor on public.audit_logs;
create trigger audit_logs_stamp_actor
  before insert on public.audit_logs
  for each row execute function public.stamp_audit_actor();
