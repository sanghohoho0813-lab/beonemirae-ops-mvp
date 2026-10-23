-- ════════════════════════════════════════════════════════════════════════════
-- 0146 — 신보 뉴본펭귄 사업계획서: 공동작성 · 검토 (새 표 9개 · 함수 14개)
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. 지우는 것 없습니다.
--     기존 표는 하나도 건드리지 않고, 새 표(bizplan_*)와 새 함수만 더합니다.
--     여러 번 실행해도 됩니다. 판 번호(app_schema_version)는 바꾸지 않습니다.
--
--  ── 무엇을 하나 ──────────────────────────────────────────────────────────
--   신용보증기금 스타트업지점에 낼 사업계획서를 앱 안에서 함께 쓰고 · 읽고 ·
--   수정을 요청하고 · 반영합니다. 카카오톡 · 워드 파일을 주고받지 않게.
--
--    · 참여자만 엽니다. 참여자는 「사업계획 담당(editor)」과 「검토(reviewer)」 둘.
--      - 대표·관리자(admin) 계정은 등록하지 않아도 「검토」로 열고, 참여자를 등록할 수 있습니다.
--      - 사무실(office) 계정은 **등록된 사람만** 엽니다(일반 직원은 못 봄).
--      - 현장 · 병원 계정과 로그인 안 한 사람은 등록돼 있어도 못 엽니다.
--    · 검토(대표님 · 이사님): 읽기 · 수정요청(제안 문장 포함) · 동의/의견 표시.
--      **문서를 직접 바꾸지 않습니다** — 요청은 담당자가 확인하고 반영합니다.
--    · 담당: 항목 편집 · 상태 관리 · 요청 처리(반영 · 보류 · 반려) · 버전 · 제출본.
--      바꿀 때마다 「바꾸기 전 · 후 · 누가 · 언제 · 왜 · 어느 요청」이 남습니다.
--    · 두 분이 같은 항목을 동시에 고치면 나중 저장이 **조용히 덮어쓰지 않고** 되돌아옵니다
--      (항목마다 판 번호 rev — 화면이 서버 내용과 내 내용을 나란히 보여 줍니다).
--    · 이력 · 요청 · 버전 · 확인 기록은 **지울 수 없습니다**(지우기 · 고치기를 서버가 막음).
--      제출본으로 확정한 버전도 덮어쓸 수 없고, 그 뒤 수정은 새 버전이 됩니다.
--    · 주민등록번호 · 개인 주소 · 개인 전화 · 계좌번호 · 서명 칸은 **저장하지 않습니다**
--      (서버가 그 칸 저장을 거절하고, 어느 칸이든 주민등록번호 모양은 거절합니다).
--      제출 직전 원본 서식에 직접 적습니다.
--
--   표는 RLS 를 켜고 정책을 두지 않았습니다 — 누구도 표를 직접 읽거나 쓰지 못하고,
--   모든 접근은 아래 bizplan_* 함수(security definer)를 거칩니다.
--
--  ── 사업계획서 내용(1차 초안)은 이 파일에 없습니다 ──────────────────────────
--   저장소가 공개라서, 회사 숫자 · 계획이 들어간 초안은 별도 파일(저장소 밖)로
--   드립니다. 이 파일을 먼저 실행하고, 그 초안 파일을 이어서 실행하시면 됩니다.
--   초안 없이도 빈 서식으로 바로 쓸 수 있습니다.
--
--  끝에 한 줄로 「표 (9) 9 · 함수 (14) 14」가 나오면 됩니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 표 ────────────────────────────────────────────────────────────────────

