# PILOT EVIDENCE AUDIT (0125)

> 「사용자가 평소 업무만 하면, 정책자금용 자료를 따로 입력하지 않아도
> 실제 AX 사용의 증거가 자동으로 쌓이는 상태」인지 **코드와 실제 데이터 흐름으로** 확인한 기록입니다.
> 감사일 2026-09-16 · 신규 기능 추가 없음 · P1 2건만 최소 수정.

---

## 1. AX 코치 — Mission 수명주기

### 1-1. 오늘 할 일은 어떻게 고르는가 (`src/lib/axCoach.ts`)

고정 목록이 아닙니다. `missionCandidates()` 가 매번 계산합니다.

```
priority = gap(그 갈래의 부족분) × fillWeight × today(오늘 해당 건수) × IMPORTANCE
```

- `gap` = `1 − 그 갈래 준비도/100` → **이미 찬 갈래는 0 에 수렴해 후보에서 빠집니다.**
- `today` = 오늘 실제로 할 수 있는 건수(오늘 갈 병원 수, 입력 빠진 방문 수 …). 없으면 0 → 후보 아님.
- `priority <= 0` 이면 아예 만들지 않습니다.
- `roles` 로 역할별로 거릅니다 — 기사에게는 돈 관련 일(주문·입금)이 뜨지 않습니다.
- 같은 일을 이틀 이상 발행만 하고 못 채웠으면 `priority × 0.6` 으로 물립니다.

### 1-2. Mission 8종과 「확인됨」의 근거

**단추를 눌러 완료되는 미션은 하나도 없습니다.** `verifyMission()` 이 실제 업무 기록을 찾습니다.

| Mission | 갈래 | 확인 근거 (실제 표) | 시연 제외 |
|---|---|---|---|
| `collect-today` 오늘 다녀온 곳 바로 입력 | 업무 활용 | `collection_events` 수거 완료 · 다녀온 날 = 입력한 날 | `demoSessionId` · `reverted` 제외 |
| `catch-up-entry` 빠진 입력 채우기 | 업무 활용 | `collection_events` (그 일정) | 같음 |
| `material-record` 자재 기록 | 업무 활용 | `materials` 또는 수거 이벤트의 `materialIds` | `reverted` 제외 |
| `client-info` 거래처 빈칸 | 업무 활용 | `clients.address` · `phone` 이 채워짐 | — |
| `portal-request` 병원이 직접 올리게 | 병원 직접사용 | `client_requests.source='portal'` 또는 포털 주문 | `demoSessionId` 제외 · **직원 대신 접수(staff)는 안 셈** |
| `order-deliver` 주문 전달 | 매출 증거 | 주문의 `deliveredAt` | — |
| `payment-match` 입금 확인 | 매출 증거 | `payments.paidAt` · 취소 아님 | — |
| `day-close` 오늘 마감 | 운영 확장 | `day_closes` 오늘 기록 | — |

### 1-3. 수명주기 — 실제로 재 본 결과

`test/browser/check_coach_lifecycle.mjs` (Playwright clock 으로 날짜만 이동 · 운영 DB·시스템 시각 불변)

| 시나리오 | 관찰 |
|---|---|
| S1 같은 날 두 번 열기 | `collect-today · payment-match · portal-request` — **순서까지 동일** |
| S2 실제 수거 1건 | `collect-today` 가 확인됨으로, 남은 일 2개 → 「3개 중 1개 확인됨」 |
| S3 오늘 몫을 다 함 | 남은 일이 **0 이 되고 「모두 확인했습니다」** 로 남음 (0125 수정 후) |
| S4 다음 날 | 그때까지 쌓인 자료로 다시 골라 최대 3개 · 어제 확인은 넘어오지 않음 |
| S5 우선순위 | 네 갈래가 모두 0% 일 때 세 갈래에서 하나씩 나옴 |

**0125 에서 고친 것 (P1)** — 예전에는 하나를 확인할 때마다 그 자리가 **새 일로 채워졌습니다.**
수거 1건을 넣자 「오늘 할 일 3개」가 「4개 중 1개 확인됨」이 됐습니다(오늘 받은 일이 늘어남).
지금은 **확인된 것까지 합쳐 하루 3개**이고, 다 하면 남은 일 0 · 다음 몫은 내일입니다.

### 1-4. 남은 약점 (수정하지 않음 · 보고)

