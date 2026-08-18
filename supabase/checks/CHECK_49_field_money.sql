-- ═════════════════════════════════════════════════════════════════════════════
-- CHECK_49 — 현장·병원 계정에서 돈이 **실제로** 막혔는지 (0063 적용 뒤)
--
--  ── 무엇을 하는가 ──────────────────────────────────────────────────────────
--
--   운영 DB 에 **실제로 등록된 계정**을 역할별로 하나씩 골라, 그 계정의
--   토큰으로 로그인한 것과 **같은 조건**에서 표를 직접 불러 봅니다.
--   Supabase 도 로그인 뒤에는 이 claims 로 판단합니다.
--
--  ── 안전합니다 ─────────────────────────────────────────────────────────────
--
--   · **읽기만 합니다.** insert/update/delete 가 한 줄도 없습니다.
--   · 표를 만들지도 지우지도 않습니다 (임시표 하나뿐, 창을 닫으면 사라집니다).
--   · 전체가 한 트랜잭션이고 **마지막에 rollback** 합니다.
--   · 비밀번호를 쓰지 않습니다.
--
--  ── 어떻게 보나 ────────────────────────────────────────────────────────────
--
--   그대로 붙여 넣고 실행하면 마지막에 표가 하나 나옵니다.
--   **`결과` 칸이 전부 `통과` 여야 합니다.** 하나라도 `실패` 면 그 줄의
--   `본 것` 을 저에게 알려 주세요.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create temp table _chk (
  n     int generated always as identity,
  역할  text,
  항목  text,
  결과  text,
  "본 것" text
) on commit drop;

do $$
declare
  v_field  uuid;
  v_client uuid;
  v_office uuid;
  v_admin  uuid;
  v_out    text;
  v_err    text;

  --  한 번 재고 결과를 담습니다.
  --   want = 'ERROR'  → 막혀야 정상 (오류가 나야 통과)
  --   want = 'OK'     → 읽혀야 정상
  --   want = '<값>'   → 그 값이 나와야 정상
