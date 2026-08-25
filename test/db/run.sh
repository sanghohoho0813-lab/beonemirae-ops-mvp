#!/bin/bash
#  DB 회귀 — 격리 PostgreSQL 에 마이그레이션을 처음부터 올리고 돌립니다.
declare -A M=( [db_assign]=asgq [db_bank]=bankq [db_billing]=billq [db_client]=cliq [db_concurrent]=concq
  [db_costs]=pnlq [db_e2e]=xlimp [db_flat]=flatq [db_holiday]=holq [db_invariants]=inv [db_money]=moneyq
  [db_plan]=planq [db_price]=priceq [db_receipts]=recq [db_revenue]=revq [db_tax]=taxq [db_approve]=apprq [db_retry]=retryq [db_supply]=supq [db_health]=healthq [db_flatfee]=fpolq [db_dedup]=dupq [db_errors]=errq [db_company]=coq [db_orders]=ordq [db_marks]=marksq [db_dedup2]=dup2q [db_assign2]=asg2q [db_prodbill]=prodq [db_book]=bookq [db_move]=moveq [db_edu]=eduq [db_cdate]=cdateq [db_edit]=editq [db_perm]=permq [db_roles_e2e]=e2eq [db_fieldsched]=fschedq [db_ops70]=ops70q [db_portal83]=portal83 )
tot=0; bad=0; sn=0; bk=0
for f in "$(dirname "$0")"/db_*.mjs; do
  b=$(basename $f .mjs)
  if [ -n "${M[$b]:-}" ]; then bash "$(dirname "$0")"/setup_db.sh "${M[$b]}" >/dev/null 2>&1 || { echo "$b :: 준비 실패"; continue; }; fi
  o=$(node $f 2>&1)
  n=$(echo "$o" | grep -c "^FAIL"); c=$(echo "$o" | grep -cE "^( OK |FAIL)"); e=$(echo "$o" | grep -c "Node.js v")
  echo "$o" | grep -E "^FAIL"
  #  「검사 0」은 통과가 아닙니다 — 한 건도 못 해 보고 끝난 것입니다.
  note=""
  if [ "$c" -eq 0 ]; then note=" ← 검사를 한 건도 못 함"; echo "$o" | tail -5 | sed 's/^/       /'; bk=$((bk+1)); fi
  [ "$e" -gt 0 ] && [ "$c" -gt 0 ] && { note="$note ← 끝에 터졌습니다"; bk=$((bk+1)); }
  echo "$b :: 검사 $c · 실패 $n · 크래시 $e$note"
  tot=$((tot+c)); bad=$((bad+n)); sn=$((sn+1))
done
echo
echo "DB — 스위트 $sn · 검사 $tot · 실패 $bad · 깨진 스위트 $bk"
echo DONE
