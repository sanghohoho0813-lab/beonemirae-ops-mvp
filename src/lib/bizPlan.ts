// ─────────────────────────────────────────────────────────────────────────────
// 신보 뉴본펭귄 사업계획서 — 원본 서식의 구조 (0146)
//
//  신용보증기금 「(별첨1) 사업계획서(혁신스타트업).hwpx」를 풀어 **순서 · 표 칸 ·
//  단위 · 작성 안내 · 주석을 그대로** 옮긴 것입니다. 구조를 다시 짜지 않았습니다.
//
//   표지 · 확약 → 1 기업체 현황 … 11 사업 추진계획 → (추가) 대표자 서식 ①②③ →
//   사업계획서 작성 참고사항 → 리틀펭귄/퍼스트펭귄/Pre-ICON 보증용 별첨
//   (추정매출액 및 고용창출 · 1차년도 소요자금 · [별첨1] 현금 유출입 · [별첨2] 기술개요표) →
//   기술역량평가 기업개요표 작성요령
//
//  ⚠ 이 파일에는 **회사 내용이 없습니다.** 저장소가 공개이고, 앱 파일은 로그인 전에도
//    내려받을 수 있기 때문입니다. 1차 초안(회사 숫자 · 계획)은 저장소 밖 SQL 로 DB 에만
//    들어가고, 참여자만 bizplan_open 으로 읽습니다.
//  ⚠ 원본 표에 들어 있는 **예시 숫자 · 예시 기간**(9번 「1,000」, 별첨1 「700 · 936 …」,
//    「26.2월~27.1월」, 「’26.2」)은 값으로 쓰지 않고 안내(hint)에만 적습니다.
//  ⚠ 주민등록번호 · 개인 주소 · 개인 전화 · 개인 자산 · 계좌번호 · 서명은 'offline' —
//    이 시스템에 저장하지 않습니다(서버도 거절 — PROPOSAL_0146 의 bizplan_locked_keys).
// ─────────────────────────────────────────────────────────────────────────────

export const BIZPLAN_ENABLED = true
export const BIZPLAN_PATH = '/bizplan'
export const BIZPLAN_MENU_NAME = '제출 예정 사업계획서'
export const BIZPLAN_NAME = '신보 뉴본펭귄 사업계획서'
export const BIZPLAN_SUB = '신용보증기금 스타트업지점 제출 예정 · 공동작성 및 검토'
export const BIZPLAN_DOC_TITLE = '비원미래 신보 뉴본펭귄 사업계획서'

// ── 상태 · 유형 ────────────────────────────────────────────────────────────────
export const FIELD_STATUSES = ['작성 전', '초안 입력 완료', '확인 필요', '수정 요청 있음', '수정 반영 완료', '최종 확인 완료'] as const
export type FieldStatus = (typeof FIELD_STATUSES)[number]
export const DOC_STATUSES = ['초안 작성 중', '공동 검토 중', '수정 중', '최종 검토', '제출본 확정'] as const
export type DocStatus = (typeof DOC_STATUSES)[number]
export const REQ_TYPES = ['사실관계 수정', '숫자 변경', '문장 수정', '내용 추가', '내용 삭제', '증빙자료 확인', '의견 또는 질문', '최종 확인 요청'] as const
export type ReqType = (typeof REQ_TYPES)[number]
/** 내용을 고치는 요청 — 접수되면 항목 상태가 「수정 요청 있음」이 됩니다(서버와 같은 기준) */
export const MOD_REQ_TYPES: ReqType[] = ['사실관계 수정', '숫자 변경', '문장 수정', '내용 추가', '내용 삭제', '증빙자료 확인']
export const REQ_STATUSES = ['접수', '검토 중', '반영 완료', '보류', '반려'] as const
export type ReqStatus = (typeof REQ_STATUSES)[number]
export const OPEN_REQ: ReqStatus[] = ['접수', '검토 중']
export const CHECK_MARKS = ['동의', '수정 의견 있음', '자료 확인 필요', '추후 논의'] as const
export type CheckMark = (typeof CHECK_MARKS)[number]
export const BASIS_KINDS = ['사실', '추정', '계획', '미확인'] as const
export type BasisKind = (typeof BASIS_KINDS)[number]

/** 정보 출처 · 기준일 · 확인 여부 — 심사 대응 중 숫자가 달라지는 것을 막으려고 */
export interface Basis {
  kind?: BasisKind
  source?: string
  asOf?: string
  note?: string
}

export type TableRow = Record<string, string>
export type GridValue = Record<string, string>
export type Value = string | TableRow[] | GridValue

// ── 칸 정의 ──────────────────────────────────────────────────────────────────
export interface Column {
  key: string
  label: string
  /** 숫자 칸 — 합계를 셉니다 */
  num?: boolean
  /** 넓은 칸 (표에서 글이 긴 칸) */
  wide?: boolean
  placeholder?: string
}

interface Base {
  key: string
  label: string
  /** 원본 서식의 작성 안내 · 형식(예: 「년 월 일」) — 값이 아니라 안내입니다 */
  hint?: string
  /** 단위 (백만원 · 명 · 건 …) */
  unit?: string
}
export type FieldDef =
  | (Base & { kind: 'text' | 'long'; placeholder?: string })
  | (Base & { kind: 'choice'; options: string[] })
  | (Base & {
      kind: 'table'
      columns: Column[]
      /** 원본 표의 줄 수 */
      rows: number
      /** 줄 이름이 정해진 표(예: 보유기술Ⅰ · Ⅱ · Ⅲ) — 줄을 더하거나 뺄 수 없음 */
      rowLabels?: string[]
      /** 원본보다 줄을 늘릴 수 있는가 (늘리면 「별지」 안내) */
      extendable?: boolean
      /** 합계를 보여 줄 숫자 칸 */
      totals?: string[]
    })
  | (Base & { kind: 'grid'; cells: Column[] })
  /** 원본의 고정 문구(확약 · 안내) — 고칠 값이 없음. 검토 표시 · 요청은 됩니다 */
  | (Base & { kind: 'notice'; text: string[] })
  /** 이 시스템에 저장하지 않는 칸 — 제출 직전 원본에 직접 */
  | (Base & { kind: 'offline' })

export interface Group {
  id: string
  title?: string
  /** 원본의 작성 안내 문단 (그대로) */
  guide?: string[]
  fields: FieldDef[]
}

export interface RefTable {
  title?: string
  rows: string[][]
}

export interface Section {
  id: string
  /** 목차 번호 표시 (예: '01', '11', '추가①', '별첨') */
  no: string
  title: string
  /** 원본 제목 오른쪽 단위 */
  unit?: string
  part: '본문' | '추가 서식' | '참고' | '별첨'
  /** 이 부분 전체에 대한 안내 (예: 별첨 대상 보증) */
  note?: string
  groups: Group[]
  /** 원본 표 아래 주석 (그대로) */
  footnotes?: string[]
  /** 참고 표 (작성 참고사항 · 작성요령) — 값 없음 */
  refs?: RefTable[]
}

const t = (key: string, label: string, hint?: string, unit?: string): FieldDef => ({ key, label, kind: 'text', hint, unit })
const l = (key: string, label: string, hint?: string): FieldDef => ({ key, label, kind: 'long', hint })
const off = (key: string, label: string, hint: string): FieldDef => ({ key, label, kind: 'offline', hint })
const col = (key: string, label: string, o: Partial<Column> = {}): Column => ({ key, label, ...o })

const OFFLINE_HINT = '이 시스템에 저장하지 않습니다 — 제출 직전 원본 서식에 직접 적습니다.'

/** (추가) 대표자 서식 — 원본에 같은 표가 세 장 */
function extraCeo(n: 1 | 2 | 3): Section {
  const k = `x${n}`
  return {
    id: k,
    no: `추가${'①②③'[n - 1]}`,
    title: `(추가) 2. 대표자 및 경영진 현황 중 대표자(공동대표자, 실제경영자 등) — 서식 ${'①②③'[n - 1]}`,
    part: '추가 서식',
    note: '공동대표자 · 실제경영자 등이 있을 때만 씁니다. 해당 없으면 비워 둡니다(해당 여부 확인 필요).',
    groups: [
      {
        id: `${k}.g`,
        fields: [
          t(`${k}.name`, '성명'),
          off(`${k}.rrn`, '주민등록번호', OFFLINE_HINT),
          off(`${k}.phone`, '자택전화번호 · 휴대폰 번호', OFFLINE_HINT),
          t(`${k}.appointed`, '취임일자'),
          t(`${k}.license`, '사업관련 자격증'),
          { key: `${k}.form`, label: '경영형태', kind: 'choice', options: ['창업자', '승계', '인수', '동업', '전문경영인', '기타'] },
          {
            key: `${k}.career`, label: '주요경력', kind: 'table', rows: 2, extendable: true,
            columns: [col('period', '기간(년/월)'), col('place', '근무처'), col('industry', '근무처 업종'), col('position', '최종직위(담당업무)', { wide: true })],
          },
          off(`${k}.house`, '현 거주주택 · 소유관계(자가 · 전세 · 월세)', OFFLINE_HINT),
          off(`${k}.assets`, '기타소유자산', OFFLINE_HINT),
        ],
      },
    ],
  }
}

