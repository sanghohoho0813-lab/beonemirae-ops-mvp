-- 비원미래 운영 DB — 36차 (0050)
-- ① 신고를 「확정」으로 표시할 수 있게  ② 소모품 품목 늘리기.
-- RUN_1~35 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0050_confirmed_and_catalog.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();  → 50 이 나와야 합니다.
--              select public.app_health_check();     → ok: true
--
-- 왜 필요한가
--   ① 2026년 상반기가 화면에 「확정 전」으로 나옵니다. 증명서를 그 기간이
--      끝나기 전(2026-03-19)에 뽑았기 때문입니다. **종이만 보고는** 확정인지
--      알 수 없고, 아는 분은 대표님뿐입니다. 그래서 「사람이 확인했다」를
--      기록할 자리를 만들고, 대표님이 확인해 주신 2026 상반기를 확정으로
--      표시합니다. 다른 반기는 건드리지 않습니다.
--   ② 팔 수 있는 것이 의료폐기물 용기 4종뿐이었습니다. 병원이 늘 쓰는
--      소모품 10가지를 품목·규격·단위만 미리 만들어 둡니다.
--
-- 기존 데이터에 미치는 영향
--   · tax_filings 에 칸 두 개 추가(confirmed_at · confirmed_by). **금액은
--     하나도 안 바뀝니다** — 「이 숫자가 확정분인가」만 기록합니다.
--   · products 에 칸 하나 추가(category) + 품목 10가지 추가. 이미 있는
--     이름·규격은 건드리지 않습니다.
--   · **새 품목은 판매가 0원 · 판매 불가입니다.** 지어낸 가격을 넣으면 그
--     값이 주문에 그대로 박혀 나중에 돈이 틀립니다. 대표님이 단가를 넣는
--     순간 병원 화면에 뜹니다.
--   · 주문·재고·청구·미수금은 아무것도 바뀌지 않습니다.
--
-- 실행 순서
--   RUN_33·34·35 를 먼저 실행하셨어야 합니다. 이 파일 하나만 실행하면 됩니다.
--   두 번 실행해도 안전합니다(품목이 두 벌 생기지 않습니다).

-- ════════════════════════════════════════════════════════════════════════════
-- 0050 — ① 신고를 「확정」으로 표시할 수 있게  ② 소모품 품목 늘리기
--
--  ① 확정 표시
--
--   0047 은 「증명서를 과세기간이 끝나기 전에 뽑았으면 확정 신고분이 아닐 수
--   있다」고 보고 「확정 전」이라고 적었습니다. 그 판단 자체는 맞습니다 —
--   2026년 상반기 값이 2026-03-19 발급 증명서에 적혀 있으니, **종이만 보고는**
--   확정인지 알 수 없습니다.
--
--   알 수 있는 사람은 대표님뿐입니다. 그래서 **사람이 정한 것을 기록**합니다
--   (0044 의 월정액 정책과 같은 방식입니다). 시스템이 날짜만 보고 단정하지도
--   않고, 반대로 확정된 것을 계속 「확정 전」이라 부르지도 않습니다.
--
--  ② 소모품 품목
--
--   지금 팔 수 있는 것이 의료폐기물 용기 4종뿐입니다. 병원에 어차피 매달
--   가는 차가 있는데 실을 것이 4가지밖에 없습니다. 실제로 병원이 늘 쓰는
--   소모품(장갑·거즈·알코올솜·손소독제 …)을 함께 실으면 같은 방문으로
--   매출이 늘어납니다.
--
--   ⚠ **단가는 넣지 않습니다.** 판매가·원가를 지어내면 그 값이 그대로
--     주문에 박히고(0048 은 확정 시점 단가를 snapshot 합니다) 나중에 돈이
--     틀립니다. 품목·규격·단위만 만들어 두고 **판매 불가** 상태로 둡니다 —
--     대표님이 단가를 넣는 순간 병원 화면에 뜹니다.
--
--  기존 데이터 영향
--   · tax_filings 에 칸 두 개 추가 (기존 줄은 전부 「확정 전」 그대로 = 기본값)
--   · products 에 칸 하나 추가(분류) + 품목 10종 추가. 이미 있는 이름은
--     건드리지 않습니다. 주문·재고·금액은 아무것도 바뀌지 않습니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 확정 표시 ─────────────────────────────────────────────────────────────

alter table public.tax_filings
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id);

comment on column public.tax_filings.confirmed_at is
  '사람이 「이 값은 확정 신고분이 맞다」고 확인한 시각. null = 아직 확인 안 함(확정 전으로 표시).';

