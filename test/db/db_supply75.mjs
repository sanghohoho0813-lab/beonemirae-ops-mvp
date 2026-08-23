import { execFileSync } from 'node:child_process'

//  0075 — 자재 공급을 규격별로 기록한다.
//
//   ⚠ 여기가 헐거우면 **원가가 틀립니다.** 63L 박스와 12L 박스는 매입가가
//     다른데, 규격이 안 남으면 정산이 대표 규격으로 추정합니다.
//
//   확인하는 것
//    · 규격별로 저장되고, 옛 3칸도 **규격에서 계산돼** 함께 채워진다
//    · 재고가 규격 → 재고 칸 합계만큼만 빠진다
//    · 모르는 규격은 조용히 버리지 않고 거절한다
//    · 음수·빈 값은 거절한다
//    · 재고보다 많이 주면 막고, 그때 **아무것도 안 바뀐다**
//    · 같은 저장 표를 두 번 보내면 한 번만 (연타·통신 끊김)
//    · 원장과 감사기록에 규격이 그대로 남는다
//    · 병원 계정은 못 넣는다

const DB = 'supply75'
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close',
                 '0074_amend', '0075_supply_items']) {
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 140)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
psql(`insert into public.clients (name, type, address, collects_medical_waste)
      values ('[검증75]자재병원','병원','',true) on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[검증75]자재병원' limit 1`)
const ADM = mk('a75@x.test', 'admin')
const FLD = mk('f75@x.test', 'field')
const CLI = mk('c75@x.test', 'client', CID)

psql(`update public.office_stock set corrugated_box=100, plastic_container=50, bag=80, needle_box=10 where id=1`)
const st = (c) => Number(psql(`select ${c} from public.office_stock where id=1`))

const supply = (items, uid = ADM, req = null, memo = '') =>
  tryAs(uid, `select public.supply_materials_items('${CID}'::uuid, '${TODAY}'::date,
    '${JSON.stringify(items).replace(/'/g, "''")}'::jsonb, false, '${memo}',
    ${req ? `'${req}'::uuid` : 'null'})`)

console.log('── 규격별로 남는다 ──')
{
  const before = [st('corrugated_box'), st('plastic_container'), st('bag')]
  const r = supply({ box63: 4, box12: 8, plastic20: 3, diaperBag40: 5 })
  ok(r.ok, '① 규격별로 저장된다', err(r))

  const items = psql(`select items::text from public.materials where client_id='${CID}' order by id desc limit 1`)
  ok(/box63/.test(items) && /box12/.test(items) && /plastic20/.test(items),
    '② **규격이 그대로 남는다** (예전에는 「박스 12」로 뭉갰습니다)', items.slice(0, 70))

  //  ⚠ 옛 3칸은 통계·리포트가 아직 읽습니다. 규격에서 **계산돼** 있어야 합니다.
  const legacy = psql(`select box_count || '/' || vinyl_count || '/' || needle_box_count
                       from public.materials where client_id='${CID}' order by id desc limit 1`)
  ok(legacy === '12/5/3', '③ 옛 3칸도 규격에서 계산돼 채워진다 (박스12 · 봉투5 · 합성수지3)', legacy)

  ok(st('corrugated_box') === before[0] - 12, '④ 골판지 재고가 12개만 빠졌다', `${before[0]} → ${st('corrugated_box')}`)
  ok(st('plastic_container') === before[1] - 3, '⑤ 합성수지 재고가 3개만 빠졌다', `${before[1]} → ${st('plastic_container')}`)
  ok(st('bag') === before[2] - 5, '⑥ 봉투 재고가 5개만 빠졌다', `${before[2]} → ${st('bag')}`)

  const tx = psql(`select string_agg(item || ':' || qty, ' ' order by item)
                   from public.material_transactions where kind='공급'`)
  ok(/corrugatedBox:-12/.test(tx) && /plasticContainer:-3/.test(tx) && /bag:-5/.test(tx),
    '⑦ 원장에 재고 칸별로 남는다', tx)
  const al = psql(`select summary from public.audit_logs where action='material.supply' order by at desc limit 1`)
  ok(/63L 박스 4/.test(al) && /12L 박스 8/.test(al),
    '⑧ **감사기록에 규격 그대로** (「박스 12」가 아니라)', al.slice(0, 80))
}

