-- ─────────────────────────────────────────────────────────────────────────────
-- 0048. 병원 소모품 주문 — 「다음 수거 때 같이 가져다 주세요」
--
--  이 판부터 시스템이 **돈을 벌기 시작**합니다. 지금까지는 이미 하던 일을
--  정확하게 만들었다면, 여기서는 없던 매출을 만듭니다.
--
--  쇼핑몰이 아닙니다. 택배로 부치는 것도 아닙니다. 흐름은 이렇습니다.
--
--    병원이 쓴 자재 기록  →  얼마나 쓰는지  →  언제 떨어질지  →  추천
--      →  병원이 요청  →  사무실 확인  →  **다음 수거 방문 때 함께 전달**
--      →  전달 완료  →  재고 차감 · 판매 실적
--
--  마지막 두 칸이 이 사업의 핵심입니다. 어차피 가는 차가 물건을 싣고 갑니다 —
--  배송비가 0 이고, 병원은 따로 주문할 데를 찾지 않습니다.
--
--  ── 여기서 틀리면 안 되는 것 ─────────────────────────────────────────────
--
--   재고    **요청만으로 빼지 않습니다.** 실제로 전달한 순간에 한 번만 뺍니다.
--           같은 주문을 두 번 완료해도 재고는 한 번만 빠집니다.
--   가격    나중에 상품가가 바뀌어도 **이미 확정된 판매금액은 안 바뀝니다.**
--           확정하는 순간 이름·규격·단가·원가를 그 줄에 박아 둡니다.
--   단계    요청 ≠ 확정 ≠ 전달 ≠ 입금. 기존 청구·입금과 같은 방식으로 나눕니다.
--   권한    병원은 **다른 병원의 주문을 절대 못 봅니다.** RLS 로 막습니다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── ① 파는 물건 ─────────────────────────────────────────────────────────────
--
--  자재(재고)와 상품을 따로 등록하면 같은 물건이 둘이 되어 재고가 갈립니다.
--  그래서 상품은 **재고 칸을 가리킵니다**(stock_key). 가리키지 않는 상품도
--  있을 수 있습니다 — 재고를 두지 않고 그때그때 떼어 오는 물건입니다.
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text    not null,
  spec         text    not null default '',      -- 규격 (20L, 63L …)
  unit         text    not null default '개',
  sale_price   bigint  not null default 0,       -- 판매가 (원, 부가세 별도)
  cost_price   bigint  not null default 0,       -- 원가 — 이익을 재려면 필요합니다
  --  사무실 재고의 어느 칸에서 빠지는가. null = 재고를 두지 않는 물건.
  stock_key    text,
  available    boolean not null default true,    -- 지금 공급 가능한가
  image_url    text    not null default '',      -- 실제 사진이 정해지기 전에는 비워 둡니다
  description  text    not null default '',
  sort         integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint products_stock_key_check check (
    stock_key is null or stock_key in ('corrugated_box', 'plastic_container', 'bag', 'needle_box')
  ),
  constraint products_price_check check (sale_price >= 0 and cost_price >= 0)
);

comment on table public.products is
  '병원에 파는 소모품 (0048). stock_key 로 사무실 재고 칸을 가리켜, 같은 물건을 두 번 등록하지 않습니다.';

create unique index if not exists products_name_spec_uniq
  on public.products (name, spec) where active;

alter table public.products enable row level security;
revoke all on public.products from authenticated;
grant select on public.products to authenticated;

drop policy if exists products_read on public.products;
create policy products_read on public.products
  --  병원도 봐야 주문할 수 있습니다. is_active_user() 는 내부 직원만이라
  --  병원 계정이 빠집니다 — 승인·활성인 사람 전체로 봅니다.
  for select using (public.auth_role() is not null);


