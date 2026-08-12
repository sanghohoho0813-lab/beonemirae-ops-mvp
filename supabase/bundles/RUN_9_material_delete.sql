-- 비원미래 운영 DB — 9차 (0023)
-- 자재 공급 기록 삭제. 앞의 묶음이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0023_material_delete.sql 과 내용이 같습니다.


-- ─────────────────────────────────────────────────────────────────────────────
-- 0023. 자재 공급 기록 삭제 — 누르면 실제로 지워지고, 재고가 돌아옵니다
--
--  「자재 관리」 화면의 공급 내역에 「삭제」 버튼이 있습니다. 그런데 눌러도
--  아무 일도 일어나지 않았습니다. materials 에 DELETE 정책이 아예 없어서
--  **관리자를 포함해 아무도 지울 수 없는** 상태였습니다.
--
--  더 곤란한 것은 그다음입니다. RLS 는 거부를 오류로 알려 주지 않고 "해당
--  행 없음"으로 처리합니다. 그래서 화면은 성공한 줄 알고 감사기록에
--  「자재 공급 기록 삭제」를 남겼습니다. **실제로는 안 지워졌는데 기록에는
--  지운 것으로 남습니다.** 실사 자료로 쓸 기록에 없는 일이 적히는 것입니다.
--
--  실제 PostgreSQL 에서 확인했습니다.
--
--      현장 담당자 삭제 시도 → 지워진 행 0 개 (오류도 안 남)
--      사무실 담당자 삭제 시도 → 지워진 행 0 개
--      관리자     삭제 시도 → 지워진 행 0 개
--
--  ── 왜 그냥 DELETE 정책을 열지 않는가 ───────────────────────────────────
--
--  자재 공급은 사무실 재고를 깎습니다. 기록만 지우면 깎인 재고가 그대로 남아
--  **장부와 창고가 조용히 어긋납니다.** 0003 에서 이미 같은 이유로 정책을
--  열지 않기로 했었는데, 버튼만 남아 있었던 것입니다.
--
--  그래서 정책을 넓히는 대신 함수를 둡니다. 지우면서 세 가지를 함께 합니다.
--
--    1) 원장(material_transactions)에 남은 **실제 차감량만큼** 재고를 되돌림
--    2) 되돌린 것을 「취소」 줄로 원장에 남김 — 재고가 왜 늘었는지 남아야 합니다
--    3) 감사기록에 무엇을 지웠는지, 얼마를 되돌렸는지 남김
--
--  되돌리는 양은 **원장에 적힌 것만** 씁니다. 원장에 없는 자재(예전 데이터)는
--  애초에 재고를 깎은 적이 없다는 뜻이라 되돌리지 않습니다. 짐작해서 재고를
--  늘리면 그것이야말로 장부를 틀리게 만듭니다.
--
--  ── 수거 입력에서 함께 공급된 자재는 여기서 못 지웁니다 ─────────────────
--
--  그건 「수거 완료 취소」가 이미 담당합니다(0003 revert_collection) — 일정·
--  자재·재고·요청을 한꺼번에 원복합니다. 두 길이 따로 놀면 한쪽으로 지운 뒤
--  다른 쪽에서 또 되돌려 재고가 두 번 늘어납니다. 그래서 막고, 어디로 가야
--  하는지 알려 줍니다.
--
--  적용 후에는 supabase/test/06_material_delete.sql 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_material(p_material_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m         public.materials%rowtype;
  v_client_nm text;
  v_restored  jsonb := '{}'::jsonb;
  r           record;
begin
  --  '누가' 를 화면이 아니라 서버가 확인합니다. 현장 담당자는 자재 화면
  --  자체가 열리지 않지만, 토큰만 있으면 화면을 거치지 않고 부를 수 있습니다.
  if not public.is_staff() then
    raise exception '자재 공급 기록은 사무실 담당자와 관리자만 지울 수 있습니다.'
      using errcode = 'P0001';
  end if;

  select * into v_m from public.materials where id = p_material_id for update;
  if not found then
    raise exception '지울 자재 기록을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  수거 입력에서 함께 공급된 건은 「수거 완료 취소」로 되돌려야 합니다.
  --  (이미 취소된 수거의 자재는 revert_collection 이 지웠으므로 여기 안 옵니다)
  if exists (
    select 1 from public.collection_events e
     where p_material_id = any (e.material_ids) and not e.reverted
  ) then
    raise exception '이 자재는 수거 입력에서 함께 공급된 기록입니다. 「수거이력」에서 「수거 완료 취소」로 되돌려 주세요.'
      using errcode = 'P0001';
  end if;

  select name into v_client_nm from public.clients where id = v_m.client_id;

  -- ── 재고 원복 ────────────────────────────────────────────────────────────
  --  원장에 적힌 공급량(qty 는 음수)을 그대로 빼면 재고가 늘어납니다.
  --  화면이 보낸 값이 아니라 **서버에 남은 기록**을 근거로 되돌립니다.
  for r in
    select item, sum(qty)::int as q
      from public.material_transactions
     where material_id = p_material_id and kind = '공급'
     group by item
  loop
    if r.q <> 0 then
      update public.office_stock set
        corrugated_box    = corrugated_box    - case when r.item = 'corrugatedBox'    then r.q else 0 end,
        plastic_container = plastic_container - case when r.item = 'plasticContainer' then r.q else 0 end,
        bag               = bag               - case when r.item = 'bag'              then r.q else 0 end,
        needle_box        = needle_box        - case when r.item = 'needleBox'        then r.q else 0 end,
        updated_by        = auth.uid()
      where id = 1;

      --  왜 재고가 늘었는지 원장에 남깁니다. material_id 는 아래에서 기록이
      --  지워지며 자동으로 비워집니다(on delete set null) — 그래서 어느
      --  거래처의 언제 공급분이었는지 메모에 적어 둡니다.
      insert into public.material_transactions
        (kind, item, qty, client_id, material_id, memo, created_by)
      values
        ('취소', r.item, -r.q, v_m.client_id, p_material_id,
         format('자재 공급 기록 삭제로 원복 — %s %s', coalesce(v_client_nm, ''), v_m.date),
         auth.uid());

      v_restored := v_restored || jsonb_build_object(r.item, -r.q);
    end if;
  end loop;

  -- ── 감사기록 ────────────────────────────────────────────────────────────
  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, summary, screen, source)
  values
    ('material.delete', 'materials', p_material_id::text, v_m.client_id, coalesce(v_client_nm, ''),
     jsonb_build_object(
       'date', v_m.date,
       'boxCount', v_m.box_count,
       'vinylCount', v_m.vinyl_count,
       'needleBoxCount', v_m.needle_box_count,
       'memo', v_m.memo,
       'restoredStock', v_restored
     ),
     format('자재 공급 기록 삭제 — %s · %s%s',
            coalesce(v_client_nm, '(거래처 없음)'), v_m.date,
            case when v_restored = '{}'::jsonb then ' · 재고 원복 없음(원장 기록 없음)'
                 else ' · 재고 원복함' end),
     'materials', 'app');

  delete from public.materials where id = p_material_id;

  return jsonb_build_object('ok', true, 'restored', v_restored);
end;
$$;

revoke all on function public.delete_material(uuid) from public;
grant execute on function public.delete_material(uuid) to authenticated;

comment on function public.delete_material(uuid) is
  '자재 공급 기록 삭제 — 재고 원복 + 원장 「취소」 + 감사기록. 사무실·관리자만 (0023).';

--  materials 에 DELETE 정책은 그대로 만들지 않습니다.
--  이 함수를 거치지 않는 삭제는 재고를 되돌리지 않기 때문입니다.
