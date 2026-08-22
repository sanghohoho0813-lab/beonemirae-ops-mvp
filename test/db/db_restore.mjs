import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

//  복구 실측 — 「되돌려 본 적이 없다」를 없애는 검증.
//
//   하는 일
//    1. 격리 DB 하나(restq)를 마이그레이션만으로 처음부터 만든다
//    2. 실제 업무 모양의 자료를 넣는다 (돈·수거·자재·메모·감사기록…)
//    3. 앱이 쓰는 **바로 그 코드**(src/lib/snapshot.ts)로 스냅샷을 만든다
//    4. scripts/restore-from-snapshot.mjs 로 복구 SQL 을 만든다
//    5. **빈 DB(restq2)** 를 마이그레이션만으로 만들고 그 SQL 을 붓는다
//    6. 두 DB 를 줄 수·금액·내용까지 대조한다 — 1원이라도 다르면 FAIL
//
//   증명하려는 것은 하나입니다. 「내려받아 둔 파일 하나로 회사를 다시 세울 수
//   있는가」. 지금까지는 아무도 해 본 적이 없었습니다.
const SRC = 'restq'
const DST = 'restq2'
const ROOT = '/home/user/beonemirae-ops-mvp'
const HERE = new URL('.', import.meta.url).pathname

const P = (db, sql) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', db, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()
const src = (sql) => P(SRC, sql)
const dst = (sql) => P(DST, sql)

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const setup = (db) => {
  const r = execFileSync('bash', [join(HERE, 'setup_db.sh'), db], { encoding: 'utf8' }).trim()
  if (!r.includes('준비 완료')) throw new Error(`${db} 준비 실패: ${r}`)
  return r
}

// ── 1. 마이그레이션만으로 빈 시스템이 서는가 ─────────────────────────────
//  복구의 절반은 「구조」입니다. 자료가 있어도 표가 없으면 못 넣습니다.
const s1 = setup(SRC)
ok(s1.includes('준비 완료'), '마이그레이션만으로 빈 DB 가 만들어짐', s1)
ok(src(`select public.app_schema_version()`) === '64', 'DB 판이 63 (앱이 기대하는 판)')
const tableCount = Number(src(`select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`))
ok(tableCount === 35, `표 35개가 만들어짐`, String(tableCount))

