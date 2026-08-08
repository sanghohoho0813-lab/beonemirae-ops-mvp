import type { UserRole } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 제품 투어 (사용 방법 보기)
//
//  두 가지를 같이 설명합니다.
//
//    쓰는 법   지금 무엇을 하면 되는지 (직원)
//    만든 이유 이 일이 회사를 어떻게 바꾸는지 (대표·심사자·외부 설명)
//
//  둘을 따로 두면 직원은 앞부분만, 심사자는 뒷부분만 보게 되어
//  "이 버튼이 왜 있는지"가 끝내 연결되지 않습니다. 그래서 한 줄기로 엮되
//  한 단계에 문장은 두세 개를 넘기지 않습니다.
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
  /**
   * 좁은 화면 전용 단계.
   * 폰은 화면 구성 자체가 다르고(첫 화면이 '오늘 할 일'), 한 번에 볼 수 있는 양도
   * 적어서 데스크톱 단계를 그대로 쓰면 맞지 않습니다. 없으면 steps 를 씁니다.
   */
  stepsMobile?: TourStep[]
  finish: TourFinish
}

/** 하단 탭바가 있는 폰 기준 — 이 아래로는 모바일 단계를 씁니다 */
export const MOBILE_MAX = 1023

/** 이 화면 폭에서 실제로 보여줄 단계 */
export function stepsFor(tour: Tour, width: number): TourStep[] {
  return width <= MOBILE_MAX && tour.stepsMobile ? tour.stepsMobile : tour.steps
}

// ── A. 대표 · 사무실 담당자 ──────────────────────────────────────────────────
//
//  8단계 — 기존 업무의 문제에서 시작해 사업이 어떻게 넓어지는지까지.
//  중간 여섯 단계는 실제 화면을 짚습니다. 설명만 하는 단계는 처음과 끝뿐입니다.
const STAFF: Tour = {
  id: 'staff',
  label: '대표 · 사무실 담당자용',
  minutes: '2분',
  intro: '왜 만들었고, 어떻게 쓰며, 그래서 무엇이 달라지는지 8단계로 봅니다.',
  steps: [
    {
      route: '/',
      title: '흩어져 있던 업무를 한 줄로',
      action: '전화·카톡으로 받은 요청, 종이에 적은 수거량, 엑셀에 옮긴 정산 — 지금은 같은 내용을 여러 번 적습니다.',
      result: '이 시스템은 그 반복을 없애려고 만들었습니다.',
      why: '한 번 적은 것을 다시 적지 않는 것이 전부입니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-form',
      title: '현장에서 한 번만 입력',
      action: '수거량과 공급한 물품을 규격별로 적습니다.',
      result: '여기가 전체의 출발점입니다. 뒤의 모든 것이 이 한 번에서 나옵니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-save',
      title: '저장하면 알아서 이어집니다',
      action: '저장 한 번에 일정·수거이력·자재 재고·병원 요청·정산이 함께 갱신됩니다.',
      result: '사무실이 옮겨 적을 것이 없습니다.',
    },
    {
      route: '/clients',
      anchor: 'client-list',
      title: '거래처별로 쌓입니다',
      action: '수거량·자재 사용량·요청·매출이 병원마다 계속 모입니다.',
      result: '지금까지 사람 머릿속에 있던 것이 기록으로 남습니다.',
    },
    {
      route: '/stats',
      anchor: 'business-summary',
      title: '월 정산과 거래명세서',
      action: '쌓인 데이터로 매출·처리비·자재비·예상 영업이익이 계산됩니다.',
      result: '거래명세서도 거래처 화면에서 그대로 만들어 PDF 로 저장합니다.',
      why: '매달 거래처별 엑셀을 다시 쓰던 일이 사라집니다.',
    },
    {
      route: '/requests',
      anchor: 'requests-list',
      title: '병원이 직접 요청합니다',
      action: '병원 담당자가 포털에서 수거·소모품을 올리고 처리 상태를 스스로 봅니다.',
      result: '전화를 받아 적는 일이 줄고, 병원은 기다리지 않습니다.',
      why: '내부 프로그램에서 끝나지 않고 병원에 제공하는 서비스가 되는 지점입니다.',
    },
    {
      route: '/',
      anchor: 'customer',
      title: '데이터로 먼저 파악합니다',
      action: '수거 주기·자재 사용량·요청 이력을 보고 추가 수거, 소모품, 교육이 필요한 곳을 찾습니다.',
      result: '요청 → 처리 → 제안 → 수락 → 실제 매출까지 한 줄에서 확인합니다.',
      why: '예측이 아니라 쌓인 기록을 규칙으로 정리한 것입니다.',
    },
    {
      route: '/',
      anchor: 'story',
      title: '그래서 무엇이 달라지는가',
      action: '현장 1회 입력 → 업무 자동 연결 → 거래처 데이터 축적 → 병원이 직접 확인·요청 → 데이터 기반 제안 → 추가 매출.',
      result: '수거만 하던 회사에서, 병원에 필요한 것을 함께 관리하는 회사로 넓히는 것이 목표입니다.',
    },
  ],
  stepsMobile: [
    {
      route: '/',
      title: '흩어진 업무를 한 줄로',
      action: '전화·종이·엑셀에 같은 내용을 여러 번 적던 일을 없애려고 만들었습니다.',
      result: '한 번 적으면 끝입니다.',
    },
    {
      route: '/',
      anchor: 'today-focus',
      title: '오늘 할 일',
      action: '남은 수거를 바로 입력하세요.',
      result: '일정·이력·자재·정산이 함께 갱신됩니다.',
    },
    {
      route: '/requests',
      anchor: 'requests-list',
      title: '병원 요청',
      action: '병원이 직접 올린 요청을 처리하고 회신합니다.',
      result: '병원 화면에 그대로 보입니다.',
    },
    {
      route: '/',
      anchor: 'today-focus',
      title: '그래서 무엇이 달라지는가',
      action: '현장 1회 입력 → 자동 연결 → 병원 서비스 → 추가 매출.',
      result: '자세한 내용은 더보기 → AX 도입 성과에 있습니다.',
    },
  ],
  finish: { label: '운영현황 보기', to: '/' },
}

