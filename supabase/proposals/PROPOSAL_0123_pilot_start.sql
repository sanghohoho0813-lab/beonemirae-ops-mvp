-- ════════════════════════════════════════════════════════════════════════════
-- 0123 — Pilot 시작일 한 칸 (기존 실증 시작일과 **따로**)
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. 지우는 것 없습니다.
--     DROP · TRUNCATE · DELETE · 기존 칸 변경 없음. **칸 하나**를 더할 뿐입니다.
--
--  ── 왜 따로 두나 ────────────────────────────────────────────────────────
--
--   experiment_settings.start_date (지금 2026-08-29) 는 **기존 성과 화면**이
--   쓰고 있습니다. 그 날짜로 「도입 후 / 연습 입력」을 가르기 때문에, 이 값을
--   옮기면 지금까지 쌓인 기록의 분류가 통째로 바뀝니다.
--
--   이번 Pilot 은 9월 16일부터 셉니다. 그래서 **읽는 곳이 다른 칸**을 하나
--   더합니다. 기존 start_date 는 이 SQL 이 **읽지도 쓰지도 않습니다.**
--
--   experiment_settings.pilot_start_date  date  (없으면 Pilot 집계는
--   「시작일 미설정 — 오늘 하루만」으로 표시하고 임의 기간을 만들지 않습니다)
--
--  ── 이 SQL 을 안 돌리면 ───────────────────────────────────────────────
--   앱은 그대로 돌고, 성과 화면의 Pilot 카드가 「Pilot 시작일이 아직
--   없습니다」라고 적으며 오늘 하루만 셉니다. 기존 성과 화면은 영향 없습니다.
--
--  ── 순서 ──────────────────────────────────────────────────────────────
--   PROPOSAL_0122_pilot_clients.sql 이 먼저 실행돼 있어야 합니다 (판 122).
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare v integer;
begin
  begin
    select public.app_schema_version() into v;
  exception when undefined_function then
    v := 0;
  end;
  if v < 122 then
    raise exception '먼저 PROPOSAL_0122_pilot_clients.sql 을 실행해 주세요 (지금 판 %, 필요 122). 아무것도 바꾸지 않았습니다.', v;
  end if;
end $$;

-- ── ① 칸 하나 ─────────────────────────────────────────────────────────────
alter table public.experiment_settings
  add column if not exists pilot_start_date date;

comment on column public.experiment_settings.pilot_start_date is
  '이번 Pilot 집계 시작일 (0123). 기존 start_date(실증 시작일, 성과 화면이 쓰는 값)와 별개이며 서로 덮어쓰지 않습니다.';

-- ── ② 이번 Pilot 시작일 — 2026-09-16 ──────────────────────────────────────
--   ⚠ 이미 값이 들어 있으면 덮어쓰지 않습니다. start_date 는 건드리지 않습니다.
update public.experiment_settings
   set pilot_start_date = date '2026-09-16'
 where id = 1
   and pilot_start_date is null;

-- ── ③ 판 번호 ─────────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 123 $$;

-- ── ④ 확인 ────────────────────────────────────────────────────────────────
--   start_date 는 그대로(2026-08-29), pilot_start_date 만 새로 찍혀야 합니다.
select public.app_schema_version() as "판 번호";
select id, start_date as "실증 시작일 (기존 · 그대로)", pilot_start_date as "Pilot 시작일 (이번)"
  from public.experiment_settings where id = 1;
