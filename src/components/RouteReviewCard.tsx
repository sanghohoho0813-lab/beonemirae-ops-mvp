import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, ChevronDown, MapPin, MoveRight, Ruler } from 'lucide-react'
import { SectionTitle } from './ui'
import { reviewRoutes, MIN_GAP, type RouteReview, type VehicleSkew } from '../lib/routeEfficiency'
import type { AppData } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 동선 점검 — 화면
//
//  이 카드가 하는 말은 딱 하나입니다.
//
//    「이 차는 월요일에 5곳, 화요일에 1곳 갑니다. 이 병원은 남양주시이고,
//      화요일에도 같은 차가 남양주시 3곳을 갑니다.」
//
//  「몇 km 줄어듭니다」는 없습니다 — 좌표가 없어 계산할 수 없습니다.
//  그래서 화면에도 **무엇을 계산하지 않았는지**를 같이 적습니다. 그게
//  없으면 「추천했으니 계산했겠지」로 읽힙니다.
// ─────────────────────────────────────────────────────────────────────────────

function DayBar({ sk }: { sk: VehicleSkew }) {
  const max = Math.max(1, ...sk.days.map((d) => d.perDay))
  return (
    <div data-skew={sk.vehicleId} className="card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="t-body text-navy-900">{sk.vehicleName}</b>
        <span className="t-muted">{sk.driver}</span>
        {sk.gap >= MIN_GAP && (
          <span data-skew-flag={sk.vehicleId} className="pill bg-amber-100 text-amber-700">
            {sk.peak?.label}요일에 몰림
          </span>
        )}
      </div>

      {sk.blocked ? (
        //  기록이 없으면 0 이 아니라 「없다」고 말합니다. 0 곳으로 그리면
        //  「한가한 차」로 읽히고, 그 차에 일을 더 붙이게 됩니다.
        <p data-skew-blocked={sk.vehicleId} className="t-muted mt-2 break-keep">
          {sk.blocked}
        </p>
      ) : (
        <>
          <div className="mt-2.5 flex items-end gap-1.5">
            {sk.days.map((d) => (
              <div key={d.weekday} data-skew-day={`${sk.vehicleId}|${d.label}`} className="flex-1 text-center">
                <div className="flex h-16 items-end justify-center">
                  <div
                    className={`w-full rounded-t-md ${
                      d.weekday === sk.peak?.weekday
                        ? 'bg-amber-400'
                        : d.weekday === sk.light?.weekday
                          ? 'bg-teal-300'
                          : 'bg-navy-200'
                    }`}
                    style={{ height: `${Math.max(6, (d.perDay / max) * 100)}%` }}
                  />
                </div>
                <p className="t-caption mt-1 font-bold tabular-nums text-navy-700">{d.perDay}</p>
                <p className="t-caption text-navy-400">{d.label}</p>
              </div>
            ))}
          </div>
          <p className="t-caption mt-2 break-keep text-navy-500">
            최근 12주 <b className="text-navy-700">완료된 수거</b> 기준 · 그 요일 하루에 몇 곳 · 나가는 날 평균{' '}
            {sk.avgPerDay}곳
          </p>
        </>
      )}
    </div>
  )
}

