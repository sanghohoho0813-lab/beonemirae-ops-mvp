-- ─────────────────────────────────────────────────────────────────────────────
-- 0021. 본인이 가입하고, 관리자가 승인합니다
--
--  지금까지 계정은 관리자가 전부 만들어야 했습니다(0018). 직원이 다섯 명이면
--  그럭저럭 되지만, 이름·이메일을 받아 적고 임시 비밀번호를 따로 전해 주는
--  일이 계속 남습니다. 그래서 본인이 자기 이메일로 가입 신청을 하고,
--  관리자가 목록에서 승인하는 길을 엽니다.
--
--  ── 여기서 막아야 했던 것 ───────────────────────────────────────────────
--
--  가입을 열기 전 트리거는 역할을 이렇게 정했습니다(0006).
--
--      v_requested := coalesce((new.raw_user_meta_data->>'role')::user_role, 'field')
--
--  raw_user_meta_data 는 가입하는 사람이 signUp 할 때 직접 넣는 값입니다.
--  관리자가 계정을 만들 때 역할을 지정하려고 그렇게 둔 것인데, 공개 가입이
--  켜지는 순간 의미가 뒤집힙니다. 브라우저에서 이 한 줄이면 됩니다.
--
--      supabase.auth.signUp({ email, password,
--                             options: { data: { role: 'admin' } } })
--
--  주소만 아는 사람이 스스로 관리자가 됩니다. 승인제를 붙여도 그대로입니다 —
--  관리자로 만들어진 계정을 이사님이 승인하는 순간 관리자가 되니까요.
--
--  ── 어떻게 막는가 ───────────────────────────────────────────────────────
--
--  Supabase 의 계정 메타데이터는 두 종류이고, 쓸 수 있는 사람이 다릅니다.
--
--    raw_user_meta_data   가입하는 본인이 씁니다 (signUp 의 options.data)
--    raw_app_meta_data    서버만 씁니다. 브라우저에서는 넣을 방법이 없습니다
--
--  역할을 읽는 자리를 user → app 으로 옮깁니다. 그러면 두 길이 갈립니다.
--
--    관리자가 만든 계정   admin_create_user 가 app_metadata 에 역할을 적음
--                         → 그 역할로, 바로 사용
--    스스로 가입한 계정   app_metadata 에 역할이 없음
--                         → 무조건 현장(field), 무조건 승인 대기
--
--  가입자가 user_metadata 에 무엇을 넣든 이제 읽지 않습니다. 역할을 올리는
--  길은 「로그인한 관리자가 승인 화면에서 지정」 하나만 남습니다.
--
--  ── 승인 전에는 무엇이 보이는가 ─────────────────────────────────────────
--
--  아무것도 보이지 않습니다. 화면에서 가리는 것이 아니라 서버가 막습니다.
--  이 시스템의 권한 판정은 전부 auth_role() 한 곳을 지나갑니다(0001).
--
--      select role from profiles where id = auth.uid() and active
--
--  active 가 false 면 역할이 NULL 이 되고, is_admin()·is_staff()·
--  is_active_user()·is_client_user() 가 모두 거짓이 됩니다. 거래처·수거·
--  청구·자재·감사기록 — RLS 정책이 전부 이 함수들 위에 서 있어서 한꺼번에
--  닫힙니다. 열려 있는 것은 자기 프로필 한 줄을 읽는 것뿐이고(0002), 그건
--  본인에게 「승인 대기 중」이라고 알려 주는 데 필요합니다.
--
--  엄밀히는 로그인 자체가 거부되는 게 아니라, 로그인은 되지만 아무것도
--  읽지 못하는 상태입니다. 본인은 왜 안 되는지 안내를 보게 되고,
--  서버가 내주는 데이터는 없습니다.
--
--  ── 승인 대기와 중지를 구분합니다 ───────────────────────────────────────
--
--  active=false 하나로는 「아직 승인 안 된 신규」와 「쓰다가 중지된 계정」이
--  같아 보입니다. 관리자 목록에서 둘은 전혀 다른 일이라 approved_at 을
--  둡니다. NULL 이면 한 번도 승인된 적 없는 계정입니다.
--
--  적용 후에는 supabase/test/51_signup_approval.mjs 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. 승인 시각 ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists approved_at timestamptz;

