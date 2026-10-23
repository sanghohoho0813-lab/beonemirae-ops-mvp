-- ════════════════════════════════════════════════════════════════════════════
-- 0147 — 사업계획서 V2: 확인 표시를 「그때 내용」에 묶기 · 제출본 확정 전 점검 · 참여자 관리는 대표만
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다. **PROPOSAL_0146 을 먼저** 실행해야 합니다.
--     지우는 것 없습니다. 기존 표에 칸(column)만 더하고, 함수를 새 내용으로 바꿉니다.
--     여러 번 실행해도 됩니다. 판 번호(app_schema_version)는 바꾸지 않습니다.
--
--  ── 1. 확인 표시(동의 등)를 그 순간의 문장과 묶습니다 ─────────────────────────
--   예) 구독료 10,000원에 이사님 「동의」 → 담당이 12,000원으로 고침
--       → 이사님 동의는 **10,000원 문장에 대한 동의**로 그대로 남고(지우지 않음),
--         지금 문장은 「재확인 필요」가 됩니다. 이사님이 새 문장을 보고 다시 「동의」하면
--         그것은 **새 문장(판)에 대한 동의**로 따로 남습니다.
--    · 항목마다 「내용 판 번호(content_rev)」 — 내용(value)이 바뀔 때만 1씩 오릅니다
--      (상태 · 근거 · 요청 접수로는 오르지 않음).
--    · 확인 표시마다 그때의 판 번호와 **그때 문장(value_snapshot)** 을 함께 저장합니다.
--    · 확인 표시는 「지금 화면에 보이는 판 번호」를 들고 와야 저장됩니다 — 그사이 담당이
--      고쳤으면 서버가 거절하고(PT409 = HTTP 409), 화면이 새 내용을 보여 줍니다. 보지 않은 문장에
--      동의가 붙지 않게.
--    · 내용을 고치는 저장은 「최종 확인 완료」를 그대로 둘 수 없습니다 → 「수정 반영 완료」.
--    · 이미 있던 확인 기록은 기록(bizplan_revisions)의 시각으로 그때 판 번호와 문장을
--      되찾아 채웁니다(아래 4). 지우거나 고치는 기록은 없습니다.
--
--  ── 2. 제출본 확정 전 점검 (bizplan_preflight · bizplan_submit) ───────────────
--   차단(고치기 전에는 확정 불가): 필수 칸 누락 · 처리 전 수정요청 · 자금소요(A) ≠ 조달(B)
--   확인(사유를 적고 예외 승인하면 확정 가능): 재확인 필요 · 최종 확인 전 재무 숫자 · 중요 계획 ·
--     미확인 근거 · 추정/계획인데 표시 없음 · 미정/추후/예시 등 · 작성기간 불일치 ·
--     매출 숫자 불일치 · 해당 시 작성 칸 비어 있음
--   안내: 제출 직전 원본 서식에 직접 적는 칸(주민번호 · 계좌 · 서명 등) · 작성일
--   제출본은 bizplan_submit 으로만 확정합니다. 점검 결과 · 예외 사유 · 승인자가 버전에 함께 남습니다.
--
--  ── 3. 참여자 등록 · 변경은 대표·관리자(admin)만 ────────────────────────────────
--   담당(editor)은 문서를 고치고 요청을 처리하지만, 누가 볼 수 있는지는 정하지 못합니다(최소 권한).
--
--  ── 4. 관련 설문 응답 보기 (bizplan_survey) ──────────────────────────────────
--   사업계획서 참여자만, 뉴본펭귄 사전 설문(0144 · 0145)의 답지를 **읽기만** 합니다.
--   설문 표가 없으면 null — 사업계획서는 그대로 씁니다.
--
--  끝에 한 줄로 「0147 · 칸 7/7 · 함수 6/6 · 확인 표시 N건 판 번호 채움」이 나오면 됩니다.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.bizplan_fields') is null then
    raise exception '먼저 PROPOSAL_0146_bizplan.sql 을 실행해 주세요. 아무것도 바꾸지 않았습니다.';
  end if;
end $$;

-- ── 1. 칸 더하기 (지우는 것 없음) ──────────────────────────────────────────────
alter table public.bizplan_fields    add column if not exists content_rev int not null default 0;
alter table public.bizplan_checks    add column if not exists content_rev int;
alter table public.bizplan_checks    add column if not exists value_snapshot jsonb;
alter table public.bizplan_check_log add column if not exists content_rev int;
alter table public.bizplan_check_log add column if not exists value_snapshot jsonb;
alter table public.bizplan_versions  add column if not exists preflight jsonb;
alter table public.bizplan_versions  add column if not exists override_reason text not null default '';
alter table public.bizplan_versions  add column if not exists approved_by text not null default '';

-- ── 2. 도움 함수 ─────────────────────────────────────────────────────────────

--  어느 시각의 「내용 판 번호」 — 그 시각까지 내용이 바뀐 기록 수
create or replace function public.bizplan_content_rev_at(p_doc text, p_key text, p_at timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bizplan_revisions r
   where r.doc_id = p_doc and r.key = p_key and r.at <= p_at
     and r.before_value is distinct from r.after_value
$$;

--  어느 시각의 문장 — 그 시각까지 마지막으로 바뀐 내용 (없으면 빈 칸)
create or replace function public.bizplan_value_at(p_doc text, p_key text, p_at timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select r.after_value from public.bizplan_revisions r
                    where r.doc_id = p_doc and r.key = p_key and r.at <= p_at
                      and r.before_value is distinct from r.after_value
                    order by r.at desc, r.id desc limit 1), '""'::jsonb)
