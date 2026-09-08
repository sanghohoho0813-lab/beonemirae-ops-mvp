import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { skipIfHidden } from './_pilot.mjs'

//  아직 값이 비어서 못 쓰는 기능 (setupGaps.ts).
//
//   이 목록의 값어치는 **비어 있는 것만 올라오는 데** 있습니다. 다 채운
//   항목까지 계속 떠 있으면 곧 안 보게 되고, 그러면 진짜 빈 칸도 같이
//   안 보입니다.
//
//   확인하는 것
//    · 다 채우면 **아무것도 안 올라오는가**
//    · 「채워 주세요」가 아니라 **지금 무슨 일이 벌어지는지**를 숫자로 적는가
//    · 셀 수 없는 것을 지어내지 않는가
//    · 청구가 없는 거래처까지 사업자정보로 재촉하지 않는가
//    · 돈이 틀릴 수 있는 것이 위로 오는가

const ROOT = '/home/user/beonemirae-ops-mvp'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const dir = mkdtempSync(join(tmpdir(), 'sg-'))
const bundle = join(dir, 'sg.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  join(ROOT, 'src/lib/setupGaps.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { stdio: 'pipe' })
const S = await import(bundle)

const ASOF = '2026-08-16'
const M = (d) => {
  const [y, m] = '2026-08'.split('-').map(Number)
  const t = y * 12 + (m - 1) + d
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

const mkClient = (id, over = {}) => ({
  id, name: `병원${id}`, type: '병원', address: '경기도 남양주시 오남읍 1',
  manager: '원무과', phone: '031-000-0000', collectionCycle: '주 1회',
  collectsMedicalWaste: true, collectsDiaper: false, storageSize: '보통', note: '',
  isDemoGenerated: false, active: true, contractStart: '2025-01-01',
  bizNo: '2568802759', vatMode: 'exclusive',
  pricing: { plastic20: { sale: 9000, cost: 5200 } },
  ...over,
})
const mkPay = (id, clientId) => ({
  id, clientId, billingMonth: M(-1), amount: 1000000, status: '입금완료',
  method: '무통장', paidAt: null, memo: '', canceledAt: null,
})
const mkProd = (id, salePrice) => ({
  id, name: `물건${id}`, spec: '', unit: '개', salePrice, costPrice: 0,
  stockKey: null, available: salePrice > 0, imageUrl: '', description: '',
  sort: 0, active: true, category: '기타',
})

/** 아무것도 안 비어 있는 상태 */
const FULL = {
  clients: [mkClient('c1')],
  payments: [mkPay('p1', 'c1')],
  schedules: [{ id: 's1', date: '2026-08-20', clientId: 'c1', wasteType: '의료폐기물',
    vehicleId: 'v1', scheduledTime: '', status: '예정', expectedAmount: 50,
    actualAmount: null, completedAt: null, memo: '' }],
  holidays: [{ day: '2026-09-28', name: '추석' }],
  products: [mkProd('pr1', 9000)],
  operatingCosts: [M(-1), M(-2), M(-3)].map((m, i) => ({ id: `oc${i}`, month: m, category: '인건비', amount: 1000000, memo: '' })),
  staff: [{ id: 'st1', name: '김준기', position: '현장', wasteScope: '의료폐기물',
    insuredFrom: null, insurance: {}, active: true }],
}
const mk = (over = {}) => ({ ...FULL, ...over })

// ── 1. 다 채우면 아무것도 안 올라온다 ───────────────────────────────────────
//   이게 이 기능의 전부입니다. 다 채웠는데도 뭔가 떠 있으면 사람이 곧
//   목록 자체를 안 보게 됩니다.
{
  const s = S.scanSetupGaps(mk(), ASOF)
  ok(s.gaps.length === 0, '**다 채우면 아무것도 안 올라옴**', s.gaps.map((g) => g.key).join(' '))
  ok(s.moneyCount === 0, '돈 관련 빈 칸 0', String(s.moneyCount))
}

// ── 2. 휴무일 ───────────────────────────────────────────────────────────────
{
  const s = S.scanSetupGaps(mk({ holidays: [] }), ASOF)
  const g = s.gaps.find((x) => x.key === 'holidays')
  ok(g !== undefined, '휴무일이 비면 올라옴')
  ok(/예정이 1건 잡혀 있는데/.test(g.effect), '**위험에 노출된 예정 건수를 셈**', g.effect.slice(0, 60))
  ok(/헛걸음/.test(g.effect), '무슨 일이 벌어지는지 적음')
  //  공휴일이 며칠인지는 **말하지 않습니다** — 넣어 둔 것이 없으니 알 수 없습니다.
  ok(!/공휴일이 \d+일|공휴일 \d+건/.test(g.effect),
    '**공휴일이 며칠인지 지어내지 않음** — 넣어 둔 것이 없으니 알 수 없습니다', g.effect.slice(0, 60))

  //  앞으로 예정이 없으면 재촉하지 않습니다 — 아직 아무 피해가 없습니다.
  const none = S.scanSetupGaps(mk({ holidays: [], schedules: [] }), ASOF)
  ok(!none.gaps.some((x) => x.key === 'holidays'),
    '**앞으로 예정이 없으면 재촉하지 않음** — 아직 아무 피해가 없습니다')
}

// ── 3. 소모품 단가 ──────────────────────────────────────────────────────────
if (!skipIfHidden('supplies', '3. 소모품 단가가 비었다는 알림')) {
  const s = S.scanSetupGaps(mk({ products: [mkProd('a', 0), mkProd('b', 0), mkProd('c', 9000)] }), ASOF)
  const g = s.gaps.find((x) => x.key === 'productPrice')
  ok(g !== undefined && g.weight === '돈', '단가 없는 물건이 있으면 올라옴 (돈)', g?.weight)
  ok(/3가지 중 2가지에 단가가 없습니다/.test(g.effect), '**실제 개수를 셈**', g.effect.slice(0, 50))
  ok(/병원 화면에는 1가지만 뜹니다/.test(g.effect), '병원에 실제로 몇 개 보이는지', g.effect.slice(0, 90))

  //  하나도 안 보이면 그 말을 분명히 합니다 — 병원 눈에는 고장입니다.
  const zero = S.scanSetupGaps(mk({ products: [mkProd('a', 0), mkProd('b', 0)] }), ASOF)
  const gz = zero.gaps.find((x) => x.key === 'productPrice')
  ok(/하나도 안 보입니다/.test(gz.effect), '**하나도 안 보이면 그렇게 말함**', gz.effect.slice(0, 80))
  //  화면에 그대로 나가는 글입니다 — 별표가 섞이면 별표로 보입니다.
  const all = S.scanSetupGaps({
    clients: [mkClient('c1', { bizNo: '', pricing: {}, vatMode: null })],
    payments: [mkPay('p1', 'c1')],
    schedules: [{ id: 's1', date: '2026-08-20', clientId: 'c1', wasteType: '의료폐기물',
      vehicleId: 'v1', scheduledTime: '', status: '예정', expectedAmount: 50,
      actualAmount: null, completedAt: null, memo: '' }],
    holidays: [], products: [mkProd('a', 0)], operatingCosts: [], staff: [],
  }, ASOF)
  ok(all.gaps.every((g) => !g.effect.includes('**') && !g.label.includes('**')),
    '**화면 글에 별표(마크다운)가 안 섞임** — 그대로 별표로 보입니다',
    all.gaps.map((g) => g.effect).filter((e) => e.includes('**')).join(' | ') || '없음')
}

// ── 4. 사업자정보 · 부가세 ──────────────────────────────────────────────────
{
  const s = S.scanSetupGaps(mk({
    clients: [mkClient('c1', { bizNo: '' }), mkClient('c2')],
    payments: [mkPay('p1', 'c1'), mkPay('p2', 'c2')],
  }), ASOF)
  const g = s.gaps.find((x) => x.key === 'bizInfo')
  ok(/청구가 있는 2곳 중 1곳에/.test(g.effect), '청구가 있는 곳만 셈', g.effect.slice(0, 50))
  ok(/홈택스에 손으로 넣게 됩니다/.test(g.effect), '결국 무슨 일이 되는지', g.effect.slice(0, 110))

  //  ⚠ 청구가 없는 거래처는 재촉하지 않습니다 — 세금계산서를 만들 일이
  //    아직 없습니다.
  const noBill = S.scanSetupGaps(mk({
    clients: [mkClient('c1', { bizNo: '' })],
    payments: [],
  }), ASOF)
  ok(!noBill.gaps.some((x) => x.key === 'bizInfo'),
    '**청구가 없는 거래처는 사업자정보로 재촉하지 않음**')

  const v = S.scanSetupGaps(mk({ clients: [mkClient('c1', { vatMode: null })] }), ASOF)
  const gv = v.gaps.find((x) => x.key === 'vatMode')
  ok(gv !== undefined && /임의로 정하지 않고/.test(gv.effect),
    '**부가세를 임의로 정하지 않는다고 밝힘**', gv?.effect.slice(0, 70))
}

// ── 5. 거래처 단가 · 월정액 ─────────────────────────────────────────────────
{
  const s = S.scanSetupGaps(mk({ clients: [mkClient('c1', { pricing: {} })] }), ASOF)
  const g = s.gaps.find((x) => x.key === 'clientPrice')
  ok(g !== undefined && /기본 단가/.test(g.effect), '단가가 없으면 기본 단가로 계산된다고 알려 줌', g?.effect.slice(0, 60))

  //  월정액 계약은 단가가 필요 없습니다 — 재촉하면 영영 지워지지 않습니다.
  const flat = S.scanSetupGaps(mk({
    clients: [mkClient('c1', { pricing: {}, monthlyFlatFee: 9000000 })],
  }), ASOF)
  ok(!flat.gaps.some((x) => x.key === 'clientPrice'),
    '**월정액 계약은 단가로 재촉하지 않음** — 필요 없는 값입니다')
}

// ── 6. 운영비 ───────────────────────────────────────────────────────────────
{
  const s = S.scanSetupGaps(mk({ operatingCosts: [] }), ASOF)
  const g = s.gaps.find((x) => x.key === 'operatingCost')
  ok(/지난 3달 중 3달/.test(g.effect), '몇 달이 비었는지 셈', g.effect.slice(0, 50))
  ok(/5월·6월·7월/.test(g.effect), '**어느 달인지 그대로 적음**', g.effect.slice(0, 60))
  ok(/영업이익이 안 나옵니다/.test(g.effect), '무엇을 못 하게 되는지')
}

// ── 7. 돈이 위 ──────────────────────────────────────────────────────────────
{
  const s = S.scanSetupGaps({
    clients: [mkClient('c1', { bizNo: '', pricing: {} })],
    payments: [mkPay('p1', 'c1')],
    schedules: [{ id: 's1', date: '2026-08-20', clientId: 'c1', wasteType: '의료폐기물',
      vehicleId: 'v1', scheduledTime: '', status: '예정', expectedAmount: 50,
      actualAmount: null, completedAt: null, memo: '' }],
    holidays: [], products: [mkProd('a', 0)], operatingCosts: [], staff: [],
  }, ASOF)
  ok(s.gaps.length >= 5, '여러 개가 한꺼번에 올라옴', `${s.gaps.length}가지`)
  ok(s.gaps[0].weight === '돈', '**돈이 틀릴 수 있는 것이 맨 위**', s.gaps.map((g) => g.weight).join(' '))
  const last = s.gaps[s.gaps.length - 1]
  ok(last.weight === '보조', '보조는 맨 아래', `${last.key}(${last.weight})`)
  ok(s.moneyCount >= 2, '돈 관련이 몇 가지인지 셈', String(s.moneyCount))

  //  전부 「어디서 채우는지」가 있어야 합니다 — 없으면 목록만 보고 끝납니다.
  ok(s.gaps.every((g) => g.to && g.linkLabel), '모두 채우러 갈 곳이 있음',
    s.gaps.map((g) => g.to).join(' '))
  //  전부 숫자가 들어 있어야 합니다 — 「채워 주세요」로 끝나면 안 됩니다.
  ok(s.gaps.filter((g) => g.key !== 'staff').every((g) => /\d/.test(g.effect)),
    '**모두 실제 숫자로 지금 상태를 말함**')
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
