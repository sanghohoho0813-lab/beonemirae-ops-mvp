# 0095 — Unified v1.4 Visual Retrofit (기능 동결 · 시각 품질만)

> 대표님 지시: 기존 기능·DB·업무흐름·라우트를 **그대로 보존**하면서
> 화면의 급을 올린다. NO REBUILD · NO LOGIC CHANGE · NO DB CHANGE.

## PASS 1 — 현재 화면 감사

### NO TOUCH (이번 작업에서 손대지 않음)
DB · RLS · Auth · 정산/청구/입금/미수 계산 · 재고 계산 · 수거 저장 ·
일정 생성 · 배차 로직 · 기존 API(repo.ts 의 서버 호출) · 기존 라우트 ·
권한(access.ts) · 데이터 흐름(DataContext 의 상태 변경 함수들) ·
Theme 시스템(테마 수 유지) · 투어/프레젠테이션 로직 · Preview 로직.

### KEEP (이미 기준을 충족 — 그대로 둠)
- 사이드바 색 아이콘 타일 (lib/tone.ts — 절제된 컬러 체계가 이미 있음)
- 다크 사이드바 글자색 (흰색 계열 유지 중)
- 병원 홈 8개 카드의 미세 색 구분 (0089 에서 완성)
- 병원 내비 3개 최소화 (0089)
- Surface Switch (BUSINESS AX ↔ 병원 화면, 0086·0090)
- PC↔폰 미리보기 (0090, 재귀 방지 포함)
- 글자 크기 시스템 · 44px 터치 · 16px 하한 (기존 회귀가 지킴)

### POLISH (시각만 다듬음)
- PortalHero — 배경 사진 + 남색 오버레이 (폰은 기존 그라데이션 유지:
  사진을 폰에서 빼는 이유 = 첫 화면에서 「수거 요청」이 밀리면 안 됨, 실측 회귀가 지킴)
- 창(Sheet) 머리 사진 띠 — 수거요청/긴급/용기·봉투/문의
- 소모품 주문 상품 카드 사진
- 병원 홈 하단 신뢰 띠 + 회사 소개 사진
- 고객지원 머리 사진
- 기획의도(Why AX) 사진 2장
- 추가 개발 예정 — 잠긴 회색 글 → 눌러서 「계획중」 미리보기 (정직한 설명, 날짜 약속 없음)
- prefers-reduced-motion 대응
- 표 줄 hover 등 상태 피드백 보강

### VISUAL ASSET (Google Drive 폴더 실사)
폴더에 실재: 14장 (Customer 12 · AX 2).
**폴더에 없음**: ax_workspace_bg · ax_manager_tablet · ax_report_evidence ·
why_ax_01_current · why_ax_02_improved · why_ax_03_growth (6장).
→ 없는 자산은 지어내지 않고 보고에 남긴다. Why AX 3-image story 는
자산이 준비되면 그때 배치한다.

### [EXISTING ISSUE — NOT MODIFIED]
- 내부 화면 Modal 이 Esc 로 안 닫힘 (병원 화면 Sheet 는 닫힘) — 0094 에서 보고, 대표님 판단 대기
- 화면 글꼴(Pretendard)이 CDN 차단 환경에서 대체 글꼴로 그려짐 — 0094 에서 보고, 글꼴 자체 호스팅은 대표님 판단 대기

## PASS 2 — 한 일 (구현 기록)

### 배치한 자산 (실제 파일명 · 자리)
| 파일 | 자리 |
|---|---|
| hero_main.jpg | 병원 홈 머리 배경 (PC 만 — 폰은 기존 그라데이션) |
| service_01_pickup_request.jpg | 수거 요청 창 머리 |
| service_02_emergency_pickup.jpg | 긴급 수거 창 머리 |
| service_03_supply_order.jpg | 용기·봉투 창 머리 |
| hero_secondary.jpg | 문의 창 머리 |
| offer_01/02/03 | 소모품 주문 상품 카드 · 용기 창 상품 줄 (규격이 맞을 때만) |
| trust_banner.jpg | 병원 홈 하단 신뢰 띠 |
| brand_story_space.jpg | 병원 홈 회사 소개 칸 |
| customer_experience.jpg | 고객지원 머리 |
| ax_cover_main.jpg · ax_signature_operation.jpg | 기획의도(Why AX) 두 자리 |

Customer 자산 11/12 사용(92%) — mobile_card_vertical 은 세로형 카드 자리가
실제로 없어 배치하지 않음(억지로 100% 쓰지 않음).
AX 자산 2/2 사용 — 대시보드에는 넣지 않음(KPI 가 먼저, 검사로 못 박음).

### 사진 외
- 「추가 개발 예정」 7가지 — 잠긴 회색 글 → 눌러서 「계획 중 · 지금은 이렇게」
  미리보기 (PC 사이드바 + 폰 더보기). 화면 이동 없음 · 날짜 약속 없음 · 404 없음.
- prefers-reduced-motion — CSS + framer-motion(MotionConfig) 전부 존중.
- 표 줄 hover — 아주 옅은 띠로 줄 따라 읽기 도움 (누를 수 있다는 뜻이 아님).
- 사진은 전부 저장소 안(/brand) — 바깥이 막힌 병원망에서도 나옵니다.

### 이번 작업이 드러낸 결함 — 고침
겹친 창의 뒤로가기 기록이 **한 표식을 같이 썼습니다**. 더보기 시트 위에서
미리보기를 닫으면 시트까지 같이 닫혔습니다(검사가 잡음). 항목마다 번호를
붙여 각자 자기 항목만 책임지게 고쳤습니다 (useHistoryDismiss).
