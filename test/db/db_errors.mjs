import { execFileSync } from 'node:child_process'

//  0046 — 오류를 남깁니다.
//
//   지금까지 저장이 실패하면 빨간 띠가 잠깐 떴다가 사라졌습니다. 그것으로 끝.
//   「어제 저장이 안 됐다」에 답할 자료가 아무 데도 없었습니다. 기사님 폰에서만
//   나는 문제는 사무실에서 영영 안 보였습니다.
//
//   확인하는 것
//    · 누구든 남길 수 있는가 (기사님 폰에서 난 오류가 가장 안 보입니다)
//    · **기록이 실패해도 일을 키우지 않는가** — 여기서 예외를 올리면 사용자가
//      보던 진짜 오류가 「기록 실패」로 바뀌어 원인이 가려집니다
//    · 표에 직접 쓰는 길이 닫혔는가 · 관리자만 읽는가
//    · 같은 것끼리 묶어서 몇 번인지 세는가
//    · 스택이 통째로 들어와도 표가 무거워지지 않는가 (길이 자르기)
const DB = 'errq'
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    uid ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 80)

const mk = (email, role, name) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${name}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('err-admin@beonemirae.test', 'admin', '대표')
const OFFICE = mk('err-office@beonemirae.test', 'office', '김사무')
const FIELD = mk('err-field@beonemirae.test', 'field', '박기사')

const rec = (uid, kind, screen, action, message, detail = '{}') =>
  tryAs(uid, `select public.record_app_error('${kind}','${screen}','${action}','${message}','${detail}'::jsonb)`)
const rows = () => Number(psql(`select count(*) from public.app_errors`))

// ── 0. 판과 표 ────────────────────────────────────────────────────────────
ok(Number(psql(`select public.app_schema_version()`)) === 64, 'DB 판이 64', psql(`select public.app_schema_version()`))
ok(psql(`select count(*) from information_schema.tables
         where table_schema='public' and table_name='app_errors'`) === '1', '오류 기록 표가 생김')
ok(psql(`select relrowsecurity from pg_class where relname='app_errors'`) === 't', 'RLS 가 켜져 있음')

// ── 1. 누구든 남길 수 있습니다 ────────────────────────────────────────────
//   기사님 폰에서 난 오류가 가장 안 보이는 오류입니다.
for (const [label, uid] of [['관리자', ADMIN], ['사무실 담당자', OFFICE], ['기사님', FIELD]]) {
  const r = rec(uid, 'save', '/collection', '수거 입력', `${label} 저장 실패`)
  ok(r.ok && r.out === 't', `${label}도 오류를 남길 수 있음`, r.ok ? r.out : err(r))
}
ok(rows() === 3, '세 건이 남음', `${rows()}건`)

// ── 2. 누가·언제·어디서·무엇을 하다가 ────────────────────────────────────
{
  const [name, role, kind, screen, action] = psql(
    `select user_name, user_role, kind, screen, action from public.app_errors
      where message='기사님 저장 실패'`).split('|')
  ok(name === '박기사', '누가 겪었는지 남음', name)
  ok(role === 'field', '어떤 역할인지도', role)
  ok(kind === 'save' && screen === '/collection' && action === '수거 입력',
    '어느 화면에서 무엇을 하다가 났는지 남음', `${kind} · ${screen} · ${action}`)
  ok(psql(`select at is not null from public.app_errors where message='기사님 저장 실패'`) === 't', '언제 났는지도')
}

// ── 3. 기록이 일을 키우지 않습니다 ────────────────────────────────────────
//   여기가 이 판의 핵심입니다. 이 함수는 **이미 오류가 난 자리**에서 불립니다.
//   여기서 또 던지면 사용자가 보던 진짜 오류가 「기록 실패」로 바뀝니다.
{
  const bad = rec(ADMIN, '엉뚱한종류', '/x', 'y', 'z')
  ok(bad.ok, '모르는 종류가 와도 예외를 올리지 않음', bad.ok ? '' : err(bad))
  ok(bad.out === 'f', '대신 「못 남겼다」고 정직하게 돌려줌 — 남긴 척하지 않음', bad.out)
  ok(rows() === 3, '못 남긴 것은 실제로 안 들어감', `${rows()}건`)

  //  로그인하지 않은 상태 (auth.uid() 가 없음)
  const anon = tryAs(null, `select public.record_app_error('save','/x','y','z')`)
  ok(anon.ok, '로그인 안 된 상태에서도 예외를 올리지 않음', anon.ok ? '' : err(anon))
  ok(anon.out === 'f', '그때도 「못 남겼다」', anon.out)
}

// ── 4. 표에 직접 쓰는 길이 닫혀 있습니다 ──────────────────────────────────
{
  const r = tryAs(OFFICE, `insert into public.app_errors (kind, message) values ('save','몰래')`)
  ok(!r.ok && /permission denied|권한/.test(r.out), '표에 직접 못 씀', err(r))
  const u = tryAs(ADMIN, `update public.app_errors set message='고침' where message='기사님 저장 실패'`)
  ok(!u.ok, '관리자도 기록을 고칠 수 없음 (남은 것은 남은 것)', err(u))
  const d = tryAs(ADMIN, `delete from public.app_errors`)
  ok(!d.ok, '지울 수도 없음', err(d))
  ok(rows() === 3, '건드린 뒤에도 그대로', `${rows()}건`)
}

