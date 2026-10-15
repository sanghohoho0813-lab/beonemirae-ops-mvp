// ─────────────────────────────────────────────────────────────────────────────
// 심사 시연 Presenter Mode — 단계 정의 (0139)
//
//  대표님: 「긴장한 상태에서도 화면이 다음 행동을 안내해 주고, 심사위원은 화면만
//  봐도 지금 무엇을 보여주는지 · 기존 방식과 무엇이 다른지 · 어떤 효과인지
//  이해할 수 있게. 5~7분 안에 문제 → AX 구조 → 실제 작동 → AI → 효과 → 확장성.」
//
//  ⚠ **안내 레이어**입니다. 업무 로직 · 데이터를 바꾸지 않습니다. 화면의 숫자를
//    만들지 않고, 실제 화면이 실제 기록을 보여 줍니다.
//  ⚠ 문구 규칙 — 구현된 것만 「바뀐 방식」에 적습니다. 효과는 정성적으로만
//    (검증 안 된 % · 시간 없음). 「자동 배차 · 수거량 예측 · 완전 자동화 ·
//    병원 전체 사용 · 00% 향상」 같은 말은 이 파일에 들어오지 않습니다.
//  ⚠ 문장은 짧게 — 대표님이 읽느라 시연을 놓치면 실패입니다. 안내 카드에는
//    note(「설명」 — 읽을 문장)와 todo(「누를 곳」)만 나옵니다(0140 정리). 나머지 칸은
//    시작 화면의 「발표 준비」 단계 목록에서만 씁니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 단계 기능의 현재 상태 — 「구현됨」과 「검증됨」을 섞지 않습니다 */
export type PresenterStatus = '구현됨' | '실증 단계' | '측정 중'

export interface PresenterCtx {
  /** 시연에 쓸 병원(거래처) id — 병원 화면 · 회신 확인 단계에서 씁니다 */
  clientId: string | null
  /** AI 시연에 쓸 시연 요청 id — 요청함에서 그 요청으로 바로 데려갑니다 (0140) */
  demoRequestId?: string | null
}

export interface PresenterStep {
  key: string
  title: string
  /** 이 단계 화면 — 여기 중 하나에 있으면 「제 화면」입니다 */
  routes: (c: PresenterCtx) => string[]
  /** 「이 단계 화면으로」 · 다음/이전이 데려가는 곳 */
  go: (c: PresenterCtx) => string
  /**
   * 강조 후보 — **앞에서부터** 화면에 보이는 첫 요소 하나만 강조합니다.
   *  가장 진행된 상태를 앞에 둡니다(예: 초안 사용 > AI 분석 실행 > 회신 남기기).
   *  없으면 강조하지 않습니다 — 화면은 그대로입니다.
   */
  targets: string[]
  /** ① 지금 보여드리는 것 */
  show: string
  /** ② 기존 방식의 문제 */
  before?: string
  /** ③ 비원미래가 바꾼 방식 — 실제로 구현된 것만 */
  now?: string
  /** ④ 기대 효과 — 정성적 (숫자 없음) */
  effects?: string[]
  /** ⑤ 지금 할 일 — 대표님이 실제로 누를 것 */
  todo: string
  /** 발표자 메모 — 「이렇게 설명하세요」 2~3문장 */
  note: string
  status?: PresenterStatus
  /** 아주 작게 덧붙일 말 (원칙 · 주의) */
  aside?: string
  /** 이 단계에서 **실제로 도는** AI 기능 이름 (0141) — 없으면 AI 표시 없음 */
  ai?: string
  /** 이 영역의 「개발 예정」 AI 고도화 (0141) — 아직 없는 것. 카드에 「개발 예정」으로만 */
  planned?: string[]
}

/** 강조한 곳 위 말풍선 — 눌러야 하는 단계는 「여기를 누르세요」, 보여 주기만 하는 단계는 「여기를 보세요」 */
export const LOOK_STEPS = new Set(['intro', 'ir', 'roadmap', 'close'])

