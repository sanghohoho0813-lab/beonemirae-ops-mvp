# PROJECT_STATE — 0122 이번 주 PILOT 최종 고도화

> Material Usage + 5~10 Customer Pilot + Automatic Evidence
> **STRICT SCOPE / NO REBUILD / NO FEATURE EXPANSION**
>
> §1~7 은 PASS 1(조사) 결과이고, PASS 2 는 그 범위 안에서만 구현했습니다.
> 구현 결과·검사·RED TEAM·보고는 `docs/PILOT_0122.md`, 운영 계획은 `PILOT_PLAN.md`.

## 상태 (PASS 2 완료)
| 과제 | 상태 | 검사 |
|---|---|---|
| A. USED MATERIAL | 완료 — 입력 구역 · `containers.usedItems` 저장 · 수정 · 거래처 상세 · 자재관리 공급 vs 확인사용 | `check_used_material` · `check_used_amend` |
| B. Pilot 거래처 | 완료 — 관리자 체크 · 「Pilot N / 10」 · PILOT 배지(오늘 일정·거래처·상세) · SQL 제안 1개 | `check_pilot_390` |
| C. Evidence | 완료 — `pilotEvidence.ts` · 성과 화면 카드(관리자) · 출처 표기 · BASELINE KNOWN/UNKNOWN | `check_pilot_evidence` |
| SQL | `PROPOSAL_0122_pilot_clients.sql` (Pilot 거래처 칸, 판 108 → 122) **실행 완료** · `PROPOSAL_0123_pilot_start.sql` (Pilot 시작일 칸 + 2026-09-16, 판 122 → 123) — 둘 다 추가만, 기존 `start_date` 불변 | — |

---

## 0. 한 줄 결론

| 과제 | 결정 | SQL |
|---|---|---|
| A. USED MATERIAL (병원 사용 자재, 규격별) | 이미 있는 `schedules.containers` jsonb(= 「가져온 용기」) 안에 `usedItems: {규격key: 수량}` 을 **더 담는다**. 저장 함수(`complete_collection` · `amend_collection`)는 `containers` 를 **그대로 통과**시키므로 SQL 변경 0 | **없음** |
| B. Pilot 거래처 5~10곳 | `experiment_settings` (실증 설정, id=1) 에 `pilot_client_ids uuid[]` 칸 **하나** 추가. 거래처 표(`clients`)는 건드리지 않음 | **1개 (추가만)** — `supabase/proposals/PROPOSAL_0122_pilot_clients.sql` |
| C. Evidence 자동축적 | 새 표·새 이벤트 표 없음. 이미 쌓이는 `collection_events` · `schedules` · `client_requests` · `materials` 를 **Pilot 거래처 × Pilot 기간**으로 걸러 계산하는 순수 함수 `src/lib/pilotEvidence.ts` + 성과 화면에 카드 1장 | **없음** |
| PILOT START DATE | ~~기존 `start_date` 재사용~~ → **0123 에서 바꿨습니다.** 그 값(2026-08-29)은 기존 성과 화면이 「도입 후 / 연습 입력」을 가르는 데 쓰고 있어, Pilot 때문에 옮기면 지금까지 쌓인 기록의 분류가 통째로 바뀝니다. 읽는 곳이 다른 `pilot_start_date` 칸을 따로 둡니다 (이번 Pilot = 2026-09-16) | **1개 (추가만)** — `PROPOSAL_0123_pilot_start.sql` |

---

## 1. 조사한 것 (사실만)

