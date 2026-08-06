#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 동시 수정 검증 — 두 세션이 "동시에" 같은 일정을 완료하려 할 때
#
#  complete_collection 은 대상 일정과 재고 행을 FOR UPDATE 로 잠급니다.
#  두 직원이 같은 순간에 완료를 눌러도 한 건만 성공해야 하고,
#  진 쪽은 명확한 오류를 받아야 하며 재고가 두 번 차감되면 안 됩니다.
#
#  실행: bash supabase/test/02_concurrency.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-5433} -U ${PGUSER:-postgres} -d ${PGDATABASE:-beonemirae} -tA"
FAIL=0
ok()   { echo " OK  | $1"; }
bad()  { echo "FAIL | $1"; FAIL=1; }

# ── 준비: 예정 일정 1건 + 재고 고정 ─────────────────────────────────────────
$PSQL -q <<'SQL'
delete from public.material_transactions;
delete from public.materials;
delete from public.collection_events;
delete from public.schedules;
update public.office_stock set corrugated_box=100, plastic_container=100, bag=100, needle_box=100 where id=1;
insert into public.clients (name, type, address) values ('동시성테스트병원','병원','테스트로 9')
  on conflict do nothing;
insert into public.schedules (date, client_id, waste_type, vehicle_id, scheduled_time, status, expected_amount)
select current_date,
       (select id from public.clients where name='동시성테스트병원'),
       '의료폐기물',
       (select id from public.vehicles where waste_type='의료폐기물' limit 1),
       '09:00','예정',100;
SQL

CLIENT=$($PSQL -c "select id from public.clients where name='동시성테스트병원'")
VEHICLE=$($PSQL -c "select id from public.vehicles where waste_type='의료폐기물' limit 1")
SCHED=$($PSQL -c "select id from public.schedules where status='예정' limit 1")
FIELD=$($PSQL -c "select id from public.profiles where role='field' limit 1")
OFFICE=$($PSQL -c "select id from public.profiles where role='office' limit 1")

# 한 세션이 트랜잭션 안에서 complete_collection 을 호출하고,
# 지정한 시간만큼 커밋을 늦춰 두 세션이 실제로 겹치게 만듭니다.
attempt() { # $1=actor_id  $2=시작지연(초)  $3=커밋전 대기(초)  $4=출력파일
  ( sleep "$2"
    psql -h "${PGHOST:-/tmp}" -p "${PGPORT:-5433}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-beonemirae}" -tA <<SQL > "$4" 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"$1","role":"authenticated"}', true);
select public.complete_collection(jsonb_build_object(
  'scheduleId','$SCHED','clientId','$CLIENT','wasteType','의료폐기물',
  'vehicleId','$VEHICLE','driverName','기사','actualAmount',150,
  'actualTime','10:00','containers','{}'::jsonb,'handoverStatus','수거 완료',
  'supplied', jsonb_build_object('corrugatedBox',5,'plasticContainer',0,'bag',0,'needleBox',0),
  'isAdditional',false,'memo','동시성','screen','수거 입력','closeRequests','[]'::jsonb));
select pg_sleep($3);
commit;
SQL
  ) &
}

OUT=$(mktemp -d)
attempt "$FIELD"  0   2 "$OUT/a.txt"    # A: 먼저 시작, 2초 뒤 커밋
attempt "$OFFICE" 0.3 0 "$OUT/b.txt"    # B: 0.3초 뒤 시작 → A 의 잠금에 걸림
wait

A=$(cat "$OUT/a.txt"); B=$(cat "$OUT/b.txt")
echo "── 두 세션 동시 완료 시도 ──────────────────────────────────────────"
echo "[세션 A] $(echo "$A" | grep -iE 'eventId|ERROR' | head -1 | cut -c1-90)"
echo "[세션 B] $(echo "$B" | grep -iE 'eventId|ERROR' | head -1 | cut -c1-90)"
echo

A_OK=$(echo "$A" | grep -c 'eventId'); B_OK=$(echo "$B" | grep -c 'eventId')
SUCCESS=$((A_OK + B_OK))

[ "$SUCCESS" -eq 1 ] && ok "정확히 한 세션만 성공 (성공 $SUCCESS건)" \
                     || bad "동시 완료가 $SUCCESS건 성공 — 중복 방지 실패"

echo "$A$B" | grep -q '이미 완료 처리된 일정입니다' \
  && ok "진 세션은 명확한 오류 수신 — '이미 완료 처리된 일정입니다'" \
  || bad "진 세션 오류 메시지가 불명확"

DONE=$($PSQL -c "select count(*) from public.schedules where status='완료'")
[ "$DONE" = "1" ] && ok "완료 일정 1건 (중복 완료 없음)" || bad "완료 일정 ${DONE}건"

EVT=$($PSQL -c "select count(*) from public.collection_events where not reverted")
[ "$EVT" = "1" ] && ok "수거 이벤트 1건 (중복 기록 없음)" || bad "수거 이벤트 ${EVT}건"

BOX=$($PSQL -c "select corrugated_box from public.office_stock where id=1")
[ "$BOX" = "95" ] && ok "재고 이중 차감 없음 (100 → 95, 5개 1회만)" \
                  || bad "재고 ${BOX} — 이중 차감 발생 (기대 95)"

MAT=$($PSQL -c "select count(*) from public.materials")
[ "$MAT" = "1" ] && ok "자재 공급 이력 1건 (중복 없음)" || bad "자재 이력 ${MAT}건"

rm -rf "$OUT"
echo
[ "$FAIL" -eq 0 ] && echo "동시성 검증: 전부 통과" || echo "동시성 검증: 실패 항목 있음"
exit $FAIL
