-- ─────────────────────────────────────────────────────────────────────────────
-- 0036. 단가 적용기간 · 변경 이력
--
--  무엇이 문제였나
--
--   거래처 단가는 지금 `clients.pricing` 한 칸에 **현재 값만** 있습니다.
--   계약 중간에 단가가 바뀌면 그 값을 덮어씁니다. 그러면:
--
--    · 아직 확정하지 않은 지난달을 계산할 때 **새 단가가 적용**됩니다.
--      3월분을 아직 확정 안 했는데 4월에 950 → 1,000원으로 올리면,
--      3월 청구서가 1,000원으로 나갑니다. 병원에 잘못된 금액입니다.
--    · 대시보드 매출·거래처 리포트는 과거 달을 늘 새 단가로 다시
--      계산합니다. 작년 매출이 오늘 단가로 바뀝니다.
--    · 「언제부터 얼마였는지」가 어디에도 남지 않습니다. 병원이 물으면
--      계약서를 다시 뒤져야 합니다.
--
--   이미 **확정한 청구는 안전합니다** — 확정 순간의 명세서를 스냅샷으로
--   얼려 두기 때문입니다(0032). 위험한 것은 아직 확정하지 않은 달과
--   과거를 다시 계산하는 화면입니다.
--
--  무엇을 저장하는가
--
--   client_prices — 거래처 단가의 **판(version)**. 언제부터 적용하는지와
--   그때의 단가 전체를 함께 남깁니다.
--
--     effective_from  이 단가를 적용하기 시작한 날
--     pricing         그 시점의 단가 전체 (clients.pricing 과 같은 모양)
--
--   정산은 「그 달에 유효했던 판」을 씁니다. 판이 하나도 없으면 지금까지와
--   똑같이 clients.pricing 을 씁니다 — 마이그레이션만 실행하고 아무것도
--   넣지 않으면 동작이 달라지지 않습니다.
--
--  지키는 것
--
--   · 판을 지우지 않습니다. 지우면 과거 청구를 재현할 수 없습니다.
--     잘못 넣었으면 같은 날짜로 다시 넣어 덮어씁니다(이력에 남습니다).
--   · 단가는 청구 금액을 정합니다 — 넣고 고친 것 모두 감사기록에 남습니다.
--   · 읽기는 사무실·관리자. 현장에는 단가를 보여 주지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_prices (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  --  이 날부터 이 단가를 적용합니다 (그 날 포함)
  effective_from date not null,
  pricing        jsonb not null default '{}'::jsonb,
  memo           text not null default '',
  actor_id       uuid,
  actor_name     text not null default '',
  created_at     timestamptz not null default now(),
  unique (client_id, effective_from)
);

create index if not exists client_prices_client_idx
  on public.client_prices (client_id, effective_from desc);

alter table public.client_prices enable row level security;

drop policy if exists cp_read   on public.client_prices;
drop policy if exists cp_write  on public.client_prices;
drop policy if exists cp_update on public.client_prices;
drop policy if exists cp_delete on public.client_prices;

--  단가는 돈입니다 — 현장에는 보이지 않습니다.
create policy cp_read on public.client_prices
  for select using (public.is_staff());
create policy cp_write on public.client_prices
  for insert with check (public.is_staff());
create policy cp_update on public.client_prices
  for update using (public.is_staff()) with check (public.is_staff());
--  삭제 정책을 만들지 않습니다. 과거 청구를 재현할 수 없게 되기 때문입니다.

grant select, insert, update on public.client_prices to authenticated;


-- ── 단가 저장 (판을 남기면서) ───────────────────────────────────────────────
--
--  화면이 단가를 저장할 때 이 함수 하나만 부릅니다. 지금 단가
--  (clients.pricing) 와 판(client_prices) 이 한 트랜잭션에서 같이
--  움직여야 둘이 어긋나지 않습니다.

create or replace function public.set_client_pricing(
  p_client_id      uuid,
  p_pricing        jsonb,
  p_effective_from date default null,
  p_memo           text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.profiles%rowtype;
  v_name   text;
  v_before jsonb;
  v_from   date := coalesce(p_effective_from, (now() at time zone 'Asia/Seoul')::date);
  v_id     uuid;
  v_new    boolean;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if not public.is_staff() then
    raise exception '단가 변경은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_pricing is null or jsonb_typeof(p_pricing) <> 'object' then
    raise exception '단가 형식이 올바르지 않습니다.' using errcode = 'P0001';
  end if;

  select name, pricing into v_name, v_before from public.clients where id = p_client_id;
  if v_name is null then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  지금 단가
  update public.clients set pricing = p_pricing where id = p_client_id;

  --  판 — 같은 날짜로 다시 넣으면 덮어씁니다 (오타를 고칠 길)
  select id into v_id from public.client_prices
   where client_id = p_client_id and effective_from = v_from;
  v_new := v_id is null;

  insert into public.client_prices (client_id, effective_from, pricing, memo, actor_id, actor_name)
  values (p_client_id, v_from, p_pricing, coalesce(p_memo, ''), v_actor.id, coalesce(v_actor.name, ''))
  on conflict (client_id, effective_from) do update
    set pricing = excluded.pricing,
        memo = excluded.memo,
        actor_id = excluded.actor_id,
        actor_name = excluded.actor_name
  returning id into v_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, before_data, after_data, summary, screen, source)
  values
    ('client.pricing', 'client_prices', v_id::text, p_client_id, v_name,
     jsonb_build_object('pricing', v_before),
     jsonb_build_object('pricing', p_pricing, 'effectiveFrom', to_char(v_from, 'YYYY-MM-DD')),
     format('단가 %s — %s · %s 부터 적용',
            case when v_new then '변경' else '수정' end, v_name, to_char(v_from, 'YYYY-MM-DD')),
     '거래처 점검', 'app');

  return jsonb_build_object('id', v_id, 'effectiveFrom', to_char(v_from, 'YYYY-MM-DD'), 'created', v_new);
end;
$$;

revoke all on function public.set_client_pricing(uuid, jsonb, date, text) from public;
grant execute on function public.set_client_pricing(uuid, jsonb, date, text) to authenticated;

comment on table public.client_prices is
  '거래처 단가의 판 (0036). 정산은 그 달에 유효했던 판을 씁니다 — 과거 달이 오늘 단가로 바뀌지 않게.';
comment on function public.set_client_pricing(uuid, jsonb, date, text) is
  '단가 저장 (0036). 지금 단가와 판을 한 트랜잭션에서 함께 갱신하고 감사기록을 남깁니다.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 36 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0036). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
