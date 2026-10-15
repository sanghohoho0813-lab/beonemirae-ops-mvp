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

//  강남 스타트업 지점 발표 — 회사 소개 영상 (4분 46초 · v46)
//  ⚠ 0140 — 대표님 수정 대본: 연도별 매출 · 「내부 직원이 실제 업무에 사용 중」 · AI 요청 분석
//    (성격 · 긴급도 · 핵심 · 회신 초안 → 담당자 확인, 활용 범위는 단계적으로 — 계획) 이 들어갔고,
//    배경 음악이 아주 작게 깔립니다.
//  ⚠ v46 — 대표님 새 TTS: 「사업이 성장하고 … 새로운 문제를 발견했습니다」 한 문장(돋보기 장면)을 빼고,
//    마지막 말이 「그럼 지금부터 발표를 시작하겠습니다」 → 「감사합니다」. 병원 포털 장면은 **지금 화면**(3차 디자인)으로
//    다시 찍음. 나머지 장면 · 글자는 v45 그대로.
//  ⚠ 말하는 숫자는 연도별 매출 세 개뿐 — **영상에서 말한 그대로**(약 …) 적습니다. 올해 숫자 ·
//    예상치는 영상에도 여기에도 없습니다(「올해도 성장세」만). 새 사업장 운송 구조는 「준비 중」,
//    소모품 · 동종업계 솔루션은 「계획」, B2B 플랫폼은 「장기 목표」로 영상 안에 표시돼 있습니다.
export const GANGNAM_VIDEO: VideoDef = {
  id: 'gangnam',
  eyebrow: '강남 스타트업 지점 발표용',
  title: '강남 스타트업 지점 발표용 영상',
  summary: '㈜비원미래 발표 소개 영상',
  lengthLabel: '4분 46초',
  versions: [
    { id: 'tall', label: '세로 · 릴스 (9:16)', short: '세로 9:16', src: '/media/gangnam_present_v46_tall.mp4',
      file: 'BeoneMirae_Gangnam_startup_presentation_vertical_9x16.mp4', ratio: [9, 16], sizeMB: 31 },
    { id: 'wide', label: '가로 · 화면용 (16:9)', short: '가로 16:9', src: '/media/gangnam_present_v46_wide.mp4',
      file: 'BeoneMirae_Gangnam_startup_presentation_horizontal_16x9.mp4', ratio: [16, 9], sizeMB: 31 },
  ],
  chapters: [
    { at: 0, title: '인사 · 비원미래 소개' },
    { at: 11, title: '수집·운반의 역할 · 진입장벽' },
    { at: 33, title: '성장 과정 · 실제 매출' },
    { at: 56, title: '지금의 팀' },
    { at: 68, title: '반복 수요 · 새로운 문제' },
    { at: 114, title: '문제 정리 · AX 운영 시스템' },
    { at: 139, title: '실제 사용 · 병원 포털' },
    { at: 150, title: 'AI 요청 분석 · 단계적 확대' },
    { at: 169, title: '전화 · 문자도 하나의 데이터' },
    { at: 178, title: '운송 방식의 변화' },
    { at: 199, title: '줄어드는 것 · 성장 구조' },
    { at: 228, title: '앞으로의 방향' },
    { at: 251, title: '다짐 · 감사 인사' },
  ],
  //  영상 음성에서 말한 그대로 — 1원이라도 바꾸지 않습니다
  numbers: [
    { label: '2023년 매출', value: '약 1억 2천만 원', projection: false },
    { label: '2024년 매출', value: '약 3억 6천만 원', projection: false },
    { label: '2025년 매출', value: '약 5억 8천만 원', projection: false },
  ],
  tips: [
    '소리를 켜 주세요 — 자막도 영상 안에 들어 있어 소리 없이도 읽힙니다. 배경 음악은 아주 작게 깔려 있습니다.',
    '발표에서 트는 회사 소개 영상입니다 — 마지막 말이 「감사합니다」입니다.',
    '영상 속 앱 화면의 병원·사람 이름과 AI 요청 예시는 예시 데이터입니다.',
    '매출은 영상에서 말한 그대로(약 1억 2천만 · 3억 6천만 · 5억 8천만 원) — 올해 숫자 · 예상치는 넣지 않았습니다.',
    'AI 는 「담당자 확인」 · 「계획 · 단계적 확대」로, 새 사업장 운송 구조는 「준비 중」으로 나옵니다 — 실적처럼 말하지 않습니다.',
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
