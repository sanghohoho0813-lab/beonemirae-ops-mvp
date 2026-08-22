import { execFileSync } from 'node:child_process'

//  0056 — 사전 등록(초대) · 담당 거래처 배정 · 계정에 차량 묶기.
//
//   가장 위험한 것은 **기사님 화면이 빈 화면이 되는 것**입니다. 배정을
//   켰는데 아무것도 안 보이면 그날 수거가 통째로 멈춥니다. 그래서
//   「배정이 없으면 전부 보인다」를 제일 먼저 확인합니다.
//
//   확인하는 것
//    · 배정이 **없으면** 지금까지처럼 전부 보인다 (기존 계정이 안 죽는다)
//    · 배정이 **있으면** 그 거래처만 보인다 (일정도 같이)
//    · 관리자·사무실은 **한 줄도 안 좁아진다**
//    · 기사가 자기 배정을 스스로 못 늘린다
//    · 사전 등록한 이메일로 가입하면 자동 승인 + 역할·차량·배정이 붙는다
//    · 초대에 적힌 역할이 **가입 화면이 보낸 역할보다 우선**한다
//    · 초대가 없으면 지금까지처럼 승인 대기

const DB = 'asg2q'
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 120)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${email.split('@')[0]}','${role}',true,now(),
                ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(),
                                       client_id=excluded.client_id`)
  return id
}
const client = (name) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',true,false) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}' limit 1`)
}

const CA = client('[검증]가나병원')
const CB = client('[검증]다라요양원')
const CC = client('[검증]마바의원')
const ADMIN = mk('as2-admin@beonemirae.test', 'admin')
const OFFICE = mk('as2-office@beonemirae.test', 'office')
const D1 = mk('as2-driver1@beonemirae.test', 'field')
const D2 = mk('as2-driver2@beonemirae.test', 'field')

const VEH = psql(`insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver)
                  values ('[검증]5506호','의료폐기물',1,1000,660,'오대성')
                  returning id`)

// ── 0. 판 번호와 자가진단 ───────────────────────────────────────────────────
{
  ok(psql('select public.app_schema_version()') === '64', 'DB 판 64', psql('select public.app_schema_version()'))
  const h = JSON.parse(run('select public.app_health_check()', ADMIN))
  ok(h.ok === true, '자가진단 이상 없음', JSON.stringify(h.missing))
}

// ── 1. 배정이 없으면 지금까지처럼 전부 보인다 ───────────────────────────────
//   이게 제일 중요합니다. 여기가 틀리면 기사님 화면이 내일 아침 빈 화면입니다.
{
  const all = psql('select count(*) from public.clients')
  const seen = tryAs(D1, 'select count(*) from public.clients')
  ok(seen.ok && seen.out === all,
    '**배정이 없는 기사는 전부 봄** — 기존 계정이 갑자기 빈 화면이 되지 않습니다',
    `전체 ${all} · 기사 ${seen.out}`)
  ok(run('select public.has_assignments()', D1) === 'f', '배정 없음으로 판정')
}

// ── 2. 배정을 넣으면 그 거래처만 ────────────────────────────────────────────
{
  const r = tryAs(ADMIN, `select public.set_client_drivers('${CA}', array['${D1}']::uuid[])`)
  ok(r.ok, '관리자가 담당 기사를 지정함', r.out.slice(0, 60))

  const seen = tryAs(D1, 'select count(*) from public.clients')
  ok(seen.ok && seen.out === '1', '**배정한 거래처만 보임**', `${seen.out}곳`)
  const which = tryAs(D1, 'select name from public.clients')
  ok(/가나병원/.test(which.out), '보이는 것이 배정한 그 거래처', which.out)

  //  배정 안 받은 다른 기사는 그대로 전부 봅니다 — 사람마다 따로입니다.
  const other = tryAs(D2, 'select count(*) from public.clients')
  ok(Number(other.out) >= 3, '다른 기사는 아직 전부 봄 (한 사람씩 옮길 수 있음)', other.out)
}