/** 11번 매출전망 — 차년도별 사업부문 표 (원본은 서술 칸, 「연도 · 사업부문 · 예상매출 · 산출근거」로 나눠 받음) */
const revenueTable = (key: string, label: string, hint: string): FieldDef => ({
  key, label, kind: 'table', rows: 5, extendable: true, totals: ['amount'], hint,
  columns: [col('segment', '사업부문'), col('amount', '예상매출(백만원)', { num: true }), col('basis', '산출근거', { wide: true })],
})

export const SECTIONS: Section[] = [
  // ── 표지 · 확약 ────────────────────────────────────────────────────────────
  {
    id: 'cover',
    no: '표지',
    title: '<사업계획서> (혁신스타트업용) · 확약',
    part: '본문',
    groups: [
      { id: 'cover.g', title: '표지', fields: [t('cover.company', '업 체 명'), t('cover.ceo', '대 표 자')] },
      {
        id: 'pledge.g',
        title: '확약 · 동의 (원본 문구 그대로)',
        guide: ['대표자가 원본 서식에서 직접 확인하고 서명합니다. 이 시스템은 동의 · 서명을 대신 표시하지 않습니다.'],
        fields: [
          {
            key: 'pledge.ethics', label: '▣ 윤리경영 실천 및 보증브로커 피해예방을 위한 협조 확약', kind: 'notice',
            text: [
              '□ 윤리경영 실천',
              '▪본인은 신용보증 신청 등과 관련하여 신용보증기금(이하 ‘신보’)의 인권･윤리경영 실천과 고객 및 신보 임직원 등의 인권보호에 적극 협조한다.',
              '▪본인은 신보 임직원 등에게 보증청탁 및 금품, 선물, 향응 등을 제공하지 않을 것이며, 만약 신보 임직원 등으로부터 금전거래, 금품, 선물, 향응 등을 요구받은 경우에는 즉시 신보의 인권윤리팀 또는 홈페이지 부패신고센터나 감사제보센터에 신고한다.',
              '▪상기 사항을 위반하여 발생하는 모든 피해 및 불이익은 본인이 책임지며 이의를 제기하지 않는다.',
              '* 신고자의 신분은 관련 법률과 신보의 내규에 따라 철저하게 보호됩니다.',
              '□ 보증브로커 피해예방',
              '▪본인은 보증의 알선을 목적으로 대가성 수수료를 요구하거나 허위자료 작성 및 자료 위·변조해 주는 대가로 금품을 요구하는 보증브로커 등과 관련이 없으며, 만일 이에 해당되는 경우 보증전액해지, 신규보증 중단 등의 불이익을 받게 되어도 이의를 제기하지 않는다.',
              '* 브로커 등 제3자 부당 개입 사건 신고 : 홈페이지 부조리신고센터 또는 신보 VOC팀(1588-6565)',
            ],
          },
          {
            key: 'pledge.false', label: '▣ 허위자료 제출 시 제재사항', kind: 'notice',
            text: ['이 ｢사업계획서｣는 귀사가 신용조사 및 신용보증을 받는데 중요한 자료로 활용되므로, 사실과 다르거나 허위의 자료를 제출한 경우에는 저희 신보 내규에서 정하는 바에 따라 앞으로 신용보증을 받을 수 없음은 물론, 고소‧고발 조치될 수 있습니다.'],
          },
          {
            key: 'pledge.funds', label: '▣ 자금사용내역서 제출', kind: 'notice',
            text: ['신보로부터 지원받은 자금에 대하여 신보에서 사후관리를 실시할 경우 ‘자금사용내역서’를 통장사본 등 근거자료와 함께 제출할 것을 확약합니다.'],
          },
          {
            key: 'pledge.credit', label: '▣ 신용정보 제공․활용 동의', kind: 'notice',
            text: ['이 자료는 기업을 널리 홍보하고 신용정보를 보급하기 위하여 저희 신보가 필요한 경우 활용할 수 있으며 이에 동의합니다.'],
          },
        ],
      },
      {
        id: 'sign.g',
        title: '작성일 · 작성자',
        fields: [
          t('sign.date', '작 성 일', '20   년    월    일 — 제출 직전에 적습니다'),
          t('sign.writer', '작 성 자'),
          t('sign.company', '기업체명'),
          t('sign.ceo', '대 표 자'),
          off('sign.seal', '(인) — 대표자 서명 · 날인', '대표자가 원본 서식에 직접 서명 · 날인합니다. 이 시스템은 서명을 대신하지 않습니다.'),
        ],
      },
    ],
  },
  // ── 1 ───────────────────────────────────────────────────────────────────────
  {
    id: 's1',
    no: '01',
    title: '1. 기업체 현황',
    part: '본문',
    groups: [
      {
        id: 's1.g1',
        fields: [
          t('s1.company', '업체명'),
          t('s1.ceo', '대 표 자 명'),
          t('s1.founded', '설립(개업)일자'),
          t('s1.industry', '업종(품목)'),
        ],
      },
      {
        id: 's1.g2',
        title: '소  재  지',
        fields: [
          t('s1.hq_addr', '본사 — 주소'), t('s1.hq_tel', '본사 — 전화번호'), t('s1.hq_fax', '본사 — 팩스'),
          t('s1.site_addr', '사업장 — 주소'), t('s1.site_tel', '사업장 — 전화번호'), t('s1.site_fax', '사업장 — 팩스'),
        ],
      },
      {
        id: 's1.g3',
        fields: [
          t('s1.email', 'E - mail'),
          t('s1.homepage', 'Homepage'),
          t('s1.employees', '상시근로자', undefined, '명'),
          { key: 's1.form', label: '기업형태', kind: 'choice', options: ['개인기업', '법인기업 — 주식회사', '법인기업 — 유한회사', '법인기업 — 합자회사', '법인기업 — 합명회사', '법인기업 — 기타'] },
        ],
      },
      {
        id: 's1.g4',
        title: '<사업 관련 전문자격증 및 지식재산권 보유, 대외기관 인증 및 수상, 창업연수 참여 실적>',
        fields: [
          {
            key: 's1.history', label: '자격증 · 지식재산권 · 인증 · 수상 · 창업연수 실적', kind: 'table', rows: 5, extendable: true,
            columns: [col('ym', '년    월'), col('text', '내           용', { wide: true })],
          },
        ],
      },
    ],
  },
  // ── 2 ───────────────────────────────────────────────────────────────────────
  {
    id: 's2',
    no: '02',
    title: '2. 대표자 및 경영진 현황',
    part: '본문',
    groups: [
      {
        id: 's2.g1',
        title: '대표자',
        fields: [
          t('s2.ceo_name', '성    명'),
          off('s2.ceo_rrn', '주민등록번호', OFFLINE_HINT),
          off('s2.ceo_addr', '현주소지', OFFLINE_HINT),
          off('s2.ceo_tel', '전화 (유선 · 무선)', OFFLINE_HINT),
          t('s2.ceo_edu', '최종학력', '년     월           (고등, 대)학교          과   (졸업, 수료, 중퇴, 재학)'),
          {
            key: 's2.ceo_career', label: '경   력', kind: 'table', rows: 3, extendable: true,
            columns: [col('period', '근무기간(년월)', { placeholder: '.   . ~   .   .' }), col('place', '근 무 처'), col('industry', '업종(품목)'), col('position', '최종직위(담당업무)', { wide: true })],
          },
          off('s2.ceo_house', '거주주택 · 소유자(관계) · 임차관계', OFFLINE_HINT),
          off('s2.ceo_estate', '기타소유부동산', OFFLINE_HINT),
        ],
      },
      {
        id: 's2.g2',
        title: '경  영  진',
        fields: [
          {
            key: 's2.mgmt', label: '경영진', kind: 'table', rows: 5, extendable: true,
            columns: [col('position', '직 위'), col('name', '성  명'), col('relation', '실제경영자와의관계'), col('role', '담당업무 및 주요경력', { wide: true })],
          },
        ],
      },
      {
        id: 's2.g3',
        title: '주 주 상 황',
        fields: [
          {
            key: 's2.holders', label: '주주상황', kind: 'table', rows: 5, extendable: true, totals: ['ratio'],
            columns: [col('name', '주 주 명'), col('relation', '실제경영자와의 관계'), col('ratio', '지분율(%)', { num: true })],
          },
        ],
      },
    ],
  },
  // ── 3 ───────────────────────────────────────────────────────────────────────
  {
    id: 's3',
    no: '03',
    title: '3. 사업장 및 주요시설',
    unit: '단위 : 백만원',
    part: '본문',
    groups: [
      {
        id: 's3.g1',
        title: '사      업      장',
        fields: [
          t('s3.site_addr', '소재지'),
          t('s3.site_owner', '소유자(관계)', '(본인, 친척, 타인)'),
          t('s3.site_lease', '임차관계', '전세      백만원, 월세      천원'),
          t('s3.operation', '가동상황', '월평균    일, 1일평균  시간'),
          t('s3.production', '생산방식', '자사제조    %,   외주가공    %  /  주문생산       %,  시장생산       %'),
        ],
      },
      {
        id: 's3.g2',
        title: '주   요   시   설',
        fields: [
          {
            key: 's3.facilities', label: '주요시설', kind: 'table', rows: 2, extendable: true, totals: ['cost'],
            columns: [col('name', '시  설  명'), col('year', '구입년도'), col('qty', '수량', { num: true }), col('unit', '단위'), col('use', '용  도'), col('cost', '소요자금', { num: true }), col('maker', '제작사')],
          },
          {
            key: 's3.staff', label: '상시근로자 · 비상시근로자', kind: 'grid', unit: '명',
            cells: [col('total', '상시근로자 (계)', { num: true }), col('tech', '기술직', { num: true }), col('skill', '기능직', { num: true }), col('office', '사무직', { num: true }), col('etc', '기타', { num: true }), col('temp', '비상시근로자', { num: true })],
          },
        ],
      },
    ],
  },
  // ── 4 ───────────────────────────────────────────────────────────────────────
  {
    id: 's4',
    no: '04',
    title: '4. 주요거래처 및 결제조건 등',
    unit: '단위 : 백만원',
    part: '본문',
    groups: [
      {
        id: 's4.g1',
        fields: [
          {
            key: 's4.buyers', label: '구  매  처', kind: 'table', rows: 4,
            columns: [col('name', '상호(거래품목)', { wide: true }), col('bizno', '사업자번호'), col('since', '거래기간', { placeholder: '년  월' }), col('term', '결제기간', { placeholder: '일' })],
          },
          {
            key: 's4.sellers', label: '판  매  처', kind: 'table', rows: 4,
            columns: [col('name', '상호(거래품목)', { wide: true }), col('bizno', '사업자번호'), col('since', '거래기간', { placeholder: '년  월' }), col('term', '결제기간', { placeholder: '일' })],
          },
        ],
      },
      {
        id: 's4.g2',
        title: '결 제 조 건 등',
        fields: [
          t('s4.receivable', '매출채권(받을어음)', '(        )'),
          t('s4.payable', '매입채무(지급어음)', '(        )'),
          t('s4.sale_terms', '판매조건', '현금   %, 외상   %(   일)'),
          t('s4.buy_terms', '구매조건', '현금   %, 외상   %(   일)'),
          t('s4.recent_sales', '최근판매실적', '(  .  .  ~  .  .  ):        (      )주)'),
          t('s4.orders', '수주상황', '(  .  .  현재) 국내계약액        (     )주)'),
        ],
      },
    ],
    footnotes: ['주) (   )내에는 수출실적(단위:천불) 및 L/C보유액을 기재'],
  },
  // ── 5 ~ 7 ───────────────────────────────────────────────────────────────────
  {
    id: 's5',
    no: '05',
    title: '5. 지식재산권 등 현황',
    part: '본문',
    groups: [
      {
        id: 's5.g',
        fields: [
          {
            key: 's5.ip', label: '지식재산권 등', kind: 'grid', unit: '건',
            cells: ['특허', '실용신안', '디자인', '상표', '저작권', '신지식재산권', '인증/규격', '혁신형기업 등', '수상'].map((x, i) => col(`c${i}`, x)),
          },
        ],
      },
    ],
    footnotes: ['주) 사업계획서 작성 참고사항(인증 및 수상실적)을 참조하여 작성'],
  },
  {
    id: 's6',
    no: '06',
    title: '6. 개발 인력 현황',
    part: '본문',
    groups: [
      {
        id: 's6.g',
        fields: [
          {
            key: 's6.devstaff', label: '개발인력', kind: 'grid', unit: '명',
            cells: [col('total', '개발인력 (계)', { num: true }), col('top', '특급', { num: true }), col('high', '고급', { num: true }), col('mid', '중급', { num: true }), col('low', '초급', { num: true }), col('etc', '기타', { num: true })],
          },
        ],
      },
    ],
    footnotes: ['주) 사업계획서 작성 참고사항(개발인력 구분 기준)을 참조하여 기술직(기능직 포함) 및 기술개발전담조직 인력에 대해 작성'],
  },
  {
    id: 's7',
    no: '07',
    title: '7. 기술개발 전담조직',
    part: '본문',
    groups: [
      {
        id: 's7.g',
        fields: [
          {
            key: 's7.rnd_org', label: '운영기간', kind: 'grid',
            cells: [col('lab', '기업부설연구소'), col('dept', '연구개발전담부서'), col('etc', '기타연구조직')],
          },
        ],
      },
    ],
    footnotes: ['주) 기업부설연구소 및 연구개발전담부서는 산업기술진흥협회 등록한 경우에 한함'],
  },
  // ── 8 ───────────────────────────────────────────────────────────────────────
  {
    id: 's8',
    no: '08',
    title: '8. 금융회사 거래상황',
    unit: '단위 : 백만원',
    part: '본문',
    groups: [
      {
        id: 's8.g1',
        title: '차       입        금',
        fields: [
          t('s8.loans_asof', '차입금 기준일', '(     년   월   일 현재 )'),
          {
            key: 's8.loans', label: '차입금', kind: 'table', rows: 3, extendable: true, totals: ['general', 'trade', 'discount', 'guarantee', 'facility', 'lease', 'sum'],
            columns: [col('bank', '기관명'), col('general', '운전 — 일반운전', { num: true }), col('trade', '운전 — 무역금융', { num: true }), col('discount', '운전 — 할인어음', { num: true }), col('guarantee', '운전 — 지보 등', { num: true }), col('facility', '시설 — 시설', { num: true }), col('lease', '시설 — 시설대여', { num: true }), col('sum', '계', { num: true })],
          },
        ],
      },
      {
        id: 's8.g2',
        title: '담   보   물   명   세',
        fields: [
          t('s8.collateral_asof', '담보물 기준일', '(     년   월   일 현재 )'),
          {
            key: 's8.collateral', label: '담보물 명세', kind: 'table', rows: 2, extendable: true,
            columns: [col('place', '소  재  지', { wide: true }), col('kind', '종  류'), col('qty', '수  량'), col('owner', '소  유  자(관  계)'), col('amount', '설정액', { num: true }), col('holder', '설정권자')],
          },
        ],
      },
    ],
  },
  // ── 9 ───────────────────────────────────────────────────────────────────────
  {
    id: 's9',
    no: '09',
    title: '9. 자금소요 및 조달계획',
    unit: '단위 : 백만원',
    part: '본문',
    groups: [
      {
        id: 's9.g1',
        title: '총 소요자금',
        fields: [
          {
            key: 's9.working', label: '운 전', kind: 'table', rows: 4, totals: ['amount'], hint: '소  계(①)는 자동으로 셉니다',
            columns: [col('item', '구    분', { wide: true }), col('amount', '금   액', { num: true })],
          },
          {
            key: 's9.facility', label: '시  설', kind: 'table', rows: 4, totals: ['amount'], hint: '소  계(②)는 자동으로 셉니다 · 합   계(①+②) = (A)',
            columns: [col('item', '구    분', { wide: true }), col('amount', '금   액', { num: true })],
          },
        ],
      },
      {
        id: 's9.g2',
        title: '자금조달계획',
        fields: [
          {
            key: 's9.funding', label: '자금조달계획', kind: 'grid',
            hint: '원본 서식에 예시로 적힌 「금융차입 1,000 · (보증신청) (1,000)」은 값으로 쓰지 않았습니다. 합    계(B)는 자동으로 세며, 금액은 (A)=(B)되도록 작성',
            cells: [
              col('own', '자기자금 — 금액', { num: true }), col('own_how', '자기자금 — 조달방법', { wide: true }),
              col('loan', '금융차입 — 금액', { num: true }), col('loan_how', '금융차입 — 조달방법', { wide: true }),
              col('guarantee', '(보증신청) — 금액', { placeholder: '금융차입 중 이번 보증신청분' }), col('guarantee_how', '(보증신청) — 조달방법', { wide: true }),
              col('etc', '기    타 — 금액', { num: true }), col('etc_how', '기    타 — 조달방법', { wide: true }),
            ],
          },
        ],
      },
    ],
    footnotes: [
      '주1) 자금소요 및 조달계획 작성은 신청접수일로부터 12개월 시점까지를 대상으로 기재',
      '(자금조달 계획 작성 시에는 이번 보증신청으로 차입할 금액을 포함하여 기재)',
      '주2) 운전, 시설자금 ‘구분’ 란에는 구체적인 항목 기재(예 : 기계설비 구입, 원자재 구입, 인건비 지급, 임차보증금 등)',
    ],
  },
  // ── 10 ──────────────────────────────────────────────────────────────────────
  {
    id: 's10',
    no: '10',
    title: '10. 보증료(또는 가수금) 환급 시 입금계좌 (법인기업: 법인명의 계좌, 개인기업 등: 대표자 명의 사업용 계좌)',
    part: '본문',
    groups: [
      {
        id: 's10.g',
        fields: [
          t('s10.bank', '금융회사명'),
          off('s10.account', '계좌번호', OFFLINE_HINT),
          t('s10.holder', '예금주', '법인기업은 법인명의 계좌'),
          off('s10.consent', '입금동의 — 동의함 (서명)', '대표자가 원본 서식에서 직접 동의 · 서명합니다. 이 시스템은 동의를 대신 표시하지 않습니다.'),
          {
            key: 's10.notice', label: '환급 안내 (원본 문구)', kind: 'notice',
            text: [
              '▪ 보증기한 전에 대출금이 상환되어 보증이 해지된 경우에는 상환일 다음날 이후의 보증료 수납분을 환급해 드립니다.',
              '▪ 보증료(또는 가수금) 환급은 제출하신 환급계좌로 송금 받으실 수 있으며, 환급계좌 미제출, 변경 등으로 보증료를 환급받지 못한 경우에는 신용 보증기금 홈페이지에서 확인 및 환급 신청이 가능합니다.',
            ],
          },
        ],
      },
    ],
  },
  // ── 11 ──────────────────────────────────────────────────────────────────────
  {
    id: 's11',
    no: '11',
    title: '11. 사업 추진계획 (자유롭게 기재하되, 해당내용을 구체적으로 기재, 필요시 별지 작성)',
    part: '본문',
    groups: [
      {
        id: 's11.mgmt',
        title: '경영진 역량 — (경영진의 경험/전문성/경영철학/기업가정신 등)',
        fields: [
          l('s11.mgmt.background', '□ 경영진의 창업배경'),
          l('s11.mgmt.ceo', 'Ⓐ CEO', '□ 경영진/기술진의 개인별 약력(학력, 경력)을 포함한 기술능력, 경영능력 등을 구체적으로 각각 기술 · * CEO 경영역량의 평가근거가 되는 경험, 수상내용, 기술성과 등을 구체적으로 서술형 기술 · 예) Ⓐ CEO, ㅇㅇㅇ(‘00년생)는 000대 000과를 졸업하고, 000에서 000분야 관련 OO 학위(최종학위 취득일: OO년 O월)를 취득하였으며, 000에서 0000를 담당하여........,'),
          l('s11.mgmt.cto', 'Ⓑ CTO', '예) Ⓑ CTO, OOO(‘00년생)는 000대 000과를 졸업하고, 000에서 000분야 관련 OO 학위(최종학위 취득일: OO년 O월)를 취득하였으며, 000에서 0000를 담당하여........,'),
          l('s11.mgmt.member', 'Ⓒ (핵심 팀원)', '* 핵심 팀원 2~3명의 경력 및 역량을 기술'),
          l('s11.mgmt.philosophy', '□ 경영철학/기업가정신'),
        ],
      },
      {
        id: 's11.prod',
        title: '제품･서비스의 주요내용 — (제품･서비스 또는 비즈니스모델의 개요, 특성/핵심기술/기술개발 내용, 과정)',
        fields: [
          l('s11.prod.bm_a', '□ 비즈니스모델 개요 및 특성 — Ⓐ'),
          l('s11.prod.bm_b', '□ 비즈니스모델 개요 및 특성 — Ⓑ'),
          l('s11.prod.bm_c', '□ 비즈니스모델 개요 및 특성 — Ⓒ'),
          l('s11.prod.core_a', '□ 핵심기술 — Ⓐ'),
          l('s11.prod.core_b', '□ 핵심기술 — Ⓑ'),
          l('s11.prod.core_c', '□ 핵심기술 — Ⓒ'),
          l('s11.prod.dev_a', '□ 기술개발 내용 및 과정 — Ⓐ'),
          l('s11.prod.dev_b', '□ 기술개발 내용 및 과정 — Ⓑ'),
          l('s11.prod.dev_c', '□ 기술개발 내용 및 과정 — Ⓒ'),
          l('s11.prod.growth_a', '□ 제품/서비스(핵심기술)의 사업성 및 성장전략 — Ⓐ', '☞매출과 연계된 사업성 및 확장가능성을 중점 작성!'),
          l('s11.prod.growth_b', '□ 제품/서비스(핵심기술)의 사업성 및 성장전략 — Ⓑ', '☞매출과 연계된 사업성 및 확장가능성을 중점 작성!'),
          l('s11.prod.growth_c', '□ 제품/서비스(핵심기술)의 사업성 및 성장전략 — Ⓒ', '☞매출과 연계된 사업성 및 확장가능성을 중점 작성!'),
        ],
      },
      {
        id: 's11.market',
        title: '시 장 분 석 — (시장규모/주요 수요처/동업종 경쟁상황, 경쟁업체 현황/규제 및 지원요인 등)',
        fields: [
          l('s11.market.target', '□ 타겟시장 분석(시장규모, 주요 수요처, 규제 및 지원요인)'),
          l('s11.market.compete', '□ 경쟁기업 업체 현황(경쟁상황, 유사경쟁업체)'),
        ],
      },
      {
        id: 's11.tech',
        title: '기술 및 품질 경쟁력 — (연구개발 능력/기술 및 품질의 차별성/국내외 경쟁사 제품과의 기술, 품질, 가격 비교 등 경쟁력)',
        fields: [
          l('s11.tech.core_a', '□ 제품/서비스(기술)의 핵심 기술력 — Ⓐ', '(보유 기술력의 가장 핵심적인 내용을 요약 기술)'),
          l('s11.tech.core_b', '□ 제품/서비스(기술)의 핵심 기술력 — Ⓑ', '(보유 기술력의 가장 핵심적인 내용을 요약 기술)'),
          l('s11.tech.core_c', '□ 제품/서비스(기술)의 핵심 기술력 — Ⓒ', '(보유 기술력의 가장 핵심적인 내용을 요약 기술)'),
          l('s11.tech.rnd', '□ 제품(핵심기술)의 독창성 — Ⓐ 연구개발 능력(개발인력, 업종 Network 현황, 비상근 인력/고객사/동종업계와의 협업관계 등등)', '* R&D과제의 수행능력에 관련 내용 중점기술'),
          l('s11.tech.diff', '□ 제품(핵심기술)의 독창성 — Ⓑ 기술, 품질, 가격 측면 등의 차별적 요소 (경쟁사(제품)과의 비교)'),
        ],
      },
      {
        id: 's11.plan',
        title: '향후 계획 — (개발완료 및 제품화 시기 등 제품･서비스의 사업화 실현 계획/설비도입 및 양산착수, 판매 등의 계획/향후 매출 전망 및 수익 창출 계획 등)',
        fields: [
          l('s11.plan.commercial', '(협약내용 등 포함) — 향후 사업화 추진계획'),
          revenueTable('s11.plan.y1', '□ 매출전망 및 산정근거 — Ⓐ 1차년도 (26.2월~27.1월)', '원본 서식의 기간 「26.2월~27.1월」은 예시입니다 — 실제 신청 접수월 다음 달부터 1년으로 맞춰야 합니다(확인 필요).'),
          l('s11.plan.y1_note', 'Ⓐ 1차년도 — ★매출 예상근거를 구체적으로 제시'),
          revenueTable('s11.plan.y2', '□ 매출전망 및 산정근거 — Ⓑ 2차년도 (27.2월~28.1월)', '원본 서식의 기간은 예시입니다 — 1차년도에 이은 다음 1년(확인 필요).'),
          l('s11.plan.y2_note', 'Ⓑ 2차년도 — ★매출 예상근거를 구체적으로 제시'),
          revenueTable('s11.plan.y3', '□ 매출전망 및 산정근거 — Ⓒ 3차년도 (28.2월~29.1월)', '원본 서식의 기간은 예시입니다 — 2차년도에 이은 다음 1년(확인 필요).'),
          l('s11.plan.y3_note', 'Ⓒ 3차년도 — ★매출 예상근거를 구체적으로 제시'),
          {
            key: 's11.plan.sum_limit', label: '※ ★ 매출전망 요약정리 — 추정 매출액(한도산정)', kind: 'grid', unit: '백만원',
            cells: [col('a', 'Ⓐ (26.2월~27.1월)', { num: true }), col('b', 'Ⓑ (27.2월~28.1월)', { num: true }), col('c', 'Ⓒ(28.2월~29.1월)', { num: true })],
            hint: '열 제목의 기간은 원본 서식의 예시입니다 — 실제 차년도 기간과 맞는지 확인 필요.',
          },
          {
            key: 's11.plan.sum_annual', label: '※ ★ 매출전망 요약정리 — 연간 매출액(회계기준)', kind: 'grid', unit: '백만원',
            cells: [col('y2026', '2026년(1.1~12.31)', { num: true }), col('y2027', '2027년(1.1~12.31)', { num: true }), col('y2028', '2028년(1.1~12.31)', { num: true })],
            hint: '원본 서식의 「0백만원」은 예시 자리입니다. 회계기준(1.1~12.31) — 결산 전 숫자는 예상치로 표시.',
          },
        ],
      },
    ],
  },
  // ── (추가) 대표자 서식 ×3 ─────────────────────────────────────────────────────
  extraCeo(1),
  extraCeo(2),
  extraCeo(3),
  // ── 사업계획서 작성 참고사항 (참고 — 값 없음) ──────────────────────────────────
  {
    id: 'ref1',
    no: '참고',
    title: '사업계획서 작성 참고사항 (사업계획서 별첨)',
    part: '참고',
    groups: [],
    refs: [
      {
        title: '◇ 인증 및 수상실적',
        rows: [
          ['구분', '', '대상'],
          ['인증', '규격(제품인증)', 'KS(한국산업표준규격), JIS(일본산업규격), UL(미보험자협회안전규격), CE(유럽안전규격), CSA(캐나다표준협회)'],
          ['', '고도인증', 'NET, NEP, 우수조달제품인증, 성능인증(EPC), 녹색기술인증, 세계일류상품'],
          ['', '일반인증', 'GS, GD, 단체표준인증, 건마크, Q마크, K마크, 품질보증조달물품, 성과공유확인제'],
          ['', '', 'GR, 환경표지인증, 고효율에너지기자재인증, 에너지소비효율등급표시제, 신재생에너지설비인증'],
          ['', '', 'ISO9000시리즈, ISO4000시리즈, IATF16949, HACCP'],
          ['', '', '산업별 부품업체 기술인증(SQ 등) - 기타 위에 준하는 국내외 인증 (e나라표준인증 http://standard.go.kr 참조)'],
          ['수상', '정부, 공공기관, 지자체 수상', 'IR52 장영실상(한국산업기술진흥협회) / 대한민국 기술대상(산업통상부) / 특허기술상(지식재산처) / 중소기업유공자포상(중소벤처기업부) / 중소기업 기술·경영혁신대전포상(중소벤처기업부) / 벤처창업진흥 유공포상(중소벤처기업부) / 도전!K-스타트업 통합본선 이상 수상(창업진흥원) / 대한민국 엔지니어상(한국산업기술진흥협회) - 그 외 정부, 공공기관, 지자체 주관 수상'],
          ['', '민간기관 수상', '산업기술혁신대상(한국산업기술문화재단) / 대한민국 소프트웨어대상(한국인공지능·소프트웨어산업협회) / 다산기술상(한국경제신문사) / 대한민국 임팩테크 대상(한국경제신문사) / 아모레퍼시픽 여성과학자상(한국여성과학기술단체 총연합회) / 대한민국최고과학기술인상 / 한국과학상 / 한국공학상 / 젊은 과학자상(한국연구재단) / 올해의 여성과학기술인상(한국여성과학기술인육성재단) - 그 외 재단, 신문사, 기타 민간 주관 수상'],
          ['혁신형기업', '', '경영혁신형중소기업, 벤처기업, INNO-BIZ기업'],
        ],
      },
      {
        title: '◇ R&D 기자재 구분 기준 — 생산설비: 토지와 건설 중인 자산을 제외한 주된 생산시설 · 기술개발장비: 기술개발을 효율적으로 추진하는데 필요한 장비',
        rows: [
          ['종류', '정의'],
          ['기술개발 기자재', '기술개발 수행에 직접적으로 사용되는 기자재 (실험대, 개수대, 비커, 실린더 등) ※ 개인용 책상, 컴퓨터, 프린터, 복사기 등은 기술개발 기자재에 해당되지 않음'],
          ['연구개발 장비', '연구개발목적으로 이용되는 장비로 진공, 진동, 압력, 냉동, 무균, 청청, 무향, 저온, 고온, 항온, 항습, 풍속, 주행, 충돌, 충격 등의 환경을 만들어 주는 장비'],
          ['측정분석 장비', '질량분석기, 전자현미경 등 제품(기술)의 사양 및 표준화 확보를 위한 분석,계측 기능을 갖춘 장비'],
        ],
      },
      {
        title: '◇ 개발인력 구분 기준 — 기술자격 : 기술자격(기술사, 기사) 취득 후 근무경력에 따라 분류 (* 기능장이 존재하는 경우 기술사에 준하여 평가)',
        rows: [
          ['구분', '특급기술자', '고급기술자', '중급기술자', '초급기술자', '기타'],
          ['기술사', '4년 이상', '1년 이상', '1년 미만', '-', '-'],
          ['기사', '10년 이상', '7년 이상', '4년 이상', '1년 이상', '1년 미만'],
          ['산업기사', '13년 이상', '10년 이상', '7년 이상', '4년 이상', '4년 미만'],
        ],
      },
      {
        title: '교육수준 : 보유 기술과 연관되어 취득 후 근무경력에 따라 분류',
        rows: [
          ['학위', '특급기술자', '고급기술자', '중급기술자', '초급기술자', '기타'],
          ['박사', '3년 이상', '3년 미만', '-', '-', '-'],
          ['석사', '9년 이상', '6년 이상', '3년 이상', '3년 미만', '-'],
          ['학사', '12년 이상', '9년 이상', '6년 이상', '3년 이상', '3년 미만'],
          ['전문학사', '15년 이상', '12년 이상', '9년 이상', '6년 이상', '6년 미만'],
          ['고졸', '-', '15년 이상', '12년 이상', '9년 이상', '9년 미만'],
        ],
      },
    ],
  },
  // ── 별첨 — 리틀펭귄/퍼스트펭귄/Pre-ICON 보증용 ───────────────────────────────
  {
    id: 'a1',
    no: '별첨',
    title: '□ 추정매출액 및 고용창출 ★ ☞ 2차, 3차 지원을 위한 경영목표로 설정되는 점에 주의!!!!',
    part: '별첨',
    note: '원본 표제: 「리틀펭귄/퍼스트펭귄/Pre-ICON 보증용 (사업계획서 별첨)」 — 뉴본펭귄 신청에 이 별첨이 필요한지 신보 담당자에게 확인 필요.',
    groups: [
      {
        id: 'a1.g1',
        title: '매출 추정',
        fields: [
          {
            key: 'a.periods', label: '차년도 기간', kind: 'grid',
            cells: [col('y1', '1차년도', { placeholder: '년  월 ～   년   월' }), col('y2', '2차년도', { placeholder: '년  월 ～  년  월' }), col('y3', '3차년도', { placeholder: '년  월 ～   년  월' })],
          },
          {
            key: 'a.sales_total', label: '추정매출액', kind: 'grid', unit: '백만원',
            cells: [col('y1', '1차년도', { num: true }), col('y2', '2차년도', { num: true }), col('y3', '3차년도', { num: true })],
          },
          {
            key: 'a.sales_items', label: '품목별 매출액 (품목명 · 세부매출)', kind: 'table', rows: 4, unit: '백만원', totals: ['y1', 'y2', 'y3'],
            columns: [col('item', '품목명', { wide: true }), col('y1', '1차년도 세부매출', { num: true }), col('y2', '2차년도 세부매출', { num: true }), col('y3', '3차년도 세부매출', { num: true })],
          },
          {
            key: 'a.sales_basis', label: '매출추정근거 (간략 기술)', kind: 'grid',
            cells: [col('y1', '1차년도', { wide: true }), col('y2', '2차년도', { wide: true }), col('y3', '3차년도', { wide: true })],
          },
        ],
      },
      {
        id: 'a1.g2',
        title: '고용 창출',
        fields: [
          {
            key: 'a.jobs', label: '상시근로자수', kind: 'grid', unit: '명',
            hint: '증가예상 상시근로자수(B-A)는 자동으로 셉니다',
            cells: [col('now', '현재 상시근로자수(A) ①', { num: true }), col('y1', '1차년도말 예상(B) ②', { num: true }), col('y2', '2차년도말 예상(B) ③', { num: true }), col('y3', '3차년도말 예상(B) ④', { num: true })],
          },
        ],
      },
    ],
    footnotes: ['(주1) 1차년도 추정매출액은 접수일이 속한 월의 다음 월로부터 향후 1년간의 매출추정액, 2차년도 추정매출액은 1차년도에 이은 다음 1년간 매출추정액 , 3차년도 추정매출액은 2차년도에 이은 다음 1년간 매출추정액 적용'],
  },
  {
    id: 'a2',
    no: '별첨',
    title: '□ 1차년도 소요자금 계획',
    part: '별첨',
    groups: [
      {
        id: 'a2.g1',
        fields: [
          t('a.funds_period', '보증신청 접수일 이후 1년', '(  년  월 ～  년  월)'),
          {
            key: 'a.funds', label: '소요자금', kind: 'table', rows: 11, totals: ['amount'],
            rowLabels: ['연구개발비', '금융비용', '생산(서비스 제공) 관련 — 인건비', '생산(서비스 제공) 관련 — 원자재구입', '생산(서비스 제공) 관련 — 임차료', '생산(서비스 제공) 관련 — 제세공과금', '생산(서비스 제공) 관련 — 기타', '마케팅 관련 — 인건비', '마케팅 관련 — 광고비', '마케팅 관련 — 기타', '그 밖의 부대비용'],
            columns: [col('amount', '금액', { num: true }), col('basis', '예상소요자금 작성근거', { wide: true })],
          },
        ],
      },
      {
        id: 'a2.g2',
        title: '□ 자금소요 계획 및 조달방법',
        fields: [
          l('a.funds_plan', '○ 자금소요 계획', '(앞페이지 하단 1차년도 자금소요계획과 연계하여 항목별로 자금소요액을 기술(상세히))'),
          l('a.funds_source', '○ 자금조달 방법', '(신보 차입금, 투자유치(TIPS), SI투자 논의사항 등)'),
        ],
      },
    ],
  },
  {
    id: 'a3',
    no: '별첨1',
    title: '[별첨1] 현금 유출 · 유입 (결제기간별)',
    part: '별첨',
    groups: [
      {
        id: 'a3.g',
        fields: [
          {
            key: 'a.cash_months', label: '결제기간 기준 월', kind: 'grid',
            hint: '원본 서식의 「’26.2 · ’26.3 · ’26.4 · ’26.5」는 예시입니다 — 제출하는 달 기준으로 맞춰야 합니다(확인 필요).',
            cells: [col('m0', '당월'), col('m1', '1개월 이내'), col('m2', '2개월 이내'), col('m3', '3개월 이내')],
          },
          {
            key: 'a.cash', label: '현금 유출 · 유입', kind: 'table', rows: 7,
            hint: '원본 표의 예시 숫자(700 · 50 · 600 · 936 · 255 · 86 · 241 · 595 · 1,200 · 3,500 · 5,636)는 쓰지 않았습니다. 소계(②) · 3개월 이후(①-②)는 자동으로 셉니다.',
            rowLabels: ['현금유출 — 매입채무 — 외상매입금', '현금유출 — 매입채무 — 지급어음', '현금유출 — 회전성 운전자금(구매자,무역금융,Usance)', '현금유입 — 매출채권 — 외상매출금', '현금유입 — 매출채권 — 받을어음', '현금유입 — 현금보유 — 종통대 등 한도여유액', '현금유입 — 현금보유 — 투자유치잔액, 예금 등'],
            columns: [col('balance', '제출일 현재잔액(①)', { num: true }), col('m0', '당월', { num: true }), col('m1', '1개월 이내', { num: true }), col('m2', '2개월 이내', { num: true }), col('m3', '3개월 이내', { num: true })],
          },
        ],
      },
    ],
    footnotes: ['☞ 제출일 전일자 기준으로 작성 (매출이 없다면 매출채권은 ‘0’ )'],
  },
  {
    id: 'a4',
    no: '별첨2',
    title: '[별첨2] 기술역량평가용 기술개요표',
    part: '별첨',
    groups: [
      {
        id: 'a4.g1',
        title: '1. 기업체 보유기술 — 기술분류',
        fields: [
          {
            key: 'a.tech_items', label: '보유기술', kind: 'table', rows: 3, rowLabels: ['보유기술Ⅰ', '보유기술Ⅱ', '보유기술Ⅲ'],
            columns: [col('name', '기술명'), col('detail', '기술의 세부설명', { wide: true })],
          },
        ],
      },
      {
        id: 'a4.g2',
        title: '2. 대표자의 기술력 현황',
        fields: [
          {
            key: 'a.tech_ceo_career', label: '주요경력', kind: 'table', rows: 4,
            hint: '주) 기업이 보유한 기술과 관련된 연구소 또는 기술개발부서에서 근무한 연수입력',
            columns: [col('period', '기간(년/월)'), col('place', '근 무 처', { wide: true }), col('years', '기술개발경험주)')],
          },
          {
            key: 'a.tech_ceo_edu', label: '기술관련 교육수준 — 전공', kind: 'grid',
            cells: [col('hs', '고졸'), col('assoc', '전문학사'), col('bach', '학사'), col('master', '석사'), col('phd', '박사')],
          },
          {
            key: 'a.tech_ceo_license', label: '기술관련 자격 보유현황', kind: 'grid',
            cells: [col('ind_name', '산업기사 — 자격증명'), col('ind_date', '산업기사 — 취득일'), col('eng_name', '기사 — 자격증명'), col('eng_date', '기사 — 취득일'), col('pe_name', '기술사 — 자격증명'), col('pe_date', '기술사 — 취득일')],
          },
        ],
      },
      {
        id: 'a4.g3',
        title: '3. 기술인력 현황(작성요령 참고) — 단위: 명',
        fields: [
          {
            key: 'a.tech_staff', label: '기술인력', kind: 'grid', unit: '명',
            hint: '주1) - 경영진: 경영자를 제외한 관리, 기획, 재무, 기술, 마케팅 등 담당 핵심인력 - 기술개발인력: 기술직(기능직 포함) 및 기술개발전담조직 인력',
            cells: [
              col('m_top', '경영진 — 특급', { num: true }), col('m_high', '경영진 — 고급', { num: true }), col('m_mid', '경영진 — 중급', { num: true }), col('m_low', '경영진 — 초급', { num: true }), col('m_etc', '경영진 — 기타', { num: true }),
              col('d_top', '기술개발인력 — 특급', { num: true }), col('d_high', '기술개발인력 — 고급', { num: true }), col('d_mid', '기술개발인력 — 중급', { num: true }), col('d_low', '기술개발인력 — 초급', { num: true }), col('d_etc', '기술개발인력 — 기타', { num: true }),
            ],
          },
          {
            key: 'a.tech_rnd_org', label: '기술개발 전담조직 — 운영기간', kind: 'grid',
            hint: '주2) 기업부설연구소 및 연구개발전담부서는 산업기술진흥협회에 등록한 경우에 한함',
            cells: [col('lab', '기업부설연구소'), col('dept', '연구개발전담부서'), col('etc', '기타연구조직')],
          },
        ],
      },
      {
        id: 'a4.g4',
        title: '4. 사업장 및 기술력 현황',
        fields: [
          {
            key: 'a.tech_invest', label: '- 설비 투자 계획 (기술개발 인프라 — 도입 및 투자 계획)', kind: 'grid',
            cells: [col('prod', '생산설비', { wide: true }), col('equip', '기술개발장비', { wide: true }), col('invest', '기술개발투자비', { wide: true })],
          },
          {
            key: 'a.tech_records', label: '- 기술개발 및 수상 ･ 인증 실적', kind: 'grid', unit: '건',
            cells: [col('commercial', '기술상용화 실적'), col('dev', '기술개발 실적'), col('product', '제품상용화 실적'), col('cert_high', '인증 실적(고도)'), col('cert', '인증 실적(일반)'), col('award', '수상 실적')],
          },
          {
            key: 'a.tech_ip', label: '- 지식재산권 보유수준', kind: 'grid', unit: '건',
            cells: [
              col('pat_reg', '특허 — 등록'), col('pat_app', '특허 — 출원'), col('um_reg', '실용신안 — 등록'), col('um_app', '실용신안 — 출원'), col('um_pre', '실용신안 — 선등록'),
              col('valuation', '기술가치평가서 보유 기술'), col('design', '디자인'), col('program', '프로그램 등록'), col('trademark', '상표권'), col('plant', '품종보호권'), col('copyright', '저작권'), col('newip', '신지식재산권'),
            ],
          },
        ],
      },
    ],
  },
  // ── 작성요령 (참고) ──────────────────────────────────────────────────────────
  {
    id: 'ref2',
    no: '참고',
    title: '※「기술역량평가」관련 기업개요표 작성요령',
    part: '참고',
    groups: [],
    refs: [
      {
        title: '▷ 기술인력 구분 기준 — 기술자격 : 기술자격(기술사, 기사) 취득 후 경과기간 (* 기능장이 존재하는 경우 기술사에 준하여 평가)',
        rows: [
          ['구분', '특급기술자', '고급기술자', '중급기술자', '초급기술자', '기타'],
          ['기술사', '4년 이상', '1년 이상', '1년 미만', '-', '-'],
          ['기사', '10년 이상', '7년 이상', '4년 이상', '1년 이상', '1년 미만'],
          ['산업기사', '13년 이상', '10년 이상', '7년 이상', '4년 이상', '4년 미만'],
        ],
      },
      {
        title: '교육수준 : 보유 기술과 연관되어 취득한 최종 학위',
        rows: [
          ['학위', '특급기술자', '고급기술자', '중급기술자', '초급기술자', '기타'],
          ['박사', '3년 이상', '3년 미만', '-', '-', '-'],
          ['석사', '9년 이상', '6년 이상', '3년 이상', '3년 미만', '-'],
          ['학사', '12년 이상', '9년 이상', '6년 이상', '3년 이상', '3년 미만'],
          ['전문학사', '15년 이상', '12년 이상', '9년 이상', '6년 이상', '6년 미만'],
          ['고졸', '-', '15년 이상', '12년 이상', '9년 이상', '9년 미만'],
        ],
      },
      {
        title: '▷ 기술개발인프라 구분 기준 — 생산설비 : 토지와 건설 중인 자산을 제외한 주된 생산시설 · 기술개발장비 : 기술개발을 효율적으로 추진하는데 필요한 장비',
        rows: [
          ['종류', '정의'],
          ['기술개발 기자재', '기술개발 수행에 직접적으로 사용되는 기자재 (실험대, 개수대, 비커, 실린더 등) ※ 개인용 책상, 컴퓨터, 프린터, 복사기 등은 기술개발 기자재에 해당되지 않음'],
          ['연구개발 장비', '연구개발목적으로 이용되는 장비로 진공, 진동, 압력, 냉동, 무균, 청청, 무향, 저온, 고온, 항온, 항습, 풍속, 주행, 충돌, 충격 등의 환경을 만들어 주는 장비'],
          ['측정분석 장비', '질량분석기, 전자현미경 등 제품(기술)의 사양 및 표준화 확보를 위한 분석, 계측 기능을 갖춘 장비'],
          ['기술개발투자비', '실험·연구 등의 활동이나 신제품 개발활동에 발생하는 경상적인 비용으로 손익계산서 및 제조원가명세서상 연구비 및 경상개발비로 계상되는 금액'],
          ['결산 확정 여부에 따른 도입 및 투자계획', '조사기준일(2019.2월) 현재 결산이 확정되기 전인 경우: 2018년에 도입한 설비 등의 금액 / 조사기준일(2019.5월) 현재 결산이 확정된 경우: 2019년에 도입하였거나 도입할 설비 등의 금액'],
        ],
      },
      {
        title: '▷ 인증 및 수상 인정 기준',
        rows: [
          ['구분', '', '대상'],
          ['인증', '고도인증', 'NET, NEP, 전력신기술인증, 우수조달제품인증, 성능인증(EPC), 녹색기술인증, 교통신기술, 세계일류상품'],
          ['', '일반인증', 'GS, GD, 단체표준인증, 건마크, Q마크, K마크, 자가품질보증물품, 성과공유확인제'],
          ['', '녹색인증', 'GR, 환경표지인증, 고효율에너지기자재인증, 에너지소비효율등급표시제, 신재생에너지설비인증'],
          ['', '품질인증', 'ISO9000시리즈, ISO4000시리즈, QS9000시리즈, TS16949, HACCP, 싱글PPM, 100PPM'],
          ['', '제품인증', 'KS, KC, UL, JIS, CSA, IEC'],
          ['', '기타인증', '산업별 부품업체 기술인증(SQ 등) - 기타 위에 준하는 국내외 인증 (국가표준인증 통합정보시스템 http://standard.go.kr 참조)'],
          ['수상', '정부, 공공기관, 지자체 수상', 'IR52 장영실상(한국산업기술진흥협회) / 10대 신기술상(산업통상자원부) / 특허기술상(특허청) / 중소기업대상(중소벤처기업진흥공단) / 중소기업 기술혁신상(중소벤처기업부) / World Class 300(중소벤처기업부) / 대한민국 벤처창업대전(창업진흥원) / 실전창업리그 전국본선 이상 수상(창업진흥원) / 이달의 엔지니어상(한국산업기술진흥협회) - 그 외 정부, 공공기관, 지자체 주관 수상'],
          ['', '민간기관 수상', '산업기술혁신대상(한국산업기술재단) / 대한민국 소프트웨어대상(한국소프트웨어산업협회) / 양백기술상(양백재단) / 다산기술상(한국경제신문사) / 과학기술자상(한국과학재단) / 벤처기업상(한국종합기술금융) / 멀티미디어 기술대상(한국경제신문사) / 아모레퍼시픽 여성과학자상(한국여성과학기술단체 총연합회) / 대한민국최고과학기술인상 / 한국과학상 / 한국공학상 / 이달의 젊은 과학자상 / 올해의 여성과학기술자상(한국과학기술한림원) - 그 외 재단, 신문사, 기타 민간 주관 수상'],
        ],
      },
    ],
  },
]