**「업무하러 가기」를 누르지 않고 바로 일한 Mission 은 「확인됨」으로 남지 않습니다.**
카드 목록은 후보에서 만들어지는데, 일을 끝내면 그 후보가 사라지기 때문입니다.
발행 이력(`ax_coach_missions`, 0108)에 남은 것만 `extra` 로 카드를 붙잡아 둡니다 —
그 이력은 **단추를 눌렀을 때만** 기록됩니다.

- 정상 경로(코치 화면에서 단추 → 업무 화면)에서는 문제가 없습니다.
- 다른 길로 들어가 일한 날은 준비도·Evidence 에는 정상 반영되지만, 그날 코치 화면의
  「N개 중 M개 확인됨」에는 안 잡힙니다.
- 고치려면 후보 조건(「오늘 할 것이 남았는가」 → 「오늘 대상이 있었는가」)을 바꿔야 해
  최소 수정 범위를 넘습니다. 대표님 판단을 받고 진행할 일로 남깁니다.

---

## 2. 실증 자료 준비도 % — 무엇을 세는가

`coverageOf()` → 네 갈래 평균. 갈래 안에서는 **항목별 달성비(최대 1)의 평균**입니다.

> 19% 는 「성과가 19% 좋아졌다」가 아니라 **「정의된 실증 항목 중 자료가 19% 만큼 모였다」** 입니다.
> 화면도 그렇게 적습니다 — `data-coach-caveat`: 「자료가 얼마나 모였는지입니다 — 성과가 N% 좋아졌다는 뜻이 아닙니다」. **문구와 로직이 일치합니다.**

| 갈래 | 항목 | 목표 | 원본 |
|---|---|---|---|
| 업무 활용 | 현장에서 입력한 수거 | 30건 | `collection_events` (시연·연습·취소 제외) |
| | 입력한 날 | 14일 | 현장 입력이 있었던 서로 다른 날 |
| | 다녀온 일정을 입력한 비율 | 80% | 완료 일정 중 입력이 남은 비율 |
| | 입력이 끝난 수거 | 5건 | 완료 + 입력 시각 |
| 매출 증거 | 소모품 주문 / 전달 완료 / 청구 확정 / 입금 완료 / 재구매 병원 | 5·5·1·1·1 | 주문·청구·입금 표 |
| 운영 확장 | 완료한 방문 / 나간 날 / 기사 수 / 차량 운행일 | 30·14·2·5 | `schedules` · 기사 이름이 적힌 건만 |
| 병원 직접사용 | 병원이 직접 올린 요청·주문 | 5건 | `client_requests(source=portal)` + 포털 주문 |
| | 포털을 쓴 병원 / 두 번 이상 쓴 병원 / 응답시간 잰 건 | 2곳·1곳·5건 | 같음 |

- 화면을 **보기만 해서는 1%도 오르지 않습니다.** 모든 항목의 원본이 업무 기록입니다.
- 취소(`reverted`)·시연(`demoSessionId`)·실증 시작일 이전(practice)은 `evidenceBase.classifyEvent()` 가 뺍니다.
- 못 센 값은 0 으로 바꾸지 않고 `null`(못 셈)로 둡니다.

---

## 3. Pilot Evidence — 항목 · 원본 · 필터 (`src/lib/pilotEvidence.ts`)

기간은 **`experiment_settings.pilot_start_date` 만** 씁니다(2026-09-16).
기존 실증 시작일(2026-08-29)은 **읽지 않습니다** — 기존 성과 화면 전용입니다.

