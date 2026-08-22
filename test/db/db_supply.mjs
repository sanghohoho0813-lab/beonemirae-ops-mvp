import { execFileSync, spawn as spawnProc } from 'node:child_process'

//  자재 공급 — 「병원에 박스를 줬다」를 기록하는 길.
//
//   이 기록은 두 군데에 닿습니다.
//    · 사무실 재고가 그만큼 줄어듭니다
//    · **월말 청구에 자재비로 들어갑니다** — 즉 돈입니다
//
//   지금 자재 화면의 공급 등록은 이렇게 돕니다(DataContext.addMaterial).
//     1) materials 에 한 줄 넣고
//     2) **화면이 들고 있던 재고 값**에서 뺀 절대값을 office_stock 에 씁니다
//     3) 원장에 한 줄 넣고
//     4) 감사기록을 남깁니다
//
//   네 번의 요청이고, 2)는 오래된 값을 기준으로 덮어씁니다.
//   여기서 그게 무엇을 만드는지 재현합니다.
const DB = 'supq'
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
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}
const OFFICE = mk('sup-office@beonemirae.test', 'office')
const FIELD = mk('sup-field@beonemirae.test', 'field')

psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[자재]가나병원','병원','',true,false) on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[자재]가나병원' limit 1`)
const TODAY = psql(`select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`)

const setStock = (n) => psql(`update public.office_stock set corrugated_box=${n}, plastic_container=${n},
                              bag=${n}, needle_box=${n} where id=1`)
const stock = () => Number(psql(`select corrugated_box from public.office_stock where id=1`))
const supplies = () => Number(psql(`select count(*) from public.materials where client_id='${CID}'`))
const boxes = () => Number(psql(`select coalesce(sum(box_count),0) from public.materials where client_id='${CID}'`))
const clearSup = () => psql(`delete from public.material_transactions where client_id='${CID}';
                             delete from public.materials where client_id='${CID}'`)

ok(Number(psql(`select public.app_schema_version()`)) >= 43, 'DB 판이 43 이상', psql(`select public.app_schema_version()`))

// ── 1. 같은 공급을 다시 저장하면? ─────────────────────────────────────────
//   통신이 끊긴 줄 알고 다시 누른 경우입니다.
{
  clearSup(); setStock(100)
  const RID = psql(`select gen_random_uuid()`)
  const give = (rid) => tryAs(OFFICE,
    `select public.supply_materials('${CID}', '${TODAY}'::date, 10, 20, 3, false, '', ${rid})`)

  const a = give(`'${RID}'::uuid`)
  ok(a.ok, '자재 공급이 기록됨 (박스 10 · 비닐 20 · 바늘통 3)', a.ok ? '' : a.out.slice(0, 70))
  const b = give(`'${RID}'::uuid`)
  ok(b.ok, '다시 눌러도 오류가 아니라 성공으로 돌아옴')
  ok(/"alreadySaved" *: *true/.test(b.out), '「이미 저장됨」이라고 알려 줌')
  ok(supplies() === 1, '장부에는 한 줄', `${supplies()}줄`)
  ok(boxes() === 10, '박스 10개 — 20개가 아님 (청구에 두 배로 들어가지 않음)', `${boxes()}개`)
  ok(stock() === 90, '재고도 한 번만 빠짐 (100 → 90)', `${stock()}개`)

  //  새 창(다른 표)이면 진짜 두 번째 공급 — 들어가야 합니다
  const c = give(`gen_random_uuid()`)
  ok(c.ok && supplies() === 2 && boxes() === 20, '새 표로는 두 번째 공급이 정상 기록됨',
    `${supplies()}줄 · 박스 ${boxes()}개`)
  ok(stock() === 80, '재고가 두 번 빠짐 (90 → 80)', `${stock()}개`)
}

// ── 2. 두 사람이 같은 순간에 공급하면? ────────────────────────────────────
//   지금은 화면이 「내가 아는 재고 − 이번 수량」이라는 **절대값**을 씁니다.
//   둘 다 같은 옛 값을 보고 있으면 나중에 쓴 쪽이 앞 차감을 지웁니다.
{
  clearSup(); setStock(100)
  const sql = (rid) =>
    `set local role authenticated; set local request.jwt.claims = '{"sub":"${OFFICE}","role":"authenticated"}'; ` +
    `select pg_sleep(0.2); select public.supply_materials('${CID}', '${TODAY}'::date, 10, 0, 0, false, '', '${rid}'::uuid)`
  const spawn = (rid) =>
    new Promise((resolve) => {
      const cp = spawnProc('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
        '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql(rid)])
      let se = ''
      cp.stderr.on('data', (d) => { se += d })
      cp.on('close', (code) => resolve({ code, se }))
    })
  const ids = [psql(`select gen_random_uuid()`), psql(`select gen_random_uuid()`), psql(`select gen_random_uuid()`)]
  const res = await Promise.all(ids.map(spawn))
  const okCount = res.filter((r) => r.code === 0).length
  ok(okCount === 3, '세 사람이 같은 순간에 공급 — 셋 다 저장됨', `${okCount}건`)
  ok(supplies() === 3, '자재 기록 3줄', `${supplies()}줄`)
  ok(stock() === 70, '재고가 30개 빠짐 (100 → 70) — 한 사람 것이 사라지지 않음', `${stock()}개`)
}

// ── 3. 재고보다 많이 공급할 수는 없다 ─────────────────────────────────────
{
  clearSup(); setStock(5)
  const over = tryAs(OFFICE, `select public.supply_materials('${CID}', '${TODAY}'::date, 10, 0, 0, false, '', gen_random_uuid())`)
  ok(!over.ok, '재고 5개인데 10개를 줄 수는 없음', (over.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 55))
  ok(stock() === 5 && supplies() === 0, '막힌 뒤 재고도 기록도 그대로 (한 트랜잭션)', `재고 ${stock()} · ${supplies()}줄`)
}

// ── 4. 0개 공급 · 음수 ────────────────────────────────────────────────────
{
  clearSup(); setStock(100)
  const zero = tryAs(OFFICE, `select public.supply_materials('${CID}', '${TODAY}'::date, 0, 0, 0, false, '', gen_random_uuid())`)
  ok(!zero.ok, '아무것도 안 준 공급은 기록하지 않음', (zero.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 45))
  const neg = tryAs(OFFICE, `select public.supply_materials('${CID}', '${TODAY}'::date, -5, 0, 0, false, '', gen_random_uuid())`)
  ok(!neg.ok, '음수 수량은 막힘')
  ok(stock() === 100, '재고 그대로', `${stock()}개`)
}

// ── 5. 오지 않은 날짜 ─────────────────────────────────────────────────────
{
  const future = tryAs(OFFICE, `select public.supply_materials('${CID}', (date '${TODAY}' + 1), 1, 0, 0, false, '', gen_random_uuid())`)
  ok(!future.ok && /아직 오지 않은/.test(future.out), '내일 날짜로는 공급을 기록할 수 없음')
}

// ── 6. 권한 ───────────────────────────────────────────────────────────────
{
  clearSup(); setStock(100)
  const asField = tryAs(FIELD, `select public.supply_materials('${CID}', '${TODAY}'::date, 1, 0, 0, false, '', gen_random_uuid())`)
  ok(asField.ok, '현장 담당자도 자재를 줄 수 있음 (현장에서 실제로 줍니다)', asField.ok ? '' : asField.out.slice(0, 60))
}

// ── 7. 재고 입고도 같은 문제였습니다 ──────────────────────────────────────
//   「내가 아는 재고 + 넣을 양」을 절대값으로 썼습니다.
{
  setStock(100)
  const RID = psql(`select gen_random_uuid()`)
  const take = (rid) => tryAs(OFFICE, `select public.receive_stock(50, 0, 0, 0, '월초 입고', ${rid})`)
  const a = take(`'${RID}'::uuid`)
  ok(a.ok, '입고 50개가 기록됨', a.ok ? '' : a.out.slice(0, 60))
  ok(stock() === 150, '재고 150개', `${stock()}개`)
  const b = take(`'${RID}'::uuid`)
  ok(b.ok && stock() === 150, '다시 눌러도 150개 — 200개가 되지 않음', `${stock()}개`)

  //  동시 입고 — 둘 다 더해져야 합니다
  setStock(100)
  const sql = (rid) =>
    `set local role authenticated; set local request.jwt.claims = '{"sub":"${OFFICE}","role":"authenticated"}'; ` +
    `select pg_sleep(0.2); select public.receive_stock(50, 0, 0, 0, '동시 입고', '${rid}'::uuid)`
  const spawn = (rid) =>
    new Promise((resolve) => {
      const cp = spawnProc('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
        '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql(rid)])
      cp.on('close', (code) => resolve(code))
    })
  await Promise.all([psql(`select gen_random_uuid()`), psql(`select gen_random_uuid()`)].map(spawn))
  ok(stock() === 200, '두 사람이 같은 순간에 50개씩 넣으면 200개 (150 이 아님)', `${stock()}개`)
}

// ── 8. 원장·감사기록이 함께 남는가 ────────────────────────────────────────
{
  clearSup(); setStock(100)
  const before = Number(psql(`select count(*) from public.audit_logs where action='material.supply'`))
  tryAs(OFFICE, `select public.supply_materials('${CID}', '${TODAY}'::date, 7, 0, 0, false, '기록 확인', gen_random_uuid())`)
  const after = Number(psql(`select count(*) from public.audit_logs where action='material.supply'`))
  ok(after === before + 1, '감사기록이 한 줄 남음')
  const led = Number(psql(`select count(*) from public.material_transactions
                           where client_id='${CID}' and kind='공급'`))
  ok(led >= 1, '자재 원장에도 남음 (재고가 왜 줄었는지 되짚을 수 있게)', `${led}줄`)
  const linked = psql(`select count(*) from public.material_transactions t
                       join public.materials m on m.id = t.material_id where t.client_id='${CID}'`)
  ok(Number(linked) >= 1, '원장이 어느 공급에서 나온 것인지 이어져 있음')
}

const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
