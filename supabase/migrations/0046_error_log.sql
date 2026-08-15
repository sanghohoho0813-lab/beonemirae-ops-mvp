-- ─────────────────────────────────────────────────────────────────────────────
-- 0046. 오류를 남깁니다 — 「왜 안 됐나」에 답할 수 있게
--
--  지금은 저장이 실패하면 화면 위에 빨간 띠가 잠깐 떴다가, 다음 동작을 하면
--  사라집니다. 그것으로 끝입니다.
--
--   · 이사님이 「어제 저장이 안 됐다」고 하시면 **확인할 자료가 없습니다**
--   · 같은 거래처에서만 계속 실패해도 아무도 모릅니다
--   · 기사님 폰에서만 나는 문제는 사무실에서 영영 안 보입니다
--
--  그리고 더 나쁜 것이 하나 있습니다. 화면이 **그리다 터지면** 앱이 통째로
--  하얗게 됩니다. 실측했습니다 — 목록 화면 하나가 오류를 던지자 본문은
--  물론 **왼쪽 메뉴까지 사라져** 글자 수 0인 흰 화면이 남았습니다. 쓰던
--  사람은 무엇이 잘못됐는지도, 어디로 가야 하는지도 알 수 없습니다.
--
--  그래서 두 가지를 합니다.
--   ① 오류를 표에 남깁니다 (누가·언제·어느 화면·무엇을 하다가·무슨 오류)
--   ② 화면이 터져도 앱이 사라지지 않게 합니다 (이건 앱 쪽 변경입니다)
--
--  기록은 **관리자만** 봅니다. 오류 문구에는 거래처 이름이나 금액이 섞여
--  들어갈 수 있기 때문입니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.app_errors (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  --  계정이 지워져도 기록은 남습니다 — 「왜 안 됐나」는 사람이 나가도 남는 질문입니다.
  user_id     uuid references public.profiles(id) on delete set null,
  user_name   text        not null default '',
  user_role   text        not null default '',
  --  'save'   = 저장하다 실패 (서버가 거부했거나 통신이 끊김)
  --  'load'   = 앱을 켜면서 자료를 못 읽음
  --  'render' = 화면을 그리다 터짐 (예전에는 하얀 화면만 남았습니다)
  kind        text        not null,
  --  어느 화면에서 (주소 경로 그대로)
  screen      text        not null default '',
  --  무엇을 하다가 (사람 말로: '입금 기록', '청구 확정' …)
  action      text        not null default '',
  message     text        not null default '',
  --  판 번호·브라우저 같은 부속 정보. 자동으로 늘어나도 표를 안 고치게 jsonb.
  detail      jsonb       not null default '{}'::jsonb,
  constraint app_errors_kind_check check (kind in ('save', 'load', 'render'))
);

comment on table public.app_errors is
  '앱에서 난 오류 기록 (0046). 관리자만 봅니다 — 오류 문구에 거래처·금액이 섞일 수 있습니다.';

create index if not exists app_errors_at_idx on public.app_errors (at desc);

alter table public.app_errors enable row level security;

--  표에 직접 쓰지 못합니다. 아래 함수로만 들어갑니다 (0037·0045 와 같은 방식).
revoke all on public.app_errors from authenticated;
grant select on public.app_errors to authenticated;
revoke all on sequence public.app_errors_id_seq from authenticated;

drop policy if exists app_errors_read on public.app_errors;
create policy app_errors_read on public.app_errors
  for select using (public.is_admin());


-- ── 남기기 ──────────────────────────────────────────────────────────────────
--
--  누구나 부를 수 있어야 합니다 — 기사님 폰에서 난 오류가 가장 안 보이는
--  오류이기 때문입니다. 다만 로그인은 되어 있어야 합니다.
--
--  이 함수는 **절대 일을 키우지 않습니다.** 기록에 실패해도 예외를 올리지
--  않습니다. 원래 사용자가 보던 오류가 「기록 실패」로 바뀌면 진짜 원인이
--  가려집니다. 대신 아무 일도 안 한 것을 false 로 정직하게 돌려줍니다.
create or replace function public.record_app_error(
  p_kind    text,
  p_screen  text default '',
  p_action  text default '',
  p_message text default '',
  p_detail  jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;
  if coalesce(p_kind, '') not in ('save', 'load', 'render') then
    return false;
  end if;

  select * into v_actor from public.profiles where id = auth.uid();

  insert into public.app_errors (user_id, user_name, user_role, kind, screen, action, message, detail)
  values (
    v_actor.id,
    coalesce(v_actor.name, ''),
    coalesce(v_actor.role::text, ''),
    p_kind,
    --  길이는 여기서 자릅니다. 스택이 통째로 들어오면 표가 금세 무거워지고,
    --  화면에서도 읽을 수 없습니다.
    left(coalesce(p_screen, ''), 200),
    left(coalesce(p_action, ''), 200),
    left(coalesce(p_message, ''), 2000),
    coalesce(p_detail, '{}'::jsonb)
  );
  return true;
exception when others then
  --  기록이 안 되는 것보다 원래 오류가 가려지는 것이 더 나쁩니다.
  return false;
end;
$$;

revoke all on function public.record_app_error(text, text, text, text, jsonb) from public;
grant execute on function public.record_app_error(text, text, text, text, jsonb) to authenticated;

comment on function public.record_app_error(text, text, text, text, jsonb) is
  '앱 오류 한 건을 남깁니다 (0046). 실패해도 예외를 올리지 않습니다 — 원래 오류를 가리지 않기 위해서입니다.';


-- ── 최근 오류 모아 보기 ─────────────────────────────────────────────────────
--
--  한 건씩 보면 「많다」는 것만 압니다. 같은 화면에서 같은 오류가 몇 번,
--  누구에게, 언제까지 났는지가 원인을 좁혀 줍니다.
create or replace function public.recent_app_errors(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 7), 1), 90);
  v_rows jsonb;
  v_total bigint;
begin
  if not public.is_admin() then
    raise exception '오류 기록은 관리자만 볼 수 있습니다.' using errcode = 'P0001';
  end if;

  select count(*) into v_total
    from public.app_errors where at >= now() - (v_days || ' days')::interval;

  select coalesce(jsonb_agg(x order by x.last_at desc), '[]'::jsonb) into v_rows
    from (
      select kind, screen, action, message,
             count(*)                                          as times,
             max(at)                                           as last_at,
             string_agg(distinct nullif(user_name, ''), ', ')  as who
        from public.app_errors
       where at >= now() - (v_days || ' days')::interval
       group by kind, screen, action, message
       order by max(at) desc
       limit 30
    ) x;

  return jsonb_build_object(
    'days', v_days,
    'total', v_total,
    'groups', v_rows,
    'checkedAt', (now() at time zone 'Asia/Seoul')
  );
end;
$$;

revoke all on function public.recent_app_errors(integer) from public;
grant execute on function public.recent_app_errors(integer) to authenticated;

comment on function public.recent_app_errors(integer) is
  '최근 오류를 화면·동작·문구로 묶어서 돌려줍니다 (0046). 관리자만.';


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
    'app_errors'
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
    ['profiles','approved_at'], ['app_errors','kind']
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
    'record_app_error','recent_app_errors',
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
    'clients_request_uniq','clients_name_key_idx',
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
  'DB 자가진단 (0043~0046). 돈을 지키는 표·칸·함수·색인·방아쇠·권한이 실제로 있는지 세어 없는 것을 이름으로 돌려줍니다. 관리자만.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 46 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0046). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
