// ─────────────────────────────────────────────────────────────────────────────
// 국세청에 신고한 매출 — 전년 동기 대비
//
//  이 시스템에 쌓인 매출과 **다른 숫자**입니다. 신고 자료는 회사가 실제로
//  국가에 낸 값이라 대표님이 믿는 기준이고, 은행·투자·세무 대화에서 그대로
//  쓰입니다. 여기 넣어 두면 「작년 같은 반기보다 얼마나 늘었나」에 답할 수
//  있습니다 — 지금까지는 증명서를 다시 뽑아 손으로 비교했습니다.
//
//  반기(1~6월 / 7~12월)끼리만 비교합니다. 상반기와 하반기를 맞대면 계절과
//  계약 시점이 섞여 「늘었다/줄었다」가 뜻을 잃습니다.
//
//  ⚠ 면세분이 큰 데는 이유가 있습니다 — 의료폐기물 수집·운반은 면세입니다.
//    그래서 계 = 과세분 + 면세분 이고, 셋을 따로 봅니다. 「과세분만 매출」로
//    읽으면 회사 규모를 실제의 4분의 1로 보게 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 국세청 부가가치세 과세표준 한 줄 (반기) */
export interface TaxFiling {
  id: number
  /** 과세기간 시작 (YYYY-MM-DD) */
  periodFrom: string
  /** 과세기간 종료 (YYYY-MM-DD) */
  periodTo: string
  /** 매출과세표준 계 */
  baseTotal: number
  /** 과세분 */
  baseTaxed: number
  /** 면세분 — 의료폐기물 수집·운반 */
  baseExempt: number
  /** 납부할 세액 (음수 = 환급받을 세액) */
  taxPayable: number
  /** 증명 발급번호 */
  sourceNo: string
  /** 증명 발급일 */
  issuedOn: string | null
  note: string
  /**
   * 사람이 「이 값은 확정 신고분이 맞다」고 확인한 시각 (0050).
   *
   *  null 이면 아직 아무도 확인하지 않은 것입니다. **날짜만 보고
   *  확정이라고 단정하지 않습니다** — 종이만으로는 알 수 없고,
   *  아는 사람은 대표님뿐입니다.
   */
  confirmedAt?: string | null
}

export interface HalfYear {
  year: number
  /** 1 = 상반기(1~6월) · 2 = 하반기(7~12월) */
  half: 1 | 2
  /** '2025년 상반기' */
  label: string
  filing: TaxFiling
  /** 전년 같은 반기 (없으면 null) */
  prev: TaxFiling | null
  /** 전년 대비 증감액 (prev 가 없으면 null — 0 으로 위장하지 않습니다) */
  diff: number | null
  /** 전년 대비 증감률 % (소수 1자리). prev 가 0 이거나 없으면 null */
  growthPct: number | null
  /**
   * 확정 신고가 아닐 수 있는 반기인지.
   *
   *  두 가지 경우입니다.
   *   ① 과세기간이 아직 안 끝났다
   *   ② **증명서를 그 기간이 끝나기 전에 뽑았다** — 기간은 지났어도
   *      그 종이에 적힌 값은 확정 신고분이 아닙니다
   *
   *  실제로 그런 줄이 있습니다: 2026년 상반기(1~6월) 값이 2026-03-19 발급
   *  증명서에 적혀 있습니다. 「확정된 실적」처럼 보여 주면 안 됩니다.
   */
  provisional: boolean
  /** 왜 확정 전인지 — 화면에 그대로 나갑니다 */
  provisionalWhy: string
  /** 사람이 확정으로 확인해 준 반기인가 (0050) */
  confirmed: boolean
}

export interface TaxYear {
  year: number
  total: number
  taxed: number
  exempt: number
  /** 그 해에 실제로 있는 반기 수 (1 또는 2) */
  halves: number
  /** 전년 대비 증감률 % — 양쪽 모두 두 반기가 다 있을 때만 (반쪽끼리 비교 금지) */
  growthPct: number | null
  /** 한 반기라도 확정 전이면 true */
  provisional: boolean
}

export interface TaxBaseView {
  halves: HalfYear[]
  years: TaxYear[]
  /** 가장 최근 반기 (없으면 null) */
  latest: HalfYear | null
  /** 증명 발급번호·발급일 — 「이 숫자 어디서 났나」에 답하는 자리 */
  sourceNo: string
  issuedOn: string | null
}

