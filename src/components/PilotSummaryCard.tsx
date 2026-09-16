import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, FlaskConical } from 'lucide-react'
import { useData } from '../context/DataContext'
import { pilotEvidence, type Provenance } from '../lib/pilotEvidence'
import { PILOT_RECOMMENDED } from '../lib/pilotClients'
import { prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Pilot 실제 기록 — 카드 한 장 (0122 · 기간 표기 0123, 관리자용)
//
//  숫자는 전부 건수·명수·날짜입니다. 「몇 % 향상」·「월 환산」은 없습니다.
//  줄마다 어디서 나온 값인지(출처)를 적습니다 — 시스템 기록과 사람 피드백을
//  섞지 않기 위해서입니다.
// ─────────────────────────────────────────────────────────────────────────────

function Src({ p }: { p: Provenance | 'SETTINGS' }) {
  return <span className="ml-1 rounded-md bg-navy-100 px-1.5 py-0.5 text-[0.78rem] font-bold tracking-wide text-navy-500">{p}</span>
}

export function PilotSummaryCard() {
  const { data } = useData()
  const ev = useMemo(() => pilotEvidence(data), [data])
  const [open, setOpen] = useState(false)

  //  ⚠ 「1주」처럼 고정된 말을 쓰지 않습니다 (0123). 기간은 Pilot 시작일에서
  //    그대로 계산해 적습니다 — 19일치를 「1주」라고 부르면 그 자체가 과장입니다.
  const short = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${Number(m)}/${Number(d)}`
  }
  const periodLabel = ev.startUnset
    ? '시작일 미설정 — 오늘 하루만'
    : `${short(ev.period.from)}~현재 · ${ev.period.days}일`

  const tiles: { key: string; label: string; value: string; src: Provenance | 'SETTINGS' }[] = [
    { key: 'clients', label: 'Pilot 거래처', value: `${ev.clients.length}곳`, src: ev.provenance.clients },
    { key: 'entered', label: '수거 입력', value: `${ev.collections.entered}건`, src: ev.provenance.collections },
    { key: 'used', label: '자재사용 기록', value: `${ev.materials.usedRecords}건`, src: ev.provenance.materials },
    { key: 'users', label: '실사용자', value: `${ev.collections.byUser.length}명`, src: ev.provenance.collections },
    { key: 'portal', label: 'Portal 요청', value: `${ev.portal.requests}건`, src: ev.provenance.portal },
  ]

  return (
    <section data-pilot-summary className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical size={20} className="shrink-0 text-violet-600" strokeWidth={2.3} />
        <p className="t-card text-navy-900">Pilot 실제 기록</p>
        <span
          data-pilot-period
          className="rounded-lg bg-violet-50 px-2 py-0.5 text-[0.85rem] font-extrabold text-violet-700"
        >
          {periodLabel}
        </span>
        {/*  기존 실증 시작일(성과 화면이 쓰는 값)과 다른 날짜라는 것을 적어 둡니다 —
             두 숫자가 달라 보일 때 「어느 날부터 센 건가」를 여기서 알 수 있게. */}
        <span className="t-muted ml-auto break-keep">
          {ev.startUnset ? 'Pilot 시작일이 설정되지 않았습니다' : `${prettyDate(ev.period.from)}부터 · 기존 실증 시작일과 별개로 셉니다`}
        </span>
      </div>

      {ev.columnMissing && (
        <p data-pilot-summary-note className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[0.98rem] font-semibold text-amber-700">
          Pilot 거래처 칸이 아직 없습니다 — PROPOSAL_0122_pilot_clients.sql 을 실행한 뒤 거래처 관리에서 켜 주세요.
        </p>
      )}
      {!ev.columnMissing && ev.clients.length === 0 && (
        <p data-pilot-summary-note className="mt-3 rounded-xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] font-semibold text-navy-500">
          Pilot 거래처가 아직 없습니다 — <Link to="/clients" className="underline">거래처 관리</Link>에서 5~{PILOT_RECOMMENDED}곳을 켜 주세요.
        </p>
      )}
      {ev.startUnset && (
        <p data-pilot-summary-start className="mt-3 rounded-xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] font-semibold text-navy-500">
          Pilot 시작일이 비어 있어 오늘 하루만 셉니다 — <Link to="/settings" className="underline">설정 · Pilot 시작일</Link>에 넣어 주세요.
          PROPOSAL_0123_pilot_start.sql 을 아직 안 돌리셨다면 그 뒤에 넣을 수 있습니다. (기존 「실증 시작일」은 성과 화면이 쓰는 다른 값입니다)
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.key} data-pilot-tile={t.key} className="rounded-2xl bg-navy-50 px-4 py-3.5">
            <p className="t-muted font-bold">{t.label}</p>
            <p className="t-kpi-sm mt-1 whitespace-nowrap tabular-nums text-navy-900">{t.value}</p>
            <p className="mt-1.5">
              <Src p={t.src} />
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        data-pilot-detail-toggle
        onClick={() => setOpen((v) => !v)}
        className="mt-4 flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-2xl bg-navy-50 text-[1.02rem] font-bold text-navy-600 transition hover:bg-navy-100"
      >
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {open ? '접기' : '상세 보기'}
      </button>

      {open && (
        <div data-pilot-detail className="mt-4 space-y-4 text-[0.98rem] text-navy-700">
          {/* CORE KPI — 건수만 */}
          <div>
            <p className="t-label mb-1.5 text-navy-500">CORE KPI — 건수만 적습니다</p>
            <ul className="space-y-1.5">
              <li data-kpi="ax-count">
                <b>AX 수거 처리건수</b> {ev.collections.entered}건 · 입력 있던 날 {ev.collections.days}일
                {ev.collections.lastAt && ` · 마지막 ${prettyDate(ev.collections.lastAt.slice(0, 10))}`}
                <Src p={ev.provenance.collections} />
              </li>
              <li data-kpi="used-rate">
                <b>자재사용 기록률</b> {ev.materials.usedRecords} / {ev.materials.ofRecords}건 (규격별로 적힌 수거 / Pilot 완료 수거)
                <Src p={ev.provenance.materials} />
              </li>
              <li data-kpi="users">
                <b>직원 사용</b> {ev.collections.byUser.length}명
                {ev.collections.byUser.length > 0 && ` — ${ev.collections.byUser.map((u) => `${u.name} ${u.count}건`).join(' · ')}`}
                <Src p={ev.provenance.collections} />
              </li>
              <li data-kpi="coverage">
                <b>거래처 Coverage</b> {ev.coverage.withInput} / {ev.coverage.pilot}곳 (기간 안 입력이 1건 이상인 Pilot 거래처)
                <Src p={ev.provenance.coverage} />
              </li>
              <li data-kpi="portal">
                <b>Portal Self-Service</b> 요청 {ev.portal.requests}건 · 처리 {ev.portal.handled}건 · 병원 {ev.portal.clients}곳
                <Src p={ev.provenance.portal} />
              </li>
              {/*  ⚠ 「재입력」이라고 부르지 않습니다 — 취소된 입력을 셀 뿐,
                   그 뒤 다시 들어왔는지는 확인하지 않습니다 (0122 검토). */}
              <li data-kpi="reentry">
                <b>입력 정정 기록</b> 취소된 입력 {ev.reentry.reverted}건 / 전체 입력 {ev.reentry.entered}건
                <Src p={ev.provenance.reentry} />
              </li>
              <li data-kpi="linked">
                <b>Data Connection</b> 입력 → 수거이력·거래처 화면 연결 {ev.collections.linked} / {ev.collections.entered}건
                <Src p={ev.provenance.collections} />
              </li>
            </ul>
          </div>

          {/* 거래처별 */}
          {ev.clients.length > 0 && (
            <div>
              <p className="t-label mb-1.5 text-navy-500">거래처별 수거 입력</p>
              <ul className="flex flex-wrap gap-1.5">
                {ev.clients.map((c) => (
                  <li key={c.id} data-pilot-client={c.id} className="rounded-lg bg-navy-50 px-2.5 py-1 font-semibold">
                    {c.name} <span className="tabular-nums text-navy-500">{c.entered}건</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 자재 규격별 */}
          {ev.materials.byItem.length > 0 && (
            <div>
              <p className="t-label mb-1.5 text-navy-500">
                자재 — 규격별 확인된 사용 / 공급 <Src p={ev.provenance.materials} />
              </p>
              <ul className="space-y-1">
                {ev.materials.byItem.map((it) => (
                  <li key={it.key} data-pilot-item={it.key} className="flex items-center justify-between rounded-lg bg-navy-50 px-2.5 py-1.5">
                    <span className="font-semibold">{it.label}</span>
                    <span className="tabular-nums text-navy-600">
                      사용 확인 {it.used}개 · 공급 {it.supplied}개
                    </span>
                  </li>
                ))}
              </ul>
              <p className="t-caption mt-1 text-navy-500">공급 − 확인된 사용은 남은 개수가 아닙니다 — 규격별로 적지 않은 수거는 미확인입니다.</p>
            </div>
          )}

          {/* 제외 */}
          <p data-pilot-excluded className="t-caption text-navy-500">
            세지 않은 것 — 시연 {ev.excluded.demo}건 · 시작일 이전 {ev.excluded.practice}건 · 취소 {ev.excluded.reverted}건 · Pilot 외 거래처 {ev.excluded.nonPilot}건
          </p>

          {/* BASELINE */}
          <div>
            <p className="t-label mb-1.5 text-navy-500">
              자동으로 재지 못하는 것 — 기준값 <Src p="SETTINGS" />
            </p>
            <ul className="space-y-1">
              {ev.baseline.map((b) => (
                <li key={b.key} data-baseline={b.key} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 px-2.5 py-1.5">
                  <span className="break-keep">{b.label}</span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.82rem] font-extrabold ${
                      b.status === 'KNOWN' ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'
                    }`}
                  >
                    BASELINE {b.status}
                    {b.value ? ` · ${b.value}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="t-caption mt-1 text-navy-500">UNKNOWN 은 비워 둡니다 — 값을 지어내지 않습니다. 설정 · 도입 전 기준값에서 실측을 넣으면 KNOWN 이 됩니다.</p>
          </div>

          <p className="t-caption text-navy-500">
            {ev.feedback.note} <Src p="USER FEEDBACK" />
          </p>
        </div>
      )}
    </section>
  )
}
