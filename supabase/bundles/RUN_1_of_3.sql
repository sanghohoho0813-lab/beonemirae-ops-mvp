-- 비원미래 운영 DB — 1차 (0001~0004)
-- Supabase SQL Editor 에 통째로 붙여넣고 Run 한 번.


-- ══════════════════════════════════════ 0001_schema.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 비원미래 의료폐기물 운영관리 AX — 4단계 실사용 전환 스키마
--
--  설계 원칙
--   1) 기존 도메인 타입(src/types/index.ts)과 1:1 로 대응시켜 UI/비즈니스 로직이
--      깨지지 않게 합니다. 한글 도메인 값은 CHECK 제약으로 그대로 유지합니다.
--   2) 불필요하게 테이블을 쪼개지 않습니다. 파생 데이터(병원 요청, 통계, 추천,
--      수거대장 초안)는 테이블로 만들지 않고 기존 계산 로직을 그대로 씁니다.
--   3) 모든 운영 테이블에 origin / demo_session_id 를 두어 실제 데이터와 시연
--      데이터를 DB 수준에서 분리합니다.
--   4) 삭제는 hard delete 대신 active=false / 취소 이력을 우선합니다.
--   5) 동시 수정 안전성을 위해 updated_at 을 두고 트리거로 자동 갱신합니다.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── 공통: updated_at 자동 갱신 ───────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── 사용자 프로필 / 역할 ─────────────────────────────────────────────────────
-- 비밀번호는 auth.users 가 관리합니다. 여기에는 절대 저장하지 않습니다.
create type public.user_role as enum ('admin', 'office', 'field');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null default '',
  role        public.user_role not null default 'field',
  -- 화면 글자 크기 설정 (기본 / 크게 / 매우 크게) — 사용자별로 따라다닙니다.
  font_scale  text not null default 'normal' check (font_scale in ('normal','lg','xl')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 가입 시 프로필 자동 생성. 공개 가입은 막고(아래 RLS + Supabase 설정),
-- 관리자가 초대한 계정만 생성되도록 운영합니다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    -- 첫 사용자는 관리자로, 이후 초대 계정은 초대 시 지정한 역할(기본 field)로
    case when (select count(*) from public.profiles) = 0 then 'admin'
         else coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'field') end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 역할 조회 헬퍼 (RLS 에서 재사용) ────────────────────────────────────────
-- current_role 은 SQL 예약어라 auth_role 로 둡니다.
-- security definer: RLS 정책 안에서 profiles 를 다시 조회하며 생기는 무한 재귀를 막습니다.
create or replace function public.auth_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.auth_role() = 'admin' $$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.auth_role() in ('admin','office') $$;

-- 로그인했고 비활성 처리되지 않은 사용자
create or replace function public.is_active_user() returns boolean
language sql stable as $$ select public.auth_role() is not null $$;

