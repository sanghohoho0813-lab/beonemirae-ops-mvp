-- 비원미래 운영 DB — 49차 (0063)
-- **현장 계정에서 돈을 서버가 막습니다.** RUN_48 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0063_field_money_lock.sql 과 내용이 같습니다.
--
-- ⚠ 앱을 함께 올려 주세요. 예전 앱은 거래처를 `select *` 로 읽는데,
--   이 파일이 그 별표를 막습니다 — 앱만 예전 것이면 **모든 역할에서**
--   거래처 화면이 안 뜹니다. 순서는 상관없지만 **같은 배포**여야 합니다.
--

-- ═════════════════════════════════════════════════════════════════════════════
-- 0063. 현장 계정에서 돈을 **서버가** 막습니다
--
--  ── 왜 필요한가 ────────────────────────────────────────────────────────────
--
--   지금까지 「현장에는 돈이 안 보인다」는 **화면에서만** 지켜지고 있었습니다.
--   서버 정책을 그대로 읽어 보면 기사 계정 토큰으로도 실제로 내려오는 돈이
--   있습니다.
--
--     clients.pricing / monthly_flat_fee   품목별 단가 · 월정액
--     clients.biz_* / tax_email / vat_mode 세금계산서 발행 정보
--     clients.payment_terms / due_day      결제조건
--       → clients_read 는 is_active_user() 라 기사도 행을 받습니다. 행이 오면
--         **그 행의 모든 칸**이 함께 옵니다.
--
--     client_monthly_actuals.revenue/cost/profit   거래처별 월 매출·원가·이익
--       → cma_read 가 is_active_user()
--
--     products.sale_price / cost_price             판매가 · 매입원가
--       → products_read 가 auth_role() is not null (병원까지 보라고 연 것인데
--         기사까지 같이 열렸습니다)
--
--     client_documents (kind='단가표')             단가표 문서
--       → client_documents_read 가 is_active_user()
--
--   화면을 아무리 가려도 토큰만 있으면 표를 직접 부를 수 있습니다.
--   **여기서 막아야 막힌 것입니다.**
--
--  ── 무엇을 하는가 ──────────────────────────────────────────────────────────
--
--   ① client_monthly_actuals · client_documents 읽기 → is_staff()
--   ② products 읽기 → is_staff() 또는 병원 본인 (기사 제외)
--   ③ clients 는 **열 단위**로 잠급니다. 표 전체 select 권한을 회수하고
--      업무에 쓰는 칸만 다시 내줍니다. 주소·담당자·연락처·주의사항은
--      **그대로 열려 있습니다** — 기사님이 그것으로 일합니다.
--   ④ 사무실·대표는 돈 칸을 client_billing_terms() 로 받습니다 (is_staff).
--   ⑤ complete_collection 이 clients 를 통째로 읽고 있어 같이 고칩니다.
--
--  ── 왜 열 권한이고 뷰가 아닌가 ──────────────────────────────────────────────
--
--   RLS 는 **행**만 막습니다. 「이 행은 보되 이 칸은 가려라」를 못 씁니다.
--   가림막 뷰를 쓰려면 앱의 읽는 자리를 전부 뷰로 옮기고, 뷰가 RLS 규칙을
--   한 번 더 베껴 적어야 합니다 — 두 곳이 시간이 지나면 갈립니다.
--   열 권한은 RLS 와 **무관하게** 먼저 걸리고, 한 곳에만 적힙니다.
--
--   ⚠ PostgreSQL 은 **표 권한이 있으면 열 권한 회수가 아무 일도 안 합니다.**
--     그래서 반드시 표 권한을 먼저 회수하고 안전한 칸만 다시 줍니다.
--
--  ── 기존 데이터에 미치는 영향 ──────────────────────────────────────────────
--
--   **한 줄도 바뀌지 않습니다.** 표를 만들지도, 지우지도, 값을 고치지도
--   않습니다. 바뀌는 것은 권한과 정책, 그리고 함수 둘뿐입니다.
--
--   ⚠ 다만 앱도 함께 올라가야 합니다. 앱이 예전처럼 `select *` 로 거래처를
--     읽으면 **모든 역할에서** 「permission denied」가 납니다. 이 마이그레이션과
--     같은 배포에 앱을 함께 올려 주세요.
--
--  ── 실행 순서 ──────────────────────────────────────────────────────────────
--
--   0062 → 0063 순서입니다. 0062 를 아직 실행하지 않으셨다면 그것부터입니다.
-- ═════════════════════════════════════════════════════════════════════════════


