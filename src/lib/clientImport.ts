import type { Client, VatMode } from '../types'
import { formatBizNo, isValidBizNo, normalizeBizNo } from './taxInvoice'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 정보 붙여넣기
//
//  세금계산서 칸을 만들었지만, 그 값은 지금 이사님 엑셀에 있습니다.
//  거래처 스무 곳을 하나씩 열어 여섯 칸씩 옮겨 적는 일이 남았고, 그걸
//  하기 전까지 세금계산서 목록은 계속 비어 있습니다. 있는 엑셀을 그대로
//  붙여 넣게 합니다.
//
//  ── 넣지 않는 것 ──────────────────────────────────────────────────────
//
//   단가. 단가는 청구 금액을 바꿉니다. 붙여넣기로 여러 거래처의 청구액을
//   한 번에 바꾸는 일은 만들지 않습니다 — 단가는 거래처마다 계약서를 보고
//   한 곳씩 확인해야 합니다.
//
//   새 거래처. 이름이 목록에 없으면 만들지 않고 「찾지 못함」으로 남깁니다.
//   오타 하나로 유령 거래처가 생기면 수거도 정산도 둘로 갈립니다.
//
//   덮어쓰기. 기본은 **빈 칸만 채웁니다.** 이미 들어 있는 값과 다르면
//   미리보기에 「지금 값 → 새 값」을 적어 두고, 덮어쓸지는 사람이 켭니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 채울 수 있는 칸 — 단가는 일부러 없습니다 */
export type InfoField = 'bizNo' | 'bizCeo' | 'bizType' | 'bizItem' | 'taxEmail' | 'vatMode' | 'paymentDueDay'

export const FIELD_LABEL: Record<InfoField, string> = {
  bizNo: '사업자등록번호',
  bizCeo: '대표자',
  bizType: '업태',
  bizItem: '종목',
  taxEmail: '이메일',
  vatMode: '부가세',
  paymentDueDay: '결제일',
}

//  머리글에 흔히 쓰는 말들. 엑셀마다 이름이 조금씩 다릅니다.
const HEADERS: Record<InfoField | 'name', string[]> = {
  name: ['거래처', '거래처명', '병원', '상호', '업체', '업체명', '고객'],
  bizNo: ['사업자등록번호', '사업자번호', '등록번호', '사업자'],
  bizCeo: ['대표자', '대표', '대표자명', '성명'],
  bizType: ['업태'],
  bizItem: ['종목', '업종'],
  taxEmail: ['이메일', '메일', 'email', '담당자메일', '계산서메일'],
  vatMode: ['부가세', '부가가치세', 'vat', '과세'],
  paymentDueDay: ['결제일', '지급일', '입금일'],
}

const VAT_WORDS: { mode: VatMode; words: string[] }[] = [
  { mode: '별도', words: ['별도', '외', '제외', 'vat별도'] },
  { mode: '포함', words: ['포함', '내', 'vat포함'] },
  { mode: '면세', words: ['면세', '비과세'] },
]

function normHeader(v: string): string {
  return v.replace(/[\s()[\]{}·.,/-]/g, '').toLowerCase()
}

/** 머리글 줄에서 어느 칸이 몇 번째인지 찾습니다 */
export function guessColumns(cells: string[]): Partial<Record<InfoField | 'name', number>> {
  const out: Partial<Record<InfoField | 'name', number>> = {}
  cells.forEach((raw, i) => {
    const h = normHeader(raw)
    if (!h) return
    for (const [key, words] of Object.entries(HEADERS) as [InfoField | 'name', string[]][]) {
      if (out[key] != null) continue
      if (words.some((w) => h.includes(normHeader(w)))) out[key] = i
    }
  })
  return out
}

export interface InfoChange {
  field: InfoField
  label: string
  /** 지금 저장돼 있는 값 (빈 칸이면 '') */
  before: string
  after: string
  /** 이미 값이 있는데 다른 값이 들어온 경우 */
  conflict: boolean
}

export interface InfoRow {
  /** 붙여 넣은 줄 번호 (1부터) */
  line: number
  /** 그 줄에 적힌 거래처명 */
  name: string
  clientId: string | null
  clientName: string
  changes: InfoChange[]
  /** 저장할 수 없는 이유 */
  blockers: string[]
}

export interface InfoParse {
  rows: InfoRow[]
  /** 거래처를 찾은 줄 */
  matched: InfoRow[]
  /** 거래처를 못 찾은 줄 — 새로 만들지 않습니다 */
  unmatched: InfoRow[]
  /** 어느 칸을 읽었는지 (화면에 그대로 보여 줍니다) */
  columns: Partial<Record<InfoField | 'name', number>>
  /** 머리글 줄을 찾았는지 */
  hasHeader: boolean
}

const clean = (v: string | undefined) => (v ?? '').trim()

/** 이름 비교 — 공백·괄호를 떼고 봅니다 (엑셀에 「더원요양병원 (본관)」처럼 적혀 있습니다) */
function nameKey(v: string): string {
  return v.replace(/[\s()[\]]/g, '').toLowerCase()
}

function readVat(v: string): { mode: VatMode | null; bad: boolean } {
  const t = normHeader(v)
  if (!t) return { mode: null, bad: false }
  for (const { mode, words } of VAT_WORDS) {
    if (words.some((w) => t.includes(normHeader(w)))) return { mode, bad: false }
  }
  return { mode: null, bad: true }
}

