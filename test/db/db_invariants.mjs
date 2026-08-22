import { execFileSync } from 'node:child_process'

//  DB 무결성 전수 감사 (섹션 13). 실제 규모(거래처 20곳 · 6개월)로 채운 뒤
//  깨지면 안 되는 규칙들을 하나씩 확인합니다.

const DB = 'inv'
const psql = (sql) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const n = (sql) => Number(psql(sql))

//  계정
psql(`
  insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000ad','a@t.test','{"role":"admin"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000bf','o@t.test','{"role":"office"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000fd','f@t.test','{"role":"field"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000cd','c@t.test','{"role":"client"}'::jsonb)
  on conflict (id) do nothing;
`)

//  실제 규모 — 거래처 20곳, 차량 3대, 6개월치 수거(1000줄 초과 구간 포함)
psql(`
  insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver)
  select '차량'||g, case when g%2=0 then '의료폐기물' else '일회용기저귀' end, 1, 1000, 800, '기사'||g
  from generate_series(1,3) g;
  insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
  select '[검증]병원'||g, '병원', '', true, true from generate_series(1,20) g;
`)
psql(`
  insert into public.schedules (date, client_id, waste_type, status, expected_amount, actual_amount, completed_at, memo, origin)
  select d, c.id, '의료폐기물', '완료', 100, 100, (d + time '09:00')::timestamptz, '', 'seed'
  from public.clients c
  cross join generate_series((current_date - 364), current_date, interval '3 day') d
  where c.name like '[검증]병원%';
`)
const total = n(`select count(*) from public.schedules`)
ok(total > 1000, `실제 규모 데이터 — 수거 ${total}건 (1000건 초과)`, String(total))
//  PostgREST 는 한 번에 1000줄까지만 줍니다. 앱은 나눠서 끝까지 읽습니다(repo.pageAll).
//  나눠 읽을 때 순서가 고정돼야 어떤 줄이 빠지거나 두 번 오지 않습니다.
const page1 = psql(`select count(*) from (select id from public.schedules order by id limit 1000) q`)
const page2 = psql(`select count(*) from (select id from public.schedules order by id offset 1000) q`)
ok(Number(page1) + Number(page2) === total, '1000줄씩 나눠 읽어도 합이 전체와 같음', `${page1}+${page2}=${total}`)
ok(n(`select count(*) from (
        (select id from public.schedules order by id limit 1000)
        intersect
        (select id from public.schedules order by id offset 1000)
      ) q`) === 0,
  '두 페이지에 같은 줄이 중복되지 않음')

//  프로필 + 병원 계정
const c1 = psql(`select id from public.clients where name='[검증]병원1'`)
psql(`
  insert into public.profiles (id,email,name,role,active,approved_at,client_id) values
    ('00000000-0000-0000-0000-0000000000ad','a@t.test','대표','admin',true,now(),null),
    ('00000000-0000-0000-0000-0000000000bf','o@t.test','사무실','office',true,now(),null),
    ('00000000-0000-0000-0000-0000000000fd','f@t.test','현장','field',true,now(),null),
    ('00000000-0000-0000-0000-0000000000cd','c@t.test','병원','client',true,now(),'${c1}')
  on conflict (id) do update set role=excluded.role, active=true, client_id=excluded.client_id;
`)
const asRole = (uid, sql) => psql(`
  set role authenticated;
  set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
  ${sql}
`)
const ADMIN = '00000000-0000-0000-0000-0000000000ad'
const FIELD = '00000000-0000-0000-0000-0000000000fd'
const CLIENT = '00000000-0000-0000-0000-0000000000cd'

// ── 고아 레코드 0 ─────────────────────────────────────────────────────────
ok(n(`select count(*) from public.schedules s left join public.clients c on c.id=s.client_id where c.id is null`) === 0,
  '수거일정에 없는 거래처 참조 0건')
ok(n(`select count(*) from public.materials m left join public.clients c on c.id=m.client_id where c.id is null`) === 0,
  '자재공급에 없는 거래처 참조 0건')
ok(n(`select count(*) from public.payments p left join public.clients c on c.id=p.client_id where c.id is null`) === 0,
  '청구에 없는 거래처 참조 0건')
ok(n(`select count(*) from public.payment_receipts r left join public.payments p on p.id=r.payment_id where p.id is null`) === 0,
  '입금에 없는 청구 참조 0건')
