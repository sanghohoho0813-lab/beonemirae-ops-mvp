# 라이브 테스트 체크리스트

고객사에 **계정을 전달하기 전** 확인합니다.
고객사별로 복사해서 채우세요.

```
고객사      :
Supabase ref:
검증 담당자 :
검증 일자   :
앱 주소     :
```

상태 표기: `NOT TESTED` / `PASS` / `FAIL` / `N/A`

---

## A. 자동 검증

```bash
node supabase/test/05_live.mjs --setup
node supabase/test/05_live.mjs
node supabase/test/05_live.mjs --cleanup
```

| # | 항목 | 상태 | 결과 | 비고 |
|---|---|---|---|---|
| A1 | 05_live.mjs 전체 (63건) | NOT TESTED | __ / 63 | |
| A2 | 구조 확인 SQL (테이블 17 / RLS 17 / 정책 51 / 트리거 23) | NOT TESTED | | `01_SUPABASE_SETUP.md` STEP 5 |
| A3 | RLS 미적용 테이블 0개 | NOT TESTED | | |

A1 이 통과하면 아래 B·C·D·E 대부분이 이미 확인된 것입니다.
그래도 **사람이 직접 봐야 하는 것**은 남아 있습니다 — F 이후.

---

## B. 인증 (Auth)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| B1 | admin 로그인 | NOT TESTED | |
| B2 | office 로그인 | NOT TESTED | |
| B3 | field 로그인 | NOT TESTED | |
| B4 | client 로그인 | NOT TESTED | 병원 포털 사용 시 |
| B5 | 새로고침 후 로그인 유지 | NOT TESTED | |
| B6 | 로그아웃 후 내부 경로 재접근 차단 | NOT TESTED | |
| B7 | 미로그인 상태로 `/clients` → 로그인 화면 | NOT TESTED | |
| B8 | 잘못된 비밀번호 → 한국어 실패 문구 | NOT TESTED | |
| B9 | 비활성 계정 로그인 → 「비활성화된 계정」 안내 | NOT TESTED | |
| B10 | 공개 가입 차단 (`signup_disabled`) | NOT TESTED | STEP 4 |

## C. 역할 (Role)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| C1 | 역할별 첫 화면 (admin·office `/`, field `/today`, client `/portal`) | NOT TESTED | |
| C2 | field 메뉴에 미수금·통계·성과·설정·감사로그 없음 | NOT TESTED | |
| C3 | office 메뉴에 설정·감사로그 없음 | NOT TESTED | |
| C4 | field 가 `/receivables` 직접 입력 → 차단 화면 | NOT TESTED | |
| C5 | office 가 `/audit` 직접 입력 → 차단 화면 | NOT TESTED | |
| C6 | client 가 `/clients` 직접 입력 → 차단 화면 | NOT TESTED | |

## D. 권한 (RLS · 쿼리 수준)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| D1 | field → 감사로그 0건 | NOT TESTED | A1 포함 |
| D2 | field → 청구·영업 데이터 0건 | NOT TESTED | A1 포함 |
| D3 | field → 본인 역할 변경 실패 | NOT TESTED | A1 포함 |
| D4 | office → 감사로그 삭제 실패 | NOT TESTED | A1 포함 |
| D5 | client → 타 병원 데이터 0건 | NOT TESTED | A1 포함 |
| D6 | client → 타 병원 요청 생성·수정 실패 | NOT TESTED | A1 포함 |

## E. 핵심 업무

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| E1 | 거래처 등록 → 목록·상세에 반영 | NOT TESTED | |
| E2 | 차량 등록 → 수거 입력에서 선택 가능 | NOT TESTED | |
| E3 | 오늘 일정에서 「수거정보 입력」 → 거래처·차량 자동 채움 | NOT TESTED | |
| E4 | 수거 완료 저장 → 일정 완료 | NOT TESTED | |
| E5 | 수거이력에 기록 생성 | NOT TESTED | |
| E6 | 자재 동시공급 → 사무실 재고 차감 | NOT TESTED | |
| E7 | 해당 병원의 긴급·추가수거 요청 자동 종료 | NOT TESTED | |
| E8 | 감사로그에 작업자 이름·역할·시간 기록 | NOT TESTED | |
| E9 | 같은 일정 두 번 완료 → 차단 | NOT TESTED | |
| E10 | 같은 날 같은 병원 재저장 → 「추가 수거로 저장하세요」 안내 | NOT TESTED | |
| E11 | 「추가 수거」로 표시하면 정상 저장 | NOT TESTED | 같은 날 재방문은 실제 업무 |
| E12 | 저장 중 버튼 재클릭해도 1건만 | NOT TESTED | |
| E13 | 완료 건 수거량 「수정」 → 새로고침 후에도 유지 | NOT TESTED | |
| E14 | 수거 취소(revert) → 재고·요청 원상복구 | NOT TESTED | |

