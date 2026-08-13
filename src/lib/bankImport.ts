import type { AppData, Payment } from '../types'
import type { Sheet, CellValue } from './xlsx'
import { excelDate } from './xlsx'
import { paidTotalOf } from './ops'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 통장 입금 대사
//
//  이사님은 통장 입금내역을 따로 엑셀로 정리하고 계십니다. 그걸 보면서
//  청구 하나하나에 입금을 손으로 넣는 것이 지금의 업무입니다. 파일을
//  올려 자동으로 맞춰 붙입니다.
//
//  은행마다 파일 모양이 다릅니다 — 지어내지 않습니다
//
//   특정 은행 서식을 코드에 박지 않습니다. 첫 줄들을 훑어 「거래일자」
//   「입금액」 「내용/적요」처럼 보이는 열을 **추정**하고, 그 추정을 화면에
//   그대로 보여 주고 대표님이 고칠 수 있게 합니다. 자동으로 정하고
//   넘어가지 않습니다.
//
//  맞췄다고 함부로 기록하지 않습니다
//
//   확실     적요에 거래처 이름이 있고 금액이 남은 미수와 정확히 같음
//   확인 필요 둘 중 하나만 맞음 (이름만 / 금액만) — 사람이 고르게 합니다
//   못 찾음   후보가 없음
//
//   자동으로 기록하는 것은 **확실**뿐입니다. 나머지는 화면에 남깁니다.
//
//  두 번 기록하지 않습니다
//
//   통장 한 줄의 지문(날짜|금액|적요)을 함께 저장하고, 서버(0031)가 같은
//   지문을 거부합니다. 파일을 다시 올려도 돈이 두 배가 되지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 통장 한 줄 */
export interface BankLine {
  /** 원본 시트에서의 행 번호 (0부터) — 화면에서 되짚어 보기 위해 */
  row: number
  date: string
  amount: number
  description: string
  /** 이 줄의 지문. 서버가 중복을 막는 열쇠입니다 */
  ref: string
}

/** 열 자리 추정 결과 */
export interface ColumnGuess {
  date: number
  amount: number
  description: number
  /** 머리글 줄 번호 */
  headerRow: number
  /** 각 열의 머리글 글자 (화면에서 고를 때 씁니다) */
  headers: string[]
}

const txt = (v: CellValue): string => (v == null ? '' : String(v)).trim()

/** 숫자로 읽습니다. "1,200,000" · "1200000원" 모두 받습니다. */
export function toAmount(v: CellValue): number | null {
  if (typeof v === 'number') return Math.round(v)
  const s = txt(v).replace(/[,\s원]/g, '')
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null
  return Math.round(Number(s))
}

