-- ─────────────────────────────────────────────────────────────────────────────
-- 0010. 병원 요청 처리자 자동 기록
--
--  실제 계정으로 병원 요청 왕복(병원 등록 → 사무실 처리 → 병원 확인)을 돌려 보니,
--  화면에서 상태를 바꾸거나 회신을 남겨도 client_requests.handled_by 가 비어
--  있었습니다. handled_at(언제)은 남는데 handled_by(누가)는 남지 않습니다.
--
--  같은 컬럼이 수거 완료 자동처리(complete_collection)에서는 채워지므로,
--  "자동으로 닫힌 요청은 처리자가 있고 사람이 처리한 요청은 없는" 상태였습니다.
--  병원과 주고받은 기록은 실사 자료로 쓰이므로 담당자가 비어 있으면 곤란합니다.
--
--  규칙
--    · 상태나 회신이 바뀔 때, 직원(admin·office·field)이 한 변경이면 기록합니다.
--    · 병원 계정이 자기 요청을 고치는 것은 '처리'가 아니므로 기록하지 않습니다.
--    · 상태를 '접수'로 되돌리는 경우(수거 취소 시 요청 재오픈)는 그대로 비웁니다.
--
--  0009 의 stamp_actor 는 created_by/updated_by 전용이라 이 컬럼은 다루지 않습니다.
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

  -- '접수'로 되돌리는 것은 처리 취소입니다 — 호출자가 넣은 값을 그대로 둡니다.
  if new.status = '접수' then
    return new;
  end if;

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

drop trigger if exists client_requests_stamp_handler on public.client_requests;
create trigger client_requests_stamp_handler
  before update on public.client_requests
  for each row execute function public.stamp_request_handler();
