import { execFileSync } from 'node:child_process'

//  0079 — 규격별 재고 (2L 합성수지 … 기저귀비닐 40L)
//
//   대표님: 「2L 합성수지 ~ 기저귀비닐 40L 까지도 수량을 실시간으로 확인할 수
//   있게 해줘. 지금은 4개밖에 없어서 불편해.」
//
//   여기서 제일 중요한 검사는 **지어내지 않는다**는 것입니다.
//   골판지 480 개가 63L 몇 개인지 아무도 모릅니다. 세어 보기 전까지는
//   「모름」이어야 하고, 0 개로 적으면 안 됩니다 — 대표님이 그 0 을 보고
//   발주하시면 창고에 쌓여 있는데 또 사는 일이 생깁니다.

const DB = 'items79'
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close',
                 '0074_amend', '0075_supply_items', '0076_snooze_who', '0077_schedule_origin',
                 '0079_stock_items']) {
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

//  ⚠ 0083 — 여기 **검사가 틀려 있었습니다.**
//
//    제품은 「오늘」을 한국 시각으로 봅니다
//    (`(now() at time zone 'Asia/Seoul')::date` — 회사가 한국에서 돕니다).
//    그런데 검사는 `${KST}` 를 썼고, 이 서버는 UTC 입니다.
//
//    한국이 자정을 넘긴 뒤(UTC 15:00~24:00, 한국 00:00~09:00)에는 UTC 날짜가
//    아직 어제라, 검사가 말하는 「내일」이 실제로는 **한국의 오늘**이 됩니다.
//    그래서 「앞날 공급을 막는가」가 하루 9시간 동안 조용히 실패했습니다.
//    제품이 아니라 자가 틀린 것입니다.
const KST = `(now() at time zone 'Asia/Seoul')::date`
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 130)

