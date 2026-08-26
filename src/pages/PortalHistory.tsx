import { useMemo, useState } from 'react'
import { CLIENT_TEL } from '../lib/brand'
import { Hospital, ClipboardList, Search } from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { PageShell, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { collectionHistory } from '../lib/ops'
import { prettyDate, weight, today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 수거 이력
//
//  병원이 인증·실사 때 매번 비원미래에 전화해서 받던 자료를 직접 확인할 수
//  있게 합니다. 내부 배차·차량 정보는 보여주지 않고, 병원에 필요한 항목만
//  (날짜 · 구분 · 배출량 · 용기 · 인계 여부) 남깁니다.
//
//  ⚠ 0086 — **기간을 고를 수 있게 했습니다.** 예전에는 「최근 40건」 고정이라,
//    인증 심사에서 「2025년 전체를 주세요」라고 하면 이 화면으로는 못 냈습니다.
//    결국 전화해서 받아야 했고, 이 화면을 만든 이유가 없어집니다.
//
//  ⚠ 고를 수 있는 연도는 **실제 기록이 있는 해**만 만듭니다. 올해부터 5년치를
//    미리 늘어놓으면 병원이 눌러 보고 빈 화면을 보게 되는데, 그때 병원은
//    「자료가 없다」가 아니라 「고장났다」로 읽습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalHistory() {
  const { data } = useData()
  //  ⚠ 0085 — 「어느 병원인가」는 한 곳에서 정합니다(lib/portalClient.ts).
  //    예전의 `data.clients[0]` 은 직원 계정에서 **첫 병원**을 골랐습니다.
  const { client } = usePortalClient()

  //  ⚠ 한도를 크게 잡습니다. 인증·실사는 **연 단위**로 묻습니다.
  //    주 2회 × 5년 = 520건 정도이므로 이 정도면 잘리지 않습니다.
  const rows = useMemo(() => (client ? collectionHistory(data, client.id, 2000) : []), [data, client])
  const all = useMemo(() => rows.filter((r) => r.amountKg != null), [rows])

  //  ── 고를 수 있는 기간 — **기록이 있는 해만** ──────────────────────────
  const years = useMemo(
    () => [...new Set(all.map((r) => r.date.slice(0, 4)))].sort().reverse(),
    [all],
  )
  //  ⚠ 폐기물 유형도 **실제로 나온 값만** 고르게 합니다. 「일회용기저귀」를
  //    안 하는 병원에 그 단추를 띄우면 눌러 보고 빈 화면이 됩니다.
  const types = useMemo(
    () => [...new Set(all.map((r) => r.wasteType))].filter(Boolean).sort(),
    [all],
  )

  const [period, setPeriod] = useState<string>('recent')
  const [type, setType] = useState<string>('all')
  const [q, setQ] = useState('')

  const done = useMemo(() => {
    const t = today()
    const from3 = new Date(t)
    from3.setMonth(from3.getMonth() - 3)
    const cut = from3.toISOString().slice(0, 10)
    return all.filter((r) => {
      if (period === 'recent' && r.date < cut) return false
      if (period !== 'recent' && period !== 'all' && !r.date.startsWith(period)) return false
      if (type !== 'all' && r.wasteType !== type) return false
      if (q.trim()) {
        const hay = `${prettyDate(r.date)} ${r.date} ${r.wasteType} ${r.containerType ?? ''}`
        if (!hay.includes(q.trim())) return false
      }
      return true
    })
  }, [all, period, type, q])

  //  ⚠ 합계는 **고른 기간의 합**입니다. 인증 서류에 그대로 옮겨 적는 숫자라
  //    화면에 보이는 줄과 반드시 같은 값이어야 합니다.
  const totalKg = done.reduce((a, r) => a + (r.amountKg ?? 0), 0)

  if (!client) {
    return (
      <PageShell>
        <LoadGate
          loadingTitle="병원 정보를 불러오는 중입니다"
          empty={<EmptyState icon={Hospital} title="연결된 병원 정보를 찾을 수 없습니다" />}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div>
        <h1 className="t-page text-navy-900">수거 이력</h1>
        <p className="t-body mt-2.5 break-keep font-medium text-navy-400">
          {client.name} · 인증·실사 자료로 그대로 쓰실 수 있습니다
        </p>
      </div>

      {/*  ── 기간 · 구분 · 찾기 (0086) ────────────────────────────────────────
           ⚠ 「전체」를 기본값으로 두지 않습니다. 5년치를 처음부터 그리면
             폰에서 첫 화면이 한참 늦게 뜹니다. 기본은 최근 3개월이고,
             더 필요하면 눌러서 넓힙니다.

           ⚠ **폰에서는 단추가 아니라 고르는 칸(select)입니다.**
             처음에는 폰에서도 단추를 늘어놓았는데, 여섯 개가 한 줄에 안
             들어가 옆으로 48px 이 잘렸습니다. 잘린 쪽에 있던 것이 하필
             「전체」였습니다 — 인증·실사에서 제일 많이 쓰는 그 단추를
             병원이 **못 찾습니다.** 줄바꿈을 시키면 이 칸만 384px 이 되어
             정작 첫 수거 기록이 화면 밖으로 밀립니다(390×844 실측).
             고르는 칸은 한 줄이면서 목록을 다 보여 줍니다.
             넓은 화면에서는 단추 그대로입니다 — 한눈에 다 보이고,
             한 번에 눌러집니다. */}
      <div data-hist-filter className="card space-y-2.5 p-4">
        {/*  폰 — 고르는 칸 */}
        <div className="flex flex-wrap gap-2.5 sm:hidden">
          <label className="min-w-0 flex-1">
            <span className="t-label block text-navy-400">기간</span>
            <select
              data-hist-period-select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="field-input mt-1 w-full"
            >
              <option value="recent">최근 3개월</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
              <option value="all">전체</option>
            </select>
          </label>
          {types.length > 1 && (
            <label className="min-w-0 flex-1">
              <span className="t-label block text-navy-400">구분</span>
              <select
                data-hist-type-select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="field-input mt-1 w-full"
              >
                <option value="all">전부</option>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/*  넓은 화면 — 단추 */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <span className="t-label shrink-0 text-navy-400">기간</span>
          {[{ v: 'recent', l: '최근 3개월' }, ...years.map((y) => ({ v: y, l: `${y}년` })), { v: 'all', l: '전체' }].map((o) => (
            <button
              key={o.v}
              data-hist-period={o.v}
              onClick={() => setPeriod(o.v)}
              className={`min-h-[2.75rem] shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[1.02rem] font-bold transition ${
                period === o.v ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>

        {types.length > 1 && (
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <span className="t-label shrink-0 text-navy-400">구분</span>
            {[{ v: 'all', l: '전부' }, ...types.map((t) => ({ v: t, l: t }))].map((o) => (
              <button
                key={o.v}
                data-hist-type={o.v}
                onClick={() => setType(o.v)}
                className={`min-h-[2.75rem] shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[1.02rem] font-bold transition ${
                  type === o.v ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/*  ⚠ 높이는 **바깥 상자가 아니라 글자칸 자체**에 줍니다. 처음에는
               label 에만 padding 을 줬는데 정작 눌리는 곳(input)은 26px 이라
               커서를 놓치면 옆을 눌러 놓고 왜 안 써지나 하게 됩니다.
               (check_ux390 이 「보통」과 「큰 글씨」 두 곳에서 잡았습니다) */}
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-navy-50 px-3.5">
            <Search size={18} className="shrink-0 text-navy-400" strokeWidth={2.4} />
            <input
              data-hist-search
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="날짜·구분·용기로 찾기 (예: 8월 21일)"
              className="t-body min-h-[2.75rem] min-w-0 flex-1 bg-transparent font-medium text-navy-900 outline-none placeholder:text-navy-400"
            />
          </label>
          {/*  ⚠ 고른 기간의 **합계**. 화면에 보이는 줄만 셉니다. */}
          <p data-hist-total className="t-body shrink-0 break-keep font-extrabold text-navy-900">
            {done.length}건 · {weight(totalKg)}
          </p>
        </div>
      </div>

      {done.length === 0 ? (
        <LoadGate
          loadingTitle="수거 이력을 불러오는 중입니다"
          empty={
            <EmptyState
              icon={ClipboardList}
              title={all.length === 0 ? '아직 수거 기록이 없습니다' : '고르신 조건에 맞는 기록이 없습니다'}
              subtitle={
                all.length === 0
                  ? '첫 수거가 완료되면 여기에 표시됩니다.'
                  : '기간을 「전체」로 바꾸거나 찾는 말을 지워 보세요.'
              }
            />
          }
        />
      ) : (
        <>
        {/*  ── 폰에서는 표 대신 카드 ───────────────────────────────────────
             표가 640px 인데 폰의 칸은 354px 입니다 — **가로로 286px 밀렸습니다.**
             병원 담당자는 「용기」와 「처리장 인계」를 보려고 옆으로 밀어야
             했고, 밀 수 있다는 표시도 없었습니다. 인증·실사 때 쓰는 자료라
             안 보이면 결국 전화를 겁니다.
             넓은 화면은 표 그대로입니다 — 여러 줄을 한눈에 견주는 데는 표가
             낫습니다. */}
        <div data-portal-hist-cards className="card divide-y divide-navy-50 sm:hidden">
          {done.map((r) => (
            <div key={r.id} data-portal-hist-card={r.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <b className="t-body break-keep text-navy-900">{prettyDate(r.date)}</b>
                <span className="t-muted text-navy-500">{r.wasteType}</span>
                <span
                  data-portal-hist-handover={r.id}
                  className={`pill ml-auto shrink-0 ${r.handedOver ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}
                >
                  {r.handedOver ? '인계 완료' : (r.handoverStatus ?? '처리 중')}
                </span>
              </div>
              <p className="t-card mt-1 break-keep text-navy-900">{weight(r.amountKg ?? 0)}</p>
              {/*  ⚠ 용기를 **안 적었으면 「미기재」**입니다. 0 으로 채우지
                   않습니다 — 「안 적었다」와 「0개였다」는 다른 말이고,
                   병원은 이 숫자를 사실로 읽습니다.
                   예전에는 여기가 그냥 「개」 한 글자만 떠 있었습니다. */}
              <p className="t-muted mt-0.5 break-keep text-navy-500">
                {r.containerType
                  ? `용기 ${r.containerType}${r.containerCount != null ? ` (${r.containerCount}개)` : ''}`
                  : '용기 미기재'}
              </p>
            </div>
          ))}
        </div>

        <div className="card hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-navy-100">
                {['수거일', '구분', '배출량', '용기', '처리장 인계'].map((h) => (
                  <th key={h} className="t-label whitespace-nowrap px-4 py-3.5 text-navy-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {done.map((r) => (
                <tr key={r.id} className="border-b border-navy-50 last:border-0">
                  <td className="t-cell whitespace-nowrap px-4 py-3.5 font-bold text-navy-900">
                    {prettyDate(r.date)}
                  </td>
                  <td className="t-cell px-4 py-3.5 text-navy-600">{r.wasteType}</td>
                  <td className="t-cell whitespace-nowrap px-4 py-3.5 font-bold text-navy-900">
                    {weight(r.amountKg ?? 0)}
                  </td>
                  <td className="t-cell px-4 py-3.5 text-navy-600">
                    {r.containerType
                      ? `${r.containerType}${r.containerCount != null ? ` ${r.containerCount}개` : ''}`
                      : '미기재'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`pill ${r.handedOver ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}>
                      {r.handedOver ? '인계 완료' : (r.handoverStatus ?? '처리 중')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <p className="t-muted break-keep">
        수거대장 PDF 자동 발급과 올바로 시스템 연동은 개발 예정입니다. 지금 필요하시면 담당자({CLIENT_TEL})에게
        요청해 주세요.
      </p>
    </PageShell>
  )
}
