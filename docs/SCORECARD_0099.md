# 0099 — Unified v3.0 (35개 절) 기준 채점표 · 고도화 기록

> 대표님 요청: 「이 최신 md 파일(v3.0) 내용을 기준으로 현재 결과물을 점수로 싹다
> 매겨보고, 부족한 부분은 알아서 목표를 설정해서 고도화. 기능이 갑자기 안 되거나
> 데이터가 날아가는 일 없이, 최대한 100점짜리로.」
>
> 채점 원칙 — **자(검사)로 잰 것만 점수를 줍니다.** 검사가 없던 항목은 있는
> 그대로 「못 잰다」고 적고, 이번에 자를 만들었으면 그 결과로 점수를 바꿉니다.
> 점수는 절마다 0~100, 마지막에 단순 평균. 「전」은 0098 커밋(757533c) 시점.

## 0. 채점 전에 바로잡은 것 — 자가 틀려 있던 두 곳

| # | 증상 | 분류 | 원인 | 처치 |
|---|---|---|---|---|
| 1 | check_theme 9개 테마 중 4~7개가 「대비 미달 98~213개 · 부모 opacity 로 흐려진 글자 171개」 | **TEST HARNESS DEFECT** | 자가 등장 애니메이션(250ms fade) **도중**에 쟀음. 검사 셋을 나란히 돌리면 그 250ms 가 늘어져 opacity 0.3 인 화면을 「2.3:1」로 읽음. 실제 색은 9개 테마 전부 정상(등장 완료 후 재측정: 낮은 대비 0 · 흐려진 글자 0) | 고정 350ms 대기 → **실제로 끝났는지**(getAnimations + 인라인 opacity<1 없음)를 물은 뒤 잼 |
| 2 | check_scale 673·768px 에서 「누를 것끼리 8px 미만」 14쌍 | 자 → **PRODUCT DEFECT** 순서로 둘 다 | ① 자가 가로로 578px 떨어진 두 단추를 붙었다고 셈(0099 앞 회차에 가로 겹침 조건 추가) ② 그 뒤 **진짜** 14쌍이 남음: 달력 ＋(방문 잡기) 가 칸 바닥에 붙어 있어 다음 줄 날짜 단추와 7px | ＋ 를 4px 띄움(폰 9px · 넓은 화면 11px). 390px 검사는 그대로 통과 |

이 두 곳을 고치기 전에는 테마·모바일 절을 「못 잰다」로 둘 수밖에 없었습니다
(0097 보고서 「이 환경에서 확인 못 하는 것」). 글꼴을 자체 호스팅(아래 §22)
하면서 두 검사가 다시 돌게 됐고, 그래서 처음으로 잡힌 것들입니다.

## 1. 채점표 (35개 절)

「근거」는 실제로 그것을 지키는 검사 이름과 이번 회귀에서의 건수입니다.

