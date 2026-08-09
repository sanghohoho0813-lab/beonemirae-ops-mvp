#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 라이브 검증 전체 실행
#
#  05 ~ 26 을 순서대로 돌리고 마지막에 한 장짜리 표를 찍습니다.
#  마이그레이션을 적용한 뒤, 그리고 실사용 테스트에 넘기기 전에 한 번 돌립니다.
#
#  실행
#    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
#    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=... \
#           TEST_CLIENT_PW=... TEST_CLIENT2_PW=...
#    bash supabase/test/run_all.sh
#
#  · 08·13~26(브라우저)은 http://localhost:4173 이 떠 있을 때만 돌립니다.
#    없으면 건너뛰고 그 사실을 표에 남깁니다 — 조용히 통과시키지 않습니다.
#  · 키는 셸에만 둡니다. 끝나면 unset 하거나 셸을 닫으세요.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

NODE="${NODE:-node}"
BASE="${BASE:-http://localhost:4173}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
  echo
  echo "08 건너뜀 — $BASE 에 preview 가 없습니다."
  echo "  npm run build && npx vite preview --port 4173  후 다시 실행하세요."
fi

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