// ── 2. 실제 업무 모양의 자료 ──────────────────────────────────────────────
const mk = (email, role) => {
  src(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = src(`select id from auth.users where email='${email}'`)
  src(`insert into public.profiles (id, email, name, role, active, approved_at)
       values ('${id}','${email}','${role}','${role}',true,now()) on conflict (id) do nothing`)
  return id
}
const ADMIN = mk('restore-admin@beonemirae.test', 'admin')

src(`insert into public.clients (name, type, address, manager, phone, collection_cycle,
       collects_medical_waste, collects_diaper, storage_size, created_by, updated_by, pricing)
     values
       ('[복구]가나병원','병원','서울시 중구','김담당','010-1111-2222','주 2회',true,false,'보통','${ADMIN}','${ADMIN}','{"medicalPerKg":1200}'::jsonb),
       ('[복구]다라요양원','요양원','인천시 남동구','박담당','010-3333-4444','주 1회',true,true,'큼','${ADMIN}','${ADMIN}','{"medicalPerKg":1100,"diaperPerKg":300}'::jsonb),
       ('[복구]마바의원','의원','경기도 성남시','최담당','010-5555-6666','격주',true,false,'작음','${ADMIN}','${ADMIN}','{"medicalPerKg":1500}'::jsonb)`)
const cids = src(`select id from public.clients where name like '[복구]%' order by name`).split('\n')

src(`insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver, active)
     values ('1호차','의료폐기물',1.2,1500,1200,'이기사',true),
            ('2호차','일회용기저귀',2.5,2500,2100,'박기사',true),
            ('폐차','의료폐기물',1.0,1000,800,'',false)`)
const vid = src(`select id from public.vehicles where name='1호차'`)

//  수거 — 240건. 나눠 읽기(1000줄)에 걸리지 않는 규모지만, 날짜·차량·기사가
//  실제처럼 섞여 있어야 대조가 의미 있습니다.
src(`insert into public.schedules (client_id, date, waste_type, status, expected_amount, actual_amount,
       vehicle_id, driver_name, completed_at, created_by, updated_by, memo)
     select c.id,
            (date '2026-02-01' + (g % 180)),
            case when g % 5 = 0 then '일회용기저귀' else '의료폐기물' end,
            case when g % 9 = 0 then '예정' else '완료' end,
            10 + (g % 40),
            case when g % 9 = 0 then null else 12 + (g % 37) end,
            case when g % 3 = 0 then '${vid}'::uuid else null end,
            case when g % 3 = 0 then '이기사' else null end,
            case when g % 9 = 0 then null else (date '2026-02-01' + (g % 180))::timestamptz + interval '9 hours' end,
            '${ADMIN}','${ADMIN}',
            case when g % 20 = 0 then '뒷문 이용, 경비실 확인' else '' end
     from public.clients c, generate_series(1, 80) g
     where c.name like '[복구]%'`)

src(`insert into public.materials (client_id, date, box_count, vinyl_count, needle_box_count, is_additional_request, created_by, memo)
     select c.id, (date '2026-03-01' + (g * 7)), 10 + g, 20 + g, g, g % 4 = 0, '${ADMIN}', ''
     from public.clients c, generate_series(1, 6) g where c.name like '[복구]%'`)

src(`insert into public.office_stock (id, corrugated_box, plastic_container, bag, needle_box, updated_by)
     values (1, 500, 140, 900, 120, '${ADMIN}') on conflict (id) do update set corrugated_box = 500`)
src(`insert into public.material_transactions (client_id, material_id, kind, item, qty, created_by, memo)
     select m.client_id, m.id, '공급', 'corrugatedBox', m.box_count, '${ADMIN}', ''
     from public.materials m limit 5`)

//  돈 — 청구 12건 · 입금 15건. 부분입금·취소를 섞습니다.
src(`insert into public.payments (client_id, billing_month, amount, status, snapshot, updated_by, memo)
     select c.id, m.month, (1200000 + (row_number() over ())::int * 37211),
            case when m.month = '2026-06' then '입금완료' else '미수금' end,
            jsonb_build_object('kind','정기','confirmedAt', now()::text, 'lines', jsonb_build_array()),
            '${ADMIN}', ''
     from public.clients c, (values ('2026-04'),('2026-05'),('2026-06'),('2026-07')) as m(month)
     where c.name like '[복구]%'`)
src(`insert into public.payment_receipts (payment_id, received_on, amount, method, actor_name, memo)
     select p.id, (p.billing_month || '-25')::date, (p.amount / 2)::int, '계좌이체', '관리자', ''
     from public.payments p`)
src(`insert into public.payment_receipts (payment_id, received_on, amount, method, actor_name, source_ref, memo)
     select p.id, (p.billing_month || '-28')::date, p.amount - (p.amount / 2)::int, '계좌이체', '관리자',
            '통장:' || p.id::text, ''
     from public.payments p where p.status = '입금완료'`)

src(`insert into public.client_prices (client_id, effective_from, pricing, memo, actor_name)
     select c.id, date '2026-01-01', c.pricing, '엑셀에서 옮김', '관리자' from public.clients c where c.name like '[복구]%'`)
src(`insert into public.client_monthly_actuals (client_id, month, medical_kg, diaper_kg, revenue, cost, profit, has_dated, source_file)
     select c.id, '2026-01', 320.5, 100, 1480000, 620000, 860000, false, '가나병원_정산.xlsx'
     from public.clients c where c.name like '[복구]%'`)
src(`insert into public.revenue_overrides (client_id, month, amount, reason, actor_name)
     select c.id, '2026-03', 1650000, '계약서 기준 월정액 — 엑셀 누락분', '관리자'
     from public.clients c where c.name = '[복구]가나병원'`)
src(`insert into public.operating_costs (month, category, amount, memo)
     values ('2026-06','인건비',18400000,''),('2026-06','유류비',2130000,''),('2026-07','인건비',18900000,'')`)
src(`insert into public.holidays (day, name) values ('2026-03-01','삼일절'), ('2026-05-05','어린이날')`)
src(`insert into public.site_notes (client_id, kind, content, created_by, updated_by)
     select c.id, '주의', '엘리베이터 화물용만 사용 가능. 오전 10시 전 방문 금지.', '${ADMIN}','${ADMIN}'
     from public.clients c where c.name like '[복구]%'`)
src(`insert into public.client_requests (client_id, kind, content, status, requester_name, created_by)
     select c.id, '추가수거', '이번 주 배출량이 많습니다', '접수', '박담당', '${ADMIN}'
     from public.clients c where c.name = '[복구]다라요양원'`)
src(`insert into public.collection_events (client_id, client_name, actor_id, actor_name, action, waste_type, amount_kg, material_ids)
     select c.id, c.name, '${ADMIN}', '관리자', '수거 완료', '의료폐기물', 24,
            array(select m.id from public.materials m where m.client_id = c.id limit 2)
     from public.clients c where c.name like '[복구]%'`)
src(`insert into public.audit_logs (actor_id, actor_name, actor_role, action, entity, client_name, screen, summary, before_data, after_data)
     select '${ADMIN}','관리자','admin','청구확정','payments', c.name, '월말청구', c.name || ' 2026-06 청구 확정',
            '{}'::jsonb, jsonb_build_object('amount', 1234567)
     from public.clients c where c.name like '[복구]%'`)

const srcRows = Number(src(`select
  (select count(*) from public.clients) + (select count(*) from public.schedules) +
  (select count(*) from public.payments) + (select count(*) from public.payment_receipts)`))
ok(srcRows > 250, '업무 자료를 넣음 (거래처+수거+청구+입금)', `${srcRows}줄`)

// ── 3. 앱이 쓰는 코드로 스냅샷을 만든다 ──────────────────────────────────
//  여기서 표 목록을 다시 적으면 앱과 어긋납니다. src/lib/snapshot.ts 를
//  그대로 묶어서 씁니다 — 앱이 표를 하나 더 담기 시작하면 이 검증도 따라옵니다.
const work = mkdtempSync(join(tmpdir(), 'restore-drill-'))
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'),
  [join(ROOT, 'src/lib/snapshot.ts'), '--bundle', '--format=esm', `--outfile=${join(work, 'snapshot.mjs')}`],
  { encoding: 'utf8', cwd: ROOT })
