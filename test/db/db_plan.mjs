import { execFileSync } from 'node:child_process'

//  0028 수거 일정 자동 편성을 실제 서버 함수로 검증합니다.
//   · 만들어지는 것은 「예정」이지 실적이 아니어야 합니다
//   · 이미 있는 날짜는 절대 덮어쓰지 않아야 합니다
//   · 지난 날짜·먼 미래·권한 없는 계정은 막혀야 합니다
//   · 되돌리기는 손대지 않은 예정만 지워야 합니다

const DB = 'planq'
const psql = (sql, db = DB) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', db, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

psql(`
  insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000ad','admin@t.test','{"role":"admin"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','{"role":"office"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','{"role":"field"}'::jsonb)
  on conflict (id) do nothing;
  insert into public.profiles (id, email, name, role, active, approved_at) values
    ('00000000-0000-0000-0000-0000000000ad','admin@t.test','대표','admin',true,now()),
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','사무실','office',true,now()),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','현장','field',true,now())
  --  auth.users 를 넣는 순간 프로필이 자동 생성됩니다(이름은 이메일 앞부분).
  --  검증에서 쓸 이름으로 덮어씁니다.
  on conflict (id) do update set name=excluded.name, role=excluded.role, active=true;
`)
const asRole = (uid, sql) => psql(`
  set role authenticated;
  set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
  ${sql}
`)
const ADMIN = '00000000-0000-0000-0000-0000000000ad'
const OFFICE = '00000000-0000-0000-0000-0000000000bf'
const FIELD = '00000000-0000-0000-0000-0000000000fd'

const cid = psql(`insert into public.clients (name, type, address) values ('[검증] 편성', '병원', '') returning id`)
const gone = psql(`insert into public.clients (name, type, address, active) values ('[검증] 해지', '병원', '', false) returning id`)

//  「오늘」은 함수와 같은 기준(한국 시각)으로 잡습니다.
const kst = (n) => psql(`select ((now() at time zone 'Asia/Seoul')::date + ${n})::text`)
const D = {}
for (const n of [-1, 0, 1, 2, 3, 7, 181]) D[n] = kst(n)

const row = (date, kg = 100, type = '의료폐기물') =>
  ({ clientId: cid, date, wasteType: type, expectedAmount: kg, basis: '최근 12주 화요일 11회' })
const call = (uid, rows) =>
  JSON.parse(asRole(uid, `select public.create_planned_schedules('${JSON.stringify(rows)}'::jsonb)`))

// ── 1. 기본 생성 ──────────────────────────────────────────────────────────
const r1 = call(OFFICE, [row(D[1], 120), row(D[2], 130), row(D[3], 140)])
ok(r1.inserted === 3 && r1.skipped === 0, '3건 편성 → 3건 생성', JSON.stringify(r1))
ok(r1.clients === 1 && r1.from === D[1] && r1.to === D[3], '요약에 거래처 수·기간이 그대로', JSON.stringify(r1))

const made = psql(`select count(*) from public.schedules where plan_batch='${r1.batch}'`)
ok(made === '3', '묶음 id 로 3건이 묶임', made)

// ── 2. 만들어진 것은 「예정」이지 실적이 아니어야 합니다 ────────────────────
const shape = psql(`select count(*) from public.schedules
  where plan_batch='${r1.batch}' and status='예정' and actual_amount is null
    and completed_at is null and origin='system' and is_additional=false`)
ok(shape === '3', '전부 예정 · 실제 수거량 없음 · origin=system', shape)
const kg = psql(`select expected_amount from public.schedules where plan_batch='${r1.batch}' and date='${D[1]}'`)
ok(kg === '120', '예상 수거량이 보낸 값 그대로', kg)
const memo = psql(`select memo from public.schedules where plan_batch='${r1.batch}' and date='${D[1]}'`)
ok(memo === '최근 12주 화요일 11회', '근거가 메모에 남음', memo)

// ── 3. 같은 날짜를 다시 넣어도 덮어쓰지 않습니다 ──────────────────────────
const r2 = call(OFFICE, [row(D[1], 999), row(D[7], 150)])
ok(r2.inserted === 1 && r2.skipped === 1, '이미 있는 날은 건너뛰고 새 날만 생성', JSON.stringify(r2))
ok(psql(`select expected_amount from public.schedules where client_id='${cid}' and date='${D[1]}'`) === '120',
  '기존 값이 999 로 덮이지 않음')

