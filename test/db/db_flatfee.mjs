import { execFileSync } from 'node:child_process'

//  0044 — 월정액 정책을 「정했는지」 기록.
//
//   0042 부터 수거 0건인 달도 월정액으로 확정할 수 있습니다. 단 거래처에
//   `flat_fee_when_empty` 가 켜져 있어야 합니다. 그런데 그 값이 `false` 인 것이
//   ① 사람이 「배출 없으면 청구 안 함」으로 정한 것인지 ② 아무도 아직 안 정한
//   것인지 구분이 안 됐습니다. 구분이 안 되면 화면이 아무 말도 못 합니다.
//
//   여기서 확인하는 것
//    · 「아니오」도 **정한 것으로** 남는가 (안 남으면 매달 다시 묻게 됩니다)
//    · 값을 시스템이 짐작하지 않는가 (새 거래처는 「아직 안 정함」)
//    · 사무실·관리자만 정할 수 있는가
//    · 누가 언제 무엇에서 무엇으로 바꿨는지 남는가
//    · 이미 켜 둔 곳은 백필로 「정한 것」이 되고, 끈 곳은 안 건드리는가
//    · 자가진단이 새 칸·새 함수를 실제로 세는가 (없애 보고 이름을 대는지)
const DB = 'fpolq'
const run = (sql, role) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    role ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${role}","role":"authenticated"}'; ${sql}` : sql],
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 60)

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('fpol-admin@beonemirae.test', 'admin')
const OFFICE = mk('fpol-office@beonemirae.test', 'office')
const FIELD = mk('fpol-field@beonemirae.test', 'field')

const client = (name) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',true,false)`)
  return psql(`select id from public.clients where name='${name}'`)
}
const row = (id) => {
  const [w, at] = psql(`select flat_fee_when_empty, coalesce(flat_fee_policy_at::text,'') from public.clients where id='${id}'`).split('|')
  return { when: w === 't', at }
}

// ── 0. 판과 칸 ────────────────────────────────────────────────────────────
ok(Number(psql(`select public.app_schema_version()`)) === 64, 'DB 판이 64', psql(`select public.app_schema_version()`))
ok(psql(`select count(*) from information_schema.columns
         where table_schema='public' and table_name='clients' and column_name='flat_fee_policy_at'`) === '1',
  '「정한 시각」 칸이 생김')

// ── 1. 시스템은 짐작하지 않는다 ───────────────────────────────────────────
const A = client('[검증]안정한곳')
{
  const r = row(A)
  ok(r.when === false, '새 거래처는 배출 없는 달 청구가 꺼짐')
  ok(r.at === '', '새 거래처는 「아직 안 정함」 — 시스템이 대신 정하지 않음', r.at || '(비어 있음)')
}

// ── 2. 「예」로 정하기 ─────────────────────────────────────────────────────
const B = client('[검증]예로정함')
{
  const r = tryAs(OFFICE, `select public.set_flat_fee_policy('${B}', true)`)
  ok(r.ok, '사무실 담당자가 정할 수 있음', r.ok ? '' : err(r))
  const v = row(B)
  ok(v.when === true, '「예」가 저장됨')
  ok(v.at !== '', '정한 시각이 남음', v.at.slice(0, 19))
  ok(psql(`select count(*) from public.audit_logs where action='client.flat_fee_policy' and client_id='${B}'`) === '1',
    '기록이 한 줄 남음')
  const a = psql(`select before_data->>'flatFeeWhenEmpty', after_data->>'flatFeeWhenEmpty', summary
                  from public.audit_logs where action='client.flat_fee_policy' and client_id='${B}'`).split('|')
  ok(a[0] === 'false' && a[1] === 'true', '무엇에서 무엇으로 바뀌었는지 남음', `${a[0]} → ${a[1]}`)
  ok(/배출 없는 달에도 청구: 예/.test(a[2]), '요약이 사람 말로 남음', (a[2] ?? '').slice(0, 40))
}

// ── 3. 「아니오」도 정한 것이다 ───────────────────────────────────────────
//   여기가 이 판의 핵심입니다. 「아니오」가 안 남으면 이미 확인한 거래처를
//   매달 다시 묻게 되고, 화면의 알림은 곧 아무도 안 보는 것이 됩니다.
const C = client('[검증]아니오로정함')
{
  const r = tryAs(ADMIN, `select public.set_flat_fee_policy('${C}', false)`)
  ok(r.ok, '「아니오」도 정할 수 있음', r.ok ? '' : err(r))
  const v = row(C)
  ok(v.when === false, '「아니오」가 저장됨')
  ok(v.at !== '', '「아니오」도 정한 것으로 남음 — 다시 묻지 않음', v.at.slice(0, 19))
}

