-- 비원미래 운영 DB — 24차 (0037)
-- 돈 기록 잠금 (확정한 청구·받은 입금). 앞의 묶음(RUN_1~22)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0037_money_lock.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0037. 돈 기록 잠금 — 확정한 청구와 받은 입금
--
--  무엇이 문제였나
--
--   청구(payments)와 입금(payment_receipts) 두 표는 지금까지 사무실
--   권한이면 **아무 값이나 직접 고치고 지울 수 있었습니다.** RLS 정책이
--   `for all using (is_staff())` 한 줄뿐이라 select·insert·update·delete 가
--   전부 열려 있었습니다. 그래서:
--
--    1) **입금이 들어온 청구를 취소할 수 있었습니다.**
--       500만원을 받아 기록해 둔 청구를 취소하면 그 청구는 모든 합계에서
--       빠집니다(취소는 청구한 적 없는 것으로 셉니다). 그런데 입금 기록은
--       그대로 남습니다. **실제로 받은 돈이 장부 어디에도 잡히지 않게
--       됩니다.** 매출도, 미수금도, 입금액도 아닌 상태가 됩니다.
--
--    2) **확정한 청구의 금액·청구월·명세서를 나중에 바꿀 수 있었습니다.**
--       확정 순간의 명세서를 스냅샷으로 얼려 두는 이유(0017·0032)는
--       병원에 보낸 종이와 장부가 같아야 하기 때문입니다. 그런데 그 값을
--       표에서 직접 고치면 **병원이 받은 명세서와 우리 장부가 갈립니다.**
--       화면에 그런 버튼이 없다는 것이 유일한 방어선이었습니다.
--
--    3) **청구와 입금을 통째로 지울 수 있었습니다.**
--       지우면 「그런 청구는 없었다」가 됩니다. 병원과 금액을 두고 다툴 때
--       근거가 사라지고, 감사기록도 남지 않습니다. 같은 달 중복 확정을
--       막아 둔 규칙(0032)도 행을 지우면 그냥 우회됩니다.
--
--   화면에는 그런 기능이 없었습니다. 하지만 **화면은 방어선이 아닙니다.**
--   브라우저 콘솔·다른 도구·앞으로 만들 코드가 같은 열쇠로 같은 표에
--   닿습니다. 돈에 관한 불변식은 서버가 지켜야 합니다.
--
--  무엇을 막는가
--
--   지울 수 없음        청구·입금 두 표에서 delete 권한을 거둡니다.
--                       입금 취소는 지금처럼 함수(delete_payment_receipt)로,
--                       청구 취소는 「취소」 상태로 남깁니다.
--   금액은 굳음         확정한 청구의 거래처·청구월·금액·명세서는 바꿀 수
--                       없습니다. 틀렸으면 취소하고 다시 확정합니다.
--   되살리기 없음       취소한 청구를 다른 상태로 되돌리지 않습니다.
--                       다시 청구해야 하면 새로 확정합니다(0032 가 허용).
--   받은 돈은 남음      입금이 한 건이라도 있는 청구는 취소할 수 없습니다.
--                       입금을 먼저 취소해야 합니다 — 그 순간 감사기록이
--                       남고, 받은 돈이 조용히 사라지지 않습니다.
--
--  바꾸지 않는 것
--
--   상태(미수금·확인필요·입금완료)와 입금일·수단·메모는 그대로 고칠 수
--   있습니다. 실제 업무에서 손대는 값들입니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. 청구 표 권한 좁히기 ──────────────────────────────────────────────────
--
--  `for all` 한 줄을 select / insert / update 로 나눕니다. delete 정책을
--  만들지 않는 것이 곧 「아무도 지울 수 없음」입니다(감사로그와 같은 방식).

drop policy if exists payments_write  on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
drop policy if exists payments_delete on public.payments;

create policy payments_insert on public.payments
  for insert with check (public.is_staff());
create policy payments_update on public.payments
  for update using (public.is_staff()) with check (public.is_staff());
--  delete 정책 없음 — 확정한 청구는 지우지 않고 「취소」로 남깁니다.

revoke delete on public.payments from authenticated;

