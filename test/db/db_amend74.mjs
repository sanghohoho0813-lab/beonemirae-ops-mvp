import { execFileSync } from 'node:child_process'

//  0074 — 잘못 들어온 기록을 고칠 수 있는가.
//
//   ⚠ amend_collection 은 계산을 새로 쓰지 않고 revert + complete 를
//     한 트랜잭션에서 부릅니다. 그래서 여기서 봐야 할 것은 「계산이 맞나」가
//     아니라 **「둘을 이어 붙인 자리가 새지 않나」** 입니다.
//
//   확인하는 것
//    · 수거량·시간·특이사항을 고칠 수 있다
//    · 자재 공급량을 고치면 **재고가 그 차이만큼만** 움직인다
//    · 자재를 0 으로 고치면 재고가 전부 돌아온다
//    · 중간에 실패하면 **아무 일도 없던 것처럼** 돌아간다 (반쯤 고쳐지지 않는다)
//    · 확정한 청구에 들어간 기록은 못 고친다 (0073 방아쇠가 잡는다)
//    · 이미 취소된 기록은 못 고친다
//    · 사유 없이는 못 고친다 · 현장 계정은 못 고친다
//    · 무엇이 무엇으로 바뀌었는지 감사기록에 남고 두 기록이 이어진다
//    · 재고 정정은 숫자를 덮어쓰지 않고 원장에 이유와 함께 남는다
//    · 있는 것보다 많이 뺄 수 없다

const DB = 'amend74'
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close', '0074_amend']) {
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 150)

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const ADM = mk('a74@x.test', 'admin')
const FLD = mk('f74@x.test', 'field')

const CIDS = ['가', '나', '다', '라'].map((k) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste)
        values ('[검증74]수정${k}병원','병원','',true) on conflict do nothing`)
  return psql(`select id from public.clients where name='[검증74]수정${k}병원' limit 1`)
})
psql(`insert into public.vehicles (name, waste_type, driver) values ('[검증74]1호차','의료폐기물','')
      on conflict do nothing`)
const VID = psql(`select id from public.vehicles where name='[검증74]1호차' limit 1`)

//  창고에 넉넉히 채워 둡니다 — 재고가 모자라서 나는 실패와 헷갈리지 않게.
psql(`update public.office_stock set corrugated_box=100, plastic_container=100, bag=100, needle_box=100 where id=1`)
const stock = (col = 'corrugated_box') => Number(psql(`select ${col} from public.office_stock where id=1`))

const complete = (cid, over = {}) => {
  const p = {
    clientId: cid, wasteType: '의료폐기물', actualAmount: 100, actualTime: '09:30',
    vehicleId: VID, date: TODAY, memo: '처음 입력', driverName: '김기사',
    supplied: { corrugatedBox: 10, plasticContainer: 0, bag: 0, needleBox: 0 },
    ...over,
  }
  return tryAs(ADM, `select public.complete_collection('${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`)
}
const amend = (eid, reason, p, uid = ADM) =>
  tryAs(uid, `select public.amend_collection('${eid}'::uuid, '${reason}', '${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`)
const eventOf = (cid) =>
  psql(`select id from public.collection_events where client_id='${cid}' and not reverted order by at desc limit 1`)

console.log('── 고쳐 넣기 ──')
{
  const before = stock()
  const c = complete(CIDS[0])
  ok(c.ok, '① 먼저 한 건 넣는다', err(c))
  ok(stock() === before - 10, '② 자재 10개 나가서 재고가 줄었다', `${before} → ${stock()}`)
  const eid = eventOf(CIDS[0])

  //  수거량과 시간과 특이사항을 한꺼번에 고칩니다.
  const a = amend(eid, '기사님이 자릿수를 잘못 눌렀습니다', {
    actualAmount: 320, actualTime: '11:05', vehicleId: VID, memo: '3층 앞에서 인수',
    supplied: { corrugatedBox: 10, plasticContainer: 0, bag: 0, needleBox: 0 },
  })
  ok(a.ok, '③ **수거량·시간·특이사항을 고칠 수 있다**', err(a))
  const row = psql(`select actual_amount || '/' || actual_time || '/' || memo
                    from public.schedules where client_id='${CIDS[0]}' and date='${TODAY}'`)
  ok(row === '320/11:05/3층 앞에서 인수', '④ 고친 값이 그대로 들어갔다', row)
  ok(stock() === before - 10, '⑤ **자재를 안 건드렸으면 재고도 그대로**', `${stock()}`)

  //  원본은 지워지지 않고 「취소됨」으로 남습니다.
  const old = psql(`select reverted::text from public.collection_events where id='${eid}'`)
  ok(old === 'true', '⑥ 원본은 지워지지 않고 「취소됨」으로 남는다', old)
  const n = psql(`select count(*) from public.collection_events where client_id='${CIDS[0]}'`)
  ok(n === '2', '⑦ 기록이 둘 — 무엇이 무엇으로 바뀌었는지 남는다', `${n}줄`)
  const link = psql(`select (after_data->>'fromEventId') from public.audit_logs
                     where action='collection.amend' order by at desc limit 1`)
  ok(link === eid, '⑧ 감사기록이 옛 기록과 이어진다', link.slice(0, 12))
  const why = psql(`select summary from public.audit_logs where action='collection.amend' order by at desc limit 1`)
  ok(/자릿수/.test(why), '⑨ 왜 고쳤는지 남는다', why.slice(0, 60))
}