### 1-1. 수거 입력 저장 경로
- 화면 `src/pages/CollectionInput.tsx` → `buildInput()` → `DataContext.completeCollection` → `repo.completeCollection` → RPC `complete_collection(p jsonb)`.
- 서버(`supabase/migrations/0063_field_money_lock.sql`)는 `containers = p->'containers'` 를 **문자 그대로** 저장합니다. 키를 해석하지 않습니다.
- 수정 경로: `CollectionRecord.tsx` → RPC `amend_collection(p_event_id, p_reason, p)` (`supabase/proposals/PROPOSAL_0074_amend.sql`) → 되돌리기 + `complete_collection(v_payload)` **한 트랜잭션**. `p->'containers'` 역시 그대로 전달. 감사기록(`audit_logs.before/after`)에도 containers 원문이 남습니다.
- 재고 차감은 `supplied`(4칸) + `suppliedItems`(규격별) **공급** 값에서만 일어납니다. `containers` 는 재고와 무관합니다 (코드 주석 원문: 「병원에서 배출되어 우리가 가져온 용기 수 — 재고와 무관」).

### 1-2. Material Master
- `src/lib/billing.ts` `ITEMS` (15종) → `SUPPLY_ITEMS` (13종, 규격별 물품): 합성수지 2/5/10/20L, 박스 63/35/30/12/4/79L, 기저귀박스(중), 12L 봉투형용기, 기저귀비닐 40L. 각 항목에 `bucket`(corrugatedBox / plasticContainer / bag) 이 있어 4칸 합계로 접을 수 있습니다.
- 규격을 **새로 하드코딩하지 않습니다.** 사용량 줄은 `SUPPLY_ITEMS` 를 그대로 돕니다.

### 1-3. 「가져온 용기」와 「주고 온 자재」
- 가져온 용기 = `containers` {corrugated, plastic, bag, etc} — 병원이 **사용해 배출한** 용기의 4칸 합계. **이것이 USED MATERIAL 의 거친 버전**입니다.
- 주고 온 자재 = `supplied` / `suppliedItems` → `materials` 표 + 재고 차감 + 정산. **공급**입니다.
- 두 구역은 이미 화면에서 다른 카드이고, 검사 14개가 「가져온 용기 / 골판지 전용박스 …」 라벨을 잡고 있습니다 → 기존 구역은 **그대로 두고**, 규격별 사용량은 **별도 접힌 구역**으로 더합니다.

### 1-4. `containers` 를 읽는 곳 (usedItems 가 들어가도 안전한지)
| 읽는 곳 | 방식 | 판정 |
|---|---|---|
| SQL 전부 (`complete_collection`, `revert`, 0003/0006/0008/0061/0063) | 열에 쓰기 · null 로 지우기만 | 키 해석 없음 → 안전 |
| `ops.ts` `collectionLog` (수거대장 box/vinyl/needle) · `collectionHistory` (용기 열) | 4키 이름으로만 접근 | 안전 |
| `fieldActivity.ts` `containerText` | 4키 이름으로만 접근 | 안전 |
| `CollectionRecord.tsx` | `{...EMPTY_CONTAINERS, ...sched.containers}` 로 펼침 → usedItems 도 **함께 실려 감** | 안전 (수정 시 사용량이 유실되지 않음). 수정 화면에 규격 줄을 더해 값이 어긋나지 않게 함 |
| `collection.ts` `containerTotal` | 4키 더하기 | 안전 |
| `TodaySchedule.tsx` `defaultContainers` (빠른 완료) | kg 에서 4칸 **추정값** 생성 | usedItems 를 만들지 않음 → 「자재사용 기록」으로 세지 않음 (좋음: 추정치는 기록률에 들어가면 안 됨) |
| `seed.ts` `seedContainers` | 시연 데이터 4칸 | usedItems 없음 → 시연은 기록률에서 자연히 빠짐 |

### 1-5. 거래처 표를 안 건드리는 이유 (Pilot 표식)
- `repo.ts` `CLIENT_COLS` 는 **열 단위 권한** 때문에 명시 목록입니다. 칸을 더하면 `grant` + `app_health_check()` + 목록 세 곳을 같이 고쳐야 하고, SQL 을 아직 안 돌린 상태에서 목록만 바뀌면 **거래처 전체가 안 읽힙니다**(permission denied).
- `experiment_settings` 는 `select('*')` 로 읽고(`repo.ts:792`), 쓰기는 `is_admin()` 만(`0002_rls.sql experiment_write`). 칸 하나가 늘어도 SQL 전/후 모두 깨지지 않습니다 — SQL 전에는 `undefined` → Pilot 0곳.
- `Client` 에 Pilot 뜻의 기존 칸·태그는 없습니다(`isDemoGenerated`, `monthlyFlatFee`, `contractStart/End` 만). 「주요거래처」배지는 `!isDemoGenerated` 라 뜻이 다릅니다 → 재사용하면 혼동.
- `src/lib/pilotMode.ts` 는 **화면 숨기기 스위치**(다른 개념). 이름이 부딪히지 않게 새 것은 `pilotClients` / `pilotEvidence` 로 부릅니다.

