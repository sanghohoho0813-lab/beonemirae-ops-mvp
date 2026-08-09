import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  ChevronRight,
  CircleDot,
  Landmark,
  Layers,
  Lightbulb,
  type LucideIcon,
  PlayCircle,
  Repeat,
  Route,
  Sprout,
  Target,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { PageShell } from '../components/ui'
import { TourButton } from '../components/TourEntry'

// ─────────────────────────────────────────────────────────────────────────────
// 이 시스템을 만든 이유
//
//  「사용 방법」과 목적이 다릅니다.
//    사용 방법  직원이 화면에서 무엇을 누르는지 — 제품 투어가 맡습니다.
//    만든 이유  왜 이 일을 시작했고 회사가 어디로 가려는지 — 이 화면입니다.
//
//  읽는 사람이 AX 라는 말을 처음 듣는다고 보고 씁니다. 그래서 기능 설명이
//  아니라 배경에서 시작합니다.
//
//    배경 → 개념 → 정책 흐름 → 비원미래 적용 → 실제 변화
//         → 사업 성장 → 정책자금 → 앞으로
//
//  긴 글이라 열 조각으로 끊고, 위에 목차를 두어 어디든 바로 갈 수 있게
//  했습니다. 폰에서도 같은 내용을 그대로 읽습니다 — 접어 숨기지 않습니다.
//  대표 내외가 처음부터 끝까지 한 번 읽는 글이라, 열 번 눌러 펼치게 하는
//  것보다 쭉 내려 읽는 편이 낫습니다.
//
//  아직 하지 않은 일을 한 것처럼 적지 않습니다. 지금 되는 것, 하는 중인 것,
//  앞으로 할 것을 섞지 않고 그대로 나눠 적었습니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Sec {
  id: string
  n: number
  phase: string
  icon: LucideIcon
  title: string
  /** 목차에 쓰는 짧은 이름 */
  short: string
}

const SECTIONS: Sec[] = [
  { id: 's1', n: 1, phase: '배경', icon: Layers, title: '기업의 일하는 방식이 바뀌고 있습니다', short: '배경' },
  { id: 's2', n: 2, phase: '개념', icon: Lightbulb, title: 'AX는 무엇인가요?', short: 'AX란' },
  { id: 's3', n: 3, phase: '정책 흐름', icon: Landmark, title: '왜 지금 이런 변화가 중요할까요?', short: '왜 지금' },
  { id: 's4', n: 4, phase: '비원미래 적용', icon: Building2, title: '그렇다면 비원미래에는 무엇이 필요할까요?', short: '우리 상황' },
  { id: 's5', n: 5, phase: '비원미래 적용', icon: Wrench, title: '그래서 이 시스템은 이렇게 설계했습니다', short: '설계' },
  { id: 's6', n: 6, phase: '실제 변화', icon: Repeat, title: '업무가 어떻게 달라지나요?', short: '업무 변화' },
  { id: 's7', n: 7, phase: '사업 성장', icon: TrendingUp, title: '하지만 목표는 업무효율화만이 아닙니다', short: '그 다음' },
  { id: 's8', n: 8, phase: '사업 성장', icon: Target, title: '결국 비원미래가 얻으려는 것은 무엇인가요?', short: '얻는 것' },
  { id: 's9', n: 9, phase: '정책자금', icon: Landmark, title: '정책자금과는 어떻게 연결되나요?', short: '정책자금' },
  { id: 's10', n: 10, phase: '앞으로', icon: Sprout, title: '앞으로 어디까지 발전시키나요?', short: '앞으로' },
]

/** 5절 — 한 번 입력한 것이 이어지는 순서 */
const CHAIN = [
  '현장 수거 입력',
  '수거이력 · 일정 · 거래처 기록',
  '자재 사용 및 재고',
  '월 정산 · 거래명세서',
  '병원별 데이터 축적',
  '추가 서비스 기회 파악',
]

