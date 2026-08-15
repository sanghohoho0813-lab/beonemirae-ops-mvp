import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 인증 / 역할
//
//  · Supabase Auth 이메일+비밀번호 로그인. 세션은 자동 저장·갱신되어 새로고침
//    후에도 유지됩니다.
//  · 가입은 본인이 신청하고 관리자가 승인합니다(0021). 신청만 한 계정은
//    active=false 라 서버가 모든 데이터를 막습니다 — 화면에서 가리는 것이
//    아니라 RLS 가 막습니다. 역할은 승인할 때 관리자가 지정합니다.
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
  /**
   * 관리자가 승인한 시각. null 이면 가입 신청만 하고 아직 승인되지 않은 계정.
   *
   *  active=false 하나로는 「아직 승인 안 된 신규」와 「쓰다가 중지된 계정」이
   *  구분되지 않습니다. 두 경우에 보여 줄 안내가 전혀 다릅니다.
   */
  approvedAt: string | null
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
  /** 가입 신청 — 승인 전까지는 로그인해도 아무것도 열리지 않습니다 */
  signUp: (input: {
    email: string
    password: string
    name: string
  }) => Promise<{ ok: boolean; error?: string }>
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
  approved_at: string | null
  client_id: string | null
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  fontScale: r.font_scale,
  active: r.active,
  approvedAt: r.approved_at ?? null,
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
      .select('id, email, name, role, font_scale, active, approved_at, client_id')
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

  //  가입 신청.
  //
  //   역할은 여기서 보내지 않습니다. 보낼 수 있는 자리(options.data)는
  //   raw_user_meta_data 로 들어가는데, 그건 신청하는 사람이 무엇이든 적어 넣을
  //   수 있는 값입니다. 서버의 가입 트리거는 0021 부터 그 자리를 읽지 않고
  //   app_metadata(서버만 쓸 수 있는 자리)만 봅니다 — 그래서 여기서 role 을
  //   실어 보내도, 보내지 않아도 결과는 같습니다: 현장 + 승인 대기.
  //
  //   이름만 넘깁니다. 관리자가 승인 목록에서 누가 신청했는지 알아야 합니다.
  const signUp = useCallback(
    async ({ email, password, name }: { email: string; password: string; name: string }) => {
      if (!supabase) return { ok: false, error: 'Supabase 연결이 설정되지 않았습니다.' }
      if (password.length < 8) return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' }
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { name: name.trim() },
          //  Supabase 의 확인 메일이 어디로 돌아올지.
          //
          //   이걸 안 주면 프로젝트의 Site URL 을 씁니다. 그 값이 기본값
          //   (`http://localhost:3000`)이면 메일 속 링크가 **직원 폰의**
          //   localhost 로 갑니다. 실제로 눌러 보면
          //   「사이트에 연결할 수 없음 · ERR_CONNECTION_REFUSED」 가 뜹니다.
          //   가입한 사람은 자기가 뭘 고장 냈다고 생각합니다.
          //
          //   지금 보고 있는 주소로 돌려보냅니다. 어디에 배포돼 있든 맞습니다.
          //
          //   ※ 0041 부터는 관리자가 승인하면 메일을 누르지 않아도 됩니다.
          //     이건 그래도 메일이 나갈 때(대시보드 설정이 켜져 있을 때)
          //     막다른 길로 보내지 않기 위한 것입니다.
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })
      if (error) return { ok: false, error: friendlyError(error) }
      return { ok: true }
    },
    [],
  )

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
      signUp,
      signOut,
      updateProfile,
      refreshProfile,
      sendPasswordReset,
      changePassword,
    }),
    [
      loading,
      session,
      profile,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshProfile,
      sendPasswordReset,
      changePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
