import { PageHeader } from '../components/PageHeader'
import { UserAdmin } from '../components/UserAdmin'

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 관리 (관리자 전용)
//
//  라우트 차단은 lib/access.ts 가, DB 차단은 RLS 와 0018 의 함수가 합니다.
//  이 화면은 관리자에게만 보이지만, 주소를 직접 쳐서 들어와도 서버가 다시
//  막습니다 — 화면에서 숨기는 것만으로 끝내지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function Users() {
  return (
    <div>
      <PageHeader title="사용자 관리" subtitle="계정 만들기 · 역할 · 사용/중지 · 비밀번호 초기화" />
      <div className="card p-4 sm:p-5">
        <UserAdmin />
      </div>
    </div>
  )
}
