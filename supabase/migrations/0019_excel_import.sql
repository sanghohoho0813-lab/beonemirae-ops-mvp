-- ─────────────────────────────────────────────────────────────────────────────
-- 0019. 엑셀에서 옮겨 온 기록을 한 번에, 통째로 넣습니다
--
--  업체마다 몇 년치 기록이 엑셀에 들어 있습니다. 그것을 한 줄씩 따로 넣으면
--  중간에 하나가 걸렸을 때 앞의 절반만 들어간 상태로 남습니다. 그러면 다시
--  넣어야 하는데, 어디까지 들어갔는지 사람이 세어 봐야 합니다.
--
--  그래서 함수 하나로 받습니다. 함수 하나가 곧 트랜잭션 하나라, 중간에
--  무엇이든 잘못되면 **하나도 안 들어간 상태로 되돌아갑니다.** 반쯤 들어간
--  상태가 남지 않습니다.
--
--  이 함수가 지키는 것
--   · 관리자만 부를 수 있습니다 (화면이 아니라 서버가 확인)
--   · 이미 같은 거래처·같은 날·같은 구분의 수거가 있으면 **덮어쓰지 않고**
--     건너뜁니다. 화면에서 한 번 걸렀지만, 그 사이에 현장이 입력했을 수도
--     있어 서버가 다시 봅니다.
--   · 값이 다른 기록이 이미 있으면 그것도 건너뛰고 「충돌」로 셉니다.
--     어느 쪽이 맞는지는 사람이 정할 일이지 함수가 정할 일이 아닙니다.
--   · 거래처의 계약·단가는 **비어 있는 칸만** 채웁니다. 이미 정해 둔 값을
--     엑셀이 덮지 않습니다.
--   · 무엇을 몇 건 넣었는지 감사기록에 남깁니다.
--
--  넣는 기록에는 origin='migrated' 가 붙습니다. 나중에 "이건 엑셀에서 옮겨
--  온 것" 이라고 구분할 수 있어야 하기 때문입니다.
--
--  적용 후에는 supabase/test/45_excel_import_live.mjs 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.import_excel_rows(
  p_client_id    uuid,
  p_rows         jsonb,
  p_client_patch jsonb default null,
  p_file         text default '',
  p_summary      jsonb default '{}'::jsonb
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
  v_ins      integer := 0;
  v_skip     integer := 0;
  v_conflict integer := 0;
  v_patched  integer := 0;
  v_patch    jsonb := '{}'::jsonb;
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
        --  이미 있는 것은 절대 덮어쓰지 않습니다.
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
           coalesce((v_items->>'box63')::int, 0) + coalesce((v_items->>'box30')::int, 0)
             + coalesce((v_items->>'box12')::int, 0) + coalesce((v_items->>'box4')::int, 0),
           coalesce((v_items->>'diaperBag40')::int, 0),
           coalesce((v_items->>'plastic2')::int, 0) + coalesce((v_items->>'plastic5')::int, 0)
             + coalesce((v_items->>'plastic20')::int, 0),
           false, coalesce(v_row->>'where', '엑셀 가져오기'), v_items, 'migrated');
        v_ins := v_ins + 1;
      end if;

    else
      raise exception '알 수 없는 기록 종류입니다: %', coalesce(v_row->>'kind', '(없음)')
        using errcode = 'P0001';
    end if;
  end loop;

  --  자재 공급은 사무실 재고를 줄이지 않습니다. 몇 년 전에 이미 나간
  --  물건이라, 오늘 창고 숫자에서 빼면 실제와 어긋납니다.

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('import.excel', 'clients', p_client_id::text, p_client_id, v_client.name,
     jsonb_build_object('file', p_file, 'inserted', v_ins, 'skipped', v_skip,
                        'conflict', v_conflict, 'clientFields', v_patched,
                        'summary', p_summary),
     format('엑셀 가져오기 — %s · 등록 %s건 · 건너뜀 %s건 · 충돌 %s건%s (%s)',
            v_client.name, v_ins, v_skip, v_conflict,
            case when v_patched > 0 then format(' · 거래처 정보 %s칸', v_patched) else '' end,
            coalesce(nullif(p_file, ''), '파일명 없음')),
     'import', 'app');

  return jsonb_build_object(
    'inserted', v_ins, 'skipped', v_skip, 'conflict', v_conflict, 'clientFields', v_patched);
end;
$$;

revoke all on function public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb) from public;
grant execute on function public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb) to authenticated;

comment on function public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb) is
  '엑셀에서 옮겨 온 수거·자재 기록을 한 트랜잭션으로 넣습니다. 이미 있는 기록은 덮어쓰지 않고 건너뛰거나 충돌로 셉니다 (0019).';
