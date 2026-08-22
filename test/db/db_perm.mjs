import { execFileSync } from 'node:child_process'

//  0063 — 현장 계정에서 **서버가** 돈을 막는가.
//
//   이 검사는 화면을 보지 않습니다. **토큰만 들고 표를 직접 부릅니다.**
//   화면에서 숨기는 것은 화면을 안 쓰면 아무 뜻이 없습니다.
//
//   확인하는 것
//    · 기사 토큰으로 clients 의 단가·월정액·결제조건·세금정보를 **못 읽음**
//    · 기사 토큰으로 `select *` 도 **못 함** (별표는 돈 칸까지 훑습니다)
//    · 그런데 주소·담당자·전화·주의사항은 **읽힘** — 그것으로 일합니다
//    · 월 실적(매출·원가·이익) · 문서함(단가표) · 상품(판매가·원가) 차단
//    · 병원은 상품을 여전히 봄 (주문해야 하니까)
//    · client_billing_terms() 는 사무실만 — 기사에게는 빈 배열
//    · ⚠ **기사가 수거를 그대로 저장할 수 있음** (막다가 업무를 막으면 실패)
//    · 값은 한 줄도 안 바뀜

const DB = 'permq'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
//  ⚠ uid 를 안 주면 **superuser 로 돕니다** — RLS 도 열 권한도 건너뜁니다.
//    준비할 때만 쓰고, 확인할 때는 반드시 uid 를 넘깁니다.
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 120)
const denied = (r) => !r.ok && /permission denied/i.test(r.out)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}

// ── 준비 ────────────────────────────────────────────────────────────────────
psql(`insert into public.clients (name, type, address, manager, phone, note,
        collects_medical_waste, collects_diaper,
        pricing, monthly_flat_fee, payment_terms, payment_due_day,
        biz_no, biz_ceo, tax_email, vat_mode)
      values ('[검증P]가나요양병원','요양병원','서울시 강남구 테헤란로 152','김주현','02-555-0101','지하 주차 후 화물엘리베이터',
        true,false,
        '{"위탁의료폐기물":{"sale":1450,"cost":890}}'::jsonb, 880000, '익월 20일', 20,
        '1234567890','송명근','tax@test.kr','별도')
      on conflict do nothing`)
const CA = psql(`select id from public.clients where name='[검증P]가나요양병원' limit 1`)
psql(`insert into public.vehicles (name, waste_type, driver) values ('[검증P]의료차','의료폐기물','기사') on conflict do nothing`)
const VEH = psql(`select id from public.vehicles where name='[검증P]의료차' limit 1`)

const ADMIN = mk('pm-admin@beonemirae.test', 'admin')
const OFFICE = mk('pm-office@beonemirae.test', 'office')
const FIELD = mk('pm-field@beonemirae.test', 'field')
const HOSP = mk('pm-hosp@beonemirae.test', 'client', CA)

const MONTH = psql(`select to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')`)
psql(`insert into public.client_monthly_actuals (client_id, month, medical_kg, diaper_kg, revenue, cost, profit, source_file)
      values ('${CA}','${MONTH}',1820,0,2639000,1619800,1019200,'검증.xlsx')
      on conflict do nothing`)
psql(`insert into public.products (name, spec, unit, sale_price, cost_price, stock_key, available, active, category)
      values ('[검증P]합성수지 용기','20L','개',9000,5200,'plastic_container',true,true,'의료폐기물 용기')
      on conflict do nothing`)
psql(`insert into public.client_documents (client_id, kind, title)
      values ('${CA}','단가표','2026년 단가표') on conflict do nothing`)

const beforePricing = psql(`select pricing::text from public.clients where id='${CA}'`)

console.log('── 1. 기사 토큰으로 거래처의 돈 칸 ──')
for (const col of ['pricing', 'monthly_flat_fee', 'payment_terms', 'payment_due_day',
                   'biz_no', 'biz_ceo', 'tax_email', 'vat_mode',
                   'flat_fee_when_empty', 'flat_fee_policy_at', 'biz_type', 'biz_item']) {
  const r = tryAs(FIELD, `select ${col} from public.clients where id='${CA}'`)
  ok(denied(r), `기사는 clients.${col} 을 **못 읽음**`, r.ok ? `읽힘: ${r.out}` : err(r))
}
{
  //  ⚠ 별표가 제일 위험합니다 — 앱이 무심코 select('*') 를 쓰면 돈이 통째로 갑니다.
  const r = tryAs(FIELD, `select * from public.clients where id='${CA}'`)
  ok(denied(r), '기사는 `select *` 도 **못 함** (별표는 돈 칸까지 훑습니다)', r.ok ? '읽힘' : err(r))
}

