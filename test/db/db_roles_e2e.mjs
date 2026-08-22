import { execFileSync } from 'node:child_process'

//  현장(field)·병원(client) **역할 토큰으로 하루를 그대로 밟아 봅니다.**
//
//   화면 검사는 서버를 흉내 낸 가짜 응답을 씁니다. 그래서 「화면이 안 보여
//   준다」까지만 증명합니다. 여기서는 **진짜 Postgres 에 진짜 RLS 를 켠 채**
//   역할 토큰(jwt claims sub=<uid>)으로 직접 부릅니다.
//
//   ⚠ 이것은 비밀번호로 로그인하는 E2E 가 아닙니다. 계정과 비밀번호는
//     대표님이 정하실 일이고, 비밀번호를 코드·픽스처·문서에 적지 않습니다.
//     서버가 역할별로 무엇을 주고 무엇을 막는지는 **토큰 수준에서 같습니다** —
//     Supabase 도 로그인 뒤에는 이 claims 로 판단합니다.
//
//   현장 하루   오늘 갈 곳 → 병원 정보 → 수거 저장 → 자재 차감 → 의견 내기
//   병원 하루   우리 병원만 보기 → 수거 요청 → 자재·용기 주문 → 남의 것 못 봄

const DB = 'e2eq'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
//  ⚠ uid 없이 부르면 superuser 입니다 — RLS 도 열 권한도 안 걸립니다.
//    **준비할 때만** 씁니다. 확인은 반드시 uid 를 넘겨서 합니다.
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 130)
const q = (s) => String(s).replace(/'/g, "''")

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}
const client = (name, addr, mgr, tel, note) =>
  psql(`insert into public.clients (name, type, address, manager, phone, note, collects_medical_waste, collects_diaper,
          pricing, monthly_flat_fee)
        values ('${q(name)}','병원','${q(addr)}','${q(mgr)}','${tel}','${q(note)}',true,false,
          '{"위탁의료폐기물":{"sale":1450,"cost":890}}'::jsonb, 880000)
        returning id`)

// ── 준비 (superuser) ────────────────────────────────────────────────────────
const CA = client('[E2E]한마음요양병원', '경기도 남양주시 양지로 47-35', '김주현', '031-111-2222', '지하 주차 후 화물엘리베이터')
const CB = client('[E2E]새싹의원', '서울시 송파구 올림픽로 300', '박서연', '02-555-0202', '')
const ADMIN = mk('e2-admin@beonemirae.test', 'admin')
const OFFICE = mk('e2-office@beonemirae.test', 'office')
const FIELD = mk('e2-field@beonemirae.test', 'field')
const HOSP = mk('e2-hosp@beonemirae.test', 'client', CA)
const HOSP_B = mk('e2-hospb@beonemirae.test', 'client', CB)

const VEH = psql(`insert into public.vehicles (name, waste_type, driver) values ('[E2E]80가1234','의료폐기물','김준기') returning id`)
psql(`update public.office_stock set corrugated_box = 500, bag = 500, plastic_container = 500, needle_box = 500 where id = 1`)
const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const SA = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, scheduled_time, vehicle_id)
                 values ('${TODAY}','${CA}','의료폐기물','예정',120,'09:40','${VEH}') returning id`)
const SB = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, scheduled_time)
                 values ('${TODAY}','${CB}','의료폐기물','예정',40,'14:10') returning id`)
psql(`insert into public.products (name, spec, unit, sale_price, cost_price, stock_key, available, active, category)
      values ('[E2E]합성수지 용기','20L','개',9000,5200,'plastic_container',true,true,'의료폐기물 용기')
      on conflict do nothing`)
const PROD = psql(`select id from public.products where name='[E2E]합성수지 용기' limit 1`)

console.log('══ 현장(field) 하루 ═══════════════════════════════════════════════')

