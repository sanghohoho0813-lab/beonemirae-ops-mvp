-- ─────────────────────────────────────────────────────────────────────────────
-- 0047. 회사 자신에 대한 사실 — 사람과 신고 매출
--
--  지금까지 이 시스템은 **거래처는 알아도 회사 자신은 몰랐습니다.**
--
--   · 현장에 누가 있는지, 누가 기저귀를 맡고 누가 의료폐기물을 맡는지
--     시스템 어디에도 없었습니다. 차량 배정도 「지난번에 누가 갔나」로만
--     추측했습니다.
--   · 매출은 이 시스템에 쌓인 것만 봤습니다. 그런데 대표님이 실제로 믿는
--     숫자는 **국세청에 신고한 과세표준**입니다. 그것과 대조할 방법이
--     없었고, 「작년 이맘때보다 얼마나 늘었나」에 답할 수 없었습니다.
--
--  두 표를 만듭니다.
--
--  ⚠ **주민등록번호는 저장하지 않습니다.** 4대보험 명부에 적혀 있어도
--    이 시스템이 하는 일(일정·수거·정산)에 필요 없는 값이고, 한 번 넣으면
--    백업·내보내기·화면 어디로든 흘러갑니다. 이름과 담당, 자격취득일까지만
--    받습니다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── ① 우리 사람들 ───────────────────────────────────────────────────────────

create table if not exists public.staff (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  --  '대표' · '이사' · '현장' · '사무'
  position     text not null default '현장',
  --  이 사람이 주로 맡는 폐기물. '의료폐기물' · '일회용기저귀' · '둘 다' · '해당없음'
  --  (대표·이사는 '해당없음' 입니다 — 없는 담당을 지어내지 않습니다)
  waste_scope  text not null default '해당없음',
  --  4대보험 최초 자격취득일. 실제 입사일과 다를 수 있어 이름을 그대로 씁니다.
  insured_from date,
  --  네 가지 보험의 취득일을 원본 그대로. 하나로 뭉개면 나중에 못 되살립니다.
  insurance    jsonb not null default '{}'::jsonb,
  --  로그인 계정이 있으면 연결 (없어도 됩니다 — 현장분들은 계정이 없을 수 있습니다)
  profile_id   uuid references public.profiles(id) on delete set null,
  active       boolean not null default true,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint staff_position_check   check (position    in ('대표', '이사', '사무', '현장')),
  constraint staff_waste_scope_check check (waste_scope in ('의료폐기물', '일회용기저귀', '둘 다', '해당없음'))
);

comment on table public.staff is
  '우리 직원 명부 (0047). 주민등록번호는 저장하지 않습니다 — 이 시스템의 업무에 필요 없는 값입니다.';
comment on column public.staff.waste_scope is
  '주로 맡는 폐기물 구분. 차량 배정·오늘 일정에서 「누구 일인지」를 가리는 데 씁니다.';
comment on column public.staff.insured_from is
  '4대보험 최초 자격취득일. 실제 입사일과 다를 수 있어 이름을 그대로 씁니다.';

create unique index if not exists staff_name_uniq on public.staff (name) where active;

alter table public.staff enable row level security;

--  이름·담당은 현장에서도 봐야 합니다 (오늘 누가 어디 가는지).
--  쓰기는 함수로만 — 명부는 관리자가 정합니다.
revoke all on public.staff from authenticated;
grant select on public.staff to authenticated;

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff
  for select using (public.is_active_user());


