import { useEffect, useMemo, useState } from 'react'
import { Package, Hospital, Truck, Timer, AlertTriangle } from 'lucide-react'
import type { AppData } from '../types'
import { useAuth } from '../context/AuthContext'
import { loadProfiles } from '../lib/repo'
import { SectionTitle } from './ui'
import { won } from '../lib/format'
import {
  AX_MIN_SAMPLES,
  axCompare,
  axEvidence,
  ORDER_STAGE_ORDER,
  stageLabel,
  type AxCompare,
  type AxNumber,
  type AxPeriod,
} from '../lib/axEvidence'

// ─────────────────────────────────────────────────────────────────────────────
// AX 증거 — 매출 · 고객 · 확장
//
//  이 화면이 지키는 것은 **숫자를 크게 보이게 하지 않는 것**입니다.
//
//   · 값이 null 이면 숫자 자리를 비우고 왜 못 세는지 적습니다. 0 으로
//     바꿔 놓으면 「해 봤는데 없었다」로 읽힙니다.
//   · 표본이 적으면 「측정 중(참고값)」을 붙입니다. 3건짜리 숫자를 회사
//     성과처럼 키우지 않기 위해서입니다.
//   · 주문 접수 · 전달 완료 · 청구 확정 · 입금 완료를 **네 칸으로 갈라**
//     둡니다. 한 칸으로 합치면 아직 안 들어온 돈이 매출로 보입니다.
// ─────────────────────────────────────────────────────────────────────────────

const WD = ['일', '월', '화', '수', '목', '금', '토']

const STATE_PILL: Record<AxNumber['state'], string> = {
  ok: 'bg-teal-50 text-teal-700',
  measuring: 'bg-amber-50 text-amber-700',
  none: 'bg-navy-100 text-navy-500',
  'not-countable': 'bg-navy-100 text-navy-400',
}
const STATE_TEXT: Record<AxNumber['state'], string> = {
  ok: '측정값',
  measuring: '측정 중',
  none: '아직 없음',
  'not-countable': '셀 수 없음',
}

function fmt(n: AxNumber): string {
  if (n.value == null) return '—'
  if (n.unit === '원') return won(n.value)
  return `${n.value.toLocaleString('ko-KR')}${n.unit}`
}

