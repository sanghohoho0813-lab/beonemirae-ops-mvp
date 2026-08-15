-- ─────────────────────────────────────────────────────────────────────────────
-- 0043. 자재 공급·입고를 한 번에 · DB 자가진단
--
--  ── ① 자재 화면의 공급 등록이 네 번의 요청이었습니다 ───────────────────
--
--   「병원에 박스를 줬다」는 기록은 두 군데에 닿습니다.
--    · 사무실 재고가 그만큼 줄어듭니다
--    · **월말 청구에 자재비로 들어갑니다** — 즉 돈입니다
--
--   그런데 자재 화면의 공급 등록은 화면이 네 번 따로 불렀습니다.
--     1) materials 에 한 줄
--     2) office_stock 에 **「내가 아는 재고 − 이번 수량」이라는 절대값**을 씀
--     3) 원장(material_transactions)에 한 줄
--     4) 감사기록
--
--   여기서 세 가지가 무너집니다.
--
--    ·「두 사람이 같은 순간에」 — 둘 다 같은 옛 재고 값을 보고 있으면
--      나중에 쓴 쪽이 앞 차감을 **지웁니다.** 재고가 실제보다 많아 보이고,
--      나중에 「재고보다 많이 공급할 수 없습니다」로 현장이 막힙니다.
--
--    ·「중간에 끊기면」 — 자재는 기록됐는데 재고는 그대로이거나 그 반대.
--      한 트랜잭션이 아니라 어느 쪽이 남을지 알 수 없습니다.
--
--    ·「다시 누르면」 — materials 에 막을 제약이 없어 **두 줄**이 됩니다.
--      그 달 청구에 자재비가 두 배로 들어갑니다.
--
--   수거 입력(0013)은 이미 서버 함수 하나가 잠그고 상대값으로 차감합니다.
--   같은 사실인데 어느 화면에서 넣느냐로 결과가 달랐습니다. 같게 만듭니다.
--
--  ── ② 판 번호가 맞아도 실제로 다 있는지는 몰랐습니다 ───────────────────
--
--   지금 화면은 `app_schema_version()` 숫자 하나만 봅니다. 그 숫자는 각
--   마이그레이션 **마지막 줄**에서 올라가므로 「파일이 끝까지 돌았다」까지는
--   말해 줍니다. 그러나 그 뒤에 누가 정책을 지우거나, 함수가 다른 이름으로
--   덮이거나, 색인이 사라져도 숫자는 그대로 42 입니다.
--
--   돈을 지키는 것들이 실제로 **거기 있는지** 서버가 직접 확인하고,
--   없으면 **이름을 대서** 알려 줍니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ① 저장 시도 표 ──────────────────────────────────────────────────────────
alter table public.materials
  add column if not exists request_id uuid;

comment on column public.materials.request_id is
  '화면이 만든 저장 시도 표 (0043). 같은 표가 다시 오면 새로 넣지 않습니다.';

create unique index if not exists materials_request_uniq
  on public.materials (request_id) where request_id is not null;

alter table public.material_transactions
  add column if not exists request_id uuid;

comment on column public.material_transactions.request_id is
  '입고 저장 시도 표 (0043). 같은 표로 두 번 넣어도 재고가 두 번 늘지 않습니다.';

create unique index if not exists material_tx_request_uniq
  on public.material_transactions (request_id, item) where request_id is not null;


