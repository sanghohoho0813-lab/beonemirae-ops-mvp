import type { UserRole } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 제품 투어 (사용 방법 보기)
//
//  설명서가 아니라 "지금 무엇을 하면 되는지" 알려주는 도구입니다.
//  그래서 한 단계에 문장이 두 개뿐입니다.
//
//    action  지금 하면 되는 일 (명령형 한 줄 — 이 단계의 주인공)
//    result  그러면 무엇이 바뀌는지 (→ 한 줄)
//
//  왜 필요한지는 대부분 화면이 이미 말해 주므로 적지 않습니다.
//  꼭 필요한 단계에만 why 한 줄을 덧붙입니다.
//
//  · 문장을 줄인 만큼 글자를 키웠습니다.
//    "큰 상자 + 작은 글자 + 긴 설명"이 아니라 "알맞은 상자 + 큰 글자 + 짧은 문장"입니다.
//  · 마지막 단계는 반드시 실제 행동으로 이어집니다 (finish).
//  · 여기 쓰는 말은 실제 화면의 버튼·섹션 이름과 같아야 합니다.
//    투어가 제품 위에 따로 붙은 설명서처럼 보이면 실패입니다.
//
//  대상 지정은 픽셀이 아니라 화면에 붙인 data-tour 속성으로만 합니다.
//  (레이아웃이 바뀌어도 투어가 깨지지 않고, 반응형에서도 그대로 동작합니다)
// ─────────────────────────────────────────────────────────────────────────────

export interface TourStep {
  /** 대상 요소의 data-tour 값. 없으면 화면 가운데에 설명만 띄웁니다. */
  anchor?: string
  /** 이 단계를 보여줄 화면 경로 */
  route: string
  /** 단계 이름 — 실제 화면의 섹션·버튼 이름과 같게 씁니다 */
  title: string
  /** 지금 하면 되는 일 — 명령형 한 줄 */
  action: string
  /** 그러면 무엇이 바뀌는가 — 한 줄 */
  result: string
  /** 꼭 필요한 단계에만 붙이는 배경 한 줄 */
  why?: string
}

export type TourId = 'staff' | 'field' | 'client'

/** 투어가 끝난 뒤 이어지는 실제 행동 */
export interface TourFinish {
  label: string
  to: string
  /** 도착한 화면에서 바로 시작시킬 동작 (그 화면이 이 이벤트를 듣고 있습니다) */
  emit?: string
}

export interface Tour {
  id: TourId
  label: string
  /** 첫 안내에 쓰는 소요시간 — "부담 없다"는 신호가 실행률을 좌우합니다 */
  minutes: string
  intro: string
  steps: TourStep[]
  finish: TourFinish
}

// ── A. 대표 · 사무실 담당자 ──────────────────────────────────────────────────
const STAFF: Tour = {
  id: 'staff',
  label: '대표 · 사무실 담당자용',
  minutes: '1분',
  intro: '수거 입력 한 번이 병원 서비스와 추가 매출로 이어지는 흐름을 5단계로 봅니다.',
  steps: [
    {
      route: '/',
      anchor: 'story',
      title: '이 시스템이 하는 일',
      action: '아래 여섯 칸을 왼쪽에서 오른쪽으로 훑어보세요.',
      result: '수거만 하던 회사가 병원 운영을 함께 관리하는 흐름이 됩니다.',
    },
    {
      route: '/',
      anchor: 'core1',
      title: '한 번 입력, 여러 업무 자동 연결',
      action: '현장에서 수거 완료를 한 번만 입력하세요.',
      result: '일정·이력·자재·통계·대장이 함께 갱신됩니다. 옮겨 적지 않습니다.',
    },
    {
      route: '/requests',
      anchor: 'requests-list',
      title: '병원 요청',
      action: '병원이 올린 요청의 상태를 바꾸고 회신을 남기세요.',
      result: '바뀐 상태와 회신이 병원 화면에 그대로 보입니다.',
    },
    {
      route: '/',
      anchor: 'customer',
      title: '병원 서비스 전환',
      action: '요청 → 처리 → 제안 → 수락 → 매출, 이 줄의 숫자를 보세요.',
      result: '비어 있는 칸이 지금 할 일입니다. 그 자리에서 바로 이어갑니다.',
    },
    {
      route: '/performance',
      anchor: 'perf-model',
      title: 'AX 도입 성과',
      action: '수거료 외 매출 다섯 가지의 진행 단계를 확인하세요.',
      result: '아직 만들지 않은 것은 개발 예정으로 표시되고 성과에 넣지 않습니다.',
      why: '심사에서 가장 많이 받는 질문이 "무엇으로 돈을 버느냐"입니다.',
    },
  ],
  finish: { label: '운영현황 보기', to: '/' },
}