//  원본은 칸 이름을 글자 사이를 띄워 적었습니다(「대 표 자 명」 · 「사      업      장」).
//  화면 · 위치 이름에서는 붙여 씁니다(「대표자명」 · 「사업장」). 뜻은 같습니다.
function tidy(x: string): string {
  const parts = x.trim().split(/\s+/)
  return parts.length >= 2 && parts.every((p) => /^[가-힣]$/.test(p)) ? parts.join('') : x
}
for (const s of SECTIONS)
  for (const g of s.groups) {
    if (g.title) g.title = tidy(g.title)
    for (const f of g.fields) f.label = tidy(f.label)
  }

// ── 찾아보기 ─────────────────────────────────────────────────────────────────
export interface FieldRef {
  def: FieldDef
  section: Section
  group: Group
  /** 「11. 사업 추진계획 › 시장분석 › 타겟시장 분석」 같은 위치 이름 */
  path: string
}

/** 목차 · 위치 이름용 짧은 제목 — 「10. 보증료(또는 가수금) 환급 시 입금계좌」 · 「대표자 추가 서식 ①」 */
export function shortTitle(s: Section): string {
  if (s.id === 'cover') return '표지 · 확약'
  if (s.part === '추가 서식') return `대표자 추가 서식 ${s.no.replace('추가', '')}`
  return s.title
    .replace(/\s+\(.*$/, '')
    .replace(/\s*★.*$/, '')
    .replace(/^□\s*/, '')
    .replace(/^※\s*/, '')
    .trim()
}
/** 묶음 제목에서 「 — (설명)」을 뗀 것 */
export const groupTitle = (g: Group) => g.title?.replace(/\s*—.*$/, '').replace(/\s+/g, ' ').trim() ?? ''

export const FIELD_REFS: FieldRef[] = SECTIONS.flatMap((s) =>
  s.groups.flatMap((g) =>
    g.fields.map((def) => ({
      def,
      section: s,
      group: g,
      path: [shortTitle(s), groupTitle(g), def.label].filter(Boolean).join(' › '),
    })),
  ),
)
export const FIELD_BY_KEY = new Map(FIELD_REFS.map((r) => [r.def.key, r]))

/** 값을 받는 칸인가 (확약 문구 · 저장 안 하는 칸은 아님) */
export const isEditable = (d: FieldDef) => d.kind !== 'notice' && d.kind !== 'offline'
export const EDITABLE_REFS = FIELD_REFS.filter((r) => isEditable(r.def))
/** 이 시스템이 저장하지 않는 칸 — 서버(bizplan_locked_keys)와 같아야 합니다 */
export const OFFLINE_KEYS = FIELD_REFS.filter((r) => r.def.kind === 'offline').map((r) => r.def.key)

// ── 값 다루기 ────────────────────────────────────────────────────────────────
export function emptyValue(d: FieldDef): Value {
  if (d.kind === 'table') return d.rowLabels ? d.rowLabels.map(() => ({})) : []
  if (d.kind === 'grid') return {}
  return ''
}

/** 비어 있는가 — 공백 · 빈 표 · 빈 칸 묶음 */
export function isBlank(v: Value | null | undefined): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.every((r) => Object.values(r ?? {}).every((x) => String(x ?? '').trim() === ''))
  return Object.values(v).every((x) => String(x ?? '').trim() === '')
}

