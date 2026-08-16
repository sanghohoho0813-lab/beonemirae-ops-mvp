-- ════════════════════════════════════════════════════════════════════════════
-- 0056 — 기사님 계정 사전 등록 · 담당 거래처 배정 · 계정에 차량 묶기
--
--  대표님 요청 세 가지입니다.
--
--   ① 기사님 계정을 대표님이 미리 만들어 두고 싶다
--   ② 수거 입력에서 「이름·몇 호차」를 매번 안 적고 싶다
--   ③ 기사님은 **자기가 맡은 거래처만** 보이게 하고 싶다
--      (50곳 넘는 거래처를 전부 공유할 이유가 없습니다)
--
-- ── ① 왜 「사전 등록(초대)」인가 ────────────────────────────────────────────
--
--  비밀번호까지 대표님이 정해 주려면 Supabase 관리자 열쇠(service_role)를
--  화면에 놓아야 합니다. 그 열쇠는 RLS 를 통째로 무시합니다 — 새는 순간
--  누구든 전체 DB 를 보고 지울 수 있습니다. 대표님이 금지하신 것이고,
--  그 판단이 맞습니다.
--
--  대신 **미리 등록해 둡니다.** 대표님이 이메일·이름·역할·차량·담당
--  거래처를 넣어 두면, 그 사람이 그 이메일로 가입하는 순간
--
--    · 자동으로 승인되고 (관리자가 다시 누를 필요 없음)
--    · 정해 둔 역할·차량이 들어가고
--    · 담당 거래처가 그대로 배정됩니다
--
--  비밀번호는 본인이 정합니다. 대표님이 남의 비밀번호를 알 필요도 없고,
--  알고 있으면 나중에 「그 사람이 한 일인가 대표님이 한 일인가」를 가릴 수
--  없게 됩니다.
--
-- ── ③ 배정을 켜는 방식 — 여기가 제일 조심스러운 자리입니다 ──────────────────
--
--  현장 계정이 「배정된 거래처만」 보게 하면, **배정이 하나도 없는 기존
--  계정은 아무것도 못 보게 됩니다.** 지금 쓰고 계신 계정이 내일 아침에
--  빈 화면이 되는 것입니다.
--
--  그래서 규칙을 이렇게 둡니다.
--
--    배정이 **한 건도 없는** 기사 → 지금까지처럼 **전부** 보입니다
--    배정이 **한 건이라도 있는** 기사 → 그 목록만 보입니다
--
--  대표님이 첫 배정을 넣는 순간부터 그 사람에게 적용됩니다. 한 사람씩
--  옮길 수 있고, 잘못되면 배정을 지우면 원래대로 돌아옵니다.
--
--  ⚠ 이것은 RLS **강화**입니다(현장이 보는 범위를 좁힙니다). 사무실·관리자·
--    병원 계정의 권한은 한 줄도 안 바뀝니다.
--
-- ── 기존 데이터 영향 ────────────────────────────────────────────────────────
--   · 표 두 개가 새로 생깁니다(staff_invites · client_assignments). 둘 다
--     비어 있는 채로 시작합니다.
--   · profiles 에 vehicle_id 칸 하나. 기존 계정은 전부 null 입니다.
--   · **배정이 비어 있으므로 지금 당장 보이는 것은 아무것도 안 바뀝니다.**
--   · 금액·청구·입금·수거·재고는 하나도 안 건드립니다.
--   · 두 번 실행해도 안전합니다.
--
--  실행 순서: RUN_1 ~ RUN_41 뒤에 실행합니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 계정에 묶는 차량 ────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists vehicle_id uuid references public.vehicles(id);

comment on column public.profiles.vehicle_id is
  '이 사람이 늘 타는 차 (0056). 정해 두면 수거 입력에서 차량 칸이 안 보이고 서버가 이 값으로 채웁니다. null 이면 지금까지처럼 화면에서 고릅니다.';


-- ── 담당 거래처 배정 ────────────────────────────────────────────────────────

create table if not exists public.client_assignments (
  client_id  uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (client_id, profile_id)
);

