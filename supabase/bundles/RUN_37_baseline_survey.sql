-- 비원미래 운영 DB — 37차 (0051)
-- 도입 전 기준값의 출처에 「실제 업무 조사」를 더합니다. RUN_1~36 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0051_baseline_survey.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();  → 51 이 나와야 합니다.
--
-- 왜 필요한가
--   이사님이 적어 주신 실제 업무 답변(하루 배차 30~40분, 수거내역 정리
--   2~3시간, 차량별 하루 방문 개수·이동거리)으로 도입 전 기준값을 채웁니다.
--   그런데 지금 출처는 `user`(손으로 입력) · `demo`(시연용) 둘뿐이라,
--   실제 조사 결과를 「시연 기준값」이라 부르거나 출처를 잃어버리게 됩니다.
--
-- 기존 데이터에 미치는 영향 — 없습니다
--   · 표를 만들지도, 값을 고치지도 않습니다.
--   · 허용하는 출처 목록에 'survey' 하나를 더할 뿐입니다.

-- ════════════════════════════════════════════════════════════════════════════
-- 0051 — 도입 전 기준값의 출처에 「실제 업무 조사」를 더합니다
--
--  지금 기준값 출처는 둘뿐입니다 — `user`(대표님이 손으로 넣음) ·
--  `demo`(시연용 예시값). 그런데 이사님이 실제 업무를 적어 주신 답변으로
--  채운 값은 둘 중 어느 쪽도 아닙니다.
--
--   · `demo` 로 두면 화면에 「시연 기준값」이라 뜹니다 — 실제 조사 결과를
--     시연용이라 부르는 셈이라, 심사 자리에서 스스로 값을 깎습니다.
--   · `user` 로 두면 어디서 온 숫자인지 사라집니다. 몇 달 뒤 「이 숫자
--     어디서 났습니까」에 답할 수 없습니다.
--
--  그래서 세 번째 출처를 만듭니다.
--
--  기존 데이터 영향 — **없습니다.** 지금 들어 있는 값은 그대로고, 허용하는
--  값 목록만 하나 넓힙니다.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.performance_baselines
  drop constraint if exists performance_baselines_source_check;

alter table public.performance_baselines
  add constraint performance_baselines_source_check
  check (source in ('user', 'demo', 'survey'));

comment on column public.performance_baselines.source is
  'user = 대표님이 직접 입력 · demo = 시연용 예시값 · survey = 실제 업무 조사 답변(이사님 2026-08)';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────
--
--  표·색인·함수는 그대로라 자가진단 목록은 건드리지 않습니다.

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 51 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
