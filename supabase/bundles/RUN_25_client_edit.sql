-- 비원미래 운영 DB — 26차 (0039)
-- 거래처 정보 빈칸 + 거래처 삭제. 앞의 묶음(RUN_1~24)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0039_client_edit.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0039. 거래처 정보 빈칸 채우기 + 거래처 삭제
--
--  무엇이 문제였나
--
--   1) **화면에 보이는데 넣을 수 없는 값이 있었습니다.**
--
--      거래처 「운영조건」 탭은 수거 가능시간과 처리장을 「미등록」으로
--      보여 줍니다. 그런데 그 둘은 저장하는 칸이 아예 없어서, 넣고 싶어도
--      넣을 방법이 없었습니다. 화면은 계속 「미등록」이라고 말하고,
--      이사님은 그 정보를 다시 엑셀이나 수첩에 적게 됩니다.
--
--      일회용기저귀 수거주기도 마찬가지입니다. 의료폐기물과 같은 칸
--      (collection_cycle)을 나눠 쓰고 있어서, 「의료폐기물 주 2회 ·
--      기저귀 주 1회」처럼 다른 주기를 넣을 수 없었습니다.
--
--   2) **거래처를 지울 방법이 없었습니다.**
--
--      잘못 만든 거래처(오타로 두 번 등록, 시험 삼아 만든 것)가 목록에
--      영원히 남습니다. 「거래 종료」로 숨길 수는 있지만 그건 실제로
--      거래하던 곳을 정리하는 뜻이라, 잘못 만든 것과 구분되지 않습니다.
--
--  어떻게 하나
--
--   빈칸은 칸을 만들어 채웁니다. 삭제는 **기록이 하나도 없을 때만**
--   허용합니다.
--
--   수거·청구·자재·요청·메모가 한 건이라도 있으면 지우지 않습니다.
--   지우면 그 기록들이 주인 없는 자료가 되고, 지난 매출·미수금이
--   바뀝니다. 그런 거래처는 지금처럼 「거래 종료」로 둡니다 — 목록에서는
--   빠지고 기록은 그대로 남습니다.
--
--   무엇 때문에 못 지우는지 숫자로 알려 줍니다. 「안 됩니다」만 나오면
--   왜인지 몰라 같은 시도를 반복하게 됩니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. 빈칸 만들기 ──────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists collect_time  text not null default '',
  add column if not exists disposal_site text not null default '',
  add column if not exists diaper_cycle  text not null default '';

comment on column public.clients.collect_time is
  '수거 가능시간 (0039). 예: 평일 09:00~17:00 · 점심시간 제외. 화면에 있는데 넣을 칸이 없었습니다.';
comment on column public.clients.disposal_site is
  '처리장·처리업체 (0039). 이 거래처 폐기물을 어디로 넘기는지.';
comment on column public.clients.diaper_cycle is
  '일회용기저귀 수거주기 (0039). 비어 있으면 의료폐기물 주기를 함께 씁니다.';


-- ── 2. 거래처 삭제 (기록이 없을 때만) ───────────────────────────────────────

create or replace function public.delete_client(
  p_client_id uuid,
  p_reason    text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    public.profiles%rowtype;
  v_client   public.clients%rowtype;
  v_sched    bigint;
  v_pay      bigint;
  v_mat      bigint;
  v_req      bigint;
  v_note     bigint;
  v_xl       bigint;
  v_blockers text[] := '{}';
begin
  select * into v_actor from public.profiles where id = auth.uid();
  --  거래처를 지우는 것은 되돌릴 수 없습니다 — 관리자만.
  if not public.is_admin() then
    raise exception '거래처 삭제는 관리자만 할 수 있습니다. 거래를 정리하는 것이라면 「거래 종료」를 쓰세요.'
      using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception '지울 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select count(*) into v_sched from public.schedules              where client_id = p_client_id;
  select count(*) into v_pay   from public.payments               where client_id = p_client_id;
  select count(*) into v_mat   from public.materials             where client_id = p_client_id;
  select count(*) into v_req   from public.client_requests        where client_id = p_client_id;
  select count(*) into v_note  from public.site_notes             where client_id = p_client_id;
  select count(*) into v_xl    from public.client_monthly_actuals where client_id = p_client_id;

  if v_sched > 0 then v_blockers := v_blockers || format('수거 %s건', v_sched); end if;
  if v_pay   > 0 then v_blockers := v_blockers || format('청구 %s건', v_pay);   end if;
  if v_mat   > 0 then v_blockers := v_blockers || format('자재 공급 %s건', v_mat); end if;
  if v_req   > 0 then v_blockers := v_blockers || format('요청 %s건', v_req);   end if;
  if v_note  > 0 then v_blockers := v_blockers || format('현장 메모 %s건', v_note); end if;
  if v_xl    > 0 then v_blockers := v_blockers || format('엑셀 월 실적 %s건', v_xl); end if;

  --  기록이 있으면 지우지 않습니다. 무엇 때문인지 숫자로 알려 줍니다.
  if array_length(v_blockers, 1) > 0 then
    --  plpgsql 의 raise 는 자리표시자가 % 입니다. %s 로 적으면 「병원s」처럼
    --  엉뚱한 s 가 붙은 문장이 그대로 대표님께 보입니다.
    raise exception '「%」에는 % 기록이 있어 지울 수 없습니다. 지우면 지난 매출·미수금이 바뀝니다 — 「거래 종료」로 정리해 주세요.',
      v_client.name, array_to_string(v_blockers, ' · ')
      using errcode = 'P0001';
  end if;

  --  기록이 없어도 지운 사실은 남깁니다. 거래처 삭제는 되돌릴 수 없습니다.
  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, summary, screen, source)
  values
    ('client.delete', 'clients', p_client_id::text, null, v_client.name,
     jsonb_build_object('name', v_client.name, 'type', v_client.type,
                        'address', v_client.address, 'phone', v_client.phone),
     format('거래처 삭제 — %s (기록 없음)%s',
            v_client.name,
            case when coalesce(btrim(p_reason), '') = '' then '' else ' · ' || btrim(p_reason) end),
     '거래처', 'app');

  delete from public.clients where id = p_client_id;

  return jsonb_build_object('name', v_client.name, 'deleted', true);
end;
$$;

revoke all on function public.delete_client(uuid, text) from public;
grant execute on function public.delete_client(uuid, text) to authenticated;

comment on function public.delete_client(uuid, text) is
  '거래처 삭제 (0039). 수거·청구·자재·요청·메모·엑셀 실적이 한 건이라도 있으면 거부합니다 — 그런 곳은 「거래 종료」로 둡니다.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 39 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0039). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