begin
  select id into v_field  from public.profiles where role = 'field'  and active order by created_at limit 1;
  select id into v_client from public.profiles where role = 'client' and active and client_id is not null order by created_at limit 1;
  select id into v_office from public.profiles where role = 'office' and active order by created_at limit 1;
  select id into v_admin  from public.profiles where role = 'admin'  and active order by created_at limit 1;

  -- ── 0. 계정이 있는지부터 ────────────────────────────────────────────────
  insert into _chk (역할, 항목, 결과, "본 것") values
    ('—', '현장(field) 계정이 있음',      case when v_field  is null then '없음' else '통과' end, coalesce(v_field::text,  '(없음 — 이 부분은 건너뜁니다)')),
    ('—', '병원(client) 계정이 있음',     case when v_client is null then '없음' else '통과' end, coalesce(v_client::text, '(없음 — 이 부분은 건너뜁니다)')),
    ('—', '사무실(office) 계정이 있음',   case when v_office is null then '없음' else '통과' end, coalesce(v_office::text, '(없음 — 이 부분은 건너뜁니다)')),
    ('—', '관리자(admin) 계정이 있음',    case when v_admin  is null then '없음' else '통과' end, coalesce(v_admin::text,  '(없음 — 이 부분은 건너뜁니다)'));

  -- ── 1. 현장(field) ──────────────────────────────────────────────────────
  if v_field is not null then

    --  ① 단가 — 막혀야 정상
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_field, 'role', 'authenticated')::text, true);
      execute 'select pricing::text from public.clients limit 1' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', '거래처 단가를 못 읽음', '실패', '읽혔습니다: ' || coalesce(left(v_out, 60), '(빈 값)'));
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', '거래처 단가를 못 읽음',
        case when v_err ilike '%permission denied%' then '통과' else '실패' end, left(v_err, 80));
    end;

    --  ② 별표 — 막혀야 정상 (앱이 무심코 select * 를 쓰면 돈이 통째로 갑니다)
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_field, 'role', 'authenticated')::text, true);
      execute 'select count(*)::text from (select * from public.clients limit 1) t' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', 'select * 도 막힘', '실패', '읽혔습니다');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', 'select * 도 막힘',
        case when v_err ilike '%permission denied%' then '통과' else '실패' end, left(v_err, 80));
    end;

    --  ③ 업무 칸은 **읽혀야** 정상 — 막기만 하면 일을 못 합니다
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_field, 'role', 'authenticated')::text, true);
      execute 'select count(*)::text from (select id, name, address, manager, phone, note from public.clients) t' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', '주소·담당자·전화·주의사항은 읽힘',
        case when coalesce(v_out,'0')::int > 0 then '통과' else '실패' end, coalesce(v_out,'0') || '곳');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', '주소·담당자·전화·주의사항은 읽힘', '실패', left(v_err, 80));
    end;

    --  ④ 돈 표들 — 0건이어야 정상
    declare t text;
    begin
      foreach t in array array['client_monthly_actuals','products','client_documents','payments','payment_receipts','sales_leads','operating_costs'] loop
        begin
          execute 'set local role authenticated';
          perform set_config('request.jwt.claims', json_build_object('sub', v_field, 'role', 'authenticated')::text, true);
          execute format('select count(*)::text from public.%I', t) into v_out;
          execute 'reset role';
          insert into _chk (역할, 항목, 결과, "본 것") values ('현장', t || ' 가 0건',
            case when coalesce(v_out,'0') = '0' then '통과' else '실패' end, coalesce(v_out,'?') || '건');
        exception when others then
          execute 'reset role';
          get stacked diagnostics v_err = message_text;
          --  아예 막혀서 오류가 나는 것도 「안 보인다」는 뜻이라 통과입니다.
          insert into _chk (역할, 항목, 결과, "본 것") values ('현장', t || ' 가 0건',
            case when v_err ilike '%permission denied%' then '통과' else '실패' end, left(v_err, 60));
        end;
      end loop;
    end;

    --  ⑤ 단가 통로 — 현장에는 빈 배열이어야 정상 (오류가 아니라 빈 값)
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_field, 'role', 'authenticated')::text, true);
      execute 'select public.client_billing_terms()::text' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', 'client_billing_terms() 가 빈 배열',
        case when v_out = '[]' then '통과' else '실패' end, left(coalesce(v_out,'(null)'), 60));
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', 'client_billing_terms() 가 빈 배열', '실패', left(v_err, 80));
    end;

    --  ⑥ 백업 통로 — 현장은 막혀야 정상
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_field, 'role', 'authenticated')::text, true);
      execute 'select left(public.clients_full()::text, 20)' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', 'clients_full() 이 막힘', '실패', '받았습니다: ' || coalesce(v_out,''));
    exception when others then
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('현장', 'clients_full() 이 막힘', '통과', '');
    end;

  end if;

  -- ── 2. 병원(client) ─────────────────────────────────────────────────────
  if v_client is not null then

    --  ① 우리 병원 한 곳만
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
      execute 'select count(*)::text from (select id, name from public.clients) t' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('병원', '우리 병원 한 곳만 보임',
        case when coalesce(v_out,'0') = '1' then '통과' else '실패' end, coalesce(v_out,'?') || '곳');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('병원', '우리 병원 한 곳만 보임', '실패', left(v_err, 80));
    end;

    --  ② 단가는 병원에게도 안 보임
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
      execute 'select pricing::text from public.clients limit 1' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('병원', '단가 칸을 못 읽음', '실패', '읽혔습니다');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('병원', '단가 칸을 못 읽음',
        case when v_err ilike '%permission denied%' then '통과' else '실패' end, left(v_err, 80));
    end;

    --  ③ ⚠ 상품은 **보여야** 정상 — 안 보이면 자재·용기를 주문할 수 없습니다
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
      execute 'select count(*)::text from public.products' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('병원', '⚠ 상품 목록은 보임 (주문해야 하니까)',
        case when coalesce(v_out,'0')::int > 0 then '통과' else '실패' end, coalesce(v_out,'?') || '건');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('병원', '⚠ 상품 목록은 보임 (주문해야 하니까)', '실패', left(v_err, 80));
    end;

    --  ④ 내부 자료는 안 보임
    declare t2 text;
    begin
      foreach t2 in array array['payments','site_notes','vehicles','client_documents','client_monthly_actuals'] loop
        begin
          execute 'set local role authenticated';
          perform set_config('request.jwt.claims', json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
          execute format('select count(*)::text from public.%I', t2) into v_out;
          execute 'reset role';
          insert into _chk (역할, 항목, 결과, "본 것") values ('병원', t2 || ' 가 0건',
            case when coalesce(v_out,'0') = '0' then '통과' else '실패' end, coalesce(v_out,'?') || '건');
        exception when others then
          execute 'reset role';
          get stacked diagnostics v_err = message_text;
          insert into _chk (역할, 항목, 결과, "본 것") values ('병원', t2 || ' 가 0건',
            case when v_err ilike '%permission denied%' then '통과' else '실패' end, left(v_err, 60));
        end;
      end loop;
    end;

  end if;

  -- ── 3. 사무실(office) — 막기만 하면 청구가 틀립니다 ─────────────────────
  if v_office is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_office, 'role', 'authenticated')::text, true);
      execute 'select coalesce(jsonb_array_length(public.client_billing_terms()),0)::text' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('사무실', '⚠ 단가를 받음 (없으면 청구가 0원이 됩니다)',
        case when coalesce(v_out,'0')::int > 0 then '통과' else '실패' end, coalesce(v_out,'?') || '곳');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('사무실', '⚠ 단가를 받음 (없으면 청구가 0원이 됩니다)', '실패', left(v_err, 80));
    end;

    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_office, 'role', 'authenticated')::text, true);
      execute 'select count(*)::text from public.client_monthly_actuals' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('사무실', '월 실적을 그대로 봄', '통과', coalesce(v_out,'?') || '건');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('사무실', '월 실적을 그대로 봄', '실패', left(v_err, 80));
    end;
  end if;

  -- ── 4. 관리자(admin) ────────────────────────────────────────────────────
  if v_admin is not null then
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      execute 'select (public.app_health_check()->>''ok'')' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('관리자', '자가진단 「빠진 것 없음」',
        case when v_out = 'true' then '통과' else '실패' end, coalesce(v_out,'?'));
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('관리자', '자가진단 「빠진 것 없음」', '실패', left(v_err, 80));
    end;

    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      execute 'select (public.app_health_check()->>''missing'')' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('관리자', '빠진 것 목록', case when v_out = '[]' then '통과' else '실패' end, left(coalesce(v_out,'?'), 200));
    exception when others then
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('관리자', '빠진 것 목록', '실패', '');
    end;

    --  ⚠ 백업이 거래처를 통째로 받아야 복구가 됩니다
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      execute 'select coalesce(jsonb_array_length(public.clients_full()),0)::text' into v_out;
      execute 'reset role';
      insert into _chk (역할, 항목, 결과, "본 것") values ('관리자', '⚠ 백업이 거래처를 통째로 받음',
        case when coalesce(v_out,'0')::int > 0 then '통과' else '실패' end, coalesce(v_out,'?') || '곳');
    exception when others then
      execute 'reset role';
      get stacked diagnostics v_err = message_text;
      insert into _chk (역할, 항목, 결과, "본 것") values ('관리자', '⚠ 백업이 거래처를 통째로 받음', '실패', left(v_err, 80));
    end;
  end if;
