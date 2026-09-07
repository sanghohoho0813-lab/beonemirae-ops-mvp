-- ─────────────────────────────────────────────────────────────────────────────
--  로그인이 안 될 때 — 무엇이 막고 있는지 한 번에 보는 조회 (0102)
--
--  ⚠ 읽기만 합니다. 이 파일은 아무것도 바꾸지 않습니다.
--     Supabase → SQL Editor 에 붙여넣고 실행하시면 됩니다.
--
--  ⚠ 비밀번호는 여기서 확인할 수 없습니다. 서버에도 원문이 없습니다(해시만).
--     그래서 「비밀번호가 맞는지」는 이 조회로 알 수 없고, 아래 ③ 처럼
--     **다시 정해 주는** 것으로 해결합니다.
--
--  ── 사용법 ──────────────────────────────────────────────────────────────
--   아래 첫 줄의 이메일 목록만 실제 계정으로 바꿔서 실행하세요.
-- ─────────────────────────────────────────────────────────────────────────────

with ask(email) as (
  --  ↓↓↓ 여기만 바꾸시면 됩니다 (소문자로, 쉼표로 여러 개) ↓↓↓
  values ('beonemirae@naver.com'), ('여기에오대성과장이메일@example.com')
),
u as (
  select a.email as asked,
         au.id, au.email as real_email,
         to_jsonb(au) as j
    from ask a
    left join auth.users au
      on lower(au.email) = lower(a.email)
),
p as (
  select u.asked, u.id, u.real_email, u.j,
         pr.role::text as role, pr.active, pr.approved_at, pr.client_id, pr.name
    from u
    left join public.profiles pr on pr.id = u.id
)
select
  asked                                   as "입력한 이메일",
  real_email                              as "서버에 있는 이메일",
  case when id is null then '❌ 없음' else '✅ 있음' end          as "계정(auth)",
  (j->>'email_confirmed_at') is not null                         as "메일확인·승인됨",
  case when id is null then null
       when role is null then '❌ 없음 (← 이러면 로그인해도 화면이 안 열립니다)'
       else '✅ 있음' end                                        as "사용자정보(profiles)",
  role                                    as "역할",
  active                                  as "사용중",
  approved_at                             as "승인시각",
  client_id                               as "소속 병원",
  (j->>'banned_until')                    as "차단됨",
  (j->>'deleted_at')                      as "삭제됨",
  (j->>'last_sign_in_at')                 as "마지막 로그인",
  --  ── 무엇이 문제인지 한 줄로 ────────────────────────────────────────────
  case
    when id is null
      then '① 계정 자체가 없습니다 — 이메일 오타이거나, 아직 안 만든 계정입니다.'
    when (j->>'deleted_at') is not null
      then '① 삭제된 계정입니다.'
    when (j->>'banned_until') is not null and (j->>'banned_until')::timestamptz > now()
      then '① 차단된 계정입니다.'
    when role is null
      then '② 로그인은 되지만 사용자정보(profiles)가 없습니다. ' ||
           '화면이 로그인 창으로 되돌아오고 아무 말도 안 나옵니다. ' ||
           '→ 아래 「② 고치기」 를 실행하세요.'
    when (j->>'email_confirmed_at') is null
      then '③ 아직 관리자 승인 전입니다. 화면에 「관리자 승인 전입니다」가 뜹니다. ' ||
           '→ 사용자 관리에서 승인하시거나 아래 「③ 고치기」 를 실행하세요.'
    when active is not true
      then '④ 중지된 계정입니다. → 사용자 관리에서 사용중으로 바꾸세요.'
    when role = 'client' and client_id is null
      then '⑤ 병원 계정인데 소속 병원이 비어 있습니다. → 사용자 관리에서 병원을 지정하세요.'
    else '✅ 계정 쪽은 문제가 없습니다. 남은 원인은 **비밀번호**입니다. ' ||
         '→ 로그인 화면의 「비밀번호를 잊으셨나요?」 또는 사용자 관리의 비밀번호 재설정.'
  end                                     as "진단"
from p
order by asked;


-- ═════════════════════════════════════════════════════════════════════════
--  고치기 — 위 「진단」에 나온 번호에 해당하는 것만 골라서 실행하세요.
--  ⚠ 실행 전에 어느 계정인지 이메일을 꼭 확인하세요.
-- ═════════════════════════════════════════════════════════════════════════

-- ── ② 사용자정보(profiles)가 없을 때 ──────────────────────────────────────
--     로그인은 되는데 화면이 안 열리는 경우입니다. 없는 한 줄만 만들어 줍니다.
--     역할(role)은 'admin' · 'office' · 'field' · 'client' 중 하나로 적으세요.
--
-- insert into public.profiles (id, email, name, role, client_id, active, approved_at)
-- select au.id, au.email, split_part(au.email, '@', 1), 'office', null, true, now()
--   from auth.users au
--  where lower(au.email) = lower('여기에이메일')
--    and not exists (select 1 from public.profiles p where p.id = au.id);


-- ── ③ 아직 승인 전일 때 (메일확인이 비어 있음) ────────────────────────────
--     화면의 「사용자 관리 → 승인」과 같은 일을 SQL 로 하는 것입니다.
--     ⚠ 화면에서 승인하는 편이 안전합니다(감사기록이 함께 남습니다).
--
-- update auth.users
--    set email_confirmed_at = coalesce(email_confirmed_at, now())
--  where lower(email) = lower('여기에이메일');
--
-- update public.profiles
--    set active = true, approved_at = coalesce(approved_at, now())
--  where lower(email) = lower('여기에이메일');


-- ── ④ 비밀번호를 다시 정할 때 ─────────────────────────────────────────────
--     ⚠ SQL 로 하지 마세요. 화면에서 하시는 편이 안전하고 기록도 남습니다.
--        · 로그인 화면 → 「비밀번호를 잊으셨나요?」 (본인이 메일로)
--        · 관리자 → 사용자 관리 → 해당 직원 → 비밀번호 재설정 (8자 이상)
--     ⚠ 임시 비밀번호는 8자 이상이어야 합니다. 그리고 「12341234」처럼 쉬운
--        비밀번호는 Supabase 의 유출 비밀번호 차단이 켜져 있으면 거부됩니다.
