import type { UserRole } from '../context/AuthContext'

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
  { prefix: '/receivables', roles: ['admin', 'office'] },
  { prefix: '/stats', roles: ['admin', 'office'] },
  { prefix: '/reports', roles: ['admin', 'office'] },
  { prefix: '/dispatch', roles: ['admin', 'office'] },
  { prefix: '/requests', roles: ['admin', 'office', 'field'] },
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
  // 관리자 전용
  { prefix: '/settings', roles: ['admin'] },
  { prefix: '/audit', roles: ['admin'] },
  { prefix: '/users', roles: ['admin'] },
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
