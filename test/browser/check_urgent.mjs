import { execFileSync } from 'node:child_process'

//  긴급 전화가 오기 전에 알아채는가 (urgentRisk).
//
//   이 계산이 헐거우면 두 가지로 죽습니다.
//    ① 너무 많이 뜨면 → 매일 같은 줄이 떠 있고 사람은 곧 안 봅니다
//    ② 근거를 지어내면 → 「간격 7일」이 사실이 아닌데 그 위에서 판단합니다
//
//   확인하는 것
//    · 급한 요청 2건 미만은 신호가 아님
//    · 90일 밖 요청은 안 셈
//    · 방문 간격은 **중앙값**이고, 기록이 모자라면 **만들지 않음(null)**
//    · 다음 방문이 제때 잡혀 있으면 「지금 할 일」이 아님
//    · 앞으로 방문이 없는 곳이 제일 위
//    · 그만둔 거래처는 아예 안 봄

const SRC = '/home/user/beonemirae-ops-mvp/src/lib/urgentRisk.ts'
const OUT = `${process.env.TEST_OUT ?? '/tmp'}/.urgent.mjs`
execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
  [SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${OUT}`], { stdio: 'pipe' })
const U = await import(`${OUT}?v=${process.pid}`)

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}

const NOW = '2026-08-17'
const day = (n) => {
  const t = new Date(Date.UTC(2026, 7, 17))
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

const client = (id, name) => ({
  id, name, type: '병원', address: '', manager: '', phone: '',
  collectionCycle: '주 1회', collectsMedicalWaste: true, collectsDiaper: false,
  storageSize: '보통', note: '', active: true, pricing: {},
  paymentDueDay: 20, paymentTerms: '', vatMode: '포함', bizNo: '',
  contractStart: null, contractEnd: null, createdAt: '', updatedAt: '',
})
const req = (id, cid, kind, dayOffset) => ({
  id, clientId: cid, clientName: '', kind, content: '', desiredDate: null,
  urgent: kind === '긴급수거', status: '접수', source: 'portal', requesterName: '',
  reply: '', handledBy: null, handledAt: null, createdAt: `${day(dayOffset)}T09:00:00Z`,
})
const done = (id, cid, dayOffset) => ({
  id, date: day(dayOffset), clientId: cid, wasteType: '의료폐기물', vehicleId: 'v1',
  scheduledTime: '09:00', status: '완료', expectedAmount: 100, actualAmount: 100,
  completedAt: `${day(dayOffset)}T10:00:00Z`, memo: '', origin: 'field',
})
const planned = (id, cid, dayOffset) => ({
  id, date: day(dayOffset), clientId: cid, wasteType: '의료폐기물', vehicleId: 'v1',
  scheduledTime: '09:00', status: '예정', expectedAmount: 100, actualAmount: null,
  completedAt: null, memo: '', origin: 'system',
})

const empty = { vehicles: [], materials: [], payments: [], officeStock: {}, notes: [], events: [] }
/** 7일 간격으로 다녀온 기록 — 간격 중앙값 7일이 나와야 합니다 */
const weekly = (cid, n = 10) => Array.from({ length: n }, (_, i) => done(`${cid}-d${i}`, cid, -7 * (n - i)))

// ── 1. 급한 요청 2건 미만은 신호가 아니다 ──────────────────────────────────
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: weekly('c1'),
    requests: [req('r1', 'c1', '긴급수거', -10)],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks.length === 0, '**한 번 온 요청은 신호가 아님** (매번 뜨면 아무도 안 봅니다)', `${risks.length}곳`)
}

// ── 2. 90일 밖 요청은 세지 않는다 ───────────────────────────────────────────
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: weekly('c1'),
    requests: [
      req('r1', 'c1', '긴급수거', -95),
      req('r2', 'c1', '긴급수거', -120),
      req('r3', 'c1', '추가수거', -10),
    ],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks.length === 0, '**90일 밖은 안 셈** (남은 1건은 신호가 아님)', `${risks.length}곳`)
}

// ── 3. 반복되고 앞이 비어 있으면 잡힌다 ─────────────────────────────────────
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: weekly('c1'),                 // 앞으로 잡힌 방문이 없습니다
    requests: [
      req('r1', 'c1', '긴급수거', -30),
      req('r2', 'c1', '긴급수거', -12),
      req('r3', 'c1', '추가수거', -3),
    ],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks.length === 1, '반복되는 곳이 잡힘', `${risks.length}곳`)
  const r = risks[0]
  ok(r.requests === 3, '급한 요청 3건', `${r.requests}건`)
  ok(r.urgentRequests === 2, '그중 긴급 2건', `${r.urgentRequests}건`)
  ok(r.medianGap === 7, '**실제 방문 간격 중앙값 7일**', `${r.medianGap}일`)
  ok(r.noNextVisit === true, '**앞으로 잡힌 방문이 없음**')
  ok(r.nextVisit === null && r.nextInDays === null, '없는 날짜를 지어내지 않음',
    `${r.nextVisit} / ${r.nextInDays}`)
  ok(r.level === '반복', '「반복」으로 봄', r.level)
  ok(/급한 요청 3건/.test(r.reason) && /간격 7일/.test(r.reason) && /잡힌 방문 없음/.test(r.reason),
    '**근거를 문장으로 그대로 적음**', r.reason)
  ok(U.urgentActionable(risks).length === 1, '지금 손대야 할 곳으로 셈')
}

// ── 4. 다음 방문이 제때 잡혀 있으면 지금 할 일이 아니다 ─────────────────────
//
//   요청이 잦았어도 사흘 뒤에 갈 예정이면 오늘 할 일이 없습니다.
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: [...weekly('c1'), planned('p1', 'c1', 3)],
    requests: [
      req('r1', 'c1', '긴급수거', -30),
      req('r2', 'c1', '긴급수거', -12),
      req('r3', 'c1', '추가수거', -3),
    ],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks.length === 1, '목록에는 남음 (이력은 사실이니까)', `${risks.length}곳`)
  ok(risks[0].nextInDays === 3, '다음 방문 3일 뒤', `${risks[0].nextInDays}일`)
  ok(risks[0].gapAhead === false, '평소 간격(7일)보다 멀지 않음')
  ok(U.urgentActionable(risks).length === 0,
    '**지금 손댈 것으로는 안 띄움** (매일 같은 줄이 떠 있으면 안 봅니다)')
}

// ── 5. 다음 방문이 평소보다 훨씬 멀면 잡는다 ────────────────────────────────
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: [...weekly('c1'), planned('p1', 'c1', 13)],   // 7일 × 1.5 = 10.5 < 13
    requests: [
      req('r1', 'c1', '긴급수거', -30),
      req('r2', 'c1', '추가수거', -3),
    ],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks[0].gapAhead === true, '**평소 7일인데 다음이 13일 뒤 — 그 사이에 전화가 옵니다**',
    `${risks[0].nextInDays}일`)
  ok(U.urgentActionable(risks).length === 1, '지금 손대야 할 곳으로 셈')
}

// ── 6. 간격을 모르면 「멀다」고 말하지 않는다 ────────────────────────────────
//
//   ⚠ 여기가 제일 조용한 위험입니다. 방문이 두 번뿐이면 간격은 존재하지
//   않는데, 억지로 값을 만들면 그 위의 판단이 전부 흔들립니다.
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: [done('d1', 'c1', -20), done('d2', 'c1', -10), planned('p1', 'c1', 60)],
    requests: [
      req('r1', 'c1', '긴급수거', -9),
      req('r2', 'c1', '긴급수거', -2),
    ],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks[0].medianGap === null, '**기록이 모자라면 간격을 만들지 않음(null)**', `${risks[0].medianGap}`)
  ok(risks[0].gapAhead === false,
    '**모르는 것을 「멀다」고 하지 않음** (60일 뒤인데도)', `${risks[0].nextInDays}일`)
  ok(/기록이 모자라/.test(risks[0].reason), '왜 계산 안 했는지 적음', risks[0].reason)
  ok(U.urgentActionable(risks).length === 0, '지금 손댈 것으로 안 띄움')
}

// ── 7. 소모품·교육 요청은 긴급 신호가 아니다 ────────────────────────────────
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: weekly('c1'),
    requests: [
      req('r1', 'c1', '소모품', -10),
      req('r2', 'c1', '소모품', -5),
      req('r3', 'c1', '교육·자료', -3),
      req('r4', 'c1', '기타', -2),
    ],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks.length === 0, '**물건 달라는 요청은 긴급 신호가 아님**', `${risks.length}곳`)
}

// ── 8. 그만둔 거래처는 보지 않는다 ──────────────────────────────────────────
{
  const data = {
    ...empty, clients: [], retiredClients: [client('c1', '문닫은의원')],
    schedules: weekly('c1'),
    requests: [req('r1', 'c1', '긴급수거', -20), req('r2', 'c1', '긴급수거', -5)],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks.length === 0, '**이제 갈 일이 없는 곳은 안 띄움**', `${risks.length}곳`)
}

// ── 9. 급한 순서 — 앞이 빈 곳이 제일 위 ─────────────────────────────────────
{
  const data = {
    ...empty,
    clients: [client('c1', '앞이빈곳'), client('c2', '멀리잡힌곳'), client('c3', '제때잡힌곳')],
    schedules: [
      ...weekly('c1'),
      ...weekly('c2'), planned('p2', 'c2', 13),
      ...weekly('c3'), planned('p3', 'c3', 2),
    ],
    requests: [
      req('a1', 'c1', '긴급수거', -20), req('a2', 'c1', '추가수거', -5),
      req('b1', 'c2', '긴급수거', -20), req('b2', 'c2', '긴급수거', -5), req('b3', 'c2', '추가수거', -2),
      req('c1x', 'c3', '긴급수거', -20), req('c2x', 'c3', '긴급수거', -5),
      req('c3x', 'c3', '추가수거', -3), req('c4x', 'c3', '추가수거', -1),
    ],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks.length === 3, '세 곳 다 목록에 있음', `${risks.length}곳`)
  ok(risks[0].clientName === '앞이빈곳', '**앞으로 방문이 없는 곳이 맨 위**', risks.map((r) => r.clientName).join(' > '))
  ok(risks[1].clientName === '멀리잡힌곳', '그다음이 다음 방문이 먼 곳')
  //  요청이 제일 많은 곳(4건)이라도 제때 잡혀 있으면 아래로 갑니다.
  ok(risks[2].clientName === '제때잡힌곳' && risks[2].requests === 4,
    '**요청이 제일 많아도 제때 잡혀 있으면 아래**', `${risks[2].requests}건`)
  ok(U.urgentActionable(risks).map((r) => r.clientName).join(',') === '앞이빈곳,멀리잡힌곳',
    '지금 손댈 곳은 둘', U.urgentActionable(risks).map((r) => r.clientName).join(','))
}

// ── 10. 오늘 잡힌 방문은 「앞으로」에 든다 ───────────────────────────────────
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: [...weekly('c1'), planned('p1', 'c1', 0)],
    requests: [req('r1', 'c1', '긴급수거', -20), req('r2', 'c1', '추가수거', -5)],
  }
  const risks = U.urgentRisks(data, NOW)
  ok(risks[0].noNextVisit === false && risks[0].nextInDays === 0,
    '**오늘 방문이 잡혀 있으면 빈 것이 아님**', `${risks[0].nextInDays}일`)
  ok(/오늘/.test(risks[0].reason), '근거에 「오늘」이라고 적힘', risks[0].reason)
}

// ── 11. 점수를 매기지 않는다 ────────────────────────────────────────────────
//
//   등급은 「반복 / 한 번」 둘뿐이고, 잘했다/못했다는 어디에도 없습니다.
{
  const data = {
    ...empty, clients: [client('c1', '가나요양병원')],
    schedules: weekly('c1'),
    requests: [req('r1', 'c1', '추가수거', -20), req('r2', 'c1', '추가수거', -5)],
  }
  const r = U.urgentRisks(data, NOW)[0]
  ok(r.level === '한 번', '긴급 없이 추가만 2건이면 「한 번」', r.level)
  ok(!/점수|등급|나쁨|불량|미흡/.test(r.reason), '**사람을 평가하는 말이 없음**', r.reason)
  ok(!('score' in r) && !('grade' in r), '점수 칸 자체가 없음')
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
