import { Check, CircleDot, Lock, type LucideIcon } from 'lucide-react'
import type { AppData } from '../types'
import { customerServiceStats } from '../lib/portal'
import { salesFunnel } from '../lib/sales'
import { won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 사업 확장 — 거래처당 매출 구조
//
//  중요한 원칙: 실제로 제공하지 않는 서비스를 이미 판매 중인 것처럼 쓰지 않습니다.
//  각 항목을 아래 세 상태로만 구분하고, '실증 중' 항목에는 지금까지 실제로
//  기록된 값만 붙입니다. 아직 없으면 숫자를 만들지 않고 비워 둡니다.
//
//   구현됨    시스템에서 실제로 처리되고 있는 것
//   실증 중   기능은 있고 실제 데이터를 쌓는 중인 것
//   개발 예정 아직 만들지 않은 것 (매출로 세지 않습니다)
// ─────────────────────────────────────────────────────────────────────────────

type Status = '구현됨' | '실증 중' | '개발 예정'

const STATUS_META: Record<Status, { icon: LucideIcon; chip: string; dot: string }> = {
  구현됨: { icon: Check, chip: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' },
  '실증 중': { icon: CircleDot, chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  '개발 예정': { icon: Lock, chip: 'bg-navy-100 text-navy-500', dot: 'bg-navy-300' },
}

export function RevenueModelCard({ data }: { data: AppData }) {
  const cs = customerServiceStats(data)
  const f = salesFunnel(data)

  const rows: { label: string; status: Status; desc: string; actual: string }[] = [
    {
      label: '의료폐기물 수거·운반',
      status: '구현됨',
      desc: '기존 본업 — 일정·수거이력·수거대장까지 시스템에서 처리',
      actual: `수거 입력 ${data.events.filter((e) => !e.reverted).length}건`,
    },
    {
      label: '추가 수거',
      status: '실증 중',
      desc: '배출량 증가·보관기한 임박을 데이터로 감지해 먼저 제안',
      actual:
        f.accepted > 0
          ? `수락 ${f.accepted}건${f.actualRevenue > 0 ? ` · 실제 ${won(f.actualRevenue)}` : ' · 매출 미입력'}`
          : '아직 수락 건 없음',
    },
    {
      label: '전용용기·소모품 공급',
      status: '실증 중',
      desc: '병원이 포털에서 직접 요청하고, 수거할 때 함께 공급',
      actual: cs.requestsTotal > 0 ? `병원 요청 ${cs.requestsTotal}건 접수` : '아직 요청 없음',
    },
    {
      label: '배출자 교육 · 자료 제공',
      status: '개발 예정',
      desc: '요청 접수까지만 구현. 교육 이력 관리·과금은 미개발',
      actual: '교육 이력 테이블 없음 (현재 화면값은 참고용 파생값)',
    },
    {
      label: '정기 병원 운영관리 서비스',
      status: '개발 예정',
      desc: '월간 리포트·요청 처리·제안을 묶은 구독형 관리 서비스',
      actual: '요금제·계약 구조 미정',
    },
  ]

  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-navy-50">
        {rows.map((r) => {
          const m = STATUS_META[r.status]
          return (
            <div key={r.label} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-4 sm:px-6">
              <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="t-body min-w-0 break-keep font-extrabold text-navy-900">{r.label}</p>
                  <span className={`pill ${m.chip}`}>{r.status}</span>
                </div>
                <p className="t-muted mt-1 break-keep leading-snug">{r.desc}</p>
              </div>
              <p className="t-body w-full shrink-0 break-keep font-bold text-navy-500 sm:w-auto sm:max-w-[16rem] sm:text-right">
                {r.actual}
              </p>
            </div>
          )
        })}
      </div>
      <p className="t-muted break-keep border-t border-navy-100 px-5 py-3.5 sm:px-6">
        '개발 예정' 항목은 어떤 성과 집계에도 포함되지 않습니다. 표시된 실제값은 모두 이 시스템에 기록된
        수거·요청·제안 데이터에서 계산한 것입니다.
      </p>
    </div>
  )
}
