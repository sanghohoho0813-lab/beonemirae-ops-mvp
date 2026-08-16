-- ════════════════════════════════════════════════════════════════════════════
-- 0057 — 전달완료한 소모품이 그 달 청구에 실리게
--
--  0048 로 소모품 주문을 받고, 화면까지 만들고, 전달완료에서 재고를 빼는
--  데까지 왔습니다. 그런데 **그 판매가 청구서에 안 붙었습니다.**
--
--   병원이 주문 → 기사님이 수거 가는 길에 전달 → 전달완료 →
--   ...그리고 끝. 월말 청구에는 수거·용기만 담겼습니다.
--
--  즉 **물건은 나갔는데 받을 돈이 장부에 없습니다.** 이사님이 따로 기억해
--  두었다가 엑셀이나 전화로 붙이지 않으면 그대로 사라지는 돈입니다.
--
-- ── 이 마이그레이션이 하는 일 ───────────────────────────────────────────────
--
--  화면(정산·명세서·월말청구)은 앱에서 고쳤습니다. 서버가 할 일은 하나 —
--  **같은 주문이 두 번 청구되지 않게** 잠그는 것입니다.
--
--   ① 청구 스냅샷에 담긴 orderIds 가 그 달의 다른 살아 있는 청구에
--     이미 들어 있으면 거절합니다 (수거·자재와 똑같은 규칙).
--   ② 그 주문이 **정말 이 거래처의 전달완료 주문인지** 서버가 다시 봅니다.
--     아직 전달 안 한 주문을 청구하면 물건도 없이 돈을 달라는 것이 됩니다.
--   ③ 소모품만 있는 달도 청구할 수 있게 합니다. 지금은 수거·자재가 없으면
--     「청구에 담을 기록이 없습니다」로 막혀, 소모품만 판 달은 청구가
--     아예 안 만들어집니다.
--
--  ⚠ 금액은 서버가 만들지 않습니다. 지금까지처럼 화면이 계산한 금액을
--    받습니다 — 이 판에서 계산 방식을 서버로 옮기면 두 곳이 서로 다른
--    답을 낼 위험만 새로 생깁니다. 서버가 하는 일은 **중복 차단**입니다.
--
-- ── 기존 데이터 영향 ────────────────────────────────────────────────────────
--   · 표를 만들지도 지우지도 않습니다. 칸도 안 늘립니다.
--   · 이미 확정한 청구는 하나도 안 바뀝니다 (굳어 둔 값 그대로).
--   · 옛 청구 스냅샷에는 orderIds 가 없습니다 — 없으면 빈 목록으로 봅니다.
--   · RLS 는 한 줄도 안 건드립니다.
--   · 두 번 실행해도 안전합니다.
--
--  실행 순서: RUN_1 ~ RUN_42 뒤에 실행합니다.
-- ════════════════════════════════════════════════════════════════════════════