export function RouteReviewCard({ data }: { data: AppData }) {
  const rv: RouteReview = reviewRoutes(data)
  const [openSkew, setOpenSkew] = useState(false)
  const [openSkip, setOpenSkip] = useState(false)
  const skewed = rv.skews.filter((s) => s.gap >= MIN_GAP)

  return (
    <section data-route-review>
      <SectionTitle hint="요일이 한쪽으로 몰리면 그날은 늦게 끝나고, 반대편 요일은 차가 비어 있는 채로 나갑니다.">
        동선 점검
      </SectionTitle>

      {/*  무엇을 계산하지 않았는지 — 맨 위에 둡니다.
           아래를 먼저 읽고 나면 「거리도 봤겠지」로 굳어집니다. */}
      <div data-route-limits className="card mb-3 border-navy-200 bg-navy-50 p-4">
        <div className="flex items-start gap-2.5">
          <Ruler size={18} className="mt-0.5 shrink-0 text-navy-400" />
          <div className="min-w-0">
            <p className="t-body break-keep font-bold text-navy-800">거리(km)와 소요시간은 계산하지 않았습니다</p>
            <p className="t-caption mt-1 break-keep leading-relaxed text-navy-600">
              거래처 좌표가 없어 실제로 계산할 방법이 없습니다. 지어낸 km 를 띄우면 그 숫자로 판단하시게 됩니다.
              이 화면이 말할 수 있는 것은 <b className="text-navy-800">「같은 차가 그날 이미 그 시군구에 간다」</b>
              까지입니다. 주소에 적힌 시군구로만 묶었고, 가까울 것 같다는 짐작은 넣지 않았습니다.
            </p>
          </div>
        </div>
      </div>

      {/* ── 옮길 수 있는 곳 ── */}
      {rv.suggestions.length === 0 ? (
        <div data-route-none className="card p-5">
          <p className="t-body break-keep font-bold text-navy-800">지금 옮기라고 할 만한 곳이 없습니다</p>
          <p className="t-caption mt-1.5 break-keep leading-relaxed text-navy-500">
            {skewed.length > 0
              ? `요일이 몰린 차량은 ${skewed.length}대 있지만, 옮길 요일에 같은 차가 같은 시군구를 가지 않거나 기록이 모자랍니다. ` +
                '근거가 없는데 옮기라고 하면 그 병원만 따로 가게 됩니다.'
              : '최근 12주 완료된 수거 기록에서 요일 쏠림이 크지 않습니다. 기록이 쌓이면 다시 봅니다.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rv.suggestions.map((s) => (
            <div key={`${s.vehicleId}|${s.clientId}`} data-route-move={s.clientId} className="card p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Link
                  to={`/clients/${s.clientId}`}
                  className="t-body break-keep font-extrabold text-navy-900 underline-offset-4 hover:underline"
                >
                  {s.clientName}
                </Link>
                <span className="pill bg-navy-50 text-navy-500">
                  <MapPin size={12} className="mr-0.5 inline -translate-y-px" />
                  {s.region}
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[0.98rem] font-bold text-teal-700">
                  {s.fromLabel}
                  <MoveRight size={13} />
                  {s.toLabel}
                </span>
                <span className="t-muted">{s.vehicleName}</span>
              </div>
              <p data-route-basis={s.clientId} className="t-caption mt-2 break-keep leading-relaxed text-navy-600">
                {s.basis}
              </p>
              <p className="t-caption mt-2 break-keep text-navy-400">
                옮기는 것은 <Link to="/plan" className="font-bold text-teal-700 underline underline-offset-2">일정 편성</Link>
                에서 하십니다 — 이 화면은 아무것도 바꾸지 않습니다.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── 뺀 것들 ── */}
      {rv.skipped.length > 0 && (
        <div className="mt-3">
          <button
            data-route-skip-toggle
            onClick={() => setOpenSkip((v) => !v)}
            className="flex w-full items-center gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-card"
          >
            <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">
              검토했지만 제안하지 않은 곳 {rv.skipped.length}곳
            </span>
            <ChevronDown size={17} className={`shrink-0 text-navy-300 transition-transform ${openSkip ? 'rotate-180' : ''}`} />
          </button>
          {openSkip && (
            <ul data-route-skipped className="mt-2 flex flex-col gap-1.5">
              {rv.skipped.map((s, i) => (
                <li key={`${s.clientName}|${i}`} className="rounded-xl bg-navy-50 px-3.5 py-2.5">
                  <b className="t-caption text-navy-800">{s.clientName}</b>
                  <span className="t-caption break-keep text-navy-500"> — {s.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*  ⚠ 이 줄은 위 「뺀 곳」 안에 있었습니다. 그런데 주소가 **전부**
           비어 있으면 뺀 곳 목록 자체가 비어서, 정작 가장 필요한 이 말이
           사라졌습니다 — 화면은 그냥 「제안할 게 없습니다」만 하고
           주소를 넣으면 된다는 것을 알려 주지 못했습니다. 따로 뺐습니다. */}
      {rv.noAddress > 0 && (
        <p data-route-noaddress className="t-caption mt-3 break-keep text-navy-500">
          주소를 읽지 못해 검토조차 못 한 거래처가 {rv.noAddress}곳 있습니다 — 거래처 정보에 주소를 넣어 주시면 같이
          봅니다.
        </p>
      )}

      {/* ── 요일별 부하 ── */}
      <button
        data-route-skew-toggle
        onClick={() => setOpenSkew((v) => !v)}
        className="mt-3 flex w-full items-center gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-card"
      >
        <CalendarRange size={17} className="shrink-0 text-navy-400" />
        <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-700">
          차량별 요일 부하 보기
          {skewed.length > 0 && <span className="text-amber-700"> · 몰린 차량 {skewed.length}대</span>}
        </span>
        <ChevronDown size={17} className={`shrink-0 text-navy-300 transition-transform ${openSkew ? 'rotate-180' : ''}`} />
      </button>
      {openSkew && (
        <div className="mt-2 grid gap-2.5 xl:grid-cols-2 xl:items-start">
          {rv.skews.map((sk) => (
            <DayBar key={sk.vehicleId} sk={sk} />
          ))}
        </div>
      )}
    </section>
  )
}