// ── 4. 이미 「완료」된 날짜도 손대지 않습니다 ──────────────────────────────
psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, actual_amount, completed_at, origin)
      values ('${D[0]}','${cid}','의료폐기물','완료',100,98, now(), 'field')`)
const r3 = call(OFFICE, [row(D[0], 500)])
ok(r3.inserted === 0 && r3.skipped === 1, '오늘 이미 수거한 건은 건너뜀', JSON.stringify(r3))
ok(psql(`select status from public.schedules where client_id='${cid}' and date='${D[0]}'`) === '완료',
  '완료 상태가 그대로')

// ── 5. 잘못된 입력 ────────────────────────────────────────────────────────
const bad = (uid, rows, name, re) => {
  let threw = false
  try { call(uid, rows) } catch (e) { threw = re ? re.test(String(e.stderr ?? e.message ?? e)) : true }
  ok(threw, name)
}
bad(OFFICE, [row(D[-1])], '지난 날짜 거부', /지난 날짜/)
bad(OFFICE, [row(D[181])], '반년 넘는 미래 거부', /너무 먼 날짜/)
bad(OFFICE, [{ ...row(D[1]), wasteType: '생활폐기물' }], '모르는 폐기물 구분 거부', /폐기물 구분/)
bad(OFFICE, [{ ...row(D[1]), clientId: gone }], '거래 종료한 거래처 거부', /거래 중이 아닌/)
bad(OFFICE, [], '빈 목록 거부', /만들 일정이 없습니다/)
bad(OFFICE, Array.from({ length: 501 }, (_, i) => row(kst(i + 1))), '501건 거부', /500건까지/)
{
  let threw = false
  try { asRole(OFFICE, `select public.create_planned_schedules('{"a":1}'::jsonb)`) }
  catch (e) { threw = /목록 형태가 아닙니다/.test(String(e.stderr ?? e.message ?? e)) }
  ok(threw, '목록이 아닌 값 거부')
}

// ── 6. 권한 ───────────────────────────────────────────────────────────────
bad(FIELD, [row(kst(10))], '현장 담당자는 편성할 수 없음', /사무실 담당자와 관리자만/)
ok(psql(`select count(*) from public.schedules where client_id='${cid}' and date='${kst(10)}'`) === '0',
  '거부된 편성은 한 건도 들어가지 않음 (한 트랜잭션)')

// ── 7. 500건 거부가 아무것도 남기지 않았는지 (원자성) ─────────────────────
ok(psql(`select count(*) from public.schedules where client_id='${cid}'`) === '5',
  '지금까지 남은 일정은 5건뿐 (편성 4 + 완료 1)',
  psql(`select count(*) from public.schedules where client_id='${cid}'`))

// ── 8. 되돌리기 ───────────────────────────────────────────────────────────
//  묶음 안의 한 건은 이미 수거를 다녀온 것으로 바꿉니다 — 그 건은 남아야 합니다.
psql(`update public.schedules set status='완료', actual_amount=110, completed_at=now()
       where plan_batch='${r1.batch}' and date='${D[2]}'`)
const u = JSON.parse(asRole(OFFICE, `select public.undo_schedule_batch('${r1.batch}'::uuid)`))
ok(u.deleted === 2 && u.kept === 1, '손대지 않은 예정 2건만 지우고 진행된 1건은 남김', JSON.stringify(u))
ok(psql(`select status from public.schedules where plan_batch='${r1.batch}'`) === '완료',
  '남은 1건은 완료 상태 그대로')

let undoBlocked = false
try { asRole(FIELD, `select public.undo_schedule_batch('${r2.batch}'::uuid)`) }
catch (e) { undoBlocked = /사무실 담당자와 관리자만/.test(String(e.stderr ?? e.message ?? e)) }
ok(undoBlocked, '현장 담당자는 되돌릴 수 없음')

const u2 = JSON.parse(asRole(ADMIN, `select public.undo_schedule_batch('${r2.batch}'::uuid)`))
ok(u2.deleted === 1 && u2.kept === 0, '관리자도 되돌릴 수 있음', JSON.stringify(u2))

// ── 9. 감사기록 ───────────────────────────────────────────────────────────
ok(Number(psql(`select count(*) from public.audit_logs where action='schedule.plan'`)) === 3,
  '편성 3회가 감사기록에 남음')
ok(Number(psql(`select count(*) from public.audit_logs where action='schedule.plan.undo'`)) === 2,
  '되돌리기 2회도 감사기록에 남음')
const sum = psql(`select summary from public.audit_logs where action='schedule.plan' order by at limit 1`)
ok(/3건 생성/.test(sum) && /거래처 1곳/.test(sum), '감사기록에 무엇을 만들었는지 그대로', sum.slice(0, 70))
const actor = psql(`select actor_name || '/' || actor_role from public.audit_logs where action='schedule.plan' order by at limit 1`)
ok(actor === '사무실/office', '누가 했는지 서버가 적음', actor)

// ── 10. 한국 시각 기준 「오늘」 ────────────────────────────────────────────
//  DB 시간대는 UTC 입니다. 한국 00~09시에는 UTC 가 아직 어제라, current_date
//  를 썼다면 한국 기준 오늘이 「지난 날짜」로 거부됩니다.
const r4 = call(OFFICE, [{ ...row(D[0]), wasteType: '일회용기저귀' }])
ok(r4.inserted === 1, '한국 기준 오늘 날짜로도 편성됨', JSON.stringify(r4))

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