--  입금 기록은 넣는 것도 지우는 것도 함수로만 합니다(0026·0031). 함수는
--  security definer 라 표 권한과 무관하게 동작하므로, 여기서 직접 쓰기를
--  거둬도 화면 동작은 그대로입니다.
drop policy if exists pr_write  on public.payment_receipts;
drop policy if exists pr_update on public.payment_receipts;
drop policy if exists pr_delete on public.payment_receipts;

revoke insert, update, delete on public.payment_receipts from authenticated;


-- ── 2. 확정한 청구가 지켜야 할 것 ───────────────────────────────────────────

create or replace function public.payments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid bigint;
begin
  if tg_op = 'DELETE' then
    raise exception '확정한 청구는 지우지 않습니다. 잘못 만든 청구는 「취소」로 남겨 주세요 — 지우면 병원과 금액을 두고 다툴 때 근거가 사라집니다.'
      using errcode = 'P0001';
  end if;

  --  확정 순간에 굳는 값. 병원이 받은 명세서와 우리 장부가 갈리지 않게.
  if new.client_id     is distinct from old.client_id
     or new.billing_month is distinct from old.billing_month
     or new.amount       is distinct from old.amount
     or new.snapshot     is distinct from old.snapshot then
    raise exception '확정한 청구의 거래처·청구월·금액·명세서는 바꿀 수 없습니다. 금액이 틀렸다면 취소한 뒤 다시 확정해 주세요.'
      using errcode = 'P0001';
  end if;

  --  취소한 청구를 되살리지 않습니다. 다시 청구해야 하면 새로 확정합니다.
  if old.status = '취소' and new.status <> '취소' then
    raise exception '취소한 청구는 되살리지 않습니다. 다시 청구해야 하면 새로 확정해 주세요 — 취소 기록은 그대로 남습니다.'
      using errcode = 'P0001';
  end if;

  --  받은 돈이 장부에서 사라지지 않게 합니다.
  if new.status = '취소' and old.status <> '취소' then
    select coalesce(sum(amount), 0) into v_paid
      from public.payment_receipts where payment_id = old.id;
    if v_paid > 0 then
      raise exception '이 청구에는 입금 %원이 이미 기록되어 있습니다. 입금을 먼저 취소한 뒤 청구를 취소해 주세요 — 받은 돈이 장부에서 사라지지 않게 하는 규칙입니다.',
        to_char(v_paid, 'FM999,999,999') using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_guard_upd on public.payments;
create trigger payments_guard_upd
  before update on public.payments
  for each row execute function public.payments_guard();

drop trigger if exists payments_guard_del on public.payments;
create trigger payments_guard_del
  before delete on public.payments
  for each row execute function public.payments_guard();

comment on function public.payments_guard() is
  '확정한 청구의 불변식 (0037). 금액·명세서는 굳고, 지울 수 없고, 입금이 있으면 취소할 수 없습니다.';


-- ── 3. 청구 취소 (함수로) ───────────────────────────────────────────────────
--
--  지금까지 화면이 표를 직접 고치고 감사기록을 따로 남겼습니다. 둘이
--  갈라져 있어서 상태만 바뀌고 기록이 안 남는 일이 생길 수 있었습니다.
--  한 트랜잭션으로 묶습니다.

create or replace function public.cancel_billing(
  p_payment_id uuid,
  p_reason     text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay    public.payments%rowtype;
  v_client public.clients%rowtype;
  v_actor  public.profiles%rowtype;
  v_paid   bigint;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '청구 취소는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception '취소할 청구를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_pay.status = '취소' then
    raise exception '이미 취소한 청구입니다.' using errcode = 'P0001';
  end if;

  --  트리거도 같은 것을 막습니다. 여기서 먼저 보는 것은 사람이 읽을 수
  --  있는 안내를 주기 위해서입니다.
  select coalesce(sum(amount), 0) into v_paid
    from public.payment_receipts where payment_id = p_payment_id;
  if v_paid > 0 then
    raise exception '이 청구에는 입금 %원이 이미 기록되어 있습니다. 거래처 화면에서 입금을 먼저 취소한 뒤 청구를 취소해 주세요.',
      to_char(v_paid, 'FM999,999,999') using errcode = 'P0001';
  end if;

  update public.payments
     set status = '취소', canceled_at = now()
   where id = p_payment_id;

  select * into v_client from public.clients where id = v_pay.client_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, after_data, summary, screen, source)
  values
    ('payment.cancel', 'payments', p_payment_id::text, v_pay.client_id, coalesce(v_client.name, ''),
     jsonb_build_object('status', v_pay.status, 'amount', v_pay.amount,
                        'billingMonth', v_pay.billing_month),
     jsonb_build_object('status', '취소', 'reason', coalesce(p_reason, '')),
     format('%s %s월 청구 %s원 취소%s',
            coalesce(v_client.name, '거래처'), v_pay.billing_month,
            to_char(v_pay.amount, 'FM999,999,999'),
            case when coalesce(btrim(p_reason), '') = '' then '' else ' — ' || btrim(p_reason) end),
     '결제·미수금', 'app');

  return jsonb_build_object('id', p_payment_id, 'status', '취소',
                            'amount', v_pay.amount, 'month', v_pay.billing_month);
