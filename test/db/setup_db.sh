#!/bin/bash
#  격리 DB 하나를 처음부터 만듭니다. 실패를 숨기지 않습니다.
#  (샌드박스에서 PostgreSQL 이 명령 사이에 내려가는 일이 있어, 매번 확인합니다)
set -u
DB=$1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

pg_isready -h /var/tmp/pgt -p 55432 >/dev/null 2>&1 || {
  sudo -u pgtest /usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgt/data -l /var/tmp/pgt/pg.log \
    -o "-p 55432 -k /var/tmp/pgt -c listen_addresses=''" start >/dev/null 2>&1
  sleep 3
}
pg_isready -h /var/tmp/pgt -p 55432 >/dev/null 2>&1 || { echo "PG 안 뜸"; exit 1; }

P() { sudo -u pgtest psql -h /var/tmp/pgt -p 55432 -U postgres "$@"; }

P -d postgres -qc "drop database if exists $DB" -c "create database $DB" 2>&1 | grep -v NOTICE
err=$(P -d "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/test/00_harness.sql" 2>&1 | grep -E '^psql.*ERROR')
[ -n "$err" ] && { echo "하니스 실패: $err"; exit 1; }
for f in "$ROOT"/supabase/migrations/00*.sql; do
  err=$(P -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E '^psql.*ERROR')
  [ -n "$err" ] && { echo "마이그레이션 실패 $(basename "$f"): $err"; exit 1; }
done
t=$(P -d "$DB" -qtAc "select count(*) from information_schema.tables where table_schema='public'")
a=$(P -d "$DB" -qtAc "select count(*) from information_schema.tables where table_schema='auth'")
echo "$DB 준비 완료 — public $t개 · auth $a개"
[ "$a" -ge 1 ] || exit 1
