import type { UserRole } from '../context/AuthContext'
import { isHiddenRoute } from './pilotMode'

// ─────────────────────────────────────────────────────────────────────────────
// 역할별 화면 접근 정책
//
//  화면 노출(메뉴 숨김)과 라우트 차단에 같은 표를 씁니다.
//  DB 접근 제한은 별도로 RLS(0002_rls.sql / 0006_portal.sql)가 담당합니다 —
//  화면에서 숨기는 것만으로 끝내지 않습니다.
//
//   관리자(admin)  전체
//   사무실(office) 운영 관리 중심 · 사용자 관리/시스템 설정 제한
//   현장(field)    모바일 현장업무 중심 · 미수금/경영성과/매출 전환 숨김
//   병원(client)   병원 포털만 — 비원미래 내부 화면은 어느 것도 열지 않습니다
// ─────────────────────────────────────────────────────────────────────────────

/** 병원 고객 포털 경로 접두사 */
export const PORTAL_PREFIX = '/portal'

/**
 * 정확히 일치해야 하는 경로.
 * '/' 는 prefix 로 두면 모든 경로에 걸리므로 따로 관리합니다.
 * 대시보드에는 매출 기회·AX 성과 등 경영 지표가 있어 현장 담당자에게는 열지 않습니다.
 */
const EXACT_ROUTE_ROLES: Record<string, UserRole[]> = {
  '/': ['admin', 'office'],
}

/** 경로 → 접근 가능한 역할. 목록에 없는 경로는 로그인만 하면 접근 가능합니다. */
const ROUTE_ROLES: { prefix: string; roles: UserRole[] }[] = [
  // 병원 고객 포털 — 병원 담당자와 (확인용) 관리자만
  { prefix: PORTAL_PREFIX, roles: ['client', 'admin'] },
  // 경영 · 성과 · 매출
  { prefix: '/performance', roles: ['admin', 'office'] },
  //  매출 현황 — 회사 매출·예상 연매출. 현장에는 열지 않습니다.
  { prefix: '/revenue', roles: ['admin', 'office'] },
  { prefix: '/receivables', roles: ['admin', 'office'] },
  //  소모품 주문 — 판매가·원가·이익이 붙습니다. 현장에는 열지 않습니다.
  //  (현장은 오늘 일정의 「전달할 물품」 줄로 필요한 것만 봅니다)
  { prefix: '/supplies', roles: ['admin', 'office'] },
  //  청구·통장 대사는 돈 기록입니다 — 사무실·관리자만.
  { prefix: '/billing', roles: ['admin', 'office'] },
  //  단가는 청구 금액을 정하는 값입니다 — 현장에는 열지 않습니다.
  { prefix: '/pricing', roles: ['admin', 'office'] },
  { prefix: '/bank', roles: ['admin', 'office'] },
  { prefix: '/stats', roles: ['admin', 'office'] },
  { prefix: '/reports', roles: ['admin', 'office'] },
  { prefix: '/dispatch', roles: ['admin', 'office'] },
  //  일정 편성은 「누가 어디를 도는가」를 정하는 자리입니다 — 사무실 업무입니다.
  { prefix: '/plan', roles: ['admin', 'office'] },
  { prefix: '/requests', roles: ['admin', 'office', 'field'] },
  //  거래처 인사이트 — 미수금·매출 신호가 함께 보입니다. 현장에는 열지 않습니다.
  { prefix: '/insight', roles: ['admin', 'office'] },
  //  운영 도구 — 현장 담당자의 하루에 들어가지 않는 화면입니다.
  //
  //   자재 관리   재고·공급 내역 관리는 사무실 업무입니다. 현장에서 자재를
  //               건네는 일은 「수거 입력」 안에서 함께 처리됩니다.
  //   수거이력    지난 기록 조회. 오늘 할 일은 「오늘 일정」에 있습니다.
  //   활용 계획   개발 로드맵. 현장 업무와 무관합니다.
  //
  //  메뉴에서 지우는 것으로 끝내지 않고 경로도 함께 막습니다. 메뉴에만 없고
  //  주소로는 열리면, 화면 안 바로가기 버튼으로 들어가지는 곳이 생깁니다.
  { prefix: '/materials', roles: ['admin', 'office'] },
  { prefix: '/history', roles: ['admin', 'office'] },
  { prefix: '/roadmap', roles: ['admin', 'office'] },
  //  회사 이야기 · 시연 자료 — 업무 화면이 아닙니다.
  //
  //   /why             이 시스템을 만든 이유 (AX 전환·정책자금·사업고도화)
  //   /mobile-preview  시연용 모바일 미리보기
  //
  //  현장 담당자가 폰으로 여는 것은 오늘 갈 곳과 입력 화면입니다. 발표용
  //  자료가 같은 메뉴에 섞여 있으면 업무 화면을 찾기가 더 어려워집니다.
  { prefix: '/why', roles: ['admin', 'office'] },
  //  모바일 미리보기 — **현장 담당자도 엽니다** (0074).
  //
  //   대표님 보고: 「field 계정에서 PC 버전 → 모바일 버전 전환이 안 된다.
  //   admin 에서는 된다.」 원인이 여기였습니다. 왼쪽 아래에 「모바일 화면」
  //   단추는 현장에게도 보이는데, 누르면 「접근 권한이 없는 화면입니다」가
  //   떴습니다. **보이는데 막힌 단추**였습니다.
  //
  //   이 화면은 자료를 새로 보여 주지 않습니다 — 폰 크기 틀 안에 **본인이
  //   원래 보는 화면**을 그대로 띄울 뿐이고, 그 안도 같은 로그인·같은 RLS 를
  //   지납니다. 사무실 PC 로 나가기 전에 폰 화면을 확인하는 용도라
  //   현장에 오히려 필요합니다.
  { prefix: '/mobile-preview', roles: ['admin', 'office', 'field'] },
  // 관리자 전용
  { prefix: '/settings', roles: ['admin'] },
  { prefix: '/audit', roles: ['admin'] },
  { prefix: '/users', roles: ['admin'] },
  //  요청함은 관리자만 봅니다. 보내는 것은 누구나 하되(0022 RLS),
  //  모아 보는 화면은 대표님 자리입니다.
  { prefix: '/dev-requests', roles: ['admin'] },
  { prefix: '/import', roles: ['admin'] },
  // 대시보드는 경영 지표가 포함되므로 현장 담당자에게는 오늘 일정이 첫 화면입니다.
  { prefix: '/demo', roles: ['admin'] },
  { prefix: '/presentation', roles: ['admin'] },
]