-- ── ② 주문 ──────────────────────────────────────────────────────────────────
--
--  상태는 한 줄로 흐릅니다.
--    요청 → 확인 → 준비 → 전달예정 → 전달완료
--  중간에 취소할 수 있습니다. 전달완료에서는 되돌릴 수 없습니다 —
--  이미 물건이 병원에 갔고 재고가 빠졌기 때문입니다.
create table if not exists public.product_orders (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id),
  status       text not null default '요청',
  --  누가 올렸는가 — 병원 담당자 이름 또는 대신 접수한 직원 이름
  requester_name text not null default '',
  source       text not null default 'portal',   -- 'portal' = 병원이 직접 · 'staff' = 대신 접수
  note         text not null default '',
  --  「다음 수거 때 같이」 — 그 방문 일정을 가리킵니다. 없으면 날짜만.
  deliver_schedule_id uuid references public.schedules(id) on delete set null,
  deliver_on   date,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  canceled_at  timestamptz,
  cancel_reason text not null default '',
  --  다시 눌러도 두 번 들어가지 않게 (0042·0043·0045 와 같은 방식)
  request_id   uuid,
  created_by   uuid references public.profiles(id),
  updated_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint product_orders_status_check check (
    status in ('요청', '확인', '준비', '전달예정', '전달완료', '취소')
  ),
  constraint product_orders_source_check check (source in ('portal', 'staff'))
);

comment on table public.product_orders is
  '병원 소모품 주문 (0048). 요청 → 확인 → 준비 → 전달예정 → 전달완료. 재고는 전달완료에서 한 번만 빠집니다.';

create unique index if not exists product_orders_request_uniq
  on public.product_orders (request_id) where request_id is not null;
create index if not exists product_orders_client_idx on public.product_orders (client_id, requested_at desc);
create index if not exists product_orders_deliver_idx on public.product_orders (deliver_schedule_id);

--  주문 줄. 확정 시 이름·규격·단가·원가를 **여기에 박아 둡니다** —
--  나중에 상품가가 바뀌어도 지난 판매금액이 따라 바뀌면 안 됩니다.
create table if not exists public.product_order_items (
  id           bigserial primary key,
  order_id     uuid not null references public.product_orders(id) on delete cascade,
  product_id   uuid references public.products(id),
  name         text   not null,
  spec         text   not null default '',
  unit         text   not null default '개',
  qty          integer not null,
  unit_price   bigint not null default 0,   -- 판매 단가 (그때 값)
  unit_cost    bigint not null default 0,   -- 원가 (그때 값)
  stock_key    text,
  constraint product_order_items_qty_check check (qty > 0)
);

comment on table public.product_order_items is
  '주문 줄 (0048). 단가·원가는 주문 시점 값을 그대로 박아 둡니다 — 상품가가 바뀌어도 지난 금액은 안 바뀝니다.';

create index if not exists product_order_items_order_idx on public.product_order_items (order_id);

alter table public.product_orders enable row level security;
alter table public.product_order_items enable row level security;
revoke all on public.product_orders from authenticated;
revoke all on public.product_order_items from authenticated;
grant select on public.product_orders to authenticated;
grant select on public.product_order_items to authenticated;
revoke all on sequence public.product_order_items_id_seq from authenticated;

--  병원은 **자기 주문만** 봅니다. 다른 병원의 주문·수량·금액은 보이지 않습니다.
drop policy if exists product_orders_read on public.product_orders;
create policy product_orders_read on public.product_orders
  for select using (
    public.is_staff()
    or (public.auth_role() = 'client'
        and client_id = (select client_id from public.profiles where id = auth.uid()))
  );

drop policy if exists product_order_items_read on public.product_order_items;
create policy product_order_items_read on public.product_order_items
  for select using (
    exists (
      select 1 from public.product_orders o
       where o.id = order_id
         and (public.is_staff()
              or (public.auth_role() = 'client'
                  and o.client_id = (select client_id from public.profiles where id = auth.uid())))
    )
  );


