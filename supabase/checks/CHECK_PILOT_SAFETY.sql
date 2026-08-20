-- ═══════════════════════════════════════════════════════════════════════════
--  파일럿 전 운영 DB 최종 점검 (읽기 전용)
--
--   ⚠ 이 파일은 **아무것도 바꾸지 않습니다.** begin … rollback 안에서만 돌고,
--     insert / update / delete 가 한 줄도 없습니다. 안심하고 돌리셔도 됩니다.
--
--   왜 대표님이 직접 돌리셔야 하나요?
--     이 점검의 절반은 **관리자 권한**이 있어야 볼 수 있습니다
--     (계정 목록 · 자가진단 · 정책 목록). 저에게는 관리자 계정이 없습니다.
--
--   쓰는 법
--     Supabase → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--     맨 아래 결과표에서 **판정** 칸에 「확인 필요」가 하나라도 있으면
--     그 줄을 저에게 알려 주세요.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temp table _chk(구분 text, 항목 text, 값 text, 판정 text) on commit drop;

-- ── ① 앱과 DB 의 판(schema) 이 같은가 ──────────────────────────────────────
--    다르면 앱이 없는 칸을 찾다가 화면이 비거나 저장이 막힙니다.
insert into _chk
select '판 맞춤', 'DB schema_version', public.app_schema_version()::text,
       case when public.app_schema_version() = 63 then '통과' else '확인 필요 — 앱은 63 을 기대합니다' end;

-- ── ② 자가진단 (0063 의 app_health_check) ──────────────────────────────────
--
--   ⚠ 이 함수는 **로그인한 관리자**만 부를 수 있습니다. SQL Editor 에는
--     로그인 세션이 없어서(auth.uid() 가 비어 있음) 그냥 부르면 멈춥니다.
--     실제로 여기서 한 번 멈췄습니다. 오류를 잡아서 결과에 적습니다 —
--     점검 파일이 중간에 죽으면 아래 검사를 하나도 못 봅니다.
do $$
declare v jsonb; v_missing text; v_ok boolean;
begin
  begin
    v := public.app_health_check();
    v_missing := coalesce(nullif(array_to_string(
      array(select jsonb_array_elements_text(v->'missing')), ' · '), ''), '없음');
    v_ok := jsonb_array_length(v->'missing') = 0;
    insert into _chk values ('자가진단', '빠진 표·칸·함수', v_missing,
      case when v_ok then '통과' else '확인 필요 — 빠진 것이 있습니다' end);
  exception when others then
    --  SQL Editor 는 로그인 세션이 아니라 못 봅니다. 대신 앱 화면에서 봅니다.
    insert into _chk values ('자가진단', '빠진 표·칸·함수', SQLERRM,
      '참고 — SQL Editor 에서는 못 봅니다. 앱에 관리자로 로그인해 「설정 → 자가진단」에서 확인해 주세요');
  end;
end $$;

-- ── ③ RLS 가 정말 켜져 있는가 ──────────────────────────────────────────────
--    한 표라도 꺼져 있으면 그 표는 **토큰만 있으면 누구나** 읽습니다.
insert into _chk
select 'RLS', 'RLS 꺼진 표',
       coalesce(nullif(string_agg(c.relname, ' · ' order by c.relname), ''), '없음'),
       case when count(*) = 0 then '통과' else '확인 필요 — 이 표는 아무나 읽습니다' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- ── ④ 정책이 하나도 없는 표 (RLS 는 켰는데 규칙이 없으면 전부 막힙니다) ────
insert into _chk
select 'RLS', '정책이 없는 표',
       coalesce(nullif(string_agg(c.relname, ' · ' order by c.relname), ''), '없음'),
       case when count(*) = 0 then '통과' else '확인 필요 — 화면이 빈 채로 보일 수 있습니다' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname);

-- ── ⑤ 현장이 거래처 돈 칸을 못 읽는가 (0063 의 열 단위 잠금) ────────────────
insert into _chk
select '현장 차단', '거래처 돈 칸 열림 여부',
       coalesce(nullif(string_agg(column_name, ' · ' order by column_name), ''), '없음(전부 잠김)'),
       case when count(*) = 0 then '통과' else '확인 필요 — 현장이 이 칸을 읽습니다' end
  from information_schema.column_privileges
 where table_schema='public' and table_name='clients' and grantee='authenticated'
   and privilege_type='SELECT'
   and column_name in ('pricing','monthly_flat_fee','payment_terms','payment_due_day',
                       'biz_no','biz_ceo','biz_type','biz_item','tax_email','vat_mode',
                       'flat_fee_when_empty','flat_fee_policy_at');

