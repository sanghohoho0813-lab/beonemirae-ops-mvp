-- 비원미래 운영 DB — 44차 (0058)
-- 날짜를 정해 방문을 잡을 수 있게. RUN_1~43 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0058_book_visit.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();   → 58
--              select public.app_health_check();      → ok: true
--
-- ────────────────────────────────────────────────────────────────────────────
-- 왜 필요한가 — 병원과 한 약속을 넣을 데가 없었습니다
--
--   병원에서 전화가 옵니다. 「다음 주 목요일에 와 주세요.」
--   ...그리고 그 약속을 넣을 데가 시스템에 없습니다.
--
--   지금 일정이 생기는 길은 셋뿐입니다 — 자동 편성(오늘부터 1·2·4주치),
--   수거 입력(오늘 다녀온 것), 엑셀 가져오기(지난 기록). 그래서 약속은
--   수첩·카톡에 적어 두었다가 그날 아침에 **기억해 내야** 합니다. 없애려던
--   바로 그 방식이고, 잊으면 그대로 미수거 → 병원에서 긴급 전화입니다.
--
-- 이 SQL 이 하는 일
--   ① schedules 에 booked_at 칸 하나 — 사람이 잡은 방문임을 남깁니다
--   ② book_visit(...) 함수 — 그 방문을 만들고, 아래를 서버가 막습니다
--        · 사무실·관리자만 (기사는 남의 일정을 만들지 않습니다)
--        · 지난 날짜 · 반년 넘는 미래 (연도 오타)
--        · 거래 중이 아닌 거래처
--        · 그 거래처가 **안 하는 구분** (기저귀를 안 받는 병원에 기저귀 방문)
--        · 차량 구분이 다른 배정 (기저귀 차로 의료폐기물 방문)
--        · **같은 날 같은 구분 중복** — 두 번 눌러도 방문은 하나
--        · 남의 병원 요청 걸기
--   ③ 요청을 걸어 잡으면 그 요청이 **같은 트랜잭션에서** 「일정 반영」으로
--      넘어갑니다. 지금까지 「일정 반영」은 말이었습니다 — 눌러도 일정이
--      안 생겨서, 병원에는 「반영했습니다」라고 적혀 있는데 차가 안 갔습니다.
--
-- 기존 데이터에 미치는 영향
--   · 표를 만들지도 지우지도 않습니다. 칸 하나(booked_at)만 늘립니다 —
--     기본값 없는 nullable 이라 기존 줄은 손대지 않고 즉시 끝납니다.
--   · 이미 있는 일정·수거·청구는 한 줄도 안 바뀝니다.
--   · RLS 는 한 줄도 안 건드립니다.
--   · 손으로 잡은 방문은 **자동 편성 되돌리기에 쓸려 나가지 않습니다.**
--   · 두 번 실행해도 안전합니다.
--
-- 실행 순서
--   1) 이 파일을 Supabase SQL Editor 에 통째로 붙여 넣고 실행
--   2) select public.app_schema_version();  → 58 이 나오면 끝

