// ─────────────────────────────────────────────────────────────────────────────
// 입체 아이콘 (폰 화면) — 대표님이 주신 그림
//
//  원본: 대표님이 드라이브에 올린 아이콘 묶음 그림 7장. 한 장에 여러 개가 들어 있어
//  하나씩 잘라 배경의 색 얼룩만 지우고(그림 자체는 손대지 않음) 192px WebP 로 줄였습니다.
//  파일: public/icons3d/<이름>.webp
//
//  쓰는 곳: 폰 홈 「자주 쓰는 8개」 · 아래 탭 · 더보기(목차 칸 · 안내 목록).
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
  'allbaro': 'allbaro',
  'pcview': 'pcview',
  'planned': 'planned',
  //  아래 탭 — 「오늘」 · 「입력」 · 「더보기」는 탭 전용 그림
  'tab:/today': 'tab-today',
  'tab:/collection': 'tab-collect',
  'tab:more': 'tab-more',
}

/** 주소(또는 이름)에 맞는 입체 아이콘 주소. 없으면 undefined — 그때는 예전 선 아이콘을 씁니다. */
export function icon3d(key: string): string | undefined {
  const f = FILE[key]
  return f ? `/icons3d/${f}.webp` : undefined
}