--  0042 의 함수를 그대로 두고 **소모품 주문 확인만** 더합니다.
--  나머지 검사(권한·거래처 잠금·중복 수거·중복 자재·월정액 예외·감사기록)는
--  글자 하나 건드리지 않았습니다 — 기억으로 다시 쓰면 지키던 것이 조용히
--  빠집니다.
create or replace function public.confirm_billing(
  p_client_id uuid,
  p_month     text,
  p_amount    bigint,
  p_snapshot  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_new_s  text[];
  v_new_m  text[];
  v_new_o  text[];
  v_dup    text;
  v_bad    int;
  v_id     uuid;
  v_kind   text := coalesce(p_snapshot->>'kind', '정기');
  v_flat   boolean := false;
  v_first  date;
  v_last   date;
begin
  if not public.is_staff() then
    raise exception '청구 확정은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '청구월이 올바르지 않습니다: %', coalesce(p_month, '(없음)') using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '청구액은 0원보다 커야 합니다.' using errcode = 'P0001';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception '확정할 명세 내용이 없습니다.' using errcode = 'P0001';
  end if;

  --  거래처 행을 잠그고 시작합니다 (0040). 이 한 줄이 「동시에 눌러도
  --  두 번 청구되지 않는다」를 만듭니다.
  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception '청구할 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  이번에 청구하려는 수거·자재·소모품
  select coalesce(array_agg(x), '{}') into v_new_s
    from jsonb_array_elements_text(coalesce(p_snapshot->'scheduleIds', '[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_new_m
    from jsonb_array_elements_text(coalesce(p_snapshot->'materialIds', '[]'::jsonb)) x;
  --  옛 화면은 이 칸을 안 보냅니다 — 없으면 빈 목록입니다.
  select coalesce(array_agg(x), '{}') into v_new_o
    from jsonb_array_elements_text(coalesce(p_snapshot->'orderIds', '[]'::jsonb)) x;

  --  ── 0057 ──────────────────────────────────────────────────────────────
  --  소모품 주문이 정말 이 거래처의 **전달완료** 주문인지 서버가 다시 봅니다.
  --  아직 전달하지 않은 주문을 청구하면 물건 없이 돈을 달라는 것이 됩니다.
  if array_length(v_new_o, 1) is not null then
    select count(*) into v_bad
      from unnest(v_new_o) as x(id)
     where not exists (
       select 1 from public.product_orders o
        where o.id = x.id::uuid
          and o.client_id = p_client_id
          and o.status = '전달완료'
     );
    if v_bad > 0 then
      raise exception '아직 전달완료되지 않은 소모품 주문이 %건 있습니다. 전달완료로 바꾼 뒤에 청구해 주세요.', v_bad
        using errcode = 'P0001';
    end if;
  end if;

  if array_length(v_new_s, 1) is null
     and array_length(v_new_m, 1) is null
     and array_length(v_new_o, 1) is null then
    --  ── 0042 ────────────────────────────────────────────────────────────
    --  수거·자재·소모품이 하나도 없는 청구는 원칙적으로 막습니다. 근거 없는
    --  청구가 만들어지는 길이기 때문입니다. 딱 하나 예외가 월정액 계약입니다 —
    --  배출이 없어도 계약서상 받는 곳이 실제로 있습니다(오남한양·해올).
    v_first := (p_month || '-01')::date;
    v_last  := (v_first + interval '1 month - 1 day')::date;
    v_flat  := coalesce(v_client.flat_fee_when_empty, false)
               and (v_client.contract_start is null or v_client.contract_start <= v_first)
               and (v_client.contract_end   is null or v_client.contract_end   >= v_last);

    if not v_flat then
      raise exception '청구에 담을 수거·자재 기록이 없습니다.' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.payments
       where client_id = p_client_id and billing_month = p_month and status <> '취소'
    ) then
      raise exception '이 달에는 이미 청구가 있습니다 — 월정액은 달에 한 번입니다. 화면을 새로 고쳐 확인해 주세요.'
        using errcode = 'P0001';
    end if;
  end if;

  --  같은 달에 이미 확정한 청구가 덮은 수거·자재와 겹치는지
  --  (취소한 청구는 없는 것으로 봅니다 — 다시 청구할 수 있어야 합니다)
  select x into v_dup
    from public.payments p,
         lateral jsonb_array_elements_text(coalesce(p.snapshot->'scheduleIds', '[]'::jsonb)) x
   where p.client_id = p_client_id and p.billing_month = p_month
     and p.status <> '취소' and x = any(v_new_s)
   limit 1;
  if v_dup is not null then
    raise exception '이미 청구한 수거가 들어 있습니다. 다른 사람이 방금 확정했을 수 있습니다 — 화면을 새로 고쳐 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  select x into v_dup
    from public.payments p,
         lateral jsonb_array_elements_text(coalesce(p.snapshot->'materialIds', '[]'::jsonb)) x
   where p.client_id = p_client_id and p.billing_month = p_month
     and p.status <> '취소' and x = any(v_new_m)
   limit 1;
  if v_dup is not null then
    raise exception '이미 청구한 자재 공급이 들어 있습니다. 화면을 새로 고쳐 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  --  ── 0057 ──────────────────────────────────────────────────────────────
  --  소모품 주문도 같은 규칙입니다. 이것이 없으면 창을 두 개 열어 두고
  --  두 번 확정할 때 같은 물건이 두 번 청구됩니다.
  select x into v_dup
    from public.payments p,
         lateral jsonb_array_elements_text(coalesce(p.snapshot->'orderIds', '[]'::jsonb)) x
   where p.client_id = p_client_id and p.billing_month = p_month
     and p.status <> '취소' and x = any(v_new_o)
   limit 1;
  if v_dup is not null then
    raise exception '이미 청구한 소모품 주문이 들어 있습니다. 화면을 새로 고쳐 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  insert into public.payments
    (client_id, billing_month, amount, status, method, paid_at, memo, snapshot)
  values
    (p_client_id, p_month, p_amount, '미수금', '무통장', null,
     format('%s 청구', v_kind), p_snapshot)
  returning id into v_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('payment.confirm', 'payments', v_id::text, p_client_id, v_client.name,
     jsonb_build_object('amount', p_amount, 'month', p_month, 'kind', v_kind,
                        'collections', coalesce(array_length(v_new_s, 1), 0),
                        'supplies', coalesce(array_length(v_new_m, 1), 0),
                        'products', coalesce(array_length(v_new_o, 1), 0)),
     format('%s %s %s 청구 확정 — %s원 (수거 %s건 · 공급 %s건 · 소모품 %s건)',
            v_client.name, p_month, v_kind, to_char(p_amount, 'FM999,999,999'),
            coalesce(array_length(v_new_s, 1), 0),
            coalesce(array_length(v_new_m, 1), 0),
            coalesce(array_length(v_new_o, 1), 0)),
     '월말 청구', 'app');

  return jsonb_build_object('id', v_id, 'amount', p_amount, 'month', p_month, 'kind', v_kind,
                            'products', coalesce(array_length(v_new_o, 1), 0));
end;
$$;

revoke all on function public.confirm_billing(uuid, text, bigint, jsonb) from public;
grant execute on function public.confirm_billing(uuid, text, bigint, jsonb) to authenticated;

comment on function public.confirm_billing(uuid, text, bigint, jsonb) is
  '청구 확정 (0057). 같은 수거·자재·소모품 주문을 두 번 청구할 수 없고, 전달완료가 아닌 주문은 청구할 수 없습니다.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 57 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