-- ── 거래처 ───────────────────────────────────────────────────────────────────
create table public.clients (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  type                   text not null check (type in ('병원','요양병원','의원','장례식장','요양원','치과','한의원','한방병원')),
  address                text not null default '',
  manager                text not null default '',
  phone                  text not null default '',
  collection_cycle       text not null default '',
  collects_medical_waste boolean not null default true,
  collects_diaper        boolean not null default false,
  storage_size           text not null default '보통' check (storage_size in ('큼','보통','작음')),
  note                   text not null default '',
  -- 실제/시연 분리. is_demo_generated 는 기존 필드와 대응됩니다.
  is_demo_generated      boolean not null default false,
  demo_session_id        text,
  -- hard delete 대신 비활성화
  active                 boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create index clients_active_idx on public.clients(active);
create index clients_demo_idx on public.clients(demo_session_id);

-- ── 차량 ─────────────────────────────────────────────────────────────────────
create table public.vehicles (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  waste_type         text not null check (waste_type in ('의료폐기물','일회용기저귀')),
  tonnage            numeric not null default 0,
  nominal_capacity   integer not null default 0,
  expected_capacity  integer not null default 0,
  driver             text not null default '',
  active             boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();

-- ── 수거일정 ─────────────────────────────────────────────────────────────────
create table public.schedules (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  client_id       uuid not null references public.clients(id) on delete restrict,
  waste_type      text not null check (waste_type in ('의료폐기물','일회용기저귀')),
  vehicle_id      uuid references public.vehicles(id) on delete set null,
  scheduled_time  text not null default '',
  status          text not null default '예정' check (status in ('예정','완료','지연','긴급')),
  expected_amount integer not null default 0,
  actual_amount   integer,
  completed_at    timestamptz,
  memo            text not null default '',
  actual_time     text,
  -- 용기별 배출 수량 (ContainerBreakdown) — 소규모 고정 구조라 jsonb 로 둡니다.
  containers      jsonb,
  driver_name     text,
  handover_status text check (handover_status in ('수거 완료','인계 대기','인계 완료')),
  handover_at     timestamptz,
  event_id        uuid,
  origin          text not null default 'field' check (origin in ('seed','field','demo','migrated','system')),
  demo_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
create trigger schedules_touch before update on public.schedules
  for each row execute function public.touch_updated_at();
create index schedules_date_idx on public.schedules(date);
create index schedules_client_idx on public.schedules(client_id);
create index schedules_demo_idx on public.schedules(demo_session_id);

-- 같은 거래처·같은 날짜·같은 폐기물 구분의 '완료' 일정은 하나만 허용해
-- 중복 수거 등록을 DB 수준에서 막습니다. (취소 후 재등록은 가능)
create unique index schedules_no_duplicate_completion
  on public.schedules(client_id, date, waste_type)
  where status = '완료';

-- ── 자재공급 ─────────────────────────────────────────────────────────────────
create table public.materials (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  client_id             uuid not null references public.clients(id) on delete restrict,
  box_count             integer not null default 0,
  vinyl_count           integer not null default 0,
  needle_box_count      integer not null default 0,
  is_additional_request boolean not null default false,
  memo                  text not null default '',
  origin                text not null default 'field' check (origin in ('seed','field','demo','migrated','system')),
  demo_session_id       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create trigger materials_touch before update on public.materials
  for each row execute function public.touch_updated_at();
create index materials_client_idx on public.materials(client_id);

-- ── 사무실 자재 재고 (단일 행) ───────────────────────────────────────────────
create table public.office_stock (
  id                 smallint primary key default 1 check (id = 1),
  corrugated_box     integer not null default 0,
  plastic_container  integer not null default 0,
  bag                integer not null default 0,
  needle_box         integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create trigger office_stock_touch before update on public.office_stock
  for each row execute function public.touch_updated_at();
insert into public.office_stock (id) values (1) on conflict do nothing;

-- 자재 입출고 원장 — 재고가 왜 그렇게 되었는지 추적합니다.
create table public.material_transactions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('입고','공급','조정','취소')),
  item       text not null check (item in ('corrugatedBox','plasticContainer','bag','needleBox')),
  qty        integer not null,                     -- 부호 포함 (입고 +, 공급 -)
  client_id  uuid references public.clients(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  event_id   uuid,
  memo       text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index material_tx_created_idx on public.material_transactions(created_at desc);

-- ── 청구 / 입금 (미수금 관리) ────────────────────────────────────────────────
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete restrict,
  billing_month text not null,                  -- YYYY-MM
  amount        integer not null default 0,
  status        text not null default '미수금' check (status in ('입금완료','미수금','확인필요')),
  method        text not null default '무통장' check (method in ('무통장','카드요청','기타')),
  paid_at       timestamptz,
  memo          text not null default '',
  demo_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
create index payments_client_idx on public.payments(client_id);

-- ── 현장 메모 ────────────────────────────────────────────────────────────────
create table public.site_notes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  kind       text not null check (kind in ('수거요청','연락','주의','자재','기타')),
  content    text not null,
  done       boolean not null default false,
  archived   boolean not null default false,
  demo_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
create trigger site_notes_touch before update on public.site_notes
  for each row execute function public.touch_updated_at();
create index site_notes_client_idx on public.site_notes(client_id);

-- ── 병원 요청 처리 결과 ──────────────────────────────────────────────────────
-- 요청 목록 자체는 거래처·일정·메모에서 파생 계산합니다(clientRequests).
-- 여기에는 '자동/수동으로 상태를 바꾼 결과'만 영속화합니다.
create table public.request_overrides (
  request_id text primary key,
  status     text not null check (status in ('접수','확인 중','일정 반영','처리 완료')),
  changed_at timestamptz not null default now(),
  by         text not null default '',
  demo_session_id text,
  updated_by uuid references public.profiles(id)
);

-- ── 수거 이벤트 (감사기록 + 되돌리기 원장) ───────────────────────────────────
create table public.collection_events (
  id               uuid primary key default gen_random_uuid(),
  at               timestamptz not null default now(),
  -- 실제 로그인 사용자 정보 (기존 role 문자열을 대체)
  actor_id         uuid references public.profiles(id),
  actor_name       text not null default '',
  actor_role       public.user_role,
  screen           text not null default '',
  action           text not null check (action in ('수거 완료','완료 취소')),
  schedule_id      uuid,
  created_schedule boolean not null default false,
  client_id        uuid references public.clients(id) on delete set null,
  client_name      text not null default '',
  waste_type       text not null,
  amount_kg        integer not null default 0,
  before_state     jsonb not null default '{}'::jsonb,
  material_ids     uuid[] not null default '{}',
  stock_before     jsonb not null default '{}'::jsonb,
  request_updates  jsonb not null default '[]'::jsonb,
  note             text not null default '',
  reverted         boolean not null default false,
  reverted_at      timestamptz,
  demo_session_id  text,
  input_duration_ms integer,
  created_at timestamptz not null default now()
);
create index collection_events_at_idx on public.collection_events(at desc);
create index collection_events_demo_idx on public.collection_events(demo_session_id);

-- ── 매출 전환 (추천 → 제안 → 수락 → 실제 매출) ──────────────────────────────
create table public.sales_leads (
  id                uuid primary key default gen_random_uuid(),
  key               text not null,                 -- clientId::kind::YYYY-MM
  client_id         uuid not null references public.clients(id) on delete cascade,
  client_name       text not null default '',
  kind              text not null,
  title             text not null default '',
  month             text not null,                 -- YYYY-MM
  est_value         integer not null default 0,    -- 예상 매출 (참고값)
  stage             text not null default '추천' check (stage in ('추천','제안','수락','보류','미전환')),
  actual_revenue    integer,                       -- 실제 매출 (null = 미입력, 0원과 구분)
  actual_revenue_at timestamptz,
  demo_session_id   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (key)
);
create trigger sales_leads_touch before update on public.sales_leads
  for each row execute function public.touch_updated_at();

-- 단계 변경 이력 (예상매출과 실제매출을 끝까지 분리해 추적)
create table public.sales_lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.sales_leads(id) on delete cascade,
  stage      text not null check (stage in ('추천','제안','수락','보류','미전환')),
  at         timestamptz not null default now(),
  actor_id   uuid references public.profiles(id)
);
create index sales_lead_events_lead_idx on public.sales_lead_events(lead_id, at);

-- ── AX 실증 설정 (단일 행) ───────────────────────────────────────────────────
create table public.performance_baselines (
  id                            smallint primary key default 1 check (id = 1),
  admin_minutes_per_collection  numeric,
  repeat_entries_per_collection numeric,
  monthly_doc_hours             numeric,
  monthly_rework_count          numeric,
  daily_capacity                numeric,
  source                        text not null default 'user' check (source in ('user','demo')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.performance_baselines (id) values (1) on conflict do nothing;

create table public.experiment_settings (
  id         smallint primary key default 1 check (id = 1),
  start_date date,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.experiment_settings (id) values (1) on conflict do nothing;

-- ── 감사로그 (수거 외 모든 변경) ─────────────────────────────────────────────
create table public.audit_logs (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references public.profiles(id),
  actor_name  text not null default '',
  actor_role  public.user_role,
  action      text not null,          -- 예: 'client.update', 'schedule.create'
  entity      text not null,          -- 테이블명
  entity_id   text,
  client_id   uuid references public.clients(id) on delete set null,
  client_name text not null default '',
  screen      text not null default '',
  source      text not null default 'web',
  before_data jsonb,
  after_data  jsonb,
  summary     text not null default ''
);
create index audit_logs_at_idx on public.audit_logs(at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_id);

-- ══════════════════════════════════════ 0002_rls.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
--
--  화면에서 숨기는 것과 별개로, DB 수준에서 역할별 접근을 제한합니다.
--
--   관리자(admin)  전체 read/write
--   사무실(office) 운영 데이터 read/write · 사용자/민감 설정 제한
--   현장(field)    일정·수거·현장메모·자재 read/write · 경영/매출 데이터 접근 불가
--
--  익명(비로그인)은 어떤 운영 테이블에도 접근할 수 없습니다.
--  service_role 키는 프론트엔드에서 사용하지 않습니다(서버 전용).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles              enable row level security;
alter table public.clients               enable row level security;
alter table public.vehicles              enable row level security;
alter table public.schedules             enable row level security;
alter table public.materials             enable row level security;
alter table public.material_transactions enable row level security;
alter table public.office_stock          enable row level security;
alter table public.payments              enable row level security;
alter table public.site_notes            enable row level security;
alter table public.request_overrides     enable row level security;
alter table public.collection_events     enable row level security;
alter table public.sales_leads           enable row level security;
alter table public.sales_lead_events     enable row level security;
alter table public.performance_baselines enable row level security;
alter table public.experiment_settings   enable row level security;
alter table public.audit_logs            enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
-- 본인 프로필은 누구나 조회. 전체 목록·역할 변경은 관리자만.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- 본인은 이름/글자크기만 수정할 수 있고 role·active 는 바꿀 수 없습니다.
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles p where p.id = auth.uid())
    and active = (select active from public.profiles p where p.id = auth.uid())
  );

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 운영 마스터: 거래처 / 차량 ──────────────────────────────────────────────
-- 현장 담당자도 거래처 주요 정보는 봐야 하므로 read 는 전 역할 허용.
create policy clients_read on public.clients
  for select using (public.is_active_user());
create policy clients_write on public.clients
  for insert with check (public.is_staff());
create policy clients_update on public.clients
  for update using (public.is_staff()) with check (public.is_staff());
-- 거래처는 hard delete 하지 않습니다 (active=false 사용). 관리자만 예외 허용.
create policy clients_delete on public.clients
  for delete using (public.is_admin());

create policy vehicles_read on public.vehicles
  for select using (public.is_active_user());
create policy vehicles_write on public.vehicles
  for all using (public.is_staff()) with check (public.is_staff());

-- ── 현장 업무: 일정 / 자재 / 현장메모 / 수거이벤트 ──────────────────────────
-- 현장 담당자의 핵심 업무 영역 — 전 역할 read/write.
create policy schedules_read on public.schedules
  for select using (public.is_active_user());
create policy schedules_write on public.schedules
  for insert with check (public.is_active_user());
create policy schedules_update on public.schedules
  for update using (public.is_active_user()) with check (public.is_active_user());
create policy schedules_delete on public.schedules
  for delete using (public.is_staff());

create policy materials_read on public.materials
  for select using (public.is_active_user());
create policy materials_write on public.materials
  for insert with check (public.is_active_user());
create policy materials_update on public.materials
  for update using (public.is_staff()) with check (public.is_staff());

create policy material_tx_read on public.material_transactions
  for select using (public.is_active_user());
create policy material_tx_write on public.material_transactions
  for insert with check (public.is_active_user());

create policy office_stock_read on public.office_stock
  for select using (public.is_active_user());
create policy office_stock_update on public.office_stock
  for update using (public.is_active_user()) with check (public.is_active_user());

create policy site_notes_read on public.site_notes
  for select using (public.is_active_user());
create policy site_notes_write on public.site_notes
  for insert with check (public.is_active_user());
create policy site_notes_update on public.site_notes
  for update using (public.is_active_user()) with check (public.is_active_user());
create policy site_notes_delete on public.site_notes
  for delete using (public.is_staff());

create policy request_overrides_read on public.request_overrides
  for select using (public.is_active_user());
create policy request_overrides_write on public.request_overrides
  for all using (public.is_active_user()) with check (public.is_active_user());

create policy collection_events_read on public.collection_events
  for select using (public.is_active_user());
create policy collection_events_write on public.collection_events
  for insert with check (public.is_active_user());
create policy collection_events_update on public.collection_events
  for update using (public.is_active_user()) with check (public.is_active_user());

-- ── 경영 / 매출 데이터 — 현장 담당자 접근 차단 ──────────────────────────────
-- 미수금은 경영 데이터이므로 현장 담당자에게는 조회 자체를 막습니다.
create policy payments_read on public.payments
  for select using (public.is_staff());
create policy payments_write on public.payments
  for all using (public.is_staff()) with check (public.is_staff());

create policy sales_leads_read on public.sales_leads
  for select using (public.is_staff());
create policy sales_leads_write on public.sales_leads
  for all using (public.is_staff()) with check (public.is_staff());

create policy sales_lead_events_read on public.sales_lead_events
  for select using (public.is_staff());
create policy sales_lead_events_write on public.sales_lead_events
  for insert with check (public.is_staff());

-- ── AX 실증 설정 — 읽기는 전 역할, 기준값 수정은 관리자만 ───────────────────
create policy baselines_read on public.performance_baselines
  for select using (public.is_active_user());
create policy baselines_write on public.performance_baselines
  for update using (public.is_admin()) with check (public.is_admin());

create policy experiment_read on public.experiment_settings
  for select using (public.is_active_user());
create policy experiment_write on public.experiment_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- ── 감사로그 — 관리자만 열람. 기록은 로그인 사용자면 남길 수 있고 수정·삭제 불가 ──
create policy audit_read on public.audit_logs
  for select using (public.is_admin());
create policy audit_insert on public.audit_logs
  for insert with check (public.is_active_user());
-- update / delete 정책을 만들지 않음 = 아무도 감사로그를 고치거나 지울 수 없음

-- ══════════════════════════════════════ 0003_functions.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 수거 완료 통합 커맨드 (핵심 1) — DB 트랜잭션
--
--  현장에서 "한 번" 입력한 수거정보가 아래를 한 트랜잭션 안에서 처리합니다.
--   일정 완료(또는 생성) → 수거이력 → 자재 공급 → 재고 차감 → 자재 원장
--   → 병원 요청 자동 종료 → 감사기록(collection_events)
--
--  Postgres 함수는 단일 트랜잭션에서 실행되므로, 중간에 raise exception 이
--  발생하면 앞선 변경이 전부 롤백됩니다. "일부만 저장되는 상태"가 없습니다.
--
--  동시성: 대상 일정과 재고 행을 FOR UPDATE 로 잠가, 두 직원이 동시에 같은
--  일정을 완료하거나 재고를 초과 차감하는 것을 막습니다.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.complete_collection(p jsonb)
returns jsonb
language plpgsql
security invoker            -- 호출자의 RLS 를 그대로 적용합니다.
set search_path = public
as $$
declare
  v_actor        profiles%rowtype;
  v_client       clients%rowtype;
  v_vehicle      vehicles%rowtype;
  v_schedule     schedules%rowtype;
  v_stock        office_stock%rowtype;
  v_event_id     uuid := gen_random_uuid();
  v_schedule_id  uuid;
  v_created      boolean := false;
  v_material_id  uuid;
  v_material_ids uuid[] := '{}';
  v_before       jsonb;
  v_stock_before jsonb;
  v_req_updates  jsonb := '[]'::jsonb;
  v_now          timestamptz := now();
  v_today        date := (v_now at time zone 'Asia/Seoul')::date;
  v_amount       integer := (p->>'actualAmount')::integer;
  v_demo         text := nullif(p->>'demoSessionId', '');
  v_origin       text;
  v_sup_box      integer := coalesce((p->'supplied'->>'corrugatedBox')::integer, 0);
  v_sup_plastic  integer := coalesce((p->'supplied'->>'plasticContainer')::integer, 0);
  v_sup_bag      integer := coalesce((p->'supplied'->>'bag')::integer, 0);
  v_sup_needle   integer := coalesce((p->'supplied'->>'needleBox')::integer, 0);
  v_supplied_any boolean;
  r              record;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  v_supplied_any := (v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) > 0;
  v_origin := case when v_demo is null then 'field' else 'demo' end;

  -- ── 검증 ────────────────────────────────────────────────────────────────
  select * into v_client from clients where id = (p->>'clientId')::uuid and active;
  if not found then
    raise exception '거래처를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception '실제 수거량은 0kg보다 커야 합니다.' using errcode = 'P0001';
  end if;

  if coalesce(p->>'actualTime', '') = '' then
    raise exception '실제 수거 시간을 입력해 주세요.' using errcode = 'P0001';
  end if;

  select * into v_vehicle from vehicles where id = (p->>'vehicleId')::uuid;
  if not found then
    raise exception '배차 차량을 선택해 주세요.' using errcode = 'P0001';
  end if;
  if v_vehicle.waste_type <> (p->>'wasteType') then
    raise exception '% 수거에는 % 차량만 배차할 수 있습니다. (선택한 차량: %)',
      p->>'wasteType', p->>'wasteType', v_vehicle.waste_type using errcode = 'P0001';
  end if;

  -- ── 1) 일정: 기존 예정 완료 처리 또는 직접 입력 시 신규 완료 일정 생성 ──
  if coalesce(p->>'scheduleId', '') <> '' then
    -- FOR UPDATE: 다른 직원이 동시에 같은 일정을 완료하지 못하게 잠급니다.
    select * into v_schedule from schedules where id = (p->>'scheduleId')::uuid for update;
    if not found then
      raise exception '선택한 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_schedule.status = '완료' then
      raise exception '이미 완료 처리된 일정입니다. (중복 완료 방지)' using errcode = 'P0001';
    end if;

    v_before := jsonb_build_object(
      'status', v_schedule.status,
      'actualAmount', v_schedule.actual_amount,
      'handoverStatus', v_schedule.handover_status
    );

    update schedules set
      status = '완료',
      actual_amount = v_amount,
      actual_time = p->>'actualTime',
      completed_at = v_now,
      containers = p->'containers',
      driver_name = p->>'driverName',
      handover_status = p->>'handoverStatus',
      handover_at = case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      memo = coalesce(p->>'memo', ''),
      waste_type = p->>'wasteType',
      vehicle_id = v_vehicle.id,
      event_id = v_event_id,
      origin = v_origin,
      demo_session_id = v_demo,
      updated_by = v_actor.id
    where id = v_schedule.id;

    v_schedule_id := v_schedule.id;
  else
    v_created := true;
    v_before := jsonb_build_object('status', '예정', 'actualAmount', null, 'handoverStatus', null);
    insert into schedules (
      date, client_id, waste_type, vehicle_id, scheduled_time, status,
      expected_amount, actual_amount, actual_time, completed_at, containers,
      driver_name, handover_status, handover_at, memo, event_id, origin,
      demo_session_id, created_by, updated_by
    ) values (
      v_today, v_client.id, p->>'wasteType', v_vehicle.id, p->>'actualTime', '완료',
      v_amount, v_amount, p->>'actualTime', v_now, p->'containers',
      p->>'driverName', p->>'handoverStatus',
      case when p->>'handoverStatus' = '인계 완료' then v_now else null end,
      coalesce(p->>'memo', ''), v_event_id, v_origin,
      v_demo, v_actor.id, v_actor.id
    ) returning id into v_schedule_id;
  end if;

  -- ── 2) 재고 차감 (행 잠금 후 확인 → 초과 차감 불가) ─────────────────────
  select * into v_stock from office_stock where id = 1 for update;
  v_stock_before := jsonb_build_object(
    'corrugatedBox', v_stock.corrugated_box,
    'plasticContainer', v_stock.plastic_container,
    'bag', v_stock.bag,
    'needleBox', v_stock.needle_box
  );

  if v_sup_box > v_stock.corrugated_box then
    raise exception '사무실 골판지 전용박스 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.corrugated_box, v_sup_box using errcode = 'P0001';
  end if;
  if v_sup_plastic > v_stock.plastic_container then
    raise exception '사무실 합성수지 전용용기 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.plastic_container, v_sup_plastic using errcode = 'P0001';
  end if;
  if v_sup_bag > v_stock.bag then
    raise exception '사무실 전용 봉투 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.bag, v_sup_bag using errcode = 'P0001';
  end if;
  if v_sup_needle > v_stock.needle_box then
    raise exception '사무실 합성수지 바늘통 재고(%)보다 많이 공급할 수 없습니다. (요청 %)',
      v_stock.needle_box, v_sup_needle using errcode = 'P0001';
  end if;

  -- ── 3) 자재 공급 이력 + 원장 ────────────────────────────────────────────
  if v_supplied_any then
    insert into materials (
      date, client_id, box_count, vinyl_count, needle_box_count,
      is_additional_request, memo, origin, demo_session_id, created_by
    ) values (
      v_today, v_client.id, v_sup_box, v_sup_bag, v_sup_plastic + v_sup_needle,
      coalesce((p->>'isAdditional')::boolean, false), '수거 완료 시 동시공급',
      v_origin, v_demo, v_actor.id
    ) returning id into v_material_id;

    v_material_ids := array[v_material_id];

    update office_stock set
      corrugated_box    = corrugated_box - v_sup_box,
      plastic_container = plastic_container - v_sup_plastic,
      bag               = bag - v_sup_bag,
      needle_box        = needle_box - v_sup_needle,
      updated_by        = v_actor.id
    where id = 1;

    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '공급', item, -qty, v_client.id, v_material_id, v_event_id, '수거 완료 시 동시공급', v_actor.id
    from (values
      ('corrugatedBox', v_sup_box),
      ('plasticContainer', v_sup_plastic),
      ('bag', v_sup_bag),
      ('needleBox', v_sup_needle)
    ) as t(item, qty)
    where qty > 0;
  end if;

  -- ── 4) 병원 요청 자동 종료 (긴급수거 / 자재공급 요청) ──────────────────
  --     요청 목록은 파생 계산이라 프론트에서 대상 id 를 넘겨줍니다.
  if jsonb_typeof(p->'closeRequests') = 'array' then
    for r in select value->>'requestId' as rid, value->>'from' as from_status
             from jsonb_array_elements(p->'closeRequests')
    loop
      insert into request_overrides (request_id, status, changed_at, by, demo_session_id, updated_by)
      values (r.rid, '처리 완료', v_now, '수거 완료 자동 반영', v_demo, v_actor.id)
      on conflict (request_id) do update
        set status = '처리 완료', changed_at = v_now,
            by = '수거 완료 자동 반영', updated_by = v_actor.id;
      v_req_updates := v_req_updates || jsonb_build_object(
        'requestId', r.rid, 'from', r.from_status, 'to', '처리 완료');
    end loop;
  end if;

  -- ── 5) 감사기록 ────────────────────────────────────────────────────────
  insert into collection_events (
    id, at, actor_id, actor_name, actor_role, screen, action, schedule_id,
    created_schedule, client_id, client_name, waste_type, amount_kg,
    before_state, material_ids, stock_before, request_updates, note,
    demo_session_id, input_duration_ms
  ) values (
    v_event_id, v_now, v_actor.id, v_actor.name, v_actor.role,
    coalesce(p->>'screen', ''), '수거 완료', v_schedule_id,
    v_created, v_client.id, v_client.name, p->>'wasteType', v_amount,
    v_before, v_material_ids, v_stock_before, v_req_updates,
    coalesce(p->>'memo', ''), v_demo,
    nullif(p->>'inputDurationMs', '')::integer
  );

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, screen, before_data, after_data, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.complete', 'schedules',
          v_schedule_id::text, v_client.id, v_client.name, coalesce(p->>'screen',''),
          v_before,
          jsonb_build_object('actualAmount', v_amount, 'handoverStatus', p->>'handoverStatus'),
          format('%s 수거 완료 · %skg%s', v_client.name, v_amount,
                 case when v_supplied_any then format(' · 자재 %s개 공급',
                   v_sup_box + v_sup_plastic + v_sup_bag + v_sup_needle) else '' end));

  return jsonb_build_object('eventId', v_event_id, 'scheduleId', v_schedule_id, 'createdSchedule', v_created);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 수거 완료 취소 — 일정/자재/재고/요청을 원복하고 감사기록은 유지합니다.