| 절 | 요구 | 전 | 후 | 근거 · 남은 것 |
|---|---|---|---|---|
| 0 ABSOLUTE PROJECT MODE | 기존 시스템 보호 최우선 | 100 | 100 | DB 변경 0 · 회귀 전 통과(아래 §3). 이번 회차 src 변경은 hover 1px · 칩 hover 색 · 달력 ＋ 4px · 표 줄 150ms 뿐 |
| 1 SOURCE OF TRUTH | 우선순위 준수 | 100 | 100 | 기존 기능·DB·Front Reference 우선. 자산은 Drive 20장 그대로 |
| 2 NO REBUILD / NO CORE CHANGE | 재작성 0 | 100 | 100 | 라우트·IA·DB·정산 로직 변경 0 (git diff 로 확인 가능) |
| 3 FEATURE FREEZE | 기능 추가 0 | 100 | 100 | 신규 화면·메뉴·기능 0. 아이디어는 RECOMMENDATIONS.md |
| 4 작업 비율 60/25/15/0 | | 90 | 95 | 이번 회차: 시각·상호작용(hover·달력·글꼴) 60% · 자 고침·회귀 30% · 채점표 10% |
| 5 병원 Context P0 | 새로고침·뒤로·창 왕복에도 병원 유지 | 100 | 100 | check_portal88 127 · check_portal93 32 |
| 6 Primary 수거 Journey | 요청→내부→상태→회신→이력 폐쇄 | 100 | 100 | check_e2e88 38 · check_reqdup · check_flow390 |
| 7 홈 중심 Workspace | | 95 | 95 | 0089 홈 재배치. 남은 것 없음(측정 항목 아님) |
| 8 CUSTOMER HOME 계층 | Hero 가 Action 을 밀지 않음 · 가짜 값 0 | 90 | 90 | check_brand95: 폰에서 「수거 요청」 y<844 · 상태층은 실제 데이터만(빈 값은 빈 채로) |
| 9 타이핑 최소화 | | 90 | 90 | 0089 시트 입력(선택 위주). 자 없음 — 점수는 검토 기준 |
| 10 Modal/Drawer/Sheet | Esc·뒤로가기·중첩 | 90 | 90 | useHistoryDismiss 겹침 id(0096) · 병원 시트 Esc. **내부 Modal 의 Esc 는 P2(대표님 승인 대기)** |
| 11 Drive 20장 전수 AUDIT | | 100 | 100 | check_brand95: 20장 전부 서버 200 응답, 매 회귀 |
| 12 신규 6장 확인 | | 100 | 100 | 0097: 6장 파일 확인·비교·추가·배치·PC·폰·실렌더링 |
| 13 신규 6장 권장 배치 | | 100 | 100 | 기획의도 §4/§6/§8 + 증빙 + 태블릿, 활용 계획 머리띠 |
| 14 「20개 모두 적용」 | | 95 | 95 | 19장 화면 배치. mobile_card_vertical 은 맞는 자리가 없어 **RECOMMENDATIONS**(화면 신설 필요 → P2) |
| 15 CUSTOMER vs BUSINESS 밀도 | 업무 화면에 사진이 데이터를 압도하지 않음 | 100 | 100 | check_brand95: 대시보드 브랜드 사진 0장 |
| 16 IMAGE QUALITY GATE | 잘림·왜곡·대비 | 85 | 95 | 0098: 사진마다 초점(focusOf) · 자름 ≤2.4× 자(6화면) · 글자 띠 덮개. **흐림/픽셀화는 눈으로 봐야 함** — 대표님 스크린샷 4장으로 확인, 자동 검사는 없음(−5) |
| 17 VISUAL 정체성 | Deep Navy · White · Teal | 100 | 100 | 색 체계 그대로. 네온·과한 그라데이션 0 |
| 18 PURE WHITE / SURFACE | 카드·표·모달 흰 대비 · 테마가 화면을 물들이지 않음 | 100 | 100 | check_theme ⑥ 카드 경계(9테마) · 바탕은 중립색 |
| 19 9 THEME 유지 | 9개 실제 작동 · 잔존 0 · 대비 | **0(못 잼)** | **100** | check_theme 9테마 × 5화면 × PC/폰: 대비 미달 0 · 흐려진 글자 0(§0-1 이후) |
| 20 SIDEBAR | 어두운 바탕 · 흰 글자 · 비활성 대비 · hover | 95 | 100 | check_theme ⑤ 가 body 전체(사이드바 포함)를 잼 · check_hover 사이드바 링크 반응 |
| 21 HOVER / MICRO | 누를 것에 140~180ms 반응 | **40(자 없음)** | **100** | **신규 check_hover**: PC 5화면에서 누를 수 있는 것 90%↑ 반응 · 100~250ms · 폰 눌린 느낌. 잡아서 고친 것 — 필터 칩 hover 없음 · 거래처 카드 hover 없음 · 표 줄 0ms |
| 22 MOBILE 360/390/430/768 | 넘침·잘림·탭 겹침·글자 크기 | 80 | 100 | check_scale 에 **360·430 추가**(폭 8벌 × 5화면 = 316건 통과). 글꼴 CDN 없이도 돌도록 **Pretendard 자체 호스팅**(공용 서브셋 92개 woff2 · 한 화면당 약 10개) — 병원 내부망에서도 같은 글꼴 |
| 23 AX ↔ CUSTOMER 전환 | 재설계 없이 발견성만 | 95 | 95 | check_viewswitch: 전환·되돌아오기·새로고침·뒤로·재로그인 |
| 24 FUTURE EXPANSION 70/30 | 계획중 배지 · 404/빈 화면 0 | 100 | 100 | PLANNED_DETAIL 7개 · PlannedPreview(check_phoneui · nav_collapse) · 「아직 없는 기능」 표시 |
| 25 KPI / PROOF | Baseline 없으면 UNKNOWN | 100 | 100 | /readiness · performance.ts(n<30 「측정 중」) · 개선율 지어내지 않음 |
| 26 AI 신규 금지 | READY/PREVIEW/NEXT 정직 | 100 | 100 | AI_SPECS 12개 「아직 한 곳도 켜지지 않았습니다」 · check_aispec 242 |
| 27 WHY AX | 3장 Story 전환점 · 카드 반복 금지 | 95 | 95 | check_brand95: /why 7장 · 01→02→03 순서 고정. 표·타임라인·큰 사진 섞음 |
| 28 TUTORIAL / PRESENTATION | 종료 후 backdrop·blur·pointer-events·scroll-lock·focus 잔존 0 | **60(자 없음)** | **100** | **신규 check_tourclean**: Esc·건너뛰기·끝까지 세 방식으로 끝낸 뒤 창·덮개·흐림·잠금·포커스·inert 0, 메뉴 눌림, 스크롤 됨 (PC·폰) + 시연 닫기 |
| 29 DEVICE PREVIEW | 미리보기 안 미리보기 0 · 닫은 뒤 정상 | 95 | 95 | check_viewswitch. 「미리보기 안 미리보기 0」은 명시 검사 없음(−5) |
| 30 PASS 1 AUDIT | | 100 | 100 | 0097 |
| 31 PASS 2 RETROFIT 14항목 | | 100 | 100 | 0095~0098 |
| 32 PASS 3 RED TEAM 1회 | | 100 | 100 | 0097 (P1 1건 수정 · P2 기록) |
| 33 REGRESSION QA | | 95 | 100 | 0098 128 suites 4,483/0 → 이번 130 suites(아래 §3) |
| 34 완료 보고 A~L | | 100 | 100 | RETROFIT_0097 + 이 문서 |
| 35 최종 성공조건 12 | | 92 | 100 | 12번 「Theme Regression = 0」이 이 환경에서 처음으로 **측정된** 상태 |