-- ════════════════════════════════════════════════════════════════════════════
-- 0058 — 날짜를 정해 방문을 잡을 수 있게
--
--  대표님이 실제로 겪으시는 일입니다.
--
--   병원에서 전화가 옵니다. 「다음 주 목요일에 와 주세요.」
--   ...그리고 그 약속을 넣을 데가 시스템에 없습니다.
--
--  지금 일정이 생기는 길은 셋뿐입니다.
--
--   일정 자동 편성   **오늘부터** 1·2·4주치 일괄. 12주 이력에서 반복 요일이
--                    잡히는 곳만 만듭니다 — 신규·불규칙 거래처는 아예 안 생깁니다.
--   수거 입력        **오늘** 다녀온 것을 기록하는 자리입니다.
--   엑셀 가져오기    지난 기록입니다.
--
--  그래서 약속은 수첩·카톡에 적어 두었다가 그날 아침에 **기억해 내야** 합니다.
--  없애려던 바로 그 방식이고, 잊으면 그대로 미수거 → 병원에서 긴급 전화입니다.
--
-- ── 이 마이그레이션이 하는 일 ───────────────────────────────────────────────
--
--   ① schedules.booked_at — 사람이 날짜를 정해 잡은 방문임을 표시하는 칸
--   ② book_visit(...)     — 그 방문을 만드는 함수 (검사는 아래에)
--
--  ⚠ **자동 편성과 섞이지 않습니다.** 자동 편성은 plan_batch 를 달고 만들어
--    지고, 「되돌리기」는 그 batch 를 통째로 지웁니다. 손으로 잡은 방문은
--    plan_batch 가 비어 있어 **되돌리기에 쓸려 나가지 않습니다.** 병원과 한
--    약속이 일괄 취소로 사라지면 안 됩니다.
--
--  ⚠ **금액을 한 칸도 다루지 않습니다.** 여기서 만드는 것은 '예정'이고,
--    수거이력·정산·매출에 잡히지 않습니다. 현장에서 수거 입력을 해야
--    비로소 완료가 되고 그때부터 실적입니다.
--
-- ── 서버가 막는 것 ──────────────────────────────────────────────────────────
--
--   · 사무실·관리자만 잡습니다 (기사는 남의 일정을 만들지 않습니다)
--   · 지난 날짜 금지 · 반년 넘는 미래 금지 (2027 로 잘못 찍는 것)
--   · 거래 중이 아닌 거래처 금지
--   · 그 거래처가 **안 하는 구분**은 금지 (기저귀를 안 받는 병원에 기저귀 방문)
--   · 차량 구분이 다르면 금지 (기저귀 차로 의료폐기물 방문)
--   · **같은 날 같은 구분이 이미 잡혀 있으면 금지** — 두 번 눌러도, 두
--     사람이 같은 순간에 눌러도 방문은 하나입니다 (0040 의 제약이 받칩니다)
--   · 요청을 걸어 잡을 때, 그 요청이 정말 그 거래처 것인지 다시 봅니다
--
-- ── 기존 데이터 영향 ────────────────────────────────────────────────────────
--   · 표를 만들지도 지우지도 않습니다. 칸 하나(booked_at)만 늘립니다 —
--     기본값이 없는 nullable 이라 기존 줄은 손대지 않고 즉시 끝납니다.
--   · 이미 있는 일정·수거·청구는 한 줄도 안 바뀝니다.
--   · RLS 는 한 줄도 안 건드립니다.
--   · 두 번 실행해도 안전합니다.
--
--  실행 순서: RUN_1 ~ RUN_43 뒤에 실행합니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 손으로 잡은 방문임을 남기는 칸 ───────────────────────────────────────
--
--  왜 칸이 따로 필요한가 — 「자동으로 생긴 예정」과 「사람이 병원과 약속한
--  방문」은 무게가 다릅니다. 자동 예정은 틀렸으면 지우면 되지만, 약속한
--  방문을 놓치면 그 병원은 전화기를 듭니다. 화면에서 갈라 보여 주려면
--  구분할 값이 있어야 합니다.

alter table public.schedules
  add column if not exists booked_at timestamptz;

comment on column public.schedules.booked_at is
  '사람이 날짜를 정해 잡은 방문 (0058). 비어 있으면 자동 편성이거나 현장 입력입니다.';


-- ── 2. 방문 잡기 ────────────────────────────────────────────────────────────