$$;

--  값 → 글 (글 · 표 · 칸 묶음 모두)
create or replace function public.bizplan__text(v jsonb)
returns text language sql immutable as $$
  select coalesce(case
    when v is null then ''
    when jsonb_typeof(v) = 'string' then v #>> '{}'
    else (select string_agg(x #>> '{}', ' ') from jsonb_path_query(v, 'strict $.**') x where jsonb_typeof(x) in ('string','number'))
  end, '')
$$;
create or replace function public.bizplan__blank(v jsonb)
returns boolean language sql immutable as $$ select btrim(public.bizplan__text(v)) = '' $$;

--  글의 첫 숫자 — 「1,200」 · 「약 120」 · 「120 (예상)」 (화면의 numOf 와 같은 규칙)
create or replace function public.bizplan__num(t text)
returns numeric language sql immutable as $$
  select (regexp_match(replace(coalesce(t, ''), ',', ''), '(-?[0-9]+(?:\.[0-9]+)?)'))[1]::numeric
$$;
--  표의 한 열 합계 (읽히는 숫자가 하나도 없으면 null)
create or replace function public.bizplan__colsum(v jsonb, p_col text)
returns numeric language sql immutable as $$
  select sum(public.bizplan__num(e ->> p_col))
    from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) e
$$;
--  「2026.12」 · 「’26.12」 · 「26년 12월」 → 달 번호(연*12 + 월-1). 못 읽으면 null
create or replace function public.bizplan__ym(t text)
returns int language plpgsql immutable as $$
declare m text[]; y int; mo int;
begin
  m := regexp_match(coalesce(t, ''), '(20[0-9]{2}|[0-9]{2})\s*[.\-/년]\s*([0-9]{1,2})');
  if m is null then return null; end if;
  y := m[1]::int; if y < 100 then y := 2000 + y; end if;
  mo := m[2]::int; if mo < 1 or mo > 12 then return null; end if;
  return y * 12 + mo - 1;
end $$;
create or replace function public.bizplan__ym_text(n int)
returns text language sql immutable as $$ select case when n is null then '' else (n / 12)::text || '.' || lpad((n % 12 + 1)::text, 2, '0') end $$;

-- ── 3. 점검 규칙 — 원본 서식 · 신보 작성 안내 기준 (회사 내용 없음, 칸 이름만) ────────
--   required    : 비어 있으면 제출본 확정 **차단**
--   recommended : 해당 시 작성 — 비어 있으면 「해당 없음」인지 확인(예외 승인 가능)
--   optional    : 비어 있어도 안내 없음 (팩스 · 홈페이지 · 생산방식 · 추가 대표자 서식)
--   finance     : 재무 · 인원 숫자 — 「최종 확인 완료」 전이면 확인
--   plan        : 중요한 사업계획 문장 — 「최종 확인 완료」 전이면 확인
--   annex       : 별첨(리틀펭귄 · 퍼스트펭귄 · Pre-ICON 보증용) — 대상 보증일 때만
create or replace function public.bizplan_rules()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'required', jsonb_build_array(
      'cover.company','cover.ceo','sign.company','sign.ceo',
      's1.company','s1.ceo','s1.founded','s1.industry','s1.hq_addr','s1.hq_tel','s1.employees','s1.form',
      's2.ceo_name','s2.ceo_edu','s2.ceo_career',
      's3.site_addr','s3.site_owner','s3.site_lease',
      's4.sellers','s4.recent_sales',
      's9.working','s9.funding',
      's10.bank','s10.holder',
      's11.mgmt.background','s11.mgmt.ceo','s11.mgmt.philosophy',
      's11.prod.bm_a','s11.prod.core_a','s11.prod.dev_a','s11.prod.growth_a',
      's11.market.target','s11.market.compete',
      's11.tech.core_a','s11.tech.rnd','s11.tech.diff',
      's11.plan.commercial','s11.plan.y1','s11.plan.y1_note','s11.plan.sum_annual'),
    'recommended', jsonb_build_array(
      's1.site_addr','s1.site_tel','s1.email','s1.history',
      's2.mgmt','s2.holders',
      's3.operation','s3.facilities','s3.staff',
      's4.buyers','s4.receivable','s4.payable','s4.sale_terms','s4.buy_terms','s4.orders',
      's5.ip','s6.devstaff','s7.rnd_org',
      's8.loans_asof','s8.loans','s8.collateral_asof','s8.collateral',
      's9.facility',
      's11.mgmt.cto','s11.mgmt.member',
      's11.prod.bm_b','s11.prod.bm_c','s11.prod.core_b','s11.prod.core_c','s11.prod.dev_b','s11.prod.dev_c',
      's11.prod.growth_b','s11.prod.growth_c','s11.tech.core_b','s11.tech.core_c',
      's11.plan.y2','s11.plan.y2_note','s11.plan.y3','s11.plan.y3_note','s11.plan.sum_limit'),
    'finance', jsonb_build_array(
      's1.employees','s3.staff','s4.recent_sales','s4.receivable','s4.payable','s6.devstaff',
      's8.loans','s8.collateral','s9.working','s9.facility','s9.funding',
      's11.plan.y1','s11.plan.y2','s11.plan.y3','s11.plan.sum_limit','s11.plan.sum_annual',
      'a.sales_total','a.sales_items','a.jobs','a.funds','a.cash'),
    'plan', jsonb_build_array(
      's11.mgmt.background','s11.prod.bm_a','s11.prod.bm_b','s11.prod.bm_c',
      's11.prod.growth_a','s11.prod.growth_b','s11.prod.growth_c','s11.tech.rnd',
      's11.plan.commercial','s11.plan.y1_note','s11.plan.y2_note','s11.plan.y3_note',
      'a.sales_basis','a.funds_plan','a.funds_source'),
    'annex', jsonb_build_array(
      'a.periods','a.sales_total','a.sales_items','a.sales_basis','a.jobs',
      'a.funds_period','a.funds','a.funds_plan','a.funds_source'),
    'by_hand', jsonb_build_array('sign.date','sign.writer')
  )
