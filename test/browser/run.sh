#!/bin/bash
#  브라우저 회귀 — scratchpad 의 check_*.mjs 를 전부 돌립니다.
#
#   ⚠ 「검사 0」은 통과가 아니라 실패입니다. 스위트가 도중에 터지면 검사를
#     한 건도 못 하고 끝나는데, 그것을 0/0 으로 세면 **깨진 스위트가 조용히
#     통과한 것처럼 보입니다.** 실제로 두 스위트가 그렇게 숨어 있었습니다.
cd "$(dirname "$0")"
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