-- ─────────────────────────────────────────────────────────────────────────────
-- security definer 인 이유:
--  취소는 자재 공급 이력을 되돌려야 하는데, materials 에 DELETE 정책을 열어 주면
--  누구나 임의의 자재 기록을 지울 수 있게 됩니다. 그래서 정책을 넓히는 대신
--  이 함수 안에서만 정리하고, 권한 검사는 아래에서 직접 수행합니다.
create or replace function public.revert_collection(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_e     collection_events%rowtype;
  v_now   timestamptz := now();
  v_stock jsonb;
  r       record;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  select * into v_e from collection_events where id = p_event_id for update;

  -- 현장 담당자는 본인이 입력한 건만 취소할 수 있습니다.
  -- (관리자·사무실은 다른 사람의 입력도 정정할 수 있어야 합니다)
  if found and v_actor.role = 'field' and v_e.actor_id is distinct from v_actor.id then
    raise exception '본인이 입력한 수거만 취소할 수 있습니다.' using errcode = 'P0001';
  end if;
  if not found then
    raise exception '취소할 입력을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_e.reverted then
    raise exception '이미 취소된 입력입니다.' using errcode = 'P0001';
  end if;

  -- 1) 일정 원복
  if v_e.created_schedule then
    delete from schedules where id = v_e.schedule_id;
  else
    update schedules set
      status          = coalesce(v_e.before_state->>'status', '예정'),
      actual_amount   = nullif(v_e.before_state->>'actualAmount', '')::integer,
      actual_time     = null,
      completed_at    = null,
      containers      = null,
      driver_name     = null,
      handover_status = nullif(v_e.before_state->>'handoverStatus', ''),
      handover_at     = null,
      event_id        = null,
      updated_by      = v_actor.id
    where id = v_e.schedule_id;
  end if;

  -- 2) 자재 이력 제거 — 되돌린 공급분을 원장에 '취소'로 남기고 삭제합니다.
  if array_length(v_e.material_ids, 1) is not null then
    insert into material_transactions (kind, item, qty, client_id, material_id, event_id, memo, created_by)
    select '취소', t.item, t.qty, v_e.client_id, m.id, v_e.id, '수거 완료 취소로 원복', v_actor.id
    from materials m
    cross join lateral (values
      ('corrugatedBox', m.box_count),
      ('bag', m.vinyl_count),
      ('needleBox', m.needle_box_count)
    ) as t(item, qty)
    where m.id = any(v_e.material_ids) and t.qty > 0;

    delete from materials where id = any(v_e.material_ids);
  end if;

  -- 3) 재고 복원 — 이벤트에 기록해 둔 차감 전 재고로 되돌립니다.
  v_stock := v_e.stock_before;
  if v_stock ? 'corrugatedBox' then
    update office_stock set
      corrugated_box    = (v_stock->>'corrugatedBox')::int,
      plastic_container = (v_stock->>'plasticContainer')::int,
      bag               = (v_stock->>'bag')::int,
      needle_box        = (v_stock->>'needleBox')::int,
      updated_by        = v_actor.id
    where id = 1;
  end if;

  -- 4) 요청 오버라이드 원복
  for r in select value->>'requestId' as rid from jsonb_array_elements(v_e.request_updates)
  loop
    delete from request_overrides where request_id = r.rid;
  end loop;

  -- 5) 감사기록은 삭제하지 않고 취소 표시
  update collection_events set reverted = true, reverted_at = v_now where id = v_e.id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id,
                          client_id, client_name, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'collection.revert', 'collection_events',
          v_e.id::text, v_e.client_id, v_e.client_name,
          format('%s 수거 완료 취소 · %skg', v_e.client_name, v_e.amount_kg));

  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 시연 데이터 초기화 — demo_session_id 가 있는 기록만 정리합니다.