$$;

-- ── 4. 이미 있던 기록에 판 번호 채우기 (한 번 더 실행해도 같은 결과) ──────────────
create or replace function public.bizplan_backfill_0147()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  --  항목 — 내용이 바뀐 기록 수 = 내용 판 번호
  update public.bizplan_fields f
     set content_rev = x.cnt
    from (select doc_id, key, count(*)::int cnt from public.bizplan_revisions
           where before_value is distinct from after_value group by doc_id, key) x
   where x.doc_id = f.doc_id and x.key = f.key and f.content_rev <> x.cnt;
  --  확인 표시 — 표시한 시각의 판 번호 · 문장
  update public.bizplan_checks c
     set content_rev = public.bizplan_content_rev_at(c.doc_id, c.key, c.at),
         value_snapshot = public.bizplan_value_at(c.doc_id, c.key, c.at)
   where c.content_rev is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.bizplan_backfill_0147() from public, anon, authenticated;

-- ── 5. 참여자 관리는 대표·관리자만 (담당은 문서만) ───────────────────────────────
create or replace function public.bizplan_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role()::text = 'admin', false)
$$;

-- ── 6. 열기 — 내용 판 번호 · 확인 표시의 판 번호와 그때 문장 · 점검 규칙 ────────────
create or replace function public.bizplan_open()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc public.bizplan_doc%rowtype;
begin
  perform public.bizplan_require(false);
  insert into public.bizplan_doc(id) values ('newborn2026') on conflict (id) do nothing;
  select * into v_doc from public.bizplan_doc where id = 'newborn2026';
  return jsonb_build_object(
    'api', 147,
    'me', public.bizplan_me(),
    'can_manage', public.bizplan_can_manage(),
    'locked_keys', to_jsonb(public.bizplan_locked_keys()),
    'rules', public.bizplan_rules(),
    'doc', to_jsonb(v_doc),
    'fields', coalesce((select jsonb_agg(jsonb_build_object(
        'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev,
        'content_rev', f.content_rev, 'updated_at', f.updated_at, 'updated_by', f.updated_by) order by f.key)
      from public.bizplan_fields f where f.doc_id = v_doc.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg((to_jsonb(r) - 'requester_id') || jsonb_build_object('mine', r.requester_id = auth.uid()) order by r.created_at desc)
      from public.bizplan_requests r where r.doc_id = v_doc.id), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object(
        'key', c.key, 'profile_id', c.profile_id, 'mark', c.mark, 'note', c.note,
        'name', c.name, 'title', c.title, 'at', c.at,
        'content_rev', coalesce(c.content_rev, public.bizplan_content_rev_at(c.doc_id, c.key, c.at)),
        'value_snapshot', coalesce(c.value_snapshot, public.bizplan_value_at(c.doc_id, c.key, c.at))) order by c.at)
      from public.bizplan_checks c where c.doc_id = v_doc.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'profile_id', m.profile_id, 'name', coalesce(p.name, ''), 'title', m.title, 'role', m.member_role) order by m.added_at)
      from public.bizplan_members m join public.profiles p on p.id = m.profile_id
      where m.active and p.active), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'label', v.label, 'note', v.note, 'is_submission', v.is_submission,
        'doc_status', v.doc_status, 'created_by', v.created_by, 'created_at', v.created_at,
        'override_reason', v.override_reason, 'approved_by', v.approved_by) order by v.created_at desc)
      from public.bizplan_versions v where v.doc_id = v_doc.id), '[]'::jsonb)
  );
end $$;

