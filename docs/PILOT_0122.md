# 0122 — 이번 주 PILOT 최종 고도화 · 보고

> Material Usage + 5~10 Customer Pilot + Automatic Evidence
> STRICT SCOPE / NO REBUILD / NO FEATURE EXPANSION
> 조사(KEEP / MINIMAL / PILOT ADD / NO TOUCH)는 `PROJECT_STATE.md`, 운영 계획은 `PILOT_PLAN.md`.

---

## A. 기존 기능 보존

- 수거 입력 화면의 기존 구역(병원 · 수거량 · 완료상태 · **가져온 용기 4칸** · **주고 온 자재** · 특이사항 · 저장 · 성공 화면)은 그대로입니다. 새 구역 **하나**(「이번 수거 자재 사용량」, 기본 접힘)만 사이에 들어갔습니다.
- `complete_collection` · `amend_collection` · `revert_collection` SQL — **한 줄도 고치지 않았습니다.** 두 함수가 `containers` jsonb 를 그대로 통과시키는 것을 확인하고 그 안에 `usedItems` 를 담았습니다.
- 재고 차감(`supplied` · `suppliedItems` · `stockDeltaOf`) · 정산 · 청구 · 거래명세 · 입금 · 미수금 · 월정산 — 코드 변경 0.
- 「가져온 용기」 라벨을 잡는 기존 검사 14개 — 그대로 통과(회귀 결과 F 참고).
- 거래처 데이터 — 삭제·수정 0건. 거래처 표(`clients`)에는 칸도 더하지 않았습니다.

## B. 자재 사용량 (USED MATERIAL)

| 항목 | 내용 |
|---|---|
| Material Master | `src/lib/billing.ts` `SUPPLY_ITEMS` 13종 그대로. 새 규격·이름을 하드코딩하지 않았습니다 |
| 입력 | 수거 입력 → 「이번 수거 자재 사용량」 접힌 구역. 줄마다 `품목명 [-] 0 [+]` + 직접 숫자. 단추 44px 이상(실측 49px). 그 병원에서 **가장 최근 적힌 규격 → 이전에 적힌 규격(횟수) → 나머지(Material Master 순)** 로 정렬하고, 첫 줄 외 근거 없는 줄은 「나머지 규격 N개 보기」 뒤에 접습니다. AI 추천 아님 — 실제 기록 횟수만 |
| 저장 위치 | `schedules.containers` jsonb 안 `usedItems: { box63: 2, plastic20: 1, … }` (0 은 저장하지 않음). 같은 기록의 `client_id`(customer) · `event_id`/`schedule_id`(collection) · `completed_at`(recorded_at) · `collection_events.actor_id`(recorded_by) 가 이미 있어 **새 표·새 칸 없이** 연결됩니다 |
| 4칸과의 관계 | 4칸(가져온 용기)을 손대지 않았으면 규격별 합계로 4칸을 채웁니다(`withUsedItems`). 손으로 적었으면 그 값을 존중. 접힌 줄에도 「규격별 N개로 자동 계산」이라고 적습니다 |
| 공급과 분리 | 별도 구역 · 별도 키 · 별도 보기 줄. 검사가 **공급 0 · 재고 차감 0** 을 확인합니다 |
| 큰 숫자 확인 | `amountCheck.usedCheckMessage` — 기존 공급 규칙과 같은 상수(중앙값 · 4회 이상 · 비율)로 그 병원의 이전 사용량과 비교, 근거가 없어도 **1,000개 이상**이면 「수량이 1,600개가 맞나요?」 한 번 묻고 막지 않습니다 |
| 수정 | 수거기록 상세(관리자·사무실, 판 74+) → 「이번 수거 자재 사용량」 Fold. 기존 amend 정책 그대로(사유 필수 · 한 트랜잭션) · `amend_collection` 1회 · 공급 값 불변 |
| 거래처 화면 | 거래처 상세 → 수거이력 표 「용기」칸에 `사용 자재 - 63L 박스 2개 · 20L 합성수지 1개 …`. 규격별이 없으면 기존 4칸 문구 |
| 자재관리 | 「[최근 30일] 공급 vs 확인된 사용」 카드 — 규격별 공급 · 확인된 사용 · **예상 차이(공급 − 확인된 사용)**. 「남아 있다」고 쓰지 않고, 완료 수거 N건 중 규격별 기록 M건(나머지 미확인)을 함께 적습니다. 사용 > 공급인 줄만 「확인 필요」. 「과다사용」 판정 없음 |

