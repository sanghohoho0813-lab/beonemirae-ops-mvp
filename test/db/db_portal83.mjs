import { execFileSync } from 'node:child_process'

//  0083 — 고객 포털 1차 고도화 (문의 · 포털 접속 기록)
//
//   여기서 제일 중요한 검사는 기능이 아니라 **경계**입니다.
//   병원 계정이 **다른 병원의 글을 한 줄이라도** 볼 수 있으면 그 순간
//   이 포털은 거래처에 못 내놓습니다. 화면에서 안 보이게 하는 것으로는
//   부족합니다 — 서버가 막아야 합니다.
//
//   확인하는 것
//    · A 병원은 B 병원 문의를 **못 본다**
//    · A 병원은 남의 이름으로 문의를 **못 올린다**
//    · 병원은 올린 문의를 **못 고친다** (답을 자기가 써 넣을 수 없다)
//    · 답하기는 사무실·관리자만 · 답한 사람과 시각이 반드시 남는다
//    · 포털 접속 기록은 **병원이 들어왔을 때만** 찍힌다 (직원 확인은 안 셈)
//    · 병원 계정이 그 함수로 자기 role·소속을 바꿀 수 없다

const DB = 'portal83'
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close',
                 '0074_amend', '0075_supply_items', '0076_snooze_who', '0077_schedule_origin',
                 '0079_stock_items', '0083_customer_platform']) {
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}supabase/proposals/PROPOSAL_${f}.sql`],
    { encoding: 'utf8' })
}

const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (s) => run(s)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 120)

// ── 사람과 거래처 ───────────────────────────────────────────────────────────
const AD = '00000000-0000-0000-0000-0000000000a9'   // 대표
const OF = '00000000-0000-0000-0000-0000000000b2'   // 사무실
const FD = '00000000-0000-0000-0000-0000000000f1'   // 기사
const HA = '00000000-0000-0000-0000-00000000c1a1'   // A 병원 담당자
const HB = '00000000-0000-0000-0000-00000000c1a2'   // B 병원 담당자
const CA = '00000000-0000-0000-0000-0000000000a1'
const CB = '00000000-0000-0000-0000-0000000000a2'

for (const [id, name] of [[CA, '남양주백병원'], [CB, '오남한양병원']]) {
  psql(`insert into public.clients (id, name, type, address, collects_medical_waste)
        values ('${id}', '${name}', '병원', '경기도 남양주시 오남읍 1', true)
        on conflict (id) do nothing`)
}
for (const [id, name, role, cid] of [
  [AD, '송대표', 'admin', null], [OF, '송현주', 'office', null], [FD, '김준기', 'field', null],
  [HA, 'A병원 담당자', 'client', CA], [HB, 'B병원 담당자', 'client', CB],
]) {
  psql(`insert into auth.users (id, email) values ('${id}', '${id}@b.c') on conflict do nothing`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}', '${id}@b.c', '${name}', '${role}', true, now(), ${cid ? `'${cid}'` : 'null'})
        on conflict (id) do update set role = excluded.role, active = true,
          approved_at = now(), client_id = excluded.client_id`)
}

const ins = (uid, cid, topic, subject) =>
  tryAs(uid, `insert into public.client_inquiries (client_id, topic, subject, body, asked_by_name)
              values ('${cid}', '${topic}', '${subject}', '내용', '담당자') returning id`)

// ── ① 병원이 자기 문의를 올릴 수 있다 ──────────────────────────────────────
{
  const a = ins(HA, CA, '수거 일정', 'A 병원 일정 문의')
  ok(a.ok && a.out.length > 10, '**병원이 문의를 올릴 수 있다**', a.ok ? a.out.slice(0, 12) : err(a))
  const b = ins(HB, CB, '정산', 'B 병원 정산 문의')
  ok(b.ok, 'B 병원도 올릴 수 있다', b.ok ? '' : err(b))
  const n = Number(psql('select count(*) from public.client_inquiries'))
  ok(n === 2, '두 건이 들어갔다', `${n}건`)
}

