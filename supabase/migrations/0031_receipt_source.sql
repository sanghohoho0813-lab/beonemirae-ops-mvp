-- ─────────────────────────────────────────────────────────────────────────────
-- 0031. 입금이 어디서 왔는지 — 통장 대사와 중복 방지
--
--  왜 필요한가
--
--   이사님은 통장 입금내역을 따로 엑셀로 정리하고 계십니다. 그 파일을
--   올려 청구와 맞춰 붙이려면, **같은 통장 줄을 두 번 기록하지 못하게**
--   막아야 합니다. 파일을 다시 올리거나 화면에서 두 번 누르는 일은
--   반드시 생깁니다. 돈 기록이 두 배가 되면 미수금이 사라져 버립니다.
--
--   그래서 입금 한 건에 「어느 통장 줄에서 왔는지」를 함께 적어 둡니다.
--   같은 줄이 다시 들어오면 서버가 거부합니다.
--
--  source_ref 는 무엇인가
--
--   통장 한 줄을 가리키는 지문입니다. 화면이 「날짜|금액|적요」로 만듭니다.
--   은행마다 거래 고유번호가 있기도 하고 없기도 해서, 어느 파일에서나
--   같은 방식으로 만들 수 있는 값을 씁니다.
--
--   손으로 넣는 입금은 source_ref 가 비어 있습니다. 그 경우에는 중복
--   검사를 하지 않습니다 — 같은 날 같은 금액이 정말 두 번 들어올 수도
--   있고, 그건 사람이 보고 넣는 것이기 때문입니다.
--
--  바뀌는 것
--
--   · payment_receipts 에 source_ref 칸 하나
--   · 값이 있는 것끼리만 유일 (부분 인덱스)
--   · add_payment_receipt 에 인자 하나 추가. 예전 5인자 함수는 지웁니다 —
--     남겨 두면 어느 것이 불릴지 애매해집니다.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.payment_receipts
  add column if not exists source_ref text;

comment on column public.payment_receipts.source_ref is
  '이 입금이 나온 통장 줄의 지문 (0031). 손으로 넣은 입금은 비어 있습니다.';

--  값이 있는 것끼리만 유일합니다. 손입력(null)은 얼마든지 있어도 됩니다.
create unique index if not exists payment_receipts_source_ref_uniq
  on public.payment_receipts (source_ref)
  where source_ref is not null;


-- ── 입금 기록 (0027 정의 + 출처) ────────────────────────────────────────────
--
--  예전 5인자 함수를 먼저 지웁니다. 기본값이 있는 6인자 함수와 함께 두면
--  이름 인자로 부를 때 어느 쪽이 불릴지 애매해집니다.

drop function if exists public.add_payment_receipt(uuid, date, bigint, text, text);

create or replace function public.add_payment_receipt(
  p_payment_id  uuid,
  p_received_on date,
  p_amount      bigint,
  p_method      text default '계좌이체',
  p_memo        text default '',
  p_source_ref  text default null
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
    (payment_id, received_on, amount, method, memo, actor_id, actor_name, source_ref)
  values
    (p_payment_id, p_received_on, p_amount, coalesce(nullif(p_method, ''), '계좌이체'),
     coalesce(p_memo, ''), v_actor.id, coalesce(v_actor.name, ''), v_ref)
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
                            'outstanding', v_pay.amount - v_after, 'status', v_status);
end;
$$;

revoke all on function public.add_payment_receipt(uuid, date, bigint, text, text, text) from public;
grant execute on function public.add_payment_receipt(uuid, date, bigint, text, text, text) to authenticated;

comment on function public.add_payment_receipt(uuid, date, bigint, text, text, text) is
  '입금 기록 + 청구 상태 갱신 (0031). 통장 줄 지문(source_ref)이 같으면 두 번 기록하지 않습니다.';