-- ── ① 월 실적 — 표 전체가 돈입니다 ───────────────────────────────────────────
--
--  revenue · cost · profit 이 한 표에 있습니다. 칸을 가릴 것도 없이 표째
--  사무실 것입니다. kg 도 같이 막히는데, 기사님 하루 업무에 월 누적 kg 이
--  필요한 자리는 없습니다 (거래처 상세의 「월간 리포트」는 사무실이 병원에
--  드리는 자료라 같은 배포에서 현장 화면에서 내립니다).
drop policy if exists cma_read on public.client_monthly_actuals;
create policy cma_read on public.client_monthly_actuals
  for select using (public.is_staff());


-- ── ② 상품 — 판매가 · 매입원가 ──────────────────────────────────────────────
--
--  0048 에서 `auth_role() is not null` 로 연 이유는 **병원**이 주문하려면
--  목록을 봐야 하기 때문입니다. 그런데 그 문이 기사에게도 같이 열려 있어
--  판매가·원가가 그대로 내려갔습니다. 병원은 그대로 두고 기사만 닫습니다.
drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select using (public.is_staff() or public.is_client_user());


-- ── ③ 거래처 문서함 — 「단가표」가 들어갑니다 ───────────────────────────────
drop policy if exists client_documents_read on public.client_documents;
create policy client_documents_read on public.client_documents
  for select using (public.is_staff());


-- ── ④ 거래처 — 돈 칸만 닫고 업무 칸은 그대로 ────────────────────────────────
--
--  ⚠ 순서가 중요합니다. 표 권한을 먼저 회수해야 열 권한이 뜻을 가집니다.
--  ⚠ update 권한은 건드리지 않습니다. 누가 고칠 수 있는지는 지금까지처럼
--    RLS(clients_update = is_staff())가 정합니다 — 기사는 원래 못 고칩니다.
revoke select on public.clients from authenticated;

--  현장이 일하는 데 필요한 칸입니다. 주소·담당자·전화·주의사항이 여기 있습니다.
--  대체 기사가 대신 가도 이 칸들은 보여야 합니다.
grant select (
  id, name, type, address, manager, phone,
  collection_cycle, collects_medical_waste, collects_diaper, storage_size, note,
  is_demo_generated, demo_session_id, active,
  created_at, updated_at, created_by, updated_by,
  contract_start, contract_end,
  collect_time, disposal_site, diaper_cycle,
  name_key, request_id, education_at
) on public.clients to authenticated;

comment on column public.clients.pricing is
  '품목별 단가 (0011). 0063 부터 authenticated 는 이 칸을 직접 못 읽습니다 — 사무실은 client_billing_terms() 로 받습니다.';