// ── ② 남의 병원 것은 못 본다 (제일 중요) ───────────────────────────────────
{
  const seenA = Number(run('select count(*) from public.client_inquiries', HA))
  const seenB = Number(run('select count(*) from public.client_inquiries', HB))
  ok(seenA === 1, '**A 병원에는 자기 것 1건만 보인다**', `${seenA}건`)
  ok(seenB === 1, '**B 병원에도 자기 것 1건만 보인다**', `${seenB}건`)
  const subjA = run(`select subject from public.client_inquiries`, HA)
  ok(subjA === 'A 병원 일정 문의', 'A 병원에 보이는 것이 자기 글이다', subjA)
  //  ⚠ 「안 보인다」를 넘어 **이름으로 콕 집어도** 안 나와야 합니다.
  const peek = Number(run(`select count(*) from public.client_inquiries where client_id = '${CB}'`, HA))
  ok(peek === 0, '**남의 병원 id 를 직접 찍어도 0건**', `${peek}건`)
}

// ── ③ 남의 이름으로는 못 올린다 ─────────────────────────────────────────────
{
  const r = ins(HA, CB, '기타', 'A 가 B 인 척')
  ok(!r.ok, '**남의 병원 이름으로 문의를 못 올린다**', r.ok ? '올라가 버렸습니다' : err(r))
}

// ── ④ 병원은 올린 뒤 못 고친다 ──────────────────────────────────────────────
{
  //  ⚠ RLS 는 정책이 없으면 오류가 아니라 **0줄**이 바뀝니다.
  //    「오류가 났나」가 아니라 「몇 줄 바뀌었나」를 봅니다.
  const n = run(`with u as (
      update public.client_inquiries set reply = '제가 직접 답 씁니다', status = '답변 완료'
       where client_id = '${CA}' returning 1) select count(*) from u`, HA)
  ok(Number(n) === 0, '**병원은 자기 문의도 못 고친다** (답을 자기가 못 씁니다)', `${n}줄`)
  const st = psql(`select status from public.client_inquiries where client_id = '${CA}'`)
  ok(st === '접수', '상태가 그대로다', st)
}

// ── ⑤ 답하기는 사무실·관리자만 ──────────────────────────────────────────────
{
  const id = psql(`select id from public.client_inquiries where client_id = '${CA}'`)
  const byField = tryAs(FD, `select public.answer_inquiry('${id}', '답변 완료', '기사님이 답함')`)
  ok(!byField.ok, '**기사님은 답할 수 없다**', byField.ok ? '됐습니다' : err(byField))
  const byClient = tryAs(HA, `select public.answer_inquiry('${id}', '답변 완료', '병원이 답함')`)
  ok(!byClient.ok, '**병원도 답할 수 없다**', byClient.ok ? '됐습니다' : err(byClient))
  const byOffice = tryAs(OF, `select public.answer_inquiry('${id}', '확인 중', '확인하고 연락드리겠습니다')`)
  ok(byOffice.ok, '사무실은 답할 수 있다', byOffice.ok ? '' : err(byOffice))
  const row = psql(`select status || '|' || reply || '|' || coalesce(handled_by::text,'없음') ||
                    '|' || (handled_at is not null)::text
                    from public.client_inquiries where id = '${id}'`)
  const [st, rep, who, when] = row.split('|')
  ok(st === '확인 중', '상태가 바뀌었다', st)
  ok(rep === '확인하고 연락드리겠습니다', '답이 그대로 들어갔다', rep)
  ok(who === OF, '**누가 답했는지 남는다**', who)
  ok(when === 't' || when === 'true', '**언제 답했는지도 남는다**', when)
}

// ── ⑥ 알 수 없는 상태는 안 받는다 ───────────────────────────────────────────
{
  const id = psql(`select id from public.client_inquiries where client_id = '${CA}'`)
  const r = tryAs(OF, `select public.answer_inquiry('${id}', '아무거나', null)`)
  ok(!r.ok, '알 수 없는 상태는 막는다', r.ok ? '통과해 버렸습니다' : err(r))
  //  없는 문의에 답하려 하면 조용히 넘어가지 않고 말해 줍니다.
  const g = tryAs(OF, `select public.answer_inquiry('00000000-0000-0000-0000-0000000000ff', '확인 중', null)`)
  ok(!g.ok, '없는 문의는 말해 준다', g.ok ? '조용히 넘어갔습니다' : err(g))
}