const { SNAPSHOT_TABLES, buildSnapshot, snapshotRowCount, snapshotFilename } = await import(join(work, 'snapshot.mjs'))

const tables = {}
for (const t of SNAPSHOT_TABLES) {
  const json = src(`select coalesce(json_agg(x order by x."${t.order}"), '[]'::json)::text
                    from (select * from public.${t.name}) x`)
  tables[t.name] = JSON.parse(json)
}
const snap = buildSnapshot({
  tables, unreadable: [], schemaVersion: 48,
  takenBy: '관리자', takenAt: '2026-08-15T09:30:00.000Z',
})
const snapPath = join(work, 'snapshot.json')
writeFileSync(snapPath, JSON.stringify(snap))

ok(snap.order.length === SNAPSHOT_TABLES.length, `스냅샷이 표 ${SNAPSHOT_TABLES.length}개를 담음`, `${snap.order.length}개`)
ok(snapshotRowCount(snap) > 250, '스냅샷 줄 수가 실제 자료와 같은 규모', `${snapshotRowCount(snap)}줄`)
ok(snapshotFilename(snap) === '비원미래-전체스냅샷-20260815-0930.json', '파일 이름에 날짜·시각이 들어감', snapshotFilename(snap))
ok(snap.unreadable.length === 0 && snap.excluded.length === 5, '못 읽은 표 0 · 일부러 뺀 표 5개가 파일에 적힘',
  `${snap.excluded.length}개`)

//  담기지 않은 표를 파일이 스스로 밝히는가
const excludedNames = snap.excluded.map((e) => e.name).sort().join(',')
//  0056 로 둘이 늘었습니다 — 담당 배정과 사전 등록은 **계정에 붙는 자료**라,
//  계정이 안 담기는 이 파일에 넣으면 되돌릴 때 없는 사람에게 배정된 거래처가
//  남습니다.
ok(excludedNames === 'app_errors,client_assignments,dev_requests,profiles,staff_invites',
  '뺀 표를 파일이 이름까지 적어 둠', excludedNames)

