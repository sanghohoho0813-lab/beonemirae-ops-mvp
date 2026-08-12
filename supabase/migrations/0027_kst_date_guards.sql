-- ─────────────────────────────────────────────────────────────────────────────
-- 0027. 「오늘」을 한국 시각으로 통일 — 미래 날짜 가드 수정
--
--  무엇이 잘못됐나
--
--   0024·0025 의 가져오기 가드와 0026 의 입금 가드가 `current_date` 를 씁니다.
--   Supabase 의 DB 시간대는 UTC 입니다. 한국 시각 00:00~09:00 사이에는
--   UTC 가 아직 **어제**입니다.
--
--   그래서 그 9시간 동안:
--    · 오늘(한국) 수거한 기록을 엑셀로 넣으면 「아직 오지 않은 날짜」로 거부
--    · 오늘(한국) 들어온 입금을 기록하면 같은 이유로 거부
--
--   새벽에 전날 명세서를 정리하는 시간대라 실제로 걸리는 자리입니다.
--   이 프로젝트의 다른 함수들(complete_collection 등)은 이미
--   `(now() at time zone 'Asia/Seoul')::date` 로 한국 시각을 씁니다 —
--   가드만 빠져 있었습니다. 같은 기준으로 맞춥니다.
--
--  실제로 확인한 상황: 컨테이너 시계 UTC 2026-08-12 15:26 = 한국 2026-08-13 00:26.
--  이때 2026-08-13 자 수거가 「미래」로 거부됐습니다.
--
--  바뀌는 것은 두 함수의 날짜 비교 한 줄씩입니다. 표·권한 변경 없습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 가져오기 ─────────────────────────────────────────────────────────────────
create or replace function public.import_excel_rows(
  p_client_id    uuid,
  p_rows         jsonb,
  p_client_patch jsonb default null,
  p_file         text default '',
  p_summary      jsonb default '{}'::jsonb,
  p_monthly      jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client   public.clients%rowtype;
  v_row      jsonb;
  v_date     date;
  v_type     text;
  v_kg       numeric;
  v_items    jsonb;
  v_hit      public.schedules%rowtype;
  v_mat      public.materials%rowtype;
  v_cma      public.client_monthly_actuals%rowtype;
  v_ins      integer := 0;
  v_skip     integer := 0;
  v_conflict integer := 0;
  v_patched  integer := 0;
  v_months   integer := 0;
  v_patch    jsonb := '{}'::jsonb;
  --  「오늘」은 한국 시각 기준입니다 (이 프로젝트의 다른 함수들과 같은 기준).
  v_today    date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.is_admin() then
    raise exception '엑셀 가져오기는 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception '가져올 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception '가져올 기록이 목록 형태가 아닙니다.' using errcode = 'P0001';
  end if;

  -- ── 1. 거래처 계약·단가 — 비어 있는 칸만 채웁니다 ─────────────────────
  if p_client_patch is not null and p_client_patch <> 'null'::jsonb then
    if (p_client_patch ? 'contractStart') and v_client.contract_start is null then
      v_patch := v_patch || jsonb_build_object('contract_start', p_client_patch->>'contractStart');
    end if;
    if (p_client_patch ? 'contractEnd') and v_client.contract_end is null then
      v_patch := v_patch || jsonb_build_object('contract_end', p_client_patch->>'contractEnd');
    end if;
    if (p_client_patch ? 'paymentTerms') and coalesce(v_client.payment_terms, '') = '' then
      v_patch := v_patch || jsonb_build_object('payment_terms', p_client_patch->>'paymentTerms');
    end if;
    if (p_client_patch ? 'paymentDueDay') and v_client.payment_due_day is null then
      v_patch := v_patch || jsonb_build_object('payment_due_day', (p_client_patch->>'paymentDueDay')::int);
    end if;
    if (p_client_patch ? 'pricing') and v_client.pricing is null then
      v_patch := v_patch || jsonb_build_object('pricing', p_client_patch->'pricing');
    end if;

    if v_patch <> '{}'::jsonb then
      update public.clients set
        contract_start  = coalesce((v_patch->>'contract_start')::date, contract_start),
        contract_end    = coalesce((v_patch->>'contract_end')::date, contract_end),
        payment_terms   = coalesce(v_patch->>'payment_terms', payment_terms),
        payment_due_day = coalesce((v_patch->>'payment_due_day')::int, payment_due_day),
        pricing         = coalesce(v_patch->'pricing', pricing)
      where id = p_client_id;
      v_patched := (select count(*) from jsonb_object_keys(v_patch));
    end if;
  end if;

  -- ── 2. 기록 ────────────────────────────────────────────────────────────
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_date := (v_row->>'date')::date;
    if v_date is null then
      raise exception '날짜가 없는 기록은 넣을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_date > v_today then
      raise exception '아직 오지 않은 날짜(%)의 기록은 넣을 수 없습니다. 원본의 연도를 확인해 주세요.', v_date
        using errcode = 'P0001';
    end if;

    if (v_row->>'kind') = '수거' then
      v_type := v_row->>'wasteType';
      v_kg := (v_row->>'kg')::numeric;
      if v_type not in ('의료폐기물', '일회용기저귀') then
        raise exception '폐기물 구분이 올바르지 않습니다: %', v_type using errcode = 'P0001';
      end if;
      if v_kg is null or v_kg < 0 then
        raise exception '수거량이 올바르지 않습니다 (% kg)', v_kg using errcode = 'P0001';
      end if;

      select * into v_hit from public.schedules
       where client_id = p_client_id and date = v_date and waste_type = v_type and status = '완료'
       limit 1;

      if found then
        if coalesce(v_hit.actual_amount, -1) = round(v_kg) then v_skip := v_skip + 1;
        else v_conflict := v_conflict + 1;
        end if;
      else
        insert into public.schedules
          (date, client_id, waste_type, status, expected_amount, actual_amount,
           completed_at, memo, origin, is_additional)
        values
          (v_date, p_client_id, v_type, '완료', round(v_kg), round(v_kg),
           (v_date + time '09:00')::timestamptz,
           coalesce(v_row->>'where', '엑셀 가져오기'), 'migrated', false);
        v_ins := v_ins + 1;
      end if;

    elsif (v_row->>'kind') = '자재' then
      v_items := coalesce(v_row->'items', '{}'::jsonb);

      select * into v_mat from public.materials
       where client_id = p_client_id and date = v_date
       limit 1;

      if found then
        if coalesce(v_mat.items, '{}'::jsonb) = v_items then v_skip := v_skip + 1;
        else v_conflict := v_conflict + 1;
        end if;
      else
        insert into public.materials
          (date, client_id, box_count, vinyl_count, needle_box_count,
           is_additional_request, memo, items, origin)
        values
          (v_date, p_client_id,
           coalesce((v_items->>'box79')::int, 0) + coalesce((v_items->>'box63')::int, 0)
             + coalesce((v_items->>'box35')::int, 0) + coalesce((v_items->>'box30')::int, 0)
             + coalesce((v_items->>'box12')::int, 0) + coalesce((v_items->>'box4')::int, 0)
             + coalesce((v_items->>'diaperBoxM')::int, 0),
           coalesce((v_items->>'diaperBag40')::int, 0) + coalesce((v_items->>'pouch12')::int, 0),
           coalesce((v_items->>'plastic2')::int, 0) + coalesce((v_items->>'plastic5')::int, 0)
             + coalesce((v_items->>'plastic10')::int, 0) + coalesce((v_items->>'plastic20')::int, 0),
           false, coalesce(v_row->>'where', '엑셀 가져오기'), v_items, 'migrated');
        v_ins := v_ins + 1;
      end if;

    else
      raise exception '알 수 없는 기록 종류입니다: %', coalesce(v_row->>'kind', '(없음)')
        using errcode = 'P0001';
    end if;
  end loop;

  -- ── 3. 월 실적 ─────────────────────────────────────────────────────────
  if jsonb_typeof(p_monthly) = 'array' then
    for v_row in select * from jsonb_array_elements(p_monthly)
    loop
      if (v_row->>'month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
        raise exception '월 표기가 올바르지 않습니다: %', coalesce(v_row->>'month', '(없음)')
          using errcode = 'P0001';
      end if;

      select * into v_cma from public.client_monthly_actuals
       where client_id = p_client_id and month = (v_row->>'month');

      if found then
        if v_cma.medical_kg = coalesce((v_row->>'medicalKg')::numeric, 0)
           and v_cma.diaper_kg = coalesce((v_row->>'diaperKg')::numeric, 0)
           and v_cma.revenue  = coalesce((v_row->>'revenue')::bigint, 0)
        then
          v_skip := v_skip + 1;
        else
          v_conflict := v_conflict + 1;
        end if;
      else
        insert into public.client_monthly_actuals
          (client_id, month, medical_kg, diaper_kg, revenue, cost, profit, has_dated, source_file)
        values
          (p_client_id, v_row->>'month',
           coalesce((v_row->>'medicalKg')::numeric, 0),
           coalesce((v_row->>'diaperKg')::numeric, 0),
           coalesce((v_row->>'revenue')::bigint, 0),
           coalesce((v_row->>'cost')::bigint, 0),
           coalesce((v_row->>'profit')::bigint, 0),
           coalesce((v_row->>'hasDated')::boolean, false),
           p_file);
        v_months := v_months + 1;
      end if;
    end loop;
  end if;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('import.excel', 'clients', p_client_id::text, p_client_id, v_client.name,
     jsonb_build_object('file', p_file, 'inserted', v_ins, 'skipped', v_skip,
                        'conflict', v_conflict, 'clientFields', v_patched,
                        'months', v_months, 'summary', p_summary),
     format('엑셀 가져오기 — %s · 등록 %s건 · 건너뜀 %s건 · 충돌 %s건%s%s (%s)',
            v_client.name, v_ins, v_skip, v_conflict,
            case when v_months  > 0 then format(' · 월 실적 %s개월', v_months) else '' end,
            case when v_patched > 0 then format(' · 거래처 정보 %s칸', v_patched) else '' end,
            coalesce(nullif(p_file, ''), '파일명 없음')),
     'import', 'app');

  return jsonb_build_object(
    'inserted', v_ins, 'skipped', v_skip, 'conflict', v_conflict,
    'clientFields', v_patched, 'months', v_months);
end;
$$;

revoke all on function public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb, jsonb) from public;
grant execute on function public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb, jsonb) to authenticated;


-- ── 입금 기록 ────────────────────────────────────────────────────────────────
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

comment on function public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb, jsonb) is
  '엑셀 가져오기 (0027): 날짜별 기록 + 월 실적. 「오늘」은 한국 시각 기준입니다.';
comment on function public.add_payment_receipt(uuid, date, bigint, text, text) is
  '입금 기록 + 청구 상태 갱신 (0027). 「오늘」은 한국 시각 기준입니다.';
