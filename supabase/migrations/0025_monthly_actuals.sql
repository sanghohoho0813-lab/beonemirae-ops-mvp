-- ─────────────────────────────────────────────────────────────────────────────
-- 0025. 엑셀에서 가져온 월 실적
--
--  왜 필요한가
--
--   거래처 관리 엑셀에는 두 종류의 기록이 있습니다.
--
--    · 거래명세서 — 날짜별 수거 (8월 5일 의료폐기물 472kg)
--    · 정산금 세부내역 — **월 합계만** (2월 의료폐기물 1,644kg · 매출 6,698,400원)
--
--   지금까지 가져오기는 앞의 것만 옮겼습니다. 뒤의 것은 날짜를 알 수 없어
--   수거 기록으로 만들 수 없기 때문입니다(없는 수거일을 지어내면 안 됩니다).
--   그래서 「확인 필요」에만 적어 두고 아무 데도 저장하지 않았습니다.
--
--   결과: 오남한양병원처럼 명세서에 날짜가 없는 거래처는 8개월치 실적이
--   엑셀에 멀쩡히 있는데도 거래처 화면이 전부 비었습니다 — 월평균 수거량
--   0kg, 월 정산 없음, 월간 리포트 없음, 미수금 없음. 날짜가 있는 거래처도
--   명세서는 최근 한 달치뿐이라 나머지 달은 똑같이 비었습니다.
--
--  무엇을 저장하는가
--
--   월 합계를 **월 합계 그대로** 저장합니다. 날짜별 수거로 바꾸지 않습니다.
--   화면에서도 「엑셀에서 가져온 월 실적」으로 따로 표시하고, 시스템이
--   수거 기록에서 직접 계산한 값과 섞지 않습니다. 두 가지는 근거가 다릅니다.
--
--  덮어쓰지 않습니다
--   같은 거래처·같은 달이 이미 있으면 값이 같을 때만 지나가고, 다르면
--   충돌로 셉니다(수거·자재와 같은 규칙). 나중에 올린 파일이 앞의 기록을
--   조용히 바꾸는 일은 없습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_monthly_actuals (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  -- 'YYYY-MM'
  month        text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  medical_kg   numeric not null default 0 check (medical_kg >= 0),
  diaper_kg    numeric not null default 0 check (diaper_kg  >= 0),
  revenue      bigint  not null default 0,
  cost         bigint  not null default 0,
  profit       bigint  not null default 0,
  -- 이 달에 날짜별 수거 기록도 함께 있는가 (있으면 화면에서 시스템 계산을 우선)
  has_dated    boolean not null default false,
  -- 어디서 왔는지 — 나중에 숫자가 이상할 때 원본을 찾아갈 수 있어야 합니다
  source_file  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, month)
);

create index if not exists client_monthly_actuals_client_idx
  on public.client_monthly_actuals (client_id, month);

alter table public.client_monthly_actuals enable row level security;

--  읽기는 활성 사용자 전체(거래처 화면에서 씁니다). 쓰기는 관리자만 —
--  실제로는 아래 가져오기 함수(security definer)를 통해서만 들어옵니다.
drop policy if exists cma_read   on public.client_monthly_actuals;
drop policy if exists cma_write  on public.client_monthly_actuals;
drop policy if exists cma_update on public.client_monthly_actuals;
drop policy if exists cma_delete on public.client_monthly_actuals;

create policy cma_read on public.client_monthly_actuals
  for select using (public.is_active_user());
create policy cma_write on public.client_monthly_actuals
  for insert with check (public.is_admin());
create policy cma_update on public.client_monthly_actuals
  for update using (public.is_admin()) with check (public.is_admin());
create policy cma_delete on public.client_monthly_actuals
  for delete using (public.is_admin());

grant select on public.client_monthly_actuals to authenticated;
grant insert, update, delete on public.client_monthly_actuals to authenticated;

drop trigger if exists client_monthly_actuals_touch on public.client_monthly_actuals;
create trigger client_monthly_actuals_touch
  before update on public.client_monthly_actuals
  for each row execute function public.touch_updated_at();


-- ── 가져오기 함수 — 월 실적을 함께 받습니다 ─────────────────────────────────

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
  --  날짜별 수거로 바꾸지 않고 월 합계 그대로 저장합니다.
  --  이미 있는 달은 값이 같을 때만 지나가고, 다르면 충돌로 셉니다.
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

--  0019/0024 의 5인자 버전은 더 쓰지 않습니다. 남겨 두면 앱이 어느 쪽을
--  부르는지에 따라 월 실적이 조용히 빠집니다.
drop function if exists public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb);

comment on function public.import_excel_rows(uuid, jsonb, jsonb, text, jsonb, jsonb) is
  '엑셀 가져오기 (0025): 날짜별 기록 + 월 실적. 중복은 건너뛰고 충돌은 세기만 하며 절대 덮어쓰지 않습니다.';

comment on table public.client_monthly_actuals is
  '엑셀 정산 시트의 월 합계. 날짜별 수거로 바꾸지 않고 월 단위 그대로 보관합니다.';
