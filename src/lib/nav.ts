import {
  Activity,
  PackageCheck,
  LayoutGrid,
  CalendarClock,
  CalendarPlus,
  Landmark,
  ReceiptText,
  Tags,
  Building2,
  PlusCircle,
  Boxes,
  Wallet,
  PieChart,
  Truck,
  Workflow,
  FileBarChart,
  History,
  SlidersHorizontal,
  ScrollText,
  MessageSquarePlus,
  Gauge,
  ClipboardCheck,
  Presentation,
  Lightbulb,
  Compass,
  Inbox,
  UserCog,
  FileSpreadsheet,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from './tone'

// ─────────────────────────────────────────────────────────────────────────────
// 메뉴 목차 — 한 곳에서만 정합니다
//
//  PC 사이드바와 폰의 「더보기」가 각자 자기 목록을 들고 있으면 시간이 지나며
//  순서와 분류가 갈립니다. 실제로 갈렸습니다 — 폰에서는 무엇이 어느 묶음인지
//  알 수 없고, PC 에서 익힌 자리가 폰에서는 다른 곳에 있었습니다.
//
//  두 화면이 같은 목록을 읽습니다. 그래야 「PC 에서 본 그 자리」가 폰에도
//  있습니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** 한 줄 설명 — 무엇을 하는 메뉴인지 목차에서 바로 읽히게 */
  desc: string
  tone: Tone
}

/**
 * 핵심 운영 — 매일 쓰는 화면 (폰에서는 하단 고정 메뉴가 같은 자리를 맡습니다)
 *
 *  ⚠ 0074 — **자재 관리**를 여기로 올렸습니다. 실제로는 매일 여는 화면인데
 *    「운영 도구」 열 줄 사이에 묻혀 있어서, 재고를 보려면 목차를 훑어야
 *    했습니다. 수거 입력이 재고를 깎는 화면이므로 바로 옆에 둡니다.
 *  ⚠ **수거이력**도 올렸습니다. 「방금 들어온 기록이 이상하다」를 확인하는
 *    자리인데, 그것도 도구 사이에 있었습니다 — 잘못된 기록을 찾는 데
 *    걸리는 시간이 곧 대표님이 카톡으로 되묻는 이유였습니다.
 *    (현장 담당자에게는 두 화면 다 안 열립니다 — access.ts 가 막습니다.)
 */
// ─────────────────────────────────────────────────────────────────────────────
//  묶음을 접고 편 상태 — **PC 와 폰이 같은 것을 씁니다** (0110)
//
//   예전에는 PC 사이드바만 기억하고 폰 「더보기」는 열 때마다 초기 상태로
//   돌아갔습니다. 같은 목차를 두 곳에서 보는데 한쪽만 기억하면, 「아까 펴
//   뒀는데」가 됩니다. 묶음 id 가 같으므로 저장소도 하나면 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_OPEN_KEY = 'beonemirae-ops:nav-open'

export function readNavOpen(id: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(NAV_OPEN_KEY)
    if (!raw) return fallback
    const map = JSON.parse(raw) as Record<string, unknown>
    return typeof map?.[id] === 'boolean' ? (map[id] as boolean) : fallback
  } catch {
    return fallback
  }
}