const halfOf = (from: string): 1 | 2 => (Number(from.slice(5, 7)) <= 6 ? 1 : 2)

export function halfLabel(year: number, half: 1 | 2): string {
  return `${year}년 ${half === 1 ? '상반기' : '하반기'}`
}

/** 증감률 — 작년이 0 이거나 없으면 계산하지 않습니다 (∞ 를 숫자로 위장하지 않습니다) */
function pct(now: number, before: number | null | undefined): number | null {
  if (before == null || before === 0) return null
  return Math.round(((now - before) / before) * 1000) / 10
}

/**
 * 반기 목록을 「전년 동기 대비」가 붙은 모양으로 바꿉니다.
 *
 *  `today` 는 오늘 날짜(YYYY-MM-DD). 아직 끝나지 않은 반기를 가리는 데만 씁니다.
 */
export function taxBaseView(filings: TaxFiling[], today: string): TaxBaseView {
  const sorted = [...filings].sort((a, b) => a.periodFrom.localeCompare(b.periodFrom))
  const byKey = new Map<string, TaxFiling>()
  for (const f of sorted) byKey.set(`${f.periodFrom.slice(0, 4)}-${halfOf(f.periodFrom)}`, f)

  const halves: HalfYear[] = sorted.map((f) => {
    const year = Number(f.periodFrom.slice(0, 4))
    const half = halfOf(f.periodFrom)
    const prev = byKey.get(`${year - 1}-${half}`) ?? null
    const running = f.periodTo >= today
    //  증명서를 기간이 끝나기 전에 뽑았으면, 기간이 지난 지금 봐도 그 값은
    //  확정 신고분이 아닙니다. 날짜만 보고 「끝난 기간이니 확정」이라고
    //  단정하면 안 됩니다.
    const early = f.issuedOn != null && f.issuedOn < f.periodTo
    //  사람이 확인해 준 것은 더 묻지 않습니다. 확인은 날짜 추측을 이깁니다.
    const confirmed = f.confirmedAt != null
    return {
      year,
      half,
      label: halfLabel(year, half),
      filing: f,
      prev,
      diff: prev ? f.baseTotal - prev.baseTotal : null,
      growthPct: pct(f.baseTotal, prev?.baseTotal),
      provisional: !confirmed && (running || early),
      provisionalWhy:
        confirmed
          ? ''
          : running
            ? '이 과세기간이 아직 끝나지 않았습니다'
            : early
              ? `증명서를 이 기간이 끝나기 전(${f.issuedOn})에 뽑았습니다 — 확정 신고분이 아닐 수 있습니다`
              : '',
      confirmed,
    }
  })

  //  연도별 — 반기가 둘 다 있어야 「그 해」입니다.
  const yearMap = new Map<number, HalfYear[]>()
  for (const h of halves) yearMap.set(h.year, [...(yearMap.get(h.year) ?? []), h])
  const years: TaxYear[] = [...yearMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, hs]) => ({
      year,
      total: hs.reduce((s, h) => s + h.filing.baseTotal, 0),
      taxed: hs.reduce((s, h) => s + h.filing.baseTaxed, 0),
      exempt: hs.reduce((s, h) => s + h.filing.baseExempt, 0),
      halves: hs.length,
      growthPct: null,
      provisional: hs.some((h) => h.provisional),
    }))
  //  반쪽인 해를 온전한 해와 맞대면 「반토막」으로 보입니다 — 둘 다 두 반기일 때만.
  for (let i = 1; i < years.length; i += 1) {
    const now = years[i]
    const before = years[i - 1]
    if (now.year - before.year !== 1) continue
    if (now.halves !== 2 || before.halves !== 2) continue
    now.growthPct = pct(now.total, before.total)
  }

  const latest = halves.length ? halves[halves.length - 1] : null
  return {
    halves,
    years,
    latest,
    sourceNo: latest?.filing.sourceNo ?? '',
    issuedOn: latest?.filing.issuedOn ?? null,
  }
}

/** '+103.1%' · '-12.4%' · '비교할 작년 자료 없음' */
export function growthText(pctValue: number | null): string {
  if (pctValue == null) return '비교할 작년 자료 없음'
  const sign = pctValue > 0 ? '+' : ''
  return `${sign}${pctValue.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`
}
