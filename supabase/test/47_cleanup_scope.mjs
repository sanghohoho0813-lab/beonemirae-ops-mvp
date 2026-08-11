// ─────────────────────────────────────────────────────────────────────────────
// 검증 데이터 정리가 실제 운영 데이터를 건드리는가
//
//  실사용을 시작하시면, 대표님은 실제 거래처를 넣은 **뒤에** 검증용 데이터를
//  지우게 됩니다. 그 순간 실제 데이터가 함께 날아가면 되돌릴 방법이 없습니다.
//  (감사기록은 남지만 수거·정산 기록 자체가 사라집니다)
//
//  그래서 "지워도 되는가" 를 말로 하지 않고 실제로 해 봅니다.
//
//   1) 실제 운영처럼 보이는 거래처와 그 기록을 만들어 둡니다
//      (이름에 '[검증]' 을 붙이지 않습니다 — 붙이면 검사가 되지 않습니다)
//   2) 검증용 거래처도 하나 만듭니다
//   3) `05_live.mjs --cleanup` 을 실제로 돌립니다
//   4) 실제 운영 것은 하나도 안 없어졌는지, 검증용만 없어졌는지 확인합니다
//   5) 이 검사가 만든 것은 id 로 정확히 지웁니다
//
//  실행
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=... TEST_CLIENT_PW=...
//    node supabase/test/47_cleanup_scope.mjs
//
//  · 끝나면 05_live.mjs --setup 으로 검증 환경을 되돌립니다.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const U = process.env.SUPABASE_URL
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !S) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.'); process.exit(1) }

const HERE = dirname(fileURLToPath(import.meta.url))
//  이 접두사는 '[검증]' 이 아니므로 cleanup 대상이 아닙니다. 그것이 요점입니다.
const REAL = '[실운영모의]'
const MARK = '[검증]'
const STAMP = Date.now() % 100000

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...(init.headers || {}),
    },
  }).then(json)
