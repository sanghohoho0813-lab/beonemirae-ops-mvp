import { execFileSync } from 'node:child_process'

//  0047 — 회사 자신에 대한 사실 (직원 명부 · 국세청 신고 매출).
//
//   확인하는 것
//    · 실제 명부 6명이 담당 구분과 함께 들어갔는가
//    · **주민등록번호를 담는 칸이 아예 없는가** (있으면 언젠가 들어갑니다)
//    · 계 ≠ 과세분 + 면세분 이면 **막는가** — 옮겨 적다 틀린 것을 조용히 받으면 안 됨
//    · 실제 증명서 7개 반기가 1원까지 맞는가
//    · 매출은 현장 담당자에게 안 보이는가 (돈입니다)
//    · 이름·담당은 현장도 보는가 (오늘 누가 어디 가는지)
//    · 표에 직접 쓰는 길이 닫혔는가
const DB = 'coq'
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    uid ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 100)

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('co-admin@beonemirae.test', 'admin')
const OFFICE = mk('co-office@beonemirae.test', 'office')
const FIELD = mk('co-field@beonemirae.test', 'field')

// ── 0. 판 ─────────────────────────────────────────────────────────────────
ok(Number(psql(`select public.app_schema_version()`)) === 64, 'DB 판이 64', psql(`select public.app_schema_version()`))

// ── 0-b. 0050 — 확정 표시 · 소모품 품목 ──────────────────────────────────
{
  //  ① 확정 표시
  const TID = psql(`select id from public.tax_filings where period_from = date '2026-01-01'`)
  ok(psql(`select confirmed_at is not null from public.tax_filings where id=${TID}`) === 't',
    '2026 상반기는 확정으로 표시되어 있음 (대표님 확인)')
  ok(psql(`select count(*) from public.tax_filings where confirmed_at is not null`) === '1',
    '**다른 반기는 건드리지 않음** — 사람이 확인한 것만 확정',
    psql(`select count(*) from public.tax_filings where confirmed_at is not null`))

  //  되돌릴 수 있어야 합니다 (잘못 눌렀을 때 손쓸 방법)
  run(`select public.set_tax_filing_confirmed(${TID}, false)`, ADMIN)
  ok(psql(`select confirmed_at is null from public.tax_filings where id=${TID}`) === 't', '확정 전으로 되돌릴 수 있음')
  //  다시 눌러도 감사기록이 쌓이지 않습니다
  const a0 = psql(`select count(*) from public.audit_logs where action='tax_filing.confirm'`)
  run(`select public.set_tax_filing_confirmed(${TID}, false)`, ADMIN)
  ok(psql(`select count(*) from public.audit_logs where action='tax_filing.confirm'`) === a0,
    '같은 상태로 다시 눌러도 기록이 안 쌓임')
  run(`select public.set_tax_filing_confirmed(${TID}, true)`, ADMIN)
  ok(psql(`select confirmed_at is not null from public.tax_filings where id=${TID}`) === 't', '다시 확정으로')

  //  숫자는 절대 안 바뀝니다 — 「확정인가」만 기록합니다
  ok(psql(`select base_total from public.tax_filings where id=${TID}`) === '453873146',
    '확정 표시가 금액을 건드리지 않음', psql(`select base_total from public.tax_filings where id=${TID}`))

  const o = tryAs(OFFICE, `select public.set_tax_filing_confirmed(${TID}, false)`)
  ok(!o.ok && /관리자만/.test(o.out), '사무실은 확정 표시를 못 함 — 아는 사람은 대표님뿐', err(o))

  //  ② 소모품 품목
  ok(Number(psql(`select count(*) from public.products`)) >= 10, '소모품 품목이 10가지 이상',
    psql(`select count(*) from public.products`))
  const cats = psql(`select string_agg(distinct category, ' · ' order by category) from public.products where category <> ''`)
  ok(/위생·감염관리/.test(cats) && /처치·드레싱/.test(cats) && /환자용품/.test(cats),
    '의료폐기물 말고도 병원이 늘 쓰는 분류가 있음', cats)
  ok(psql(`select count(*) from public.products where sale_price > 0 and category <> '의료폐기물 용기'`) === '0',
    '**지어낸 단가가 하나도 없음** — 값은 대표님이 정합니다')
  ok(psql(`select count(*) from public.products where available and sale_price <= 0`) === '0',
    '단가 없는 물건이 「공급 가능」으로 켜져 있지 않음 — 0원 주문 방지')

  //  단가 0 인 채로 켜려 하면 막습니다
  const PID = psql(`select id from public.products where name='멸균거즈'`)
  //  옛 서명(인자 10개)이 함께 남아 있으면 여기서 「is not unique」로
  //  터집니다 — 0050 이 옛 것을 지우는지 이 줄이 함께 지킵니다.
  ok(psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='upsert_product'`) === '1',
    '상품 저장 함수가 **한 벌만** 있음 (옛 서명이 안 남음)',
    psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='upsert_product'`))
  const office = tryAs(OFFICE, `select public.upsert_product(null,'몰래','','개',1,1,null)`)
  ok(!office.ok && /관리자만/.test(office.out),
    '**사무실은 상품 단가를 못 정함** — 단가가 그대로 확정 판매금액이 됩니다', err(office))
  const bad = tryAs(ADMIN, `select public.upsert_product('${PID}','멸균거즈','4x4 · 100매입','박스',0,0,null,true,'','','처치·드레싱')`)
  ok(!bad.ok && /판매가를 정해야/.test(bad.out), '단가 0 인데 공급 가능으로 못 켬', err(bad))
  //  단가를 넣으면 켜집니다
  run(`select public.upsert_product('${PID}','멸균거즈','4x4 · 100매입','박스',12000,7400,null,true,'','','처치·드레싱')`, ADMIN)
  ok(psql(`select sale_price||'/'||available from public.products where id='${PID}'`) === '12000/true',
    '단가를 넣으면 판매할 수 있음', psql(`select sale_price||'/'||available from public.products where id='${PID}'`))
  //  원상복구 (뒤 검사에 영향 주지 않게)
  psql(`update public.products set sale_price=0, cost_price=0, available=false where id='${PID}'`)
}