// ── 3. 일정도 같은 범위 ─────────────────────────────────────────────────────
//   거래처는 안 보이는데 일정만 보이면 「알 수 없는 거래처」로 뜹니다.
{
  for (const c of [CA, CB, CC]) {
    psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount)
          values (current_date, '${c}', '의료폐기물', '예정', 100)
          on conflict do nothing`)
  }
  const seen = tryAs(D1, 'select count(*) from public.schedules')
  ok(seen.ok && seen.out === '1', '**배정한 거래처의 일정만 보임**', `${seen.out}건`)
  const admin = tryAs(ADMIN, 'select count(*) from public.schedules')
  ok(admin.out === '3', '관리자는 전부 봄', admin.out)
}

// ── 4. 관리자·사무실은 한 줄도 안 좁아진다 ──────────────────────────────────
{
  const all = psql('select count(*) from public.clients')
  for (const [uid, who] of [[ADMIN, '관리자'], [OFFICE, '사무실']]) {
    const seen = tryAs(uid, 'select count(*) from public.clients')
    ok(seen.ok && seen.out === all, `**${who}는 그대로 전부 봄**`, `${seen.out}/${all}`)
  }
}

// ── 5. 기사가 자기 배정을 스스로 못 늘린다 ──────────────────────────────────
//   늘릴 수 있으면 「배정된 곳만 본다」가 아무 뜻이 없습니다.
{
  const ins = tryAs(D1, `insert into public.client_assignments (client_id, profile_id)
                         values ('${CB}', '${D1}')`)
  ok(!ins.ok, '**기사가 표에 직접 배정을 못 넣음**', err(ins))
  const del = tryAs(D1, `delete from public.client_assignments where profile_id = '${D1}'`)
  ok(!del.ok, '자기 배정을 못 지움', err(del))
  const fn = tryAs(D1, `select public.set_client_drivers('${CB}', array['${D1}']::uuid[])`)
  ok(!fn.ok && /관리자만/.test(fn.out), '함수로도 못 함', err(fn))
  //  사무실도 못 합니다 — 담당 배정은 관리자 일입니다.
  const off = tryAs(OFFICE, `select public.set_client_drivers('${CB}', array['${D1}']::uuid[])`)
  ok(!off.ok, '사무실도 못 함', err(off))
  //  여전히 한 곳만 보여야 합니다.
  ok(tryAs(D1, 'select count(*) from public.clients').out === '1', '시도 뒤에도 범위 그대로')
}

// ── 6. 배정을 지우면 원래대로 ───────────────────────────────────────────────
//   잘못 켰을 때 되돌릴 길이 있어야 합니다.
{
  const all = psql('select count(*) from public.clients')
  run(`select public.set_client_drivers('${CA}', array[]::uuid[])`, ADMIN)
  const seen = tryAs(D1, 'select count(*) from public.clients')
  ok(seen.out === all, '**배정을 다 지우면 원래대로 전부 보임** (되돌릴 수 있음)', `${seen.out}/${all}`)
  //  다시 켜 둡니다
  run(`select public.set_client_drivers('${CA}', array['${D1}']::uuid[])`, ADMIN)
}

// ── 7. 배정할 수 없는 계정은 막는다 ─────────────────────────────────────────
{
  const HOSP = mk('as2-hosp@beonemirae.test', 'client', CA)
  const bad = tryAs(ADMIN, `select public.set_client_drivers('${CB}', array['${HOSP}']::uuid[])`)
  ok(!bad.ok && /배정할 수 없는 계정/.test(bad.out), '**병원 계정에는 배정 못 함**', err(bad))
  const ghost = tryAs(ADMIN, `select public.set_client_drivers('${CB}', array[gen_random_uuid()]::uuid[])`)
  ok(!ghost.ok, '없는 계정에도 못 함', err(ghost))
  const noClient = tryAs(ADMIN, `select public.set_client_drivers(gen_random_uuid(), array['${D1}']::uuid[])`)
  ok(!noClient.ok && /거래처를 찾을 수 없습니다/.test(noClient.out), '없는 거래처에도 못 함', err(noClient))
}

// ── 8. 사전 등록(초대) ──────────────────────────────────────────────────────
{
  const r = tryAs(ADMIN,
    `select public.upsert_staff_invite('New.Driver@Beonemirae.test','김준기','field','${VEH}',
       array['${CB}','${CC}']::uuid[], '의료폐기물 담당')`)
  ok(r.ok, '관리자가 사전 등록함', r.out.slice(0, 70))
  //  이메일은 소문자로 굳혀야 나중에 가입할 때 대소문자로 어긋나지 않습니다.
  ok(psql(`select email from public.staff_invites`).includes('new.driver@beonemirae.test'),
    '**이메일을 소문자로 굳힘** — 가입할 때 대소문자로 어긋나면 초대가 조용히 안 붙습니다',
    psql(`select email from public.staff_invites`))

  for (const [uid, who] of [[OFFICE, '사무실'], [D1, '현장']]) {
    const bad = tryAs(uid, `select public.upsert_staff_invite('x@y.z','x','field')`)
    ok(!bad.ok && /관리자만/.test(bad.out), `${who}는 사전 등록 못 함`, err(bad))
  }
  const badMail = tryAs(ADMIN, `select public.upsert_staff_invite('이메일아님','x','field')`)
  ok(!badMail.ok && /이메일 형태가 아닙니다/.test(badMail.out), '이메일 형태를 확인함', err(badMail))
  const badRole = tryAs(ADMIN, `select public.upsert_staff_invite('a@b.co','x','사장')`)
  ok(!badRole.ok, '없는 역할은 막음', err(badRole))
  //  이미 가입한 이메일은 초대로 덮지 않습니다.
  const dup = tryAs(ADMIN, `select public.upsert_staff_invite('as2-driver1@beonemirae.test','x','field')`)
  ok(!dup.ok && /이미 가입한 계정/.test(dup.out), '**이미 가입한 이메일은 초대로 못 덮음**', err(dup))
}

// ── 9. 가입하면 초대가 그대로 붙는다 ────────────────────────────────────────
{
  //  가입 화면이 role=admin 을 보내 봅니다 — 초대에 적힌 field 가 이겨야 합니다.
  psql(`insert into auth.users (id, email, raw_user_meta_data)
        values (gen_random_uuid(), 'new.driver@beonemirae.test',
                '{"role":"admin","name":"딴이름"}'::jsonb)`)
  const p = psql(`select role || '|' || name || '|' || (approved_at is not null) || '|' ||
                         coalesce(vehicle_id::text,'-')
                    from public.profiles where email='new.driver@beonemirae.test'`)
  const [role, name, approved, veh] = p.split('|')
  ok(role === 'field', '**초대에 적힌 역할이 가입 화면이 보낸 역할을 이김** (admin 으로 못 올라감)', role)
  ok(name === '김준기', '초대에 적힌 이름이 들어감', name)
  ok(approved === 'true', '**자동 승인됨** — 관리자가 다시 누를 필요 없음', approved)
  ok(veh === VEH, '차량이 계정에 묶임', veh === VEH ? '5506호' : veh)

  const NEW = psql(`select id from public.profiles where email='new.driver@beonemirae.test'`)
  const n = psql(`select count(*) from public.client_assignments where profile_id='${NEW}'`)
  ok(n === '2', '**담당 거래처 2곳이 자동 배정됨**', `${n}곳`)
  const seen = tryAs(NEW, 'select count(*) from public.clients')
  ok(seen.out === '2', '가입하자마자 자기 거래처만 보임', `${seen.out}곳`)
  ok(psql(`select used_at is not null from public.staff_invites where email='new.driver@beonemirae.test'`) === 't',
    '초대가 「가입 완료」로 바뀜')
}

// ── 10. 초대가 없으면 지금까지처럼 승인 대기 ────────────────────────────────
//    사전 등록이 가입 자체를 막으면 안 됩니다.
{
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), 'walkin@beonemirae.test')`)
  const p = psql(`select role || '|' || (approved_at is null) || '|' || active
                    from public.profiles where email='walkin@beonemirae.test'`)
  ok(p === 'field|true|false', '**초대 없이 가입하면 지금까지처럼 승인 대기 · 사용 중지**', p)

  //  ⚠ 여기가 뚫리면 **누구나 관리자가 됩니다.** 가입 화면이 보내는
  //    raw_user_meta_data 는 브라우저에서 아무 값이나 넣을 수 있는 자리입니다.
  //    초대가 없는 사람이 role=admin 을 실어 보내도 현장·승인 대기여야 합니다.
  psql(`insert into auth.users (id, email, raw_user_meta_data)
        values (gen_random_uuid(), 'sneaky@beonemirae.test',
                '{"role":"admin","name":"침입"}'::jsonb)`)
  const q = psql(`select role || '|' || (approved_at is null) || '|' || active
                    from public.profiles where email='sneaky@beonemirae.test'`)
  ok(q === 'field|true|false',
    '**가입 화면이 role=admin 을 보내도 관리자가 되지 않음** (초대 없는 사람)', q)

  //  서버(service_role)가 만든 계정은 지금까지처럼 역할이 붙습니다 — 0021.
  psql(`insert into auth.users (id, email, raw_app_meta_data)
        values (gen_random_uuid(), 'byserver@beonemirae.test', '{"role":"office"}'::jsonb)`)
  const r = psql(`select role || '|' || active from public.profiles where email='byserver@beonemirae.test'`)
  ok(r === 'office|true', '서버가 만든 계정은 지금까지처럼 역할이 붙음 (0021 그대로)', r)
}