## C. Pilot 거래처

| 항목 | 내용 |
|---|---|
| 선택 | 거래처 관리(관리자) 카드 아래 「이번 주 PILOT」 체크. 월정액 거래처에는 「월정액」 표식을 함께 보여 먼저 켜도록 권합니다. 부제에 「Pilot N / 10」(10 = 권장, 상한 아님) |
| 저장 | `experiment_settings.pilot_client_ids uuid[]` — **1개 추가 마이그레이션** `PROPOSAL_0122_pilot_clients.sql` (칸 1개, 판 108 → 122, 지우는 것 없음). 거래처 표는 열 단위 권한 때문에 건드리지 않았습니다(`PROJECT_STATE.md` §1-5). SQL 전에는 Pilot 0곳 · 화면에 SQL 이름 안내 |
| 세는 법 | `pilotClientsOf` — 시연용(`isDemoGenerated`)은 켜져 있어도 세지 않음 |
| 현장 | 별도 Pilot 모드 없음. 오늘 일정 줄 · 거래처 목록 · 거래처 상세에 **PILOT 배지** 하나 |
| PHASE | 1 월정액 5~10곳(이번 주) · 2 단순 거래처 · 3 kg 단가 · 4 박스/자재/복합 — `PILOT_PLAN.md` · `pilotClients.PILOT_PHASES` |
| 시작일 | 기존 `experiment_settings.start_date`(설정 「실증 시작일」) 재사용. 새 설정 없음 |

## D. Evidence

성과 화면 → 요약 탭 맨 위 「이번 주 Pilot 실제 기록」 카드(관리자만). 모두 **건수·명수·날짜**, 출처 표기 포함.

| 항목 | 계산 | 출처 |
|---|---|---|
| Pilot 거래처 N곳 | `pilotClientsOf` | SETTINGS |
| 수거 입력 N건 · 입력 있던 날 · 마지막 | `collection_events` 중 Pilot 거래처 · 기간 · `classifyEvent === 'field'` | COLLECTION TABLE |
| 자재사용 기록률 M / N건 | 규격별이 적힌 Pilot 완료 수거 / Pilot 완료 수거 | MATERIAL USAGE |
| 직원 사용 N명 (이름별 건수) | 이벤트 `actor_name` → 없으면 일정 기사 이름 → 없으면 「(이름 미기록)」 | COLLECTION TABLE |
| 거래처 Coverage M / N곳 | 기간 안 입력 1건 이상인 Pilot 거래처 | COLLECTION TABLE |
| Portal Self-Service | `client_requests.source='portal'` · Pilot 거래처 · 기간 · 요청/처리/병원 수 | CUSTOMER REQUEST |
| 입력 정정 기록 | 취소된 입력 N건 / 전체 입력 N건 | COLLECTION TABLE |
| Data Connection | 입력 → 완료 일정(수거이력·거래처 화면) 연결 건수 | COLLECTION TABLE |
| 규격별 사용 확인 / 공급 | `usedItems` 합 · `materials.items` 합 | MATERIAL USAGE |
| 세지 않은 것 | 시연 · 시작일 이전 · 취소 · Pilot 외 거래처 — 건수 그대로 | — |
| BASELINE | 도입 전 기준값 5항목 — 실측이면 KNOWN + 값, 없거나 시연 예시값이면 UNKNOWN(비움) | SETTINGS |
| USER FEEDBACK | 도입 후 조사 응답이 있으면 「따로 봅니다」라고만 — 시스템 건수와 합치지 않음 | USER FEEDBACK |

