// ─────────────────────────────────────────────────────────────────────────────
// 동시성 · 무결성 검증 (실제 Supabase)
//
//  05~09 는 요청을 하나씩 순서대로 보냅니다. 현장에서 실제로 사고가 나는
//  자리는 그 사이입니다 — 두 사람이 같은 순간에 저장을 누를 때.
//
//   · 기사와 사무실이 같은 일정을 동시에 완료 처리하면?
//   · 두 기사가 각각 재고 4개를 공급하는데 창고에 5개뿐이면?
//   · 되돌리기를 두 번 누르면 재고가 두 번 복구되나?
//
//  사전 검사(select 후 판단)만으로는 이런 것을 막을 수 없습니다. 두 요청이
//  검사를 나란히 통과해 버리기 때문입니다. DB 안의 잠금과 제약이 최종
//  방어선인데, 그것이 실제로 서는지는 동시에 쏴 봐야 알 수 있습니다.
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_FIELD_PW=... TEST_ADMIN_PW=... TEST_CLIENT_PW=...
//    node supabase/test/10_integrity.mjs
//
//  · 만드는 것은 전부 '[검증]' 거래처 아래이고, 끝나면 되돌립니다.
//  · 재고는 검사 전에 값을 찍어 두고 끝에 원래대로 복구합니다.
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const MARK = '[검증]'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`)

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)
const rpc = (token, name, args) =>
  fetch(`${U}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }).then(json)

async function login(email, password) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`로그인 실패 ${email}: ${d.msg ?? d.error_description ?? r.status}`)
  return d.access_token
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const msg = (r) => (typeof r.body === 'object' && r.body?.message) || JSON.stringify(r.body ?? '').slice(0, 120)
/** 사람이 읽을 수 있는 한국어 안내인지 (개발자용 오류 문자열이 그대로 나오면 안 됩니다) */
const humanKorean = (m) => /[가-힣]/.test(m) && !/violates|constraint|duplicate key|null value|syntax/i.test(m)

