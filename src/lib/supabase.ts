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

/**
 * 시연 모드 — 로그인 없이 로컬 데이터로만 도는 모드.
 *
 *  **반드시 명시적으로 켜야 합니다.** 예전에는 "Supabase 설정이 없으면
 *  시연 모드" 였습니다. 그 규칙이 배포본에서 그대로 적용되어, Vercel 에
 *  환경변수를 넣지 않은 것만으로 운영 화면 전체가 로그인 없이 열렸습니다.
 *  대시보드·거래처·미수금·감사로그가 주소만 알면 다 보였습니다.
 *
 *  설정이 없다는 것은 "아직 연결되지 않았다"는 뜻이지 "인증을 건너뛰어도
 *  된다"는 뜻이 아닙니다. 이제 시연은 VITE_DEMO_MODE=1 로 빌드한 것만
 *  시연으로 봅니다. 배포본에는 이 값을 넣지 마세요.
 */
export const isDemoMode = import.meta.env.VITE_DEMO_MODE?.trim() === '1' && !isSupabaseConfigured

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
  //  0041 부터 관리자 승인이 곧 메일 인증입니다. 이 오류가 보인다는 것은
  //  「아직 승인 전」이라는 뜻이지, 신청한 사람이 뭘 잘못했다는 뜻이 아닙니다.
  //  예전 문구("이메일 인증이 완료되지 않았습니다")는 메일함을 뒤지게 만들어
  //  놓고 정작 눌러도 아무 일이 안 일어났습니다.
  if (/Email not confirmed/i.test(msg))
    return '아직 관리자 승인 전입니다. 승인되면 메일 확인 없이 바로 로그인됩니다. 담당자에게 승인을 요청해 주세요.'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg))
    return '네트워크에 연결할 수 없습니다. 통신 상태를 확인한 뒤 다시 시도해 주세요.'
  if (/JWT expired|invalid claim/i.test(msg)) return '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
  // ── 가입 신청 (0021) ──────────────────────────────────────────────────────
  //  Supabase 대시보드에서 가입이 꺼져 있으면 영문 원문이 그대로 보입니다.
  //  화면에는 가입 버튼이 있는데 누르면 영문 오류가 나는 상태라, 신청하는
  //  사람은 자기가 뭘 잘못했는지 알 수 없습니다.
  if (/[Ss]ignups? not allowed|signup_disabled/i.test(msg))
    return '아직 가입 신청을 받고 있지 않습니다. 관리자에게 계정 생성을 요청해 주세요.'
  if (/[Uu]ser already registered|already been registered/i.test(msg))
    return '이미 가입된 이메일입니다. 로그인하거나, 승인을 기다리고 있다면 관리자에게 문의해 주세요.'
  if (/[Pp]assword should be at least|weak.?password/i.test(msg))
    return '비밀번호가 너무 짧습니다. 8자 이상으로 정해 주세요.'
  if (/row-level security|permission denied/i.test(msg))
    return '이 작업을 수행할 권한이 없습니다. 관리자에게 문의해 주세요.'
  if (/duplicate key|schedules_no_duplicate_completion/i.test(msg))
    return '이미 완료 처리된 수거입니다. (중복 등록 방지)'
  // 비밀번호 재설정 메일 관련 — 그대로 두면 영문 원문이 직원에게 보입니다.
  if (/email address .* is invalid|email_address_invalid/i.test(msg))
    return '이 계정의 이메일 주소로는 메일을 보낼 수 없습니다. 관리자에게 문의해 주세요.'
  if (/rate limit|only request this after/i.test(msg))
    return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
  //  서버(DB)에 아직 없는 항목을 쓰려 할 때 나오는 오류입니다. 화면은
  //  새로 배포됐는데 DB 업데이트(migration)가 아직인 경우입니다. 그대로 두면
  //  "Could not find the 'snapshot' column of 'payments' in the schema cache"
  //  같은 영문이 직원에게 보입니다 — 무슨 뜻인지도, 무엇을 해야 하는지도
  //  알 수 없습니다.
  if (/Could not find the .* column|schema cache|column .* does not exist|relation .* does not exist/i.test(msg)) {
    //  **무엇이** 없는지 반드시 밝힙니다. 예전 문구는 「필요한 항목이 없습니다」
    //  뿐이라, 대표님이 SQL 을 다 실행하고도 무엇을 더 해야 하는지 알 수
    //  없었습니다 — 고칠 수 없는 오류 메시지는 없는 것과 같습니다.
    const what = missingName(msg)
    return (
      '이 기능에 필요한 항목이 서버에 아직 준비되지 않았습니다' +
      (what ? ` — ${what}` : '') +
      '. Supabase SQL Editor 에서 아직 실행하지 않은 RUN 파일을 실행해 주세요.'
    )
  }
  return msg
}

/**
 * 「무엇이 없는가」를 오류 원문에서 그대로 꺼냅니다.
 *
 *  PostgREST 는 `Could not find the table 'public.staff' in the schema cache`
 *  또는 `Could not find the 'sort' column of 'products' in the schema cache`
 *  라고 알려 줍니다. 이름을 지어내지 않고 **원문에 있는 것만** 씁니다 —
 *  못 찾으면 빈 문자열입니다.
 */
export function missingName(msg: string): string {
  const table = msg.match(/Could not find the table '([^']+)'/i)
  if (table) return `${table[1]} 표가 없습니다`
  const col = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i)
  if (col) return `${col[2]}.${col[1]} 칸이 없습니다`
  const pg = msg.match(/(?:relation|column) "([^"]+)" does not exist/i)
  if (pg) return `${pg[1]} 가 없습니다`
  return ''
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
