-- 비원미래 운영 DB — 10차 (0024)
-- 엑셀 가져오기: 실제 거래처 10곳 파일에서 확인된 품목·안전장치 반영.
-- 앞의 묶음(RUN_1~9)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0024_import_new_items.sql 과 내용이 같습니다.


-- ─────────────────────────────────────────────────────────────────────────────
-- 0024. 엑셀 가져오기 — 실제 거래처 10곳 파일에서 확인된 품목·안전장치 반영
--
--  실제 거래처 관리 엑셀 11개(더원 + 신규 10곳)를 전수 분석한 결과를 반영합니다.
--
--   1) 새 품목 — 35L·79L 박스, 10L 합성수지, 12L 봉투형용기, 기저귀박스(중).
--      전부 실제 파일에 있는 규격입니다(오남한양·엠에스·서울본브릿지·남양주백·
--      목동현대웰). 0019 의 가져오기 함수는 items(jsonb)에는 다 담기지만
--      기존 호환용 합계 칸(box_count 등)에 이 규격들을 더하지 않아
--      화면·통계의 합계가 어긋납니다. 합산에 포함시킵니다.
--
--   2) 미래 날짜 방어 — 실제 파일(서울인화 「2025년 12월~」 명세서)에서
--      연도가 밀려 적힌 날짜(2026-12)를 봤습니다. 화면(importer)도 거르지만,
--      서버가 최종 방어선입니다. 오지 않은 날짜의 수거는 거부합니다.
--
--  함수 본문 교체이며 테이블·RLS 변경은 없습니다.
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
    --  아직 오지 않은 날짜의 수거는 있을 수 없습니다. 실제 파일에서 연도가
    --  밀려 적힌 명세서를 봤습니다 — 그대로 두면 미래의 수거가 만들어집니다.
    if v_date > current_date then
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
        --  기존 3칸 합계(화면·통계 호환)에 실제 파일에서 확인된 전 규격을
        --  더합니다. 박스류 → box_count, 봉투·비닐류 → vinyl_count,
        --  합성수지류 → needle_box_count (0011 부터의 대응 그대로).
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
  '엑셀 가져오기 (0024): 실측 품목 규격 합산 + 미래 날짜 거부. 중복은 건너뛰고 충돌은 세기만 하며 절대 덮어쓰지 않습니다.';