// ── 1. 실제 명부가 들어갔는가 ─────────────────────────────────────────────
{
  ok(psql(`select count(*) from public.staff`) === '6', '직원 6명', psql(`select count(*) from public.staff`))
  const rows = psql(`select name||'|'||position||'|'||waste_scope||'|'||coalesce(insured_from::text,'')
                     from public.staff order by insured_from, name`).split('\n')
  const map = Object.fromEntries(rows.map((r) => { const [n, ...rest] = r.split('|'); return [n, rest] }))
  ok(map['송명근']?.[0] === '대표', '송명근 — 대표', map['송명근']?.join(' · '))
  ok(map['홍현주']?.[0] === '이사', '홍현주 — 이사', map['홍현주']?.join(' · '))
  ok(map['백광호']?.[1] === '일회용기저귀' && map['김진환']?.[1] === '일회용기저귀',
    '백광호·김진환 — 일회용기저귀 담당')
  ok(map['김준기']?.[1] === '의료폐기물' && map['오대성']?.[1] === '의료폐기물',
    '김준기·오대성 — 의료폐기물 담당')
  ok(map['송명근']?.[1] === '해당없음' && map['홍현주']?.[1] === '해당없음',
    '대표·이사에게는 없는 담당을 지어내지 않음')
  //  자격취득일 — 원본 그대로
  ok(map['백광호']?.[2] === '2025-05-20', '백광호 최초 자격취득일 (산재·고용 2025.05.20)', map['백광호']?.[2])
  ok(map['오대성']?.[2] === '2023-06-01', '오대성 2023.06.01', map['오대성']?.[2])
  ok(map['김준기']?.[2] === '2026-03-01', '김준기 2026.03.01', map['김준기']?.[2])
  //  네 보험 취득일을 원본 그대로 (하나로 뭉개지 않음)
  const ins = JSON.parse(psql(`select insurance from public.staff where name='백광호'`))
  ok(ins['국민연금'] === '2025-07-01' && ins['산재보험'] === '2025-05-20',
    '보험별 취득일이 다른 것을 그대로 남김 (연금 07-01 · 산재 05-20)', JSON.stringify(ins))
  const ceo = JSON.parse(psql(`select insurance from public.staff where name='송명근'`))
  ok(ceo['산재보험'] === null && ceo['고용보험'] === null,
    '대표는 산재·고용이 없는 것도 그대로 (「-」를 날짜로 지어내지 않음)', JSON.stringify(ceo))
}

// ── 2. 주민등록번호를 담을 칸이 아예 없다 ────────────────────────────────
//   있으면 언젠가 들어갑니다. 그리고 한 번 들어가면 백업·내보내기·화면
//   어디로든 흘러갑니다.
{
  const cols = psql(`select string_agg(column_name, ',' order by column_name)
                     from information_schema.columns
                     where table_schema='public' and table_name='staff'`)
  ok(!/rrn|resident|jumin|ssn|social/i.test(cols), '주민등록번호를 담는 칸이 없음', cols)
  ok(!/birth|생년/i.test(cols), '생년월일 칸도 없음')
  //  전체 DB 어디에도 없어야 합니다
  const any = psql(`select count(*) from information_schema.columns
                    where table_schema='public' and (column_name ~* 'rrn|resident_no|jumin|ssn')`)
  ok(any === '0', 'DB 어느 표에도 주민등록번호 칸이 없음', `${any}개`)
}

