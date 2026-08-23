-- ════════════════════════════════════════════════════════════════════════════
-- 0073 — 오늘 업무 마감 · 수거 취소 사유
--
--  실제 3일 파일럿 전에, **다시 카카오톡으로 돌아갈 이유** 하나와
--  **감사 품질** 하나를 닫습니다. 새 기능을 늘리는 것이 목적이 아닙니다.
--
--   ① 오늘 업무 마감  기사님이 하루치를 다 넣고 나서, 같은 내용을 카톡으로
--                     다시 보고하지 않아도 되게. 시스템이 이미 아는 것은
--                     **다시 입력받지 않습니다** — 눌러서 「끝」만 찍습니다.
--   ② 수거 취소 사유  취소는 이미 됩니다(revert_collection). **왜** 취소했는지가
--                     안 남습니다. 돈과 재고가 함께 되돌아가는 일이라
--                     이유 없는 되돌리기는 나중에 아무도 설명하지 못합니다.
--
--  ⚠ 공용차량 사용·반납은 **여기에 안 넣었습니다.** 0070 에 이미 예약·해제가
--    있습니다(vehicle_reservations · SharedTruck · 병원 계정 차단까지 RLS).
--    같은 것을 두 벌 만들면 「어느 쪽이 진짜인가」가 생기고, 그때부터 현장과
--    사무실이 서로 다른 화면을 봅니다.
--
--  ⚠ 지우지 않습니다. 두 번 눌러도 두 번 처리되지 않습니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 오늘 업무 마감 ────────────────────────────────────────────────────────
create table if not exists public.day_closes (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  --  ⚠ 이름을 **여기에 같이 얼려 둡니다.** 현장 계정은 남의 프로필을 못
  --    읽습니다(RLS). 사무실 화면이 「김OO 기사 마감」이라고 적으려면
  --    profiles 를 다시 읽어야 하는데, 그 권한을 열면 현장 계정이 남의
  --    개인정보를 읽게 됩니다. 마감 순간의 이름만 옮겨 적습니다.
  profile_name text not null default '',
  date       date not null,
  note       text not null default '',
  --  마감 순간에 시스템이 센 값 — 나중에 「그때 몇 건이었나」를 다시 계산하지
  --  않아도 되게 그대로 얼려 둡니다. 일정이 나중에 바뀌어도 이 값은 그날의 기록입니다.
  summary    jsonb not null default '{}'::jsonb,
  closed_at  timestamptz not null default now(),
  --  ⚠ 한 사람이 하루에 한 번. 연타해도 두 줄이 되지 않습니다.
  unique (profile_id, date)
);
alter table public.day_closes add column if not exists profile_name text not null default '';
create index if not exists day_closes_date_idx on public.day_closes(date desc);

alter table public.day_closes enable row level security;

--  본인 것은 보고, 사무실·관리자는 전부 봅니다.
--  ⚠ 병원 계정(client)은 아무것도 못 봅니다 — 내부 근무 기록입니다.
drop policy if exists day_closes_select on public.day_closes;
create policy day_closes_select on public.day_closes
  for select using (profile_id = auth.uid() or public.is_staff());

drop policy if exists day_closes_insert on public.day_closes;
create policy day_closes_insert on public.day_closes
  for insert with check (profile_id = auth.uid() and public.auth_role() in ('field','office','admin'));

--  ⚠ update / delete 정책을 만들지 않습니다 = 마감은 **고쳐지지 않습니다.**
--    근무 기록이라 조용히 덮어쓸 수 있으면 기록이 아닙니다.

comment on table public.day_closes is
  '오늘 업무 마감 (0073). 하루 한 번. 고칠 수 없습니다 — 근무 기록입니다.';

create or replace function public.close_day(
  p_date date,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_sum   jsonb;
  v_id    uuid;
  v_open  integer;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role = 'client' then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  --  ⚠ 오늘과 어제만. 어제를 열어 둔 이유는 밤늦게 끝나 다음 날 아침에
  --    누르는 경우가 실제로 있기 때문입니다.
  if p_date > (now() at time zone 'Asia/Seoul')::date
     or p_date < (now() at time zone 'Asia/Seoul')::date - 1 then
    raise exception '오늘 또는 어제만 마감할 수 있습니다.' using errcode = 'P0001';
  end if;

  --  그날 **이 사람의** 일정으로 셉니다. 기사님이 다시 입력하지 않습니다.
  select jsonb_build_object(
           'planned', count(*),
           'done',    count(*) filter (where status = '완료'),
           'left',    count(*) filter (where status <> '완료'),
           'kg',      coalesce(sum(actual_amount) filter (where status = '완료'), 0)
         )
    into v_sum
    from schedules
   where date = p_date
     and (vehicle_id = v_actor.vehicle_id or updated_by = v_actor.id);

  --  아직 안 놓은 공용차 예약이 있으면 함께 담습니다 — 화면이
  --  「반납(해제)부터 하세요」라고 말할 수 있게.
  select count(*) into v_open from vehicle_reservations
   where profile_id = v_actor.id and date = p_date;
  v_sum := v_sum || jsonb_build_object('openVehicles', v_open);

  insert into day_closes (profile_id, profile_name, date, note, summary)
  values (v_actor.id, coalesce(v_actor.name, ''), p_date, coalesce(p_note, ''), v_sum)
  on conflict (profile_id, date) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('already', true, 'summary', v_sum);
  end if;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'day.close', 'day_closes', v_id::text,
          p_date::text || ' 업무 마감');

  return jsonb_build_object('already', false, 'summary', v_sum);
