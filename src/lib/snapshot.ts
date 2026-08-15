// ─────────────────────────────────────────────────────────────────────────────
// 전체 스냅샷 — 「되돌릴 수 있는」 파일
//
//  지금까지 내려받던 파일 두 종류는 **되돌리는 용도가 아니었습니다.**
//
//   CSV        사람이 읽는 표입니다. 거래처를 이름으로 적고 참/거짓을 'O' 로
//              적습니다. 사람에겐 편하지만, 같은 이름의 거래처가 둘이면 어느
//              쪽인지 알 수 없어 **다시 넣을 수 없습니다.**
//   기존 JSON  화면이 쓰는 모양(AppData)이라 화면이 안 읽는 표 — 감사기록,
//              자재 입출고, 병원 요청 처리 결과 — 는 아예 들어 있지 않았습니다.
//
//  실제 위험은 이렇습니다. Supabase 자동 백업은 **그 프로젝트 안에** 있습니다.
//  프로젝트 자체가 사라지면(결제 중단·실수로 삭제·계정 문제) 백업도 같이
//  사라집니다. 그때 회사에 남는 것은 내려받아 둔 파일뿐입니다.
//
//  그래서 **DB 의 줄을 그대로** 담는 파일을 만듭니다. 사람이 읽기 좋은 모양으로
//  바꾸지 않습니다. id 도, 시각도, 안 쓰는 칸도 그대로 둡니다. 그래야 빈
//  데이터베이스에 다시 부어 넣을 수 있습니다.
//
//  ── 이 파일로 되살아나는 것과 아닌 것 ──────────────────────────────────
//
//   되살아난다   거래처 · 수거 · 자재 · 청구 · 입금 · 단가 · 매출 · 운영비 ·
//                현장 메모 · 병원 요청 · 휴무일 · 재고 · 감사기록
//   안 된다      **로그인 계정** — 계정은 Supabase 의 auth 영역에 있고 이
//                파일에 담기지 않습니다. 되돌린 뒤 사람은 새로 초대합니다.
//                (누가 넣었는지는 이름으로 남지만 계정 연결은 끊깁니다)
//
//  절차는 docs/RESTORE.md 에 있습니다. 실제로 되돌려 본 기록도 그 문서에
//  적혀 있습니다 — 해 보지 않은 절차는 절차가 아닙니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 스냅샷에 담는 표 하나 */
export interface SnapshotTable {
  /** DB 테이블 이름 — 되돌릴 때 그대로 씁니다 */
  name: string
  /** 사람이 읽는 이름 */
  label: string
  /** 나눠 읽을 때 쓸 정렬 칸 (없으면 순서가 흔들려 줄이 빠집니다) */
  order: string
  /** 이 표가 없으면 업무가 멈추는가 */
  core: boolean
}

/**
 * 담는 순서 = 되돌릴 때 넣는 순서입니다.
 *
 *  외래키가 있는 표는 가리키는 표보다 뒤에 와야 합니다. 순서를 바꾸면
 *  복구가 중간에 멈춥니다. 그래서 이 배열이 곧 복구 순서입니다.
 */
export const SNAPSHOT_TABLES: SnapshotTable[] = [
  //  사람이 먼저 — 담당 구분은 업무 자료입니다. 계정(profiles)은 안 담기므로
  //  profile_id 는 아래 nullify 로 비웁니다.
  { name: 'staff', label: '직원 명부', order: 'id', core: true },
  { name: 'clients', label: '거래처', order: 'id', core: true },
  { name: 'vehicles', label: '차량', order: 'id', core: true },
  { name: 'materials', label: '자재 공급', order: 'id', core: true },
  { name: 'material_transactions', label: '자재 입출고', order: 'id', core: false },
  { name: 'office_stock', label: '사무실 재고', order: 'id', core: false },
  { name: 'schedules', label: '수거', order: 'id', core: true },
  { name: 'site_notes', label: '현장 메모', order: 'id', core: true },
  { name: 'client_requests', label: '병원 요청', order: 'id', core: false },
  { name: 'request_overrides', label: '요청 처리 결과', order: 'request_id', core: false },
  { name: 'client_documents', label: '거래처 문서', order: 'id', core: false },
  { name: 'client_prices', label: '단가 이력', order: 'id', core: true },
  { name: 'client_monthly_actuals', label: 'Excel 월 실적', order: 'id', core: true },
  { name: 'revenue_overrides', label: '매출 직접입력', order: 'id', core: true },
  { name: 'operating_costs', label: '월 운영비', order: 'id', core: true },
  { name: 'holidays', label: '휴무일', order: 'day', core: false },
  { name: 'payments', label: '청구', order: 'id', core: true },
  { name: 'payment_receipts', label: '입금', order: 'id', core: true },
  { name: 'collection_events', label: '수거 입력 기록', order: 'id', core: false },
  { name: 'sales_leads', label: '추가 매출 제안', order: 'id', core: false },
  { name: 'sales_lead_events', label: '제안 이력', order: 'id', core: false },
  { name: 'audit_logs', label: '감사기록', order: 'id', core: true },
  { name: 'experiment_settings', label: 'AX 실증 설정', order: 'id', core: false },
  { name: 'performance_baselines', label: 'AX 기준값', order: 'id', core: false },
  //  국세청 신고 매출 — 증명서를 다시 뽑으면 되지만, 넣어 둔 것을 잃으면
  //  전년 동기 비교가 통째로 사라집니다. 업무 자료로 담습니다.
  { name: 'tax_filings', label: '신고 매출', order: 'id', core: true },
]

