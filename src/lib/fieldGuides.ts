// ─────────────────────────────────────────────────────────────────────────────
// 현장 기사 사용 안내 (0069)
//
//  대표님 말씀: "기능 소개 투어가 아니라, 처음 출근한 기사님에게 옆에서
//  3분간 사용법을 알려주는 것 같은 경험".
//
//  ── 예전 방식이 왜 안 됐나 ────────────────────────────────────────────────
//
//   · 화면 전체를 **막아** 놓고 설명만 띄웠습니다. 기사님은 읽기만 하고
//     실제로 눌러 보지 못한 채 끝났습니다.
//   · 한 줄기로 이어진 긴 투어라, 「수거 입력만 다시 보고 싶다」가 안 됐습니다.
//   · 화면이 바뀌면서 짚을 대상이 없어져도 그냥 어두운 배경에 글자만 떴습니다.
//     (실제로 그 상태였습니다 — 강조되는 것이 하나도 없었습니다.)
//
//  ── 이렇게 바꿉니다 ───────────────────────────────────────────────────────
//
//   · 짚는 곳만 남기고 **그 자리는 진짜로 눌립니다.** 눌러서 다음으로 갑니다.
//   · 업무별로 짧게 나눕니다 — 3~5단계.
//   · 한 단계는 **한 문장**입니다.
//   · 짚을 것이 화면에 없으면 그 단계는 **건너뜁니다.** 없는 것을 가리키며
//     설명하지 않습니다.
//
//  ⚠ 여기 쓰는 말은 실제 화면의 단추 이름과 **같아야** 합니다. 다르면
//    기사님은 설명에 나온 단추를 화면에서 찾다가 포기합니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface GuideStep {
  /** 짚을 곳 — 화면에 붙인 data-guide 값. 없으면 화면 가운데에 말만 합니다. */
  at?: string
  /** 이 단계를 보여 줄 화면 */
  route: string
  /** 한 문장. 두 줄을 넘기지 않습니다. */
  say: string
  /**
   *  짚은 곳을 누르면 다음으로 갑니다. 그 자리는 실제로 눌립니다 —
   *  기사님이 **직접 해 보면서** 익힙니다.
   */
  tapToGo?: boolean
  /** 이 화면으로 바뀌면 저절로 다음 단계가 됩니다 */
  goesTo?: string
  /**
   * 열린 경로(`/clients/` 처럼 끝이 열린 것)일 때 **어디로 데려갈지** (0076).
   *
   *  ⚠ 예전에는 열린 경로면 아무 데도 안 갔습니다. 그래서 기사님이 안내를
   *    「다음」으로만 넘기면, **거래처 목록 화면에 그대로 선 채로** 「주소와
   *    전화번호가 여기 있습니다」를 읽게 됐습니다. 짚을 것이 없으니 테두리도
   *    안 그려져서, 엉뚱한 데를 보며 설명만 흘렀습니다.
   *
   *   'firstClient'  맡은 거래처 중 첫 곳을 열어 줍니다.
   */
  land?: 'firstClient'
}

export interface FieldGuide {
  id: string
  /** 목록에 뜨는 이름 — 「무엇을 하는지」로 씁니다 */
  title: string
  /** 한 줄 설명 */
  sub: string
  steps: GuideStep[]
}