create or replace function public.upsert_staff(
  p_id          uuid,
  p_name        text,
  p_position    text,
  p_waste_scope text,
  p_insured_from date default null,
  p_insurance   jsonb default '{}'::jsonb,
  p_note        text  default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_name  text;
  v_id    uuid;
  v_before jsonb;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_admin() then
    raise exception '직원 명부는 관리자만 고칠 수 있습니다.' using errcode = 'P0001';
  end if;
  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception '이름을 넣어 주세요.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.staff (name, position, waste_scope, insured_from, insurance, note)
    values (v_name, p_position, p_waste_scope, p_insured_from, coalesce(p_insurance, '{}'::jsonb), coalesce(p_note, ''))
    returning id into v_id;
  else
    select to_jsonb(s) into v_before from public.staff s where id = p_id;
    if v_before is null then
      raise exception '고칠 직원을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    update public.staff
       set name = v_name, position = p_position, waste_scope = p_waste_scope,
           insured_from = p_insured_from, insurance = coalesce(p_insurance, '{}'::jsonb),
           note = coalesce(p_note, ''), updated_at = now()
     where id = p_id;
    v_id := p_id;
  end if;

  insert into public.audit_logs (action, entity, entity_id, before_data, after_data, summary, screen, source)
  values ('staff.save', 'staff', v_id::text, v_before,
          (select to_jsonb(s) from public.staff s where id = v_id),
          format('직원 %s — %s · %s', v_name, p_position, p_waste_scope), '설정', 'app');

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.upsert_staff(uuid, text, text, text, date, jsonb, text) from public;
grant execute on function public.upsert_staff(uuid, text, text, text, date, jsonb, text) to authenticated;

create or replace function public.set_staff_active(p_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  if not public.is_admin() then
    raise exception '직원 명부는 관리자만 고칠 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.staff set active = coalesce(p_active, true), updated_at = now()
   where id = p_id returning name into v_name;
  if v_name is null then
    raise exception '해당 직원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('staff.active', 'staff', p_id::text,
          format('직원 %s — %s', v_name, case when p_active then '재직' else '퇴사' end), '설정', 'app');
  return jsonb_build_object('id', p_id, 'active', p_active);
end;
$$;

revoke all on function public.set_staff_active(uuid, boolean) from public;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated;


--  ── 실제 명부 (4대보험 사업장 가입자 명부 2026-03-19 발급 기준) ───────────
--
--   이름이 이미 있으면 건드리지 않습니다 — 나중에 사람이 고친 값을
--   마이그레이션이 되돌려 놓으면 안 됩니다.
insert into public.staff (name, position, waste_scope, insured_from, insurance, note)
select * from (values
  ('송명근', '대표', '해당없음', date '2023-05-01',
   '{"국민연금":"2023-05-01","건강보험":"2023-05-01","산재보험":null,"고용보험":null}'::jsonb,
   '대표이사'),
  ('홍현주', '이사', '해당없음', date '2023-05-01',
   '{"국민연금":"2023-05-01","건강보험":"2023-05-01","산재보험":"2025-03-01","고용보험":"2025-03-01"}'::jsonb,
   ''),
  ('오대성', '현장', '의료폐기물', date '2023-06-01',
   '{"국민연금":"2023-06-01","건강보험":"2023-06-01","산재보험":"2023-06-01","고용보험":"2023-06-01"}'::jsonb,
   ''),
  ('백광호', '현장', '일회용기저귀', date '2025-05-20',
   '{"국민연금":"2025-07-01","건강보험":"2025-07-01","산재보험":"2025-05-20","고용보험":"2025-05-20"}'::jsonb,
   ''),
  ('김진환', '현장', '일회용기저귀', date '2025-12-01',
   '{"국민연금":"2025-12-01","건강보험":"2025-12-01","산재보험":"2025-12-01","고용보험":"2025-12-01"}'::jsonb,
   ''),
  ('김준기', '현장', '의료폐기물', date '2026-03-01',
   '{"국민연금":"2026-03-01","건강보험":"2026-03-01","산재보험":"2026-03-01","고용보험":"2026-03-01"}'::jsonb,
   '')
) as v(name, position, waste_scope, insured_from, insurance, note)
where not exists (select 1 from public.staff s where s.name = v.name);


-- ── ② 국세청에 신고한 매출 ─────────────────────────────────────────────────
--
--  이 시스템에 쌓인 매출과 **다른 숫자**입니다. 신고 자료는 회사가 실제로
--  국가에 낸 값이라 대표님이 믿는 기준이고, 여기 넣어 두면
--  「작년 같은 반기보다 얼마나 늘었나」를 답할 수 있습니다.
--
--  면세분이 큰 이유가 있습니다 — 의료폐기물 수집·운반은 면세입니다.
--  그래서 계 = 과세분 + 면세분 이고, 셋을 따로 남깁니다.

create table if not exists public.tax_filings (
  id           bigserial primary key,
  --  과세기간 (반기)
  period_from  date not null,
  period_to    date not null,
  --  단위: 원
  base_total   bigint not null default 0,   -- 매출과세표준 계
  base_taxed   bigint not null default 0,   -- 과세분
  base_exempt  bigint not null default 0,   -- 면세분
  tax_payable  bigint not null default 0,   -- 납부할 세액 (음수 = 환급받을 세액)
  --  어디서 온 숫자인지. 나중에 「이 값 어디서 났나」를 물으면 답해야 합니다.
  source_no    text not null default '',    -- 증명 발급번호
  issued_on    date,                        -- 증명 발급일
  note         text not null default '',
  created_at   timestamptz not null default now(),
  constraint tax_filings_period_check check (period_from <= period_to),
  unique (period_from, period_to)
);

comment on table public.tax_filings is
  '국세청 부가가치세 과세표준 (0047). 시스템에 쌓인 매출과 별개로, 실제 신고한 값입니다.';

create index if not exists tax_filings_period_idx on public.tax_filings (period_from);

alter table public.tax_filings enable row level security;

revoke all on public.tax_filings from authenticated;
grant select on public.tax_filings to authenticated;
revoke all on sequence public.tax_filings_id_seq from authenticated;

drop policy if exists tax_filings_read on public.tax_filings;
create policy tax_filings_read on public.tax_filings
  --  매출은 돈입니다 — 현장 담당자에게는 보이지 않습니다.
  for select using (public.is_staff());


create or replace function public.upsert_tax_filing(
  p_from   date,
  p_to     date,
  p_total  bigint,
  p_taxed  bigint,
  p_exempt bigint,
  p_tax    bigint,
  p_source text default '',
  p_issued date default null,
  p_note   text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception '신고 매출은 관리자만 넣을 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception '과세기간이 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  --  계 ≠ 과세 + 면세 이면 옮겨 적다 틀린 것입니다. 조용히 고치지 않고 막습니다.
  if coalesce(p_total, 0) <> coalesce(p_taxed, 0) + coalesce(p_exempt, 0) then
    raise exception '계(%)가 과세분(%) + 면세분(%) 과 맞지 않습니다 — 증명서를 다시 확인해 주세요.',
      p_total, p_taxed, p_exempt using errcode = 'P0001';
  end if;

  insert into public.tax_filings
    (period_from, period_to, base_total, base_taxed, base_exempt, tax_payable, source_no, issued_on, note)
  values
    (p_from, p_to, coalesce(p_total, 0), coalesce(p_taxed, 0), coalesce(p_exempt, 0), coalesce(p_tax, 0),
     coalesce(p_source, ''), p_issued, coalesce(p_note, ''))
  on conflict (period_from, period_to) do update
    set base_total = excluded.base_total, base_taxed = excluded.base_taxed,
        base_exempt = excluded.base_exempt, tax_payable = excluded.tax_payable,
        source_no = excluded.source_no, issued_on = excluded.issued_on, note = excluded.note
  returning id into v_id;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('tax_filing.save', 'tax_filings', v_id::text,
          format('신고 매출 %s~%s — 계 %s원', p_from, p_to, to_char(coalesce(p_total, 0), 'FM999,999,999,999')),
          '경영 매출', 'app');

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.upsert_tax_filing(date, date, bigint, bigint, bigint, bigint, text, date, text) from public;
grant execute on function public.upsert_tax_filing(date, date, bigint, bigint, bigint, bigint, text, date, text) to authenticated;


--  ── 실제 신고 자료 (부가가치세과세표준증명 0615-473-4511-219 · 2026-03-19) ──
--
--   증명서에 적힌 그대로입니다. 마지막 줄(2026년 1기)은 증명서 발급일이
--   2026-03-19 로 **그 과세기간이 끝나기 전**이라, 확정 신고가 아닐 수
--   있습니다. 숫자를 고치지 않고 그대로 넣되 그 사실을 적어 둡니다.
insert into public.tax_filings
  (period_from, period_to, base_total, base_taxed, base_exempt, tax_payable, source_no, issued_on, note)
select * from (values
  (date '2023-01-01', date '2023-06-30',  47185960::bigint,  12529600::bigint,  34656360::bigint,  1292597::bigint, '0615-473-4511-219', date '2026-03-19', ''),
  (date '2023-07-01', date '2023-12-31',  83557010::bigint,  12480460::bigint,  71076550::bigint,  -926308::bigint, '0615-473-4511-219', date '2026-03-19', ''),
  (date '2024-01-01', date '2024-06-30', 129181590::bigint,  41851340::bigint,  87330250::bigint,  2057844::bigint, '0615-473-4511-219', date '2026-03-19', ''),
  (date '2024-07-01', date '2024-12-31', 233800428::bigint, 126601568::bigint, 107198860::bigint,  4614988::bigint, '0615-473-4511-219', date '2026-03-19', ''),
  (date '2025-01-01', date '2025-06-30', 223497401::bigint,  91493311::bigint, 132004090::bigint,  3371880::bigint, '0615-473-4511-219', date '2026-03-19', ''),
  (date '2025-07-01', date '2025-12-31', 357344046::bigint, 106032468::bigint, 251311578::bigint,  3500612::bigint, '0615-473-4511-219', date '2026-03-19', ''),
  (date '2026-01-01', date '2026-06-30', 453873146::bigint,  98397666::bigint, 355475480::bigint,  -869186::bigint, '0615-473-4511-219', date '2026-03-19',
   '증명 발급일(2026-03-19)이 이 과세기간 안이라 확정 신고가 아닐 수 있습니다. 확정 자료가 나오면 덮어써 주세요.')
) as v(period_from, period_to, base_total, base_taxed, base_exempt, tax_payable, source_no, issued_on, note)
on conflict (period_from, period_to) do nothing;


-- ── 자가진단 목록 갱신 ──────────────────────────────────────────────────────
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
    'app_errors','staff','tax_filings'
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
    ['profiles','approved_at'], ['app_errors','kind'],
    ['staff','waste_scope'], ['tax_filings','base_exempt']
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

  foreach v_name in array array[
    'payment_receipts_request_uniq','materials_request_uniq','material_tx_request_uniq',
    'clients_request_uniq','clients_name_key_idx','staff_name_uniq',
    'schedules_planned_uniq','schedules_one_completion_per_day'
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
as $$ select 47 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
