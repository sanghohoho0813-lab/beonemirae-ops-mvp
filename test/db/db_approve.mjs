import { execFileSync } from 'node:child_process'

//  0041 관리자 승인 = 바로 사용.
//
//   실제로 일어난 일
//    직원이 가입 신청 → 영문 확인 메일 → 눌렀더니 localhost:3000 →
//    「사이트에 연결할 수 없음」. 신청한 사람은 자기가 고장 냈다고 생각합니다.
//
//   지키려는 것
//    · 관리자가 승인하면 그 순간 메일 인증도 끝난다 (바로 로그인)
//    · 그렇다고 문턱이 사라지면 안 된다 — 승인은 여전히 관리자만
//    · 승인 안 된 계정은 여전히 아무것도 못 연다
//    · 이미 인증된 계정의 인증 시각을 덮어쓰지 않는다
//    · 이미 승인됐는데 인증이 비어 있던 계정은 마이그레이션이 채운다
const DB = 'apprq'
const run = (sql, role) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    role ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${role}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()

const psql = (sql) => run(sql)
const asRole = (uid, sql) => run(sql, uid)
const tryAs = (uid, sql) => {
  try {
    return { ok: true, out: asRole(uid, sql) }
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

ok(Number(psql(`select public.app_schema_version()`)) >= 41, 'DB 판이 41 이상 (0041 이 적용됨)',
  psql(`select public.app_schema_version()`))

// ── 계정 ──────────────────────────────────────────────────────────────────
//  가입 신청과 같은 모양으로 만듭니다 — auth.users 만 넣으면 0021 트리거가
//  profiles 를 「현장 · 승인 대기」로 만들어 줍니다.
const signUp = (email, name) => {
  psql(`insert into auth.users (id, email, raw_user_meta_data)
        values (gen_random_uuid(), '${email}', jsonb_build_object('name','${name}'))
        on conflict (email) do nothing`)
  return psql(`select id from auth.users where email='${email}'`)
}
const mkAdmin = (email) => {
  const id = signUp(email, '관리자')
  psql(`update public.profiles set role='admin', active=true, approved_at=now() where id='${id}'`)
  psql(`update auth.users set email_confirmed_at=now() where id='${id}'`)
  return id
}
const ADMIN = mkAdmin('appr-admin@beonemirae.test')

// ── 1. 신청 직후 상태 ─────────────────────────────────────────────────────
const STAFF = signUp('appr-staff@beonemirae.test', '신입기사')
ok(psql(`select count(*) from public.profiles where id='${STAFF}'`) === '1',
  '신청하면 프로필이 만들어짐')
ok(psql(`select active::text from public.profiles where id='${STAFF}'`) === 'false',
  '신청 직후에는 사용 중지 상태 (승인 대기)')
ok(psql(`select approved_at is null from public.profiles where id='${STAFF}'`) === 't',
  '승인 시각이 비어 있음')
ok(psql(`select email_confirmed_at is null from auth.users where id='${STAFF}'`) === 't',
  '메일 인증도 비어 있음 — 이 상태로는 로그인이 막힙니다')

//  승인 전에는 아무것도 못 엽니다 (문턱이 사라진 게 아님)
const peek = tryAs(STAFF, `select count(*) from public.clients`)
ok(peek.ok && peek.out === '0', '승인 전에는 거래처가 한 곳도 안 보임 (RLS 그대로)',
  peek.ok ? `${peek.out}곳` : peek.out.slice(0, 50))

// ── 2. 승인은 관리자만 ────────────────────────────────────────────────────
const self = tryAs(STAFF, `select public.admin_approve_user('${STAFF}', 'field')`)
ok(!self.ok && /관리자만/.test(self.out), '신청자가 스스로 승인하지 못함',
  (self.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 60))
ok(psql(`select email_confirmed_at is null from auth.users where id='${STAFF}'`) === 't',
  '막힌 뒤에도 메일 인증이 그대로 비어 있음 (몰래 통과하지 않음)')

// ── 3. 승인 = 바로 사용 ───────────────────────────────────────────────────
const app = tryAs(ADMIN, `select public.admin_approve_user('${STAFF}', 'field')`)
ok(app.ok, '관리자가 승인함', app.ok ? '' : app.out.slice(0, 80))
ok(psql(`select active::text from public.profiles where id='${STAFF}'`) === 'true', '계정이 켜짐')
ok(psql(`select role::text from public.profiles where id='${STAFF}'`) === 'field', '역할이 현장으로 정해짐')
ok(psql(`select email_confirmed_at is not null from auth.users where id='${STAFF}'`) === 't',
  '**메일을 누르지 않았는데 인증이 끝남** — 승인 즉시 로그인됩니다')

//  승인 뒤에는 실제로 업무 자료가 열립니다
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[승인]확인병원','병원','',true,false) on conflict do nothing`)
const after = tryAs(STAFF, `select count(*) from public.clients`)
ok(after.ok && Number(after.out) >= 1, '승인 뒤에는 거래처가 보임', `${after.out}곳`)

//  감사기록이 남았는가
ok(psql(`select count(*) from public.audit_logs where action='profile.approve' and entity_id='${STAFF}'`) === '1',
  '승인이 감사기록으로 한 줄 남음')

// ── 4. 이미 인증된 시각을 덮어쓰지 않는다 ─────────────────────────────────
const OLD = signUp('appr-old@beonemirae.test', '기존직원')
psql(`update auth.users set email_confirmed_at = timestamptz '2025-03-01 09:00:00+09' where id='${OLD}'`)
const before = psql(`select email_confirmed_at::text from auth.users where id='${OLD}'`)
tryAs(ADMIN, `select public.admin_approve_user('${OLD}', 'office')`)
ok(psql(`select email_confirmed_at::text from auth.users where id='${OLD}'`) === before,
  '이미 인증된 계정의 시각을 덮어쓰지 않음', before)

// ── 5. 이미 승인됐는데 인증이 비어 있는 계정 ──────────────────────────────
//   위 직원처럼 승인 전에 갇힌 게 아니라, 승인은 끝났는데 메일을 못 누른 경우.
const STUCK = signUp('appr-stuck@beonemirae.test', '갇힌직원')
psql(`update public.profiles set role='office', active=true, approved_at=now() where id='${STUCK}'`)
psql(`update auth.users set email_confirmed_at=null where id='${STUCK}'`)
const conf = tryAs(ADMIN, `select public.admin_confirm_email('${STUCK}')`)
ok(conf.ok, '관리자가 「승인은 됐는데 로그인이 안 되는」 계정을 풀 수 있음', conf.ok ? '' : conf.out.slice(0, 70))
ok(psql(`select email_confirmed_at is not null from auth.users where id='${STUCK}'`) === 't',
  '풀린 뒤 인증이 채워짐')
ok(psql(`select count(*) from public.audit_logs where action='profile.confirm_email' and entity_id='${STUCK}'`) === '1',
  '이것도 감사기록으로 남음')

//  승인 안 된 계정에는 쓸 수 없습니다 — 그건 승인 절차를 건너뛰는 일입니다
const NEW2 = signUp('appr-new2@beonemirae.test', '새신청')
const skip = tryAs(ADMIN, `select public.admin_confirm_email('${NEW2}')`)
ok(!skip.ok && /승인되지 않은/.test(skip.out), '승인 안 된 계정을 이 길로 통과시키지 못함',
  (skip.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 60))
ok(psql(`select email_confirmed_at is null from auth.users where id='${NEW2}'`) === 't',
  '막힌 뒤 인증이 그대로 비어 있음')

//  관리자가 아니면 이것도 못 합니다
const notAdmin = tryAs(STAFF, `select public.admin_confirm_email('${STUCK}')`)
ok(!notAdmin.ok && /관리자만/.test(notAdmin.out), '현장 담당자는 남의 인증을 풀지 못함')

// ── 6. 두 번 승인은 여전히 막힘 (0021 그대로) ─────────────────────────────
const twice = tryAs(ADMIN, `select public.admin_approve_user('${STAFF}', 'admin')`)
ok(!twice.ok && /이미 승인된/.test(twice.out), '이미 승인된 계정을 다시 승인해 역할을 바꾸지 못함',
  (twice.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 60))
ok(psql(`select role::text from public.profiles where id='${STAFF}'`) === 'field',
  '막힌 뒤 역할이 그대로 (관리자로 올라가지 않음)')

// ── 7. 병원 계정 검사도 그대로 (0021 그대로) ──────────────────────────────
const CLI = signUp('appr-cli@beonemirae.test', '병원계정')
const noClient = tryAs(ADMIN, `select public.admin_approve_user('${CLI}', 'client')`)
ok(!noClient.ok && /소속 거래처/.test(noClient.out), '병원 계정은 거래처 없이 승인 못 함')
ok(psql(`select email_confirmed_at is null from auth.users where id='${CLI}'`) === 't',
  '승인이 막혔으면 인증도 안 됨 (한 트랜잭션)')
const CID = psql(`select id from public.clients where name='[승인]확인병원'`)
const withClient = tryAs(ADMIN, `select public.admin_approve_user('${CLI}', 'client', '${CID}')`)
ok(withClient.ok, '거래처를 지정하면 병원 계정도 승인됨')
ok(psql(`select email_confirmed_at is not null from auth.users where id='${CLI}'`) === 't',
  '병원 계정도 승인과 동시에 인증됨')

// ── 8. 잘못된 역할 (0021 그대로) ──────────────────────────────────────────
const BAD = signUp('appr-bad@beonemirae.test', '잘못된역할')
const badRole = tryAs(ADMIN, `select public.admin_approve_user('${BAD}', 'superuser')`)
ok(!badRole.ok && /역할이 올바르지/.test(badRole.out), '없는 역할로는 승인 못 함')
ok(psql(`select email_confirmed_at is null from auth.users where id='${BAD}'`) === 't',
  '역할이 틀렸으면 인증도 안 됨')

// ── 마무리 ────────────────────────────────────────────────────────────────
const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