// ── 3. 신고 매출 — 증명서와 1원까지 ──────────────────────────────────────
{
  ok(psql(`select count(*) from public.tax_filings`) === '7', '반기 7개', psql(`select count(*) from public.tax_filings`))
  //  실제 증명서 값 (0615-473-4511-219 · 2026-03-19 발급)
  const want = [
    ['2023-01-01', '2023-06-30', 47185960, 12529600, 34656360, 1292597],
    ['2023-07-01', '2023-12-31', 83557010, 12480460, 71076550, -926308],
    ['2024-01-01', '2024-06-30', 129181590, 41851340, 87330250, 2057844],
    ['2024-07-01', '2024-12-31', 233800428, 126601568, 107198860, 4614988],
    ['2025-01-01', '2025-06-30', 223497401, 91493311, 132004090, 3371880],
    ['2025-07-01', '2025-12-31', 357344046, 106032468, 251311578, 3500612],
    ['2026-01-01', '2026-06-30', 453873146, 98397666, 355475480, -869186],
  ]
  let bad = 0
  for (const [from, to, total, taxed, exempt, tax] of want) {
    const got = psql(`select base_total||'|'||base_taxed||'|'||base_exempt||'|'||tax_payable
                      from public.tax_filings where period_from='${from}' and period_to='${to}'`)
    const want4 = `${total}|${taxed}|${exempt}|${tax}`
    if (got !== want4) { bad += 1; console.log(`   ${from}: 기대 ${want4} / 실제 ${got}`) }
  }
  ok(bad === 0, '일곱 반기 모두 증명서와 1원까지 같음', bad ? `${bad}개 어긋남` : '')
  //  계 = 과세 + 면세 (증명서 자체의 내적 일관성)
  ok(psql(`select count(*) from public.tax_filings where base_total <> base_taxed + base_exempt`) === '0',
    '계 = 과세분 + 면세분 (일곱 줄 모두)')
  //  면세가 큰 이유 — 의료폐기물 수집·운반은 면세
  const share = psql(`select round(sum(base_exempt) * 100.0 / sum(base_total)) from public.tax_filings`)
  ok(Number(share) >= 60, '면세분이 다수 — 의료폐기물 수집·운반은 면세', `${share}%`)
}

// ── 4. 옮겨 적다 틀리면 막는다 ───────────────────────────────────────────
//   계 ≠ 과세 + 면세 를 조용히 받으면, 그 뒤 모든 비교가 틀립니다.
{
  const r = tryAs(ADMIN, `select public.upsert_tax_filing('2022-01-01','2022-06-30', 1000, 400, 500, 0)`)
  ok(!r.ok && /맞지 않습니다/.test(r.out), '계가 안 맞으면 막고 이유를 말함', err(r))
  ok(psql(`select count(*) from public.tax_filings where period_from='2022-01-01'`) === '0', '막힌 것은 안 들어감')
  const good = tryAs(ADMIN, `select public.upsert_tax_filing('2022-01-01','2022-06-30', 900, 400, 500, 10)`)
  ok(good.ok, '맞으면 들어감', good.ok ? '' : err(good))
  //  같은 기간을 다시 넣으면 덮어씁니다 (확정 자료가 나중에 옵니다)
  const again = tryAs(ADMIN, `select public.upsert_tax_filing('2022-01-01','2022-06-30', 1100, 600, 500, 20)`)
  ok(again.ok && psql(`select base_total from public.tax_filings where period_from='2022-01-01'`) === '1100',
    '같은 기간을 다시 넣으면 덮어씀 (확정 자료가 나중에 옴)')
  ok(psql(`select count(*) from public.tax_filings where period_from='2022-01-01'`) === '1', '두 줄이 되지 않음')
  psql(`delete from public.tax_filings where period_from='2022-01-01'`)
  const bad = tryAs(ADMIN, `select public.upsert_tax_filing('2023-07-01','2023-01-01', 0, 0, 0, 0)`)
  ok(!bad.ok && /과세기간이 올바르지 않습니다/.test(bad.out), '거꾸로 된 기간은 거절', err(bad))
}