/** 날짜로 읽습니다. 엑셀 날짜 숫자 · 2026-08-05 · 2026.08.05 · 20260805 */
export function toDate(v: CellValue): string | null {
  if (typeof v === 'number') {
    //  엑셀 날짜 일련번호는 대략 1900~2100 년 범위입니다. 그 밖이면 날짜가 아닙니다.
    if (v < 20000 || v > 80000) return null
    return excelDate(v)
  }
  const s = txt(v)
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

const DATE_WORDS = ['거래일', '거래일자', '입금일', '날짜', '일자', '거래일시', '거래시간']
/** 「입금」이라고 분명히 적힌 열 — 이쪽을 먼저 씁니다 */
const AMOUNT_STRONG = ['입금액', '입금금액', '맡기신금액', '입금']
/** 그냥 「금액」 — 입금 열이 따로 없을 때만 */
const AMOUNT_WEAK = ['금액']
/**
 * 절대 입금액으로 보면 안 되는 열.
 *
 *  실제로 걸렸습니다 — 「출금액」에 '금액'이 들어 있어서 출금 열을 입금으로
 *  잡았습니다. 그대로 두면 차량 할부금이 병원 입금으로 기록됩니다. 잔액도
 *  숫자가 가장 크기 때문에 값 모양으로 찾을 때 1등이 됩니다.
 */
const AMOUNT_EXCLUDE = ['출금', '찾으신', '지급', '잔액', '수수료']
const DESC_WORDS = ['내용', '적요', '보낸분', '의뢰인', '거래내용', '기재내용', '비고', '받는분']

const norm = (s: string) => s.replace(/[\s()]/g, '')
const hit = (h: string, words: string[]) => {
  const s = norm(h)
  return words.some((w) => s.includes(norm(w)))
}
const banned = (h: string) => hit(h, AMOUNT_EXCLUDE)

/**
 * 어느 열이 날짜·금액·적요인지 추정합니다.
 *
 *  머리글 글자로 먼저 찾고, 못 찾으면 실제 값의 모양으로 찾습니다
 *  (날짜로 읽히는 열 / 숫자로 읽히는 열 중 가장 큰 값이 있는 열).
 *  추정일 뿐이므로 화면이 이 결과를 그대로 보여 주고 고치게 합니다.
 */
export function guessColumns(sheet: Sheet): ColumnGuess {
  const rows = sheet.rows
  //  머리글 줄 — 위에서 15줄 안에서 「입금」류 글자가 가장 많은 줄
  let headerRow = 0
  let best = -1
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const cells = (rows[r] ?? []).map(txt)
    const score =
      (cells.some((c) => hit(c, DATE_WORDS)) ? 1 : 0) +
      (cells.some((c) => hit(c, AMOUNT_STRONG) || hit(c, AMOUNT_WEAK)) ? 1 : 0) +
      (cells.some((c) => hit(c, DESC_WORDS)) ? 1 : 0)
    if (score > best) {
      best = score
      headerRow = r
    }
  }
  const headers = (rows[headerRow] ?? []).map(txt)
  const body = rows.slice(headerRow + 1)

  const byWord = (words: string[]) => headers.findIndex((h) => h && hit(h, words))

  let date = byWord(DATE_WORDS)
  //  「입금」이라 적힌 열 → 없으면 「금액」. 어느 쪽이든 출금·잔액 열은 뺍니다.
  let amount = headers.findIndex((h) => h && !banned(h) && hit(h, AMOUNT_STRONG))
  if (amount < 0) amount = headers.findIndex((h) => h && !banned(h) && hit(h, AMOUNT_WEAK))
  let description = byWord(DESC_WORDS)

  const colCount = Math.max(headers.length, ...body.slice(0, 50).map((r) => r.length), 0)

  //  머리글로 못 찾은 것은 값의 모양으로 찾습니다.
  if (date < 0) {
    for (let c = 0; c < colCount; c++) {
      const n = body.slice(0, 50).filter((r) => toDate(r?.[c] ?? null) != null).length
      if (n >= 3) {
        date = c
        break
      }
    }
  }
  if (amount < 0) {
    let bestSum = 0
    for (let c = 0; c < colCount; c++) {
      if (c === date) continue
      //  머리글이 출금·잔액이면 값이 아무리 커도 후보가 아닙니다.
      if (headers[c] && banned(headers[c])) continue
      const vals = body.slice(0, 50).map((r) => toAmount(r?.[c] ?? null)).filter((v): v is number => v != null && v > 0)
      const sum = vals.reduce((s, v) => s + v, 0)
      if (vals.length >= 3 && sum > bestSum) {
        bestSum = sum
        amount = c
      }
    }
  }
  if (description < 0) {
    let bestLen = 0
    for (let c = 0; c < colCount; c++) {
      if (c === date || c === amount) continue
      const vals = body.slice(0, 50).map((r) => txt(r?.[c] ?? null)).filter((v) => v && toAmount(v) == null)
      const len = vals.reduce((s, v) => s + v.length, 0)
      if (vals.length >= 3 && len > bestLen) {
        bestLen = len
        description = c
      }
    }
  }

  return { date, amount, description, headerRow, headers }
}

/**
 * 추정(또는 사람이 고친) 열 자리로 통장 줄을 읽습니다.
 *
 *  같은 날 · 같은 금액 · 같은 적요가 두 줄 찍히는 일이 실제로 있습니다 —
 *  한 병원이 6월분과 7월분을 같은 날 같은 금액으로 따로 이체하면 통장에는
 *  똑같이 생긴 줄이 두 개 남습니다. 지문을 「날짜|금액|적요」로만 만들면
 *  두 줄이 한 줄로 겹쳐, 둘째 입금을 영영 기록할 수 없고 그 달 미수금이
 *  그대로 남습니다.
 *
 *  그래서 **파일 안에서 몇 번째로 나온 줄인지**를 뒤에 붙입니다. 첫 줄은
 *  예전과 같은 지문을 그대로 씁니다 — 이미 기록해 둔 입금이 다시 살아나
 *  두 번 들어가지 않게 하기 위해서입니다. 같은 파일을 다시 올리면 순번도
 *  똑같이 매겨지므로 중복 차단은 그대로 동작합니다.
 */