/** 병원 요청 단계에서 붙여 넣을 예시 문장 */
export const SAMPLE_REQUEST =
  '폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전 수거 부탁드리고 63L 용기도 10개 부탁드립니다.'

/** 수거 입력 단계에서 특이사항 칸에 붙여 넣을 예시 메모 (AI 메모 정리 시연용 · 0141) */
export const SAMPLE_MEMO = '용기 2개 깨져서 교체 필요. 원무과에서 다음주 추가수거 원함. 63L 5개 더 달라고 함'

const portalHome = (c: PresenterCtx) => (c.clientId ? `/portal/c/${c.clientId}` : '/presentation')

export const PRESENTER_STEPS: PresenterStep[] = [
  {
    key: 'intro',
    title: '실제 업무 흐름',
    routes: () => ['/presentation'],
    go: () => '/presentation',
    targets: ['[data-presenter-flow]'],
    show: '병원 요청부터 현장 수거, 내부 운영, AI 업무보조까지 하나의 데이터 흐름으로 연결합니다.',
    before: '요청은 전화 · 문자로, 수거 기록은 수기 · 카톡으로, 정리는 엑셀로 — 같은 내용을 여러 번 옮겨 적었습니다.',
    now: '한 번 남긴 기록이 다음 업무로 이어지는 하나의 운영 시스템입니다.',
    todo: '흐름을 짚은 뒤 「시연 시작」',
    note: '오늘은 기능을 많이 보여 드리기보다, 병원 요청 하나가 들어와 처리되기까지의 실제 흐름을 보여 드리겠습니다.',
  },
  {
    key: 'today',
    title: '오늘 운영 화면 · AI 오늘 브리핑',
    routes: () => ['/'],
    go: () => '/',
    targets: ['[data-ai-briefing]', '[data-ai-assist-run="briefing"]', '[data-tour="today-focus"]', '[data-tour="today-board"]'],
    show: '오늘 수거 일정과 먼저 챙길 일을 한 화면에서 봅니다.',
    before: '일정과 요청을 엑셀 · 카톡 · 통화 기록에서 따로 찾아야 했습니다.',
    now: '오늘 갈 곳 · 남은 수거 · 확인할 요청이 하나의 운영 화면에 모입니다.',
    effects: ['무엇부터 처리할지 빠르게 파악', '대표와 직원이 같은 화면을 봄', '담당자 기억 의존 감소'],
    todo: '「AI 브리핑 받기」 → 먼저 챙길 일 셋을 짚고 「다음」',
    note: '아침에 가장 먼저 여는 운영 화면입니다. 오늘 방문 · 요청 · 미수 숫자를 AI가 읽고 「먼저 챙길 일」을 정리해 줍니다. 거래처 이름은 AI에 보내지 않습니다.',
    status: '구현됨',
    ai: 'AI 오늘 브리핑',
    planned: ['AI 배차 · 동선 추천 (담당자 확정)'],
  },
  {
    key: 'collect',
    title: '현장 수거 입력 · AI 메모 정리',
    routes: () => ['/collection'],
    //  0142 — 시연 거래처를 미리 골라 둡니다 (실제 병원에 시연 기록이 남지 않게 · 시연을 끄면 안 보임)
    go: (c) => (c.clientId ? `/collection?client=${c.clientId}` : '/collection'),
    targets: ['[data-ai-field-apply]', '[data-ai-assist-run="field_note"]', '[data-tour="collect-done"]', '[data-tour="collect-save"]'],
    show: '현장 직원이 수거 완료 1건을 입력합니다.',
    before: '현장 수기 대장 → 카톡 사진 → 사무실 엑셀로 같은 내용을 여러 번 옮겨 적었습니다.',
    now: '한 번 저장하면 오늘 일정 · 수거이력 · 거래처 기록에 함께 반영됩니다. 같이 준 자재가 있으면 자재 이력 · 사무실 재고도 반영됩니다.',
    effects: ['중복 입력 감소', '사무실 재입력 부담 감소', '현장 기록이 바로 운영 데이터가 됨'],
    todo: '특이사항 펼치기 → 예시 메모 붙여넣기 → 「AI로 메모 정리」 → 「정리본으로 바꾸기」',
    note: '현장에서 한 번만 입력하면 일정 · 이력 · 거래처 기록에 함께 반영됩니다. 기사님이 급하게 적은 메모는 AI가 정리하고 추가수거 · 자재 같은 후속 조치를 제안합니다. 저장은 담당자가 합니다.',
    status: '구현됨',
    ai: 'AI 현장 메모 정리',
    planned: ['말로 남기는 현장 메모', '사진으로 용기 수량 확인'],
    aside: '저장하면 실제 기록이 됩니다 — 시연 거래처로 입력하세요.',
  },
  {
    key: 'portal',
    title: '병원 포털 요청',
    routes: (c) => (c.clientId ? [`/portal/c/${c.clientId}`] : []),
    go: portalHome,
    targets: ['[data-sheet-done]', '[data-req-send]', '[data-portal-cta="urgent"]'],
    show: '병원 직원이 포털에서 직접 긴급수거를 요청합니다. (관리자 미리보기로 병원 화면을 엽니다)',
    before: '전화 · 문자 요청은 받은 사람의 기억이나 개인 휴대폰에만 남았습니다.',
    now: '요청이 처음부터 시스템 기록으로 접수되고, 처리 상태가 병원 화면에 보입니다.',
    effects: ['요청 누락 방지', '처리 상태 추적', '병원과 회사 양쪽에 기록 유지'],
    todo: '「긴급수거 요청」 → 예시 문장 붙여넣기 → 「긴급수거 요청하기」',
    note: '병원이 직접 요청을 남기는 포털입니다. 예전에는 전화나 문자로 들어오던 요청이, 이제는 접수되는 순간 운영 데이터로 남습니다. 포털은 추가 채널이라 전화 · 문자도 그대로 받습니다.',
    status: '실증 단계',
    planned: ['병원용 AI 요청 도우미 — 글만 쓰면 종류 · 긴급도 제안'],
    aside: '포털은 추가 채널입니다 — 전화 · 문자를 편하게 여기시는 병원은 기존 방식도 그대로 받습니다.',
  },
  {
    key: 'triage',
    title: 'AI가 병원 요청을 읽고 업무 판단을 보조합니다',
    routes: () => ['/requests'],
    //  시연 요청이 준비돼 있으면 그 요청으로 바로 — 발표 중에 목록을 뒤지지 않게 (0140)
    go: (c) => (c.demoRequestId ? `/requests?focus=${c.demoRequestId}` : '/requests'),
    targets: ['[data-ai-use-draft]', '[data-ai-triage-run]', '[data-req-focus] [data-presenter="reply-open"]', '[data-presenter="reply-open"]'],
    show: '병원이 남긴 자연어 요청을 AI가 분석해 요청 유형 · 긴급도 · 핵심 요구사항 · 회신 초안을 제안합니다.',
    before: '전화·문자·카카오톡으로 들어온 긴 요청을 담당자가 직접 읽고, 급한 정도와 함께 들어온 요구사항을 일일이 판단해야 했습니다.',
    now: '요청이 시스템 데이터로 들어오면 AI가 먼저 구조화하고, 담당자가 결과를 확인해 실제 업무에 반영합니다.',
    effects: ['긴 요청 빠른 파악', '복합 요청 누락 방지', '고객 응대 문장 표준화', '담당자 판단시간 절감 가능'],
    todo: '「회신 남기기」 → 「AI 분석 실행」 → 결과 · 갈 수 있는 기사 짚기 → 「초안 사용」',
    note: 'AI가 업무를 대신하는 구조는 아닙니다. 병원 요청을 빠르게 읽고 정리해서 담당자의 판단과 회신을 돕는 방식이며, 최종 결정은 사람이 합니다.',
    status: '구현됨',
    ai: 'AI 요청 분석',
  },
  {
    key: 'reply',
    title: '직원 회신 → 병원 확인 · 날짜 잡기',
    routes: (c) => ['/requests', ...(c.clientId ? [`/portal/c/${c.clientId}/requests`] : [])],
    //  시연 요청이 있으면 그 요청으로 (발표 중엔 그 요청만 보임 · 0140)
    go: (c) => (c.demoRequestId ? `/requests?focus=${c.demoRequestId}` : '/requests'),
    targets: ['[data-req-reply]', '[data-reply-save]', '[data-req-list] [data-req-open]'],
    show: '담당자가 문장을 확인 · 수정해 회신을 저장하면, 병원 포털 요청 내역의 「담당자 안내」에 그대로 보입니다.',
    before: '회신이 통화로 끝나 누가 무엇을 안내했는지 남지 않았습니다.',
    now: '요청 · 처리 상태 · 회신이 하나의 이력으로 남고, 병원도 같은 내용을 봅니다.',
    effects: ['같은 내용을 다시 묻는 전화 감소 가능', '누가 어떤 답을 했는지 기록', '병원 응대 품질 표준화'],
    todo: '문장 확인 → 「회신 저장」 → 「병원 화면에서 확인」',
    note: '요청이 접수에서 끝나지 않고, 처리 과정과 회신까지 하나의 이력으로 연결됩니다. 병원도 같은 안내를 화면에서 봅니다.',
    status: '구현됨',
    ai: 'AI 회신 초안',
  },
  {
    key: 'receivables',
    title: '미수금 관리 · AI 안내 문구',
    routes: () => ['/receivables'],
    go: () => '/receivables',
    targets: ['[data-ai-assist-run="dunning"]', '[data-dunning-row] [data-dunning-msg]', '[data-dunning]'],
    show: '청구했지만 아직 들어오지 않은 돈을 거래처별로 묶어, 오래된 순서로 보여 줍니다.',
    before: '미수금을 엑셀에서 눈으로 골라 전화하거나 문자를 직접 썼습니다.',
    now: '오래 밀린 곳부터 보이고, 안내 문구는 AI가 말투에 맞춰 다시 씁니다.',
    todo: '거래처의 「문구」 → 「AI로 부드럽게」 → 문구 확인 · 복사',
    note: '청구했지만 아직 들어오지 않은 돈을 거래처별로 묶어 오래된 순서로 보여 줍니다. 안내 문구는 AI가 말투에 맞춰 다시 쓰고, 병원 이름과 금액은 AI에 보내지 않습니다. 보낼지는 대표가 정합니다.',
    status: '구현됨',
    ai: 'AI 안내 문구',
    planned: ['입금 예정일 알림'],
  },
  {
    key: 'ir',
    title: '성과 화면',
    routes: () => ['/performance/ir'],
    go: () => '/performance/ir',
    targets: ['[data-ir-before]'],
    show: '도입 전 업무부담 · 같은 업무의 재현시험 · 실제 사용 기록 — 확인된 것만 보여 드립니다.',
    before: 'AX 효과는 느낌이나 홍보 문구로 말하기 쉽습니다.',
    now: '개발 완료와 성과 검증을 구분하고, 재지 않은 값은 「측정 전 · 측정 예정」으로 둡니다.',
    effects: ['효과를 운영 데이터로 계속 측정', '목표값과 실적을 섞지 않음'],
    todo: '세 칸을 차례로 짚기',
    note: '비원미래는 개발 완료와 성과 검증 완료를 구분합니다. 지금 숫자는 실제 업무조사와 운영 기록에서만 나오고, 아직 재지 않은 것은 측정 예정으로 둡니다.',
    status: '측정 중',
  },
  {
    key: 'roadmap',
    title: 'AI 고도화 계획',
    routes: () => ['/presentation'],
    go: () => '/presentation',
    targets: ['[data-presenter-roadmap]'],
    show: '지금 쓰는 AI와, 운영 데이터가 쌓이는 대로 열 다음 단계를 나눠 보여 드립니다.',
    todo: '세 칸을 차례로 짚기 — 지금 · 다음 · 그다음',
    note: '지금은 요청 분석 · 회신 초안 · 오늘 브리핑 · 메모 정리 · 안내 문구까지 실제로 쓰고 있습니다. 운영 데이터가 쌓이는 대로 배차 추천과 수거 주기 예측 같은 다음 단계를 차례로 열 계획입니다.',
  },
  {
    key: 'close',
    title: '마무리 — 운영 Capacity',
    routes: () => ['/presentation'],
    go: () => '/presentation',
    targets: ['[data-presenter-close]'],
    todo: '마지막 문장 → 질문 받기',
    show: '비효율을 바로잡는 운영 시스템 — 그리고 데이터로 계속 고도화합니다.',
    note: 'AI 자체가 목적이 아니라, 의료폐기물 본업의 운영 Capacity 를 높여 같은 인력과 차량으로 더 많은 병원을 안정적으로 관리하는 구조를 만드는 것이 첫 번째 목표입니다.',
  },
]

