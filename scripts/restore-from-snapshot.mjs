#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// 전체 스냅샷(.json) → 복구 SQL
//
//   node scripts/restore-from-snapshot.mjs 비원미래-전체스냅샷-20260815-09.json > restore.sql
//
//  스냅샷 파일을 읽어 **SQL 텍스트**를 만듭니다. DB 에 직접 쓰지 않습니다.
//  일부러 그렇게 했습니다 — 복구는 되돌릴 수 없는 작업이라, 넣기 전에 사람이
//  파일을 열어 보고 psql 로 실행하는 편이 안전합니다.
//
//  ── 어떻게 넣는가 ──────────────────────────────────────────────────────
//
//   값을 하나씩 SQL 리터럴로 바꾸지 않습니다. 그렇게 하면 배열 칸(uuid[]),
//   enum 칸, 날짜 칸을 이 스크립트가 알아서 판단해야 하는데, 그건 DB 가
//   이미 알고 있는 것을 다시 추측하는 일입니다. 추측은 틀립니다.
//
//   그래서 줄을 json 그대로 넘기고 **DB 가 자기 표의 칸 모양대로 채우게**
//   합니다(jsonb_populate_record). 칸이 늘거나 모양이 바뀌어도 이 스크립트는
//   고칠 게 없습니다.
//
//  ── 하는 일 ───────────────────────────────────────────────────────────
//   1. 스냅샷이 적어 둔 순서(order)대로 표를 놓습니다 — 외래키 순서입니다.
//   2. 스냅샷이 적어 둔 칸(nullify)을 뺍니다 — 전부 계정을 가리키는 칸이고,
//      계정은 스냅샷에 없습니다. 그냥 넣으면 복구가 통째로 실패합니다.
//   3. 번호를 스스로 매기는 칸(감사기록의 id 같은 것)은 넣은 뒤 다음 번호를
//      맞춰 둡니다. 이걸 안 하면 복구 직후 첫 기록에서 「번호가 겹친다」며
//      막힙니다 — 실제로 복구 연습에서 이 문제를 만났습니다.
//
//  판단은 하지 않습니다. 값을 고치거나 추측해서 채우지 않습니다.
//  못 넣는 줄이 있으면 SQL 이 그 자리에서 멈추고, 한 트랜잭션이라 전부
//  되돌아갑니다 — 반쯤 복구된 DB 가 가장 위험합니다.
//
//  절차 전체는 docs/RESTORE.md 를 보세요.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('사용법: node scripts/restore-from-snapshot.mjs <스냅샷.json> [> restore.sql]')
  process.exit(2)
}

const snap = JSON.parse(readFileSync(path, 'utf8'))
if (snap.app !== 'beonemirae-ops' || snap.kind !== 'full-snapshot') {
  console.error('이 파일은 비원미래 전체 스냅샷이 아닙니다.')
  process.exit(2)
}
if (snap.format !== 1) {
  console.error(`모르는 파일 형식(format=${snap.format})입니다. 이 스크립트는 1판만 읽습니다.`)
  process.exit(2)
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const ident = (s) => {
  //  표·칸 이름은 스냅샷에서 옵니다. 이상한 이름이 오면 만들지 않고 멈춥니다.
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`쓸 수 없는 이름입니다: ${s}`)
  return s
}

/** 한 번에 넣는 줄 수 — 너무 크면 psql 이 한 문장을 통째로 들고 있어야 합니다 */
const BATCH = 500

const out = []
const note = (s) => out.push(`-- ${s}`)

