-- ════════════════════════════════════════════════════════════════════════════
-- 0122 — Pilot 거래처 목록 한 칸
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. 지우는 것 없습니다.
--     DROP · TRUNCATE · DELETE · 기존 칸 변경 없음. **칸 하나**를 더할 뿐입니다.
--
--  ── 무엇을 더하나 ──────────────────────────────────────────────────────
--
--   experiment_settings.pilot_client_ids  uuid[]  기본 '{}'
--
--   이번 주 Pilot(5~10곳)으로 켠 거래처의 id 목록입니다. 거래처 표(clients)에는
--   칸을 더하지 않습니다 — 그 표는 열 단위 권한이 걸려 있어 칸 하나를 더하면
--   grant · app_health_check · 앱의 열 목록 세 곳을 같이 고쳐야 하고, 한쪽만
--   바뀌면 거래처 전체가 안 읽힙니다. 실증 설정은 `select *` 로 읽고 관리자만
--   고치므로(experiment_write) 칸이 늘어도 앱이 깨지지 않습니다.
--
--   Pilot 시작일은 이미 있는 experiment_settings.start_date(설정 화면
--   「실증 시작일」)를 그대로 씁니다 — 새 설정을 만들지 않습니다.
--
--  ── 이 SQL 을 안 돌리면 ───────────────────────────────────────────────
--   앱은 그대로 돌고 Pilot 은 0곳으로 보입니다. 거래처 관리에서 PILOT 을
--   켜면 서버가 「칸이 없다」고 거절하고 그 말이 화면에 그대로 뜹니다.
--
--  ── 순서 ──────────────────────────────────────────────────────────────
--   PROPOSAL_0108_ax_coach.sql 이 먼저 실행돼 있어야 합니다 (판 108).
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare v integer;
begin
  begin
    select public.app_schema_version() into v;
  exception when undefined_function then
    v := 0;
  end;
  if v < 108 then
    raise exception '먼저 PROPOSAL_0108_ax_coach.sql 을 실행해 주세요 (지금 판 %, 필요 108). 아무것도 바꾸지 않았습니다.', v;
  end if;
end $$;

-- ── ① 칸 하나 ─────────────────────────────────────────────────────────────
alter table public.experiment_settings
  add column if not exists pilot_client_ids uuid[] not null default '{}';

comment on column public.experiment_settings.pilot_client_ids is
  '이번 주 Pilot 거래처 id 목록 (0122). 거래처 표에는 칸을 더하지 않았습니다. 시연용 거래처가 들어 있어도 앱은 세지 않습니다.';

-- ── ② 판 번호 ─────────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 122 $$;

-- ── ③ 확인 ────────────────────────────────────────────────────────────────
select public.app_schema_version() as "판 번호";
select id, start_date, pilot_client_ids from public.experiment_settings where id = 1;