--  참여자 — 계정(profile)마다 한 줄. 지우지 않고 active 로 끕니다.
create table if not exists public.bizplan_members (
  profile_id  uuid primary key references public.profiles(id),
  member_role text not null check (member_role in ('editor','reviewer')),
  title       text not null default '' check (char_length(title) <= 30),
  active      boolean not null default true,
  added_by    text not null default '',
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

--  문서 — 지금은 하나(newborn2026)
create table if not exists public.bizplan_doc (
  id            text primary key,
  status        text not null default '초안 작성 중'
                check (status in ('초안 작성 중','공동 검토 중','수정 중','최종 검토','제출본 확정')),
  version_label text not null default '',
  locked_label  text not null default '',
  updated_at    timestamptz not null default now(),
  updated_by    text not null default '',
  created_at    timestamptz not null default now()
);

--  항목 — 원본 서식의 칸 하나(또는 표 하나)가 한 줄. value 는 글 · 표(행 배열) · 칸 묶음(객체)
create table if not exists public.bizplan_fields (
  doc_id       text not null references public.bizplan_doc(id),
  key          text not null check (key ~ '^[a-z0-9][a-z0-9_.]{0,63}$'),
  value        jsonb not null default '""'::jsonb,
  status       text not null default '작성 전'
               check (status in ('작성 전','초안 입력 완료','확인 필요','수정 요청 있음','수정 반영 완료','최종 확인 완료')),
  basis        jsonb not null default '{}'::jsonb,     -- {kind: 사실|추정|계획|미확인, source, asOf, note}
  rev          int not null default 0,
  updated_at   timestamptz not null default now(),
  updated_by   text not null default '',
  primary key (doc_id, key)
);

--  바뀐 기록 — 고칠 때마다 한 줄 (지울 수 없음)
create table if not exists public.bizplan_revisions (
  id            bigserial primary key,
  doc_id        text not null,
  key           text not null,
  before_value  jsonb,
  after_value   jsonb,
  before_status text not null default '',
  after_status  text not null default '',
  before_basis  jsonb,
  after_basis   jsonb,
  reason        text not null default '',
  request_id    uuid,
  version_label text not null default '',
  actor_id      uuid,
  actor_name    text not null default '',
  actor_title   text not null default '',
  at            timestamptz not null default now()
);
create index if not exists bizplan_revisions_key_idx on public.bizplan_revisions (doc_id, key, at desc);

--  수정요청 — 지우지 않습니다. 끝낼 때는 반영 완료 · 보류 · 반려(까닭 필수)
create table if not exists public.bizplan_requests (
  id              uuid primary key default gen_random_uuid(),
  doc_id          text not null,
  key             text not null,
  key_label       text not null default '' check (char_length(key_label) <= 200),
  req_type        text not null check (req_type in ('사실관계 수정','숫자 변경','문장 수정','내용 추가','내용 삭제','증빙자료 확인','의견 또는 질문','최종 확인 요청')),
  body            text not null check (char_length(body) between 1 and 4000),
  suggestion      text not null default '' check (char_length(suggestion) <= 20000),
  snapshot        jsonb,
  prev_status     text not null default '',
  requester_id    uuid,
  requester_name  text not null default '',
  requester_title text not null default '',
  created_at      timestamptz not null default now(),
  status          text not null default '접수' check (status in ('접수','검토 중','반영 완료','보류','반려')),
  handler_name    text not null default '',
  handled_at      timestamptz,
  resolution      text not null default '' check (char_length(resolution) <= 4000),
  applied_revision bigint,
  updated_at      timestamptz not null default now()
);
create index if not exists bizplan_requests_key_idx on public.bizplan_requests (doc_id, key, created_at desc);

--  요청 상태가 바뀐 기록 (지울 수 없음)
create table if not exists public.bizplan_request_log (
  id          bigserial primary key,
  request_id  uuid not null,
  from_status text not null default '',
  to_status   text not null,
  note        text not null default '',
  actor_name  text not null default '',
  at          timestamptz not null default now()
);

--  확인 표시 — 사람마다 항목마다 하나(동의 · 수정 의견 있음 · 자료 확인 필요 · 추후 논의)
create table if not exists public.bizplan_checks (
  doc_id     text not null,
  key        text not null,
  profile_id uuid not null,
  mark       text not null check (mark in ('동의','수정 의견 있음','자료 확인 필요','추후 논의')),
  note       text not null default '' check (char_length(note) <= 1000),
  name       text not null default '',
  title      text not null default '',
  at         timestamptz not null default now(),
  primary key (doc_id, key, profile_id)
);
create table if not exists public.bizplan_check_log (
  id         bigserial primary key,
  doc_id     text not null,
  key        text not null,
  profile_id uuid,
  name       text not null default '',
  mark       text,
  note       text not null default '',
  at         timestamptz not null default now()
);

--  버전 — 그 순간 문서 전체를 통째로 (덮어쓸 수 없음)
create table if not exists public.bizplan_versions (
  id            bigserial primary key,
  doc_id        text not null,
  label         text not null check (char_length(label) between 1 and 20),
  note          text not null default '' check (char_length(note) <= 1000),
  is_submission boolean not null default false,
  snapshot      jsonb not null,
  doc_status    text not null default '',
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  unique (doc_id, label)
);

alter table public.bizplan_members     enable row level security;
alter table public.bizplan_doc         enable row level security;
alter table public.bizplan_fields      enable row level security;
alter table public.bizplan_revisions   enable row level security;
alter table public.bizplan_requests    enable row level security;
alter table public.bizplan_request_log enable row level security;
alter table public.bizplan_checks      enable row level security;
alter table public.bizplan_check_log   enable row level security;
alter table public.bizplan_versions    enable row level security;
revoke all on public.bizplan_members, public.bizplan_doc, public.bizplan_fields, public.bizplan_revisions,
              public.bizplan_requests, public.bizplan_request_log, public.bizplan_checks,
              public.bizplan_check_log, public.bizplan_versions from anon, authenticated;

-- ── 2. 지울 수 없게 — 기록 표는 고치기 · 지우기를 서버가 막습니다 ─────────────
create or replace function public.bizplan_no_rewrite()
returns trigger language plpgsql as $$
begin
  raise exception '사업계획서 기록은 지우거나 고칠 수 없습니다 (%).', tg_table_name using errcode = '42501';
end $$;

do $$
declare t text;
begin
  foreach t in array array['bizplan_revisions','bizplan_request_log','bizplan_check_log','bizplan_versions'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_no_rewrite') then
      execute format('create trigger %I before update or delete on public.%I for each row execute function public.bizplan_no_rewrite()', t || '_no_rewrite', t);
    end if;
  end loop;
  --  요청은 상태를 바꿀 수 있지만 지울 수는 없습니다
  if not exists (select 1 from pg_trigger where tgname = 'bizplan_requests_no_delete') then
    create trigger bizplan_requests_no_delete before delete on public.bizplan_requests
      for each row execute function public.bizplan_no_rewrite();
  end if;
end $$;

-- ── 3. 누가 무엇을 할 수 있나 ────────────────────────────────────────────────

--  이 서버가 저장하지 않는 칸 — 주민등록번호 · 개인 주소 · 개인 전화 · 개인 자산 · 계좌번호 · 서명
create or replace function public.bizplan_locked_keys()
returns text[] language sql immutable as $$
  select array[
    'sign.seal',
    's2.ceo_rrn','s2.ceo_addr','s2.ceo_tel','s2.ceo_house','s2.ceo_estate',
    's10.account','s10.consent',
    'x1.rrn','x1.phone','x1.house','x1.assets',
    'x2.rrn','x2.phone','x2.house','x2.assets',
    'x3.rrn','x3.phone','x3.house','x3.assets'
  ]::text[]
$$;

--  나의 역할: 'editor' | 'reviewer' | null
create or replace function public.bizplan_my_role()
returns text language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_member text;
begin
  v_role := public.auth_role()::text;
  if v_role is null or v_role not in ('admin','office') then return null; end if;
  select member_role into v_member from public.bizplan_members where profile_id = auth.uid() and active;
  if v_member is not null then return v_member; end if;
  if v_role = 'admin' then return 'reviewer'; end if;
  return null;
end $$;

create or replace function public.bizplan_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role()::text = 'admin', false) or coalesce(public.bizplan_my_role() = 'editor', false)
$$;

create or replace function public.bizplan_me()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', coalesce(p.name, ''),
    'title', coalesce(m.title, ''),
    'role', public.bizplan_my_role()
  )
  from public.profiles p left join public.bizplan_members m on m.profile_id = p.id and m.active
  where p.id = auth.uid()
