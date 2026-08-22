import { execFileSync } from 'node:child_process'

//  0035 월정액 수거 0건 정책 — 격리 DB 확인.
const DB = 'flatq'
const psql = (sql) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()
const tryPsql = (sql) => {
  try { return { ok: true, out: psql(sql) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

ok(Number(psql(`select public.app_schema_version()`)) >= 35, 'DB 버전이 35 이상 (0035 가 적용됨)',
  psql(`select public.app_schema_version()`))
ok(psql(`select count(*) from information_schema.columns
         where table_name='clients' and column_name='flat_fee_when_empty'`) === '1', '칸이 생김')

//  기본은 꺼짐 — 시스템이 짐작해 기본료를 올리지 않습니다.
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]월정액','병원','',true,false)`)
ok(psql(`select flat_fee_when_empty from public.clients where name='[검증]월정액'`) === 'f',
  '기본값은 꺼짐 — 계약서를 모르는 채 기본료를 올리지 않음')
ok(tryPsql(`update public.clients set flat_fee_when_empty=true where name='[검증]월정액'`).ok, '켤 수 있음')
ok(psql(`select flat_fee_when_empty from public.clients where name='[검증]월정액'`) === 't', '켜짐이 저장됨')

//  not null — 옛 행에도 값이 있어야 화면이 undefined 를 만나지 않습니다.
ok(psql(`select count(*) from public.clients where flat_fee_when_empty is null`) === '0',
  'null 인 거래처가 없음 (not null default false)')

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