### 1-6. Evidence 가 이미 쌓이는 곳
| 항목 | 출처 표 | 이미 있는 계산 |
|---|---|---|
| 수거 입력 건수 · 직원 · 거래처별 | `collection_events` (actor_id/name/role, screen, client_id, schedule_id, reverted, demo_session_id, input_duration_ms) | `evidenceBase.classifyEvent` (field/demo/practice/reverted) |
| 수거 처리 완료 | `schedules.status='완료'`, `origin`, `completed_at` | `isFieldSchedule` |
| 자재 사용(규격별) | `schedules.containers.usedItems` (이번에 추가) | 없음 → 새 순수 함수 |
| 자재 공급 | `materials.items` | `Materials.tsx monthItems` |
| Portal 요청 | `client_requests.source='portal'` | `requestsForClient` |
| 시작일 | `experiment_settings.start_date` | `data.experiment.startDate` |
| 사용자 피드백 | `feedbackV2` / `opsSurvey` / `performance_baselines.after_survey` | 별도 표기(USER FEEDBACK), 시스템 로그와 섞지 않음 |
- `CollectionEvent` TS 타입에 `actorId/actorName` 이 **없습니다**(DB 에는 있음). 「실사용자 N명」을 세려면 `toEvent` 매핑에 선택 칸 두 개를 더합니다(추가만).

---

## 2. KEEP — 그대로 둔다 (동작·계산·화면 변경 0)
- 수거 입력 화면의 **기존 구역 전부**: 병원 선택 · 수거량 · 완료상태 · 가져온 용기(4칸) · 주고 온 자재(규격별 공급) · 특이사항 · 저장 · 성공 화면 4줄.
- `complete_collection` · `amend_collection` · `revert_collection` SQL — **한 줄도 안 고침**.
- 재고 차감 로직(`stockDeltaOf`, `supplied`) · 정산 · 청구 · 거래명세 · 입금 · 미수금 · 월정산.
- `evidenceBase` 표본 규칙 · `performance.ts` · `perfSummary.ts` · AX Coach 계산.
- 「가져온 용기」 검사 14개가 잡는 라벨과 DOM.
- `pilotMode.ts` (화면 숨기기 스위치).
- 거래처 데이터 — **삭제·수정 0건**.