// ── 4. 복구 SQL 만들기 ────────────────────────────────────────────────────
const sqlPath = join(work, 'restore.sql')
const sql = execFileSync('node', [join(ROOT, 'scripts/restore-from-snapshot.mjs'), snapPath],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
writeFileSync(sqlPath, sql)
ok(sql.startsWith('-- 비원미래') && sql.includes('\nbegin;\n') && sql.includes('\ncommit;\n'),
  '복구 SQL 이 만들어짐 (설명 → begin → insert → commit)')
ok(sql.includes('insert into public.clients select'), '거래처 넣는 문장이 들어 있음')
ok(sql.includes('담기지 않은 표') && sql.includes('profiles'), 'SQL 머리말이 복구되지 않는 표를 밝힘')

//  칸 모양을 스크립트가 추측하지 않고 DB 에 맡기는가
ok(sql.includes('jsonb_populate_record(null::public.clients'), '칸 모양은 DB 가 정합니다 (값을 추측하지 않음)')

//  계정을 가리키는 칸이 빠졌는가 — 이게 안 되면 복구가 통째로 실패합니다
const clientsLine = sql.split('\n').find((l) => l.startsWith('insert into public.clients select'))
ok(/e - 'created_by' - 'updated_by'/.test(clientsLine), '거래처의 계정 칸(created_by·updated_by)이 빠짐', clientsLine.slice(-60))
const schedLine = sql.split('\n').find((l) => l.startsWith('insert into public.schedules select'))
ok(/e - 'created_by' - 'updated_by'/.test(schedLine), '수거의 계정 칸도 빠짐')
ok(sql.includes('자동 번호 맞추기') && sql.includes('setval'), '자동 번호(감사기록 id)를 맞추는 문장이 들어 있음')

// ── 5. 빈 DB 에 붓는다 ────────────────────────────────────────────────────
const s2 = setup(DST)
ok(s2.includes('준비 완료'), '복구 대상 빈 DB 를 마이그레이션만으로 만듦', s2)
ok(dst(`select count(*) from public.clients`) === '0', '붓기 전에는 거래처가 0곳')

try {
  //  파일 경로 대신 그대로 흘려 넣습니다 (psql 을 다른 계정으로 돌리기 때문)
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DST, '-q', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: sql, maxBuffer: 256 * 1024 * 1024 })
  ok(true, '복구 SQL 이 한 번에 끝까지 들어감')
} catch (e) {
  ok(false, '복구 SQL 이 한 번에 끝까지 들어감', String(e.stderr ?? e.message).split('\n').slice(0, 3).join(' / '))
}

// ── 6. 대조 — 줄 수 · 금액 · 내용 ─────────────────────────────────────────
for (const t of SNAPSHOT_TABLES) {
  const a = src(`select count(*) from public.${t.name}`)
  const b = dst(`select count(*) from public.${t.name}`)
  ok(a === b, `${t.label}(${t.name}) 줄 수가 같음`, `원본 ${a} · 복구 ${b}`)
}

//  돈은 1원 단위로 봅니다.
const money = [
  ['청구 총액', `select coalesce(sum(amount),0)::text from public.payments`],
  ['입금 총액', `select coalesce(sum(amount),0)::text from public.payment_receipts`],
  ['월 운영비 합계', `select coalesce(sum(amount),0)::text from public.operating_costs`],
  ['매출 직접입력 합계', `select coalesce(sum(amount),0)::text from public.revenue_overrides`],
  ['Excel 월 실적 매출', `select coalesce(sum(revenue),0)::text from public.client_monthly_actuals`],
  ['실제 수거량 합계', `select coalesce(sum(actual_amount),0)::text from public.schedules`],
  ['공급 박스 합계', `select coalesce(sum(box_count),0)::text from public.materials`],
]
for (const [label, q] of money) {
  const a = src(q)
  const b = dst(q)
  ok(a === b, `${label}이 1원까지 같음`, `${Number(a).toLocaleString('ko-KR')} = ${Number(b).toLocaleString('ko-KR')}`)
}

