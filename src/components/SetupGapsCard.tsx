import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Wrench } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { scanSetupGaps, type GapWeight } from '../lib/setupGaps'

// ─────────────────────────────────────────────────────────────────────────────
// 아직 값이 비어서 못 쓰는 기능 — 화면
//
//  「채워 주세요」 목록이 아닙니다. **지금 무슨 일이 벌어지고 있는지**를
//  숫자로 적고, 그 자리로 바로 갈 수 있게 합니다.
//
//   ✗ 사업자정보 없음
//   ○ 청구가 있는 12곳 중 3곳에 사업자등록번호가 없습니다. 그 병원은
//     세금계산서 자료에서 「확인 필요」로 빠집니다 — 결국 홈택스에 손으로
//     넣게 됩니다.
//
//  다 채우면 이 카드는 「다 채워져 있습니다」 한 줄이 됩니다. 목록이
//  사라지지 않고 남는 이유는, 여기가 **찾아와서 보는 자리**이기 때문입니다
//  (대시보드 알림과 다릅니다 — 그쪽은 없으면 아예 안 그립니다).
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<GapWeight, { chip: string; ring: string }> = {
  돈: { chip: 'bg-rose-100 text-rose-700', ring: 'ring-rose-100' },
  운영: { chip: 'bg-amber-100 text-amber-700', ring: 'ring-amber-100' },
  보조: { chip: 'bg-navy-100 text-navy-500', ring: 'ring-navy-100' },
}

export function SetupGapsCard() {
  const { data } = useData()
  const { role } = useAuth()
  //  현장·병원은 이 값들을 넣을 수 없습니다.
  if (role === 'field' || role === 'client') return null

  const scan = scanSetupGaps(data)

  if (scan.gaps.length === 0) {
    return (
      <div data-setup-gaps data-setup-clear className="card border-teal-200 bg-teal-50 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-600" strokeWidth={2.4} />
          <div className="min-w-0">
            <p className="break-keep text-[1.08rem] font-extrabold text-navy-900">
              넣어야 할 값이 다 채워져 있습니다
            </p>
            <p className="t-caption mt-1 break-keep text-navy-500">
              휴무일 · 소모품 단가 · 사업자정보 · 부가세 처리 · 거래처 단가 · 월 운영비 · 직원 명부
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-setup-gaps className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500">
          <Wrench size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p data-setup-headline className="break-keep text-[1.12rem] font-extrabold leading-snug text-navy-900">
            아직 값이 비어서 못 쓰는 기능이 {scan.gaps.length}가지 있습니다
          </p>
          <p className="t-caption mt-0.5 break-keep text-navy-500">
            {scan.moneyCount > 0
              ? `그중 ${scan.moneyCount}가지는 돈이 틀릴 수 있는 자리입니다 — 위부터 보십시오.`
              : '기능은 다 만들어져 있고 값만 넣으면 됩니다.'}
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {scan.gaps.map((g) => {
          const t = TONE[g.weight]
          return (
            <li key={g.key} data-setup-gap={g.key} className={`rounded-2xl bg-navy-50 px-3.5 py-3 ring-1 ${t.ring}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.92rem] font-bold ${t.chip}`}>
                  {g.weight}
                </span>
                <b className="min-w-0 break-keep text-[1.05rem] text-navy-900">{g.label}</b>
              </div>
              {/*  「채워 주세요」가 아니라 지금 벌어지는 일 */}
              <p data-setup-effect={g.key} className="t-caption mt-1 break-keep leading-relaxed text-navy-600">
                {g.effect}
              </p>
              <Link
                to={g.to}
                data-setup-link={g.key}
                className="mt-1.5 inline-flex items-center gap-1 text-[0.98rem] font-bold text-teal-700 underline-offset-2 hover:underline"
              >
                {g.linkLabel}
                <ArrowRight size={13} strokeWidth={2.6} />
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="t-caption mt-2.5 break-keep leading-snug text-navy-400">
        전부 실제 기록에서 센 숫자입니다. 다 채우면 이 목록은 사라집니다.
      </p>
    </div>
  )
}

/**
 * 한 줄짜리 — 대표님이 이미 보고 계신 화면에 놓습니다.
 *
 *  비어 있는 것이 없으면 **아무것도 그리지 않습니다.** 카드와 다릅니다:
 *  카드는 찾아와서 보는 자리라 「다 채워졌습니다」를 보여 주는 것이 맞고,
 *  이 줄은 지나가는 자리라 조용해야 합니다.
 */
export function SetupGapsLine({ className = '' }: { className?: string } = {}) {
  const { data } = useData()
  const { role } = useAuth()
  if (role === 'field' || role === 'client') return null

  const scan = scanSetupGaps(data)
  if (scan.gaps.length === 0) return null

  return (
    <Link
      to="/settings"
      data-setup-line
      className={`flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-card transition hover:bg-navy-50 ${className}`}
    >
      <Wrench size={17} className="shrink-0 text-navy-400" />
      <span className="min-w-0 flex-1 break-keep text-[1.02rem] font-bold text-navy-700">
        아직 값이 비어서 못 쓰는 기능 {scan.gaps.length}가지
        {scan.moneyCount > 0 && <span className="text-rose-600"> · 돈 관련 {scan.moneyCount}가지</span>}
      </span>
      <ArrowRight size={15} className="shrink-0 text-navy-400" strokeWidth={2.6} />
    </Link>
  )
}
