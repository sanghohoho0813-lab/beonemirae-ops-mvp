-- ════════════════════════════════════════════════════════════════════════════
-- 0075 — 자재 공급을 **규격별로** 기록합니다
--
--  대표님 지적: 「자재관리에 주고 온 자재도 있어야 해. 지금은 4개밖에
--  없잖아? 10개 이상 정리돼야 하고」.
--
--  ── 무엇이 문제였나 ────────────────────────────────────────────────────
--
--   수거 입력은 **규격별 13가지**로 받습니다(63L 박스 · 12L 박스 · 20L
--   합성수지 …). 정산과 거래명세서도 규격마다 다른 단가를 씁니다.
--   그런데 **자재 관리 화면만** 옛 3칸(박스 · 비닐 · 바늘통)에 멈춰
--   있었습니다. 여기서 등록하면 규격이 안 남고, 나중에 정산이
--   「규격 미상」으로 **대표 규격 단가를 추정**합니다.
--
--   63L 박스와 12L 박스는 매입가가 다릅니다. 추정이 섞이면 원가가 틀립니다.
--   화면만 고칠 수 없습니다 — 서버가 규격을 받을 자리가 없었습니다.
--
--  ── 어떻게 ─────────────────────────────────────────────────────────────
--
--   ⚠ 기존 supply_materials(8인자) 는 **그대로 둡니다.** 지우면 배포 순서가
--     어긋나는 순간 자재 등록이 통째로 멎습니다. 새 함수를 옆에 놓습니다.
--   ⚠ 옛 3칸도 **함께 채웁니다.** 통계·리포트가 아직 그 칸을 읽습니다.
--     규격에서 계산해 넣으므로 두 값이 어긋날 수 없습니다.
--   ⚠ 잠금·중복방지·재고 검사·원장·감사기록은 0043 과 **같은 순서 그대로**
--     입니다. 여기서 규칙을 새로 만들지 않습니다.
-- ════════════════════════════════════════════════════════════════════════════

--  규격 → 재고 칸. 화면(src/lib/billing.ts ITEMS)과 **같은 표**여야 합니다.
--  ⚠ 표로 둡니다 — 함수 안에 CASE 로 적어 두면 규격이 늘 때 어디를 고쳐야
--    하는지 아무도 모릅니다.
create table if not exists public.item_buckets (
  item   text primary key,
  bucket text not null check (bucket in ('corrugatedBox','plasticContainer','bag','needleBox')),
  label  text not null default ''
);

insert into public.item_buckets (item, bucket, label) values
  ('plastic2',    'plasticContainer', '2L 합성수지'),
  ('plastic5',    'plasticContainer', '5L 합성수지'),
  ('plastic10',   'plasticContainer', '10L 합성수지'),
  ('plastic20',   'plasticContainer', '20L 합성수지'),
  ('box63',       'corrugatedBox',    '63L 박스'),
  ('box35',       'corrugatedBox',    '35L 박스'),
  ('box30',       'corrugatedBox',    '30L 박스'),
  ('box12',       'corrugatedBox',    '12L 박스'),
  ('box4',        'corrugatedBox',    '4L 박스'),
  ('box79',       'corrugatedBox',    '79L 박스'),
  ('diaperBoxM',  'corrugatedBox',    '기저귀박스 (중)'),
  ('pouch12',     'bag',              '12L 봉투형용기'),
  ('diaperBag40', 'bag',              '기저귀비닐 40L')
on conflict (item) do update set bucket = excluded.bucket, label = excluded.label;

alter table public.item_buckets enable row level security;
drop policy if exists item_buckets_read on public.item_buckets;
create policy item_buckets_read on public.item_buckets
  for select using (public.is_active_user());
--  쓰기 정책 없음 = 화면에서 못 고칩니다. 규격이 늘면 마이그레이션으로 넣습니다.

comment on table public.item_buckets is
  '규격 → 재고 칸 대응 (0075). 화면의 ITEMS 와 같은 표여야 합니다.';