console.log('── 2. 그런데 업무 칸은 읽혀야 합니다 ──')
{
  const r = tryAs(FIELD, `select name || '|' || address || '|' || manager || '|' || phone || '|' || note from public.clients where id='${CA}'`)
  ok(r.ok, '기사가 이름·주소·담당자·전화·주의사항을 읽음', r.ok ? r.out.slice(0, 70) : err(r))
  ok(r.ok && /테헤란로 152/.test(r.out), '주소가 실제로 들어 있음')
  ok(r.ok && /02-555-0101/.test(r.out), '전화번호가 실제로 들어 있음')
  ok(r.ok && /화물엘리베이터/.test(r.out), '주의사항이 실제로 들어 있음')
}
{
  const r = tryAs(FIELD, `select collection_cycle || '|' || contract_start from public.clients where id='${CA}'`)
  ok(r.ok, '수거주기·계약시작일도 읽음 (돈이 아니라 업무 조건입니다)', r.ok ? r.out : err(r))
}

console.log('── 3. 사무실·대표는 그대로 읽어야 합니다 ──')
for (const [uid, who] of [[ADMIN, '관리자'], [OFFICE, '사무실']]) {
  const r = tryAs(uid, `select coalesce(jsonb_array_length(public.client_billing_terms()),0)`)
  ok(r.ok && Number(r.out) >= 1, `${who}는 client_billing_terms() 로 단가를 받음`, r.ok ? `${r.out}건` : err(r))
  const t = tryAs(uid, `select public.client_billing_terms()::text`)
  ok(t.ok && /1450/.test(t.out), `${who}가 받은 값에 실제 단가가 들어 있음`, t.ok ? '1450 확인' : err(t))
  ok(t.ok && /880000/.test(t.out), `${who}가 월정액도 받음`)
}
{
  //  ⚠ 청구가 여기서 나옵니다. 사무실이 못 받으면 그 거래처 청구가 **조용히 0원**이 됩니다.
  const r = tryAs(FIELD, `select public.client_billing_terms()::text`)
  ok(r.ok && r.out === '[]', '기사에게는 **빈 배열** — 오류가 아니라 빈 값', r.ok ? r.out : err(r))
}

console.log('── 4. 월 실적 · 문서함 · 상품 ──')
{
  const f = tryAs(FIELD, `select count(*) from public.client_monthly_actuals`)
  ok(f.ok && f.out === '0', '기사는 월 실적(매출·원가·이익)을 **한 줄도 못 봄**', f.ok ? `${f.out}건` : err(f))
  const o = tryAs(OFFICE, `select count(*) from public.client_monthly_actuals`)
  ok(o.ok && Number(o.out) >= 1, '사무실은 그대로 봄', o.ok ? `${o.out}건` : err(o))
}
{
  const f = tryAs(FIELD, `select count(*) from public.client_documents`)
  ok(f.ok && f.out === '0', '기사는 거래처 문서함(단가표)을 못 봄', f.ok ? `${f.out}건` : err(f))
  const o = tryAs(OFFICE, `select count(*) from public.client_documents`)
  ok(o.ok && Number(o.out) >= 1, '사무실은 문서함을 그대로 봄', o.ok ? `${o.out}건` : err(o))
}
{
  const f = tryAs(FIELD, `select count(*) from public.products`)
  ok(f.ok && f.out === '0', '기사는 상품(판매가·원가)을 못 봄', f.ok ? `${f.out}건` : err(f))
  //  ⚠ 병원까지 막으면 소모품을 주문할 수 없습니다 — 막을 것만 막았는지 봅니다.
  const h = tryAs(HOSP, `select count(*) from public.products`)
  ok(h.ok && Number(h.out) >= 1, '**병원은 상품을 그대로 봄** (주문해야 하니까)', h.ok ? `${h.out}건` : err(h))
  const o = tryAs(OFFICE, `select count(*) from public.products`)
  ok(o.ok && Number(o.out) >= 1, '사무실도 그대로 봄', o.ok ? `${o.out}건` : err(o))
}

console.log('── 5. 이미 막혀 있던 것이 그대로인지 ──')
for (const [t, label] of [['payments', '청구'], ['payment_receipts', '입금'], ['sales_leads', '영업'],
                          ['operating_costs', '운영비'], ['revenue_overrides', '매출조정'], ['tax_filings', '신고매출']]) {
  const r = tryAs(FIELD, `select count(*) from public.${t}`)
  ok(r.ok && r.out === '0', `기사는 ${label}(${t})을 못 봄`, r.ok ? `${r.out}건` : err(r))
}

