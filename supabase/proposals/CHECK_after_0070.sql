-- ═══════════════════════════════════════════════════════════════════════════
--  실행 확인 — 0066 · 0067 · 0070 이 다 들어갔는지 한 표로 봅니다
--
--  ⚠ 아무것도 바꾸지 않습니다. **읽기만** 합니다. 몇 번 돌려도 됩니다.
--
--  ⚠ Supabase SQL Editor 는 **맨 마지막 문장의 결과만** 보여 줍니다.
--     그래서 확인 항목을 여러 문장으로 나누지 않고 **한 문장**으로 합쳤습니다.
--     붙여넣고 Run 하시면 표 하나에 전부 나옵니다.
--
--  ── 보는 법 ──────────────────────────────────────────────────────────────
--     판정 칸만 보시면 됩니다.
--       ✅ = 잘 들어감
--       ⚠  = 확인 필요 (아래에 무엇을 해야 하는지 적혀 있습니다)
-- ═══════════════════════════════════════════════════════════════════════════

with
--  ① 서버 판 번호 — 70 이어야 합니다
v as (select public.app_schema_version() as n),

--  ② 기사님 담당 차량 — 비어 있으면 그 기사님은 수거 입력을 저장할 수 없습니다
driver as (
  select p.name as 기사, v2.name as 차량
    from public.profiles p
    left join public.vehicles v2 on v2.id = p.vehicle_id
   where p.role = 'field' and coalesce(p.active, true)
),

--  ③④⑤ 는 아래 union 안에서 바로 셉니다
rows_ as (

  select 1 as 순, '서버 판 번호' as 항목, n::text as 값,
         case when n >= 70 then '✅' else '⚠ 0067·0070 이 덜 들어갔습니다' end as 판정
    from v

  union all
  select 2, '기사님 수', count(*)::text || '명',
         case when count(*) = 0 then '⚠ field 계정이 없습니다' else '✅' end
    from driver

  union all
  select 3, '담당 차량 — ' || 기사, coalesce(차량, '(없음)'),
         case when 차량 is null then '⚠ 설정 → 사용자에서 차량을 지정해 주세요' else '✅' end
    from driver

  union all
  select 4, '3.5톤 공용차', coalesce(max(name), '(없음)'),
         case when count(*) = 1 then '✅' else '⚠ 0070 이 덜 들어갔습니다' end
    from public.vehicles where name = '3.5톤 (공용)' and active

  union all
  select 5, '쓰는 차량 수', count(*)::text || '대',
         case when count(*) >= 1 then '✅' else '⚠ 차량이 없습니다' end
    from public.vehicles where active

  union all
  select 6, '[Test용] 표시된 자료', count(*)::text || '건',
         '✅ (시험용만 붙어 있으면 정상)'
    from (
      select name from public.clients  where name like '[Test용]%'
      union all select name from public.profiles where name like '[Test용]%'
      union all select name from public.vehicles where name like '[Test용]%'
    ) t

  union all
  select 7, '진짜 거래처', count(*)::text || '곳',
         case when count(*) = 11 then '✅' else '⚠ 11곳이 아닙니다 — 확인해 주세요' end
    from public.clients where active and name not like '[Test용]%'

  union all
  select 8, '주소가 빈 거래처', count(*)::text || '곳',
         case when count(*) = 0 then '✅'
              else '⚠ FILL_client_contact.sql 로 채워 주세요' end
    from public.clients
   where active and name not like '[Test용]%' and coalesce(address, '') = ''

  union all
  select 9, '전화가 빈 거래처', count(*)::text || '곳',
         case when count(*) = 0 then '✅'
              else '⚠ FILL_client_contact.sql 로 채워 주세요' end
    from public.clients
   where active and name not like '[Test용]%' and coalesce(phone, '') = ''

  union all
  select 10, '3.5톤 예약 기능', '표 · 예약 · 반납',
         case when to_regclass('public.vehicle_reservations') is not null
               and exists (select 1 from pg_proc where proname = 'reserve_vehicle')
               and exists (select 1 from pg_proc where proname = 'release_vehicle')
              then '✅' else '⚠ 0070 이 덜 들어갔습니다' end

  union all
  select 11, '기사 본인 일정 넣기 (0067)', 'book_visit',
         case when exists (
                select 1 from pg_proc where proname = 'book_visit'
                 and pg_get_function_identity_arguments(oid) like '%p_purpose%')
              then '✅' else '⚠ 0067 이 덜 들어갔습니다' end
)

select 항목, 값, 판정 from rows_ order by 순, 항목;