export function writeNavOpen(id: string, value: boolean): void {
  try {
    const raw = window.localStorage.getItem(NAV_OPEN_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    window.localStorage.setItem(NAV_OPEN_KEY, JSON.stringify({ ...map, [id]: value }))
  } catch {
    /* 저장이 안 되더라도 메뉴 자체는 그대로 동작해야 합니다 */
  }
}

/** 추가 개발 예정 — 아직 실사용 단계가 아닌 확장 기능 */
export const PLANNED: string[] = [
  'AI 배차·경로 고도화',
  '소모품 주문·결제',
  '배출자 교육 이력 관리',
  '리포트 자동 발송(PDF·메일)',
  '올바로 API 연동',
  '병원 다중 담당자 계정',
  'SaaS 서비스 확장',
]

/**
 * 목차 한 묶음.
 *
 *  ⚠ 0110 — **묶음을 여섯으로 다시 짰습니다** (대표님 지시).
 *
 *    예전에는 「핵심 운영 6 · 병원 서비스 7 · 운영 도구 8(+예정 7) · 관리 6」
 *    이 전부 펼쳐진 채로 37줄이었습니다. 1080 화면에서 「관리」를 보려면
 *    스크롤을 해야 했고, 묶음 이름이 일하는 순서와 달라 어디를 봐야 할지
 *    한 번에 읽히지 않았습니다.
 *
 *    이제 **여섯 묶음**이고, 처음에는 「오늘 업무」만 펼쳐져 있습니다.
 *    나머지는 제목 한 줄씩이라 목차 전체가 한눈에 들어옵니다.
 *
 *  ⚠ **아무 기능도 지우지 않았습니다. 주소도 전부 그대로입니다.**
 *    접는 것은 감추는 것이지 없애는 것이 아닙니다.
 *  ⚠ 접고 펴는 상태는 예전 방식 그대로 기억합니다(localStorage).
 *  ⚠ 폰 「더보기」도 이 같은 목록을 읽습니다 — 첫 묶음(오늘 업무)만 빼고요.
 *    그 넷은 폰 하단 고정 탭이 맡고 있어서, 더보기에 또 넣으면 같은 것이
 *    두 자리에 생깁니다.
 */
export interface NavGroupDef {
  id: string
  title: string
  /** 처음 열었을 때 펼쳐 둘지 — 「오늘 업무」 하나뿐입니다 */
  defaultOpen: boolean
  items: NavItem[]
  /** 아직 못 쓰는 것 (자물쇠) — 「활용 계획」과 같은 자리에 둡니다 */
  planned?: string[]
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'today',
    title: '오늘 업무',
    //  ⚠ 여기 네 줄은 폰 하단 고정 탭과 **같은 항목**입니다. 매일 누르는
    //    자리라고 이미 정해 둔 것이라, 「자주 쓰는 것」의 근거를 새로
    //    지어내지 않았습니다.
    defaultOpen: true,
    items: [
      { to: '/', label: '대시보드', icon: LayoutGrid, desc: '오늘 현황 · 핵심 지표', tone: 'blue' },
      { to: '/today', label: '오늘 일정', icon: CalendarClock, desc: '방문 · 완료 · 입력 대기', tone: 'sky' },
      { to: '/collection', label: '수거 입력', icon: PlusCircle, desc: '한 번 입력 → 자동 연결', tone: 'emerald' },
      { to: '/clients', label: '거래처', icon: Building2, desc: '병원별 이력 · 메모 · 추천', tone: 'navy' },
    ],
  },
  {
    id: 'ops',
    title: '현장·운영',
    //  매일 열지는 않지만 **무언가 확인할 때** 여는 자리입니다.
    //  (0074 에서 자재 관리·수거이력을 핵심으로 올렸던 판단을 여기로 옮겼습니다)
    defaultOpen: false,
    items: [
      { to: '/history', label: '수거이력', icon: History, desc: '지난 입력 확인 · 수정 · 취소', tone: 'sky' },
      { to: '/plan', label: '일정 편성', icon: CalendarPlus, desc: '실제 기록의 요일로 예정 만들기', tone: 'navy' },
      { to: '/dispatch', label: '배차·경로', icon: Truck, desc: '차량별 배차 · 경로 추천', tone: 'navy' },
      { to: '/materials', label: '자재 관리', icon: Boxes, desc: '재고 · 입고 · 정정 · 최근 변동', tone: 'teal' },
    ],
  },
  {
    id: 'service',
    title: '병원 서비스',
    defaultOpen: false,
    items: [
      { to: '/requests', label: '고객 요청', icon: Inbox, desc: '병원이 올린 요청·문의 처리 · 회신', tone: 'violet' },
      { to: '/reports', label: '운영 리포트', icon: FileBarChart, desc: '병원에 제공하는 월간 리포트', tone: 'sky' },
      //  0083 — 거래처를 「목록」이 아니라 「관리할 고객」으로 봅니다.
      { to: '/insight', label: '거래처 인사이트', icon: Activity, desc: '거래처 상태 · 다음 조치 (규칙 기반)', tone: 'teal' },
      //  매출 AX — 쇼핑몰이 아니라 「병원이 쓰는 만큼 추천하고 다음 수거 때 전달」입니다.
      { to: '/supplies', label: '소모품 주문', icon: PackageCheck, desc: '사용량 추천 · 수거 때 전달 · 판매 실적', tone: 'teal' },
    ],
  },
  {
    id: 'money',
    title: '정산·매출',
    //  순서는 실제 월 업무 흐름입니다: 청구 → 미수 → 점검 → 입금 → 매출 → 통계.
    defaultOpen: false,
    items: [
      { to: '/billing', label: '월말 청구', icon: ReceiptText, desc: '그 달 전체를 한 번에 청구 확정', tone: 'navy' },
      { to: '/receivables', label: '미수금 관리', icon: Wallet, desc: '청구 · 입금 현황과 미수금', tone: 'navy' },
      //  ⚠ 0110 — 「거래처 점검」에서 이름만 바꿨습니다. 하는 일은 그대로
      //    (청구·세금계산서에 빠진 값 찾기). 옛 이름은 무엇을 하는 화면인지
      //    알려 주지 않았습니다. **주소는 그대로 `/pricing` 입니다.**
      { to: '/pricing', label: '청구 전 점검', icon: Tags, desc: '청구·세금계산서에 빠진 값이 있는 곳 (단가 · 사업자정보)', tone: 'navy' },
      { to: '/bank', label: '통장 입금 대사', icon: Landmark, desc: '통장 입금내역을 청구에 붙이기', tone: 'navy' },
      { to: '/revenue', label: '매출 현황', icon: TrendingUp, desc: '누적 · 월평균 · 예상 연매출', tone: 'teal' },
      { to: '/stats', label: '통계', icon: PieChart, desc: '수거량 · 거래처 · 차량 실적', tone: 'navy' },
    ],
  },
  {
    id: 'ax',
    title: 'AX·심사',
    //  ⚠ 0110 — 「심사 시연」과 「만든 이유」를 **처음으로 목차에 올렸습니다.**
    //    둘 다 화면은 예전부터 있었는데 메뉴 어디에도 없어서 주소를 직접
    //    쳐야 했습니다. 실사 자리에서 못 찾는 화면은 없는 화면입니다.
    defaultOpen: false,
    items: [
      { to: '/ax-coach', label: 'AX 코치', icon: Compass, desc: '오늘 할 일 · 실증 자료 준비도', tone: 'emerald' },
      { to: '/performance', label: 'AX 도입 성과', icon: Gauge, desc: '회사 현황 · 확인된 변화 · 다음 할 일', tone: 'teal' },
      { to: '/readiness', label: '실증 준비 상태', icon: ClipboardCheck, desc: '준비 상태 · 증빙 · 브리핑 인쇄', tone: 'navy' },
      { to: '/presentation', label: '심사 시연', icon: Presentation, desc: '60초 시연 투어 · 발표 순서', tone: 'navy' },
      { to: '/why', label: '만든 이유', icon: Lightbulb, desc: '왜 만들었고 어디로 가는지', tone: 'amber' },
    ],
  },
  {
    id: 'admin',
    title: '관리',
    defaultOpen: false,
    items: [
      { to: '/settings', label: '설정', icon: SlidersHorizontal, desc: '글자 크기 · 데이터 백업 · 초기화', tone: 'navy' },
      { to: '/users', label: '사용자 관리', icon: UserCog, desc: '계정 승인 · 역할 · 사용 중지', tone: 'navy' },
      { to: '/dev-requests', label: '사용자 피드백', icon: MessageSquarePlus, desc: '직원·관리자가 남긴 후기', tone: 'navy' },
      { to: '/import', label: '엑셀 가져오기', icon: FileSpreadsheet, desc: '거래처별 정산 엑셀 옮기기', tone: 'navy' },
      { to: '/audit', label: '감사로그', icon: ScrollText, desc: '누가 무엇을 언제 바꿨는지', tone: 'navy' },
      { to: '/roadmap', label: '활용 계획', icon: Workflow, desc: '어떤 기능을 언제 쓰는지', tone: 'navy' },
    ],
    //  아직 못 쓰는 것 — 「활용 계획」 바로 아래, 자물쇠로 구분해 둡니다.
    //  누르면 「무엇을 검토 중이고 지금은 어떻게 하고 있는지」가 열립니다.
    planned: PLANNED,
  },
]

