import { execFileSync, spawn } from 'node:child_process'

//  0048 — 병원 소모품 주문 (매출 AX 첫 판).
//
//   이 판부터 시스템이 돈을 법니다. 그래서 방어가 기존 청구·입금과 같은
//   수준이어야 합니다.
//
//   확인하는 것
//    · **요청만으로 재고가 빠지지 않는다** — 실제 전달에서 한 번만
//    · 같은 주문을 두 번 완료해도 재고가 두 번 안 빠진다 (동시 접속 포함)
//    · 상품가가 바뀌어도 **이미 올린 주문 금액은 안 바뀐다** (snapshot)
//    · 병원은 **다른 병원 주문을 못 본다** · 남의 병원으로 못 올린다
//    · 판매 실적은 **전달완료만** 센다 (요청·확인·준비는 매출이 아님)
//    · 재고보다 많이 전달할 수 없다
const DB = 'ordq'
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
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}
const client = (name) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',true,false) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}'`)
}
const CA = client('[검증]가나병원')
const CB = client('[검증]다라요양원')
const ADMIN = mk('ord-admin@beonemirae.test', 'admin')
const OFFICE = mk('ord-office@beonemirae.test', 'office')
const FIELD = mk('ord-field@beonemirae.test', 'field')
const HOSP_A = mk('ord-hosp-a@beonemirae.test', 'client', CA)
const HOSP_B = mk('ord-hosp-b@beonemirae.test', 'client', CB)

psql(`insert into public.office_stock (id, corrugated_box, plastic_container, bag, needle_box)
      values (1, 500, 200, 900, 120)
      on conflict (id) do update set corrugated_box=500, plastic_container=200, bag=900, needle_box=120`)

const stock = (col) => Number(psql(`select ${col} from public.office_stock where id=1`))

// ── 0. 판 ─────────────────────────────────────────────────────────────────
ok(Number(psql(`select public.app_schema_version()`)) === 64, 'DB 판이 64', psql(`select public.app_schema_version()`))

// ── 1. 상품 등록 ──────────────────────────────────────────────────────────
//  0050 이 미리 넣어 둔 소모품 수 — 검사에서 만든 것과 구분합니다.
const SEEDED = Number(psql(`select count(*) from public.products`))
let P20, PBOX
{
  ok(SEEDED >= 10, `0050 이 소모품 ${SEEDED}가지를 미리 넣어 둠`, String(SEEDED))
  ok(psql(`select count(*) from public.products where sale_price > 0`) === '0',
    '미리 넣은 품목에 **지어낸 단가가 없음**')
  const r = tryAs(ADMIN, `select public.upsert_product(null,'합성수지 전용용기','20L','개',9000,5200,'plastic_container')`)
  ok(r.ok, '관리자가 상품을 등록할 수 있음', r.ok ? '' : err(r))
  P20 = JSON.parse(r.out).id
  PBOX = JSON.parse(run(`select public.upsert_product(null,'골판지 전용박스','63L','개',3500,2100,'corrugated_box')`, ADMIN)).id
  //  0050 이 소모품 10가지를 미리 넣어 둡니다 — 여기서 만든 2개는 그 위에
  //  더해집니다. 개수를 못 박으면 품목이 늘 때마다 이 검사가 깨집니다.
  ok(Number(psql(`select count(*) from public.products`)) === SEEDED + 2,
    `상품 ${SEEDED}개(0050) + 새로 만든 2개`, psql(`select count(*) from public.products`))
  const o = tryAs(OFFICE, `select public.upsert_product(null,'몰래','','개',1,1,null)`)
  ok(!o.ok && /관리자만/.test(o.out), '사무실 담당자는 상품을 못 만듦', err(o))
  const bad = tryAs(ADMIN, `select public.upsert_product(null,'엉뚱','','개',1000,500,'엉뚱한칸')`)
  ok(!bad.ok, '모르는 재고 칸은 거절 — 없는 재고를 만들지 않음', err(bad))
  //  병원도 상품을 봐야 주문할 수 있습니다
  ok(Number(tryAs(HOSP_A, `select count(*) from public.products`).out) === SEEDED + 2, '병원도 상품 목록을 봄')
}

// ── 2. 요청 — 재고는 아직 그대로 ─────────────────────────────────────────
//   여기가 이 판의 첫 번째 핵심입니다. 요청만으로 재고를 빼면, 병원이 마음을
//   바꾸거나 사무실이 거절할 때마다 재고가 틀어집니다.
let O1
{
  const before = stock('plastic_container')
  const r = tryAs(HOSP_A, `select public.request_product_order('${CA}',
      '[{"productId":"${P20}","qty":10},{"productId":"${PBOX}","qty":4}]'::jsonb, '다음 수거 때 부탁드립니다')`)
  ok(r.ok, '병원이 자기 주문을 올릴 수 있음', r.ok ? '' : err(r))
  const j = JSON.parse(r.out)
  O1 = j.id
  ok(j.itemCount === 2, '품목 2개', String(j.itemCount))
  ok(j.total === 9000 * 10 + 3500 * 4, '금액을 서버가 계산 (화면이 보낸 금액을 안 믿음)', String(j.total))
  ok(stock('plastic_container') === before, '**요청만으로는 재고가 안 빠짐**', `${before} → ${stock('plastic_container')}`)
  ok(psql(`select status from public.product_orders where id='${O1}'`) === '요청', '상태는 「요청」')
  ok(psql(`select count(*) from public.audit_logs where action='product_order.request'`) === '1', '기록이 남음')
}

// ── 3. 가격 snapshot — 상품가가 바뀌어도 지난 주문은 그대로 ──────────────
{
  run(`select public.upsert_product('${P20}','합성수지 전용용기','20L','개',12000,6000,'plastic_container')`, ADMIN)
  ok(psql(`select sale_price from public.products where id='${P20}'`) === '12000', '상품가를 9,000 → 12,000 으로 올림')
  ok(psql(`select unit_price from public.product_order_items where order_id='${O1}' and product_id='${P20}'`) === '9000',
    '**이미 올린 주문의 단가는 안 바뀜** (9,000 그대로)')
  ok(psql(`select unit_cost from public.product_order_items where order_id='${O1}' and product_id='${P20}'`) === '5200',
    '원가도 그때 값 그대로')
  //  되돌려 둡니다
  run(`select public.upsert_product('${P20}','합성수지 전용용기','20L','개',9000,5200,'plastic_container')`, ADMIN)
}

// ── 4. 병원 격리 ─────────────────────────────────────────────────────────
{
  const r = tryAs(HOSP_B, `select public.request_product_order('${CA}','[{"productId":"${P20}","qty":1}]'::jsonb)`)
  ok(!r.ok && /다른 병원의 주문을 올릴 수 없습니다/.test(r.out), '병원이 남의 병원으로 못 올림', err(r))
  ok(tryAs(HOSP_A, `select count(*) from public.product_orders`).out === '1', '자기 주문은 보임')
  ok(tryAs(HOSP_B, `select count(*) from public.product_orders`).out === '0', '**다른 병원 주문은 안 보임**')
  ok(tryAs(HOSP_B, `select count(*) from public.product_order_items`).out === '0', '주문 줄(수량·금액)도 안 보임')
  ok(tryAs(HOSP_A, `select count(*) from public.product_order_items`).out === '2', '자기 주문 줄은 보임')
  ok(tryAs(OFFICE, `select count(*) from public.product_orders`).out === '1', '사무실은 다 봄')
  //  병원은 상태를 못 바꿉니다 — 그건 사무실 일입니다
  const s = tryAs(HOSP_A, `select public.set_product_order_status('${O1}','전달완료')`)
  ok(!s.ok && /사무실 담당자와 관리자만/.test(s.out), '병원이 스스로 전달완료를 못 함', err(s))
  const f = tryAs(FIELD, `select public.request_product_order('${CA}','[{"productId":"${P20}","qty":1}]'::jsonb)`)
  ok(f.ok, '기사님도 대신 접수할 수 있음 (전화·카톡으로 받은 것)', f.ok ? '' : err(f))
  psql(`delete from public.product_order_items where order_id='${JSON.parse(f.out).id}'`)
  psql(`delete from public.product_orders where id='${JSON.parse(f.out).id}'`)
}

// ── 5. 중간 상태에서도 재고는 그대로 ─────────────────────────────────────
{
  const before = stock('plastic_container')
  for (const st of ['확인', '준비', '전달예정']) {
    const r = tryAs(OFFICE, `select public.set_product_order_status('${O1}','${st}')`)
    ok(r.ok && JSON.parse(r.out).stockMoved === false, `${st} — 재고를 안 건드림`, r.ok ? '' : err(r))
  }
  ok(stock('plastic_container') === before, '확인·준비·전달예정까지 재고 그대로', `${stock('plastic_container')}`)
  ok(psql(`select confirmed_at is not null from public.product_orders where id='${O1}'`) === 't', '확인한 시각이 남음')
}

// ── 6. 전달완료 — 여기서 딱 한 번 ────────────────────────────────────────
{
  const p0 = stock('plastic_container')
  const b0 = stock('corrugated_box')
  const r = tryAs(OFFICE, `select public.set_product_order_status('${O1}','전달완료')`)
  ok(r.ok && JSON.parse(r.out).stockMoved === true, '전달완료에서 재고가 빠짐', r.ok ? '' : err(r))
  ok(stock('plastic_container') === p0 - 10, '합성수지 10개 차감', `${p0} → ${stock('plastic_container')}`)
  ok(stock('corrugated_box') === b0 - 4, '골판지 4개 차감', `${b0} → ${stock('corrugated_box')}`)
  ok(psql(`select count(*) from public.material_transactions where memo like '소모품 판매 전달%'`) === '2',
    '자재 원장에도 남음 — 재고가 왜 줄었는지 답할 수 있음')

  //  다시 눌러도 두 번 안 빠집니다
  const again = tryAs(OFFICE, `select public.set_product_order_status('${O1}','전달완료')`)
  ok(again.ok && JSON.parse(again.out).alreadyDone === true,
    '다시 눌러도 오류가 아니라 「이미 처리됨」', again.ok ? '' : err(again))
  ok(again.ok && JSON.parse(again.out).stockMoved === false, '**두 번째는 재고를 안 건드림**')
  ok(stock('plastic_container') === p0 - 10, '재고가 두 번 안 빠짐', `${stock('plastic_container')}`)

  //  전달완료는 되돌릴 수 없습니다
  const back = tryAs(OFFICE, `select public.set_product_order_status('${O1}','준비')`)
  ok(!back.ok && /되돌릴 수 없습니다/.test(back.out), '전달완료는 되돌릴 수 없음 — 물건이 이미 갔습니다', err(back))
}

// ── 7. 두 사람이 같은 순간에 전달완료 (진짜 동시 접속) ───────────────────
//   화면에서 두 명이 동시에 누르면 재고가 두 번 빠질 자리입니다.
{
  const r = JSON.parse(run(`select public.request_product_order('${CA}','[{"productId":"${P20}","qty":5}]'::jsonb)`, OFFICE))
  const O2 = r.id
  const p0 = stock('plastic_container')
  const N = 4
  const one = () => new Promise((res) => {
    const sql = `set local role authenticated; set local request.jwt.claims = '{"sub":"${OFFICE}","role":"authenticated"}';
                 select pg_sleep(0.2);
                 select public.set_product_order_status('${O2}','전달완료')`
    const p = spawn('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', sql])
    let e = ''
    p.stderr.on('data', (d) => { e += d })
    p.on('close', (code) => res({ code, e }))
  })
  await Promise.all(Array.from({ length: N }, one))
  ok(stock('plastic_container') === p0 - 5,
    `${N}명이 같은 순간에 눌러도 재고는 한 번만 빠짐`, `${p0} → ${stock('plastic_container')} (기대 ${p0 - 5})`)
  ok(psql(`select count(*) from public.material_transactions where memo like '%${O2.slice(0, 8)}%'`) === '1',
    '원장에도 한 줄만 남음')
}

// ── 8. 재고보다 많이 전달할 수 없다 ──────────────────────────────────────
{
  const have = stock('needle_box')
  const PN = JSON.parse(run(`select public.upsert_product(null,'합성수지 바늘통','1L','개',2000,900,'needle_box')`, ADMIN)).id
  const r = JSON.parse(run(`select public.request_product_order('${CA}','[{"productId":"${PN}","qty":${have + 1}}]'::jsonb)`, OFFICE))
  const s = tryAs(OFFICE, `select public.set_product_order_status('${r.id}','전달완료')`)
  ok(!s.ok && /모자랍니다/.test(s.out), '재고보다 많이 전달하려 하면 막음', err(s))
  ok(stock('needle_box') === have, '막힌 뒤 재고 그대로', String(stock('needle_box')))
  ok(psql(`select status from public.product_orders where id='${r.id}'`) === '요청', '상태도 안 바뀜')
  psql(`update public.product_orders set status='취소', canceled_at=now() where id='${r.id}'`)
}

// ── 9. 다시 눌러도 주문이 두 개가 되지 않는다 ────────────────────────────
{
  const REQ = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const a = JSON.parse(run(`select public.request_product_order('${CA}','[{"productId":"${P20}","qty":2}]'::jsonb,'',null,null,'${REQ}')`, OFFICE))
  const b = JSON.parse(run(`select public.request_product_order('${CA}','[{"productId":"${P20}","qty":2}]'::jsonb,'',null,null,'${REQ}')`, OFFICE))
  ok(a.id === b.id && b.alreadySaved === true, '같은 저장 시도는 한 번만 들어감', `${a.id === b.id}`)
  ok(psql(`select count(*) from public.product_orders where request_id='${REQ}'`) === '1', '주문이 한 개')
}

// ── 10. 잘못된 주문은 거절 ───────────────────────────────────────────────
{
  const e1 = tryAs(OFFICE, `select public.request_product_order('${CA}','[]'::jsonb)`)
  ok(!e1.ok && /하나 이상 골라/.test(e1.out), '빈 주문은 거절', err(e1))
  const e2 = tryAs(OFFICE, `select public.request_product_order('${CA}','[{"productId":"${P20}","qty":0}]'::jsonb)`)
  ok(!e2.ok && /1개 이상/.test(e2.out), '수량 0 은 거절', err(e2))
  run(`select public.upsert_product('${PBOX}','골판지 전용박스','63L','개',3500,2100,'corrugated_box',false)`, ADMIN)
  const e3 = tryAs(OFFICE, `select public.request_product_order('${CA}','[{"productId":"${PBOX}","qty":1}]'::jsonb)`)
  ok(!e3.ok && /지금 공급할 수 없습니다/.test(e3.out), '공급 불가 물품은 거절', err(e3))
  run(`select public.upsert_product('${PBOX}','골판지 전용박스','63L','개',3500,2100,'corrugated_box',true)`, ADMIN)
}

// ── 11. 판매 실적 — 전달완료만 센다 ──────────────────────────────────────
{
  const today = psql(`select (now() at time zone 'Asia/Seoul')::date`)
  const s = JSON.parse(run(`select public.product_sales_summary('${today}','${today}')`, OFFICE))
  //  전달완료는 O1(9,000×10 + 3,500×4 = 104,000) 과 O2(9,000×5 = 45,000) 뿐입니다.
  ok(s.orders === 2, '전달완료 주문만 셈 (요청·확인·준비·취소는 매출 아님)', `${s.orders}건`)
  ok(s.revenue === 9000 * 10 + 3500 * 4 + 9000 * 5, '판매 매출 149,000원', `${s.revenue}원`)
  ok(s.cost === 5200 * 10 + 2100 * 4 + 5200 * 5, '원가도 그때 값으로', `${s.cost}원`)
  ok(s.profit === s.revenue - s.cost, '이익 = 매출 − 원가', `${s.profit}원`)
  ok(s.clients === 1, '구매한 거래처 수', `${s.clients}곳`)
  const f = tryAs(FIELD, `select public.product_sales_summary('${today}','${today}')`)
  ok(!f.ok && /사무실 담당자와 관리자만/.test(f.out), '판매 실적은 현장에 안 보임 (돈입니다)', err(f))
  const h = tryAs(HOSP_A, `select public.product_sales_summary('${today}','${today}')`)
  ok(!h.ok, '병원에게도 안 보임', err(h))

  //  0049 — 「다시 산 곳」. 지금까지 전달완료는 CA 의 O1·O2 뿐이고
  //  O1 이 CA 의 첫 주문이므로 다시 산 주문은 O2 하나입니다.
  ok(s.repeatOrders === 1, '첫 주문은 재구매가 아님 — 두 번째부터', `${s.repeatOrders}건`)
  ok(s.repeatClients === 1, '다시 산 곳 1곳', `${s.repeatClients}곳`)
}

// ── 11-b. 재구매는 기간을 잘라서 세지 않는다 ────────────────────────────
//   작년에 처음 사고 이번 달에 다시 산 병원은 「다시 산 곳」이 맞습니다.
//   기간 안에서만 세면 이 병원이 신규로 보이고, 그러면 이 사업이 되는지
//   안 되는지를 정반대로 읽게 됩니다.
{
  const today = psql(`select (now() at time zone 'Asia/Seoul')::date`)
  const deliver = (cid, qty) => {
    const r = JSON.parse(run(`select public.request_product_order('${cid}','[{"productId":"${P20}","qty":${qty}}]'::jsonb)`, OFFICE))
    run(`select public.set_product_order_status('${r.id}','전달완료')`, OFFICE)
    return r.id
  }
  //  CB 의 **첫** 주문 — 오늘.
  const B1 = deliver(CB, 1)
  let s = JSON.parse(run(`select public.product_sales_summary('${today}','${today}')`, OFFICE))
  ok(s.clients === 2, '산 곳이 두 곳이 됨', `${s.clients}곳`)
  ok(s.repeatClients === 1, 'CB 의 첫 주문은 재구매로 안 셈', `${s.repeatClients}곳`)

  //  그 주문을 **30일 전**으로 옮기고, 오늘 한 번 더 삽니다.
  psql(`update public.product_orders set delivered_at = now() - interval '30 days' where id='${B1}'`)
  deliver(CB, 1)
  s = JSON.parse(run(`select public.product_sales_summary('${today}','${today}')`, OFFICE))
  ok(s.repeatClients === 2, '지난달에 처음 산 곳이 오늘 또 사면 「다시 산 곳」', `${s.repeatClients}곳`)
  ok(s.repeatOrders === 2, '다시 산 주문도 둘', `${s.repeatOrders}건`)
  //  기간 밖의 그 첫 주문은 **매출로는 안 셉니다** — 오늘 판 것만 돈입니다.
  ok(s.orders === 3, '오늘 전달한 주문만 매출로 셈 (지난달 것은 빠짐)', `${s.orders}건`)

  //  아무것도 안 판 기간은 0 입니다 — 감추지 않습니다.
  const z = JSON.parse(run(`select public.product_sales_summary('2000-01-01','2000-01-02')`, OFFICE))
  ok(z.revenue === 0 && z.repeatClients === 0 && z.repeatOrders === 0,
    '판 적 없는 기간은 전부 0 — 없는 실적을 지어내지 않음', JSON.stringify(z).slice(0, 90))
}

// ── 12. 표에 직접 쓰는 길이 닫혀 있다 ────────────────────────────────────
{
  const a = tryAs(OFFICE, `insert into public.products (name) values ('몰래')`)
  ok(!a.ok && /permission denied|권한/.test(a.out), '상품 표에 직접 못 씀', err(a))
  const b = tryAs(HOSP_A, `insert into public.product_orders (client_id) values ('${CA}')`)
  ok(!b.ok && /permission denied|권한/.test(b.out), '주문 표에 직접 못 씀', err(b))
  const c = tryAs(OFFICE, `update public.product_order_items set unit_price = 1 where order_id='${O1}'`)
  ok(!c.ok, '**확정된 판매금액을 표에서 못 고침**', err(c))
}

// ── 13. 자가진단이 새것을 실제로 세는가 (이빨) ──────────────────────────
const check = () => JSON.parse(run(`select public.app_health_check()`, ADMIN))
{
  const h = check()
  ok(h.ok === true && h.version === 64, '0050 까지 올린 DB 는 「이상 없음」',
    h.ok ? `판 ${h.version}` : JSON.stringify(h.missing).slice(0, 100))
}
const gone = (label, breakSql, fixSql, expect) => {
  psql(breakSql)
  const h = check()
  const hit = (h.missing ?? []).some((m) => m.includes(expect))
  ok(h.ok === false && hit, `${label} → 이름을 대고 알려 줌`,
    hit ? (h.missing.find((m) => m.includes(expect)) ?? '') : JSON.stringify(h.missing).slice(0, 90))
  psql(fixSql)
  ok(check().ok === true, `${label} → 되돌리면 다시 「이상 없음」`)
}
gone('판매 금액을 표에서 고칠 수 있게 열리면',
  `grant update on public.product_order_items to authenticated`,
  `revoke update on public.product_order_items from authenticated`,
  '상품·주문 직접 쓰기가 열려 있음')
gone('주문 재시도 색인이 사라지면',
  `drop index public.product_orders_request_uniq`,
  `create unique index product_orders_request_uniq on public.product_orders (request_id) where request_id is not null`,
  'product_orders_request_uniq')

const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