export const FIELD_GUIDES: FieldGuide[] = [
  {
    id: 'today',
    title: '오늘 갈 곳 보기',
    sub: '오늘 어느 병원에 가는지 확인합니다',
    steps: [
      {
        route: '/today',
        at: 'guide-day-strip',
        say: '위쪽 날짜 줄에서 오늘이 진하게 표시됩니다. 숫자는 그날 갈 병원 수입니다.',
      },
      {
        route: '/today',
        at: 'guide-today-list',
        say: '오늘 갈 병원이 시간 순서로 나옵니다. 병원을 누르면 바로 수거 입력이 열립니다.',
      },
      {
        route: '/today',
        at: 'guide-nav-collect',
        say: '아래 「수거 입력」은 언제든 여기서 누릅니다.',
      },
    ],
  },
  {
    id: 'plan',
    title: '앞으로 갈 곳 보기 · 일정 넣기',
    sub: '며칠 뒤 일정을 미리 보고, 직접 넣습니다',
    steps: [
      {
        route: '/today',
        at: 'guide-day-strip',
        say: '날짜 줄을 옆으로 밀면 4주 뒤까지 보입니다. 날짜를 눌러 보세요.',
      },
      {
        route: '/today',
        at: 'guide-upcoming',
        say: '「앞으로 갈 곳」을 누르면 이번 주·다음 주로 묶여서 한 번에 보입니다.',
      },
      {
        route: '/today',
        at: 'guide-month',
        say: '한 달을 통째로 보려면 여기를 봅니다. 폰에서는 「월간 일정 보기」를 한 번 누르면 펼쳐집니다.',
      },
      {
        route: '/today',
        at: 'guide-add',
        say: '일정을 직접 넣을 때는 이 단추를 누릅니다.',
        tapToGo: true,
      },
      {
        route: '/today',
        at: 'guide-add-sheet',
        say: '병원을 고르고 「이 날로 잡기」를 누르면 끝입니다.',
      },
    ],
  },
  {
    id: 'collect',
    title: '수거 입력하기',
    sub: '다녀온 곳을 적어 저장합니다',
    steps: [
      {
        route: '/collection',
        at: 'guide-client',
        say: '먼저 어느 병원인지 고릅니다. 자주 가는 곳은 위에 단추로 나옵니다.',
      },
      {
        route: '/collection',
        at: 'guide-amount',
        say: '실은 무게를 킬로그램으로 적습니다. 여기만 적으면 대부분 끝납니다.',
      },
      {
        route: '/collection',
        at: 'guide-folds',
        say: '용기나 자재를 두고 왔을 때만 이 줄을 눌러 폅니다. 없으면 그냥 두세요.',
      },
      {
        route: '/collection',
        at: 'guide-save',
        say: '마지막으로 「수거 완료 저장」을 누르면 사무실까지 한 번에 전달됩니다.',
      },
    ],
  },
  {
    id: 'client',
    title: '병원 정보 보기',
    sub: '주소와 전화번호를 확인합니다',
    steps: [
      {
        route: '/clients',
        at: 'guide-client-list',
        say: '맡은 병원이 모두 여기 있습니다. 병원을 누르면 자세히 볼 수 있습니다.',
      },
      {
        route: '/clients',
        at: 'guide-client-first',
        say: '병원을 하나 눌러 보세요.',
        tapToGo: true,
        goesTo: '/clients/',
      },
      {
        route: '/clients/',
        land: 'firstClient',
        say: '주소와 전화번호가 여기 있습니다. 전화번호를 누르면 바로 걸립니다.',
      },
    ],
  },
]

export function guideById(id: string): FieldGuide | null {
  return FIELD_GUIDES.find((g) => g.id === id) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// 지금 켜져 있는 안내 — 아주 작은 저장소
//
//  ⚠ 주소(?guide=…)로 들고 다니면 안내가 화면을 옮길 때마다 지워집니다
//    (navigate 는 물음표 뒤를 버립니다). Context 를 새로 만들 만큼 큰
//    일도 아니라, 모듈 하나에 값 하나만 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 「무엇을 볼지 고르는」 자리 — 안내 하나가 아니라 목록을 엽니다 */
export const PICK = '__pick__'

let current: string | null = null
const subs = new Set<() => void>()

export function openGuide(id: string | null): void {
  current = id
  subs.forEach((f) => f())
}

export function guideStore() {
  return {
    subscribe(f: () => void) {
      subs.add(f)
      return () => subs.delete(f)
    },
    get: () => current,
  }
}
