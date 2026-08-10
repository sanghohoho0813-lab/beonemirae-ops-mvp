// ─────────────────────────────────────────────────────────────────────────────
// 엑셀(.xlsx) 읽기 — 읽기 전용, 라이브러리 없이
//
//  이사님 엑셀을 시스템으로 옮기려면 브라우저에서 .xlsx 를 열어야 합니다.
//  그렇다고 엑셀 라이브러리를 하나 통째로 들여오고 싶지는 않았습니다 —
//  이 앱이 하는 일은 '읽어서 보여 주고 확인받는 것'뿐이고, 쓰기는 하지
//  않습니다. 원본 파일은 절대 건드리지 않습니다.
//
//  .xlsx 는 압축된 폴더(zip)에 XML 몇 장이 든 것입니다. 요즘 브라우저와
//  Node 는 압축 해제를 기본으로 갖고 있어서(DecompressionStream), 필요한
//  것만 꺼내 읽으면 됩니다.
//
//  꺼내 읽는 것
//   · xl/workbook.xml       시트 이름과 순서
//   · xl/sharedStrings.xml  글자 값들 (엑셀은 글자를 따로 모아 둡니다)
//   · xl/styles.xml         날짜인지 숫자인지 (엑셀에서 날짜는 그냥 숫자입니다)
//   · xl/worksheets/*.xml   실제 칸 값
//
//  날짜 칸은 'YYYY-MM-DD' 글자로 돌려줍니다. 엑셀 안에서 날짜는 1899-12-30
//  부터 센 숫자일 뿐이라, 그대로 두면 45000 같은 숫자가 되어 버립니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 칸 하나의 값. 날짜는 'YYYY-MM-DD' 글자입니다. */
export type CellValue = string | number | boolean | null

export interface Sheet {
  name: string
  /** rows[행][열] — 0부터. 빈 칸은 null */
  rows: CellValue[][]
}

// ── zip 풀기 ────────────────────────────────────────────────────────────────

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** zip 안의 파일들을 이름 → 내용(글자)으로 */
async function unzip(buf: ArrayBuffer): Promise<Map<string, string>> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const dec = new TextDecoder('utf-8')

  //  끝에서부터 '중앙 디렉터리 끝' 표시를 찾습니다. 주석이 붙어 있을 수
  //  있어서 뒤에서 훑습니다.
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= 0 && i > buf.byteLength - 22 - 65536; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('엑셀 파일이 아니거나 파일이 깨졌습니다.')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const out = new Map<string, string>()

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localAt = view.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen

    //  실제 내용은 로컬 헤더 뒤에 있습니다. 로컬 헤더의 이름·부가정보 길이는
    //  중앙 디렉터리의 것과 다를 수 있어 여기서 다시 읽습니다.
    if (view.getUint32(localAt, true) !== 0x04034b50) continue
    const lNameLen = view.getUint16(localAt + 26, true)
    const lExtraLen = view.getUint16(localAt + 28, true)
    const start = localAt + 30 + lNameLen + lExtraLen
    const raw = bytes.subarray(start, start + compSize)

    //  필요한 것만 풉니다 (그림·인쇄설정 같은 것은 건너뜁니다)
    if (!/^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|worksheets\/|_rels\/workbook\.xml\.rels)/.test(name)) {
      continue
    }
    out.set(name, dec.decode(method === 8 ? await inflateRaw(raw) : raw))
  }
  return out
}

// ── XML 에서 필요한 것만 뽑기 ───────────────────────────────────────────────
//
//  통째로 파싱하는 도구(DOMParser)는 브라우저에만 있고 Node 에는 없어서,
//  검사에서 같은 코드를 돌릴 수 없습니다. 시트 XML 은 모양이 정해져 있어
//  필요한 부분만 훑는 편이 오히려 안전합니다.

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')

/** <si> 하나 = 글자 하나. 서식이 섞이면 <r><t> 가 여러 개라 이어 붙입니다. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = ''
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += unescapeXml(t[1])
    out.push(text)
  }
  return out
}

/**
 * 칸마다 붙은 서식이 '날짜'인지 알아냅니다.
 *
 *  엑셀에서 날짜는 숫자입니다. 45000 이 2023-03-15 인지 그냥 45000 인지는
 *  서식을 봐야 압니다. 서식을 안 보면 수거일자가 전부 다섯 자리 숫자로
 *  들어옵니다.
 */