-- ── 7. 담당: 항목 저장 — 내용이 바뀌면 판 번호 +1 · 「최종 확인 완료」 유지 불가 ──────────
create or replace function public.bizplan_save_field(
  p_key text, p_value jsonb, p_status text, p_basis jsonb, p_reason text,
  p_expected_rev int, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_doc public.bizplan_doc%rowtype; f public.bizplan_fields%rowtype; me jsonb := public.bizplan_me();
  v_at timestamptz := clock_timestamp(); v_rev_id bigint; v_req public.bizplan_requests%rowtype;
  v_status text; v_value jsonb; v_basis jsonb; v_changed boolean; v_stale int := 0; v_reason text;
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
      'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev, 'content_rev', f.content_rev,
      'updated_at', f.updated_at, 'updated_by', f.updated_by));
  end if;

  v_status  := coalesce(p_status, f.status);
  v_value   := coalesce(p_value, f.value);
  v_basis   := coalesce(p_basis, f.basis);
  v_changed := v_value is distinct from f.value;
  v_reason  := left(coalesce(p_reason, ''), 2000);
  --  내용을 고치면서 「최종 확인 완료」를 그대로 둘 수는 없습니다 — 고친 문장은 다시 확인받아야 합니다
  if v_changed and v_status = '최종 확인 완료' then
    v_status := '수정 반영 완료';
    v_reason := left(v_reason || case when v_reason = '' then '' else ' · ' end || '내용이 바뀌어 최종 확인을 다시 받아야 합니다', 2000);
  end if;
  if v_status = '최종 확인 완료' and exists (
      select 1 from public.bizplan_requests r where r.doc_id = v_doc.id and r.key = p_key and r.status in ('접수','검토 중')
        and (p_request_id is null or r.id <> p_request_id)) then
    raise exception '처리하지 않은 수정요청이 있어 「최종 확인 완료」로 바꿀 수 없습니다.' using errcode = '22023';
  end if;
  if not v_changed and v_status = f.status and v_basis = f.basis then
    return jsonb_build_object('ok', true, 'unchanged', true, 'field', jsonb_build_object(
      'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev, 'content_rev', f.content_rev,
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
         content_rev = f.content_rev + case when v_changed then 1 else 0 end,
         updated_at = v_at, updated_by = coalesce(me->>'name', '')
   where doc_id = v_doc.id and key = p_key;

  insert into public.bizplan_revisions(doc_id, key, before_value, after_value, before_status, after_status,
                                       before_basis, after_basis, reason, request_id, version_label, actor_id, actor_name, actor_title, at)
  values (v_doc.id, p_key, f.value, v_value, f.status, v_status, f.basis, v_basis, v_reason,
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
         status = case when status = '제출본 확정' then '수정 중' else status end
   where id = v_doc.id;

  --  이 문장에 붙어 있던 확인 표시 — 지우지 않습니다. 이제 「변경 전 내용에 대한 표시」가 됩니다
  if v_changed then
    select count(*) into v_stale from public.bizplan_checks c
     where c.doc_id = v_doc.id and c.key = p_key and coalesce(c.content_rev, -1) < f.content_rev + 1;
  end if;

  select * into f from public.bizplan_fields where doc_id = v_doc.id and key = p_key;
  return jsonb_build_object('ok', true, 'revision', v_rev_id, 'stale_checks', v_stale, 'field', jsonb_build_object(
    'key', f.key, 'value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev, 'content_rev', f.content_rev,
    'updated_at', f.updated_at, 'updated_by', f.updated_by));
end $$;

-- ── 8. 확인 표시 — 「내가 본 판 번호」와 함께. 그사이 바뀌었으면 거절 ─────────────────
create or replace function public.bizplan_check(p_key text, p_mark text, p_note text, p_content_rev int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me jsonb := public.bizplan_me(); v_at timestamptz := clock_timestamp(); f public.bizplan_fields%rowtype;
begin
  perform public.bizplan_require(false);
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9_.]{0,63}$' then
    raise exception '항목 이름이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_mark is not null and p_mark not in ('동의','수정 의견 있음','자료 확인 필요','추후 논의') then
    raise exception '확인 표시가 올바르지 않습니다.' using errcode = '22023';
  end if;
  perform public.bizplan_check_text(to_jsonb(coalesce(p_note, '')));
  insert into public.bizplan_doc(id) values ('newborn2026') on conflict (id) do nothing;
  insert into public.bizplan_fields(doc_id, key) values ('newborn2026', p_key) on conflict do nothing;
  select * into f from public.bizplan_fields where doc_id = 'newborn2026' and key = p_key for share;
  --  ⚠ 40001(serialization_failure)을 쓰면 PostgREST 가 트랜잭션을 끝없이 다시 시도합니다(실제로 멈춤 확인).
  --    PostgREST 가 HTTP 상태로 바꿔 주는 PT409 를 씁니다.
  if p_content_rev is null or p_content_rev <> f.content_rev then
    raise exception '그사이 이 항목의 내용이 바뀌었습니다(판 % → %). 새 내용을 확인한 뒤 다시 표시해 주세요.',
      coalesce(p_content_rev::text, '?'), f.content_rev using errcode = 'PT409';
  end if;
  if p_mark is null then
    delete from public.bizplan_checks where doc_id = 'newborn2026' and key = p_key and profile_id = auth.uid();
  else
    insert into public.bizplan_checks(doc_id, key, profile_id, mark, note, name, title, at, content_rev, value_snapshot)
    values ('newborn2026', p_key, auth.uid(), p_mark, left(coalesce(p_note, ''), 1000), coalesce(me->>'name', ''),
            coalesce(me->>'title', ''), v_at, f.content_rev, f.value)
    on conflict (doc_id, key, profile_id) do update
       set mark = excluded.mark, note = excluded.note, name = excluded.name, title = excluded.title, at = excluded.at,
           content_rev = excluded.content_rev, value_snapshot = excluded.value_snapshot;
  end if;
  --  기록 — 이전 표시(다른 판에 대한 동의 등)는 여기에 그대로 남아 있습니다
  insert into public.bizplan_check_log(doc_id, key, profile_id, name, mark, note, at, content_rev, value_snapshot)
  values ('newborn2026', p_key, auth.uid(), coalesce(me->>'name', ''), p_mark, left(coalesce(p_note, ''), 1000), v_at,
          f.content_rev, f.value);
  return jsonb_build_object('ok', true, 'at', v_at, 'content_rev', f.content_rev);
end $$;

--  예전 모양(판 번호 없음) — 어느 문장에 대한 표시인지 알 수 없어 받지 않습니다
create or replace function public.bizplan_check(p_key text, p_mark text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.bizplan_require(false);
  raise exception '앱을 새로 고쳐 주세요 — 확인 표시는 지금 보이는 내용의 판 번호와 함께 저장합니다.' using errcode = '22023';
end $$;

-- ── 9. 기록 — 확인 기록에 판 번호 · 그때 문장 ────────────────────────────────────
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
    'check_log', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'name', c.name, 'mark', c.mark, 'note', c.note, 'at', c.at,
        'content_rev', coalesce(c.content_rev, public.bizplan_content_rev_at(c.doc_id, c.key, c.at)),
        'value_snapshot', case when p_key is null then null
                               else coalesce(c.value_snapshot, public.bizplan_value_at(c.doc_id, c.key, c.at)) end) order by c.at desc)
      from (select * from public.bizplan_check_log where doc_id = 'newborn2026' and (p_key is null or key = p_key)
             order by at desc limit 200) c), '[]'::jsonb)
  );