/** 마무리 화면 — 지금 상태를 세 칸으로 (구현됨 · 실증 · 향후 계획) */
export const CLOSING = {
  flow: ['병원 요청', '직원 대응', '현장 실행', '데이터 축적'],
  built: ['병원 포털 요청 접수 · 처리 상태', '직원 요청함 · 회신 이력', 'AI 요청 분석 · 회신 초안 (업무 보조)', '현장 수거 1회 입력 → 일정 · 이력 반영'],
  piloting: ['병원 포털 실사용', '업무 재현시험 · 실제 사용 기록 측정'],
  planned: ['쌓인 데이터로 수요 · 운영 판단 보조', '거래처당 서비스 확대', '동종업계 운영 솔루션', '병원 B2B 운영 플랫폼'],
  message:
    'AI 자체가 목적이 아니라, 기존 의료폐기물 사업의 운영 Capacity 를 높여 같은 인력과 차량으로 더 많은 병원을 안정적으로 관리할 수 있는 운영 구조를 만드는 것이 첫 번째 목표입니다.',
}

/**
 * AI 고도화 계획 (0141) — 「지금 실제로 쓰는 것」과 「개발 예정」을 **칸을 나눠** 보여 줍니다.
 *  ⚠ now 는 실제로 서버 AI 를 부르는 기능만. next · later 는 아직 없는 것 — 화면에 「개발 예정」으로만.
 */
