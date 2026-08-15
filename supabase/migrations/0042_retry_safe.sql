-- ─────────────────────────────────────────────────────────────────────────────
-- 0042. 다시 눌러도 안전하게 · 수거 0건인 달의 월정액
--
--  경계조건을 공격적으로 재현하다 나온 것 두 가지입니다. 둘 다 돈입니다.
--
--  ── ① 같은 입금을 다시 누르면 두 번 기록됩니다 ─────────────────────────
--
--   실제로 이렇게 됩니다.
--    사무실에서 입금 30만원을 넣고 저장을 누릅니다. 서버에는 들어갔는데
--    **응답이 오는 길에** 통신이 끊깁니다. 화면에는 「저장하지 못했습니다」가
--    뜹니다. 담당자는 당연히 다시 누릅니다.
--
--   격리 DB 에서 재현했습니다 — 청구 100만원에 30만원 입금을 두 번 저장하니
--   **입금 2줄 · 60만원**이 되고 미수금이 70만원에서 40만원으로 줄었습니다.
--   오류가 안 나기 때문에 아무도 모릅니다. 통장을 맞춰 보기 전까지는
--   시스템이 「덜 받아야 할 돈」을 보여 줍니다.
--
--   막는 방법은 「같은 금액을 막는 것」이 아닙니다 — 병원이 오전·오후에
--   같은 금액을 나눠 보내는 일이 실제로 있고, 그건 두 줄이 맞습니다.
--   **「같은 저장 시도」인지**를 화면이 알려 주게 합니다(request_id).
--   화면은 저장 창을 열 때 표를 하나 만들고, 실패해서 다시 눌러도 같은
--   표를 냅니다. 값을 고치거나 새로 열면 새 표를 냅니다.
--
--   같은 표가 두 번 오면 **오류를 내지 않고** 처음 결과를 그대로 돌려줍니다.
--   담당자에게는 「저장됐습니다」로 보이고, 장부에는 한 줄만 남습니다.
--
--  ── ② 수거가 0건인 달의 월정액을 확정할 수 없었습니다 ──────────────────
--
--   월정액 계약(오남한양 월 900만 · 해올 130만+300만)은 그 달에 배출이
--   없어도 계약서상 청구합니다. 0035 에서 화면이 그런 달을 **「청구 준비됨」**
--   으로 올려 주게 만들었습니다.
--
--   그런데 확정하는 함수는 「청구에 담을 수거·자재 기록이 없습니다」라며
--   거부했습니다. 화면에는 900만원이 청구 가능하다고 떠 있는데 누르면
--   막힙니다. 그 달 청구서는 결국 **엑셀로 만들게 됩니다.**
--
--   빈 청구를 무조건 허용하면 안 됩니다 — 아무 근거 없는 청구가 만들어지는
--   길이 열립니다. 세 가지가 모두 맞을 때만 받습니다.
--     · 거래처에 「수거 0건에도 월정액 청구」가 켜져 있고 (사람이 계약서를 보고 켬)
--     · 계약 기간 안이고
--     · 그 달에 살아 있는 청구가 아직 없을 때
--   즉 **달에 한 번**만 만들어집니다. 다시 눌러도 두 번 나가지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ① 저장 시도를 알아보는 표 ───────────────────────────────────────────────
alter table public.payment_receipts
  add column if not exists request_id uuid;

comment on column public.payment_receipts.request_id is
  '화면이 만든 저장 시도 표 (0042). 같은 표가 다시 오면 새로 넣지 않고 처음 것을 돌려줍니다.';

--  같은 표는 한 번만. 표가 없는 옛 줄들끼리는 서로 막지 않습니다.
create unique index if not exists payment_receipts_request_uniq
  on public.payment_receipts (request_id) where request_id is not null;