/** 숫자 칸 읽기 — 「1,200」 · 「약 930」 · 「930 (예상)」에서 첫 숫자 */
export function numOf(s: string | undefined): number | null {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

export function columnTotal(rows: TableRow[], key: string): number | null {
  let sum = 0
  let any = false
  for (const r of rows) {
    const n = numOf(r?.[key])
    if (n != null) {
      sum += n
      any = true
    }
  }
  return any ? Math.round(sum * 100) / 100 : null
}

/** 사람이 읽는 글 (복사 · 내보내기 · 비교에 씀) — 검토 표시는 넣지 않습니다 */
export function plainText(d: FieldDef, v: Value | null | undefined): string {
  if (d.kind === 'notice') return d.text.join('\n')
  if (d.kind === 'offline') return '(제출본에 직접 기입)'
  if (v == null) return ''
  if (d.kind === 'table') {
    const rows = Array.isArray(v) ? v : []
    const lines = rows
      .map((r, i) => {
        const label = d.rowLabels?.[i]
        const cells = d.columns.map((c) => `${c.label}: ${String(r?.[c.key] ?? '').trim()}`).filter((x) => !/: $/.test(x))
        if (!label && cells.length === 0) return ''
        return [label, ...cells].filter(Boolean).join(' | ')
      })
      .filter(Boolean)
    if (d.totals?.length) {
      const sums = d.totals
        .map((k) => [d.columns.find((c) => c.key === k)?.label ?? k, columnTotal(rows, k)] as const)
        .filter(([, n]) => n != null)
        .map(([lb, n]) => `${lb} ${n!.toLocaleString('ko-KR')}`)
      if (sums.length) lines.push(`합계: ${sums.join(' · ')}`)
    }
    return lines.join('\n')
  }
  if (d.kind === 'grid') {
    const g = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as GridValue
    return d.cells
      .map((c) => `${c.label}: ${String(g[c.key] ?? '').trim()}`)
      .filter((x) => !/: $/.test(x))
      .join(' · ')
  }
  return typeof v === 'string' ? v : ''
}

/** 줄 단위 비교 — 바꾸기 전 · 후를 나란히 보여 줄 때 (LCS) */
export type DiffLine = { op: 'same' | 'del' | 'add'; text: string }
export function diffLines(before: string, after: string): DiffLine[] {
  //  한쪽이 비어 있으면 빈 줄을 「지움」으로 보이지 않게
  if (!before.trim()) return after.split('\n').map((x) => ({ op: 'add' as const, text: x }))
  if (!after.trim()) return before.split('\n').map((x) => ({ op: 'del' as const, text: x }))
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  if (n * m > 250000) {
    //  너무 크면 통째로 — 비교 계산이 화면을 멈추지 않게
    return [...a.map((x) => ({ op: 'del' as const, text: x })), ...b.map((x) => ({ op: 'add' as const, text: x }))]
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: 'del', text: a[i++] })
    else out.push({ op: 'add', text: b[j++] })
  }
  while (i < n) out.push({ op: 'del', text: a[i++] })
  while (j < m) out.push({ op: 'add', text: b[j++] })
  return out
}