-- ── ⑤ 사무실·대표가 돈 칸을 받는 길 ─────────────────────────────────────────
--
--  ⚠ 이 함수가 없으면 청구가 틀립니다. 단가판(client_prices)이 없는 거래처는
--    지금도 clients.pricing 을 그대로 쓰고 있습니다(billing.ts). 그 값을
--    못 받으면 그 거래처의 청구가 **조용히 0원**이 됩니다.
--
--  ⚠ 기사에게는 빈 배열입니다 — 오류가 아니라 빈 값입니다. 오류로 만들면
--    기사님 화면이 통째로 안 뜹니다.
create or replace function public.client_billing_terms()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_staff() then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',               c.id,
        'paymentTerms',     c.payment_terms,
        'paymentDueDay',    c.payment_due_day,
        'monthlyFlatFee',   c.monthly_flat_fee,
        'pricing',          c.pricing,
        'bizNo',            c.biz_no,
        'bizCeo',           c.biz_ceo,
        'bizType',          c.biz_type,
        'bizItem',          c.biz_item,
        'taxEmail',         c.tax_email,
        'vatMode',          c.vat_mode,
        'flatFeeWhenEmpty', c.flat_fee_when_empty,
        'flatFeePolicyAt',  c.flat_fee_policy_at
      ) order by c.id)
        from public.clients c
    ), '[]'::jsonb)
    else '[]'::jsonb
  end
$$;

revoke all on function public.client_billing_terms() from public;
grant execute on function public.client_billing_terms() to authenticated;

comment on function public.client_billing_terms() is
  '거래처별 단가·결제조건·세금계산서 정보 (0063). 사무실·관리자만 — 현장에는 빈 배열을 돌려줍니다.';


-- ── ⑥ 수거 완료 — 거래처를 통째로 읽던 자리 ────────────────────────────────
--
--  ⚠ 아래는 0061 의 함수를 **그대로 옮겨 온 뒤 두 줄만** 고친 것입니다.
--    (선언 `clients%rowtype` → `record`, `select *` → `select id, name`)
--    기억으로 다시 쓰면 지키던 검사(자재 음수·재고 부족·중복 완료·미래 날짜·
--    청구 확정한 달)가 조용히 빠집니다.
--
--  이 함수는 security definer 가 **아닙니다** — 부르는 사람 권한으로 돕니다.
--  그래서 ④ 로 돈 칸을 닫는 순간 `clients%rowtype` 이 permission denied 를
--  내고, **기사님이 수거를 저장하지 못하게 됩니다.** 실제로 쓰는 것은 id 와
--  name 둘뿐입니다.

