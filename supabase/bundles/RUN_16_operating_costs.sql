-- 비원미래 운영 DB — 16차 (0030)
-- 월 운영비 · 영업이익. 앞의 묶음(RUN_1~15)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0030_operating_costs.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0030. 월 운영비 — 「기여이익」을 「영업이익」으로
--
--  무엇이 문제였나
--
--   경영 요약의 이익은 **매출 − 처리비 − 자재비** 였습니다. 화면에도
--   「운송비·인건비·차량 유지비는 빠져 있습니다」라고 적어 두었지만, 빠진
--   금액이 얼마인지는 어디에도 없었습니다. 폐기물 수집·운반업에서 기사
--   인건비와 유류비는 원가의 큰 부분입니다. 그게 빠진 이익률을 보고
--   단가를 정하면 남는 줄 알았던 거래처가 실제로는 적자일 수 있습니다.
--
--  무엇을 저장하는가
--
--   operating_costs — 그 달 회사가 쓴 운영비. 항목별로 한 줄씩.
--   시스템이 추정하지 않습니다. 대표님이 실제로 나간 돈을 넣습니다.
--
--  지키는 것
--
--   · 운영비를 넣지 않은 달은 영업이익을 **계산하지 않습니다.** 0원으로
--     두고 「영업이익 = 기여이익」처럼 보여 주면 이익을 부풀리는 것입니다.
--     화면은 「운영비 미입력」이라고 적습니다.
--   · 아직 오지 않은 달에는 넣지 않습니다. 예산은 쓴 돈이 아닙니다.
--   · 돈 기록이라 현장 담당자에게는 보이지 않습니다(읽기 사무실·관리자).
--     넣고 지우는 것은 관리자만 — 회사 인건비는 대표님 자리입니다.
--   · 넣고 고치고 지운 것 모두 감사기록에 남습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.operating_costs (
  id         uuid primary key default gen_random_uuid(),
  --  YYYY-MM
  month      text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  --  실제 이 업종에 있는 항목만. 늘리려면 마이그레이션으로 늘립니다 —
  --  자유 입력으로 두면 달마다 이름이 달라져 비교가 안 됩니다.
  category   text not null check (category in (
               '인건비', '유류비', '차량 유지비', '임차료·수수료', '기타 운영비')),
  amount     bigint not null check (amount >= 0),
  memo       text not null default '',
  actor_id   uuid,
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, category)
);

create index if not exists operating_costs_month_idx on public.operating_costs (month);

alter table public.operating_costs enable row level security;

drop policy if exists oc_read   on public.operating_costs;
drop policy if exists oc_write  on public.operating_costs;
drop policy if exists oc_update on public.operating_costs;
drop policy if exists oc_delete on public.operating_costs;

--  읽기는 사무실·관리자, 쓰기는 관리자.
create policy oc_read on public.operating_costs
  for select using (public.is_staff());
create policy oc_write on public.operating_costs
  for insert with check (public.is_admin());
create policy oc_update on public.operating_costs
  for update using (public.is_admin()) with check (public.is_admin());
create policy oc_delete on public.operating_costs
  for delete using (public.is_admin());

grant select, insert, update, delete on public.operating_costs to authenticated;

drop trigger if exists operating_costs_touch on public.operating_costs;
create trigger operating_costs_touch
  before update on public.operating_costs
  for each row execute function public.touch_updated_at();


-- ── 운영비 입력 (관리자) ────────────────────────────────────────────────────
--
--  같은 달·같은 항목을 다시 넣으면 덮어씁니다. 매달 한 번 정리해 넣는
--  자리라 「지우고 다시 넣기」보다 이쪽이 실제 손에 맞습니다. 대신 바뀐
--  전후 금액을 감사기록에 남깁니다.

