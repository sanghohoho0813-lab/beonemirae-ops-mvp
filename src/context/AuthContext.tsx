import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 인증 / 역할
//
//  · Supabase Auth 이메일+비밀번호 로그인. 세션은 자동 저장·갱신되어 새로고침
//    후에도 유지됩니다.
//  · 공개 회원가입은 제공하지 않습니다. 관리자가 초대한 계정만 로그인합니다.
//  · 역할은 profiles.role 에서 읽어옵니다(화면 노출 + DB RLS 양쪽에 사용).
//  · Supabase 미설정이면 mode='demo' 로 두고 기존 로컬 시연 모드로 동작합니다.
// ─────────────────────────────────────────────────────────────────────────────

// admin/office/field = 비원미래 내부 직원, client = 병원 고객 담당자
export type UserRole = 'admin' | 'office' | 'field' | 'client'

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: '대표 · 관리자',
  office: '사무실 담당자',
  field: '현장 담당자',
  client: '병원 담당자',
}

/** 비원미래 내부 직원 계정인지 (병원 고객 계정과 구분) */
export const isStaffRole = (role: UserRole | null): boolean =>
  role === 'admin' || role === 'office' || role === 'field'

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  fontScale: 'normal' | 'lg' | 'xl'
  active: boolean
  /** 병원 계정이면 소속 거래처 id (직원 계정은 null) */
  clientId: string | null
}

/** 앱 동작 모드 — 실제 운영(서버 DB) / 시연(로컬 저장) */
export type AppMode = 'live' | 'demo'

interface AuthContextValue {
  /** Supabase 연결 설정 존재 여부 (환경변수) */
  configured: boolean
  /** 초기 세션 확인 중 */
  loading: boolean
  session: Session | null
  profile: Profile | null
  role: UserRole | null
  mode: AppMode
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  /** 이름 / 글자크기 등 본인 프로필 수정 */
  updateProfile: (patch: Partial<Pick<Profile, 'name' | 'fontScale'>>) => Promise<void>
  refreshProfile: () => Promise<void>
  /** 비밀번호 재설정 메일 발송 (로그인 화면에서 사용) */
  sendPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>
  /** 로그인 상태에서 본인 비밀번호 변경 */
  changePassword: (next: string) => Promise<{ ok: boolean; error?: string }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type ProfileRow = {
  id: string
  email: string
  name: string
  role: UserRole
  font_scale: 'normal' | 'lg' | 'xl'
  active: boolean
  client_id: string | null
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  fontScale: r.font_scale,
  active: r.active,
  clientId: r.client_id ?? null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  // Supabase 미설정이면 확인할 세션이 없으므로 곧바로 로딩 완료 상태입니다.
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, role, font_scale, active, client_id')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return null
    return toProfile(data as ProfileRow)
  }, [])

  // 초기 세션 복원 + 이후 변경 구독
  useEffect(() => {
    if (!supabase) return
    let alive = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (data.session?.user) setProfile(await loadProfile(data.session.user.id))
      if (alive) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!alive) return
      setSession(s)
      setProfile(s?.user ? await loadProfile(s.user.id) : null)
      setLoading(false)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { ok: false, error: 'Supabase 연결이 설정되지 않았습니다.' }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { ok: false, error: friendlyError(error) }
    return { ok: true }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    //  이 기기에서만 로그아웃합니다.
    //
    //  supabase-js 의 기본값은 scope:'global' 이라, 로그아웃 한 번에 그 계정의
    //  '모든 기기' 세션이 끊깁니다. 한 계정을 두 사람이 각자 폰에서 쓰는
    //  경우(대표님 부부의 공용 메일이 그렇습니다) 한 사람이 로그아웃하면
    //  다른 사람이 일하다가 튕깁니다. 실제로 재현했습니다 — A 가 로그아웃한
    //  순간 B 의 갱신 토큰이 죽었습니다.
    //
    //  「로그아웃」은 "이 폰에서 나간다"는 뜻이지 "내 모든 기기를 끊는다"는
    //  뜻이 아닙니다. 기기를 잃어버렸을 때는 관리자가 계정을 중지하면 되고,
    //  그건 즉시 반영됩니다.
    await supabase.auth.signOut({ scope: 'local' })
    setProfile(null)
  }, [])

  const updateProfile = useCallback(
    async (patch: Partial<Pick<Profile, 'name' | 'fontScale'>>) => {
      if (!supabase || !profile) return
      const row: Record<string, unknown> = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.fontScale !== undefined) row.font_scale = patch.fontScale
      if (Object.keys(row).length === 0) return
      const { error } = await supabase.from('profiles').update(row).eq('id', profile.id)
      if (!error) setProfile({ ...profile, ...patch })
    },
    [profile],
  )

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return { ok: false, error: 'Supabase 연결이 설정되지 않았습니다.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) return { ok: false, error: friendlyError(error) }
    return { ok: true }
  }, [])

  const changePassword = useCallback(async (next: string) => {
    if (!supabase) return { ok: false, error: 'Supabase 연결이 설정되지 않았습니다.' }
    if (next.length < 8) return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' }
    const { error } = await supabase.auth.updateUser({ password: next })
    if (error) return { ok: false, error: friendlyError(error) }
    return { ok: true }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) setProfile(await loadProfile(session.user.id))
  }, [session, loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      profile,
      role: profile?.role ?? null,
      // 로그인된 상태에서만 실제 운영 모드입니다.
      mode: isSupabaseConfigured && !!session && !!profile ? 'live' : 'demo',
      signIn,
      signOut,
      updateProfile,
      refreshProfile,
      sendPasswordReset,
      changePassword,
    }),
    [loading, session, profile, signIn, signOut, updateProfile, refreshProfile, sendPasswordReset, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