## F. 병원 포털 (사용하는 경우만)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| F1 | 병원 로그인 → 자기 병원 현황 표시 | NOT TESTED | |
| F2 | 타 병원 정보 안 보임 | NOT TESTED | |
| F3 | 병원이 수거·소모품 요청 등록 | NOT TESTED | |
| F4 | office 화면에 그 요청 표시 | NOT TESTED | |
| F5 | office 가 상태 변경 + 회신 | NOT TESTED | |
| F6 | 병원 화면에 상태·회신 반영 | NOT TESTED | |
| F7 | 처리자(handled_by) 기록 | NOT TESTED | |

## G. 여러 브라우저 · 기기

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| G1 | 브라우저 A(office) 변경 → 브라우저 B(admin) 새로고침 시 동일 | NOT TESTED | |
| G2 | 실제 휴대폰에서 field 로그인 | NOT TESTED | 실기기 권장 |
| G3 | 휴대폰에서 입력한 수거가 PC 에서 보임 | NOT TESTED | |
| G4 | 같은 계정 두 기기 동시 로그인 | NOT TESTED | |

## H. 화면 (1440 · 390)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| H1 | 1440 데스크톱 — 주요 화면 잘림 없음 | NOT TESTED | |
| H2 | 390 모바일 — 가로 스크롤 없음 | NOT TESTED | |
| H3 | 390 현장 홈에서 다음 방문·수거 입력 버튼 보임 | NOT TESTED | |
| H4 | 하단 탭바가 콘텐츠를 가리지 않음 | NOT TESTED | |

## I. 빈 화면 · 오류

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| I1 | 데이터 0건 화면에 다음 행동 안내 | NOT TESTED | 거래처·미수금·이력·리포트 |
| I2 | 「시작하기」 체크리스트 표시 | NOT TESTED | 4개 완료 시 사라짐 |
| I3 | 네트워크 끊고 저장 → 실패 표시 + 다시 시도 | NOT TESTED | |
| I4 | 저장 실패 시 입력값 유지 | NOT TESTED | |
| I5 | 권한 오류가 한국어로 표시 | NOT TESTED | |
| I6 | 저장 실패인데 성공처럼 보이는 화면 없음 | NOT TESTED | |

## J. 시연 / 실사용 분리

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| J1 | 실사용 모드에서 「시연 상태 초기화」 버튼 미노출 | NOT TESTED | |
| J2 | 실사용 모드에서 「전체 초기화」 버튼 미노출 | NOT TESTED | |
| J3 | 거래처 화면에 「거래처 데이터 세트」 미노출 | NOT TESTED | |
| J4 | 실제 DB 에 시연 거래처(`is_demo_generated`) 0건 | NOT TESTED | |
| J5 | 실사용 일정의 `demo_session_id` 0건 | NOT TESTED | |
| J6 | 실증 시작일 설정 완료 | NOT TESTED | 성과 집계 기준 |

## K. 보안

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| K1 | 번들에 service_role 키 없음 | NOT TESTED | `grep` 로 확인 |
| K2 | 저장소에 `.env.local` 없음 | NOT TESTED | |
| K3 | 공개 가입 차단 | NOT TESTED | |
| K4 | RLS 전 테이블 활성 | NOT TESTED | |
| K5 | 문서·이슈에 비밀번호/키 없음 | NOT TESTED | |

---

## 전달 판정

- [ ] A · B · C · D · E 전부 PASS
- [ ] F (포털 사용 시) 전부 PASS
- [ ] G1 PASS
- [ ] J · K 전부 PASS
- [ ] FAIL 항목 없음 (있으면 아래에 기록하고 해결 후 재검증)

```
FAIL 기록:

담당자 서명 / 일자:
```