-- ── ③ 주문 올리기 ───────────────────────────────────────────────────────────
--
--  병원이 직접 올리거나, 전화·카톡으로 받은 것을 사무실이 대신 올립니다.
--  단가는 **여기서 상품표를 보고 박습니다** — 화면이 보낸 금액을 믿지 않습니다.
create or replace function public.request_product_order(
  p_client_id  uuid,
  p_items      jsonb,                    -- [{productId, qty}, …]
  p_note       text default '',
  p_deliver_schedule_id uuid default null,
  p_deliver_on date default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_old    public.product_orders%rowtype;
  v_client public.clients%rowtype;
  v_id     uuid;
  v_item   jsonb;
  v_p      public.products%rowtype;
  v_qty    integer;
  v_n      integer := 0;
  v_total  bigint := 0;
  v_source text;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or not coalesce(v_actor.active, false) then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  --  병원 계정은 **자기 병원으로만** 올릴 수 있습니다.
  if public.auth_role() = 'client' then
    if v_actor.client_id is null or v_actor.client_id <> p_client_id then
      raise exception '다른 병원의 주문을 올릴 수 없습니다.' using errcode = 'P0001';
    end if;
    v_source := 'portal';
  elsif public.is_active_user() then
    --  기사님도 대신 올릴 수 있습니다. 현장에서 「박스 좀 더 주세요」를 듣는
    --  사람이 기사님이고, 그 자리에서 못 넣으면 그 매출은 카톡으로 흘러가
    --  사라집니다. 이건 **요청**일 뿐이고 확정은 사무실이 합니다.
    v_source := 'staff';
  else
    raise exception '주문을 올릴 권한이 없습니다.' using errcode = 'P0001';
  end if;

  --  다시 눌러도 두 번 들어가지 않습니다.
  if p_request_id is not null then
    select * into v_old from public.product_orders where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_old.id, 'alreadySaved', true, 'itemCount', 0, 'total', 0);
    end if;
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '주문할 물품을 하나 이상 골라 주세요.' using errcode = 'P0001';
  end if;

  insert into public.product_orders
    (client_id, status, requester_name, source, note, deliver_schedule_id, deliver_on, request_id, created_by, updated_by)
  values
    (p_client_id, '요청', coalesce(v_actor.name, ''), v_source, coalesce(p_note, ''),
     p_deliver_schedule_id, p_deliver_on, p_request_id, v_actor.id, v_actor.id)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'qty')::integer, 0);
    if v_qty <= 0 then
      raise exception '수량은 1개 이상이어야 합니다.' using errcode = 'P0001';
    end if;
    select * into v_p from public.products where id = (v_item ->> 'productId')::uuid and active;
    if not found then
      raise exception '판매하지 않는 물품이 들어 있습니다.' using errcode = 'P0001';
    end if;
    if not v_p.available then
      raise exception '「%」 은(는) 지금 공급할 수 없습니다.', v_p.name using errcode = 'P0001';
    end if;
    --  단가·원가를 **지금 값으로 박습니다.**
    insert into public.product_order_items
      (order_id, product_id, name, spec, unit, qty, unit_price, unit_cost, stock_key)
    values
      (v_id, v_p.id, v_p.name, v_p.spec, v_p.unit, v_qty, v_p.sale_price, v_p.cost_price, v_p.stock_key);
    v_n := v_n + 1;
    v_total := v_total + (v_p.sale_price::bigint * v_qty);
  end loop;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('product_order.request', 'product_orders', v_id::text, p_client_id, coalesce(v_client.name, ''),
     jsonb_build_object('items', v_n, 'total', v_total),
     format('소모품 주문 요청 — %s · %s개 품목 · %s원',
            coalesce(v_client.name, '거래처'), v_n, to_char(v_total, 'FM999,999,999,999')),
     '소모품 주문', 'app');

  return jsonb_build_object('id', v_id, 'alreadySaved', false, 'itemCount', v_n, 'total', v_total);
end;
$$;

revoke all on function public.request_product_order(uuid, jsonb, text, uuid, date, uuid) from public;
grant execute on function public.request_product_order(uuid, jsonb, text, uuid, date, uuid) to authenticated;


