import { useMemo } from 'react'
import { ClipboardList } from 'lucide-react'
import {
  SURVEY_ON_TIME_PCT,
  SURVEY_ON_TIME_QUOTE,
  SURVEY_SOURCE,
  SURVEY_TAKEN_ON,
  SURVEY_TASKS,
  SURVEY_VEHICLES,
  WEEKDAYS,
  activeDays,
  surveyTotals,
} from '../lib/opsSurvey'

// ─────────────────────────────────────────────────────────────────────────────
// 도입 전 실제 업무 조사
//
//  「도입 전에는 이랬습니다」를 말하려면 그 이랬다는 것이 어디서 온 숫자인지
//  댈 수 있어야 합니다. 지금까지는 댈 것이 없었습니다.
//
//  이 칸은 이사님이 적어 주신 표를 **그대로** 보여 줍니다. 빈 칸은 그날 그
//  차가 안 나간 것이라 비워 둡니다 — 0 으로 채우면 「나갔는데 한 곳도 못
//  갔다」가 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function OpsSurveyCard() {
  const t = useMemo(() => surveyTotals(), [])

  return (
    <section data-ops-survey>
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="t-card flex items-center gap-2 font-extrabold text-navy-900">
              <ClipboardList size={18} strokeWidth={2.4} className="text-navy-400" />
              도입 전 실제 업무 (조사 답변)
            </p>
            <p className="t-muted mt-0.5 break-keep">
              {SURVEY_SOURCE} · {SURVEY_TAKEN_ON}
            </p>
          </div>
          <span className="pill bg-teal-50 text-teal-700">실제 답변 그대로</span>
        </div>

        {/* ── 한눈에 ─────────────────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-navy-100 sm:grid-cols-4">
          {[
            { label: '한 주 방문', value: `${t.weekVisits}곳`, sub: `차량 ${SURVEY_VEHICLES.length}대` },
            { label: '한 주 이동', value: `${t.weekKm.toLocaleString('ko-KR')}km`, sub: `한 대 하루 ${t.kmPerVehicleDay}km` },
            { label: '평일 하루 방문', value: `${t.weekdayAvgVisits}곳`, sub: '월~금 평균' },
            {
              label: '하루 사무 시간',
              value: `${t.dailyAdminMinH}~${t.dailyAdminMaxH}h`,
              sub: `월 ${t.monthlyAdminMinH}~${t.monthlyAdminMaxH}시간`,
            },
          ].map((c) => (
            <div key={c.label} data-survey-kpi={c.label} className="bg-white px-3 py-3.5 text-center">
              <p className="t-label text-navy-500">{c.label}</p>
              <p className="t-stat mt-1 tabular-nums text-navy-900">{c.value}</p>
              <p className="t-muted mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ── 차량별 표 ──────────────────────────────────────────────────── */}
        <p className="t-label mt-5 text-navy-500">차량별 하루 방문 개수 · 이동거리</p>
        <div className="mt-1.5 overflow-x-auto">
          <table data-survey-table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-navy-100">
                <th className="t-label py-2 pr-2 font-bold text-navy-500">차량</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="t-label py-2 pr-2 text-right font-bold text-navy-500">
                    {d}
                  </th>
                ))}
                <th className="t-label py-2 text-right font-bold text-navy-500">주간 합</th>
              </tr>
            </thead>
            <tbody>
              {SURVEY_VEHICLES.map((v) => {
                const sum = WEEKDAYS.reduce((s, d) => s + (v.visits[d] ?? 0), 0)
                const km = WEEKDAYS.reduce((s, d) => s + (v.km[d] ?? 0), 0)
                return (
                  <tr key={v.no} data-survey-row={v.no} className="border-b border-navy-50 align-top">
                    <td className="py-2 pr-2">
                      <b className="t-cell text-navy-800">{v.no}</b>
                      <span className="t-muted ml-1">{v.tonnage}</span>
                      <span className="t-muted mt-0.5 block">{v.waste}</span>
                      <span className="t-muted block">주 {activeDays(v)}일 운행</span>
                    </td>
                    {WEEKDAYS.map((d) => (
                      <td key={d} className="py-2 pr-2 text-right">
                        {v.visits[d] == null ? (
                          //  안 나간 날. 0 이 아니라 「—」입니다.
                          <span className="t-muted">—</span>
                        ) : (
                          <>
                            <b className="t-cell tabular-nums text-navy-900">{v.visits[d]}곳</b>
                            <span className="t-muted block tabular-nums">{v.km[d]}km</span>
                          </>
                        )}
                      </td>
                    ))}
                    <td className="py-2 text-right">
                      <b className="t-cell tabular-nums text-navy-900">{sum}곳</b>
                      <span className="t-muted block tabular-nums">{km.toLocaleString('ko-KR')}km</span>
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td className="py-2 pr-2">
                  <b className="t-cell text-navy-800">회사 전체</b>
                </td>
                {t.byDay.map((d) => (
                  <td key={d.day} className="py-2 pr-2 text-right">
                    <b className="t-cell tabular-nums text-navy-900">{d.visits}곳</b>
                    <span className="t-muted block tabular-nums">{d.km}km</span>
                  </td>
                ))}
                <td className="py-2 text-right">
                  <b className="t-cell tabular-nums text-navy-900">{t.weekVisits}곳</b>
                  <span className="t-muted block tabular-nums">{t.weekKm.toLocaleString('ko-KR')}km</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="t-muted mt-1.5 break-keep">
          빈 칸(—)은 <b className="text-navy-600">그날 그 차가 안 나간 것</b>입니다. 0 으로 채우면 「나갔는데 한 곳도 못
          갔다」는 뜻이 되어 평균이 틀립니다.
        </p>

        {/* ── 사람이 붙잡고 있던 시간 ────────────────────────────────────── */}
        <p className="t-label mt-5 text-navy-500">하루에 사람이 붙잡고 있던 시간</p>
        <ul data-survey-tasks className="mt-1.5 flex flex-col gap-1.5">
          {SURVEY_TASKS.map((task) => (
            <li key={task.label} className="rounded-xl bg-navy-50/60 px-3.5 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <b className="t-body text-navy-900">{task.label}</b>
                <span className="t-cell tabular-nums text-navy-700">
                  하루 {task.minH === task.maxH ? `${task.minH}시간` : `${Math.round(task.minH * 60)}~${Math.round(task.maxH * 60)}분`}
                </span>
              </div>
              <p className="t-muted mt-0.5 break-keep">「{task.quote}」</p>
            </li>
          ))}
        </ul>
        <p className="t-muted mt-2 break-keep">
          합치면 하루 <b className="text-navy-600">{t.dailyAdminMinH}~{t.dailyAdminMaxH}시간</b>, 주 6일 기준으로 한 달{' '}
          <b className="text-navy-600">{t.monthlyAdminMinH}~{t.monthlyAdminMaxH}시간</b>입니다.
        </p>

        {/* ── 당일 소화율 ───────────────────────────────────────────────── */}
        <div className="mt-4 rounded-2xl bg-emerald-50/70 px-3.5 py-3">
          <p className="t-body font-extrabold text-emerald-800">
            당일수거 정상 완료 {SURVEY_ON_TIME_PCT}%
          </p>
          <p className="t-muted mt-0.5 break-keep text-emerald-800/80">「{SURVEY_ON_TIME_QUOTE}」</p>
          <p className="t-muted mt-1.5 break-keep">
            이미 높습니다. <b className="text-navy-600">이 시스템이 여기서 더 올릴 여지는 크지 않습니다</b> — 줄일 수
            있는 것은 위의 사무 시간과 반복 입력입니다. 그것을 성과로 잽니다.
          </p>
        </div>
      </div>
    </section>
  )
}
