-- 비원미래 운영 DB — 25차 (0038)
-- 월 매출 직접입력·조정. 앞의 묶음(RUN_1~23)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0038_revenue_override.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0038. 월 매출 직접입력 · 조정
--
--  무엇이 문제였나
--
--   한 달의 회사 매출이 화면마다 다른 값이었습니다.
--
--    경영 요약 · 통계   완료된 수거 기록 × 지금 단가로 **다시 계산**한 값
--    미수금 · 월말 청구 **확정한 청구**(payments)의 합계
--    엑셀 월 실적       가져와서 저장은 했는데 **회사 매출에는 안 들어감**
--
--   그래서:
--
--    · 엑셀에서만 넘어온 거래처(명세서에 날짜가 없어 월 합계만 있는 곳)는
--      회사 매출에서 **통째로 빠졌습니다.** 대표님이 보는 매출이 실제보다
--      작았습니다.
--    · 확정한 달인데도 화면은 오늘 단가로 다시 계산했습니다. 확정 금액과
--      화면 매출이 어긋날 수 있었습니다.
--    · 그러면서 화면에는 「확정 청구 + 미확정 정산」이라고 적혀 있었습니다.
--
--  어떻게 하나 — 한 달에 하나의 값
--
--   거래처 × 월 마다 **딱 하나**의 매출값만 채택합니다. 우선순위:
--
--    1. 직접입력·조정   사람이 근거를 갖고 넣은 값 (이 표)
--    2. 확정 청구       그 달 확정한 청구 합계 (취소 제외)
--    3. 엑셀 실적       가져온 월 합계
--    4. 운영 기록       완료된 수거·공급 × 단가 (아직 확정 전 — 추정)
--
--   회사 월 매출은 거래처별 채택값의 합입니다. 한 거래처의 한 달은 어느
--   경우에도 한 번만 더해집니다 — **중복 집계가 구조적으로 불가능합니다.**
--
--  이 표가 하는 일
--
--   위 1번, 사람이 넣는 값입니다. 계약서에는 있는데 시스템에 기록이 없는
--   달, 엑셀 값이 실제와 다른 달을 바로잡습니다.
--
--  지키는 것
--
--   · **사유 없이 넣지 못합니다.** 몇 달 뒤에 왜 이 값인지 답할 수 있어야
--     합니다.
--   · 기존 값이 있으면 조용히 덮어쓰지 않습니다. 함수가 이전 값을 함께
--     돌려주고, 감사기록에 before/after 를 남깁니다. 화면은 그 값을
--     보여 준 뒤 다시 확인받습니다.
--   · 지우는 것도 함수로만 — 조정을 되돌린 사실이 기록에 남습니다.
--   · 매출은 돈입니다. 현장 담당자에게는 보이지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.revenue_overrides (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  --  'YYYY-MM'
  month      text not null,
  amount     bigint not null,
  --  왜 이 값인지 — 비워 둘 수 없습니다
  reason     text not null,
  actor_id   uuid,
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month),
  constraint revenue_overrides_month_check check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint revenue_overrides_amount_check check (amount >= 0),
  constraint revenue_overrides_reason_check check (btrim(reason) <> '')
);

create index if not exists revenue_overrides_month_idx
  on public.revenue_overrides (month, client_id);

alter table public.revenue_overrides enable row level security;

drop policy if exists ro_read   on public.revenue_overrides;
drop policy if exists ro_write  on public.revenue_overrides;
drop policy if exists ro_update on public.revenue_overrides;
drop policy if exists ro_delete on public.revenue_overrides;

--  매출은 돈입니다 — 현장에는 보이지 않습니다.
create policy ro_read on public.revenue_overrides
  for select using (public.is_staff());

--  넣고 지우는 것은 함수로만 합니다. 사유와 감사기록이 같은 트랜잭션에서
--  움직여야 「누가 왜 바꿨는지」가 비지 않습니다.
--
--  0004 가 `alter default privileges` 로 **새로 만드는 모든 표**에
--  insert/update/delete 를 authenticated 에게 미리 줍니다. 그래서 여기서
--  거두지 않으면 표를 직접 고칠 수 있습니다. 읽기 정책만 있으면 update·
--  delete 는 오류도 없이 0줄만 바꾸고 조용히 끝납니다 — 아무 일도 안
--  일어나지만, 그 사실을 아무도 모릅니다. 권한을 거둬 시끄럽게 막습니다.
grant select on public.revenue_overrides to authenticated;
revoke insert, update, delete on public.revenue_overrides from authenticated;


