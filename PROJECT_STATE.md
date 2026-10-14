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
| `src/components/Layout.tsx` · `src/pages/VisitVideo.tsx` · `src/lib/visitVideo.ts` · `public/media/sinbo_visit_v31_{tall,wide}.mp4` (0130 → v3.1) | 「**신용보증기금 방문용 영상**」 단추 — PC 는 오른쪽 위 도구 줄의 **오늘 날짜·시각 바로 왼쪽**(시계 ↔ 「화면 색」 간격 그대로), **폰은 머리띠의 시계 줄 왼쪽**(이때만 시계를 짧은 날짜로; 현장·병원 폰은 예전 그대로). 대표(admin)·이사님(office)만 보이고 `/visit-video` 도 그 둘만(`access.ts`). 화면 = **세로(9:16)·가로(16:9) 두 판을 한 번 눌러 전환**(보던 자리·속도·재생 상태 그대로 이어 감) + 판마다 **내려받기**(카카오톡 전송용 파일 이름) + 재생 속도 1배·1.25배·1.5배 + 전체 화면 + 영상 흐름(누르면 그 장면부터) + 영상에서 말하는 숫자(음성 그대로, 연환산은 「전망 · 실적 아님」) + 보여드리기 전 메모. 영상은 **앱 안(public/media, 두 판, H.264+AAC, faststart)** — 대표님이 주신 `VIDEO_STYLE_GUIDE_V3_1_FINAL` 기준으로 다시 만듦(크고 적게 · 폰 9:19.7 실제 스크롤 · PC+폰 한 장면) — SQL·업로드 없이 배포하면 바로 재생. ⚠ 저장소가 공개라 **파일 주소를 아는 사람은 로그인 없이 받을 수 있음** — 처음엔 Storage 비공개 칸으로 만들었다가, 대표님이 이를 알고 「바로 보이게」를 고르셔서 바꿈 | 대표님: 「날짜·시각 옆에 버튼, 1.25배·1.5배로도」 → 「SQL 없이 바로, 폰에서도」 |
| `src/pages/CollectionInput.tsx` · `src/lib/repo.ts` `normHm` · `src/context/DataContext.tsx` (0131) | 현장 수거 입력 다듬기 — **일정 시각 「9:00」을 「09:00」으로 맞춰 줄 세움**(전엔 16:00 뒤로 감) · 오늘 일정은 실제 수거 시각 = 지금 · 수거량이 예상값 그대로면 한 줄 알림 · 저장 단추가 잠긴 **이유(거래처·수거량·차량·재고)를 단추 위에** · 「오늘 앞 건과 같은 차」 **한 번 누르기**(0128 대로 자동으로 채우지는 않음) · 주소 → 카카오맵 · 일정 없이 넣은 두 번째 방문이 중복으로 막히면 「**추가 수거로 저장**」 · **저장은 됐는데 다시 읽기만 끊긴 경우 실패로 보이던 것**을 성공으로(다시 읽기는 2초 뒤 한 번 더) | 「다음 할 일이 보이게 · 반복 입력 줄이기」 |
| `src/pages/CollectionHistory.tsx` · `ClientDetail.tsx` (0131) | 수거이력 = **실제 기록만**(앞으로의 예정·무른 방문·오늘 아직 안 간 곳 빠짐). 표 구조는 그대로 두고 「입력된 수거 / **지난 일정 · 미입력**」 칩 + 미입력 줄에 「수거 입력 ›」 · 「지난 달」 · 기사·차량 검색 · `?status=missing` · `?client=<id>`(거래처 상세 「전체 수거이력 보기」) | 빠진 입력을 찾아 바로 넣게 |
| `src/components/TodayBoard.tsx` · `TodayFocus.tsx` · `src/lib/ops.ts` (0131) | 「지금 처리할 것」에 **지난 일정 입력 없음**(→ 미입력 목록)·**독촉 대상**(→ 미수금) 두 줄. 지어낸 「인증·실사 전 확인」·격리 경보(`isolationAlerts`·`inspectionAlerts`)는 **빈 목록**으로 — fake data 금지(옛 함수는 `demo*` 로 남김) | 대시보드가 실제 할 일만 |
| `src/pages/Receivables.tsx` · `DunningPanel.tsx` · `Clients.tsx` · `src/lib/koSearch.ts` · `BankMatch.tsx` · `Requests.tsx` · `Supplies.tsx` (0131) | 미수금 검색(초성·전화)·줄 세우기(최근 청구/남은 돈 큰 순/오래된 순) · 독촉 목록이 석 달 넘게 밀리면 한 줄 요약(누르면 펼침) · 거래처 초성·전화번호 검색 · 은행 매칭 확실한 건 한꺼번에 처리 때 매번 다시 읽지 않음·처리 중 중복 누름 막음 · 긴급/추가 수거 요청이 「일정 반영」인데 실제 날짜가 없으면 표시 + 날짜 잡기 · 자재 「전달 완료」「취소」 전 확인 | 데이터가 많아도 찾기 쉽게 · 실수 방지 |
| `src/lib/collectDraft.ts` · `src/pages/CollectionInput.tsx` (0132) | 수거 입력 **임시 보관** — 전화·카메라·지도로 폰이 화면을 새로 띄워도 적던 kg·용기·자재·메모가 남음. **이 폰에만**(localStorage, 계정별) · 오늘 것만 · 일정만 열어 본 것은 안 남김 · 자동으로 채우지 않고 「적던 수거 입력이 남아 있습니다 → **이어서 입력 / 지우기**」 · 저장 성공이나 그 일정이 이미 저장되면 지움 | 「반복 입력 최소화」 |
| `src/lib/planGap.ts` · `TodayBoard.tsx` · `TodayFocus.tsx` · `SchedulePlan.tsx` · `ClientDetail.tsx` `?book=1` (0132) | **다음 방문이 안 잡힌 단골** — 최근 120일 실제 방문 간격(중앙값, 완료 3번 이상)으로 「평소라면 갈 날」이 7일 안인데 예정이 없는 곳. 대시보드 「다음 방문 안 잡힘」 → 일정 편성 맨 위 목록(평소 N일마다 · 마지막 방문) → 「방문 잡기 ›」 = 거래처 화면 예약 창. 일정을 시스템이 만들지 않음 | 일정 묶음(1~4주)이 끝나는 날을 아무도 몰랐음 |
| `src/pages/MonthClose.tsx` (0132) | 청구 확정 실패를 **전부** 적음(예전엔 첫 곳만) + 「N곳만 다시 확정」(성공한 곳은 다시 안 보냄) · 진행 표시가 다시 보내는 수 기준 · 평소와 다른 수거량·공급 수량 옆 「수거 기록 보기 ›」(`/history?client=`) | 월말 실패 복구 |
| `src/pages/VisitVideo.tsx` · `src/lib/visitVideo.ts` · `public/media/gangnam_present_v44_{tall,wide}.mp4` (0133 · v44 싱크 보정) | 「신용보증기금 방문용 영상」 화면에 **「강남 스타트업 지점 발표용 영상」을 맨 위**로 추가, 기존 신보 영상은 그 아래로. 영상마다 같은 묶음(세로 9:16 ↔ 가로 16:9 한 번에 전환 · 보던 자리 이어 보기 · 1/1.25/1.5배 · 전체 화면 · **판마다 내려받기** · 영상 흐름 · 메모)이 따로 있음 (`VIDEOS` 순서대로 그림). 한쪽을 틀면 다른 쪽은 멈춤. 강남 영상은 숫자를 말하지 않아 「말하는 숫자」 칸 없음. 화면 제목은 「방문 · 발표용 영상」, 머리띠 단추 글자는 그대로. **v44** — 자막·장면이 목소리보다 0.3~0.8초 먼저 나오던 것을 실제 말 시작(소리 크기)에 맞춰 보정, 파일 이름을 바꿔 폰에 남은 옛 파일이 안 섞이게 | 대표님: 「기존 영상은 아래로 미루고 강남 스타트업 지점 발표용 영상 새로 업로드 · 다운로드도 똑같이」 |
| `src/pages/PortalHome.tsx` · `PortalHero.tsx` · `PortalLayout.tsx` · `PortalSheet.tsx` · `portal/*Sheet.tsx` · `portal/PortalUi.tsx` · `portal/useSheetDone.ts` · `src/pages/PortalRequests.tsx`(신규) · `PortalBilling.tsx` · `PortalHistory.tsx` · `src/lib/portalLabels.ts`(신규) · `Login.tsx` · `manifest.webmanifest` · `index.html` · `public/icons/*.png` (0134 병원 포털 UI/UX 1차) | **기능 추가 없이 다듬기.** 홈 = 다음 수거(확정/예상) → **큰 단추 둘**(긴급수거 요청 · 자재·용기 요청) + 작은 둘(추가수거 · 문의) → 최근 요청 · 최근 수거. 여덟 카드·배출 분석(→ 리포트 창)·사진 띠·회사 소개 사진 뺌(폰 홈 4,533 → 약 2,500px · 시계는 「어느 계정이든 날짜·시각」 요구라 그대로). 메뉴 셋 → **다섯**(홈 · 요청 내역 · 수거 이력 · 정산·증빙 · 고객지원). 보낸 뒤 토스트 대신 **창 안 「요청이 접수되었습니다」 + 요청 내역 보기 · 홈으로**. 상태는 병원 말(저장값 「일정 반영」 → 화면 「일정 확정」, 「소모품」 → 「자재·용기 요청」; 알림 글에 새던 「소모품」도 고침). 긴급 창 순서 시점 → 내용 → 특이사항(폐기물·양은 선택), 자재 창에 「언제 필요하신가요」(고르면 글에 남고, 「그 전에」면 희망일 비움). 저장 실패 = 「요청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.」 + 다시 시도(같은 표) · 로그인 만료면 「다시 로그인」. 불러오기 실패 칸에도 다시 시도. 폰 머리띠 단추 둘(전화·로그아웃은 맨 아래 줄), 창 머리 사진은 PC 만. 로그인 = 「병원 고객 포털」(직원도 같은 화면 안내 · 「비밀번호는 저장되지 않습니다」(사실과 다름) → 「암호화되어 보관」). PWA = PNG 아이콘(아이폰 180 · 192 · 512 · maskable) · 이름 「비원미래 고객 포털」/홈 화면 「비원미래」 · 아이폰 홈 화면 실행 시 상태 막대 밑 여백. **DB·RLS·저장값·라우트 그대로**(새 화면 `/portal/requests` 만 추가, 예전 `?do=` 링크 그대로) | 대표님 브리프 「병원 포털 UI/UX 1차 고도화」 · `check_portal134` 신규 · 바뀐 의도만 고친 검사: portal83·86·88·89·93 · reqdup · brand95 · e2e88·92 · motion(**도우미 인자 순서가 뒤집혀 늘 통과하던 것 바로잡음**) · live_client |
| `PortalLayout.tsx` · `PortalHero.tsx` · `src/lib/portalWeek.ts`(신규) · `PortalHome.tsx` · `portal/PortalUi.tsx` · `PortalSheet.tsx` · `portal/*Sheet.tsx` · `PortalRequests.tsx` · `PortalHistory.tsx` · `PortalBilling.tsx` · `PortalSupport.tsx` · `PortalPreviewBar.tsx` · `PortalNoticeBell.tsx` · `PortalViewSwitch.tsx` · `ThemePicker.tsx`(`showLabel`) (0135 병원 포털 UI/UX 2차) | **보이는 것을 크게 바꾼 차례(기능·자료·저장값 그대로).** 머리띠를 밝게, 「다음 수거」를 화면에서 가장 짙은 칸으로 + **앞으로 7일** 한 줄(등록된 일정만 칠함 · 취소된 일정 제외 · 수거주기 예상은 점선 · 화면 읽기용 날짜 문장). PC 는 시계·이름을 메뉴 줄 오른쪽으로 옮겨 머리띠 한 줄. 큰 단추: 폰 한 줄씩 / 태블릿 타일 / PC 한 줄씩. 최근 요청 = 종류 아이콘 + 진행 막대, 최근 수거 = 타임라인. 창: 머리 아이콘, 고른 단계는 번호→체크, 접수 화면에 진행 단계 + 맨 위부터 보이게. 요청 내역 = 카드 + 나눔 단추(전체·진행 중·완료) + 회신 말풍선. 수거 이력 = 폰 달 묶음(달 머리에 횟수·무게) · PC 요약(이번 달·지난 달·전체). 정산·증빙 = 「아직 안 내신 금액 / 미납 없음」 한 장 + 최근 6개월(안 낸 달은 늘 보임) · 이전 내역 더 보기. 고객지원 = 사진 뺌 · 전화 상담 칸 · 문의/답변 대화형. 화면 맨 아래 「도움·설정」 줄(화면 색 · PC 화면 · 전화 · 로그아웃). 직원 미리보기 띠 폰에서 짧게 | 대표님 「ui ux 개선좀 대폭」 · `check_portal134` 144건(⑩~⑫ 추가) |
| `BrandLogo.tsx`(신규) · `portal/PortalMenu.tsx`(신규) · `portal/RequestDetailSheet.tsx`(신규) · `PortalLayout.tsx` · `PortalHero.tsx` · `PortalHome.tsx` · `PortalFooter.tsx` · `portal/PortalUi.tsx` · `PortalSheet.tsx` · `portal/useSheetDone.ts` · `portal/*Sheet.tsx` · `PortalRequests.tsx` · `PortalHistory.tsx` · `PortalBilling.tsx` · `PortalSupport.tsx` · `src/lib/portalSheet.ts`(`useRequestDetail`) · `src/lib/portalLabels.ts`(`friendlyWhen`) · `index.css`(`.p-hero-date` · `.p-title` · `.p-body` · `.p-sub` · `.p-list`) · `src/lib/portalWeek.ts`(삭제) (0136 병원 포털 UI/UX 3차 — 「앱 화면」) | **카드형 대시보드 → 앱 화면(기능·자료·저장값·권한 그대로).** 면(카드)은 「다음 수거」 · 빠른 요청 둘(긴급 빨강 · 자재 파랑) · 정산 「지금 상태」 · 답을 기다리는 제안만 — 나머지는 **제목 · 여백 · 구분선**. 그림자는 떠 있는 창(시트 · 내 정보 · 아래 탭)에만. 측정(390px · 그림자 상자): 홈 14→0 · 요청 내역 10→0 · 수거 이력 8→0 · 정산 16→0 · 고객지원 11→0, 화면 길이 홈 3044→2448px · 요청 내역 2128→1203px. 머리띠 = 로고 · 병원 이름 · 알림 · 「내 정보」 하나(사용 방법 · 글자 크기 · 화면 색 · 보기 전환 · 전화 상담 · 로그아웃을 안으로) · PC 전화 상담만 밖에. 「다음 수거」 = 날짜 하나 크게 + 시각 · 확정/예상 + 기관·주기 한 줄(7일 줄 · 이번 달 줄 뺌). 최근 요청 = 활동 목록 다섯 줄(아이콘 · 이름 · 「오늘 10:49」 · 상태 칩) → 누르면 **요청 상세 시트**(?req=, 이 병원 요청만 · 세로 진행 단계 · 「담당자 안내」). 접수 완료 → 「확인」 = 창 닫고 홈 「최근 요청」으로(요청 내역 보기는 옆 단추). 최근 수거 = 날짜 · 품목 · 무게(초록 배지 대신 작은 체크). PC = 왼쪽 다음 수거 + 최근 요청 · 오른쪽 빠른 요청 + 최근 수거. 모서리: 다음 수거 22 · 빠른 요청 18 · 입력/고르는 칸 14 · 칩 알약. 상태 색 넷(접수 회색 · 진행 파랑 · 완료 초록 · 긴급/미납 빨강) 화면마다 같게. 로고 = `BrandLogo` 한 곳(최종 로고 나오면 `LOGO_SRC` 만) | 대표님 3차 브리프 「B2B SaaS 카드형 대시보드 느낌을 줄이고 실제 모바일 앱에 가까운 UI」 · `check_portal134` 178건(⑬ 카드 · 모서리 · PC 두 줄 · 같은 상태 같은 색 추가) · `check_e2e88`(남의 요청 id 로 상세 안 열림) |
| `src/pages/PerformanceIr.tsx`(신규, `/performance/ir`) · `src/lib/irSummary.ts`(신규) · `App.tsx`(경로) · `Performance.tsx`(머리글 「발표용 요약」 단추만) · `Presentation.tsx`(「발표용 성과 요약 열기」) (0137 발표용 성과 요약) | **/performance 는 그대로(요약 · 측정 근거 · 설정 · 계산식 · 원천자료 · 표본 수), 발표용 창을 따로.** 지표 4묶음: ① 도입 전 하루 사무업무 3.5~4.7시간/일 = 운영이사 업무조사 원문(`opsSurvey.surveyTotals`) ② 동일 업무 Before→After = 업무 재현시험 실측만(`trials.summarizeTrials` 과제별 중앙값 · 「초기 재현시험 N회」 · 없으면 「측정 전」, % 없음) ③ 실제 사용 = 최근 30일 ∩ 실증 기간의 운영 DB 기록(수거 입력 · 병원 요청 · 병원 문의) · 실사용자(직원 = 입력·처리한 계정, 병원 = 포털에서 직접 올린 이름) · 시연 · 취소 · 연습 제외(뺀 건수 표시) · 표를 못 읽으면 0 이 아니라 「확인 전」 · 실증기간 = 실증 시작일~오늘(없으면 「확인 전」) ④ 다음에 검증할 사업효과 3개(차량 생산시간 · 대표 신규영업시간 · 병원 포털 사용률) = 「측정 예정 / 기록 중 + 실제 건수」, 목표값 없음. 매출 · 46%/19% · 105톤 · 49곳/53곳은 이 화면에 들어올 길이 없음(함수가 읽지 않음). 「근거 보기」 → `/performance?tab=basis`. 시연 모드에서는 실측 숫자를 띄우지 않음. 권한은 /performance 와 같음(관리자 · 사무실) | 대표님 「발표 시연용 Performance Summary 를 별도로 — 확인된 것만 아주 쉽게」 · `check_ir137` 43건(손으로 센 기대값) |
| `supabase/functions/ai-triage/`(신규 — `index.ts` · `handler.ts` · `triage.ts` · `provider.ts` · `deno.json` · README; `supabase/proposals/edge_ai_triage` 대체) · `src/lib/evidenceRepo.ts`(`aiTriageRequest` · `TriageResult`) · `src/pages/Requests.tsx`(AI 칸) · `src/lib/readiness.ts`(`realAiCalls`) · `src/lib/aiSpecs.ts` · `AiAction.tsx`(`live`) · `supabase/config.toml` · `docs/AI_TRIAGE_0138.md` (0138 병원 요청 AI 분석) | **첫 실제 LLM 업무 보조 — 코드 완료 · 실제 외부 AI 호출 미검증(키 없음).** 회신 창 「AI 요청 분석」 → 서버 함수 ai-triage(Supabase Edge, OpenAI 호환 · 기본 gpt-4o-mini · 키는 서버 Secret `AI_API_KEY` 만) → 종류(RequestKind) · 함께 든 종류 · 긴급도(높음/보통/낮음) · 요약 · 핵심 · 회신 초안 · 근거. 서버가 로그인 · 역할(관리자/사무실 · 사용 중)을 다시 확인, 요청 글은 **DB 에서** 읽음(브라우저가 보낸 글 무시), 모델에는 요청 글(전화 · 주민번호 · 메일 가림) · 고른 종류 · 급함 · 희망일만. JSON 엄격 검사(빠짐 · 범위 밖 · JSON 아님 = 실패), 초안의 지어낸 숫자 · 시각 · 확정 약속 = 실패(고정 문구 대체 없음). `ai_calls` 기록은 서버가(성공 · 실패 · 모델 · ms · 누가 · 토큰 수는 output.usage), 서버에 닿지 못한 실패만 브라우저가. 시연 요청 = `kind request_triage_demo` · 준비도에서 제외. 화면: 「초안 사용」을 눌러야 회신 칸에, 고치면 edited `[수정]` / 안 쓰면 `[초안 미사용]`, 연타 방지, 요청마다 결과 따로, 실패 「AI 분석을 불러오지 못했습니다. 요청 처리는 그대로 진행할 수 있습니다.」 · 다시 시도. AI 는 상태 · 회신 전송 · 일정 · 재고 · 정산을 바꾸지 않음. 원칙: **Rule/DB = 사실 · 계산, LLM = 문장 이해 · 요약 · 분류 · 작성** | 대표님 「실제 LLM API 를 이용하는 AI 업무보조 — 가짜 AI 절대 금지」 · `check_ai_triage_core` 73 · `check_ai_triage_ui` 79 · `supabase/test/ai_triage_e2e.mjs` 20(함수 코드를 Deno 로 · 모델 자리는 시험용) |
| `src/lib/presenter.ts`(신규) · `src/context/PresenterContext.tsx`(신규) · `src/components/PresenterCard.tsx`(신규) · `src/pages/Presentation.tsx`(다시 짬) · `main.tsx` · `App.tsx` · `index.css`(`[data-presenter-spot]`) · `Requests.tsx`(`data-presenter="reply-open"` 하나) · `nav.ts`(설명만) · `docs/PRESENTER_0139.md` (0139 심사 시연 발표 가이드) | **안내만 하는 층 — 업무 로직 · 데이터 · 권한 · 성과 계산 안 바꿈.** `/presentation` 「심사 시연 시작」 → 화면을 옮겨도 따라다니는 안내 카드, 7단계(오늘 운영 → 수거 1회 입력 → 병원 포털 요청 → 직원 요청함 + AI → 회신 → 병원 확인 → 발표용 성과 → 마무리). 카드 = 지금 보여드리는 것 · 기존 · 바뀐 방식(구현된 것만) · 기대 효과(정성) · ▶ 지금 할 일 · 발표자 메모(접힘) · 상태(구현됨/실증 단계/측정 중). 「다음 단계」가 그 화면으로 데려가고, 엉뚱한 화면이면 「이 단계 화면으로」. 강조는 보이는 대상 하나에 테두리만(없으면 아무것도 안 함). 넓은 화면: 직원 화면은 왼쪽 메뉴 자리 위 · 병원 화면은 강조 버튼을 안 가리는 쪽 · 창이 열리면 짧은 카드로 왼쪽. 폰: 위 한 줄 막대 + 아래 시트. 진행은 sessionStorage(같은 탭 · 3시간), 종료하면 흔적 없음. 「시연 준비 상태」는 확인 가능한 것만 자동 ✓ — **AI 는 ai_calls 실제 성공 기록이 있어야 ✓**. 60초 투어 · 성과 요약 연결 · 표현 가이드 · 시연 초기화는 그대로, 6장 슬라이드 · 고정 사전 점검 · 105톤 문구 · /demo 연결은 뺌 | 대표님 「긴장한 상태에서도 화면이 다음 행동을 안내 · 보여주기용 가짜 기능 금지」 · `check_presenter139` 79 |

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
