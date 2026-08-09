#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 라이브 검증 전체 실행
#
#  05 ~ 08 을 순서대로 돌리고 마지막에 한 장짜리 표를 찍습니다.
#  마이그레이션을 적용한 뒤, 그리고 실사용 테스트에 넘기기 전에 한 번 돌립니다.
#
#  실행
#    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
#    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=... \
#           TEST_CLIENT_PW=... TEST_CLIENT2_PW=...
#    bash supabase/test/run_all.sh
#
#  · 08(브라우저)은 http://localhost:4173 이 떠 있을 때만 돌립니다.
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

if curl -sfo /dev/null --max-time 3 "$BASE"; then
  run "08 · 브라우저 종단 (PC 입력 → 모바일 조회)" \
    "$NODE" "$HERE/08_browser_live.mjs"
else
  NAMES+=("08 · 브라우저 종단 (PC 입력 → 모바일 조회)")
  RESULTS+=("SKIP")
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
