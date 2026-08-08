import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ChevronRight,
  CircleDot,
  Compass,
  FileText,
  Link2,
  PlayCircle,
  Repeat,
  Sprout,
  TrendingUp,
  type LucideIcon,
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
//  대표 내외와 외부 설명 대상이 읽는 글이라 조금 더 솔직하게 씁니다.
//  다만 아직 하지 않은 일을 한 것처럼 적지 않습니다 — 지금 되는 것, 지금
//  하는 중인 것, 앞으로 할 것을 섞지 않고 그대로 나눠 적습니다.
//
//  긴 문서로 만들지 않았습니다. 여섯 조각으로 끊고 각 조각은 서너 문장입니다.
//  폰에서는 세로로 하나씩, PC 에서는 두 칸으로 놓아 흐름이 한눈에 보이게 했습니다.
// ─────────────────────────────────────────────────────────────────────────────

const BEFORE = ['전화 · 메신저로 요청 접수', '현장에서 종이에 기록', '사무실에서 엑셀로 옮겨 적기', '월말에 거래처별로 다시 정산', '수거료 중심 매출']
const AFTER = ['현장에서 한 번 입력', '일정 · 수거이력 · 자재 · 요청 · 정산 자동연결', '거래처별로 데이터 축적', '병원이 직접 요청 · 확인', '추가 수거 · 소모품 · 교육 · 운영지원']

/** 8절 — 이 구조가 만들어 내는 연쇄 */
const CHAIN = [
  '직원 업무시간 감소',
  '반복입력 감소',
  '거래처별 데이터 축적',
  '월 정산 자동화',
  '병원의 요청 · 확인 편의성 증가',
  '거래처별 추가 서비스 기회 발견',
  '거래처당 추가 매출원 확대',
]

/** 9절 — 지금 실제로 되는 기능과 그 연결 */
const LINKED: { from: string; to: string; at: string }[] = [
  { from: '현장 수거 입력', to: '일정 · 수거이력 · 자재 재고 · 그 달 정산', at: '/collection' },
  { from: '거래처 데이터', to: '수거량 · 자재 사용량 · 요청 · 매출 축적', at: '/clients' },
  { from: '월 정산', to: '거래명세서 발행 · 거래처별 수익성 확인', at: '/stats' },
  { from: '병원 요청', to: '추가 수거 · 소모품 · 교육 등 새로운 거래 기회', at: '/requests' },
]

/** 10절 — 지금 어디까지 왔고 다음은 무엇인가 */
const ROADMAP: { phase: string; state: '진행 중' | '다음' | '그 이후'; items: string[] }[] = [
  {
    phase: '현재',
    state: '진행 중',
    items: ['MVP 구축', '실제 Supabase 연결', '실제 직원 계정 사용', '현장 업무 테스트'],
  },
  {
    phase: '다음',
    state: '다음',
    items: [
      '직원 실사용 데이터 축적',
      '도입 전 · 후 측정',
      '월말 정산시간 측정',
      '반복입력 · 누락 감소 측정',
      '병원 1~3곳 고객 테스트',
      '실제 추가매출 사례 확보',
    ],
  },
  {
    phase: '그 이후',
    state: '그 이후',
    items: ['고객 병원 서비스 고도화', '운영리포트 개선', '추가수거 · 소모품 · 교육 제안 고도화', '다른 거래처로 확장'],
  },
]