create or replace function public.book_visit(
  p_client_id   uuid,
  p_date        date,
  p_waste_type  text,
  p_time        text    default '',
  p_vehicle_id  uuid    default null,
  p_memo        text    default '',
  p_expected    integer default null,
  p_request_id  uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client  public.clients%rowtype;
  v_veh     public.vehicles%rowtype;
  v_req     public.client_requests%rowtype;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_kg      integer := greatest(0, coalesce(p_expected, 0));
  v_memo    text := btrim(coalesce(p_memo, ''));
  v_time    text := btrim(coalesce(p_time, ''));
  v_id      uuid;
begin
  --  「누가」는 감사기록 트리거(0015)가 서버에서 직접 적습니다.
  if not public.is_staff() then
    raise exception '방문 예약은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_client_id is null or p_date is null then
    raise exception '거래처와 날짜를 모두 정해 주세요.' using errcode = 'P0001';
  end if;

  --  거래처 행을 잠그고 시작합니다 (0040 과 같은 이유). 두 사람이 같은
  --  순간에 같은 날을 잡아도 하나만 통과합니다.
  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not v_client.active then
    raise exception '거래 중이 아닌 거래처(%)에는 방문을 잡을 수 없습니다.', v_client.name
      using errcode = 'P0001';
  end if;

  if p_waste_type not in ('의료폐기물', '일회용기저귀') then
    raise exception '폐기물 구분이 올바르지 않습니다: %', coalesce(p_waste_type, '(없음)')
      using errcode = 'P0001';
  end if;

  --  그 거래처가 실제로 배출하지 않는 구분은 막습니다. 기저귀를 안 받는
  --  병원에 기저귀 방문이 잡히면 기사님이 헛걸음을 합니다.
  if p_waste_type = '의료폐기물' and not coalesce(v_client.collects_medical_waste, false) then
    raise exception '%는 의료폐기물을 배출하지 않는 거래처입니다. 거래처 정보를 먼저 확인해 주세요.', v_client.name
      using errcode = 'P0001';
  end if;
  if p_waste_type = '일회용기저귀' and not coalesce(v_client.collects_diaper, false) then
    raise exception '%는 일회용기저귀를 배출하지 않는 거래처입니다. 거래처 정보를 먼저 확인해 주세요.', v_client.name
      using errcode = 'P0001';
  end if;

  --  날짜 — 지난 날은 예정이 될 수 없고, 반년 너머는 오타일 가능성이 큽니다.
  if p_date < v_today then
    raise exception '지난 날짜(%)에는 방문을 잡을 수 없습니다. 이미 다녀온 것이면 수거 입력에 기록해 주세요.', p_date
      using errcode = 'P0001';
  end if;
  if p_date > v_today + 180 then
    raise exception '너무 먼 날짜(%)입니다. 반년 앞까지만 잡습니다 — 연도를 잘못 고르지 않았는지 확인해 주세요.', p_date
      using errcode = 'P0001';
  end if;

  --  시각은 'HH:MM' 이거나 비어 있어야 합니다. 형식이 흐트러지면 오늘 일정
  --  화면의 정렬이 무너집니다.
  if v_time <> '' and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '방문 시각이 올바르지 않습니다: % (예: 09:30)', v_time using errcode = 'P0001';
  end if;

  --  예상 수거량은 참고값입니다. 자릿수를 잘못 친 값이 그대로 남지 않게
  --  위쪽만 막습니다 (0013 과 같은 취지).
  if v_kg > 100000 then
    raise exception '예상 수거량(%kg)이 너무 큽니다. 자릿수를 확인해 주세요.', v_kg using errcode = 'P0001';
  end if;

  --  차량을 미리 정해 두는 경우 — 구분이 다르면 그 차는 그 폐기물을
  --  실을 수 없습니다.
  if p_vehicle_id is not null then
    select * into v_veh from public.vehicles where id = p_vehicle_id;
    if not found then
      raise exception '차량을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if not v_veh.active then
      raise exception '운행하지 않는 차량(%)입니다.', v_veh.name using errcode = 'P0001';
    end if;
    if v_veh.waste_type <> p_waste_type then
      raise exception '%는 % 차량입니다 — % 방문에 배정할 수 없습니다.',
        v_veh.name, v_veh.waste_type, p_waste_type using errcode = 'P0001';
    end if;
  end if;

  --  요청을 걸어 잡는 경우 — 남의 병원 요청을 걸 수 없습니다.
  if p_request_id is not null then
    select * into v_req from public.client_requests where id = p_request_id for update;
    if not found then
      raise exception '요청을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_req.client_id <> p_client_id then
      raise exception '다른 거래처의 요청입니다 — 요청을 올린 곳과 방문을 잡는 곳이 다릅니다.'
        using errcode = 'P0001';
    end if;
  end if;

  --  같은 날 같은 구분이 이미 있으면 잡지 않습니다.
  --
  --   ⚠ 「덮어쓰기」로 만들면 안 됩니다. 이미 기사님에게 나간 방문의 시각·
  --     차량이 조용히 바뀌면 현장이 어긋납니다. 있는 그대로 알려 주고
  --     사람이 판단하게 합니다.
  if exists (
    select 1 from public.schedules
     where client_id = p_client_id and date = p_date and waste_type = p_waste_type
       and coalesce(is_additional, false) = false
  ) then
    raise exception '%의 % % 방문은 이미 잡혀 있습니다. 같은 날 한 번 더 가야 하면, 그날 수거 입력에서 「추가 수거」로 기록해 주세요.',
      v_client.name, to_char(p_date, 'MM월 DD일'), p_waste_type using errcode = 'P0001';
  end if;

  --  여기까지 왔어도 다른 접속이 방금 넣었을 수 있습니다. 그때는 0040 의
  --  제약(schedules_planned_uniq)이 막고, 우리는 사람이 읽을 수 있는 말로
  --  바꿔 돌려줍니다.
  insert into public.schedules
    (date, client_id, waste_type, vehicle_id, scheduled_time, status,
     expected_amount, actual_amount, memo, origin, is_additional, booked_at)
  values
    (p_date, p_client_id, p_waste_type, p_vehicle_id, v_time, '예정',
     v_kg, null, v_memo, 'system', false, now())
  on conflict (client_id, date, waste_type)
    where status = '예정' and coalesce(is_additional, false) = false
    do nothing
  returning id into v_id;

  if v_id is null then
    raise exception '%의 % 방문을 다른 사람이 방금 잡았습니다. 화면을 새로 고쳐 확인해 주세요.',
      v_client.name, to_char(p_date, 'MM월 DD일') using errcode = 'P0001';
  end if;

  --  요청을 걸었으면 그 요청을 「일정 반영」으로 옮깁니다.
  --
  --   ⚠ 같은 트랜잭션 안에서 합니다. 방문만 생기고 요청이 그대로면 병원
  --     화면에는 「접수」로 남아 담당자가 한 번 더 전화를 겁니다.
  --   ⚠ 회신은 **덮어쓰지 않고 이어 붙입니다.** 사람이 적어 둔 말을
  --     시스템이 지우면 안 됩니다.
  if v_req.id is not null then
    update public.client_requests
       set status = case when status = '처리 완료' then status else '일정 반영' end,
           reply = btrim(
             case when btrim(coalesce(reply, '')) = '' then '' else reply || E'\n' end
             || to_char(p_date, 'MM월 DD일')
             || case when v_time <> '' then ' ' || v_time else '' end
             || ' 방문으로 잡았습니다.'
           ),
           handled_at = now()
     where id = v_req.id;
  end if;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('schedule.book', 'schedules', v_id::text, p_client_id, v_client.name,
     jsonb_build_object('date', p_date, 'wasteType', p_waste_type, 'time', v_time,
                        'vehicleId', p_vehicle_id, 'expected', v_kg,
                        'requestId', p_request_id),
     format('%s %s %s 방문 예약%s',
            v_client.name, to_char(p_date, 'YYYY-MM-DD'), p_waste_type,
            case when v_time <> '' then ' ' || v_time else '' end),
     '방문 예약', 'app');

  return jsonb_build_object(
    'id', v_id, 'date', p_date, 'wasteType', p_waste_type,
    'time', v_time, 'clientName', v_client.name,
    'requestUpdated', (v_req.id is not null)
  );
end;
$$;

revoke all on function public.book_visit(uuid, date, text, text, uuid, text, integer, uuid) from public;
grant execute on function public.book_visit(uuid, date, text, text, uuid, text, integer, uuid) to authenticated;

comment on function public.book_visit(uuid, date, text, text, uuid, text, integer, uuid) is
  '날짜를 정해 방문을 잡습니다 (0058). 지난 날짜·먼 미래·안 하는 구분·중복은 막고, 요청을 걸면 같은 트랜잭션에서 「일정 반영」으로 옮깁니다.';


-- ── 3. 자가진단에 이번 판을 더합니다 ────────────────────────────────────────
--
--  ⚠ 여기를 안 늘리면, 이 SQL 을 실행하지 않은 서버에서 앱이 「이유를 모른 채」
--    실패합니다. 무엇이 없는지 이름으로 적혀야 합니다.

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
    'month_close_marks','client_assignments','staff_invites'
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
    'month_close_marks_uniq',
    'client_requests_request_uniq','site_notes_request_uniq',
    'client_assignments_profile_idx'
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
as $$ select 58 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
