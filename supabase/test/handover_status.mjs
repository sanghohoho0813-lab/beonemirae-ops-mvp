// ─────────────────────────────────────────────────────────────────────────────
// 실운영 전환 상태 — 지금 무엇이 남아 있고 무엇을 정리해야 하는가
//
//  읽기만 합니다. 아무것도 만들지 않고 아무것도 지우지 않습니다.
//  실사용을 시작하기 전에 한 번, 그리고 정리한 뒤에 한 번 더 돌려서
//  「정리할 것 없음」 이 나오는지 보면 됩니다.
//
//  실행
//    export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//    node supabase/test/handover_status.mjs
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !S) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const MARK = '[검증]'
//  실제로 존재할 수 없는 도메인입니다(RFC 2606). 검증·리허설 계정은 전부
//  여기에 두고, 운영 계정은 회사 도메인을 씁니다 — 그러면 섞일 수가 없습니다.
const TEST_DOMAINS = ['beonemirae.test', 'example.com', 'test.com']

const g = async (p) =>
  (await fetch(`${U}/rest/v1/${p}`, { headers: { apikey: S, Authorization: `Bearer ${S}` } })).json()

const isTestEmail = (e) => TEST_DOMAINS.some((d) => (e ?? '').toLowerCase().endsWith('@' + d))
const line = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`)

const ROLE_KO = { admin: '관리자', office: '사무실', field: '현장', client: '병원' }

const todo = []

console.log('\n════ 실운영 전환 상태 ════')

// ── 계정 ─────────────────────────────────────────────────────────────────────
line('계정')
const profiles = await g('profiles?select=id,email,name,role,active,client_id&order=role,email')
const testAccts = profiles.filter((p) => isTestEmail(p.email))
const realAccts = profiles.filter((p) => !isTestEmail(p.email))
const realAdmins = realAccts.filter((p) => p.role === 'admin' && p.active)

for (const p of profiles) {
  const kind = isTestEmail(p.email) ? '검증' : '운영'
  console.log(`  [${kind}] ${p.email.padEnd(30)} ${(ROLE_KO[p.role] ?? p.role).padEnd(4)} ${p.active ? '사용중' : '중지 '} ${p.name}`)
}
console.log(`  → 운영 ${realAccts.length}개 · 검증 ${testAccts.length}개`)

if (realAdmins.length < 2) {
  todo.push(`운영 관리자를 ${2 - realAdmins.length}명 더 만드세요 (현재 ${realAdmins.length}명 — 2명 이상이어야 잠기지 않습니다)`)
}
const badClient = profiles.filter((p) => p.role === 'client' && !p.client_id)
for (const p of badClient) todo.push(`병원 계정에 소속 거래처가 없습니다: ${p.email}`)
//  --cleanup 은 병원 계정의 소속이 사라지면 역할을 field 로 되돌립니다.
//  그 흔적이 남아 있으면 사람 눈에는 병원 계정처럼 보여 헷갈립니다.
const looksHospital = profiles.filter((p) => p.role === 'field' && /병원|요양|의원/.test(p.name ?? ''))
for (const p of looksHospital) {
  todo.push(`이름은 병원인데 역할이 현장입니다 — 정리 흔적으로 보입니다: ${p.email} (${p.name})`)
}
if (testAccts.length && realAdmins.length >= 2) {
  todo.push(`검증 계정 ${testAccts.length}개를 지우세요 (운영 관리자 ${realAdmins.length}명이 있으므로 안전합니다): ` +
    testAccts.map((p) => p.email).join(', '))
} else if (testAccts.length) {
  todo.push(`검증 계정 ${testAccts.length}개가 남아 있습니다 — 운영 관리자 2명을 먼저 만든 뒤에 지우세요`)
}

// ── 거래처 · 차량 ────────────────────────────────────────────────────────────
line('거래처')
const clients = await g('clients?select=id,name,active&order=name')
for (const c of clients) console.log(`  [${c.name.startsWith(MARK) ? '검증' : '운영'}] ${c.name}${c.active ? '' : ' (중지)'}`)
const testClients = clients.filter((c) => c.name.startsWith(MARK))
const realClients = clients.filter((c) => !c.name.startsWith(MARK))
console.log(`  → 운영 ${realClients.length}곳 · 검증 ${testClients.length}곳`)
if (!realClients.length) todo.push('운영 거래처가 아직 하나도 없습니다 — 실제 병원을 먼저 등록하세요')
if (testClients.length) {
  todo.push(`검증 거래처 ${testClients.length}곳을 정리하세요: ${testClients.map((c) => c.name).join(', ')}`)
}

line('차량')
const vehicles = await g('vehicles?select=id,name,active&order=name')
for (const v of vehicles) console.log(`  [${v.name.startsWith(MARK) ? '검증' : '운영'}] ${v.name}${v.active ? '' : ' (중지)'}`)
const testVehicles = vehicles.filter((v) => v.name.startsWith(MARK))
const realVehicles = vehicles.filter((v) => !v.name.startsWith(MARK))
console.log(`  → 운영 ${realVehicles.length}대 · 검증 ${testVehicles.length}대`)
if (!realVehicles.length) todo.push('운영 차량이 아직 없습니다 — 차량이 없으면 수거 저장 버튼이 잠깁니다')
if (testVehicles.length) {
  todo.push(`검증 차량 ${testVehicles.length}대를 정리하세요: ${testVehicles.map((v) => v.name).join(', ')}`)
}

// ── 검증 거래처에 딸린 기록 ──────────────────────────────────────────────────
line('검증 거래처에 딸린 기록 (정리하면 함께 사라집니다)')
if (!testClients.length) {
  console.log('  없음')
} else {
  const ids = testClients.map((c) => c.id)
  const inList = `in.(${ids.join(',')})`
  for (const [t, label] of [
    ['schedules', '수거일정'], ['materials', '자재공급'], ['payments', '청구·입금'],
    ['client_requests', '병원 요청'], ['site_notes', '현장 메모'], ['sales_leads', '제안'],
  ]) {
    const rows = await g(`${t}?select=id&client_id=${inList}`)
    console.log(`  ${label.padEnd(10)} ${Array.isArray(rows) ? rows.length : 0}건`)
  }
}

// ── 정리 목록 ────────────────────────────────────────────────────────────────
line('실사용 시작 전에 해야 할 것')
if (!todo.length) {
  console.log('  정리할 것 없음 — 실사용을 시작해도 됩니다.')
} else {
  todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`))
}
console.log(`\n실운영 준비: ${todo.length ? `${todo.length}가지 남음` : 'READY'}\n`)
