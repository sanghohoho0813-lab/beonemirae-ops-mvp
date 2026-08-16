-- 비원미래 운영 DB — 39차 (0053)
-- 소모품 30가지에 실제 제품 사진 붙이기. RUN_1~38 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0053_product_photos.sql 과 내용이 같습니다.
--
-- 실행 후 확인: select public.app_schema_version();          → 53
--              select count(*) from public.products
--               where image_url <> '';                        → 30
--
-- ⚠ 사진 파일은 **다음 배포에 함께 올라갑니다**(public/products/*.webp).
--   그래서 배포 전에 이 SQL 만 먼저 실행하면 잠깐 사진이 깨져 보일 수
--   있습니다. 배포가 끝난 뒤 실행하시는 편이 깔끔합니다.
--
-- 기존 데이터에 미치는 영향
--   · products.image_url 만 채웁니다. 이미 사진을 넣어 둔 품목은 그대로 둡니다.
--   · 단가·재고·주문·금액은 하나도 안 바뀝니다. 두 번 실행해도 같습니다.

-- ════════════════════════════════════════════════════════════════════════════
-- 0053 — 소모품 30가지에 실제 제품 사진 붙이기
--
--  대표님이 구글 드라이브에 올려 주신 사진 30장입니다. 파일 이름을 품목명으로
--  바꿔 주셔서 **이름으로 정확히 맞출 수 있게** 됐습니다(그 전에는
--  `call_xxxx.png` 라 어느 사진이 어느 물건인지 알 수 없었습니다).
--
--  사진은 저장소 안에 함께 둡니다(`public/products/*.webp`).
--   · 드라이브 주소를 그대로 쓰면 공유 설정이 바뀌거나 접속이 막힐 때
--     병원 화면에서 사진이 통째로 사라집니다.
--   · 원본 1254x1254 PNG 45MB → 640px WebP 656KB 로 줄였습니다. 화면에서
--     쓰는 크기(최대 400px 남짓)보다 크게 남겨 두어 고해상도 화면에서도
--     선명합니다.
--
--  이름 하나만 짐작으로 맞췄습니다 — 파일 `10-롤타입-대형-100매입` 에는
--  품목 이름이 없습니다. 다만 나머지 29개가 정확히 일대일로 맞고 남는
--  품목이 「물티슈(대형)」 하나뿐이라, 소거법으로 그 자리입니다.
--  다르면 상품 수정에서 사진 주소만 바꾸시면 됩니다.
--
--  기존 데이터 영향
--   · products.image_url 만 채웁니다. 이름이 다르면 아무 일도 안 합니다.
--   · **이미 사진을 넣어 둔 품목은 건드리지 않습니다**(사람이 바꾼 값을
--     마이그레이션이 되돌리면 안 됩니다).
--   · 단가·재고·주문·금액은 하나도 안 바뀝니다. 두 번 실행해도 같습니다.
-- ════════════════════════════════════════════════════════════════════════════

update public.products p
   set image_url = v.url, updated_at = now()
  from (values
  ('니트릴 검진장갑', '/products/nitrile-gloves.webp'),
  ('라텍스 검진장갑', '/products/latex-gloves.webp'),
  ('알코올 스왑', '/products/alcohol-swab.webp'),
  ('손소독제', '/products/hand-sanitizer.webp'),
  ('덴탈 마스크', '/products/dental-mask.webp'),
  ('멸균거즈', '/products/sterile-gauze.webp'),
  ('반창고(종이테이프)', '/products/paper-tape.webp'),
  ('일회용 방수시트', '/products/waterproof-sheet.webp'),
  ('성인용 기저귀', '/products/adult-diaper.webp'),
  ('물티슈(대형)', '/products/wet-wipe-roll.webp'),
  ('일회용 비닐장갑', '/products/vinyl-gloves.webp'),
  ('멸균 수술장갑', '/products/surgical-gloves.webp'),
  ('KF94 마스크', '/products/kf94-mask.webp'),
  ('일회용 수술가운', '/products/surgical-gown.webp'),
  ('일회용 방수앞치마', '/products/waterproof-apron.webp'),
  ('일회용 위생모', '/products/hair-cap.webp'),
  ('일회용 신발커버', '/products/shoe-cover.webp'),
  ('알코올 솜', '/products/alcohol-cotton.webp'),
  ('포비돈 소독액', '/products/povidone.webp'),
  ('생리식염수', '/products/saline.webp'),
  ('면봉', '/products/cotton-swab.webp'),
  ('탈지면', '/products/absorbent-cotton.webp'),
  ('탄력붕대', '/products/elastic-bandage.webp'),
  ('일반 거즈붕대', '/products/gauze-bandage.webp'),
  ('의료용 반창고', '/products/medical-tape.webp'),
  ('일회용 베드커버', '/products/bed-cover.webp'),
  ('언더패드', '/products/underpad.webp'),
  ('환자용 물티슈', '/products/wet-wipe.webp'),
  ('의료폐기물 전용 봉투', '/products/waste-bag.webp'),
  ('주사침 수거용기', '/products/sharps-container.webp')
) as v(name, url)
 where p.name = v.name
   and coalesce(p.image_url, '') = '';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 53 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;