// ── 서버에서 온 자료 ─────────────────────────────────────────────────────────
export interface FieldRow {
  key: string
  value: Value
  status: FieldStatus
  basis: Basis
  rev: number
  updated_at: string | null
  updated_by: string
}
export interface RequestRow {
  id: string
  key: string
  key_label: string
  req_type: ReqType
  body: string
  suggestion: string
  snapshot: Value | null
  prev_status: string
  requester_name: string
  requester_title: string
  created_at: string
  status: ReqStatus
  handler_name: string
  handled_at: string | null
  resolution: string
  applied_revision: number | null
  updated_at: string
  /** 내가 남긴 요청인가 (서버가 판단 — 요청자 id 는 보내지 않음) */
  mine?: boolean
}
export interface CheckRow {
  key: string
  profile_id: string
  mark: CheckMark
  note: string
  name: string
  title: string
  at: string
}
export interface MemberRow {
  profile_id: string
  name: string
  title: string
  role: 'editor' | 'reviewer'
}
export interface VersionMeta {
  id: number
  label: string
  note: string
  is_submission: boolean
  doc_status: string
  created_by: string
  created_at: string
}
export interface DocRow {
  id: string
  status: DocStatus
  version_label: string
  locked_label: string
  updated_at: string | null
  updated_by: string
}
export interface OpenData {
  me: { id: string; name: string; title: string; role: 'editor' | 'reviewer' }
  can_manage: boolean
  locked_keys: string[]
  doc: DocRow
  fields: FieldRow[]
  requests: RequestRow[]
  checks: CheckRow[]
  members: MemberRow[]
  versions: VersionMeta[]
}
export interface RevisionRow {
  id: number
  key: string
  before_value: Value | null
  after_value: Value | null
  before_status: string
  after_status: string
  before_basis: Basis | null
  after_basis: Basis | null
  reason: string
  request_id: string | null
  version_label: string
  actor_name: string
  actor_title: string
  at: string
}
export interface RequestLogRow {
  id: number
  request_id: string
  from_status: string
  to_status: string
  note: string
  actor_name: string
  at: string
}
export interface CheckLogRow {
  id: number
  key: string
  name: string
  mark: CheckMark | null
  note: string
  at: string
}
export interface HistoryData {
  revisions: RevisionRow[]
  request_log: RequestLogRow[]
  check_log: CheckLogRow[]
}

