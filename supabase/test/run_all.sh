#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 라이브 검증 전체 실행
#
#  05 ~ 45 를 순서대로 돌리고 마지막에 한 장짜리 표를 찍습니다.
#  마이그레이션을 적용한 뒤, 그리고 실사용 테스트에 넘기기 전에 한 번 돌립니다.
#
#  실행
#    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
#    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=... \
#           TEST_CLIENT_PW=... TEST_CLIENT2_PW=...
#    bash supabase/test/run_all.sh
#
#  · 08·13~43(브라우저)은 http://localhost:4173 이 떠 있을 때만 돌립니다.
#    없으면 건너뛰고 그 사실을 표에 남깁니다 — 조용히 통과시키지 않습니다.
#  · 키는 셸에만 둡니다. 끝나면 unset 하거나 셸을 닫으세요.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

NODE="${NODE:-node}"
BASE="${BASE:-http://localhost:4173}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

#  검사용 브라우저도 한국 시각으로 돌립니다.
#
#  실제로 쓰는 사람은 전부 한국에 있고, 서버는 오늘이 며칠인지를 늘 한국
#  시각으로 봅니다. 검사 기계가 UTC 로 돌면 한국 시각 09시(=UTC 0시) 이후에
#  하루가 어긋나, 오늘 만든 일정이 '내일' 것으로 잡히며 멀쩡한 기능이
#  실패로 나옵니다. 실제로 자정을 넘기며 돌린 회차에서 그 일이 났습니다.
export TZ="${TZ:-Asia/Seoul}"

for v in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!v:-}" ]; then echo "환경변수 $v 가 필요합니다."; exit 1; fi
done

declare -a NAMES=() RESULTS=()
run() {
  local name="$1"; shift
  echo
  echo "════════════════════════════════════════════════════════════"
  echo "  $name"
  echo "════════════════════════════════════════════════════════════"
  if "$@"; then RESULTS+=("PASS"); else RESULTS+=("FAIL"); fi
  NAMES+=("$name")
}

# 검증용 계정·데이터 준비. 이미 있으면 건너뜁니다.
# 05 는 오늘 '예정' 일정을 하나 소비하므로, 하루에 두 번 이상 돌리려면 필요합니다.
echo "── 준비 (05_live.mjs --setup) ───────────────────────────────"
"$NODE" "$HERE/05_live.mjs" --setup || { echo "준비 단계에서 실패했습니다."; exit 1; }

run "05 · 라이브 전반 (Auth · RLS · CRUD · 수거 · 감사 · Demo/Live)" \
  "$NODE" "$HERE/05_live.mjs"

run "06 · 병원 간 격리 · 권한 상승 차단" \
  "$NODE" "$HERE/06_cross_client.mjs"

run "07 · 유상/무상 · 월 정산 · 거래명세서" \
  "$NODE" --experimental-strip-types "$HERE/07_settlement.mjs"

run "09 · 역할 × 테이블 × 조작 전수" \
  "$NODE" "$HERE/09_rls_matrix.mjs"

run "10 · 동시 저장 · 무결성" \
  "$NODE" "$HERE/10_integrity.mjs"

run "11 · Auth 경계 (가입·토큰·로그아웃)" \
  "$NODE" "$HERE/11_auth_boundary.mjs"

run "12 · 정산 경계값 (월 경계·규격미상·단가)" \
  "$NODE" --experimental-strip-types "$HERE/12_settlement_edges.mjs"

run "31 · 계정 중지·역할 변경 즉시 반영" \
  "$NODE" "$HERE/31_session_revoke.mjs"

run "33 · 시연 초기화 사정거리 (실데이터 보존)" \
  "$NODE" "$HERE/33_demo_reset_scope.mjs"

run "34 · 감사기록 무결성 (수정·삭제·위조)" \
  "$NODE" "$HERE/34_audit_integrity.mjs"

run "37 · 관리자 잠김 방지 (아무도 못 들어오게 되는 것)" \
  "$NODE" "$HERE/37_admin_lockout.mjs"

# 38 은 DB·브라우저 없이 계산만 대조합니다 (엑셀 ↔ lib/billing.ts).
run "38 · 이사님 엑셀과 정산 금액 대조 (더원요양병원)" \
  "$NODE" --experimental-strip-types "$HERE/38_excel_parity.mjs"

# 41 도 DB·브라우저 없이 계산만 봅니다 (청구를 확정하면 정말 굳는가).
run "41 · 청구 확정·고정 규칙 (단가변경·추가수거·취소)" \
  "$NODE" --experimental-strip-types "$HERE/41_billing_freeze.mjs"

# 44 는 실제 엑셀 파일을 읽어 무엇을 넣을지 정하는 부분만 봅니다 (DB·브라우저 없음).
#   원본 경로는 SAMPLE_XLSX 로 지정합니다. 없으면 건너뜁니다.
if [ -f "${SAMPLE_XLSX:-}" ]; then
  run "44 · 엑셀 가져오기 판정·금액 대조 (원본 파일)" \
    "$NODE" --experimental-strip-types "$HERE/44_excel_import_plan.mjs"