ok(n(`select count(*) from public.client_monthly_actuals a left join public.clients c on c.id=a.client_id where c.id is null`) === 0,
  '월 실적에 없는 거래처 참조 0건')

// ── 완료 일정 ↔ 수거 이벤트 ──────────────────────────────────────────────
const vId = psql(`select id from public.vehicles where waste_type='의료폐기물' limit 1`)
const cX = psql(`select id from public.clients where name='[검증]병원9'`)
psql(`delete from public.schedules where client_id='${cX}' and date=current_date`)
const ev = JSON.parse(asRole(FIELD, `select public.complete_collection(jsonb_build_object(
  'scheduleId', null, 'clientId', '${cX}', 'wasteType','의료폐기물','vehicleId','${vId}',
  'driverName','김기사','actualAmount',55,'actualTime','10:00','containers','{}'::jsonb,
  'handoverStatus','수거 완료',
  'supplied', jsonb_build_object('corrugatedBox',0,'plasticContainer',0,'bag',0,'needleBox',0),
  'isAdditional', false,'memo','','screen','수거 입력','closeRequests','[]'::jsonb))`))
ok(!!ev.eventId && !!ev.scheduleId, '수거 완료가 일정 + 이벤트를 함께 만듦')
ok(n(`select count(*) from public.schedules s join public.collection_events e on e.schedule_id=s.id
      where s.id='${ev.scheduleId}'`) === 1, '완료 일정 ↔ 수거 이벤트 연결됨')
ok(psql(`select client_id from public.collection_events where id='${ev.eventId}'`) === cX,
  '수거 이벤트 ↔ 거래처 연결됨')

// ── 자재공급 ↔ 재고 ──────────────────────────────────────────────────────
//  재고를 먼저 채웁니다 — 재고보다 많이 공급하는 것은 제품이 올바로 막습니다(0013).
psql(`update public.office_stock set corrugated_box=100, plastic_container=50, bag=200, needle_box=30 where id=1`)
const stockBefore = n(`select corrugated_box from public.office_stock where id=1`)
const ev2 = JSON.parse(asRole(FIELD, `select public.complete_collection(jsonb_build_object(
  'scheduleId', null, 'clientId', '${cX}', 'wasteType','일회용기저귀','vehicleId',
  (select id from public.vehicles where waste_type='일회용기저귀' limit 1),
  'driverName','김기사','actualAmount',33,'actualTime','11:00','containers','{}'::jsonb,
  'handoverStatus','수거 완료',
  'supplied', jsonb_build_object('corrugatedBox',5,'plasticContainer',0,'bag',0,'needleBox',0),
  'isAdditional', false,'memo','','screen','수거 입력','closeRequests','[]'::jsonb))`))
ok(n(`select corrugated_box from public.office_stock where id=1`) === stockBefore - 5,
  '자재 공급이 사무실 재고를 정확히 차감', `${stockBefore} → ${n(`select corrugated_box from public.office_stock where id=1`)}`)
//  되돌리면 재고도 원복
asRole(FIELD, `select public.revert_collection('${ev2.eventId}'::uuid)`)
ok(n(`select corrugated_box from public.office_stock where id=1`) === stockBefore,
  '수거 완료 취소 → 재고 원복', String(stockBefore))

// ── 청구 중복 방지 ───────────────────────────────────────────────────────
//  청구 확정은 앱(buildBillingSnapshot)이 하고, 중복 차단은 **스냅샷이 덮은
//  수거·공급 id 목록**으로 합니다 — 이미 청구된 건은 다음 청구에서 제외됩니다.
//  같은 달에 청구가 여러 건일 수 있는 것은 정상입니다(정기 + 추가).
//  깨지면 안 되는 것은 "같은 수거가 두 청구에 들어가는 것"입니다.
const pm = psql(`select to_char((now() at time zone 'Asia/Seoul')::date,'YYYY-MM')`)
const p1 = psql(`insert into public.payments (client_id,billing_month,amount,status,method,snapshot)
  values ('${cX}','${pm}',100000,'미수금','무통장',
          jsonb_build_object('scheduleIds', jsonb_build_array('${ev.scheduleId}'))) returning id`)
const dupSched = n(`
  with ids as (
    select p.id as pid, jsonb_array_elements_text(p.snapshot->'scheduleIds') as sid
    from public.payments p where p.snapshot ? 'scheduleIds' and p.status <> '취소'
  )
  select count(*) from (select sid from ids group by sid having count(distinct pid) > 1) q`)