create or replace function public.set_operating_cost(
  p_month    text,
  p_category text,
  p_amount   bigint,
  p_memo     text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_before public.operating_costs%rowtype;
  v_id     uuid;
  v_total  bigint;
  v_month  text := (to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM'));
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_admin() then
    raise exception '운영비 입력은 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '월 표기가 올바르지 않습니다: %', coalesce(p_month, '(없음)') using errcode = 'P0001';
  end if;
  if p_month > v_month then
    raise exception '아직 오지 않은 달(%)의 운영비는 넣을 수 없습니다. 예산은 쓴 돈이 아닙니다.', p_month
      using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception '운영비는 0원 이상이어야 합니다.' using errcode = 'P0001';
  end if;

  select * into v_before from public.operating_costs
   where month = p_month and category = p_category;

  insert into public.operating_costs (month, category, amount, memo, actor_id, actor_name)
  values (p_month, p_category, p_amount, coalesce(p_memo, ''), v_actor.id, coalesce(v_actor.name, ''))
  on conflict (month, category) do update
    set amount = excluded.amount,
        memo = excluded.memo,
        actor_id = excluded.actor_id,
        actor_name = excluded.actor_name
  returning id into v_id;

  select coalesce(sum(amount), 0) into v_total from public.operating_costs where month = p_month;

  insert into public.audit_logs
    (action, entity, entity_id, before_data, after_data, summary, screen, source)
  values
    ('cost.set', 'operating_costs', v_id::text,
     case when v_before.id is null then null
          else jsonb_build_object('amount', v_before.amount, 'memo', v_before.memo) end,
     jsonb_build_object('month', p_month, 'category', p_category,
                        'amount', p_amount, 'memo', coalesce(p_memo, ''), 'monthTotal', v_total),
     format('운영비 %s — %s월 %s %s원%s · 그 달 합계 %s원',
            case when v_before.id is null then '입력' else '수정' end,
            p_month, p_category, to_char(p_amount, 'FM999,999,999'),
            case when v_before.id is null then ''
                 else format(' (이전 %s원)', to_char(v_before.amount, 'FM999,999,999')) end,
            to_char(v_total, 'FM999,999,999')),
     '경영 요약', 'app');

  return jsonb_build_object('id', v_id, 'month', p_month, 'category', p_category,
                            'amount', p_amount, 'monthTotal', v_total);
end;
$$;

revoke all on function public.set_operating_cost(text, text, bigint, text) from public;
grant execute on function public.set_operating_cost(text, text, bigint, text) to authenticated;


-- ── 운영비 삭제 (관리자) ────────────────────────────────────────────────────

create or replace function public.delete_operating_cost(p_month text, p_category text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.operating_costs%rowtype;
  v_total  bigint;
begin
  if not public.is_admin() then
    raise exception '운영비 삭제는 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_before from public.operating_costs
   where month = p_month and category = p_category;
  if not found then
    raise exception '지울 운영비 기록을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  delete from public.operating_costs where id = v_before.id;
  select coalesce(sum(amount), 0) into v_total from public.operating_costs where month = p_month;

  insert into public.audit_logs
    (action, entity, entity_id, before_data, summary, screen, source)
  values
    ('cost.delete', 'operating_costs', v_before.id::text,
     jsonb_build_object('month', v_before.month, 'category', v_before.category,
                        'amount', v_before.amount, 'memo', v_before.memo),
     format('운영비 삭제 — %s월 %s %s원 · 그 달 합계 %s원',
            v_before.month, v_before.category,
            to_char(v_before.amount, 'FM999,999,999'), to_char(v_total, 'FM999,999,999')),
     '경영 요약', 'app');

  return jsonb_build_object('month', p_month, 'category', p_category, 'monthTotal', v_total);
end;
$$;

revoke all on function public.delete_operating_cost(text, text) from public;
grant execute on function public.delete_operating_cost(text, text) to authenticated;

comment on table public.operating_costs is
  '월 운영비 (0030). 시스템이 추정하지 않고 대표가 실제 나간 돈을 넣습니다 — 영업이익 계산의 근거.';
comment on function public.set_operating_cost(text, text, bigint, text) is
  '월 운영비 입력·수정 (0030). 같은 달·항목은 덮어쓰고 전후 금액을 감사기록에 남깁니다.';
