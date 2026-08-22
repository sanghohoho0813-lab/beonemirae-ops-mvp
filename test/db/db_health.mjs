import { execFileSync } from 'node:child_process'

//  DB 자가진단.
//
//   지금까지 화면은 `app_schema_version()` 숫자 하나만 봤습니다. 그 숫자는
//   마이그레이션 **마지막 줄**에서 올라가므로 「파일이 끝까지 돌았다」까지는
//   말해 줍니다. 그런데 그 뒤에 누가 정책을 지우거나, 색인이 사라지거나,
//   함수가 다른 것으로 덮여도 숫자는 그대로입니다.
//
//   여기서 확인하는 것은 하나입니다 — **정말 없어졌을 때 알아채는가.**
//   있다고 말하는 것은 쉽습니다. 없앴을 때 이름을 대는지를 봅니다.
const DB = 'healthq'
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

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('health-admin@beonemirae.test', 'admin')
const OFFICE = mk('health-office@beonemirae.test', 'office')

const check = () => JSON.parse(run(`select public.app_health_check()`, ADMIN))

// ── 1. 제대로 올린 DB 는 깨끗하다 ─────────────────────────────────────────
{
  const h = check()
  ok(h.ok === true, '마이그레이션을 다 올린 DB 는 「이상 없음」',
    h.ok ? `판 ${h.version}` : JSON.stringify(h.missing))
  ok(h.version === 64, '판 번호도 함께 돌려줌', String(h.version))
  ok(Array.isArray(h.missing) && h.missing.length === 0, '없는 것 0개')
  ok(typeof h.checkedAt === 'string', '언제 확인했는지도')
}

// ── 2. 관리자만 볼 수 있다 ────────────────────────────────────────────────
{
  const r = tryAs(OFFICE, `select public.app_health_check()`)
  ok(!r.ok && /관리자만/.test(r.out), '사무실 담당자는 자가진단을 못 봄',
    (r.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 45))
}

// ── 3. 실제로 없애 보면 이름을 대는가 (이빨) ──────────────────────────────
//   여기가 이 검증의 전부입니다. 「있다」는 말은 아무나 할 수 있습니다.
const gone = (label, breakSql, fixSql, expect) => {
  psql(breakSql)
  const h = check()
  const hit = (h.missing ?? []).some((m) => m.includes(expect))
  ok(h.ok === false && hit, `${label} → 이름을 대고 알려 줌`,
    hit ? (h.missing.find((m) => m.includes(expect)) ?? '') : JSON.stringify(h.missing).slice(0, 80))
  psql(fixSql)
  const back = check()
  ok(back.ok === true, `${label} → 되돌리면 다시 「이상 없음」`,
    back.ok ? '' : JSON.stringify(back.missing).slice(0, 60))
}

gone('색인이 사라지면 (입금 중복 방지)',
  `drop index public.payment_receipts_request_uniq`,
  `create unique index payment_receipts_request_uniq on public.payment_receipts (request_id) where request_id is not null`,
  'payment_receipts_request_uniq')

gone('색인이 사라지면 (자재 중복 방지)',
  `drop index public.materials_request_uniq`,
  `create unique index materials_request_uniq on public.materials (request_id) where request_id is not null`,
  'materials_request_uniq')

gone('칸이 사라지면 (청구 명세서)',
  `alter table public.payments drop column snapshot`,
  `alter table public.payments add column snapshot jsonb`,
  'payments.snapshot')

gone('함수가 사라지면 (청구 확정)',
  `drop function public.confirm_billing(uuid, text, bigint, jsonb)`,
  //  되돌릴 때는 껍데기만 — 이 검증은 「있는지」만 봅니다
  `create function public.confirm_billing(uuid, text, bigint, jsonb) returns jsonb language sql as $x$ select '{}'::jsonb $x$`,
  '함수 confirm_billing')

gone('청구를 지울 수 있게 열리면',
  `grant delete on public.payments to authenticated`,
  `revoke delete on public.payments from authenticated`,
  'payments 삭제 권한')

gone('입금 표를 직접 쓸 수 있게 열리면',
  `grant insert on public.payment_receipts to authenticated`,
  `revoke insert on public.payment_receipts from authenticated`,
  'payment_receipts 직접 쓰기')

gone('표의 RLS 가 꺼지면',
  `alter table public.clients disable row level security`,
  `alter table public.clients enable row level security`,
  'RLS clients')

// ── 4. 여러 개가 한꺼번에 없어져도 다 세는가 ──────────────────────────────
{
  psql(`drop index public.materials_request_uniq`)
  psql(`alter table public.payments drop column canceled_at`)
  psql(`alter table public.site_notes disable row level security`)
  const h = check()
  ok(h.ok === false && (h.missing ?? []).length >= 3, '세 군데가 없어지면 세 개를 다 셈',
    `${(h.missing ?? []).length}개 — ${(h.missing ?? []).join(' / ').slice(0, 80)}`)
  psql(`create unique index materials_request_uniq on public.materials (request_id) where request_id is not null`)
  psql(`alter table public.payments add column canceled_at timestamptz`)
  psql(`alter table public.site_notes enable row level security`)
  ok(check().ok === true, '다 되돌리면 다시 「이상 없음」')
}

const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