end;
$$;

revoke all on function public.cancel_billing(uuid, text) from public;
grant execute on function public.cancel_billing(uuid, text) to authenticated;

comment on function public.cancel_billing(uuid, text) is
  '청구 취소 (0037). 입금이 있으면 거부하고, 상태 변경과 감사기록을 한 트랜잭션으로 묶습니다.';


-- ── 4. 입금 취소가 취소된 청구를 되살리지 않게 ──────────────────────────────
--
--  0026 의 delete_payment_receipt 는 남은 입금 합계만 보고 상태를
--  「입금완료 / 미수금」 둘 중 하나로 다시 정합니다. 0037 이전에 만들어진
--  자료 중 **취소된 청구에 입금이 달려 있는 건**이 있으면, 그 입금을
--  지우는 순간 청구가 미수금으로 되살아납니다. 취소는 그대로 둡니다.

create or replace function public.delete_payment_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      public.payment_receipts%rowtype;
  v_pay    public.payments%rowtype;
  v_client public.clients%rowtype;
  v_actor  public.profiles%rowtype;
  v_after  bigint;
  v_status text;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '입금 기록 삭제는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_r from public.payment_receipts where id = p_receipt_id;
  if not found then
    raise exception '지울 입금 기록을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  select * into v_pay from public.payments where id = v_r.payment_id for update;

  delete from public.payment_receipts where id = p_receipt_id;

  select coalesce(sum(amount), 0) into v_after
    from public.payment_receipts where payment_id = v_r.payment_id;

  --  취소한 청구는 취소인 채로 둡니다 (0037).
  v_status := case
    when v_pay.status = '취소' then '취소'
    when v_after >= v_pay.amount then '입금완료'
    else '미수금'
  end;
  update public.payments set
    status  = v_status,
    paid_at = case when v_status = '입금완료' then paid_at else null end
  where id = v_r.payment_id;

  select * into v_client from public.clients where id = v_pay.client_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, summary, screen, source)
  values
    ('payment.receipt.delete', 'payment_receipts', p_receipt_id::text, v_pay.client_id,
     coalesce(v_client.name, ''),
     jsonb_build_object('paymentId', v_r.payment_id, 'receivedOn', v_r.received_on,
                        'amount', v_r.amount, 'method', v_r.method),
     format('입금 기록 삭제 — %s %s월 · %s원 (%s) · 남은 누적 %s / %s원',
            coalesce(v_client.name, '거래처'), v_pay.billing_month,
            to_char(v_r.amount, 'FM999,999,999'), v_r.method,
            to_char(v_after, 'FM999,999,999'), to_char(v_pay.amount, 'FM999,999,999')),
     '결제·미수금', 'app');

  return jsonb_build_object('paidTotal', v_after,
                            'outstanding', v_pay.amount - v_after, 'status', v_status);
end;
$$;

revoke all on function public.delete_payment_receipt(uuid) from public;
grant execute on function public.delete_payment_receipt(uuid) to authenticated;


-- ── 5. 이미 어긋나 있는 것 ──────────────────────────────────────────────────
--
--  0037 이전에 「입금이 있는 청구를 취소」한 건이 있으면 그 돈은 지금 어느
--  합계에도 잡히지 않습니다. 마이그레이션이 자동으로 되돌리지 않습니다 —
--  어느 쪽이 맞는지는 통장을 봐야 알 수 있습니다. 화면(미수금 관리)이 그런
--  건을 찾아 그대로 보여 주고, 사람이 판단합니다.


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 37 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0037). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