create index if not exists client_assignments_profile_idx
  on public.client_assignments (profile_id);

comment on table public.client_assignments is
  '거래처별 담당 기사 (0056). 배정이 한 건이라도 있는 기사는 그 거래처만 봅니다. 한 건도 없으면 지금까지처럼 전부 봅니다.';

alter table public.client_assignments enable row level security;

--  직원은 누가 어디를 맡는지 다 봅니다 — 「이건 누가 가지?」에 답하려면
--  서로의 담당을 알아야 합니다. 병원 계정은 못 봅니다.
drop policy if exists client_assignments_read on public.client_assignments;
create policy client_assignments_read on public.client_assignments
  for select using (public.is_active_user());

--  바꾸는 것은 관리자만. 기사가 자기 담당을 스스로 늘릴 수 있으면
--  「배정된 곳만 본다」가 아무 뜻이 없습니다.
revoke insert, update, delete on public.client_assignments from authenticated;
grant select on public.client_assignments to authenticated;


/** 이 사람이 배정을 하나라도 받았는가 — RLS 안에서 씁니다 */
create or replace function public.has_assignments(p_profile uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.client_assignments where profile_id = p_profile)
$$;

/**
 * 이 거래처를 볼 수 있는가 (현장 담당자 기준).
 *
 *  배정이 하나도 없으면 true — 지금까지처럼 전부 보입니다.
 *  배정이 있으면 그 목록에 있을 때만.
 */