// ── 한눈에 — 진행률 · 남은 일 ─────────────────────────────────────────────────
export function statusOf(fields: Map<string, FieldRow>, key: string): FieldStatus {
  return fields.get(key)?.status ?? '작성 전'
}

export interface Summary {
  total: number
  /** 내용이 실제로 들어 있는 칸 (상태만 붙고 비어 있는 칸은 넣지 않음) */
  written: number
  final: number
  needCheck: number
  requested: number
  notWritten: number
  openRequests: number
  progress: number
}
/** 칸이 비어 있는가 — 상태가 「확인 필요」여도 내용이 없으면 미작성입니다 */
export const isUnwritten = (fields: Map<string, FieldRow>, key: string) => isBlank(fields.get(key)?.value)

export function summarize(fields: Map<string, FieldRow>, requests: RequestRow[]): Summary {
  const total = EDITABLE_REFS.length
  let written = 0
  let final = 0
  let needCheck = 0
  let requested = 0
  for (const r of EDITABLE_REFS) {
    const st = statusOf(fields, r.def.key)
    if (!isUnwritten(fields, r.def.key)) written++
    if (st === '최종 확인 완료') final++
    if (st === '확인 필요') needCheck++
    if (st === '수정 요청 있음') requested++
  }
  const openRequests = requests.filter((q) => OPEN_REQ.includes(q.status)).length
  return { total, written, final, needCheck, requested, notWritten: total - written, openRequests, progress: total ? Math.round((written / total) * 100) : 0 }
}

