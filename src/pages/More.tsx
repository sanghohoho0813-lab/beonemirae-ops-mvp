import { PageHeader } from '../components/PageHeader'
import { MoreMenu } from '../components/MoreMenu'

// ─────────────────────────────────────────────────────────────────────────────
// 더보기 페이지 (데스크탑 사이드바 경로용) — 모바일은 바텀시트로 노출
// ─────────────────────────────────────────────────────────────────────────────

export function More() {
  return (
    <div>
      <PageHeader title="더보기" subtitle="부가 메뉴 및 설정" />
      <MoreMenu variant="desktop" />
    </div>
  )
}