-- 실제 운영 데이터(demo_session_id is null)는 절대 건드리지 않습니다.
-- 관리자만 실행할 수 있습니다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reset_demo_records(p_session_id text)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_actor profiles%rowtype;
  v_counts jsonb;
begin
  select * into v_actor from profiles where id = auth.uid() and active;
  if not found or v_actor.role <> 'admin' then
    raise exception '시연 데이터 초기화는 관리자만 실행할 수 있습니다.' using errcode = 'P0001';
  end if;
  if coalesce(p_session_id, '') = '' then
    raise exception '시연 세션 id 가 필요합니다. (실제 운영 데이터는 초기화할 수 없습니다)'
      using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'schedules', (select count(*) from schedules where demo_session_id = p_session_id),
    'materials', (select count(*) from materials where demo_session_id = p_session_id),
    'events',    (select count(*) from collection_events where demo_session_id = p_session_id),
    'notes',     (select count(*) from site_notes where demo_session_id = p_session_id),
    'leads',     (select count(*) from sales_leads where demo_session_id = p_session_id)
  ) into v_counts;

  delete from sales_leads       where demo_session_id = p_session_id;
  delete from site_notes        where demo_session_id = p_session_id;
  delete from collection_events where demo_session_id = p_session_id;
  delete from materials         where demo_session_id = p_session_id;
  delete from schedules         where demo_session_id = p_session_id;
  delete from request_overrides where demo_session_id = p_session_id;
  delete from clients           where demo_session_id = p_session_id;

  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, summary)
  values (v_actor.id, v_actor.name, v_actor.role, 'demo.reset', 'demo_session', p_session_id,
          format('시연 세션 %s 기록 삭제 (실제 운영 데이터 보존)', p_session_id));

  return v_counts;
