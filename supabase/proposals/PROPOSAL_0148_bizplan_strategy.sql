-- ════════════════════════════════════════════════════════════════════════════
-- 0148 — 사업계획서 V3: 사업화전략 · 3개년 매출 검토 · 경영진 공동결정
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. **PROPOSAL_0146 → 0147 을 먼저** 실행해야 합니다.
--     지우는 것 없습니다. 새 표 5개와 함수만 더하고, 수정요청 표에 칸 2개를 더합니다.
--     여러 번 실행해도 됩니다. 판 번호(app_schema_version)는 바꾸지 않습니다.
--     기존 사업계획서 146개 항목 · 초안 · 확인 표시 · 요청 · 기록 · 버전은 건드리지 않습니다.
--
--  ── 무엇을 하나 ────────────────────────────────────────────────────────────────
--   1. 사업화전략 「모델 자료」(시나리오 · 가정 · 결정안 · 심사 질문 · 자금배분) — 문서마다 한 줄.
--      회사 숫자는 공개 저장소에 두지 않고 이 표에만 둡니다(참여자만 읽음 · 담당만 고침).
--      고칠 때마다 바꾸기 전 · 후가 기록으로 남습니다(지울 수 없음).
--      · rev       — 무엇이든 바뀌면 +1 (동시에 고치는 것 감지)
--      · assump_rev — 숫자 · 가정 · 결정안이 바뀔 때만 +1 (심사 질문 · 출처 · 문장 초안만 고치면 그대로)
--   2. 결정 — 대표님 · 이사님(검토 참여자)이 결정 항목마다 안을 고릅니다. **고른 것만** 저장합니다.
--      · 합의는 결정할 분(검토 참여자)이 2명 이상이고 모두 같은 안일 때만입니다.
--      · 고를 때 화면이 보고 있던 assump_rev 를 들고 와야 합니다. 그사이 숫자가 바뀌었으면 서버가
--        거절합니다(PT409 = HTTP 409). 보지 않은 숫자에 결정이 붙지 않게.
--      · 숫자가 바뀌면(assump_rev 가 오르면) 이전 결정은 지우지 않고 「재확인 필요」로 남습니다.
--      · 두 분의 안이 다르면 「의견 조율 필요」 — 합의로 세지 않습니다.
--   3. 반영 요청 — 담당이 **합의된 결정**으로 만든 칸 초안을 기존 수정요청으로 남깁니다.
--      · 사업계획서 본문은 바꾸지 않습니다. 담당이 요청함에서 비교하고 반영(또는 보류 · 반려)합니다.
--      · 합의되지 않은 결정에 기대는 칸은 서버가 거절합니다.
--      · 반영하면 기존 0147 규칙대로 그 칸의 확인 표시가 「재확인 필요」가 됩니다.
--   4. 실제 시스템 사용 건수(읽기만) — 수거 입력 · 기사 입력 시간 · 병원 요청 · 자재 주문을 달별로.
--      시연(demo) 기록은 빼고 셉니다. 생산성 근거를 「진술」에서 「기록」으로 보강하기 위한 것입니다.
--
--  끝에 한 줄로 「0148 · 표 5/5 · 칸 2/2 · 함수 7/7」이 나오면 됩니다.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.bizplan_fields') is null then
    raise exception '먼저 PROPOSAL_0146_bizplan.sql 을 실행해 주세요. 아무것도 바꾸지 않았습니다.';
  end if;
  if to_regprocedure('public.bizplan_preflight()') is null then
    raise exception '먼저 PROPOSAL_0147_bizplan_v2.sql 을 실행해 주세요. 아무것도 바꾸지 않았습니다.';
  end if;
end $$;