const BEFORE = ['병원 연락', '직원 확인', '수거', '메모', '엑셀 입력', '자재 별도 기록', '월말에 다시 정리']
const AFTER = ['현장 1회 입력', '관련 업무 자동연결', '거래처별 데이터 축적', '월말에는 재입력이 아니라 검토·마감']

/** 6절 — 기대하는 변화. 숫자는 재고 나서 적습니다 */
const EFFECTS = ['반복입력 감소', '누락 · 재확인 감소', '거래처 기록 누적', '월말 정산시간 감소', '담당자 간 정보공유 개선']

/**
 * 8절 — 업무 효율화에서 사업 고도화까지 이어지는 사슬.
 *
 * 이 화면의 결론입니다. "프로그램을 넣어서 일이 편해진다"에서 끝나면
 * 이 프로젝트를 할 이유가 절반밖에 설명되지 않습니다. 현장에서 얻는 데이터가
 * 새로운 서비스와 매출로 이어지는 데까지 한 줄로 보이게 둡니다.
 */
const GROWTH: { t: string; d: string }[] = [
  { t: '업무 효율화', d: '현장에서 한 번 입력하면 사무실이 다시 옮겨 적지 않습니다.' },
  { t: '반복 입력 · 누락 감소', d: '같은 숫자를 여러 번 적지 않으니 어긋나거나 빠질 자리가 줄어듭니다.' },
  { t: '거래처별 운영 데이터 축적', d: '수거량 · 자재 사용량 · 요청 · 계약이 병원마다 쌓입니다.' },
  { t: '수익성과 이용 패턴 파악', d: '어느 거래처가 얼마나 남고, 무엇을 얼마나 자주 쓰는지 보입니다.' },
  { t: '필요한 서비스를 체계적으로 제공', d: '추가 수거 · 소모품 · 교육 · 운영지원을 짐작이 아니라 기록을 보고 제안합니다.' },
  { t: '수거료 외 추가 매출원 확대', d: '거래처를 새로 늘리지 않아도 거래처당 매출이 넓어집니다.' },
  { t: '운영성과 · 사업전환 실적 축적', d: '줄어든 시간과 늘어난 매출이 주장이 아니라 기록으로 남습니다.' },
  { t: '외부자금을 활용한 추가 고도화', d: '그 실적을 근거로 정책자금 · 보증 등을 사업을 더 키우는 데 씁니다.' },
]

/** 10절 — 지금부터의 순서 */
const ROADMAP = [
  '실제 비원미래 Supabase 데이터베이스 연결',
  '대표 · 사무실 · 현장 직원 계정으로 실제 사용',
  '업무시간 · 반복입력 · 누락 등 도입 전후 측정',
  '실제 병원 거래처 테스트',
  '추가 수거 · 소모품 · 교육 등 실제 추가매출 사례 확보',
  '병원 고객용 기능과 리포트 고도화',
  '다른 거래처에도 적용 가능한 서비스로 확장',
]

function Section({ s, children }: { s: Sec; children: React.ReactNode }) {
  return (
    <section id={s.id} className="card scroll-mt-4 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-navy-100 px-5 py-4 sm:px-6">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white">
          <s.icon size={19} strokeWidth={2.3} />
          <span className="absolute -right-1.5 -top-1.5 flex h-[1.3rem] min-w-[1.3rem] items-center justify-center rounded-full bg-teal-500 px-1 text-[0.72rem] font-black text-white ring-2 ring-white">
            {s.n}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-muted font-bold text-teal-600">{s.phase}</p>
          <h2 className="t-card mt-0.5 break-keep text-navy-900">{s.title}</h2>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  )
}

/**
 * 핵심 낱말 강조.
 *
 * 문장 전체를 굵게 하면 결국 아무것도 강조되지 않습니다. 스크롤하면서
 * 굵은 부분만 훑어도 사업 방향이 대략 읽히도록, 한 문단에 한두 군데만 씁니다.
 */
const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-extrabold text-navy-900">{children}</strong>
)

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="t-body break-keep leading-relaxed text-navy-600">{children}</p>
)

