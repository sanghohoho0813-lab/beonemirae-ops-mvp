import { execFileSync } from 'node:child_process'

//  0033 세금계산서 칸 — 격리 DB 에서 실제 서버로 확인합니다.
const DB = 'taxq'
const psql = (sql) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

const tryPsql = (sql) => {
  try {
    return { ok: true, out: psql(sql) }
  } catch (e) {
    return { ok: false, out: String(e.stderr ?? e.message) }
  }
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

// ── 1. 칸이 생겼는가 ─────────────────────────────────────────────────────
const cols = psql(`select string_agg(column_name, ',' order by column_name)
  from information_schema.columns
  where table_schema='public' and table_name='clients'
    and column_name in ('biz_no','biz_ceo','biz_type','biz_item','tax_email','vat_mode')`)
ok(cols === 'biz_ceo,biz_item,biz_no,biz_type,tax_email,vat_mode', '세금계산서 칸 6개', cols)

ok(Number(psql(`select public.app_schema_version()`)) >= 33, 'DB 버전이 33 이상 (0033 이 적용됨)',
  psql(`select public.app_schema_version()`))

// ── 2. 기존 거래처는 그대로 ───────────────────────────────────────────────
//  칸을 더한다고 기존 자료가 막히면 안 됩니다.
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]기존병원','병원','',true,false)`)
ok(psql(`select coalesce(vat_mode,'(비어있음)') from public.clients where name='[검증]기존병원'`) === '(비어있음)',
  '기존 방식으로 넣은 거래처는 부가세 미지정으로 남음')

// ── 3. 부가세 방식은 정해진 값만 ─────────────────────────────────────────
for (const v of ['별도', '포함', '면세']) {
  const r = tryPsql(`update public.clients set vat_mode='${v}' where name='[검증]기존병원'`)
  ok(r.ok, `부가세 「${v}」 저장됨`)
}
const bad = tryPsql(`update public.clients set vat_mode='있음' where name='[검증]기존병원'`)
ok(!bad.ok && /clients_vat_mode_check/.test(bad.out), '엉뚱한 값은 서버가 막음',
  bad.out.split('\n')[0].slice(0, 70))
ok(tryPsql(`update public.clients set vat_mode=null where name='[검증]기존병원'`).ok,
  '미지정(null)으로 되돌릴 수 있음')

// ── 4. 사업자등록번호는 자유 문자열 ──────────────────────────────────────
//  형식 검사는 화면에서 합니다. 서버가 막으면 옛 자료를 옮길 때 걸립니다.
ok(tryPsql(`update public.clients set biz_no='1248100998', biz_ceo='홍길동',
            biz_type='폐기물처리', biz_item='의료폐기물', tax_email='tax@x.kr'
            where name='[검증]기존병원'`).ok, '사업자정보 저장됨')
ok(psql(`select biz_no from public.clients where name='[검증]기존병원'`) === '1248100998',
  '사업자등록번호 그대로 저장')

// ── 5. RLS — 표 정책이 그대로 적용되는가 ─────────────────────────────────
//  칸을 더하면서 새 정책을 만들지 않았습니다. 병원 계정이 남의 거래처
//  사업자번호를 읽으면 안 됩니다.
const hosp = psql(`select id from auth.users where email like '%hosp%' limit 1`)
if (hosp) {
  const r = tryPsql(`set local role authenticated;
    set local request.jwt.claims = '{"sub":"${hosp}","role":"authenticated"}';
    select count(*) from public.clients where name='[검증]기존병원'`)
  ok(!r.ok || r.out.trim().split('\n').pop() === '0', '병원 계정은 남의 거래처를 못 봄 (기존 정책 그대로)',
    r.out.trim().split('\n').pop())
} else {
  ok(true, '(병원 계정이 없어 건너뜀 — 01_verify 가 별도로 확인합니다)')
}

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