function Section({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-navy-100 px-5 py-4 sm:px-6">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white">
          <Icon size={18} strokeWidth={2.3} />
          <span className="absolute -right-1 -top-1 flex h-[1.15rem] w-[1.15rem] items-center justify-center rounded-full bg-teal-500 text-[0.72rem] font-black text-white ring-2 ring-white">
            {n}
          </span>
        </span>
        <h2 className="t-card min-w-0 flex-1 break-keep pt-1 text-navy-900">{title}</h2>
      </div>
      <div className="space-y-3 px-5 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  )
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="t-body break-keep leading-relaxed text-navy-600">{children}</p>
)

export function Purpose() {
  return (
    <PageShell>
      <div>
        <p className="t-label text-teal-600">이 시스템을 만든 이유</p>
        <h1 className="t-page mt-1 break-keep text-navy-900">
          수거를 대행하는 회사에서,
          <br className="hidden sm:block" /> 병원 폐기물 운영을 함께 관리하는 회사로
        </h1>
        <p className="t-body mt-3 break-keep text-navy-400">
          화면 사용법이 아니라, 왜 이 일을 시작했고 회사가 어디로 가려는지에 대한 설명입니다. 읽는 데 3분쯤
          걸립니다.
        </p>
      </div>

      {/* 폰은 세로 한 줄, PC 는 두 칸. 내용은 같습니다. */}
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start xl:gap-5">
        <Section n={1} icon={Compass} title="왜 시작했나요?">
          <P>
            의료폐기물 수거업은 현장 일과 사무실 일이 떨어져 있습니다. 요청은 전화와 메신저로 오고, 수거량은
            현장에서 종이에 적고, 정산은 사무실에서 엑셀로 다시 옮깁니다.
          </P>
          <P>
            한 번 수거하면 같은 내용을 서너 번 적게 됩니다. 시간도 들지만 더 큰 문제는, 그렇게 흩어진 기록으로는
            나중에 「그 병원 지난달 얼마였지」에 답할 수 없다는 것입니다.
          </P>
          <P>이 시스템은 그 반복을 없애려고 시작했습니다. 현장에서 한 번 적으면 나머지가 따라오게 하는 것입니다.</P>
        </Section>

        <Section n={2} icon={Link2} title="왜 AX인가요?">
          <P>
            기존 업무를 화면으로 옮기는 전산화가 목적이 아닙니다. 종이를 화면으로 바꾸기만 하면 입력하는 자리만
            달라지고 반복은 그대로 남습니다.
          </P>
          <P>
            여기서 말하는 AX 는 <strong className="font-bold text-navy-800">업무와 데이터를 연결해 실제 일하는
            방식을 바꾸는 것</strong>입니다. 현장에서 들어온 데이터 하나가 일정·수거이력·자재·요청·정산까지
            이어지게 만들어, 사무실이 다시 옮겨 적을 일을 없애는 쪽입니다.
          </P>
          <P>
            지금 들어 있는 추천 기능도 예측이 아니라 쌓인 기록을 정해 둔 규칙으로 정리한 것입니다. 근거를 그대로
            볼 수 있게 만들었습니다.
          </P>
        </Section>

        <Section n={3} icon={Repeat} title="무엇이 달라지나요?">
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
            같은 수거를 하더라도, 남는 것이 「수거했다」는 사실 하나가 아니라 거래처별 기록이 됩니다. 그 기록이
            다음 단계의 재료가 됩니다.
          </P>
        </Section>

        <Section n={4} icon={FileText} title="정책자금 · 사업고도화와 어떤 관계인가요?">
          <P>
            정부와 정책금융기관은 요즘 디지털전환과 사업고도화를 중요하게 봅니다. 기존 사업을 어떻게 개선하고
            있는지, 생산성이 실제로 올라갔는지, 새로운 서비스와 매출원이 생기는지를 확인합니다.
          </P>
          <P>
            이 프로젝트는 그 항목을 위해 만든 자료가 아니라, 비원미래의 실제 업무를 데이터 기반으로 바꾸는 일
            자체입니다. 다만 그 과정에서 남는 기록 — 도입 전후 업무시간, 정산 소요시간, 반복입력 감소, 거래처당
            추가 매출 — 이 심사에서 보는 항목과 자연스럽게 겹칩니다.
          </P>
          <P>
            앞으로 사업고도화 자금 조달(1억원 이상)을 검토할 때, 계획서상의 주장이 아니라 실제 운영 기록으로
            설명할 수 있게 되는 것이 이 시스템을 갖추는 실질적인 이유 중 하나입니다.
          </P>
        </Section>

        <Section n={5} icon={TrendingUp} title="어떻게 매출로 이어지나요?">
          <ol className="space-y-2">
            {CHAIN.map((t, i) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="t-label mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-600">
                  {i + 1}
                </span>
                <span
                  className={`t-body min-w-0 break-keep ${
                    i === CHAIN.length - 1 ? 'font-extrabold text-teal-700' : 'text-navy-700'
                  }`}
                >
                  {t}
                </span>
              </li>
            ))}
          </ol>
          <P>
            직원이 편해지는 것에서 끝나지 않습니다. 거래처마다 무엇을 얼마나 쓰는지가 쌓이면, 추가 수거나
            소모품이 필요한 시점을 먼저 알 수 있습니다. 그때 제안할 수 있는 것이 수거료 외의 매출입니다.
          </P>
          <p className="t-muted break-keep rounded-xl bg-navy-50 px-3 py-2">
            아직 검증 중인 구조입니다. 실제 추가매출 사례는 병원 테스트를 거쳐 확인할 예정이고, 화면의 숫자도
            기록이 쌓인 만큼만 채워집니다.
          </p>
        </Section>

        <Section n={6} icon={Sprout} title="앞으로 어떻게 발전하나요?">
          <div className="space-y-3">
            {ROADMAP.map((r) => (
              <div key={r.phase} className="rounded-2xl border border-navy-100 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="t-card text-navy-900">{r.phase}</span>
                  <span
                    className={`pill ${
                      r.state === '진행 중' ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'
                    }`}
                  >
                    {r.state}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {r.items.map((it) => (
                    <li key={it} className="t-muted break-keep rounded-lg bg-navy-50 px-2 py-1 text-navy-600">
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* 추상적인 계획서로 읽히지 않도록, 지금 실제로 되는 기능과 이어 둡니다 */}
      <section className="card overflow-hidden">
        <div className="border-b border-navy-100 px-5 py-4 sm:px-6">
          <h2 className="t-card break-keep text-navy-900">지금 실제로 되는 것</h2>
          <p className="t-muted mt-1 break-keep">위 이야기가 어느 화면에 들어 있는지입니다. 눌러서 바로 볼 수 있습니다.</p>
        </div>
        <ul className="divide-y divide-navy-50">
          {LINKED.map((l) => (
            <li key={l.from}>
              <Link to={l.at} className="flex items-center gap-3 px-5 py-4 transition hover:bg-navy-50 active:bg-navy-50 sm:px-6">
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
