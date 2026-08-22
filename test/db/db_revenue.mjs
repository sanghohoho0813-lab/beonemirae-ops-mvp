import { execFileSync } from 'node:child_process'

//  0038 월 매출 직접입력·조정 — 격리 DB 에서 실제 서버로 확인합니다.
//
//   지키려는 것
//    · 사유 없이 넣지 못한다 (몇 달 뒤에 왜 이 금액인지 답할 수 있어야 함)
//    · 기존 값이 있으면 이전 값을 함께 돌려준다 (조용히 덮어쓰지 않음)
//    · 거래처 × 월 하나뿐 (중복 집계가 구조적으로 불가능)
//    · 표를 직접 고치지 못한다 — 함수로만
//    · 현장 담당자는 보지도 넣지도 못한다 (매출은 돈)
const DB = 'revq'
const run = (sql, role) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    role ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${role}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()

const psql = (sql) => run(sql)
const asRole = (uid, sql) => run(sql, uid)
const tryAs = (uid, sql) => {
  try {
    return { ok: true, out: asRole(uid, sql) }
  } catch (e) {
    return { ok: false, out: String(e.stderr ?? e.message) }
  }
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}', '${email}', '${role}', '${role}', true, now())
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('rev-admin@beonemirae.test', 'admin')
const OFFICE = mk('rev-office@beonemirae.test', 'office')
const FIELD = mk('rev-field@beonemirae.test', 'field')

ok(Number(psql(`select public.app_schema_version()`)) >= 38, 'DB 버전이 38 이상 (0038 이 적용됨)',
  psql(`select public.app_schema_version()`))
ok(psql(`select count(*) from information_schema.tables where table_schema='public' and table_name='revenue_overrides'`) === '1',
  'revenue_overrides 표가 있음')

psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]매출병원','병원','',true,false) on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[검증]매출병원'`)

// ── 1. 사유 없이 넣지 못한다 ──────────────────────────────────────────────
const noReason = tryAs(OFFICE, `select public.set_revenue_override('${CID}'::uuid, '2026-07', 1200000, '')`)
ok(!noReason.ok && /사유를 적어 주세요/.test(noReason.out), '사유가 비면 거부',
  noReason.out.split('\n')[0].slice(0, 70))
const blank = tryAs(OFFICE, `select public.set_revenue_override('${CID}'::uuid, '2026-07', 1200000, '   ')`)
ok(!blank.ok, '공백만 있는 사유도 거부')
ok(psql(`select count(*) from public.revenue_overrides`) === '0', '거부된 뒤 아무것도 안 남음')

// ── 2. 잘못된 값 ──────────────────────────────────────────────────────────
const badMonth = tryAs(OFFICE, `select public.set_revenue_override('${CID}'::uuid, '2026-13', 100, '테스트')`)
ok(!badMonth.ok && /대상월이 올바르지 않습니다/.test(badMonth.out), '없는 달(13월)은 거부')
const badMonth2 = tryAs(OFFICE, `select public.set_revenue_override('${CID}'::uuid, '202607', 100, '테스트')`)
ok(!badMonth2.ok, '형식이 다른 달(202607)도 거부')
const neg = tryAs(OFFICE, `select public.set_revenue_override('${CID}'::uuid, '2026-07', -1, '테스트')`)
ok(!neg.ok && /0원 이상/.test(neg.out), '음수 금액은 거부')
const noClient = tryAs(OFFICE, `select public.set_revenue_override(gen_random_uuid(), '2026-07', 100, '테스트')`)
ok(!noClient.ok && /거래처를 찾을 수 없습니다/.test(noClient.out), '없는 거래처는 거부')

// ── 3. 처음 넣기 ──────────────────────────────────────────────────────────
const r1 = JSON.parse(asRole(OFFICE,
  `select public.set_revenue_override('${CID}'::uuid, '2026-07', 1200000, '계약서상 월정액 · 기록 누락분')`))
ok(r1.created === true && r1.before === null, '처음 넣으면 created=true · 이전 값 없음', JSON.stringify(r1))
ok(psql(`select amount from public.revenue_overrides where client_id='${CID}' and month='2026-07'`) === '1200000',
  '1,200,000원이 그대로 저장')

//  0원도 넣을 수 있어야 합니다 — 「이 달은 매출이 없다」를 사람이 확인한 것
const zero = tryAs(OFFICE, `select public.set_revenue_override('${CID}'::uuid, '2026-06', 0, '계약 시작 전')`)
ok(zero.ok, '0원도 넣을 수 있음 — 「이 달은 없다」는 것도 사람의 확인입니다')

// ── 4. 조용히 덮어쓰지 않는다 ─────────────────────────────────────────────
const r2 = JSON.parse(asRole(OFFICE,
  `select public.set_revenue_override('${CID}'::uuid, '2026-07', 1500000, '계약서 재확인 — 인상분 반영')`))
ok(r2.created === false && Number(r2.before) === 1200000,
  '고치면 created=false 이고 이전 값을 함께 돌려줌', JSON.stringify(r2))
ok(psql(`select amount from public.revenue_overrides where client_id='${CID}' and month='2026-07'`) === '1500000',
  '새 값으로 바뀜')
ok(psql(`select count(*) from public.revenue_overrides where client_id='${CID}' and month='2026-07'`) === '1',
  '거래처 × 월 하나뿐 — 줄이 늘어나지 않음 (중복 집계 불가)')

// ── 5. 감사기록 ───────────────────────────────────────────────────────────
ok(Number(psql(`select count(*) from public.audit_logs where action='revenue.override'`)) === 3,
  '넣기·0원·조정이 모두 감사기록에 남음 (3회)',
  psql(`select count(*) from public.audit_logs where action='revenue.override'`))
const sum = psql(`select summary from public.audit_logs where action='revenue.override'
                  order by at desc limit 1`)
ok(/매출 조정/.test(sum) && /1,500,000원/.test(sum) && /이전 1,200,000원/.test(sum) && /계약서 재확인/.test(sum),
  '무엇이 얼마에서 얼마로 왜 바뀌었는지 적음', sum.slice(0, 100))
const before = psql(`select before_data->>'amount' from public.audit_logs
                     where action='revenue.override' order by at desc limit 1`)
ok(before === '1200000', '변경 전 금액이 기록에 남음', before)

// ── 6. 표를 직접 고치지 못한다 ────────────────────────────────────────────
const ins = tryAs(OFFICE, `insert into public.revenue_overrides (client_id, month, amount, reason)
                           values ('${CID}', '2026-05', 999, '직접')`)
ok(!ins.ok, '표에 직접 넣지 못함 — 사유·감사기록이 함께 움직여야 합니다',
  ins.out.split('\n')[0].slice(0, 60))
const upd = tryAs(OFFICE, `update public.revenue_overrides set amount = 999 where client_id='${CID}'`)
ok(!upd.ok, '표에서 직접 고치지 못함')
const del = tryAs(OFFICE, `delete from public.revenue_overrides where client_id='${CID}'`)
ok(!del.ok, '표에서 직접 지우지 못함')
ok(psql(`select count(*) from public.revenue_overrides`) === '2', '막힌 뒤 자료가 그대로')

//  읽기는 사무실·관리자에게 열려 있습니다
const read = tryAs(OFFICE, `select count(*) from public.revenue_overrides`)
ok(read.ok, '사무실 담당자는 읽을 수 있음')

// ── 7. 현장 담당자 ────────────────────────────────────────────────────────
const fWrite = tryAs(FIELD, `select public.set_revenue_override('${CID}'::uuid, '2026-04', 100, '테스트')`)
ok(!fWrite.ok && /사무실 담당자와 관리자만/.test(fWrite.out), '현장 담당자는 매출을 넣지 못함',
  fWrite.out.split('\n')[0].slice(0, 60))
const fRead = tryAs(FIELD, `select count(*) from public.revenue_overrides`)
ok(fRead.ok && fRead.out.trim().split('\n').pop() === '0',
  '현장 담당자에게는 매출 조정이 한 줄도 안 보임 (RLS)', fRead.out.trim().split('\n').pop())

// ── 8. 되돌리기 ───────────────────────────────────────────────────────────
const fDel = tryAs(FIELD, `select public.delete_revenue_override('${CID}'::uuid, '2026-07')`)
ok(!fDel.ok, '현장 담당자는 되돌리지도 못함')
const undo = tryAs(ADMIN, `select public.delete_revenue_override('${CID}'::uuid, '2026-07')`)
ok(undo.ok, '관리자가 되돌림', undo.ok ? '' : undo.out.split('\n')[0].slice(0, 60))
ok(psql(`select count(*) from public.revenue_overrides where client_id='${CID}' and month='2026-07'`) === '0',
  '되돌리면 그 달 조정이 사라짐 — 다시 확정 → Excel → 추정 순서로')
ok(Number(psql(`select count(*) from public.audit_logs where action='revenue.override.delete'`)) === 1,
  '되돌린 것도 감사기록에 남음')
const gone = tryAs(ADMIN, `select public.delete_revenue_override('${CID}'::uuid, '2026-07')`)
ok(!gone.ok && /찾을 수 없습니다/.test(gone.out), '없는 조정을 되돌리려 하면 알려 줌')

// ── 9. 거래처를 지우면 조정도 함께 (고아 없음) ────────────────────────────
//  거래처는 실제로는 「거래 종료」로 두지만, 정말 지울 때 조정이 남으면
//  주인 없는 매출이 됩니다.
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]지울병원','병원','',true,false) on conflict do nothing`)
const C2 = psql(`select id from public.clients where name='[검증]지울병원'`)
asRole(OFFICE, `select public.set_revenue_override('${C2}'::uuid, '2026-03', 500000, '테스트')`)
psql(`delete from public.clients where id='${C2}'`)
ok(psql(`select count(*) from public.revenue_overrides where client_id='${C2}'`) === '0',
  '거래처를 지우면 조정도 함께 정리됨 (주인 없는 매출이 안 남음)')

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