$$;

create or replace function public.bizplan_require(p_editor boolean)
returns void language plpgsql stable security definer set search_path = public as $$
declare r text := public.bizplan_my_role();
begin
  if r is null then
    raise exception '사업계획서는 참여자로 등록된 계정만 열 수 있습니다.' using errcode = '42501';
  end if;
  if p_editor and r <> 'editor' then
    raise exception '이 일은 사업계획 담당만 할 수 있습니다. 수정요청으로 남겨 주세요.' using errcode = '42501';
  end if;
end $$;

--  주민등록번호 모양이 들어 있으면 거절 (어느 칸이든)
create or replace function public.bizplan_check_text(p jsonb)
returns void language plpgsql immutable as $$
begin
  if p is not null and p::text ~ '[0-9]{6}\s*-\s*[1-4][0-9]{6}' then
    raise exception '주민등록번호는 이 시스템에 저장하지 않습니다. 제출 직전 원본 서식에 직접 적어 주세요.' using errcode = '22023';
  end if;
end $$;

-- ── 4. 열기 ──────────────────────────────────────────────────────────────────
create or replace function public.bizplan_open()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc public.bizplan_doc%rowtype;
begin
  perform public.bizplan_require(false);
  insert into public.bizplan_doc(id) values ('newborn2026') on conflict (id) do nothing;
  select * into v_doc from public.bizplan_doc where id = 'newborn2026';
  return jsonb_build_object(
    'me', public.bizplan_me(),
    'can_manage', public.bizplan_can_manage(),
    'locked_keys', to_jsonb(public.bizplan_locked_keys()),
    'doc', to_jsonb(v_doc),
    'fields', coalesce((select jsonb_agg(jsonb_build_object(
        'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev,
        'updated_at', f.updated_at, 'updated_by', f.updated_by) order by f.key)
      from public.bizplan_fields f where f.doc_id = v_doc.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg((to_jsonb(r) - 'requester_id') || jsonb_build_object('mine', r.requester_id = auth.uid()) order by r.created_at desc)
      from public.bizplan_requests r where r.doc_id = v_doc.id), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object(
        'key', c.key, 'profile_id', c.profile_id, 'mark', c.mark, 'note', c.note,
        'name', c.name, 'title', c.title, 'at', c.at) order by c.at)
      from public.bizplan_checks c where c.doc_id = v_doc.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'profile_id', m.profile_id, 'name', coalesce(p.name, ''), 'title', m.title, 'role', m.member_role) order by m.added_at)
      from public.bizplan_members m join public.profiles p on p.id = m.profile_id
      where m.active and p.active), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'label', v.label, 'note', v.note, 'is_submission', v.is_submission,
        'doc_status', v.doc_status, 'created_by', v.created_by, 'created_at', v.created_at) order by v.created_at desc)
      from public.bizplan_versions v where v.doc_id = v_doc.id), '[]'::jsonb)
  );
