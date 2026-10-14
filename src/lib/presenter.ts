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
//  ⚠ 문장은 짧게 — 대표님이 읽느라 시연을 놓치면 실패입니다. 발표자 메모는
//    두세 문장입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 단계 기능의 현재 상태 — 「구현됨」과 「검증됨」을 섞지 않습니다 */
export type PresenterStatus = '구현됨' | '실증 단계' | '측정 중'

export interface PresenterCtx {
  /** 시연에 쓸 병원(거래처) id — 병원 화면 · 회신 확인 단계에서 씁니다 */
  clientId: string | null
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
}

/** 병원 요청 단계에서 붙여 넣을 예시 문장 */
export const SAMPLE_REQUEST =
  '폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전 수거 부탁드리고 63L 용기도 10개 부탁드립니다.'

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
    todo: '흐름을 짚고 아래 「시연 시작」을 누르면 첫 화면으로 갑니다.',
    note: '오늘은 기능을 많이 보여 드리기보다, 병원 요청 하나가 들어와 처리되기까지의 실제 흐름을 보여 드리겠습니다.',
  },
  {
    key: 'today',
    title: '오늘 운영 화면',
    routes: () => ['/'],
    go: () => '/',
    targets: ['[data-tour="today-focus"]', '[data-tour="today-board"]'],
    show: '오늘 수거 일정과 먼저 챙길 일을 한 화면에서 봅니다.',
    before: '일정과 요청을 엑셀 · 카톡 · 통화 기록에서 따로 찾아야 했습니다.',
    now: '오늘 갈 곳 · 남은 수거 · 확인할 요청이 하나의 운영 화면에 모입니다.',
    effects: ['무엇부터 처리할지 빠르게 파악', '대표와 직원이 같은 화면을 봄', '담당자 기억 의존 감소'],
    todo: '「오늘 수거」 칸을 가리키며 설명한 뒤 「다음 단계」',
    note: '이 화면이 아침에 가장 먼저 여는 운영 화면입니다. 오늘 갈 곳과 먼저 챙길 일이 한 화면에 모여 있습니다.',
    status: '구현됨',
  },
  {
    key: 'collect',
    title: '현장 수거 1회 입력',
    routes: () => ['/collection'],
    go: () => '/collection',
    targets: ['[data-tour="collect-done"]', '[data-tour="collect-save"]'],
    show: '현장 직원이 수거 완료 1건을 입력합니다.',
    before: '현장 수기 대장 → 카톡 사진 → 사무실 엑셀로 같은 내용을 여러 번 옮겨 적었습니다.',
    now: '한 번 저장하면 오늘 일정 · 수거이력 · 거래처 기록에 함께 반영됩니다. 같이 준 자재가 있으면 자재 이력 · 사무실 재고도 반영됩니다.',
    effects: ['중복 입력 감소', '사무실 재입력 부담 감소', '현장 기록이 바로 운영 데이터가 됨'],
    todo: '거래처 · 수거량을 고르고 「수거 완료 저장」 → 「한 번 입력으로 자동 연결됨」 목록을 짚기',
    note: '현장에서 한 번만 입력하면, 사무실이 엑셀에 다시 옮겨 적지 않아도 일정과 이력에 바로 반영됩니다. 지금 저장하는 것도 실제 기록입니다.',
    status: '구현됨',
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
    todo: '「긴급수거 요청」 → 시점 · 사유 고르기 → 특이사항에 예시 문장 붙여넣기 → 「긴급수거 요청하기」',
    note: '병원이 직접 요청을 남기는 포털입니다. 예전에는 전화나 문자로 들어오던 요청이, 이제는 접수되는 순간 운영 데이터로 남습니다.',
    status: '실증 단계',
    aside: '포털은 추가 채널입니다 — 전화 · 문자를 편하게 여기시는 병원은 기존 방식도 그대로 받습니다.',
  },
  {
    key: 'triage',
    title: '직원 요청함 + AI 업무보조',
    routes: () => ['/requests'],
    go: () => '/requests',
    targets: ['[data-ai-use-draft]', '[data-ai-triage-run]', '[data-presenter="reply-open"]'],
    show: '병원이 방금 보낸 요청이 직원 요청함에 들어와 있습니다.',
    before: '긴 요청 글을 담당자가 매번 읽고, 종류 · 급한 정도 · 함께 들어온 요청(예: 용기)을 머리로 정리했습니다.',
    now: 'AI 가 요청 글을 읽고 종류 · 긴급도 · 요약 · 핵심 요구사항 · 회신 초안 · 판단 근거를 제안합니다. 일정 확정 · 상태 변경 · 회신 전송은 하지 않습니다.',
    effects: ['긴 요청의 빠른 파악', '복합 요청(수거 + 용기) 누락 방지', '회신 초안 작성 보조', '응대 문장 표준화'],
    todo: '「회신 남기기」 → 「AI 분석 실행」 → 결과를 짚은 뒤 「초안 사용」',
    note: 'AI 가 결정을 대신하는 것이 아니라, 병원 요청을 빠르게 읽고 정리해 담당자의 판단과 회신을 돕습니다. 최종 판단은 담당자가 합니다.',
    status: '구현됨',
  },
  {
    key: 'reply',
    title: '직원 회신 → 병원 확인',
    routes: (c) => ['/requests', ...(c.clientId ? [`/portal/c/${c.clientId}/requests`] : [])],
    go: () => '/requests',
    targets: ['[data-req-reply]', '[data-reply-save]', '[data-req-list] [data-req-open]'],
    show: '담당자가 문장을 확인 · 수정해 회신을 저장하면, 병원 포털 요청 내역의 「담당자 안내」에 그대로 보입니다.',
    before: '회신이 통화로 끝나 누가 무엇을 안내했는지 남지 않았습니다.',
    now: '요청 · 처리 상태 · 회신이 하나의 이력으로 남고, 병원도 같은 내용을 봅니다.',
    effects: ['같은 내용을 다시 묻는 전화 감소 가능', '누가 어떤 답을 했는지 기록', '병원 응대 품질 표준화'],
    todo: '회신 문장 확인 · 수정 → 「회신 저장」 → 「병원 화면에서 확인」',
    note: '요청이 접수에서 끝나지 않고, 처리 과정과 회신까지 하나의 이력으로 연결됩니다. 병원도 같은 안내를 화면에서 봅니다.',
    status: '구현됨',
  },
  {
    key: 'ir',
    title: '발표용 성과 화면',
    routes: () => ['/performance/ir'],
    go: () => '/performance/ir',
    targets: ['[data-ir-before]'],
    show: '도입 전 업무부담 · 같은 업무의 재현시험 · 실제 사용 기록 — 확인된 것만 보여 드립니다.',
    before: 'AX 효과는 느낌이나 홍보 문구로 말하기 쉽습니다.',
    now: '개발 완료와 성과 검증을 구분하고, 재지 않은 값은 「측정 전 · 측정 예정」으로 둡니다.',
    effects: ['효과를 운영 데이터로 계속 측정', '목표값과 실적을 섞지 않음'],
    todo: '세 칸을 차례로 짚기 — 근거 질문이 나오면 「근거 보기」',
    note: '비원미래는 개발 완료와 성과 검증 완료를 구분합니다. 지금 숫자는 실제 업무조사와 운영 기록에서만 나오고, 아직 재지 않은 것은 측정 예정으로 둡니다.',
    status: '측정 중',
  },
  {
    key: 'close',
    title: '마무리 — 운영 Capacity',
    routes: () => ['/presentation'],
    go: () => '/presentation',
    targets: ['[data-presenter-close]'],
    show: '병원 요청 → 직원 대응 → 현장 실행 → 데이터 축적. 지금 구현된 것과 다음 계획을 나눠 보여 드립니다.',
    todo: '마지막 문장을 말씀하시고 질문을 받습니다. 끝나면 「발표 가이드 종료」',
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

/** 시작 화면 — 오늘 보여드릴 흐름 */
export const FLOW = ['병원', '요청', '직원 확인', 'AI 업무보조', '현장 처리', '운영 데이터 축적']

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
  index: number
  clientId: string | null
  at: number
}

export function loadRun(now = Date.now()): PresenterRun | null {
  try {
    const raw = sessionStorage.getItem(PRESENTER_KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as PresenterRun
    if (typeof r.index !== 'number' || now - (r.at ?? 0) > MAX_MS) return null
    return { index: Math.max(0, Math.min(PRESENTER_STEPS.length - 1, r.index)), clientId: r.clientId ?? null, at: r.at }
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