/** 로그인 없이 볼 수 있는 공개 경로 (회사 홈페이지 · 로그인) */
export const PUBLIC_PATHS = ['/login', '/reset-password', '/home', '/company']

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))
}

export function isPortalPath(path: string): boolean {
  return path === PORTAL_PREFIX || path.startsWith(PORTAL_PREFIX + '/')
}

/** 이 역할이 해당 경로에 접근할 수 있는지 */
export function canAccess(role: UserRole | null, path: string): boolean {
  if (!role) return false
  //  ⚠ Pilot 동안 내려 둔 화면은 **누구에게도** 안 열립니다 (0080).
  //    여기 한 곳에서 막아야 사이드바·더보기·주소창이 전부 같이 막힙니다.
  //    메뉴에서만 빼면 옛 링크나 주소를 직접 칠 때 그대로 열려서
  //    「메뉴엔 없는데 왜 열리지」가 됩니다.
  //  ⚠ 관리자(admin) 보다 **먼저** 봅니다 — admin 은 아래에서 전부 통과라,
  //    뒤에 두면 대표님 화면에서만 그대로 보입니다.
  if (isHiddenRoute(path)) return false
  // 병원 계정은 포털 밖으로 나갈 수 없습니다(관리자 전체 허용보다 먼저 판단).
  if (role === 'client') return isPortalPath(path)
  if (role === 'admin') return true
  const exact = EXACT_ROUTE_ROLES[path]
  if (exact) return exact.includes(role)
  const rule = ROUTE_ROLES.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'))
  return rule ? rule.roles.includes(role) : true
}

/** 로그인 직후 이동할 첫 화면 — 병원은 포털, 현장 담당자는 오늘 일정 */
export function landingPath(role: UserRole | null): string {
  if (role === 'client') return PORTAL_PREFIX
  return role === 'field' ? '/today' : '/'
}

/** 대시보드 자체를 볼 수 있는지 (현장 담당자는 경영 KPI 를 보지 않습니다) */
export function canSeeDashboard(role: UserRole | null): boolean {
  return role === 'admin' || role === 'office'
}

/**
 * 돈에 관한 것을 볼 수 있는지 — 예상 매출·추천 제안·청구·미수금·영업 전환.
 *
 *  현장 담당자에게는 **금액이 붙은 것은 하나도 보이지 않아야 합니다.**
 *  미수금·통계 같은 화면은 이미 막혀 있었지만, 거래처 목록과 거래처 상세에
 *  「추가 수거 제안 · +70만원」처럼 금액이 함께 뜨고 있었습니다. 화면 자체는
 *  현장 업무에 필요한 곳이라 열려 있고, 그 안에 영업용 정보가 섞여 있던
 *  경우입니다.
 *
 *  청구·미수금 숫자는 서버(RLS)도 막고 있어 현장 토큰으로는 0건이 나옵니다.
 *  다만 그러면 화면에는 「청구금액」 표가 빈 채로 남습니다 — 막혀서 비어
 *  있는 것인지 거래가 없어서 비어 있는 것인지 알 수 없습니다. 아예 그리지
 *  않습니다.
 *
 *  예상 매출(추천)은 서버가 아니라 화면에서 계산합니다. 수거이력만 있으면
 *  나오는 값이라 RLS 로는 막을 수 없고, 여기서 막아야 합니다.
 */
export function canSeeMoney(role: UserRole | null): boolean {
  return role === 'admin' || role === 'office'
}

/**
 * 회사 이야기·시연 자료를 볼 수 있는지 — 만든 이유 · 시연용 핵심 요약 ·
 * 활용 계획 · 추가 개발 예정 목록 · 기술개발 현황 · 「시연용 MVP」 안내.
 *
 *  현장 담당자의 폰에서는 전부 내립니다. 업무에 쓰는 화면이 아니고, 폰은
 *  자리가 좁아 이런 항목이 섞여 있으면 정작 오늘 할 일을 찾기 어렵습니다.
 *  PC 사이드바에서는 이미 내렸는데 폰의 「더보기」에는 그대로 남아 있었습니다.
 */
export function canSeeShowcase(role: UserRole | null): boolean {
  return role === 'admin' || role === 'office'
}