console.log('── 자재 수량을 고치면 재고가 그만큼만 ──')
{
  const before = stock()
  const c = complete(CIDS[1], { supplied: { corrugatedBox: 12, plasticContainer: 0, bag: 0, needleBox: 0 } })
  ok(c.ok, '⑩ 자재 12개로 한 건', err(c))
  ok(stock() === before - 12, '⑪ 12개 빠졌다', `${before} → ${stock()}`)
  const eid = eventOf(CIDS[1])

  const a = amend(eid, '실제로는 4개만 드렸습니다', {
    actualAmount: 100, actualTime: '09:30', vehicleId: VID,
    supplied: { corrugatedBox: 4, plasticContainer: 0, bag: 0, needleBox: 0 },
  })
  ok(a.ok, '⑫ 자재 수량을 고칠 수 있다', err(a))
  //  ⚠ 12 → 4 이면 재고는 8개 **돌아와야** 합니다. 빼기만 두 번 하면 안 됩니다.
  ok(stock() === before - 4, '⑬ **재고가 그 차이만큼만 움직인다** (12→4 이면 8개 돌아옴)',
    `${before} → ${stock()} (기대 ${before - 4})`)

  const a2 = amend(eventOf(CIDS[1]), '자재는 안 드렸습니다', {
    actualAmount: 100, actualTime: '09:30', vehicleId: VID,
    supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  })
  ok(a2.ok, '⑭ 자재를 0 으로 고칠 수 있다', err(a2))
  ok(stock() === before, '⑮ **0 으로 고치면 재고가 전부 돌아온다**', `${stock()} (기대 ${before})`)
}

console.log('── 실패하면 아무 일도 없던 것처럼 ──')
{
  const before = stock()
  const c = complete(CIDS[2], { supplied: { corrugatedBox: 5, plasticContainer: 0, bag: 0, needleBox: 0 } })
  ok(c.ok, '⑯ 한 건 더 넣는다', err(c))
  const eid = eventOf(CIDS[2])
  const kgBefore = psql(`select actual_amount from public.schedules where client_id='${CIDS[2]}' and date='${TODAY}'`)

  //  창고에 없는 만큼 공급하려 하면 complete 쪽이 막습니다.
  //  ⚠ 그때 **되돌리기까지 같이 무효**가 되어야 합니다. 아니면 자재가
  //    돌아온 채로 수거만 사라진, 반쯤 고쳐진 상태가 남습니다.
  const bad = amend(eid, '재고보다 많이', {
    actualAmount: 100, actualTime: '09:30', vehicleId: VID,
    supplied: { corrugatedBox: 99999, plasticContainer: 0, bag: 0, needleBox: 0 },
  })
  ok(!bad.ok && /재고/.test(bad.out), '⑰ 재고보다 많이 고치려 하면 막힌다', err(bad))
  ok(stock() === before - 5, '⑱ **막힌 뒤 재고가 그대로다** (반쯤 돌아가지 않음)', `${stock()} (기대 ${before - 5})`)
  const kgAfter = psql(`select actual_amount from public.schedules where client_id='${CIDS[2]}' and date='${TODAY}'`)
  ok(kgAfter === kgBefore, '⑲ 일정도 그대로다', `${kgBefore} → ${kgAfter}`)
  const rev = psql(`select reverted::text from public.collection_events where id='${eid}'`)
  ok(rev === 'false', '⑳ 수거 기록도 살아 있다 (되돌리기가 무효로 돌아감)', rev)
}

