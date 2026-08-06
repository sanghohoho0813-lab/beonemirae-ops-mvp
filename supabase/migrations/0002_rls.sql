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
