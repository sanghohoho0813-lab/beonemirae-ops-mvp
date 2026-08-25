import { Link } from 'react-router-dom'
import { Check, ChevronRight, Circle } from 'lucide-react'
import type { AppData } from '../types'
import { useAuth } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 시작하기 체크리스트
//
//  실제 운영으로 전환한 직후에는 서버가 비어 있어 대시보드가 텅 빕니다.
//  "무엇부터 해야 하는지"를 순서대로 알려주고, 다 끝나면 사라집니다.
//  (시연 모드에는 이미 샘플 데이터가 있으므로 표시하지 않습니다)
// ─────────────────────────────────────────────────────────────────────────────

export function StartHere({ data }: { data: AppData }) {
  const { mode, role } = useAuth()
  if (mode !== 'live') return null
  //  이 체크리스트는 회사를 처음 세팅하는 사람을 위한 것입니다 — 차량 등록,
  //  거래처 등록, 기준값 입력. 현장 담당자는 그중 무엇도 할 수 없습니다
  //  (거래처 등록은 서버가 막고, 나머지는 관리자 전용입니다). 그런데 폰에서는
  //  이 카드가 첫 화면의 절반을 차지해, 정작 오늘 갈 곳이 아래로 밀렸습니다.
  if (role === 'field') return null

  const hasClients = data.clients.length > 0
  const hasVehicles = data.vehicles.length > 0
  //  「첫 수거 완료 입력」이 끝났는지.
  //
  //   예전에는 수거 입력 이벤트(events)만 봤습니다. 그 표는 **이 화면에서
  //   수거 완료를 눌렀을 때만** 쌓입니다. 그래서 엑셀에서 지난 수거를
  //   수천 건 가져온 회사에서도 이 줄은 영원히 「안 끝남」으로 남았습니다 —
  //   이미 다 해 본 일을 매일 「아직 안 했다」고 말하는 셈입니다.
  //
  //   완료된 일정이 하나라도 있으면 끝난 것으로 봅니다.
  const hasCollection =
    (data.events ?? []).some((e) => e.action === '수거 완료' && !e.reverted) ||
    data.schedules.some((s) => s.status === '완료')
  const hasBaseline = Object.values({
    a: data.baseline.adminMinutesPerCollection,
    b: data.baseline.repeatEntriesPerCollection,
    c: data.baseline.monthlyDocHours,
    d: data.baseline.monthlyReworkCount,
    e: data.baseline.dailyCapacity,
  }).some((v) => v != null)

  const isAdmin = role === 'admin'
  const steps = [
    //  설정 화면은 스크롤이 길어서 그냥 '/settings' 로 보내면 차량 칸을
    //  못 찾습니다. 앵커로 바로 데려갑니다(Settings.tsx 의 anchor="vehicles").
    { done: hasVehicles, label: '운행 차량 등록', desc: '차량이 없으면 수거 입력을 할 수 없습니다', to: '/settings#vehicles', admin: true },
    { done: hasClients, label: '거래처 등록', desc: '실제 거래 병원을 추가합니다', to: '/clients', admin: false },
    { done: hasCollection, label: '첫 수거 완료 입력', desc: '입력 한 번이 여러 업무로 자동 연결됩니다', to: '/collection', admin: false },
    { done: hasBaseline, label: '도입 전 기준값 입력', desc: 'AX 성과를 비교할 기준이 됩니다', to: '/settings#baseline', admin: true },
  ].filter((s) => isAdmin || !s.admin)

  const remaining = steps.filter((s) => !s.done)
  if (remaining.length === 0) return null

  //  ── 이미 굴러가고 있으면 한 줄로 줄입니다 (0080) ────────────────────────
  //
  //   대표님: 「"시작하기 3/4" 같은 초기 세팅 체크리스트가 실제 운영
  //   단계에서도 큰 공간을 차지한다면 정리해줘. 대표 화면의 첫 화면은
  //   오늘 일정 / 완료·미완료 / 최근 수거입력이 먼저 보여야 한다.」
  //
  //   ⚠ 없애지는 않습니다. 남은 항목이 **진짜로 남아 있기** 때문입니다 —
  //     지워 버리면 기준값을 영영 안 넣게 됩니다.
  //   ⚠ 기준으로 삼는 것은 「수거를 한 번이라도 해 봤는가」입니다. 그때부터는
  //     처음 세팅하는 사람이 아니라 **매일 쓰는 사람**입니다. 첫 화면의
  //     절반을 세팅 안내가 차지할 이유가 없습니다.
  if (hasCollection) {
    return (
      <Link
        data-start-here-mini
        to={remaining[0].to}
        className="card flex items-center gap-3 px-4 py-3 transition hover:bg-navy-50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-navy-500">
          <Circle size={11} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1 break-keep text-[1.05rem] text-navy-600">
          아직 안 하신 설정이 <b className="text-navy-800">{remaining.length}가지</b> 있습니다 —{' '}
          <b className="text-navy-800">{remaining.map((r) => r.label).join(' · ')}</b>
        </span>
        <ChevronRight size={18} className="shrink-0 text-navy-400" />
      </Link>
    )
  }

  return (
    <section data-start-here-full className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-navy-100 px-5 py-4 sm:px-6">
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">시작하기</p>
        <p className="t-body font-bold text-navy-400">
          {steps.length - remaining.length} / {steps.length} 완료
        </p>
      </div>
      <div className="divide-y divide-navy-50">
        {steps.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className={`flex items-center gap-3.5 px-5 py-4 transition hover:bg-navy-50 sm:px-6 ${
              /*  ⚠ 0082 — 여기 opacity-55 가 걸려 있었습니다. **부모가 흐려지면
                  자식 글자도 같이 흐려집니다** — 19px 제목이 2.3:1 까지
                  떨어졌습니다. 끝난 줄인 것은 취소선과 글자색이 이미 말해
                  주고 있으니, 통째로 흐리게 만들 이유가 없습니다.
                  흐림이 필요하면 **배경색에만** 넣습니다. */
              s.done ? 'bg-navy-50' : ''
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                s.done ? 'bg-teal-500 text-white' : 'bg-navy-100 text-navy-400'
              }`}
            >
              {s.done ? <Check size={18} strokeWidth={3} /> : <Circle size={12} strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`t-body break-keep font-extrabold ${s.done ? 'text-navy-500 line-through' : 'text-navy-900'}`}>
                {s.label}
              </p>
              <p className="t-muted break-keep">{s.desc}</p>
            </div>
            {!s.done && <ChevronRight size={20} className="shrink-0 text-navy-400" />}
          </Link>
        ))}
      </div>
    </section>
  )
}
