/// <reference types="vite/client" />

// Supabase 연결 정보 — anon key 만 프론트엔드에서 사용합니다.
// service_role 키는 절대 여기에 넣지 않습니다(서버 전용).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** '1' 일 때만 시연 모드(로그인 없이 로컬 데이터)로 돕니다. 배포본에는 넣지 마세요. */
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
