# PILOT CLEAN START — 감사 보고 (0127 · 삭제 없음)

> 2026-09-17. **아무것도 지우지 않았습니다.** 이 문서는 「무엇이 어디에 얼마나 걸려 있는가」와
> 「지우면 무엇이 같이 움직이는가」를 코드(마이그레이션 64개 + 실행된 제안 SQL 14개)로
> 확인한 결과입니다. 실제 삭제 SQL 은 대표님이 DRY RUN 결과를 보시고 **승인하신 뒤** 따로 만듭니다.
>
> 확인 방법: 이 환경에서는 운영 DB 를 읽을 수 없습니다. 대신 **빈 Postgres 16 에 마이그레이션
> 0001~0064 와 제안 0067→0070→0073→…→0108→0122→0123 을 순서대로 다시 적용**(실패 0, 판 123)해
> 실제 카탈로그(pg_constraint · pg_trigger)에서 FK 정책과 삭제 트리거를 읽었고, 시험용 거래처
> 1곳을 넣어 DRY RUN SQL 이 끝까지 도는지, 삭제가 실제로 어디서 막히는지(롤백) 확인했습니다.
> **건수는 운영 DB 에서 DRY RUN 을 돌려야 나옵니다** — 여기 숫자는 없습니다.

## 1. 유지 거래처 — 분류 기준 (자동 분류 안 함)

거래처 이름을 이 환경에서 볼 수 없으므로 **분류는 DRY RUN ① 결과표**로 하십니다. 그 표에는
거래처마다 `사용중 · PILOT · 시연생성 · 시연세션 · 계약종료 · 일정/수거기록/자재/청구/포털요청/주문/포털계정 건수 · 마지막 수거일`이 나옵니다.

| 분류 | 기준 (표에서 읽는 값) | 처리 |
|---|---|---|
| **유지** | `PILOT = true` (experiment_settings.pilot_client_ids) — 새 Pilot 10곳 | 손대지 않음 |
| **유지** | `사용중 = true` 이고 마지막 수거가 최근 | 손대지 않음 (Pilot 아니어도 삭제 대상 아님) |
| **삭제 후보** | `시연생성 = true` 또는 `시연세션 = true` | 시연 자료 — Legacy |
| **삭제 후보** | `사용중 = false` · 계약종료가 지났음 · 옛 시험 이름 | 대표님이 이름을 보고 확정 |
| **보류** | `청구 > 0` 이거나 `포털계정 > 0` | §5 · §7 결정 뒤에만 |

⚠ 삭제 SQL 은 **거래처 id 를 명시한 목록**만 지웁니다. 「Pilot 이 아닌 전부」 같은 조건 삭제는 만들지 않습니다.

## 2. 삭제 Legacy — 기록과 함께 사라지는 것

Legacy 거래처 id 목록에 대해, 거래처를 지우려면 아래가 **먼저** 비워져야 합니다(RESTRICT/NO ACTION)
또는 **같이** 사라집니다(CASCADE). 셋째 부류(SET NULL)는 남되 거래처 칸만 비워집니다.

## 3. 테이블별 Record — FK 정책 · 삭제 순서 (카탈로그 확인값)