console.log('── 못 고치는 것들 ──')
{
  const eid = eventOf(CIDS[2])
  const blank = amend(eid, '   ', { actualAmount: 50, actualTime: '09:30', vehicleId: VID })
  ok(!blank.ok && /적어 주세요/.test(blank.out), '㉑ 사유 없이는 못 고친다', err(blank))

  const byField = amend(eid, '내가 고치겠다', { actualAmount: 50, actualTime: '09:30', vehicleId: VID }, FLD)
  ok(!byField.ok && /사무실|관리자/.test(byField.out), '㉒ **현장 계정은 못 고친다**', err(byField))

  //  이미 취소된 기록
  const c = complete(CIDS[3], { supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 } })
  ok(c.ok, '㉓ 한 건 더', err(c))
  const gone = eventOf(CIDS[3])
  const rv = tryAs(ADM, `select public.revert_collection_with_reason('${gone}'::uuid, '취소')`)
  ok(rv.ok, '㉔ 그 건을 취소한다', err(rv))
  const after = amend(gone, '고쳐 보겠다', { actualAmount: 50, actualTime: '09:30', vehicleId: VID })
  ok(!after.ok && /취소된/.test(after.out), '㉕ 취소된 기록은 못 고친다', err(after))

  //  확정한 청구에 들어간 기록 — 0073 방아쇠가 잡습니다.
  const sid = psql(`select id from public.schedules where client_id='${CIDS[2]}' and date='${TODAY}' limit 1`)
  psql(`insert into public.payments (client_id, billing_month, amount, status, snapshot)
        values ('${CIDS[2]}', '${TODAY.slice(0, 7)}', 500000, '미수금',
                jsonb_build_object('scheduleIds', jsonb_build_array('${sid}'), 'materialIds', '[]'::jsonb))`)
  const billed = amend(eventOf(CIDS[2]), '청구 뒤에 고치기', { actualAmount: 77, actualTime: '09:30', vehicleId: VID })
  ok(!billed.ok && /청구/.test(billed.out), '㉖ **확정한 청구에 들어간 기록은 못 고친다**', err(billed))
  const kg = psql(`select actual_amount from public.schedules where id='${sid}'`)
  ok(kg !== '77', '㉗ 막힌 뒤 값이 그대로다', kg)
}

console.log('── 재고 정정 ──')
{
  const before = stock()
  const bad = tryAs(ADM, `select public.correct_stock('corrugatedBox', -1, '  ')`)
  ok(!bad.ok && /왜/.test(bad.out), '㉘ 이유 없이는 못 바로잡는다', err(bad))

  const zero = tryAs(ADM, `select public.correct_stock('corrugatedBox', 0, '아무것도')`)
  ok(!zero.ok, '㉙ 0개는 정정이 아니다', err(zero))

  const c = tryAs(ADM, `select public.correct_stock('corrugatedBox', -1, '입고 오류 정정 (11개로 잘못 적음)')`)
  ok(c.ok, '㉚ **한 개 빼는 정정이 된다**', err(c))
  ok(stock() === before - 1, '㉛ 재고가 딱 한 개 줄었다', `${before} → ${stock()}`)

  const tx = psql(`select kind || '/' || qty || '/' || memo from public.material_transactions
                   where kind='조정' order by created_at desc limit 1`)
  ok(tx === '조정/-1/입고 오류 정정 (11개로 잘못 적음)', '㉜ **원장에 이유와 함께 한 줄 남는다**', tx)
  const who = psql(`select count(*) from public.material_transactions
                    where kind='조정' and created_by='${ADM}'`)
  ok(who === '1', '㉝ 누가 했는지 남는다', `${who}줄`)
  const al = psql(`select count(*) from public.audit_logs where action='stock.correct'`)
  ok(al === '1', '㉞ 감사기록에도 남는다', `${al}줄`)

  const many = tryAs(ADM, `select public.correct_stock('bag', -99999, '있는 것보다 많이')`)
  ok(!many.ok && /뺄 수 없/.test(many.out), '㉟ **있는 것보다 많이 뺄 수 없다**', err(many))

  const byField = tryAs(FLD, `select public.correct_stock('bag', -1, '내가')`)
  ok(!byField.ok, '㊱ 현장 계정은 재고를 못 바로잡는다', err(byField))
}

console.log('── 판 번호 ──')
ok(psql(`select public.app_schema_version()`) === '74', '㊲ app_schema_version = 74 (73 에서 올라감)')
