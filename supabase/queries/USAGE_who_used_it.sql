--  누가 · 언제 · 무엇을 했는지 (읽기 전용)
--
--   ⚠ 이 파일은 **마이그레이션이 아닙니다.** SELECT 만 있습니다.
--     아무것도 만들지 않고, 아무것도 바꾸지 않고, 아무것도 지우지 않습니다.
--     Supabase → SQL Editor 에 그대로 붙여 넣고 Run 하시면 됩니다.
--
--   쓰는 때: 「며칠 동안 누가 좀 써 봤다는데 그 기록이 남아 있나」를 확인할 때.
--
--   기간은 아래 한 줄만 고치시면 됩니다.
--     interval '14 days'  →  '7 days' · '30 days' 처럼

-- ─────────────────────────────────────────────────────────────────────────────
--  ① 누가 언제 들어왔나 — 계정별 "마지막" 접속
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.name                                "이름",
  p.role                                "역할",
  p.active                              "사용중",
  u.last_sign_in_at at time zone 'Asia/Seoul'  as "마지막_접속",
  u.created_at      at time zone 'Asia/Seoul'  as "계정_만든날"
from public.profiles p
join auth.users u on u.id = p.id
order by u.last_sign_in_at desc nulls last;

-- ─────────────────────────────────────────────────────────────────────────────
--  ② 그 사람들이 실제로 무엇을 바꿨나 — 감사로그
--     (화면에서는 「관리 → 감사로그」에서 최근 200건을 보실 수 있습니다)
-- ─────────────────────────────────────────────────────────────────────────────
select
  at at time zone 'Asia/Seoul' as "시각",
  actor_name                   as "한_사람",
  actor_role                   as "역할",
  action                       as "한_일",
  entity                       as "대상표",
  client_name                  as "거래처",
  summary                      as "요약"
from public.audit_logs
where at >= now() - interval '14 days'
order by at desc
limit 300;

-- ─────────────────────────────────────────────────────────────────────────────
--  ③ 자료가 실제로 남아 있나 — 표별로 최근 며칠 새로 들어온 줄 수
--
--    ⚠ 감사로그는 **바꾼 일**만 남깁니다. 화면을 열어 본 것은 안 남습니다.
--      그래서 「진짜 자료가 들어왔는지」는 표를 직접 세는 이쪽이 확실합니다.
-- ─────────────────────────────────────────────────────────────────────────────
with "기간" as (select now() - interval '14 days' as "부터")
select '수거 일정'      as "표", count(*) as "새로_들어온_줄", max(created_at at time zone 'Asia/Seoul') as "마지막"
  from public.schedules,             "기간" where created_at >= "부터"
union all
select '수거 완료 기록', count(*), max(created_at at time zone 'Asia/Seoul')
  from public.collection_events,     "기간" where created_at >= "부터"
union all
select '병원 요청',      count(*), max(created_at at time zone 'Asia/Seoul')
  from public.client_requests,       "기간" where created_at >= "부터"
union all
select '병원 문의',      count(*), max(created_at at time zone 'Asia/Seoul')
  from public.client_inquiries,      "기간" where created_at >= "부터"
union all
select '현장 메모',      count(*), max(created_at at time zone 'Asia/Seoul')
  from public.site_notes,            "기간" where created_at >= "부터"
union all
select '물품 주문',      count(*), max(created_at at time zone 'Asia/Seoul')
  from public.product_orders,        "기간" where created_at >= "부터"
union all
select '자재 입출고',    count(*), max(created_at at time zone 'Asia/Seoul')
  from public.material_transactions, "기간" where created_at >= "부터"
union all
select '청구',           count(*), max(created_at at time zone 'Asia/Seoul')
  from public.payments,              "기간" where created_at >= "부터"
union all
select '입금',           count(*), max(created_at at time zone 'Asia/Seoul')
  from public.payment_receipts,      "기간" where created_at >= "부터"
union all
select '거래처',         count(*), max(created_at at time zone 'Asia/Seoul')
  from public.clients,               "기간" where created_at >= "부터"
union all
select '개발 요청',      count(*), max(created_at at time zone 'Asia/Seoul')
  from public.dev_requests,          "기간" where created_at >= "부터"
union all
--  마감은 created_at 대신 closed_at 을 씁니다.
select '하루 마감',      count(*), max(closed_at at time zone 'Asia/Seoul')
  from public.day_closes,            "기간" where closed_at >= "부터"
order by "새로_들어온_줄" desc;

-- ─────────────────────────────────────────────────────────────────────────────
--  ④ 시연 자료로 잘못 표시된 줄이 있나 (있으면 안 됩니다)
--
--    ⚠ 실서버에 붙어 쓰실 때는 시연 표시를 하지 않습니다
--      (repo.ts — 「실제 운영 모드에서는 시연 태깅을 하지 않습니다」).
--      그래도 0 인지는 눈으로 확인하는 편이 낫습니다. 0 이 아니면
--      그 줄들은 시연 정리에 휩쓸릴 수 있는 자리에 있는 것입니다.
-- ─────────────────────────────────────────────────────────────────────────────
select 'schedules'         as "표", count(*) as "시연으로_표시된_줄" from public.schedules         where demo_session_id is not null
union all
select 'collection_events',      count(*) from public.collection_events  where demo_session_id is not null
union all
select 'client_requests',        count(*) from public.client_requests    where demo_session_id is not null
union all
select 'site_notes',             count(*) from public.site_notes         where demo_session_id is not null
union all
select 'client_inquiries',       count(*) from public.client_inquiries   where demo_session_id is not null;