else
  NAMES+=("44 · 엑셀 가져오기 판정·금액 대조 (원본 파일)"); RESULTS+=("SKIP")
fi

# 46 은 형식이 다른 엑셀 세 개를 넣어 봅니다 (DB·브라우저 없음).
run "46 · 엑셀 형식이 달라도 추측하지 않는가" \
  "$NODE" --experimental-strip-types "$HERE/46_excel_variants.mjs"

# 42 는 서버 없이 도는 시연 빌드로 청구 화면 자체를 눌러 봅니다.
#   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-demo
#   npx vite preview --outDir dist-demo --port 4174
if curl -sfo /dev/null --max-time 3 "${DEMO_BASE:-http://localhost:4174}"; then
  run "42 · 청구 화면 동작 (시연 모드 · DB 없이)" \
    "$NODE" "$HERE/42_billing_ui_demo.mjs"
else
  NAMES+=("42 · 청구 화면 동작 (시연 모드 · DB 없이)")
  RESULTS+=("SKIP")
fi

if curl -sfo /dev/null --max-time 3 "$BASE"; then
  run "08 · 브라우저 종단 (PC 입력 → 모바일 조회)" \
    "$NODE" "$HERE/08_browser_live.mjs"
  run "13 · 멀티세션 동시 수정 · 감사기록" \
    "$NODE" "$HERE/13_multisession_audit.mjs"
  run "14 · 병원 포털 실사용 흐름" \
    "$NODE" "$HERE/14_portal_flow.mjs"
  run "15 · 현장 흐름 · 통신 끊김" \
    "$NODE" "$HERE/15_field_offline.mjs"
  run "16 · 미수금 종단 흐름" \
    "$NODE" "$HERE/16_receivables_flow.mjs"
  run "17 · 자재 재고 관리" \
    "$NODE" "$HERE/17_materials_stock.mjs"
  run "18 · 정산·거래명세서 화면" \
    "$NODE" --experimental-strip-types "$HERE/18_settlement_screen.mjs"
  run "19 · 사용자 관리 · 역할 변경" \
    "$NODE" "$HERE/19_user_admin.mjs"
  run "20 · 통계·성과·대시보드 숫자" \
    "$NODE" "$HERE/20_stats_screens.mjs"
  run "21 · 차량 관리 · 비밀번호 변경" \
    "$NODE" "$HERE/21_vehicle_password.mjs"
  run "22 · 거래처를 그만둘 때 (미수금·이력 보존)" \
    "$NODE" "$HERE/22_client_retire.mjs"
  run "23 · 현장 메모 · 수거 이력 · 감사로그" \
    "$NODE" "$HERE/23_notes_history.mjs"
  run "24 · 제안 종단 (사무실 → 병원 수락 → 사무실)" \
    "$NODE" "$HERE/24_proposal_flow.mjs"
  run "25 · 거래처 단가 화면 → 정산 반영" \
    "$NODE" "$HERE/25_price_editor.mjs"
  run "26 · 거래처 신규 등록 (화면 → DB → 이동)" \
    "$NODE" "$HERE/26_client_create.mjs"
  run "27 · 기준값 입력 → 성과 화면 기준선" \
    "$NODE" "$HERE/27_baseline_input.mjs"
  run "28 · 전화 요청 대행 접수 → 병원 확인" \
    "$NODE" "$HERE/28_staff_request.mjs"
  run "29 · 수거량 자릿수 오타 · 추가 수거" \
    "$NODE" "$HERE/29_amount_typo.mjs"
  run "30 · 통신 끊김 시 요청 (병원·사무실)" \
    "$NODE" "$HERE/30_request_offline.mjs"
  run "32 · 공용 PC 계정 전환 (앞사람 데이터 잔상)" \
    "$NODE" "$HERE/32_shared_pc.mjs"
  run "35 · 폰 화면 (밀림·잘림 · 글자 크기 3가지)" \
    "$NODE" "$HERE/35_mobile_layout.mjs"
  run "36 · 거래명세서 인쇄 (병원에 보낼 PDF)" \
    "$NODE" "$HERE/36_print_invoice.mjs"
  run "39 · 한 번 입력 → 월말까지 (엑셀 업무 흐름)" \
    "$NODE" "$HERE/39_one_entry_chain.mjs"
  run "40 · 청구 확정 → 미수금 → 입금 → 명세서" \
    "$NODE" "$HERE/40_billing_confirm.mjs"
  run "43 · 사용자·권한 관리 (계정 생성·역할·중지·비밀번호)" \
    "$NODE" "$HERE/43_user_admin.mjs"
  run "48 · 로그인·계정 진입 (첫 화면·역할별 이동·세션·중지 계정)" \
    "$NODE" "$HERE/48_login_gate.mjs"
  run "49 · 실운영 계정 전환 절차 리허설 (만들기 → 검증 → 정리)" \
    "$NODE" "$HERE/49_account_handover.mjs"
  if [ -f "${SAMPLE_XLSX:-}" ]; then
    run "45 · 엑셀 가져오기 종단 (미리보기 → 등록 → 대조)" \
      "$NODE" "$HERE/45_excel_import_live.mjs"
  else
    NAMES+=("45 · 엑셀 가져오기 종단 (미리보기 → 등록 → 대조)"); RESULTS+=("SKIP")
  fi
