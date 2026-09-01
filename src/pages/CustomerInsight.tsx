import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ChevronRight, Info } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, EmptyState, FilterChip } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { LoadGate } from '../components/LoadState'
import { allCustomerHealth, opsSuggestions, type HealthGrade } from '../lib/customerHealth'
import { AiButton } from '../components/AiAction'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 인사이트 (0083)
//
//  대표님: 「각 거래처를 단순 거래처 목록이 아니라 관리해야 할 고객 자산으로
//  볼 수 있도록 한다.」
//
//  ── 여기서 지키는 것 ──────────────────────────────────────────────────────
//
//  ⚠ **AI 가 아닙니다.** 대표님: 「AI가 실제 분석하지 않았는데 "AI가
//    분석했다"고 과장하지 않는다.」 그래서 화면 어디에도 AI 라고 적지
//    않았고, 등급마다 **무엇을 보고 그렇게 판단했는지** 그대로 폅니다.
//    근거를 못 대는 제안은 아예 만들지 않았습니다.
//
//  ⚠ **없는 자료로 점수를 매기지 않습니다.** 잴 수 있었던 항목만으로
//    계산하고, 몇 개로 쟀는지 화면에 적습니다. 자료가 두 개뿐인 거래처를
//    100점 만점처럼 보여 주면 그 점수는 거짓말입니다.
// ─────────────────────────────────────────────────────────────────────────────

const GRADE_TONE: Record<HealthGrade, string> = {
  우수: 'bg-emerald-50 text-emerald-600',
  안정: 'bg-teal-50 text-teal-700',
  관심: 'bg-amber-50 text-amber-700',
  관리필요: 'bg-rose-50 text-rose-500',
}

const TONE_CHIP = {
  urgent: 'bg-rose-50 text-rose-500',
  watch: 'bg-amber-50 text-amber-700',
  good: 'bg-emerald-50 text-emerald-600',
} as const

const TONE_LABEL = { urgent: '먼저', watch: '확인', good: '좋음' } as const

type Tab = '전체' | HealthGrade

