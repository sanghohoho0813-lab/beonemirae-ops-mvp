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
  //  병원 Customer Platform (12장 중 11장 사용 — mobile_card_vertical 은
  //  세로형 카드 자리가 실제로 없어 배치하지 않았습니다)
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
  //  mobile_card_vertical.jpg 은 /brand 에 있으나 아직 자리가 없습니다 —
  //  세로형 카드 화면이 실제로 없어서입니다 (RECOMMENDATIONS.md P2).
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