console.log('── 1. 오늘 갈 곳을 본다 ──')
{
  const r = tryAs(FIELD, `select count(*) from public.schedules where date='${TODAY}'`)
  ok(r.ok && Number(r.out) >= 2, '오늘 일정이 보임', r.ok ? `${r.out}건` : err(r))
}
console.log('── 2. 병원 정보를 본다 (돈 빼고) ──')
{
  const r = tryAs(FIELD, `select address||'|'||manager||'|'||phone||'|'||note from public.clients where id='${CA}'`)
  ok(r.ok && /양지로 47-35/.test(r.out), '주소가 보임', r.ok ? r.out.slice(0, 60) : err(r))
  ok(r.ok && /031-111-2222/.test(r.out), '전화번호가 보임 — 도착해서 바로 겁니다')
  ok(r.ok && /화물엘리베이터/.test(r.out), '주의사항이 보임')

  //  ⚠ 대체기사 — 오늘 자기 차가 안 잡힌 병원도 업무정보는 보여야 합니다.
  const b = tryAs(FIELD, `select address from public.clients where id='${CB}'`)
  ok(b.ok && /올림픽로 300/.test(b.out), '**배정 안 된 병원도** 주소가 보임 (대체로 갈 수 있어야 합니다)', b.ok ? b.out : err(b))

  const m = tryAs(FIELD, `select pricing from public.clients where id='${CA}'`)
  ok(!m.ok && /permission denied/i.test(m.out), '**단가는 못 읽음** (0063)', m.ok ? `읽힘: ${m.out}` : err(m))
}
console.log('── 3. 수거를 저장한다 ──')
{
  const p = q(JSON.stringify({
    scheduleId: SA, clientId: CA, wasteType: '의료폐기물', vehicleId: VEH,
    driverName: '김준기', actualTime: '09:40', actualAmount: 118,
    handoverStatus: '수거 완료', memo: '지하 주차 후 화물엘리베이터',
    containers: { corrugated: 3, plastic: 2 },
    //  ⚠ 키 이름은 서버가 읽는 그대로여야 합니다 (0013/0061):
    //    corrugatedBox · plasticContainer · bag · needleBox.
    //    `box`/`needle` 로 적었더니 **0 으로 읽혀** 자재가 안 적히고 재고도
    //    안 줄었습니다 — 제 픽스처 잘못이었지, 서버가 틀린 게 아니었습니다.
    supplied: { corrugatedBox: 10, needleBox: 2 },
  }))
  const r = tryAs(FIELD, `select public.complete_collection('${p}'::jsonb)::text`)
  ok(r.ok, '기사가 수거를 저장함', r.ok ? '' : err(r))

  ok(psql(`select status from public.schedules where id='${SA}'`) === '완료', '일정이 완료로 바뀜')
  ok(psql(`select actual_amount from public.schedules where id='${SA}'`) === '118', '수거량 118kg 이 그대로 남음')
  ok(Number(psql(`select count(*) from public.collection_events where schedule_id='${SA}'`)) === 1,
    '수거 기록이 한 건 생김 (중복 아님)')
  const mat = psql(`select coalesce(sum(box_count),0)||'/'||coalesce(sum(needle_box_count),0) from public.materials where client_id='${CA}' and date='${TODAY}'`)
  ok(mat === '10/2', '건넨 자재가 그대로 기록됨 (박스 10 · 바늘통 2)', mat)
  const stock = psql(`select corrugated_box||'/'||needle_box from public.office_stock where id=1`)
  ok(stock === '490/498', '사무실 재고가 그만큼 줄어듦', stock)
}
console.log('── 4. 현장 의견을 낸다 (0062) ──')
{
  const r = tryAs(FIELD, `select public.submit_schedule_feedback('${SB}','요일변경','수요일보다 금요일이 낫습니다')::text`)
  ok(r.ok, '기사가 의견을 냄', r.ok ? '' : err(r))
  const mine = tryAs(FIELD, `select count(*) from public.schedule_feedback`)
  ok(mine.ok && mine.out === '1', '자기 의견은 보임', mine.ok ? `${mine.out}건` : err(mine))
  const o = tryAs(OFFICE, `select count(*) from public.schedule_feedback`)
  ok(o.ok && Number(o.out) >= 1, '사무실에도 보임 (알림이 되는 자리)', o.ok ? `${o.out}건` : err(o))
  //  ⚠ 기사는 일정을 **못 고칩니다** — 의견까지입니다.
  const e = tryAs(FIELD, `select public.update_visit('${SB}','10:30')`)
  ok(!e.ok, '기사는 일정을 직접 못 고침', err(e))
}
console.log('── 5. 돈은 한 줄도 안 옴 ──')
for (const [t, l] of [['payments', '청구'], ['client_monthly_actuals', '월 실적'], ['products', '상품'],
                      ['client_documents', '문서함'], ['sales_leads', '영업'], ['operating_costs', '운영비']]) {
  const r = tryAs(FIELD, `select count(*) from public.${t}`)
  ok(r.ok && r.out === '0', `기사에게 ${l}은 0건`, r.ok ? `${r.out}건` : err(r))
}

console.log('')
console.log('══ 병원(client) 하루 ══════════════════════════════════════════════')

