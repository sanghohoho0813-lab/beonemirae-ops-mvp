-- ════════════════════════════════════════════════════════════════════════════
-- 0079 — 규격별 재고 (2L 합성수지 … 기저귀비닐 40L)
--
--  대표님: 「자재 관리 목차에서 2L 합성수지 ~ 기저귀비닐 40L 까지도 수량을
--  실시간으로 확인할 수 있게 해줘. 지금은 골판지 전용박스부터 합성수지
--  바늘통까지 4개밖에 없어서 불편해.」
--
--  ── 왜 4개뿐이었나 (화면 문제가 아닙니다) ─────────────────────────────────
--
--   서버가 **숫자를 넉 장만** 들고 있었습니다 (office_stock 의 네 칸).
--   0075 에서 공급은 13 규격으로 받게 됐지만, 재고는 그 13 개를 네 칸으로
--   **합쳐서** 깎았습니다. 그래서 「63L 박스가 몇 개 남았나」는 서버 어디에도
--   없는 값이었습니다. 화면을 아무리 고쳐도 나올 수 없습니다.
--
--  ── 여기서 지키는 것 ──────────────────────────────────────────────────────
--
--  ⚠ **지금 있는 네 칸을 13 개로 쪼개지 않습니다.** 골판지 480 개가
--    63L 몇 개, 35L 몇 개인지 **아무도 모릅니다.** 그럴듯하게 나눠 넣으면
--    그 숫자는 첫날부터 틀린 값이고, 대표님은 그것을 믿고 발주하게 됩니다.
--    그래서 세어 보기 전까지는 **「아직 안 세어 봄」(qty is null)** 입니다 —
--    0 개와 다릅니다.
--
--  ⚠ 기존 네 칸(office_stock)은 **그대로 둡니다.** 지우지도, 의미를 바꾸지도
--    않습니다. 입고·공급이 지금처럼 네 칸을 움직이고, 규격별은 그 **안쪽
--    내역**으로 따라 움직입니다. 기존 정산·중복방지·감사기록 그대로입니다.
--
--  ⚠ 세어 본 규격만 깎습니다. 안 세어 본 규격은 계속 「모름」입니다 —
--    모르는 수에서 5 를 빼도 여전히 모릅니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 규격별 재고 ───────────────────────────────────────────────────────────
--
--  qty null        = 아직 안 세어 봄 (0 개와 다릅니다)
--  counted_at null = 한 번도 안 세어 봄
create table if not exists public.office_stock_items (
  item        text primary key references public.item_buckets(item),
  qty         integer,
  counted_at  timestamptz,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);

alter table public.office_stock_items
  drop constraint if exists office_stock_items_non_negative;
alter table public.office_stock_items
  add constraint office_stock_items_non_negative check (qty is null or qty >= 0);

comment on table public.office_stock_items is
  '규격별 사무실 재고 (0079). qty null = 아직 안 세어 봄 — 0 개와 다릅니다.';
comment on column public.office_stock_items.qty is
  '남은 수량. null 이면 「모름」입니다. 지어내지 않습니다.';

--  13 규격을 「모름」으로 깔아 둡니다. 이미 있으면 손대지 않습니다.
insert into public.office_stock_items (item)
select b.item from public.item_buckets b
on conflict (item) do nothing;

alter table public.office_stock_items enable row level security;
drop policy if exists office_stock_items_read on public.office_stock_items;
create policy office_stock_items_read on public.office_stock_items
  for select using (public.is_active_user());
--  ⚠ 쓰기 정책은 두지 않습니다. 바꾸는 길은 아래 함수뿐입니다 —
--    그래야 원장(material_transactions)에 반드시 같이 남습니다.

-- ── ② 원장이 규격을 적을 수 있게 ────────────────────────────────────────────
--
--  ⚠ material_transactions.item 은 네 칸 이름만 허용하는 check 가 걸려
--    있습니다. 규격을 적을 칸을 **따로** 답니다 — 기존 칸의 뜻을 바꾸면
--    지금까지 쌓인 줄의 의미가 달라집니다.
alter table public.material_transactions
  add column if not exists item_key text references public.item_buckets(item);

comment on column public.material_transactions.item_key is
  '어느 규격인지 (0079). 비어 있으면 규격을 모르고 넣은 옛 줄입니다.';

