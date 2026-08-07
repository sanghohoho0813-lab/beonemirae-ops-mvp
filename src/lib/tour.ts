import type { UserRole } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 제품 투어 (사용 방법 보기)
//
//  목적은 기능 이름을 읊는 것이 아니라, 처음 보는 사람이 아래 세 가지를
//  스스로 이해하게 만드는 것입니다.
//
//    왜 필요한가  →  어떻게 쓰는가  →  그래서 무엇이 바뀌는가
//
//  그래서 각 단계는 반드시 why / how / result 세 줄을 갖습니다.
//
//  대상 지정은 픽셀이 아니라 화면에 붙인 data-tour 속성으로만 합니다.
//  (레이아웃이 바뀌어도 투어가 깨지지 않고, 반응형에서도 그대로 동작합니다)
// ─────────────────────────────────────────────────────────────────────────────

export interface TourStep {
  /** 대상 요소의 data-tour 값. 없으면 화면 가운데에 설명만 띄웁니다. */
  anchor?: string
  /** 이 단계를 보여줄 화면 경로 */
  route: string
  /** 단계 제목 — 기능명이 아니라 "무엇을 하는 곳인지" */
  title: string
  /** 왜 필요한가 */
  why: string
  /** 어떻게 쓰는가 */
  how: string
  /** 그 결과 무엇이 바뀌는가 */
  result: string
}

export type TourId = 'staff' | 'field' | 'client'

export interface Tour {
  id: TourId
  label: string
  /** 첫 안내에 쓰는 소요시간 — "부담 없다"는 신호가 실행률을 좌우합니다 */
  minutes: string
  intro: string
  steps: TourStep[]
}

// ── A. 대표 · 사무실 담당자 ──────────────────────────────────────────────────
const STAFF: Tour = {
  id: 'staff',
  label: '대표 · 사무실 담당자용',
  minutes: '3분',
  intro: '수거 입력 한 번이 병원 서비스와 추가 매출까지 어떻게 이어지는지 7단계로 보여드립니다.',
  steps: [
    {
      route: '/',
      anchor: 'story',
      title: '이 시스템이 하는 일 — 여섯 단계',
      why: '수거만 하던 회사에서, 병원의 폐기물 운영을 함께 관리하는 회사로 넘어가는 중입니다.',
      how: '바로 아래 여섯 칸이 그 흐름입니다. 칸마다 누가 하는 일인지 배지로 표시됩니다.',
      result: '흐름 한가운데에 병원이 있습니다. 내부 직원만 쓰는 프로그램이 아닙니다.',
    },
    {
      route: '/',
      anchor: 'core1',
      title: '한 번 입력하면 여러 업무가 자동으로',
      why: '같은 수거 정보를 일정표·대장·자재장부·엑셀에 반복해 옮겨 적었습니다.',
      how: '현장에서 수거 완료를 한 번만 입력합니다. 오른쪽은 손대지 않습니다.',
      result: '일정·이력·거래처·자재·통계·대장이 함께 갱신됩니다.',
    },
    {
      route: '/',
      anchor: 'customer',
      title: '병원의 행동이 매출이 되는 흐름',
      why: '거래처당 매출을 늘리려면 병원이 무엇을 필요로 하는지 알아야 합니다.',
      how: '병원 요청 → 처리 → 데이터로 제안 → 병원 수락 → 실제 매출 순으로 읽습니다.',
      result: '요청마다 어떤 매출로 이어지는지 적혀 있어, 요청 처리가 곧 영업이 됩니다.',
    },
    {
      route: '/',
      anchor: 'core3',
      title: '다음에 무엇을 제안할지 데이터가 알려줍니다',
      why: '배출량·용기 부족·교육 주기를 사람이 다 기억할 수는 없습니다.',
      how: '쌓인 수거·자재·청구 기록으로 거래처별 다음 행동을 근거와 함께 뽑습니다.',
      result: '「병원에 제안 전달」을 누르면 병원 화면에 뜨고, 수락은 병원이 누릅니다.',
    },
    {
      route: '/requests',
      anchor: 'requests-list',
      title: '병원이 올린 요청을 여기서 처리합니다',
      why: '전화·카톡 요청은 기록이 없어 누락되고, 누가 처리했는지도 몰랐습니다.',
      how: '이 줄에서 상태를 바꾸고, 오른쪽에서 회신을 남깁니다.',
      result: '상태와 회신이 병원 화면에 그대로 보입니다. 수거를 완료하면 자동으로 닫힙니다.',
    },
    {
      route: '/performance',
      anchor: 'perf-model',
      title: '거래처당 매출 구조 — 지금 어디까지 왔는지',
      why: '심사에서 가장 많이 받는 질문이 "무엇으로 돈을 버느냐"입니다.',
      how: '수거료 외 매출 다섯 가지를 구현됨 / 실증 중 / 개발 예정으로 나눠 보여줍니다.',
      result: '아직 만들지 않은 것은 어떤 성과 집계에도 들어가지 않습니다.',
    },
    {
      route: '/performance',
      anchor: 'perf-a',
      title: '성과는 실제 입력에서만 계산합니다',
      why: '도입 효과를 말로만 주장하면 심사에서 인정받기 어렵습니다.',
      how: '도입 전 값은 설정에서 입력하고, 도입 후 값은 실제 수거 기록에서 측정합니다.',
      result: '표본이 적으면 실증 중으로 둡니다. 숫자를 만들어 넣지 않습니다.',
    },
  ],
}

