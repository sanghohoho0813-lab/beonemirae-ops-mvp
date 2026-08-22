import { execFileSync } from 'node:child_process'

//  0030 월 운영비를 실제 서버 함수로 검증합니다.
//   · 돈 기록입니다 — 현장 담당자에게는 아예 안 보여야 합니다
//   · 넣는 것은 관리자만, 사무실도 못 넣습니다
//   · 아직 오지 않은 달(예산)은 거부
//   · 같은 달·항목을 다시 넣으면 덮어쓰되 전후 금액이 감사기록에 남아야 합니다

const DB = 'pnlq'
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

//  한국 시각 기준 이번 달 / 지난달 / 다음 달
const THIS = psql(`select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM')`)
const PREV = psql(`select to_char(((now() at time zone 'Asia/Seoul')::date - interval '1 month'), 'YYYY-MM')`)
const NEXT = psql(`select to_char(((now() at time zone 'Asia/Seoul')::date + interval '1 month'), 'YYYY-MM')`)

const set = (uid, month, cat, amt, memo = '') =>
  JSON.parse(asRole(uid, `select public.set_operating_cost('${month}','${cat}',${amt},'${memo}')`))

// ── 1. 입력 ───────────────────────────────────────────────────────────────
const r1 = set(ADMIN, PREV, '인건비', 12000000, '기사 3 · 사무 1')
ok(r1.amount === 12000000 && r1.monthTotal === 12000000, '인건비 입력 · 그 달 합계', JSON.stringify(r1))
const r2 = set(ADMIN, PREV, '유류비', 2400000)
ok(r2.monthTotal === 14400000, '유류비를 더하면 합계가 늘어남', String(r2.monthTotal))
set(ADMIN, PREV, '차량 유지비', 1800000)
set(ADMIN, PREV, '임차료·수수료', 900000)
const r5 = set(ADMIN, PREV, '기타 운영비', 300000)
ok(r5.monthTotal === 17400000, '다섯 항목 합계 1,740만원', String(r5.monthTotal))
ok(Number(psql(`select count(*) from public.operating_costs where month='${PREV}'`)) === 5, '한 달에 5줄')

// ── 2. 같은 달·항목은 덮어쓰기 (줄이 늘지 않음) ───────────────────────────
const r6 = set(ADMIN, PREV, '유류비', 2600000, '경유 인상')
ok(r6.monthTotal === 17600000, '유류비를 고치면 합계가 따라 바뀜', String(r6.monthTotal))
ok(Number(psql(`select count(*) from public.operating_costs where month='${PREV}'`)) === 5, '줄은 그대로 5줄')
ok(psql(`select memo from public.operating_costs where month='${PREV}' and category='유류비'`) === '경유 인상',
  '메모도 함께 바뀜')

// ── 3. 잘못된 입력 ────────────────────────────────────────────────────────
const bad = (uid, sql, name, re) => {
  let threw = false
  try { asRole(uid, sql) } catch (e) { threw = re ? re.test(String(e.stderr ?? e.message ?? e)) : true }
  ok(threw, name)
}
bad(ADMIN, `select public.set_operating_cost('${NEXT}','인건비',100)`,
  '아직 오지 않은 달(예산) 거부', /아직 오지 않은 달/)
bad(ADMIN, `select public.set_operating_cost('${PREV}','인건비',-1)`, '음수 거부', /0원 이상/)
bad(ADMIN, `select public.set_operating_cost('2026-13','인건비',100)`, '없는 달 표기 거부', /월 표기가 올바르지/)
bad(ADMIN, `select public.set_operating_cost('${PREV}','접대비',100)`, '목록에 없는 항목 거부')
ok(Number(psql(`select count(*) from public.operating_costs`)) === 5, '거부된 입력은 한 줄도 남지 않음')

//  0원은 넣을 수 있어야 합니다 — 「그 달에는 이 항목이 없었다」를 적는 자리입니다.
const zero = set(ADMIN, THIS, '기타 운영비', 0, '없음')
ok(zero.amount === 0, '0원은 넣을 수 있음 (그 달에 안 썼다는 기록)', JSON.stringify(zero))

// ── 4. 권한 — 넣기 ────────────────────────────────────────────────────────
bad(OFFICE, `select public.set_operating_cost('${PREV}','인건비',1)`,
  '사무실도 운영비를 넣을 수 없음', /관리자만/)
bad(FIELD, `select public.set_operating_cost('${PREV}','인건비',1)`,
  '현장 담당자도 못 넣음', /관리자만/)
bad(OFFICE, `select public.delete_operating_cost('${PREV}','인건비')`,
  '사무실은 지울 수 없음', /관리자만/)

// ── 5. 권한 — 읽기 (돈 기록) ──────────────────────────────────────────────
ok(asRole(FIELD, `select count(*) from public.operating_costs`) === '0',
  '현장 담당자에게는 운영비가 아예 안 보임 (RLS)')
ok(asRole(OFFICE, `select count(*) from public.operating_costs`) === '6',
  '사무실은 볼 수 있음 (넣지는 못함)', asRole(OFFICE, `select count(*) from public.operating_costs`))
ok(asRole(ADMIN, `select count(*) from public.operating_costs`) === '6', '관리자는 볼 수 있음')

//  RLS 를 우회한 직접 INSERT 도 막혀야 합니다 (함수만 막으면 소용없습니다)
let directBlocked = false
try {
  asRole(OFFICE, `insert into public.operating_costs (month, category, amount) values ('${PREV}','인건비',1)`)
} catch { directBlocked = true }
ok(directBlocked, '사무실이 표에 직접 넣는 것도 RLS 가 막음')

// ── 6. 삭제 ───────────────────────────────────────────────────────────────
const d = JSON.parse(asRole(ADMIN, `select public.delete_operating_cost('${PREV}','기타 운영비')`))
ok(d.monthTotal === 17300000, '지우면 합계에서 빠짐', String(d.monthTotal))
bad(ADMIN, `select public.delete_operating_cost('${PREV}','기타 운영비')`,
  '없는 것을 또 지우면 거부', /찾을 수 없습니다/)

// ── 7. 감사기록 ───────────────────────────────────────────────────────────
ok(Number(psql(`select count(*) from public.audit_logs where action='cost.set'`)) === 7,
  '입력·수정 7회가 감사기록에 남음',
  psql(`select count(*) from public.audit_logs where action='cost.set'`))
ok(Number(psql(`select count(*) from public.audit_logs where action='cost.delete'`)) === 1,
  '삭제도 남음')
const edit = psql(`select summary from public.audit_logs
  where action='cost.set' and summary like '%수정%' order by at limit 1`)
ok(/이전 2,400,000원/.test(edit), '수정 기록에 이전 금액이 그대로', edit.slice(0, 80))
ok(/2,600,000원/.test(edit), '수정 기록에 바뀐 금액도')
const actor = psql(`select actor_name || '/' || actor_role from public.audit_logs
  where action='cost.set' order by at limit 1`)
ok(actor === '대표/admin', '누가 넣었는지 서버가 적음', actor)

// ── 8. 같은 달·항목은 한 줄만 (유일 제약) ─────────────────────────────────
let dup = false
try {
  psql(`insert into public.operating_costs (month, category, amount) values ('${PREV}','인건비',5)`)
} catch { dup = true }
ok(dup, '같은 달·같은 항목이 두 줄 생기지 않음 (유일 제약)')

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