// ── 4. 정한 것을 되돌릴 수 있다 (시각도 갱신) ────────────────────────────
{
  const before = row(B).at
  psql(`select pg_sleep(0.05)`)
  const r = tryAs(ADMIN, `select public.set_flat_fee_policy('${B}', false)`)
  ok(r.ok, '정한 것을 바꿀 수 있음', r.ok ? '' : err(r))
  const v = row(B)
  ok(v.when === false && v.at !== before, '바꾸면 시각도 새로 남음')
  ok(psql(`select count(*) from public.audit_logs where action='client.flat_fee_policy' and client_id='${B}'`) === '2',
    '기록이 두 줄 (덮어쓰지 않음)')
}

// ── 5. 아무나 정할 수 없다 ────────────────────────────────────────────────
{
  const r = tryAs(FIELD, `select public.set_flat_fee_policy('${A}', true)`)
  ok(!r.ok && /사무실 담당자와 관리자만/.test(r.out), '기사님은 계약 정책을 못 바꿈', err(r))
  ok(row(A).at === '', '막힌 뒤에도 「아직 안 정함」 그대로')
}

// ── 6. 애매한 입력은 거절 ─────────────────────────────────────────────────
{
  const r = tryAs(OFFICE, `select public.set_flat_fee_policy('${A}', null)`)
  ok(!r.ok && /「예」인지/.test(r.out), '예·아니오를 안 고르면 저장 안 함', err(r))
  const g = tryAs(OFFICE, `select public.set_flat_fee_policy('00000000-0000-0000-0000-0000000000ff', true)`)
  ok(!g.ok && /거래처를 찾을 수 없습니다/.test(g.out), '없는 거래처는 거절', err(g))
  ok(psql(`select count(*) from public.audit_logs where action='client.flat_fee_policy'`) === '3',
    '거절된 시도는 기록을 남기지 않음 (같은 트랜잭션이 통째로 되돌아감)',
    psql(`select count(*) from public.audit_logs where action='client.flat_fee_policy'`))
}

// ── 7. 백필 — 이미 켜 둔 곳은 다시 묻지 않는다 ───────────────────────────
{
  //  0044 이전부터 켜져 있던 거래처를 흉내 냅니다 (정한 시각만 비운 상태).
  const D = client('[검증]예전부터켜둠')
  const E = client('[검증]예전부터꺼둠')
  psql(`update public.clients set flat_fee_when_empty=true, flat_fee_policy_at=null where id='${D}'`)
  psql(`update public.clients set flat_fee_when_empty=false, flat_fee_policy_at=null where id='${E}'`)
  //  마이그레이션의 백필 문장을 그대로 다시 돌립니다.
  psql(`update public.clients
           set flat_fee_policy_at = coalesce(flat_fee_policy_at, updated_at, created_at, now())
         where flat_fee_when_empty and flat_fee_policy_at is null`)
  ok(row(D).at !== '', '이미 켜 둔 곳은 「정한 것」이 됨 — 다시 안 물음')
  ok(row(E).at === '', '꺼져 있던 곳은 안 건드림 — 「아직 안 정함」으로 남음')
  ok(row(E).when === false, '백필이 값을 바꾸지 않음')
  ok(psql(`select count(*) from public.audit_logs where action='client.flat_fee_policy' and client_id='${D}'`) === '0',
    '백필은 사람이 정한 것으로 위조하지 않음 (기록 없음)')
}

// ── 8. 자가진단이 새것을 실제로 세는가 (이빨) ────────────────────────────
const check = () => JSON.parse(run(`select public.app_health_check()`, ADMIN))
{
  const h = check()
  ok(h.ok === true && h.version === 64, '0044 를 올린 DB 는 「이상 없음」',
    h.ok ? `판 ${h.version}` : JSON.stringify(h.missing).slice(0, 80))
}
const gone = (label, breakSql, fixSql, expect) => {
  psql(breakSql)
  const h = check()
  const hit = (h.missing ?? []).some((m) => m.includes(expect))
  ok(h.ok === false && hit, `${label} → 이름을 대고 알려 줌`,
    hit ? (h.missing.find((m) => m.includes(expect)) ?? '') : JSON.stringify(h.missing).slice(0, 80))
  psql(fixSql)
  ok(check().ok === true, `${label} → 되돌리면 다시 「이상 없음」`)
}
gone('정한 시각 칸이 사라지면',
  `alter table public.clients drop column flat_fee_policy_at`,
  `alter table public.clients add column flat_fee_policy_at timestamptz`,
  'clients.flat_fee_policy_at')
gone('정하는 함수가 사라지면',
  `drop function public.set_flat_fee_policy(uuid, boolean)`,
  `create function public.set_flat_fee_policy(uuid, boolean) returns jsonb language sql as $x$ select '{}'::jsonb $x$`,
  '함수 set_flat_fee_policy')

const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