-- ── ⑥ 병원이 상품 **원가**를 읽는가 ────────────────────────────────────────
--    지금은 원가가 0 원이라 새어도 무해하지만, 매입가를 넣는 순간
--    병원이 우리 마진을 봅니다.
insert into _chk
select '병원 차단', 'products.cost_price 를 읽는 역할',
       coalesce(nullif(string_agg(grantee, ' · '), ''), '없음'),
       case when count(*) = 0 then '통과'
            else '확인 필요 — 병원 계정도 원가를 읽습니다' end
  from information_schema.column_privileges
 where table_schema='public' and table_name='products' and column_name='cost_price'
   and grantee='authenticated' and privilege_type='SELECT';

-- ── ⑦ 직원 개인정보(4대보험)를 누가 읽는가 ─────────────────────────────────
insert into _chk
select '개인정보', 'staff 의 보험 칸을 읽는 역할',
       coalesce(nullif(string_agg(distinct grantee, ' · '), ''), '없음'),
       case when count(*) = 0 then '통과'
            else '확인 필요 — 현장 직원이 동료의 자격취득일을 읽습니다' end
  from information_schema.column_privileges
 where table_schema='public' and table_name='staff'
   and column_name in ('insured_from','insurance')
   and grantee='authenticated' and privilege_type='SELECT';

-- ── ⑧ 파일럿에 필요한 함수가 다 있는가 ─────────────────────────────────────
insert into _chk
select '함수', '없는 함수',
       coalesce(nullif(string_agg(f, ' · '), ''), '없음'),
       case when count(*) = 0 then '통과' else '확인 필요' end
  from (
    select f from unnest(array[
      'complete_collection','revert_collection','confirm_billing','cancel_billing',
      'add_payment_receipt','supply_materials','receive_stock',
      'request_product_order','set_product_order_status','product_sales_summary',
      'client_billing_terms','clients_full','app_schema_version','app_health_check',
      'record_app_error','create_planned_schedules'
    ]) f
     where to_regprocedure('public.' || f || '(jsonb)') is null
       and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname = f)
  ) x;

-- ── ⑨ 자주 거는 조건에 색인이 있는가 (느려지면 현장이 기다립니다) ──────────
insert into _chk
select '색인', '색인 없는 자주 쓰는 칸',
       coalesce(nullif(string_agg(t || '.' || c, ' · '), ''), '없음'),
       case when count(*) = 0 then '통과' else '참고 — 지금 규모에서는 느려지지 않습니다' end
  from (values ('schedules','client_id'),('schedules','date'),('materials','client_id'),
               ('client_requests','client_id'),('product_orders','client_id'),
               ('payments','client_id'),('collection_events','client_id')) v(t,c)
 where not exists (
   select 1 from pg_indexes i
    where i.schemaname='public' and i.tablename = v.t and i.indexdef like '%(' || v.c || '%');

-- ── ⑩ 파일럿 자료가 준비됐는가 (제품이 아니라 **자료** 점검입니다) ─────────
insert into _chk
select '파일럿 자료', '판매가가 0원인 상품',
       count(*)::text || '개',
       case when count(*) = 0 then '통과'
            else '확인 필요 — 병원 화면에 안 뜹니다 (매출 AX 가 0 으로 남습니다)' end
  from public.products where active and coalesce(sale_price,0) = 0;

insert into _chk
select '파일럿 자료', '차량이 안 묶인 현장 계정',
       coalesce(nullif(string_agg(name, ' · '), ''), '없음'),
       case when count(*) = 0 then '통과' else '확인 필요 — 매번 차량을 골라야 합니다' end
  from public.profiles where role='field' and active and vehicle_id is null;

insert into _chk
select '파일럿 자료', '오늘 살아 있는 수거 예정',
       count(*)::text || '건',
       case when count(*) > 0 then '통과'
            else '확인 필요 — 「오늘 일정 → 병원」 경로를 밟을 수 없습니다' end
  from public.schedules
 where date = (now() at time zone 'Asia/Seoul')::date and status <> '완료' and canceled_at is null;

insert into _chk
select '파일럿 자료', '검증용 흔적이 남은 기록',
       (select count(*) from public.clients where name like '[검증]%' or name like '[실증검증]%')::text || '곳 · ' ||
       (select count(*) from public.client_requests where content like '[실증검증]%')::text || '건',
       '확인 필요 — 파일럿 전에 정리하실지 결정해 주세요';

-- ── 결과 ───────────────────────────────────────────────────────────────────
select 구분, 항목, 값, 판정 from _chk order by
  case when 판정 like '확인 필요%' then 0 when 판정 like '참고%' then 1 else 2 end, 구분, 항목;

select case when count(*) = 0 then '전부 통과 — 파일럿 준비 완료'
            else count(*)::text || '건 확인 필요 (위 표의 맨 윗줄부터)' end as "최종"
  from _chk where 판정 like '확인 필요%';

rollback;
