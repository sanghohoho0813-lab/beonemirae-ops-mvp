-- ═══════════════════════════════════════════════════════════════════════════
--  파일럿 측정값 뽑기 — **읽기만** 합니다
--
--  ⚠ 아무것도 바꾸지 않습니다. 새 표도 새 기능도 만들지 않았습니다.
--     이미 쌓이고 있는 기록에서 그대로 계산합니다.
--
--  ── 어디서 나오는가 ──────────────────────────────────────────────────────
--
--   ① 수거 입력 소요시간
--        collection_events.input_duration_ms
--        입력 화면에 들어간 순간부터 저장까지의 실제 시간(ms)입니다.
--        이미 저장되고 있습니다 — 새로 만들 것이 없습니다.
--
--   ② 당일 입력률
--        schedules.date 와 completed_at 을 견줍니다.
--        「그날 갈 곳을 그날 안에 입력했는가」입니다.
--        ⚠ 시간대는 한국(Asia/Seoul)으로 맞춥니다. UTC 로 세면 밤에 넣은
--          것이 다음 날로 넘어가 당일 입력률이 실제보다 낮게 나옵니다.
--
--   ③ 일정 추가·변경
--        audit_logs.action ('schedule.book' 넣기 · 'schedule.move' 옮기기 ·
--        'schedule.cancel' 취소 · 'schedule.create' 만들기)
--        누가 했는지(actor_role)까지 남아 있어 기사·사무실을 가릅니다.
--
--   ④ 요청 처리시간
--        client_requests.handled_at - created_at
--        병원이 올린 요청을 사무실이 처리하기까지 걸린 시간입니다.
--
--  ── 쓰는 법 ──────────────────────────────────────────────────────────────
--   아래 날짜 두 줄만 파일럿 기간으로 바꾸고 통째로 Run 하시면 됩니다.
--   Supabase 편집기는 **마지막 결과만** 보여 주므로 한 표로 묶었습니다.
-- ═══════════════════════════════════════════════════════════════════════════

with 기간 as (
  select date '2026-08-25' as 시작,      -- ← 파일럿 시작일
         date '2026-08-31' as 끝          -- ← 파일럿 종료일
),

-- ① 수거 입력 소요시간 ------------------------------------------------------
t1 as (
  select count(*) as n,
         round((avg(input_duration_ms) / 1000.0)::numeric, 1) as 평균초,
         round(((percentile_cont(0.5) within group (order by input_duration_ms)) / 1000.0)::numeric, 1) as 중앙값초,
         round((max(input_duration_ms) / 1000.0)::numeric, 1) as 최대초
    from public.collection_events, 기간
   where input_duration_ms is not null and input_duration_ms > 0
     and (at at time zone 'Asia/Seoul')::date between 기간.시작 and 기간.끝
     and coalesce(demo_session_id, '') = ''          -- 시연 입력은 빼고 셉니다
),

-- ② 당일 입력률 -------------------------------------------------------------
t2 as (
  select count(*) filter (where completed_at is not null) as 입력건,
         count(*) as 예정건,
         count(*) filter (
           where completed_at is not null
             and (completed_at at time zone 'Asia/Seoul')::date = date
         ) as 당일입력건
    from public.schedules, 기간
   where date between 기간.시작 and 기간.끝
     and canceled_at is null
),

-- ③ 일정 추가·변경 ----------------------------------------------------------
t3 as (
  select count(*) filter (where action in ('schedule.book', 'schedule.create')) as 추가,
         count(*) filter (where action = 'schedule.move') as 옮김,
         count(*) filter (where action = 'schedule.cancel') as 취소,
         count(*) filter (where action in ('schedule.book', 'schedule.create')
                            and actor_role = 'field') as 기사가추가
    from public.audit_logs, 기간
   where (at at time zone 'Asia/Seoul')::date between 기간.시작 and 기간.끝
),

-- ④ 요청 처리시간 -----------------------------------------------------------
t4 as (
  select count(*) as 요청건,
         count(*) filter (where handled_at is not null) as 처리건,
         round(avg(extract(epoch from (handled_at - created_at)) / 3600.0)::numeric, 1) as 평균시간,
         round((percentile_cont(0.5) within group (
                 order by extract(epoch from (handled_at - created_at)) / 3600.0))::numeric, 1) as 중앙값시간
    from public.client_requests, 기간
   where (created_at at time zone 'Asia/Seoul')::date between 기간.시작 and 기간.끝
     and coalesce(demo_session_id, '') = ''
)

select * from (
  select 1 as 순, '① 수거 입력 소요시간' as 항목,
         coalesce(n, 0)::text || '건' as 건수,
         case when coalesce(n, 0) = 0 then '아직 없음'
              else '평균 ' || 평균초 || '초 · 중앙값 ' || 중앙값초 || '초 · 최대 ' || 최대초 || '초' end as 값
    from t1
  union all
  select 2, '② 당일 입력률',
         입력건::text || '/' || 예정건::text || '건',
         case when 예정건 = 0 then '아직 없음'
              else round((100.0 * 당일입력건 / 예정건)::numeric, 1)::text || '% (당일 ' || 당일입력건 || '건)' end
    from t2
  union all
  select 3, '③ 일정 추가·변경',
         (추가 + 옮김 + 취소)::text || '건',
         '추가 ' || 추가 || ' (기사 ' || 기사가추가 || ') · 옮김 ' || 옮김 || ' · 취소 ' || 취소
    from t3
  union all
  select 4, '④ 요청 처리시간',
         처리건::text || '/' || 요청건::text || '건',
         case when 처리건 = 0 then '아직 없음'
              else '평균 ' || 평균시간 || '시간 · 중앙값 ' || 중앙값시간 || '시간' end
    from t4
) x order by 순;
