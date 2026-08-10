-- ─────────────────────────────────────────────────────────────────────────────
-- 0018. 관리자가 앱 안에서 계정을 만들고 관리합니다
--
--  지금까지 계정을 하나 만들려면 Supabase 대시보드에 들어가
--  Authentication → Users → Add user 를 하고, 병원 계정이면 User Metadata 에
--  거래처 id(uuid)를 손으로 붙여 넣어야 했습니다. 대표님이 직원 한 명을
--  추가할 때마다 개발자에게 부탁하거나 uuid 를 복사해 오셔야 했습니다.
--
--  그렇다고 계정 만드는 힘(service_role 키)을 브라우저에 둘 수는 없습니다.
--  그 키 하나면 RLS 가 통째로 무의미해집니다. 그래서 그 힘은 서버(DB)에
--  두고, 「관리자인지」를 서버가 확인한 뒤에만 쓰게 합니다.
--
--  여기서 만드는 것
--   1) admin_create_user     — 계정 생성 (이름·이메일·임시 비밀번호·역할)
--   2) admin_reset_password  — 비밀번호 초기화
--   3) 자기 자신의 관리자 권한을 스스로 내리지 못하게 (0016 보강)
--
--  세 가지 모두 '관리자인가'를 화면이 아니라 서버가 판단합니다. 사무실·현장·
--  병원 계정이 직접 부르면 거절합니다. 공개 가입(signup)은 그대로 꺼 둡니다 —
--  이 함수는 로그인한 관리자만 부를 수 있으므로 가입 경로가 되지 않습니다.
--
--  왜 함수가 auth 스키마를 직접 건드리는가
--   Supabase 의 계정 생성 API 는 service_role 키를 요구합니다. 그 키를 앱에
--   두지 않기로 한 이상, 서버 안에서 하는 수밖에 없습니다. 비밀번호는
--   pgcrypto 의 bcrypt 로 해싱해 넣습니다 — GoTrue 가 로그인할 때 쓰는 것과
--   같은 방식이라, 이렇게 만든 계정도 평소처럼 로그인됩니다.
--   원문 비밀번호는 어디에도 남기지 않습니다(감사기록에도 남기지 않습니다).
--
--  GoTrue 버전마다 auth 테이블의 칸이 조금씩 다릅니다. 있는 칸만 골라
--  넣도록 만들어, 버전이 달라도 그대로 돌아갑니다.
--
--  적용 후에는 supabase/test/43_user_admin.mjs 로 확인할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

--  bcrypt 를 쓰려면 pgcrypto 가 있어야 합니다. Supabase 는 보통 extensions
--  스키마에 두지만, 이미 다른 곳에 깔려 있으면 그대로 씁니다.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    begin
      execute 'create extension pgcrypto with schema extensions';
    exception when others then
      execute 'create extension pgcrypto';
    end;
  end if;
end $$;