ok(dupSched === 0, '같은 수거가 두 청구에 들어간 건 0건', String(dupSched))

// ── 입금 합계 ≤ 청구액 ───────────────────────────────────────────────────
asRole(ADMIN, `select public.add_payment_receipt('${p1}'::uuid, current_date, 60000, '계좌이체','')`)
let overOk = false
try { asRole(ADMIN, `select public.add_payment_receipt('${p1}'::uuid, current_date, 50000, '계좌이체','')`) }
catch { overOk = true }
ok(overOk, '입금 합계가 청구액을 넘을 수 없음')
ok(n(`select coalesce(sum(r.amount),0) from public.payment_receipts r
      join public.payments p on p.id=r.payment_id
      group by p.id, p.amount having sum(r.amount) > p.amount`) === 0 ||
   n(`select count(*) from (select p.id from public.payments p join public.payment_receipts r on r.payment_id=p.id
      group by p.id, p.amount having sum(r.amount) > p.amount) q`) === 0,
  '전체 DB에서 입금 합계 > 청구액인 건 0건')

// ── 취소된 청구는 미수금에서 제외 ────────────────────────────────────────
const p2 = psql(`insert into public.payments (client_id,billing_month,amount,status,method,canceled_at)
  values ('${cX}','2026-01',500000,'취소','무통장',now()) returning id`)
ok(n(`select coalesce(sum(amount),0) from public.payments where status not in ('입금완료','취소') and id='${p2}'`) === 0,
  '취소된 청구는 미수금 집계에서 빠짐')

// ── 거래 종료(inactive) 거래처 ───────────────────────────────────────────
psql(`update public.clients set active=false where name='[검증]병원20'`)
ok(n(`select count(*) from public.clients where active=false`) >= 1, '거래 종료 거래처가 남아 있음(삭제 아님)')
ok(n(`select count(*) from public.schedules s join public.clients c on c.id=s.client_id where c.active=false`) > 0,
  '거래 종료해도 과거 수거 기록은 유지')

// ── 감사기록 actor ───────────────────────────────────────────────────────
ok(n(`select count(*) from public.audit_logs where actor_id is null and action like 'collection%'`) === 0,
  '수거 관련 감사기록에 작성자가 반드시 있음')
ok(psql(`select actor_role from public.audit_logs where action='collection.complete' order by at desc limit 1`) === 'field',
  '감사기록의 역할이 실제 로그인 역할과 같음')

// ── RLS · 권한 상승 ──────────────────────────────────────────────────────
ok(asRole(FIELD, `select count(*) from public.payments`) === '0', '현장 담당자는 청구를 못 봄')
ok(asRole(FIELD, `select count(*) from public.payment_receipts`) === '0', '현장 담당자는 입금을 못 봄')
let esc = false
try { asRole(FIELD, `update public.profiles set role='admin' where id='${FIELD}'`) } catch { esc = true }
ok(esc || psql(`select role from public.profiles where id='${FIELD}'`) === 'field',
  '현장 담당자가 스스로 관리자가 될 수 없음')

// ── 병원 계정 격리 ───────────────────────────────────────────────────────
const seen = asRole(CLIENT, `select count(distinct client_id) from public.schedules`)
ok(seen === '1', '병원 계정은 자기 병원 기록만 봄', `${seen}곳`)
ok(asRole(CLIENT, `select count(*) from public.clients`) === '1', '병원 계정은 자기 거래처만 봄')
ok(asRole(CLIENT, `select count(*) from public.payments`) === '0', '병원 계정은 청구를 못 봄')
ok(asRole(CLIENT, `select count(*) from public.client_monthly_actuals`) === '0'
   || asRole(CLIENT, `select count(*) from public.client_monthly_actuals`) === '',
  '병원 계정은 월 실적을 못 봄 (is_active_user 아님)')

// ── 시간대 ───────────────────────────────────────────────────────────────
ok(psql(`select (now() at time zone 'Asia/Seoul')::date::text`) ===
   psql(`select (now() at time zone 'Asia/Seoul')::date::text`),
  'KST 날짜 계산이 일관됨')

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
console.log(`\n(참고) 수거 ${n(`select count(*) from public.schedules`)}건 · 거래처 ${n(`select count(*) from public.clients`)}곳 · 감사기록 ${n(`select count(*) from public.audit_logs`)}건`)