async function main() {
  console.log('\n════ 동시성 · 무결성 검증 ════')

  const office = await login(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
  const field = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)

  const clients = (await svc(`/clients?select=id,name&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body ?? []
  if (clients.length < 1) { console.error('검증용 거래처가 없습니다. 05_live.mjs --setup 을 먼저 실행하세요.'); process.exit(1) }
  const vehicle = (await svc(`/vehicles?select=id,waste_type&name=like.${encodeURIComponent(MARK + '*')}`)).body?.[0]
  if (!vehicle) { console.error('검증용 차량이 없습니다.'); process.exit(1) }

  const stock0 = (await svc('/office_stock?select=*&id=eq.1')).body[0]
  const restoreStock = async () => {
    await svc('/office_stock?id=eq.1', {
      method: 'PATCH',
      body: JSON.stringify({
        corrugated_box: stock0.corrugated_box, plastic_container: stock0.plastic_container,
        bag: stock0.bag, needle_box: stock0.needle_box,
      }),
    })
  }
  const created = []   // 정리 대상 event_id

  const payload = (over = {}) => ({
    p: {
      scheduleId: '', clientId: clients[0].id, wasteType: vehicle.waste_type, vehicleId: vehicle.id,
      driverName: '검증기사', actualAmount: 12, actualTime: '09:00',
      containers: { box: 1, vinyl: 0, needleBox: 0 }, handoverStatus: '인계 완료',
      supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
      suppliedItems: null, isAdditional: true, memo: `${MARK}동시성검증`,
      screen: 'collection', inputDurationMs: 30000, demoSessionId: null,
      ...over,
    },
  })

  try {
    // ── 1. 같은 일정을 두 사람이 동시에 완료 ────────────────────────────────
    section('1. 같은 일정을 두 사람이 같은 순간에 완료')
    const sch = (await svc('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        date: today(), client_id: clients[0].id, waste_type: vehicle.waste_type,
        vehicle_id: vehicle.id, scheduled_time: '09:00', expected_amount: 12,
        status: '예정', origin: 'seed',
      }),
    })).body?.[0]
    check(!!sch, '검증용 예정 일정 생성')

    const [a, b] = await Promise.all([
      rpc(office, 'complete_collection', payload({ scheduleId: sch.id })),
      rpc(field, 'complete_collection', payload({ scheduleId: sch.id, actualTime: '09:01' })),
    ])
    const wins = [a, b].filter((r) => r.status === 200)
    const loses = [a, b].filter((r) => r.status !== 200)
    check(wins.length === 1, '한 쪽만 저장됨 (동시 완료 차단)', `성공 ${wins.length} · 실패 ${loses.length}`)
    check(loses.length === 1 && humanKorean(msg(loses[0])),
      '실패한 쪽에 사람이 읽을 안내', loses[0] ? msg(loses[0]) : '')
    for (const w of wins) if (w.body?.eventId) created.push(w.body.eventId)

    const after = (await svc(`/schedules?select=status,actual_amount,event_id&id=eq.${sch.id}`)).body?.[0]
    check(after?.status === '완료' && !!after?.event_id, '일정이 완료 상태 + 이벤트 연결', `${after?.status} · ${after?.actual_amount}kg`)
    const evs = (await svc(`/collection_events?select=id&schedule_id=eq.${sch.id}`)).body ?? []
    check(evs.length === 1, '수거 이벤트가 하나만 생성', `${evs.length}건`)

    // ── 2. 같은 날 같은 거래처를 동시에 정규 수거 ──────────────────────────
    section('2. 같은 날 같은 거래처를 동시에 정규 수거')
    const other = clients[1] ?? clients[0]
    // 오늘 정규 수거가 이미 있으면 비워야 하는데, 일정을 직접 지우면 원장이
    // 매달립니다(되돌릴 수 없는 수거가 남습니다). 되돌리기로 정리합니다.
    const done = (await svc(
      `/schedules?select=id,event_id&client_id=eq.${other.id}&date=eq.${today()}` +
      `&status=eq.${encodeURIComponent('완료')}&is_additional=is.false`,
    )).body ?? []
    for (const s2 of done) {
      if (s2.event_id) await rpc(office, 'revert_collection', { p_event_id: s2.event_id })
      else await svc(`/schedules?id=eq.${s2.id}`, { method: 'DELETE' })
    }
    const [c, d] = await Promise.all([
      rpc(office, 'complete_collection', payload({ clientId: other.id, isAdditional: false, actualTime: '11:00' })),
      rpc(field, 'complete_collection', payload({ clientId: other.id, isAdditional: false, actualTime: '11:00' })),
    ])
    const win2 = [c, d].filter((r) => r.status === 200)
    const lose2 = [c, d].filter((r) => r.status !== 200)
    check(win2.length === 1, '정규 수거는 하루 한 건만 저장', `성공 ${win2.length}`)
    check(lose2.length === 1 && humanKorean(msg(lose2[0])),
      '중복 저장 안내가 사람 말로', lose2[0] ? msg(lose2[0]) : '')
    for (const w of win2) if (w.body?.eventId) created.push(w.body.eventId)

    // ── 3. 재고보다 많이 나가는 동시 공급 ──────────────────────────────────
    section('3. 창고에 5개뿐인데 두 사람이 각각 4개를 공급')
    await svc('/office_stock?id=eq.1', {
      method: 'PATCH',
      body: JSON.stringify({ corrugated_box: 5, plastic_container: 5, bag: 5, needle_box: 5 }),
    })
    const supply = (n, t) => payload({
      clientId: clients[0].id, isAdditional: true, actualTime: t,
      supplied: { corrugatedBox: n, plasticContainer: 0, bag: 0, needleBox: 0 },
      suppliedItems: { box63: n },
    })
    const [e, f] = await Promise.all([
      rpc(office, 'complete_collection', supply(4, '13:00')),
      rpc(field, 'complete_collection', supply(4, '13:01')),
    ])
    for (const r of [e, f]) if (r.body?.eventId) created.push(r.body.eventId)
    const stockNow = (await svc('/office_stock?select=*&id=eq.1')).body[0]
    check(stockNow.corrugated_box >= 0, '재고가 음수로 내려가지 않음', `골판지 ${stockNow.corrugated_box}`)
    const okCount = [e, f].filter((r) => r.status === 200).length
    check(okCount === 1, '재고를 넘는 공급은 한 쪽만 통과', `성공 ${okCount}`)
    const failed = [e, f].find((r) => r.status !== 200)
    check(!failed || humanKorean(msg(failed)), '재고 부족 안내가 사람 말로', failed ? msg(failed) : '')

    // ── 4. 되돌리기를 두 번 ────────────────────────────────────────────────
    section('4. 되돌리기를 두 번 눌렀을 때')
    const target = created[created.length - 1]
    if (target) {
      const beforeStock = (await svc('/office_stock?select=*&id=eq.1')).body[0]
      const r1 = await rpc(office, 'revert_collection', { p_event_id: target })
      const midStock = (await svc('/office_stock?select=*&id=eq.1')).body[0]
      const r2 = await rpc(office, 'revert_collection', { p_event_id: target })
      const endStock = (await svc('/office_stock?select=*&id=eq.1')).body[0]
      check(r1.status === 200, '첫 번째 되돌리기 성공', `(${r1.status})`)
      check(r2.status !== 200, '두 번째 되돌리기는 거부', `(${r2.status})`)
      check(r2.status === 200 || humanKorean(msg(r2)), '이미 되돌린 건이라는 안내', msg(r2))
      check(midStock.corrugated_box === endStock.corrugated_box,
        '재고가 두 번 복구되지 않음',
        `${beforeStock.corrugated_box} → ${midStock.corrugated_box} → ${endStock.corrugated_box}`)
      created.pop()
    }

    // ── 5. 값 자체가 말이 안 되는 입력 ─────────────────────────────────────
    section('5. 값이 말이 안 되는 입력')
    const bad = [
      ['수거량 0kg', payload({ actualAmount: 0 })],
      ['수거량 음수', payload({ actualAmount: -5 })],
      ['수거 시간 없음', payload({ actualTime: '' })],
      ['없는 거래처', payload({ clientId: '00000000-0000-0000-0000-000000000000' })],
      ['없는 차량', payload({ vehicleId: '00000000-0000-0000-0000-000000000000' })],
      ['공급 수량 음수', payload({ supplied: { corrugatedBox: -3, plasticContainer: 0, bag: 0, needleBox: 0 } })],
      ['공급 수량 음수 + 양수 혼합', payload({
        supplied: { corrugatedBox: -3, plasticContainer: 2, bag: 0, needleBox: 0 },
        suppliedItems: { plastic20: 2 },
      })],
      ['규격별 수량 음수', payload({
        supplied: { corrugatedBox: 2, plasticContainer: 0, bag: 0, needleBox: 0 },
        suppliedItems: { box63: -2 },
      })],
    ]
    for (const [label, p] of bad) {
      const r = await rpc(office, 'complete_collection', p)
      if (r.status === 200 && r.body?.eventId) created.push(r.body.eventId)
      check(r.status !== 200, `${label} 거부`, `(${r.status}) ${r.status !== 200 ? msg(r).slice(0, 60) : '통과되어 저장됨'}`)
    }

    // 음수가 뚫렸다면 재고가 늘어났을 것입니다 — 그것까지 확인합니다
    const sNeg = (await svc('/office_stock?select=*&id=eq.1')).body[0]
    check(sNeg.corrugated_box <= stock0.corrugated_box,
      '음수 공급으로 재고가 늘어나지 않음',
      `골판지 ${stock0.corrugated_box} → ${sNeg.corrugated_box}`)
    const negMat = (await svc('/materials?select=id&or=(box_count.lt.0,vinyl_count.lt.0,needle_box_count.lt.0)')).body ?? []
    check(negMat.length === 0, '음수 자재 기록이 남지 않음', `${negMat.length}건`)

    // 차량 구분 불일치 — 차량이 한 종류뿐이면 반대 구분으로 시도합니다
    const otherType = vehicle.waste_type === '의료폐기물' ? '일회용기저귀' : '의료폐기물'
    const mism = await rpc(office, 'complete_collection', payload({ wasteType: otherType }))
    if (mism.status === 200 && mism.body?.eventId) created.push(mism.body.eventId)
    check(mism.status !== 200, '차량 구분과 다른 폐기물 거부', `(${mism.status}) ${msg(mism).slice(0, 70)}`)

    // ── 6. 비활성 계정 ─────────────────────────────────────────────────────
    section('6. 비활성 처리된 계정')
    const fieldProfile = (await svc(`/profiles?select=id,active&email=eq.${encodeURIComponent(`field@${DOMAIN}`)}`)).body?.[0]
    await svc(`/profiles?id=eq.${fieldProfile.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
    const blocked = await rpc(field, 'complete_collection', payload({ actualTime: '15:00' }))
    if (blocked.status === 200 && blocked.body?.eventId) created.push(blocked.body.eventId)
    check(blocked.status !== 200, '비활성 계정은 수거 저장 불가', `(${blocked.status}) ${msg(blocked).slice(0, 60)}`)
    const readBlocked = await fetch(`${U}/rest/v1/schedules?select=id&limit=1`, {
      headers: { apikey: A, Authorization: `Bearer ${field}` },
    }).then(json)
    check(!(Array.isArray(readBlocked.body) && readBlocked.body.length), '비활성 계정은 일정 조회도 불가')
    await svc(`/profiles?id=eq.${fieldProfile.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
    const restored = (await svc(`/profiles?select=active&id=eq.${fieldProfile.id}`)).body?.[0]
    check(restored?.active === true, '(복구) 현장 계정 다시 활성화')

    // ── 7. 감사기록이 빠짐없이 남는가 ──────────────────────────────────────
    section('7. 감사기록')
    const audits = (await svc('/audit_logs?select=actor_id,action,at&order=id.desc&limit=40')).body ?? []
    check(audits.every((x) => !!x.actor_id), '최근 감사기록 모두에 실행자', `${audits.length}건 확인`)
    check(audits.some((x) => x.action === 'collection.complete'), '수거 완료가 감사기록에 남음')
    check(audits.some((x) => x.action?.startsWith('collection.revert')), '되돌리기도 감사기록에 남음',
      audits.filter((x) => x.action?.includes('revert')).length + '건')

    // ── 8. 중간만 저장된 상태 ──────────────────────────────────────────────
    section('8. 중간만 저장된 상태가 없는가')
    const orphanSched = (await svc(`/schedules?select=id&status=eq.${encodeURIComponent('완료')}&event_id=is.null`)).body ?? []
    check(orphanSched.length === 0, '완료인데 이벤트가 없는 일정 0건', `${orphanSched.length}건`)
    // collection_events 는 일부러 외래키가 없습니다 — 일정이 지워져도 남아야 하는
    // 감사 원장이기 때문입니다. 그래서 "매달린 참조가 0건"은 불변식이 아닙니다.
    // 지켜져야 하는 것은 이것입니다: 아직 되돌리지 않은 건은 되돌릴 수 있어야 한다.
    const allEvents = (await svc('/collection_events?select=id,schedule_id,reverted')).body ?? []
    const schedIds = new Set(((await svc('/schedules?select=id')).body ?? []).map((x) => x.id))
    const orphanLive = allEvents.filter((e2) => !e2.reverted && e2.schedule_id && !schedIds.has(e2.schedule_id))
    check(orphanLive.length === 0, '되돌리지 않은 수거는 그 일정이 살아 있음', `${orphanLive.length}건`)
    const negStock = (await svc('/office_stock?select=*')).body ?? []
    check(negStock.every((s) => s.corrugated_box >= 0 && s.plastic_container >= 0 && s.bag >= 0 && s.needle_box >= 0),
      '재고 4칸 모두 0 이상')
  } finally {
    // ── 정리 ────────────────────────────────────────────────────────────────
    section('정리')
    let reverted = 0
    for (const ev of created.reverse()) {
      const r = await rpc(office, 'revert_collection', { p_event_id: ev })
      if (r.status === 200) reverted++
    }
    // 일정을 직접 지우면 원장(collection_events)이 매달립니다. 되돌리기가
    // 정리를 맡고, 여기서는 완료로 이어지지 않은 '예정' 일정만 걷어냅니다.
    await svc(`/schedules?memo=like.*${encodeURIComponent('동시성검증')}*&status=eq.${encodeURIComponent('예정')}`, { method: 'DELETE' })
    await restoreStock()
    const s1 = (await svc('/office_stock?select=*&id=eq.1')).body[0]
    const same = ['corrugated_box', 'plastic_container', 'bag', 'needle_box'].every((k) => s1[k] === stock0[k])
    check(same, '재고를 검사 전 값으로 복구',
      `골판지 ${s1.corrugated_box} · 합성수지 ${s1.plastic_container} · 봉투 ${s1.bag} · 바늘통 ${s1.needle_box}`)
    console.log(`  (되돌린 수거 ${reverted}건)`)
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`동시 저장·무결성: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
