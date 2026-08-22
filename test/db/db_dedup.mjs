import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

//  0045 — 같은 거래처가 두 곳이 되지 않게.
//
//   실측으로 시작했습니다. 0045 이전 서버에 「오남한양병원」을 네 번 넣었더니
//   네 곳이 그대로 생겼습니다 (띄어쓰기·(주) 만 다른 것 포함). 거래처가 갈리면
//   수거·청구·미수금·매출이 전부 반쪽이 되고, 되돌릴 방법이 없습니다.
//
//   확인하는 것
//    · 이름 열쇠가 화면(clientName.ts)과 **글자 하나까지 같은가**
//    · 같은 이름을 막고 **어느 거래처인지 이름을 대는가**
//    · 「다른 병원입니다」라고 하면 만들어 주고 그 판단이 기록에 남는가
//    · 두 사람이 **같은 순간에** 넣어도 한 곳만 생기는가 (진짜 동시 접속)
//    · 다시 눌러도 두 곳이 안 되는가 (저장 시도 표)
//    · 표에 **직접 넣는 길이 닫혔는가** — 함수만 만들고 옛 길을 두면 방어가 아님
//    · 기사님은 거래처를 못 만드는가
const DB = 'dupq'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 110)

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('dup-admin@beonemirae.test', 'admin')
const OFFICE = mk('dup-office@beonemirae.test', 'office')
const FIELD = mk('dup-field@beonemirae.test', 'field')

