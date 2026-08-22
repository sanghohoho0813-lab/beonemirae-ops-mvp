import { execFileSync } from 'node:child_process'

//  0036 단가 판·이력 — 격리 DB 에서 실제 서버로 확인합니다.
const DB = 'priceq'
const run = (sql, role) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    role ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${role}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const asRole = (uid, sql) => run(sql, uid)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: asRole(uid, sql) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
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
const OFFICE = mk('pr-office@beonemirae.test', 'office')
const FIELD = mk('pr-field@beonemirae.test', 'field')

ok(psql(`select public.app_schema_version()`) >= '36', 'DB 버전 36 이상')
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]단가병원','병원','',true,false)`)
const cid = psql(`select id from public.clients where name='[검증]단가병원'`)

// ── 1. 저장 — 지금 단가와 판이 함께 ──────────────────────────────────────
const r1 = JSON.parse(asRole(OFFICE, `select public.set_client_pricing(
  '${cid}'::uuid, '{"medical":{"sale":950,"cost":350}}'::jsonb, '2026-01-01'::date, '계약')`))
ok(r1.created === true && r1.effectiveFrom === '2026-01-01', '판이 만들어짐', JSON.stringify(r1))
ok(psql(`select pricing->'medical'->>'sale' from public.clients where id='${cid}'`) === '950',
  '지금 단가도 함께 바뀜')
ok(psql(`select count(*) from public.client_prices where client_id='${cid}'`) === '1', '판 1개')

// ── 2. 다른 날짜로 넣으면 판이 늘어남 ────────────────────────────────────
asRole(OFFICE, `select public.set_client_pricing(
  '${cid}'::uuid, '{"medical":{"sale":1200,"cost":350}}'::jsonb, '2026-06-01'::date, '인상')`)
ok(psql(`select count(*) from public.client_prices where client_id='${cid}'`) === '2', '판 2개')
ok(psql(`select pricing->'medical'->>'sale' from public.client_prices
         where client_id='${cid}' and effective_from='2026-01-01'`) === '950',
  '옛 판은 그대로 남음 — 과거 청구를 재현할 수 있어야 합니다')

// ── 3. 같은 날짜면 덮어씀 (오타를 고칠 길) ───────────────────────────────
const r3 = JSON.parse(asRole(OFFICE, `select public.set_client_pricing(
  '${cid}'::uuid, '{"medical":{"sale":1250,"cost":350}}'::jsonb, '2026-06-01'::date, '정정')`))
ok(r3.created === false, '같은 날짜는 새로 만들지 않고 고침', JSON.stringify(r3))
ok(psql(`select count(*) from public.client_prices where client_id='${cid}'`) === '2', '판이 늘지 않음')
ok(psql(`select pricing->'medical'->>'sale' from public.client_prices
         where client_id='${cid}' and effective_from='2026-06-01'`) === '1250', '값이 고쳐짐')

// ── 4. 권한 — 단가는 돈입니다 ────────────────────────────────────────────
const f = tryAs(FIELD, `select public.set_client_pricing(
  '${cid}'::uuid, '{"medical":{"sale":1}}'::jsonb, '2026-07-01'::date, '')`)
ok(!f.ok && /사무실 담당자와 관리자만/.test(f.out), '현장 담당자는 단가를 못 바꿈',
  f.out.split('\n')[0].slice(0, 60))
ok(psql(`select count(*) from public.client_prices where client_id='${cid}'`) === '2', '막힌 뒤 판이 안 생김')
const readable = tryAs(FIELD, `select count(*) from public.client_prices`)
ok(!readable.ok || readable.out.trim().split('\n').pop() === '0', '현장 담당자는 단가 판을 읽지도 못함',
  readable.out.trim().split('\n').pop())

// ── 5. 잘못된 값 ─────────────────────────────────────────────────────────
const bad = tryAs(OFFICE, `select public.set_client_pricing(
  '${cid}'::uuid, '"문자열"'::jsonb, null, '')`)
ok(!bad.ok && /단가 형식/.test(bad.out), '단가가 객체가 아니면 거부')
const nocli = tryAs(OFFICE, `select public.set_client_pricing(
  '00000000-0000-0000-0000-000000000999'::uuid, '{}'::jsonb, null, '')`)
ok(!nocli.ok && /거래처를 찾을 수 없습니다/.test(nocli.out), '없는 거래처는 거부')

// ── 6. 날짜를 안 주면 오늘(한국) ─────────────────────────────────────────
asRole(OFFICE, `select public.set_client_pricing('${cid}'::uuid, '{"medical":{"sale":990}}'::jsonb, null, '')`)
const kst = psql(`select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`)
ok(psql(`select count(*) from public.client_prices where client_id='${cid}' and effective_from='${kst}'`) === '1',
  '적용일을 안 주면 한국 날짜 오늘', kst)

// ── 7. 감사기록 ──────────────────────────────────────────────────────────
ok(Number(psql(`select count(*) from public.audit_logs where action='client.pricing'`)) === 4,
  '단가 변경이 모두 감사기록에 남음 (4회)',
  psql(`select count(*) from public.audit_logs where action='client.pricing'`))
ok(/단가 변경 — \[검증\]단가병원/.test(psql(`select summary from public.audit_logs
     where action='client.pricing' order by at limit 1`)), '무엇을 언제부터 바꿨는지 적음')

// ── 8. 삭제 정책이 없어야 합니다 ─────────────────────────────────────────
//  판을 지우면 과거 청구를 재현할 수 없습니다.
ok(psql(`select count(*) from pg_policies where tablename='client_prices' and cmd='DELETE'`) === '0',
  '삭제 정책을 만들지 않음 — 과거를 지울 수 없게')

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
