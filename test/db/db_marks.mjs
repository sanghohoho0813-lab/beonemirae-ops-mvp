import { execFileSync } from 'node:child_process'

//  0054 — 「보냈습니다 / 발행했습니다」 표시 (month_close_marks).
//
//   이 표는 돈을 담지 않습니다. 그래서 위험은 금액이 아니라 **거짓 안심**
//   입니다 — 안 보낸 명세서가 「보냄」으로 남으면 병원에 청구서가 안 간 채
//   한 달이 지나갑니다. 확인하는 것은
//
//    · 관리자만 표시할 수 있는가 (사무실·현장·병원은 못 함)
//    · 표를 직접 고칠 수 없는가 (직접 켜면 「누가 눌렀는가」가 무의미)
//    · 다시 눌러도 두 줄이 안 생기는가 · 되돌릴 수 있는가
//    · **아직 오지 않은 달**을 「보냄」으로 못 찍는가
//    · 병원 계정이 우리 마감 기록을 못 보는가
//    · 누가 눌렀는지 이름이 남는가 (계정이 지워져도)
//    · 금액·청구·입금이 하나도 안 바뀌는가

const DB = 'marksq'
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 120)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role === 'admin' ? '송명근' : role}','${role}',true,now(),
                ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(),
                                       name=excluded.name, client_id=excluded.client_id`)
  return id
}
const client = (name) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',true,false) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}' limit 1`)
}

const CA = client('[검증]가나병원')
const ADMIN = mk('mk-admin@beonemirae.test', 'admin')
const OFFICE = mk('mk-office@beonemirae.test', 'office')
const FIELD = mk('mk-field@beonemirae.test', 'field')
const HOSP = mk('mk-hosp@beonemirae.test', 'client', CA)

//  이 달과 지난 달 — 「아직 오지 않은 달」 검사에 쓸 기준
const THIS_MONTH = psql(`select to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')`)
const LAST_MONTH = psql(`select to_char((now() at time zone 'Asia/Seoul') - interval '1 month', 'YYYY-MM')`)
const NEXT_MONTH = psql(`select to_char((now() at time zone 'Asia/Seoul') + interval '1 month', 'YYYY-MM')`)

// ── 0. 판 번호와 자가진단 ───────────────────────────────────────────────────
{
  ok(psql('select public.app_schema_version()') === '64', 'DB 판 64', psql('select public.app_schema_version()'))
  const h = JSON.parse(run('select public.app_health_check()', ADMIN))
  ok(h.ok === true, '자가진단 이상 없음', JSON.stringify(h.missing))
  //  새 표·색인·함수를 자가진단 목록에 넣지 않으면, 나중에 사라져도
  //  「이상 없음」이라고 거짓말합니다.
  psql('drop index if exists public.month_close_marks_uniq')
  const h2 = JSON.parse(run('select public.app_health_check()', ADMIN))
  ok(h2.ok === false && JSON.stringify(h2.missing).includes('month_close_marks_uniq'),
    '**새 색인이 자가진단 목록에 들어 있음** (지우면 잡아냄)', JSON.stringify(h2.missing))
  psql('create unique index if not exists month_close_marks_uniq on public.month_close_marks (month, step)')
}

// ── 1. 관리자만 표시할 수 있다 ──────────────────────────────────────────────
{
  for (const [uid, who] of [[OFFICE, '사무실'], [FIELD, '현장'], [HOSP, '병원']]) {
    const r = tryAs(uid, `select public.set_month_close_mark('${LAST_MONTH}','invoice_sent',true)`)
    ok(!r.ok && /관리자만/.test(r.out), `${who} 담당자는 마감 표시를 못 함`, err(r))
  }
  const a = tryAs(ADMIN, `select public.set_month_close_mark('${LAST_MONTH}','invoice_sent',true,'8월분 우편 발송')`)
  ok(a.ok && JSON.parse(a.out).changed === true, '관리자는 표시할 수 있음', a.out.slice(0, 70))
}

// ── 2. 표를 직접 고칠 수 없다 ───────────────────────────────────────────────
//   직접 켤 수 있으면 「누가 눌렀는가」가 아무 뜻이 없습니다.
{
  for (const [sql, what] of [
    [`insert into public.month_close_marks (month, step) values ('${LAST_MONTH}','tax_issued')`, '넣기'],
    [`update public.month_close_marks set marked_name='남의 이름'`, '고치기'],
    [`delete from public.month_close_marks`, '지우기'],
  ]) {
    const r = tryAs(ADMIN, sql)
    ok(!r.ok, `**관리자도 표를 직접 ${what} 못 함** — 함수로만`, err(r))
  }
}

