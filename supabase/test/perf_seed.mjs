// ─────────────────────────────────────────────────────────────────────────────
// 실사용 규모 만들기 / 지우기 (성능 측정용)
//
//  지금 실사용 DB 에는 검증용 거래처 2곳뿐입니다. 그 상태에서 "빠르다" 고
//  말하는 것은 아무 의미가 없습니다. 실제로 쓰실 규모 — 거래처 18곳에
//  6개월치 수거·자재·청구 — 를 만들어 놓고 재야 합니다.
//
//    node supabase/test/perf_seed.mjs --make     만들기
//    node supabase/test/perf_seed.mjs --drop     지우기
//    node supabase/test/perf_seed.mjs --count    지금 몇 건인지
//
//  만드는 것에는 모두 '[성능]' 이 붙고 --drop 이 그것만 지웁니다.
//  실제 운영 데이터와 섞이지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !S) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.'); process.exit(1) }

const MARK = '[성능]'
const CLIENTS = 18
const WEEKS = 26          // 6개월
const PER_WEEK = 3        // 주 3회 수거

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

const TYPES = ['요양병원', '병원', '의원', '치과', '한의원']
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

async function make() {
  const start = addDays(today(), -WEEKS * 7)
  console.log(`거래처 ${CLIENTS}곳 · ${start} ~ ${today()} (${WEEKS}주) 만듭니다…`)

  const vehicle = (await svc('/vehicles?select=id&limit=1')).body?.[0]?.id ?? null

  const clientRows = Array.from({ length: CLIENTS }, (_, i) => ({
    name: `${MARK}${String(i + 1).padStart(2, '0')}번요양병원`,
    type: TYPES[i % TYPES.length],
    address: `경기도 남양주시 성능로 ${i + 1}`,
    manager: `담당자${i + 1}`,
    phone: `031-000-${String(1000 + i)}`,
    collection_cycle: '주 3회',
    collects_medical_waste: true,
    collects_diaper: i % 3 !== 0,
    storage_size: '보통',
    contract_start: start,
    payment_terms: '익월20일',
    payment_due_day: 20,
  }))
  const made = (await svc('/clients', { method: 'POST', body: JSON.stringify(clientRows) })).body ?? []
  console.log(`  거래처 ${made.length}곳`)

  const schedules = []
  const materials = []
  const payments = []
  for (const c of made) {
    const months = new Map()
    for (let w = 0; w < WEEKS; w++) {
      for (let k = 0; k < PER_WEEK; k++) {
        const date = addDays(start, w * 7 + k * 2)
        if (date > today()) continue
        const kg = 300 + ((w * 7 + k) % 120) * 5
        schedules.push({
          date, client_id: c.id, waste_type: '의료폐기물', vehicle_id: vehicle,
          scheduled_time: '09:00', status: '완료', expected_amount: kg, actual_amount: kg,
          completed_at: `${date}T09:30:00+09:00`, memo: `${MARK}수거`, origin: 'migrated',
          is_additional: false, actual_time: '09:30', driver_name: '기사',
          containers: { corrugated: 3, plastic: 2, bag: 1, etc: 0 },
          handover_status: '수거 완료',
        })
        if (k === 0) {
          materials.push({
            date, client_id: c.id, box_count: 12, vinyl_count: 20, needle_box_count: 3,
            is_additional_request: false, memo: `${MARK}공급`, origin: 'migrated',
            items: { box63: 6, box12: 6, plastic20: 3, diaperBag40: 20 },
          })
        }
        const m = date.slice(0, 7)
        months.set(m, (months.get(m) ?? 0) + kg * 950)
      }
    }
    for (const [m, amount] of months) {
      payments.push({
        client_id: c.id, billing_month: m, amount: Math.round(amount),
        status: m === today().slice(0, 7) ? '미수금' : '입금완료',
        method: '무통장', memo: `${MARK}청구`,  // 무통장/카드요청/기타 만 허용됩니다
        paid_at: m === today().slice(0, 7) ? null : `${m}-25T10:00:00+09:00`,
      })
    }
  }

  const chunk = async (path, rows, label) => {
    let n = 0
    for (let i = 0; i < rows.length; i += 400) {
      const part = rows.slice(i, i + 400)
      const r = await svc(path, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(part) })
      if (r.status >= 300) { console.error(`  ${label} 실패 ${r.status}`, JSON.stringify(r.body).slice(0, 200)); break }
      n += part.length
      process.stdout.write(`\r  ${label} ${n}/${rows.length}`)
    }
    console.log()
  }
  await chunk('/schedules', schedules, '수거')
  await chunk('/materials', materials, '자재')
  await chunk('/payments', payments, '청구')
  await count()
}

async function drop() {
  const ids = ((await svc(`/clients?select=id&name=like.${encodeURIComponent(MARK + '*')}`)).body ?? []).map((c) => c.id)
  console.log(`거래처 ${ids.length}곳 · 딸린 기록을 지웁니다…`)
  for (const id of ids) {
    await svc(`/payments?client_id=eq.${id}`, { method: 'DELETE' })
    await svc(`/materials?client_id=eq.${id}`, { method: 'DELETE' })
    await svc(`/schedules?client_id=eq.${id}`, { method: 'DELETE' })
    await svc(`/clients?id=eq.${id}`, { method: 'DELETE' })
  }
  await count()
}

async function count() {
  const c = await countOf(`/clients?select=id&name=like.${encodeURIComponent(MARK + '*')}`)
  console.log(
    `  거래처 ${await countOf('/clients?select=id')}곳 (성능용 ${c}) ·`,
    `수거 ${await countOf('/schedules?select=id')} ·`,
    `자재 ${await countOf('/materials?select=id')} ·`,
    `청구 ${await countOf('/payments?select=id')} ·`,
    `수거이벤트 ${await countOf('/collection_events?select=id')}`,
  )
}

/** 이미 만들어 둔 [성능] 거래처에 청구만 채웁니다 */
async function pay() {
  const made = (await svc(`/clients?select=id&name=like.${encodeURIComponent(MARK + '*')}`)).body ?? []
  const rows = []
  for (const c of made) {
    const sch = (await svc(`/schedules?select=date,actual_amount&client_id=eq.${c.id}&limit=1000`)).body ?? []
    const months = new Map()
    for (const s2 of sch) {
      const m = s2.date.slice(0, 7)
      months.set(m, (months.get(m) ?? 0) + (s2.actual_amount ?? 0) * 950)
    }
    for (const [m, amount] of months) {
      rows.push({
        client_id: c.id, billing_month: m, amount: Math.round(amount),
        status: m === today().slice(0, 7) ? '미수금' : '입금완료',
        method: '무통장', memo: `${MARK}청구`,
        paid_at: m === today().slice(0, 7) ? null : `${m}-25T10:00:00+09:00`,
      })
    }
  }
  for (let i = 0; i < rows.length; i += 400) {
    const r = await svc('/payments', {
      method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows.slice(i, i + 400)),
    })
    if (r.status >= 300) { console.error('청구 실패', r.status, JSON.stringify(r.body).slice(0, 200)); break }
  }
  console.log(`  청구 ${rows.length}건`)
  await count()
}

const mode = process.argv[2] ?? '--count'
if (mode === '--make') await make()
else if (mode === '--pay') await pay()
else if (mode === '--drop') await drop()
else await count()
