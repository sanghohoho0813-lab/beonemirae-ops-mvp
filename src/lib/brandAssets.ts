// ─────────────────────────────────────────────────────────────────────────────
//  브랜드 사진 자산 — 한 곳에서만 경로를 정합니다 (0095)
//
//  대표님이 Google Drive 에 준비하신 사진을 public/brand/ 로 옮겨 두었습니다.
//  ⚠ **저장소 안에 둡니다.** 바깥 CDN 에서 받아 오면, 병원 내부망처럼
//    바깥이 막힌 곳에서 그림이 통째로 빠집니다 — 글꼴이 실제로 그렇게
//    깨지는 것을 0094 에서 확인했습니다. 같은 실수를 반복하지 않습니다.
//
//  ⚠ 여기 적힌 파일만 씁니다. 경로를 화면마다 손으로 적으면 오타 하나가
//    「깨진 그림」으로 병원 화면에 나갑니다.
//
//  폴더에 **없는** 자산 6장(ax_workspace_bg · ax_manager_tablet ·
//  ax_report_evidence · why_ax_01~03)은 여기에도 없습니다 — 지어내지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const B = '/brand'

export const BRAND_IMG = {
  //  병원 Customer Platform 12장 — 0103 부터 12장 전부 자리가 있습니다
  //  (mobile_card_vertical 은 로그인 화면 옆 세로 패널로).
  heroMain: `${B}/hero_main.jpg`,               // 병원 홈 머리 배경 (수거차 + 병원)
  heroSecondary: `${B}/hero_secondary.jpg`,     // 문의 창 머리 (직원 2명 + 태블릿)
  servicePickup: `${B}/service_01_pickup_request.jpg`,   // 수거 요청 창 머리
  serviceUrgent: `${B}/service_02_emergency_pickup.jpg`, // 긴급 수거 창 머리
  serviceSupply: `${B}/service_03_supply_order.jpg`,     // 용기·봉투 창 머리
  offer20: `${B}/offer_01_container_20l.jpg`,   // 20L 용기 상품 카드
  offer30: `${B}/offer_02_container_30l.jpg`,   // 30L 용기 상품 카드
  offerBags: `${B}/offer_03_bags_boxes.jpg`,    // 봉투·박스 상품 카드
  brandStory: `${B}/brand_story_space.jpg`,     // 병원 홈 하단 회사 소개
  customerExperience: `${B}/customer_experience.jpg`, // 고객지원 머리
  trustBanner: `${B}/trust_banner.jpg`,         // 병원 홈 하단 신뢰 띠

  //  BUSINESS AX — 내부는 사진보다 KPI·업무가 먼저입니다. 그래서 전부
  //  이야기 화면(기획의도·활용 계획)에만 두고 대시보드에는 안 둡니다.
  axCover: `${B}/ax_cover_main.jpg`,            // 기획의도(Why AX) 머리
  axOperation: `${B}/ax_signature_operation.jpg`, // 기획의도 운영 설명
  //  0097 — 대표님이 Drive 에 추가하신 6장 (v3.0 신규)
  axWorkspace: `${B}/ax_workspace_bg.jpg`,      // 활용 계획 머리 넓은 띠
  axManagerTablet: `${B}/ax_manager_tablet.jpg`, // 기획의도 — 대표 판단·정책자금 문맥
  axReportEvidence: `${B}/ax_report_evidence.jpg`, // 기획의도 — 근거·실증 문맥
  whyCurrent: `${B}/why_ax_01_current.jpg`,     // 기획의도 — 지금 업무(전화·수기·엑셀)
  whyImproved: `${B}/why_ax_02_improved.jpg`,   // 기획의도 — 한 번 입력으로 이어진 뒤
  whyGrowth: `${B}/why_ax_03_growth.jpg`,       // 기획의도 — 데이터가 자산이 된 다음
  //  0103 — 세로(9:16) 한 장. 가로 화면들에는 자리가 없었는데, **로그인 화면의
  //  PC 옆 패널**이 딱 세로입니다. 직원·병원 모두 처음 보는 화면이라
  //  브랜드 사진이 있을 자리로도 맞습니다. 폰에서는 안 그립니다(폭이 없음).
  mobileCard: `${B}/mobile_card_vertical.jpg`,  // 로그인 옆 세로 패널 (PC)
} as const

/**
 * 상품 이름·규격으로 상품 사진을 고릅니다.
 *
 *  ⚠ 사진이 없는 규격은 **사진 없이** 둡니다. 아무 사진이나 돌려 넣으면
 *    병원이 사진을 보고 다른 용기를 주문합니다.
 */