/**
 * 붙여 넣은 표를 읽습니다.
 *
 *  엑셀에서 긁으면 칸이 탭으로 나뉩니다. 쉼표로 저장한 csv 도 받습니다.
 *  머리글이 있으면 그 이름으로 칸을 찾고, 없으면 첫 칸을 거래처명으로
 *  보고 나머지는 읽지 않습니다 — 순서를 짐작해 엉뚱한 칸에 넣는 것보다
 *  「머리글을 넣어 주세요」라고 말하는 편이 안전합니다.
 */
export function parseClientInfo(text: string, clients: Client[]): InfoParse {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '')
  if (lines.length === 0) {
    return { rows: [], matched: [], unmatched: [], columns: {}, hasHeader: false }
  }

  const byKeyForHeader = new Set(clients.map((c) => nameKey(c.name)))
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(','))
  const first = split(lines[0]).map(clean)
  const cols = guessColumns(first)
  //  거래처 이름에는 「병원」·「의원」이 들어 있어서, 첫 줄이 자료인데도
  //  머리글로 읽히는 일이 생깁니다. 첫 줄에 실제 거래처 이름이 하나라도
  //  있으면 그건 자료 줄입니다 — 머리글에 거래처 이름을 적지는 않습니다.
  const firstIsData = first.some((c) => c !== '' && byKeyForHeader.has(nameKey(c)))
  const hasHeader = !firstIsData && cols.name != null && Object.keys(cols).length >= 2
  const body = hasHeader ? lines.slice(1) : lines
  const columns = hasHeader ? cols : { name: 0 }

  const byKey = new Map<string, Client>()
  for (const c of clients) byKey.set(nameKey(c.name), c)

  const rows: InfoRow[] = []
  body.forEach((raw, i) => {
    const cells = split(raw).map(clean)
    const name = clean(cells[columns.name ?? 0])
    if (!name) return

    const client = byKey.get(nameKey(name)) ?? null
    const blockers: string[] = []
    const changes: InfoChange[] = []

    if (!client) blockers.push('거래처를 찾지 못했습니다')
    if (!hasHeader) blockers.push('머리글 줄이 없어 어느 칸이 무엇인지 알 수 없습니다')

    const put = (field: InfoField, after: string, before: string) => {
      if (!after) return
      if (after === before) return
      changes.push({ field, label: FIELD_LABEL[field], before, after, conflict: before !== '' })
    }

    if (client && hasHeader) {
      if (columns.bizNo != null) {
        const digits = normalizeBizNo(cells[columns.bizNo])
        if (digits && !isValidBizNo(digits)) {
          blockers.push(`사업자등록번호가 형식에 맞지 않습니다 (${clean(cells[columns.bizNo])})`)
        } else if (digits) {
          put('bizNo', digits, normalizeBizNo(client.bizNo))
        }
      }
      if (columns.bizCeo != null) put('bizCeo', clean(cells[columns.bizCeo]), clean(client.bizCeo))
      if (columns.bizType != null) put('bizType', clean(cells[columns.bizType]), clean(client.bizType))
      if (columns.bizItem != null) put('bizItem', clean(cells[columns.bizItem]), clean(client.bizItem))
      if (columns.taxEmail != null) put('taxEmail', clean(cells[columns.taxEmail]), clean(client.taxEmail))
      if (columns.vatMode != null) {
        const { mode, bad } = readVat(clean(cells[columns.vatMode]))
        if (bad) blockers.push(`부가세를 「별도·포함·면세」 중 무엇인지 읽을 수 없습니다 (${clean(cells[columns.vatMode])})`)
        else if (mode) put('vatMode', mode, client.vatMode ?? '')
      }
      if (columns.paymentDueDay != null) {
        const t = clean(cells[columns.paymentDueDay]).replace(/[^0-9]/g, '')
        const n = t === '' ? null : Number(t)
        if (n != null && (n < 1 || n > 31)) {
          blockers.push(`결제일은 1~31 사이여야 합니다 (${clean(cells[columns.paymentDueDay])})`)
        } else if (n != null) {
          put('paymentDueDay', String(n), client.paymentDueDay == null ? '' : String(client.paymentDueDay))
        }
      }
    }

    rows.push({
      line: i + 1,
      name,
      clientId: client?.id ?? null,
      clientName: client?.name ?? '',
      changes,
      blockers,
    })
  })

  return {
    rows,
    matched: rows.filter((r) => r.clientId != null && r.blockers.length === 0),
    unmatched: rows.filter((r) => r.clientId == null || r.blockers.length > 0),
    columns,
    hasHeader,
  }
}

/**
 * 실제로 저장할 값 — 화면이 이걸 그대로 updateClient 에 넘깁니다.
 *
 *  overwrite 가 꺼져 있으면 지금 비어 있는 칸만 채웁니다. 기존 값과 다른
 *  값이 들어와도 손대지 않습니다 — 어느 쪽이 맞는지는 사람이 압니다.
 */
export function patchOf(row: InfoRow, overwrite: boolean): Partial<Client> {
  const patch: Partial<Client> = {}
  for (const ch of row.changes) {
    if (ch.conflict && !overwrite) continue
    if (ch.field === 'vatMode') patch.vatMode = ch.after as VatMode
    else if (ch.field === 'paymentDueDay') patch.paymentDueDay = Number(ch.after)
    else patch[ch.field] = ch.after
  }
  return patch
}

/** 미리보기 한 줄 — 「사업자등록번호 123-45-67890」 */
export function changeText(ch: InfoChange): string {
  const shown = ch.field === 'bizNo' ? formatBizNo(ch.after) : ch.after
  if (!ch.conflict) return `${ch.label} ${shown}`
  const before = ch.field === 'bizNo' ? formatBizNo(ch.before) : ch.before
  return `${ch.label} ${before} → ${shown}`
}
