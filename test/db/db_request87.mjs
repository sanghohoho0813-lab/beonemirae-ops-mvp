import { execFileSync } from 'node:child_process'

//  0087 — 수거 요청에 「무엇을 · 얼마나」 (waste_type · expected_kg)
//
//   여기서 확인하는 것은 두 가지입니다.
//
//    ① **경계** — 병원이 남의 병원 이름으로 요청을 못 올리는 것은 0006 에서
//      이미 막혀 있지만, 칸을 더한 뒤에도 그대로인지 다시 봅니다. 칸 하나
//      더하다가 정책이 풀리는 일이 실제로 있습니다.
//
//    ② **거짓말 막기** — 이 두 칸은 비워 둘 수 있어야 하고(모름), 아무 글이나
//      들어가면 안 되며(유형), 터무니없는 숫자를 못 넣어야 합니다.
//      「의료 폐기물」과 「의료폐기물」이 둘 다 들어가는 순간 세는 것이
//      두 갈래로 갈라집니다.

const DB = 'req87'
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close',
                 '0074_amend', '0075_supply_items', '0076_snooze_who', '0077_schedule_origin',
                 '0079_stock_items', '0083_customer_platform', '0087_request_detail']) {
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}supabase/proposals/PROPOSAL_${f}.sql`],
    { encoding: 'utf8' })
}

const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (s) => run(s)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 130)

const AD = '00000000-0000-0000-0000-0000000000a9'
const HA = '00000000-0000-0000-0000-00000000c1a1'
const HB = '00000000-0000-0000-0000-00000000c1a2'
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000a2'

for (const [id, name] of [[CA, '남양주백병원'], [CB, '오남한양병원']]) {
  psql(`insert into public.clients (id, name, type, address, collects_medical_waste)
        values ('${id}', '${name}', '병원', '경기도 남양주시 오남읍 1', true)
        on conflict (id) do nothing`)
}
for (const [id, name, role, cid] of [
  [AD, '송대표', 'admin', null],
  [HA, 'A병원 담당자', 'client', CA], [HB, 'B병원 담당자', 'client', CB],
]) {
  psql(`insert into auth.users (id, email) values ('${id}', '${id}@b.c') on conflict do nothing`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}', '${id}@b.c', '${name}', '${role}', true, now(), ${cid ? `'${cid}'` : 'null'})
        on conflict (id) do update set role = excluded.role, active = true,
          approved_at = now(), client_id = excluded.client_id`)
}

const req = (uid, cid, extra) =>
  tryAs(uid, `insert into public.client_requests (client_id, kind, content${extra.cols})
              values ('${cid}', '추가수거', '요청 내용'${extra.vals}) returning id`)

// ── ① 판 번호 ──────────────────────────────────────────────────────────────
{
  const v = Number(psql('select public.app_schema_version()'))
  ok(v === 87, '판 번호가 87 이다', String(v))
}

// ── ② 두 칸 다 **비워 둘 수 있다** ─────────────────────────────────────────
//     ⚠ 필수로 만들면 급한 병원이 「몰라서」 요청을 못 올립니다.
{
  const r = req(HA, CA, { cols: '', vals: '' })
  ok(r.ok, '**아무것도 안 적어도 요청이 올라간다**', r.ok ? '' : err(r))
  const row = psql(`select coalesce(waste_type,'없음') || '|' || coalesce(expected_kg::text,'없음')
                      from public.client_requests where client_id = '${CA}'`)
  ok(row === '없음|없음', '**안 적은 칸은 null 로 남는다** (0 으로 채우지 않는다)', row)
}

// ── ③ 적으면 적은 대로 들어간다 ────────────────────────────────────────────
{
  const r = req(HA, CA, {
    cols: ', waste_type, expected_kg',
    vals: `, '의료폐기물', 120.5`,
  })
  ok(r.ok, '유형과 예상량을 적어 올릴 수 있다', r.ok ? '' : err(r))
  const row = psql(`select waste_type || '|' || expected_kg::text from public.client_requests
                     where waste_type is not null`)
  //  ⚠ 소수점이 잘리면 안 됩니다. numeric(10,2) 입니다.
  ok(row === '의료폐기물|120.50', '적은 값이 그대로 남는다 (소수점 포함)', row)
}

// ── ④ 아무 글이나 못 넣는다 ────────────────────────────────────────────────
//     ⚠ 「의료 폐기물」(띄어쓰기)이 들어가면 세는 순간 두 갈래로 갈라집니다.
{
  for (const bad of ['의료 폐기물', '기저귀', '일반쓰레기', '']) {
    const r = req(HA, CA, { cols: ', waste_type', vals: `, '${bad}'` })
    ok(!r.ok, `유형에 「${bad || '빈 글자'}」는 못 들어간다`, r.ok ? '들어갔습니다' : '')
  }
  for (const good of ['의료폐기물', '일회용기저귀']) {
    const r = req(HA, CA, { cols: ', waste_type', vals: `, '${good}'` })
    ok(r.ok, `유형 「${good}」은 들어간다`, r.ok ? '' : err(r))
  }
}

// ── ⑤ 터무니없는 숫자를 막는다 ─────────────────────────────────────────────
//     ⚠ 한 번 수거에 5톤이 나오는 병원은 없습니다 — 손가락이 미끄러진 것입니다.
{
  for (const bad of ['-10', '0', '99999']) {
    const r = req(HA, CA, { cols: ', expected_kg', vals: `, ${bad}` })
    ok(!r.ok, `예상량 ${bad}kg 은 막힌다`, r.ok ? '들어갔습니다' : '')
  }
  const r = req(HA, CA, { cols: ', expected_kg', vals: ', 5000' })
  ok(r.ok, '예상량 5000kg(상한)은 들어간다', r.ok ? '' : err(r))
}

// ── ⑥ 경계 — 칸을 더한 뒤에도 남의 병원 이름으로는 못 올린다 ───────────────
{
  const r = req(HA, CB, { cols: ', waste_type, expected_kg', vals: `, '의료폐기물', 50` })
  ok(!r.ok, '**A 병원이 B 병원 이름으로 요청을 못 올린다**', r.ok ? '올라가 버렸습니다' : err(r))

  const seenA = Number(run(`select count(*) from public.client_requests where client_id = '${CB}'`, HA))
  ok(seenA === 0, '**A 병원에는 B 병원 요청이 한 줄도 안 보인다**', `${seenA}건`)
}

// ── ⑦ 기존 요청은 **저희가 채우지 않았다** ─────────────────────────────────
//     ⚠ 마이그레이션이 지난 자료를 짐작해 채웠다면 여기서 걸립니다.
{
  //  마이그레이션 전에 있었을 법한 요청을 하나 넣고, 마이그레이션을 다시 돌립니다.
  psql(`insert into public.client_requests (client_id, kind, content)
        values ('${CA}', '기타', '판 올리기 전 요청')`)
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}supabase/proposals/PROPOSAL_0087_request_detail.sql`],
    { encoding: 'utf8' })
  const n = Number(psql(`select count(*) from public.client_requests
                          where content = '판 올리기 전 요청'
                            and (waste_type is not null or expected_kg is not null)`))
  ok(n === 0, '**다시 실행해도 지난 요청을 채워 넣지 않는다**', `${n}건`)

  //  ⚠ 두 번 돌려도 터지지 않아야 합니다 (제약을 또 만들려다 실패하는 일).
  const v = Number(psql('select public.app_schema_version()'))
  ok(v === 87, '두 번 실행해도 판 번호가 87 이다', String(v))
}
