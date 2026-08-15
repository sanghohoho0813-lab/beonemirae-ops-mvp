-- 비원미래 운영 DB — 31차 (0045)
-- 같은 거래처가 두 곳이 되지 않게. RUN_1~30 이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0045_client_dedup.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();  → 45 가 나와야 합니다.
--              select public.app_health_check();     → ok: true
--
-- 참고 — 실행 전에 이미 갈려 있는 거래처가 있는지 보시려면:
--   select public.client_name_key(name) k, count(*), string_agg(name, ' · ')
--     from public.clients group by 1 having count(*) > 1;
--   (있어도 이 파일은 지우거나 합치지 않습니다 — 합치는 것은 사람이 판단할 일입니다)

-- ─────────────────────────────────────────────────────────────────────────────
-- 0045. 같은 거래처가 두 곳이 되지 않게
--
--  거래처가 둘로 갈리면 그 순간부터 **모든 숫자가 갈립니다.**
--   · 수거가 두 곳에 나뉘어 어느 쪽도 실제 물량이 아님
--   · 청구·명세서가 두 장 나감
--   · 미수금이 두 줄로 남아 통장 대사가 맞지 않음
--   · 매출·손익·거래처 리포트가 전부 반쪽
--
--  그리고 한 번 갈리면 되돌릴 방법이 없습니다 — 수거 이력이 이미 양쪽에
--  붙어 있어서, 합치려면 사람이 한 건씩 옮겨야 합니다.
--
--  지금 서버는 **아무것도 막지 않습니다.** 실측으로 확인했습니다 —
--  「오남한양병원」을 네 번 넣었더니 네 곳이 그대로 생겼습니다.
--
--      오남한양병원 · 오남한양병원 · 오남한양 병원 · (주)오남한양병원
--
--  화면에 확인 창이 있긴 했지만 두 가지 이유로 방어가 아니었습니다.
--   ① 글자 그대로만 비교해서 띄어쓰기·(주) 가 다르면 그냥 통과
--   ② **화면은 방어선이 아닙니다** — 두 사람이 같은 순간에 누르면 둘 다 통과하고,
--      통신이 끊긴 줄 알고 다시 누르면 두 곳이 생깁니다
--
--  그래서 서버로 옮깁니다. 다만 **막기만 하지는 않습니다** — 실제로 상호가
--  같은 다른 병원이 있을 수 있고, 그건 사람만 압니다. 서버는 「이미 있습니다,
--  이 곳입니다」라고 이름을 대고 멈추며, 사람이 「다른 병원입니다」라고
--  말하면 그때는 만들어 주고 그 판단을 기록에 남깁니다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 맞대보기용 이름 열쇠 ────────────────────────────────────────────────────
--
--  저장되는 이름은 사람이 적은 그대로입니다. 이건 **비교할 때만** 쓰는 값입니다.
--  시스템이 상호를 고쳐 쓰지 않습니다.
--
--  ⚠ `src/lib/clientName.ts` 의 `clientNameKey()` 와 글자 하나까지 같아야 합니다.
--    한쪽만 고치면 화면이 「괜찮다」고 한 것을 서버가 막습니다.
create or replace function public.client_name_key(p_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           replace(replace(replace(replace(replace(replace(replace(replace(replace(
           replace(replace(replace(replace(replace(replace(replace(replace(replace(
             lower(coalesce(p_name, '')),
             '주식회사', ''), '유한책임회사', ''), '유한회사', ''), '합자회사', ''),
             '합명회사', ''), '의료법인', ''), '재단법인', ''), '사단법인', ''),
             '사회복지법인', ''), '학교법인', ''), '종교법인', ''), '(주)', ''),
             '(유)', ''), '(의)', ''), '(재)', ''), '(사)', ''), '(합)', ''), '㈜', ''),
           '[^0-9a-z가-힣一-龥]', '', 'g')
$$;

comment on function public.client_name_key(text) is
  '거래처 이름 맞대보기용 열쇠 (0045). 법인격 표기를 빼고 한글·한자·영문·숫자만 남깁니다. src/lib/clientName.ts 와 같은 규칙이어야 합니다.';


alter table public.clients
  add column if not exists name_key text;

