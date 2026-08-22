import { execFileSync } from 'node:child_process'

//  0039 거래처 정보 빈칸 + 거래처 삭제 — 격리 DB 에서 실제 서버로 확인합니다.
//
//   지키려는 것
//    · 화면에 보이는 값은 전부 넣을 수 있어야 한다 (수거 가능시간·처리장·기저귀 주기)
//    · 기록이 있는 거래처는 지울 수 없다 — 지우면 지난 매출·미수금이 바뀐다
//    · 무엇 때문에 못 지우는지 숫자로 알려 준다
//    · 지운 사실은 감사기록에 남는다
const DB = 'cliq'
const run = (sql, role) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    role ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${role}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()

const psql = (sql) => run(sql)
const asRole = (uid, sql) => run(sql, uid)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: asRole(uid, sql) } }
  catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
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
const ADMIN = mk('cli-admin@beonemirae.test', 'admin')
const OFFICE = mk('cli-office@beonemirae.test', 'office')

ok(Number(psql(`select public.app_schema_version()`)) >= 39, 'DB 버전이 39 이상', psql(`select public.app_schema_version()`))

// ── 1. 화면에 보이는데 없던 칸 ────────────────────────────────────────────
for (const col of ['collect_time', 'disposal_site', 'diaper_cycle']) {
  ok(psql(`select count(*) from information_schema.columns
           where table_schema='public' and table_name='clients' and column_name='${col}'`) === '1',
    `clients.${col} 칸이 생김`)
}

psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]편집병원','병원','',true,true) on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[검증]편집병원'`)

//  사무실 담당자가 그 값들을 실제로 넣을 수 있어야 합니다
const upd = tryAs(OFFICE, `update public.clients
  set collect_time = '평일 09:00~17:00 (점심 제외)',
      disposal_site = '○○환경 소각장',
      diaper_cycle = '주 1회'
  where id = '${CID}'`)
ok(upd.ok, '사무실 담당자가 수거 가능시간·처리장·기저귀 주기를 넣을 수 있음',
  upd.ok ? '' : upd.out.split('\n')[0].slice(0, 60))
ok(psql(`select collect_time from public.clients where id='${CID}'`) === '평일 09:00~17:00 (점심 제외)',
  '수거 가능시간이 그대로 저장')
ok(psql(`select disposal_site from public.clients where id='${CID}'`) === '○○환경 소각장', '처리장도')
ok(psql(`select diaper_cycle from public.clients where id='${CID}'`) === '주 1회',
  '기저귀 주기를 의료폐기물과 따로 넣을 수 있음')

//  0039 이전에 만들어진 거래처는 빈 문자열이어야 합니다 (null 아님)
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]예전병원','병원','',true,false) on conflict do nothing`)
ok(psql(`select collect_time = '' from public.clients where name='[검증]예전병원'`) === 't',
  '새로 만든 거래처의 새 칸은 빈 문자열 (null 로 두면 화면이 터집니다)')

// ── 2. 기록이 있으면 지우지 못한다 ────────────────────────────────────────
const TODAY = psql(`select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`)
psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount)
      values ('${TODAY}', '${CID}', '의료폐기물', '완료', 100)`)

const blocked = tryAs(ADMIN, `select public.delete_client('${CID}'::uuid, '테스트')`)
ok(!blocked.ok && /수거 1건 기록이 있어/.test(blocked.out) && !/1건s/.test(blocked.out), '수거 기록이 있으면 거부하고 몇 건인지 알려 줌 (문장이 깨지지 않음)',
  blocked.out.split('\n')[0].slice(0, 100))
ok(/거래 종료/.test(blocked.out), '대신 무엇을 하면 되는지 알려 줌')
ok(psql(`select count(*) from public.clients where id='${CID}'`) === '1', '막힌 뒤 거래처가 그대로 남음')

//  청구가 있어도 마찬가지 — 지우면 지난 매출이 바뀝니다
psql(`insert into public.payments (client_id, billing_month, amount, status)
      values ('${CID}', '2026-07', 1000000, '미수금')`)
const blocked2 = tryAs(ADMIN, `select public.delete_client('${CID}'::uuid, '')`)
ok(!blocked2.ok && /수거 1건/.test(blocked2.out) && /청구 1건 기록이 있어/.test(blocked2.out) && !/병원s/.test(blocked2.out),
  '여러 가지가 남아 있으면 전부 알려 줌', blocked2.out.split('\n')[0].slice(0, 110))

// ── 3. 기록이 없으면 지운다 ───────────────────────────────────────────────
const C2 = psql(`select id from public.clients where name='[검증]예전병원'`)
const del = tryAs(ADMIN, `select public.delete_client('${C2}'::uuid, '오타로 두 번 등록')`)
ok(del.ok, '기록이 없는 거래처는 지울 수 있음', del.ok ? '' : del.out.split('\n')[0].slice(0, 70))
ok(psql(`select count(*) from public.clients where id='${C2}'`) === '0', '실제로 사라짐')
ok(Number(psql(`select count(*) from public.audit_logs where action='client.delete'`)) === 1,
  '지운 사실이 감사기록에 남음')
const sum = psql(`select summary from public.audit_logs where action='client.delete' limit 1`)
ok(/\[검증\]예전병원/.test(sum) && /오타로 두 번 등록/.test(sum), '무엇을 왜 지웠는지 적음', sum.slice(0, 80))

// ── 4. 권한 ───────────────────────────────────────────────────────────────
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]권한병원','병원','',true,false) on conflict do nothing`)
const C3 = psql(`select id from public.clients where name='[검증]권한병원'`)
const office = tryAs(OFFICE, `select public.delete_client('${C3}'::uuid, '')`)
ok(!office.ok && /관리자만/.test(office.out), '사무실 담당자는 거래처를 지우지 못함 (되돌릴 수 없는 일)',
  office.out.split('\n')[0].slice(0, 70))
ok(psql(`select count(*) from public.clients where id='${C3}'`) === '1', '막힌 뒤 그대로')

const gone = tryAs(ADMIN, `select public.delete_client(gen_random_uuid(), '')`)
ok(!gone.ok && /찾을 수 없습니다/.test(gone.out), '없는 거래처를 지우려 하면 알려 줌')

// ── 5. 거래 종료(soft)는 그대로 동작한다 (회귀) ───────────────────────────
const retire = tryAs(OFFICE, `update public.clients set active = false where id='${CID}'`)
ok(retire.ok, '기록이 있는 거래처는 「거래 종료」로 정리할 수 있음')
ok(psql(`select active from public.clients where id='${CID}'`) === 'f', '거래 종료 상태로 바뀜')
ok(psql(`select count(*) from public.schedules where client_id='${CID}'`) === '1',
  '거래 종료해도 수거 기록은 그대로')

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
