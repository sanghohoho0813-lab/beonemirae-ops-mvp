import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Hospital, Loader2, Package, Sparkles, Truck, XCircle } from 'lucide-react'
import type { AppData } from '../types'
import type { DispatchHint } from '../lib/dispatchHint'
import { clientHistory, stockCheck, type PlanResult } from '../lib/requestPlan'
import { aiMetaLine } from '../lib/aiVendor'

// ─────────────────────────────────────────────────────────────────────────────
//  AI 처리 계획 (0142) — 요청 분석 바로 아래
//
//   ① 요청에서 뽑은 것 (AI)          언제 · 무엇 · 몇 개
//   ② 시스템이 다시 확인 (AI 아님)    그날 차량 · 사무실 재고 충분/부족 · 이 병원 이력
//   ③ 처리 순서 (AI)                 자료 숫자를 근거로 단계별
//   ④ 주의 (AI)                      긴급 잦음 · 다음 방문 없음 · 미수 …
//   ⑤ 구체 회신 (AI)                 「이 회신 쓰기」를 눌러야 아래 칸에 들어감
//
//  ⚠ 재고 「충분 · 부족」은 화면이 직접 셉니다(AI 가 말한 숫자를 믿지 않음).
//  ⚠ 아무것도 저장 · 확정 · 전송하지 않습니다. 날짜 잡기 · 회신 저장은 담당자가 누릅니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanView {
  busy: boolean
  error: string
  result: PlanResult | null
  ms: number | null
  logged: boolean
}
export const PLAN_EMPTY: PlanView = { busy: false, error: '', result: null, ms: null, logged: true }