end $$;

-- ── 5. 담당: 항목 저장 (판 번호로 충돌 감지 · 기록 한 줄) ──────────────────────
--  p_value 가 null 이면 내용은 그대로(상태 · 근거만). p_expected_rev 가 서버와 다르면
--  저장하지 않고 {ok:false, conflict:true, field:서버 내용} 을 돌려줍니다.
--  p_request_id 를 주면 그 요청을 「반영 완료」로 닫고 이 기록과 잇습니다.
create or replace function public.bizplan_save_field(
  p_key text, p_value jsonb, p_status text, p_basis jsonb, p_reason text,
  p_expected_rev int, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_doc public.bizplan_doc%rowtype; f public.bizplan_fields%rowtype; me jsonb := public.bizplan_me();
  v_at timestamptz := clock_timestamp(); v_rev_id bigint; v_req public.bizplan_requests%rowtype;
  v_status text; v_value jsonb; v_basis jsonb;
begin
  perform public.bizplan_require(true);
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9_.]{0,63}$' then
    raise exception '항목 이름이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_key = any(public.bizplan_locked_keys()) then
    raise exception '이 칸(개인정보 · 계좌 · 서명)은 이 시스템에 저장하지 않습니다. 제출 직전 원본 서식에 직접 적어 주세요.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('작성 전','초안 입력 완료','확인 필요','수정 요청 있음','수정 반영 완료','최종 확인 완료') then
    raise exception '상태 값이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_value is not null and pg_column_size(p_value) > 60000 then
    raise exception '내용이 너무 깁니다.' using errcode = '22023';
  end if;
  if p_basis is not null and (jsonb_typeof(p_basis) <> 'object' or pg_column_size(p_basis) > 4000) then
    raise exception '근거 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  perform public.bizplan_check_text(p_value);
  perform public.bizplan_check_text(p_basis);

  insert into public.bizplan_doc(id) values ('newborn2026') on conflict (id) do nothing;
  select * into v_doc from public.bizplan_doc where id = 'newborn2026' for update;
  insert into public.bizplan_fields(doc_id, key) values (v_doc.id, p_key) on conflict do nothing;
  select * into f from public.bizplan_fields where doc_id = v_doc.id and key = p_key for update;

  if coalesce(p_expected_rev, -1) <> f.rev then
    return jsonb_build_object('ok', false, 'conflict', true, 'field', jsonb_build_object(
      'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev,
      'updated_at', f.updated_at, 'updated_by', f.updated_by));
  end if;

  v_status := coalesce(p_status, f.status);
  v_value  := coalesce(p_value, f.value);
  v_basis  := coalesce(p_basis, f.basis);
  if v_status = '최종 확인 완료' and exists (
      select 1 from public.bizplan_requests r where r.doc_id = v_doc.id and r.key = p_key and r.status in ('접수','검토 중')
        and (p_request_id is null or r.id <> p_request_id)) then
    raise exception '처리하지 않은 수정요청이 있어 「최종 확인 완료」로 바꿀 수 없습니다.' using errcode = '22023';
  end if;
  if v_value = f.value and v_status = f.status and v_basis = f.basis then
    return jsonb_build_object('ok', true, 'unchanged', true, 'field', jsonb_build_object(
      'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev,
      'updated_at', f.updated_at, 'updated_by', f.updated_by));
  end if;

  if p_request_id is not null then
    select * into v_req from public.bizplan_requests where id = p_request_id and doc_id = v_doc.id for update;
    if v_req.id is null or v_req.key <> p_key then
      raise exception '이 항목의 수정요청이 아닙니다.' using errcode = '22023';
    end if;
    if v_req.status not in ('접수','검토 중') then
      raise exception '이미 처리된 수정요청입니다.' using errcode = '22023';
    end if;
  end if;

  update public.bizplan_fields
     set value = v_value, status = v_status, basis = v_basis, rev = f.rev + 1,
         updated_at = v_at, updated_by = coalesce(me->>'name', '')
   where doc_id = v_doc.id and key = p_key;

  insert into public.bizplan_revisions(doc_id, key, before_value, after_value, before_status, after_status,
                                       before_basis, after_basis, reason, request_id, version_label, actor_id, actor_name, actor_title, at)
  values (v_doc.id, p_key, f.value, v_value, f.status, v_status, f.basis, v_basis, left(coalesce(p_reason, ''), 2000),
          p_request_id, v_doc.version_label, auth.uid(), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at)
  returning id into v_rev_id;

  if p_request_id is not null then
    update public.bizplan_requests
       set status = '반영 완료', handler_name = coalesce(me->>'name', ''), handled_at = v_at,
           resolution = left(coalesce(nullif(p_reason, ''), '반영했습니다.'), 4000), applied_revision = v_rev_id, updated_at = v_at
     where id = p_request_id;
    insert into public.bizplan_request_log(request_id, from_status, to_status, note, actor_name, at)
    values (p_request_id, v_req.status, '반영 완료', left(coalesce(p_reason, ''), 2000), coalesce(me->>'name', ''), v_at);
  end if;

  update public.bizplan_doc
     set updated_at = v_at, updated_by = coalesce(me->>'name', ''),
         --  제출본으로 확정한 뒤 고치면 「수정 중」 — 확정본(버전)은 그대로, 다음 버전으로 저장
         status = case when status = '제출본 확정' then '수정 중' else status end
   where id = v_doc.id;

  select * into f from public.bizplan_fields where doc_id = v_doc.id and key = p_key;
  return jsonb_build_object('ok', true, 'revision', v_rev_id, 'field', jsonb_build_object(
    'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev,
    'updated_at', f.updated_at, 'updated_by', f.updated_by));
