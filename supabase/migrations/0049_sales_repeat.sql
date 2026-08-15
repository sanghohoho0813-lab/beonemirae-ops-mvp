-- ════════════════════════════════════════════════════════════════════════════
-- 0049 — 판매 실적에 「다시 산 곳」 더하기
--
--  0048 의 실적 요약은 매출·원가·이익·주문 수·거래처 수·수거 때 전달 여섯 개만
--  냈습니다. 그런데 이 사업이 진짜인지 아닌지를 가르는 숫자는 따로 있습니다 —
--  **같은 병원이 두 번째로 샀는가.**
--
--   한 번은 호의일 수 있습니다. 두 번째부터가 매출입니다. 한 번씩만 사고 아무도
--   다시 안 사면, 매출이 늘어도 이 사업모델은 틀린 것이고 그것을 빨리 알아야
--   합니다.
--
--  기존 데이터 영향 — **없습니다.** 표를 만들지도, 고치지도, 지우지도 않습니다.
--  읽기 전용 함수 하나를 다시 만들 뿐입니다(반환 칸 두 개 추가).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 실적 요약 — 「다시 산 곳」과 「몇 번째 주문인지」를 함께 ────────────────────
--
--  세는 규칙을 그대로 적습니다. 나중에 숫자가 이상해 보일 때 이 주석이 답입니다.
--
--   · 여전히 **전달을 마친 주문만** 셉니다. 요청·확인·준비는 매출이 아닙니다.
--   · `repeatClients` — 이 기간에 산 거래처 중, **그전에도 받아 간 적이 있는**
--     곳의 수. 기간을 잘라서 세지 않습니다 — 작년에 처음 사고 이번 달에 다시
--     산 병원은 「다시 산 곳」이 맞습니다.
--   · `repeatOrders` — 이 기간 주문 중 그 거래처의 첫 주문이 아닌 것의 수.
--   · 한 번도 안 팔렸으면 전부 0 입니다. **0 을 감추지 않습니다.**
create or replace function public.product_sales_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_repeat_clients integer;
  v_repeat_orders  integer;
begin
  if not public.is_staff() then
    raise exception '판매 실적은 사무실 담당자와 관리자만 볼 수 있습니다.' using errcode = 'P0001';
  end if;

  --  전달을 마친 주문 = 이 함수가 보는 세상 전부.
  with done as (
    select o.id, o.client_id,
           (o.delivered_at at time zone 'Asia/Seoul')::date as on_date
      from public.product_orders o
     where o.status = '전달완료'
       and o.delivered_at is not null
  ),
  --  이 기간 주문마다 「그전에 이 병원이 받아 간 적이 있는가」를 붙입니다.
  in_range as (
    select d.id, d.client_id,
           exists (select 1 from done e
                    where e.client_id = d.client_id
                      and (e.on_date < d.on_date
                           or (e.on_date = d.on_date and e.id < d.id))) as is_repeat
      from done d
     where d.on_date between p_from and p_to
  )
  select count(*) filter (where is_repeat),
         count(distinct client_id) filter (where is_repeat)
    into v_repeat_orders, v_repeat_clients
    from in_range;

  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'orders',      coalesce(count(distinct o.id), 0),
    'clients',     coalesce(count(distinct o.client_id), 0),
    'revenue',     coalesce(sum(i.unit_price::bigint * i.qty), 0),
    'cost',        coalesce(sum(i.unit_cost::bigint  * i.qty), 0),
    'profit',      coalesce(sum((i.unit_price - i.unit_cost)::bigint * i.qty), 0),
    --  「어차피 가는 차에 실어 보낸 비율」 — 이 사업모델이 실제로 작동하는지의 지표
    'withPickup',  coalesce(count(distinct o.id) filter (where o.deliver_schedule_id is not null), 0),
    --  「한 번은 호의, 두 번째부터가 매출」
    'repeatClients', coalesce(v_repeat_clients, 0),
    'repeatOrders',  coalesce(v_repeat_orders, 0)
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


-- ── DB 버전 ──────────────────────────────────────────────────────────────────
--
--  표·색인·잠금은 하나도 안 바뀌었으므로 `app_health_check()` 의 목록은
--  그대로 둡니다. 함수 목록에 `product_sales_summary` 는 0048 에서 이미
--  들어 있습니다.

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 49 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
