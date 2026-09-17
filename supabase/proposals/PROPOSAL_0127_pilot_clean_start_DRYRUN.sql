-- ════════════════════════════════════════════════════════════════════════════
-- 0127 — PILOT CLEAN START · DRY RUN (읽기만 — 아무것도 바꾸지 않습니다)
--
--  ⚠ 이 파일에는 DELETE · UPDATE · TRUNCATE · DROP 이 **한 줄도 없습니다.**
--     임시 표(temp table) 하나만 만들며, 그것은 이 실행이 끝나면 사라집니다.
--
--  ── 무엇을 보나 ────────────────────────────────────────────────────────
--   ① 거래처 전체 — 유지/삭제 분류 작업표 (표별 기록 수 · Pilot 여부 · 포털 계정)
--   ② Legacy 로 고른 거래처 id 목록을 넣고 → 표별로 **몇 건이 지워질지**
--   ③ 안전 확인 — Pilot 거래처가 섞였는지 · 포털 계정이 걸리는지 ·
--      청구(payments)가 있는지(삭제 방지 트리거) · 재고에 미치는 영향
--
--  ── 순서 ──────────────────────────────────────────────────────────────
--   1. 이 파일 전체를 Supabase SQL Editor 에 붙여 넣고 실행 → ① 결과를 보고
--      **삭제할 거래처 id** 를 정합니다.
--   2. 아래 「LEGACY 목록」 자리에 그 id 들을 넣고 다시 전체 실행 → ②③ 확인.
--   3. 결과(표별 건수)를 보고서에 붙입니다. 실제 삭제 SQL 은 이 결과를
--      확인한 뒤 **따로** 만듭니다 — 이 파일은 지우지 않습니다.
--
--  ⚠ 판 122 이상(experiment_settings.pilot_client_ids)이어야 ① 의 Pilot 칸이
--    읽힙니다. PROPOSAL_0083(client_inquiries) · 0106(recommendation_views) 은
--    실행 여부를 모르므로 그 표는 ④ 에서 「있을 때만」 따로 셉니다.
-- ════════════════════════════════════════════════════════════════════════════


-- ── ① 거래처 분류 작업표 ─────────────────────────────────────────────────
--   유지 후보 = 이번 Pilot 10곳(pilot = true) · 지금도 수거하는 곳
--   삭제 후보 = 시연 생성(demo) · 계약 끝난 곳 · 옛 시험 자료
--   ⚠ 여기서 자동으로 고르지 않습니다. 대표님이 이름을 보고 정하십니다.
with pilot as (
  select coalesce(pilot_client_ids, '{}'::uuid[]) as ids
    from public.experiment_settings where id = 1
)
select
  c.id,
  c.name                                   as "거래처",
  c.active                                 as "사용중",
  (c.id = any(pilot.ids))                  as "PILOT",
  c.is_demo_generated                      as "시연생성",
  c.demo_session_id is not null            as "시연세션",
  c.contract_end                           as "계약종료",
  c.created_at::date                       as "등록일",
  (select count(*) from public.schedules          s where s.client_id = c.id) as "일정",
  (select count(*) from public.collection_events  e where e.client_id = c.id) as "수거기록",
  (select count(*) from public.materials          m where m.client_id = c.id) as "자재공급",
  (select count(*) from public.payments           p where p.client_id = c.id) as "청구",
  (select count(*) from public.client_requests    r where r.client_id = c.id) as "포털요청",
  (select count(*) from public.product_orders     o where o.client_id = c.id) as "주문",
  (select count(*) from public.profiles           u where u.client_id = c.id) as "포털계정",
  (select max(e.at) from public.collection_events e where e.client_id = c.id and not e.reverted)::date as "마지막수거"
from public.clients c
cross join pilot
order by (c.id = any(pilot.ids)) desc, c.active desc, c.name;


-- ── LEGACY 목록 — 여기에 지울 거래처 id 를 넣습니다 ─────────────────────────
--   ① 결과에서 고른 id 를 한 줄에 하나씩. 예:
--     ('11111111-1111-1111-1111-111111111111'),
--     ('22222222-2222-2222-2222-222222222222')
--   ⚠ 비워 두면 아래 ②③ 은 전부 0 으로 나옵니다 (아직 정하지 않은 상태).
drop table if exists pg_temp.legacy_clean_start;
create temp table legacy_clean_start (id uuid primary key);
insert into legacy_clean_start (id) values
  -- ('00000000-0000-0000-0000-000000000000')   ← 실제 id 로 바꾸고 앞의 -- 를 지웁니다
  ('00000000-0000-0000-0000-000000000000')
