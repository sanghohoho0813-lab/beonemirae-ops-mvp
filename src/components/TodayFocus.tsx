import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronRight, PlusCircle, Truck } from 'lucide-react'
import type { AppData } from '../types'
import { useTodayTasks } from './TodayBoard'
import { TONE } from '../lib/tone'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 할 일 (모바일 전용 첫 화면)
//
//  폰에서 대시보드를 열면 사업 구조 설명이 아니라 "오늘 처리할 것"이 먼저여야 합니다.
//
//    1) 오늘 수거가 몇 건이고 몇 건 남았는가  +  수거 완료 입력 (가장 큰 버튼)
//    2) 지금 손대야 할 것 — 0건이면 그리지 않습니다. 화면에 남은 카드가 곧 할 일입니다.
//
//  AX 5차 — 대표님: 「레퍼런스 영상 바탕으로」. 배달앱 **주문 카드**처럼
//   태그 → 내용(아이콘 · 몇 건 · 한 줄 설명) → 단추 하나. 목록은 PC 표와 같은 것
//   (useTodayTasks)이라, 단추 글자(「일정 편성」 · 「연락하기」)도 PC 와 같습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 카드 맨 위 작은 태그 — 무슨 종류의 일인지 */
const TAG: Record<string, string> = {
  urgent: '긴급',
  open: '요청',
  inquiry: '문의',
  input: '입력',
  missed: '입력',
  'plan-gap': '일정',
  dunning: '미수',
  contract: '계약',
}

export function TodayFocus({ data }: { data: AppData }) {
  const navigate = useNavigate()
  const { tasks, progress, left, pct, urgent } = useTodayTasks(data)

  return (
    <div className="space-y-3 lg:hidden">
      {/* ① 오늘 수거 — 숫자 하나와 버튼 하나 (사용 방법 투어가 여기를 가리킵니다) */}
      <section data-tour="today-focus" className="card overflow-hidden p-4">
        <div className="flex items-center gap-2">
          <span className={`pill ${TONE.blue.chip}`}>오늘 수거</span>
          <span className="t-muted ms-auto whitespace-nowrap tabular-nums">
            {progress.done} / {progress.planned}건 완료
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${TONE.blue.tile}`}>
            <Truck size={21} strokeWidth={2.3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-keep text-[1.05rem] font-extrabold text-navy-900">
              {progress.planned === 0 ? (
                '오늘 잡힌 수거 없음'
              ) : (
                <>
                  남은 수거 <span className="tabular-nums text-teal-700">{left}건</span>
                </>
              )}
            </p>
            <span className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
              <span className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </span>
          </div>
        </div>
        {/* 가장 큰 버튼은 하나만 — 지금 할 행동이 무엇인지 헷갈리지 않게 */}
        <button
          onClick={() => navigate('/collection')}
          className="mt-3.5 flex min-h-[2.8rem] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-[1.05rem] font-extrabold text-white transition active:scale-[0.98]"
        >
          <PlusCircle size={20} strokeWidth={2.5} /> 수거 완료 입력
        </button>
        <Link
          to="/today"
          className="mt-1 flex min-h-[2.75rem] items-center justify-center gap-1 text-[0.95rem] font-bold text-navy-500 transition active:text-navy-800"
        >
          오늘 일정 전체 보기 <ChevronRight size={16} />
        </Link>
      </section>

      {/* ② 지금 손대야 할 것 — 카드 하나가 할 일 하나. 카드 전체가 그 화면으로 가는 단추입니다. */}
      {tasks.length > 0 ? (
        tasks.map((t) => {
          const Icon = t.icon
          return (
            <Link
              key={t.key}
              to={t.to}
              data-today-task={t.key}
              className="card block p-4 transition active:scale-[0.99]"
            >
              <span className={`pill ${TONE[t.tone].chip}`}>{TAG[t.key] ?? '할 일'}</span>
              <span className="mt-2.5 flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${TONE[t.tone].tile}`}>
                  <Icon size={21} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-keep text-[1.05rem] font-extrabold text-navy-900">
                    {t.label}{' '}
                    <span className={`whitespace-nowrap tabular-nums ${TONE[t.tone].text}`}>
                      {t.count}
                      {t.unit}
                    </span>
                  </span>
                  {t.detail && <span className="t-muted block break-keep leading-snug">{t.detail}</span>}
                </span>
              </span>
              <span className="mt-3 flex min-h-[2.6rem] items-center justify-center rounded-xl bg-navy-900 text-[1rem] font-extrabold text-white">
                {t.cta}
              </span>
            </Link>
          )
        })
      ) : (
        <section className="card flex items-center gap-3 px-5 py-4">
          <CheckCircle2 size={21} strokeWidth={2.4} className="shrink-0 text-emerald-600" />
          <p className="t-body break-keep font-bold text-navy-600">지금 바로 처리할 요청이 없습니다</p>
        </section>
      )}

      {urgent > 0 && (
        <p className="t-muted flex items-center gap-1.5 px-1 break-keep text-rose-500">
          <AlertTriangle size={15} strokeWidth={2.5} className="shrink-0" />
          긴급 요청은 오늘 안에 회신해 주세요
        </p>
      )}
    </div>
  )
}