comment on column public.profiles.approved_at is
  '관리자가 승인한 시각. NULL 이면 본인이 가입 신청만 하고 아직 승인되지 않은 계정 (0021).';

--  이미 있는 계정은 전부 관리자가 만든 것입니다. 승인 대기로 보이면
--  이사님이 멀쩡히 쓰던 계정을 새 신청으로 착각하게 됩니다.
update public.profiles
   set approved_at = created_at
 where approved_at is null;

create index if not exists profiles_pending_idx
  on public.profiles (created_at) where approved_at is null;

-- ── 2. 가입 트리거 — 역할은 app_metadata 에서만 읽습니다 ─────────────────────
--
--  0006 판과 달라진 곳
--   · 역할·소속을 raw_user_meta_data 가 아니라 raw_app_meta_data 에서 읽습니다
--   · app_metadata 에 역할이 없으면(=스스로 가입) field + 승인 대기로 넣습니다
--   · 「최초 계정은 관리자」 규칙을 뺐습니다. 공개 가입이 열린 뒤에는 이 규칙이
--     위험합니다 — profiles 가 어떤 이유로든 비면 그다음에 가입한 사람이
--     관리자가 됩니다. 최초 관리자는 아래 5번에서 지정합니다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_app    jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_user   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role   public.user_role;
  v_client uuid;
  v_name   text;
begin
  --  이름은 본인이 정하는 값이라 user_metadata 에서 읽어도 됩니다.
  --  권한이 아니라 표시용이고, 어차피 로그인 후 본인이 바꿀 수 있습니다.
  v_name := coalesce(nullif(btrim(v_user->>'name'), ''), split_part(new.email, '@', 1));

  --  역할은 app_metadata 에서만. 브라우저에서 넣을 수 없는 자리입니다.
  --  값이 이상하면 없는 것으로 봅니다(가입 자체를 실패시키지 않습니다).
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

  if v_role is null then
    --  스스로 가입한 계정 — 무조건 현장, 무조건 승인 대기.
    --  user_metadata 에 role 이 무엇으로 적혀 있든 여기서는 읽지 않습니다.
    insert into public.profiles (id, email, name, role, client_id, active, approved_at)
    values (new.id, new.email, v_name, 'field', null, false, null);
    return new;
  end if;

  --  소속 없는 병원 계정은 제약(profiles_client_needs_client_id)에 걸려
  --  계정 생성이 통째로 실패합니다. 조용히 실패하는 대신 현장으로 떨어뜨립니다.
  if v_role = 'client' and v_client is null then
    v_role := 'field';
  end if;

  insert into public.profiles (id, email, name, role, client_id, active, approved_at)
  values (new.id, new.email, v_name, v_role,
          case when v_role = 'client' then v_client else null end,
          true, now());
  return new;
end $$;

comment on function public.handle_new_user() is
  '가입 시 프로필 생성. 역할은 app_metadata(서버만 씀)에서만 읽고, 없으면 field + 승인 대기 (0021).';