## 3. MINIMAL CHANGE — 최소로 만진다 (추가만, 기존 줄 삭제 없음)
| 파일 | 무엇을 | 왜 |
|---|---|---|
| `src/types/index.ts` | `ContainerBreakdown.usedItems?` · `CollectionEvent.actorId?/actorName?` · `MaterialSupply.demoSessionId?` · `ExperimentConfig.pilotClientIds?` · `ExperimentConfig.pilotStartDate?` | 저장·집계에 필요한 선택 칸 |
| `src/lib/collection.ts` | `usedItemsOf(containers)` · `containersFromUsed(usedItems, etc)` 순수 함수 2개 | 규격별 → 4칸 접기, 한 곳에서만 |
| `src/lib/repo.ts` | `toEvent` 에 actor 2칸 · `toMaterial` 에 `demoSessionId` 1칸(이미 있던 열, 읽기만) · `experiment` 매핑에 `pilotClientIds` · `savePilotClients(ids)` · `savePilotStart(date)` (update 1줄씩) | 읽기·쓰기 각 1곳 |
| `src/pages/CollectionInput.tsx` | 접힌 구역 **1개 추가** 「이번 수거 자재 사용량」 + `buildInput()` 에서 `containers` 에 `usedItems` 동봉. 4칸이 비어 있고 규격별이 있으면 4칸을 규격별 합계로 채움(두 번 적지 않게) | TASK A |
| `src/components/CollectionRecord.tsx` | 보기: 「사용 자재」 줄 1개 · 수정: 규격별 줄 Fold 1개 | 수정이 사용량을 깨지 않게 |
| `src/lib/ops.ts` `collectionHistory` | `HistoryRow.usedText` 1칸 추가(기존 `containerType` 유지) | 거래처 상세 표시 |
| `src/pages/ClientDetail.tsx` | 수거이력 표 「용기」칸에 usedText 가 있으면 그것을 우선 표시 · 헤더 PILOT 배지 | TASK A/B |
| `src/pages/Clients.tsx` | 관리자만: 카드에 PILOT 체크(토글) · 부제에 「Pilot N / 10」 | TASK B |
| `src/pages/TodaySchedule.tsx` | 목록 줄에 작은 PILOT 배지 | TASK B |
| `src/pages/Materials.tsx` | 「자재 소진 위험」 아래 카드 1장: [최근 30일] 규격별 공급 vs 확인된 사용 · 예상 차이(공급 − 확인사용) | TASK A (계산 가능하므로) |
| `src/pages/Performance.tsx` | 요약 탭 맨 위 관리자용 Pilot Summary 카드 1장 | TASK C |
| `src/context/DataContext.tsx` | `setPilotClients(ids)` · `setPilotStart(date)` 노출 | TASK B · 0123 |
| `src/pages/Settings.tsx` | 「Pilot 시작일 (이번 Pilot 집계 전용)」 칸 1개 — 기존 「실증 시작일」 칸은 그대로 | 0123 |
| `src/pages/CollectionInput.tsx` (0126 → **0128**) | 0126: 담당 차량을 기본값으로만 쓰고 저장을 막던 조건 제거. **0128: `profiles.vehicle_id` 를 아예 읽지 않습니다.** 기본값은 ① 일정 배차 → ② 없음이고, 「오늘 운행 차량」 칸에서 **그날 탄 차**를 고릅니다. 목록 = 같은 구분 · 운행 중. 저장 뒤 선택은 지워져 다음 건으로 따라가지 않음 — ⚠ 구분 일치 검사는 서버에 **없음**(0070 에서 대표님 지시로 제거), 이 목록이 유일한 구분 방어선 |
| `src/components/NextVisit.tsx` (0128) | 일정에 배차가 없을 때 **계정에 묶인 차를 대신 보여 주던 것**을 뺌. 「차량은 수거 입력에서 고릅니다」 | 고정 배정 개념 제거 |
| `src/components/UserAdmin.tsx` (0128) | 담당 차량 **고르는 칸 삭제**. 「고정 차량 없음 · 수거할 때 그날 탄 차량을 고릅니다」로 표시하고, 옛 값이 남아 있으면 「고정 해제」 단추로만 비움 (새로 고정하는 길 없음) | 운영자가 다시 고정하지 못하게 |
| `src/components/StaffInvites.tsx` (0128) | 사전 등록의 「차량 (선택)」 칸 삭제 · `vehicleId: null` 로 보냄 (repo 인자·DB 칸은 그대로) | 가입 즉시 고정되던 길 차단 |
| `src/pages/CollectionInput.tsx` (0129) | 차량 목록에서 **폐기물 구분 필터 제거** — 1톤 네 대는 그날그날 둘 다 싣는데 차량 표는 구분을 하나만 가져, 그 필터가 「오늘 탄 차가 목록에 없다」를 만들었습니다(5대 중 3대만 보임). 구분이 다른 차는 이름 옆에 「· ○○차」로 표시. 3.5톤 공용차는 **그날 남이 예약한 경우에만** 목록에서 빠짐(예약자 본인·미예약이면 보임). 사무실 화면은 예약으로 거르지 않음(대신 입력하는 자리) | 이사님 지시 |
| `src/lib/collection.ts` (0129) | 차량 구분 불일치를 **오류 → 경고**로. 서버는 0070 에서 이미 이 검사를 뺐는데 화면 쪽 이 줄이 남아 실제로 저장을 막고 있었습니다 | 서버와 화면을 같은 기준으로 |
| `src/components/Layout.tsx` · `LiveClock.tsx` (0129) | 오늘 날짜·시각을 **PC 오른쪽 위 도구 줄 「화면 색」 왼쪽**으로 (`data-clock-top` · 간격 20px). 그 줄에 단추가 넷이라 날짜는 `compact`(「9/17(목)」)로 줄였고 시·분·초는 그대로. 줄이 좁으면 단추가 찌그러지던 것을 `shrink-0`+`flex-wrap`으로 접히게 | 대표님: 「계정 아래 말고」 → 「사이드바 맨 위도 별로」 → 「화면 색 옆으로, 간격 띄워서」 | P0 — Pilot 에서 담당차량 불일치가 수거 저장을 막음 |
| `src/lib/repo.ts` `setProfileVehicle` (0126) | RPC 인자 이름을 서버 정의와 맞춤 `p_profile`/`p_vehicle` (전에는 `p_profile_id`/`p_vehicle_id` → 실제 DB 에서 PGRST202 로 거절돼 담당 차량 변경이 저장되지 않았음) | 사용자 관리 담당 차량 변경이 실제로 저장되게 |

