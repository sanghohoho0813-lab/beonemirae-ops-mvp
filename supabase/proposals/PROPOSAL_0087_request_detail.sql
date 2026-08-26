-- ════════════════════════════════════════════════════════════════════════════
-- 0087 — 병원이 올리는 수거 요청에 「무엇을 · 얼마나」를 적을 칸
--
--  대표님 2차 브리프: 「수거 요청 화면 — 희망 수거일 / 폐기물 유형 / 예상
--  수거량 / 첨부 영역이 실제로 동작해야 한다.」
--
--  ── 지금 있는 것 ────────────────────────────────────────────────────────
--    희망 수거일   client_requests.desired_date   ✔ 이미 있고 화면도 있습니다
--    긴급 여부     client_requests.urgent          ✔ 이미 있습니다
--    내용          client_requests.content         ✔ 자유 글입니다
--
--  ── 없는 것 ─────────────────────────────────────────────────────────────
--    폐기물 유형   병원이 「의료폐기물인지 기저귀인지」를 고를 칸이 없습니다.
--    예상 수거량   「몇 kg 쯤 됩니다」를 적을 칸이 없습니다.
--
--  이 둘이 왜 중요한가 — **차를 고르는 근거**입니다. 지금은 요청을 받고
--  배차 담당이 병원에 전화해서 다시 묻고 있습니다. 요청함에 적혀 있으면
--  그 전화가 없어집니다. 자유 글(content)에 적어 달라고 할 수도 있지만,
--  그러면 「기저귀 좀 많이」 같은 문장이 남고 **골라낼 수가 없습니다.**
--  칸으로 두어야 목록에서 거르고 셀 수 있습니다.
--
--  ⚠ 첨부(사진)는 이번에 **안 합니다.** Storage 버킷·용량 정책·보존기간을
--    정하지 않은 채로 파일을 받기 시작하면 되돌리기 어렵습니다. 의료기관
--    사진에는 환자 정보가 찍혀 들어올 수 있어 더 그렇습니다. 대표님이
--    보존기간과 열람 범위를 정해 주시면 그때 따로 올리겠습니다.
--    그때까지 화면에도 첨부 자리를 만들지 않습니다 — 눌러도 아무 일이
--    없는 자리를 만드는 것이 대표님이 금지하신 바로 그것입니다.
--
--  ⚠ 두 칸 모두 **비워 둘 수 있습니다(null).** 필수로 만들면 급한 병원이
--    「몰라서」 요청을 못 올립니다. 비어 있으면 「모른다」이고, 화면에도
--    0 이 아니라 「적지 않으심」으로 나옵니다.
--
--  ⚠ 기존 자료는 **건드리지 않습니다.** 이미 올라온 요청의 두 칸은 null 로
--    남습니다 — 지난 요청의 유형을 저희가 짐작해 채우지 않습니다.
--
--  여러 번 실행해도 같은 결과입니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 칸 두 개 ──────────────────────────────────────────────────────────────
alter table public.client_requests
  add column if not exists waste_type  text,
  add column if not exists expected_kg numeric(10, 2);

--  ⚠ 유형은 아무 글이나 못 들어가게 막습니다. 표기가 갈리면
--    (「의료 폐기물」·「의료폐기물」) 세는 순간 둘로 갈라집니다.
--    schedules.waste_type 과 **같은 말**을 씁니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_requests'::regclass
       and conname  = 'client_requests_waste_type_chk'
  ) then
    alter table public.client_requests
      add constraint client_requests_waste_type_chk
      check (waste_type is null or waste_type in ('의료폐기물', '일회용기저귀'));
  end if;
end $$;

--  ⚠ 예상량은 음수일 수 없고, 터무니없는 값도 막습니다. 한 번 수거에
--    5톤이 나오는 병원은 없습니다 — 손가락이 미끄러진 것입니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_requests'::regclass
       and conname  = 'client_requests_expected_kg_chk'
  ) then
    alter table public.client_requests
      add constraint client_requests_expected_kg_chk
      check (expected_kg is null or (expected_kg > 0 and expected_kg <= 5000));
  end if;
end $$;

comment on column public.client_requests.waste_type is
  '병원이 고른 폐기물 유형. null = 적지 않음 (짐작해 채우지 않습니다)';
comment on column public.client_requests.expected_kg is
  '병원이 어림한 배출량(kg). null = 모름. 실제 수거량이 아닙니다 — 배차 참고값입니다';

-- ── ② 판(schema) 번호 ───────────────────────────────────────────────────────
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 87 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   ① 두 칸이 다 true 여야 합니다
--   ② 87 이어야 합니다
--   ③ 0 이어야 합니다 — 기존 요청을 저희가 채워 넣지 않았다는 뜻입니다
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'client_requests'
      and column_name in ('waste_type', 'expected_kg')) = 2 as "칸 두 개 생김";
select public.app_schema_version() as "판 번호";
select count(*) as "저희가 채워 넣은 값" from public.client_requests
 where waste_type is not null or expected_kg is not null;