// ── B. 현장 담당자 ────────────────────────────────────────────────────────────
//
//  현장은 하는 일이 하나뿐이라 짧게 갑니다. 다만 마지막에
//  "내가 적은 것이 어디로 가는지"를 한 줄 넣었습니다 —
//  그걸 알아야 대충 적지 않습니다.
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
      title: '자재는 규격별로',
      action: '가져다준 물품을 규격별로 적으세요. − + 로 세거나 직접 숫자를 넣으면 됩니다.',
      result: '63L 박스와 12L 박스는 값이 달라서, 규격을 적어야 정산이 맞습니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-save',
      title: '저장',
      action: '저장을 누르세요.',
      result: '자동 처리된 항목이 그 자리에 뜨고, 잘못 눌렀으면 취소됩니다.',
    },
    {
      route: '/today',
      title: '내가 적은 것이 가는 곳',
      action: '이 한 번의 입력으로 사무실의 일정·수거대장·자재 재고·월 정산·병원 안내가 함께 채워집니다.',
      result: '현장에서 정확히 적을수록 뒤에서 다시 묻는 일이 없어집니다.',
    },
  ],
  stepsMobile: [
    {
      route: '/today',
      anchor: 'next-visit',
      title: '다음 방문',
      action: '다음 갈 병원과 특이사항을 확인하세요.',
      result: '다음 순서가 항상 맨 위에 있습니다.',
    },
    {
      route: '/today',
      anchor: 'next-visit',
      title: '수거 입력 시작',
      action: '「수거 입력 시작」을 누르세요.',
      result: '병원 정보가 미리 채워집니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-supply',
      title: '자재는 규격별로',
      action: '− + 로 세거나 숫자를 직접 넣으세요.',
      result: '규격마다 값이 달라 정산에 그대로 쓰입니다.',
    },
    {
      route: '/collection',
      anchor: 'collect-save',
      title: '저장',
      action: '저장을 누르면 끝입니다.',
      result: '사무실 일정·대장·재고·정산이 함께 채워집니다.',
    },
  ],
  finish: { label: '오늘 일정 보기', to: '/today' },
}

// ── C. 병원 담당자 ───────────────────────────────────────────────────────────
//
//  병원은 우리 직원이 아니라 고객입니다. 그래서 "이 회사가 무엇을 하는지"가
//  아니라 "여기서 무엇을 하실 수 있는지"만 말합니다.
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
    {
      route: '/portal',
      anchor: 'portal-report',
      title: '전화 대신 화면으로',
      action: '요청·진행 상태·배출 기록이 한곳에 모여 있어, 필요할 때 직접 확인하시면 됩니다.',
      result: '병원 담당자가 바뀌어도 기록은 그대로 남습니다.',
    },
  ],
  stepsMobile: [
    {
      route: '/portal',
      anchor: 'portal-request',
      title: '수거 요청',
      action: '필요한 것을 눌러 보내세요.',
      result: '담당자 화면에 바로 뜹니다.',
    },
    {
      route: '/portal',
      anchor: 'portal-requests',
      title: '내 요청 진행 상태',
      action: '보낸 요청이 어디까지 왔는지 봅니다.',
      result: '담당자 회신도 같은 자리에 보입니다.',
    },
    {
      route: '/portal',
      anchor: 'portal-status',
      title: '우리 병원 현황',
      action: '다음 수거일과 배출량을 확인하세요.',
      result: '리포트는 인증 자료로 바로 씁니다.',
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
const SNOOZE_KEY = 'beonemirae-ops:tour-snooze'

/**
 * 오늘 하루 숨김.
 *
 * "다시 보지 않기"(영구)와 다릅니다. 오늘은 바쁘니 내일 다시 보여 달라는
 * 뜻이라, 날짜만 적어 두고 날이 바뀌면 저절로 풀립니다.
 *
 * 지금은 브라우저에만 저장합니다. 나중에 사용자별 설정으로 옮기려면
 * 이 두 함수만 바꾸면 되도록 저장 위치를 여기 한 곳에 모아 두었습니다.
 */
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function snoozeToday(id: TourId): void {
  try {
    const cur = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, string>
    cur[id] = todayKey()
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(cur))
  } catch {
    /* noop */
  }
}

export function snoozedToday(id: TourId): boolean {
  try {
    const cur = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, string>
    return cur[id] === todayKey()
  } catch {
    return false
  }
}

/** 안내 배너를 지금 띄울지 — 영구 숨김도, 오늘 숨김도 아닐 때만 */
export function shouldShowIntro(id: TourId): boolean {
  return !tourSeen(id) && !snoozedToday(id)
}

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