-- ── 1. 계정 생성 ─────────────────────────────────────────────────────────────
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
  -- 부르는 사람이 관리자인가 — 화면이 아니라 서버가 판단합니다
  if not public.is_admin() then
    raise exception '계정을 만들 수 있는 것은 관리자뿐입니다.' using errcode = 'P0001';
  end if;

  -- 값 검사. 여기서 막지 않으면 로그인되지 않는 계정이 조용히 생깁니다.
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

  -- 병원 계정은 소속 거래처가 반드시 있어야 합니다. 소속 없는 병원 계정은
  -- 자기 병원이 없으므로 포털에서 아무것도 볼 수 없습니다.
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

  -- auth.users 에 넣습니다. 버전마다 칸이 달라서, 있는 칸만 골라 넣습니다.
  -- (없는 칸을 넣으려 하면 통째로 실패하고, 관리자는 이유를 알 수 없습니다)
  v_cols := 'id, aud, role, email, encrypted_password, email_confirmed_at,'
         || ' raw_app_meta_data, raw_user_meta_data, created_at, updated_at';
  v_vals := '$1, ''authenticated'', ''authenticated'', $2, crypt($3, gen_salt(''bf'')), now(),'
         || ' ''{"provider":"email","providers":["email"]}''::jsonb, $4, now(), now()';

  if exists (select 1 from information_schema.columns
              where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then
    v_cols := v_cols || ', instance_id';
    v_vals := v_vals || ', ''00000000-0000-0000-0000-000000000000''::uuid';
  end if;

  --  GoTrue 의 옛 버전은 이 칸들이 NULL 이면 로그인할 때 오류가 납니다.
  --  기본값이 없을 수 있으므로 빈 문자열을 직접 넣어 둡니다.
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
          jsonb_build_object('name', v_name, 'role', v_role::text)
            || case when v_client is null then '{}'::jsonb
                    else jsonb_build_object('client_id', v_client::text) end;

  -- auth.identities — 이메일 로그인을 쓰려면 이 줄이 있어야 합니다.
  -- 새 버전은 provider_id 칸이 따로 있고, 옛 버전은 id 가 그 역할을 합니다.
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

  --  profiles 는 auth.users 트리거(handle_new_user)가 만듭니다. 혹시 그 트리거가
  --  없는 환경이면 여기서 만들어 둡니다 — 프로필 없는 계정은 로그인해도
  --  아무 화면도 열리지 않습니다.
  if not exists (select 1 from public.profiles where id = v_id) then
    insert into public.profiles (id, email, name, role, client_id)
    values (v_id, v_email, v_name, v_role, v_client);
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

-- ── 2. 비밀번호 초기화 ───────────────────────────────────────────────────────
create or replace function public.admin_reset_password(
  p_user_id  uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception '비밀번호를 초기화할 수 있는 것은 관리자뿐입니다.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception '임시 비밀번호는 8자 이상이어야 합니다.' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception '그 계정을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  --  무엇을 바꿨는지만 남기고 비밀번호 자체는 남기지 않습니다.
  insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
  values ('profile.password', 'profiles', p_user_id::text,
          '비밀번호 초기화 — ' || coalesce(v_target.name, v_target.email),
          'users', 'app');
end;
$$;

revoke all on function public.admin_reset_password(uuid, text) from public;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;

-- ── 3. 자기 자신의 관리자 권한은 스스로 내리지 못합니다 (0016 보강) ──────────
--
--  0016 은 '마지막 관리자'를 지켰습니다. 관리자가 둘 이상이면 자기 역할을
--  스스로 내릴 수 있었는데, 그건 실수로 하기 쉽고 되돌리려면 남에게
--  부탁해야 합니다. 중지와 같은 취급으로 막습니다.
create or replace function public.guard_admin_lockout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_admins integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.active and not new.active and new.id = auth.uid() then
    raise exception '자기 계정은 중지할 수 없습니다. 다른 관리자에게 요청해 주세요.'
      using errcode = 'P0001';
  end if;

  if old.role = 'admin' and new.role <> 'admin' and new.id = auth.uid() then
    raise exception '자기 관리자 권한은 스스로 내릴 수 없습니다. 다른 관리자에게 요청해 주세요.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_active_admins
    from profiles where role = 'admin' and active;

  if old.role = 'admin' and old.active and not new.active and v_active_admins <= 1 then
    raise exception '관리자가 한 명뿐입니다. 다른 관리자를 먼저 지정한 뒤에 중지해 주세요.'
      using errcode = 'P0001';
  end if;

  if old.role = 'admin' and old.active and new.role <> 'admin' and v_active_admins <= 1 then
    raise exception '관리자가 한 명뿐입니다. 다른 관리자를 먼저 지정한 뒤에 역할을 바꿔 주세요.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_admin_lockout on public.profiles;
create trigger profiles_guard_admin_lockout
  before update on public.profiles
  for each row execute function public.guard_admin_lockout();