console.log('── 못 넣는 것들 ──')
{
  const bad = supply({ box63: 1, 없는규격: 2 })
  ok(!bad.ok && /모르는 규격/.test(bad.out), '⑨ **모르는 규격은 조용히 버리지 않고 거절**', err(bad))

  const neg = supply({ box63: -3, plastic20: 10 })
  ok(!neg.ok && /0보다 작을/.test(neg.out), '⑩ 음수는 거절 (재고가 늘어납니다)', err(neg))

  const zero = supply({ box63: 0 })
  ok(!zero.ok && /수량을 넣어/.test(zero.out), '⑪ 전부 0이면 거절', err(zero))

  const future = tryAs(ADM, `select public.supply_materials_items('${CID}'::uuid,
    ('${TODAY}'::date + 1), '{"box63":1}'::jsonb, false, '', null)`)
  ok(!future.ok, '⑫ 아직 오지 않은 날짜는 거절', err(future))

  const byClient = supply({ box63: 1 }, CLI)
  ok(!byClient.ok, '⑬ 병원 계정은 못 넣는다', err(byClient))

  const byField = supply({ box63: 1 }, FLD)
  ok(byField.ok, '⑭ **기사님은 넣을 수 있다** (현장에서 직접 건네줍니다)', err(byField))
}

console.log('── 재고보다 많이 ──')
{
  const before = [st('corrugated_box'), st('plastic_container')]
  const n = psql(`select count(*) from public.materials where client_id='${CID}'`)
  const over = supply({ box63: 99999, plastic20: 1 })
  ok(!over.ok && /재고/.test(over.out), '⑮ 재고보다 많이 주면 막힌다', err(over))
  ok(st('corrugated_box') === before[0], '⑯ **막힌 뒤 재고가 그대로다**', `${st('corrugated_box')}`)
  ok(st('plastic_container') === before[1], '⑰ 다른 칸도 그대로다 (반쯤 빠지지 않음)', `${st('plastic_container')}`)
  ok(psql(`select count(*) from public.materials where client_id='${CID}'`) === n,
    '⑱ 기록도 안 생겼다', n)
}

console.log('── 연타 · 통신 끊김 ──')
{
  const req = psql(`select gen_random_uuid()`)
  const before = st('corrugated_box')
  const a = supply({ box35: 6 }, ADM, req)
  ok(a.ok && /"alreadySaved" *: *false/.test(a.out), '⑲ 처음 저장', a.out.slice(0, 60))
  const b = supply({ box35: 6 }, ADM, req)
  ok(b.ok && /"alreadySaved" *: *true/.test(b.out), '⑳ **같은 표는 두 번째부터 이미 저장됨**', b.out.slice(0, 60))
  ok(st('corrugated_box') === before - 6, '㉑ 재고는 한 번만 빠졌다', `${before} → ${st('corrugated_box')}`)
  const n = psql(`select count(*) from public.materials where request_id='${req}'`)
  ok(n === '1', '㉒ 기록도 한 줄뿐', `${n}줄`)
}

console.log('── 규격표 ──')
{
  const n = psql(`select count(*) from public.item_buckets`)
  ok(n === '13', '㉓ 규격이 13가지 (4가지가 아니라)', `${n}가지`)
  //  ⚠ 화면(src/lib/billing.ts)과 같은 표여야 합니다. 어긋나면 화면에서 고른
  //    규격을 서버가 모른다고 거절합니다.
  const miss = psql(`select coalesce(string_agg(item, ','), '') from public.item_buckets
                     where item not in ('plastic2','plastic5','plastic10','plastic20','box63','box35',
                                        'box30','box12','box4','box79','diaperBoxM','pouch12','diaperBag40')`)
  ok(miss === '', '㉔ 화면 품목표와 정확히 같다', miss || '어긋남 없음')
  const w = tryAs(ADM, `insert into public.item_buckets (item, bucket) values ('장난','bag')`)
  ok(!w.ok, '㉕ 규격표는 화면에서 못 고친다 (마이그레이션으로만)', err(w))
}

console.log('── 판 번호 ──')
ok(psql(`select public.app_schema_version()`) === '75', '㉖ app_schema_version = 75 (74 에서 올라감)')