| 순서 | 표 | → clients FK | 2차 종속 | 처리 |
|---|---|---|---|---|
| 1 | `schedule_feedback` | CASCADE | `schedule_id → schedules` CASCADE | 자동, 명시 삭제로 건수 확인 |
| 2 | `collection_events` | **SET NULL** | `schedule_id` FK 없음 | **직접 삭제** (client_id 또는 schedule_id 가 Legacy) — Evidence 원천 |
| 3 | `material_transactions` | SET NULL | `material_id → materials` SET NULL | **직접 삭제** |
| 4 | `materials` | **RESTRICT** | — | 직접 삭제 · ⚠ **삭제 트리거 `apply_item_stock_del`** (§6) |
| 5 | `product_order_items` | — | `order_id → product_orders` CASCADE | 자동 |
| 6 | `product_orders` | **NO ACTION** | `deliver_schedule_id → schedules` SET NULL | **직접 삭제** |
| 7 | `client_requests` | CASCADE | — | 자동 |
| 8 | `request_overrides` | FK 없음 (`request_id text`) | — | **직접 삭제** (Legacy 요청 id) |
| 9 | `payment_receipts` | — | `payment_id → payments` CASCADE | 자동 |
| 10 | `payments` | **RESTRICT** | — | ⚠ **삭제 방지 트리거 `payments_guard_del`(0037) 가 모든 DELETE 를 거절** (§7) |
| 11 | `schedules` | **RESTRICT** | — | 직접 삭제 |
| 12 | `site_notes` | CASCADE | — | 자동 |
| 13 | `client_documents` | CASCADE | — | 자동 (첨부 파일은 DB 밖 — 스토리지 버킷 정의가 마이그레이션에 없음, 파일이 있다면 남음) |
| 14 | `client_prices` | CASCADE | — | 자동 |
| 15 | `client_monthly_actuals` | CASCADE | — | 자동 |
| 16 | `revenue_overrides` | CASCADE | — | 자동 |
| 17 | `client_assignments` | CASCADE | — | 자동 (담당 기사 배정 — 직원은 그대로) |
| 18 | `sales_lead_events` | — | `lead_id → sales_leads` CASCADE | 자동 |
| 19 | `sales_leads` | CASCADE | — | 자동 |
| 20 | `client_inquiries` (0083) | CASCADE | — | 자동 |
| 21 | `recommendation_views` (0106) | CASCADE | — | 자동 |
| — | `audit_logs` | SET NULL | — | **지우지 않음** — 감사기록 보존, 거래처 칸만 비워짐 |
| — | `profiles` (포털 계정) | SET NULL | — | **지우지 않음** — 소속만 풀림 (§5) |
| — | `staff_invites.client_ids` | 배열 · FK 없음 | — | 지우지 않음 (남은 id 무해) |
| — | `ax_coach_missions.target_id` | text · FK 없음 | — | 지우지 않음 (미션 발행 기록은 보존, 대상이 사라진 줄만 남음) |
| 99 | `clients` | — | — | **맨 마지막** |

삭제 트리거는 카탈로그 전체에서 **두 개뿐**입니다: `materials.apply_item_stock_del`, `payments.payments_guard_del`. 둘 다 로컬에서 실제로 확인했습니다(§6 · §7).

## 4. 보존 — 손대지 않는 것

`auth.users` · `profiles`(직원·포털 계정 전부) · `vehicles` · `staff` · `staff_invites` · RLS/정책/함수 ·
Material Master(`item_buckets` · `products`) · `office_stock` · `office_stock_items` · `experiment_settings`(start_date 2026-08-29 그대로) ·
`performance_baselines` · `operating_costs` · `holidays` · `tax_filings` · `day_closes` · `month_close_marks` · `ops_changes` ·
`dispatch_decisions` · `ax_coach_missions` · `audit_logs` · `app_errors` · `dev_requests` · `ai_calls` · 새 Pilot 10곳과 그 기록 전부.

**백업**: 앱의 「설정 → 데이터 백업(JSON)」은 29개 표만 담고 `client_assignments · office_stock_items · day_closes ·
ax_coach_missions · dispatch_decisions · ops_changes · recommendation_views · client_inquiries · profiles` 는 **빠져 있습니다.**
삭제 전 백업은 Supabase 대시보드 **Database → Backups**(또는 PITR) 로 하시고, 앱 JSON 백업은 보조로만 두십시오.

## 5. Portal 영향

`profiles.client_id → clients` 는 **SET NULL** 입니다. Legacy 거래처에 걸린 포털 계정이 있으면 계정은 남되
소속 병원이 비어 「소속 병원 없음」 상태가 됩니다 (DRY RUN ③-2 가 그 계정을 이름·이메일로 보여 줍니다).
새 Pilot 두 계정(오남한양병원 · 남양주백병원)은 **유지 거래처**에 연결돼 있어야 하며, 만약 같은 병원이
Legacy 와 새 거래처로 **두 줄** 있다면 삭제 전에 「사용자 관리 → 소속 병원」에서 새 줄로 옮겨야 합니다.

## 6. 재고 영향 (office_stock 은 실제 값입니다 — 초기화하지 않음)