-- ── 3. 관리자 계정 생성 — 역할을 app_metadata 에 적습니다 ────────────────────
--
--  0018 판과 달라진 곳은 auth.users 에 넣는 메타데이터 두 칸뿐입니다.
--   raw_app_meta_data  ← provider + role (+ client_id)   위 트리거가 읽는 자리
--   raw_user_meta_data ← name 만
--  역할을 user_metadata 에도 적어 두면, 나중에 그쪽을 읽는 코드가 하나라도
--  생겼을 때 다시 조작 가능한 값이 됩니다. 한 군데만 남깁니다.
create or replace function public.admin_create_user(
  p_email     text,
  p_password  text,
  p_name      text,
  p_role      text,
  p_client_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id        uuid := gen_random_uuid();
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_name      text := btrim(coalesce(p_name, ''));
  v_role      public.user_role;
  v_client    uuid := p_client_id;
  v_client_nm text;
  v_cols      text := '';
  v_vals      text := '';
  v_col       text;
  v_has_pid   boolean;
begin
  if not public.is_admin() then
    raise exception '계정을 만들 수 있는 것은 관리자뿐입니다.' using errcode = 'P0001';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception '이메일 형식이 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception '임시 비밀번호는 8자 이상이어야 합니다.' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception '이름을 입력해 주세요.' using errcode = 'P0001';
  end if;

  begin
    v_role := p_role::public.user_role;
  exception when others then
    raise exception '역할이 올바르지 않습니다.' using errcode = 'P0001';
  end;

  if v_role = 'client' then
    if v_client is null then
      raise exception '병원 계정은 소속 거래처를 지정해야 합니다.' using errcode = 'P0001';
    end if;
    select name into v_client_nm from public.clients where id = v_client;
    if v_client_nm is null then
      raise exception '지정한 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
  else
    v_client := null;
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception '이미 사용 중인 이메일입니다.' using errcode = 'P0001';
  end if;

  --  $5 = app_metadata. 0018 에서는 provider 만 든 고정 문자열이었는데,
  --  이제 역할이 여기 들어갑니다(위 트리거가 읽는 자리).
  v_cols := 'id, aud, role, email, encrypted_password, email_confirmed_at,'
         || ' raw_app_meta_data, raw_user_meta_data, created_at, updated_at';
  v_vals := '$1, ''authenticated'', ''authenticated'', $2, crypt($3, gen_salt(''bf'')), now(),'
         || ' $5, $4, now(), now()';

  if exists (select 1 from information_schema.columns
              where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then
    v_cols := v_cols || ', instance_id';
    v_vals := v_vals || ', ''00000000-0000-0000-0000-000000000000''::uuid';
  end if;

  foreach v_col in array array['confirmation_token','recovery_token',
                               'email_change_token_new','email_change',
                               'email_change_token_current','phone_change','phone_change_token',
                               'reauthentication_token']
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'auth' and table_name = 'users' and column_name = v_col) then
      v_cols := v_cols || ', ' || quote_ident(v_col);
      v_vals := v_vals || ', ''''';
    end if;
  end loop;

  execute format('insert into auth.users (%s) values (%s)', v_cols, v_vals)
    using v_id,
          v_email,
          p_password,
          jsonb_build_object('name', v_name),
          jsonb_build_object('provider', 'email', 'providers', array['email'],
                             'role', v_role::text)
            || case when v_client is null then '{}'::jsonb
                    else jsonb_build_object('client_id', v_client::text) end;

  select exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'identities'
                    and column_name = 'provider_id')
    into v_has_pid;

  if v_has_pid then
    insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  else
    insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_id::text, v_id,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  end if;

  --  트리거가 없는 환경을 위한 보루. 관리자가 만든 계정이므로 승인된 상태입니다.
  if not exists (select 1 from public.profiles where id = v_id) then
    insert into public.profiles (id, email, name, role, client_id, active, approved_at)
    values (v_id, v_email, v_name, v_role, v_client, true, now());
  end if;

  insert into public.audit_logs (action, entity, entity_id, after_data, summary, screen, source)
  values ('profile.create', 'profiles', v_id::text,
          jsonb_build_object('email', v_email, 'name', v_name, 'role', v_role::text,
                             'client_id', v_client),
          '계정 생성 — ' || v_name || ' (' || v_email || ') · ' || v_role::text
            || coalesce(' · ' || v_client_nm, ''),
          'users', 'app');

  return v_id;
end;
$$;

revoke all on function public.admin_create_user(text, text, text, text, uuid) from public;
grant execute on function public.admin_create_user(text, text, text, text, uuid) to authenticated;

-- ── 4. 가입 승인 ─────────────────────────────────────────────────────────────
--
--  역할 지정과 승인을 한 번에 합니다. 「활성화 → 역할 변경」 두 번으로 하면
--  그 사이 짧은 순간 신청자가 현장 권한으로 들어와 있게 됩니다. 승인 화면에서
--  고른 역할이 곧바로 붙도록 한 트랜잭션에서 처리합니다.
--
--  security definer 인 이유는 0018 과 같습니다 — 관리자인지를 화면이 아니라
--  서버가 확인하고, 그 확인을 통과한 것만 실행합니다.
create or replace function public.admin_approve_user(
  p_user_id   uuid,
  p_role      text,
  p_client_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_role   public.user_role;
  v_client uuid := p_client_id;
  v_cli_nm text;
begin
  if not public.is_admin() then
    raise exception '가입 승인은 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '그 계정을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_target.approved_at is not null then
    raise exception '이미 승인된 계정입니다. 역할은 계정 목록에서 바꿔 주세요.' using errcode = 'P0001';
  end if;

  begin
    v_role := p_role::public.user_role;
  exception when others then
    raise exception '역할이 올바르지 않습니다.' using errcode = 'P0001';
  end;

  if v_role = 'client' then
    if v_client is null then
      raise exception '병원 계정은 소속 거래처를 지정해야 합니다.' using errcode = 'P0001';
    end if;
    select name into v_cli_nm from public.clients where id = v_client;
    if v_cli_nm is null then
      raise exception '지정한 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
  else
    v_client := null;
  end if;

  update public.profiles
     set role = v_role, client_id = v_client, active = true, approved_at = now()
   where id = p_user_id;

  insert into public.audit_logs
    (action, entity, entity_id, before_data, after_data, summary, screen, source)
  values
    ('profile.approve', 'profiles', p_user_id::text,
     jsonb_build_object('role', v_target.role::text, 'active', v_target.active),
     jsonb_build_object('role', v_role::text, 'active', true, 'client_id', v_client),
     format('가입 승인 — %s (%s) · %s%s',
            coalesce(nullif(v_target.name, ''), v_target.email), v_target.email,
            v_role::text, coalesce(' · ' || v_cli_nm, '')),
     'users', 'app');
end;
$$;

revoke all on function public.admin_approve_user(uuid, text, uuid) from public;
grant execute on function public.admin_approve_user(uuid, text, uuid) to authenticated;

comment on function public.admin_approve_user(uuid, text, uuid) is
  '가입 신청 승인 — 역할 지정과 활성화를 한 번에. 관리자만 (0021).';

--  가입 신청 거절 = 계정 삭제. auth.users 를 지우면 profiles 는 함께 지워집니다
--  (profiles.id 가 on delete cascade). 아직 승인된 적 없는 계정만 지울 수 있어,
--  실제로 쓰던 계정을 이 길로 지우는 일은 생기지 않습니다.
create or replace function public.admin_reject_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception '가입 거절은 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception '그 계정을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_target.approved_at is not null then
    raise exception '이미 승인된 계정은 여기서 삭제할 수 없습니다. 계정 목록에서 중지해 주세요.'
      using errcode = 'P0001';
  end if;

  --  기록을 먼저 남깁니다. 계정이 사라지면 누가 신청했었는지 알 길이 없습니다.
  insert into public.audit_logs
    (action, entity, entity_id, before_data, summary, screen, source)
  values
    ('profile.reject', 'profiles', p_user_id::text,
     jsonb_build_object('email', v_target.email, 'name', v_target.name),
     format('가입 거절 — %s (%s)',
            coalesce(nullif(v_target.name, ''), v_target.email), v_target.email),
     'users', 'app');

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_reject_user(uuid) from public;
grant execute on function public.admin_reject_user(uuid) to authenticated;

comment on function public.admin_reject_user(uuid) is
  '가입 신청 거절 — 승인된 적 없는 계정만 삭제. 관리자만 (0021).';

-- ── 5. 승인 한 번에 감사기록 한 줄 ───────────────────────────────────────────
--
--  0020 트리거는 역할 변경과 사용/중지를 각각 남깁니다. 승인은 그 둘을 한꺼번에
--  하므로 그대로 두면 한 번 승인할 때 「권한 변경」·「계정 사용」 두 줄이 쌓이고,
--  정작 「가입 승인」이라는 사실은 어디에도 안 남습니다. 승인으로 넘어가는
--  전환일 때만 비켜서고, 그 한 줄은 admin_approve_user 가 남깁니다.
--  (그 외의 역할 변경·중지는 0020 그대로 남습니다)
create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := coalesce(nullif(new.name, ''), new.email, new.id::text);
  v_old_cli text;
  v_new_cli text;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- 승인 전환(approved_at: NULL → 값)은 admin_approve_user 가 한 줄로 남깁니다.
  if old.approved_at is null and new.approved_at is not null then
    return new;
  end if;

  -- 역할
  if new.role is distinct from old.role then
    insert into public.audit_logs
      (action, entity, entity_id, before_data, after_data, summary, screen, source)
    values
      ('profile.role', 'profiles', new.id::text,
       jsonb_build_object('role', old.role), jsonb_build_object('role', new.role),
       format('권한 변경 — %s · %s → %s', v_name, old.role, new.role),
       'users', 'db');
  end if;

  -- 사용 / 중지
  if new.active is distinct from old.active then
    insert into public.audit_logs
      (action, entity, entity_id, before_data, after_data, summary, screen, source)
    values
      ('profile.active', 'profiles', new.id::text,
       jsonb_build_object('active', old.active), jsonb_build_object('active', new.active),
       format('계정 %s — %s', case when new.active then '사용' else '중지' end, v_name),
       'users', 'db');
  end if;

  -- 병원 소속
  if new.client_id is distinct from old.client_id then
    select name into v_old_cli from public.clients where id = old.client_id;
    select name into v_new_cli from public.clients where id = new.client_id;
    insert into public.audit_logs
      (action, entity, entity_id, client_id, client_name,
       before_data, after_data, summary, screen, source)
    values
      ('profile.client', 'profiles', new.id::text, new.client_id, coalesce(v_new_cli, ''),
       jsonb_build_object('clientId', old.client_id), jsonb_build_object('clientId', new.client_id),
       format('병원 계정 소속 변경 — %s · %s → %s',
              v_name, coalesce(v_old_cli, '없음'), coalesce(v_new_cli, '없음')),
       'users', 'db');
  end if;

  return new;
end;
$$;

comment on function public.audit_profile_change() is
  '계정의 역할·사용여부·병원소속 변경을 남깁니다. 승인 전환은 admin_approve_user 가 남깁니다 (0020·0021).';

-- ── 6. 본인은 승인 상태를 바꿀 수 없습니다 ───────────────────────────────────
--
--  0012 는 role·active·client_id·email 을 본인이 못 바꾸게 했습니다.
--  approved_at 이 빠지면, 승인 대기 중인 사람이 자기 행에
--  approved_at 을 채워 넣고 승인된 계정인 척할 수 있습니다.
--  (active 는 여전히 못 바꾸므로 그것만으로 열리지는 않지만,
--   승인 대기 목록에서 사라져 관리자 눈에 띄지 않게 됩니다)
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role        = (select p.role        from public.profiles p where p.id = auth.uid())
    and active      = (select p.active      from public.profiles p where p.id = auth.uid())
    and client_id   is not distinct from
                      (select p.client_id   from public.profiles p where p.id = auth.uid())
    and email       = (select p.email       from public.profiles p where p.id = auth.uid())
    and approved_at is not distinct from
                      (select p.approved_at from public.profiles p where p.id = auth.uid())
  );

comment on policy profiles_update_self on public.profiles is
  '본인은 이름·글자크기만 수정. role/active/client_id/email/approved_at 은 고정 (0012·0021).';

-- ── 7. 판정 함수가 NULL 을 돌려주지 않게 ─────────────────────────────────────
--
--  검증 중에 걸린 것입니다. 승인 대기 계정으로 확인해 보니
--
--      auth_role()        → NULL     (active 가 아니므로)
--      is_active_user()   → NULL     ← false 가 아닙니다
--
--  is_active_user() 는 0006 에서 `auth_role() in ('admin','office','field')` 가
--  되었는데, SQL 의 IN 은 왼쪽이 NULL 이면 false 가 아니라 NULL 을 돌려줍니다.
--
--  RLS 는 지금도 안전합니다 — 정책은 "참일 때만" 통과시키므로 NULL 은 거부로
--  처리됩니다. 실제로 승인 대기 계정은 거래처를 한 건도 보지 못합니다.
--
--  문제는 이 값을 부정할 때입니다.
--
--      not is_active_user()   →  not NULL  →  NULL  →  거짓처럼 취급됨
--
--  "활성 사용자가 아니면 막는다" 는 코드를 나중에 누가 이렇게 쓰면, 막으려던
--  자리가 조용히 통과합니다. 지금 그렇게 쓴 곳은 없지만, 승인 대기 계정이
--  생기면서 NULL 이 나오는 상황 자체가 흔해졌습니다. 세 함수 모두
--  참/거짓만 돌려주도록 못을 박습니다.
create or replace function public.is_active_user() returns boolean
language sql stable as $$
  select coalesce(public.auth_role() in ('admin','office','field'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select coalesce(public.auth_role() = 'admin', false) $$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select coalesce(public.auth_role() in ('admin','office'), false) $$;

create or replace function public.is_client_user() returns boolean
language sql stable as $$ select coalesce(public.auth_role() = 'client', false) $$;

comment on function public.is_active_user() is
  '로그인했고 승인·활성 상태인 내부 직원 계정인가. NULL 을 돌려주지 않습니다 (0006·0021).';

-- ── 8. 관리자는 이 두 계정입니다 ─────────────────────────────────────────────
--
--  「최초 계정은 관리자」 규칙을 뺐으므로(2번), 관리자는 여기서 이름으로
--  지정합니다. 이 두 계정 외에 관리자로 남아 있는 계정은 사무실 담당자로
--  내립니다 — 다만 지정한 계정이 실제로 관리자로 확보된 뒤에만 내립니다.
--  (아직 만들지 않은 상태에서 돌리면 관리자가 0명이 되어 아무도 못 들어옵니다)
--
--  이 블록은 여러 번 실행해도 결과가 같습니다.
do $$
declare
  v_admins  text[] := array['sanghohoho0813@gmail.com', 'beonemirae@naver.com'];
  v_have    integer;
  v_demoted integer;
  v_missing text;
begin
  update public.profiles
     set role        = 'admin',
         active      = true,
         client_id   = null,
         approved_at = coalesce(approved_at, now())
   where lower(email) = any (v_admins)
     and (role <> 'admin' or not active or client_id is not null or approved_at is null);

  select count(*) into v_have
    from public.profiles
   where lower(email) = any (v_admins) and role = 'admin' and active;

  select string_agg(e, ', ') into v_missing
    from unnest(v_admins) e
   where not exists (select 1 from public.profiles p where lower(p.email) = e);

  if v_missing is not null then
    raise notice '아직 없는 계정: %  — 사용자 관리 화면에서 관리자로 만들어 주세요.', v_missing;
  end if;

  if v_have = 0 then
    raise notice '지정한 관리자 계정이 하나도 없어, 기존 관리자를 그대로 둡니다.';
  else
    update public.profiles
       set role = 'office'
     where role = 'admin'
       and lower(email) <> all (v_admins);
    get diagnostics v_demoted = row_count;
    raise notice '관리자 % 명 확보. 그 외 관리자 % 명을 사무실 담당자로 내렸습니다.', v_have, v_demoted;
  end if;
end $$;