-- ── 자재 공급 (자재 화면) ───────────────────────────────────────────────────
--
--  화면이 하던 네 가지를 서버가 한 트랜잭션에서 합니다. 재고는 **상대값**으로
--  줄입니다(`bag = bag - n`) — 화면이 아는 값이 낡았어도 상관없습니다.
--
--  수량 이름은 자재 화면이 쓰는 그대로입니다.
--   box(골판지 전용박스) · vinyl(전용 봉투) · needle(합성수지 바늘통)
create or replace function public.supply_materials(
  p_client_id  uuid,
  p_date       date,
  p_box        integer,
  p_vinyl      integer,
  p_needle     integer,
  p_additional boolean default false,
  p_memo       text default '',
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_client public.clients%rowtype;
  v_stock  public.office_stock%rowtype;
  v_old    public.materials%rowtype;
  v_id     uuid;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_box    integer := coalesce(p_box, 0);
  v_vinyl  integer := coalesce(p_vinyl, 0);
  v_needle integer := coalesce(p_needle, 0);
begin
  select * into v_actor from public.profiles where id = auth.uid();
  --  자재는 현장에서 직접 건네줍니다. 기사도 기록할 수 있어야 합니다.
  if not public.is_active_user() then
    raise exception '자재 공급은 승인된 사용자만 기록할 수 있습니다.' using errcode = 'P0001';
  end if;

  --  ── 이 저장은 이미 들어와 있는가 ──────────────────────────────────────
  --   재고 행을 잠그기 전에 한 번 봅니다(빠른 길). 잠근 뒤에 한 번 더 봅니다
  --   — 같은 순간에 둘이 들어오면 앞엣것이 끝난 뒤에야 뒤엣것이 확인합니다.
  if p_request_id is not null then
    select * into v_old from public.materials where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_old.id, 'alreadySaved', true);
    end if;
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception '자재를 준 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception '공급한 날짜를 넣어 주세요.' using errcode = 'P0001';
  end if;
  if p_date > v_today then
    raise exception '아직 오지 않은 날짜(%)로는 공급을 기록할 수 없습니다.', p_date
      using errcode = 'P0001';
  end if;
  if v_box < 0 or v_vinyl < 0 or v_needle < 0 then
    raise exception '수량은 0보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_box = 0 and v_vinyl = 0 and v_needle = 0 then
    raise exception '공급한 자재가 없습니다. 수량을 넣어 주세요.' using errcode = 'P0001';
  end if;

  --  재고 한 줄을 잠급니다. 여기부터 끝까지 다른 접속이 끼어들 수 없습니다.
  select * into v_stock from public.office_stock where id = 1 for update;

  --  잠근 뒤 다시 확인 — 같은 표가 방금 들어왔을 수 있습니다
  if p_request_id is not null then
    select * into v_old from public.materials where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_old.id, 'alreadySaved', true);
    end if;
  end if;

  --  0013 과 같은 문구를 씁니다 — 현장이 두 화면에서 다른 말을 듣지 않게.
  if v_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_box using errcode = 'P0001';
  end if;
  if v_vinyl > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_vinyl using errcode = 'P0001';
  end if;
  if v_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_needle using errcode = 'P0001';
  end if;

  insert into public.materials
    (date, client_id, box_count, vinyl_count, needle_box_count,
     is_additional_request, memo, origin, created_by, request_id)
  values
    (p_date, p_client_id, v_box, v_vinyl, v_needle,
     coalesce(p_additional, false), coalesce(p_memo, ''), 'field', v_actor.id, p_request_id)
  returning id into v_id;

  --  **상대값**으로 줄입니다. 화면이 아는 재고가 낡았어도 정확합니다.
  update public.office_stock set
    corrugated_box = corrugated_box - v_box,
    bag            = bag - v_vinyl,
    needle_box     = needle_box - v_needle,
    updated_by     = v_actor.id
  where id = 1;

  insert into public.material_transactions (kind, item, qty, client_id, material_id, memo, created_by)
  select '공급', item, -qty, p_client_id, v_id,
         coalesce(nullif(p_memo, ''), '자재 화면에서 공급 등록'), v_actor.id
  from (values ('corrugatedBox', v_box), ('bag', v_vinyl), ('needleBox', v_needle)) as t(item, qty)
  where qty > 0;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('material.supply', 'materials', v_id::text, p_client_id, coalesce(v_client.name, ''),
     jsonb_build_object('date', p_date, 'box', v_box, 'vinyl', v_vinyl, 'needle', v_needle,
                        'additional', coalesce(p_additional, false)),
     format('자재 공급 — %s · 박스 %s · 비닐 %s · 바늘통 %s',
            coalesce(v_client.name, '거래처'), v_box, v_vinyl, v_needle),
     '자재 관리', 'app');

  return jsonb_build_object('id', v_id, 'alreadySaved', false,
                            'stock', jsonb_build_object(
                              'corrugatedBox', v_stock.corrugated_box - v_box,
                              'bag', v_stock.bag - v_vinyl,
                              'needleBox', v_stock.needle_box - v_needle));
