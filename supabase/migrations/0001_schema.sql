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