- `office_stock`(4칸)과 `office_stock_items`(규격별)는 **거래처와 무관한 실제 카운터**입니다. 삭제 SQL 은 두 표를 건드리지 않습니다.
- ⚠ 그러나 `materials` 줄을 지우면 **트리거 `apply_item_stock_del`(0079)** 가 그 줄의 `items` 수량을 규격별 재고에 **도로 더합니다**
  (무르기 때문에 만든 규칙). 로컬 재현: box63 재고 7 → materials 1줄(3개) 삭제 → **10**.
  Legacy 공급 기록이 많으면 규격별 재고가 그만큼 **부풀어** 실물과 어긋납니다.
- 선택지 (대표님 결정): **(a)** 삭제 트랜잭션 안에서만 `alter table materials disable trigger apply_item_stock_del` → 삭제 → `enable` (재고 그대로, 권장) /
  **(b)** 트리거를 그대로 두고 삭제 뒤 「자재 관리 → 실사」로 재고를 다시 셈.
  DRY RUN ③-4 가 규격별로 얼마나 더해질지 미리 보여 줍니다.

## 7. 위험 · 결정 필요

| # | 위험 | 사실 | 결정 |
|---|---|---|---|
| R1 | **청구(payments) 삭제가 막힘** | `payments_guard_del` 이 모든 DELETE 를 예외로 거절 (로컬 확인: 「확정한 청구는 지우지 않습니다…」). `payments.client_id` 는 RESTRICT 라 청구가 남아 있으면 거래처도 못 지움 | (a) Legacy 청구가 있는 거래처는 **삭제하지 않고 `active=false` 로 두기** (권장 — 돈 기록 보존) / (b) 트랜잭션 안에서만 `payments_guard_del` 비활성 → 삭제 → 재활성 (돈 기록 소실, 입금 기록 포함) |
| R2 | 규격별 재고 부풀림 | §6 | (a)/(b) |
| R3 | 포털 계정 소속 풀림 | §5 | 삭제 전 소속 이동 |
| R4 | Evidence 숫자 변화 | Pilot 집계(pilotEvidence.ts)는 `pilot_client_ids` ∩ `pilot_start_date` 이후만 셉니다. Legacy 는 어차피 집계 밖 — 로직 변경 없음. 기존 성과 화면(start_date 2026-08-29 기준)은 Legacy 기록이 빠지면 **숫자가 줄어듭니다** (Legacy 가 실제 운영 기록이었다면) | 인지 후 진행 |
| R5 | 청구 첨부 파일 | `client_documents` 줄은 CASCADE 로 사라지지만 파일 저장소는 마이그레이션 밖 | 파일이 있다면 별도 정리 |
| R6 | 되돌리기 | 트랜잭션 안에서 건수 확인 → 마지막 줄이 `rollback;` 인 채로 먼저 실행(예행) → 결과가 맞을 때만 `commit;` 으로 바꿔 실행. 커밋 뒤 되돌림은 §4 백업뿐 | — |

## 8. DRY RUN SQL

`supabase/proposals/PROPOSAL_0127_pilot_clean_start_DRYRUN.sql` — **읽기만**(임시 표 하나만 만들고 사라짐).
① 전체 거래처 분류표 → Legacy id 를 파일의 「LEGACY 목록」 자리에 넣고 다시 실행 → ② 표별 삭제 건수 · ③ Pilot 혼입 0건 확인 ·
포털 계정 · 청구/입금 합계 · 규격별 재고 미리보기 · 실증 설정 → ④ 0083/0106 표 건수(있을 때만).

### 다음 단계 (승인 후)
1. 대표님: DRY RUN 실행 → ①~④ 결과와 R1/R2 선택을 알려 주십시오.
2. 그 다음 실제 삭제 SQL `PROPOSAL_0128_pilot_clean_start.sql` 을 만듭니다 — 명시 id 목록 · 사전 건수 · 트랜잭션 · Pilot 혼입 시 즉시 예외 · §3 순서 · clients 마지막 ·
   `pilot_client_ids` 에서 삭제 id 제거 · 사후 검증(남은 참조 0) · 기본 `rollback;`.
3. `pilot_start_date = 2026-09-17` 은 `PROPOSAL_0123_pilot_start.sql`(수정본)이 맞춥니다 — start_date 는 건드리지 않습니다.

## 절대 하지 않은 것
TRUNCATE · DB 초기화 · auth.users 삭제 · 직원/차량 삭제 · RLS/Auth 변경 · 스키마 재생성 · 마이그레이션 재실행(운영) · Evidence 수치 손대기 · 시연→실제 전환 · 삭제 후 시드.
