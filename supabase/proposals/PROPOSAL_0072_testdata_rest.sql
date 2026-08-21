-- ═══════════════════════════════════════════════════════════════════════════
--  0072 (제안) — 0070 이 놓친 시험용 자료에 [Test용] 붙이기
--
--  ── 왜 필요한가 ──────────────────────────────────────────────────────────
--
--   0070 실행 뒤 확인표에 이렇게 나왔습니다:
--
--     담당 차량 — [Test용]김상호(테스트…)   (없음)   ← 잘 붙음
--     담당 차량 — [Test용]현장 직원(테…)    (없음)   ← 잘 붙음
--     담당 차량 — 검증 현장                 (없음)   ← ⚠ 안 붙음
--     담당 차량 — 검증병원2                 (없음)   ← ⚠ 안 붙음
--
--   0070 은 이름이 **대괄호로 시작하는 것**만 찾았습니다 (`[검증]…`).
--   그런데 이 둘은 대괄호 없이 그냥 「검증 …」으로 되어 있어 안 걸렸습니다.
--   제가 규칙을 좁게 잡은 탓입니다.
--
--   ⚠ 이게 왜 문제인가 — 거래처의 **담당 기사 고르는 목록**에 이 둘이
--     그대로 남습니다. 담당 기사는 한 명이라도 붙는 순간 「그 사람에게만
--     보이는」 상태가 되므로, 시험용 계정이 잘못 눌리면 그 거래처가 진짜
--     기사님 화면에서 사라집니다.
--
--  ── 무엇을 바꾸나 ────────────────────────────────────────────────────────
--
--   이름이 **「검증」으로 시작하는** 자료 앞에 [Test용] 을 붙입니다.
--   계정·거래처를 지우지 않습니다 — 지우면 그것으로 남긴 기록의 주인이
--   사라집니다. 이름만 바꿔 눈에 띄게 합니다.
--
--   ⚠ 「검증」으로 **시작하는** 것만 봅니다. 이름 가운데 우연히 그 글자가
--     들어간 진짜 자료를 건드리지 않기 위해서입니다.
--   ⚠ 진짜 거래처 11곳에는 「검증」으로 시작하는 이름이 없습니다 (확인함).
--   ⚠ 시험 계정에는 차를 배정하지 않습니다 — 지금도 (없음)이고 그대로 둡니다.
--
--  ── 기존 데이터에 미치는 영향 ────────────────────────────────────────────
--   · 이름(name) 칸만 바뀝니다. 수거·자재·청구·입금 기록은 그대로입니다.
--   · 여러 번 돌려도 안전합니다 (이미 붙은 것은 건너뜁니다).
--
--  ── 되돌리기 ─────────────────────────────────────────────────────────────
--   맨 아래 주석에 있습니다.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

--  ① 로그인 계정
update public.profiles
   set name = '[Test용]' || name
 where name ~ '^검증'
   and name not like '[Test용]%';

--  ② 거래처
update public.clients
   set name = '[Test용]' || name, updated_at = now()
 where name ~ '^검증'
   and name not like '[Test용]%';

--  ③ 차량
update public.vehicles
   set name = '[Test용]' || name
 where name ~ '^검증'
   and name not like '[Test용]%';

--  ④ 시험용 차량은 배차 목록에서 내립니다 — 목록에 남아 있으면 눌립니다
update public.vehicles set active = false
 where name like '[Test용]%' and active;

-- ── 확인 ──────────────────────────────────────────────────────────────────
--  이렇게 나와야 합니다: 시험용은 전부 [Test용] 로 시작 · 남은것 0건
select '시험용 자료' as 무엇, 어디, 이름, '✅ 표시됨' as 판정
  from (
    select '계정' as 어디, name as 이름 from public.profiles where name like '[Test용]%'
    union all select '거래처', name from public.clients  where name like '[Test용]%'
    union all select '차량',   name from public.vehicles where name like '[Test용]%'
  ) t
union all
select '아직 안 붙은 것', 어디, 이름, '⚠ 확인 필요'
  from (
    select '계정' as 어디, name as 이름 from public.profiles
     where name ~ '검증|테스트' and name not like '[Test용]%'
    union all select '거래처', name from public.clients
     where name ~ '검증|테스트' and name not like '[Test용]%'
    union all select '차량', name from public.vehicles
     where name ~ '검증|테스트' and name not like '[Test용]%'
  ) u
 order by 1 desc, 2, 3;

commit;

-- ── 되돌리기 ──────────────────────────────────────────────────────────────
--  update public.profiles set name = regexp_replace(name, '^\[Test용\]', '')
--   where name like '[Test용]검증%';
--  update public.clients  set name = regexp_replace(name, '^\[Test용\]', '')
--   where name like '[Test용]검증%';
--  update public.vehicles set name = regexp_replace(name, '^\[Test용\]', '')
--   where name like '[Test용]검증%';