CREATE OR REPLACE FUNCTION public.complete_collection(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor        profiles%rowtype;
  --  ⚠ 0063 부터 clients 의 **돈 칸은 authenticated 가 못 읽습니다.**
  --    이 함수는 security definer 가 아니라 부르는 사람 권한으로 돕니다.
  --    그래서 `clients%rowtype` 으로 통째로 받으면 기사 계정에서
  --    「permission denied」가 나서 **수거 저장 자체가 막힙니다.**
  --    실제로 쓰는 것은 id 와 name 둘뿐이라 그 둘만 받습니다.
  v_client       record;
  v_vehicle      vehicles%rowtype;
  v_schedule     schedules%rowtype;
  v_stock        office_stock%rowtype;
  v_event_id     uuid := gen_random_uuid();
  v_schedule_id  uuid;
  v_created      boolean := false;
  v_material_id  uuid;
  v_material_ids uuid[] := '{}';
  v_before       jsonb;
  v_stock_before jsonb;
  v_req_updates  jsonb := '[]'::jsonb;
  v_now          timestamptz := now();
  v_today        date := (v_now at time zone 'Asia/Seoul')::date;
  --  0061 — 실제로 다녀온 **날**. 안 보내면 오늘입니다.
  v_date         date := coalesce(nullif(p->>'date','')::date, (v_now at time zone 'Asia/Seoul')::date);
  v_amount       integer := (p->>'actualAmount')::integer;
  v_demo         text := nullif(p->>'demoSessionId', '');
  v_origin       text;
  v_sup_box      integer := coalesce((p->'supplied'->>'corrugatedBox')::integer, 0);
  v_sup_plastic  integer := coalesce((p->'supplied'->>'plasticContainer')::integer, 0);
  v_sup_bag      integer := coalesce((p->'supplied'->>'bag')::integer, 0);
  v_sup_needle   integer := coalesce((p->'supplied'->>'needleBox')::integer, 0);
  v_supplied_any boolean;
  -- 0007: 같은 날 재방문(추가 수거)인지 — 중복 저장 차단에서 제외할 근거
  v_additional   boolean := coalesce((p->>'isAdditional')::boolean, false);
  v_dup          uuid;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if v_actor.role = 'client' then
    raise exception '병원 계정에서는 수거 입력을 할 수 없습니다. 비원미래 담당자에게 요청해 주세요.'
      using errcode = 'P0001';
  end if;

  -- 0013: 공급 수량은 음수일 수 없습니다.
  --
  --  실제 운영 DB 를 찔러 보다 찾은 구멍입니다. 아래처럼 음수를 섞어 보내면
  --    supplied = { corrugatedBox: -3, plasticContainer: 10 }
  --  합계가 7 이라 "공급이 있다"로 판단되고, 재고 차감식이
  --    corrugated_box = corrugated_box - (-3)
  --  이 되어 골판지 재고가 3개 늘어납니다. 창고에 없던 물건이 생깁니다.
  --  게다가 원장(material_transactions)은 qty > 0 인 항목만 남기므로 그 3개는
  --  기록조차 되지 않습니다. 재고와 원장이 어긋난 채로 굳습니다.
  --
  --  화면(QtyField)은 0 미만을 못 만들지만, DB 함수가 최종 방어선입니다.
  --  토큰만 있으면 화면을 거치지 않고 바로 보낼 수 있습니다.
  if v_sup_box < 0 or v_sup_plastic < 0 or v_sup_bag < 0 or v_sup_needle < 0 then
    raise exception '공급 수량은 0보다 작을 수 없습니다. (골판지 % · 합성수지 % · 봉투 % · 바늘통 %)',
      v_sup_box, v_sup_plastic, v_sup_bag, v_sup_needle using errcode = 'P0001';
  end if;

  -- 규격별 수량(items)도 같습니다. 이 값이 그대로 정산 단가에 곱해지므로
  -- 음수가 들어가면 매출·원가가 마이너스로 잡힙니다.
  if jsonb_typeof(p->'suppliedItems') = 'object' then
    if exists (
      select 1 from jsonb_each_text(p->'suppliedItems') as t(k, v)
       where v ~ '^-' and (v)::numeric < 0
    ) then
      raise exception '규격별 공급 수량은 0보다 작을 수 없습니다.' using errcode = 'P0001';
    end if;
  end if;

  v_supplied_any := (v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) > 0;
  v_origin := case when v_demo is null then 'field' else 'demo' end;

  select id, name into v_client from clients where id = (p->>'clientId')::uuid and active;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception '실제 수거량은 0kg보다 커야 합니다.' using errcode = 'P0001';
  end if;

  if coalesce(p->>'actualTime', '') = '' then
    raise exception '실제 수거 시간을 입력해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_vehicle from vehicles where id = (p->>'vehicleId')::uuid;
  if not found then
    raise exception '배차 차량을 선택해 주세요.' using errcode = 'P0001';
  end if;
  if v_vehicle.waste_type <> (p->>'wasteType') then
    raise exception '% 수거에는 % 차량만 배차할 수 있습니다. (선택한 차량: %)',
      p->>'wasteType', p->>'wasteType', v_vehicle.waste_type using errcode = 'P0001';
  end if;

  --  ── 0061 · 다녀온 날 ──────────────────────────────────────────────────
  --
  --   지금까지 직접 입력은 **무조건 오늘 날짜로** 저장했습니다. 기사님이
  --   저녁에, 또는 다음 날 아침에 넣으면 날짜가 하루 밀립니다. 평소에는
  --   기록만 어긋나지만 **월말에는 돈이 틀립니다** — 31일 수거를 1일에
  --   넣으면 그 달 청구에서 빠지고 다음 달에 붙습니다. 하루치 수거가
  --   통째로 다른 달로 갑니다.
  --
  --   그래서 날짜를 받되, 아래 셋을 서버가 막습니다.
  if v_date > v_today then
    raise exception '아직 오지 않은 날(%)에 다녀왔다고 기록할 수 없습니다.', v_date
      using errcode = 'P0001';
  end if;
  if v_date < v_today - 45 then
    raise exception '너무 오래된 날짜(%)입니다. 45일 앞까지만 넣습니다 — 지난 기록은 엑셀 가져오기로 넣어 주세요.', v_date
      using errcode = 'P0001';
  end if;
  --  ⚠ 제일 중요한 방어입니다. 이미 청구를 확정한 달에 수거를 더 넣으면
  --    **실적과 청구액이 어긋납니다.** 병원에 나간 청구서에는 없는 수거가
  --    장부에만 생깁니다. 정말 넣어야 하면 그 달 청구를 취소하고 다시
  --    확정하는 길이 이미 있습니다.
  --  ⚠ 직접 select 하면 안 됩니다. 이 함수는 부르는 사람의 권한으로 돌고,
  --    기사 계정은 payments 를 한 줄도 못 봅니다 — 그러면 항상 0건이라
  --    방어가 조용히 안 돕니다. 권한과 무관한 헬퍼를 씁니다.
  if public.has_live_billing(v_client.id, to_char(v_date, 'YYYY-MM')) and v_date <> v_today then
    raise exception '%의 % 청구는 이미 확정했습니다. 그 달에 수거를 더 넣으면 청구액과 어긋납니다 — 청구를 취소한 뒤에 넣어 주세요.',
      v_client.name, to_char(v_date, 'YYYY년 MM월') using errcode = 'P0001';
  end if;

  -- ── 1) 일정 ─────────────────────────────────────────────────────────────
  if coalesce(p->>'scheduleId', '') <> '' then
    select * into v_schedule from schedules where id = (p->>'scheduleId')::uuid for update;
    if not found then
      raise exception '선택한 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_schedule.status = '완료' then
      raise exception '이미 완료 처리된 일정입니다. (중복 완료 방지)' using errcode = 'P0001';
    end if;

    v_before := jsonb_build_object(
      'status', v_schedule.status,
      'actualAmount', v_schedule.actual_amount,
      'handoverStatus', v_schedule.handover_status
    );

    update schedules set
      status = '완료',
      actual_amount = v_amount,
      actual_time = p->>'actualTime',
      completed_at = v_now,
      containers = p->'containers',
      driver_name = p->>'driverName',
      handover_status = p->>'handoverStatus',
      handover_at = case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      memo = coalesce(p->>'memo', ''),
      waste_type = p->>'wasteType',
      vehicle_id = v_vehicle.id,
      event_id = v_event_id,
      origin = v_origin,
      is_additional = v_additional,
      demo_session_id = v_demo,
      updated_by = v_actor.id
    where id = v_schedule.id;

    v_schedule_id := v_schedule.id;
  else
    -- 0007: 일정을 고르지 않고 직접 입력하는 경로에는 중복 검사가 없었습니다.
    --       저장을 두 번 누르면 완료 일정과 수거 이벤트가 두 벌 생겨 kg 이 이중 계상됩니다.
    --       같은 날 한 번 더 방문한 건은 '추가 수거'로 저장하면 그대로 허용됩니다.
    if not v_additional then
      select id into v_dup
        from schedules
       where client_id = v_client.id and date = v_date
         and waste_type = p->>'wasteType'
         and status = '완료' and is_additional = false
       limit 1;
      if v_dup is not null then
        raise exception
          '% % 의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
          to_char(v_date, 'MM월 DD일'), v_client.name, p->>'wasteType' using errcode = 'P0001';
      end if;
    end if;

    v_created := true;
    v_before := jsonb_build_object('status', '예정', 'actualAmount', null, 'handoverStatus', null);
    insert into schedules (
      date, client_id, waste_type, vehicle_id, scheduled_time, status,
      expected_amount, actual_amount, actual_time, completed_at, containers,
      driver_name, handover_status, handover_at, memo, event_id, origin,
      is_additional, demo_session_id, created_by, updated_by
    ) values (
      v_date, v_client.id, p->>'wasteType', v_vehicle.id, p->>'actualTime', '완료',
      v_amount, v_amount, p->>'actualTime', v_now, p->'containers',
      p->>'driverName', p->>'handoverStatus',
      case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      coalesce(p->>'memo', ''), v_event_id, v_origin,
      v_additional, v_demo, v_actor.id, v_actor.id
    ) returning id into v_schedule_id;
  end if;

  -- ── 2) 재고 차감 ────────────────────────────────────────────────────────
  select * into v_stock from office_stock where id = 1 for update;
  v_stock_before := jsonb_build_object(
    'corrugatedBox', v_stock.corrugated_box,
    'plasticContainer', v_stock.plastic_container,
    'bag', v_stock.bag,
    'needleBox', v_stock.needle_box
  );

  if v_sup_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_sup_box using errcode = 'P0001';
  end if;
  if v_sup_plastic > v_stock.plastic_container then
    raise exception '사무실 합성수지 전용용기 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.plastic_container, v_sup_plastic using errcode = 'P0001';
  end if;
  if v_sup_bag > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_sup_bag using errcode = 'P0001';
  end if;
  if v_sup_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_sup_needle using errcode = 'P0001';
  end if;

  -- ── 3) 자재 공급 이력 + 원장 ────────────────────────────────────────────
  if v_supplied_any then
    insert into materials (
      date, client_id, box_count, vinyl_count, needle_box_count,
      is_additional_request, memo, origin, demo_session_id, created_by, items
    ) values (
      v_date, v_client.id, v_sup_box, v_sup_bag, v_sup_plastic + v_sup_needle,
      coalesce((p->>'isAdditional')::boolean, false), '수거 완료 시 동시공급',
      v_origin, v_demo, v_actor.id,
      -- 0011: 규격별 공급 수량. 정산·거래명세서가 이 값으로 단가를 적용합니다.
      nullif(p->'suppliedItems', 'null'::jsonb)
    ) returning id into v_material_id;

    v_material_ids := array[v_material_id];

    update office_stock set
      corrugated_box    = corrugated_box - v_sup_box,
      plastic_container = plastic_container - v_sup_plastic,
      bag               = bag - v_sup_bag,
      needle_box        = needle_box - v_sup_needle,
      updated_by        = v_actor.id
    where id = 1;

    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '공급', item, -qty, v_client.id, v_material_id, v_event_id, '수거 완료 시 동시공급', v_actor.id
    from (values
      ('corrugatedBox', v_sup_box),
      ('plasticContainer', v_sup_plastic),
      ('bag', v_sup_bag),
      ('needleBox', v_sup_needle)
    ) as t(item, qty)
    where qty > 0;
  end if;

  -- ── 4) 병원 요청 자동 종료 (실제 요청 행을 직접 닫습니다) ───────────────
  v_req_updates := public.close_requests_on_collection(v_client.id, v_supplied_any, v_actor.id, v_now);

  -- ── 5) 감사기록 ────────────────────────────────────────────────────────
  insert into collection_events (
    id, at, actor_id, actor_name, actor_role, screen, action, schedule_id,
    created_schedule, client_id, client_name, waste_type, amount_kg,
    before_state, material_ids, stock_before, request_updates, note,
    demo_session_id, input_duration_ms
  ) values (
    v_event_id, v_now, v_actor.id, v_actor.name, v_actor.role,
    coalesce(p->>'screen', ''), '수거 완료', v_schedule_id,
    v_created, v_client.id, v_client.name, p->>'wasteType', v_amount,
    v_before, v_material_ids, v_stock_before, v_req_updates,
    coalesce(p->>'memo', ''), v_demo,
    nullif(p->>'inputDurationMs', '')::integer
  );

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.complete', 'schedules',
          v_schedule_id::text, v_client.id, v_client.name, coalesce(p->>'screen',''),
          v_before,
          jsonb_build_object('actualAmount', v_amount, 'handoverStatus', p->>'handoverStatus'),
          format('%s 수거 완료 · %skg%s%s', v_client.name, v_amount,
                 case when v_supplied_any then format(' · 자재 %s개 공급',
                   v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) else '' end,
                 case when jsonb_array_length(v_req_updates) > 0
                   then format(' · 병원 요청 %s건 처리', jsonb_array_length(v_req_updates)) else '' end));

  return jsonb_build_object('eventId', v_event_id, 'scheduleId', v_schedule_id, 'createdSchedule', v_created);