- 개선율(%) · 「향상」 · 월 환산 — **없음**(검사가 정규식으로 확인). 라벨 「1주 Pilot 실제 기록」.
- **「입력 정정 기록」은 취소된 입력을 세는 값입니다.** 취소 뒤 같은 수거가 다시 들어왔는지를 짝지어 보지 않으므로 「재입력이 줄었다」로 읽을 수 없습니다. 검토(2026-09-16) 결과 로직을 넓히지 않고 **문구만** 사실에 맞게 고쳤습니다 — 이전 이름(Re-entry Reduction Proxy)은 화면·문서에서 뺐고, 검사가 「재입력 · Reduction」이 다시 나타나지 않는지 확인합니다.
- **시연 공급 혼입 차단.** 수거 완료가 자재를 함께 넣을 때 서버가 그 수거와 같은 시연 표식(`materials.demo_session_id`)을 자재에도 붙입니다. 화면이 그 칸을 안 읽고 있어서, Pilot 거래처에 시연 공급이 남으면 **수거는 빠지고 공급만 남는** 어긋남이 생길 수 있었습니다. 칸은 이미 있었으므로 구조를 바꾸지 않고 **읽기만 추가**(`MaterialSupply.demoSessionId` · `toMaterial` 한 줄)해서 수거 쪽과 같은 기준으로 뺍니다. 검사가 진짜 공급 4개 · 시연 공급 7개를 넣고 **4개만 세는지** 확인합니다.
- 시작일이 비어 있으면 오늘 하루만 세고 「시작일 미설정」이라고 적습니다 — 임의 기간을 만들지 않습니다.
- 새 이벤트 표 없음. `pilotEvidence.ts` 는 순수 함수이며 저장하지 않습니다(같은 값 두 곳 저장 금지 원칙).

## E. 데이터베이스

| 결정 | 이유 |
|---|---|
| USED MATERIAL → `schedules.containers.usedItems` (SQL 0) | 같은 뜻의 구조(가져온 용기 = 병원이 사용해 배출한 용기)가 이미 있고, 저장·수정 함수가 이 열을 해석 없이 통과시킵니다. 모든 읽는 곳이 4키 이름으로만 접근하는 것을 확인했습니다(`PROJECT_STATE.md` §1-4) |
| Pilot → `experiment_settings.pilot_client_ids` (SQL 1, 추가만) | `clients` 는 열 단위 권한 목록(`CLIENT_COLS` · grant · `app_health_check`)이라 칸 하나가 세 곳을 건드리고, SQL 전후 불일치 시 거래처 전체가 안 읽힙니다. 실증 설정은 `select *` · 관리자 쓰기라 안전 |
| `CollectionEvent.actorId/actorName` | DB 에 이미 있는 칸을 TS 타입·매핑에 **읽기만** 추가 (실사용자 수) |
| `MaterialSupply.demoSessionId` | DB 에 처음부터 있던 `materials.demo_session_id` 를 **읽기만** 추가 (다른 표 4곳이 이미 같은 방식으로 읽고 있습니다). Pilot 공급 집계에서 시연을 수거와 같은 기준으로 빼기 위함 — 쓰기·계산 변경 없음 |
| 기존 마이그레이션 수정 | 없음. DROP/TRUNCATE/DELETE 없음 |

## F. QA

| 검사 | 폭 | 결과 |
|---|---|---|
| `check_used_material` — 현장 로그인 → 오늘 일정(PILOT 배지) → 병원 → 수거 입력 → 3종(+·+·직접 입력) → 연타 저장 → 성공 화면 → 거래처 상세 수거이력 | 390 · 1440 | 저장 1건 · 중복 0 · `usedItems {box63:2, plastic20:1, pouch12:5}` · 4칸 자동(2·1·5·0) · **공급 0 · 재고 차감 0** · 「사용 자재 8개 기록」 · 이력 「사용 자재 - …」 |
| `check_used_amend` — 관리자 수거이력 → 상세(사용 자재 줄) → 수정 → 63L 3→4 → 사유 → 저장 | 1280 | `amend_collection` **1회** · `complete_collection` 0회 · usedItems {box63:4, plastic20:2} · 4칸 불변 · **suppliedItems·supplied 불변(이중차감 0)** · 재고 미리보기 없음 · 현장 계정 수정 단추 없음 |
| `check_pilot_evidence` — Pilot 5곳 · 이벤트 10건(시연 1 · 취소 1 · 시작일 이전 1 · Pilot 외 1) · 요청 5건 | 1440 | 카드 5·6·3·2·2 = 검사가 스스로 센 기대값 · 기록률 3/16 · Coverage 4/5 · 빠진 건수 표기 · 규격별 16/20 · **% 0건** · BASELINE UNKNOWN 5 · 출처 4종 · 현장 계정 카드 없음 |
| `check_pilot_390` — 390 현장 흐름 + 360/390/430 스모크 | 360 · 390 · 430 | 가로 밀림 0 · 규격 13줄 이름 잘림 0 · −/+ 49px · 저장 단추 보임(75px) · 오늘 일정·거래처(토글 18개 · 「Pilot 2 / 10」)·성과 카드 |
| 전체 회귀 (142 스위트, **순차 실행**) | — | **검사 5,770 · 실패 6 — 6건 모두 기존 실패**(변경 전 커밋에서도 같음). 새로 생긴 실패 0 |
| `tsc --noEmit` | — | 통과 |

