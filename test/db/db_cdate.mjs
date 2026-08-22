import { execFileSync } from 'node:child_process'

//  0061 — 다녀온 날을 실제로 적을 때 서버가 지키는 것.
//
//   직접 입력이 **무조건 오늘 날짜로** 저장되고 있었습니다. 기사님이 저녁에
//   넣거나 다음 날 아침에 넣으면 하루가 밀립니다. 평소엔 기록만 어긋나지만
//   **월말에는 하루치 수거가 통째로 다음 달 매출**이 됩니다 — 그 달 청구서
//   금액이 그만큼 모자랍니다.
//
//   확인하는 것
//    · 날짜를 안 보내면 지금까지처럼 오늘 (옛 화면이 그대로 동작)
//    · 보낸 날짜로 저장되고, 자재 공급도 **같은 날짜**로 간다
//    · 미래 날짜 금지 · 45일 초과 금지
//    · **이미 청구를 확정한 달에는 못 넣는다** ← 제일 중요
//    · 같은 날 중복 검사가 **그 날짜 기준**으로 돈다
//    · 예정을 눌러 완료하면 그 일정의 날짜를 그대로 쓴다

const DB = 'cdateq'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 140)

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증D]가나병원','병원','',true,false) on conflict do nothing`)
const CA = psql(`select id from public.clients where name='[검증D]가나병원'`)
psql(`insert into public.vehicles (name, waste_type, driver) values ('[검증D]의료차','의료폐기물','기사')
      on conflict do nothing`)
const V = psql(`select id from public.vehicles where name='[검증D]의료차'`)
const FIELD = mk('cd-field@beonemirae.test', 'field')
const ADMIN = mk('cd-admin@beonemirae.test', 'admin')

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const day = (n) => psql(`select ('${TODAY}'::date + ${n})::text`)

const complete = (uid, over = {}) => {
  const p = {
    scheduleId: null, clientId: CA, wasteType: '의료폐기물', vehicleId: V,
    driverName: '김준기', actualAmount: 100, actualTime: '10:00',
    containers: { corrugated: 0, plastic: 0, bag: 0, etc: 0 },
    handoverStatus: '수거 완료', supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
    suppliedItems: null, isAdditional: false, memo: '', screen: '수거 입력', ...over,
  }
  return tryAs(uid, `select public.complete_collection('${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`)
}
const clean = () => psql(`delete from public.schedules where client_id='${CA}'; delete from public.materials where client_id='${CA}'`)

// ── 1. 날짜를 안 보내면 오늘 (옛 화면 그대로) ──────────────────────────────
{
  clean()
  const r = complete(FIELD)
  ok(r.ok, '날짜 없이 저장', err(r))
  const d = psql(`select date::text from public.schedules where client_id='${CA}'`)
  ok(d === TODAY, '**안 보내면 지금까지처럼 오늘** (옛 화면이 그대로 돕니다)', d)
}

// ── 2. 보낸 날짜로 저장 · 자재도 같은 날 ───────────────────────────────────
{
  clean()
  psql(`update public.office_stock set corrugated_box = 500, plastic_container = 500, bag = 500, needle_box = 500 where id = 1`)
  const r = complete(FIELD, {
    date: day(-1),
    supplied: { corrugatedBox: 5, plasticContainer: 0, bag: 0, needleBox: 0 },
  })
  ok(r.ok, '어제 날짜로 저장', err(r))
  const d = psql(`select date::text from public.schedules where client_id='${CA}'`)
  ok(d === day(-1), '**어제로 저장됨**', d)
  const md = psql(`select date::text from public.materials where client_id='${CA}'`)
  ok(md === day(-1),
    '**함께 넣은 자재도 같은 날짜** (갈라지면 정산에서 어긋납니다)', md)
  //  기록 시각은 실제 지금입니다 — 날짜만 바뀝니다.
  //
  //   ⚠ `completed_at::date` 는 **세션 시간대(UTC)** 로 자릅니다. 그런데
  //     TODAY 는 한국 날짜입니다. 한국이 자정을 넘긴 뒤(UTC 15시~24시)에
  //     돌리면 두 날짜가 하루 어긋나 **밤에만 빨개졌습니다.**
  //     제품은 멀쩡합니다 — completed_at 에는 now() 가 그대로 들어갑니다.
  //     견줄 때 같은 시간대로 맞춥니다.
  const ct = psql(
    `select ((completed_at at time zone 'Asia/Seoul')::date = '${TODAY}'::date)::text `
      + `from public.schedules where client_id='${CA}'`,
  )
  ok(ct === 'true', '기록 시각은 실제 지금 (다녀온 날만 바뀜) — 한국 시간 기준')
}

