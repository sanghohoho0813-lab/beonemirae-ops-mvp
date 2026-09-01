# 멀티테넌트(SaaS) 전환 계획 — 0096

> 심사에서 「플랫폼으로 확장 가능합니까?」를 받았을 때의 답이 이 문서입니다.
> 「가능합니다」가 아니라 **「이렇게 하면 됩니다」**로 답하기 위한 것입니다.

## 1. 지금 구조에 대한 정직한 진단

현재 시스템은 **㈜비원미래 전용 단일 회사 구조**입니다.

- 테이블 35개 어디에도 회사 구분 칸(`company_id`)이 없습니다.
- 접근 제어(RLS)는 「병원 계정은 자기 병원 자료만」 기준입니다 —
  **병원 격리는 되어 있으나 회사 격리는 없습니다.**
- 따라서 지금 이대로 다른 수거·운반 회사가 쓰면 자료가 섞입니다.

이것은 설계 실수가 아니라 **의도한 순서**입니다. 자기 회사 실운영으로
업무 모델을 검증하기 전에 멀티테넌트부터 만들면, 검증 안 된 업무 구조가
여러 회사에 복제됩니다.

## 2. 전환 범위 — 전수 목록

### 2-1. 회사 구분 칸을 추가할 표 (31개)

운영 데이터 전부입니다.

```
clients · schedules · collection_events · client_requests · client_inquiries¹ ·
client_documents · client_monthly_actuals · client_prices · client_assignments ·
payments · payment_receipts · revenue_overrides · tax_filings ·
materials · material_transactions · office_stock · office_stock_items¹ ·
products · product_orders · product_order_items ·
vehicles · vehicle_reservations¹ · site_notes · schedule_feedback ·
sales_leads · sales_lead_events · operating_costs · month_close_marks ·
day_closes¹ · request_overrides · performance_baselines
```
¹ 제안서(proposals)로 추가된 표 — 운영 DB 에는 이미 존재.

### 2-2. 회사 구분이 다른 방식으로 걸리는 표 (4개)

- `profiles` · `staff` · `staff_invites` — 계정이 회사에 속하게 (`company_id`)
- `audit_logs` — 행위자 소속으로 자동 결정

### 2-3. 회사 구분이 필요 없는 표 (2개)

- `holidays` (공휴일 — 전 회사 공통) · `app_errors` (시스템 공통)

### 2-4. 신규 표 (2개)

- `companies` — 회사 마스터
- `company_settings` — 회사별 설정(테마 기본값 · 문서 서식 등)

## 3. 전환 단계

| 단계 | 내용 | 검증 방법 |
|---|---|---|
| T1 | `companies` 표 신설 + 전 표에 `company_id` 추가, 기존 데이터는 전부 ㈜비원미래로 backfill | 격리 DB 회귀 48 스위트 |
| T2 | RLS 전면 재작성 — 모든 정책에 회사 격리 조건 추가 | **격리 검사 신설**: A사 계정으로 B사 자료 접근 시도 전수 |
| T3 | 함수(RPC) 32개에 회사 검증 추가 | DB 회귀 + 신설 격리 검사 |
| T4 | 화면 — 회사 컨텍스트 주입(병원 컨텍스트와 같은 방식: URL 이 아니라 계정 소속으로) | 브라우저 회귀 127 스위트 |
| T5 | 회사 온보딩 화면(가입 → 승인 → 초기 설정) | 신규 E2E |

## 4. 왜 이 전환이 안전한가 — 심사에서 강조할 지점

이 전환은 **테이블 35개 · RPC 32개 · 화면 43개**를 건드리는 대규모 변경입니다.
보통은 이런 변경이 기존 기능을 깨뜨립니다. 이 시스템에는:

- **자동 검증 약 6,000건** (브라우저 127 스위트 + DB 48 스위트)이 이미 있고,
- DB 검사는 **빈 DB 에 마이그레이션을 처음부터 올려** 돌므로,
  T1~T3 의 스키마 변경이 무엇을 깨뜨리는지 그날 바로 드러납니다.

「검증 체계가 있어서 대규모 구조 변경을 안전하게 할 수 있다」 —
이것이 이 계획의 실행 가능성 근거입니다.

## 5. 적지 않은 것

기간·비용은 적지 않습니다. 투입 인력 구성이 정해지지 않은 상태에서 적는
숫자는 추정이 아니라 창작이고, 심사에서 근거를 물으면 무너집니다.
확정되는 대로 이 문서에 채웁니다.

## 6. 전제 조건

1. **단일 회사 실증 완료가 먼저입니다** — 심사 준비도 화면(/readiness)의
   항목들이 「준비됨」이 된 다음의 일입니다.
2. 첫 외부 고객사는 **동일 업종(의료폐기물 수거·운반)** 이어야 합니다.
   업무 모델이 다른 업종은 검증 밖입니다.