-- ── 같은 구멍 하나 더 — 단가 판 (0036) ─────────────────────────────────────
--
--  재감사에서 같은 것이 나왔습니다. client_prices 도 화면은 함수
--  (set_client_pricing)로만 쓰는데, 표 자체에는 insert/update 권한이 열려
--  있었습니다. 직접 넣으면 **감사기록 없이 과거 단가를 만들 수 있습니다** —
--  지난달 청구 금액의 근거가 조용히 바뀝니다.
--
--  함수는 security definer 라 표 권한과 무관하게 동작합니다. 화면 동작은
--  그대로이고, 직접 쓰는 길만 닫힙니다.

drop policy if exists cp_write  on public.client_prices;
drop policy if exists cp_update on public.client_prices;
revoke insert, update, delete on public.client_prices from authenticated;


-- ── 조정 넣기 · 고치기 ──────────────────────────────────────────────────────

create or replace function public.set_revenue_override(
  p_client_id uuid,
  p_month     text,
  p_amount    bigint,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_name   text;
  v_before bigint;
  v_id     uuid;
  v_new    boolean;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '매출 조정은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '대상월이 올바르지 않습니다: %', coalesce(p_month, '(없음)') using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception '매출액은 0원 이상이어야 합니다.' using errcode = 'P0001';
  end if;
  --  왜 이 값인지 적지 않으면 몇 달 뒤에 아무도 답할 수 없습니다.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception '조정 사유를 적어 주세요. 몇 달 뒤에 왜 이 금액인지 답할 수 있어야 합니다.'
      using errcode = 'P0001';
  end if;

  select name into v_name from public.clients where id = p_client_id;
  if v_name is null then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select amount into v_before from public.revenue_overrides
   where client_id = p_client_id and month = p_month;
  v_new := v_before is null;

  insert into public.revenue_overrides
    (client_id, month, amount, reason, actor_id, actor_name)
  values
    (p_client_id, p_month, p_amount, btrim(p_reason), v_actor.id, coalesce(v_actor.name, ''))
  on conflict (client_id, month) do update
    set amount = excluded.amount,
        reason = excluded.reason,
        actor_id = excluded.actor_id,
        actor_name = excluded.actor_name,
        updated_at = now()
  returning id into v_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, after_data, summary, screen, source)
  values
    ('revenue.override', 'revenue_overrides', v_id::text, p_client_id, v_name,
     case when v_new then null else jsonb_build_object('amount', v_before) end,
     jsonb_build_object('month', p_month, 'amount', p_amount, 'reason', btrim(p_reason)),
     format('매출 %s — %s %s월 · %s원%s · %s',
            case when v_new then '직접입력' else '조정' end,
            v_name, p_month, to_char(p_amount, 'FM999,999,999'),
            case when v_new then '' else format(' (이전 %s원)', to_char(v_before, 'FM999,999,999')) end,
            btrim(p_reason)),
     '매출 현황', 'app');

  return jsonb_build_object('id', v_id, 'created', v_new, 'before', v_before, 'amount', p_amount);
end;
$$;

revoke all on function public.set_revenue_override(uuid, text, bigint, text) from public;
grant execute on function public.set_revenue_override(uuid, text, bigint, text) to authenticated;


-- ── 조정 되돌리기 ───────────────────────────────────────────────────────────
--
--  지우면 그 달은 다시 확정 청구 → 엑셀 실적 → 운영 기록 순서로 돌아갑니다.

create or replace function public.delete_revenue_override(
  p_client_id uuid,
  p_month     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.revenue_overrides%rowtype;
  v_name  text;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '매출 조정 삭제는 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_row from public.revenue_overrides
   where client_id = p_client_id and month = p_month;
  if not found then
    raise exception '되돌릴 매출 조정을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select name into v_name from public.clients where id = p_client_id;
  delete from public.revenue_overrides where id = v_row.id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, summary, screen, source)
  values
    ('revenue.override.delete', 'revenue_overrides', v_row.id::text, p_client_id, coalesce(v_name, ''),
     jsonb_build_object('month', v_row.month, 'amount', v_row.amount, 'reason', v_row.reason),
     format('매출 조정 되돌림 — %s %s월 · %s원',
            coalesce(v_name, '거래처'), v_row.month, to_char(v_row.amount, 'FM999,999,999')),
     '매출 현황', 'app');

  return jsonb_build_object('month', v_row.month, 'amount', v_row.amount);
end;
$$;

revoke all on function public.delete_revenue_override(uuid, text) from public;
grant execute on function public.delete_revenue_override(uuid, text) to authenticated;

comment on table public.revenue_overrides is
  '거래처 × 월 매출 직접입력·조정 (0038). 사유 필수. 집계 우선순위 1위 — 한 달에 하나의 값만 채택됩니다.';
comment on function public.set_revenue_override(uuid, text, bigint, text) is
  '매출 조정 저장 (0038). 사유 없이 넣지 못하고, 이전 값을 감사기록에 남깁니다.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 38 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0038). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