-- ── 규격별 자재 공급 ────────────────────────────────────────────────────────
create or replace function public.supply_materials_items(
  p_client_id  uuid,
  p_date       date,
  p_items      jsonb,
  p_additional boolean default false,
  p_memo       text default '',
  p_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor  profiles%rowtype;
  v_client clients%rowtype;
  v_stock  office_stock%rowtype;
  v_old    materials%rowtype;
  v_id     uuid;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_box    integer := 0;   -- corrugatedBox 합계
  v_plas   integer := 0;   -- plasticContainer 합계
  v_bag    integer := 0;   -- bag 합계
  v_needle integer := 0;   -- needleBox 합계
  v_total  integer := 0;
  v_bad    text;
  v_line   text;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  --  자재는 현장에서 직접 건네줍니다 — 기사님도 기록할 수 있어야 합니다.
  if not found or not public.is_active_user() then
    raise exception '자재 공급은 승인된 사용자만 기록할 수 있습니다.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_items) <> 'object' then
    raise exception '공급한 규격과 수량을 넣어 주세요.' using errcode = 'P0001';
  end if;

  --  ⚠ 모르는 규격은 **조용히 버리지 않고** 거절합니다. 버리면 화면에서는
  --    3개를 넣었는데 서버에는 0개가 남는 일이 생깁니다.
  select k into v_bad
    from jsonb_each_text(p_items) as t(k, v)
   where not exists (select 1 from item_buckets b where b.item = t.k)
   limit 1;
  if v_bad is not null then
    raise exception '모르는 규격입니다: %', v_bad using errcode = 'P0001';
  end if;

  --  음수 방어 — 0013 과 같은 이유입니다. 음수를 섞으면 재고가 **늘어납니다.**
  if exists (select 1 from jsonb_each_text(p_items) as t(k, v) where (v)::numeric < 0) then
    raise exception '수량은 0보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  ── 이 저장은 이미 들어와 있는가 (0043 과 같은 두 번 확인) ────────────
  if p_request_id is not null then
    select * into v_old from materials where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_old.id, 'alreadySaved', true);
    end if;
  end if;

  select * into v_client from clients where id = p_client_id;
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

  --  규격 → 재고 칸 합계
  select
    coalesce(sum(case when b.bucket = 'corrugatedBox'    then (t.v)::integer end), 0),
    coalesce(sum(case when b.bucket = 'plasticContainer' then (t.v)::integer end), 0),
    coalesce(sum(case when b.bucket = 'bag'              then (t.v)::integer end), 0),
    coalesce(sum(case when b.bucket = 'needleBox'        then (t.v)::integer end), 0),
    coalesce(sum((t.v)::integer), 0)
    into v_box, v_plas, v_bag, v_needle, v_total
    from jsonb_each_text(p_items) as t(k, v)
    join item_buckets b on b.item = t.k;

  if v_total = 0 then
    raise exception '공급한 자재가 없습니다. 수량을 넣어 주세요.' using errcode = 'P0001';
  end if;

  --  재고 한 줄을 잠급니다. 여기부터 끝까지 다른 접속이 끼어들 수 없습니다.
  select * into v_stock from office_stock where id = 1 for update;

  --  잠근 뒤 다시 확인 — 같은 표가 방금 들어왔을 수 있습니다
  if p_request_id is not null then
    select * into v_old from materials where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_old.id, 'alreadySaved', true);
    end if;
  end if;

  --  0013·0043 과 **같은 문구**를 씁니다 — 세 화면이 다른 말을 하지 않게.
  if v_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_box using errcode = 'P0001';
  end if;
  if v_plas > v_stock.plastic_container then
    raise exception '사무실 합성수지 전용용기 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.plastic_container, v_plas using errcode = 'P0001';
  end if;
  if v_bag > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_bag using errcode = 'P0001';
  end if;
  if v_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_needle using errcode = 'P0001';
  end if;

  --  ⚠ 옛 3칸도 함께 채웁니다. 통계·리포트가 아직 그 칸을 읽습니다.
  --    complete_collection 과 **같은 규칙**입니다 (합성수지+바늘통 → needle_box_count).
  insert into materials
    (date, client_id, box_count, vinyl_count, needle_box_count,
     is_additional_request, memo, origin, created_by, request_id, items)
  values
    (p_date, p_client_id, v_box, v_bag, v_plas + v_needle,
     coalesce(p_additional, false), coalesce(p_memo, ''), 'field', v_actor.id, p_request_id,
     p_items)
  returning id into v_id;

  --  **상대값**으로 줄입니다. 화면이 아는 재고가 낡았어도 정확합니다.
  update office_stock set
    corrugated_box    = corrugated_box - v_box,
    plastic_container = plastic_container - v_plas,
    bag               = bag - v_bag,
    needle_box        = needle_box - v_needle,
    updated_by        = v_actor.id
  where id = 1;

  insert into material_transactions (kind, item, qty, client_id, material_id, memo, created_by)
  select '공급', item, -qty, p_client_id, v_id,
         coalesce(nullif(p_memo, ''), '자재 화면에서 공급 등록'), v_actor.id
  from (values
    ('corrugatedBox', v_box), ('plasticContainer', v_plas),
    ('bag', v_bag), ('needleBox', v_needle)
  ) as t(item, qty)
  where qty > 0;

  --  ⚠ 감사기록에는 **규격 그대로** 적습니다. 「박스 12」가 아니라
  --    「63L 박스 4 · 12L 박스 8」이어야 나중에 되짚을 수 있습니다.
  select string_agg(format('%s %s', coalesce(b.label, t.k), t.v), ' · ' order by t.k)
    into v_line
    from jsonb_each_text(p_items) as t(k, v)
    left join item_buckets b on b.item = t.k
   where (t.v)::integer > 0;

  insert into audit_logs
    (actor_id, actor_name, actor_role, action, entity, entity_id, client_id, client_name,
     after_data, summary, screen, source)
  values
    (v_actor.id, v_actor.name, v_actor.role, 'material.supply', 'materials', v_id::text,
     p_client_id, coalesce(v_client.name, ''),
     jsonb_build_object('date', p_date, 'items', p_items, 'additional', coalesce(p_additional, false)),
     format('자재 공급 — %s · %s', coalesce(v_client.name, '거래처'), coalesce(v_line, '')),
     '자재 관리', 'app');

  return jsonb_build_object('id', v_id, 'alreadySaved', false,
                            'stock', jsonb_build_object(
                              'corrugatedBox', v_stock.corrugated_box - v_box,
                              'plasticContainer', v_stock.plastic_container - v_plas,
                              'bag', v_stock.bag - v_bag,
                              'needleBox', v_stock.needle_box - v_needle));
end $$;

revoke all on function public.supply_materials_items(uuid, date, jsonb, boolean, text, uuid) from public;
grant execute on function public.supply_materials_items(uuid, date, jsonb, boolean, text, uuid) to authenticated;

comment on function public.supply_materials_items(uuid, date, jsonb, boolean, text, uuid) is
  '규격별 자재 공급 (0075). 옛 3칸도 규격에서 계산해 함께 채웁니다 — 두 값이 어긋날 수 없습니다.';

-- ── 판(schema) 번호 ─────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 75 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   아래가 각각 13 · 75 여야 합니다.
select count(*) as "규격 수" from public.item_buckets;
select public.app_schema_version() as "판 번호";
