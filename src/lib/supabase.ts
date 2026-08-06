import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Supabase 클라이언트
//
//  · 프론트엔드에서는 anon key 만 사용합니다. service_role 키는 절대 번들에
//    포함하지 않습니다(서버 전용). anon key 는 공개되어도 RLS 로 보호됩니다.
//  · 환경변수가 없으면 client 는 null 이고, 앱은 '시연 모드(로컬 저장)'로만
//    동작합니다. 가짜 연결을 만들지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/** Supabase 연결 설정이 실제로 존재하는지 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // 새로고침 후에도 로그인 상태가 유지되도록 세션을 저장하고 자동 갱신합니다.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'beonemirae-ops:auth',
      },
    })
  : null

/** Supabase 오류를 사용자에게 보여줄 한국어 문구로 바꿉니다. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  if (!msg) return '알 수 없는 오류가 발생했습니다.'
  if (/Invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (/Email not confirmed/i.test(msg)) return '이메일 인증이 완료되지 않은 계정입니다. 관리자에게 문의해 주세요.'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg))
    return '네트워크에 연결할 수 없습니다. 통신 상태를 확인한 뒤 다시 시도해 주세요.'
  if (/JWT expired|invalid claim/i.test(msg)) return '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
  if (/row-level security|permission denied/i.test(msg))
    return '이 작업을 수행할 권한이 없습니다. 관리자에게 문의해 주세요.'
  if (/duplicate key|schedules_no_duplicate_completion/i.test(msg))
    return '이미 완료 처리된 수거입니다. (중복 등록 방지)'
  return msg
}

/** 네트워크 오류에 한해 지수 백오프로 재시도합니다. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      // 권한·검증 오류는 재시도해도 결과가 같으므로 즉시 실패시킵니다.
      if (!/Failed to fetch|NetworkError|fetch failed|timeout/i.test(msg)) throw e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i))
    }
  }
  throw lastError
}
