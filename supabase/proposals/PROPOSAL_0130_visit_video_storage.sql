-- ════════════════════════════════════════════════════════════════════════════
-- 0130 — 「신용보증기금 방문용 영상」을 둘 **비공개** 저장 칸
--
--  ⚠ 대표님이 Supabase SQL Editor 에서 실행하십니다.
--     DROP · TRUNCATE · 표/칸 삭제 **없습니다.** 업무 표는 하나도 건드리지 않습니다.
--     새로 생기는 것은 저장 칸 1개(visit-media)와 읽기 권한 1개뿐입니다.
--
--  ── 왜 ──────────────────────────────────────────────────────────────────
--
--   영상에는 매출 숫자가 들어 있습니다. 이 앱의 GitHub 저장소는 **공개**라서,
--   영상을 앱 파일(public/)에 넣으면 주소만 알면 누구나 받아 볼 수 있습니다.
--   그래서 Supabase Storage 의 **비공개** 칸에 두고,
--     · 대표·사무실 계정(is_staff) 이면서
--     · 사용 중(is_active_user)인 계정만
--   몇 시간짜리 서명 주소를 받아 재생하게 합니다.
--   현장(field) · 병원(client) 계정, 로그인하지 않은 사람은 열 수 없습니다.
--
--   올리기·지우기 권한은 **만들지 않습니다.** 영상은 대표님이 Supabase 화면에서
--   직접 올리십니다(관리자 권한). 앱에서는 아무도 올리거나 지울 수 없습니다.
--
--  ── 순서 ────────────────────────────────────────────────────────────────
--   ① 아래 ① 확인을 실행 — 칸이 아직 없으면 0행이 나옵니다.
--   ② ② 만들기 블록을 실행 (트랜잭션 · 끝에 검증).
--   ③ Supabase → Storage → visit-media 칸 → 「Upload file」로 영상을 올리고,
--      파일 이름을 **sinbo_visit_v3.mp4** 로 맞춥니다.
--   ④ 앱 오른쪽 위 「신용보증기금 방문용 영상」을 눌러 재생되는지 봅니다.
-- ════════════════════════════════════════════════════════════════════════════


-- ── ① 확인 (읽기만) ───────────────────────────────────────────────────────

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'visit-media';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname = 'visit_media_staff_read';


-- ── ② 만들기 ──────────────────────────────────────────────────────────────

begin;

--  비공개 칸 · mp4 만 · 한 파일 최대 50MB (지금 영상은 약 30MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-media', 'visit-media', false, 52428800, array['video/mp4'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

--  읽기 권한 — 대표·사무실 + 사용 중인 계정만. 이미 있으면 그대로 둡니다.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'visit_media_staff_read'
  ) then
    create policy visit_media_staff_read on storage.objects
      for select to authenticated
      using (bucket_id = 'visit-media' and public.is_staff() and public.is_active_user());
  end if;
end $$;

--  검증 — 칸이 비공개이고, 읽기 권한이 하나 있어야 합니다
do $$
declare b_public boolean; n int;
begin
  select public into b_public from storage.buckets where id = 'visit-media';
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'visit_media_staff_read';
  if b_public is distinct from false then raise exception 'visit-media 칸이 비공개가 아닙니다'; end if;
  if n <> 1 then raise exception '읽기 권한이 만들어지지 않았습니다 (%)', n; end if;
end $$;

commit;


-- ── ③ 올린 뒤 확인 (읽기만) ───────────────────────────────────────────────

select name, metadata->>'size' as bytes, metadata->>'mimetype' as type, created_at
from storage.objects
where bucket_id = 'visit-media';
