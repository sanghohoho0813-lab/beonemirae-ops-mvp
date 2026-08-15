-- 비원미래 운영 DB — 27차 (0040)
-- 동시 편성·동시 확정 race. 앞의 묶음(RUN_1~25)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0040_plan_race.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0040. 같은 예정이 두 번 만들어지는 것 (동시 편성)
--
--  실측에서 나온 것
--
--   격리 DB 에 접속 세 개를 **같은 순간에** 띄워 같은 예정을 편성했더니
--   일정이 **2건** 생겼습니다. 기사에게 같은 방문이 두 번 나갑니다.
--
--   원인은 「먼저 확인하고 넣기」입니다. 0028 의 함수는 이렇게 되어 있습니다.
--
--     if exists (같은 거래처·날짜·구분이 있나) then 건너뛰기 end if;
--     insert ...
--
--   접속 A 와 B 가 같은 순간에 확인하면 **둘 다 「없다」고 봅니다.** 그 뒤
--   둘 다 넣습니다. 표에 막을 제약이 없어 DB 도 그냥 받습니다.
--
--   사무실이 한 명이면 잘 안 일어납니다. 그런데 「편성」 버튼을 두 번
--   빠르게 누르거나, 폰과 PC 에서 같이 열어 두거나, 네트워크가 느려 다시
--   눌렀을 때 그대로 재현됩니다. 화면의 버튼 잠금은 내 브라우저에서만
--   도는 잠금이라 이걸 막지 못합니다.
--
--  어떻게 막나
--
--   확인 대신 **표에 제약을 겁니다.** 같은 거래처·같은 날·같은 구분의
--   「예정」은 하나만 있을 수 있습니다. 둘째는 DB 가 거부합니다 —
--   두 접속이 아무리 겹쳐도 통과할 수 없습니다.
--
--   범위를 좁게 잡습니다.
--    · **예정**만. 이미 완료된 과거 기록은 손대지 않습니다.
--    · **추가 수거(is_additional)는 제외**. 같은 날 다시 가는 것은 실제
--      업무이고, 그걸 막으면 현장이 일을 못 합니다.
--
--   함수는 넣을 때 `on conflict do nothing` 으로 바꿔, 겹쳐서 못 들어간
--   건을 오류가 아니라 「건너뜀」으로 셉니다. 편성이 통째로 실패하지
--   않습니다.
--
--  이미 중복이 있으면
--
--   제약을 걸 수 없습니다. 그럴 때는 **멈추고 무엇이 겹쳤는지 알려 줍니다.**
--   자동으로 지우지 않습니다 — 어느 쪽을 남길지는 사람이 정할 일입니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. 이미 겹친 예정이 있는지 먼저 봅니다 ──────────────────────────────────

do $$
declare
  v_dup bigint;
  v_ex  text;
begin
  select count(*), min(txt) into v_dup, v_ex from (
    select format('%s / %s / %s', client_id, date, waste_type) as txt
      from public.schedules
     where status = '예정' and coalesce(is_additional, false) = false
     group by client_id, date, waste_type
    having count(*) > 1
  ) x;

  if v_dup > 0 then
    raise exception e'같은 거래처·날짜·구분의 「예정」이 %묶음 겹쳐 있어 제약을 걸 수 없습니다.\n'
      '예: %\n'
      '아래로 겹친 것을 확인한 뒤, 일정 편성 화면에서 정리하고 다시 실행해 주세요.\n'
      '  select client_id, date, waste_type, count(*) from public.schedules\n'
      '   where status = ''예정'' and coalesce(is_additional, false) = false\n'
      '   group by 1,2,3 having count(*) > 1;',
      v_dup, v_ex using errcode = 'P0001';
  end if;
end $$;


-- ── 2. 제약 — 두 접속이 겹쳐도 통과할 수 없게 ───────────────────────────────

create unique index if not exists schedules_planned_uniq
  on public.schedules (client_id, date, waste_type)
  where status = '예정' and coalesce(is_additional, false) = false;

comment on index public.schedules_planned_uniq is
  '같은 거래처·날짜·구분의 예정은 하나만 (0040). 동시 편성으로 같은 방문이 두 번 나가는 것을 DB 가 막습니다. 추가 수거와 완료 기록은 제외.';


-- ── 3. 편성 함수 — 겹치면 오류가 아니라 「건너뜀」 ──────────────────────────
--
--  0028 정의를 그대로 두고 insert 만 바꿉니다. 확인(select)은 남겨 둡니다 —
--  대부분의 경우 거기서 걸러지고, 제약은 겹치는 순간을 위한 마지막
--  방어선입니다.