/** 한 사람이 「동의」 · 다른 사람이 「수정 의견」처럼 갈리면 의견 조율 필요 */
export function needsAlignment(checks: CheckRow[]): boolean {
  const marks = new Set(checks.map((c) => c.mark))
  return checks.length >= 2 && marks.has('동의') && (marks.has('수정 의견 있음') || marks.has('자료 확인 필요'))
}

export type Filter = '전체' | '확인 필요' | '수정 요청 있음' | '미작성' | '최종 확인 완료' | '의견 조율 필요'
export const FILTERS: Filter[] = ['전체', '확인 필요', '수정 요청 있음', '미작성', '최종 확인 완료', '의견 조율 필요']
export function matchesFilter(f: Filter, st: FieldStatus, openReq: number, checks: CheckRow[], blank: boolean): boolean {
  if (f === '전체') return true
  if (f === '확인 필요') return st === '확인 필요'
  if (f === '수정 요청 있음') return st === '수정 요청 있음' || openReq > 0
  if (f === '미작성') return blank
  if (f === '최종 확인 완료') return st === '최종 확인 완료'
  return needsAlignment(checks)
}

/** 다음 버전 이름 — V0.1 → V0.2, 제출본이면 V1.0 → V2.0 */
export function nextLabel(versions: VersionMeta[], submission: boolean): string {
  let maj = 0
  let min = 0
  for (const v of versions) {
    const m = v.label.match(/^V(\d+)\.(\d+)$/)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > maj || (a === maj && b > min)) {
      maj = a
      min = b
    }
  }
  if (versions.length === 0) return submission ? 'V1.0' : 'V0.1'
  return submission ? `V${maj + 1}.0` : `V${maj}.${min + 1}`
}