### 전체 회귀 — 측정 방법과 결과 (2026-09-16)

**결과: 142 스위트 · 검사 5,770 · 실패 6 · 새로 생긴 실패 0.**

| 남은 실패 | 건수 | 판정 |
|---|---|---|
| `check_tourclean` — 투어를 끝낸 뒤 `inert/aria-hidden` 이 1개 남음 (PC·폰 5가지 종료 방식) | 5 | **기존 실패** — 변경 전 커밋(`85c033d`)에서 같은 5줄이 그대로 남 |
| `check_materials82` — 「처음에는 최근 30건만 그린다 — 0건」 | 1 | **기존 실패** — 같은 스위트가 변경 전 커밋에서 같은 줄을 포함해 5건 실패. 이 스위트는 실행마다 진행되는 검사 수가 달라집니다(12~23) |
| `check_pilot80` — 검사 26 · 실패 0 이지만 끝에서 종료코드 1 | (실패 0) | **기존** — 변경 전 커밋에서도 동일 |

**측정 방법.** 이 저장소의 브라우저 검사는 한 번에 여러 개를 돌리면 **부하 때문에 간헐 실패**가 납니다. 실제로 4개 샤드 병렬 실행에서는 실패 28건이 나왔지만, 같은 커밋을 **순차 실행**했을 때 남은 것은 위 6건뿐이었습니다 — 나머지 18건(`check_dayclose` · `check_e2e88` · `check_ready96` · `check_e2e92` · `check_ui0106`)은 순차 실행에서 전부 통과했습니다. 그래서 보고 수치는 **순차 실행 값**입니다.

**기존 실패 확인 방법.** 변경 전 커밋(`85c033d`)을 별도 worktree 에 체크아웃해 같은 환경파일로 빌드하고, 실패한 스위트만 순차로 돌려 같은 줄이 나오는지 대조했습니다. (첫 시도는 worktree 에 `.env.local` 이 없어 앱이 다른 모드로 떠 결과가 무의미했고, 환경파일을 채워 다시 쟀습니다.)

**회귀에서 잡아낸 결함 1건 (고침).** `check_flat` 이 터졌습니다 — 새 「이번 수거 자재 사용량」 줄이 기존 「주고 온 자재」 줄과 **같은 접근성 이름**(`aria-label="35L 박스"`)을 갖게 된 것이 원인이었습니다. 검사만의 문제가 아니라 낭독기에서 두 칸이 구분되지 않아 사용과 공급을 바꿔 적을 수 있는 자리였습니다. `QtyField` 에 선택 항목 `ariaLabel` 을 두고(안 주면 기존과 동일) 사용량 줄만 「63L 박스 사용량」으로 읽히게 고쳤고, `check_flat` 은 14검사 실패 0 으로 되살아났습니다.

## G. 건드리지 않은 것

Dashboard · Excel Import · 일정/배차/차량 로직 · 수거이력 화면 구조 · 기존 자재관리 공급 등록/삭제 · 재고 · 월정산 · 청구 · 거래명세 · 입금 · 미수금 · 통계 · 권한(`access.ts`) · Auth · RLS · Portal · Why AX · Tutorial · Theme · Device Preview · Presentation · AI/Insight · short-demo 영상 · `supabase/migrations/*` · 기존 `PROPOSAL_00xx` · `pilotMode.ts`.
바뀐 파일: `PROJECT_STATE.md` §3 표(MINIMAL CHANGE) 그대로 — 그 밖의 파일은 손대지 않았습니다.

## H. 권고

1. **SQL 1회 실행** `supabase/proposals/PROPOSAL_0122_pilot_clients.sql` → 거래처 관리에서 월정액 5~10곳 체크 → 설정 「실증 시작일」. 이 셋이 없으면 Pilot 요약은 「칸 없음 / 0곳 / 시작일 미설정」으로 정직하게 남습니다.
2. 첫 이틀은 기사님이 「이번 수거 자재 사용량」을 **한 병원에서만** 적어 보고, 거래처 상세에 「사용 자재 - …」로 보이는지 대표·이사가 확인하는 것을 권합니다.
3. BASELINE UNKNOWN 5항목은 비워 두셔도 됩니다. 넣으실 때는 실측만 — 시연 예시값은 KNOWN 으로 치지 않습니다.
4. 자재 추천·예측·비용·급증·재주문은 `RECOMMENDATIONS.md` Future 에만 있습니다. 규격별 기록이 몇 주 쌓인 뒤에 판단해 주세요.

