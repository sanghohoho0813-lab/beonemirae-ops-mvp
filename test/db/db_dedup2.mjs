import { execFileSync, spawn } from 'node:child_process'

//  0055 — 병원 요청·현장 메모도 「다시 눌러도 안전」하게.
//
//   병원 담당자가 지하 주차장에서 「추가 수거 요청」을 두 번 누르면
//   같은 요청이 두 줄 들어옵니다. 최악은 **추가 수거를 두 번 나가는 것**
//   입니다. 확인하는 것은
//
//    · 같은 표로 두 번 넣으면 **두 번째가 막히는가**
//    · **같은 순간에** 두 번 눌러도 하나만 들어가는가 (실제 접속 둘)
//    · 표 없이 보내는 옛 화면은 지금까지처럼 동작하는가
//    · 다른 표면 당연히 두 건이 되는가 (진짜 두 번 요청한 경우)
//    · **RLS 가 그대로인가** — 병원 격리가 이번 판으로 약해지지 않았는가
//    · 이미 있던 중복은 건드리지 않는가

const DB = 'dup2q'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 110)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}
const client = (name) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',true,false) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}' limit 1`)
}

const CA = client('[검증]가나병원')
const CB = client('[검증]다라요양원')
const ADMIN = mk('d2-admin@beonemirae.test', 'admin')
const OFFICE = mk('d2-office@beonemirae.test', 'office')
const FIELD = mk('d2-field@beonemirae.test', 'field')
const HOSP_A = mk('d2-hosp-a@beonemirae.test', 'client', CA)
const HOSP_B = mk('d2-hosp-b@beonemirae.test', 'client', CB)

const REQ = (rid, clientId = CA) =>
  `insert into public.client_requests (client_id, kind, content, urgent, source, requester_name, status, request_id)
   values ('${clientId}','추가수거','3층 창고가 찼습니다',false,'portal','가나 담당자','접수', ${rid ? `'${rid}'` : 'null'})`

// ── 0. 판 번호와 자가진단 ───────────────────────────────────────────────────
{
  ok(psql('select public.app_schema_version()') === '64', 'DB 판 64', psql('select public.app_schema_version()'))
  const h = JSON.parse(run('select public.app_health_check()', ADMIN))
  ok(h.ok === true, '자가진단 이상 없음', JSON.stringify(h.missing))
  //  색인을 지우면 잡아내야 합니다 — 안 그러면 중복 방어가 풀려도 조용합니다.
  psql('drop index if exists public.client_requests_request_uniq')
  const h2 = JSON.parse(run('select public.app_health_check()', ADMIN))
  ok(h2.ok === false && JSON.stringify(h2.missing).includes('client_requests_request_uniq'),
    '**중복 방어 색인이 자가진단 목록에 있음** (지우면 잡아냄)', JSON.stringify(h2.missing))
  psql(`create unique index if not exists client_requests_request_uniq
          on public.client_requests (request_id) where request_id is not null`)
}

// ── 1. 같은 표로 두 번 → 두 번째가 막힌다 ───────────────────────────────────
{
  const RID = psql('select gen_random_uuid()')
  const first = tryAs(HOSP_A, REQ(RID))
  ok(first.ok, '병원이 요청을 올림')
  const second = tryAs(HOSP_A, REQ(RID))
  ok(!second.ok && /duplicate key|중복/i.test(second.out),
    '**같은 표로 다시 누르면 막힘** — 추가 수거를 두 번 나가지 않습니다', err(second))
  const n = psql(`select count(*) from public.client_requests where request_id = '${RID}'`)
  ok(n === '1', '요청은 한 줄만', `${n}줄`)
}

// ── 2. 같은 순간에 두 번 눌러도 하나 ────────────────────────────────────────
//   버튼을 두 번 빠르게 누르면 두 요청이 **동시에** 갑니다. 앞의 검사는
//   순서대로 보낸 것이라, 이건 따로 확인해야 합니다.
{
  const RID = psql('select gen_random_uuid()')
  const fire = () =>
    new Promise((resolve) => {
      const p = spawn('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', asRole(HOSP_A, REQ(RID))])
      let e = ''
      p.stderr.on('data', (d) => { e += d })
      p.on('close', (code) => resolve({ code, e }))
    })
  const [a, b] = await Promise.all([fire(), fire()])
  const wins = [a, b].filter((r) => r.code === 0).length
  ok(wins === 1, '**같은 순간에 둘이 들어와도 하나만 성공**', `성공 ${wins}건`)
  const n = psql(`select count(*) from public.client_requests where request_id = '${RID}'`)
  ok(n === '1', '표에도 한 줄만', `${n}줄`)
  ok([a, b].some((r) => /duplicate key/i.test(r.e)), '진 쪽은 중복이라고 분명히 말함')
}

// ── 3. 진짜 두 번 요청한 것은 두 건 ─────────────────────────────────────────
//   막는 것은 「같은 시도」이지 「같은 내용」이 아닙니다. 오늘 두 번
//   필요할 수도 있습니다.
{
  const before = psql(`select count(*) from public.client_requests where client_id = '${CA}'`)
  const r1 = tryAs(HOSP_A, REQ(psql('select gen_random_uuid()')))
  const r2 = tryAs(HOSP_A, REQ(psql('select gen_random_uuid()')))
  ok(r1.ok && r2.ok, '표가 다르면 둘 다 들어감 — 진짜로 두 번 요청한 경우')
  const after = psql(`select count(*) from public.client_requests where client_id = '${CA}'`)
  ok(Number(after) - Number(before) === 2, '두 건으로 남음', `${before} → ${after}`)
}

// ── 4. 옛 화면(표 없음)은 지금까지처럼 ──────────────────────────────────────
//   배포가 늦게 반영된 폰에서도 요청은 들어가야 합니다.
{
  const before = psql(`select count(*) from public.client_requests where request_id is null`)
  const a = tryAs(HOSP_A, REQ(null))
  const b = tryAs(HOSP_A, REQ(null))
  ok(a.ok && b.ok, '**표 없이 보내도 들어감** — 옛 화면이 멈추지 않습니다')
  const after = psql(`select count(*) from public.client_requests where request_id is null`)
  ok(Number(after) - Number(before) === 2, 'null 끼리는 안 부딪힘 (부분 색인)', `${before} → ${after}`)
}

// ── 5. 현장 메모도 같은 규칙 ────────────────────────────────────────────────
{
  const RID = psql('select gen_random_uuid()')
  const NOTE = (rid) =>
    `insert into public.site_notes (client_id, kind, content, done, request_id)
     values ('${CA}','주의','후문으로 들어가야 합니다',false, ${rid ? `'${rid}'` : 'null'})`
  const first = tryAs(FIELD, NOTE(RID))
  ok(first.ok, '현장 담당자가 메모를 남김')
  const second = tryAs(FIELD, NOTE(RID))
  ok(!second.ok && /duplicate key/i.test(second.out),
    '**같은 표로 다시 저장하면 막힘** — 같은 메모가 두 줄이 되지 않습니다', err(second))
  ok(psql(`select count(*) from public.site_notes where request_id = '${RID}'`) === '1', '메모는 한 줄만')
}

// ── 6. 병원 격리가 그대로인가 ───────────────────────────────────────────────
//   이번 판은 RLS 를 건드리지 않았습니다. **그 사실을 확인**합니다 —
//   「안 건드렸으니 괜찮겠지」는 확인이 아닙니다.
{
  const cross = tryAs(HOSP_A, REQ(psql('select gen_random_uuid()'), CB))
  ok(!cross.ok, '**병원 A 가 병원 B 이름으로 요청을 못 올림**', err(cross))

  const seenB = tryAs(HOSP_B, `select count(*) from public.client_requests where client_id = '${CA}'`)
  ok(seenB.ok && seenB.out === '0', '**병원 B 는 병원 A 요청을 못 봄**', seenB.out)

  //  source 를 staff 로 속여 올릴 수 없어야 합니다 (0006 정책).
  const fake = tryAs(HOSP_A,
    `insert into public.client_requests (client_id, kind, content, urgent, source, requester_name, status, request_id)
     values ('${CA}','추가수거','x',false,'staff','가짜','접수','${psql('select gen_random_uuid()')}')`)
  ok(!fake.ok, '병원이 「직원이 접수한 것」으로 속여 올리지 못함', err(fake))

  //  직원은 전부 봅니다 — 그래야 처리할 수 있습니다.
  const staffSees = tryAs(OFFICE, 'select count(*) from public.client_requests')
  ok(staffSees.ok && Number(staffSees.out) > 0, '직원은 전체를 봄', staffSees.out)
}

// ── 7. 이미 있던 중복은 안 건드린다 ─────────────────────────────────────────
//   지우면 어느 쪽이 맞는지 사람이 볼 기회가 사라집니다.
{
  psql(`insert into public.client_requests (client_id, kind, content, urgent, source, requester_name, status)
        values ('${CA}','추가수거','예전에 두 번 들어온 것',false,'portal','가나','접수'),
               ('${CA}','추가수거','예전에 두 번 들어온 것',false,'portal','가나','접수')`)
  const n = psql(`select count(*) from public.client_requests where content = '예전에 두 번 들어온 것'`)
  ok(n === '2', '**옛 중복은 그대로 남음** — 어느 쪽이 맞는지 사람이 봅니다', `${n}줄`)
}

// ── 8. 돈은 하나도 안 건드린다 ──────────────────────────────────────────────
{
  const cols = psql(`select count(*) from information_schema.columns
                      where table_schema='public'
                        and table_name in ('client_requests','site_notes')
                        and column_name in ('amount','price','total')`)
  ok(cols === '0', '이 두 표에는 금액 칸이 없음')
  ok(psql(`select coalesce(sum(amount),0) from public.payments`) === '0', '청구 금액이 안 바뀜')
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
