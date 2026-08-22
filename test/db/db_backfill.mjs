import { execFileSync } from 'node:child_process'
//  0041 의 뒷정리(backfill) 만 따로 봅니다.
//   지금 승인은 끝났는데 메일을 못 눌러 갇혀 있는 계정이 실제로 있습니다.
//   마이그레이션을 올리는 순간 그 계정이 풀려야 합니다.
const DB = 'bfillq'
const ROOT = '/home/user/beonemirae-ops-mvp'
const P = (sql) => execFileSync('sudo', ['-u','pgtest','psql','-h','/var/tmp/pgt','-p','55432','-U','postgres',
  '-d', DB, '-qtA','-v','ON_ERROR_STOP=1','-c', sql], { encoding: 'utf8' }).trim()
const F = (file) => execFileSync('sudo', ['-u','pgtest','psql','-h','/var/tmp/pgt','-p','55432','-U','postgres',
  '-d', DB, '-q','-v','ON_ERROR_STOP=1','-f', file], { encoding: 'utf8' })
const out = []
const ok = (c,m,d='') => { console.log(`${c?' OK ':'FAIL'} | ${m}${d?` — ${d}`:''}`); out.push(c); if(!c) process.exitCode=1 }

//  0040 까지만 올린 상태를 만듭니다 (0041 이전의 실제 운영 DB)
execFileSync('sudo',['-u','pgtest','psql','-h','/var/tmp/pgt','-p','55432','-U','postgres','-d','postgres',
  '-qc',`drop database if exists ${DB}`,'-c',`create database ${DB}`],{encoding:'utf8'})
F(`${ROOT}/supabase/test/00_harness.sql`)
for (let i = 1; i <= 40; i += 1) {
  const n = String(i).padStart(4, '0')
  const f = execFileSync('bash',['-c',`ls ${ROOT}/supabase/migrations/${n}_*.sql 2>/dev/null || true`],{encoding:'utf8'}).trim()
  if (f) F(f)
}
ok(P(`select public.app_schema_version()`) === '40', '0040 까지만 올린 DB 를 만듦')

const mk = (email, approved) => {
  P(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), '${email}', '{"name":"${email}"}'::jsonb)`)
  const id = P(`select id from auth.users where email='${email}'`)
  if (approved) P(`update public.profiles set active=true, approved_at=now() where id='${id}'`)
  P(`update auth.users set email_confirmed_at = null where id='${id}'`)
  return id
}
const STUCK = mk('bf-stuck@beonemirae.test', true)    // 승인 끝 · 메일 못 누름
const WAIT  = mk('bf-wait@beonemirae.test', false)    // 아직 승인 전

ok(P(`select email_confirmed_at is null from auth.users where id='${STUCK}'`) === 't', '갇힌 계정: 인증 비어 있음')
ok(P(`select email_confirmed_at is null from auth.users where id='${WAIT}'`) === 't', '승인 대기 계정: 인증 비어 있음')

//  0041 을 올립니다
F(`${ROOT}/supabase/migrations/0041_approve_confirms.sql`)
ok(P(`select public.app_schema_version()`) === '41', '0041 이 올라감')
ok(P(`select email_confirmed_at is not null from auth.users where id='${STUCK}'`) === 't',
  '**이미 승인된 갇힌 계정이 풀림** — 대표님이 승인해 둔 직원이 바로 로그인됩니다')
ok(P(`select email_confirmed_at is null from auth.users where id='${WAIT}'`) === 't',
  '아직 승인 안 된 계정은 건드리지 않음 — 승인 절차를 건너뛰지 않습니다')

//  두 번 올려도 안전한가 (마이그레이션을 다시 실행하는 일은 실제로 생깁니다)
const before = P(`select email_confirmed_at::text from auth.users where id='${STUCK}'`)
F(`${ROOT}/supabase/migrations/0041_approve_confirms.sql`)
ok(P(`select email_confirmed_at::text from auth.users where id='${STUCK}'`) === before,
  '다시 실행해도 이미 채운 시각을 덮어쓰지 않음', before)

console.log(`\n${out.filter(Boolean).length}/${out.length} 통과`)