end $$;

-- ── 5. 권한이 실제로 그렇게 걸려 있는지 (계정과 무관) ────────────────────────
insert into _chk (역할, 항목, 결과, "본 것")
select '서버', 'DB 판이 63', case when public.app_schema_version() = 63 then '통과' else '실패' end,
       public.app_schema_version()::text;

insert into _chk (역할, 항목, 결과, "본 것")
select '서버', '거래처 표 전체 읽기 권한이 회수됨',
       case when count(*) = 0 then '통과' else '실패' end, count(*)::text
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'clients'
   and grantee = 'authenticated' and privilege_type = 'SELECT';

insert into _chk (역할, 항목, 결과, "본 것")
select '서버', '거래처 돈 칸이 닫혀 있음',
       case when count(*) = 0 then '통과' else '실패' end,
       coalesce(string_agg(column_name, ', '), '')
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'clients'
   and grantee = 'authenticated' and privilege_type = 'SELECT'
   and column_name in ('pricing','monthly_flat_fee','payment_terms','payment_due_day',
                       'vat_mode','flat_fee_when_empty','flat_fee_policy_at',
                       'biz_no','biz_ceo','biz_type','biz_item','tax_email');

insert into _chk (역할, 항목, 결과, "본 것")
select '서버', '⚠ 거래처 업무 칸은 열려 있음',
       case when count(*) = 6 then '통과' else '실패' end, count(*)::text || '/6'
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'clients'
   and grantee = 'authenticated' and privilege_type = 'SELECT'
   and column_name in ('id','name','address','manager','phone','note');

insert into _chk (역할, 항목, 결과, "본 것")
select '서버', '수거 완료가 거래처를 통째로 안 읽음',
       --  ⚠ like 로 쓰면 % 가 자리표가 돼서 다른 rowtype 선언까지 걸립니다
       --    (v_vehicle vehicles%rowtype 등). 글자 그대로 찾습니다.
       case when strpos(pg_get_functiondef(p.oid), 'select id, name into v_client') > 0 then '통과' else '실패' end,
       case when strpos(pg_get_functiondef(p.oid), 'v_client       clients%rowtype') > 0
            then '아직 clients%rowtype 로 통째로 읽습니다' else '' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'complete_collection';

-- ── 결과 ────────────────────────────────────────────────────────────────────
select 역할, 항목, 결과, "본 것" from _chk order by n;

rollback;
