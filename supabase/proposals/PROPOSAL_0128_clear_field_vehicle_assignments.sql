-- ════════════════════════════════════════════════════════════════════════════
-- 0128 — 현장 직원의 **고정 차량 배정 해제** (칸은 그대로 둡니다)
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다.
--     DROP · TRUNCATE · 표/칸 삭제 **없습니다.** `profiles.vehicle_id` 칸도
--     그대로 둡니다 — 그 칸에 들어 있는 **값만** 비웁니다.
--
--  ── 왜 ──────────────────────────────────────────────────────────────────
--
--   0070 에서 네 분께 호차를 고정했습니다(백광호 1호차 · 김진환 2호차 ·
--   김준기 3호차 · 오대성 4호차). 실제로는 그날 타는 차가 달라서, 묶인 차와
--   다른 차로 나간 날 수거 입력이 막혔습니다.
--
--   이사님 말씀: 「직원별로 차를 정해둘 필요 없어요. 수거할 때 오늘 타고 간
--   차만 고르면 됩니다.」
--
--   앱(0128)은 이미 `profiles.vehicle_id` 를 **읽지 않습니다.** 그래서 이 SQL 을
--   안 돌려도 동작은 같습니다. 다만 사용자 관리 화면에 「(옛 설정)」이 계속
--   보이므로, 남은 값을 비워 헷갈리지 않게 하는 것이 이 파일의 목적입니다.
--
--  ── 대상 ────────────────────────────────────────────────────────────────
--   role = 'field'  AND  active = true  AND  vehicle_id is not null
--   ⚠ admin · office · client(병원 포털) 계정은 **건드리지 않습니다.**
--
--  ── 순서 ────────────────────────────────────────────────────────────────
--   ① 먼저 아래 「확인」만 실행해서 누가 몇 명인지 보십시오.
--   ② 결과가 예상과 같으면 ② 정리 블록을 실행하십시오 (트랜잭션 · 검증 포함).
--
--  ⚠ PROPOSAL_0070_ops_setup.sql 을 **다시 실행하면 §B 가 호차를 도로 붙입니다.**
--    0070 은 이미 실행이 끝난 파일이므로 재실행하지 마십시오.
-- ════════════════════════════════════════════════════════════════════════════


-- ── ① 확인 (읽기만) ───────────────────────────────────────────────────────

-- ①-1 지금 고정 차량이 들어 있는 **모든** 계정 (역할 구분 없이 — 무엇이 있는지 먼저 봅니다)
select p.name          as "이름",
       p.email         as "이메일",
       p.role          as "역할",
       p.active        as "사용중",
       v.name          as "고정된 차량",
       v.waste_type    as "차량 구분",
       (p.role = 'field' and p.active) as "이번 정리 대상"
  from public.profiles p
  left join public.vehicles v on v.id = p.vehicle_id
 where p.vehicle_id is not null
 order by (p.role = 'field' and p.active) desc, p.role, p.name;

-- ①-2 이번에 비울 사람 수
select count(*) as "정리 대상 (현장 · 사용중 · 차량 고정됨)"
  from public.profiles
 where role = 'field' and active and vehicle_id is not null;

-- ①-3 건드리지 않는 사람 수 (참고 — 관리자·사무실·병원 포털·중지된 계정)
select coalesce(role::text, '(없음)') as "역할",
       count(*) filter (where active)      as "사용중",
       count(*) filter (where not active)  as "중지됨"
  from public.profiles
 where vehicle_id is not null
   and not (role = 'field' and active)
 group by role
 order by 1;


-- ── ② 정리 (① 을 확인한 뒤에 실행) ────────────────────────────────────────
--
--   ⚠ 아래는 통째로 한 번에 실행하십시오. 마지막 줄이 commit 입니다.
--     중간에 예상과 다른 수가 나오면 예외를 내고 **아무것도 바꾸지 않습니다.**
--
--   ⚠ 감사기록(audit_logs)에 한 사람당 한 줄을 남깁니다 — 사용자 관리에서
--     바꿀 때(set_profile_vehicle)와 같은 모양입니다. 나중에 「누가 언제
--     풀었나」를 물으면 그 줄이 답입니다.

begin;

--  바꾸기 전 수 (되돌아볼 때 쓰는 값)
do $$
declare v_n integer;
begin
  select count(*) into v_n
    from public.profiles
   where role = 'field' and active and vehicle_id is not null;
  raise notice '정리 대상 %명', v_n;
end $$;

--  감사기록 먼저 (아직 값이 남아 있을 때 이름을 읽습니다)
insert into public.audit_logs (action, entity, entity_id, summary, screen, source)
select 'profile.vehicle', 'profiles', p.id::text,
       format('%s 차량 고정 해제 (0128 — 수거 때 그날 탄 차를 고릅니다. 이전: %s)',
              coalesce(p.name, p.email), coalesce(v.name, '(알 수 없음)')),
       'SQL 0128', 'sql'
  from public.profiles p
  left join public.vehicles v on v.id = p.vehicle_id
 where p.role = 'field' and p.active and p.vehicle_id is not null;

--  값만 비웁니다 (칸은 그대로)
update public.profiles
   set vehicle_id = null
 where role = 'field' and active and vehicle_id is not null;

--  검증 — 현장(사용중)에 남아 있으면 0 이어야 하고, 다른 역할은 그대로여야 합니다
do $$
declare v_left integer; v_other integer;
begin
  select count(*) into v_left
    from public.profiles where role = 'field' and active and vehicle_id is not null;
  if v_left <> 0 then
    raise exception '아직 %명이 남아 있습니다. 되돌립니다.', v_left;
  end if;
  select count(*) into v_other
    from public.profiles
   where vehicle_id is not null and not (role = 'field' and active);
  raise notice '남긴 계정(관리자·사무실·병원·중지) %건 — 건드리지 않았습니다', v_other;
end $$;

commit;


-- ── ③ 실행 뒤 확인 ────────────────────────────────────────────────────────
select count(*) as "아직 고정 남은 현장 계정 (0이어야 함)"
  from public.profiles
 where role = 'field' and active and vehicle_id is not null;

select p.name as "이름", p.role as "역할", p.active as "사용중", v.name as "남아 있는 고정 차량"
  from public.profiles p
  join public.vehicles v on v.id = p.vehicle_id
 order by p.role, p.name;
--   ⚠ 여기에 줄이 남아 있어도 괜찮습니다 — 관리자·사무실·중지된 계정이고,
--     수거 입력은 어차피 이 값을 읽지 않습니다. 보기 싫으시면 사용자 관리에서
--     「고정 해제」를 누르면 됩니다.

select 'profile.vehicle' as "감사기록", count(*) as "0128 로 남은 줄"
  from public.audit_logs
 where action = 'profile.vehicle' and screen = 'SQL 0128';