comment on column public.clients.name_key is
  '이름 맞대보기용 열쇠 (0045). client_name_key(name) 이 자동으로 채웁니다 — 사람이 넣지 않습니다.';

--  값을 사람이 넣지 못하게 방아쇠가 항상 다시 씁니다. 이름을 고치면 열쇠도 따라옵니다.
create or replace function public.clients_set_name_key()
returns trigger
language plpgsql
as $$
begin
  new.name_key := public.client_name_key(new.name);
  return new;
end;
$$;

drop trigger if exists clients_name_key_trg on public.clients;
create trigger clients_name_key_trg
  before insert or update of name on public.clients
  for each row execute function public.clients_set_name_key();

--  이미 있는 거래처에 채웁니다 (이름은 건드리지 않습니다).
update public.clients set name_key = public.client_name_key(name) where name_key is distinct from public.client_name_key(name);

create index if not exists clients_name_key_idx on public.clients (name_key);


-- ── 다시 눌러도 두 곳이 되지 않게 ───────────────────────────────────────────
--
--  0042·0043 과 같은 방식입니다. 화면이 「이번 저장 시도」마다 표를 하나
--  만들어 보내고, 다시 눌러도 **같은 표**를 보냅니다.
alter table public.clients
  add column if not exists request_id uuid;

comment on column public.clients.request_id is
  '한 번의 저장 시도 (0045). 같은 표가 두 번 오면 두 번째는 이미 만든 거래처를 돌려줍니다.';

create unique index if not exists clients_request_uniq
  on public.clients (request_id) where request_id is not null;