| Evidence | 원본 표 / 칸 | 무엇을 하면 생기나 | 시연 제외 | Pilot 기간 | Pilot 거래처 | 화면 |
|---|---|---|---|---|---|---|
| 수거 입력 | `collection_events` | 현장이 수거 입력 저장 | `demo_session_id` | ✔ | ✔ | Pilot 카드 · 상세 |
| 수거 완료(분모) | `schedules.status='완료'` | 같은 저장이 일정을 완료로 | `origin` demo/seed/migrated 제외 | ✔ | ✔ | 자재사용 기록률 |
| 실사용자 | `collection_events.actor_id/name` | 로그인한 사람이 저장 | 같음 | ✔ | ✔ | 실사용자 N명 |
| 거래처 Coverage | 위 이벤트의 `client_id` | 서로 다른 병원에서 저장 | 같음 | ✔ | ✔ | Coverage M/N |
| 자재 사용 | `schedules.containers.usedItems` | 수거 입력에서 규격별 사용량 | 일정 origin | ✔ | ✔ | 자재사용 기록 · 규격별 |
| 자재 공급 | `materials.items` | 자재 공급 등록 / 수거 시 동시공급 | `demo_session_id` (0122에서 읽기 추가) | ✔ | ✔ | 규격별 공급 |
| Portal 요청 | `client_requests.source='portal'` | 병원이 포털에서 직접 올림 | `demo_session_id` | ✔ | ✔ | Portal 요청 N건 |
| Portal 처리 | 같은 줄의 `handled_at` | 직원이 처리 | 같음 | ✔ | ✔ | 처리 N건 |
| Data Connection | 이벤트 → 완료 일정 연결 | 한 번 저장이 이력·거래처로 | 같음 | ✔ | ✔ | 연결 M/N |
| 입력 정정 | `reverted` 이벤트 수 | 잘못 넣은 것을 취소 | 같음 | ✔ | ✔ | 취소된 입력 N / 전체 N |
| 기준값 | `performance_baselines` | 사람이 실측을 입력 | 시연 예시값은 UNKNOWN | — | — | BASELINE KNOWN/UNKNOWN |
| 사용자 피드백 | 피드백 화면 | 사람이 답함 | — | — | — | **합치지 않고 자리만 표시** |

- **같은 사건을 두 번 세지 않습니다.** 포털 요청과 그 뒤의 수거는 각각 다른 사실로 남고,
  하나의 「성과」로 합치지 않습니다.
- **사용 자재는 재고를 움직이지 않습니다.** 재고는 공급(`supplied`)에서만 빠집니다 —
  `check_used_material` · `check_used_amend` 가 이중차감 0 을 확인합니다.

---

## 4. 제외 규칙 한눈에

| 빼는 것 | 어떻게 가르나 | 어디서 |
|---|---|---|
| 시연 | `demo_session_id` (이벤트 · 요청 · 자재) | `classifyEvent` · `pilotEvidence` |
| 시드/이관 | `schedules.origin` = demo · seed · migrated | `isFieldSchedule` |
| 취소 | `reverted = true` | `classifyEvent` |
| Pilot 시작일 이전 | `pilot_start_date` 이전 | `pilotEvidence` |
| Pilot 아닌 거래처 | `pilot_client_ids` 밖 | `pilotClientsOf` |
| 시연용 거래처 | `clients.is_demo_generated` | `pilotClientsOf` |

빠진 건수는 감추지 않고 Pilot 카드에 그대로 적습니다 — 「시연 N · 시작일 이전 N · 취소 N · Pilot 외 N」.

---

## 5. 추적 가능성 (심사자 질문 대비)

| 화면의 숫자 | 원본 | 사람 | 거래처 | 날짜 |
|---|---|---|---|---|
| Pilot 수거 입력 N건 | `collection_events` N줄 | `actor_id` / `actor_name` | `client_id` | `at` |
| 실사용자 N명 | 위 줄의 서로 다른 `actor` | ✔ | — | ✔ |
| 자재사용 기록 N건 | `schedules.containers.usedItems` | 그 일정의 이벤트 actor | `client_id` | `date` |
| 규격별 사용 N개 | 같은 jsonb 의 규격별 값 | ✔ | ✔ | ✔ |
| Portal 요청 N건 | `client_requests(source=portal)` | `requester_name` | `client_id` | `created_at` |
| 준비도 % | 위 항목들의 달성비 평균 | — | — | 실증 시작일~오늘 |

---

## 6. 이번 감사에서 고친 것

| 등급 | 문제 | 수정 |
|---|---|---|
| P1 | 하나를 확인할 때마다 새 일이 즉시 보충돼 「오늘 받은 일」이 계속 늘어남 | `coachMissions` 에서 오늘 몫을 **확인된 것까지 합쳐 3개**로 제한 (`max − done`) |
| P1 | 「다 했다」와 「줄 것이 없다」가 같은 문구였음 | 다 한 날은 「오늘 할 일 N개를 모두 확인했습니다 · 다음은 내일」 |

DB·RLS·권한·정산·청구·재고·Evidence 계산은 **한 줄도 바꾸지 않았습니다.**