/** 인용처럼 한 박자 쉬어 가는 핵심 문장 */
const Key = ({ children }: { children: React.ReactNode }) => (
  <p className="t-body break-keep rounded-2xl border-l-4 border-teal-400 bg-teal-50/60 px-4 py-3 font-bold leading-relaxed text-teal-900">
    {children}
  </p>
)

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="t-muted break-keep rounded-xl bg-navy-50 px-3 py-2 leading-snug">{children}</p>
)

export function Purpose() {
  // 목차 — 폰에서는 열 개를 다 스크롤하기 번거로우니 바로 뛰게 합니다
  const jump = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    // 긴 글이라 PC 에서 본문 폭을 잡아 둡니다. 한 줄이 너무 길면 다음 줄
    // 첫 글자를 찾느라 눈이 되돌아가서, 넓은 화면일수록 오히려 읽기 힘듭니다.
    <PageShell className="mx-auto max-w-[58rem]">
      <div>
        <p className="t-label text-teal-600">이 시스템을 만든 이유</p>
        <h1 className="t-page mt-1 break-keep text-navy-900">
          수거를 대행하는 회사에서,
          <br className="hidden sm:block" /> 병원 폐기물 운영을 함께 관리하는 회사로
        </h1>
        <p className="t-body mt-3 break-keep text-navy-400">
          화면 사용법이 아니라, 왜 이 일을 시작했고 회사가 어디로 가려는지에 대한 설명입니다. AX 라는 말을 처음
          들으셔도 순서대로 읽으시면 이해되도록 썼습니다. 읽는 데 5분쯤 걸립니다.
        </p>
      </div>

      {/* 목차 — 흐름이 눈으로 보이게 */}
      <nav className="card px-4 py-4 sm:px-5">
        <p className="t-label mb-2.5 text-navy-500">차례</p>
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              className="t-muted break-keep rounded-xl bg-navy-50 px-2.5 py-1.5 font-bold text-navy-600 transition hover:bg-navy-100 active:bg-navy-100"
            >
              <span className="text-navy-400">{s.n}</span> {s.short}
            </button>
          ))}
        </div>
        <p className="t-muted mt-2.5 break-keep">
          배경 → 개념 → 정책 흐름 → 비원미래 적용 → 실제 변화 → 사업 성장 → 정책자금 → 앞으로
        </p>
      </nav>

      <Section s={SECTIONS[0]}>
        <P>
          예전에 말하던 디지털전환은 종이 문서를 컴퓨터로 옮기거나, 손으로 하던 계산을 엑셀로 바꾸는 정도에
          가까웠습니다. 하는 일은 그대로인데 도구만 바뀐 셈입니다.
        </P>
        <P>
          최근에는 여기서 한 걸음 더 나갑니다. 회사가 이미 가지고 있는 데이터를 이용해 <B>반복업무를 줄이고</B>,
          필요한 정보를 <B>자동으로 이어 주고</B>, 직원이 판단할 때 근거를 먼저 보여 주고, 나아가 고객에게
          <B>새로운 서비스</B>를 제공하는 쪽으로 옮겨 가고 있습니다.
        </P>
        <P>이렇게 일하는 방식 자체를 바꾸는 변화를 요즘 AX 라고 부릅니다.</P>
      </Section>

      <Section s={SECTIONS[1]}>
        <P>
          AX 는 <B>AI Transformation</B> 의 줄임말이고, 우리말로는 <B>인공지능 전환</B>이라고 합니다.
          중소벤처기업부에서도 이 표현을 씁니다.
        </P>
        <P>
          다만 챗봇을 하나 붙이거나 AI 기능 하나를 얹는 것을 AX 라고 하지는 않습니다. 그건 기능 추가에
          가깝습니다.
        </P>
        <Key>AX 는 데이터와 AI 를 이용해 회사가 실제로 일하는 방식과 서비스 구조를 바꾸는 것입니다.</Key>
        <P>
          예를 들어 지금까지는 사람이 전화를 받아 확인하고, 메모하고, 엑셀에 옮기고, 다시 계산하고, 고객에게
          연락했습니다. 같은 내용을 여러 번 다루는 구조입니다.
        </P>
        <P>
          AX 가 적용된 구조에서는 <B>한 번 입력된 데이터가 다음 업무로 이어서</B> 쓰이고, 챙겨야 할 일이나
          이상한 점은 시스템이 먼저 보여 줍니다. 사람이 기억하고 옮겨 적는 자리를 줄이는 것입니다.
        </P>
      </Section>

      <Section s={SECTIONS[2]}>
        <P>
          정부와 정책기관에서도 중소기업의 AI · 디지털 기술 활용을 지원하는 흐름이 넓어지고 있습니다. 단순히
          전산화를 지원하는 것이 아니라, 그 기술로 <B>생산성이 올라갔는지</B>와 <B>새로운 사업 · 서비스</B>가
          생겼는지를 함께 봅니다.
        </P>
        <P>
          2026년 스마트서비스 지원사업처럼 AX · DX 를 기반으로 한 서비스 혁신과 사업 고도화를 돕는 사업들도
          이런 방향에 있습니다.
        </P>
        <P>
          비원미래도 같은 숙제를 안고 있습니다. 전화 · 메신저 · 엑셀 중심으로 돌아가던 영업현장의 업무를
          정리해야 하고, 그동안 쌓여 온 거래처 데이터를 새로운 서비스와 매출로 이어야 합니다.
        </P>
        <Key>
          그래서 이 프로젝트는 두 가지를 함께 노립니다. 회사의 실제 사업 고도화, 그리고 지금 정책지원이
          중점적으로 보는 AX · 사업전환 방향입니다. 이 둘을 같이 가져가면 1억원 이상의 정책자금이나 보증부
          자금 조달까지 연결할 수 있는 기반이 만들어집니다.
        </Key>
        <Note>
          물론 프로그램을 갖췄다고 자금이 나오는 것은 아닙니다. 실제로 쓰고, 달라진 것을 숫자로 보여 줄 수
          있어야 심사에서 근거가 됩니다. 그 근거를 만드는 것이 이 프로젝트의 목적입니다.
        </Note>
        <Note>
          구체적인 사업명 · 지원조건 · 신청시기는 해마다 바뀝니다. 실제로 신청할 때는 그 해 공고를 다시
          확인해야 합니다.
        </Note>
      </Section>

      <Section s={SECTIONS[3]}>
        <P>
          의료폐기물 업무는 하나로 이어져 있습니다. 병원 요청이 들어오고, 수거 일정을 잡고, 현장에서 수거하고,
          용기와 자재를 공급하고, 거래처를 관리하고, 월말에 정산해서 거래명세서를 만듭니다.
        </P>
        <P>
          그런데 이 정보가 <B>전화 · 메신저 · 종이 · 엑셀</B> · 담당자별 파일로 나뉘어 있으면, 한 번 생긴
          정보를 <B>여러 번 다시 적게</B> 됩니다. 옮겨 적는 시간도 시간이지만, 옮기는 사이에 빠지거나 어긋날
          여지가 생깁니다.
        </P>
        <P>
          더 아쉬운 것은 그 다음입니다. 거래처별 수거량, 자재 사용량, 요청 이력, 매출이 분명히 쌓이고 있는데도
          흩어져 있어서, 다음 영업이나 고객서비스에 쓰기가 어렵습니다.
        </P>
      </Section>

      <Section s={SECTIONS[4]}>
        <Key>현장에서 한 번 입력한 정보가 회사의 다음 업무까지 이어지게 만든다.</Key>
        <P>이 시스템이 하는 일은 사실 이 한 줄이 전부입니다. 순서로 보면 이렇게 이어집니다.</P>
        <ol className="space-y-1.5">
          {CHAIN.map((t, i) => (
            <li key={t} className="flex items-start gap-2.5">
              <span className="t-label mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-600">
                {i + 1}
              </span>
              <span className="t-body min-w-0 break-keep text-navy-700">{t}</span>
            </li>
          ))}
        </ol>
        <P>
          실제로는 이렇습니다. 현장에서 의료폐기물 수거량과 <B>20L 용기 30개</B> 공급을 입력하면, 그 숫자가
          <B>수거이력 · 거래처 기록 · 자재 사용량 · 월 정산</B>으로 이어서 쓰입니다.
        </P>
        <P>목표는 단순합니다. 같은 숫자를 여러 번 다시 입력하지 않는 것입니다.</P>
      </Section>

      <Section s={SECTIONS[5]}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-navy-50 p-4">
            <p className="t-label mb-2 text-navy-500">지금까지</p>
            <ul className="space-y-1.5">
              {BEFORE.map((t) => (
                <li key={t} className="t-muted flex items-start gap-1.5 break-keep">
                  <CircleDot size={13} strokeWidth={2.4} className="mt-1 shrink-0 text-navy-300" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-teal-50 p-4">
            <p className="t-label mb-2 text-teal-700">바뀌는 방향</p>
            <ul className="space-y-1.5">
              {AFTER.map((t) => (
                <li key={t} className="t-muted flex items-start gap-1.5 break-keep text-teal-800">
                  <ArrowRight size={13} strokeWidth={2.6} className="mt-1 shrink-0 text-teal-600" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <P>
          월말에 하는 일이 「다시 입력하기」에서 <B>「확인하고 마감하기」</B>로 바뀌는 것이 가장 큰
          차이입니다.
        </P>
        <p className="t-label text-navy-500">기대하는 변화</p>
        <ul className="flex flex-wrap gap-1.5">
          {EFFECTS.map((t) => (
            <li key={t} className="t-muted break-keep rounded-lg bg-navy-50 px-2.5 py-1.5 text-navy-600">
              {t}
            </li>
          ))}
        </ul>
        <Note>
          몇 퍼센트가 줄어든다는 숫자는 아직 적지 않습니다. 실제로 쓰면서 재고 나서 그 값을 넣는 것이
          맞습니다.
        </Note>
      </Section>

      <Section s={SECTIONS[6]}>
        <P>
          여기까지만 보면 내부 업무 프로그램입니다. 하지만 이 시스템을 만든 이유의 절반은 그 다음에
          있습니다.
        </P>
        <P>
          <B>거래처별 데이터가 쌓이면</B> 병원마다 수거량이 어떻게 변하는지, 자재를 얼마나 쓰는지, 어떤
          요청을 자주 하는지, 계약이 어떻게 되어 있는지가 보입니다.
        </P>
        <P>그러면 그 병원에 지금 필요한 것이 무엇인지 먼저 알 수 있습니다. 예를 들면 이런 것들입니다.</P>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {['추가 수거', '전용용기 및 소모품 공급', '배출자 교육', '병원 폐기물 운영관리 지원'].map((t) => (
            <li key={t} className="t-body flex items-start gap-2 break-keep text-navy-700">
              <Route size={16} strokeWidth={2.5} className="mt-1 shrink-0 text-teal-500" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <Key>수거료만 받는 구조에서, 기존 거래처에 여러 서비스를 함께 제공하는 구조로 넓히는 것입니다.</Key>
      </Section>

      {/* ══ 최종 결론 ═══════════════════════════════════════════════════════
          이 화면에서 가장 중요한 한 덩어리라, 본문 카드와 확실히 다르게 둡니다.
          처음에는 짙은 남색으로 깔았는데, 검은 덩어리가 오히려 눈을 밀어내서
          글이 잘 안 읽혔습니다. 은은한 청록 바탕에 글자는 그대로 진하게 두고,
          테두리로 경계를 세우는 쪽이 훨씬 잘 들어옵니다.
          색은 바탕과 테두리에만 씁니다 — 광고 배너처럼 늘어놓지 않습니다. */}
      <section
        id={SECTIONS[7].id}
        className="scroll-mt-4 overflow-hidden rounded-3xl bg-teal-50/70 shadow-lg ring-2 ring-teal-300"
      >
        {/* 머리글 — 위는 작은 라벨, 아래는 이 페이지의 핵심 질문.
            글자만 키우지 않고 여백·굵기·색 대비로 차이를 냅니다. */}
        <div className="border-b border-teal-200 bg-teal-100/70 px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white">
              <Target size={19} strokeWidth={2.5} />
            </span>
            <p className="t-muted min-w-0 font-extrabold tracking-wide text-teal-700">
              {SECTIONS[7].n} · 사업 성장 — 이 이야기의 결론
            </p>
          </div>
          <h2 className="t-page mt-3 break-keep leading-tight text-navy-900 sm:text-[2.1rem]">
            {SECTIONS[7].title}
          </h2>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          <p className="t-body break-keep leading-relaxed text-navy-700">
            한 줄로 답하면, 프로그램을 도입해 일이 편해지는 것이 목적이 아닙니다. 의료폐기물을 수거하면서
            어차피 생기는 <B>현장 데이터</B>를 <B>병원 운영지원</B> 서비스와 <B>추가 매출</B>로 이어 붙이는
            것이 목적입니다. 그 과정이 아래 순서로 이어집니다.
          </p>

          {/* 여덟 단계 — 세로로 이어지는 한 줄기 */}
          <ol className="relative space-y-3 pl-1">
            {GROWTH.map((g, i) => (
              <li key={g.t} className="relative flex gap-3.5">
                <span className="relative flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.85rem] font-black ${
                      i === GROWTH.length - 1
                        ? 'bg-teal-500 text-white'
                        : 'bg-white text-teal-700 ring-1 ring-teal-200'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {i < GROWTH.length - 1 && <span className="mt-1 w-px flex-1 bg-teal-300" />}
                </span>
                <span className="min-w-0 flex-1 pb-1">
                  <span className="t-body block break-keep font-extrabold text-navy-900">{g.t}</span>
                  <span className="t-muted mt-0.5 block break-keep leading-snug text-navy-500">{g.d}</span>
                </span>
              </li>
            ))}
          </ol>

          {/* 세 갈래로 정리 */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            {[
              {
                t: '업무 효율',
                d: (
                  <>
                    <B>반복입력</B>과 <B>누락</B>을 줄이고, 현장과 사무실 업무를 하나로 잇습니다.
                  </>
                ),
              },
              {
                t: '매출 확대',
                d: (
                  <>
                    수거료뿐 아니라 <B>소모품</B> · <B>추가 수거</B> · <B>교육</B> · <B>운영지원</B>까지,
                    거래처당 매출원이 넓어집니다.
                  </>
                ),
              },
              {
                t: '사업 고도화 근거',
                d: (
                  <>
                    <B>실제 운영성과</B>와 매출 데이터를 쌓아 <B>정책자금 · 보증</B>과 사업확장의 근거로
                    씁니다.
                  </>
                ),
              },
            ].map((x, i) => (
              <div key={x.t} className="rounded-2xl bg-white p-4 ring-1 ring-teal-100">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-[0.85rem] font-black text-white">
                    {i + 1}
                  </span>
                  <p className="t-body font-extrabold text-navy-900">{x.t}</p>
                </div>
                <p className="t-muted mt-1.5 break-keep leading-snug text-navy-600">{x.d}</p>
              </div>
            ))}
          </div>

          <p className="t-body break-keep rounded-2xl border-l-4 border-teal-500 bg-white px-4 py-3.5 font-bold leading-relaxed text-navy-900">
            의료폐기물 수거회사에서 끝나지 않고, 쌓인 데이터로 병원의 폐기물 업무를 함께 관리하는{' '}
            <B>운영지원 회사</B>로 넓히는 것 — 이것이 이 시스템을 만든 이유입니다.
          </p>
          <p className="t-muted break-keep leading-snug text-navy-500">
            아직 다 이룬 상태는 아닙니다. 지금은 이 구조를 실제로 돌려 보고, 줄어든 시간과 늘어난 매출을
            숫자로 남기는 단계입니다.
          </p>
        </div>
      </section>

      <Section s={SECTIONS[8]}>
        <P>
          이 프로젝트는 앞으로 1억원 이상의 정책자금 · 보증 등 사업고도화 자금 조달도 함께 생각하고
          있습니다. 다만 순서가 중요합니다.
        </P>
        <P>
          정책자금을 받으려고 프로그램을 만드는 것이 아닙니다. 회사가 실제로 <B>생산성을 높이고</B>,
          데이터를 쌓고, 새로운 고객서비스를 만들고, <B>추가 매출원</B>을 확보하는 과정을 먼저 만듭니다.
        </P>
        <P>
          그 다음에 <B>실제 운영성과</B>와 그 근거를 가지고 <B>정책자금 · 보증</B>을 활용해 사업을 더 크게
          키우는 것입니다.
        </P>
        <Key>
          자금을 먼저 받아 사업을 만드는 구조가 아니라, 사업을 실제로 바꾸고 그 성과를 근거로 성장자금을
          조달하는 구조입니다.
        </Key>
        <P>
          계획서에 쓴 주장이 아니라 실제 운영 기록으로 설명할 수 있게 되는 것 — 이것이 이 시스템을 갖추는
          현실적인 이유 중 하나입니다.
        </P>
      </Section>

      <Section s={SECTIONS[9]}>
        <P>
          지금은 실제 업무에 적용하기 위한 <B>MVP 단계</B>입니다. 앞으로는 이 순서로 갑니다.
        </P>
        <ol className="space-y-2">
          {ROADMAP.map((t, i) => (
            <li key={t} className="flex items-start gap-2.5">
              <span className="t-label mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-600">
                {i + 1}
              </span>
              <span className="t-body min-w-0 break-keep text-navy-700">{t}</span>
            </li>
          ))}
        </ol>
        <Key>
          이 시스템의 완성은 프로그램 개발이 끝나는 시점이 아니라, 실제 직원과 병원이 사용하면서 업무시간과
          매출이 실제로 나아지는 순간입니다.
        </Key>
      </Section>

      {/* 추상적인 계획서로 읽히지 않도록, 지금 실제로 되는 기능과 이어 둡니다 */}
      <section className="card overflow-hidden">
        <div className="border-b border-navy-100 px-5 py-4 sm:px-6">
          <h2 className="t-card break-keep text-navy-900">지금 실제로 되는 것</h2>
          <p className="t-muted mt-1 break-keep">
            위 이야기가 어느 화면에 들어 있는지입니다. 눌러서 바로 볼 수 있습니다.
          </p>
        </div>
        <ul className="divide-y divide-navy-50">
          {[
            { from: '현장 수거 입력', to: '일정 · 수거이력 · 자재 재고 · 그 달 정산', at: '/collection' },
            { from: '거래처 데이터', to: '수거량 · 자재 사용량 · 요청 · 매출 축적', at: '/clients' },
            { from: '월 정산', to: '거래명세서 발행 · 거래처별 수익성 확인', at: '/stats' },
            { from: '병원 요청', to: '추가 수거 · 소모품 · 교육 등 새로운 거래 기회', at: '/requests' },
          ].map((l) => (
            <li key={l.from}>
              <Link
                to={l.at}
                className="flex items-center gap-3 px-5 py-4 transition hover:bg-navy-50 active:bg-navy-50 sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="t-body block break-keep font-extrabold text-navy-900">{l.from}</span>
                  <span className="t-muted mt-0.5 flex items-start gap-1.5 break-keep">
                    <ArrowRight size={14} strokeWidth={2.6} className="mt-1 shrink-0 text-teal-500" />
                    <span>{l.to}</span>
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-navy-300" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 여기까지 읽었으면 다음은 "그래서 어떻게 쓰는가" 입니다 */}
      <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-5 sm:px-6">
        <span className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <PlayCircle size={26} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-card break-keep text-navy-900">쓰는 법이 궁금하시면</p>
          <p className="t-muted mt-1 break-keep">
            화면을 하나씩 짚어가며 어디에 무엇을 입력하는지 안내합니다. 역할에 맞는 내용으로 보여집니다.
          </p>
        </div>
        <TourButton className="btn-primary w-full shrink-0 justify-center sm:w-auto" label="사용 방법 보기" />
      </div>
    </PageShell>
  )
}