end;
$$;

revoke all on function public.supply_materials(uuid, date, integer, integer, integer, boolean, text, uuid) from public;
grant execute on function public.supply_materials(uuid, date, integer, integer, integer, boolean, text, uuid) to authenticated;

comment on function public.supply_materials(uuid, date, integer, integer, integer, boolean, text, uuid) is
  '자재 공급 기록 + 재고 차감 + 원장 + 감사기록을 한 트랜잭션에서 (0043). 같은 저장 표는 한 번만.';


-- ── 자재 입고 ───────────────────────────────────────────────────────────────
--
--  입고도 같은 문제였습니다 — 「내가 아는 재고 + 넣을 양」을 절대값으로 썼습니다.
--  두 사람이 같은 순간에 50개씩 넣으면 100개가 아니라 50개만 늘었습니다.
create or replace function public.receive_stock(
  p_box        integer,
  p_plastic    integer,
  p_vinyl      integer,
  p_needle     integer,
  p_memo       text default '',
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_next  public.office_stock%rowtype;
  v_box     integer := greatest(coalesce(p_box, 0), 0);
  v_plastic integer := greatest(coalesce(p_plastic, 0), 0);
  v_vinyl   integer := greatest(coalesce(p_vinyl, 0), 0);
  v_needle  integer := greatest(coalesce(p_needle, 0), 0);
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '자재 입고는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if v_box = 0 and v_plastic = 0 and v_vinyl = 0 and v_needle = 0 then
    raise exception '넣을 수량이 없습니다.' using errcode = 'P0001';
  end if;

  if p_request_id is not null
     and exists (select 1 from public.material_transactions where request_id = p_request_id) then
    select * into v_next from public.office_stock where id = 1;
    return jsonb_build_object('alreadySaved', true,
                              'stock', jsonb_build_object(
                                'corrugatedBox', v_next.corrugated_box,
                                'plasticContainer', v_next.plastic_container,
                                'bag', v_next.bag,
                                'needleBox', v_next.needle_box));
  end if;

  perform 1 from public.office_stock where id = 1 for update;

  --  잠근 뒤 다시 확인
  if p_request_id is not null
     and exists (select 1 from public.material_transactions where request_id = p_request_id) then
    select * into v_next from public.office_stock where id = 1;
    return jsonb_build_object('alreadySaved', true,
                              'stock', jsonb_build_object(
                                'corrugatedBox', v_next.corrugated_box,
                                'plasticContainer', v_next.plastic_container,
                                'bag', v_next.bag,
                                'needleBox', v_next.needle_box));
  end if;

  insert into public.material_transactions (kind, item, qty, memo, created_by, request_id)
  select '입고', item, qty, coalesce(nullif(p_memo, ''), '자재 입고'), v_actor.id, p_request_id
  from (values ('corrugatedBox', v_box), ('plasticContainer', v_plastic),
               ('bag', v_vinyl), ('needleBox', v_needle)) as t(item, qty)
  where qty > 0;

  update public.office_stock set
    corrugated_box    = corrugated_box + v_box,
    plastic_container = plastic_container + v_plastic,
    bag               = bag + v_vinyl,
    needle_box        = needle_box + v_needle,
    updated_by        = v_actor.id
  where id = 1
  returning * into v_next;

  insert into public.audit_logs
    (action, entity, after_data, summary, screen, source)
  values
    ('stock.receive', 'office_stock',
     jsonb_build_object('corrugatedBox', v_box, 'plasticContainer', v_plastic,
                        'bag', v_vinyl, 'needleBox', v_needle),
     format('자재 입고 — 박스 +%s · 용기 +%s · 봉투 +%s · 바늘통 +%s%s',
            v_box, v_plastic, v_vinyl, v_needle,
            case when coalesce(p_memo, '') = '' then '' else ' (' || p_memo || ')' end),
     '자재 관리', 'app');

  return jsonb_build_object('alreadySaved', false,
                            'stock', jsonb_build_object(
                              'corrugatedBox', v_next.corrugated_box,
                              'plasticContainer', v_next.plastic_container,
                              'bag', v_next.bag,
                              'needleBox', v_next.needle_box));
end;
$$;

revoke all on function public.receive_stock(integer, integer, integer, integer, text, uuid) from public;
grant execute on function public.receive_stock(integer, integer, integer, integer, text, uuid) to authenticated;

comment on function public.receive_stock(integer, integer, integer, integer, text, uuid) is
  '자재 입고 — 재고를 상대값으로 늘리고 원장·감사기록을 함께 (0043). 같은 저장 표는 한 번만.';


-- ── ② DB 자가진단 ───────────────────────────────────────────────────────────
--
--  판 번호는 「파일이 끝까지 돌았다」까지만 말해 줍니다. 그 뒤에 무엇이
--  사라져도 숫자는 그대로입니다. 돈을 지키는 것들이 실제로 있는지 셉니다.
--
--  기준 목록은 여기(0043 시점)에 적어 둡니다. 새 마이그레이션에서 무언가를
--  더하면 이 목록도 함께 늘립니다 — 목록이 낡으면 진단이 거짓말을 합니다.
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

  --  표
  foreach v_name in array array[
    'clients','vehicles','schedules','materials','material_transactions','office_stock',
    'payments','payment_receipts','client_prices','client_monthly_actuals','revenue_overrides',
    'operating_costs','holidays','site_notes','client_requests','request_overrides',
    'audit_logs','collection_events','profiles','dev_requests','client_documents',
    'sales_leads','sales_lead_events','experiment_settings','performance_baselines'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('표 ' || v_name);
    end if;
  end loop;

  --  칸 — 없으면 화면이 조용히 빈 값으로 보입니다
  foreach v_pair slice 1 in array array[
    ['clients','flat_fee_when_empty'], ['clients','collect_time'], ['clients','disposal_site'],
    ['clients','diaper_cycle'], ['clients','biz_no'], ['clients','vat_mode'],
    ['payments','snapshot'], ['payments','canceled_at'],
    ['payment_receipts','source_ref'], ['payment_receipts','request_id'],
    ['materials','request_id'], ['material_transactions','request_id'],
    ['schedules','plan_batch'], ['schedules','is_additional'],
    ['profiles','approved_at']
  ] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_pair[1] and column_name = v_pair[2]
    ) then
      v_missing := v_missing || ('칸 ' || v_pair[1] || '.' || v_pair[2]);
    end if;
  end loop;

  --  함수 — 돈이 지나가는 길
  foreach v_name in array array[
    'confirm_billing','cancel_billing','add_payment_receipt','delete_payment_receipt',
    'supply_materials','receive_stock','delete_material','complete_collection',
    'create_planned_schedules','set_revenue_override','delete_revenue_override',
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

  --  색인 — 「두 번 들어가지 않는다」를 실제로 지키는 것들
  foreach v_name in array array[
    'payment_receipts_request_uniq','materials_request_uniq','material_tx_request_uniq',
    'schedules_planned_uniq','schedules_one_completion_per_day'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('색인 ' || v_name);
    end if;
  end loop;

  --  줄 잠금 — 돈 표는 지울 수 없어야 합니다
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

  --  모든 표에 RLS 가 켜져 있는가
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

comment on function public.app_health_check() is
  'DB 자가진단 (0043). 돈을 지키는 표·칸·함수·색인·권한이 실제로 있는지 세어 없는 것을 이름으로 돌려줍니다. 관리자만.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 43 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0043). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
