#!/bin/bash
#  브라우저 회귀 — scratchpad 의 check_*.mjs 를 전부 돌립니다.
#
#   ⚠ 「검사 0」은 통과가 아니라 실패입니다. 스위트가 도중에 터지면 검사를
#     한 건도 못 하고 끝나는데, 그것을 0/0 으로 세면 **깨진 스위트가 조용히
#     통과한 것처럼 보입니다.** 실제로 두 스위트가 그렇게 숨어 있었습니다.
cd "$(dirname "$0")"

#  ⚠ playwright 를 못 찾으면 **여기서 한 번 말하고 멈춥니다.** 안 그러면
#    125개 스위트가 같은 말을 125번 하고 끝납니다.
if ! node -e 'import("./_pw.mjs").then(()=>process.exit(0),(e)=>{console.error(String(e.message||e));process.exit(1)})' 2>/tmp/_pwchk; then
  cat /tmp/_pwchk
  echo
  echo "브라우저 회귀를 시작하지 못했습니다 — 위 안내대로 자리를 알려 주신 뒤 다시 돌려 주세요."
  exit 1
fi

tot=0; bad=0; n=0; broken=0
for f in check_*.mjs; do
  o=$(node "$f" 2>&1); code=$?
  c=$(printf '%s\n' "$o" | grep -cE '^( OK |FAIL)')
  x=$(printf '%s\n' "$o" | grep -cE '^FAIL')
  printf '%s\n' "$o" | grep -E '^FAIL'
  note=""
  if [ "$c" -eq 0 ]; then
    note=" ← 검사를 한 건도 못 함 (터졌습니다)"
    printf '%s\n' "$o" | tail -6 | sed 's/^/       /'
    broken=$((broken+1))
  elif [ "$code" -ne 0 ] && [ "$x" -eq 0 ]; then
    note=" ← 끝에 터졌습니다"
    broken=$((broken+1))
  fi
  echo "${f%.mjs} :: 검사 $c · 실패 $x$note"
  tot=$((tot+c)); bad=$((bad+x)); n=$((n+1))
done
echo
echo "브라우저 — 스위트 $n · 검사 $tot · 실패 $bad · 깨진 스위트 $broken"