function NumberRow({ n }: { n: AxNumber }) {
  return (
    <div data-ax-num={n.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3.5">
      <span className="t-body min-w-[7rem] flex-1 break-keep font-bold text-navy-700">{n.label}</span>
      <b
        data-ax-value={n.key}
        className={`t-card shrink-0 tabular-nums ${n.value == null ? 'text-navy-300' : 'text-navy-900'}`}
      >
        {fmt(n)}
      </b>
      <span data-ax-state={n.key} className={`pill shrink-0 ${STATE_PILL[n.state]}`}>
        {STATE_TEXT[n.state]}
      </span>
      <p className="t-muted w-full break-keep leading-snug text-navy-400">
        {n.basis}
        {n.state === 'measuring' && ` · 표본 ${n.samples}건 (${AX_MIN_SAMPLES}건 이상이면 측정값)`}
      </p>
    </div>
  )
}

function Numbers({ list }: { list: AxNumber[] }) {
  return <div className="card divide-y divide-navy-50">{list.map((n) => <NumberRow key={n.key} n={n} />)}</div>
}

/**
 * 도입 전 → 현재 → 변화.
 *
 *  ⚠ 이 자리에서 제일 위험한 것은 **Before 를 지어내는 것**입니다.
 *    「도입 전 포털 비율은 당연히 0%」는 추정이지 측정이 아닙니다.
 *    같은 계산을 도입일 앞 기간에 그대로 돌리고, 기록이 없으면 없다고 적습니다.
 */
function BeforeAfter({ cmp }: { cmp: AxCompare }) {
  const fmtV = (v: number | null, unit: string) =>
    v == null ? '—' : unit === '원' ? won(v) : `${v.toLocaleString('ko-KR')}${unit}`

  return (
    <section id="ax-before-after">
      <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">같은 계산 · 같은 길이</span>}>
        도입 전 → 현재
      </SectionTitle>
      <div data-ax-cmp={cmp.state} className="card p-4 sm:p-5">
        <p className="t-body break-keep font-bold text-navy-700">{cmp.reason}</p>
        {cmp.before && cmp.after && (
          <p className="t-muted mt-1 break-keep text-navy-400">
            도입 전 {cmp.before.from} ~ {cmp.before.to} · 도입 후 {cmp.after.from} ~ {cmp.after.to}
          </p>
        )}

        {cmp.rows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse">
              <thead>
                <tr className="border-b border-navy-100 text-left">
                  <th className="t-muted py-2 pr-3 font-bold text-navy-400">항목</th>
                  <th className="t-muted py-2 pr-3 text-right font-bold text-navy-400">도입 전</th>
                  <th className="t-muted py-2 pr-3 text-right font-bold text-navy-400">현재</th>
                  <th className="t-muted py-2 text-right font-bold text-navy-400">변화</th>
                </tr>
              </thead>
              <tbody>
                {cmp.rows.map((r) => {
                  //  ⚠ 한쪽이라도 없으면 변화를 만들지 않습니다.
                  //    「0 → 3」을 「＋∞%」나 「＋300%」로 적으면 안 됩니다.
                  const canDiff = r.before != null && r.after != null
                  const diff = canDiff ? (r.after as number) - (r.before as number) : null
                  const good = diff == null ? null : r.betterWhen === 'higher' ? diff > 0 : diff < 0
                  return (
                    <tr key={r.key} data-ax-cmp-row={r.key} className="border-b border-navy-50 last:border-0">
                      <td className="t-body break-keep py-2.5 pr-3 font-bold text-navy-700">{r.label}</td>
                      <td
                        data-ax-cmp-before={r.key}
                        className={`t-body py-2.5 pr-3 text-right tabular-nums ${r.before == null ? 'text-navy-300' : 'text-navy-600'}`}
                      >
                        {r.before == null ? '기록 없음' : fmtV(r.before, r.unit)}
                      </td>
                      <td
                        data-ax-cmp-after={r.key}
                        className={`t-body py-2.5 pr-3 text-right font-extrabold tabular-nums ${r.after == null ? 'text-navy-300' : 'text-navy-900'}`}
                      >
                        {fmtV(r.after, r.unit)}
                      </td>
                      <td
                        data-ax-cmp-diff={r.key}
                        className={`t-body py-2.5 text-right tabular-nums ${good === true ? 'text-teal-700' : good === false ? 'text-rose-600' : 'text-navy-300'}`}
                      >
                        {diff == null
                          ? '견줄 수 없음'
                          : `${diff > 0 ? '＋' : diff < 0 ? '−' : ''}${fmtV(Math.abs(diff), r.unit)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="t-muted mt-3 break-keep text-navy-400">
          ⚠ 한쪽에 기록이 없으면 <b className="text-navy-600">변화를 만들지 않습니다</b> — 「0 → 3」을 「＋300%」로
          적지 않습니다. 도입 전 기간은 엑셀·카톡으로 일하던 때라 이 시스템에 남은 것이 없을 수 있습니다.
        </p>
      </div>
    </section>
  )
}

export function AxEvidencePanels({
  data,
  period,
  experimentStart,
  today,
}: {
  data: AppData
  period: AxPeriod
  experimentStart: string | null
  today: string
}) {
  //  ── 활성 병원 계정 수 ─────────────────────────────────────────────────
  //
  //   profiles 는 **관리자만** 읽을 수 있습니다 (RLS: 본인 또는 관리자).
  //   사무실 계정으로 읽으면 본인 한 줄만 옵니다 — 그걸 「계정 1개」로 적으면
  //   거짓말이 됩니다. 그래서 **관리자일 때만** 읽고, 아니면 안 넘깁니다
  //   (그때 화면은 「관리자 계정에서만 볼 수 있습니다」라고 적습니다).
  const { role } = useAuth()
  const [accounts, setAccounts] = useState<number | null>(null)
  useEffect(() => {
    if (role !== 'admin') {
      setAccounts(null)
      return
    }
    let alive = true
    void loadProfiles()
      .then((rows) => {
        if (!alive) return
        setAccounts(rows.filter((r) => r.role === 'client' && r.active).length)
      })
      //  못 읽으면 조용히 「셀 수 없음」으로 둡니다 — 0 으로 바꾸지 않습니다.
      .catch(() => alive && setAccounts(null))
    return () => {
      alive = false
    }
  }, [role])

  const e = useMemo(() => axEvidence(data, period, accounts), [data, period, accounts])
  const cmp = useMemo(() => axCompare(data, experimentStart, today), [data, experimentStart, today])
  const f = e.sales.funnel
  const stageCount = ORDER_STAGE_ORDER.map((label) => ({
    label,
    n: e.sales.stages.filter((s) => stageLabel(s) === label).length,
  }))

  return (
    <>
      <BeforeAfter cmp={cmp} />

      {/* ── 업무 AX · 당일 입력 ─────────────────────────────────────────── */}
      <section id="ax-work">
        <SectionTitle action={<span className="pill bg-sky-50 text-sky-700">완료된 입력 기록</span>}>
          <Timer size={17} className="mr-1.5 inline -translate-y-px" strokeWidth={2.5} />
          업무 AX — 그날 안에 업무가 닫혔는가
        </SectionTitle>
        <p className="t-muted mb-3 break-keep px-1 text-navy-400">
          다녀온 날과 입력한 날(한국 시간)이 같으면 「당일」입니다. 파일럿 하루 한 줄 기록의{' '}
          <b className="text-navy-600">「당일 입력률」과 같은 정의</b>를 씁니다 — 두 숫자를 나란히 놓을 수 있게.
        </p>
        <Numbers list={e.work.numbers} />

        {/*  직원별 처리건수 — 지시문에서 **업무 AX** 항목입니다.
             계산은 완료된 방문 기록에서 하므로 확장 AX 와 같은 값이지만,
             「누가 얼마나 했나」는 업무 쪽에서 보는 것이 맞습니다.
             ⚠ 기록에 이름이 없는 건은 차량 기본 기사로 채우지 않습니다 —
               대차로 나간 날이 그대로 틀린 사람 실적이 됩니다. */}
        {e.capacity.byDriver.length > 0 && (
          <div data-ax-work-drivers className="card mt-3 divide-y divide-navy-50">
            <p className="t-card px-4 py-3 font-extrabold text-navy-900">직원별 처리건수</p>
            {e.capacity.byDriver.map((d) => (
              <div key={d.name} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3">
                <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">{d.name}</span>
                <b className="t-body shrink-0 tabular-nums text-navy-900">{d.visits}건</b>
                <span className="t-muted shrink-0 text-navy-400">
                  {d.days}일 · 하루 {Math.round((d.visits / Math.max(d.days, 1)) * 10) / 10}곳
                </span>
              </div>
            ))}
          </div>
        )}

        {e.work.lagHistogram.length > 0 && (
          <div data-ax-lag className="card mt-3 p-4 sm:p-5">
            <p className="t-body break-keep font-extrabold text-navy-900">며칠 만에 입력했는가</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {e.work.lagHistogram.map((h) => (
                <span
                  key={h.lagDays}
                  data-ax-lag-bucket={h.lagDays}
                  className={`pill ${h.lagDays === 0 ? 'bg-teal-50 text-teal-700' : h.lagDays < 0 ? 'bg-rose-50 text-rose-700' : 'bg-navy-100 text-navy-600'}`}
                >
                  {h.lagDays === 0 ? '당일' : h.lagDays < 0 ? `${-h.lagDays}일 전(있을 수 없음)` : `${h.lagDays}일 뒤`} {h.count}건
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 매출 AX ─────────────────────────────────────────────────────── */}
      <section id="ax-sales">
        <SectionTitle action={<span className="pill bg-teal-50 text-teal-700">실제 주문 기록 기준</span>}>
          <Package size={17} className="mr-1.5 inline -translate-y-px" strokeWidth={2.5} />
          매출 AX — 기존 병원에서 새 상품매출이 실제 발생했는가
        </SectionTitle>

        {/*  ⚠ 네 단계를 한 칸으로 합치지 않습니다.
             주문이 들어온 것과 돈이 들어온 것은 다른 일입니다. */}
        <div data-ax-funnel className="card mb-3 p-4 sm:p-5">
          <p className="t-body break-keep font-extrabold text-navy-900">
            주문 하나가 어디까지 갔는가
          </p>
          <p className="t-muted mt-1 break-keep text-navy-400">
            주문요청은 매출이 아니고, 전달은 입금이 아닙니다. 네 칸을 따로 둡니다.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { k: 'ordered', label: '주문 접수', n: f.ordered, tone: 'bg-navy-50 text-navy-700' },
              { k: 'delivered', label: '전달 완료', n: f.delivered, tone: 'bg-teal-50 text-teal-800' },
              { k: 'billed', label: '청구 확정', n: f.billed, tone: 'bg-sky-50 text-sky-800' },
              { k: 'paid', label: '입금 완료', n: f.paid, tone: 'bg-emerald-50 text-emerald-800' },
            ].map((s) => (
              <div key={s.k} data-ax-stage={s.k} className={`rounded-2xl px-3.5 py-3 ${s.tone}`}>
                <p className="t-muted break-keep font-bold">{s.label}</p>
                <b className="t-page tabular-nums">{s.n}</b>
                <span className="t-muted ml-1 font-bold">건</span>
              </div>
            ))}
          </div>
          {f.ordered === 0 && (
            <p data-ax-no-orders className="t-body mt-3 break-keep text-navy-500">
              이 기간에는 소모품 주문이 없습니다. 병원이 포털에서 물품을 담아 보내면 여기부터 채워집니다.
            </p>
          )}
          {f.ordered > 0 && (
            <p className="t-muted mt-3 break-keep text-navy-400">
              지금 머물러 있는 단계 · {stageCount.filter((s) => s.n > 0).map((s) => `${s.label} ${s.n}건`).join(' · ')}
            </p>
          )}
        </div>

        <Numbers list={e.sales.numbers} />
      </section>

      {/* ── 고객 AX ─────────────────────────────────────────────────────── */}
      <section id="ax-customer">
        <SectionTitle action={<span className="pill bg-violet-50 text-violet-700">병원이 직접 올린 기록</span>}>
          <Hospital size={17} className="mr-1.5 inline -translate-y-px" strokeWidth={2.5} />
          고객 AX — 병원이 전화·카톡 대신 직접 쓰기 시작했는가
        </SectionTitle>
        <p className="t-muted mb-3 break-keep px-1 text-navy-400">
          「썼다」는 <b className="text-navy-600">병원이 직접 올린 기록이 있는 것</b>입니다. 로그인만 하고 아무것도 안
          한 것은 세지 않습니다.
        </p>
        <Numbers list={e.customer.numbers} />
      </section>

      {/* ── 확장 AX ─────────────────────────────────────────────────────── */}
      <section id="ax-capacity">
        <SectionTitle action={<span className="pill bg-navy-100 text-navy-500">완료된 방문 기록</span>}>
          <Truck size={17} className="mr-1.5 inline -translate-y-px" strokeWidth={2.5} />
          확장 AX — 같은 기사·차량으로 더 많은 곳을 봤는가
        </SectionTitle>

        <div className="card mb-3 flex gap-3 border-amber-200 bg-amber-50/60 p-4">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-600" strokeWidth={2.3} />
          <p className="t-body min-w-0 break-keep leading-snug text-navy-700">
            <b className="text-amber-700">거리(km)와 소요시간은 계산하지 않습니다.</b> 거래처 좌표가 없습니다 — 주소는
            글자일 뿐이라 「몇 km 줄어듭니다」를 말할 수 없습니다. 여기 숫자는 전부{' '}
            <b className="text-navy-800">실제로 다녀온 기록</b>입니다.
          </p>
        </div>

        <Numbers list={e.capacity.numbers} />

        {/*  ── 차량 × 요일 ─────────────────────────────────────────────────
             「화요일 2호차는 지금 일정 기준으로 여유가 있는가」에 답하는
             자리입니다. 답은 **관측된 것**뿐입니다 —
             그 요일에 예전에 최대 몇 곳을 돌았고, 요즘은 몇 곳인가.
             그 차이가 「예전에 이만큼은 해냈다」입니다. 그 이상은 말하지
             않습니다(거리·교통·그날 폐기물 양은 여기 안 들어 있습니다). */}
        {e.capacity.vehicles.some((v) => v.visits > 0) && (
          <div data-ax-vehday className="card mt-3 p-4 sm:p-5">
            <p className="t-body break-keep font-extrabold text-navy-900">차량 × 요일 — 예전 최대 / 요즘 평균</p>
            <p className="t-muted mt-1 break-keep text-navy-400">
              두 번 이상 나간 요일만 적습니다. 한 번은 「그 요일의 그 차」라고 부를 수 없습니다.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse">
                <thead>
                  <tr className="border-b border-navy-100 text-left">
                    <th className="t-muted py-2 pr-3 font-bold text-navy-400">차량</th>
                    {WD.map((w) => (
                      <th key={w} className="t-muted py-2 pr-2 text-center font-bold text-navy-400">{w}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {e.capacity.vehicles
                    .filter((v) => v.visits > 0)
                    .map((v) => (
                      <tr key={v.vehicleId} data-ax-veh={v.vehicleId} className="border-b border-navy-50 last:border-0">
                        <td className="t-body break-keep py-2.5 pr-3 font-bold text-navy-700">{v.vehicleName}</td>
                        {v.byWeekday.map((w) => (
                          <td
                            key={w.weekday}
                            data-ax-veh-day={`${v.vehicleId}.${w.weekday}`}
                            className="py-2.5 pr-2 text-center tabular-nums"
                          >
                            {w.days < 2 ? (
                              <span className="t-muted text-navy-300">·</span>
                            ) : (
                              <span className="t-body text-navy-800">
                                {w.max}
                                <span className="t-muted text-navy-400"> / {w.avg}</span>
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="t-muted mt-2.5 break-keep text-navy-400">
              읽는 법 · <b className="text-navy-600">예전 최대 / 요즘 평균</b> (곳). 「·」는 그 요일에 두 번 넘게 나간
              기록이 아직 없다는 뜻입니다.
            </p>
          </div>
        )}

        {e.capacity.byDriver.length > 0 && (
          <div data-ax-drivers className="card mt-3 divide-y divide-navy-50">
            <p className="t-card px-4 py-3 font-extrabold text-navy-900">기사별 처리건수</p>
            {e.capacity.byDriver.map((d) => (
              <div key={d.name} data-ax-driver={d.name} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3">
                <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">{d.name}</span>
                <b className="t-body shrink-0 tabular-nums text-navy-900">{d.visits}건</b>
                <span className="t-muted shrink-0 text-navy-400">{d.days}일 나감</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
