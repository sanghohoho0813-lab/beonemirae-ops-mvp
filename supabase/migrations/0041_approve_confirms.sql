-- ─────────────────────────────────────────────────────────────────────────────
-- 0041. 관리자 승인 = 바로 사용
--
--  실제로 일어난 일
--
--   직원 한 명이 가입 신청을 했더니 Supabase 가 **영어로 된 확인 메일**을
--   보냈습니다. "Confirm your email address / Follow the link below…".
--   무슨 말인지 모르는 직원이 있을 수 있는 문장입니다.
--
--   그걸 눌렀더니 `localhost:3000` 으로 가면서
--   **「사이트에 연결할 수 없음 · ERR_CONNECTION_REFUSED」** 가 떴습니다.
--   (Supabase 프로젝트의 Site URL 이 기본값 그대로였습니다)
--
--   신청한 사람 입장에서는 이렇게 보입니다 —
--   「가입했는데 영어 메일이 왔고, 눌렀더니 고장 났다」.
--
--  무엇을 바꾸는가
--
--   이 회사에서 계정을 만들어도 되는지 판단하는 사람은 **관리자**입니다.
--   메일함을 열 수 있느냐는 그 판단과 아무 상관이 없습니다. 직원 얼굴을
--   아는 관리자가 승인 화면에서 확인하고 누르는 것이 더 강한 확인입니다.
--
--   그래서 **관리자가 승인하는 순간 메일 인증도 함께 끝난 것으로** 둡니다.
--   승인 즉시 로그인이 됩니다. 직원은 메일을 열 필요가 없습니다.
--
--   Supabase 대시보드에서 확인 메일 자체를 끄면(권장) 메일도 아예 안 갑니다.
--   이 마이그레이션은 **그 설정이 켜져 있든 꺼져 있든** 승인만으로 쓸 수 있게
--   만듭니다 — 화면이 약속한 것("승인하면 바로 사용")을 서버가 지키게 합니다.
--
--  안 바꾸는 것
--
--   · 승인은 여전히 관리자만 합니다 (is_admin)
--   · 승인 전에는 여전히 아무것도 안 열립니다 (RLS)
--   · 신청자가 자기 역할을 정할 수 없습니다 (0021 그대로)
--
--   즉 **문턱이 낮아진 게 아니라 엉뚱한 문턱 하나가 빠지는 것**입니다.
--   그 문턱은 「이 사람이 우리 직원인가」를 확인해 주지 않았습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 이미 승인된 계정의 메일 인증을 채웁니다 ─────────────────────────────────
--
--  지금 승인은 끝났는데 메일을 못 눌러 로그인이 안 되는 계정이 있을 수
--  있습니다(위의 그 직원이 그렇습니다). 이미 관리자가 승인한 계정이므로
--  같은 판단이 이미 내려진 상태입니다. 그 계정만 채웁니다.
--
--  ※ 승인되지 않은 계정은 건드리지 않습니다.
do $$
declare
  v_n integer;
begin
  update auth.users u
     set email_confirmed_at = coalesce(u.email_confirmed_at, now())
   where u.email_confirmed_at is null
     and exists (
       select 1 from public.profiles p
        where p.id = u.id and p.approved_at is not null and p.active
     );
  get diagnostics v_n = row_count;
  raise notice '이미 승인된 계정 중 메일 인증이 비어 있던 %건을 채웠습니다.', v_n;
end $$;


-- ── 승인이 곧 인증 ───────────────────────────────────────────────────────────
--
--  0021 의 함수를 그대로 두고 update 한 줄만 더합니다. 나머지 검사(관리자
--  여부·중복 승인·역할·병원 계정의 소속)는 **글자 하나 바꾸지 않았습니다** —
--  기억으로 다시 쓰면 지키던 것이 조용히 빠집니다.
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

  --  ── 0041 에서 더한 한 줄 ────────────────────────────────────────────────
  --  승인하는 순간 메일 인증도 끝난 것으로 둡니다. 이미 인증돼 있으면
  --  그 시각을 그대로 둡니다(덮어쓰지 않습니다).
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
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
  '가입 승인 (0021 · 0041). 역할 지정 · 활성화 · 메일 인증을 한 번에. 관리자만.';


-- ── 이미 승인된 계정을 나중에 풀어 주는 길 ───────────────────────────────────
--
--  승인은 됐는데 로그인이 안 되는 계정을 관리자가 직접 풀 수 있게 합니다.
--  (이 마이그레이션 이후에 Supabase 설정을 다시 켜는 등, 예상 못 한 경우용)
--
--  승인되지 않은 계정에는 쓰지 않습니다 — 그건 승인 절차를 건너뛰는 일입니다.
create or replace function public.admin_confirm_email(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception '그 계정을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_target.approved_at is null then
    raise exception '아직 승인되지 않은 계정입니다. 승인 화면에서 승인해 주세요 — 승인하면 함께 처리됩니다.'
      using errcode = 'P0001';
  end if;

  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = p_user_id;

  insert into public.audit_logs
    (action, entity, entity_id, after_data, summary, screen, source)
  values
    ('profile.confirm_email', 'profiles', p_user_id::text,
     jsonb_build_object('email', v_target.email),
     format('메일 인증 처리 — %s (%s)', coalesce(nullif(v_target.name, ''), v_target.email), v_target.email),
     'users', 'app');
end;
$$;

revoke all on function public.admin_confirm_email(uuid) from public;
grant execute on function public.admin_confirm_email(uuid) to authenticated;

comment on function public.admin_confirm_email(uuid) is
  '이미 승인된 계정의 메일 인증을 관리자가 대신 처리 (0041).';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 41 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0041). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