/**
 * 「추가 개발 예정」을 눌렀을 때 보여 주는 정직한 한 줄들 (0095).
 *
 *  ⚠ 잠긴 회색 글로만 두면 「앞으로 어디까지 가려는지」가 안 읽힙니다.
 *    그렇다고 날짜나 성능을 약속하지도 않습니다 — 여기 적는 것은
 *    **무엇을 검토 중인지**와 **지금은 어떻게 하고 있는지** 두 가지뿐입니다.
 */
export const PLANNED_DETAIL: Record<string, { what: string; now: string }> = {
  'AI 배차·경로 고도화': {
    what: 'T맵의 길·교통 정보와 AI 를 붙여 기사님별 방문 순서를 제안하는 기능을 준비하고 있습니다. 배차·경로 화면의 「AI 동선 추천」 단추에서 자세한 계획을 볼 수 있습니다.',
    now: '지금은 실제 수거 기록의 요일 패턴으로 편성하고, 순서는 담당자가 정합니다.',
  },
  '소모품 주문·결제': {
    what: '병원이 포털에서 주문한 물품을 카드로 바로 결제하는 것까지 검토하고 있습니다.',
    now: '지금도 주문은 포털에서 받습니다. 금액은 월 정산에 합산됩니다.',
  },
  '배출자 교육 이력 관리': {
    what: '병원별 법정 교육 이수 기록을 시스템에서 함께 관리하는 것을 검토하고 있습니다.',
    now: '지금은 교육 기록을 시스템 밖에서 따로 관리합니다.',
  },
  '리포트 자동 발송(PDF·메일)': {
    what: '매달 만드는 병원별 리포트를 PDF 로 만들어 메일로 자동 발송하는 기능입니다.',
    now: '지금은 병원이 포털에서 직접 확인하고, 화면에서 인쇄할 수 있습니다.',
  },
  '올바로 API 연동': {
    what: '수거·인계 기록을 올바로(환경부 시스템)에 자동으로 넘기는 연동을 검토하고 있습니다.',
    now: '지금은 시스템의 수거 기록을 보고 올바로에 직접 신고합니다.',
  },
  '병원 다중 담당자 계정': {
    what: '병원 하나에 담당자 계정을 여러 개 두는 것을 검토하고 있습니다.',
    now: '지금은 병원당 계정 하나로 씁니다.',
  },
  'SaaS 서비스 확장': {
    what: '이 시스템을 다른 수거·운반 회사도 쓸 수 있는 서비스로 넓히는 것을 장기 과제로 보고 있습니다.',
    now: '지금은 비원미래의 실제 운영으로 시스템을 검증하는 단계입니다.',
  },
}

