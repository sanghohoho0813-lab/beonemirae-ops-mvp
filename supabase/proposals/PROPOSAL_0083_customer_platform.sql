-- ════════════════════════════════════════════════════════════════════════════
-- 0083 — 고객 포털 1차 고도화 (문의 · 포털 접속 기록)
--
--  대표님: 「거래처가 직접 로그인해 쓰는 Customer Platform 구조를 추가하고,
--  향후 고객 데이터를 활용한 AI Growth Engine 으로 확장할 기반을 만들어라.
--  ⚠ 불필요한 테이블을 많이 만드는 것도 금지한다.」
--
--  ── 그래서 표를 **두 개만** 건드립니다 ────────────────────────────────────
--
--   브리프에는 customer_users · service_requests · material_requests ·
--   customer_inquiries · customer_notifications · customer_activity ·
--   customer_health_scores · monthly_reports 가 예로 적혀 있습니다.
--   그런데 실제 코드를 열어 보니 **여덟 중 여섯이 이미 있습니다.**
--
--     customer_users        → profiles.client_id + role='client'   (0006)
--     service_requests      → client_requests                      (0006)
--     material_requests     → client_requests(kind='소모품')·product_orders
--     customer_notifications→ 새 표를 안 만듭니다 (아래 ⚠ 참고)
--     customer_activity     → 아래 ② 한 칸으로 충분합니다
--     customer_health_scores→ 표가 아니라 **계산**입니다 (lib/customerHealth.ts)
--     monthly_reports       → schedules·materials 에서 그때그때 계산합니다
--
--   같은 뜻의 표를 하나 더 만들면 어느 쪽이 진짜인지 알 수 없게 됩니다.
--   그래서 **정말 없는 것 두 가지**만 더합니다.
--
--  ⚠ 알림센터에 표를 안 만든 이유 —
--    알림은 「내일 수거 예정」·「요청이 승인됐습니다」·「미납이 있습니다」
--    처럼 **이미 있는 자료에서 그대로 나오는 말**입니다. 표를 따로 두면
--    일정이 바뀌었는데 알림은 옛말을 하고 있는 어긋남이 반드시 생깁니다.
--    화면에서 그때그때 만들어 보여 줍니다 — 지어낸 알림이 없습니다.
--
--  ⚠ 건강도에 표를 안 만든 이유 —
--    점수는 수거·미수·요청 기록에서 나오는 **파생값**입니다. 저장해 두면
--    원자료가 바뀌어도 점수가 안 따라갑니다. 규칙은 lib 한 곳에 두고,
--    나중에 AI 로 바꿀 때도 그 한 곳만 갈아 끼웁니다.
--
--  ⚠ 기존 것은 **아무것도 안 지우고 안 바꿉니다.** RLS·권한·정산·재고
--    그대로입니다. 이 파일은 더하기만 합니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 고객 문의 (티켓) ──────────────────────────────────────────────────────
--
--   대표님: 「완전한 채팅 시스템을 만들 필요는 없다. 티켓 방식의 간단한
--   문의관리 구조면 충분하다.」
--
--   ⚠ client_requests 에 얹지 않았습니다. 저쪽은 「수거를 해 달라」는
--     **작업 지시**라 일정·배차로 이어집니다. 문의는 「이건 어떻게 되나요」
--     라는 **대화**입니다. 한 표에 섞으면 요청함에 질문이 쌓여서 정작
--     오늘 나가야 할 수거가 묻힙니다.
create table if not exists public.client_inquiries (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  --  문의 유형 — 병원이 고르는 말 그대로입니다.
  topic       text not null check (topic in ('수거 일정','자재','정산','긴급수거','계약','기타')),
  subject     text not null default '',
  body        text not null default '',
  --  접수 → 확인 중 → 답변 완료. client_requests 와 **같은 결**로 맞췄습니다.
  status      text not null default '접수' check (status in ('접수','확인 중','답변 완료')),
  reply       text not null default '',
  asked_by_name text not null default '',
  handled_by  uuid references public.profiles(id),
  handled_at  timestamptz,
  demo_session_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);

drop trigger if exists client_inquiries_touch on public.client_inquiries;
create trigger client_inquiries_touch before update on public.client_inquiries
  for each row execute function public.touch_updated_at();

create index if not exists client_inquiries_client_idx
  on public.client_inquiries(client_id, created_at desc);
create index if not exists client_inquiries_open_idx
  on public.client_inquiries(status) where status <> '답변 완료';

