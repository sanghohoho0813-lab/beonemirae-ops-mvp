import { PageHeader } from '../components/PageHeader'
import { UserAdmin } from '../components/UserAdmin'
import { StaffInvites } from '../components/StaffInvites'

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
      <PageHeader
        title="사용자 관리"
        subtitle="가입 승인 · 사전 등록 · 계정 만들기 · 역할 · 담당 차량 · 사용/중지 · 비밀번호 초기화"
      />
      <div className="space-y-4">
        <div className="card p-4 sm:p-5">
          <UserAdmin />
        </div>
        {/*  사전 등록(초대) — 미리 적어 두면 그 이메일로 가입하는 순간
             역할·차량·담당 거래처가 붙습니다 (0056). */}
        <StaffInvites />
      </div>
    </div>
  )
}