/**
 * 되돌릴 때 비워야 하는 칸 — 전부 `profiles`(계정)를 가리킵니다.
 *
 *  계정은 이 파일에 담기지 않으므로, 그대로 넣으면 「없는 계정을 가리킨다」며
 *  복구가 통째로 실패합니다. 이 칸들만 비우면 나머지는 전부 들어갑니다.
 *  누가 했는지는 대부분 이름(actor_name)으로 따로 남아 있어 읽을 수 있습니다.
 */
export const PROFILE_REFS: Record<string, string[]> = {
  staff: ['profile_id'],
  clients: ['created_by', 'updated_by'],
  materials: ['created_by'],
  material_transactions: ['created_by'],
  office_stock: ['updated_by'],
  schedules: ['created_by', 'updated_by'],
  site_notes: ['created_by', 'updated_by'],
  client_requests: ['created_by', 'handled_by'],
  request_overrides: ['updated_by'],
  client_documents: ['created_by', 'updated_by'],
  payments: ['updated_by'],
  collection_events: ['actor_id'],
  sales_leads: ['created_by', 'updated_by'],
  sales_lead_events: ['actor_id'],
  audit_logs: ['actor_id'],
  experiment_settings: ['updated_by'],
  performance_baselines: ['updated_by'],
}

/**
 * 일부러 담지 않는 표.
 *
 *  화면에 그대로 적습니다 — 빠진 줄 모르고 안심하는 것이 가장 위험합니다.
 */
export const SNAPSHOT_EXCLUDED: { name: string; label: string; why: string }[] = [
  {
    name: 'profiles',
    label: '사용자 계정',
    why: '로그인 계정은 Supabase 가 따로 보관합니다(auth). 되돌린 뒤 사람을 새로 초대합니다.',
  },
  {
    name: 'dev_requests',
    label: '개발자 요청',
    why: '요청자 계정이 반드시 있어야 하는 표라 계정 없이는 넣을 수 없습니다. 업무 자료는 아닙니다.',
  },
  {
    name: 'app_errors',
    label: '오류 기록',
    why: '고장을 찾을 때 보는 기록입니다. 업무 자료가 아니라 되돌릴 대상이 아니고, 백업만 무겁게 합니다.',
  },
]

export interface Snapshot {
  app: 'beonemirae-ops'
  kind: 'full-snapshot'
  /** 파일 형식 판(파일을 읽는 쪽이 이 숫자를 봅니다) */
  format: 1
  /** 이 스냅샷을 만든 DB 의 스키마 판 */
  schemaVersion: number | null
  takenAt: string
  takenBy: string
  /** 복구 순서 = 이 배열 순서 */
  order: string[]
  /** 되돌릴 때 비울 칸 */
  nullify: Record<string, string[]>
  /** 표 이름 → 줄 그대로 */
  tables: Record<string, unknown[]>
  /** 읽지 못한 표 (권한·마이그레이션 전) — 숨기지 않습니다 */
  unreadable: { name: string; reason: string }[]
  /** 일부러 뺀 표 */
  excluded: typeof SNAPSHOT_EXCLUDED
}

export interface SnapshotInput {
  tables: Record<string, unknown[]>
  unreadable: { name: string; reason: string }[]
  schemaVersion: number | null
  takenBy: string
  takenAt: string
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const order = SNAPSHOT_TABLES.map((t) => t.name).filter((n) => input.tables[n] != null)
  return {
    app: 'beonemirae-ops',
    kind: 'full-snapshot',
    format: 1,
    schemaVersion: input.schemaVersion,
    takenAt: input.takenAt,
    takenBy: input.takenBy,
    order,
    nullify: PROFILE_REFS,
    tables: input.tables,
    unreadable: input.unreadable,
    excluded: SNAPSHOT_EXCLUDED,
  }
}

/** 화면에 보여 줄 요약 — 무엇이 몇 줄 담겼는지 */
export function snapshotSummary(snap: Snapshot): { name: string; label: string; count: number; core: boolean }[] {
  return SNAPSHOT_TABLES.filter((t) => snap.tables[t.name] != null).map((t) => ({
    name: t.name,
    label: t.label,
    count: (snap.tables[t.name] ?? []).length,
    core: t.core,
  }))
}

export function snapshotRowCount(snap: Snapshot): number {
  return Object.values(snap.tables).reduce((n, rows) => n + rows.length, 0)
}

export function snapshotFilename(snap: Snapshot): string {
  //  파일 이름에 날짜와 시각을 넣습니다 — 같은 날 두 번 받아도 덮어쓰지
  //  않아야 「어느 게 최신이지」로 헤매지 않습니다.
  const stamp = snap.takenAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 13)
  return `비원미래-전체스냅샷-${stamp}.json`
}

export function downloadSnapshot(snap: Snapshot): void {
  const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = snapshotFilename(snap)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