## 4. PILOT ADD — 새로 만드는 것
- `src/lib/pilotEvidence.ts` — 순수 함수. 입력 `AppData`, 출력 Pilot 요약(기간 · 거래처 · 수거 입력 · 자재사용 기록 · 실사용자 · Portal 요청 · 연결 건수 · 입력 정정 기록(취소된 입력 건수) · BASELINE KNOWN/UNKNOWN 목록). 개선율 계산 **없음**.
- `src/components/PilotSummaryCard.tsx` — 카드 1장 + 「상세 보기」 접힘.
- `supabase/proposals/PROPOSAL_0122_pilot_clients.sql` — `alter table experiment_settings add column if not exists pilot_client_ids uuid[] not null default '{}'` + 판 번호 122. **DROP/TRUNCATE/DELETE 없음**. 대표님이 실행.
- `PILOT_PLAN.md` — OBJECTIVE / SCOPE / PERIOD / SUCCESS EVIDENCE / PHASE 1~4 / AX Owner.
- 검사 4개: `check_used_material.mjs` · `check_used_amend.mjs` · `check_pilot_evidence.mjs` · `check_pilot_390.mjs`.

## 5. NO TOUCH — 절대 안 건드림
Dashboard · Excel Import · 일정/배차/차량 로직 · 수거이력 화면(`/history`) 구조 · 기존 자재관리 공급 등록/삭제 · 재고 · 월정산 · 청구 · 거래명세 · 입금 · 미수금 · 통계 · 권한(`access.ts`) · Auth · RLS · Portal · Why AX · Tutorial · Theme · Device Preview · Presentation · AI/Insight · short-demo 영상 · `migrations/` 기존 파일 · `PROPOSAL_00xx` 기존 파일.

---

## 6. PHASE 계획 (기록용 — 이번 주는 PHASE 1 만)
| PHASE | 대상 | 상태 |
|---|---|---|
| 1 | 월정액 거래처 5~10곳 (이번 주) | **진행** |
| 2 | 단순 거래처(단일 성상·주 1~2회) | 예정 |
| 3 | kg 단가 거래처 | 예정 |
| 4 | 박스 개당 · 자재 · 복합 거래처 | 예정 |

## 7. 이번에 하지 않는 것 (RECOMMENDATIONS.md Future 로 보냄)
병원별 월평균 자재 사용량 · 병상/수거량 대비 사용량 · 사용량 급증 감지 · 공급 주기 추천 · 재주문 예상 · 자재 비용 계산 · 긴급배송 알림 · 자재 손실 가능성 분석.