/**
 * 신고 한 줄을 확정으로 표시하거나 되돌립니다.
 *
 *  숫자는 건드리지 않습니다 — 「이 숫자가 확정분인가」만 기록합니다.
 *  되돌릴 수 있습니다(잘못 눌렀을 때 손쓸 방법이 있어야 합니다).
 */
create or replace function public.set_tax_filing_confirmed(
  p_id bigint,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tax_filings;
begin
  if not public.is_admin() then
    raise exception '신고 확정 표시는 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_row from public.tax_filings where id = p_id for update;
  if not found then
    raise exception '그 과세기간을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  이미 같은 상태면 아무것도 하지 않습니다 — 감사기록에 같은 줄을
  --  쌓지 않습니다(다시 눌러도 안전).
  if (v_row.confirmed_at is not null) = coalesce(p_confirmed, false) then
    return jsonb_build_object('id', p_id, 'confirmed', v_row.confirmed_at is not null, 'changed', false);
  end if;

  update public.tax_filings
     set confirmed_at = case when p_confirmed then now() else null end,
         confirmed_by = case when p_confirmed then auth.uid() else null end
   where id = p_id;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('tax_filing.confirm', 'tax_filings', p_id::text,
          format('%s ~ %s 신고를 %s',
                 v_row.period_from, v_row.period_to,
                 case when p_confirmed then '확정으로 표시' else '확정 전으로 되돌림' end),
          '매출 현황', 'app');

  return jsonb_build_object('id', p_id, 'confirmed', coalesce(p_confirmed, false), 'changed', true);
end;
$$;

revoke all on function public.set_tax_filing_confirmed(bigint, boolean) from public;
grant execute on function public.set_tax_filing_confirmed(bigint, boolean) to authenticated;

--  2026년 상반기 — 대표님이 「확정된 것」이라고 확인해 주셨습니다(2026-08-16).
--  다른 반기는 건드리지 않습니다. 사람이 확인한 것만 확정입니다.
update public.tax_filings
   set confirmed_at = now()
 where period_from = date '2026-01-01'
   and period_to   = date '2026-06-30'
   and confirmed_at is null;


-- ── ② 소모품 품목 ───────────────────────────────────────────────────────────

alter table public.products
  add column if not exists category text not null default '';

comment on column public.products.category is
  '화면에서 묶어 보여 주는 분류. 재고 차감과는 무관합니다(그건 stock_key).';

create index if not exists products_category_idx on public.products (category, sort);

--  분류별로 몇 번째에 놓을지. 이름은 화면에 그대로 나갑니다.
--
--   ⚠ 판매가·원가는 **0 이고 판매 불가(available=false)** 입니다.
--     지어낸 단가를 넣으면 그 값이 주문에 박혀 돈이 틀립니다.
--     대표님이 단가를 넣으면 그때 병원 화면에 뜹니다.
--
--   stock_key 는 **사무실 재고를 두는 것에만** 답니다. 의료폐기물 용기 4종은
--   이미 재고를 세고 있으므로 그대로 잇고, 새 소모품은 아직 재고를 안 세므로
--   null 입니다 — 없는 재고를 있다고 하면 「전달완료」에서 막힙니다.
insert into public.products (name, spec, unit, category, stock_key, sale_price, cost_price, available, sort, description)
select * from (values
  --  ── 감염관리·처치 ──
  ('니트릴 검진장갑',   '100매입 · S/M/L',   '박스', '위생·감염관리', null::text, 0::bigint, 0::bigint, false, 10,
   '분말 없는 니트릴. 규격(S/M/L)은 주문하실 때 적어 주세요.'),
  ('라텍스 검진장갑',   '100매입 · S/M/L',   '박스', '위생·감염관리', null, 0, 0, false, 11,
   '라텍스 알레르기가 있으면 니트릴을 권합니다.'),
  ('알코올 스왑',       '100매입',           '박스', '위생·감염관리', null, 0, 0, false, 12, ''),
  ('손소독제',          '500mL 펌프',        '개',   '위생·감염관리', null, 0, 0, false, 13, ''),
  ('덴탈 마스크',       '50매입',            '박스', '위생·감염관리', null, 0, 0, false, 14, ''),
  --  ── 처치·드레싱 ──
  ('멸균거즈',          '4x4 · 100매입',     '박스', '처치·드레싱',   null, 0, 0, false, 20, ''),
  ('반창고(종이테이프)', '1인치',            '롤',   '처치·드레싱',   null, 0, 0, false, 21, ''),
  ('일회용 방수시트',   '60x90',             '매',   '처치·드레싱',   null, 0, 0, false, 22, ''),
  --  ── 환자용품 ──
  ('성인용 기저귀',     '대형 · 10매입',     '팩',   '환자용품',      null, 0, 0, false, 30,
   '일회용기저귀는 저희가 수거도 함께 합니다.'),
  ('물티슈(대형)',      '100매입',           '팩',   '환자용품',      null, 0, 0, false, 31, '')
) as v(name, spec, unit, category, stock_key, sale_price, cost_price, available, sort, description)
where not exists (select 1 from public.products p where p.name = v.name and p.spec = v.spec);

--  이미 있던 의료폐기물 용기 4종에도 분류를 답니다(있을 때만).
update public.products
   set category = '의료폐기물 용기'
 where category = ''
   and stock_key in ('corrugated_box', 'plastic_container', 'bag', 'needle_box');


-- ── 상품 저장 — 분류를 함께 ─────────────────────────────────────────────────
--
--  0048 의 upsert_product 에 분류 하나를 더합니다.
--
--  ⚠ **먼저 옛 서명을 지웁니다.** `create or replace` 는 인자 개수가 다르면
--    바꾸는 게 아니라 **하나 더 만듭니다**(오버로드). 그러면 10개짜리와
--    11개짜리가 같이 남아, 인자를 10개로 부르는 쪽이 통째로 실패합니다 —
--    `function ... is not unique`. 실측으로 확인했습니다.
drop function if exists public.upsert_product(uuid, text, text, text, bigint, bigint, text, boolean, text, text);

create or replace function public.upsert_product(
  p_id        uuid,
  p_name      text,
  p_spec      text default '',
  p_unit      text default '개',
  p_sale      bigint default 0,
  p_cost      bigint default 0,
  p_stock_key text default null,
  p_available boolean default true,
  p_image     text default '',
  p_desc      text default '',
  p_category  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  --  ⚠ 관리자만입니다(0048 과 같음). 상품 단가는 그대로 확정 판매금액이
  --    되므로(0048 이 주문 시점 단가를 snapshot 합니다) 값을 정하는 사람은
  --    한 명이어야 합니다. 0050 초안에서 실수로 사무실까지 열었던 것을
  --    격리 DB 검사(db_orders)가 잡았습니다.
  if not public.is_admin() then
    raise exception '상품은 관리자만 등록·수정할 수 있습니다.' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception '상품 이름을 넣어 주세요.' using errcode = 'P0001';
  end if;
  if coalesce(p_sale, 0) < 0 or coalesce(p_cost, 0) < 0 then
    raise exception '금액은 0 보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;
  --  단가를 안 정한 물건을 병원 화면에 띄우면 0원짜리 주문이 들어옵니다.
  if coalesce(p_available, true) and coalesce(p_sale, 0) <= 0 then
    raise exception '판매가를 정해야 병원이 주문할 수 있습니다 — 단가를 넣거나 「지금 공급할 수 없음」으로 두세요.'
      using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.products (name, spec, unit, sale_price, cost_price, stock_key,
                                 available, image_url, description, category)
    values (v_name, coalesce(p_spec, ''), coalesce(p_unit, '개'), coalesce(p_sale, 0), coalesce(p_cost, 0),
            p_stock_key, coalesce(p_available, true), coalesce(p_image, ''), coalesce(p_desc, ''),
            coalesce(p_category, ''))
    returning id into v_id;
  else
    update public.products
       set name = v_name, spec = coalesce(p_spec, ''), unit = coalesce(p_unit, '개'),
           sale_price = coalesce(p_sale, 0), cost_price = coalesce(p_cost, 0),
           stock_key = p_stock_key, available = coalesce(p_available, true),
           description = coalesce(p_desc, ''), image_url = coalesce(p_image, ''),
           category = coalesce(p_category, ''), updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception '고칠 상품을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('product.save', 'products', v_id::text,
          format('상품 %s %s — 판매 %s원', v_name, coalesce(p_spec, ''),
                 to_char(coalesce(p_sale, 0), 'FM999,999,999')),
          '소모품 주문', 'app');
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.upsert_product(uuid, text, text, text, bigint, bigint, text, boolean, text, text, text) from public;
grant execute on function public.upsert_product(uuid, text, text, text, bigint, bigint, text, boolean, text, text, text) to authenticated;


-- ── 자가진단 목록에 새 칸·색인을 더합니다 ───────────────────────────────────
--
--  0043 부터의 규칙입니다 — 새 마이그레이션이 만든 것을 여기 적지 않으면
--  자가진단이 「이상 없음」이라고 거짓말합니다.
create or replace function public.app_health_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_missing text[] := '{}';
  v_name    text;
  v_pair    text[];
  v_rls     text[];
begin
  if not public.is_admin() then
    raise exception '자가진단은 관리자만 볼 수 있습니다.' using errcode = 'P0001';
  end if;

  foreach v_name in array array[
    'clients','vehicles','schedules','materials','material_transactions','office_stock',
    'payments','payment_receipts','client_prices','client_monthly_actuals','revenue_overrides',
    'operating_costs','holidays','site_notes','client_requests','request_overrides',
    'audit_logs','collection_events','profiles','dev_requests','client_documents',
    'sales_leads','sales_lead_events','experiment_settings','performance_baselines',
    'app_errors','staff','tax_filings',
    'products','product_orders','product_order_items'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('표 ' || v_name);
    end if;
  end loop;

  foreach v_pair slice 1 in array array[
    ['clients','flat_fee_when_empty'], ['clients','flat_fee_policy_at'],
    ['clients','name_key'], ['clients','request_id'],
    ['clients','collect_time'], ['clients','disposal_site'],
    ['clients','diaper_cycle'], ['clients','biz_no'], ['clients','vat_mode'],
    ['payments','snapshot'], ['payments','canceled_at'],
    ['payment_receipts','source_ref'], ['payment_receipts','request_id'],
    ['materials','request_id'], ['material_transactions','request_id'],
    ['schedules','plan_batch'], ['schedules','is_additional'],
    ['profiles','approved_at'], ['app_errors','kind'],
    ['staff','waste_scope'], ['tax_filings','base_exempt'],
    ['product_order_items','unit_price'], ['product_orders','delivered_at'],
    ['tax_filings','confirmed_at'], ['products','category']
  ] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_pair[1] and column_name = v_pair[2]
    ) then
      v_missing := v_missing || ('칸 ' || v_pair[1] || '.' || v_pair[2]);
    end if;
  end loop;

  foreach v_name in array array[
    'confirm_billing','cancel_billing','add_payment_receipt','delete_payment_receipt',
    'supply_materials','receive_stock','delete_material','complete_collection',
    'create_planned_schedules','set_revenue_override','delete_revenue_override',
    'set_flat_fee_policy','create_client','client_name_key',
    'record_app_error','recent_app_errors','upsert_staff','set_staff_active','upsert_tax_filing',
    'request_product_order','set_product_order_status','upsert_product','product_sales_summary',
    'admin_approve_user','admin_confirm_email','delete_client','app_schema_version',
    'set_tax_filing_confirmed',
    'is_admin','is_staff','is_active_user','auth_role'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    ) then
      v_missing := v_missing || ('함수 ' || v_name);
    end if;
  end loop;

  foreach v_name in array array[
    'payment_receipts_request_uniq','materials_request_uniq','material_tx_request_uniq',
    'clients_request_uniq','clients_name_key_idx','staff_name_uniq','product_orders_request_uniq',
    'schedules_planned_uniq','schedules_one_completion_per_day','products_category_idx'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('색인 ' || v_name);
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger where tgname = 'clients_name_key_trg' and not tgisinternal
  ) then
    v_missing := v_missing || '방아쇠 clients_name_key_trg'::text;
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'payments'
       and grantee = 'authenticated' and privilege_type = 'DELETE'
  ) then
    v_missing := v_missing || '잠금 payments 삭제 권한이 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'payment_receipts'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 payment_receipts 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'clients'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then
    v_missing := v_missing || '잠금 clients 직접 등록이 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'app_errors'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 app_errors 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('staff', 'tax_filings')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 직원·신고매출 직접 쓰기가 열려 있음'::text;
  end if;
  --  판매 금액을 표에서 고칠 수 있으면 확정된 매출이 흔들립니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('products', 'product_orders', 'product_order_items')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 상품·주문 직접 쓰기가 열려 있음'::text;
  end if;

  select coalesce(array_agg('RLS ' || c.relname order by c.relname), '{}') into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  v_missing := v_missing || v_rls;

  return jsonb_build_object(
    'version', public.app_schema_version(),
    'ok', array_length(v_missing, 1) is null,
    'missing', to_jsonb(v_missing),
    'checkedAt', (now() at time zone 'Asia/Seoul')
  );
end;
$$;

revoke all on function public.app_health_check() from public;
grant execute on function public.app_health_check() to authenticated;


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 50 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
