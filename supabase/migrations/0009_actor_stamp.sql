-- ─────────────────────────────────────────────────────────────────────────────
-- 0009. 작성자·수정자 자동 기록
--
--  실제 Supabase 에 붙여 화면에서 거래처를 등록해 보니 clients.created_by 가
--  비어 있었습니다. complete_collection 처럼 함수를 거치는 경로는 실행자를
--  직접 적어 두지만, 화면에서 바로 INSERT/UPDATE 하는 일반 CRUD 는 아무도
--  채우지 않기 때문입니다.
--
--  감사로그(audit_logs)에는 실행자가 남아 있어 "누가 했는가"는 추적할 수
--  있지만, 행 자체를 봤을 때 작성자를 알 수 없으면 실사 자료로 쓰기 어렵습니다.
--
--  그래서 created_by / updated_by 를 가진 테이블에 트리거 하나를 붙여
--  로그인한 사용자를 자동으로 기록합니다.
--
--    · INSERT — created_by / updated_by 가 비어 있을 때만 채웁니다.
--                (complete_collection 처럼 이미 적어 둔 값은 건드리지 않습니다)
--    · UPDATE — updated_by 를 실행자로 덮고, created_by 는 바꾸지 않습니다.
--
--  auth.uid() 가 없는 경로(서버 배치 등)에서는 아무것도 하지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_has_created boolean;
  v_has_updated boolean;
begin
  if v_actor is null then
    return new;
  end if;

  select
    count(*) filter (where attname = 'created_by') > 0,
    count(*) filter (where attname = 'updated_by') > 0
    into v_has_created, v_has_updated
  from pg_attribute
  where attrelid = tg_relid and attnum > 0 and not attisdropped;

  if tg_op = 'INSERT' then
    if v_has_created then
      new := jsonb_populate_record(
        new,
        jsonb_build_object('created_by', coalesce(to_jsonb(new) ->> 'created_by', v_actor::text))
      );
    end if;
    if v_has_updated then
      new := jsonb_populate_record(
        new,
        jsonb_build_object('updated_by', coalesce(to_jsonb(new) ->> 'updated_by', v_actor::text))
      );
    end if;
  else
    if v_has_updated then
      new := jsonb_populate_record(new, jsonb_build_object('updated_by', v_actor::text));
    end if;
    if v_has_created then
      -- 작성자는 수정으로 바뀌지 않습니다.
      new := jsonb_populate_record(
        new,
        jsonb_build_object('created_by', coalesce(to_jsonb(old) ->> 'created_by', to_jsonb(new) ->> 'created_by'))
      );
    end if;
  end if;

  return new;
end;
$$;

-- created_by / updated_by 를 가진 모든 테이블에 붙입니다 (멱등).
do $$
declare
  r record;
begin
  for r in
    select distinct c.relname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and a.attname in ('created_by', 'updated_by')
       and a.attnum > 0
       and not a.attisdropped
  loop
    execute format('drop trigger if exists %I on public.%I', r.relname || '_stamp_actor', r.relname);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.stamp_actor()',
      r.relname || '_stamp_actor', r.relname
    );
  end loop;
end $$;
