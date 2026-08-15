import { Users } from 'lucide-react'
import { useData } from '../context/DataContext'
import type { Staff, WasteScope } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 우리 직원
//
//  지금까지 이 시스템은 거래처는 알아도 **회사 자신은 몰랐습니다.** 현장에
//  누가 있는지, 누가 기저귀를 맡고 누가 의료폐기물을 맡는지 어디에도 없어서
//  「오늘 이건 누가 가지?」는 매번 카톡으로 정했습니다.
//
//  ⚠ 주민등록번호는 담지 않습니다. 4대보험 명부에 적혀 있어도 이 시스템이
//    하는 일(일정·수거·정산)에 필요 없는 값이고, 한 번 넣으면 백업·내보내기·
//    화면 어디로든 흘러갑니다. 이름과 담당, 자격취득일까지만 받습니다.
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_TONE: Record<WasteScope, string> = {
  의료폐기물: 'bg-rose-50 text-rose-600',
  일회용기저귀: 'bg-sky-50 text-sky-700',
  '둘 다': 'bg-violet-50 text-violet-700',
  해당없음: 'bg-navy-50 text-navy-400',
}
const POSITION_ORDER: Record<string, number> = { 대표: 0, 이사: 1, 사무: 2, 현장: 3 }

const ymd = (iso: string | null) => (iso ? iso.replace(/-/g, '.') : '—')

export function StaffCard() {
  const { data } = useData()
  const staff = (data.staff ?? []).filter((s) => s.active)

  //  없으면 이 칸을 아예 그리지 않습니다 — 없는 일을 만들어 내지 않습니다.
  if (staff.length === 0) return null

  const sorted = [...staff].sort((a, b) => {
    const p = (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9)
    if (p !== 0) return p
    //  현장은 오래 계신 분부터
    return (a.insuredFrom ?? '9999').localeCompare(b.insuredFrom ?? '9999')
  })
  const field = sorted.filter((s) => s.position === '현장')
  const byScope = (scope: WasteScope) => field.filter((s) => s.wasteScope === scope || s.wasteScope === '둘 다')

  return (
    <div data-staff-card className="card px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500">
          <Users size={20} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1 basis-[12rem]">
          <p className="t-body break-keep font-extrabold text-navy-900">우리 직원</p>
          <p className="t-muted mt-0.5 break-keep" data-staff-line>
            {staff.length}명 · 현장 {field.length}명 — 의료폐기물 {byScope('의료폐기물').length}명 · 일회용기저귀{' '}
            {byScope('일회용기저귀').length}명
          </p>
        </div>
      </div>

      <ul data-staff-list className="mt-3 flex flex-col gap-1.5">
        {sorted.map((s) => (
          <li
            key={s.id}
            data-staff-row={s.name}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white px-3 py-2.5 ring-1 ring-navy-50"
          >
            <b className="t-cell text-navy-900">{s.name}</b>
            <span className="pill bg-navy-50 text-navy-600">{s.position}</span>
            {s.wasteScope !== '해당없음' && (
              <span className={`pill ${SCOPE_TONE[s.wasteScope]}`}>{s.wasteScope}</span>
            )}
            <span className="t-muted ml-auto shrink-0">{ymd(s.insuredFrom)}부터</span>
          </li>
        ))}
      </ul>

      <p className="t-muted mt-3 break-keep">
        날짜는 <b className="text-navy-600">4대보험 최초 자격취득일</b>입니다 — 실제 입사일과 다를 수 있습니다.
        주민등록번호는 이 시스템에 저장하지 않습니다.
      </p>
    </div>
  )
}

/** 이 폐기물을 맡는 현장 담당자 이름들 — 다른 화면에서도 씁니다 */
export function handlersOf(staff: Staff[] | undefined, waste: '의료폐기물' | '일회용기저귀'): string[] {
  return (staff ?? [])
    .filter((s) => s.active && s.position === '현장' && (s.wasteScope === waste || s.wasteScope === '둘 다'))
    .sort((a, b) => (a.insuredFrom ?? '9999').localeCompare(b.insuredFrom ?? '9999'))
    .map((s) => s.name)
}