// ── B. 현장 담당자 ───────────────────────────────────────────────────────────
const FIELD: Tour = {
  id: 'field',
  label: '현장 담당자용',
  minutes: '1분',
  intro: '현장에서 하는 일은 하나입니다 — 수거하고, 한 번 입력하기.',
  steps: [
    {
      route: '/today',
      anchor: 'today-list',
      title: '오늘 일정',
      action: '오늘 방문할 병원과 유의사항을 먼저 확인하세요.',
      result: '사무실에 전화하지 않아도 갈 곳과 주의할 점이 다 있습니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-form',
      title: '수거 입력',
      action: '거래처와 차량을 고르고 실제 수거량을 적으세요.',
      result: '수거대장을 따로 쓰거나 사무실에 알릴 필요가 없습니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-supply',
      title: '자재 동시 공급',
      action: '용기를 주고 왔다면 가져다준 수량만 함께 적으세요.',
      result: '사무실 재고가 줄고, 그 병원의 소모품 요청도 함께 완료됩니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-save',
      title: '저장',
      action: '저장을 누르세요.',
      result: '자동 처리된 항목이 그 자리에 뜨고, 잘못 눌렀으면 취소됩니다.',
    },
  ],
  finish: { label: '오늘 일정 보기', to: '/today' },
}

// ── C. 병원 담당자 ───────────────────────────────────────────────────────────
const CLIENT: Tour = {
  id: 'client',
  label: '병원 담당자용',
  minutes: '1분',
  intro: '전화하지 않고 요청하고, 처리 상태를 직접 확인하실 수 있습니다.',
  steps: [
    {
      route: '/portal',
      anchor: 'portal-request',
      title: '수거 요청',
      action: '필요한 것을 눌러 내용만 적어 보내세요.',
      result: '비원미래 담당자 화면에 바로 뜹니다. 통화를 기다리지 않으셔도 됩니다.',
    },
    {
      route: '/portal',
      anchor: 'portal-requests',
      title: '내 요청 진행 상태',
      action: '보낸 요청이 지금 어디까지 왔는지 여기서 확인하세요.',
      result: '접수 → 확인 중 → 일정 반영 → 처리 완료와 담당자 회신이 보입니다.',
    },
    {
      route: '/portal',
      anchor: 'portal-status',
      title: '우리 병원 현황',
      action: '다음 수거일과 이번 달 배출량을 확인하세요.',
      result: '월간 리포트와 수거 이력은 인증·실사 자료로 바로 쓰실 수 있습니다.',
    },
  ],
  finish: { label: '수거 요청하기', to: '/portal', emit: 'beonemirae:portal-request' },
}

export const TOURS: Record<TourId, Tour> = { staff: STAFF, field: FIELD, client: CLIENT }

/** 역할에 맞는 투어. 시연 모드(역할 없음)는 대표·사무실 투어를 씁니다. */
export function tourFor(role: UserRole | null): Tour {
  if (role === 'client') return CLIENT
  if (role === 'field') return FIELD
  return STAFF
}

const SEEN_KEY = 'beonemirae-ops:tour-seen'

/** 이 역할의 투어를 이미 보았는지 (안내 배너 노출 판단용) */
export function tourSeen(id: TourId): boolean {
  try {
    return (localStorage.getItem(SEEN_KEY) ?? '').split(',').includes(id)
  } catch {
    return false
  }
}

export function markTourSeen(id: TourId): void {
  try {
    const cur = (localStorage.getItem(SEEN_KEY) ?? '').split(',').filter(Boolean)
    if (!cur.includes(id)) localStorage.setItem(SEEN_KEY, [...cur, id].join(','))
  } catch {
    /* noop */
  }
}
