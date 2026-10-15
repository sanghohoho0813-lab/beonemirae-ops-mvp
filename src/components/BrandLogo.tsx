// ─────────────────────────────────────────────────────────────────────────────
// 비원미래 로고 — 한 군데 (포털 3차)
//
//  0141 — 대표님이 주신 회사 로고(동그란 「b」 표시)를 넣었습니다. 여기 한 곳만 바꾸면
//  머리띠 · 로그인 · 가입 · 비밀번호 재설정 · 직원 화면의 로고가 함께 바뀝니다.
//
//   그림: public/brand/logo-mark.png (원본 public/brand/beonemirae-logo-full.jpg 에서 표시만 잘라 냄)
//   흰 바탕 그림이라 흰 칸 안에 둡니다 — 짙은 메뉴 바탕 · 밝은 머리띠 어디서나 같은 모양.
//   (PWA 아이콘은 public/icons/*.png — 그림 파일이라 따로 갈아 끼웁니다)
//
//  ⚠ 로고를 아무 데나 반복하지 않습니다 — 머리띠 · 로그인 · PWA 정도만.
//    화면 안(회신 · 카드 머리)에 「비」를 또 그리지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 로고 그림 주소. null 이면 예전 「비」 글자 칸을 그립니다 */
const LOGO_SRC: string | null = '/brand/logo-mark.png'

const SIZE = {
  sm: 'h-8 w-8 rounded-[10px] text-[1.08rem]',
  md: 'h-10 w-10 rounded-[12px] text-[1.15rem] sm:h-11 sm:w-11 sm:text-[1.25rem]',
  lg: 'h-14 w-14 rounded-[16px] text-[1.55rem]',
} as const

const TONE = {
  //  밝은 바탕 위 (포털 머리띠 · 로그인)
  brand: 'bg-teal-500 text-white',
  //  짙은 바탕 위 (직원 폰 머리띠)
  dark: 'bg-navy-900 text-teal-300',
} as const

export function BrandLogo({
  size = 'md',
  tone = 'brand',
  className = '',
}: {
  size?: keyof typeof SIZE
  tone?: keyof typeof TONE
  className?: string
}) {
  if (LOGO_SRC) {
    return (
      <span
        role="img"
        aria-label="비원미래"
        data-brand-logo
        className={`flex shrink-0 select-none items-center justify-center bg-white ring-1 ring-navy-100 ${SIZE[size]} ${className}`}
      >
        <img src={LOGO_SRC} alt="" aria-hidden="true" draggable={false} className="h-[84%] w-[84%] object-contain" />
      </span>
    )
  }
  return (
    <span
      role="img"
      aria-label="비원미래"
      className={`flex shrink-0 select-none items-center justify-center font-black ${SIZE[size]} ${TONE[tone]} ${className}`}
    >
      <span aria-hidden="true">비</span>
    </span>
  )
}
