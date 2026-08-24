import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  ClipboardEdit,
  FileWarning,
  Inbox,
  PlusCircle,
  Siren,
  type LucideIcon,
} from 'lucide-react'
import type { AppData } from '../types'
import { openRequests, todayProgress } from '../lib/ops'
import { hideRequests } from '../lib/pilotMode'
import { daysToContractEnd } from '../lib/billing'
import { today } from '../lib/format'
import { TONE, type Tone } from '../lib/tone'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 (PC 첫 화면)
//
//  대시보드를 열었을 때 3초 안에 알아야 하는 것만 놓습니다.
//    왼쪽  오늘 수거가 몇 건 남았는가 → 바로 입력
//    오른쪽 지금 손대야 할 것은 무엇인가 → 그 화면으로
//
//  모바일의 TodayFocus 와 같은 생각이지만 같은 화면을 늘린 것은 아닙니다.
//  PC 는 가로가 넓으므로 "오늘 진행"과 "처리할 목록"을 나란히 두어
//  스크롤 없이 한 번에 보이게 했습니다.
//
//  숫자가 0인 줄은 그리지 않습니다. 남아 있는 줄이 곧 할 일입니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Task {
  key: string
  icon: LucideIcon
  label: string
  detail: string
  count: number
  unit: string
  tone: Tone
  to: string
  cta: string
}

/** 계약 만료가 가까운 거래처 (60일 이내) */
function expiringSoon(data: AppData): number {
  const t = today()
  return data.clients.filter((c) => {
    const d = daysToContractEnd(c, t)
    return d != null && d >= 0 && d <= 60
  }).length
}

export function TodayBoard({ data }: { data: AppData }) {
  const navigate = useNavigate()
  const progress = todayProgress(data)
  //  Pilot 동안 병원 요청은 안 씁니다 (0080)
  const open = hideRequests() ? [] : openRequests(data)
  const urgent = open.filter((r) => r.urgent)

  const tasks = useMemo<Task[]>(() => {
    const all: Task[] = [
      {
        key: 'urgent',
        icon: Siren,
        label: '긴급 요청',
        detail: '오늘 안에 회신이 필요합니다',
        count: urgent.length,
        unit: '건',
        tone: 'rose',
        to: '/requests',
        cta: '처리하기',
      },
      {
        key: 'open',
        icon: Inbox,
        label: '처리 대기 요청',
        detail: '병원이 올린 요청을 확인해 주세요',
        count: open.length - urgent.length,
        unit: '건',
        tone: 'violet',
        to: '/requests',
        cta: '확인',
      },
      {
        key: 'input',
        icon: ClipboardEdit,
        label: '수거 입력 대기',
        detail: '방문했지만 아직 입력되지 않았습니다',
        count: progress.pendingInput,
        unit: '건',
        tone: 'amber',
        to: '/today',
        cta: '확인',
      },
      {
        key: 'contract',
        icon: FileWarning,
        label: '계약 만료 예정',
        detail: '60일 이내 — 갱신 협의가 필요합니다',
        count: expiringSoon(data),
        unit: '곳',
        tone: 'sky',
        to: '/clients',
        cta: '거래처 보기',
      },
    ]
    return all.filter((t) => t.count > 0)
  }, [data, open, urgent, progress.pendingInput])

  const left = Math.max(0, progress.planned - progress.done)
  const pct = progress.planned ? Math.round((progress.done / progress.planned) * 100) : 0

  return (
    <section
      data-tour="today-board"
      className="hidden lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-4"
    >
      {/* ① 오늘 수거 — 숫자 하나와 버튼 하나 */}
      <div className="card flex flex-col overflow-hidden">
        {/* 오른쪽 목록 높이에 맞춰 늘어나므로 세로 가운데로 둡니다 */}
        <div className="flex flex-1 flex-col justify-center px-6 pt-5">
          <p className="t-label text-navy-500">오늘 수거</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="t-kpi tabular-nums text-navy-900">{left}</span>
            <span className="t-card text-navy-400">건 남음</span>
          </div>
          <p className="t-muted mt-1 tabular-nums">
            {progress.done} / {progress.planned}건 완료
            {progress.planned > 0 && ` · ${pct}%`}
          </p>
          <span className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-navy-100">
            <span
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </span>
        </div>
        <div className="px-6 pb-5 pt-4">
          <button
            onClick={() => navigate('/collection')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-5 py-3.5 text-[1.16rem] font-extrabold text-white shadow-sm transition hover:bg-teal-600 active:scale-[0.99]"
          >
            <PlusCircle size={20} strokeWidth={2.5} /> 수거 완료 입력
          </button>
        </div>
        <Link
          to="/today"
          className="flex items-center justify-center gap-1 border-t border-navy-100 py-3 text-[1.04rem] font-bold text-navy-500 transition hover:bg-navy-50"
        >
          오늘 일정 전체 보기 <ChevronRight size={16} />
        </Link>
      </div>

      {/* ② 지금 처리할 것 — 0건은 그리지 않습니다 */}
      <div className="card overflow-hidden">
        <div className="border-b border-navy-100 px-6 py-3.5">
          <p className="t-card text-navy-900">지금 처리할 것</p>
        </div>
        {tasks.length === 0 ? (
          <div className="flex h-[calc(100%-3.5rem)] min-h-[10rem] items-center justify-center px-6 py-8">
            <p className="t-body break-keep text-center font-bold text-navy-400">
              지금 바로 처리할 일이 없습니다.
              <br />
              오늘 수거 입력만 마치면 됩니다.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-navy-50">
            {tasks.map((t) => {
              const Icon = t.icon
              return (
                <li key={t.key}>
                  <Link
                    to={t.to}
                    className="flex items-center gap-4 px-6 py-3.5 transition hover:bg-navy-50"
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONE[t.tone].tile}`}
                    >
                      <Icon size={21} strokeWidth={2.3} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-body block break-keep font-extrabold text-navy-900">
                        {t.label}
                      </span>
                      <span className="t-muted block break-keep">{t.detail}</span>
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap text-[1.5rem] font-extrabold tabular-nums ${TONE[t.tone].text}`}
                    >
                      {t.count}
                      <span className="t-label text-navy-400">{t.unit}</span>
                    </span>
                    <span className="t-btn shrink-0 whitespace-nowrap rounded-full bg-navy-900 px-4 py-2 text-white">
                      {t.cta}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