export function CustomerInsight() {
  const { data } = useData()
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<string | null>(null)

  const health = useMemo(() => allCustomerHealth(data), [data])
  const suggestions = useMemo(() => opsSuggestions(data), [data])

  const counts = useMemo(() => {
    const c: Record<HealthGrade, number> = { 우수: 0, 안정: 0, 관심: 0, 관리필요: 0 }
    for (const h of health) c[h.grade] += 1
    return c
  }, [health])

  const rows = tab === '전체' ? health : health.filter((h) => h.grade === tab)

  return (
    <PageShell>
      <PageHeader
        title="거래처 인사이트"
        subtitle="수거·정산·요청 기록을 정해 둔 규칙으로 정리했습니다 — 근거를 그대로 볼 수 있습니다"
        action={<AiButton id="churn" />}
      />

      {/*  ⚠ 「AI 가 분석했다」고 적지 않습니다. 규칙입니다. */}
      <p data-insight-basis className="t-muted flex items-start gap-2 break-keep rounded-2xl bg-navy-50 px-4 py-3.5 leading-snug">
        <Info size={18} strokeWidth={2.3} className="mt-0.5 shrink-0 text-navy-500" />
        <span>
          아래 등급은 <b className="text-navy-700">정해 둔 규칙</b>으로 계산한 값입니다. 최근 수거 ·
          배출량 추이 · 미수금 · 긴급수거 · 포털 이용 다섯 가지를 보며,
          <b className="text-navy-700"> 잴 수 있었던 항목만</b> 씁니다. 자료가 없는 항목은 점수에서
          빼고, 몇 개로 쟀는지 함께 적습니다.
        </span>
      </p>

      {health.length === 0 ? (
        <LoadGate
          loadingTitle="거래처를 불러오는 중입니다"
          empty={<EmptyState icon={Activity} title="등록된 거래처가 없습니다" subtitle="거래처를 등록하면 여기에 표시됩니다." />}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            {(['우수', '안정', '관심', '관리필요'] as HealthGrade[]).map((g) => (
              <button
                key={g}
                data-insight-count={g}
                onClick={() => setTab(tab === g ? '전체' : g)}
                className={`card kpi-box p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                  tab === g ? 'ring-2 ring-teal-500' : ''
                }`}
              >
                <p className="t-muted break-keep">{g}</p>
                <p className="t-stat mt-1.5 text-navy-900">{counts[g]}곳</p>
              </button>
            ))}
          </div>

          {/* ── 다음 조치 ─────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>다음 조치</SectionTitle>
            {suggestions.length === 0 ? (
              //  ⚠ 할 말이 없으면 없다고 합니다 — 채우려고 만들지 않습니다.
              <EmptyState
                icon={Activity}
                title="지금 손댈 곳이 없습니다"
                subtitle="수거·정산·요청 기록에서 눈에 띄는 신호가 없습니다."
              />
            ) : (
              <ul className="space-y-2.5">
                {suggestions.slice(0, 12).map((x, i) => (
                  <li key={`${x.clientId}-${i}`} data-insight-suggest={x.clientId}>
                    <Link
                      to={x.to}
                      className="card flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
                    >
                      <span className={`pill shrink-0 ${TONE_CHIP[x.tone]}`}>{TONE_LABEL[x.tone]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="t-body block break-keep font-extrabold text-navy-900">
                          {x.clientName} · {x.action}
                        </span>
                        {/*  ⚠ 근거를 **사실 그대로** 적습니다. */}
                        <span className="t-muted mt-1 block break-keep leading-snug">{x.because}</span>
                      </span>
                      <ChevronRight size={19} className="mt-1 shrink-0 text-navy-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── 거래처별 상태 ─────────────────────────────────────────────── */}
          <section>
            <SectionTitle
              action={
                tab !== '전체' ? (
                  <FilterChip active onClick={() => setTab('전체')}>전체 보기</FilterChip>
                ) : undefined
              }
            >
              거래처별 상태
            </SectionTitle>
            <ul className="space-y-2.5">
              {rows.map((h) => (
                <li key={h.clientId} data-insight-row={h.clientId} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Link
                      to={`/clients/${h.clientId}`}
                      className="t-card min-w-0 break-keep text-navy-900 hover:underline"
                    >
                      {h.clientName}
                    </Link>
                    <span className={`pill ${GRADE_TONE[h.grade]}`}>{h.grade}</span>
                    <span className="ml-auto shrink-0 text-[1.2rem] font-extrabold tabular-nums text-navy-900">
                      {h.score}점
                    </span>
                  </div>

                  {/*  ⚠ 몇 개로 쟀는지 **반드시** 적습니다. 두 개로 잰 100점과
                       다섯 개로 잰 100점은 다른 값입니다. */}
                  <p data-insight-measured={h.clientId} className="t-muted mt-1.5 break-keep">
                    {h.measured === 0
                      ? '아직 잴 수 있는 기록이 없습니다'
                      : `${h.total}가지 중 ${h.measured}가지로 계산`}
                  </p>

                  {h.risks.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {h.risks.map((r) => (
                        <li key={r} className="pill bg-rose-50 text-rose-500">{r}</li>
                      ))}
                    </ul>
                  )}

                  {h.reasons.length > 0 && (
                    <>
                      <button
                        data-insight-why={h.clientId}
                        onClick={() => setOpenId(openId === h.clientId ? null : h.clientId)}
                        className="btn-ghost mt-3 min-h-[44px]"
                      >
                        {openId === h.clientId ? '근거 접기' : '왜 이 등급인가'}
                      </button>
                      {openId === h.clientId && (
                        <ul data-insight-reasons={h.clientId} className="mt-2.5 divide-y divide-navy-50 rounded-2xl bg-navy-50 px-4">
                          {h.reasons.map((r) => (
                            <li key={r.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                              <span className="t-body min-w-0 break-keep font-extrabold text-navy-800">{r.label}</span>
                              <span className="t-muted min-w-0 flex-1 break-keep">{r.detail}</span>
                              <span className="shrink-0 tabular-nums font-extrabold text-navy-700">＋{r.points}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </PageShell>
  )
}