export function readLines(sheet: Sheet, cols: ColumnGuess): BankLine[] {
  const t = today()
  const out: BankLine[] = []
  const seen = new Map<string, number>()
  for (let r = cols.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? []
    const date = toDate(row[cols.date] ?? null)
    const amount = toAmount(row[cols.amount] ?? null)
    //  입금만 봅니다. 출금(음수)·0원·날짜 없는 줄(합계 줄 등)은 건너뜁니다.
    if (!date || amount == null || amount <= 0) continue
    //  아직 오지 않은 날짜는 서버가 어차피 막습니다. 여기서 걸러 이유를 보여 줍니다.
    if (date > t) continue
    const description = txt(row[cols.description] ?? null)
    const base = `${date}|${amount}|${description}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.push({ row: r, date, amount, description, ref: n === 1 ? base : `${base}|#${n}` })
  }
  return out
}

// ── 대사 ────────────────────────────────────────────────────────────────────

export type MatchLevel = '확실' | '확인 필요' | '못 찾음'

export interface MatchCandidate {
  paymentId: string
  clientId: string
  clientName: string
  month: string
  billed: number
  paid: number
  outstanding: number
  /** 적요에서 이 거래처 이름이 읽혔는가 */
  nameHit: boolean
  /** 금액이 남은 미수와 정확히 같은가 */
  amountHit: boolean
}

export interface MatchRow {
  line: BankLine
  level: MatchLevel
  /** 확실일 때의 상대 청구 */
  best: MatchCandidate | null
  /** 확인 필요일 때 사람이 고를 후보 (많아야 5개) */
  candidates: MatchCandidate[]
  /** 왜 이렇게 판정했는지 */
  reason: string
  /** 이미 같은 지문으로 기록된 줄인가 (파일 재업로드) */
  already: boolean
}

/** 이름 비교용 — 괄호·법인 표기·공백을 걷어냅니다 */
export function normName(s: string): string {
  return s
    .replace(/\(주\)|\(유\)|\(재\)|주식회사|의료법인|재단법인|사회복지법인/g, '')
    .replace(/[\s()[\]·.,-]/g, '')
    .toLowerCase()
}

/** 적요에 이 거래처 이름이 들어 있는가 */
function nameInDesc(desc: string, clientName: string): boolean {
  const d = normName(desc)
  const c = normName(clientName)
  if (!d || c.length < 2) return false
  if (d.includes(c)) return true
  //  통장 적요는 글자 수가 잘립니다 (예: 「오남한양병원」 → 「오남한양」).
  //  거래처 이름의 앞 네 글자 이상이 들어 있으면 같은 곳으로 봅니다.
  if (c.length >= 4 && d.includes(c.slice(0, 4))) return true
  return false
}

/**
 * 통장 줄을 미수 청구와 맞춥니다.
 *
 *  자동으로 기록할 것은 「확실」뿐입니다. 이름과 금액이 **둘 다** 맞고
 *  후보가 하나일 때만 확실로 봅니다.
 */
