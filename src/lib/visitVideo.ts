// ─────────────────────────────────────────────────────────────────────────────
// 신용보증기금 방문용 영상 (0130) — 파일 위치와 상세 내용
//
//  영상 파일: public/media/ 의 두 판 — 세로(9:16 릴스) · 가로(16:9). 같은 음성·자막·길이라
//  화면에서 한 번 눌러 바꿔도 **보던 자리에서 이어** 재생됩니다. (앱과 같이 배포 · SQL 필요 없음)
//  ⚠ 저장소가 공개라 파일 주소를 아는 사람은 로그인 없이 받을 수 있습니다 —
//    대표님이 알고 「바로 보이게」를 고르셨습니다. 단추·화면만 admin·office 전용.
//
//  ⚠ 숫자는 **영상 음성에서 말한 그대로**입니다. 1원이라도 바꾸지 않습니다.
//    영상을 새로 만들면 versions · lengthLabel · chapters · numbers 를 같이 고칩니다.
// ─────────────────────────────────────────────────────────────────────────────

export const VISIT_VIDEO = {
  versions: [
    //  file — 「내려받기」로 저장될 이름 (카카오톡으로 보낼 때 이 이름 그대로)
    //  ⚠ 영문으로 둡니다. 한글 이름을 download 에 넣었더니 크롬이 무시하고 「download」라는
    //    이름 없는 파일로 받았습니다(check_visit_video). 영문은 폰·PC 어디서나 그대로 저장됩니다.
    { id: 'tall', label: '세로 · 릴스 (9:16)', short: '세로 9:16', src: '/media/sinbo_visit_v31_tall.mp4',
      file: 'BeoneMirae_KODIT_visit_vertical_9x16.mp4', ratio: [9, 16], sizeMB: 31 },
    { id: 'wide', label: '가로 · 화면용 (16:9)', short: '가로 16:9', src: '/media/sinbo_visit_v31_wide.mp4',
      file: 'BeoneMirae_KODIT_visit_horizontal_16x9.mp4', ratio: [16, 9], sizeMB: 31 },
  ],
  lengthLabel: '4분 20초',
  /** 장면 시작 시각(초) — 영상 파일 기준 */
  chapters: [
    { at: 0, title: '비원미래 소개 · 찾아온 이유' },
    { at: 38, title: '매출 흐름' },
    { at: 55, title: '성장하면서 커진 문제' },
    { at: 101, title: 'AX 운영 시스템과 실제 화면' },
    { at: 155, title: '지금 단계 · 과장하지 않는 이유' },
    { at: 173, title: '앞으로 쌓을 데이터 · 성장 방향' },
    { at: 235, title: '필요한 것 · 상담 요청' },
  ],
  numbers: [
    { label: '2023년 매출', value: '1억 2천만 원 수준', projection: false },
    { label: '2025년 매출', value: '5억 8천만 원', projection: false },
    { label: '2년간 성장', value: '약 5배 가까이', projection: false },
    { label: '2026년 상반기 매출', value: '약 4억 5천만 원 넘음', projection: false },
    { label: '2026년 연환산', value: '약 9억 원 수준', projection: true },
  ],
} as const