end $$;

-- ── ② 수거 취소 사유 ────────────────────────────────────────────────────────
--   기존 revert_collection(uuid) 은 **그대로 둡니다** — 이미 쓰이고 있고,
--   지우면 배포 순서가 어긋나는 순간 화면이 통째로 멎습니다.
create or replace function public.revert_collection_with_reason(
  p_event_id uuid,
  p_reason   text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_out   jsonb;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception '취소 사유를 적어 주세요.' using errcode = 'P0001';
  end if;

  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  --  되돌리는 일 자체는 기존 함수가 합니다 — 자재 원복 · 일정 복원 · 중복
  --  방지가 전부 거기 있습니다. 여기서 다시 구현하면 두 벌이 되어 어긋납니다.
  v_out := public.revert_collection(p_event_id);

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.revert.reason',
          'collection_events', p_event_id::text, btrim(p_reason));

  return coalesce(v_out, '{}'::jsonb) || jsonb_build_object('reason', btrim(p_reason));
end $$;

-- ── ③ 확정한 청구에 들어간 수거는 되돌리지 못하게 ──────────────────────────
--
--   ⚠ 이건 **화면이 이미 하고 있다고 말하던 약속**입니다. 되돌리기 창에
--     「확정한 청구가 있으면 서버가 막습니다」라고 적혀 있는데, 실제로는
--     막는 자리가 어디에도 없었습니다. 지키지 않는 약속이 화면에 적혀 있는
--     것이 제일 나쁩니다 — 사람은 그 말을 믿고 누릅니다.
--
--   무엇이 어긋나나: 확정한 청구는 그 순간의 명세서를 스냅샷으로 굳혀 둡니다
--   (0017). 그래서 나중에 수거를 되돌려도 **청구 금액은 안 바뀝니다.**
--   그런데 수거이력에서는 그 수거가 사라집니다. 그러면 병원에 보낸 명세서에는
--   있는 수거가 우리 이력에는 없습니다 — 금액을 두고 다툴 때 설명할 방법이
--   없어집니다.
--
--   ⚠ revert_collection 본문을 베껴 고치지 않습니다. 90줄짜리를 두 벌로
--     만들면 다음에 한쪽만 고쳐집니다. **되돌림 표시가 찍히는 순간**을
--     방아쇠로 잡습니다 — 예외가 나면 그 호출 전체가 통째로 무릅니다.
--     그래서 사유 갈래든 옛 갈래든 어느 쪽으로 와도 똑같이 막힙니다.
create or replace function public.guard_revert_billed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_month text;
begin
  if new.reverted and not coalesce(old.reverted, false) then
    select p.billing_month into v_month
      from public.payments p
     where p.client_id = new.client_id
       and p.status <> '취소'
       and coalesce(p.snapshot->'scheduleIds', '[]'::jsonb) ? new.schedule_id::text
     limit 1;
    if v_month is not null then
      raise exception '이 수거는 % 청구에 이미 확정되어 있습니다. 청구를 먼저 취소한 뒤 되돌려 주세요 — 병원에 보낸 명세서와 우리 수거이력이 서로 달라지지 않게 하는 규칙입니다.', v_month
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_revert_billed on public.collection_events;
create trigger guard_revert_billed
  before update on public.collection_events
  for each row execute function public.guard_revert_billed();

comment on function public.guard_revert_billed() is
  '확정한 청구에 들어간 수거는 되돌릴 수 없습니다 (0073). 명세서와 이력이 어긋나지 않게 합니다.';

revoke all on function public.close_day(date, text) from public;
revoke all on function public.revert_collection_with_reason(uuid, text) from public;
grant execute on function public.close_day(date, text) to authenticated;
grant execute on function public.revert_collection_with_reason(uuid, text) to authenticated;

-- ── 판(schema) 번호 ─────────────────────────────────────────────────────────
--  ⚠ 지금 서버는 70 입니다. **70 아래로 내리면 안 됩니다** — 판 67·70 에서
--    켜지는 기능(현장 일정 잡기 · 공용차 예약)이 통째로 사라집니다.
create or replace function public.app_schema_version()
returns integer language sql immutable as $$ select 73 $$;

-- ── 바로 확인 ───────────────────────────────────────────────────────────────
--   아래가 각각 1 · 73 이어야 합니다.
select count(*) as "day_closes 표" from information_schema.tables
 where table_schema='public' and table_name='day_closes';
select public.app_schema_version() as "판 번호";