on conflict do nothing;
delete from legacy_clean_start where id = '00000000-0000-0000-0000-000000000000'; -- 자리표시자만 지움 (임시 표)


-- ── ② 표별로 몇 건이 지워지나 (삭제 순서대로) ─────────────────────────────
--   FK 정책: restrict = 먼저 지워야 거래처가 지워짐 · cascade = 거래처와 함께
--   자동 삭제 · set null = 남되 거래처 칸만 비워짐 · (없음) = NO ACTION(restrict 와 같음)
with L as (select id from legacy_clean_start)
select * from (
  values
  ( 1, 'schedule_feedback',      'schedules cascade · clients cascade', (select count(*) from public.schedule_feedback f where f.client_id in (select id from L) or f.schedule_id in (select id from public.schedules where client_id in (select id from L)))),
  ( 2, 'collection_events',      'clients SET NULL → 직접 지움',        (select count(*) from public.collection_events e where e.client_id in (select id from L) or e.schedule_id in (select id from public.schedules where client_id in (select id from L)))),
  ( 3, 'material_transactions',  'clients SET NULL → 직접 지움',        (select count(*) from public.material_transactions t where t.client_id in (select id from L) or t.material_id in (select id from public.materials where client_id in (select id from L)))),
  ( 4, 'materials',              'clients RESTRICT (⚠ 삭제 트리거 → 재고 되돌림)', (select count(*) from public.materials m where m.client_id in (select id from L))),
  ( 5, 'product_order_items',    'product_orders cascade',              (select count(*) from public.product_order_items i where i.order_id in (select id from public.product_orders where client_id in (select id from L)))),
  ( 6, 'product_orders',         'clients NO ACTION → 직접 지움',       (select count(*) from public.product_orders o where o.client_id in (select id from L))),
  ( 7, 'client_requests',        'clients cascade',                     (select count(*) from public.client_requests r where r.client_id in (select id from L))),
  ( 8, 'request_overrides',      'FK 없음 (request_id text) → 직접 지움', (select count(*) from public.request_overrides x where x.request_id in (select id::text from public.client_requests where client_id in (select id from L)))),
  ( 9, 'payment_receipts',       'payments cascade',                    (select count(*) from public.payment_receipts pr where pr.payment_id in (select id from public.payments where client_id in (select id from L)))),
  (10, 'payments',               'clients RESTRICT (⚠ 삭제 방지 트리거 payments_guard_del)', (select count(*) from public.payments p where p.client_id in (select id from L))),
  (11, 'schedules',              'clients RESTRICT',                    (select count(*) from public.schedules s where s.client_id in (select id from L))),
  (12, 'site_notes',             'clients cascade',                     (select count(*) from public.site_notes n where n.client_id in (select id from L))),
  (13, 'client_documents',       'clients cascade',                     (select count(*) from public.client_documents d where d.client_id in (select id from L))),
  (14, 'client_prices',          'clients cascade',                     (select count(*) from public.client_prices cp where cp.client_id in (select id from L))),
  (15, 'client_monthly_actuals', 'clients cascade',                     (select count(*) from public.client_monthly_actuals a where a.client_id in (select id from L))),
  (16, 'revenue_overrides',      'clients cascade',                     (select count(*) from public.revenue_overrides v where v.client_id in (select id from L))),
  (17, 'client_assignments',     'clients cascade',                     (select count(*) from public.client_assignments ca where ca.client_id in (select id from L))),
  (18, 'sales_lead_events',      'sales_leads cascade',                 (select count(*) from public.sales_lead_events le where le.lead_id in (select id from public.sales_leads where client_id in (select id from L)))),
  (19, 'sales_leads',            'clients cascade',                     (select count(*) from public.sales_leads sl where sl.client_id in (select id from L))),
  (20, 'audit_logs',             'clients SET NULL — **지우지 않음** (감사기록 보존, 거래처 칸만 비워짐)', (select count(*) from public.audit_logs g where g.client_id in (select id from L))),
  (21, 'profiles (포털 계정)',   'clients SET NULL — **지우지 않음** (소속만 풀림 → ③ 확인)', (select count(*) from public.profiles u where u.client_id in (select id from L))),
  (22, 'staff_invites.client_ids', '배열 · FK 없음 — 지우지 않음 (남은 id 는 무해)', (select count(*) from public.staff_invites si where si.client_ids && (select coalesce(array_agg(id), '{}'::uuid[]) from L))),
  (99, 'clients (마지막)',       '—',                                   (select count(*) from public.clients c where c.id in (select id from L)))
) as t("순서", "표", "FK 정책 · 처리", "지워질 건수")
order by 1;


