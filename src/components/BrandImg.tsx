import { focusOf } from '../lib/brandAssets'

// ─────────────────────────────────────────────────────────────────────────────
//  브랜드 사진 한 장 (0098)
//
//  ⚠ 사진을 화면에 넣는 자리가 여덟 곳입니다. 자를 자리를 곳마다 손으로
//    적으면 한 군데는 반드시 빠지고, 빠진 그 한 곳이 「뒤통수 사진」이
//    됩니다(실제로 그랬습니다). 그래서 **한 곳을 지나가게** 합니다.
//
//  ⚠ `alt` 를 안 주면 장식으로 봅니다 — 읽어 주는 기기가 건너뜁니다.
//    사진이 정보를 담고 있으면 반드시 alt 를 주세요.
// ─────────────────────────────────────────────────────────────────────────────

export function BrandImg({
  src,
  alt = '',
  className = '',
  eager = false,
}: {
  src: string
  /** 빈 값이면 장식으로 처리합니다 */
  alt?: string
  className?: string
  /** 첫 화면에 바로 보이는 사진이면 켭니다 (머리 배경 등) */
  eager?: boolean
}) {
  return (
    <img
      data-brand-img={src}
      src={src}
      alt={alt}
      aria-hidden={alt === '' ? 'true' : undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      //  ⚠ object-cover 는 넘치는 쪽을 자릅니다. 어디를 남길지는
      //    focusOf 가 사진마다 정합니다 (원본을 재서 넣은 값).
      className={`object-cover ${focusOf(src)} ${className}`}
    />
  )
}