// ── 11. 이미 가입에 쓰인 초대는 안 지운다 ───────────────────────────────────
{
  const r = tryAs(ADMIN, `select public.delete_staff_invite('new.driver@beonemirae.test')`)
  ok(!r.ok && /이미 가입에 쓰인/.test(r.out), '가입 근거는 기록으로 남김', err(r))
  run(`select public.upsert_staff_invite('temp@beonemirae.test','임시','field')`, ADMIN)
  const d = tryAs(ADMIN, `select public.delete_staff_invite('temp@beonemirae.test')`)
  ok(d.ok, '아직 안 쓴 초대는 지울 수 있음')
}

// ── 12. 차량 묶기 ───────────────────────────────────────────────────────────
{
  const r = tryAs(ADMIN, `select public.set_profile_vehicle('${D1}', '${VEH}')`)
  ok(r.ok, '관리자가 계정에 차량을 묶음', r.out.slice(0, 60))
  ok(psql(`select vehicle_id from public.profiles where id='${D1}'`) === VEH, '표에 들어감')
  const bad = tryAs(D1, `select public.set_profile_vehicle('${D1}', null)`)
  ok(!bad.ok && /관리자만/.test(bad.out), '기사가 자기 차량을 못 바꿈', err(bad))
  const ghost = tryAs(ADMIN, `select public.set_profile_vehicle('${D1}', gen_random_uuid())`)
  ok(!ghost.ok && /차량을 찾을 수 없습니다/.test(ghost.out), '없는 차량은 막음', err(ghost))
  const off = tryAs(ADMIN, `select public.set_profile_vehicle('${D1}', null)`)
  ok(off.ok, '해제도 됨')
  run(`select public.set_profile_vehicle('${D1}', '${VEH}')`, ADMIN)
}