end $$;

-- ── 6. 참여자 모두: 수정요청 남기기 ─────────────────────────────────────────────
--  내용을 고치는 요청이면 항목 상태를 「수정 요청 있음」으로(바꾸기 전 상태를 기억 — 보류 · 반려 때 되돌림).
--  의견 · 질문 · 최종 확인 요청은 상태를 바꾸지 않습니다. **문서 내용은 바꾸지 않습니다.**
create or replace function public.bizplan_request_create(
  p_key text, p_label text, p_type text, p_body text, p_suggestion text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc text := 'newborn2026'; f public.bizplan_fields%rowtype; me jsonb := public.bizplan_me();
        v_at timestamptz := clock_timestamp(); r public.bizplan_requests%rowtype; v_mod boolean;
begin
  perform public.bizplan_require(false);
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9_.]{0,63}$' then
    raise exception '항목 이름이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception '요청 내용을 적어 주세요.' using errcode = '22023';
  end if;
  perform public.bizplan_check_text(to_jsonb(p_body));
  perform public.bizplan_check_text(to_jsonb(coalesce(p_suggestion, '')));
  insert into public.bizplan_doc(id) values (v_doc) on conflict (id) do nothing;
  insert into public.bizplan_fields(doc_id, key) values (v_doc, p_key) on conflict do nothing;
  select * into f from public.bizplan_fields where doc_id = v_doc and key = p_key for update;
  v_mod := p_type in ('사실관계 수정','숫자 변경','문장 수정','내용 추가','내용 삭제','증빙자료 확인');

  insert into public.bizplan_requests(doc_id, key, key_label, req_type, body, suggestion, snapshot, prev_status,
                                      requester_id, requester_name, requester_title, created_at, updated_at)
  values (v_doc, p_key, left(coalesce(p_label, ''), 200), p_type, btrim(p_body), coalesce(p_suggestion, ''),
          f.value, f.status, auth.uid(), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at, v_at)
  returning * into r;
  insert into public.bizplan_request_log(request_id, from_status, to_status, note, actor_name, at)
  values (r.id, '', '접수', '', coalesce(me->>'name', ''), v_at);

  if v_mod and f.status <> '수정 요청 있음' then
    update public.bizplan_fields set status = '수정 요청 있음', rev = f.rev + 1, updated_at = v_at, updated_by = coalesce(me->>'name', '')
     where doc_id = v_doc and key = p_key;
    insert into public.bizplan_revisions(doc_id, key, before_value, after_value, before_status, after_status,
                                         before_basis, after_basis, reason, request_id, version_label, actor_id, actor_name, actor_title, at)
    select v_doc, p_key, f.value, f.value, f.status, '수정 요청 있음', f.basis, f.basis, '수정요청 접수 (' || p_type || ')',
           r.id, d.version_label, auth.uid(), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at
      from public.bizplan_doc d where d.id = v_doc;
  end if;
  return to_jsonb(r) - 'requester_id';
end $$;

