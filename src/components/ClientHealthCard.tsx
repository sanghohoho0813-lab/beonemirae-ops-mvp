import { useMemo, useState } from 'react'
import { Activity, ChevronRight, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { customerHealth, opsSuggestions, type HealthGrade } from '../lib/customerHealth'
import { buildClientBrief } from '../lib/clientBrief'
import { prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 상세의 「고객 인사이트」 (0083)
//
//  대표님: 「기존 거래처 상세 페이지가 있다면 전면 재구축하지 말고 아래
//  정보를 추가한다 — 고객 활동 · 건강도 · 위험 신호 · 추천 행동.
//  ⚠ 실제 데이터를 확보할 수 있는 항목만 사용한다.」
//
//  ⚠ 그래서 「최근 리포트 확인 여부」는 **안 넣었습니다.** 병원이 리포트를
//    열어 봤는지는 지금 어디에도 안 남습니다. 화면에 칸만 만들어 두면
//    비어 있거나, 더 나쁘게는 그럴듯한 값이 들어갑니다.
//
//  ⚠ 「최근 포털 접속」은 **실제로 남기기 시작했습니다**(0083 의
//    last_portal_seen_at). 다만 그 값은 병원이 포털을 연 뒤부터 생기므로,
//    없으면 「아직 기록 없음」이라고 그대로 적습니다.
// ─────────────────────────────────────────────────────────────────────────────

const GRADE_TONE: Record<HealthGrade, string> = {
  우수: 'bg-emerald-50 text-emerald-600',
  안정: 'bg-teal-50 text-teal-700',
  관심: 'bg-amber-50 text-amber-700',
  관리필요: 'bg-rose-50 text-rose-500',
}

export function ClientHealthCard({ clientId }: { clientId: string }) {
  const { data } = useData()
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState<string | null>(null)
  //  폰에서는 접힌 채로 시작합니다 (넓은 화면에서는 CSS 가 항상 폅니다).
  const [body, setBody] = useState(false)
  const client = data.clients.find((c) => c.id === clientId)

  const h = useMemo(() => (client ? customerHealth(data, client) : null), [data, client])
  const mine = useMemo(
    () => opsSuggestions(data).filter((x) => x.clientId === clientId).slice(0, 3),
    [data, clientId],
  )
  //  ── 고객 활동 — **있는 것만** ───────────────────────────────────────────
  const activity = useMemo(() => {
    const reqs = (data.requests ?? []).filter((r) => r.clientId === clientId)
    const portalReqs = reqs.filter((r) => r.source === 'portal')
    const inqs = (data.inquiries ?? []).filter((q) => q.clientId === clientId)
    const dates = [...portalReqs, ...inqs].map((x) => x.createdAt.slice(0, 10)).sort()
    return {
      requests: reqs.length,
      portalRequests: portalReqs.length,
      inquiries: inqs.length,
      openInquiries: inqs.filter((q) => q.status !== '답변 완료').length,
      lastPortal: dates.length ? dates[dates.length - 1] : null,
    }
  }, [data, clientId])

  if (!client || !h) return null

  return (
    <section data-client-health={clientId} className="card overflow-hidden">
      {/*  ⚠ 폰에서는 **접어 둡니다.** 펴 놓았더니 거래처 상세가 3,491px 로
           길어졌습니다(예전 3,284px). 이 칸은 가끔 들여다보는 요약이고,
           폰에서 매일 쓰는 것은 위의 탭입니다.
           ⚠ 등급과 점수는 **접어도 보입니다** — 그게 한눈에 볼 값입니다.
           ⚠ 넓은 화면에서는 항상 펴져 있습니다(sm:block). */}
      <button
        data-client-health-toggle
        onClick={() => setBody((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-navy-100 px-5 py-4 text-left transition hover:bg-navy-50 sm:pointer-events-none"
      >
        <Activity size={19} strokeWidth={2.4} className="shrink-0 text-navy-500" />
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">고객 인사이트</p>
        <span className={`pill ${GRADE_TONE[h.grade]}`}>{h.grade}</span>
        <span data-client-health-score className="shrink-0 text-[1.2rem] font-extrabold tabular-nums text-navy-900">
          {h.score}점
        </span>
        <ChevronRight
          size={19}
          className={`shrink-0 text-navy-400 transition sm:hidden ${body ? 'rotate-90' : ''}`}
        />
      </button>

      <div className={`px-5 py-4 ${body ? '' : 'hidden'} sm:block`}>
        {/*  ⚠ 몇 개로 쟀는지 **반드시** 적습니다 — 두 개로 잰 100점과 다섯
             개로 잰 100점은 다른 값입니다. */}
        <p data-client-health-measured className="t-muted break-keep">
          {h.measured === 0
            ? '아직 잴 수 있는 기록이 없습니다 — 수거·청구가 쌓이면 계산됩니다'
            : `정해 둔 규칙 ${h.total}가지 중 ${h.measured}가지로 계산했습니다`}
        </p>

        {h.risks.length > 0 && (
          <ul data-client-health-risks className="mt-2.5 flex flex-wrap gap-1.5">
            {h.risks.map((r) => (
              <li key={r} className="pill bg-rose-50 text-rose-500">{r}</li>
            ))}
          </ul>
        )}

        {/* ── 고객 활동 — 실제로 남는 것만 ─────────────────────────────── */}
        <dl data-client-activity className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          <div>
            <dt className="t-muted break-keep">보낸 요청</dt>
            <dd className="t-body font-extrabold text-navy-900">{activity.requests}건</dd>
          </div>
          <div>
            <dt className="t-muted break-keep">그중 포털에서</dt>
            <dd className="t-body font-extrabold text-navy-900">{activity.portalRequests}건</dd>
          </div>
          <div>
            <dt className="t-muted break-keep">문의</dt>
            <dd className="t-body font-extrabold text-navy-900">
              {activity.inquiries}건
              {activity.openInquiries > 0 && (
                <span className="ml-1.5 text-[max(0.9rem,0.7em)] font-bold text-rose-500">
                  답변 대기 {activity.openInquiries}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="t-muted break-keep">마지막 포털 이용</dt>
            {/*  ⚠ 없으면 없다고 적습니다. 그럴듯한 날짜를 만들지 않습니다. */}
            <dd data-client-lastportal className="t-body font-extrabold text-navy-900">
              {activity.lastPortal ? prettyDate(activity.lastPortal) : '아직 기록 없음'}
            </dd>
          </div>
        </dl>

        {/* ── 다음 조치 ─────────────────────────────────────────────────── */}
        {mine.length > 0 && (
          <ul data-client-suggest className="mt-4 space-y-2">
            {mine.map((x, i) => (
              <li key={i} className="rounded-2xl bg-navy-50 px-4 py-3">
                <p className="t-body break-keep font-extrabold text-navy-900">{x.action}</p>
                {/*  ⚠ 근거를 사실 그대로 답니다. 근거 없는 추천은 안 만듭니다. */}
                <p className="t-muted mt-0.5 break-keep leading-snug">{x.because}</p>
              </li>
            ))}
          </ul>
        )}

        {h.reasons.length > 0 && (
          <>
            <button
              data-client-health-why
              onClick={() => setOpen((v) => !v)}
              className="btn-ghost mt-4 min-h-[44px]"
            >
              {open ? '근거 접기' : '왜 이 등급인가'}
            </button>
            {open && (
              <ul data-client-health-reasons className="mt-2.5 divide-y divide-navy-100 rounded-2xl bg-navy-50 px-4">
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

        {/*  ── 한 장으로 모아 보기 (0083) ─────────────────────────────────
             대표님: 「향후 LLM API 를 연결할 수 있는 구조를 고려한다. API
             Key 가 없으면 **억지로 실제 API 를 구현하지 않는다.**」

             ⚠ 그래서 이 단추는 **AI 를 부르지 않습니다.** 지금 서버가 알고
               있는 것을 한 장으로 모아 그대로 보여 줍니다. 나중에 열쇠가
               생기면 같은 글을 LLM 에 보내면 되고, 바꿀 곳은 아래 한 줄뿐
               입니다(buildClientBrief → LLM).
             ⚠ 「AI 분석」이라고 적지 않습니다. 규칙으로 모은 글을 그렇게
               부르면 거짓말입니다. */}
        <button
          data-client-brief-open
          onClick={() => setBrief((v) => (v ? null : buildClientBrief(data, client).text))}
          className="btn-ghost mt-4 min-h-[44px] w-full"
        >
          <FileText size={17} strokeWidth={2.4} /> {brief ? '요약 접기' : '이 거래처 한 장으로 모아 보기'}
        </button>
        {brief && (
          <div className="mt-2.5">
            <pre
              data-client-brief
              className="max-h-72 overflow-auto whitespace-pre-wrap break-keep rounded-2xl bg-navy-50 px-4 py-3.5 text-[1rem] leading-relaxed text-navy-800"
            >
              {brief}
            </pre>
            <p data-client-brief-note className="t-muted mt-2 break-keep leading-snug">
              지금까지 쌓인 기록을 규칙대로 모은 것입니다. <b className="text-navy-700">AI 분석은 아직
              붙어 있지 않습니다</b> — 이 글이 그대로 넘어갈 자리까지만 만들어 두었습니다.
            </p>
          </div>
        )}

        <Link to="/insight" className="t-btn mt-4 inline-flex min-h-[44px] items-center gap-1 text-teal-700 hover:underline">
          거래처 전체 보기 <ChevronRight size={17} />
        </Link>
      </div>
    </section>
  )
}