// ── 13. 병원 계정은 아무 영향 없다 ──────────────────────────────────────────
{
  const HOSP = psql(`select id from public.profiles where email='as2-hosp@beonemirae.test'`)
  const seen = tryAs(HOSP, 'select count(*) from public.clients')
  ok(seen.ok && seen.out === '1', '**병원 계정은 원래대로 자기 병원만** (0006 그대로)', seen.out)
  const inv = tryAs(HOSP, 'select count(*) from public.staff_invites')
  ok(inv.ok && inv.out === '0', '병원은 초대 목록을 못 봄', inv.out)
}

// ── 14. 돈은 하나도 안 건드린다 ─────────────────────────────────────────────
{
  const cols = psql(`select count(*) from information_schema.columns
                      where table_schema='public'
                        and table_name in ('client_assignments','staff_invites')
                        and column_name in ('amount','price','total','sale_price')`)
  ok(cols === '0', '새 표에 금액 칸이 없음')
  ok(psql(`select coalesce(sum(amount),0) from public.payments`) === '0', '청구 금액이 안 바뀜')
  //  비밀번호를 담지 않습니다.
  const pw = psql(`select count(*) from information_schema.columns
                    where table_schema='public' and table_name='staff_invites'
                      and column_name ~ 'pass|pwd|secret'`)
  ok(pw === '0', '**초대 표에 비밀번호 칸이 없음** — 본인이 정합니다')
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
