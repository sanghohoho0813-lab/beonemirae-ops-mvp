import { PageHeader } from '../components/PageHeader'
import { ExcelImport } from '../components/ExcelImport'

// ─────────────────────────────────────────────────────────────────────────────
// 기존 거래처 엑셀 가져오기 (관리자 전용)
//
//  라우트 차단은 lib/access.ts 가, 실제 등록 권한은 0019 의 서버 함수가
//  다시 확인합니다 — 화면에서 숨기는 것만으로 끝내지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function ImportExcel() {
  return (
    <div>
      <PageHeader
        title="엑셀 가져오기"
        subtitle="업체별 거래처관리 엑셀 → 거래처 · 수거 · 자재 기록"
      />
      <ExcelImport />
    </div>
  )
}