export const ROADMAP = {
  now: ['AI 요청 분석 · 긴급도', 'AI 회신 초안', 'AI 오늘 브리핑', 'AI 현장 메모 정리', 'AI 미수금 안내 문구'],
  next: ['병원용 AI 요청 도우미', '말로 남기는 현장 메모', 'AI 배차 · 동선 추천 (담당자 확정)', '입금 예정일 알림'],
  later: ['수거 주기 · 물량 예측 (데이터 축적 후)', '거래처별 자재 수요 예측', '동종업계 운영 솔루션'],
}

/** 시작 화면 — 오늘 보여드릴 흐름 (0140 신보 발표 — AI 를 앞에) */
export const FLOW = ['병원 요청', 'AI 분석', '담당자 판단', '수거 · 운영', '데이터 축적']

// ── 시연 순서 두 가지 (0140) ─────────────────────────────────────────────────
//  전체 흐름: 시작 → 오늘 운영 → 수거 입력 → 병원 포털 → AI → 회신 → 성과 → 마무리
//  AI 먼저:   AI → 회신 · 병원 확인 → 오늘 운영(AI 브리핑) → 수거 입력(AI 메모) → 병원 포털 → 미수금(AI 문구) → 성과 → AI 고도화 계획 → 마무리 (9단계)
//   0142 — 성과 화면을 잠깐 뺐다가(8단계) 대표님 말씀으로 되돌림: 「둘 다 두면 되겠다」
//   ⚠ 단계 내용은 하나입니다(같은 카드). 보여 주는 차례만 다릅니다.
export const FULL_ORDER: string[] = PRESENTER_STEPS.map((s) => s.key)
export const AI_ORDER: string[] = ['triage', 'reply', 'today', 'collect', 'portal', 'receivables', 'ir', 'roadmap', 'close']
export const stepIndex = (key: string) => Math.max(0, PRESENTER_STEPS.findIndex((s) => s.key === key))
/** 「STEP n / N」 — 시작 화면(intro)은 번호 없이 */
export function stepLabel(order: string[], pos: number): string {
  if (order[0] === 'intro') return pos === 0 ? '시작' : `STEP ${pos} / ${order.length - 1}`
  return `STEP ${pos + 1} / ${order.length}`
}

