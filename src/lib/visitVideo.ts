// ─────────────────────────────────────────────────────────────────────────────
// 방문 · 발표용 영상 (0130 → 0133) — 파일 위치와 상세 내용
//
//  영상 파일: public/media/ 에 영상마다 두 판 — 세로(9:16 릴스) · 가로(16:9). 같은 음성·자막·길이라
//  화면에서 한 번 눌러 바꿔도 **보던 자리에서 이어** 재생됩니다. (앱과 같이 배포 · SQL 필요 없음)
//  ⚠ 저장소가 공개라 파일 주소를 아는 사람은 로그인 없이 받을 수 있습니다 —
//    대표님이 알고 「바로 보이게」를 고르셨습니다. 단추·화면만 admin·office 전용.
//
//  ⚠ 숫자는 **영상 음성에서 말한 그대로**입니다. 1원이라도 바꾸지 않습니다.
//    영상을 새로 만들면 versions · lengthLabel · chapters · numbers 를 같이 고칩니다.
//
//  0133 — 「강남 스타트업 지점 발표용 영상」을 **맨 위**에, 신용보증기금 방문용 영상은 그 아래로
//  (대표님). 화면은 VIDEOS 순서 그대로 그립니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface VideoVersion {
  id: 'tall' | 'wide'
  label: string
  short: string
  src: string
  /** 「내려받기」로 저장될 이름 — 영문 (한글 이름은 크롬이 무시합니다) */
  file: string
  ratio: readonly [number, number]
  sizeMB: number
}
export interface VideoDef {
  id: string
  eyebrow: string
  title: string
  summary: string
  lengthLabel: string
  versions: readonly VideoVersion[]
  /** 장면 시작 시각(초) — 영상 파일 기준 */
  chapters: readonly { at: number; title: string }[]
  /** 영상에서 말하는 숫자 — 말하지 않은 영상이면 비워 둡니다 (화면에 칸이 안 생김) */
  numbers: readonly { label: string; value: string; projection: boolean }[]
  /** 「보여드리기 전에」 */
  tips: readonly string[]
  /** 판(세로·가로) 고른 것을 기억하는 열쇠 */
  storageKey: string
}

//  강남 스타트업 지점 발표 — 발표를 시작하기 전에 트는 오프닝 (4분 19초)
//  ⚠ 숫자·성과를 말하지 않는 영상입니다. 새 사업장 운송 구조는 「준비 중」, 소모품·동종업계
//    솔루션은 「계획」, B2B 플랫폼은 「장기 목표」로 영상 안에 표시돼 있습니다.
export const GANGNAM_VIDEO: VideoDef = {
  id: 'gangnam',
  eyebrow: '강남 스타트업 지점 발표용',
  title: '강남 스타트업 지점 발표용 영상',
  summary: '㈜비원미래 발표 오프닝 영상',
  lengthLabel: '4분 19초',
  versions: [
    { id: 'tall', label: '세로 · 릴스 (9:16)', short: '세로 9:16', src: '/media/gangnam_present_v43_tall.mp4',
      file: 'BeoneMirae_Gangnam_startup_presentation_vertical_9x16.mp4', ratio: [9, 16], sizeMB: 27 },
    { id: 'wide', label: '가로 · 화면용 (16:9)', short: '가로 16:9', src: '/media/gangnam_present_v43_wide.mp4',
      file: 'BeoneMirae_Gangnam_startup_presentation_horizontal_16x9.mp4', ratio: [16, 9], sizeMB: 27 },
  ],
  chapters: [
    { at: 0, title: '인사 · 비원미래 소개' },
    { at: 12, title: '수집·운반의 역할 · 진입장벽' },
    { at: 36, title: '성장 과정 · 지금의 팀' },
    { at: 60, title: '성장하며 발견한 문제' },
    { at: 112, title: '문제 정리 · AX 운영 시스템' },
    { at: 138, title: '병원 포털 · 하나의 데이터' },
    { at: 153, title: '운송 방식의 변화' },
    { at: 173, title: '줄어드는 것 · 성장 구조' },
    { at: 202, title: '앞으로의 방향' },
    { at: 224, title: '다짐 · 발표 시작' },
  ],
  numbers: [],
  tips: [
    '소리를 켜 주세요 — 자막도 영상 안에 들어 있어 소리 없이도 읽힙니다.',
    '발표 바로 앞에 트는 오프닝입니다 — 마지막 말이 「그럼 지금부터 발표를 시작하겠습니다」입니다.',
    '영상 속 앱 화면의 병원·사람 이름은 예시 데이터입니다.',
    '새 사업장 운송 구조는 「준비 중」, 소모품·동종업계 솔루션은 「계획」으로 나옵니다 — 실적처럼 말하지 않습니다.',
  ],
  storageKey: 'beonemirae-ops:visit-video-version:gangnam',
}

export const VISIT_VIDEO: VideoDef = {
  id: 'kodit',
  eyebrow: '신용보증기금 방문용',
  title: '신용보증기금 방문용 영상',
  summary: '㈜비원미래 상담용 소개 영상',
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
  tips: [
    '소리를 켜 주세요 — 자막도 영상 안에 들어 있어 소리 없이도 읽힙니다.',
    '시간이 빠듯하면 1.25배로 보셔도 자막이 충분히 읽힙니다.',
    '영상 속 앱 화면의 병원·사람 이름은 예시 데이터입니다.',
    'AX 효과는 수치로 말하지 않습니다 — 지금은 데이터를 쌓는 단계라고 설명합니다.',
  ],
  //  ⚠ 0130 부터 쓰던 열쇠 그대로 — 고른 판이 이어집니다
  storageKey: 'beonemirae-ops:visit-video-version',
}

/** 화면에 그리는 순서 — 맨 위가 먼저 (0133: 강남 발표용 → 신용보증기금 방문용) */
export const VIDEOS: readonly VideoDef[] = [GANGNAM_VIDEO, VISIT_VIDEO]