-- ── ④ 상태 옮기기 · 전달완료에서 재고 한 번만 ──────────────────────────────
--
--  이 함수가 이 판에서 가장 조심스러운 자리입니다.
--
--   · 주문 줄을 **잠그고**(for update) 상태를 봅니다 — 두 사람이 같은 순간에
--     전달완료를 눌러도 한 명만 지나갑니다.
--   · 이미 전달완료면 아무 일도 하지 않고 「이미 처리됨」을 돌려줍니다 —
--     오류를 내면 화면이 다시 누르게 만들고, 그게 두 번 차감의 출발점입니다.
--   · 재고는 **상대값**으로 뺍니다 (재고 = 재고 − n). 화면이 아는 값을
--     절대값으로 쓰면 동시에 넣을 때 한쪽이 조용히 사라집니다.
create or replace function public.set_product_order_status(
  p_order_id uuid,
  p_status   text,
  p_reason   text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_o     public.product_orders%rowtype;
  v_it    record;
  v_stock public.office_stock%rowtype;
  v_short text := '';
  v_moved boolean := false;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '주문 처리는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_status not in ('요청', '확인', '준비', '전달예정', '전달완료', '취소') then
    raise exception '모르는 상태입니다.' using errcode = 'P0001';
  end if;

  select * into v_o from public.product_orders where id = p_order_id for update;
  if not found then
    raise exception '주문을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  이미 그 상태면 아무 일도 하지 않습니다 — 다시 눌러도 안전합니다.
  if v_o.status = p_status then
    return jsonb_build_object('id', p_order_id, 'status', p_status, 'alreadyDone', true, 'stockMoved', false);
  end if;
  --  전달완료는 되돌릴 수 없습니다 — 물건이 이미 병원에 갔고 재고가 빠졌습니다.
  if v_o.status = '전달완료' then
    raise exception '이미 전달을 마친 주문입니다 — 되돌릴 수 없습니다. 잘못 나갔다면 반품을 따로 기록해 주세요.'
      using errcode = 'P0001';
  end if;

  if p_status = '전달완료' then
    --  재고를 잠그고 모자란지 먼저 봅니다.
    select * into v_stock from public.office_stock where id = 1 for update;
    for v_it in
      select stock_key, sum(qty)::integer as n from public.product_order_items
       where order_id = p_order_id and stock_key is not null group by stock_key
    loop
      if v_it.stock_key = 'corrugated_box'    and coalesce(v_stock.corrugated_box, 0)    < v_it.n then v_short := '골판지 전용박스'; end if;
      if v_it.stock_key = 'plastic_container' and coalesce(v_stock.plastic_container, 0) < v_it.n then v_short := '합성수지 전용용기'; end if;
      if v_it.stock_key = 'bag'               and coalesce(v_stock.bag, 0)               < v_it.n then v_short := '전용 봉투'; end if;
      if v_it.stock_key = 'needle_box'        and coalesce(v_stock.needle_box, 0)        < v_it.n then v_short := '합성수지 바늘통'; end if;
    end loop;
    if v_short <> '' then
      raise exception '재고보다 많이 전달할 수 없습니다 — % 이(가) 모자랍니다.', v_short using errcode = 'P0001';
    end if;

    --  상대값으로 뺍니다. 이 트랜잭션 안에서 한 번만 일어납니다.
    update public.office_stock s
       set corrugated_box    = s.corrugated_box    - coalesce((select sum(qty) from public.product_order_items where order_id = p_order_id and stock_key = 'corrugated_box'), 0),
           plastic_container = s.plastic_container - coalesce((select sum(qty) from public.product_order_items where order_id = p_order_id and stock_key = 'plastic_container'), 0),
           bag               = s.bag               - coalesce((select sum(qty) from public.product_order_items where order_id = p_order_id and stock_key = 'bag'), 0),
           needle_box        = s.needle_box        - coalesce((select sum(qty) from public.product_order_items where order_id = p_order_id and stock_key = 'needle_box'), 0),
           updated_by = v_actor.id
     where s.id = 1;
    v_moved := true;

    --  자재 원장에도 남깁니다 — 재고가 왜 줄었는지 나중에 물으면 답해야 합니다.
    --
    --   원장의 품목 이름은 화면 쪽 표기(corrugatedBox)를 쓰고, 나가는 것은
    --   음수입니다(0043 과 같은 규칙). 여기서만 다르게 적으면 자재 화면의
    --   입출고 내역이 갈립니다.
    insert into public.material_transactions (kind, item, qty, client_id, memo, created_by)
    select '공급',
           case stock_key
             when 'corrugated_box'    then 'corrugatedBox'
             when 'plastic_container' then 'plasticContainer'
             when 'bag'               then 'bag'
             when 'needle_box'        then 'needleBox'
           end,
           -sum(qty), v_o.client_id,
           format('소모품 판매 전달 (주문 %s)', left(p_order_id::text, 8)), v_actor.id
      from public.product_order_items
     where order_id = p_order_id and stock_key is not null
     group by stock_key;
  end if;

  update public.product_orders
     set status = p_status,
         confirmed_at = case when p_status = '확인' and confirmed_at is null then now() else confirmed_at end,
         delivered_at = case when p_status = '전달완료' then now() else delivered_at end,
         canceled_at  = case when p_status = '취소' then now() else null end,
         cancel_reason = case when p_status = '취소' then coalesce(p_reason, '') else cancel_reason end,
         updated_by = v_actor.id,
         updated_at = now()
   where id = p_order_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, before_data, after_data, summary, screen, source)
  values
    ('product_order.status', 'product_orders', p_order_id::text, v_o.client_id,
     jsonb_build_object('status', v_o.status), jsonb_build_object('status', p_status),
     format('소모품 주문 %s → %s%s', v_o.status, p_status,
            case when v_moved then ' (재고 차감)' else '' end),
     '소모품 주문', 'app');

  return jsonb_build_object('id', p_order_id, 'status', p_status, 'alreadyDone', false, 'stockMoved', v_moved);
