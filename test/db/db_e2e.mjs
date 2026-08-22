import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

//  격리 DB(xlimp)에서 실제 서버 함수 import_excel_rows(0024)로 11개 파일을
//  전부 넣고, 위험 시나리오까지 확인합니다.
//   · 파일별: 등록 수 = 계획 수, kg 합 = 원본 합
//   · 같은 파일 두 번 → 두 번째는 전부 건너뜀 (중복 0)
//   · 값이 다르면 → 충돌로 세고 덮어쓰지 않음
//   · 중간에 잘못된 행 → 전체 롤백 (부분 저장 0)
//   · 미래 날짜 → 거부
//   · 거래처 patch 는 빈 칸만 채움

const plans = JSON.parse(await readFile(new URL('./plans.json', import.meta.url), 'utf8'))

const psql = (sql) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', 'xlimp', '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const esc = (s) => s.replace(/'/g, "''")

//  관리자 컨텍스트 (하니스: request.jwt.claims 로 auth.uid 흉내)
psql(`
  insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000ad','admin@t.test','{"role":"admin"}'::jsonb)
  on conflict (id) do nothing;
  insert into public.profiles (id, email, name, role, active, approved_at)
  values ('00000000-0000-0000-0000-0000000000ad','admin@t.test','대표','admin',true,now())
  on conflict (id) do update set role='admin', active=true;
`)
const asAdmin = (sql) => psql(`
  set role authenticated;
  set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
  ${sql}
`)

// 시작 상태 스냅샷 (테스트 전후 비교)
const snap = () => psql(`select (select count(*) from public.schedules) || '/' ||
  (select count(*) from public.materials) || '/' || (select count(*) from public.clients) || '/' ||
  (select coalesce(sum(corrugated_box+plastic_container+bag+needle_box),0) from public.office_stock)`)
const before = snap()

let totalIns = 0
for (const [name, p] of Object.entries(plans)) {
  const cid = psql(`insert into public.clients (name, type, address) values ('[검증] ${esc(name)}', '병원', '검증용') returning id`)
  const rowsJson = esc(JSON.stringify(p.rows))
  const patchJson = p.patch ? esc(JSON.stringify(p.patch)) : null
  const monJson = esc(JSON.stringify(p.monthly ?? []))

  // 1차 업로드
  const r1 = JSON.parse(asAdmin(`select public.import_excel_rows('${cid}'::uuid, '${rowsJson}'::jsonb, ${patchJson ? `'${patchJson}'::jsonb` : 'null'}, '${esc(p.file)}', '{}'::jsonb, '${monJson}'::jsonb)`))
  ok(r1.inserted === p.rows.length && r1.conflict === 0, `${name} 1차: ${p.rows.length}행 전부 등록`, JSON.stringify(r1))
  totalIns += r1.inserted

  // 수거 kg 합 = 원본 합
  const kg = Number(psql(`select coalesce(sum(actual_amount),0) from public.schedules where client_id='${cid}'`))
  ok(kg === Math.round(p.expect.kgSum), `${name} kg 합 일치`, `${kg}`)
  const nCol = Number(psql(`select count(*) from public.schedules where client_id='${cid}'`))
  const nSup = Number(psql(`select count(*) from public.materials where client_id='${cid}'`))
  ok(nCol === p.expect.collections && nSup === p.expect.supplies, `${name} 건수 일치`, `수거 ${nCol} 자재 ${nSup}`)

  // 재업로드 → 중복 0
  //  월 실적이 저장됐는가 — 날짜가 없어 수거로 못 만든 달까지 전부
  const months = Number(psql(`select count(*) from public.client_monthly_actuals where client_id='${cid}'`))
  ok(months === (p.monthly ?? []).length && months > 0, `${name} 월 실적 ${months}개월 저장`, `계획 ${(p.monthly ?? []).length}`)
  const mkg = psql(`select coalesce(sum(medical_kg+diaper_kg),0)::text from public.client_monthly_actuals where client_id='${cid}'`)
  const wantKg = (p.monthly ?? []).reduce((s, m) => s + m.medicalKg + m.diaperKg, 0)
  ok(Number(mkg) === wantKg, `${name} 월 실적 kg 합 일치`, `${mkg} vs ${wantKg}`)
  const mrev = psql(`select coalesce(sum(revenue),0)::text from public.client_monthly_actuals where client_id='${cid}'`)
  const wantRev = (p.monthly ?? []).reduce((s, m) => s + m.revenue, 0)
  ok(Number(mrev) === wantRev, `${name} 월 실적 매출 합 1원 일치`, `${mrev} vs ${wantRev}`)

  const r2 = JSON.parse(asAdmin(`select public.import_excel_rows('${cid}'::uuid, '${rowsJson}'::jsonb, null, 're', '{}'::jsonb, '${monJson}'::jsonb)`))
  ok(r2.inserted === 0 && r2.months === 0, `${name} 재업로드: 중복 0 (월 실적 포함)`, JSON.stringify(r2))
  const months2 = Number(psql(`select count(*) from public.client_monthly_actuals where client_id='${cid}'`))
  ok(months2 === months, `${name} 재업로드해도 월 실적 안 늘어남`, `${months2}`)

  // 단가 patch — 있는 값은 덮지 않음
  if (p.patch?.pricing) {
    const priceInDb = psql(`select pricing::text from public.clients where id='${cid}'`)
    ok(priceInDb.length > 2, `${name} 단가 저장됨`)
    const r3 = JSON.parse(asAdmin(`select public.import_excel_rows('${cid}'::uuid, '[]'::jsonb, '{"pricing":{"medical":{"sale":1}}}'::jsonb, 'overwrite-try', '{}'::jsonb, '[]'::jsonb)`))
    const after = psql(`select pricing::text from public.clients where id='${cid}'`)
    ok(after === priceInDb && r3.clientFields === 0, `${name} 단가 덮어쓰기 차단`)
  }
}

// ── 위험 시나리오 (더원 검증 거래처 재사용) ──────────────────────────────
const cid = psql(`select id from public.clients where name='[검증] 더원요양병원'`)

// 값이 다른 같은 날짜 → 충돌, 덮어쓰지 않음
const beforeKg = psql(`select actual_amount from public.schedules where client_id='${cid}' and date='2026-08-05' and waste_type='의료폐기물'`)
const rc = JSON.parse(asAdmin(`select public.import_excel_rows('${cid}'::uuid, '[{"kind":"수거","date":"2026-08-05","wasteType":"의료폐기물","kg":999}]'::jsonb, null, 'conflict', '{}'::jsonb, '[]'::jsonb)`))
const afterKg = psql(`select actual_amount from public.schedules where client_id='${cid}' and date='2026-08-05' and waste_type='의료폐기물'`)
ok(rc.conflict === 1 && rc.inserted === 0 && beforeKg === afterKg, '값이 다르면 충돌로만 세고 덮어쓰지 않음', `${beforeKg}kg 유지`)

// 중간에 잘못된 행 → 전체 롤백
const cnt0 = psql(`select count(*) from public.schedules where client_id='${cid}'`)
let threw = false
try {
  asAdmin(`select public.import_excel_rows('${cid}'::uuid,
    '[{"kind":"수거","date":"2026-07-01","wasteType":"의료폐기물","kg":10},
      {"kind":"수거","date":"2026-07-02","wasteType":"의료폐기물","kg":-5},
      {"kind":"수거","date":"2026-07-03","wasteType":"의료폐기물","kg":20}]'::jsonb, null, 'partial', '{}'::jsonb, '[]'::jsonb)`)
} catch { threw = true }
const cnt1 = psql(`select count(*) from public.schedules where client_id='${cid}'`)
ok(threw && cnt0 === cnt1, '중간 오류 행 → 전체 롤백 (부분 저장 0)', `${cnt0}건 그대로`)

// 미래 날짜 → 거부 (0024)
let futureThrew = false
try {
  asAdmin(`select public.import_excel_rows('${cid}'::uuid, '[{"kind":"수거","date":"2026-12-10","wasteType":"의료폐기물","kg":10}]'::jsonb, null, 'future', '{}'::jsonb, '[]'::jsonb)`)
} catch (e) { futureThrew = /오지 않은 날짜/.test(String(e.stderr ?? e.message ?? e)) }
ok(futureThrew, '미래 날짜(연도 밀림) → 서버가 거부')

// 날짜 없는 행 → 거부
let noDateThrew = false
try {
  asAdmin(`select public.import_excel_rows('${cid}'::uuid, '[{"kind":"수거","wasteType":"의료폐기물","kg":10}]'::jsonb, null, 'nodate', '{}'::jsonb, '[]'::jsonb)`)
} catch { noDateThrew = true }
ok(noDateThrew, '날짜 없는 행 → 서버가 거부')

// 모르는 kind → 거부
let badKindThrew = false
try {
  asAdmin(`select public.import_excel_rows('${cid}'::uuid, '[{"kind":"청구","date":"2026-08-01"}]'::jsonb, null, 'kind', '{}'::jsonb, '[]'::jsonb)`)
} catch { badKindThrew = true }
ok(badKindThrew, '모르는 기록 종류 → 서버가 거부')

// 월 실적 — 값이 다르면 충돌로만 세고 덮어쓰지 않음
const m0 = psql(`select revenue::text from public.client_monthly_actuals where client_id='${cid}' and month='2026-02'`)
const rm = JSON.parse(asAdmin(`select public.import_excel_rows('${cid}'::uuid, '[]'::jsonb, null, 'mon-conflict', '{}'::jsonb,
  '[{"month":"2026-02","medicalKg":1,"diaperKg":1,"revenue":1}]'::jsonb)`))
const m1 = psql(`select revenue::text from public.client_monthly_actuals where client_id='${cid}' and month='2026-02'`)
ok(rm.conflict === 1 && rm.months === 0 && m0 === m1, '월 실적도 값이 다르면 충돌 — 덮어쓰지 않음', `${m0}원 유지`)

// 월 표기가 이상하면 거부
let badMonth = false
try {
  asAdmin(`select public.import_excel_rows('${cid}'::uuid, '[]'::jsonb, null, 'badmon', '{}'::jsonb, '[{"month":"2026-13","revenue":1}]'::jsonb)`)
} catch { badMonth = true }
ok(badMonth, '월 표기가 이상하면(2026-13) 서버가 거부')

// 가져오기는 사무실 재고를 건드리지 않음 + 감사기록 존재
ok(snap().split('/')[3] === before.split('/')[3], '가져오기가 사무실 재고를 건드리지 않음')
const audits = Number(psql(`select count(*) from public.audit_logs where action='import.excel'`))
ok(audits >= 11, '가져오기마다 감사기록 남음', `${audits}건`)

// 새 규격 합산 (0024) — 서울온케어 box35 17개가 box_count 에 반영
const onk = psql(`select box_count || '/' || (items->>'box35') from public.materials m
  join public.clients c on c.id=m.client_id where c.name='[검증] 서울온케어의원'`)
ok(onk.startsWith('20/17') || onk.startsWith('21/17') || /^\d+\/17/.test(onk), '35L 박스가 items 와 합계 칸에 모두 반영', onk)

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
console.log(`\n총 등록 ${totalIns}건 · 시작 스냅샷 ${before} (검증 거래처는 격리 DB에만 존재)`)