else
  NAMES+=("08 · 브라우저 종단 (PC 입력 → 모바일 조회)")
  RESULTS+=("SKIP")
  NAMES+=("13 · 멀티세션 동시 수정 · 감사기록")
  RESULTS+=("SKIP")
  NAMES+=("14 · 병원 포털 실사용 흐름")
  RESULTS+=("SKIP")
  NAMES+=("15 · 현장 흐름 · 통신 끊김")
  RESULTS+=("SKIP")
  NAMES+=("16 · 미수금 종단 흐름"); RESULTS+=("SKIP")
  NAMES+=("17 · 자재 재고 관리"); RESULTS+=("SKIP")
  NAMES+=("18 · 정산·거래명세서 화면"); RESULTS+=("SKIP")
  NAMES+=("19 · 사용자 관리 · 역할 변경"); RESULTS+=("SKIP")
  NAMES+=("20 · 통계·성과·대시보드 숫자"); RESULTS+=("SKIP")
  NAMES+=("21 · 차량 관리 · 비밀번호 변경"); RESULTS+=("SKIP")
  NAMES+=("22 · 거래처를 그만둘 때 (미수금·이력 보존)"); RESULTS+=("SKIP")
  NAMES+=("23 · 현장 메모 · 수거 이력 · 감사로그"); RESULTS+=("SKIP")
  NAMES+=("24 · 제안 종단 (사무실 → 병원 수락 → 사무실)"); RESULTS+=("SKIP")
  NAMES+=("25 · 거래처 단가 화면 → 정산 반영"); RESULTS+=("SKIP")
  NAMES+=("26 · 거래처 신규 등록 (화면 → DB → 이동)"); RESULTS+=("SKIP")
  NAMES+=("27 · 기준값 입력 → 성과 화면 기준선"); RESULTS+=("SKIP")
  NAMES+=("28 · 전화 요청 대행 접수 → 병원 확인"); RESULTS+=("SKIP")
  NAMES+=("29 · 수거량 자릿수 오타 · 추가 수거"); RESULTS+=("SKIP")
  NAMES+=("30 · 통신 끊김 시 요청 (병원·사무실)"); RESULTS+=("SKIP")
  NAMES+=("32 · 공용 PC 계정 전환 (앞사람 데이터 잔상)"); RESULTS+=("SKIP")
  NAMES+=("35 · 폰 화면 (밀림·잘림 · 글자 크기 3가지)"); RESULTS+=("SKIP")
  NAMES+=("36 · 거래명세서 인쇄 (병원에 보낼 PDF)"); RESULTS+=("SKIP")
  NAMES+=("39 · 한 번 입력 → 월말까지 (엑셀 업무 흐름)"); RESULTS+=("SKIP")
  NAMES+=("40 · 청구 확정 → 미수금 → 입금 → 명세서"); RESULTS+=("SKIP")
  NAMES+=("43 · 사용자·권한 관리 (계정 생성·역할·중지·비밀번호)"); RESULTS+=("SKIP")
  NAMES+=("48 · 로그인·계정 진입 (첫 화면·역할별 이동·세션·중지 계정)"); RESULTS+=("SKIP")
  NAMES+=("49 · 실운영 계정 전환 절차 리허설 (만들기 → 검증 → 정리)"); RESULTS+=("SKIP")
  NAMES+=("45 · 엑셀 가져오기 종단 (미리보기 → 등록 → 대조)"); RESULTS+=("SKIP")
  echo
  echo "08 건너뜀 — $BASE 에 preview 가 없습니다."
  echo "  npm run build && npx vite preview --port 4173  후 다시 실행하세요."
fi

# 47 은 **맨 마지막**에 돕니다. 검증용 거래처를 실제로 지웠다가 되돌리기
# 때문에, 중간에 두면 뒤 검사들이 쓸 거래처가 사라집니다.
run "47 · 검증 데이터 정리가 실데이터를 건드리는가" \
  "$NODE" "$HERE/47_cleanup_scope.mjs"

echo
echo "════════════════════════════════════════════════════════════"
echo "  검증 요약"
echo "════════════════════════════════════════════════════════════"
worst=0
for i in "${!NAMES[@]}"; do
  printf '  %-6s %s\n' "${RESULTS[$i]}" "${NAMES[$i]}"
  [ "${RESULTS[$i]}" = "FAIL" ] && worst=1
  [ "${RESULTS[$i]}" = "SKIP" ] && [ $worst -eq 0 ] && worst=2
done
echo
case $worst in
  0) echo "READY FOR DIRECTOR/STAFF TEST: YES" ;;
  2) echo "READY FOR DIRECTOR/STAFF TEST: 미확정 — 건너뛴 검증이 있습니다" ;;
  *) echo "READY FOR DIRECTOR/STAFF TEST: NO — 위 FAIL 을 먼저 해결하세요" ;;
esac
exit $(( worst == 1 ? 1 : 0 ))
