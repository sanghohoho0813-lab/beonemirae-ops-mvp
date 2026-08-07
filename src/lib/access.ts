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
  // 관리자 전용
  { prefix: '/settings', roles: ['admin'] },
  { prefix: '/audit', roles: ['admin'] },
  { prefix: '/users', roles: ['admin'] },
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