// ── 5. 누가 보고 누가 고치는가 ───────────────────────────────────────────
{
  //  이름·담당은 현장도 봅니다 — 오늘 누가 어디 가는지
  ok(tryAs(FIELD, `select count(*) from public.staff`).out === '6', '기사님도 직원 명부를 봄')
  //  매출은 돈입니다
  ok(tryAs(FIELD, `select count(*) from public.tax_filings`).out === '0', '기사님에게는 신고 매출이 안 보임')
  ok(tryAs(OFFICE, `select count(*) from public.tax_filings`).out === '7', '사무실 담당자는 봄')
  ok(tryAs(ADMIN, `select count(*) from public.tax_filings`).out === '7', '관리자도 봄')

  //  고치는 것은 관리자만
  const o = tryAs(OFFICE, `select public.upsert_staff(null,'몰래','현장','의료폐기물')`)
  ok(!o.ok && /관리자만/.test(o.out), '사무실 담당자는 직원 명부를 못 고침', err(o))
  const t = tryAs(OFFICE, `select public.upsert_tax_filing('2021-01-01','2021-06-30', 0, 0, 0, 0)`)
  ok(!t.ok && /관리자만/.test(t.out), '사무실 담당자는 신고 매출을 못 넣음', err(t))
}

// ── 6. 표에 직접 쓰는 길이 닫혀 있다 ─────────────────────────────────────
{
  const a = tryAs(ADMIN, `insert into public.staff (name) values ('몰래')`)
  ok(!a.ok && /permission denied|권한/.test(a.out), '직원 표에 직접 못 씀', err(a))
  const b = tryAs(ADMIN, `insert into public.tax_filings (period_from, period_to) values ('2020-01-01','2020-06-30')`)
  ok(!b.ok && /permission denied|권한/.test(b.out), '신고 매출 표에도 직접 못 씀', err(b))
  ok(psql(`select count(*) from public.staff`) === '6', '건드린 뒤에도 6명 그대로')
}

// ── 7. 명부 고치기·퇴사 ──────────────────────────────────────────────────
{
  const r = tryAs(ADMIN, `select public.upsert_staff(null,'[검증]신입','현장','둘 다','2026-08-01')`)
  ok(r.ok, '관리자는 직원을 넣을 수 있음', r.ok ? '' : err(r))
  const id = JSON.parse(r.out).id
  ok(psql(`select count(*) from public.audit_logs where action='staff.save' and entity_id='${id}'`) === '1',
    '기록이 남음')
  const u = tryAs(ADMIN, `select public.upsert_staff('${id}','[검증]신입','현장','의료폐기물','2026-08-01')`)
  ok(u.ok && psql(`select waste_scope from public.staff where id='${id}'`) === '의료폐기물', '담당을 바꿀 수 있음')
  //  같은 이름으로 둘을 만들 수 없습니다 (재직 중인 사람끼리)
  const dup = tryAs(ADMIN, `select public.upsert_staff(null,'[검증]신입','현장','의료폐기물')`)
  ok(!dup.ok, '재직 중 같은 이름이 둘이 되지 않음', err(dup))
  //  퇴사시키면 같은 이름을 다시 쓸 수 있습니다 (사람이 나가고 새로 옵니다)
  ok(tryAs(ADMIN, `select public.set_staff_active('${id}', false)`).ok, '퇴사 처리됨')
  ok(psql(`select active from public.staff where id='${id}'`) === 'f', '재직이 꺼짐')
  const again = tryAs(ADMIN, `select public.upsert_staff(null,'[검증]신입','현장','의료폐기물')`)
  ok(again.ok, '퇴사한 사람과 같은 이름은 다시 쓸 수 있음', again.ok ? '' : err(again))
  psql(`delete from public.audit_logs where entity='staff'`)
  psql(`delete from public.staff where name like '[검증]%'`)
  const blank = tryAs(ADMIN, `select public.upsert_staff(null,'   ','현장','의료폐기물')`)
  ok(!blank.ok && /이름을 넣어 주세요/.test(blank.out), '빈 이름은 거절', err(blank))
  const wrong = tryAs(ADMIN, `select public.upsert_staff(null,'[검증]엉뚱','현장','플라스틱')`)
  ok(!wrong.ok, '모르는 담당 구분은 거절 (없는 구분을 만들지 않음)', err(wrong))
}

// ── 8. 자가진단이 새것을 실제로 세는가 (이빨) ───────────────────────────
const check = () => JSON.parse(run(`select public.app_health_check()`, ADMIN))
{
  const h = check()
  ok(h.ok === true && h.version === 64, '0047 을 올린 DB 는 「이상 없음」',
    h.ok ? `판 ${h.version}` : JSON.stringify(h.missing).slice(0, 90))
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
gone('신고 매출 표가 사라지면',
  `alter table public.tax_filings rename to tax_filings_x`,
  `alter table public.tax_filings_x rename to tax_filings`,
  '표 tax_filings')
gone('직원 표를 직접 쓸 수 있게 열리면',
  `grant insert on public.staff to authenticated`,
  `revoke insert on public.staff from authenticated`,
  '직원·신고매출 직접 쓰기가 열려 있음')

const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