end $$;

-- ── 10. 제출본 확정 전 점검 ─────────────────────────────────────────────────────
create or replace function public.bizplan_preflight()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rules jsonb := public.bizplan_rules();
  items jsonb := '[]'::jsonb;
  f record; t text; k text; n int; v_sub int; v_y1 int; v_m0 int;
  a_sum numeric; b_sum numeric; v_guar numeric; v_loan numeric; v_annex_any boolean;
  y_plan numeric; y_total numeric; y_items numeric;
  fv jsonb := '{}'::jsonb;   -- key → {value, status, basis, content_rev}
begin
  perform public.bizplan_require(false);
  select coalesce(jsonb_object_agg(x.key, jsonb_build_object('value', x.value, 'status', x.status, 'basis', x.basis, 'content_rev', x.content_rev)), '{}'::jsonb)
    into fv from public.bizplan_fields x where x.doc_id = 'newborn2026';

  --  ① 처리 전 수정요청 — 차단
  for f in select r.key, r.req_type, r.requester_name from public.bizplan_requests r
            where r.doc_id = 'newborn2026' and r.status in ('접수','검토 중') order by r.created_at loop
    items := items || jsonb_build_object('level', 'block', 'code', 'open_request', 'key', f.key,
      'msg', '처리 전 수정요청 (' || f.req_type || ' · ' || f.requester_name || ')');
  end loop;

  --  ② 필수 칸 누락 — 차단
  for k in select jsonb_array_elements_text(rules->'required') loop
    if public.bizplan__blank(fv->k->'value') then
      items := items || jsonb_build_object('level', 'block', 'code', 'required_blank', 'key', k, 'msg', '필수 칸이 비어 있습니다');
    end if;
  end loop;

  --  ③ 자금소요(A) = 조달(B) — 원본 서식의 약속. 다르면 차단
  a_sum := coalesce(public.bizplan__colsum(fv->'s9.working'->'value', 'amount'), 0)
         + coalesce(public.bizplan__colsum(fv->'s9.facility'->'value', 'amount'), 0);
  b_sum := coalesce(public.bizplan__num(fv->'s9.funding'->'value'->>'own'), 0)
         + coalesce(public.bizplan__num(fv->'s9.funding'->'value'->>'loan'), 0)
         + coalesce(public.bizplan__num(fv->'s9.funding'->'value'->>'etc'), 0);
  if a_sum > 0 and b_sum > 0 and a_sum <> b_sum then
    items := items || jsonb_build_object('level', 'block', 'code', 'funding_mismatch', 'key', 's9.funding',
      'msg', '자금소요 합계(A) ' || a_sum || ' ≠ 조달 합계(B) ' || b_sum || ' (백만원) — 원본 서식은 (A)=(B)');
  elsif (a_sum > 0) <> (b_sum > 0) and not (public.bizplan__blank(fv->'s9.working'->'value') and public.bizplan__blank(fv->'s9.funding'->'value')) then
    items := items || jsonb_build_object('level', 'block', 'code', 'funding_mismatch', 'key', 's9.funding',
      'msg', '자금소요(A) 또는 조달(B) 금액을 숫자로 읽을 수 없습니다 — 두 합계가 같아야 합니다');
  end if;
  v_guar := public.bizplan__num(fv->'s9.funding'->'value'->>'guarantee');
  v_loan := public.bizplan__num(fv->'s9.funding'->'value'->>'loan');
  if v_guar is not null and coalesce(v_loan, 0) < v_guar then
    items := items || jsonb_build_object('level', 'warn', 'code', 'funding_guarantee', 'key', 's9.funding',
      'msg', '보증신청 금액(' || v_guar || ')이 금융차입(' || coalesce(v_loan::text, '없음') || ')보다 큽니다 — 보증신청분은 금융차입에 포함');
  end if;
  if public.bizplan__colsum(fv->'a.funds'->'value', 'amount') is not null and a_sum > 0
     and public.bizplan__colsum(fv->'a.funds'->'value', 'amount') <> a_sum then
    items := items || jsonb_build_object('level', 'warn', 'code', 'funds_annex_mismatch', 'key', 'a.funds',
      'msg', '별첨 1차년도 소요자금 합계 ' || public.bizplan__colsum(fv->'a.funds'->'value', 'amount') || ' ≠ 9번 자금소요 합계 ' || a_sum);
  end if;

  --  ④ 매출 숫자 — 11번 매출전망 · 별첨 추정매출액 · 품목별 합계가 같은지
  for n in 1..3 loop
    y_plan  := public.bizplan__colsum(fv->('s11.plan.y' || n)->'value', 'amount');
    y_total := public.bizplan__num(fv->'a.sales_total'->'value'->>('y' || n));
    y_items := public.bizplan__colsum(fv->'a.sales_items'->'value', 'y' || n);
    if (y_plan is not null and y_total is not null and y_plan <> y_total)
       or (y_total is not null and y_items is not null and y_total <> y_items)
       or (y_plan is not null and y_total is null and y_items is not null and y_plan <> y_items) then
      items := items || jsonb_build_object('level', 'warn', 'code', 'revenue_mismatch', 'key', 'a.sales_total',
        'msg', n || '차년도 매출 숫자가 서로 다릅니다 — 11번 ' || coalesce(y_plan::text, '—') || ' · 별첨 추정매출액 ' ||
               coalesce(y_total::text, '—') || ' · 품목별 합계 ' || coalesce(y_items::text, '—'));
    end if;
  end loop;

  --  ⑤ 작성기간 — 1차년도는 신청 접수월 다음 달부터 1년 (작성일 · 없으면 오늘 기준)
  v_sub := coalesce(public.bizplan__ym(public.bizplan__text(fv->'sign.date'->'value')),
                    public.bizplan__ym(to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY.MM')));
  v_y1 := public.bizplan__ym(fv->'a.periods'->'value'->>'y1');
  if not public.bizplan__blank(fv->'a.periods'->'value') then
    if v_y1 is null then
      items := items || jsonb_build_object('level', 'warn', 'code', 'period_mismatch', 'key', 'a.periods',
        'msg', '1차년도 기간을 읽을 수 없습니다 — 「2026.12 ~ 2027.11」처럼');
    elsif v_y1 <> v_sub + 1 then
      items := items || jsonb_build_object('level', 'warn', 'code', 'period_mismatch', 'key', 'a.periods',
        'msg', '1차년도 시작 ' || public.bizplan__ym_text(v_y1) || ' — 접수월(' || public.bizplan__ym_text(v_sub) ||
               ') 다음 달 ' || public.bizplan__ym_text(v_sub + 1) || ' 이어야 합니다');
    end if;
  end if;
  v_m0 := public.bizplan__ym(fv->'a.cash_months'->'value'->>'m0');
  if v_m0 is not null and v_m0 <> coalesce(v_y1, v_sub + 1) then
    items := items || jsonb_build_object('level', 'warn', 'code', 'period_mismatch', 'key', 'a.cash_months',
      'msg', '현금 유출입 첫 달 ' || public.bizplan__ym_text(v_m0) || ' — 1차년도 시작 ' || public.bizplan__ym_text(coalesce(v_y1, v_sub + 1)) || ' 과 맞춰 주세요');
  end if;

  --  ⑥ 칸마다 — 재확인 · 재무 숫자 · 중요 계획 · 근거 · 추정 표시 · 남은 표시 · 확인 필요
  for f in select x.key, x.value, x.status, x.basis, x.content_rev from public.bizplan_fields x
            where x.doc_id = 'newborn2026' and not (x.key = any(public.bizplan_locked_keys())) order by x.key loop
    t := public.bizplan__text(f.value);
    --  재확인 필요 — 변경 전 문장에 대한 확인 표시
    select string_agg(c.name || ' ' || c.mark, ', ' order by c.at), count(*) into k, n
      from public.bizplan_checks c
     where c.doc_id = 'newborn2026' and c.key = f.key
       and coalesce(c.content_rev, public.bizplan_content_rev_at(c.doc_id, c.key, c.at)) < f.content_rev;
    if n > 0 then
      items := items || jsonb_build_object('level', 'warn', 'code', 'stale_confirm', 'key', f.key,
        'msg', '변경 전 문장에 대한 표시(' || k || ') — 지금 문장은 다시 확인받지 않았습니다');
    end if;
    continue when btrim(t) = '';
    if rules->'finance' ? f.key and f.status <> '최종 확인 완료' then
      items := items || jsonb_build_object('level', 'warn', 'code', 'finance_unconfirmed', 'key', f.key,
        'msg', '재무 · 인원 숫자 — 최종 확인 전 (' || f.status || ')');
    elsif rules->'plan' ? f.key and f.status <> '최종 확인 완료' then
      items := items || jsonb_build_object('level', 'warn', 'code', 'plan_unconfirmed', 'key', f.key,
        'msg', '중요 사업계획 — 최종 확인 전 (' || f.status || ')');
    elsif f.status in ('확인 필요') then
      items := items || jsonb_build_object('level', 'warn', 'code', 'status_check', 'key', f.key, 'msg', '「확인 필요」 상태');
    end if;
    if f.basis->>'kind' = '미확인' then
      items := items || jsonb_build_object('level', 'warn', 'code', 'basis_unverified', 'key', f.key,
        'msg', '근거가 「미확인」입니다' || coalesce(' — ' || nullif(f.basis->>'note', ''), ''));
    end if;
    if f.basis->>'kind' in ('추정','계획') and t !~ '(예상|전망|목표|계획|추정|가정|검토|예정|\(E\)|[0-9]E\y)' then
      items := items || jsonb_build_object('level', 'warn', 'code', 'estimate_as_fact', 'key', f.key,
        'msg', '근거는 「' || (f.basis->>'kind') || '」인데 글에 예상 · 목표 · 계획 표시가 없습니다 — 확정 실적처럼 읽힙니다');
    end if;
    if t ~ '(미정|미확정|추후|예시|○○|△△|TBD|확인 필요|검토 필요|\?\?|XX)' then
      items := items || jsonb_build_object('level', 'warn', 'code', 'placeholder', 'key', f.key,
        'msg', '「' || (regexp_match(t, '(미확정|미정|추후 확인|추후|예시|○○|△△|TBD|확인 필요|검토 필요|\?\?|XX)'))[1] || '」 등이 남아 있습니다');
    end if;
  end loop;

  --  ⑦ 해당 시 작성 칸 — 비어 있으면 「해당 없음」인지 확인
  for k in select jsonb_array_elements_text(rules->'recommended') loop
    if public.bizplan__blank(fv->k->'value') then
      items := items || jsonb_build_object('level', 'warn', 'code', 'recommended_blank', 'key', k, 'msg', '비어 있음 — 해당 없으면 「해당 없음」으로 적어 두는 것이 안전합니다');
    end if;
  end loop;
  --  별첨 — 대상 보증이 아니면 비워도 됩니다. 일부만 쓴 경우는 빈 칸을 알려 줌
  select bool_or(not public.bizplan__blank(fv->e->'value')) into v_annex_any from jsonb_array_elements_text(rules->'annex') e;
  if not coalesce(v_annex_any, false) then
    items := items || jsonb_build_object('level', 'warn', 'code', 'annex_blank', 'key', null,
      'msg', '별첨(추정매출액 · 소요자금 등)이 비어 있습니다 — 이번 보증이 별첨 대상(리틀펭귄 · 퍼스트펭귄 · Pre-ICON)이 아닌지 확인');
  else
    for k in select jsonb_array_elements_text(rules->'annex') loop
      if public.bizplan__blank(fv->k->'value') then
        items := items || jsonb_build_object('level', 'warn', 'code', 'recommended_blank', 'key', k, 'msg', '별첨 칸이 비어 있음');
      end if;
    end loop;
  end if;

  --  ⑧ 안내 — 제출 직전 원본 서식에 직접
  items := items || jsonb_build_object('level', 'info', 'code', 'by_hand', 'key', null,
    'msg', '주민등록번호 · 개인 연락처 · 자산 · 계좌번호 · 입금동의 · 서명(날인) ' || array_length(public.bizplan_locked_keys(), 1) || '칸은 원본 서식에 직접');
  for k in select jsonb_array_elements_text(rules->'by_hand') loop
    if public.bizplan__blank(fv->k->'value') then
      items := items || jsonb_build_object('level', 'info', 'code', 'by_hand', 'key', k, 'msg', '제출 직전에 적습니다');
    end if;
  end loop;

  return jsonb_build_object(
    'at', clock_timestamp(),
    'submit_month', public.bizplan__ym_text(v_sub),
    'blocks', (select count(*) from jsonb_array_elements(items) i where i->>'level' = 'block'),
    'warns',  (select count(*) from jsonb_array_elements(items) i where i->>'level' = 'warn'),
    'items', items);
end $$;

-- ── 11. 담당: 제출본 확정 — 점검을 거쳐서만 ─────────────────────────────────────
create or replace function public.bizplan__make_version(p_label text, p_note text, p_submission boolean, p_preflight jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.bizplan_doc%rowtype; me jsonb := public.bizplan_me(); v_at timestamptz := clock_timestamp();
        v_snap jsonb; v_id bigint;
begin
  if p_label is null or p_label !~ '^V[0-9]{1,2}\.[0-9]{1,2}$' then
    raise exception '버전 이름은 V0.1 · V1.0 처럼 적어 주세요.' using errcode = '22023';
  end if;
  insert into public.bizplan_doc(id) values ('newborn2026') on conflict (id) do nothing;
  select * into d from public.bizplan_doc where id = 'newborn2026' for update;
  if exists (select 1 from public.bizplan_versions where doc_id = d.id and label = p_label) then
    raise exception '이미 있는 버전 이름입니다 (%). 확정한 버전은 덮어쓰지 않습니다.', p_label using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(f.key, jsonb_build_object('value', f.value, 'status', f.status, 'basis', f.basis, 'rev', f.rev, 'content_rev', f.content_rev)), '{}'::jsonb)
    into v_snap from public.bizplan_fields f where f.doc_id = d.id;
  insert into public.bizplan_versions(doc_id, label, note, is_submission, snapshot, doc_status, created_by, created_at,
                                      preflight, override_reason, approved_by)
  values (d.id, p_label, left(coalesce(p_note, ''), 1000), p_submission, v_snap,
          case when p_submission then '제출본 확정' else d.status end, coalesce(me->>'name', ''), v_at,
          p_preflight, left(coalesce(p_reason, ''), 2000), case when p_submission then coalesce(me->>'name', '') else '' end)
  returning id into v_id;
  update public.bizplan_doc
     set version_label = p_label,
         locked_label = case when p_submission then p_label else locked_label end,
         status = case when p_submission then '제출본 확정' else status end,
         updated_at = v_at, updated_by = coalesce(me->>'name', '')
   where id = d.id;
  insert into public.bizplan_revisions(doc_id, key, before_status, after_status, reason, version_label, actor_id, actor_name, actor_title, at)
  values (d.id, '_version', d.version_label, p_label,
          case when p_submission then '제출본 확정 · ' else '버전 저장 · ' end || left(coalesce(p_note, ''), 1000)
            || case when coalesce(p_reason, '') <> '' then ' · 예외 승인: ' || left(p_reason, 800) else '' end,
          p_label, auth.uid(), coalesce(me->>'name', ''), coalesce(me->>'title', ''), v_at);
  return jsonb_build_object('ok', true, 'id', v_id, 'label', p_label);
end $$;
revoke all on function public.bizplan__make_version(text, text, boolean, jsonb, text) from public, anon, authenticated;

create or replace function public.bizplan_version_create(p_label text, p_note text default '', p_submission boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.bizplan_require(true);
  if coalesce(p_submission, false) then
    raise exception '제출본 확정은 「제출 전 점검」을 거쳐야 합니다 — 기록·버전 탭의 제출본 확정을 써 주세요.' using errcode = '22023';
  end if;
  return public.bizplan__make_version(p_label, p_note, false, null, '');
end $$;

create or replace function public.bizplan_submit(p_label text, p_note text default '', p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare pf jsonb;
begin
  perform public.bizplan_require(true);
  pf := public.bizplan_preflight();
  if (pf->>'blocks')::int > 0 then
    raise exception '제출본으로 확정할 수 없습니다 — 고쳐야 할 항목 %개 (필수 칸 · 처리 전 수정요청 · 자금 합계).', pf->>'blocks' using errcode = '22023';
  end if;
  if (pf->>'warns')::int > 0 and char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception '확인이 필요한 항목 %개가 남아 있습니다 — 확인한 내용과 예외로 확정하는 까닭을 10자 이상 적어 주세요.', pf->>'warns' using errcode = '22023';
  end if;
  perform public.bizplan_check_text(to_jsonb(coalesce(p_reason, '')));
  return public.bizplan__make_version(p_label, p_note, true, pf, case when (pf->>'warns')::int > 0 then btrim(p_reason) else '' end);
end $$;

-- ── 12. 관련 설문 응답 (읽기만) ────────────────────────────────────────────────
create or replace function public.bizplan_survey()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.bizplan_require(false);
  if to_regclass('public.biz_survey_responses') is null then return null; end if;
  execute $q$select coalesce(jsonb_agg(jsonb_build_object(
             'respondent', r.respondent, 'answers', r.answers, 'status', r.status,
             'updated_at', r.updated_at, 'submitted_at', r.submitted_at,
             'edited_by', coalesce(to_jsonb(r)->>'edited_by', '')) order by r.respondent), '[]'::jsonb)
           from public.biz_survey_responses r$q$ into v;
  return v;
end $$;

-- ── 13. 실행 권한 ────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'bizplan_open()', 'bizplan_save_field(text,jsonb,text,jsonb,text,integer,uuid)',
    'bizplan_check(text,text,text,integer)', 'bizplan_check(text,text,text)',
    'bizplan_history(text)', 'bizplan_preflight()', 'bizplan_submit(text,text,text)',
    'bizplan_version_create(text,text,boolean)', 'bizplan_survey()', 'bizplan_can_manage()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
  --  도움 함수는 함수 안에서만 (화면에서 직접 부르지 않음)
  foreach fn in array array[
    'bizplan_content_rev_at(text,text,timestamptz)', 'bizplan_value_at(text,text,timestamptz)', 'bizplan_rules()',
    'bizplan__text(jsonb)', 'bizplan__blank(jsonb)', 'bizplan__num(text)', 'bizplan__colsum(jsonb,text)',
    'bizplan__ym(text)', 'bizplan__ym_text(integer)', 'bizplan_check_text(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
  end loop;
end $$;

-- ── 14. 이미 있던 기록에 판 번호 채우기 + 확인 한 줄 ───────────────────────────────
select '0147 · 칸 ' || (select count(*) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (
          ('bizplan_fields','content_rev'), ('bizplan_checks','content_rev'), ('bizplan_checks','value_snapshot'),
          ('bizplan_check_log','content_rev'), ('bizplan_check_log','value_snapshot'),
          ('bizplan_versions','preflight'), ('bizplan_versions','override_reason'))) || '/7'
    || ' · 함수 ' || (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('bizplan_preflight','bizplan_submit','bizplan_survey',
             'bizplan_content_rev_at','bizplan_value_at','bizplan_rules')) || '/6'
    || ' · 확인 표시 ' || public.bizplan_backfill_0147() || '건 판 번호 채움' as "확인";