export function matchLines(data: AppData, lines: BankLine[]): MatchRow[] {
  const clientName = new Map(
    [...data.clients, ...(data.retiredClients ?? [])].map((c) => [c.id, c.name]),
  )
  const usedRefs = new Set((data.receipts ?? []).map((r) => r.sourceRef).filter(Boolean) as string[])

  //  남은 미수가 있는 청구만 후보입니다.
  const open = data.payments
    .filter((p: Payment) => p.status !== '취소')
    .map((p) => {
      const paid = paidTotalOf(data, p)
      return {
        paymentId: p.id,
        clientId: p.clientId,
        clientName: clientName.get(p.clientId) ?? '거래처',
        month: p.billingMonth,
        billed: p.amount,
        paid,
        outstanding: p.amount - paid,
      }
    })
    .filter((p) => p.outstanding > 0)

  //  이번 파일 안에서 한 청구에 두 줄이 붙지 않게 합니다.
  const claimed = new Set<string>()
  const out: MatchRow[] = []

  //  이름+금액이 딱 맞는 줄부터 먼저 가져갑니다. 금액만 맞는 줄이 먼저
  //  청구를 차지해 버리면 진짜 주인이 밀려납니다.
  const order = [...lines].sort((a, b) => a.date.localeCompare(b.date))
  const decided = new Map<number, MatchRow>()

  for (const pass of [0, 1]) {
    for (const line of order) {
      if (decided.has(line.row)) continue

      if (usedRefs.has(line.ref)) {
        decided.set(line.row, {
          line, level: '못 찾음', best: null, candidates: [], already: true,
          reason: '이미 기록한 입금입니다 (같은 날짜·금액·적요)',
        })
        continue
      }

      const cands: MatchCandidate[] = open
        .filter((p) => !claimed.has(p.paymentId))
        .map((p) => ({
          ...p,
          nameHit: nameInDesc(line.description, p.clientName),
          amountHit: p.outstanding === line.amount,
        }))
        .filter((c) => c.nameHit || c.amountHit)

      const both = cands.filter((c) => c.nameHit && c.amountHit)

      if (pass === 0) {
        //  1차 — 이름과 금액이 둘 다 맞고 후보가 하나뿐일 때만 확실
        if (both.length === 1) {
          claimed.add(both[0].paymentId)
          decided.set(line.row, {
            line, level: '확실', best: both[0], candidates: both, already: false,
            reason: `적요에 「${both[0].clientName}」 · 남은 미수 ${both[0].outstanding.toLocaleString('ko-KR')}원과 금액 일치`,
          })
        }
        continue
      }

      //  2차 — 나머지를 판정합니다
      if (both.length > 1) {
        decided.set(line.row, {
          line, level: '확인 필요', best: null, candidates: both.slice(0, 5), already: false,
          reason: `이름·금액이 맞는 청구가 ${both.length}건입니다 — 어느 것인지 골라 주세요`,
        })
        continue
      }
      if (cands.length === 0) {
        //  거래처는 찾았는데 그 청구를 이 파일의 다른 줄이 이미 채운 경우입니다.
        //  「못 찾음」으로 묻어 두면 이름도 못 찾은 줄과 구분이 안 됩니다 —
        //  사람이 봐야 하는 줄이므로 이유를 적어 「확인 필요」로 올립니다.
        const takenByOther = open.filter(
          (pm) => claimed.has(pm.paymentId) && nameInDesc(line.description, pm.clientName),
        )
        if (takenByOther.length > 0) {
          decided.set(line.row, {
            line, level: '확인 필요', best: null, candidates: [], already: false,
            reason:
              `「${takenByOther[0].clientName}」 청구는 이 파일의 다른 줄이 이미 채웁니다 — ` +
              '다른 달 청구이거나 별도 입금일 수 있습니다',
          })
          continue
        }
        decided.set(line.row, {
          line, level: '못 찾음', best: null, candidates: [], already: false,
          reason: line.description
            ? '적요의 이름과 금액 모두 맞는 청구가 없습니다'
            : '적요가 비어 있고 금액이 맞는 청구도 없습니다',
        })
        continue
      }
      const nameOnly = cands.filter((c) => c.nameHit)
      const amountOnly = cands.filter((c) => c.amountHit)
      decided.set(line.row, {
        line, level: '확인 필요', best: null,
        candidates: (nameOnly.length ? nameOnly : amountOnly).slice(0, 5), already: false,
        reason: nameOnly.length
          ? '거래처는 찾았지만 금액이 남은 미수와 다릅니다 (부분입금일 수 있습니다)'
          : '금액은 맞지만 적요에서 거래처를 확인하지 못했습니다',
      })
    }
  }

  for (const line of order) {
    const row = decided.get(line.row)
    if (row) out.push(row)
  }
  return out
}

export interface MatchSummary {
  sure: number
  check: number
  none: number
  already: number
  sureAmount: number
  total: number
  totalAmount: number
}

export function summarize(rows: MatchRow[]): MatchSummary {
  const sure = rows.filter((r) => r.level === '확실')
  return {
    sure: sure.length,
    check: rows.filter((r) => r.level === '확인 필요').length,
    none: rows.filter((r) => r.level === '못 찾음' && !r.already).length,
    already: rows.filter((r) => r.already).length,
    sureAmount: sure.reduce((s, r) => s + r.line.amount, 0),
    total: rows.length,
    totalAmount: rows.reduce((s, r) => s + r.line.amount, 0),
  }
}