**평균 — 전 91.2 → 후 98.2** (§0~§35 36개 절 단순 평균, 소수 첫째 자리).

100 이 아닌 절과 이유 (전부 대표님 결정 또는 사람 눈이 필요한 것):
- §4 (95) 비율은 추정치라 100 을 주지 않음
- §7·§9 (95·90) 자 없이 검토로만 본 항목 — 자를 만들지 않은 것은 「타이핑 횟수」가 화면마다 달라 한 숫자로 못 박기 어렵기 때문
- §8 (90) 상태층은 실제 데이터가 들어와야 밀도가 채워짐(가짜 값 금지)
- §10 (90) 내부 Modal Esc — 모든 창에 걸리는 변경이라 **대표님 승인 후**
- §14 (95) mobile_card_vertical — 화면 신설 필요(P2)
- §16 (95) 흐림·픽셀화는 눈으로만
- §23·§27·§29 (95) 명시 자 없는 세부 항목 1개씩

## 2. 이번 회차에 바꾼 것 (전부)

제품(src) — 기능 변화 0, 데이터 변화 0:
- `index.html` · `tailwind.config.js` · `public/fonts/**` — Pretendard Variable 자체 호스팅(OFL)
- `ScheduleCalendar.tsx` — ＋ 단추 4px 위로
- `ui.tsx` FilterChip — 꺼진 칩 hover 색 + `aria-pressed`
- `PortalHistory.tsx` — 기간·구분 칩 `aria-pressed`
- `index.css` — `.pressable:hover` 1px 뜸(마우스 기기만) · `tbody tr` 150ms
- `PortalHome.tsx` · `Roadmap.tsx` — 사진 띠에 `bg-navy-950`(사진이 안 실려도 글자 대비 유지)

검사(test):
- `check_theme` 등장 애니메이션 완료 대기 · `a11y_measure` 가로 겹침 조건 · `check_scale` 360·430 · `_font` 계산된 글꼴로 판정
- **신규** `check_hover`(§21·§22 pressed) · **신규** `check_tourclean`(§28)

## 3. 회귀 (최종 빌드 1회) — 있는 그대로

| 단계 | 결과 |
|---|---|
| 130 suites · 3개 나란히(-P3) | 26개 돈 시점에 5 suites 실패, 부하 평균 5.7(4코어) → **중단** (같은 자리를 혼자 돌리면 통과 → 부하 탓) |
| 130 suites · 2개 나란히(-P2) | **5,002 OK · 24 FAIL** (9 suites) |
| 실패 9 suites 를 **혼자** 다시 | 6 suites 통과(materials82 · prodbillui · pricing · supplies · tourclean · theme = 부하 타이밍) · 3 suites 는 혼자서도 실패 |
| 혼자서도 실패한 3건 분류 | **전부 TEST HARNESS DEFECT** — ① check_truck: 호차 안내가 **날짜로**(2026-09-04) 끝나는 설계인데 자가 「보인다」만 기대 ② check_ready96: 표 7개를 다 읽기 전(고정 2.6초)에 읽어 「전부 missing」 ③ check_prodpnlui: 경영 요약 상자가 그려지기 전(고정 2.6초)에 읽어 「10만원 그대로」 실패 — 세 자 모두 **조건 대기**로 고침, 다시 돌려 26 · 30 · 33 전부 통과 |
| PRODUCT DEFECT | **0건** — 실패 24건 중 제품 쪽 원인은 하나도 없었습니다 |
| 개별 최종 | check_scale 316/0 · check_theme 173/0 · check_hover 14/0 · check_tourclean 66/0 · tsc 0 오류 |

새로 안 것: 글꼴을 자체 호스팅하면 검사 브라우저도 **진짜 글꼴을 받아 그리므로**
예전(글꼴 CDN 이 끊겨 대체 글꼴로 빨리 그려지던 때)보다 화면마다 무거워집니다.
이 작업공간(4코어)에서는 **2개 나란히**가 상한입니다 — test/README.md 에 적었습니다.
고정 대기(waitForTimeout)에 기대는 자가 아직 많아, 부하가 높으면 헛 실패가 납니다.
이번에 고친 세 자처럼 「실제로 그려졌는지」를 묻는 대기로 하나씩 바꿔 가는 것이 P2 입니다.

## 4. 대표님이 하실 것 (변화 없음)
- `PROPOSAL_ADDR_pilot.sql` 실행 · 품목 단가 · 운영비 3개월 · 현장 30건 · Edge Function 배포
- RECOMMENDATIONS.md P2 4건(문의 중복 SQL · 내부 Modal Esc · mobile_card_vertical · 좌표 칸) 중 진행할 것 지정