// ── 3. 다시 눌러도 두 줄이 안 생긴다 · 되돌릴 수 있다 ───────────────────────
{
  const again = JSON.parse(run(`select public.set_month_close_mark('${LAST_MONTH}','invoice_sent',true)`, ADMIN))
  ok(again.changed === false && again.done === true, '**다시 눌러도 아무 일 없음**', JSON.stringify(again))
  const n = psql(`select count(*) from public.month_close_marks where month='${LAST_MONTH}' and step='invoice_sent'`)
  ok(n === '1', '줄이 하나만 남음', `${n}줄`)

  const off = JSON.parse(run(`select public.set_month_close_mark('${LAST_MONTH}','invoice_sent',false)`, ADMIN))
  ok(off.changed === true && off.done === false, '되돌릴 수 있음', JSON.stringify(off))
  ok(psql(`select count(*) from public.month_close_marks where month='${LAST_MONTH}'`) === '0', '되돌리면 줄이 사라짐')

  //  다시 켜 둡니다 (뒤 검사에서 씁니다)
  run(`select public.set_month_close_mark('${LAST_MONTH}','invoice_sent',true,'8월분 우편 발송')`, ADMIN)
}

// ── 4. 누가 눌렀는지 남는다 ─────────────────────────────────────────────────
{
  const row = psql(`select marked_name || '|' || coalesce(note,'') || '|' || (marked_by is not null)
                      from public.month_close_marks where month='${LAST_MONTH}' and step='invoice_sent'`)
  ok(row.startsWith('송명근|'), '**누른 사람 이름이 그 자리에서 굳어짐**', row)
  ok(row.includes('8월분 우편 발송'), '메모도 남음', row)

  //  감사기록에도 남아야 합니다.
  const audit = psql(`select count(*) from public.audit_logs where action='month_close.mark'`)
  ok(Number(audit) >= 3, '감사기록에 남음 (켜기·끄기·다시 켜기)', `${audit}줄`)
  const summary = psql(`select summary from public.audit_logs where action='month_close.mark' order by id desc limit 1`)
  ok(/거래명세서 발송 표시함/.test(summary), '무엇을 했는지 사람 말로 남음', summary)
}

// ── 5. 아직 오지 않은 달은 「보냄」으로 못 찍는다 ───────────────────────────
//   미래를 끝났다고 적으면 알림이 조용해지고, 실제로는 아무것도 안 한 채
//   그 달이 지나갑니다.
{
  const r = tryAs(ADMIN, `select public.set_month_close_mark('${NEXT_MONTH}','invoice_sent',true)`)
  ok(!r.ok && /아직 오지 않은 달/.test(r.out), '**다음 달을 미리 「보냄」으로 못 찍음**', err(r))
  //  이번 달은 됩니다 — 달 중간에 미리 보내는 경우가 있습니다.
  const now = tryAs(ADMIN, `select public.set_month_close_mark('${THIS_MONTH}','tax_issued',true)`)
  ok(now.ok, '이번 달은 표시할 수 있음', now.out.slice(0, 60))
  //  되돌리는 것은 미래여도 막지 않습니다 — 잘못 켠 것을 못 끄면 안 됩니다.
  const undo = tryAs(ADMIN, `select public.set_month_close_mark('${NEXT_MONTH}','invoice_sent',false)`)
  ok(undo.ok, '미래 달도 「해제」는 됨 — 잘못 켠 것을 못 끄면 안 됩니다', undo.out.slice(0, 60))
}

// ── 6. 아무 단계나 못 찍는다 ────────────────────────────────────────────────
//   시스템이 아는 단계(청구 확정·입금 대사)를 사람이 손으로 「끝」이라고
//   적을 수 있으면, 실제 자료와 어긋났을 때 어느 쪽이 맞는지 알 수 없습니다.
{
  for (const step of ['confirm', 'bank', 'collect', '아무거나']) {
    const r = tryAs(ADMIN, `select public.set_month_close_mark('${LAST_MONTH}','${step}',true)`)
    ok(!r.ok, `시스템이 아는 단계(${step})는 손으로 못 찍음`, err(r))
  }
  const bad = tryAs(ADMIN, `select public.set_month_close_mark('2026년 8월','invoice_sent',true)`)
  ok(!bad.ok && /2026-08 형태/.test(bad.out), '월 표기가 틀리면 막음', err(bad))
}

// ── 7. 병원은 우리 마감 기록을 못 본다 ──────────────────────────────────────
{
  const seen = tryAs(HOSP, 'select count(*) from public.month_close_marks')
  ok(seen.ok && seen.out === '0', '**병원 계정은 우리 마감 기록을 못 봄**', seen.out)
  //  직원은 봅니다 — 「이사님이 보냈는지」를 사무실도 알아야 합니다.
  const office = tryAs(OFFICE, 'select count(*) from public.month_close_marks')
  ok(office.ok && Number(office.out) > 0, '직원은 볼 수 있음', office.out)
}

// ── 8. 돈은 하나도 안 건드린다 ──────────────────────────────────────────────
{
  //  이 표가 생기고 돌아간 뒤에도 금액 관련 표는 그대로여야 합니다.
  const before = psql(`select coalesce(sum(amount),0) from public.payments`)
  run(`select public.set_month_close_mark('${LAST_MONTH}','tax_issued',true)`, ADMIN)
  const after = psql(`select coalesce(sum(amount),0) from public.payments`)
  ok(before === after, '**청구 금액이 1원도 안 바뀜**', `${before} → ${after}`)
  const cols = psql(`select count(*) from information_schema.columns
                      where table_schema='public' and table_name='month_close_marks'
                        and column_name in ('amount','price','total')`)
  ok(cols === '0', '이 표에는 금액 칸이 아예 없음')
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