const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`

function Head({ n, icon: Icon, children, sub }: { n: string; icon: typeof Sparkles; children: string; sub?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-[1.02rem] font-black text-violet-900">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[0.9rem] font-black text-white">{n}</span>
      <Icon size={18} strokeWidth={2.4} className="shrink-0 text-violet-600" />
      {children}
      {sub && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.85rem] font-extrabold text-violet-800">{sub}</span>}
    </p>
  )
}

export function AiRequestPlan({
  data, clientId, hint, plan, onUseReply, usedReply,
}: {
  data: AppData
  clientId: string
  hint: DispatchHint
  plan: PlanView
  onUseReply: (text: string) => void
  usedReply: boolean
}) {
  const hist = clientHistory(data, clientId)
  const r = plan.result
  const stock = r ? stockCheck(data, r.asks) : []
  return (
    <section data-ai-plan className="mt-4 rounded-2xl bg-white px-4 py-4 ring-2 ring-violet-300">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList size={20} strokeWidth={2.4} className="shrink-0 text-violet-600" />
        <p className="min-w-0 flex-1 break-keep text-[1.15rem] font-black text-violet-950">
          AI 처리 계획
          <span className="ml-2 text-[0.98rem] font-bold text-violet-700">요청 하나를 끝까지 — 일정 · 재고 · 이 병원 이력까지 맞춰 봄</span>
        </p>
      </div>

      {plan.busy && (
        <p data-ai-plan-busy className="mt-3 flex items-center gap-2 break-keep rounded-xl bg-violet-50 px-3.5 py-3 text-[1.05rem] font-bold text-violet-900">
          <Loader2 size={20} className="shrink-0 animate-spin text-violet-600" /> AI가 그날 차량 · 사무실 재고 · 이 병원 이력을 맞춰 보는 중…
        </p>
      )}
      {plan.error && !plan.busy && (
        <div data-ai-plan-error role="status" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-3">
          <p className="break-keep text-[1.02rem] font-bold text-rose-700">처리 계획을 받지 못했습니다. 위 분석과 회신은 그대로 쓸 수 있습니다.</p>
          <p className="t-caption mt-0.5 break-keep text-navy-600">까닭: {plan.error}</p>
        </div>
      )}

      {r && !plan.busy && (
        <div data-ai-plan-result className="mt-3 space-y-4">
          {/* ① 요청에서 뽑은 것 */}
          <div>
            <Head n="1" icon={Sparkles} sub="AI">요청에서 뽑은 것</Head>
            <ul className="mt-2 flex flex-wrap gap-2">
              <li data-ai-plan-when className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-3.5 py-1.5 text-[1.05rem] font-extrabold text-white">
                <CalendarClock size={16} strokeWidth={2.4} /> {r.when}
              </li>
              {r.asks.map((a, i) => (
                <li key={i} data-ai-plan-ask={a.item ?? a.what} className="rounded-full bg-violet-50 px-3.5 py-1.5 text-[1.05rem] font-extrabold text-violet-900 ring-1 ring-violet-200">
                  {a.what}{a.qty != null ? ` ${a.qty}개` : ''}{a.item && a.item !== a.what ? <span className="ml-1 font-bold text-violet-700">→ {a.item}</span> : null}
                </li>
              ))}
            </ul>
          </div>

          {/* ② 시스템이 다시 확인 — AI 아님 */}
          <div>
            <Head n="2" icon={CheckCircle2} sub="시스템 자료 · AI 아님">다시 확인한 것</Head>
            <ul data-ai-plan-check className="mt-2 space-y-1.5">
              <li data-ai-plan-check-dispatch className="flex items-start gap-2 break-keep rounded-xl bg-navy-50 px-3 py-2.5 text-[1.02rem] text-navy-900">
                <Truck size={18} className="mt-0.5 shrink-0 text-navy-600" />
                <span>
                  <b>{md(hint.date)}</b> ({hint.why}) —{' '}
                  {hint.pick ? (
                    <>추천 <b>{hint.pick.vehicleName}{hint.pick.driver ? ` · ${hint.pick.driver}` : ''}</b> · 그날 방문 {hint.pick.visits}곳 <span className="text-navy-600">({hint.pickWhy})</span></>
                  ) : '그날 갈 수 있는 차량 정보가 없습니다'}
                </span>
              </li>
              {stock.map((s) => (
                <li key={s.item} data-ai-plan-stock={s.item} data-enough={s.enough == null ? 'unknown' : s.enough ? 'yes' : 'no'}
                  className={`flex items-start gap-2 break-keep rounded-xl px-3 py-2.5 text-[1.02rem] ${s.enough === false ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-950'}`}>
                  <Package size={18} className="mt-0.5 shrink-0" />
                  <span>
                    <b>{s.item}{s.qty != null ? ` ${s.qty}개` : ''}</b> → 사무실 {s.stockName} 재고 <b>{s.have ?? '?'}개</b>
                    {s.enough === true && <span className="ml-1.5 inline-flex items-center gap-0.5 font-extrabold text-emerald-700"><CheckCircle2 size={15} /> 충분</span>}
                    {s.enough === false && <span className="ml-1.5 inline-flex items-center gap-0.5 font-extrabold text-rose-700"><XCircle size={15} /> {(s.qty ?? 0) - (s.have ?? 0)}개 모자람</span>}
                    {s.enough == null && <span className="ml-1.5 font-bold text-navy-600">· 수량 확인 필요</span>}
                    <span className="ml-1.5 text-[0.92rem] font-bold text-navy-500">({s.billable ? '유상 — 청구 대상' : '무상 공급'})</span>
                  </span>
                </li>
              ))}
              <li data-ai-plan-check-history className="flex items-start gap-2 break-keep rounded-xl bg-navy-50 px-3 py-2.5 text-[1.02rem] text-navy-900">
                <Hospital size={18} className="mt-0.5 shrink-0 text-navy-600" />
                <span>
                  최근 수거 <b>{hist.lastVisit ? md(hist.lastVisit) : '기록 없음'}</b> · 다음 방문 <b>{hist.nextVisit ? md(hist.nextVisit) : '잡힌 것 없음'}</b> ·
                  최근 90일 방문 {hist.visits90}번 · 긴급 요청 <b className={hist.urgent90 >= 2 ? 'text-rose-700' : ''}>{hist.urgent90}번</b> ·
                  미수 {hist.overdueMonths > 0 ? <b className="text-rose-700">{hist.overdueMonths}개월</b> : '없음'}
                </span>
              </li>
            </ul>
          </div>

          {/* ③ 처리 순서 */}
          <div>
            <Head n="3" icon={ClipboardList} sub="AI">처리 순서</Head>
            <ol className="mt-2 space-y-2">
              {r.steps.map((st, i) => (
                <li key={i} data-ai-plan-step className="flex items-start gap-3 rounded-xl bg-violet-50/60 px-3 py-2.5">
                  <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[0.95rem] font-black text-violet-700 ring-1 ring-violet-200">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-keep text-[1.08rem] font-extrabold text-navy-950">{st.title}</span>
                    {st.detail && <span className="block break-keep text-[1rem] text-navy-700">{st.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* ④ 주의 */}
          {r.watch.length > 0 && (
            <div>
              <Head n="4" icon={AlertTriangle} sub="AI">눈여겨볼 점</Head>
              <ul className="mt-2 space-y-1.5">
                {r.watch.map((w, i) => (
                  <li key={i} data-ai-plan-watch className="flex items-start gap-2 break-keep rounded-xl bg-amber-50 px-3 py-2.5 text-[1.02rem] font-semibold text-amber-900">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ⑤ 구체 회신 */}
          <div>
            <Head n={r.watch.length > 0 ? '5' : '4'} icon={Sparkles} sub="AI · 일정 · 재고 반영">구체 회신</Head>
            <div className="mt-2 rounded-xl bg-white px-3.5 py-3 ring-2 ring-violet-200">
              <p data-ai-plan-reply className="whitespace-pre-wrap break-keep text-[1.08rem] leading-relaxed text-navy-950">{r.reply}</p>
              <button
                type="button"
                data-ai-plan-use-reply
                onClick={() => onUseReply(r.reply)}
                className="mt-2.5 inline-flex min-h-[3rem] items-center gap-1.5 rounded-full bg-violet-600 px-5 text-[1.02rem] font-extrabold text-white shadow-md transition hover:bg-violet-700"
              >
                {usedReply ? '회신 칸에 넣었습니다 — 고쳐서 저장' : '이 회신 쓰기 — 아래 칸에서 고쳐 저장'}
              </button>
            </div>
          </div>

          <p data-ai-plan-meta className="break-keep text-[0.95rem] font-semibold text-navy-500">
            {aiMetaLine(r.model, plan.ms)}{plan.logged ? '' : ' · 호출 기록을 남기지 못했습니다'} · 병원 이름 · 기사 이름은 AI에 보내지 않았습니다
          </p>
        </div>
      )}
    </section>
  )
}