-- ── 1. 표 ────────────────────────────────────────────────────────────────────
create table if not exists public.bizplan_strategy (
  doc_id      text primary key references public.bizplan_doc(id),
  model       jsonb not null default '{}'::jsonb,
  rev         int not null default 0,
  assump_rev  int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

create table if not exists public.bizplan_strategy_revisions (
  id           bigserial primary key,
  doc_id       text not null,
  rev          int not null,
  assump_rev   int not null,
  sections     text[] not null default '{}',
  before_model jsonb,
  after_model  jsonb,
  reason       text not null default '',
  actor_id     uuid,
  actor_name   text not null default '',
  at           timestamptz not null default now()
);

--  지금 결정 — 사람마다 결정 항목마다 하나
create table if not exists public.bizplan_decisions (
  doc_id     text not null,
  dkey       text not null check (dkey ~ '^[a-z0-9_]{1,40}$'),
  profile_id uuid not null,
  choice     text not null check (char_length(choice) between 1 and 40),
  custom     jsonb,
  note       text not null default '' check (char_length(note) <= 2000),
  assump_rev int not null,
  basis      jsonb not null default '{}'::jsonb,
  name       text not null default '',
  title      text not null default '',
  at         timestamptz not null default now(),
  primary key (doc_id, dkey, profile_id)
);

create table if not exists public.bizplan_decision_log (
  id         bigserial primary key,
  doc_id     text not null,
  dkey       text not null,
  profile_id uuid,
  name       text not null default '',
  title      text not null default '',
  choice     text not null default '',
  custom     jsonb,
  note       text not null default '',
  assump_rev int,
  basis      jsonb,
  at         timestamptz not null default now()
);

--  단계 기록 — 모델 저장 · 반영 요청 등 (지울 수 없음)
create table if not exists public.bizplan_strategy_log (
  id         bigserial primary key,
  doc_id     text not null,
  step       text not null,
  assump_rev int,
  detail     jsonb not null default '{}'::jsonb,
  actor_id   uuid,
  actor_name text not null default '',
  at         timestamptz not null default now()
);

--  수정요청 — 구조가 있는 제안(표 · 칸 묶음)과 어디서 왔는지
alter table public.bizplan_requests add column if not exists suggested_value jsonb;
alter table public.bizplan_requests add column if not exists source text not null default '';

alter table public.bizplan_strategy           enable row level security;
alter table public.bizplan_strategy_revisions enable row level security;
alter table public.bizplan_decisions          enable row level security;
alter table public.bizplan_decision_log       enable row level security;
alter table public.bizplan_strategy_log       enable row level security;
revoke all on public.bizplan_strategy, public.bizplan_strategy_revisions, public.bizplan_decisions,
              public.bizplan_decision_log, public.bizplan_strategy_log from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['bizplan_strategy_revisions','bizplan_decision_log','bizplan_strategy_log'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_no_rewrite') then
      execute format('create trigger %I before update or delete on public.%I for each row execute function public.bizplan_no_rewrite()', t || '_no_rewrite', t);
    end if;
  end loop;
end $$;

-- ── 2. 도움 ──────────────────────────────────────────────────────────────────
--  숫자 · 가정이 아닌 부분 — 여기만 바뀌면 assump_rev 는 그대로(결정이 「재확인 필요」가 되지 않음)
create or replace function public.bizplan_strategy_content_keys()
returns text[] language sql immutable as $$ select array['qa','research','facts','labels','drafts']::text[] $$;

--  결정할 분 — 사업계획서 참여자 중 「검토」로 등록된 분(대표님 · 이사님)
create or replace function public.bizplan_deciders()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('profile_id', m.profile_id, 'name', coalesce(p.name, ''), 'title', m.title) order by m.added_at), '[]'::jsonb)
    from public.bizplan_members m join public.profiles p on p.id = m.profile_id
   where m.active and m.member_role = 'reviewer' and coalesce(p.active, true)
$$;

create or replace function public.bizplan_is_decider()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bizplan_members m join public.profiles p on p.id = m.profile_id
                  where m.profile_id = auth.uid() and m.active and m.member_role = 'reviewer' and coalesce(p.active, true))
$$;

--  결정 하나가 지금 합의되었는가 — 결정할 분(2명 이상) 모두가 지금 판(assump_rev)에서 같은 안(추후 결정 아님)
--  결정할 분이 1명뿐이면 합의로 세지 않습니다(한 분의 선택이 곧 합의가 되지 않게 — 대표님 · 이사님 두 분)
create or replace function public.bizplan_decision_agreed(p_doc text, p_key text, p_rev int)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare n_dec int; n_ok int; n_kind int;
begin
  select count(*) into n_dec from public.bizplan_members m join public.profiles p on p.id = m.profile_id
   where m.active and m.member_role = 'reviewer' and coalesce(p.active, true);
  if n_dec < 2 then return false; end if;
  select count(*), count(distinct d.choice || '|' || case when d.choice = 'custom' then coalesce(d.custom::text, '') else '' end)
    into n_ok, n_kind
    from public.bizplan_decisions d
    join public.bizplan_members m on m.profile_id = d.profile_id and m.active and m.member_role = 'reviewer'
   where d.doc_id = p_doc and d.dkey = p_key and d.assump_rev = p_rev and d.choice <> '추후 결정';
  return n_ok = n_dec and n_kind = 1;
