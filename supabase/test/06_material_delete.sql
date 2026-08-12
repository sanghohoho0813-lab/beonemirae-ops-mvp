-- ─────────────────────────────────────────────────────────────────────────────
-- 06. 자재 공급 기록 삭제 검증 (0023)
--
--  확인하는 것
--   1) 사무실·관리자는 지울 수 있고, 지우면 재고가 돌아온다
--   2) 되돌린 양이 원장에 「취소」로 남는다
--   3) 현장 담당자는 못 지운다
--   4) 수거 입력에서 함께 공급된 자재는 여기서 못 지운다 (수거 완료 취소로)
--   5) 원장에 기록이 없는 자재는 재고를 짐작해서 늘리지 않는다
--   6) 감사기록이 남는다 — 그리고 실패했을 때는 남지 않는다
--
--  실행
--    psql -d rlsqa -f supabase/test/00_harness.sql
--    (migrations 0001~0023 적용)
--    psql -d rlsqa -v ON_ERROR_STOP=1 -f supabase/test/06_material_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

\set QUIET on
\pset pager off

create or replace function test_assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond then raise notice ' OK  | %', msg;
  else raise exception 'FAIL | %', msg;
  end if;
end $$;

create or replace function login_as(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is null then raise exception '테스트 계정 없음: %', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace function as_postgres() returns void language plpgsql as $$
begin execute 'reset role'; end $$;

insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('boss@mat.test',  '{"name":"대표"}',   '{"role":"admin"}'),
  ('desk@mat.test',  '{"name":"사무실"}', '{"role":"office"}'),
  ('drive@mat.test', '{"name":"김기사"}', '{"role":"field"}');

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 1. 지우면 재고가 돌아옵니다 ──────────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_c uuid; v_m uuid; v_before record; v_after record; v_res jsonb; n int;
begin
  perform as_postgres();
  insert into public.clients (name, type, address) values ('자재검증병원', '병원', '서울') returning id into v_c;
  update public.office_stock set corrugated_box = 200, plastic_container = 100, bag = 300, needle_box = 50 where id = 1;

  --  사무실이 자재 화면에서 공급을 등록한 상황을 그대로 만듭니다
  --  (기록 + 재고 차감 + 원장 — 앱이 하는 것과 같은 순서)
  insert into public.materials (date, client_id, box_count, vinyl_count, needle_box_count, memo)
  values (current_date, v_c, 10, 20, 5, '검증용 공급') returning id into v_m;

  update public.office_stock set
    corrugated_box = corrugated_box - 10,
    bag            = bag - 20,
    needle_box     = needle_box - 5
  where id = 1;

  insert into public.material_transactions (kind, item, qty, client_id, material_id, memo) values
    ('공급', 'corrugatedBox', -10, v_c, v_m, '검증용'),
    ('공급', 'bag',           -20, v_c, v_m, '검증용'),
    ('공급', 'needleBox',      -5, v_c, v_m, '검증용');

  select corrugated_box, bag, needle_box, plastic_container into v_before from public.office_stock where id = 1;
  perform test_assert(v_before.corrugated_box = 190 and v_before.bag = 280 and v_before.needle_box = 45,
    '공급 후 재고가 깎여 있음 (골판지 190 · 봉투 280 · 바늘통 45)');

  perform login_as('desk@mat.test');
  v_res := public.delete_material(v_m);
  perform as_postgres();

  select corrugated_box, bag, needle_box, plastic_container into v_after from public.office_stock where id = 1;
  perform test_assert(v_after.corrugated_box = 200 and v_after.bag = 300 and v_after.needle_box = 50,
    '삭제 후 재고가 원래대로 돌아옴 (200 · 300 · 50)');
  perform test_assert(v_after.plastic_container = 100, '공급하지 않은 품목은 건드리지 않음');

  perform test_assert(not exists (select 1 from public.materials where id = v_m), '자재 기록이 실제로 지워짐');

  select count(*) into n from public.material_transactions where kind = '취소' and qty > 0;
  perform test_assert(n = 3, '되돌린 양이 원장에 「취소」 3줄로 남음');

  select count(*) into n from public.audit_logs where action = 'material.delete';
  perform test_assert(n = 1, '감사기록 1건');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 2. 현장 담당자는 지울 수 없습니다 ────────────────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_c uuid; v_m uuid; v_blocked boolean; v_err text; n int; v_stock int;
begin
  perform as_postgres();
  select id into v_c from public.clients where name = '자재검증병원';
  insert into public.materials (date, client_id, box_count) values (current_date, v_c, 7) returning id into v_m;
  update public.office_stock set corrugated_box = corrugated_box - 7 where id = 1;
  insert into public.material_transactions (kind, item, qty, client_id, material_id)
  values ('공급', 'corrugatedBox', -7, v_c, v_m);

  perform login_as('drive@mat.test');
  begin
    perform public.delete_material(v_m);
    v_blocked := false;
  exception when others then v_blocked := true; v_err := sqlerrm;
  end;
  perform as_postgres();

  perform test_assert(v_blocked, '현장 담당자 삭제 거부 — ' || coalesce(v_err, ''));
  perform test_assert(exists (select 1 from public.materials where id = v_m), '기록이 그대로 남아 있음');

  select corrugated_box into v_stock from public.office_stock where id = 1;
  perform test_assert(v_stock = 193, '거부됐으므로 재고도 그대로 (193)');

  select count(*) into n from public.audit_logs where action = 'material.delete';
  perform test_assert(n = 1, '실패한 삭제는 감사기록에 남지 않음 (여전히 1건)');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 3. 수거 입력에서 함께 공급된 자재는 여기서 못 지웁니다 ───────────'
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_c uuid; v_m uuid; v_e uuid; v_blocked boolean; v_err text;
begin
  perform as_postgres();
  select id into v_c from public.clients where name = '자재검증병원';
  insert into public.materials (date, client_id, box_count) values (current_date, v_c, 3) returning id into v_m;
  v_e := gen_random_uuid();
  insert into public.collection_events
    (id, actor_role, action, schedule_id, client_id, client_name, waste_type, amount_kg, material_ids)
  values (v_e, 'office', '수거 완료', null, v_c, '자재검증병원', '의료폐기물', 100, array[v_m]);

  perform login_as('boss@mat.test');
  begin
    perform public.delete_material(v_m);
    v_blocked := false;
  exception when others then v_blocked := true; v_err := sqlerrm;
  end;
  perform as_postgres();

  perform test_assert(v_blocked, '관리자도 못 지움 — ' || coalesce(v_err, ''));
  perform test_assert(v_err like '%수거 완료 취소%', '어디로 가야 하는지 알려 줌');
  perform test_assert(exists (select 1 from public.materials where id = v_m), '기록이 그대로 남아 있음');

  --  이미 취소된 수거의 자재라면 막지 않습니다
  update public.collection_events set reverted = true where id = v_e;
  perform login_as('boss@mat.test');
  perform public.delete_material(v_m);
  perform as_postgres();
  perform test_assert(not exists (select 1 from public.materials where id = v_m),
    '취소된 수거의 자재는 지울 수 있음');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 4. 원장에 없는 자재는 재고를 짐작해서 늘리지 않습니다 ────────────'
-- ═══════════════════════════════════════════════════════════════════════════
--  예전에 넣은 데이터처럼 원장 기록이 없는 자재가 있을 수 있습니다.
--  그건 애초에 재고를 깎은 적이 없다는 뜻이라, 되돌리면 없던 재고가 생깁니다.

do $$
declare v_c uuid; v_m uuid; v_before int; v_after int; v_res jsonb;
begin
  perform as_postgres();
  select id into v_c from public.clients where name = '자재검증병원';
  insert into public.materials (date, client_id, box_count) values (current_date, v_c, 99) returning id into v_m;
  select corrugated_box into v_before from public.office_stock where id = 1;

  perform login_as('boss@mat.test');
  v_res := public.delete_material(v_m);
  perform as_postgres();

  select corrugated_box into v_after from public.office_stock where id = 1;
  perform test_assert(v_after = v_before, '원장 기록이 없으면 재고를 건드리지 않음');
  perform test_assert(v_res->'restored' = '{}'::jsonb, '되돌린 것이 없다고 그대로 알려 줌');
  perform test_assert(not exists (select 1 from public.materials where id = v_m), '기록은 지워짐');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
\echo '── 5. 화면을 거치지 않는 삭제는 여전히 막힙니다 ─────────────────────'
-- ═══════════════════════════════════════════════════════════════════════════
--  함수를 거치지 않으면 재고가 돌아오지 않으므로, 직접 DELETE 는 계속 막습니다.

do $$
declare v_c uuid; v_m uuid; n int;
begin
  perform as_postgres();
  select id into v_c from public.clients where name = '자재검증병원';
  insert into public.materials (date, client_id, box_count) values (current_date, v_c, 1) returning id into v_m;

  perform login_as('boss@mat.test');
  delete from public.materials where id = v_m;
  get diagnostics n = row_count;
  perform as_postgres();

  perform test_assert(n = 0, '관리자가 직접 DELETE 해도 지워지지 않음 (함수를 거쳐야 함)');
  perform test_assert(exists (select 1 from public.materials where id = v_m), '기록 그대로');
end $$;

\echo ''
\echo '  자재 삭제 검증 통과 — 지우면 실제로 지워지고 재고가 돌아옵니다.'
\echo ''