note('비원미래 운영 시스템 — 전체 스냅샷 복구')
note(`스냅샷 만든 시각 : ${snap.takenAt}`)
note(`만든 사람        : ${snap.takenBy || '(이름 없음)'}`)
note(`스키마 판        : ${snap.schemaVersion ?? '(모름)'}`)
note('')
note('먼저 supabase/migrations/*.sql 을 순서대로 실행해 빈 스키마를 만든 뒤 이 파일을 실행하세요.')
note('한 트랜잭션입니다 — 한 줄이라도 들어가지 않으면 전부 되돌아갑니다.')
if ((snap.unreadable ?? []).length > 0) {
  note('')
  note('!! 스냅샷을 만들 때 읽지 못한 표가 있었습니다. 이 표는 복구되지 않습니다:')
  for (const u of snap.unreadable) note(`   - ${u.name}: ${u.reason}`)
}
note('')
note('담기지 않은 표(복구되지 않음):')
for (const x of snap.excluded ?? []) note(`   - ${x.name} (${x.label}) — ${x.why}`)
out.push('')
out.push('begin;')
out.push('')
//  트리거·외래키 검사를 잠시 멈춥니다.
//
//   멈추지 않으면 두 가지가 어긋납니다.
//    · 「청구는 지울 수 없다」 잠금(0037)이 대상 비우기를 막습니다.
//    · 넣을 때 도는 트리거가 「누가 넣었는지」와 시각을 지금 값으로 덮어씁니다.
//      복구인데 기록이 오늘 날짜로 바뀌면 그건 복구가 아닙니다.
//
//   트랜잭션이 끝나면 자동으로 되돌아갑니다(set local).
out.push("-- 넣는 동안만 트리거를 멈춥니다 (복구가 기록을 덮어쓰지 않게)")
out.push('set local session_replication_role = replica;')
out.push('')
//  대상 비우기.
//
//   마이그레이션만 돌린 빈 DB 에도 이미 줄이 있는 표가 있습니다(사무실 재고,
//   AX 설정처럼 처음부터 한 줄 있는 표). 그대로 넣으면 「번호가 겹친다」며
//   복구가 통째로 멈춥니다. 그래서 넣기 전에 비웁니다.
//
//   ** 이 SQL 은 대상 DB 의 운영 표를 먼저 비웁니다. 되살릴 DB 에만 쓰세요. **
out.push('-- ── 대상 비우기 — 이 SQL 은 아래 표를 먼저 비웁니다. 되살릴 DB 에만 실행하세요 ──')
for (const name of [...snap.order].reverse()) out.push(`delete from public.${ident(name)};`)
out.push('')

let total = 0
const summary = []
for (const name of snap.order) {
  const t = ident(name)
  const rows = snap.tables[name] ?? []
  const drop = (snap.nullify?.[name] ?? []).map((c) => ` - ${q(ident(c))}`).join('')
  summary.push([t, rows.length])
  out.push(`-- ── ${t} : ${rows.length}줄 ──`)
  if (rows.length === 0) {
    out.push('')
    continue
  }
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    out.push(
      `insert into public.${t} select (jsonb_populate_record(null::public.${t}, e${drop})).*` +
        `\n  from jsonb_array_elements(${q(JSON.stringify(chunk))}::jsonb) e;`,
    )
    total += chunk.length
  }
  out.push('')
}

//  스스로 번호를 매기는 칸(감사기록의 id 같은 것)의 다음 번호를 맞춥니다.
//
//   이걸 빠뜨리면 복구는 성공한 것처럼 보이는데, 그 다음 감사기록 한 줄에서
//   「번호가 겹친다」며 막힙니다. 실제 복구 연습에서 이 문제를 만났습니다.
//   번호 칸이 없는 표에서는 아무 일도 하지 않습니다.
out.push('-- ── 자동 번호 맞추기 ──')
out.push(`do $restore$
declare
  t text;
  c record;
  mx bigint;
begin
  foreach t in array array[${snap.order.map((n) => q(ident(n))).join(', ')}]
  loop
    for c in
      select a.attname as col, pg_get_serial_sequence('public.' || t, a.attname) as seq
        from pg_attribute a
       where a.attrelid = ('public.' || quote_ident(t))::regclass
         and a.attnum > 0 and not a.attisdropped
         and pg_get_serial_sequence('public.' || t, a.attname) is not null
    loop
      execute format('select max(%I) from public.%I', c.col, t) into mx;
      if mx is not null then
        perform setval(c.seq, mx);
        raise notice '자동 번호 맞춤: %.% → %', t, c.col, mx;
      end if;
    end loop;
  end loop;
end
$restore$;`)
out.push('')

out.push('commit;')
out.push('')
note('넣는 줄 수')
for (const [name, n] of summary) note(`   ${name.padEnd(26)} ${String(n).padStart(7)}`)
note(`   ${'합계'.padEnd(25)} ${String(total).padStart(7)}`)

process.stdout.write(out.join('\n') + '\n')
process.stderr.write(`표 ${summary.length}개 · ${total}줄 분량의 복구 SQL 을 만들었습니다.\n`)