console.log('── 6. 우리 병원 것만 본다 ──')
{
  const r = tryAs(HOSP, `select count(*) from public.clients`)
  ok(r.ok && r.out === '1', '**우리 병원 한 곳만** 보임', r.ok ? `${r.out}곳` : err(r))
  const n = tryAs(HOSP, `select name from public.clients`)
  ok(n.ok && /한마음/.test(n.out), '그 한 곳이 우리 병원', n.ok ? n.out : err(n))
  const s = tryAs(HOSP, `select count(*) from public.schedules`)
  ok(s.ok && s.out === '1', '우리 병원 일정만 보임', s.ok ? `${s.out}건` : err(s))
  const b = tryAs(HOSP_B, `select name from public.clients`)
  ok(b.ok && /새싹/.test(b.out), '다른 병원 계정은 자기 것만 봄', b.ok ? b.out : err(b))
}
console.log('── 7. 수거 요청을 넣는다 ──')
{
  const r = tryAs(HOSP, `insert into public.client_requests (client_id, kind, content, urgent, source, requester_name)
                         values ('${CA}','추가수거','격리환자 발생으로 배출량이 늘었습니다',true,'portal','병원 담당자') returning id`)
  ok(r.ok, '병원이 수거 요청을 올림', r.ok ? '' : err(r))
  //  ⚠ 남의 병원 이름으로 넣으면 막혀야 합니다.
  const bad = tryAs(HOSP, `insert into public.client_requests (client_id, kind, content, source)
                           values ('${CB}','추가수거','남의 병원',  'portal') returning id`)
  ok(!bad.ok, '**남의 병원 이름으로는 못 넣음**', err(bad))
  const seen = tryAs(HOSP_B, `select count(*) from public.client_requests`)
  ok(seen.ok && seen.out === '0', '다른 병원은 그 요청을 못 봄', seen.ok ? `${seen.out}건` : err(seen))
}
console.log('── 8. 자재·용기를 주문한다 ──')
{
  const items = q(JSON.stringify([{ productId: PROD, qty: 10 }]))
  const r = tryAs(HOSP, `select public.request_product_order('${CA}','${items}'::jsonb,'3층 창고에 넣어 주세요',null,null,null)::text`)
  ok(r.ok, '병원이 자재·용기를 주문함', r.ok ? r.out.slice(0, 70) : err(r))
  const mine = tryAs(HOSP, `select count(*) from public.product_orders`)
  ok(mine.ok && mine.out === '1', '자기 주문이 보임', mine.ok ? `${mine.out}건` : err(mine))
  const other = tryAs(HOSP_B, `select count(*) from public.product_orders`)
  ok(other.ok && other.out === '0', '**다른 병원 주문은 안 보임** (수량·금액까지)', other.ok ? `${other.out}건` : err(other))
  const prods = tryAs(HOSP, `select count(*) from public.products`)
  ok(prods.ok && Number(prods.out) >= 1, '병원은 상품 목록을 그대로 봄 (0063 이 안 막았음)', prods.ok ? `${prods.out}건` : err(prods))
}
console.log('── 9. 병원에게도 돈은 안 옴 ──')
for (const [t, l] of [['payments', '청구'], ['payment_receipts', '입금'], ['client_monthly_actuals', '월 실적'],
                      ['operating_costs', '운영비'], ['client_documents', '문서함']]) {
  const r = tryAs(HOSP, `select count(*) from public.${t}`)
  ok(r.ok && r.out === '0', `병원에게 ${l}은 0건`, r.ok ? `${r.out}건` : err(r))
}
{
  const r = tryAs(HOSP, `select pricing from public.clients where id='${CA}'`)
  ok(!r.ok && /permission denied/i.test(r.out), '병원도 단가 칸은 못 읽음', r.ok ? `읽힘: ${r.out}` : err(r))
}
{
  //  병원이 내부 화면 데이터를 못 보는지 — 포털 밖은 통째로 남의 집입니다.
  const r = tryAs(HOSP, `select count(*) from public.site_notes`)
  ok(r.ok && r.out === '0', '병원은 현장 메모를 못 봄', r.ok ? `${r.out}건` : err(r))
  const v = tryAs(HOSP, `select count(*) from public.vehicles`)
  ok(v.ok && v.out === '0', '병원은 차량 명부를 못 봄', v.ok ? `${v.out}건` : err(v))
}

console.log('')
console.log('══ 사무실은 그대로 다 보인다 ═════════════════════════════════════')
{
  const r = tryAs(OFFICE, `select count(*) from public.clients`)
  ok(r.ok && Number(r.out) >= 2, '사무실은 거래처를 다 봄', r.ok ? `${r.out}곳` : err(r))
  const t = tryAs(OFFICE, `select public.client_billing_terms()::text`)
  ok(t.ok && /1450/.test(t.out), '사무실은 단가를 받음 (청구가 여기서 나옵니다)', t.ok ? '1450 확인' : err(t))
  const req = tryAs(OFFICE, `select count(*) from public.client_requests`)
  ok(req.ok && Number(req.out) >= 1, '사무실은 병원 요청을 봄', req.ok ? `${req.out}건` : err(req))
  const ord = tryAs(OFFICE, `select count(*) from public.product_orders`)
  ok(ord.ok && Number(ord.out) >= 1, '사무실은 주문을 봄', ord.ok ? `${ord.out}건` : err(ord))
}
