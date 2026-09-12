-- ════════════════════════════════════════════════════════════════════════════
-- 0108 — AX Coach 발행 이력
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. 지우는 것 없습니다.
--     기존 표·행·정책은 그대로이고, **표 하나**를 더할 뿐입니다.
--
--  ── 왜 이 표만 필요한가 ────────────────────────────────────────────────
--
--   AX Coach 가 보여 주는 숫자(실증 자료 준비도 · 7·14일 리포트)는 전부
--   **이미 있는 기록**으로 그 자리에서 계산합니다 — 수거 이벤트 · 일정 ·
--   포털 요청 · 주문 · 청구 · 입금 · 자재 · 마감. 그래서 그 값들을 다시
--   저장하는 표는 만들지 않습니다. 같은 뜻의 값을 두 곳에 두면 언젠가
--   두 숫자가 갈라집니다 (AX_EVIDENCE_ROADMAP.md 규칙 5).
--
--   다만 **「언제 · 누구에게 · 어떤 일이 발행됐는가」는 업무 데이터 어디에도
--   없는 새 사실**입니다. 그것만 남깁니다.
--
--   verified_at 도 **판정의 근거가 아닙니다.** 화면은 열 때마다 실제 업무
--   기록으로 다시 확인합니다. 이 칸은 「그때 무엇을 보고 확인했나」를
--   되짚기 위한 메모라, 지워져도 화면의 판정은 바뀌지 않습니다.
--
--   ⚠ 이 표가 없어도 AX Coach 는 그대로 돌아갑니다. 그때는 「오늘 0시부터」를
--     기준으로 확인하고, 화면에 「발행 이력 표가 아직 없습니다」라고 적습니다.
--
--  ── 순서 ──────────────────────────────────────────────────────────────
--   PROPOSAL_0106_evidence.sql 이 먼저 실행돼 있어야 합니다 (판 106).
--   아래 첫 블록이 확인하고, 아니면 아무것도 바꾸지 않고 멈춥니다.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare v integer;
begin
  begin
    select public.app_schema_version() into v;
  exception when undefined_function then
    v := 0;
  end;
  if v < 106 then
    raise exception '먼저 PROPOSAL_0106_evidence.sql 을 실행해 주세요 (지금 판 %, 필요 106). 아무것도 바꾸지 않았습니다.', v;
  end if;
end $$;

-- ── AX Coach 발행 이력 ──────────────────────────────────────────────────────
create table if not exists public.ax_coach_missions (
  id            uuid primary key default gen_random_uuid(),
  --  어떤 일인가 (collect-today · portal-request · order-deliver …)
  mission_key   text not null,
  evidence_area text not null check (evidence_area in ('work','sales','capacity','customer')),
  --  발행한 날 — 한국 시간 기준. 하루 한 번만 발행됩니다.
  issued_on     date not null default (now() at time zone 'Asia/Seoul')::date,
  issued_at     timestamptz not null default now(),
  issued_by     uuid not null default auth.uid() references public.profiles(id),
  issued_name   text not null default '',
  issued_role   text not null default '',
  --  대상이 정해진 일이면 그 **기존 기록**의 id (수거 일정 · 주문 · 청구 ·
  --  거래처). 값을 복사해 오지 않고 가리키기만 합니다.
  target_id     text,
  --  실제 업무 기록이 확인된 시각과 무엇으로 확인했는지 (메모)
  verified_at   timestamptz,
  verified_what text not null default '',
  created_at    timestamptz not null default now()
);

--  같은 사람에게 같은 날 같은 일이 두 번 발행되지 않게 — 리포트의 「발행 N건」이
--  화면을 여러 번 열었다는 뜻이 되면 안 됩니다.
create unique index if not exists ax_coach_missions_once
  on public.ax_coach_missions(mission_key, issued_on, issued_by);
create index if not exists ax_coach_missions_on_idx
  on public.ax_coach_missions(issued_on desc);

alter table public.ax_coach_missions enable row level security;

--  직원은 전부 봅니다 — 「오늘 누가 무엇을 받았나」가 팀의 기록입니다.
drop policy if exists ax_coach_missions_select on public.ax_coach_missions;
create policy ax_coach_missions_select on public.ax_coach_missions
  for select using (public.is_staff());

--  발행은 **본인 것만**. 남의 이름으로 받은 것처럼 남길 수 없습니다.
drop policy if exists ax_coach_missions_insert on public.ax_coach_missions;
create policy ax_coach_missions_insert on public.ax_coach_missions
  for insert with check (
    issued_by = auth.uid() and public.auth_role() in ('admin','office','field')
  );

--  확인 메모는 직원이 적습니다 (화면이 실제 기록을 확인한 뒤 자동으로).
drop policy if exists ax_coach_missions_update on public.ax_coach_missions;
create policy ax_coach_missions_update on public.ax_coach_missions
  for update using (public.is_staff()) with check (public.is_staff());

--  삭제 정책 없음 = 발행 기록은 지워지지 않습니다.
grant select, insert on public.ax_coach_missions to authenticated;
grant update (verified_at, verified_what) on public.ax_coach_missions to authenticated;

comment on table public.ax_coach_missions is
  'AX Coach 발행 이력 (0108). 언제·누구에게·어떤 일이 발행됐고 무엇으로 확인됐는지만 남깁니다. '
  '수거·주문·입금 등 업무 데이터는 복사하지 않고 target_id 로 가리키기만 하며, '
  '완료 판정은 이 표가 아니라 실제 업무 기록으로 매번 다시 합니다.';

-- ── 판 번호 ──────────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 108 $$;

-- ── 바로 확인 — 아래가 각각 1 · 108 · 1 이어야 합니다 ────────────────────
select count(*) as "새 표 1개" from information_schema.tables
 where table_schema='public' and table_name='ax_coach_missions';
select public.app_schema_version() as "판 번호";
select count(*) as "하루 한 번 색인 1개" from pg_indexes
 where schemaname='public' and indexname='ax_coach_missions_once';