// ── 사람과 거래처 ─────────────────────────────────────────────────────────
const AD = '00000000-0000-0000-0000-0000000000a9'
const FD = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
for (const [id, name, role] of [[AD, '송대표', 'admin'], [FD, '김준기', 'field']]) {
  psql(`insert into auth.users (id, email) values ('${id}', '${role}@b.c') on conflict do nothing`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}', '${role}@b.c', '${name}', '${role}', true, now())
        on conflict (id) do update set role = excluded.role, active = true, approved_at = now()`)
}
psql(`insert into public.clients (id, name, type, address, collects_medical_waste)
      values ('${C1}', '남양주백병원', '병원', '경기도 남양주시 오남읍 1', true)
      on conflict (id) do nothing`)
//  네 칸에는 이미 값이 있습니다 — 실제 운영과 같은 출발점입니다.
psql(`update public.office_stock
         set corrugated_box = 480, plastic_container = 360, bag = 900, needle_box = 300
       where id = 1`)

const qtyOf = (item) =>
  psql(`select coalesce(qty::text, 'NULL') from public.office_stock_items where item = '${item}'`)
const bucket = (col) => Number(psql(`select ${col} from public.office_stock where id = 1`))

// ── ① 13 규격이 「모름」으로 깔려 있다 ────────────────────────────────────
{
  const n = Number(psql('select count(*) from public.office_stock_items'))
  ok(n === 13, '**13 규격이 전부 있다** (2L 합성수지 … 기저귀비닐 40L)', `${n}개`)

  const unknown = Number(psql('select count(*) from public.office_stock_items where qty is null'))
  //  ⚠ 이것이 이 검사의 핵심입니다.
  ok(unknown === 13, '**처음에는 13 개 전부 「모름」이다** (지어낸 숫자가 없다)', `모름 ${unknown}개`)

  const zero = Number(psql('select count(*) from public.office_stock_items where qty = 0'))
  ok(zero === 0, '**0 개로 적어 둔 규격이 없다** — 「모름」과 「0 개」는 다릅니다', `0개로 적힌 것 ${zero}`)

  //  네 칸은 손대지 않았습니다.
  ok(bucket('corrugated_box') === 480 && bucket('bag') === 900,
    '**네 칸 합계는 그대로다** (쪼개지 않았습니다)', `골판지 ${bucket('corrugated_box')} · 봉투 ${bucket('bag')}`)

  const labels = psql(`select string_agg(b.label, ', ' order by b.item)
                         from public.office_stock_items s join public.item_buckets b on b.item = s.item`)
  ok(/2L 합성수지/.test(labels) && /기저귀비닐 40L/.test(labels),
    '대표님이 말씀하신 양 끝이 다 있다', labels.slice(0, 60) + '…')
}

// ── ② 세어 보면 숫자가 된다 ───────────────────────────────────────────────
{
  const r = tryAs(AD, `select public.count_stock_item('box63', 120, '창고 실사')`)
  ok(r.ok, '대표가 63L 박스를 세어 넣는다', err(r))
  ok(qtyOf('box63') === '120', '**「모름」이 120 개가 된다**', qtyOf('box63'))
  ok(psql(`select counted_at is not null from public.office_stock_items where item = 'box63'`) === 't',
    '언제 세었는지도 남는다')

  //  ⚠ 세는 것은 창고에 물건이 늘거나 주는 일이 아닙니다.
  ok(bucket('corrugated_box') === 480, '**세어도 네 칸 합계는 안 움직인다**', String(bucket('corrugated_box')))

  const led = psql(`select memo from public.material_transactions
                     where item_key = 'box63' and kind = '조정' order by created_at desc limit 1`)
  ok(/63L 박스 재고 실사 모름 → 120/.test(led), '**원장에 「모름 → 120」으로 남는다**', led)

  //  세지 않은 옆 규격은 그대로 모름입니다.
  ok(qtyOf('box35') === 'NULL', '옆 규격(35L)은 여전히 「모름」', qtyOf('box35'))
}

// ── ③ 다시 세면 그 수로 정해진다 (더하기가 아님) ─────────────────────────
{
  tryAs(AD, `select public.count_stock_item('box63', 90, '다시 셈')`)
  ok(qtyOf('box63') === '90', '**다시 세면 90 으로 정해진다** (120+90 이 아님)', qtyOf('box63'))
  const led = psql(`select qty from public.material_transactions
                     where item_key = 'box63' and kind = '조정' order by created_at desc limit 1`)
  ok(led === '-30', '원장에는 줄어든 만큼(-30)이 남는다', led)
}

// ── ④ 아무나 못 센다 ──────────────────────────────────────────────────────
{
  const r = tryAs(FD, `select public.count_stock_item('box63', 999, '기사')`)
  ok(!r.ok && /사무실·관리자만/.test(r.out), '**기사님은 재고를 못 센다**', err(r))
  ok(qtyOf('box63') === '90', '거절된 뒤에도 값이 안 바뀐다', qtyOf('box63'))

  //  ⚠ RLS 는 **오류를 내지 않고 0 줄을 고칩니다.** 그러니 「오류가 났나」가
  //    아니라 「정말 안 바뀌었나」를 봐야 합니다 — 오류만 보면 통과한 것처럼
  //    보이는데 값이 바뀌어 있을 수 있습니다.
  const w = tryAs(AD, `with u as (update public.office_stock_items set qty = 9999
                                   where item = 'box63' returning 1)
                        select count(*) from u`)
  ok(w.ok && w.out.trim() === '0',
    '**표를 직접 고치면 0 줄만 바뀐다** (원장 없이 바뀌는 길이 없다)', `${w.out.trim()}줄`)
  ok(qtyOf('box63') === '90', '그래서 값도 그대로', qtyOf('box63'))
}

// ── ⑤ 공급하면 세어 본 규격만 줄어든다 ───────────────────────────────────
{
  const before35 = qtyOf('box35')
  const r = tryAs(AD, `select public.supply_materials_items('${C1}'::uuid, ${KST},
    '{"box63": 10, "box35": 4}'::jsonb, false, '', null)`)
  ok(r.ok, '63L 10개 · 35L 4개를 공급한다', err(r))

  ok(qtyOf('box63') === '80', '**세어 본 63L 는 90 → 80 으로 줄어든다**', qtyOf('box63'))
  //  ⚠ 안 세어 본 규격은 여전히 모릅니다 — 모르는 수에서 4 를 빼도 모릅니다.
  ok(qtyOf('box35') === 'NULL' && before35 === 'NULL',
    '**안 세어 본 35L 는 여전히 「모름」** (0 으로 만들지 않는다)', qtyOf('box35'))

  //  네 칸 합계는 예전과 똑같이 14 개 줄어듭니다.
  ok(bucket('corrugated_box') === 480 - 14, '**네 칸 합계는 예전대로 14 개 줄어든다**',
    String(bucket('corrugated_box')))

  //  원장이 규격으로 남습니다.
  const rows = psql(`select string_agg(item_key || ':' || qty, ' · ' order by item_key)
                       from public.material_transactions where kind = '공급' and material_id is not null`)
  ok(/box35:-4/.test(rows) && /box63:-10/.test(rows), '**원장에 규격 그대로 남는다**', rows)

  //  ⚠ 칸별로 더하면 합계는 예전과 같아야 합니다 — 옛 화면·통계가 그걸 읽습니다.
  const sum = psql(`select sum(qty) from public.material_transactions
                     where kind = '공급' and item = 'corrugatedBox'`)
  ok(sum === '-14', '칸별로 더하면 합계는 예전과 같다', sum)
}

// ── ⑥ 규격으로 입고 ──────────────────────────────────────────────────────
{
  const r = tryAs(AD, `select public.receive_stock_items('{"box63": 50, "box35": 30}'::jsonb, '8월 발주분', null)`)
  ok(r.ok, '63L 50개 · 35L 30개가 창고에 들어온다', err(r))
  ok(qtyOf('box63') === '130', '**세어 본 63L 는 80 → 130**', qtyOf('box63'))
  ok(qtyOf('box35') === 'NULL',
    '**안 세어 본 35L 는 그래도 「모름」** (30개 들어온 건 알아도 원래 몇 개인지는 모름)', qtyOf('box35'))
  ok(bucket('corrugated_box') === 480 - 14 + 80, '네 칸 합계는 80 개 늘어난다', String(bucket('corrugated_box')))

  const led = psql(`select string_agg(item_key || ':' || qty, ' · ' order by item_key)
                      from public.material_transactions where kind = '입고'`)
  ok(/box35:30/.test(led) && /box63:50/.test(led), '입고도 규격으로 남는다', led)
}

// ── ⑦ 모르는 규격은 조용히 버리지 않는다 ─────────────────────────────────
{
  const r = tryAs(AD, `select public.receive_stock_items('{"box999": 5}'::jsonb, '', null)`)
  ok(!r.ok && /모르는 규격/.test(r.out), '**모르는 규격은 멈춘다** (조용히 버리면 창고와 화면이 어긋납니다)', err(r))
  const c = tryAs(AD, `select public.count_stock_item('box999', 5, '')`)
  ok(!c.ok && /모르는 규격/.test(c.out), '세는 쪽도 마찬가지', err(c))
}

// ── ⑧ 음수로 만들 수 없다 ─────────────────────────────────────────────────
{
  const r = tryAs(AD, `select public.count_stock_item('box63', -1, '')`)
  ok(!r.ok, '**음수로 셀 수 없다**', err(r))
  const n = tryAs(AD, `select public.receive_stock_items('{"box63": -5}'::jsonb, '', null)`)
  ok(!n.ok, '**음수 입고로 재고를 늘릴 수 없다**', err(n))
  ok(qtyOf('box63') === '130', '거절된 뒤에도 값 그대로', qtyOf('box63'))
}

// ── ⑨ 공급 한도·중복방지는 예전 그대로 ───────────────────────────────────
{
  //  ⚠ 0075 의 보호장치를 제가 건드리지 않았는지 확인합니다.
  const over = tryAs(AD, `select public.supply_materials_items('${C1}'::uuid, ${KST},
    '{"box63": 99999}'::jsonb, false, '', null)`)
  ok(!over.ok && /재고\(.*\)보다 많이 공급할 수 없습니다/.test(over.out),
    '**재고보다 많이 공급하면 여전히 막는다**', err(over))
  ok(qtyOf('box63') === '130', '막힌 뒤 규격별 재고도 안 움직인다', qtyOf('box63'))

  const rid = '00000000-0000-0000-0000-0000000000d1'
  const a = tryAs(AD, `select public.supply_materials_items('${C1}'::uuid, ${KST},
    '{"box63": 3}'::jsonb, false, '', '${rid}'::uuid)`)
  const b = tryAs(AD, `select public.supply_materials_items('${C1}'::uuid, ${KST},
    '{"box63": 3}'::jsonb, false, '', '${rid}'::uuid)`)
  ok(a.ok && b.ok, '같은 표로 두 번 보낸다', err(a) + err(b))
  ok(/alreadySaved.*true/.test(b.out), '**두 번째는 「이미 저장됨」** (중복방지 그대로)', b.out.slice(0, 60))
  ok(qtyOf('box63') === '127', '**그래서 3 개만 줄었다** (두 번 안 깎임)', qtyOf('box63'))

  const future = tryAs(AD, `select public.supply_materials_items('${C1}'::uuid, ${KST} + 1,
    '{"box63": 1}'::jsonb, false, '', null)`)
  ok(!future.ok && /아직 오지 않은 날짜/.test(future.out), '앞날 공급 막기도 그대로', err(future))
}

// ── ⑩ 기사님도 공급은 적을 수 있다 (예전 그대로) ─────────────────────────
{
  const r = tryAs(FD, `select public.supply_materials_items('${C1}'::uuid, ${KST},
    '{"box63": 2}'::jsonb, false, '', null)`)
  ok(r.ok, '**기사님은 공급을 적을 수 있다** (현장에서 직접 건네줍니다)', err(r))
  ok(qtyOf('box63') === '125', '그만큼 규격별 재고가 준다', qtyOf('box63'))
}

// ── ⑪ 수거 입력의 「주고 온 자재」도 깎인다 ──────────────────────────────
{
  //  ⚠ 여기가 제가 처음에 놓칠 뻔한 자리입니다. 자재를 주는 길이 **두 갈래**
  //    입니다 — 자재 화면(supply_materials_items)과 수거 입력(complete_collection).
  //    한쪽만 깎으면 규격별 숫자가 조용히 어긋납니다.
  const V1 = '00000000-0000-0000-0000-0000000000c1'
  psql(`insert into public.vehicles (id, name, waste_type, tonnage, nominal_capacity, expected_capacity, driver, active)
        values ('${V1}', '3호차', '의료폐기물', 1, 1000, 800, '김준기', true) on conflict (id) do nothing`)
  const before = Number(qtyOf('box63'))

  const r = tryAs(AD, `select public.complete_collection(jsonb_build_object(
      'scheduleId', null, 'clientId', '${C1}', 'wasteType', '의료폐기물',
      'vehicleId', '${V1}', 'driverName', '김준기', 'actualAmount', 100,
      'actualTime', '09:30', 'containers', '{}'::jsonb, 'handoverStatus', null,
      'supplied', jsonb_build_object('corrugatedBox', 6, 'plasticContainer', 0, 'bag', 0, 'needleBox', 0),
      'suppliedItems', jsonb_build_object('box63', 6),
      'note', '', 'screen', '수거 입력'))`)
  ok(r.ok, '수거 입력에서 63L 6개를 주고 온다', err(r))
  ok(Number(qtyOf('box63')) === before - 6,
    '**수거 입력으로 준 것도 규격별 재고에서 빠진다**', `${before} → ${qtyOf('box63')}`)

  //  안 세어 본 규격은 여기서도 「모름」 그대로입니다.
  ok(qtyOf('box35') === 'NULL', '안 세어 본 규격은 수거 입력에서도 「모름」', qtyOf('box35'))
}

// ── ⑫ 무르면 되돌아온다 ──────────────────────────────────────────────────
{
  //  ⚠ 무르기는 materials 줄을 지웁니다. 그때 네 칸은 되돌아오는데 규격별만
  //    안 되돌아오면, 무를수록 규격별 숫자만 줄어듭니다.
  const before = Number(qtyOf('box63'))
  const beforeBucket = bucket('corrugated_box')
  const ev = psql(`select id from public.collection_events
                    where action = '수거 완료' and not reverted order by at desc limit 1`)
  const r = tryAs(AD, `select public.revert_collection('${ev}'::uuid)`)
  ok(r.ok, '방금 넣은 수거를 무른다', err(r))
  ok(Number(qtyOf('box63')) === before + 6,
    '**무르면 규격별 재고도 6 개 되돌아온다**', `${before} → ${qtyOf('box63')}`)
  ok(bucket('corrugated_box') === beforeBucket + 6, '네 칸 합계도 같이 되돌아온다',
    `${beforeBucket} → ${bucket('corrugated_box')}`)
}

// ── ⑬ 판 번호 ────────────────────────────────────────────────────────────
{
  ok(psql('select public.app_schema_version()') === '79', '판 번호가 79')
}
