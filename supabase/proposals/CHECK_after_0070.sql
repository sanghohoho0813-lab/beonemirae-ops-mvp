-- ═══════════════════════════════════════════════════════════════════════════
--  실행 확인 — 0066 · 0067 · 0070 이 다 들어갔는지 한 번에 봅니다
--
--  ⚠ 아무것도 바꾸지 않습니다. **읽기만** 합니다. 몇 번 돌려도 됩니다.
--  ⚠ 붙여넣고 Run 하시면 표 다섯 개가 차례로 나옵니다.
--     각 표 아래 「이렇게 나와야 합니다」와 맞춰 보시면 됩니다.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① 서버 판 번호 ────────────────────────────────────────────────────────
--  이렇게 나와야 합니다:  70
select public.app_schema_version() as 서버판번호;

-- ── ② 기사님 담당 차량 (0070) ─────────────────────────────────────────────
--  이렇게 나와야 합니다:
--    백광호 1호차 · 김진환 2호차 · 김준기 3호차 · 오대성 4호차
--  ⚠ 담당차량이 비어 있으면 그 기사님은 수거 입력을 **저장할 수 없습니다.**
select p.name as 기사, coalesce(v.name, '⚠ 없음 — 지정 필요') as 담당차량
  from public.profiles p
  left join public.vehicles v on v.id = p.vehicle_id
 where p.role = 'field'
 order by p.name;

-- ── ③ 차량 목록 (0070) ────────────────────────────────────────────────────
--  이렇게 나와야 합니다:
--    「3.5톤 (공용)」이 있고 active = true
--    「[Test용]검증차량」이 active = false
select name as 차량, waste_type as 구분, tonnage as 톤수, active as 쓰는중
  from public.vehicles
 order by name;

-- ── ④ 시험용 자료 표시 (0070) ─────────────────────────────────────────────
--  이렇게 나와야 합니다: 시험으로 넣은 것들만 [Test용] 이 붙어 있음
--  ⚠ 진짜 거래처 11곳에는 붙으면 안 됩니다.
select '거래처' as 어디, name as 이름 from public.clients where name like '[Test용]%'
union all
select '사용자', name from public.profiles where name like '[Test용]%'
union all
select '차량', name from public.vehicles where name like '[Test용]%'
 order by 1, 2;

-- ── ⑤ 3.5톤 공용차 예약 기능 (0070) ───────────────────────────────────────
--  이렇게 나와야 합니다: 세 줄 다 「있음」
select '예약 표(vehicle_reservations)' as 무엇,
       case when to_regclass('public.vehicle_reservations') is null then '⚠ 없음' else '있음' end as 상태
union all
select '예약 함수(reserve_vehicle)',
       case when exists (select 1 from pg_proc where proname = 'reserve_vehicle') then '있음' else '⚠ 없음' end
union all
select '반납 함수(release_vehicle)',
       case when exists (select 1 from pg_proc where proname = 'release_vehicle') then '있음' else '⚠ 없음' end;