// ── ⑦ 답만 비우면 옛 답이 남는다 ────────────────────────────────────────────
{
  const id = psql(`select id from public.client_inquiries where client_id = '${CA}'`)
  tryAs(OF, `select public.answer_inquiry('${id}', '답변 완료', null)`)
  const rep = psql(`select reply from public.client_inquiries where id = '${id}'`)
  ok(rep === '확인하고 연락드리겠습니다', '**상태만 바꿔도 답이 지워지지 않는다**', rep)
}

// ── ⑧ 포털 접속 기록 — 병원이 들어왔을 때만 ────────────────────────────────
{
  const before = psql(`select coalesce(last_portal_seen_at::text, '없음') from public.profiles where id = '${HA}'`)
  ok(before === '없음', '처음에는 접속 기록이 없다 — 지어낸 값이 없다', before)

  const r = tryAs(HA, 'select public.touch_portal_seen()')
  ok(r.ok && r.out !== '', '**병원이 열면 찍힌다**', r.ok ? '' : err(r))
  const after = psql(`select (last_portal_seen_at is not null)::text from public.profiles where id = '${HA}'`)
  ok(after === 't' || after === 'true', '기록이 남았다', after)

  //  ⚠ 직원이 확인용으로 포털을 열어 본 것까지 「병원이 들어왔다」로 세면,
  //    거래처 상세의 「최근 접속」이 거짓말이 됩니다.
  const s = tryAs(OF, 'select public.touch_portal_seen()')
  ok(s.ok, '직원이 불러도 터지지 않는다', s.ok ? '' : err(s))
  const of = psql(`select coalesce(last_portal_seen_at::text, '없음') from public.profiles where id = '${OF}'`)
  ok(of === '없음', '**직원이 열어 본 것은 안 센다**', of)

  //  다른 사람 기록은 못 건드립니다.
  const hb = psql(`select coalesce(last_portal_seen_at::text, '없음') from public.profiles where id = '${HB}'`)
  ok(hb === '없음', '남의 접속 기록은 안 바뀐다', hb)
}

// ── ⑨ 그 함수로 role·소속을 바꿀 수 없다 ────────────────────────────────────
{
  const before = psql(`select role || '|' || coalesce(client_id::text,'없음') from public.profiles where id = '${HA}'`)
  tryAs(HA, 'select public.touch_portal_seen()')
  const after = psql(`select role || '|' || coalesce(client_id::text,'없음') from public.profiles where id = '${HA}'`)
  ok(before === after, '**역할과 소속은 그대로다**', after)
  //  프로필을 직접 고치는 길도 여전히 없습니다.
  //  ⚠ RLS 는 정책이 없으면 0줄, 정책이 **거절**하면 오류입니다. 둘 다
  //    「못 바꿨다」이므로 양쪽을 다 통과로 봅니다 — 중요한 것은 결과입니다.
  const r = tryAs(HA, `with u as (update public.profiles set role = 'admin' where id = '${HA}' returning 1)
                       select count(*) from u`)
  ok(!r.ok || Number(r.out) === 0, '**병원 계정이 스스로 관리자가 될 수 없다**',
    r.ok ? `${r.out}줄` : err(r))
  const role = psql(`select role from public.profiles where id = '${HA}'`)
  ok(role === 'client', '역할이 그대로 client 다', role)
}

// ── ⑩ 기존 것이 안 깨졌다 ───────────────────────────────────────────────────
{
  //  ⚠ 이 파일은 더하기만 해야 합니다. 옛 표와 정책이 그대로인지 봅니다.
  const req = tryAs(HA, `insert into public.client_requests (client_id, kind, content, source)
                         values ('${CA}', '추가수거', '한 번 더 와 주세요', 'portal') returning id`)
  ok(req.ok, '병원 수거요청은 예전 그대로 된다', req.ok ? '' : err(req))
  const peek = Number(run(`select count(*) from public.client_requests where client_id = '${CB}'`, HA))
  ok(peek === 0, '수거요청도 남의 것은 여전히 안 보인다', `${peek}건`)
  const v = psql('select public.app_schema_version()')
  ok(v === '83', '판 번호가 83 이다', v)
  const items = psql('select count(*) from public.office_stock_items')
  ok(items === '13', '0079 규격별 재고 13줄이 그대로다', items)
}
