-- ════════════════════════════════════════════════════════════════════════════
-- 0074 — 잘못 들어온 기록을 **고칠 수 있게**
--
--  두 가지만 넣습니다. 둘 다 「이미 있는 것을 다시 만들지 않는다」가 원칙입니다.
--
--   ① amend_collection   수거 기록을 고칩니다.
--   ② correct_stock      재고 숫자를 이유와 함께 바로잡습니다.
--
--  ⚠ 지우지 않습니다. 원본은 「취소됨」으로 남고, 무엇이 무엇으로 바뀌었는지
--    감사기록에서 이어집니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 수거 기록 고쳐 넣기 ──────────────────────────────────────────────────
--
--  ⚠ **되돌리기 + 다시 입력을 한 트랜잭션에서** 합니다.
--
--   처음에는 schedules 와 collection_events 를 직접 update 하는 함수를
--   쓰려고 했습니다. 그런데 수거 한 건에 매달린 것이 이만큼입니다 —
--   일정 · 수거이력 · 자재 공급행 · 사무실 재고 · 재고 원장 · 병원 요청 ·
--   감사기록. 여기서 자재 수량을 고치려면 **재고 증감을 손으로 다시 계산**해야
--   하고, 그 계산은 이미 complete_collection 과 revert_collection 안에
--   한 벌씩 있습니다. 세 번째 벌을 만드는 순간 셋이 서로 어긋납니다.
--
--   그래서 계산을 새로 쓰지 않고 **검증된 두 함수를 순서대로 부릅니다.**
--     revert_collection   → 자재 원복 · 재고 원복 · 요청 원복 · 일정 원복
--     complete_collection → 새 값으로 다시, 재고 초과·중복·청구월까지 재검사
--   한 트랜잭션이라 중간에 실패하면 **아무 일도 없던 것처럼** 돌아갑니다.
--
--  ⚠ 확정한 청구에 들어간 수거는 revert 쪽 방아쇠(0073)가 먼저 막습니다.
--    여기에 같은 검사를 또 쓰지 않습니다 — 두 벌이면 한쪽만 고쳐집니다.
--
--  ⚠ security definer 로 만들지 **않습니다.** 부르는 사람 권한 그대로 돌아야
--    RLS 와 돈 칸 잠금이 평소처럼 걸립니다.
create or replace function public.amend_collection(
  p_event_id uuid,
  p_reason   text,
  p          jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor  profiles%rowtype;
  v_e      collection_events%rowtype;
  v_sched  schedules%rowtype;
  v_payload jsonb;
  v_out    jsonb;
  v_before jsonb;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  --  ⚠ 남의 입력을 고치는 일입니다. 현장 계정에는 열지 않습니다 —
  --    기사님이 잘못 넣었으면 사무실에 말하는 것이 맞습니다.
  if not public.is_staff() then
    raise exception '수거 기록 수정은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception '무엇을 왜 고치는지 적어 주세요.' using errcode = 'P0001';
  end if;

  select * into v_e from collection_events where id = p_event_id for update;
  if not found then
    raise exception '고칠 수거 기록을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_e.reverted then
    raise exception '이미 취소된 기록입니다. 취소된 기록은 고칠 수 없습니다 — 새로 입력해 주세요.'
      using errcode = 'P0001';
  end if;

  select * into v_sched from schedules where id = v_e.schedule_id;

  v_before := jsonb_build_object(
    'amountKg',   v_e.amount_kg,
    'actualTime', coalesce(v_sched.actual_time, ''),
    'wasteType',  v_e.waste_type,
    'memo',       coalesce(v_sched.memo, ''),
    'containers', coalesce(v_sched.containers, 'null'::jsonb)
  );

  --  ── 되돌립니다 ──────────────────────────────────────────────────────
  perform public.revert_collection(p_event_id);

  --  ── 다시 넣습니다 ──────────────────────────────────────────────────
  --   화면이 보낸 값에 **바뀌면 안 되는 것들**을 덮어씌웁니다.
  --   ⚠ 거래처는 화면이 정하지 못합니다. 거래처를 바꾸는 것은 「고치기」가
  --     아니라 다른 기록이고, 그렇게 하면 그 병원의 청구가 조용히 바뀝니다.
  v_payload := coalesce(p, '{}'::jsonb)
    || jsonb_build_object(
         'clientId', v_e.client_id::text,
         'screen',   '수거기록 수정'
       );

  --  ⚠ 되돌리기가 **일정을 지웠는지**에 따라 갈립니다.
  --    ─ 원래 예정에 있던 건: 일정이 「예정」으로 되살아났으니 그 일정에 다시 붙입니다.
  --    ─ 직접 입력해서 생긴 건: 일정 자체가 지워졌으니 새로 만들어야 합니다.
  --      여기서 옛 scheduleId 를 그대로 보내면 「선택한 일정을 찾을 수 없습니다」가 납니다.
  if v_e.created_schedule then
    v_payload := v_payload - 'scheduleId';
  else
    v_payload := v_payload || jsonb_build_object('scheduleId', v_e.schedule_id::text);
  end if;

  --  안 보낸 값은 원래 값을 그대로 씁니다 — 화면이 한 칸만 고쳐도 됩니다.
  if coalesce(v_payload->>'date', '') = '' then
    v_payload := v_payload || jsonb_build_object('date', to_char(coalesce(v_sched.date, v_e.at::date), 'YYYY-MM-DD'));
  end if;
  if coalesce(v_payload->>'wasteType', '') = '' then
    v_payload := v_payload || jsonb_build_object('wasteType', v_e.waste_type);
  end if;

  v_out := public.complete_collection(v_payload);

  --  ── 무엇이 무엇으로 바뀌었는지 ──────────────────────────────────────
  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.amend', 'collection_events',
          (v_out->>'eventId'), v_e.client_id, v_e.client_name, '수거기록 수정',
          v_before,
          jsonb_build_object(
            'amountKg',   (v_payload->>'actualAmount')::integer,
            'actualTime', v_payload->>'actualTime',
            'wasteType',  v_payload->>'wasteType',
            'memo',       coalesce(v_payload->>'memo', ''),
            'containers', coalesce(v_payload->'containers', 'null'::jsonb),
            'fromEventId', p_event_id::text
          ),
          format('%s %s 수거기록 수정 — %s', v_e.client_name,
                 to_char(coalesce(v_sched.date, v_e.at::date), 'MM월 DD일'), btrim(p_reason)));

  return coalesce(v_out, '{}'::jsonb)
    || jsonb_build_object('fromEventId', p_event_id, 'reason', btrim(p_reason));