exception
  -- 두 기기에서 같은 순간에 저장하면 사전 검사를 둘 다 통과할 수 있습니다.
  -- 최종 방어선인 부분 UNIQUE 인덱스가 막고, 여기서 사람이 읽을 문장으로 바꿉니다.
  when unique_violation then
    if sqlerrm like '%schedules_one_completion_per_day%' then
      raise exception
        '오늘 이 거래처의 % 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.',
        p->>'wasteType' using errcode = 'P0001';
    end if;
    raise;
end $function$;;

comment on function public.complete_collection(jsonb) is
  '수거 완료 통합 처리 (0013 → 0061 → 0063). 거래처는 id·name 만 읽습니다 — 돈 칸이 열 단위로 닫혔습니다.';


-- ── ⑦ 건강검사 ──────────────────────────────────────────────────────────────
--
--  ⚠ 아래는 0062 의 것을 **그대로 옮겨 온 뒤 0063 검사만 더한** 것입니다.
--    기억으로 다시 쓰면 지금까지 쌓아 온 검사 목록이 통째로 사라집니다.

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
    'products','product_orders','product_order_items',
    'month_close_marks','client_assignments','staff_invites',
    'schedule_feedback'
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
    ['schedules','booked_at'],
    ['schedules','canceled_at'], ['schedules','cancel_reason'],
    ['clients','education_at'],
    ['profiles','approved_at'], ['app_errors','kind'],
    ['staff','waste_scope'], ['tax_filings','base_exempt'],
    ['product_order_items','unit_price'], ['product_orders','delivered_at'],
    ['tax_filings','confirmed_at'], ['products','category'],
    ['month_close_marks','marked_name'],
    ['client_requests','request_id'], ['site_notes','request_id'],
    ['profiles','vehicle_id'], ['staff_invites','client_ids']
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
    'set_tax_filing_confirmed','set_month_close_mark',
    'upsert_staff_invite','delete_staff_invite','set_client_drivers','set_profile_vehicle',
    'has_assignments','can_see_client','book_visit',
    'move_visit','cancel_visit','undo_schedule_batch',
    'has_live_billing',
    'submit_schedule_feedback','handle_schedule_feedback',
    'update_visit','update_monthly_actual',
    'client_billing_terms',
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
    'schedules_planned_uniq','schedules_one_completion_per_day','products_category_idx',
    'schedules_live_planned_idx',
    'month_close_marks_uniq',
    'client_requests_request_uniq','site_notes_request_uniq',
    'client_assignments_profile_idx',
    'schedule_feedback_request_uniq','schedule_feedback_open_idx'
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
  --  가입할 때 초대를 적용하는 방아쇠 — 없으면 사전 등록이 조용히 아무 일도
  --  안 하고, 기사님은 승인 대기에 걸린 채 기다립니다.
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    v_missing := v_missing || '방아쇠 on_auth_user_created'::text;
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
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('products', 'product_orders', 'product_order_items')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 상품·주문 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'month_close_marks'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 마감 표시 직접 쓰기가 열려 있음'::text;
  end if;
  --  기사가 자기 담당을 스스로 늘릴 수 있으면 「배정된 곳만 본다」가
  --  아무 뜻이 없습니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('client_assignments', 'staff_invites')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 배정·사전등록 직접 쓰기가 열려 있음'::text;
  end if;

  --  현장이 남의 의견을 고치거나 지울 수 있으면 「의견은 기록」이 아닙니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'schedule_feedback'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 현장 의견 직접 쓰기가 열려 있음'::text;
  end if;

  foreach v_name in array array[
    'client_requests_client_write', 'client_requests_client_read'
  ] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'client_requests' and policyname = v_name
    ) then
      v_missing := v_missing || ('정책 ' || v_name);
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'schedule_feedback'
       and policyname = 'schedule_feedback_read'
  ) then
    v_missing := v_missing || '정책 schedule_feedback_read'::text;
  end if;

  -- ── 0063. 현장 계정에서 돈을 **서버가** 막고 있는가 ────────────────────
  --
  --   화면에서 숨기는 것만으로는 끝나지 않습니다. 토큰만 있으면 표를 직접
  --   부를 수 있습니다. 아래 셋 중 하나라도 풀리면 기사 계정으로 단가·매출을
  --   그대로 받아 갈 수 있습니다.

  --  ① 거래처의 돈 칸 — authenticated 에게 **열 단위로** 닫혀 있어야 합니다.
  --    표 전체 select 권한이 남아 있으면 열 권한 회수가 아무 일도 안 합니다
  --    (PostgreSQL 은 표 권한이 있으면 열 권한을 먼저 봅니다) — 그래서
  --    「표 권한이 없다」와 「안전한 열만 있다」를 둘 다 봅니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'clients'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    v_missing := v_missing || '잠금 거래처 표 전체 읽기가 열려 있음 (돈 칸까지 열립니다)'::text;
  end if;
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'clients'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
       and column_name in ('pricing','monthly_flat_fee','payment_terms','payment_due_day',
                           'vat_mode','flat_fee_when_empty','flat_fee_policy_at',
                           'biz_no','biz_ceo','biz_type','biz_item','tax_email')
  ) then
    v_missing := v_missing || '잠금 거래처 단가·결제·세금 칸이 열려 있음'::text;
  end if;
  --  업무에 쓰는 칸까지 같이 닫아 버리면 기사님 화면이 통째로 빕니다.
  --  주소·연락처는 **열려 있어야 맞습니다** — 그것도 함께 봅니다.
  foreach v_name in array array['id','name','address','manager','phone','note'] loop
    if not exists (
      select 1 from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'clients'
         and grantee = 'authenticated' and privilege_type = 'SELECT'
         and column_name = v_name
    ) then
      v_missing := v_missing || ('열림 거래처 ' || v_name || ' 을(를) 현장이 못 읽음');
    end if;
  end loop;

  --  ② 월 실적(매출·원가·이익) · 상품(판매가·원가) · 문서함(단가표)
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'client_monthly_actuals'
       and policyname = 'cma_read' and qual like '%is_staff%'
  ) then
    v_missing := v_missing || '잠금 월 실적을 현장이 읽을 수 있음'::text;
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'products'
       and policyname = 'products_read' and qual like '%auth_role() IS NOT NULL%'
  ) then
    v_missing := v_missing || '잠금 상품 판매가·원가를 현장이 읽을 수 있음'::text;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'client_documents'
       and policyname = 'client_documents_read' and qual like '%is_staff%'
  ) then
    v_missing := v_missing || '잠금 거래처 문서함(단가표)을 현장이 읽을 수 있음'::text;
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
immutable
as $$ select 63 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