// ── B. 현장 담당자 ───────────────────────────────────────────────────────────
const FIELD: Tour = {
  id: 'field',
  label: '현장 담당자용',
  minutes: '2분',
  intro: '현장에서 하는 일은 하나뿐입니다 — 수거하고, 한 번 입력하기. 5단계로 보여드립니다.',
  steps: [
    {
      route: '/today',
      anchor: 'today-list',
      title: '오늘 갈 곳이 여기 다 있습니다',
      why: '사무실에 전화해서 오늘 어디를 가는지 확인해야 했습니다.',
      how: '시간·거래처·폐기물 구분이 한 줄에 있고, 완료하면 표시가 바뀝니다.',
      result: '어디까지 돌았는지 사무실에서도 같은 화면으로 봅니다.',
    },
    {
      route: '/today',
      anchor: 'today-notes',
      title: '병원별 유의사항은 기억하지 않아도 됩니다',
      why: '후문 출입, 오후에만 통화되는 담당자 — 사람이 바뀌면 사라집니다.',
      how: '한 번 적어 두면 그 병원 일정·수거 입력 화면에 계속 따라옵니다.',
      result: '인수인계 없이도 처음 가는 기사가 같은 정보를 봅니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-form',
      title: '수거 완료 입력 — 하루에 이것만',
      why: '이 입력 하나가 사무실의 반복 입력 여러 건을 대신합니다.',
      how: '거래처·차량을 고르고 수거량을 적습니다. 용기와 인계까지 한 화면입니다.',
      result: '따로 수거대장을 쓰거나 사무실에 알릴 필요가 없습니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-supply',
      title: '자재를 같이 주고 왔다면 여기서 함께',
      why: '나중에 따로 적으면 재고가 안 맞고 병원 요청도 안 닫힙니다.',
      how: '가져다준 수량만 적습니다. 재고보다 많으면 저장이 막힙니다.',
      result: '사무실 재고가 줄고, 그 병원의 소모품 요청도 함께 완료됩니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-save',
      title: '저장하면 무엇이 바뀌는지 바로 보입니다',
      why: '반영됐는지 확인이 안 되면 결국 다시 전화하게 됩니다.',
      how: '저장을 누르면 자동 처리된 항목이 그 자리에서 목록으로 나옵니다.',
      result: '잘못 눌렀으면 취소할 수 있고, 입력 전으로 되돌아갑니다.',
    },
  ],
}

// ── C. 병원 담당자 ───────────────────────────────────────────────────────────
const CLIENT: Tour = {
  id: 'client',
  label: '병원 담당자용',
  minutes: '2분',
  intro: '전화하지 않고 필요한 것을 요청하고, 처리 상태와 월간 리포트를 직접 확인하실 수 있습니다.',
  steps: [
    {
      route: '/portal',
      anchor: 'portal-request',
      title: '필요한 것을 여기서 바로 요청하세요',
      why: '급히 수거가 필요하거나 용기가 떨어져도 통화가 안 되면 기다려야 했습니다.',
      how: '네 가지 중 하나를 누르고 내용을 적어 보내면 끝입니다.',
      result: '담당자 화면에 바로 뜹니다. 전화로 다시 말씀하지 않으셔도 됩니다.',
    },
    {
      route: '/portal',
      anchor: 'portal-status',
      title: '우리 병원 수거 현황',
      why: '다음 수거가 언제인지, 지난번에 얼마나 나갔는지 매번 물어보셨습니다.',
      how: '다음 수거 예정과 최근 배출량, 이번 달 누계가 항상 최신으로 보입니다.',
      result: '확정 일정이 없으면 수거주기로 계산한 예상일임을 그대로 표시합니다.',
    },
    {
      route: '/portal',
      anchor: 'portal-requests',
      title: '올린 요청이 지금 어디까지 왔는지',
      why: '요청을 넣고 처리되고 있는지 알 수 없는 것이 가장 답답합니다.',
      how: '접수 → 확인 중 → 일정 반영 → 처리 완료 순으로 막대가 채워집니다.',
      result: '담당자가 남긴 회신도 같은 자리에 표시됩니다.',
    },
    {
      route: '/portal',
      anchor: 'portal-report',
      title: '월간 리포트와 수거 이력',
      why: '인증·실사 준비 때마다 수거대장을 요청하고 기다리셔야 했습니다.',
      how: '월간 리포트에서 배출량·수거 횟수를, 수거 이력에서 건별 기록을 봅니다.',
      result: '필요할 때 직접 확인하고 그대로 자료로 쓰실 수 있습니다.',
    },
  ],
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