create or replace function public.add_payment_receipt(
  p_payment_id  uuid,
  p_received_on date,
  p_amount      bigint,
  p_method      text default '계좌이체',
  p_memo        text default '',
  p_source_ref  text default null,
  p_request_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay    public.payments%rowtype;
  v_actor  public.profiles%rowtype;
  v_client public.clients%rowtype;
  v_before bigint;
  v_after  bigint;
  v_id     uuid;
  v_status text;
  v_ref    text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_old    public.payment_receipts%rowtype;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '입금 기록은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception '입금을 기록할 청구를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  ── 0042 · 이 저장은 이미 들어와 있는가 ────────────────────────────────
  --   통신이 끊긴 줄 알고 다시 누른 경우입니다. 화면이 저장 창을 열 때 만든
  --   표(request_id)가 같으면 **같은 저장**이라는 뜻입니다.
  --
  --   청구 행을 잠근 뒤에 봅니다. 두 요청이 같은 순간에 들어와도 뒤엣것은
  --   앞엣것이 끝난 다음에야 이 줄에 닿으므로, 「둘 다 없다고 보고 둘 다
  --   넣는」 일이 생기지 않습니다.
  --
  --   오류를 내지 않습니다 — 담당자는 잘못한 게 없고, 장부에는 이미 한 줄이
  --   제대로 들어가 있습니다. 처음 결과를 그대로 돌려줍니다.
  if p_request_id is not null then
    select * into v_old from public.payment_receipts where request_id = p_request_id;
    if found then
      if v_old.payment_id <> p_payment_id then
        raise exception '이 저장 표는 다른 청구에 이미 쓰였습니다.' using errcode = 'P0001';
      end if;
      select coalesce(sum(amount), 0) into v_after
        from public.payment_receipts where payment_id = p_payment_id;
      return jsonb_build_object('id', v_old.id, 'paidTotal', v_after,
                                'outstanding', v_pay.amount - v_after,
                                'status', v_pay.status, 'alreadySaved', true);
    end if;
  end if;
  if v_pay.status = '취소' then
    raise exception '취소된 청구에는 입금을 기록할 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '입금액은 0원보다 커야 합니다.' using errcode = 'P0001';
  end if;
  if p_received_on is null then
    raise exception '입금일을 넣어 주세요.' using errcode = 'P0001';
  end if;
  if p_received_on > v_today then
    raise exception '아직 오지 않은 날짜(%)로는 입금을 기록할 수 없습니다.', p_received_on
      using errcode = 'P0001';
  end if;

  --  같은 통장 줄이 이미 들어와 있으면 거부합니다. 파일을 다시 올리거나
  --  버튼을 두 번 눌러도 돈이 두 배가 되지 않게 합니다.
  if v_ref is not null and exists (
    select 1 from public.payment_receipts where source_ref = v_ref
  ) then
    raise exception '이미 기록한 통장 입금입니다 (%). 같은 줄을 두 번 넣지 않습니다.', v_ref
      using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_before
    from public.payment_receipts where payment_id = p_payment_id;
  if v_before = 0 and v_pay.status = '입금완료' then
    v_before := v_pay.amount;
  end if;

  v_after := v_before + p_amount;
  if v_after > v_pay.amount then
    raise exception '입금 합계가 청구액을 넘습니다. 청구 %원 · 이미 받은 %원 · 이번 %원',
      v_pay.amount, v_before, p_amount using errcode = 'P0001';
  end if;

  insert into public.payment_receipts
    (payment_id, received_on, amount, method, memo, actor_id, actor_name, source_ref, request_id)
  values
    (p_payment_id, p_received_on, p_amount, coalesce(nullif(p_method, ''), '계좌이체'),
     coalesce(p_memo, ''), v_actor.id, coalesce(v_actor.name, ''), v_ref, p_request_id)
  returning id into v_id;

  v_status := case when v_after >= v_pay.amount then '입금완료' else '미수금' end;
  update public.payments set
    status  = v_status,
    paid_at = case when v_after >= v_pay.amount then (p_received_on + time '00:00')::timestamptz else null end
  where id = p_payment_id;

  select * into v_client from public.clients where id = v_pay.client_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('payment.receipt', 'payment_receipts', v_id::text, v_pay.client_id, coalesce(v_client.name, ''),
     jsonb_build_object('paymentId', p_payment_id, 'receivedOn', p_received_on,
                        'amount', p_amount, 'method', p_method, 'sourceRef', v_ref,
                        'paidBefore', v_before, 'paidAfter', v_after, 'billed', v_pay.amount),
     format('입금 기록 — %s %s월 · %s원 (%s) · 누적 %s / %s원%s%s',
            coalesce(v_client.name, '거래처'), v_pay.billing_month,
            to_char(p_amount, 'FM999,999,999'), p_method,
            to_char(v_after, 'FM999,999,999'), to_char(v_pay.amount, 'FM999,999,999'),
            case when v_after >= v_pay.amount then ' · 완납' else '' end,
            case when v_ref is null then '' else ' · 통장 대사' end),
     '결제·미수금', 'app');

  return jsonb_build_object('id', v_id, 'paidTotal', v_after,
                            'outstanding', v_pay.amount - v_after, 'status', v_status,
                            'alreadySaved', false);
end;
$$;

revoke all on function public.add_payment_receipt(uuid, date, bigint, text, text, text, uuid) from public;
grant execute on function public.add_payment_receipt(uuid, date, bigint, text, text, text, uuid) to authenticated;

comment on function public.add_payment_receipt(uuid, date, bigint, text, text, text, uuid) is
  '입금 기록 + 청구 상태 갱신 (0026·0027·0031·0042). 같은 저장 표(request_id)가 다시 오면 새로 넣지 않습니다.';

--  옛 시그니처(6인자)를 지웁니다. 남겨 두면 화면이 새 칸을 안 보냈을 때
--  조용히 옛 함수가 불려 「다시 눌러도 안전」이 사라집니다.
drop function if exists public.add_payment_receipt(uuid, date, bigint, text, text, text);


-- ── ② 수거 0건인 달의 월정액 ────────────────────────────────────────────────
--
--  0040 의 함수를 그대로 두고, 「빈 청구 거부」 한 군데만 조건부로 바꿉니다.
--  나머지 검사(권한·거래처 잠금·중복 수거·중복 자재·감사기록)는 글자 하나
--  건드리지 않았습니다 — 기억으로 다시 쓰면 지키던 것이 조용히 빠집니다.
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
  v_dup    text;
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
  --  두 번 청구되지 않는다」를 만듭니다 — 아래 확인이 끝나고 넣을 때까지
  --  다른 접속이 끼어들 수 없습니다.
  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception '청구할 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  이번에 청구하려는 수거·자재
  select coalesce(array_agg(x), '{}') into v_new_s
    from jsonb_array_elements_text(coalesce(p_snapshot->'scheduleIds', '[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_new_m
    from jsonb_array_elements_text(coalesce(p_snapshot->'materialIds', '[]'::jsonb)) x;

  if array_length(v_new_s, 1) is null and array_length(v_new_m, 1) is null then
    --  ── 0042 ────────────────────────────────────────────────────────────
    --  수거·자재가 하나도 없는 청구는 원칙적으로 막습니다. 근거 없는 청구가
    --  만들어지는 길이기 때문입니다. 딱 하나 예외가 월정액 계약입니다 —
    --  배출이 없어도 계약서상 받는 곳이 실제로 있습니다(오남한양·해올).
    --
    --  세 가지가 다 맞아야 합니다.
    --   · 「수거 0건에도 월정액 청구」가 켜져 있고 (사람이 계약서를 보고 켬)
    --   · 계약이 그 달 전체를 덮고 (중간에 시작·해지한 달은 사람에게)
    --   · 그 달에 살아 있는 청구가 아직 없을 때 (달에 한 번)
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
                        'supplies', coalesce(array_length(v_new_m, 1), 0)),
     format('%s %s %s 청구 확정 — %s원 (수거 %s건 · 공급 %s건)',
            v_client.name, p_month, v_kind, to_char(p_amount, 'FM999,999,999'),
            coalesce(array_length(v_new_s, 1), 0), coalesce(array_length(v_new_m, 1), 0)),
     '월말 청구', 'app');

  return jsonb_build_object('id', v_id, 'amount', p_amount, 'month', p_month, 'kind', v_kind);
end;
$$;

revoke all on function public.confirm_billing(uuid, text, bigint, jsonb) from public;
grant execute on function public.confirm_billing(uuid, text, bigint, jsonb) to authenticated;

comment on function public.confirm_billing(uuid, text, bigint, jsonb) is
  '청구 확정 (0032·0040·0042). 거래처 행을 잠그고 시작합니다. 수거 0건인 달의 월정액은 계약이 맞을 때만, 달에 한 번.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 42 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0042). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