/**
 * 폰 하단 고정 메뉴 — 데스크톱 메뉴를 그대로 넣지 않습니다.
 *
 *  폰에서 실제로 반복해서 누르는 것만 남기고, 나머지는 전부 「더보기」로
 *  보냅니다. 역할마다 하는 일이 다르므로 구성도 다릅니다.
 *
 *   현장   오늘 갈 곳 → 입력 → 병원 정보. 대시보드는 아예 열리지 않습니다.
 *   사무실 오늘 할 일 → 입력 → 거래처.
 *
 *  네 번째 자리는 「병원 요청」이었습니다. 그런데 폰에서 하루에도 몇 번씩
 *  여는 곳은 거래처입니다 — 전화가 오면 그 병원의 수거이력·미수금·메모를
 *  바로 봐야 하기 때문입니다. 요청은 더보기의 「병원 서비스 · 성과」에
 *  그대로 있습니다.
 */
export const BOTTOM_NAV_STAFF: NavItem[] = [
  { to: '/', label: '홈', icon: LayoutGrid, desc: '', tone: 'blue' },
  { to: '/today', label: '오늘', icon: CalendarClock, desc: '', tone: 'sky' },
  { to: '/collection', label: '입력', icon: PlusCircle, desc: '', tone: 'emerald' },
  { to: '/clients', label: '거래처', icon: Building2, desc: '', tone: 'navy' },
]

export const BOTTOM_NAV_FIELD: NavItem[] = [
  { to: '/today', label: '오늘', icon: CalendarClock, desc: '', tone: 'sky' },
  { to: '/collection', label: '수거 입력', icon: PlusCircle, desc: '', tone: 'emerald' },
  { to: '/clients', label: '거래처', icon: Building2, desc: '', tone: 'navy' },
]