create or replace function public.can_see_client(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when not public.has_assignments() then true
      else exists (
        select 1 from public.client_assignments
         where profile_id = auth.uid() and client_id = p_client
      )
    end
$$;

revoke all on function public.has_assignments(uuid) from public;
revoke all on function public.can_see_client(uuid) from public;
grant execute on function public.has_assignments(uuid) to authenticated;
grant execute on function public.can_see_client(uuid) to authenticated;


-- ── 거래처 읽기 범위 좁히기 ─────────────────────────────────────────────────
--
--  ⚠ 관리자·사무실은 그대로 전부 봅니다. 좁아지는 것은 **현장 계정뿐**입니다.
--    병원 계정은 원래 자기 병원만 봤고(0006) 그대로입니다.

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients
  for select using (
    case
      when public.auth_role() = 'field' then public.can_see_client(id)
      else public.is_active_user()
    end
  );

--  수거 일정도 같은 범위입니다. 거래처는 안 보이는데 그 병원 일정이 보이면
--  이름만 「알 수 없는 거래처」로 뜨고 오늘 갈 곳이 뒤섞입니다.
drop policy if exists schedules_read on public.schedules;
create policy schedules_read on public.schedules
  for select using (
    case
      when public.auth_role() = 'field' then public.can_see_client(client_id)
      else public.is_active_user()
    end
  );


-- ── 사전 등록(초대) ─────────────────────────────────────────────────────────

create table if not exists public.staff_invites (
  email       text primary key,
  name        text not null default '',
  role        public.user_role not null default 'field',
  vehicle_id  uuid references public.vehicles(id),
  --  가입하면 이 거래처들이 배정됩니다
  client_ids  uuid[] not null default '{}',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  --  실제로 가입한 시각 — 채워지면 「가입 완료」입니다
  used_at     timestamptz,
  used_by     uuid references public.profiles(id)
);

comment on table public.staff_invites is
  '가입 전에 미리 등록해 두는 계정 정보 (0056). 비밀번호는 담지 않습니다 — 본인이 정합니다.';

alter table public.staff_invites enable row level security;

--  관리자만 봅니다. 초대 목록에는 아직 가입 안 한 사람의 이메일이 들어
--  있어, 직원 전체에게 열 이유가 없습니다.
drop policy if exists staff_invites_admin on public.staff_invites;
create policy staff_invites_admin on public.staff_invites
  for select using (public.is_admin());

revoke insert, update, delete on public.staff_invites from authenticated;
grant select on public.staff_invites to authenticated;


/**
 * 사전 등록 넣기·고치기 (관리자만).
 *
 *  같은 이메일을 다시 넣으면 덮어씁니다 — 오타를 고칠 수 있어야 합니다.
 *  **이미 가입한 이메일은 못 건드립니다** — 그건 초대가 아니라 계정이고,
 *  역할·배정은 사용자 관리에서 바꿉니다.
 */
create or replace function public.upsert_staff_invite(
  p_email      text,
  p_name       text,
  p_role       text,
  p_vehicle_id uuid default null,
  p_client_ids uuid[] default '{}',
  p_note       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_used  timestamptz;
begin
  if not public.is_admin() then
    raise exception '계정 사전 등록은 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception '이메일 형태가 아닙니다 — %', p_email using errcode = 'P0001';
  end if;
  if p_role not in ('admin', 'office', 'field') then
    raise exception '역할은 admin · office · field 중 하나여야 합니다.' using errcode = 'P0001';
  end if;

  --  이미 계정이 있으면 초대로 덮지 않습니다.
  if exists (select 1 from public.profiles where lower(email) = v_email) then
    raise exception '이미 가입한 계정입니다 — 역할·담당은 사용자 관리에서 바꿔 주세요.'
      using errcode = 'P0001';
  end if;

  select used_at into v_used from public.staff_invites where email = v_email;
  if v_used is not null then
    raise exception '이미 이 초대로 가입했습니다.' using errcode = 'P0001';
  end if;

  insert into public.staff_invites (email, name, role, vehicle_id, client_ids, note, created_by)
  values (v_email, coalesce(p_name, ''), p_role::public.user_role, p_vehicle_id,
          coalesce(p_client_ids, '{}'), coalesce(p_note, ''), auth.uid())
  on conflict (email) do update
    set name = excluded.name, role = excluded.role, vehicle_id = excluded.vehicle_id,
        client_ids = excluded.client_ids, note = excluded.note;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('invite.upsert', 'staff_invites', v_email,
          format('%s 사전 등록 (%s · 담당 %s곳)', v_email, p_role,
                 coalesce(array_length(p_client_ids, 1), 0)),
          '사용자 관리', 'app');

  return jsonb_build_object('email', v_email, 'clients', coalesce(array_length(p_client_ids, 1), 0));
end;
$$;

revoke all on function public.upsert_staff_invite(text, text, text, uuid, uuid[], text) from public;
grant execute on function public.upsert_staff_invite(text, text, text, uuid, uuid[], text) to authenticated;


create or replace function public.delete_staff_invite(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception '사전 등록 삭제는 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  --  이미 가입한 초대는 기록으로 남깁니다 — 누가 어떻게 들어왔는지의 근거입니다.
  if exists (select 1 from public.staff_invites where email = v_email and used_at is not null) then
    raise exception '이미 가입에 쓰인 초대는 지우지 않습니다 (기록으로 남깁니다).'
      using errcode = 'P0001';
  end if;
  delete from public.staff_invites where email = v_email;
  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('invite.delete', 'staff_invites', v_email, format('%s 사전 등록 삭제', v_email), '사용자 관리', 'app');
  return jsonb_build_object('email', v_email, 'deleted', true);
end;
$$;

revoke all on function public.delete_staff_invite(text) from public;
grant execute on function public.delete_staff_invite(text) to authenticated;


-- ── 가입할 때 초대를 적용 ───────────────────────────────────────────────────
--
--  ⚠ 이 트리거는 **가입 자체를 막지 않습니다.** 초대가 없으면 지금까지와
--    똑같습니다(0021) — 현장 역할 · 사용 중지 · 승인 대기. 초대가 있을 때만
--    자동 승인 + 역할·차량·담당 거래처가 붙습니다.
--
--  ⚠ **역할은 브라우저가 보낸 값에서 절대 읽지 않습니다.**
--    0021 이 정한 규칙이고 그대로 둡니다 — raw_user_meta_data 는 가입 화면에서
--    아무 값이나 넣을 수 있는 자리라, 거기서 role 을 읽으면 누구나
--    `role=admin` 을 실어 보내 관리자가 됩니다. 역할이 올 수 있는 자리는
--    둘뿐입니다.
--      · raw_app_meta_data  — 서버(service_role)가 만든 계정
--      · staff_invites      — 관리자가 미리 등록해 둔 자리
--    이름(name)만 raw_user_meta_data 에서 읽습니다 — 표시용이고 본인이
--    나중에 바꿀 수 있는 값입니다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app    jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_user   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_invite public.staff_invites;
  v_role   public.user_role;
  v_client uuid;
  v_name   text;
  v_cid    uuid;
begin
  --  대소문자가 어긋나면 초대가 조용히 안 붙습니다. 표에 소문자로 굳혀 두고
  --  여기서도 소문자로 찾습니다.
  select * into v_invite from public.staff_invites
   where email = lower(new.email) and used_at is null;

  v_name := coalesce(
    nullif(btrim(coalesce(v_invite.name, '')), ''),
    nullif(btrim(v_user->>'name'), ''),
    split_part(new.email, '@', 1)
  );

  -- ① 사전 등록된 사람 — 적어 둔 대로 바로 씁니다
  if v_invite.email is not null then
    insert into public.profiles (id, email, name, role, client_id, vehicle_id, active, approved_at)
    values (new.id, new.email, v_name, v_invite.role, null, v_invite.vehicle_id, true, now());

    foreach v_cid in array coalesce(v_invite.client_ids, '{}') loop
      insert into public.client_assignments (client_id, profile_id, assigned_by)
      values (v_cid, new.id, v_invite.created_by)
      on conflict do nothing;
    end loop;

    update public.staff_invites
       set used_at = now(), used_by = new.id
     where email = v_invite.email;
    return new;
  end if;

  -- ② 서버가 만든 계정 (0021 그대로) — 역할은 app_metadata 에서만
  begin
    v_role := nullif(v_app->>'role', '')::public.user_role;
  exception when others then
    v_role := null;
  end;
  begin
    v_client := nullif(v_app->>'client_id', '')::uuid;
  exception when others then
    v_client := null;
  end;

  -- ③ 스스로 가입한 계정 — 무조건 현장, 무조건 승인 대기 (0021 그대로)
  if v_role is null then
    insert into public.profiles (id, email, name, role, client_id, active, approved_at)
    values (new.id, new.email, v_name, 'field', null, false, null);
    return new;
  end if;

  --  소속 없는 병원 계정은 제약에 걸려 계정 생성이 통째로 실패합니다.
  --  조용히 실패하는 대신 현장으로 떨어뜨립니다.
  if v_role = 'client' and v_client is null then
    v_role := 'field';
  end if;

  insert into public.profiles (id, email, name, role, client_id, active, approved_at)
  values (new.id, new.email, v_name, v_role,
          case when v_role = 'client' then v_client else null end,
          true, now());
  return new;
end $$;


-- ── 배정 바꾸기 (관리자만) ──────────────────────────────────────────────────
--
--  거래처 화면에서 담당 기사를 고르면 이 함수가 불립니다. **그 거래처의
--  담당자 목록을 통째로** 바꿉니다 — 하나씩 넣고 빼면 화면과 서버가
--  어긋난 상태가 남습니다.

create or replace function public.set_client_drivers(
  p_client_id uuid,
  p_profiles  uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_pid  uuid;
  v_bad  int;
begin
  if not public.is_admin() then
    raise exception '담당 기사 배정은 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select name into v_name from public.clients where id = p_client_id;
  if v_name is null then
    raise exception '그 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  없는 사람·병원 계정에 배정하면 그 배정은 영영 아무 일도 안 합니다.
  select count(*) into v_bad
    from unnest(coalesce(p_profiles, '{}')) as x(id)
   where not exists (
     select 1 from public.profiles p
      where p.id = x.id and p.active and p.role in ('admin', 'office', 'field')
   );
  if v_bad > 0 then
    raise exception '배정할 수 없는 계정이 %명 있습니다 (없는 계정·사용 중지·병원 계정).', v_bad
      using errcode = 'P0001';
  end if;

  delete from public.client_assignments
   where client_id = p_client_id
     and (p_profiles is null or profile_id <> all(p_profiles));

  foreach v_pid in array coalesce(p_profiles, '{}') loop
    insert into public.client_assignments (client_id, profile_id, assigned_by)
    values (p_client_id, v_pid, auth.uid())
    on conflict do nothing;
  end loop;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('client.drivers', 'clients', p_client_id::text,
          format('%s 담당 기사 %s명으로 지정', v_name, coalesce(array_length(p_profiles, 1), 0)),
          '거래처', 'app');

  return jsonb_build_object('clientId', p_client_id, 'count', coalesce(array_length(p_profiles, 1), 0));
end;
$$;

revoke all on function public.set_client_drivers(uuid, uuid[]) from public;
grant execute on function public.set_client_drivers(uuid, uuid[]) to authenticated;


/** 계정에 차량 묶기 (관리자만) */
create or replace function public.set_profile_vehicle(p_profile uuid, p_vehicle uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_veh  text;
begin
  if not public.is_admin() then
    raise exception '차량 지정은 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  select name into v_name from public.profiles where id = p_profile;
  if v_name is null then
    raise exception '그 계정을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_vehicle is not null then
    select name into v_veh from public.vehicles where id = p_vehicle and active;
    if v_veh is null then
      raise exception '그 차량을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles set vehicle_id = p_vehicle where id = p_profile;

  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('profile.vehicle', 'profiles', p_profile::text,
          format('%s 차량 %s', v_name, coalesce(v_veh, '지정 해제')), '사용자 관리', 'app');
  return jsonb_build_object('profileId', p_profile, 'vehicle', v_veh);
end;
$$;

revoke all on function public.set_profile_vehicle(uuid, uuid) from public;
grant execute on function public.set_profile_vehicle(uuid, uuid) to authenticated;


-- ── 자가진단 목록 넓히기 ────────────────────────────────────────────────────

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
    'app_errors','staff','tax_filings',
    'products','product_orders','product_order_items',
    'month_close_marks','client_assignments','staff_invites'
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
    ['staff','waste_scope'], ['tax_filings','base_exempt'],
    ['product_order_items','unit_price'], ['product_orders','delivered_at'],
    ['tax_filings','confirmed_at'], ['products','category'],
    ['month_close_marks','marked_name'],
    ['client_requests','request_id'], ['site_notes','request_id'],
    ['profiles','vehicle_id'], ['staff_invites','client_ids']
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
    'request_product_order','set_product_order_status','upsert_product','product_sales_summary',
    'admin_approve_user','admin_confirm_email','delete_client','app_schema_version',
    'set_tax_filing_confirmed','set_month_close_mark',
    'upsert_staff_invite','delete_staff_invite','set_client_drivers','set_profile_vehicle',
    'has_assignments','can_see_client',
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
    'clients_request_uniq','clients_name_key_idx','staff_name_uniq','product_orders_request_uniq',
    'schedules_planned_uniq','schedules_one_completion_per_day','products_category_idx',
    'month_close_marks_uniq',
    'client_requests_request_uniq','site_notes_request_uniq',
    'client_assignments_profile_idx'
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
  --  가입할 때 초대를 적용하는 방아쇠 — 없으면 사전 등록이 조용히 아무 일도
  --  안 하고, 기사님은 승인 대기에 걸린 채 기다립니다.
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    v_missing := v_missing || '방아쇠 on_auth_user_created'::text;
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
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('products', 'product_orders', 'product_order_items')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 상품·주문 직접 쓰기가 열려 있음'::text;
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'month_close_marks'
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 마감 표시 직접 쓰기가 열려 있음'::text;
  end if;
  --  기사가 자기 담당을 스스로 늘릴 수 있으면 「배정된 곳만 본다」가
  --  아무 뜻이 없습니다.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('client_assignments', 'staff_invites')
       and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    v_missing := v_missing || '잠금 배정·사전등록 직접 쓰기가 열려 있음'::text;
  end if;

  foreach v_name in array array[
    'client_requests_client_write', 'client_requests_client_read'
  ] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'client_requests' and policyname = v_name
    ) then
      v_missing := v_missing || ('정책 ' || v_name);
    end if;
  end loop;

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
as $$ select 56 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