-- ── ③ 처음 한 번 세기 · 다시 세기 ───────────────────────────────────────────
--
--  ⚠ 이것만이 「모름」을 숫자로 바꾸는 길입니다. 실제로 창고에 가서 센
--    수를 적는 자리입니다. 그래서 **더하기가 아니라 그 수로 정합니다.**
--  ⚠ 네 칸 합계(office_stock)는 **건드리지 않습니다.** 세는 것은 안쪽
--    내역을 알아 가는 일이지, 창고에 물건이 늘거나 주는 일이 아닙니다.
create or replace function public.count_stock_item(
  p_item   text,
  p_qty    integer,
  p_reason text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor  profiles%rowtype;
  v_before integer;
  v_label  text;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or not public.is_staff() then
    raise exception '사무실·관리자만 재고를 셀 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 0 then
    raise exception '센 수량을 0 이상으로 적어 주세요.' using errcode = 'P0001';
  end if;

  select label into v_label from item_buckets where item = p_item;
  if v_label is null then
    raise exception '모르는 규격입니다(%).', p_item using errcode = 'P0001';
  end if;

  select qty into v_before from office_stock_items where item = p_item for update;

  update office_stock_items
     set qty = p_qty, counted_at = now(), updated_at = now(), updated_by = v_actor.id
   where item = p_item;

  insert into material_transactions (kind, item, item_key, qty, memo, created_by)
  select '조정', b.bucket, p_item, p_qty - coalesce(v_before, 0),
         format('%s 재고 실사 %s → %s%s', v_label,
                coalesce(v_before::text, '모름'), p_qty,
                case when btrim(coalesce(p_reason, '')) = '' then '' else ' — ' || p_reason end),
         v_actor.id
    from item_buckets b where b.item = p_item;

  return jsonb_build_object('item', p_item, 'before', v_before, 'after', p_qty);
end $$;

-- ── ④ 규격으로 입고 ─────────────────────────────────────────────────────────
--
--  ⚠ 네 칸 합계는 **지금처럼** 늘립니다 (기존 흐름 그대로).
--  ⚠ 규격별은 **세어 본 것만** 늘립니다. 안 세어 본 규격은 계속 「모름」입니다 —
--    100 개가 들어온 것은 알아도 원래 몇 개였는지는 여전히 모릅니다.
create or replace function public.receive_stock_items(
  p_items      jsonb,
  p_memo       text default '',
  p_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor   profiles%rowtype;
  v_unknown text;
  v_add     record;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or not public.is_staff() then
    raise exception '사무실·관리자만 입고를 적을 수 있습니다.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'object' then
    raise exception '들어온 자재를 규격별로 적어 주세요.' using errcode = 'P0001';
  end if;

  --  ⚠ 모르는 규격은 **조용히 버리지 않고** 멈춥니다. 버리면 창고에는
  --    있는데 화면에는 없는 자재가 생깁니다.
  select string_agg(t.k, ', ') into v_unknown
    from jsonb_each_text(p_items) as t(k, v)
   where not exists (select 1 from item_buckets b where b.item = t.k);
  if v_unknown is not null then
    raise exception '모르는 규격입니다(%).', v_unknown using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each_text(p_items) as t(k, v) where (v)::numeric < 0) then
    raise exception '입고 수량은 0 보다 커야 합니다.' using errcode = 'P0001';
  end if;

  --  ① 네 칸 합계 — 지금까지와 같습니다
  for v_add in
    select b.bucket, sum((t.v)::integer) as n
      from jsonb_each_text(p_items) as t(k, v)
      join item_buckets b on b.item = t.k
     where (t.v)::integer > 0
     group by b.bucket
  loop
    update office_stock set
      corrugated_box    = corrugated_box    + case when v_add.bucket = 'corrugatedBox'    then v_add.n else 0 end,
      plastic_container = plastic_container + case when v_add.bucket = 'plasticContainer' then v_add.n else 0 end,
      bag               = bag               + case when v_add.bucket = 'bag'              then v_add.n else 0 end,
      needle_box        = needle_box        + case when v_add.bucket = 'needleBox'        then v_add.n else 0 end,
      updated_by = v_actor.id
     where id = 1;
  end loop;

  --  ② 규격별 — 세어 본 것만. 안 세어 본 것은 「모름」 그대로 둡니다.
  update office_stock_items s
     set qty = s.qty + (t.v)::integer, updated_at = now(), updated_by = v_actor.id
    from jsonb_each_text(p_items) as t(k, v)
   where s.item = t.k and s.qty is not null and (t.v)::integer > 0;

  --  ③ 원장 — 규격까지 남깁니다
  insert into material_transactions (kind, item, item_key, qty, memo, created_by)
  select '입고', b.bucket, t.k, (t.v)::integer,
         coalesce(nullif(btrim(p_memo), ''), '창고 입고'), v_actor.id
    from jsonb_each_text(p_items) as t(k, v)
    join item_buckets b on b.item = t.k
   where (t.v)::integer > 0;

  return jsonb_build_object('ok', true);
end $$;

-- ── ⑤ 공급하면 규격별도 같이 줄어듭니다 ─────────────────────────────────────
--
--  ⚠ 0075 의 supply_materials_items 는 규격을 받아 놓고 **네 칸으로 합쳐**
--    깎았습니다. 그 함수를 여기서 다시 선언합니다 — 0075 본문 그대로에
--    **두 군데만** 더했습니다:
--      ① 원장을 규격으로 남긴다 (칸별 합계는 예전과 똑같습니다)
--      ② 세어 본 규격의 재고를 깎는다
--    재고 한도 검사·중복방지(request_id)·정산용 옛 3칸·감사기록은
--    **한 글자도 바꾸지 않았습니다.**
--
--  ⚠ 트리거로 붙이지 않았습니다. 원장에 줄이 남는 것을 신호로 쓰면,
--    나중에 원장만 손보는 날 재고가 조용히 따라 움직입니다.

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

  --  ⚠ 0079 — 예전에는 여기서 **네 칸으로 합쳐** 남겼습니다. 규격을 이미
  --    알고 있으면서 버린 것이라, 「63L 박스가 언제 몇 개 나갔나」를 나중에
  --    되짚을 수 없었습니다. 이제 규격 그대로 남깁니다.
  --    칸별로 더하면 합계는 예전과 **똑같습니다** — 지금까지 쌓인 줄을
  --    읽던 화면·통계는 그대로 맞습니다.
  insert into material_transactions
    (kind, item, item_key, qty, client_id, material_id, memo, created_by)
  select '공급', b.bucket, t.k, -((t.v)::integer), p_client_id, v_id,
         coalesce(nullif(p_memo, ''), '자재 화면에서 공급 등록'), v_actor.id
    from jsonb_each_text(p_items) as t(k, v)
    join item_buckets b on b.item = t.k
   where (t.v)::integer > 0;

  --  ⚠ 0079 — 규격별 재고는 여기서 안 깎습니다. materials 표에 붙인 트리거가
  --    합니다. 자재를 주는 길이 **두 갈래**이기 때문입니다 —
  --    이 함수(자재 화면)와 complete_collection(수거 입력 동시공급).
  --    두 곳에 같은 계산을 넣으면 언젠가 한쪽만 고쳐집니다.

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

-- ── ⑥ 규격별 재고를 깎고 되돌리는 **한 곳** ────────────────────────────────
--
--  ⚠ 자재를 주는 길이 두 갈래입니다:
--      · supply_materials_items  — 자재 관리 화면
--      · complete_collection     — 수거 입력의 「주고 온 자재」
--    둘 다 결국 materials 표에 한 줄을 넣고, 그 줄의 items 에 규격이 들어
--    있습니다. 그래서 **그 자리 한 곳**에서 깎습니다. 함수 두 개에 같은
--    계산을 넣으면 언젠가 한쪽만 고쳐집니다(0077 의 stamp_schedule_origin 과
--    같은 이유입니다).
--
--  ⚠ 무르기(revert_collection)는 materials 줄을 **지웁니다.** 그때 네 칸이
--    되돌아오므로, 규격별도 같이 되돌려야 합니다 — 안 그러면 무를수록
--    규격별만 줄어듭니다.
--
--  ⚠ 세어 본 규격만 움직입니다. 모르는 수에서 5 를 빼도 여전히 모릅니다.
create or replace function public.apply_item_stock()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_items jsonb := case when tg_op = 'DELETE' then old.items else new.items end;
  v_sign  integer := case when tg_op = 'DELETE' then 1 else -1 end;
begin
  --  규격을 모르고 들어온 줄(옛 3칸 흐름)은 건드리지 않습니다.
  if v_items is null or jsonb_typeof(v_items) <> 'object' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  update office_stock_items s
     set qty = greatest(0, s.qty + v_sign * (t.v)::integer), updated_at = now()
    from jsonb_each_text(v_items) as t(k, v)
   where s.item = t.k and s.qty is not null and (t.v)::integer > 0;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists apply_item_stock_ins on public.materials;
create trigger apply_item_stock_ins
  after insert on public.materials
  for each row execute function public.apply_item_stock();

drop trigger if exists apply_item_stock_del on public.materials;
create trigger apply_item_stock_del
  after delete on public.materials
  for each row execute function public.apply_item_stock();

revoke all on function public.count_stock_item(text, integer, text) from public;
revoke all on function public.receive_stock_items(jsonb, text, uuid) from public;
revoke all on function public.supply_materials_items(uuid, date, jsonb, boolean, text, uuid) from public;
grant execute on function public.count_stock_item(text, integer, text) to authenticated;
grant execute on function public.receive_stock_items(jsonb, text, uuid) to authenticated;
grant execute on function public.supply_materials_items(uuid, date, jsonb, boolean, text, uuid) to authenticated;

-- ── 판(schema) 번호 ─────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 79 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   ① 13 줄이어야 합니다
--   ② 처음에는 13 개 전부 「아직 안 세어 봄」입니다 — 지어낸 숫자가 없습니다
--   ③ 79 여야 합니다
select count(*) as "규격 수" from public.office_stock_items;
select count(*) as "아직 안 세어 본 규격" from public.office_stock_items where qty is null;
select public.app_schema_version() as "판 번호";