const body = (name, extra = {}) =>
  JSON.stringify({ name, type: '병원', address: '', collects_medical_waste: true, collects_diaper: false, ...extra })
    .replace(/'/g, "''")
const create = (uid, name, { allow = false, req = null, extra = {} } = {}) =>
  tryAs(uid, `select public.create_client('${body(name, extra)}'::jsonb, ${allow}, ${req ? `'${req}'::uuid` : 'null'})`)
const count = (like) => Number(psql(`select count(*) from public.clients where name like '%${like}%'`))

// ── 0. 판 ─────────────────────────────────────────────────────────────────
ok(Number(psql(`select public.app_schema_version()`)) === 64, 'DB 판이 64', psql(`select public.app_schema_version()`))

// ── 1. 이름 열쇠가 화면과 같은가 ──────────────────────────────────────────
//   여기가 어긋나면 화면이 「괜찮다」고 한 것을 서버가 막습니다. 같은 예시표를
//   양쪽에 먹여 한 글자라도 다르면 실패로 만듭니다.
{
  //  규칙을 여기서 다시 적으면 앱과 어긋납니다 — 앱이 쓰는 코드를 그대로
  //  묶어서 씁니다. 앱의 규칙이 바뀌면 이 검증도 따라옵니다.
  const ROOT = '/home/user/beonemirae-ops-mvp'
  const work = mkdtempSync(join(tmpdir(), 'namekey-'))
  execFileSync(join(ROOT, 'node_modules/.bin/esbuild'),
    [join(ROOT, 'src/lib/clientName.ts'), '--bundle', '--format=esm', `--outfile=${join(work, 'clientName.mjs')}`],
    { encoding: 'utf8', cwd: ROOT })
  const { clientNameKey: jsKey } = await import(join(work, 'clientName.mjs'))
  const cases = [
    '오남한양병원', '오남한양 병원', '(주)오남한양병원', '㈜오남한양병원', '주식회사 오남한양병원',
    '의료법인 오남한양병원', '오남한양병원 ', '  오남한양병원  ', '오남-한양병원', '오남·한양병원',
    '연세의원(강남)', '연세의원(분당)', '해올요양병원', '해올 요양 병원', '(의)해올요양병원',
    'THE ONE 요양병원', 'the one 요양병원', '仁和병원', '', '   ', '(주)',
  ]
  const arr = JSON.stringify(cases).replace(/'/g, "''")
  const sqlKeys = JSON.parse(psql(
    `select jsonb_agg(public.client_name_key(v) order by ord)
       from jsonb_array_elements_text('${arr}'::jsonb) with ordinality t(v, ord)`,
  ))
  const bad = cases.filter((c, i) => jsKey(c) !== sqlKeys[i])
  ok(bad.length === 0, `이름 열쇠가 화면과 서버에서 같음 (${cases.length}가지)`,
    bad.length ? bad.map((b) => `${b} → js:${jsKey(b)} / sql:${sqlKeys[cases.indexOf(b)]}`).join(' | ') : '')
  ok(jsKey('오남한양 병원') === jsKey('(주)오남한양병원'),
    '띄어쓰기·(주) 만 다른 이름은 같은 곳으로 봄', jsKey('(주)오남한양병원'))
  ok(jsKey('연세의원(강남)') !== jsKey('연세의원(분당)'),
    '지점 이름은 다른 곳으로 봄 — 사람이 구분해 적은 것을 지우지 않음')
}

// ── 2. 처음 등록은 그냥 됩니다 ────────────────────────────────────────────
{
  const r = create(OFFICE, '오남한양병원')
  ok(r.ok, '사무실 담당자가 새 거래처를 만들 수 있음', r.ok ? '' : err(r))
  const j = JSON.parse(r.out)
  ok(typeof j.id === 'string' && j.id.length === 36, '만든 거래처 id 를 돌려줌', j.id)
  ok(j.alreadySaved === false, '처음 저장이라고 말함')
  ok(psql(`select name_key from public.clients where id='${j.id}'`) === '오남한양병원', '열쇠가 자동으로 채워짐')
  ok(psql(`select count(*) from public.audit_logs where action='client.create' and client_id='${j.id}'`) === '1',
    '기록이 남음')
}

// ── 3. 같은 이름은 막고 「어느 거래처인지」 이름을 댑니다 ─────────────────
for (const [label, name] of [
  ['똑같은 이름', '오남한양병원'],
  ['띄어쓰기만 다른 이름', '오남한양 병원'],
  ['(주) 만 붙인 이름', '(주)오남한양병원'],
  ['㈜ 만 붙인 이름', '㈜오남한양병원'],
  ['의료법인만 붙인 이름', '의료법인 오남한양병원'],
]) {
  const r = create(OFFICE, name)
  ok(!r.ok && /이미 같은 이름의 거래처가 있습니다/.test(r.out), `${label} → 막음`, err(r))
  ok(/오남한양병원/.test(r.out), `${label} → 어느 거래처인지 이름을 댐`)
}
ok(count('오남한양') === 1, '막힌 뒤에도 거래처는 한 곳뿐', `${count('오남한양')}곳`)

// ── 4. 다른 이름은 안 막습니다 ────────────────────────────────────────────
{
  const a = create(OFFICE, '연세의원(강남)')
  const b = create(OFFICE, '연세의원(분당)')
  ok(a.ok && b.ok, '지점이 다르면 둘 다 만들어짐', a.ok && b.ok ? '' : err(a.ok ? b : a))
  ok(count('연세의원') === 2, '두 곳이 남음')
}

// ── 5. 「다른 병원입니다」라고 하면 만들어 주되 기록에 남깁니다 ───────────
//   막기만 하면 실제로 상호가 같은 다른 병원을 넣을 길이 없어집니다.
//   그건 시스템이 사람 대신 판단하는 것입니다.
{
  const r = create(OFFICE, '오남한양병원', { allow: true })
  ok(r.ok, '사람이 「다른 병원」이라고 하면 만들어 줌', r.ok ? '' : err(r))
  const j = JSON.parse(r.out)
  ok(Array.isArray(j.duplicates) && j.duplicates.length === 1,
    '무엇과 부딪혔는지 함께 돌려줌', JSON.stringify(j.duplicates).slice(0, 60))
  const sum = psql(`select summary from public.audit_logs where action='client.create' and client_id='${j.id}'`)
  ok(/다른 병원이라고 확인함/.test(sum), '그 판단이 기록에 남음 — 나중에 왜 둘인지 알 수 있음', sum.slice(0, 80))
  ok(count('오남한양') === 2, '이제 두 곳', `${count('오남한양')}곳`)
  //  뒷정리 — 아래 동시성 검사는 깨끗한 이름으로 합니다
  psql(`delete from public.audit_logs where client_id='${j.id}'`)
  psql(`delete from public.clients where id='${j.id}'`)
}

// ── 6. 거래 종료한 거래처도 셉니다 ────────────────────────────────────────
//   지난 수거·미수금이 그쪽에 붙어 있습니다. 새로 만들면 이어지지 않습니다.
{
  const r = create(OFFICE, '그만둔요양원')
  const id = JSON.parse(r.out).id
  psql(`update public.clients set active=false where id='${id}'`)
  const again = create(OFFICE, '그만둔 요양원')
  ok(!again.ok && /거래 종료/.test(again.out), '거래 종료한 곳과 같은 이름도 막고 「거래 종료」라고 알려 줌', err(again))
}

// ── 7. 두 사람이 같은 순간에 (진짜 동시 접속) ────────────────────────────
//   「먼저 확인하고 넣기」는 방어가 아닙니다 — 둘 다 「없다」를 보고 둘 다 넣습니다.
{
  const N = 4
  const one = (i) =>
    new Promise((res) => {
      const sql = `set local role authenticated; set local request.jwt.claims = '{"sub":"${OFFICE}","role":"authenticated"}';
                   select pg_sleep(0.2);
                   select public.create_client('${body('동시등록병원')}'::jsonb, false, null)`
      const p = spawn('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', sql])
      let e = ''
      p.stderr.on('data', (d) => { e += d })
      p.on('close', (code) => res({ i, code, e }))
    })
  const rs = await Promise.all(Array.from({ length: N }, (_, i) => one(i)))
  const won = rs.filter((r) => r.code === 0).length
  ok(count('동시등록') === 1, `${N}명이 같은 순간에 눌러도 거래처는 한 곳`, `${count('동시등록')}곳`)
  ok(won === 1, '한 명만 통과하고 나머지는 막힘', `통과 ${won}명 / ${N}명`)
  ok(rs.filter((r) => r.code !== 0).every((r) => /이미 같은 이름의 거래처가 있습니다/.test(r.e)),
    '막힌 쪽도 「이미 있습니다」라고 사람 말로 말함')
}

// ── 8. 다시 눌러도 두 곳이 안 됩니다 ──────────────────────────────────────
{
  const REQ = '11111111-2222-3333-4444-555555555555'
  const a = create(OFFICE, '재시도병원', { req: REQ })
  const b = create(OFFICE, '재시도병원', { req: REQ })
  ok(a.ok && b.ok, '같은 저장 시도를 두 번 보내도 오류가 아님', a.ok && b.ok ? '' : err(a.ok ? b : a))
  const ja = JSON.parse(a.out)
  const jb = JSON.parse(b.out)
  ok(ja.id === jb.id, '두 번째는 처음 만든 거래처를 그대로 돌려줌')
  ok(jb.alreadySaved === true, '「이미 저장됐다」고 말함')
  ok(count('재시도') === 1, '거래처는 한 곳', `${count('재시도')}곳`)
  //  같은 표를 다른 이름으로 보내도 새로 만들지 않습니다 (표가 먼저입니다)
  const c = create(OFFICE, '재시도병원2', { req: REQ })
  ok(c.ok && JSON.parse(c.out).id === ja.id, '같은 표는 언제나 같은 거래처를 가리킴')
}

// ── 9. 표에 직접 넣는 길이 닫혔는가 ───────────────────────────────────────
//   함수만 만들고 옛 길을 두면 방어가 아닙니다.
{
  const r = tryAs(OFFICE, `insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
                           values ('몰래넣기병원','병원','',true,false)`)
  ok(!r.ok && /permission denied|권한/.test(r.out), '표에 직접 등록하는 길이 닫힘', err(r))
  ok(count('몰래넣기') === 0, '몰래 들어간 거래처가 없음')
  //  고치기는 계속 됩니다 — 상호 수정·거래 종료는 필요한 일입니다
  const u = tryAs(OFFICE, `update public.clients set address='서울시' where name='오남한양병원'`)
  ok(u.ok, '거래처 정보 수정은 그대로 됨', u.ok ? '' : err(u))
}

// ── 10. 이름 열쇠는 사람이 못 정합니다 ────────────────────────────────────
{
  const r = create(OFFICE, '열쇠조작병원', { extra: { name_key: '엉뚱한열쇠', id: '00000000-0000-0000-0000-00000000dead' } })
  const j = JSON.parse(r.out)
  ok(j.id !== '00000000-0000-0000-0000-00000000dead', 'id 를 넣어 보내도 서버가 정함', j.id)
  ok(psql(`select name_key from public.clients where id='${j.id}'`) === '열쇠조작병원',
    '열쇠를 넣어 보내도 이름에서 다시 계산함')
  //  이름을 고치면 열쇠도 따라옵니다 — 안 따라오면 고친 뒤에 중복이 생깁니다
  psql(`update public.clients set name='바뀐이름병원' where id='${j.id}'`)
  ok(psql(`select name_key from public.clients where id='${j.id}'`) === '바뀐이름병원',
    '이름을 고치면 열쇠도 따라옴')
  const after = create(OFFICE, '바뀐 이름 병원')
  ok(!after.ok, '고친 이름으로도 중복이 막힘', err(after))
}

// ── 11. 아무나 만들 수 없습니다 ───────────────────────────────────────────
{
  const r = create(FIELD, '기사님이만든병원')
  ok(!r.ok && /사무실 담당자와 관리자만/.test(r.out), '기사님은 거래처를 못 만듦', err(r))
  ok(count('기사님') === 0, '막힌 뒤 남은 것이 없음')
  const blank = create(ADMIN, '   ')
  ok(!blank.ok && /이름을 넣어 주세요/.test(blank.out), '빈 이름은 거절', err(blank))
  const punct = create(ADMIN, '---')
  ok(!punct.ok && /글자가 없습니다/.test(punct.out), '기호만 있는 이름도 거절', err(punct))
}

// ── 12. 자가진단이 새것을 실제로 세는가 (이빨) ───────────────────────────
const check = () => JSON.parse(run(`select public.app_health_check()`, ADMIN))
{
  const h = check()
  ok(h.ok === true && h.version === 64, '0045 를 올린 DB 는 「이상 없음」',
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
gone('이름 열쇠 방아쇠가 사라지면',
  `drop trigger clients_name_key_trg on public.clients`,
  `create trigger clients_name_key_trg before insert or update of name on public.clients
     for each row execute function public.clients_set_name_key()`,
  '방아쇠 clients_name_key_trg')
gone('거래처 직접 등록이 다시 열리면',
  `grant insert on public.clients to authenticated`,
  `revoke insert on public.clients from authenticated`,
  'clients 직접 등록이 열려 있음')
gone('재시도 색인이 사라지면',
  `drop index public.clients_request_uniq`,
  `create unique index clients_request_uniq on public.clients (request_id) where request_id is not null`,
  'clients_request_uniq')

const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