end $$;

-- ── 3. 열기 ──────────────────────────────────────────────────────────────────
create or replace function public.bizplan_strategy_open()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc text := 'newborn2026'; s public.bizplan_strategy%rowtype; v_sub text; v_sign jsonb;
begin
  perform public.bizplan_require(false);
  insert into public.bizplan_doc(id) values (v_doc) on conflict (id) do nothing;
  select * into s from public.bizplan_strategy where doc_id = v_doc;
  --  접수월 — 제출 전 점검(0147)과 같은 규칙: 작성일 칸, 없으면 이번 달
  select value into v_sign from public.bizplan_fields where doc_id = v_doc and key = 'sign.date';
  v_sub := public.bizplan__ym_text(coalesce(public.bizplan__ym(public.bizplan__text(v_sign)),
                                            public.bizplan__ym(to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY.MM'))));
  return jsonb_build_object(
    'api', 148,
    'me', public.bizplan_me(),
    'is_decider', public.bizplan_is_decider(),
    'deciders', public.bizplan_deciders(),
    'preflight_month', v_sub,
    'strategy', case when s.doc_id is null or s.model = '{}'::jsonb then null else jsonb_build_object(
        'model', s.model, 'rev', s.rev, 'assump_rev', s.assump_rev, 'updated_at', s.updated_at, 'updated_by', s.updated_by) end,
    'decisions', coalesce((select jsonb_agg(jsonb_build_object(
        'key', d.dkey, 'profile_id', d.profile_id, 'name', d.name, 'title', d.title, 'choice', d.choice,
        'custom', d.custom, 'note', d.note, 'assump_rev', d.assump_rev, 'basis', d.basis, 'at', d.at) order by d.at)
      from public.bizplan_decisions d where d.doc_id = v_doc), '[]'::jsonb),
    'decision_log', coalesce((select jsonb_agg(x order by (x->>'id')::bigint desc) from (
        select jsonb_build_object('id', l.id, 'key', l.dkey, 'name', l.name, 'title', l.title, 'choice', l.choice,
               'custom', l.custom, 'note', l.note, 'assump_rev', l.assump_rev, 'basis', l.basis, 'at', l.at) x
          from public.bizplan_decision_log l where l.doc_id = v_doc order by l.id desc limit 300) q), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(x order by (x->>'id')::bigint desc) from (
        select jsonb_build_object('id', l.id, 'step', l.step, 'assump_rev', l.assump_rev, 'detail', l.detail,
               'actor_name', l.actor_name, 'at', l.at) x
          from public.bizplan_strategy_log l where l.doc_id = v_doc order by l.id desc limit 100) q), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(x order by (x->>'id')::bigint desc) from (
        select jsonb_build_object('id', r.id, 'rev', r.rev, 'assump_rev', r.assump_rev, 'sections', to_jsonb(r.sections),
               'reason', r.reason, 'actor_name', r.actor_name, 'at', r.at) x
          from public.bizplan_strategy_revisions r where r.doc_id = v_doc order by r.id desc limit 50) q), '[]'::jsonb)
  );
end $$;

--  기록 한 줄의 바꾸기 전 · 후 모델 (참여자만)
create or replace function public.bizplan_strategy_revision_get(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.bizplan_strategy_revisions%rowtype;
begin
  perform public.bizplan_require(false);
  select * into r from public.bizplan_strategy_revisions where id = p_id;
  if r.id is null then raise exception '기록을 찾을 수 없습니다.' using errcode = '22023'; end if;
  return to_jsonb(r) - 'actor_id';
end $$;

-- ── 4. 담당: 모델 저장 (판 번호로 충돌 감지 · 기록 한 줄) ──────────────────────────
create or replace function public.bizplan_strategy_save(p_model jsonb, p_expected_rev int, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc text := 'newborn2026'; s public.bizplan_strategy%rowtype; me jsonb := public.bizplan_me();
        v_at timestamptz := clock_timestamp(); ck text[] := public.bizplan_strategy_content_keys();
        v_assump boolean; v_sections text[]; v_stale int; v_old jsonb;
begin
  perform public.bizplan_require(true);
  if p_model is null or jsonb_typeof(p_model) <> 'object' or coalesce(p_model->>'version', '') <> '1' then
    raise exception '모델 자료 모양이 올바르지 않습니다 (version 1 인 객체).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_model->'decisions') is distinct from 'array' or jsonb_typeof(p_model->'scenarios') is distinct from 'object' then
    raise exception '모델 자료에 결정(decisions) · 시나리오(scenarios)가 있어야 합니다.' using errcode = '22023';
  end if;
  if octet_length(p_model::text) > 1500000 then
    raise exception '모델 자료가 너무 큽니다 (1.5MB 이하).' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 2 then
    raise exception '무엇을 왜 고쳤는지 적어 주세요.' using errcode = '22023';
  end if;
  perform public.bizplan_check_text(p_model);
  perform public.bizplan_check_text(to_jsonb(p_reason));

  insert into public.bizplan_doc(id) values (v_doc) on conflict (id) do nothing;
  insert into public.bizplan_strategy(doc_id) values (v_doc) on conflict (doc_id) do nothing;
  select * into s from public.bizplan_strategy where doc_id = v_doc for update;

  if s.rev <> coalesce(p_expected_rev, -1) then
    return jsonb_build_object('ok', false, 'conflict', true, 'rev', s.rev, 'assump_rev', s.assump_rev,
                              'model', s.model, 'updated_by', s.updated_by, 'updated_at', s.updated_at);
  end if;
  if s.model = p_model then
    return jsonb_build_object('ok', true, 'unchanged', true, 'rev', s.rev, 'assump_rev', s.assump_rev);
  end if;

  v_old := case when s.model = '{}'::jsonb then null else s.model end;
  v_assump := (s.model - ck) is distinct from (p_model - ck);
  select coalesce(array_agg(k order by k), '{}') into v_sections
    from (select jsonb_object_keys(s.model) k union select jsonb_object_keys(p_model)) q
   where s.model->k is distinct from p_model->k;

  update public.bizplan_strategy
     set model = p_model, rev = s.rev + 1, assump_rev = s.assump_rev + case when v_assump then 1 else 0 end,
         updated_at = v_at, updated_by = coalesce(me->>'name', '')
   where doc_id = v_doc
   returning * into s;
  insert into public.bizplan_strategy_revisions(doc_id, rev, assump_rev, sections, before_model, after_model, reason, actor_id, actor_name, at)
  values (v_doc, s.rev, s.assump_rev, v_sections, v_old, p_model, btrim(p_reason), auth.uid(), coalesce(me->>'name', ''), v_at);
  insert into public.bizplan_strategy_log(doc_id, step, assump_rev, detail, actor_id, actor_name, at)
  values (v_doc, '모델 저장', s.assump_rev,
          jsonb_build_object('rev', s.rev, 'sections', to_jsonb(v_sections), 'assumption_changed', v_assump, 'reason', btrim(p_reason)),
          auth.uid(), coalesce(me->>'name', ''), v_at);

  select count(*) into v_stale from public.bizplan_decisions where doc_id = v_doc and assump_rev < s.assump_rev;
  return jsonb_build_object('ok', true, 'rev', s.rev, 'assump_rev', s.assump_rev, 'assumption_changed', v_assump,
                            'sections', to_jsonb(v_sections), 'stale_decisions', v_stale);
end $$;

-- ── 5. 대표님 · 이사님: 결정 ───────────────────────────────────────────────────
create or replace function public.bizplan_decide(p_key text, p_choice text, p_custom jsonb, p_note text, p_assump_rev int, p_basis jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc text := 'newborn2026'; s public.bizplan_strategy%rowtype; me jsonb := public.bizplan_me();
        v_at timestamptz := clock_timestamp(); d jsonb; v_title text; row public.bizplan_decisions%rowtype;
begin
  perform public.bizplan_require(false);
  if not public.bizplan_is_decider() then
    raise exception '결정은 사업계획서 「검토」 참여자(대표님 · 이사님)만 남길 수 있습니다. 참여자 탭에서 등록해 주세요.' using errcode = '42501';
  end if;
  select * into s from public.bizplan_strategy where doc_id = v_doc;
  if s.doc_id is null or s.model = '{}'::jsonb then
    raise exception '사업화전략 자료가 아직 없습니다.' using errcode = '22023';
  end if;
  if p_assump_rev is distinct from s.assump_rev then
    --  40001 은 PostgREST 가 끝없이 다시 시도합니다(0147 과 같은 까닭) — HTTP 409 로
    raise exception '그사이 숫자 · 결정안이 바뀌었습니다(판 % → %). 새 내용을 확인한 뒤 다시 골라 주세요.',
      coalesce(p_assump_rev::text, '?'), s.assump_rev using errcode = 'PT409';
  end if;
  select x into d from jsonb_array_elements(s.model->'decisions') x where x->>'key' = p_key limit 1;
  if d is null then raise exception '결정 항목을 찾을 수 없습니다.' using errcode = '22023'; end if;
  if p_choice is null or not (
       p_choice = '추후 결정'
       or (p_choice = 'custom' and d ? 'custom')
       or exists (select 1 from jsonb_array_elements(d->'options') o where o->>'id' = p_choice)) then
    raise exception '고를 수 없는 안입니다.' using errcode = '22023';
  end if;
  if p_choice = 'custom' and (p_custom is null or p_custom = 'null'::jsonb or p_custom = '""'::jsonb or p_custom = '[]'::jsonb or p_custom = '{}'::jsonb) then
    raise exception '직접 입력 값을 적어 주세요.' using errcode = '22023';
  end if;
  if octet_length(coalesce(p_custom::text, '')) > 4000 or octet_length(coalesce(p_basis::text, '')) > 4000 then
    raise exception '입력이 너무 깁니다.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 2000 then raise exception '의견은 2,000자 이내로 적어 주세요.' using errcode = '22023'; end if;
  perform public.bizplan_check_text(to_jsonb(coalesce(p_note, '')));
  perform public.bizplan_check_text(p_custom);

  insert into public.bizplan_decisions(doc_id, dkey, profile_id, choice, custom, note, assump_rev, basis, name, title, at)
  values (v_doc, p_key, auth.uid(), p_choice, case when p_choice = 'custom' then p_custom end, coalesce(p_note, ''), s.assump_rev,
          coalesce(p_basis, '{}'::jsonb), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at)
  on conflict (doc_id, dkey, profile_id) do update
     set choice = excluded.choice, custom = excluded.custom, note = excluded.note, assump_rev = excluded.assump_rev,
         basis = excluded.basis, name = excluded.name, title = excluded.title, at = excluded.at
  returning * into row;
  insert into public.bizplan_decision_log(doc_id, dkey, profile_id, name, title, choice, custom, note, assump_rev, basis, at)
  values (v_doc, p_key, auth.uid(), row.name, row.title, row.choice, row.custom, row.note, row.assump_rev, row.basis, v_at);
  return jsonb_build_object('ok', true, 'agreed', public.bizplan_decision_agreed(v_doc, p_key, s.assump_rev),
    'decision', jsonb_build_object('key', row.dkey, 'profile_id', row.profile_id, 'name', row.name, 'title', row.title,
      'choice', row.choice, 'custom', row.custom, 'note', row.note, 'assump_rev', row.assump_rev, 'basis', row.basis, 'at', row.at));
end $$;

-- ── 6. 담당: 합의된 결정으로 만든 칸 초안 → 기존 수정요청 (본문은 바꾸지 않음) ───────────
--  p_items: [{key, label, req_type, body, suggestion, value, decisions:[결정 key…]}]
create or replace function public.bizplan_strategy_propose(p_assump_rev int, p_items jsonb, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc text := 'newborn2026'; s public.bizplan_strategy%rowtype; me jsonb := public.bizplan_me();
        v_at timestamptz := clock_timestamp(); it jsonb; dk text; r jsonb; v_out jsonb := '[]'::jsonb;
        v_bad text[] := '{}'; v_keys text[] := '{}'; v_type text; v_body text; v_agreed jsonb := '{}'::jsonb;
begin
  perform public.bizplan_require(true);
  select * into s from public.bizplan_strategy where doc_id = v_doc;
  if s.doc_id is null or s.model = '{}'::jsonb then
    raise exception '사업화전략 자료가 아직 없습니다.' using errcode = '22023';
  end if;
  if p_assump_rev is distinct from s.assump_rev then
    raise exception '그사이 숫자 · 결정안이 바뀌었습니다(판 % → %). 초안을 다시 만들어 주세요.',
      coalesce(p_assump_rev::text, '?'), s.assump_rev using errcode = 'PT409';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then
    raise exception '반영 요청할 칸을 1~40개 골라 주세요.' using errcode = '22023';
  end if;

  --  ① 모든 칸이 기대는 결정이 지금 합의되었는지 — 하나라도 아니면 아무것도 만들지 않음
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(it->>'key', '') !~ '^[a-z0-9][a-z0-9_.]{0,63}$' or (it->>'key') = any(public.bizplan_locked_keys()) then
      raise exception '반영할 수 없는 칸입니다: %', coalesce(it->>'key', '?') using errcode = '22023';
    end if;
    if (it->>'key') = any(v_keys) then raise exception '같은 칸이 두 번 있습니다: %', it->>'key' using errcode = '22023'; end if;
    v_keys := v_keys || (it->>'key');
    for dk in select jsonb_array_elements_text(coalesce(it->'decisions', '[]'::jsonb)) loop
      if not exists (select 1 from jsonb_array_elements(s.model->'decisions') x where x->>'key' = dk) then
        raise exception '모르는 결정 항목입니다: %', dk using errcode = '22023';
      end if;
      if not public.bizplan_decision_agreed(v_doc, dk, s.assump_rev) then
        v_bad := v_bad || coalesce((select x->>'title' from jsonb_array_elements(s.model->'decisions') x where x->>'key' = dk limit 1), dk);
      elsif not v_agreed ? dk then
        v_agreed := v_agreed || jsonb_build_object(dk, (select jsonb_build_object('choice', d.choice, 'custom', d.custom)
                                                          from public.bizplan_decisions d where d.doc_id = v_doc and d.dkey = dk and d.assump_rev = s.assump_rev limit 1));
      end if;
    end loop;
  end loop;
  if array_length(v_bad, 1) > 0 then
    raise exception '대표님 · 이사님 합의 전인 결정이 있어 반영 요청을 만들지 않았습니다: %',
      array_to_string(array(select distinct unnest(v_bad)), ' · ') using errcode = '22023';
  end if;

  --  ② 칸마다 기존 수정요청 하나 (bizplan_request_create 그대로 — 항목 상태는 「수정 요청 있음」)
  for it in select * from jsonb_array_elements(p_items) loop
    v_type := coalesce(nullif(it->>'req_type', ''), '숫자 변경');
    if v_type not in ('숫자 변경','문장 수정','내용 추가') then v_type := '숫자 변경'; end if;
    v_body := left('[사업화전략 검토 · 숫자 판 ' || s.assump_rev || '] ' || coalesce(nullif(btrim(it->>'body'), ''), '합의된 결정으로 계산한 초안입니다.')
                   || ' — 사업화 목표이며 계약 · 확정 매출이 아닙니다. 담당이 비교한 뒤 반영합니다.', 4000);
    perform public.bizplan_check_text(coalesce(it->'value', 'null'::jsonb));
    r := public.bizplan_request_create(it->>'key', coalesce(it->>'label', ''), v_type, v_body, left(coalesce(it->>'suggestion', ''), 20000));
    update public.bizplan_requests set suggested_value = it->'value', source = 'strategy' where id = (r->>'id')::uuid;
    v_out := v_out || jsonb_build_array(jsonb_build_object('key', it->>'key', 'request_id', r->>'id'));
  end loop;

  insert into public.bizplan_strategy_log(doc_id, step, assump_rev, detail, actor_id, actor_name, at)
  values (v_doc, '반영 요청', s.assump_rev,
          jsonb_build_object('items', v_out, 'decisions', v_agreed, 'note', left(coalesce(p_note, ''), 2000)),
          auth.uid(), coalesce(me->>'name', ''), v_at);
  return jsonb_build_object('ok', true, 'requests', v_out, 'assump_rev', s.assump_rev);
end $$;

-- ── 7. 실제 시스템 사용 건수 — 달별 (읽기만 · 시연 기록 제외) ─────────────────────
create or replace function public.bizplan_usage_stats(p_months int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from date; v jsonb;
begin
  perform public.bizplan_require(false);
  v_from := (date_trunc('month', (now() at time zone 'Asia/Seoul')) - make_interval(months => greatest(1, least(coalesce(p_months, 12), 36)) - 1))::date;
  with m as (
    select generate_series(v_from, date_trunc('month', (now() at time zone 'Asia/Seoul'))::date, interval '1 month')::date as mon
  ), ce as (
    select date_trunc('month', e.at at time zone 'Asia/Seoul')::date mon,
           count(*) n, count(*) filter (where e.actor_role = 'field') nf, count(distinct e.actor_id) people,
           round(avg(e.input_duration_ms) filter (where e.input_duration_ms between 1000 and 3600000) / 1000.0) sec,
           count(e.input_duration_ms) filter (where e.input_duration_ms between 1000 and 3600000) timed
      from public.collection_events e
     where e.action = '수거 완료' and not e.reverted and e.demo_session_id is null and e.at >= v_from
     group by 1
  ), cr as (
    select date_trunc('month', r.created_at at time zone 'Asia/Seoul')::date mon,
           count(*) filter (where r.source = 'portal') portal, count(*) filter (where r.source = 'staff') staff,
           count(*) filter (where r.status = '처리 완료') done
      from public.client_requests r
     where r.demo_session_id is null and r.created_at >= v_from
     group by 1
  ), po as (
    select date_trunc('month', o.requested_at at time zone 'Asia/Seoul')::date mon, count(*) n
      from public.product_orders o where o.requested_at >= v_from and o.canceled_at is null group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(m.mon, 'YYYY.MM'),
           'collections', coalesce(ce.n, 0), 'field_inputs', coalesce(ce.nf, 0), 'inputters', coalesce(ce.people, 0),
           'avg_input_sec', ce.sec, 'timed_inputs', coalesce(ce.timed, 0),
           'requests_portal', coalesce(cr.portal, 0), 'requests_staff', coalesce(cr.staff, 0), 'requests_done', coalesce(cr.done, 0),
           'supply_orders', coalesce(po.n, 0)) order by m.mon), '[]'::jsonb)
    into v
    from m left join ce on ce.mon = m.mon left join cr on cr.mon = m.mon left join po on po.mon = m.mon;
  return jsonb_build_object('from', to_char(v_from, 'YYYY.MM'), 'months', v,
    'note', '시연 기록 · 취소한 수거 · 취소한 주문은 뺐습니다. 입력 시간은 1초~1시간 사이로 잰 것만 평균');
end $$;

-- ── 8. 실행 권한 ─────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'bizplan_strategy_open()', 'bizplan_strategy_revision_get(bigint)', 'bizplan_strategy_save(jsonb,integer,text)',
    'bizplan_decide(text,text,jsonb,text,integer,jsonb)', 'bizplan_strategy_propose(integer,jsonb,text)',
    'bizplan_usage_stats(integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'bizplan_strategy_content_keys()', 'bizplan_deciders()', 'bizplan_is_decider()', 'bizplan_decision_agreed(text,text,integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
  end loop;
end $$;

-- ── 9. 확인 한 줄 ─────────────────────────────────────────────────────────────
select '0148 · 표 ' || (select count(*) from unnest(array['bizplan_strategy','bizplan_strategy_revisions','bizplan_decisions',
          'bizplan_decision_log','bizplan_strategy_log']) t where to_regclass('public.' || t) is not null) || '/5'
    || ' · 칸 ' || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'bizplan_requests'
          and column_name in ('suggested_value','source')) || '/2'
    || ' · 함수 ' || (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('bizplan_strategy_open','bizplan_strategy_revision_get','bizplan_strategy_save',
             'bizplan_decide','bizplan_strategy_propose','bizplan_usage_stats','bizplan_decision_agreed')) || '/7' as "확인";