alter table public.client_inquiries enable row level security;

--  비원미래 직원 — 전부 보고, 답합니다.
drop policy if exists client_inquiries_staff_read on public.client_inquiries;
create policy client_inquiries_staff_read on public.client_inquiries
  for select using (public.is_active_user());
drop policy if exists client_inquiries_staff_write on public.client_inquiries;
create policy client_inquiries_staff_write on public.client_inquiries
  for insert with check (public.is_active_user());
drop policy if exists client_inquiries_staff_update on public.client_inquiries;
create policy client_inquiries_staff_update on public.client_inquiries
  for update using (public.is_staff()) with check (public.is_staff());

--  병원 계정 — **자기 병원 것만** 보고, 자기 병원 것만 올립니다.
--  ⚠ 0006 의 client_requests 와 **똑같은 모양**으로 씁니다. 표마다 다른
--    방식으로 막으면 언젠가 한 곳이 헐거워집니다.
drop policy if exists client_inquiries_client_read on public.client_inquiries;
create policy client_inquiries_client_read on public.client_inquiries
  for select using (public.is_client_user() and client_id = public.auth_client_id());
drop policy if exists client_inquiries_client_write on public.client_inquiries;
create policy client_inquiries_client_write on public.client_inquiries
  for insert with check (
    public.is_client_user()
    and client_id = public.auth_client_id()
    and status = '접수'
    and reply = ''
  );
--  ⚠ 병원은 **고칠 수 없습니다.** 올린 뒤에는 비원미래가 답하는 자리입니다.
--    지우는 것도 없습니다 — 기록은 남습니다.

-- ── ② 포털에 마지막으로 들어온 때 ───────────────────────────────────────────
--
--   대표님: 「거래처 상세에 최근 포털 접속을 넣어라. 단, 실제 데이터를
--   확보할 수 있는 항목만 사용한다.」
--
--   그래서 **실제로 남길 수 있게** 칸 하나를 만듭니다. 이 칸이 없으면
--   화면에 「최근 접속」을 그럴듯하게 적을 수는 있어도 그건 지어낸 값입니다.
alter table public.profiles
  add column if not exists last_portal_seen_at timestamptz;

--  포털을 열 때 본인 것만 찍습니다.
--  ⚠ update 정책을 여는 대신 함수로 둡니다 — 병원 계정이 자기 프로필의
--    role 이나 client_id 까지 고칠 수 있게 되면 안 됩니다.
create or replace function public.touch_portal_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_now timestamptz := now();
begin
  if not public.is_client_user() then
    --  직원이 확인용으로 포털을 열어 본 것까지 「병원이 들어왔다」로
    --  세면 안 됩니다. 조용히 아무것도 안 합니다.
    return null;
  end if;
  update public.profiles set last_portal_seen_at = v_now where id = auth.uid();
  return v_now;
end $$;

revoke all on function public.touch_portal_seen() from public;
grant execute on function public.touch_portal_seen() to authenticated;

-- ── ③ 문의에 답하기 ─────────────────────────────────────────────────────────
--
--   ⚠ 화면에서 직접 update 하게 두지 않고 함수로 묶습니다. 그래야
--     「누가 언제 답했는지」가 반드시 같이 남습니다.
create or replace function public.answer_inquiry(
  p_id     uuid,
  p_status text,
  p_reply  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception '사무실·관리자만 문의에 답할 수 있습니다.';
  end if;
  if p_status not in ('접수','확인 중','답변 완료') then
    raise exception '알 수 없는 상태입니다: %', p_status;
  end if;
  update public.client_inquiries
     set status     = p_status,
         reply      = coalesce(p_reply, reply),
         handled_by = auth.uid(),
         handled_at = now()
   where id = p_id;
  if not found then
    raise exception '문의를 찾을 수 없습니다.';
  end if;
end $$;

revoke all on function public.answer_inquiry(uuid, text, text) from public;
grant execute on function public.answer_inquiry(uuid, text, text) to authenticated;

-- ── 판(schema) 번호 ─────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 83 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   ① 0 이어야 합니다 (아직 문의가 없습니다 — 지어낸 자료가 없습니다)
--   ② true 여야 합니다 (칸이 생겼는지)
--   ③ 83 이어야 합니다
select count(*) as "문의 수" from public.client_inquiries;
select exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name = 'last_portal_seen_at'
) as "포털 접속 칸 생김";
select public.app_schema_version() as "판 번호";
