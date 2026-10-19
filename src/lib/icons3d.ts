// ─────────────────────────────────────────────────────────────────────────────
// 입체 아이콘 (폰 화면) — 대표님이 주신 그림
//
//  원본: 대표님이 드라이브에 올린 아이콘 묶음 그림 7장. 한 장에 여러 개가 들어 있어
//  하나씩 잘라 배경의 색 얼룩만 지우고(그림 자체는 손대지 않음) 192px WebP 로 줄였습니다.
//  파일: public/icons3d/<이름>.webp
//
//  쓰는 곳: 폰 홈 「자주 쓰는 8개」 · 아래 탭 · 더보기(목차 칸 · 안내 목록).
//          고객용 화면(포털) — 홈 8칸 · 진행 단계 · 메뉴 (portal:… 이름).
//  PC 사이드바는 짙은 바탕의 작은 칸이라 지금처럼 선 아이콘을 씁니다.
//  ⚠ 그림 옆에 늘 이름이 있으므로 그림은 장식(alt="")입니다.
// ─────────────────────────────────────────────────────────────────────────────

const FILE: Record<string, string> = {
  //  홈 8칸 · 아래 탭
  '/': 'tab-home',
  '/today': 'today',
  '/collection': 'collect',
  '/clients': 'clients',
  '/history': 'history',
  '/requests': 'requests',
  '/receivables': 'receivables',
  '/revenue': 'revenue',
  '/materials': 'materials',
  //  현장·운영 · 병원 서비스
  '/plan': 'plan',
  '/dispatch': 'dispatch',
  '/reports': 'reports',
  '/insight': 'insight',
  '/supplies': 'supplies',
  //  정산·매출
  '/billing': 'billing',
  '/pricing': 'pricing',
  '/bank': 'bank',
  '/stats': 'stats',
  //  AX·심사
  '/ax-coach': 'ax-coach',
  '/performance': 'performance',
  '/readiness': 'readiness',
  '/why': 'why',
  '/presentation': 'presentation',
  //  관리
  '/settings': 'settings',
  '/users': 'users',
  '/dev-requests': 'feedback',
  '/import': 'import',
  '/audit': 'audit',
  '/roadmap': 'roadmap',
  //  더보기 안내 · 바로가기 (주소가 아닌 것은 이름으로)
  '/company': 'company',
  '/visit-video': 'visit-video',
  'tour': 'tour',
  'feedback': 'feedback',
  //  0145 — 더보기 「관리」 칸에서 「사용자 피드백」(받은 함)과 나란히 놓여 그림을 달리합니다
  'feedback-send': 'p-ask',
  'allbaro': 'allbaro',
  'pcview': 'pcview',
  'planned': 'planned',
  //  아래 탭 — 「오늘」 · 「입력」 · 「더보기」는 탭 전용 그림
  'tab:/today': 'tab-today',
  'tab:/collection': 'tab-collect',
  'tab:more': 'tab-more',
  //  고객용 화면(병원 포털) — 대표님이 따로 만들어 주신 15개
  //   홈 빠른 메뉴 8칸
  'portal:urgent': 'p-urgent',
  'portal:pickup': 'p-pickup',
  'portal:supplies': 'p-supplies',
  'portal:billing': 'p-billing',
  'portal:report': 'p-report',
  'portal:history': 'p-history',
  'portal:docs': 'p-docs',
  'portal:ask': 'p-ask',
  //   다음 수거 진행 단계 4개 (지난 수거 → 일정 → 수거 → 처리장 인계)
  'portal:step-last': 'p-step-last',
  'portal:step-plan': 'p-step-plan',
  'portal:step-pick': 'p-step-pick',
  'portal:step-hand': 'p-step-hand',
  //   메뉴(폰 아래 띠 · PC 위 줄) — 수거 이력 · 고객지원은 위 8칸 그림을 같이 씁니다
  'portal:tab-home': 'p-tab-home',
  'portal:tab-requests': 'p-tab-requests',
  'portal:tab-billing': 'p-tab-billing',
}

/** 주소(또는 이름)에 맞는 입체 아이콘 주소. 없으면 undefined — 그때는 예전 선 아이콘을 씁니다. */
export function icon3d(key: string): string | undefined {
  const f = FILE[key]
  return f ? `/icons3d/${f}.webp` : undefined
}