console.log('── 6. ⚠ 막다가 업무를 막지 않았는가 — 기사가 수거를 저장함 ──')
{
  const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
  const sid = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount)
                    values ('${TODAY}','${CA}','의료폐기물','예정',100) returning id`)
  const p = JSON.stringify({
    scheduleId: sid, clientId: CA, wasteType: '의료폐기물', vehicleId: VEH,
    driverName: '김준기', actualTime: '09:40', actualAmount: 118,
    handoverStatus: '수거 완료', memo: '', containers: { corrugated: 3, plastic: 2 },
  }).replace(/'/g, "''")
  const r = tryAs(FIELD, `select public.complete_collection('${p}'::jsonb)::text`)
  ok(r.ok, '**기사가 수거를 그대로 저장함** (돈을 막느라 업무를 막지 않았음)', r.ok ? r.out.slice(0, 80) : err(r))
  const saved = psql(`select actual_amount from public.schedules where id='${sid}'`)
  ok(saved === '118', '저장된 수거량이 그대로', saved)
}

console.log('── 6-b. 백업이 거래처를 통째로 받는가 ──')
{
  //  ⚠ 이걸 빠뜨리면 **백업으로 복구가 안 됩니다.** 백업은 표 이름을 돌면서
  //    전부 `select *` 로 읽는데, 거래처는 그 별표가 막혔습니다.
  const a = tryAs(ADMIN, `select public.clients_full()::text`)
  ok(a.ok, '관리자는 거래처를 통째로 받음', a.ok ? '' : err(a))
  ok(a.ok && /1450/.test(a.out), '**단가까지 들어 있음** (없으면 되살렸을 때 청구가 틀립니다)')
  ok(a.ok && /880000/.test(a.out), '월정액도 들어 있음')
  ok(a.ok && /테헤란로 152/.test(a.out), '업무 칸도 함께')

  //  ⚠ 권한이 없으면 **빈 배열이 아니라 오류**여야 합니다. 빈 배열이면
  //    「거래처 0곳인 백업」이 만들어지고, 그것으로 복구하면 다 지워집니다.
  const o = tryAs(OFFICE, `select public.clients_full()::text`)
  ok(!o.ok, '사무실은 **오류** — 빈 배열이 아님 (0곳짜리 백업이 더 위험합니다)', o.ok ? `받음: ${o.out.slice(0,40)}` : err(o))
  const f = tryAs(FIELD, `select public.clients_full()::text`)
  ok(!f.ok, '기사도 오류', f.ok ? '받음!' : err(f))
}

console.log('── 7. 값은 한 줄도 안 바뀌었는가 ──')
{
  const after = psql(`select pricing::text from public.clients where id='${CA}'`)
  ok(after === beforePricing, '단가 값이 그대로 (권한만 바꿨습니다)', after)
  const n = psql(`select count(*) from public.client_monthly_actuals where client_id='${CA}'`)
  ok(n === '1', '월 실적 줄도 그대로', `${n}건`)
}

console.log('── 8. 자가진단 ──')
{
  const r = tryAs(ADMIN, `select public.app_health_check()::text`)
  ok(r.ok, '건강검사가 돕니다', r.ok ? '' : err(r))
  ok(r.ok && /"ok": ?true/.test(r.out.replace(/\s+/g, ' ')) || (r.ok && /"ok":true/.test(r.out)),
    '**빠진 것 없음**', r.ok ? (r.out.match(/"missing":\[[^\]]*\]/) ?? [''])[0].slice(0, 120) : '')
  const v = psql(`select public.app_schema_version()`)
  ok(v === '64', 'DB 버전 64', v)
}

//  ⚠ 자가진단이 「열려 있음」을 실제로 잡는지 — 검사 자체가 죽어 있으면
//    앞으로 누가 권한을 되돌려도 아무도 모릅니다. 일부러 되돌려 보고 잡히는지
//    확인한 뒤 다시 닫습니다.
console.log('── 9. 자가진단이 되돌림을 잡는가 (일부러 열었다 닫기) ──')
{
  psql(`grant select on public.clients to authenticated`)
  const r = tryAs(ADMIN, `select public.app_health_check()::text`)
  ok(r.ok && /거래처 표 전체 읽기가 열려 있음/.test(r.out), '표 권한을 되돌리면 자가진단이 잡아냄',
    r.ok ? '잡음' : err(r))
  psql(`revoke select on public.clients from authenticated`)
  psql(`grant select (id, name, type, address, manager, phone, collection_cycle,
        collects_medical_waste, collects_diaper, storage_size, note, is_demo_generated,
        demo_session_id, active, created_at, updated_at, created_by, updated_by,
        contract_start, contract_end, collect_time, disposal_site, diaper_cycle,
        name_key, request_id, education_at) on public.clients to authenticated`)
  const back = tryAs(ADMIN, `select public.app_health_check()::text`)
  ok(back.ok && !/거래처 표 전체 읽기가 열려 있음/.test(back.out), '닫으면 다시 조용해짐')
  const f = tryAs(FIELD, `select pricing from public.clients where id='${CA}'`)
  ok(denied(f), '되돌린 뒤에도 기사는 단가를 못 읽음', f.ok ? '읽힘!' : err(f))
}
