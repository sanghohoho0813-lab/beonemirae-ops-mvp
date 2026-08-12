-- ─────────────────────────────────────────────────────────────────────────────
-- 0022. 개발자에게 요청하기
--
--  쓰는 사람이 불편한 것을 말할 자리가 없었습니다. 지금은 현장에서 무엇이
--  안 맞으면 대표님께 전화하고, 대표님이 그것을 모아 두었다가 개발자에게
--  전달합니다. 중간에서 빠지는 것이 생기고, 언제 말한 것인지도 남지 않습니다.
--
--  화면 안에 요청함을 둡니다. 누가 언제 무엇을 요청했는지 그대로 쌓이고,
--  관리자는 한 화면에서 전부 봅니다.
--
--  ── 왜 객관식인가 ───────────────────────────────────────────────────────
--
--  빈 칸만 주면 대부분 아무것도 쓰지 않습니다. 쓰더라도 "불편해요" 같은
--  말이 남아 무엇을 고쳐야 하는지 알 수 없습니다. 그래서 **역할마다 다섯
--  가지**를 미리 적어 두고 고르게 합니다.
--
--  고르는 항목은 한 번 고치면 끝나는 것이 아니라, 앞으로도 계속 확인해야
--  하는 것들로 골랐습니다 — 거래처 정보가 실제와 맞는가, 청구가 엑셀과
--  맞는가, 반복 입력이 남아 있는가. 이런 것은 사람이 바뀌고 거래처가 늘면
--  다시 어긋납니다. 분기에 한 번씩 눌러 보는 점검표로 쓸 수 있습니다.
--
--  고른 항목(topics)은 무엇을 골랐는지 그대로 저장합니다. 화면의 문구가
--  나중에 바뀌어도 예전 요청이 무슨 뜻이었는지 남아야 하기 때문입니다.
--  자유 의견(message)은 따로 받습니다 — 목록에 없는 것이 늘 있습니다.
--
--  ── 누가 요청했는지는 서버가 정합니다 ───────────────────────────────────
--
--  0015 와 같은 이유입니다. 보내는 쪽이 이름을 적어 보내면 남의 이름으로
--  요청을 넣을 수 있습니다. 요청함은 "누가 무엇을 필요로 하는가"가 전부인
--  자료라, 그 이름이 틀리면 자료 자체가 쓸모없어집니다.
--
--  적용 후에는 supabase/test/05_dev_requests.sql 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.dev_requests (
  id             uuid primary key default gen_random_uuid(),
  --  요청한 사람 — 아래 트리거가 서버에서 채웁니다. 보내는 값은 무시합니다.
  requester_id   uuid not null references public.profiles(id) on delete cascade,
  requester_name text not null default '',
  requester_role public.user_role not null,
  --  고른 항목. 화면 문구가 바뀌어도 뜻이 남도록 문구 그대로 저장합니다.
  topics         text[] not null default '{}',
  --  자유 의견
  message        text not null default '',
  --  관리자가 처리 상태를 바꿉니다
  status         text not null default '접수'
                 check (status in ('접수', '확인', '처리 완료', '보류')),
  admin_note     text not null default '',
  handled_at     timestamptz,
  handled_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  --  아무것도 고르지 않고 아무것도 쓰지 않은 요청은 받지 않습니다.
  --  받아 두면 요청함에 빈 줄이 쌓이고, 관리자는 그것도 하나씩 열어 봐야 합니다.
  constraint dev_requests_not_empty
    check (cardinality(topics) > 0 or btrim(message) <> '')
);

create trigger dev_requests_touch before update on public.dev_requests
  for each row execute function public.touch_updated_at();

create index if not exists dev_requests_recent_idx
  on public.dev_requests (created_at desc);
create index if not exists dev_requests_open_idx
  on public.dev_requests (created_at desc) where status <> '처리 완료';

-- ── 요청자는 서버가 정합니다 (0015 와 같은 이유) ────────────────────────────
create or replace function public.stamp_dev_requester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles%rowtype;
begin
  if auth.uid() is null then
    --  로그인 세션이 없는 경로(service_role·검증 스크립트)는 건드리지 않습니다.
    return new;
  end if;

  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '요청을 보낼 수 없는 계정입니다.' using errcode = 'P0001';
  end if;

  new.requester_id   := v_actor.id;
  new.requester_name := coalesce(nullif(v_actor.name, ''), v_actor.email);
  new.requester_role := v_actor.role;
  return new;
end;
$$;

drop trigger if exists dev_requests_stamp_requester on public.dev_requests;
create trigger dev_requests_stamp_requester
  before insert on public.dev_requests
  for each row execute function public.stamp_dev_requester();

-- ── 처리한 사람·시각도 서버가 남깁니다 ──────────────────────────────────────
create or replace function public.stamp_dev_handler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  --  상태가 실제로 바뀐 경우에만 남깁니다. 관리자 메모만 고쳤을 때
  --  처리 시각이 갱신되면 "언제 처리했는가"가 흐려집니다.
  if new.status is distinct from old.status then
    new.handled_by := auth.uid();
    new.handled_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists dev_requests_stamp_handler on public.dev_requests;
create trigger dev_requests_stamp_handler
  before update on public.dev_requests
  for each row execute function public.stamp_dev_handler();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.dev_requests enable row level security;

--  보내기 — 로그인한 내부 직원이면 누구나. 현장 담당자가 주 사용자입니다.
--  (병원 계정은 제외합니다. 병원의 요청은 포털의 「병원 요청」으로 들어옵니다)
create policy dev_requests_insert on public.dev_requests
  for insert with check (public.is_active_user());

--  읽기 — 관리자는 전부, 나머지는 자기가 보낸 것만.
--
--  자기 것을 볼 수 있어야 하는 이유: 보내고 나서 아무 흔적이 없으면 갔는지
--  안 갔는지 알 수 없어 같은 요청을 또 보냅니다. 관리자가 상태를 바꾸면
--  보낸 사람도 그것을 봅니다.
create policy dev_requests_select on public.dev_requests
  for select using (public.is_admin() or requester_id = auth.uid());

--  상태 변경 — 관리자만.
create policy dev_requests_update on public.dev_requests
  for update using (public.is_admin()) with check (public.is_admin());

--  삭제 정책은 만들지 않습니다 = 아무도 지울 수 없습니다.
--  요청을 지울 수 있으면 불편했다는 기록이 사라집니다. 처리가 끝난 것은
--  '처리 완료'로 두면 목록에서 내려갑니다.

grant select, insert on public.dev_requests to authenticated;
grant update (status, admin_note) on public.dev_requests to authenticated;

comment on table public.dev_requests is
  '개발자에게 보내는 요청 — 역할별 점검 항목 + 자유 의견 (0022).';