export function productImageOf(name: string, spec: string): string | null {
  const t = `${name} ${spec}`
  if (/봉투|박스|골판지/.test(t)) return BRAND_IMG.offerBags
  if (/20\s*L/i.test(t)) return BRAND_IMG.offer20
  if (/30\s*L/i.test(t)) return BRAND_IMG.offer30
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
//  사진마다 **어디를 남기고 자를지** (0098)
//
//  대표님: 「사진 잘리는 부분들이 너무많아. 축소해주던지 해서 좀 잘 보이게 해줘」
//
//  ⚠ 원인은 크기가 아니라 **자르는 자리**였습니다. 원본은 4:3(1.33:1)인데
//    창 머리 띠는 5.4:1 이었습니다 — 세로를 네 배로 잘라내니, 가운데를
//    기준으로 자르는 기본값에서는 얼굴이 통째로 밖으로 나갔습니다.
//    (병원 담당자에게는 「뒤통수와 천장 사진」으로 보입니다.)
//
//  ⚠ 그래서 두 가지를 같이 고칩니다.
//     ① 띠를 원본 비율에 가깝게 (덜 자르기)
//     ② 남길 자리를 사진마다 지정 (얼굴이 있는 높이)
//
//  ⚠ 아래 값은 **원본을 하나씩 열어 피사체 높이를 재서** 넣은 것입니다.
//    짐작으로 넣지 않았습니다. 사진을 바꾸면 이 값도 다시 재야 합니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 사진 경로 → Tailwind object-position 클래스 */
const FOCUS: Record<string, string> = {
  //  수거차가 화면 아래쪽에 있습니다 — 위(하늘)를 버리고 차를 남깁니다.
  [`${B}/hero_main.jpg`]: 'object-[50%_68%]',
  //  선 사람 둘, 얼굴이 위쪽 22% 근처.
  [`${B}/hero_secondary.jpg`]: 'object-[50%_26%]',
  //  간호사 얼굴 31%.
  [`${B}/service_01_pickup_request.jpg`]: 'object-[50%_32%]',
  //  두 사람 얼굴 31%.
  [`${B}/service_02_emergency_pickup.jpg`]: 'object-[50%_32%]',
  //  두 사람 얼굴 21% — 가장 위쪽입니다.
  [`${B}/service_03_supply_order.jpg`]: 'object-[50%_24%]',
  //  복도에서 수레 미는 직원, 얼굴 28%.
  [`${B}/brand_story_space.jpg`]: 'object-[50%_30%]',
  //  태블릿 든 담당자, 얼굴 28%.
  [`${B}/customer_experience.jpg`]: 'object-[50%_30%]',
  //  직원 셋, 얼굴 30%.
  [`${B}/trust_banner.jpg`]: 'object-[50%_32%]',
  //  현장 사람들이 넓게 퍼져 있어 가운데보다 조금 위.
  [`${B}/ax_cover_main.jpg`]: 'object-[50%_45%]',
  [`${B}/ax_signature_operation.jpg`]: 'object-[50%_45%]',
  //  대표 얼굴 25%.
  [`${B}/ax_manager_tablet.jpg`]: 'object-[50%_28%]',
  //  피사체(태블릿·바인더)가 가운데 아래 — 기본값 그대로가 맞습니다.
  [`${B}/ax_report_evidence.jpg`]: 'object-[50%_50%]',
  //  관제 화면과 사람이 위쪽에 몰려 있습니다.
  [`${B}/ax_workspace_bg.jpg`]: 'object-[50%_38%]',
  //  사무실 전경 — 사람 얼굴이 가운데 근처.
  [`${B}/why_ax_01_current.jpg`]: 'object-[50%_42%]',
  [`${B}/why_ax_02_improved.jpg`]: 'object-[50%_40%]',
  //  ⚠ 이 장은 **한 장에 네 장면이 붙은 그림**입니다(관제실·병원·상차·차량).
  //    자르면 이야기가 깨지므로 배치할 때 원본 비율(16:9)을 씁니다.
  [`${B}/why_ax_03_growth.jpg`]: 'object-[50%_35%]',
  //  세로 사진 — 얼굴 38% · 태블릿 65%. 세로 패널이라 자를 것이 거의 없지만,
  //  조금이라도 자르면 아래(용기)를 버리고 얼굴·태블릿을 남깁니다.
  [`${B}/mobile_card_vertical.jpg`]: 'object-[50%_40%]',
}

/**
 * 이 사진을 자를 때 남길 자리.
 *  ⚠ 등록 안 된 사진은 가운데(기본값)입니다 — 용기 사진처럼 피사체가
 *    한가운데 있는 것들입니다.
 */
export function focusOf(src: string): string {
  return FOCUS[src] ?? 'object-center'
}