create or replace function public.create_planned_schedules(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     jsonb;
  v_batch   uuid := gen_random_uuid();
  v_client  uuid;
  v_date    date;
  v_type    text;
  v_kg      integer;
  v_ins     integer := 0;
  v_skip    integer := 0;
  v_clients integer;
  v_first   date;
  v_last    date;
  --  「오늘」은 한국 시각 기준입니다 (0027 과 같은 기준).
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  --  넣기가 제약에 막혔는지 보는 값 (0040)
  v_id      uuid;
begin
  --  「누가」는 감사기록 트리거(0015)가 서버에서 직접 적습니다.
  if not public.is_staff() then
    raise exception '일정 편성은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception '편성할 일정이 목록 형태가 아닙니다.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception '만들 일정이 없습니다.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception '한 번에 만들 수 있는 일정은 500건까지입니다 (요청 %건). 기간을 나눠 주세요.',
      jsonb_array_length(p_rows) using errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_client := (v_row->>'clientId')::uuid;
    v_date   := (v_row->>'date')::date;
    v_type   := v_row->>'wasteType';
    v_kg     := greatest(0, coalesce((v_row->>'expectedAmount')::numeric, 0))::integer;

    if v_client is null or v_date is null then
      raise exception '거래처나 날짜가 빠진 줄이 있습니다.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.clients where id = v_client and active) then
      raise exception '거래 중이 아닌 거래처에는 일정을 만들 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_type not in ('의료폐기물', '일회용기저귀') then
      raise exception '폐기물 구분이 올바르지 않습니다: %', coalesce(v_type, '(없음)') using errcode = 'P0001';
    end if;
    if v_date < v_today then
      raise exception '지난 날짜(%)에는 예정을 만들지 않습니다.', v_date using errcode = 'P0001';
    end if;
    if v_date > v_today + 180 then
      raise exception '너무 먼 날짜(%)입니다. 반년 앞까지만 편성합니다.', v_date using errcode = 'P0001';
    end if;

    --  이미 있으면 손대지 않습니다 (상태 무관).
    if exists (
      select 1 from public.schedules
       where client_id = v_client and date = v_date and waste_type = v_type
    ) then
      v_skip := v_skip + 1;
      continue;
    end if;

    --  여기까지 왔어도 다른 접속이 방금 넣었을 수 있습니다(0040). 그때는
    --  제약이 막고, 우리는 「건너뜀」으로 셉니다 — 편성 전체가 실패하지 않게.
    insert into public.schedules
      (date, client_id, waste_type, status, expected_amount, actual_amount,
       memo, origin, is_additional, plan_batch)
    values
      (v_date, v_client, v_type, '예정', v_kg, null,
       coalesce(nullif(v_row->>'basis', ''), '자동 편성'), 'system', false, v_batch)
    on conflict (client_id, date, waste_type)
      where status = '예정' and coalesce(is_additional, false) = false
      do nothing
    returning id into v_id;

    if v_id is null then
      v_skip := v_skip + 1;
    else
      v_ins := v_ins + 1;
    end if;
    v_id := null;
  end loop;

  select count(distinct client_id), min(date), max(date)
    into v_clients, v_first, v_last
    from public.schedules where plan_batch = v_batch;

  insert into public.audit_logs
    (action, entity, entity_id, after_data, summary, screen, source)
  values
    ('schedule.plan', 'schedules', v_batch::text,
     jsonb_build_object('batch', v_batch, 'inserted', v_ins, 'skipped', v_skip,
                        'clients', coalesce(v_clients, 0),
                        'from', v_first, 'to', v_last),
     format('수거 일정 자동 편성 — %s건 생성 · %s건 건너뜀 (거래처 %s곳%s)',
            v_ins, v_skip, coalesce(v_clients, 0),
            case when v_first is null then ''
                 else format(' · %s ~ %s', v_first, v_last) end),
     '일정 편성', 'app');

  return jsonb_build_object('batch', v_batch, 'inserted', v_ins, 'skipped', v_skip,
                            'clients', coalesce(v_clients, 0),
                            'from', v_first, 'to', v_last);
end;
$$;

revoke all on function public.create_planned_schedules(jsonb) from public;
grant execute on function public.create_planned_schedules(jsonb) to authenticated;

comment on function public.create_planned_schedules(jsonb) is
  '예정 일정 일괄 생성 (0028 · 0040). 같은 거래처·날짜·구분의 예정은 제약으로 하나만 — 동시에 눌러도 두 번 만들어지지 않습니다.';


-- ── 4. 청구 확정도 같은 병입니다 — 세 배로 청구될 수 있었습니다 ────────────
--
--  이빨 확인에서 드러났습니다. 위 제약을 떼고 같은 달을 세 접속이 동시에
--  확정했더니 **청구가 3건 · 285,000원** 만들어졌습니다. 병원에 세 배로
--  나갑니다.
--
--  0032 의 중복 차단도 「먼저 확인하고 넣기」입니다. 세 트랜잭션이 같은
--  순간에 확인하면 서로가 아직 커밋하지 않은 청구를 못 보므로 셋 다
--  「겹치는 것 없음」으로 통과합니다.
--
--  입금(add_payment_receipt)은 왜 멀쩡했나 — 거기는 청구 행을
--  `for update` 로 **잠그고** 시작하기 때문입니다. 뒤에 온 접속은 앞이
--  끝날 때까지 기다렸다가, 갱신된 값을 보고 판단합니다. 실측에서 동시
--  입금이 정확히 한 건만 들어간 이유입니다.
--
--  청구 확정에도 같은 잠금을 겁니다. 거래처 행을 잠그면 그 거래처에 대한
--  확정이 한 줄로 세워집니다. 다른 거래처끼리는 여전히 동시에 됩니다 —
--  월말에 열여덟 곳을 한 번에 확정하는 일이 느려지지 않습니다.
--
--  청구 표에 유니크 제약을 걸 수는 없습니다. 같은 달에 「정기 + 추가 청구」
--  가 여러 건 있는 것은 정상이기 때문입니다.

create or replace function public.confirm_billing(
  p_client_id uuid,
  p_month     text,
  p_amount    bigint,
  p_snapshot  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_new_s  text[];
  v_new_m  text[];
  v_dup    text;
  v_id     uuid;
  v_kind   text := coalesce(p_snapshot->>'kind', '정기');
begin
  if not public.is_staff() then
    raise exception '청구 확정은 사무실 담당자와 관리자만 할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception '청구월이 올바르지 않습니다: %', coalesce(p_month, '(없음)') using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '청구액은 0원보다 커야 합니다.' using errcode = 'P0001';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception '확정할 명세 내용이 없습니다.' using errcode = 'P0001';
  end if;

  --  거래처 행을 잠그고 시작합니다 (0040). 이 한 줄이 「동시에 눌러도
  --  두 번 청구되지 않는다」를 만듭니다 — 아래 확인이 끝나고 넣을 때까지
  --  다른 접속이 끼어들 수 없습니다.
  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception '청구할 거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  --  이번에 청구하려는 수거·자재
  select coalesce(array_agg(x), '{}') into v_new_s
    from jsonb_array_elements_text(coalesce(p_snapshot->'scheduleIds', '[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_new_m
    from jsonb_array_elements_text(coalesce(p_snapshot->'materialIds', '[]'::jsonb)) x;

  if array_length(v_new_s, 1) is null and array_length(v_new_m, 1) is null then
    raise exception '청구에 담을 수거·자재 기록이 없습니다.' using errcode = 'P0001';
  end if;

  --  같은 달에 이미 확정한 청구가 덮은 수거·자재와 겹치는지
  --  (취소한 청구는 없는 것으로 봅니다 — 다시 청구할 수 있어야 합니다)
  select x into v_dup
    from public.payments p,
         lateral jsonb_array_elements_text(coalesce(p.snapshot->'scheduleIds', '[]'::jsonb)) x
   where p.client_id = p_client_id and p.billing_month = p_month
     and p.status <> '취소' and x = any(v_new_s)
   limit 1;
  if v_dup is not null then
    raise exception '이미 청구한 수거가 들어 있습니다. 다른 사람이 방금 확정했을 수 있습니다 — 화면을 새로 고쳐 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  select x into v_dup
    from public.payments p,
         lateral jsonb_array_elements_text(coalesce(p.snapshot->'materialIds', '[]'::jsonb)) x
   where p.client_id = p_client_id and p.billing_month = p_month
     and p.status <> '취소' and x = any(v_new_m)
   limit 1;
  if v_dup is not null then
    raise exception '이미 청구한 자재 공급이 들어 있습니다. 화면을 새로 고쳐 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  insert into public.payments
    (client_id, billing_month, amount, status, method, paid_at, memo, snapshot)
  values
    (p_client_id, p_month, p_amount, '미수금', '무통장', null,
     format('%s 청구', v_kind), p_snapshot)
  returning id into v_id;

  insert into public.audit_logs
    (action, entity, entity_id, client_id, client_name, after_data, summary, screen, source)
  values
    ('payment.confirm', 'payments', v_id::text, p_client_id, v_client.name,
     jsonb_build_object('amount', p_amount, 'month', p_month, 'kind', v_kind,
                        'collections', coalesce(array_length(v_new_s, 1), 0),
                        'supplies', coalesce(array_length(v_new_m, 1), 0)),
     format('%s %s %s 청구 확정 — %s원 (수거 %s건 · 공급 %s건)',
            v_client.name, p_month, v_kind, to_char(p_amount, 'FM999,999,999'),
            coalesce(array_length(v_new_s, 1), 0), coalesce(array_length(v_new_m, 1), 0)),
     '월말 청구', 'app');

  return jsonb_build_object('id', v_id, 'amount', p_amount, 'month', p_month, 'kind', v_kind);
end;
$$;

revoke all on function public.confirm_billing(uuid, text, bigint, jsonb) from public;
grant execute on function public.confirm_billing(uuid, text, bigint, jsonb) to authenticated;

comment on function public.confirm_billing(uuid, text, bigint, jsonb) is
  '청구 확정 (0032 · 0040). 거래처 행을 잠그고 시작해, 같은 달을 동시에 확정해도 두 번 만들어지지 않습니다.';


-- ── DB 버전 ──────────────────────────────────────────────────────────────────

create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 40 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0040). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';
