-- 비원미래 운영 DB — 30차 (0044)
-- 월정액 「배출 없는 달」 정책을 사람이 정했는지 기록. RUN_1~29 가 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0044_flat_fee_policy_decided.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();  → 44 가 나와야 합니다.
--              select public.app_health_check();     → ok: true

-- ─────────────────────────────────────────────────────────────────────────────
-- 0044. 월정액 정책을 「정했는지」 기록
--
--  0042 에서 「수거 0건인 달의 월정액」을 확정할 수 있게 만들었습니다. 그런데
--  그건 거래처에 **`flat_fee_when_empty` 가 켜져 있을 때만** 됩니다.
--
--  문제는 지금 그 값이 `false` 라는 것이 두 가지 뜻이라는 점입니다.
--
--   ① 계약서를 보고 「배출 없으면 청구 안 함」으로 **정했다**
--   ② 아무도 아직 **안 정했다** (기본값 그대로)
--
--  둘을 구분할 수 없으니 화면이 할 수 있는 게 없습니다. 다 물어보면 이미
--  정한 곳까지 매달 다시 묻고, 안 물어보면 배출 없는 달에 900만원짜리 청구를
--  못 만든 채 그 달만 엑셀로 넘어갑니다.
--
--  그래서 **정한 시각**을 남깁니다. 정한 곳은 다시 묻지 않고, 안 정한 곳만
--  「계약서를 확인해 주세요」로 남습니다.
--
--  값을 시스템이 정하지 않습니다 — 계약서는 사람만 읽을 수 있습니다.
--  「예/아니오」 둘 다 **정한 것**으로 기록합니다.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists flat_fee_policy_at timestamptz;

comment on column public.clients.flat_fee_policy_at is
  '월정액 빈 달 청구 여부를 사람이 정한 시각 (0044). 비어 있으면 「아직 안 정함」입니다.';

--  이미 켜 둔 곳은 사람이 정한 것입니다 — 다시 묻지 않습니다.
update public.clients
   set flat_fee_policy_at = coalesce(flat_fee_policy_at, updated_at, created_at, now())
 where flat_fee_when_empty and flat_fee_policy_at is null;


-- ── 정하기 ──────────────────────────────────────────────────────────────────
--
--  거래처 저장 화면에서 통째로 고치는 길과 따로 둡니다. 이건 **계약서를 보고
--  내린 판단**이라 누가 언제 정했는지가 남아야 합니다.
create or replace function public.set_flat_fee_policy(
  p_client_id  uuid,
  p_when_empty boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_client public.clients%rowtype;
  v_before boolean;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '월정액 정책은 사무실 담당자와 관리자만 정할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_when_empty is null then
    raise exception '「예」인지 「아니오」인지 정해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  v_before := coalesce(v_client.flat_fee_when_empty, false);

  update public.clients
     set flat_fee_when_empty = p_when_empty,
         flat_fee_policy_at  = now(),
         updated_by          = v_actor.id
   where id = p_client_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, after_data, summary, screen, source)
  values
    ('client.flat_fee_policy', 'clients', p_client_id::text, p_client_id, coalesce(v_client.name, ''),
     jsonb_build_object('flatFeeWhenEmpty', v_before),
     jsonb_build_object('flatFeeWhenEmpty', p_when_empty),
     format('월정액 정책 — %s · 배출 없는 달에도 청구: %s',
            coalesce(v_client.name, '거래처'),
            case when p_when_empty then '예' else '아니오' end),
     '거래처 점검', 'app');

  return jsonb_build_object('clientId', p_client_id, 'whenEmpty', p_when_empty);
end;
$$;

revoke all on function public.set_flat_fee_policy(uuid, boolean) from public;
grant execute on function public.set_flat_fee_policy(uuid, boolean) to authenticated;

comment on function public.set_flat_fee_policy(uuid, boolean) is
  '월정액 빈 달 청구 여부를 사람이 정하고 기록 (0044). 예·아니오 둘 다 「정한 것」으로 남깁니다.';


-- ── 자가진단 목록 갱신 ──────────────────────────────────────────────────────
--
--  0043 의 자가진단은 기준 목록을 함수 안에 들고 있습니다. 새 칸·새 함수를
--  더하면 **이 목록도 같이 늘려야** 합니다 — 안 늘리면 그것이 없어져도
--  「이상 없음」이라고 말합니다.
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
    'sales_leads','sales_lead_events','experiment_settings','performance_baselines'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('표 ' || v_name);
    end if;
  end loop;

  foreach v_pair slice 1 in array array[
    ['clients','flat_fee_when_empty'], ['clients','flat_fee_policy_at'],
    ['clients','collect_time'], ['clients','disposal_site'],
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

  foreach v_name in array array[
    'confirm_billing','cancel_billing','add_payment_receipt','delete_payment_receipt',
    'supply_materials','receive_stock','delete_material','complete_collection',
    'create_planned_schedules','set_revenue_override','delete_revenue_override',
    'set_flat_fee_policy',
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
    'schedules_planned_uniq','schedules_one_completion_per_day'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || ('색인 ' || v_name);
    end if;
  end loop;

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
  'DB 자가진단 (0043·0044). 돈을 지키는 표·칸·함수·색인·권한이 실제로 있는지 세어 없는 것을 이름으로 돌려줍니다. 관리자만.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 44 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0044). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
