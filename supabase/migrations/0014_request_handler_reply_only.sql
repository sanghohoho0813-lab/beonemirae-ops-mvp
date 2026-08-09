-- ─────────────────────────────────────────────────────────────────────────────
-- 0014. 회신만 남겼을 때도 처리자를 기록 — 0010 의 조건이 너무 넓었습니다
--
--  실제 화면으로 포털 왕복(병원 요청 → 사무실 회신 → 병원 확인)을 밟다 찾았습니다.
--
--  사무실이 상태를 그대로 두고 회신만 남기면 handled_by · handled_at 이
--  비어 있습니다. 상태까지 함께 바꾸면 기록됩니다.
--
--    접수 상태에서 회신만  →  handled_by 비어 있음   ← 문제
--    상태를 '확인 중'으로   →  handled_by 기록됨
--
--  0010 은 "상태를 '접수'로 되돌리는 것은 처리 취소이므로 기록하지 않는다"는
--  뜻으로 이렇게 썼습니다.
--
--      if new.status = '접수' then return new; end if;
--
--  그런데 이 조건은 "원래 접수였고 앞으로도 접수인" 정상 경로까지 함께
--  걸러 냅니다. 사무실이 상태를 옮기기 전에 답부터 적는 것은 흔한 순서이고,
--  그것도 엄연한 처리입니다.
--
--  병원과 주고받은 기록은 실사 자료로 씁니다. "누가 답했는지 모르는 회신"이
--  남으면 그 자료의 값이 떨어집니다.
--
--  고칩니다 — 걸러 내야 하는 것은 '접수 상태'가 아니라 '접수로 되돌리는 변화'
--  입니다. 상태가 실제로 '접수'로 바뀐 경우에만 건너뜁니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_request_handler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role  public.user_role;
begin
  if v_actor is null then
    return new;
  end if;

  -- 처리 취소 — 다른 상태에서 '접수'로 되돌리는 경우입니다.
  -- (수거를 취소하면 닫혔던 요청이 다시 열립니다)
  -- 0014: 예전에는 new.status = '접수' 만 봐서, 접수 상태 그대로 회신만
  --       남기는 정상 경로까지 함께 걸러 냈습니다.
  if new.status = '접수' and old.status is distinct from '접수' then
    return new;
  end if;

  -- 상태도 회신도 그대로면 처리로 볼 것이 없습니다.
  if new.status is not distinct from old.status
     and new.reply is not distinct from old.reply then
    return new;
  end if;

  select role into v_role from public.profiles where id = v_actor and active;
  if v_role is null or v_role = 'client' then
    return new;
  end if;

  new.handled_by := v_actor;
  new.handled_at := coalesce(new.handled_at, now());
  return new;
end;
$$;

comment on function public.stamp_request_handler() is
  '병원 요청의 처리자·처리시각 자동 기록. 상태 변경뿐 아니라 회신만 남긴 경우도 처리로 봅니다 (0014). 접수로 되돌리는 처리 취소만 예외입니다.';