// ── 5. 관리자만 읽습니다 ──────────────────────────────────────────────────
//   오류 문구에는 거래처 이름·금액이 섞여 들어갈 수 있습니다.
{
  ok(tryAs(ADMIN, `select count(*) from public.app_errors`).out === '3', '관리자는 다 봄')
  ok(tryAs(OFFICE, `select count(*) from public.app_errors`).out === '0', '사무실 담당자에게는 안 보임')
  ok(tryAs(FIELD, `select count(*) from public.app_errors`).out === '0', '기사님에게도 안 보임')
  const r = tryAs(OFFICE, `select public.recent_app_errors(7)`)
  ok(!r.ok && /관리자만/.test(r.out), '모아 보기도 관리자만', err(r))
}

// ── 6. 같은 것끼리 묶어서 셉니다 ──────────────────────────────────────────
//   한 건씩 보면 「많다」는 것만 압니다. 같은 화면에서 같은 문구가 몇 번,
//   누구에게 났는지가 원인을 좁혀 줍니다.
{
  for (let i = 0; i < 4; i += 1) rec(OFFICE, 'save', '/receipts', '입금 기록', '네트워크에 연결할 수 없습니다.')
  rec(FIELD, 'save', '/receipts', '입금 기록', '네트워크에 연결할 수 없습니다.')
  const g = JSON.parse(run(`select public.recent_app_errors(7)`, ADMIN))
  ok(g.total === 8, '지난 7일 전체 건수를 셈', String(g.total))
  const hit = (g.groups ?? []).find((x) => x.message === '네트워크에 연결할 수 없습니다.')
  ok(!!hit, '같은 문구를 한 줄로 묶음')
  ok(hit?.times === 5, '몇 번인지 셈 (4 + 1)', String(hit?.times))
  ok(/김사무/.test(hit?.who ?? '') && /박기사/.test(hit?.who ?? ''),
    '누구에게 났는지 다 적음 — 한 사람만이면 그 사람 환경 문제입니다', hit?.who ?? '')
  ok(hit?.screen === '/receipts' && hit?.action === '입금 기록', '어느 화면·무슨 동작인지 그대로')
  ok(typeof hit?.last_at === 'string', '마지막으로 난 시각도')

  //  기간 밖은 안 셉니다
  psql(`update public.app_errors set at = now() - interval '40 days' where message='네트워크에 연결할 수 없습니다.'`)
  const g2 = JSON.parse(run(`select public.recent_app_errors(7)`, ADMIN))
  ok(g2.total === 3, '7일 밖으로 나간 건은 안 셈', String(g2.total))
  const g3 = JSON.parse(run(`select public.recent_app_errors(90)`, ADMIN))
  ok(g3.total === 8, '90일로 넓히면 다시 보임', String(g3.total))
  //  터무니없는 기간은 잘라 냅니다
  ok(JSON.parse(run(`select public.recent_app_errors(99999)`, ADMIN)).days === 90, '기간은 90일까지만')
  ok(JSON.parse(run(`select public.recent_app_errors(0)`, ADMIN)).days === 1, '0일을 넣어도 최소 1일')
}

// ── 7. 스택이 통째로 와도 표가 무거워지지 않습니다 ───────────────────────
{
  const long = 'ㄱ'.repeat(9000)
  const r = rec(ADMIN, 'render', '/x'.repeat(300), 'y'.repeat(300), long)
  ok(r.ok && r.out === 't', '긴 문구도 받아 줌', r.out)
  const [m, s, a] = psql(`select length(message), length(screen), length(action)
                          from public.app_errors order by id desc limit 1`).split('|')
  ok(Number(m) === 2000, '문구는 2,000자에서 자름', m)
  ok(Number(s) === 200 && Number(a) === 200, '화면·동작은 200자에서 자름', `${s} · ${a}`)
}

// ── 8. 자가진단이 새것을 실제로 세는가 (이빨) ────────────────────────────
const check = () => JSON.parse(run(`select public.app_health_check()`, ADMIN))
{
  const h = check()
  ok(h.ok === true && h.version === 64, '0047 을 올린 DB 는 「이상 없음」',
    h.ok ? `판 ${h.version}` : JSON.stringify(h.missing).slice(0, 90))
}
const gone = (label, breakSql, fixSql, expect) => {
  psql(breakSql)
  const h = check()
  const hit = (h.missing ?? []).some((m) => m.includes(expect))
  ok(h.ok === false && hit, `${label} → 이름을 대고 알려 줌`,
    hit ? (h.missing.find((m) => m.includes(expect)) ?? '') : JSON.stringify(h.missing).slice(0, 90))
  psql(fixSql)
  ok(check().ok === true, `${label} → 되돌리면 다시 「이상 없음」`)
}
gone('남기는 함수가 사라지면',
  `drop function public.record_app_error(text, text, text, text, jsonb)`,
  `create function public.record_app_error(text, text, text, text, jsonb) returns boolean language sql as $x$ select false $x$`,
  '함수 record_app_error')
gone('오류 표를 직접 쓸 수 있게 열리면',
  `grant insert on public.app_errors to authenticated`,
  `revoke insert on public.app_errors from authenticated`,
  'app_errors 직접 쓰기가 열려 있음')
gone('오류 표의 RLS 가 꺼지면',
  `alter table public.app_errors disable row level security`,
  `alter table public.app_errors enable row level security`,
  'RLS app_errors')

const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