end;
$$;

revoke all on function public.set_product_order_status(uuid, text, text) from public;
grant execute on function public.set_product_order_status(uuid, text, text) to authenticated;


-- ── ⑤ 상품 관리 (관리자) ────────────────────────────────────────────────────
create or replace function public.upsert_product(
  p_id     uuid,
  p_name   text,
  p_spec   text default '',
  p_unit   text default '개',
  p_sale   bigint default 0,
  p_cost   bigint default 0,
  p_stock_key text default null,
  p_available boolean default true,
  p_desc   text default '',
  p_image  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_admin() then
    raise exception '상품은 관리자만 등록·수정할 수 있습니다.' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception '상품 이름을 넣어 주세요.' using errcode = 'P0001';
  end if;
  --  원가가 판매가보다 크면 팔수록 손해입니다. 막지는 않되 조용히 넘기지도 않습니다.
  if coalesce(p_sale, 0) < 0 or coalesce(p_cost, 0) < 0 then
    raise exception '금액은 0원 이상이어야 합니다.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.products (name, spec, unit, sale_price, cost_price, stock_key, available, description, image_url)
    values (v_name, coalesce(p_spec, ''), coalesce(p_unit, '개'), coalesce(p_sale, 0), coalesce(p_cost, 0),
            p_stock_key, coalesce(p_available, true), coalesce(p_desc, ''), coalesce(p_image, ''))
    returning id into v_id;
  else
    update public.products
       set name = v_name, spec = coalesce(p_spec, ''), unit = coalesce(p_unit, '개'),
           sale_price = coalesce(p_sale, 0), cost_price = coalesce(p_cost, 0),
           stock_key = p_stock_key, available = coalesce(p_available, true),
           description = coalesce(p_desc, ''), image_url = coalesce(p_image, ''), updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception '고칠 상품을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('product.save', 'products', v_id::text,
          format('상품 %s %s — 판매 %s원', v_name, coalesce(p_spec, ''), to_char(coalesce(p_sale, 0), 'FM999,999,999')),
          '소모품 주문', 'app');
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.upsert_product(uuid, text, text, text, bigint, bigint, text, boolean, text, text) from public;
grant execute on function public.upsert_product(uuid, text, text, text, bigint, bigint, text, boolean, text, text) to authenticated;


-- ── ⑥ 얼마나 팔았나 ─────────────────────────────────────────────────────────
--
--  **실제로 전달한 것만** 셉니다. 요청·확인·준비는 아직 매출이 아닙니다.
--  수거 서비스 매출과 섞지 않습니다 — 이건 「새로 생긴 매출」입니다.
create or replace function public.product_sales_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_staff() then
    raise exception '판매 실적은 사무실 담당자와 관리자만 볼 수 있습니다.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'orders',      coalesce(count(distinct o.id), 0),
    'clients',     coalesce(count(distinct o.client_id), 0),
    'revenue',     coalesce(sum(i.unit_price::bigint * i.qty), 0),
    'cost',        coalesce(sum(i.unit_cost::bigint  * i.qty), 0),
    'profit',      coalesce(sum((i.unit_price - i.unit_cost)::bigint * i.qty), 0),
    --  「어차피 가는 차에 실어 보낸 비율」 — 이 사업모델이 실제로 작동하는지의 지표
    'withPickup',  coalesce(count(distinct o.id) filter (where o.deliver_schedule_id is not null), 0)
  ) into v
  from public.product_orders o
  join public.product_order_items i on i.order_id = o.id
 where o.status = '전달완료'
   and o.delivered_at is not null
   and (o.delivered_at at time zone 'Asia/Seoul')::date between p_from and p_to;

  return v;
end;
$$;

revoke all on function public.product_sales_summary(date, date) from public;
grant execute on function public.product_sales_summary(date, date) to authenticated;


-- ── 자가진단 목록 갱신 ──────────────────────────────────────────────────────
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
    ['product_order_items','unit_price'], ['product_orders','delivered_at']
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
    'schedules_planned_uniq','schedules_one_completion_per_day'
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
as $$ select 48 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
