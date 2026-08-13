-- 비원미래 운영 DB — 19차 (0032)
-- 청구 중복 확정 차단 + DB 버전 확인. 앞의 묶음(RUN_1~17)이 모두 적용된 뒤에 실행합니다.
--
-- 이 파일은 supabase/migrations/0032_billing_guard.sql 과 내용이 같습니다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0032. 청구 중복 확정 차단 + DB 버전 확인
--
--  ① 같은 수거를 두 번 청구하는 일을 서버가 막습니다
--
--   청구 확정은 지금까지 화면이 payments 에 그냥 INSERT 했습니다. 같은 달을
--   두 사람이 동시에 확정하거나, 탭 두 개에서 월말 청구를 누르면 **같은
--   수거에 대한 청구가 두 건** 생깁니다. 병원에는 두 배로 청구되고 미수금도
--   두 배가 됩니다. 화면의 버튼 잠금은 내 브라우저에서만 도는 잠금이라
--   다른 사람·다른 탭을 막지 못합니다.
--
--   「같은 달에 같은 청구가 있는가」를 유일 제약으로 막을 수는 없습니다 —
--   확정 뒤에 들어온 수거를 「추가 청구」로 한 번 더 만드는 것은 정상이기
--   때문입니다. 대신 **그 청구가 덮는 수거·자재 id** 로 판단합니다. 이미
--   청구한 수거가 하나라도 다시 들어오면 거부합니다. 추가 청구는 id 가
--   겹치지 않으므로 그대로 통과합니다.
--
--   덤으로 청구 INSERT 와 감사기록이 한 트랜잭션에 들어갑니다. 예전에는
--   두 번의 왕복이라 사이에서 끊기면 근거 없는 청구가 남았습니다.
--
--  ② 화면이 DB 버전을 확인할 수 있게 합니다
--
--   마이그레이션을 실행하지 않은 채 새 화면을 열면, 표가 없어 조용히 빈
--   값으로 보입니다(운영비가 「미입력」으로 보이는 식). 오류도 없이 틀린
--   화면이 나옵니다. 화면이 이 함수를 불러 버전을 맞춰 보고, 낮으면
--   「DB 업데이트가 필요합니다」라고 알립니다.
--
--   이 함수 자체가 없으면(=0032 이전) 화면은 「구버전」으로 판단합니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DB 버전 ─────────────────────────────────────────────────────────────────
--  마이그레이션을 새로 추가할 때마다 이 숫자를 올립니다.
create or replace function public.app_schema_version()
returns integer
language sql
stable
as $$ select 32 $$;

revoke all on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to authenticated;

comment on function public.app_schema_version() is
  'DB 스키마 버전 (0032). 화면이 기대 버전과 맞춰 보고 낮으면 업데이트 안내를 띄웁니다.';


-- ── 청구 확정 ───────────────────────────────────────────────────────────────
--
--  p_snapshot 은 화면이 만든 확정 스냅샷 그대로입니다
--  (scheduleIds / materialIds / invoice / revenue / cost / profit / kind).
--  금액 계산은 화면이 하고, 서버는 **같은 것을 두 번 청구하지 않는지**를 봅니다.

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

  select * into v_client from public.clients where id = p_client_id;
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
  '청구 확정 (0032). 이미 청구한 수거·자재가 들어 있으면 거부합니다 — 동시 확정으로 두 배 청구되는 것을 막습니다.';
