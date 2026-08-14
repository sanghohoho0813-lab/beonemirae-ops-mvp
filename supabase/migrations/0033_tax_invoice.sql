-- ─────────────────────────────────────────────────────────────────────────────
-- 0033. 세금계산서 발행 정보
--
--  매달 청구를 확정하고 거래명세서를 뽑은 뒤, 이사님은 홈택스를 열어
--  거래처마다 전자세금계산서를 발행합니다. 그때 필요한 값 —
--  사업자등록번호·상호·대표자·업태·종목·계산서 담당자 이메일 — 이
--  시스템에 한 칸도 없습니다. 그래서 거래처가 시스템에 있는데도
--  **세금계산서용 엑셀을 따로 유지**하고, 매달 금액을 그 엑셀에 옮겨
--  적어 홈택스에 넣습니다. Excel 로 돌아가는 자리가 여기입니다.
--
--  거래처 표에 칸을 더합니다. 별도 표를 만들지 않는 이유: 이 값들은
--  언제나 거래처 하나를 볼 때 같이 읽고 쓰며, 거래처당 한 벌뿐입니다.
--
--  ── 부가세를 자동으로 정하지 않습니다 ──────────────────────────────
--
--   지금 저장된 청구액이 공급가액인지 부가세가 든 합계인지는 계약마다
--   다릅니다. 실제 엑셀 11개에서 부가세가 적힌 곳은 목동현대웰병원
--   (지정폐기물 10% 별도) 한 곳뿐이었고, 나머지는 아무 표기가 없었습니다.
--   시스템이 임의로 10% 를 붙이거나 1/11 로 역산하면 틀린 세금계산서가
--   나갑니다.
--
--   그래서 vat_mode 는 **사람이 거래처마다 직접 정하는 값**입니다.
--   정하지 않으면(null) 발행 목록에서 「확인 필요」로 빠지고, 금액을
--   자동으로 계산하지 않습니다.
--
--     '별도'  청구액 = 공급가액 (세액을 따로 더해 발행)
--     '포함'  청구액 = 부가세 포함 합계 (1/11 로 역산)
--     '면세'  부가세 없음
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists biz_no      text,
  add column if not exists biz_ceo     text,
  add column if not exists biz_type    text,
  add column if not exists biz_item    text,
  add column if not exists tax_email   text,
  add column if not exists vat_mode    text;

--  값이 있을 때만 검사합니다. 기존 거래처는 전부 null 이라 그대로 통과합니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_vat_mode_check'
  ) then
    alter table public.clients
      add constraint clients_vat_mode_check
      check (vat_mode is null or vat_mode in ('별도', '포함', '면세'));
  end if;
end $$;

comment on column public.clients.biz_no is
  '사업자등록번호 (숫자 10자리, 하이픈 없이 저장). 세금계산서 발행에 씁니다.';
comment on column public.clients.vat_mode is
  '부가세 처리 — 별도 / 포함 / 면세. null = 미지정(사람이 확인해야 함).';

--  RLS 는 표 단위입니다. 거래처 표의 기존 정책이 그대로 적용되므로
--  새 정책을 만들지 않습니다 — 정책을 늘리면 어긋날 자리만 늘어납니다.


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 33 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0033). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
