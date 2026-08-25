import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardEdit,
  Inbox,
  PlusCircle,
  Siren,
  type LucideIcon,
} from 'lucide-react'
import type { AppData } from '../types'
import { openRequests, todayProgress } from '../lib/ops'
import { hideRequests } from '../lib/pilotMode'
import { TONE, type Tone } from '../lib/tone'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 할 일 (모바일 전용 첫 화면)
//
//  폰에서 대시보드를 열면 사업 구조 설명이 아니라 "오늘 처리할 것"이 먼저여야 합니다.
//  그래서 좁은 화면에서는 아래 세 가지만 남기고 나머지는 아래로 내렸습니다.
//
//    1) 오늘 수거가 몇 건이고 몇 건 남았는가  +  수거 완료 입력 (가장 큰 버튼)
//    2) 지금 손대야 할 것 — 긴급 요청 / 처리 대기 요청 / 입력 대기 (0건이면 숨김)
//    3) 사업 현황은 링크 한 줄로
//
//  숫자가 0인 줄은 아예 그리지 않습니다. 화면에 남은 줄이 곧 할 일입니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Task {
  key: string
  icon: LucideIcon
  label: string
  count: number
  unit: string
  tone: Tone
  to: string
}

export function TodayFocus({ data }: { data: AppData }) {
  const navigate = useNavigate()
  const progress = todayProgress(data)
  //  ⚠ Pilot 동안 병원 요청은 안 씁니다 — 빈 배열로 두면 아래 카드가
  //    `count > 0` 에서 저절로 빠집니다 (0080).
  const open = hideRequests() ? [] : openRequests(data)
  const urgent = open.filter((r) => r.urgent)

  const tasks: Task[] = [
    {
      key: 'urgent',
      icon: Siren,
      label: '긴급 요청',
      count: urgent.length,
      unit: '건',
      tone: 'rose' as const,
      to: '/requests',
    },
    {
      key: 'open',
      icon: Inbox,
      label: '처리 대기 요청',
      count: open.length - urgent.length,
      unit: '건',
      tone: 'violet' as const,
      to: '/requests',
    },
    {
      key: 'input',
      icon: ClipboardEdit,
      label: '입력 대기',
      count: progress.pendingInput,
      unit: '건',
      tone: 'amber' as const,
      to: '/today',
    },
  ].filter((t) => t.count > 0)

  const left = Math.max(0, progress.planned - progress.done)
  const pct = progress.planned ? Math.round((progress.done / progress.planned) * 100) : 0

  return (
    <div className="space-y-3 lg:hidden">
      {/* ① 오늘 수거 — 숫자 하나와 버튼 하나 */}
      <section data-tour="today-focus" className="card overflow-hidden">
        <div className="px-5 pt-4">
          <p className="t-label text-navy-500">오늘 수거</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="t-kpi tabular-nums text-navy-900">{left}</span>
            <span className="t-card text-navy-400">건 남음</span>
            <span className="t-muted ml-auto whitespace-nowrap">
              {progress.done} / {progress.planned}건 완료
            </span>
          </div>
          <span className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-navy-100">
            <span className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </span>
        </div>
        {/* 가장 큰 버튼은 하나만 — 지금 할 행동이 무엇인지 헷갈리지 않게 */}
        <div className="px-5 pb-4 pt-4">
          <button
            onClick={() => navigate('/collection')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-5 py-4 text-[1.28rem] font-extrabold text-white shadow-sm transition active:scale-[0.98]"
          >
            <PlusCircle size={22} strokeWidth={2.5} /> 수거 완료 입력
          </button>
        </div>
        <button
          onClick={() => navigate('/today')}
          className="flex w-full items-center justify-center gap-1 border-t border-navy-100 py-3.5 text-[1.08rem] font-bold text-navy-500 transition active:bg-navy-50"
        >
          오늘 일정 전체 보기 <ChevronRight size={17} />
        </button>
      </section>

      {/* ② 지금 손대야 할 것 — 0건은 그리지 않습니다 */}
      {tasks.length > 0 ? (
        <section className="card divide-y divide-navy-50">
          {tasks.map((t) => {
            const Icon = t.icon
            return (
              <Link key={t.key} to={t.to} className="flex items-center gap-3.5 px-5 py-4 transition active:bg-navy-50">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONE[t.tone].tile}`}
                >
                  <Icon size={21} strokeWidth={2.3} />
                </span>
                <span className="t-body min-w-0 flex-1 break-keep font-extrabold text-navy-900">{t.label}</span>
                <span className={`shrink-0 whitespace-nowrap text-[1.35rem] font-extrabold ${TONE[t.tone].text}`}>
                  {t.count}
                  <span className="t-label text-navy-400">{t.unit}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-navy-400" />
              </Link>
            )
          })}
        </section>
      ) : (
        <section className="card flex items-center gap-3 px-5 py-4">
          <CheckCircle2 size={21} strokeWidth={2.4} className="shrink-0 text-emerald-600" />
          <p className="t-body break-keep font-bold text-navy-600">지금 바로 처리할 요청이 없습니다</p>
        </section>
      )}

      {/* 사업 현황 링크는 아래 「④ 성장기회」로 옮겼습니다.
          ① 오늘 처리할 업무 안에 두면 오늘 할 일과 섞여서, 폰 첫 화면에서
          "지금 눌러야 하는 것"이 하나 더 늘어난 것처럼 보였습니다. */}

      {urgent.length > 0 && (
        <p className="t-muted flex items-center gap-1.5 px-1 break-keep text-rose-500">
          <AlertTriangle size={15} strokeWidth={2.5} className="shrink-0" />
          긴급 요청은 오늘 안에 회신해 주세요
        </p>
      )}
    </div>
  )
}