function parseDateStyles(xml: string): Set<number> {
  const dateFmt = new Set<number>([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])
  for (const m of xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = unescapeXml(m[2])
    //  따옴표 안의 글자는 서식이 아니라 그냥 글자입니다 (예: "년")
    const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
    if (/[ymd]/i.test(bare)) dateFmt.add(Number(m[1]))
  }
  const isDate = new Set<number>()
  const xfs = xml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? ''
  let i = 0
  for (const m of xfs.matchAll(/<xf\b[^>]*>/g)) {
    const id = Number(m[0].match(/numFmtId="(\d+)"/)?.[1] ?? 0)
    if (dateFmt.has(id)) isDate.add(i)
    i++
  }
  return isDate
}

/** 엑셀 날짜 숫자 → 'YYYY-MM-DD' (1899-12-30 기준) */
export function excelDate(serial: number): string {
  const ms = Math.round(serial * 86400000)
  const d = new Date(Date.UTC(1899, 11, 30) + ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** 'A1' → [행 0부터, 열 0부터] */
function refToRC(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return [-1, -1]
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return [Number(m[2]) - 1, col - 1]
}

function parseSheet(xml: string, shared: string[], dateStyles: Set<number>): CellValue[][] {
  const rows: CellValue[][] = []
  //  빈 칸은 <c r="B3" s="138"/> 처럼 혼자 닫힙니다. 이것을 여는 태그로 보면
  //  다음 칸까지 통째로 삼켜서, 값이 한 칸씩 밀리거나 사라집니다(실제로
  //  단가 950 이 사라지고 명세서 단가가 한 칸 왼쪽으로 밀렸습니다).
  //  혼자 닫히는 것을 먼저 걸러냅니다.
  for (const cm of xml.matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g)) {
    const selfClosing = cm[1] !== undefined
    const attrs = selfClosing ? cm[1] : cm[2]
    const inner = selfClosing ? '' : (cm[3] ?? '')
    const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
    if (!ref) continue
    const [r, c] = refToRC(ref)
    if (r < 0) continue
    const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? 'n'
    const style = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1)

    let value: CellValue = null
    if (type === 'inlineStr') {
      let text = ''
      for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += unescapeXml(t[1])
      value = text
    } else {
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (raw !== undefined) {
        if (type === 's') value = shared[Number(raw)] ?? ''
        else if (type === 'b') value = raw === '1'
        else if (type === 'str' || type === 'e') value = unescapeXml(raw)
        else {
          const n = Number(raw)
          //  날짜 서식이 붙은 숫자만 날짜로 바꿉니다. 서식을 안 보고 크기로
          //  짐작하면 금액(45,000원)이 날짜가 되어 버립니다.
          value = dateStyles.has(style) && Number.isFinite(n) && n > 0 ? excelDate(n) : n
        }
      }
    }
    if (value === null || value === '') continue
    if (!rows[r]) rows[r] = []
    rows[r][c] = value
  }
  //  중간에 빈 행이 있으면 undefined 구멍이 남습니다 — 빈 배열로 채웁니다.
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
  return rows
}

/** .xlsx 를 읽어 시트 목록으로 돌려줍니다. 원본은 건드리지 않습니다. */
export async function readWorkbook(buf: ArrayBuffer): Promise<Sheet[]> {
  const files = await unzip(buf)
  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml') ?? '')
  const dateStyles = parseDateStyles(files.get('xl/styles.xml') ?? '')

  //  시트 이름은 workbook.xml 에, 실제 내용은 worksheets/*.xml 에 있고
  //  둘은 관계 파일(rels)로 이어져 있습니다.
  const rels = new Map<string, string>()
  for (const m of (files.get('xl/_rels/workbook.xml.rels') ?? '').matchAll(
    /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    rels.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\.\//, ''))
  }

  const out: Sheet[] = []
  const wb = files.get('xl/workbook.xml') ?? ''
  let fallback = 1
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(m[0].match(/name="([^"]*)"/)?.[1] ?? '')
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] ?? ''
    const target = rels.get(rid) ?? `worksheets/sheet${fallback}.xml`
    fallback++
    const xml = files.get(`xl/${target}`)
    if (xml === undefined) continue
    out.push({ name, rows: parseSheet(xml, shared, dateStyles) })
  }
  return out
}
