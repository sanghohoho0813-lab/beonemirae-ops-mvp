-- ─────────────────────────────────────────────────────────────────────────────
-- 0012. 본인 프로필에서 바꾸지 못하게 막을 것 — client_id 누락 보완
--
--  실제 운영 DB 에서 검증하다 찾은 구멍입니다.
--
--  0002 의 profiles_update_self 는 본인이 role 과 active 를 바꾸지 못하게
--  막고 있었습니다. 그런데 client_id 는 0006(포털)에서 나중에 생긴 컬럼이라
--  그 목록에 들어가지 못했습니다.
--
--  그래서 병원 계정이 자기 profiles.client_id 를 다른 병원 것으로 바꿀 수
--  있었습니다. 바꾸고 나면 RLS 는 "이 사람의 소속 병원"을 기준으로 판단하므로,
--  그 순간부터 남의 병원 거래처·일정·요청이 전부 열립니다.
--  거래처 하나를 통째로 넘겨다볼 수 있는 경로였습니다.
--
--  role 이 아니라 소속을 바꾸는 방식이라 "권한 상승 차단" 검사에는 걸리지
--  않았습니다. 실제 계정 두 개로 교차 접근을 시도해 보고서야 드러났습니다.
--
--  고치는 방법은 간단합니다. 본인이 바꿀 수 있는 것은 이름과 글자 크기뿐이고,
--  신원에 해당하는 값(role · active · client_id · email · id)은 전부 고정합니다.
--  관리자는 profiles_admin_all 로 그대로 바꿀 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- 신원에 해당하는 값은 본인이 못 바꿉니다. 지금 값과 같아야 통과합니다.
    and role      = (select p.role      from public.profiles p where p.id = auth.uid())
    and active    = (select p.active    from public.profiles p where p.id = auth.uid())
    and client_id is not distinct from
                    (select p.client_id from public.profiles p where p.id = auth.uid())
    and email     = (select p.email     from public.profiles p where p.id = auth.uid())
  );

comment on policy profiles_update_self on public.profiles is
  '본인은 이름·글자크기만 수정. role/active/client_id/email 은 고정 (0012에서 client_id·email 추가).';