---

## RED TEAM (1회)

| 질문 | 판정 | 조치 |
|---|---|---|
| 1. 복잡도가 늘었나 | 현장: 접힌 구역 1개(첫 줄만 펼침). 관리자: 체크 1개 · 카드 1장 | 없음 |
| 2. 현장 업무량이 늘었나 | 선택 입력. 규격별을 적으면 4칸을 또 적지 않게 자동 계산. 최근 규격 「지난번」 한 번 채움 | **P1 고침** — 접힌 줄이 「가져온 용기 없음」이라 4칸을 또 적을 수 있었음 → 「규격별 N개로 자동 계산」 |
| 3. 공급/사용 혼동 | 구역·키·보기 줄 분리, 설명에 「재고를 움직이지 않습니다」. 검사가 공급 0 확인 | 없음 |
| 4. 재고 이중 차감 | `usedItems` 는 어느 경로에서도 `supplied` 를 만들지 않음. 수정 검사가 supplied 불변 확인. SQL 미변경 | 없음 |
| 5. Pilot / 시연 혼합 | 시연 거래처 제외 · `demo_session_id` 이벤트 제외 · `origin` demo/seed 일정 제외 | **P1 고침 (2026-09-16 검토)** — 공급 기록은 시연 표식을 안 읽어 Pilot 거래처에 시연 공급이 남으면 수거는 빠지고 공급만 남을 수 있었음 → `MaterialSupply.demoSessionId` 읽기 추가 + 집계에서 제외, 검사 1건 추가 |
| 6. 과장된 숫자 | % · 향상 · 월 환산 없음(검사). 「예상 차이」는 남은 개수가 아니라고 명시. BASELINE UNKNOWN 비움 | **P1 고침** — 「자주」 배지가 1회 기록에도 붙었음 → 「이전 N회」로 횟수 표기 |
| 7. 53곳 전체 강제 | 거래처별 체크, 일괄 켜기 없음, 10 은 권장 표기만 | 없음 |
| 8. 범위 밖 기능 | 자재관리 카드는 지시서의 「계산 가능하면 표시」 범위. 설정 화면은 안내 문장 1줄 | 없음 |

## 완료 체크리스트

- [x] 기존 핵심기능 손실 0 (A · F 회귀)
- [x] Material Master 그대로 사용, 하드코딩 규격 0
- [x] USED MATERIAL 저장 — collection · customer · material · quantity · recorded_at · recorded_by 연결 (기존 칸 재사용)
- [x] 공급 ≠ 사용 분리, 재고 이중차감 0 (검사 2건)
- [x] 수정 = 기존 amend 정책, 이벤트 중복 0
- [x] 거래처 상세 · 수거이력 표시
- [x] 자재관리 공급 vs 확인사용 (예상 차이, 「남아 있다」 표기 없음)
- [x] Pilot 5~10곳 관리자 체크 · 「N / 10」 · PILOT 배지 · 현장 별도 모드 없음
- [x] PHASE 1~4 기록 (`PILOT_PLAN.md` · `PROJECT_STATE.md`)
- [x] Pilot 시작일 = 기존 실증 시작일, 미설정 시 오늘 + 표기
- [x] Evidence 자동 · 시연/취소/시작일 이전/Pilot 외 제외 · 출처 표기 · BASELINE KNOWN/UNKNOWN
- [x] 임의 개선율 0 · 월 환산 0 · 라벨 「1주 Pilot 실제 기록」
- [x] Mobile 360/390/430 정상 (검사)
- [x] 정산/청구/재고 코드 변경 0 · 회귀 142 스위트 · 검사 5,770 · 실패 6(전부 기존)
- [x] 범위 밖 신규기능 0 (Future 는 RECOMMENDATIONS.md 에만)
- [x] 추가 마이그레이션 1개(추가만) · 기존 마이그레이션 수정 0 · DROP/TRUNCATE/DELETE 0