-- ── 7. 담당: 요청 처리 — 접수 → 검토 중 → 반영 완료 / 보류 / 반려(까닭 필수) ──────
create or replace function public.bizplan_request_update(p_id uuid, p_status text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.bizplan_requests%rowtype; f public.bizplan_fields%rowtype; me jsonb := public.bizplan_me();
        v_at timestamptz := clock_timestamp(); v_open int; v_next text;
begin
  perform public.bizplan_require(true);
  if p_status not in ('검토 중','반영 완료','보류','반려') then
    raise exception '처리 상태가 올바르지 않습니다.' using errcode = '22023';
  end if;
  select * into r from public.bizplan_requests where id = p_id for update;
  if r.id is null then raise exception '요청을 찾을 수 없습니다.' using errcode = '22023'; end if;
  if r.status in ('반영 완료','반려') then
    raise exception '이미 끝난 요청입니다.' using errcode = '22023';
  end if;
  if p_status in ('보류','반려') and char_length(btrim(coalesce(p_note, ''))) < 2 then
    raise exception '보류 · 반려는 까닭을 적어 주세요.' using errcode = '22023';
  end if;
  perform public.bizplan_check_text(to_jsonb(coalesce(p_note, '')));

  update public.bizplan_requests
     set status = p_status, handler_name = coalesce(me->>'name', ''),
         handled_at = case when p_status = '검토 중' then handled_at else v_at end,
         resolution = case when p_status = '검토 중' then resolution else left(coalesce(p_note, ''), 4000) end,
         updated_at = v_at
   where id = p_id;
  insert into public.bizplan_request_log(request_id, from_status, to_status, note, actor_name, at)
  values (p_id, r.status, p_status, left(coalesce(p_note, ''), 2000), coalesce(me->>'name', ''), v_at);

  --  끝난 요청 — 이 항목에 남은 「고치는 요청」이 없으면 항목 상태를 정리합니다(기록 한 줄)
  if p_status in ('반영 완료','보류','반려') then
    select count(*) into v_open from public.bizplan_requests
     where doc_id = r.doc_id and key = r.key and status in ('접수','검토 중')
       and req_type in ('사실관계 수정','숫자 변경','문장 수정','내용 추가','내용 삭제','증빙자료 확인');
    select * into f from public.bizplan_fields where doc_id = r.doc_id and key = r.key for update;
    if v_open = 0 and f.status = '수정 요청 있음' then
      v_next := case when p_status = '반영 완료' then '수정 반영 완료'
                     else coalesce(nullif(r.prev_status, ''), '확인 필요') end;
      if v_next = '수정 요청 있음' then v_next := '확인 필요'; end if;
      update public.bizplan_fields set status = v_next, rev = f.rev + 1, updated_at = v_at, updated_by = coalesce(me->>'name', '')
       where doc_id = r.doc_id and key = r.key;
      insert into public.bizplan_revisions(doc_id, key, before_value, after_value, before_status, after_status,
                                           before_basis, after_basis, reason, request_id, version_label, actor_id, actor_name, actor_title, at)
      select r.doc_id, r.key, f.value, f.value, f.status, v_next, f.basis, f.basis,
             '수정요청 ' || p_status || coalesce(' — ' || nullif(btrim(p_note), ''), ''), r.id, d.version_label,
             auth.uid(), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at
        from public.bizplan_doc d where d.id = r.doc_id;
    end if;
  end if;
  select * into r from public.bizplan_requests where id = p_id;
  return to_jsonb(r) - 'requester_id';
end $$;

-- ── 8. 참여자 모두: 확인 표시 (사람마다 따로 — 한 분의 동의가 다른 분 확인을 대신하지 않음) ──
create or replace function public.bizplan_check(p_key text, p_mark text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me jsonb := public.bizplan_me(); v_at timestamptz := clock_timestamp();
begin
  perform public.bizplan_require(false);
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9_.]{0,63}$' then
    raise exception '항목 이름이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_mark is not null and p_mark not in ('동의','수정 의견 있음','자료 확인 필요','추후 논의') then
    raise exception '확인 표시가 올바르지 않습니다.' using errcode = '22023';
  end if;
  perform public.bizplan_check_text(to_jsonb(coalesce(p_note, '')));
  if p_mark is null then
    delete from public.bizplan_checks where doc_id = 'newborn2026' and key = p_key and profile_id = auth.uid();
  else
    insert into public.bizplan_checks(doc_id, key, profile_id, mark, note, name, title, at)
    values ('newborn2026', p_key, auth.uid(), p_mark, left(coalesce(p_note, ''), 1000), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at)
    on conflict (doc_id, key, profile_id) do update
       set mark = excluded.mark, note = excluded.note, name = excluded.name, title = excluded.title, at = excluded.at;
  end if;
  insert into public.bizplan_check_log(doc_id, key, profile_id, name, mark, note, at)
  values ('newborn2026', p_key, auth.uid(), coalesce(me->>'name', ''), p_mark, left(coalesce(p_note, ''), 1000), v_at);
  return jsonb_build_object('ok', true, 'at', v_at);
end $$;

-- ── 9. 담당: 문서 상태 ───────────────────────────────────────────────────────
create or replace function public.bizplan_doc_set(p_status text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.bizplan_doc%rowtype; me jsonb := public.bizplan_me(); v_at timestamptz := clock_timestamp();
begin
  perform public.bizplan_require(true);
  if p_status not in ('초안 작성 중','공동 검토 중','수정 중','최종 검토') then
    --  「제출본 확정」은 버전 저장(제출본)으로만 됩니다
    raise exception '문서 상태가 올바르지 않습니다.' using errcode = '22023';
  end if;
  insert into public.bizplan_doc(id) values ('newborn2026') on conflict (id) do nothing;
  select * into d from public.bizplan_doc where id = 'newborn2026' for update;
  update public.bizplan_doc set status = p_status, updated_at = v_at, updated_by = coalesce(me->>'name', '') where id = d.id;
  insert into public.bizplan_revisions(doc_id, key, before_status, after_status, reason, version_label, actor_id, actor_name, actor_title, at)
  values (d.id, '_doc', d.status, p_status, left(coalesce(p_note, ''), 2000), d.version_label, auth.uid(),
          coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at);
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ── 10. 담당: 버전 저장 (제출본 확정 포함) — 그 순간 전체를 통째로 ─────────────────
create or replace function public.bizplan_version_create(p_label text, p_note text default '', p_submission boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.bizplan_doc%rowtype; me jsonb := public.bizplan_me(); v_at timestamptz := clock_timestamp();
        v_snap jsonb; v_id bigint; v_open int;
begin
  perform public.bizplan_require(true);
  if p_label is null or p_label !~ '^V[0-9]{1,2}\.[0-9]{1,2}$' then
    raise exception '버전 이름은 V0.1 · V1.0 처럼 적어 주세요.' using errcode = '22023';
  end if;
  insert into public.bizplan_doc(id) values ('newborn2026') on conflict (id) do nothing;
  select * into d from public.bizplan_doc where id = 'newborn2026' for update;
  if exists (select 1 from public.bizplan_versions where doc_id = d.id and label = p_label) then
    raise exception '이미 있는 버전 이름입니다 (%). 확정한 버전은 덮어쓰지 않습니다.', p_label using errcode = '22023';
  end if;
  if p_submission then
    select count(*) into v_open from public.bizplan_requests where doc_id = d.id and status in ('접수','검토 중');
    if v_open > 0 then
      raise exception '처리하지 않은 수정요청이 %건 있어 제출본으로 확정할 수 없습니다.', v_open using errcode = '22023';
    end if;
  end if;
  select coalesce(jsonb_object_agg(f.key, jsonb_build_object('value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev)), '{}'::jsonb)
    into v_snap from public.bizplan_fields f where f.doc_id = d.id;
  insert into public.bizplan_versions(doc_id, label, note, is_submission, snapshot, doc_status, created_by, created_at)
  values (d.id, p_label, left(coalesce(p_note, ''), 1000), coalesce(p_submission, false), v_snap,
          case when p_submission then '제출본 확정' else d.status end, coalesce(me->>'name', ''), v_at)
  returning id into v_id;
  update public.bizplan_doc
     set version_label = p_label,
         locked_label = case when p_submission then p_label else locked_label end,
         status = case when p_submission then '제출본 확정' else status end,
         updated_at = v_at, updated_by = coalesce(me->>'name', '')
   where id = d.id;
  insert into public.bizplan_revisions(doc_id, key, before_status, after_status, reason, version_label, actor_id, actor_name, actor_title, at)
  values (d.id, '_version', d.version_label, p_label,
          case when p_submission then '제출본 확정 · ' else '버전 저장 · ' end || left(coalesce(p_note, ''), 1000),
          p_label, auth.uid(), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at);
  return jsonb_build_object('ok', true, 'id', v_id, 'label', p_label);
end $$;

create or replace function public.bizplan_version_get(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.bizplan_versions%rowtype;
begin
  perform public.bizplan_require(false);
  select * into v from public.bizplan_versions where id = p_id;
  if v.id is null then raise exception '버전을 찾을 수 없습니다.' using errcode = '22023'; end if;
  return to_jsonb(v);
end $$;

-- ── 11. 기록 보기 — 항목 하나(p_key) 또는 문서 전체 최근 200줄 ─────────────────────
create or replace function public.bizplan_history(p_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.bizplan_require(false);
  return jsonb_build_object(
    'revisions', coalesce((select jsonb_agg(to_jsonb(x) - 'actor_id' order by x.at desc) from (
        select * from public.bizplan_revisions where doc_id = 'newborn2026' and (p_key is null or key = p_key)
        order by at desc limit 200) x), '[]'::jsonb),
    'request_log', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc) from (
        select l.* from public.bizplan_request_log l join public.bizplan_requests r on r.id = l.request_id
         where r.doc_id = 'newborn2026' and (p_key is null or r.key = p_key)
         order by l.at desc limit 200) l), '[]'::jsonb),
    'check_log', coalesce((select jsonb_agg(to_jsonb(c) - 'profile_id' order by c.at desc) from (
        select * from public.bizplan_check_log where doc_id = 'newborn2026' and (p_key is null or key = p_key)
        order by at desc limit 200) c), '[]'::jsonb)
  );
end $$;

-- ── 12. 참여자 관리 — 대표·관리자 또는 담당 ─────────────────────────────────────
create or replace function public.bizplan_members_list()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.bizplan_can_manage() then
    raise exception '참여자 관리는 대표·관리자 또는 사업계획 담당만 할 수 있습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'profile_id', m.profile_id, 'name', coalesce(p.name, ''), 'account_role', p.role, 'title', m.title,
        'role', m.member_role, 'active', m.active and p.active, 'added_by', m.added_by, 'added_at', m.added_at) order by m.added_at)
      from public.bizplan_members m join public.profiles p on p.id = m.profile_id), '[]'::jsonb),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('profile_id', p.id, 'name', coalesce(p.name, ''), 'account_role', p.role) order by p.name)
      from public.profiles p where p.active and p.role::text in ('admin','office')), '[]'::jsonb)
  );