end $$;

comment on function public.amend_collection(uuid, text, jsonb) is
  '수거 기록 고쳐 넣기 (0074). 되돌리기 + 다시 입력을 한 트랜잭션에서 합니다 — 재고·자재·요청 계산을 새로 쓰지 않습니다.';

-- ── ② 재고 정정 ────────────────────────────────────────────────────────────
--
--   「10개 들어왔는데 11개라고 적었다」를 바로잡는 자리입니다.
--
--  ⚠ 현재 재고 숫자를 **덮어쓰지 않습니다.** 왜 바뀌었는지가 안 남으면
--    다음에 숫자가 이상할 때 아무도 되짚지 못합니다. 원장에 한 줄
--    (`조정 -1 · 입고 오류 정정`)을 남기고, 재고는 그만큼만 움직입니다.
--
--  ⚠ 예전에는 화면이 office_stock 을 읽어서 계산한 뒤 통째로 update 했습니다.
--    두 사람이 동시에 하면 나중 사람이 앞사람 값을 지웁니다. 여기서는
--    `for update` 로 줄을 잠그고 **증감으로만** 씁니다.
create or replace function public.correct_stock(
  p_item   text,
  p_qty    integer,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_stock office_stock%rowtype;
  v_before integer;
  v_after  integer;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;
  if not public.is_staff() then
    raise exception '재고 정정은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_item not in ('corrugatedBox', 'plasticContainer', 'bag', 'needleBox') then
    raise exception '알 수 없는 품목입니다.' using errcode = 'P0001';
  end if;
  if coalesce(p_qty, 0) = 0 then
    raise exception '몇 개를 더하거나 뺄지 적어 주세요.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception '왜 바로잡는지 적어 주세요 — 나중에 이 줄만 보고 알 수 있어야 합니다.'
      using errcode = 'P0001';
  end if;

  select * into v_stock from office_stock where id = 1 for update;
  if not found then
    raise exception '사무실 재고 정보가 없습니다.' using errcode = 'P0001';
  end if;

  v_before := case p_item
    when 'corrugatedBox'    then v_stock.corrugated_box
    when 'plasticContainer' then v_stock.plastic_container
    when 'bag'              then v_stock.bag
    else                         v_stock.needle_box end;
  v_after := v_before + p_qty;

  --  ⚠ 창고에 없는 물건이 마이너스로 남지 않게 합니다. 실제로 모자라면
  --    그건 정정이 아니라 세어 보셔야 하는 상황입니다.
  if v_after < 0 then
    raise exception '%개밖에 없어 %개를 뺄 수 없습니다. 창고를 다시 세어 보신 뒤 맞는 숫자로 넣어 주세요.',
      v_before, abs(p_qty) using errcode = 'P0001';
  end if;

  update office_stock set
    corrugated_box    = case when p_item = 'corrugatedBox'    then v_after else corrugated_box end,
    plastic_container = case when p_item = 'plasticContainer' then v_after else plastic_container end,
    bag               = case when p_item = 'bag'              then v_after else bag end,
    needle_box        = case when p_item = 'needleBox'        then v_after else needle_box end,
    updated_by        = v_actor.id
  where id = 1;

  insert into material_transactions (kind, item, qty, memo, created_by)
  values ('조정', p_item, p_qty, btrim(p_reason), v_actor.id);

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'stock.correct', 'office_stock', '1',
          '자재 관리',
          jsonb_build_object('item', p_item, 'qty', v_before),
          jsonb_build_object('item', p_item, 'qty', v_after),
          format('재고 정정 %s %s%s → %s (%s)', p_item,
                 case when p_qty > 0 then '+' else '' end, p_qty, v_after, btrim(p_reason)));

  return jsonb_build_object('item', p_item, 'before', v_before, 'after', v_after);
end $$;

comment on function public.correct_stock(text, integer, text) is
  '재고 정정 (0074). 숫자를 덮어쓰지 않고 원장에 이유와 함께 한 줄 남깁니다.';

revoke all on function public.amend_collection(uuid, text, jsonb) from public;
revoke all on function public.correct_stock(text, integer, text) from public;
grant execute on function public.amend_collection(uuid, text, jsonb) to authenticated;
grant execute on function public.correct_stock(text, integer, text) to authenticated;

-- ── 판(schema) 번호 ─────────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 74 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   아래가 각각 2 · 74 여야 합니다.
select count(*) as "새 함수" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('amend_collection', 'correct_stock');
select public.app_schema_version() as "판 번호";
