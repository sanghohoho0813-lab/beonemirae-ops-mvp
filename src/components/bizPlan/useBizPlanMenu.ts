import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { canAccess } from '../../lib/access'
import { BIZPLAN_ENABLED, BIZPLAN_PATH } from '../../lib/bizPlan'
import { myRole } from '../../lib/bizPlanApi'

/**
 *  메뉴(더보기 · 사이드바 · 요청함 탭)에 「제출 예정 사업계획서」를 보일지 (0146)
 *   · 대표·관리자 — 늘 (등록 전에도 검토로 열림 · SQL 전이면 들어가서 안내를 봄)
 *   · 사무실 — 참여자로 등록된 계정만 (서버 bizplan_my_role 판단)
 *   · 현장 · 병원 · 시연(서버 없음) — 안 보임
 *  ⚠ 보이고 안 보이고는 편의입니다. 여는 것 · 고치는 것은 서버가 막습니다.
 */
export function useBizPlanMenu(): boolean {
  const { configured, role, profile } = useAuth()
  const allowed = BIZPLAN_ENABLED && configured && canAccess(role, BIZPLAN_PATH)
  const [member, setMember] = useState(false)
  const uid = profile?.id ?? ''
  useEffect(() => {
    if (!allowed || role !== 'office' || !uid) return
    let alive = true
    void myRole(uid).then((r) => alive && setMember(r === 'editor' || r === 'reviewer'))
    return () => {
      alive = false
    }
  }, [allowed, role, uid])
  if (!allowed) return false
  return role === 'admin' || member
}