/** ISO 시각 → 한국 시각 「MM-DD HH:mm」 (AI 최근 성공 표시용) */
export function kstStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ')
}

/** 지금 주소가 이 단계 화면인가 */
export function onStepRoute(step: PresenterStep, pathname: string, c: PresenterCtx): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return step.routes(c).some((r) => (r === '/' ? p === '/' : p === r))
}

// ── 진행 상태 — 같은 탭에서만 · 3시간 ─────────────────────────────────────────
//  ⚠ 새로고침 · 화면 이동에도 이어져야 합니다(심사 자리에서 처음으로 돌아가면 끝).
//  ⚠ 탭을 닫으면 사라집니다 — 다음 날 일반 업무 화면에 발표 카드가 남아 있으면 안 됩니다.
export const PRESENTER_KEY = 'beonemirae-ops:presenter'
const MAX_MS = 3 * 60 * 60 * 1000

export interface PresenterRun {
  /** 보여 주는 차례 (단계 key) — 없으면 전체 흐름 */
  order: string[]
  /** 그 차례에서 몇 번째 */
  pos: number
  clientId: string | null
  demoRequestId: string | null
  at: number
}

export function loadRun(now = Date.now()): PresenterRun | null {
  try {
    const raw = sessionStorage.getItem(PRESENTER_KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as Partial<PresenterRun> & { index?: number }
    if (now - (r.at ?? 0) > MAX_MS) return null
    const known = new Set(FULL_ORDER)
    const order = Array.isArray(r.order) && r.order.length && r.order.every((k) => known.has(k)) ? r.order : FULL_ORDER
    const pos0 = typeof r.pos === 'number' ? r.pos : typeof r.index === 'number' ? r.index : NaN
    if (!Number.isFinite(pos0)) return null
    return { order, pos: Math.max(0, Math.min(order.length - 1, pos0)), clientId: r.clientId ?? null, demoRequestId: r.demoRequestId ?? null, at: r.at ?? now }
  } catch {
    return null
  }
}

export function saveRun(r: Omit<PresenterRun, 'at'>): void {
  try {
    sessionStorage.setItem(PRESENTER_KEY, JSON.stringify({ ...r, at: Date.now() }))
  } catch {
    /* 저장이 막혀도 안내는 돕니다 — 새로고침에서 이어지지 않을 뿐 */
  }
}

export function clearRun(): void {
  try {
    sessionStorage.removeItem(PRESENTER_KEY)
  } catch {
    /* noop */
  }
}

/** 시연 거래처 — 탭을 닫아도 다음 연습 때 다시 고르지 않게 (기기마다) */
export const PRESENTER_CLIENT_KEY = 'beonemirae-ops:presenter-client'