end $$;

-- ══════════════════════════════════════ 0004_grants.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- PostgREST 롤 권한
--
--  Supabase 는 public 스키마에 default privileges 가 설정되어 있어 대개
--  자동으로 부여되지만, 프로젝트 설정에 의존하지 않도록 명시적으로 부여합니다.
--
--  실제 접근 제어는 RLS(0002_rls.sql)가 담당합니다. 여기서는 "테이블에 말을
--  걸 수 있는지"만 열어 주고, "무엇을 볼 수 있는지"는 정책이 결정합니다.
--
--  anon(비로그인)에게는 아무 권한도 주지 않습니다 — 로그인해야만 운영 데이터에
--  접근할 수 있어야 하기 때문입니다.
-- ─────────────────────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated, service_role;

-- 로그인 사용자: 테이블 접근 가능(단, 행 단위 제한은 RLS 가 적용)
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 서버 전용 롤
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 감사로그는 기록만 가능하고 수정·삭제는 아무도 할 수 없습니다.
-- (RLS 에 update/delete 정책이 없고, 여기서 권한 자체도 회수합니다)
revoke update, delete on public.audit_logs from authenticated;

-- 비로그인(anon)은 어떤 운영 테이블에도 접근할 수 없습니다.
revoke all on all tables in schema public from anon;

-- 이후 추가되는 테이블에도 동일하게 적용
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