end $$;

create or replace function public.bizplan_member_set(p_profile uuid, p_role text, p_title text default '', p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me jsonb := public.bizplan_me(); v_acc text; v_at timestamptz := clock_timestamp(); v_before text;
begin
  if not public.bizplan_can_manage() then
    raise exception '참여자 관리는 대표·관리자 또는 사업계획 담당만 할 수 있습니다.' using errcode = '42501';
  end if;
  if p_role not in ('editor','reviewer') then
    raise exception '역할은 담당(editor) 또는 검토(reviewer)입니다.' using errcode = '22023';
  end if;
  select role::text into v_acc from public.profiles where id = p_profile and active;
  if v_acc is null or v_acc not in ('admin','office') then
    --  현장 · 병원 계정은 참여자가 될 수 없습니다
    raise exception '대표·관리자 · 사무실 계정만 참여자로 등록할 수 있습니다.' using errcode = '22023';
  end if;
  select member_role || case when active then '' else '(꺼짐)' end into v_before from public.bizplan_members where profile_id = p_profile;
  insert into public.bizplan_members(profile_id, member_role, title, active, added_by, added_at, updated_at)
  values (p_profile, p_role, left(coalesce(p_title, ''), 30), coalesce(p_active, true), coalesce(me->>'name', ''), v_at, v_at)
  on conflict (profile_id) do update
     set member_role = excluded.member_role, title = excluded.title, active = excluded.active, updated_at = v_at;
  insert into public.bizplan_revisions(doc_id, key, before_status, after_status, reason, actor_id, actor_name, actor_title, at)
  values ('newborn2026', '_member', coalesce(v_before, ''), p_role || case when coalesce(p_active, true) then '' else '(꺼짐)' end,
          '참여자 ' || coalesce((select name from public.profiles where id = p_profile), '') || ' · ' || left(coalesce(p_title, ''), 30),
          auth.uid(), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at);
  return jsonb_build_object('ok', true);
end $$;

-- ── 13. 실행 권한 — 로그인한 사람만 부르고, 각 함수가 안에서 다시 확인합니다 ──────
do $$
declare fn text;
begin
  foreach fn in array array[
    'bizplan_my_role()', 'bizplan_can_manage()', 'bizplan_me()', 'bizplan_require(boolean)',
    'bizplan_open()', 'bizplan_save_field(text,jsonb,text,jsonb,text,integer,uuid)',
    'bizplan_request_create(text,text,text,text,text)', 'bizplan_request_update(uuid,text,text)',
    'bizplan_check(text,text,text)', 'bizplan_doc_set(text,text)',
    'bizplan_version_create(text,text,boolean)', 'bizplan_version_get(bigint)',
    'bizplan_history(text)', 'bizplan_members_list()', 'bizplan_member_set(uuid,text,text,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- ── 확인 한 줄 ────────────────────────────────────────────────────────────────
select '표 (9) ' || (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (
          'bizplan_members','bizplan_doc','bizplan_fields','bizplan_revisions','bizplan_requests',
          'bizplan_request_log','bizplan_checks','bizplan_check_log','bizplan_versions'))
    || ' · 함수 (14) ' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (
          'bizplan_my_role','bizplan_can_manage','bizplan_me','bizplan_require','bizplan_open','bizplan_save_field',
          'bizplan_request_create','bizplan_request_update','bizplan_check','bizplan_doc_set','bizplan_version_create',
          'bizplan_version_get','bizplan_history','bizplan_members_list','bizplan_member_set')
          and p.proname not in ('bizplan_require')) as "확인";