const countOf = async (path) => {
  const r = await fetch(`${U}/rest/v1${path}`, {
    headers: { apikey: S, Authorization: `Bearer ${S}`, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number(r.headers.get('content-range')?.split('/')[1] ?? 0)
}
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

async function main() {
  console.log('\n════ 검증 데이터 정리가 실제 운영 데이터를 건드리는가 ════')

  const made = { clients: [], vehicles: [] }
  try {
    // ── 1. 실제 운영처럼 보이는 데이터 ────────────────────────────────
    section('1. 실제 운영 데이터를 만들어 둡니다')
    const realClients = (await svc('/clients', {
      method: 'POST',
      //  여러 건을 한 번에 넣을 때는 **모든 객체의 칸이 같아야** 합니다.
      //  하나에만 있는 칸이 있으면 통째로 400 이 납니다.
      body: JSON.stringify([
        { name: `${REAL}가톨릭성모병원-${STAMP}`, type: '병원', address: '서울 강남구 1', manager: '김실장',
          phone: '02-000-0001', collection_cycle: '주 3회', collects_medical_waste: true,
          collects_diaper: true, storage_size: '보통', payment_terms: '익월20일', payment_due_day: 20 },
        { name: `${REAL}한빛요양원-${STAMP}`, type: '요양원', address: '경기 성남시 2', manager: '이과장',
          phone: '031-000-0002', collection_cycle: '주 2회', collects_medical_waste: true,
          collects_diaper: false, storage_size: '작음', payment_terms: '익월20일', payment_due_day: 20 },
      ]),
    })).body
    if (!Array.isArray(realClients)) {
      no('실운영 거래처를 만들지 못했습니다', JSON.stringify(realClients).slice(0, 160))
      throw new Error('거래처 생성 실패')
    }
    made.clients = realClients.map((c) => c.id)
    check(realClients.length === 2, '실운영 거래처 2곳', realClients.map((c) => c.name.slice(0, 20)).join(' · '))

    const realVeh = (await svc('/vehicles', {
      method: 'POST',
      body: JSON.stringify({ name: `${REAL}1톤 수거차-${STAMP}`, waste_type: '의료폐기물', tonnage: 1,
        nominal_capacity: 1000, expected_capacity: 800, driver: '박기사' }),
    })).body?.[0]
    if (realVeh) made.vehicles.push(realVeh.id)
    check(!!realVeh, '실운영 차량 1대')

    const [c1, c2] = realClients
    await svc('/schedules', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([
        { date: today(), client_id: c1.id, waste_type: '의료폐기물', status: '완료',
          expected_amount: 120, actual_amount: 120, completed_at: `${today()}T09:00:00+09:00`,
          memo: '실운영 수거', origin: 'field', is_additional: false },
        { date: today(), client_id: c2.id, waste_type: '의료폐기물', status: '완료',
          expected_amount: 80, actual_amount: 80, completed_at: `${today()}T11:00:00+09:00`,
          memo: '실운영 수거', origin: 'field', is_additional: false },
      ]),
    })
    await svc('/materials', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ date: today(), client_id: c1.id, box_count: 5, vinyl_count: 10,
        needle_box_count: 2, is_additional_request: false, memo: '실운영 공급', origin: 'field',
        items: { box63: 5, diaperBag40: 10 } }),
    })
    await svc('/payments', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ client_id: c1.id, billing_month: today().slice(0, 7), amount: 114000,
        status: '미수금', method: '무통장', memo: '실운영 청구' }),
    })
    await svc('/site_notes', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ client_id: c1.id, kind: '주의', content: '실운영 메모', done: false }),
    })

    const before = {
      clients: await countOf(`/clients?select=id&name=like.${encodeURIComponent(REAL + '*')}`),
      schedules: await countOf(`/schedules?select=id&client_id=in.(${c1.id},${c2.id})`),
      materials: await countOf(`/materials?select=id&client_id=eq.${c1.id}`),
      payments: await countOf(`/payments?select=id&client_id=eq.${c1.id}`),
      notes: await countOf(`/site_notes?select=id&client_id=eq.${c1.id}`),
      vehicles: await countOf(`/vehicles?select=id&name=like.${encodeURIComponent(REAL + '*')}`),
      stock: (await svc('/office_stock?select=*&id=eq.1')).body?.[0],
      audit: await countOf('/audit_logs?select=id'),
      profiles: await countOf('/profiles?select=id'),
    }
    check(before.schedules === 2 && before.materials === 1 && before.payments === 1 && before.notes === 1,
      '실운영 기록을 붙여 둠',
      `수거 ${before.schedules} · 자재 ${before.materials} · 청구 ${before.payments} · 메모 ${before.notes}`)

    // ── 2. 검증용 데이터도 있는 상태 ──────────────────────────────────
    section('2. 검증용 데이터도 함께 있는 상태')
    const vCount = await countOf(`/clients?select=id&name=like.${encodeURIComponent(MARK + '*')}`)
    check(vCount > 0, '검증용 거래처가 있음 (지워질 대상)', `${vCount}곳`)

    // ── 3. 실제로 정리를 돌립니다 ─────────────────────────────────────
    section('3. 05_live.mjs --cleanup 을 실제로 실행')
    let out = ''
    try {
      out = execFileSync(process.execPath, [join(HERE, '05_live.mjs'), '--cleanup'], {
        encoding: 'utf8', env: process.env, timeout: 300000,
      })
    } catch (e) {
      out = String(e.stdout ?? '') + String(e.stderr ?? '')
    }
    console.log('   ' + out.trim().split('\n').slice(-3).join('\n   '))

    // ── 4. 실운영 데이터가 그대로인가 (가장 중요) ─────────────────────
    section('4. 실제 운영 데이터가 그대로인가')
    const after = {
      clients: await countOf(`/clients?select=id&name=like.${encodeURIComponent(REAL + '*')}`),
      schedules: await countOf(`/schedules?select=id&client_id=in.(${c1.id},${c2.id})`),
      materials: await countOf(`/materials?select=id&client_id=eq.${c1.id}`),
      payments: await countOf(`/payments?select=id&client_id=eq.${c1.id}`),
      notes: await countOf(`/site_notes?select=id&client_id=eq.${c1.id}`),
      vehicles: await countOf(`/vehicles?select=id&name=like.${encodeURIComponent(REAL + '*')}`),
      stock: (await svc('/office_stock?select=*&id=eq.1')).body?.[0],
      audit: await countOf('/audit_logs?select=id'),
      profiles: await countOf('/profiles?select=id'),
    }
    check(after.clients === before.clients, '실운영 거래처가 그대로', `${before.clients} → ${after.clients}곳`)
    check(after.schedules === before.schedules, '실운영 수거 기록이 그대로', `${before.schedules} → ${after.schedules}건`)
    check(after.materials === before.materials, '실운영 자재 기록이 그대로', `${before.materials} → ${after.materials}건`)
    check(after.payments === before.payments, '실운영 청구가 그대로', `${before.payments} → ${after.payments}건`)
    check(after.notes === before.notes, '실운영 메모가 그대로', `${before.notes} → ${after.notes}건`)
    check(after.vehicles === before.vehicles, '실운영 차량이 그대로', `${before.vehicles} → ${after.vehicles}대`)
    check(
      after.stock?.corrugated_box === before.stock?.corrugated_box &&
      after.stock?.plastic_container === before.stock?.plastic_container &&
      after.stock?.bag === before.stock?.bag &&
      after.stock?.needle_box === before.stock?.needle_box,
      '사무실 재고가 그대로',
      `박스 ${after.stock?.corrugated_box} · 합성수지 ${after.stock?.plastic_container}`,
    )
    check(after.audit >= before.audit, '감사기록이 지워지지 않음', `${before.audit} → ${after.audit}건`)
    check(after.profiles === before.profiles, '계정 수가 그대로', `${before.profiles} → ${after.profiles}개`)

    // ── 5. 검증용은 정말 없어졌는가 ───────────────────────────────────
    section('5. 검증용 데이터는 없어졌는가')
    const leftV = await countOf(`/clients?select=id&name=like.${encodeURIComponent(MARK + '*')}`)
    check(leftV === 0, '검증용 거래처가 남지 않음', `${leftV}곳`)
    const leftVeh = await countOf(`/vehicles?select=id&name=like.${encodeURIComponent(MARK + '*')}`)
    check(leftVeh === 0, '검증용 차량이 남지 않음', `${leftVeh}대`)
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    // ── 정리 ────────────────────────────────────────────────────────────
    section('정리 — 이 검사가 만든 것만 id 로 지웁니다')
    for (const id of made.clients) {
      for (const p of ['/site_notes', '/payments', '/materials', '/schedules', '/collection_events', '/client_requests', '/sales_leads']) {
        await svc(`${p}?client_id=eq.${id}`, { method: 'DELETE' })
      }
      await svc(`/clients?id=eq.${id}`, { method: 'DELETE' })
    }
    for (const id of made.vehicles) await svc(`/vehicles?id=eq.${id}`, { method: 'DELETE' })
    const left = await countOf(`/clients?select=id&name=like.${encodeURIComponent(REAL + '*')}`)
    check(left === 0, '검사가 만든 실운영 모의 데이터를 지움', `${left}곳 남음`)

    //  검증 환경을 되돌려 놓습니다 (뒤에 오는 검사들이 [검증] 거래처를 씁니다)
    try {
      execFileSync(process.execPath, [join(HERE, '05_live.mjs'), '--setup'], {
        encoding: 'utf8', env: process.env, timeout: 300000,
      })
      const back = await countOf(`/clients?select=id&name=like.${encodeURIComponent(MARK + '*')}`)
      check(back > 0, '검증 환경을 되돌림 (--setup)', `${back}곳`)
    } catch (e) {
      no('검증 환경 복구 실패 — 05_live.mjs --setup 을 직접 실행해 주세요', String(e?.message ?? e).slice(0, 120))
    }

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`정리가 실데이터를 건드리지 않음: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