-- ── ③ 안전 확인 ─────────────────────────────────────────────────────────

-- ③-1 Pilot 거래처가 Legacy 목록에 섞였는가 → **0건이어야** 합니다
select c.id, c.name as "⚠ PILOT 인데 Legacy 목록에 있음"
  from public.clients c
  join legacy_clean_start l on l.id = c.id
 where c.id = any(array(select unnest(coalesce(pilot_client_ids, '{}'::uuid[])) from public.experiment_settings where id = 1));

-- ③-2 포털 계정이 Legacy 거래처에 걸려 있는가 (지워지면 소속이 비어 포털이 「소속 병원 없음」이 됨)
select u.id, u.email, u.name, c.name as "소속(Legacy)"
  from public.profiles u
  join legacy_clean_start l on l.id = u.client_id
  join public.clients c on c.id = u.client_id;

-- ③-3 청구·입금 — payments 는 삭제 방지 트리거(0037 payments_guard_del)가 **모든 삭제를 거절**합니다.
--      건수가 0 이 아니면 실제 삭제 SQL 에서 그 트리거를 트랜잭션 안에서만 잠시 끄는 결정이 필요합니다.
select count(*)                          as "청구 건수",
       coalesce(sum(p.amount), 0)        as "청구 금액 합",
       count(*) filter (where p.status = '입금완료') as "입금완료",
       (select coalesce(sum(r.amount), 0) from public.payment_receipts r
         where r.payment_id in (select id from public.payments where client_id in (select id from legacy_clean_start))) as "입금 기록 합"
  from public.payments p
 where p.client_id in (select id from legacy_clean_start);

-- ③-4 재고 영향 — materials 삭제 시 트리거(PROPOSAL_0079 apply_item_stock_del)가
--      그 줄의 items 수량을 **규격별 재고(office_stock_items)에 도로 더합니다.**
--      아래가 규격별로 얼마나 늘어날지의 미리보기입니다. 0079 를 안 돌렸으면 이 질의는 실패하고, 그러면 영향도 없습니다.
select t.k as "규격", sum((t.v)::integer) as "삭제 시 재고에 더해질 수량", s.qty as "지금 재고", s.counted_at as "마지막 실사"
  from public.materials m
  cross join lateral jsonb_each_text(m.items) as t(k, v)
  left join public.office_stock_items s on s.item = t.k
 where m.client_id in (select id from legacy_clean_start)
   and jsonb_typeof(m.items) = 'object'
   and (t.v) ~ '^[0-9]+$' and (t.v)::integer > 0
 group by t.k, s.qty, s.counted_at
 order by t.k;

-- ③-5 4칸 재고(office_stock)는 트리거가 없어 **변하지 않습니다** — 지금 값 기록용
select id, corrugated_box, plastic_container, bag, needle_box, updated_at
  from public.office_stock where id = 1;

-- ③-6 실증 설정 — start_date 는 그대로 두고, pilot_start_date 만 2026-09-17 로 맞출 예정
select id, start_date as "실증 시작일(건드리지 않음)", pilot_start_date as "Pilot 시작일", pilot_client_ids as "Pilot 거래처"
  from public.experiment_settings where id = 1;


-- ── ④ 있을 때만 세는 표 (제안 SQL 실행 여부에 따라) ──────────────────────
do $$
declare n bigint;
begin
  if to_regclass('public.client_inquiries') is not null then
    execute 'select count(*) from public.client_inquiries where client_id in (select id from legacy_clean_start)' into n;
    raise notice 'client_inquiries (0083 · clients cascade): % 건', n;
  else
    raise notice 'client_inquiries: 표 없음 (0083 미실행) — 영향 없음';
  end if;
  if to_regclass('public.recommendation_views') is not null then
    execute 'select count(*) from public.recommendation_views where client_id in (select id from legacy_clean_start)' into n;
    raise notice 'recommendation_views (0106 · clients cascade): % 건', n;
  else
    raise notice 'recommendation_views: 표 없음 (0106 미실행) — 영향 없음';
  end if;
  if to_regclass('public.ax_coach_missions') is not null then
    execute 'select count(*) from public.ax_coach_missions where target_id in (select id::text from legacy_clean_start union all select id::text from public.schedules where client_id in (select id from legacy_clean_start))' into n;
    raise notice 'ax_coach_missions.target_id 가 Legacy 를 가리킴 (FK 없음 · 지우지 않음): % 건', n;
  end if;
end $$;

-- 끝. 바뀐 것 없음.
