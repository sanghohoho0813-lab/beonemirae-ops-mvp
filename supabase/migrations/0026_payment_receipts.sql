-- ─────────────────────────────────────────────────────────────────────────────
-- 0026. 부분입금 — 청구 한 건에 입금 여러 건
--
--  왜 필요한가
--
--   지금까지 입금은 「입금완료 / 미수금」 두 상태뿐이었습니다. 100만원을
--   청구하고 30만원만 들어오면 표현할 방법이 없습니다. 미수금으로 두면
--   30만원을 받은 사실이 사라지고, 입금완료로 두면 70만원을 못 받은 사실이
--   사라집니다. 둘 다 장부가 틀립니다.
--
--   실제 거래처 파일에서 확인했습니다 — 서울인화 거래명세서에 「미납금액」
--   이월 줄이 있습니다. 부분입금이 실제로 일어나는 업무입니다.
--   이사님도 통장별 입금내역을 따로 엑셀로 정리하고 계십니다.
--
--  무엇을 저장하는가
--
--   payment_receipts — 입금 한 건. 언제·얼마·어떻게 받았는지.
--   청구(payments)는 그대로 두고, 입금을 자식으로 답니다. 그래야
--   「청구액 100만 · 입금 30만 · 남은 70만」이 한 줄로 읽힙니다.
--
--  기존 데이터와의 호환
--
--   이미 「입금완료」인 청구는 입금 기록이 없습니다. 화면·계산에서는
--   입금 기록이 없고 상태가 입금완료면 **전액 입금된 것으로** 봅니다
--   (아래 client_receipt_total 이 그렇게 계산합니다). 과거 기록을 손대지
--   않으면서 새 방식이 함께 동작합니다.
--
--  초과 입금
--
--   청구액보다 많이 넣으려 하면 막습니다. 실수로 0 하나 더 치는 자리라
--   조용히 받아 두면 미수금이 마이너스가 되고 그 달 정산이 어긋납니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.payment_receipts (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments(id) on delete cascade,
  --  받은 날 (통장에 찍힌 날). 시간이 아니라 날짜입니다.
  received_on date not null,
  amount      bigint not null check (amount > 0),
  --  실제 업무에 있는 것만 — 계좌이체·카드·현금. 그 외는 기타.
  method      text not null default '계좌이체'
              check (method in ('계좌이체', '카드', '현금', '기타')),
  memo        text not null default '',
  --  누가 넣었는지 (서버가 stamp 합니다)
  actor_id    uuid,
  actor_name  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists payment_receipts_payment_idx
  on public.payment_receipts (payment_id, received_on);

alter table public.payment_receipts enable row level security;

--  돈 기록입니다 — 사무실·관리자만 봅니다(현장 담당자 제외).
drop policy if exists pr_read   on public.payment_receipts;
drop policy if exists pr_write  on public.payment_receipts;
drop policy if exists pr_update on public.payment_receipts;
drop policy if exists pr_delete on public.payment_receipts;

create policy pr_read on public.payment_receipts
  for select using (public.is_staff());
create policy pr_write on public.payment_receipts
  for insert with check (public.is_staff());
create policy pr_update on public.payment_receipts
  for update using (public.is_staff()) with check (public.is_staff());
create policy pr_delete on public.payment_receipts
  for delete using (public.is_staff());

grant select, insert, update, delete on public.payment_receipts to authenticated;

drop trigger if exists payment_receipts_touch on public.payment_receipts;
create trigger payment_receipts_touch
  before update on public.payment_receipts
  for each row execute function public.touch_updated_at();


-- ── 입금 기록 (관리자·사무실) ────────────────────────────────────────────────
--
--  입금을 넣으면 청구 상태도 함께 맞춥니다.
--   · 누적 입금 = 청구액  → 입금완료
--   · 0 < 누적 < 청구액   → 미수금 (부분입금)
--  한 트랜잭션에서 처리하므로 중간 상태가 남지 않습니다.

create or replace function public.add_payment_receipt(
  p_payment_id  uuid,
  p_received_on date,
  p_amount      bigint,
  p_method      text default '계좌이체',
  p_memo        text default ''
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
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '입금 기록은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception '입금을 기록할 청구를 찾을 수 없습니다.' using errcode = 'P0001';
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
  if p_received_on > current_date then
    raise exception '아직 오지 않은 날짜(%)로는 입금을 기록할 수 없습니다.', p_received_on
      using errcode = 'P0001';
  end if;

  --  이미 받은 금액. 입금 기록이 없는데 상태가 입금완료면 전액 받은 것입니다
  --  (0026 이전에 만들어진 청구).
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
    (payment_id, received_on, amount, method, memo, actor_id, actor_name)
  values
    (p_payment_id, p_received_on, p_amount, coalesce(nullif(p_method, ''), '계좌이체'),
     coalesce(p_memo, ''), v_actor.id, coalesce(v_actor.name, ''))
  returning id into v_id;

  v_status := case when v_after >= v_pay.amount then '입금완료' else '미수금' end;
  update public.payments set
    status  = v_status,
    --  완납된 순간의 마지막 입금일을 청구의 입금일로 둡니다(기존 화면 호환).
    paid_at = case when v_after >= v_pay.amount then (p_received_on + time '00:00')::timestamptz else null end
  where id = p_payment_id;

  select * into v_client from public.clients where id = v_pay.client_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('payment.receipt', 'payment_receipts', v_id::text, v_pay.client_id, coalesce(v_client.name, ''),
     jsonb_build_object('paymentId', p_payment_id, 'receivedOn', p_received_on,
                        'amount', p_amount, 'method', p_method,
                        'paidBefore', v_before, 'paidAfter', v_after, 'billed', v_pay.amount),
     format('입금 기록 — %s %s월 · %s원 (%s) · 누적 %s / %s원%s',
            coalesce(v_client.name, '거래처'), v_pay.billing_month,
            to_char(p_amount, 'FM999,999,999'), p_method,
            to_char(v_after, 'FM999,999,999'), to_char(v_pay.amount, 'FM999,999,999'),
            case when v_after >= v_pay.amount then ' · 완납' else '' end),
     '결제·미수금', 'app');

  return jsonb_build_object('id', v_id, 'paidTotal', v_after,
                            'outstanding', v_pay.amount - v_after, 'status', v_status);
end;
$$;

revoke all on function public.add_payment_receipt(uuid, date, bigint, text, text) from public;
grant execute on function public.add_payment_receipt(uuid, date, bigint, text, text) to authenticated;


-- ── 입금 기록 취소 ───────────────────────────────────────────────────────────
--
--  잘못 넣은 입금을 지웁니다. 지우면 청구 상태도 함께 되돌립니다.
--  누가 무엇을 지웠는지 감사기록에 남깁니다 — 돈 기록이라 반드시 남아야 합니다.

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

  v_status := case when v_after >= v_pay.amount then '입금완료' else '미수금' end;
  update public.payments set
    status  = v_status,
    paid_at = case when v_after >= v_pay.amount then paid_at else null end
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

comment on table public.payment_receipts is
  '입금 한 건 (0026). 청구 1건에 여러 건 — 부분입금·분할입금을 그대로 기록합니다.';
comment on function public.add_payment_receipt(uuid, date, bigint, text, text) is
  '입금 기록 + 청구 상태 갱신 (0026). 입금 합계가 청구액을 넘으면 거부합니다.';