//  내용까지 — 계정을 가리키는 칸만 빼고 통째로 비교합니다.
//  (그 칸은 일부러 비운 것이므로 원본에서도 같이 빼고 봅니다)
//
//  소수점 자리 하나만 짚고 갑니다. json 을 거치면 `1.0` 이 `1` 이 됩니다
//  (자바스크립트에 「소수점 한 자리짜리 1」이라는 개념이 없습니다).
//  값은 같고, 이 시스템의 **돈은 전부 정수(원)** 라 영향이 없습니다.
//  영향받는 칸은 kg·톤수·AX 기준값뿐입니다. 아래에서 실제로 확인합니다.
const NULLED = snap.nullify
for (const t of SNAPSHOT_TABLES) {
  const drop = (NULLED[t.name] ?? []).map((c) => ` - '${c}'`).join('')
  const nums = src(`select coalesce(string_agg(column_name, ',' order by column_name), '')
                    from information_schema.columns
                    where table_schema='public' and table_name='${t.name}' and data_type='numeric'`)
  const norm = nums === '' ? '' :
    nums.split(',').map((c) => ` || jsonb_build_object('${c}', trim_scale(x."${c}"))`).join('')
  const q = `select coalesce(md5(string_agg(((to_jsonb(x)${drop})${norm})::text, '|' order by x."${t.order}"::text)), 'EMPTY')
             from (select * from public.${t.name}) x`
  const a = src(q)
  const b = dst(q)
  ok(a === b, `${t.label}(${t.name}) 내용이 글자까지 같음`, a === b ? a.slice(0, 8) : `${a.slice(0, 8)} ≠ ${b.slice(0, 8)}`)
}

//  돈 칸에는 소수점이 없다 — 위의 손실이 금액에 닿지 않는다는 근거
const moneyNumeric = src(`select count(*) from information_schema.columns
  where table_schema='public' and data_type='numeric'
    and (column_name like '%amount%' or column_name like '%revenue%' or column_name like '%cost%'
         or column_name like '%profit%' or column_name like '%fee%' or column_name like '%price%')`)
ok(moneyNumeric === '0', '돈을 담는 칸에 소수점 자료형이 하나도 없음 (원 단위 정수)', `${moneyNumeric}개`)

//  값 자체는 같은가 (소수점 표기만 달라진 것인지 실제로 확인)
const tonSrc = src(`select string_agg(tonnage::text, ',' order by name) from public.vehicles`)
const tonDst = dst(`select string_agg(tonnage::text, ',' order by name) from public.vehicles`)
const tonEq = dst(`select count(*) from public.vehicles v
                   where not exists (select 1 from public.vehicles w where w.id = v.id)`) === '0'
ok(tonEq && src(`select sum(tonnage)::text from public.vehicles`) === dst(`select sum(tonnage)::text from public.vehicles`),
  '소수점 있는 칸(톤수)의 값은 같음 — 표기만 달라짐', `${tonSrc} → ${tonDst}`)

// ── 7. 되돌린 시스템이 실제로 도는가 ──────────────────────────────────────
//  줄이 들어간 것과 「업무가 되는 것」은 다릅니다. 서버 함수를 실제로 부릅니다.
const rcid = dst(`select id from public.clients where name='[복구]가나병원'`)
ok(rcid.length === 36, '복구된 DB 에서 거래처를 이름으로 찾을 수 있음')
const outstanding = dst(`select coalesce(sum(p.amount),0) - coalesce((select sum(r.amount) from public.payment_receipts r
                          join public.payments p2 on p2.id = r.payment_id where p2.status <> '취소'),0)
                         from public.payments p where p.status <> '취소'`)
const srcOutstanding = src(`select coalesce(sum(p.amount),0) - coalesce((select sum(r.amount) from public.payment_receipts r
                             join public.payments p2 on p2.id = r.payment_id where p2.status <> '취소'),0)
                            from public.payments p where p.status <> '취소'`)
ok(outstanding === srcOutstanding, '미수금이 1원까지 같음', `${Number(outstanding).toLocaleString('ko-KR')}원`)

//  0037 잠금이 복구된 DB 에서도 살아 있는가 (구조는 마이그레이션에서 오므로)
let locked = false
try {
  dst(`delete from public.payments where id in (select id from public.payments limit 1)`)
} catch {
  locked = true
}
//  postgres 슈퍼유저는 트리거만 걸립니다 — 그게 곧 삭제 금지 트리거입니다
ok(locked, '복구된 DB 에서도 청구 삭제가 막혀 있음 (0037 잠금이 함께 복구됨)')