// ── 3. 미래·너무 오래된 날 ─────────────────────────────────────────────────
{
  clean()
  const r1 = complete(FIELD, { date: day(1) })
  ok(!r1.ok && /아직 오지 않은 날/.test(r1.out), '**내일 다녀왔다고 못 함**', err(r1))
  const r2 = complete(FIELD, { date: day(-46) })
  ok(!r2.ok && /너무 오래된 날짜/.test(r2.out), '**45일 너머는 막음** (지난 기록은 엑셀로)', err(r2))
  const r3 = complete(FIELD, { date: day(-45) })
  ok(r3.ok, '45일 정확히는 통과', err(r3))
}

// ── 4. 이미 청구를 확정한 달에는 못 넣는다 ────────────────────────────────
//
//   ⚠ 여기가 제일 중요합니다. 넣어 버리면 병원에 나간 청구서에는 없는
//   수거가 장부에만 생겨 **실적과 청구액이 어긋납니다.**
{
  clean()
  const past = day(-20)
  const month = past.slice(0, 7)
  psql(`insert into public.payments (client_id, billing_month, amount, status, method, memo)
        values ('${CA}','${month}', 500000, '미수금', '무통장', '검증용')`)

  const r = complete(FIELD, { date: past })
  ok(!r.ok && /이미 확정했습니다/.test(r.out),
    '**청구를 확정한 달에는 소급 입력 금지**', err(r))
  const n = psql(`select count(*) from public.schedules where client_id='${CA}' and date='${past}'`)
  ok(n === '0', '실제로 안 들어감', `${n}건`)

  //  청구를 취소하면 넣을 수 있습니다 — 길이 막혀 있으면 안 됩니다.
  psql(`update public.payments set status='취소', canceled_at=now() where client_id='${CA}'`)
  const r2 = complete(FIELD, { date: past })
  ok(r2.ok, '**청구를 취소하면 넣을 수 있음** (막다른 길이 아닙니다)', err(r2))

  //  오늘 것은 그 달에 청구가 있어도 넣을 수 있어야 합니다 — 안 그러면
  //  월중에 청구를 한 번 확정한 뒤로 그 달 수거를 아예 못 넣습니다.
  clean()
  //  ⚠ 0037 이 확정한 청구의 **삭제**를 막습니다(맞는 방어입니다). 지우지
  //    않고 취소로 치웁니다 — 검사가 방어를 우회하면 안 됩니다.
  psql(`update public.payments set status='취소', canceled_at=now() where client_id='${CA}' and canceled_at is null`)
  psql(`insert into public.payments (client_id, billing_month, amount, status, method, memo)
        values ('${CA}','${TODAY.slice(0, 7)}', 500000, '미수금', '무통장', '검증용')`)
  const r3 = complete(FIELD)
  ok(r3.ok, '**오늘 것은 그 달에 청구가 있어도 들어감** (추가 청구로 이어집니다)', err(r3))
  psql(`update public.payments set status='취소', canceled_at=now() where client_id='${CA}' and canceled_at is null`)
}

