import { execFileSync } from 'node:child_process'

//  0034 휴무일 — 격리 DB 에서 실제 서버로 확인합니다.
const DB = 'holq'
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

// ── 계정 준비 ─────────────────────────────────────────────────────────────
const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}', '${email}', '${role}', '${role}', true, now())
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('hol-admin@beonemirae.test', 'admin')
const OFFICE = mk('hol-office@beonemirae.test', 'office')
const FIELD = mk('hol-field@beonemirae.test', 'field')

ok(Number(psql(`select public.app_schema_version()`)) >= 34, 'DB 버전이 34 이상 (0034 가 적용됨)',
  psql(`select public.app_schema_version()`))
ok(psql(`select count(*) from information_schema.tables where table_schema='public' and table_name='holidays'`) === '1',
  'holidays 표가 있음')

// ── 1. 일괄 등록 ──────────────────────────────────────────────────────────
const r1 = JSON.parse(asRole(OFFICE, `select public.set_holidays('[
  {"day":"2026-01-01","name":"신정"},
  {"day":"2026-03-01","name":"삼일절"},
  {"day":"2026-08-15","name":"광복절"}
]'::jsonb)`))
ok(r1.added === 3 && r1.updated === 0, '사무실 담당자가 3일 등록', JSON.stringify(r1))
ok(psql(`select count(*) from public.holidays`) === '3', '표에 3줄')

// ── 2. 같은 날은 이름만 덮어씀 ────────────────────────────────────────────
const r2 = JSON.parse(asRole(OFFICE, `select public.set_holidays('[
  {"day":"2026-01-01","name":"신정(대체)"},
  {"day":"2026-05-05","name":"어린이날"}
]'::jsonb)`))
ok(r2.added === 1 && r2.updated === 1, '있던 날은 수정, 새 날은 추가', JSON.stringify(r2))
ok(psql(`select name from public.holidays where day='2026-01-01'`) === '신정(대체)', '이름이 바뀜')
ok(psql(`select count(*) from public.holidays`) === '4', '중복으로 늘어나지 않음')

// ── 3. 이름을 안 주면 「휴무」 ────────────────────────────────────────────
asRole(OFFICE, `select public.set_holidays('[{"day":"2026-06-06"}]'::jsonb)`)
ok(psql(`select name from public.holidays where day='2026-06-06'`) === '휴무', '이름이 없으면 「휴무」로')

// ── 4. 권한 ───────────────────────────────────────────────────────────────
const f = tryAs(FIELD, `select public.set_holidays('[{"day":"2026-09-09","name":"테스트"}]'::jsonb)`)
ok(!f.ok && /사무실 담당자와 관리자만/.test(f.out), '현장 담당자는 휴무일을 넣지 못함',
  f.out.split('\n')[0].slice(0, 60))
ok(psql(`select count(*) from public.holidays where day='2026-09-09'`) === '0', '막힌 뒤 자료가 남지 않음')

//  현장도 「오늘 쉬는 날인가」는 알아야 합니다 — 읽기는 열려 있습니다.
const readable = tryAs(FIELD, `select count(*) from public.holidays`)
ok(readable.ok && Number(readable.out.trim().split('\n').pop()) === 5, '현장 담당자도 휴무일을 볼 수는 있음',
  readable.out.trim().split('\n').pop())

// ── 5. 잘못된 값 ──────────────────────────────────────────────────────────
const bad = tryAs(OFFICE, `select public.set_holidays('[{"day":"2026-02-30","name":"없는날"}]'::jsonb)`)
ok(!bad.ok, '없는 날짜(2월 30일)는 거부', bad.out.split('\n')[0].slice(0, 60))
ok(psql(`select count(*) from public.holidays`) === '5', '거부된 뒤 표가 그대로')

const notArr = tryAs(OFFICE, `select public.set_holidays('{"day":"2026-01-01"}'::jsonb)`)
ok(!notArr.ok && /목록이 없습니다/.test(notArr.out), '목록이 아니면 거부')

//  한 번에 너무 많으면 실수입니다
const many = '[' + Array.from({ length: 401 }, (_, i) => `{"day":"2030-01-01","name":"x${i}"}`).join(',') + ']'
const over = tryAs(OFFICE, `select public.set_holidays('${many}'::jsonb)`)
ok(!over.ok && /400일까지/.test(over.out), '한 번에 400일까지만')

// ── 6. 삭제 ───────────────────────────────────────────────────────────────
const d = tryAs(FIELD, `select public.delete_holiday('2026-01-01'::date)`)
ok(!d.ok, '현장 담당자는 지우지 못함')
asRole(ADMIN, `select public.delete_holiday('2026-01-01'::date)`)
ok(psql(`select count(*) from public.holidays where day='2026-01-01'`) === '0', '관리자가 지움')
const gone = tryAs(ADMIN, `select public.delete_holiday('2026-01-01'::date)`)
ok(!gone.ok && /찾을 수 없습니다/.test(gone.out), '없는 날을 지우려 하면 알려 줌')

// ── 7. 감사기록 ───────────────────────────────────────────────────────────
ok(Number(psql(`select count(*) from public.audit_logs where action='holiday.set'`)) === 3,
  '등록이 감사기록에 남음 (3회)', psql(`select count(*) from public.audit_logs where action='holiday.set'`))
ok(Number(psql(`select count(*) from public.audit_logs where action='holiday.delete'`)) === 1,
  '삭제도 감사기록에 남음')
ok(/휴무일 삭제 — 2026-01-01/.test(psql(`select summary from public.audit_logs where action='holiday.delete'`)),
  '어느 날을 지웠는지 적음', psql(`select summary from public.audit_logs where action='holiday.delete'`))

// ── 8. 예정 일정은 서버가 막지 않습니다 ───────────────────────────────────
//  명절에도 가야 하는 병원이 있습니다. 편성 화면이 빼 주되, 서버는
//  사람이 일부러 만드는 것까지 막지 않습니다.
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]휴무병원','병원','',true,false) on conflict do nothing`)
const cid = psql(`select id from public.clients where name='[검증]휴무병원'`)
const future = psql(`select to_char((now() at time zone 'Asia/Seoul')::date + 30, 'YYYY-MM-DD')`)
asRole(OFFICE, `select public.set_holidays('[{"day":"${future}","name":"임시공휴일"}]'::jsonb)`)
const made = tryAs(OFFICE, `select public.create_planned_schedules('[
  {"clientId":"${cid}","date":"${future}","wasteType":"의료폐기물","expectedAmount":100,"basis":"검증"}
]'::jsonb)`)
ok(made.ok, '휴무일에도 사람이 일부러 만들면 서버는 허용 (화면이 빼 줍니다)',
  made.ok ? '' : made.out.split('\n')[0].slice(0, 60))

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
