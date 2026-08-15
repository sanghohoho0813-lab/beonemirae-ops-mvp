// ─────────────────────────────────────────────────────────────────────────────
// 거래처 이름 맞대보기
//
//  같은 병원이 두 곳으로 갈리면 수거도 정산도 미수금도 둘로 나뉩니다.
//  명세서가 두 장 나가고, 어느 쪽이 진짜인지 나중에는 알 수 없습니다.
//
//  그런데 사람이 적는 이름은 매번 조금씩 다릅니다 — 실제로 이런 것들입니다.
//
//    오남한양병원 · 오남한양 병원 · (주)오남한양병원 · ㈜오남한양병원
//
//  글자 그대로 비교하면 넷 다 다른 거래처가 됩니다. 그래서 **맞대볼 때만**
//  쓰는 열쇠를 따로 만듭니다. 저장되는 이름은 사람이 적은 그대로입니다 —
//  시스템이 상호를 고쳐 쓰지 않습니다.
//
//  ⚠ 이 규칙은 `supabase/migrations/0045_client_dedup.sql` 의
//    `public.client_name_key()` 와 **글자 하나까지 같아야** 합니다.
//    한쪽만 고치면 화면과 서버가 다른 답을 내고, 화면이 「괜찮다」고 한 것을
//    서버가 막습니다. 두 구현을 같은 예시표로 함께 검증합니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 법인격 표기 — 상호를 구분해 주지 않습니다.
 *  「(주)오남한양병원」과 「오남한양병원」은 같은 병원입니다.
 */
const LEGAL_FORMS = [
  '주식회사',
  '유한책임회사',
  '유한회사',
  '합자회사',
  '합명회사',
  '의료법인',
  '재단법인',
  '사단법인',
  '사회복지법인',
  '학교법인',
  '종교법인',
  '(주)',
  '(유)',
  '(의)',
  '(재)',
  '(사)',
  '(합)',
  '㈜',
  '㈔',
  '㈖',
]

/**
 * 맞대보기용 열쇠. 저장용이 아닙니다.
 *
 *  ① 법인격 표기를 뺍니다
 *  ② 한글·한자·영문·숫자만 남깁니다 (공백·괄호·점·가운뎃점 전부 사라집니다)
 *
 *  수거 구분이나 지역은 **지우지 않습니다** — 「연세의원(강남)」과
 *  「연세의원(분당)」은 다른 거래처이고, 그건 사람이 구분해 적은 것입니다.
 */
export function clientNameKey(name: string | null | undefined): string {
  let s = (name ?? '').normalize('NFC').toLowerCase()
  for (const f of LEGAL_FORMS) s = s.split(f.toLowerCase()).join('')
  return s.replace(/[^0-9a-z가-힣一-龥]/g, '')
}

/** 두 이름이 「같은 거래처로 보이는가」 */
export function sameClientName(a: string, b: string): boolean {
  const ka = clientNameKey(a)
  return ka !== '' && ka === clientNameKey(b)
}

export interface NameMatch<T> {
  client: T
  /** 'same' = 사실상 같은 이름 · 'similar' = 한쪽이 다른 쪽으로 시작 */
  kind: 'same' | 'similar'
}

/**
 * 이미 있는 거래처 중 부딪히는 곳을 찾습니다.
 *
 *  'same' 은 서버도 막습니다. 'similar' 는 막지 않고 보여만 줍니다 —
 *  「오남한양」과 「오남한양병원」은 같은 곳일 수도, 다른 곳일 수도 있고
 *  그건 사람만 압니다.
 */
export function findNameMatches<T extends { id: string; name: string }>(
  name: string,
  clients: T[],
  opts?: { exceptId?: string },
): NameMatch<T>[] {
  const key = clientNameKey(name)
  if (!key) return []
  const out: NameMatch<T>[] = []
  for (const c of clients) {
    if (opts?.exceptId && c.id === opts.exceptId) continue
    const k = clientNameKey(c.name)
    if (!k) continue
    if (k === key) out.push({ client: c, kind: 'same' })
    else if (k.startsWith(key) || key.startsWith(k)) out.push({ client: c, kind: 'similar' })
  }
  //  똑같은 곳을 먼저 보여 줍니다 — 그게 바로 막히는 쪽입니다.
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'same' ? -1 : 1))
  return out
}
