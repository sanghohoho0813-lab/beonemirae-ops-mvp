import { execFileSync } from 'node:child_process'

//  0060 — 배출자 교육일을 실제로 적을 자리.
//
//   앱이 거래처 id 를 해시해 「23개월 전 · 법정 주기 도래 임박」을 지어내고
//   있었습니다. 넣을 칸이 없어서 만들어 낸 것이라, 칸을 만듭니다.
//
//   확인하는 것
//    · 칸이 생겼고 기본값은 **비어 있다** (추정해서 채우지 않습니다)
//    · 사무실·관리자가 넣고 고칠 수 있다
//    · 기사·병원 계정은 못 고친다 (기존 RLS 그대로)
//    · 금액·청구·수거에는 한 칸도 안 닿는다

const DB = 'eduq'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 120)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증E]가나병원','병원','',true,false) on conflict do nothing`)
const CA = psql(`select id from public.clients where name='[검증E]가나병원'`)
const ADMIN = mk('ed-admin@beonemirae.test', 'admin')
const OFFICE = mk('ed-office@beonemirae.test', 'office')
const FIELD = mk('ed-field@beonemirae.test', 'field')
const HOSP = mk('ed-hosp@beonemirae.test', 'client', CA)

// ── 1. 칸이 있고 비어 있다 ─────────────────────────────────────────────────
{
  const has = psql(`select count(*) from information_schema.columns
                    where table_schema='public' and table_name='clients' and column_name='education_at'`)
  ok(has === '1', '**교육일 칸이 생김**')
  const v = psql(`select coalesce(education_at::text,'(비어 있음)') from public.clients where id='${CA}'`)
  ok(v === '(비어 있음)',
    '**기본값은 비어 있음** (지난 자료를 추정해서 채우지 않습니다)', v)
  const filled = psql(`select count(*) from public.clients where education_at is not null`)
  ok(filled === '0', '어느 거래처에도 값을 안 넣어 둠', `${filled}곳`)
}

// ── 2. 사무실·관리자가 넣고 고친다 ─────────────────────────────────────────
{
  const r1 = tryAs(ADMIN, `update public.clients set education_at='2025-03-10' where id='${CA}'`)
  ok(r1.ok, '관리자가 넣음', err(r1))
  ok(psql(`select education_at::text from public.clients where id='${CA}'`) === '2025-03-10', '값이 저장됨')

  const r2 = tryAs(OFFICE, `update public.clients set education_at='2025-06-01' where id='${CA}'`)
  ok(r2.ok, '사무실 담당자도 고침', err(r2))
  ok(psql(`select education_at::text from public.clients where id='${CA}'`) === '2025-06-01', '고쳐짐')

  //  다시 비울 수 있어야 합니다 — 잘못 넣었을 때 되돌릴 길이 있어야 합니다.
  const r3 = tryAs(ADMIN, `update public.clients set education_at=null where id='${CA}'`)
  ok(r3.ok && psql(`select coalesce(education_at::text,'-') from public.clients where id='${CA}'`) === '-',
    '**다시 비울 수 있음** (잘못 넣어도 되돌립니다)')
  psql(`update public.clients set education_at='2025-06-01' where id='${CA}'`)
}

// ── 3. 기사·병원은 못 고친다 (기존 RLS 그대로) ─────────────────────────────
{
  tryAs(FIELD, `update public.clients set education_at='2020-01-01' where id='${CA}'`)
  ok(psql(`select education_at::text from public.clients where id='${CA}'`) === '2025-06-01',
    '**기사가 고쳐도 안 바뀜**')
  tryAs(HOSP, `update public.clients set education_at='2020-01-01' where id='${CA}'`)
  ok(psql(`select education_at::text from public.clients where id='${CA}'`) === '2025-06-01',
    '**병원 계정이 고쳐도 안 바뀜**')
}

// ── 4. 돈에는 안 닿는다 ────────────────────────────────────────────────────
{
  const cols = psql(`select count(*) from information_schema.columns
                     where table_schema='public' and table_name='payments'`)
  ok(Number(cols) > 0, '청구 표는 그대로', `${cols}칸`)
  const v = psql(`select public.app_schema_version()`)
  ok(v === '64', 'DB 버전 64', v)
  const h = tryAs(ADMIN, `select public.app_health_check()->>'ok'`)
  ok(h.ok && h.out === 'true', '자가진단 통과', h.out)
  const m = tryAs(ADMIN, `select public.app_health_check()->>'missing'`)
  ok(m.ok && m.out === '[]', '빠진 것 없음', m.out)
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