// ── 4-2. **기사 계정으로도** 막히는가 ──────────────────────────────────────
//
//   ⚠ 이게 진짜 시험입니다. complete_collection 은 security definer 가 아니라
//   부르는 사람의 권한으로 돕니다. 그런데 수거를 넣는 사람은 대부분 기사이고,
//   기사는 RLS 상 payments 를 한 줄도 못 봅니다. 검사를 그냥 select 로 쓰면
//   **정작 막아야 할 사람 앞에서만 방어가 안 돕니다** (실제로 그랬습니다).
{
  clean()
  const past = day(-20)
  psql(`insert into public.payments (client_id, billing_month, amount, status, method, memo)
        values ('${CA}','${past.slice(0, 7)}', 500000, '미수금', '무통장', '검증용')`)

  //  기사 계정은 청구를 한 줄도 못 봅니다 — 그 상태에서도 막혀야 합니다.
  const seen = tryAs(FIELD, `select count(*) from public.payments`)
  ok(seen.ok && seen.out === '0', '기사 계정에는 청구가 한 줄도 안 보임', seen.out)

  const r = complete(FIELD, { date: past })
  ok(!r.ok && /이미 확정했습니다/.test(r.out),
    '**기사가 넣어도 막힘** (권한과 무관한 검사여야 합니다)', err(r))

  //  그러면서 기사에게 금액이 새로 보이면 안 됩니다.
  ok(!/500,?000/.test(r.out), '**오류 문구에 금액이 안 나옴**', err(r).slice(0, 60))
  psql(`update public.payments set status='취소', canceled_at=now() where client_id='${CA}' and canceled_at is null`)
}

// ── 5. 같은 날 중복 검사가 그 날짜 기준으로 ────────────────────────────────
{
  clean()
  const d = day(-2)
  const r1 = complete(FIELD, { date: d })
  ok(r1.ok, '이틀 전 것 저장', err(r1))
  const r2 = complete(FIELD, { date: d })
  ok(!r2.ok && /이미 저장되어 있습니다/.test(r2.out),
    '**같은 날 두 번은 막힘** (그 날짜 기준으로 봄)', err(r2))
  ok(/월 /.test(err(r2)) && !/^ERROR:  오늘 /.test(err(r2)),
    '오류 문구도 「오늘」이 아니라 그 날짜', err(r2).slice(0, 70))

  //  오늘 것은 따로 들어갑니다 — 날짜가 다르니까요.
  const r3 = complete(FIELD)
  ok(r3.ok, '오늘 것은 따로 들어감', err(r3))
  //  추가 수거는 같은 날에도 허용됩니다 (기존 규칙 유지).
  const r4 = complete(FIELD, { date: d, isAdditional: true })
  ok(r4.ok, '추가 수거는 같은 날에도 허용 (기존 규칙 유지)', err(r4))
}

// ── 6. 예정을 눌러 완료하면 그 일정의 날짜 ─────────────────────────────────
//
//   원래 문제가 없던 길입니다. 고치다 망가뜨리지 않았는지 봅니다.
{
  clean()
  const d = day(-3)
  psql(`insert into public.schedules (date, client_id, waste_type, status, origin)
        values ('${d}','${CA}','의료폐기물','예정','system')`)
  const sid = psql(`select id from public.schedules where client_id='${CA}' and date='${d}'`)
  //  일부러 오늘 날짜를 함께 보내 봅니다 — 일정 날짜가 이겨야 합니다.
  const r = complete(FIELD, { scheduleId: sid, date: TODAY })
  ok(r.ok, '예정을 눌러 완료', err(r))
  const after = psql(`select date::text || '|' || status from public.schedules where id='${sid}'`)
  ok(after === `${d}|완료`,
    '**일정의 날짜가 그대로 유지됨** (보낸 날짜가 덮어쓰지 않음)', after)
}

// ── 7. 감사기록·버전 ───────────────────────────────────────────────────────
{
  const n = psql(`select count(*) from public.audit_logs where action like 'collection%'`)
  ok(Number(n) > 0, '수거 완료가 감사기록에 남음', `${n}건`)
  const v = psql(`select public.app_schema_version()`)
  ok(v === '64', 'DB 버전 64', v)
  const h = tryAs(ADMIN, `select public.app_health_check()->>'ok'`)
  ok(h.ok && h.out === 'true', '자가진단 통과', h.out)
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