-- ── 거래처 등록 ─────────────────────────────────────────────────────────────
--
--  `p_client` 는 clients 표 모양의 jsonb 입니다. 새 칸이 생겨도 이 함수를
--  고칠 필요가 없습니다. 다만 **사람이 정할 수 없는 칸**은 여기서 떼어 냅니다 —
--  id·만든 시각·만든 사람·열쇠·저장시도표는 서버가 정합니다.
create or replace function public.create_client(
  p_client          jsonb,
  p_allow_duplicate boolean default false,
  p_request_id      uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_new    public.clients%rowtype;
  v_old    public.clients%rowtype;
  v_clean  jsonb;
  v_name   text;
  v_key    text;
  v_names  text;
  v_dups   jsonb;
  v_cols   text;
  v_vals   text;
  v_id     uuid;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '거래처 등록은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  --  사람이 정할 수 없는 칸을 떼어 냅니다 — id·만든 시각·만든 사람·열쇠·
  --  저장시도표는 서버가 정합니다. 넣어 보내도 무시됩니다.
  v_clean := coalesce(p_client, '{}'::jsonb)
      - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
      - 'name_key' - 'request_id' - 'active' - 'flat_fee_policy_at';

  --  모르는 칸은 조용히 버립니다. 화면이 옛 이름으로 보내도 등록 자체가
  --  실패하는 것보다, 아는 것만 넣고 나머지는 기본값으로 두는 편이 낫습니다.
  select coalesce(jsonb_object_agg(k, v_clean -> k), '{}'::jsonb) into v_clean
    from jsonb_object_keys(v_clean) k
   where exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'clients' and column_name = k
   );

  v_name := btrim(coalesce(v_clean ->> 'name', ''));
  if v_name = '' then
    raise exception '거래처 이름을 넣어 주세요.' using errcode = 'P0001';
  end if;
  v_key := public.client_name_key(v_name);
  if v_key = '' then
    raise exception '거래처 이름에 글자가 없습니다 — 상호를 적어 주세요.' using errcode = 'P0001';
  end if;
  v_clean := v_clean || jsonb_build_object('name', v_name);

  --  ① 같은 저장 시도가 이미 들어왔는가 (잠그기 전에 한 번)
  if p_request_id is not null then
    select * into v_old from public.clients where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_old.id, 'alreadySaved', true, 'duplicates', '[]'::jsonb);
    end if;
  end if;

  --  ② 같은 이름끼리 줄 세웁니다.
  --
  --   「먼저 확인하고 넣기」는 방어가 아닙니다 — 두 사람이 같은 순간에 확인하면
  --   둘 다 「없다」를 보고 둘 다 넣습니다. 같은 열쇠를 쥔 사람만 지나가게 합니다.
  perform pg_advisory_xact_lock(hashtext('client_name:' || v_key));

  if p_request_id is not null then
    select * into v_old from public.clients where request_id = p_request_id;
    if found then
      return jsonb_build_object('id', v_old.id, 'alreadySaved', true, 'duplicates', '[]'::jsonb);
    end if;
  end if;

  --  ③ 이미 있는가
  select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'active', active) order by created_at),
         string_agg(name || case when active then '' else ' (거래 종료)' end, ' · ' order by created_at)
    into v_dups, v_names
    from public.clients
   where name_key = v_key;

  if v_dups is not null and not coalesce(p_allow_duplicate, false) then
    raise exception '이미 같은 이름의 거래처가 있습니다 — %. 같은 곳이면 그 거래처를 쓰시고, 정말 다른 병원이면 「다른 병원입니다」를 눌러 주세요.',
      v_names using errcode = 'P0001';
  end if;

  --  ④ 넣습니다
  --
  --   **보내 준 칸만** 지정해서 넣습니다. 안 보낸 칸은 표의 기본값이 그대로
  --   쓰입니다 — 여기서 통째로 만들어 넣으면 담당자·연락처처럼 기본값이 있는
  --   칸이 빈 값으로 덮여 「없는 값을 만들어 넣는」 셈이 됩니다.
  v_clean := v_clean || jsonb_build_object(
    'active',     true,
    'request_id', p_request_id,
    'created_by', v_actor.id,
    'updated_by', v_actor.id
  );
  --  「배출 없어도 월정액 청구」를 켠 채로 만들었다면 그건 사람이 정한 것입니다 (0044).
  --  안 켰으면 「아직 안 정함」으로 둡니다 — 기본값을 판단으로 세지 않습니다.
  if coalesce((v_clean ->> 'flat_fee_when_empty')::boolean, false) then
    v_clean := v_clean || jsonb_build_object('flat_fee_policy_at', now());
  end if;

  select string_agg(quote_ident(k), ', ' order by k),
         string_agg('r.' || quote_ident(k), ', ' order by k)
    into v_cols, v_vals
    from jsonb_object_keys(v_clean) k;

  execute format(
    'insert into public.clients (%s) select %s from jsonb_populate_record(null::public.clients, $1) r returning id',
    v_cols, v_vals
  ) into v_id using v_clean;

  select * into v_new from public.clients where id = v_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, after_data, summary, screen, source)
  values
    ('client.create', 'clients', v_id::text, v_id, v_new.name,
     null,
     to_jsonb(v_new) - 'name_key',
     case when v_dups is not null
          then format('거래처 등록 — %s (같은 이름 %s곳이 이미 있는데 다른 병원이라고 확인함: %s)',
                      v_new.name, jsonb_array_length(v_dups), v_names)
          else format('거래처 등록 — %s', v_new.name) end,
     '거래처 관리', 'app');

  return jsonb_build_object('id', v_id, 'alreadySaved', false, 'duplicates', coalesce(v_dups, '[]'::jsonb));
end;
$$;

revoke all on function public.create_client(jsonb, boolean, uuid) from public;
grant execute on function public.create_client(jsonb, boolean, uuid) to authenticated;

comment on function public.create_client(jsonb, boolean, uuid) is
  '거래처 등록 (0045). 같은 이름이 있으면 이름을 대고 멈춥니다. 사람이 「다른 병원」이라고 하면 만들고 그 판단을 기록합니다.';


-- ── 거래처를 표에 직접 넣는 길을 닫습니다 ───────────────────────────────────
--
--  함수만 남기지 않으면 방어가 아닙니다 — 예전 경로가 그대로 살아 있으면
--  거기로 두 곳이 생깁니다. 청구·입금(0037)에서 한 것과 같은 처리입니다.
--  고치기(update)와 읽기는 그대로 둡니다 — 상호 수정·거래 종료는 계속 필요합니다.
revoke insert on public.clients from authenticated;


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
    'sales_leads','sales_lead_events','experiment_settings','performance_baselines'
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
    'set_flat_fee_policy','create_client','client_name_key',
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
  'DB 자가진단 (0043~0045). 돈을 지키는 표·칸·함수·색인·방아쇠·권한이 실제로 있는지 세어 없는 것을 이름으로 돌려줍니다. 관리자만.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 45 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0045). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