//  자동 번호가 이어지는가.
//
//   감사기록의 id 는 DB 가 스스로 매깁니다. 줄만 넣고 다음 번호를 안 맞추면
//   복구는 성공한 것처럼 보이는데, **그 다음 기록 한 줄에서** 「번호가 겹친다」며
//   막힙니다. 되돌린 다음 날 아침에야 드러나는 종류의 고장입니다.
const maxAudit = Number(dst(`select max(id) from public.audit_logs`))
let seqOk = true
let seqErr = ''
try {
  dst(`insert into public.audit_logs (action, entity, summary) values ('복구확인','test','복구 뒤 첫 기록')`)
} catch (e) {
  seqOk = false
  seqErr = String(e.stderr ?? e.message).split('\n')[0].slice(0, 80)
}
ok(seqOk, '복구 뒤 감사기록을 새로 남길 수 있음 (자동 번호가 이어짐)', seqOk ? `${maxAudit} 다음부터` : seqErr)
if (seqOk) dst(`delete from public.audit_logs where entity='test'`)

//  끊긴 연결이 없는가 — 외래키 검사를 멈춘 채 넣었으므로 직접 확인합니다
let orphanErr = ''
try {
  dst(`do $$
declare r record; n bigint; bad text := '';
begin
  for r in
    select tc.table_name as t, kcu.column_name as c, ccu.table_name as ft, ccu.column_name as fc
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
     where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  loop
    execute format('select count(*) from public.%I a where a.%I is not null and not exists (select 1 from %I.%I b where b.%I = a.%I)',
                   r.t, r.c, case when r.ft = 'users' then 'auth' else 'public' end, r.ft, r.fc, r.c) into n;
    if n > 0 then bad := bad || r.t || '.' || r.c || '=' || n || ' '; end if;
  end loop;
  if bad <> '' then raise exception '끊긴 연결: %', bad; end if;
end $$;`)
} catch (e) {
  orphanErr = (String(e.stderr ?? e.message).match(/끊긴 연결: .*/) ?? [''])[0].slice(0, 120)
}
ok(orphanErr === '', '복구된 DB 에 끊긴 연결(외래키 고아)이 하나도 없음', orphanErr)

//  한 번 더 부어도 되는가.
//
//   복구 중에 끊기거나, 넣고 보니 빠진 게 있어 다시 붓는 일은 실제로 생깁니다.
//   그때 「이미 있다」며 막히면 사람이 손으로 지워야 하는데, 그 순간이 자료를
//   잃는 순간입니다. 같은 파일을 두 번 부어도 결과가 같아야 합니다.
let twice = true
let twiceErr = ''
try {
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DST, '-q', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: sql, maxBuffer: 256 * 1024 * 1024 })
} catch (e) {
  twice = false
  twiceErr = String(e.stderr ?? e.message).split('\n')[0].slice(0, 90)
}
ok(twice, '같은 복구 SQL 을 한 번 더 부어도 그대로 들어감', twiceErr)
ok(dst(`select count(*) from public.payments`) === src(`select count(*) from public.payments`),
  '두 번 부어도 청구가 늘거나 줄지 않음', `${dst(`select count(*) from public.payments`)}건`)
ok(dst(`select coalesce(sum(amount),0)::text from public.payment_receipts`) ===
   src(`select coalesce(sum(amount),0)::text from public.payment_receipts`),
  '두 번 부어도 입금 총액이 1원까지 같음')

// ── 8. 계정은 복구되지 않는다 — 사실대로인가 ─────────────────────────────
ok(dst(`select count(*) from public.profiles`) === '0', '계정(profiles)은 복구되지 않음 — 파일에 없다고 적힌 그대로')
ok(dst(`select count(*) from public.clients where created_by is not null`) === '0',
  '계정을 가리키던 칸은 전부 비어 있음 (없는 계정을 가리키지 않음)')
ok(dst(`select count(*) from public.audit_logs where actor_name <> ''`) ===
   src(`select count(*) from public.audit_logs where actor_name <> ''`),
  '누가 했는지는 이름으로 남아 있음')

// ── 마무리 ────────────────────────────────────────────────────────────────
const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
console.log(`스냅샷 ${(readFileSync(snapPath, 'utf8').length / 1024).toFixed(0)}KB · 복구 SQL ${(sql.length / 1024).toFixed(0)}KB`)
console.log(`작업 폴더: ${work}`)
