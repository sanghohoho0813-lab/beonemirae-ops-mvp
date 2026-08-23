import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardCheck, Pencil } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { fieldDay, lastCollectionLine, lastCollectionOf } from '../lib/fieldActivity'
import { DayCloseStatus } from './DayClose'
import { CollectionRecord } from './CollectionRecord'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 현장에서 들어온 입력 — 대표·사무실 화면
//
//  이사님이 사무실에 앉아 「오늘 현장에서 뭐가 들어왔나」를 알 방법이
//  없었습니다. 수거이력을 열어 날짜로 걸러야 했습니다.
//
//  ⚠ 「잘했다」를 시스템이 매기지 않습니다 — 언제·누가·얼마만 적습니다.
//  ⚠ 금액은 한 칸도 없습니다. kg 까지입니다.
//  ⚠ 아직 아무것도 안 들어왔으면 **아무것도 그리지 않습니다.** 아침마다
//    「0건」이 떠 있으면 곧 안 보게 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function FieldTodayCard() {
  const { data } = useData()
  const { role } = useAuth()
  //  ⚠ 훅은 일찍 돌려보내기 **앞에** 있어야 합니다 — 아래 return null 뒤에
  //    두면 역할에 따라 훅 개수가 달라져 React 가 멎습니다.
  const [openId, setOpenId] = useState<string | null>(null)
  //  현장 담당자에게는 안 띄웁니다 — 자기가 방금 넣은 것을 다시 보여 줄
  //  이유가 없고, 남이 넣은 것까지 볼 자리도 아닙니다.
  if (role === 'field' || role === 'client') return null

  const day = fieldDay(data)
  //  ⚠ 예전에는 들어온 것이 하나도 없으면 아무것도 안 그렸습니다. 그런데
  //    이사님이 이 화면을 여는 이유의 절반은 **「아직 안 들어온 곳」**입니다.
  //    둘 다 없을 때만 조용합니다.
  if (day.inputs.length === 0 && day.pending.length === 0) return null

  const FIRST = 5
  const shown = day.inputs.slice(0, FIRST)
  const rest = day.inputs.length - shown.length

  //  ⚠ 0087 — 대표님 지적: 「현장직원이 입력해도 작고 눈에 잘 안 띈다」.
  //    내용은 이미 다 있었습니다 — **크기와 위계**가 문제였습니다.
  //    카드 자체를 키우고, 맨 위에 오늘 숫자 넉 줄(예정·완료·미완료·추가)을
  //    큰 글씨로 답니다. 이 화면을 여는 이유가 그 넷이기 때문입니다.
  const done = day.inputs.length
  const planned = done + day.pending.length
  const left = day.pending.length

  return (
    <section data-field-today className="card border-2 border-teal-200 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <ClipboardCheck size={23} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p data-field-today-headline className="break-keep text-[1.45rem] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[1.7rem]">
            오늘 현장 현황
          </p>
          <p className="t-body mt-0.5 break-keep text-navy-500">
            {done > 0
              ? `${day.clients}곳 · 모두 ${day.totalKg.toLocaleString('ko-KR')}kg`
              : '아직 들어온 입력이 없습니다'}
          </p>
        </div>
      </div>

      {/*  ⚠ 숫자 넷 — 카톡으로 물어보던 그것입니다.
           「몇 군데 남았나」가 제일 급하니 **미완료를 강조**합니다.
           0 이면 조용히 회색으로 둡니다 — 다 끝난 것도 정보입니다. */}
      <div data-field-counts className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { k: 'planned', label: '오늘 예정', v: planned, tone: 'text-navy-900' },
          { k: 'done', label: '완료', v: done, tone: done > 0 ? 'text-teal-700' : 'text-navy-400' },
          { k: 'left', label: '미완료', v: left, tone: left > 0 ? 'text-amber-700' : 'text-navy-400' },
          { k: 'adhoc', label: '추가수거', v: day.adHoc, tone: day.adHoc > 0 ? 'text-navy-900' : 'text-navy-400' },
        ].map((c) => (
          <div key={c.k} data-field-count={c.k} className="rounded-2xl bg-navy-50 px-3.5 py-3">
            <p className="t-caption break-keep font-bold text-navy-500">{c.label}</p>
            <p className={`mt-0.5 text-[1.9rem] font-extrabold leading-none tabular-nums ${c.tone}`}>
              {c.v}
              <span className="t-caption ml-1 font-bold text-navy-400">건</span>
            </p>
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {shown.map((i) => (
          <li
            key={i.scheduleId}
            data-field-input={i.clientId}
            //  ⚠ 0074 — 「방금 들어온 기록이 이상하다 → 눌러서 → 고친다」가
            //    이 화면의 핵심 동작입니다. 예전에는 수거이력 화면으로 나가서
            //    그 줄을 다시 찾아야 했습니다.
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-navy-100 bg-white px-4 py-3"
          >
            {i.atTime && (
              <span className="shrink-0 tabular-nums text-[1.05rem] font-bold text-navy-500">{i.atTime}</span>
            )}
            <Link
              to={`/clients/${i.clientId}`}
              className="min-w-0 break-keep text-[1.2rem] font-extrabold text-navy-900 underline-offset-4 hover:underline"
            >
              {i.clientName}
            </Link>
            <span className="shrink-0 tabular-nums text-[1.2rem] font-extrabold text-teal-700">
              {i.amountKg.toLocaleString('ko-KR')}kg
            </span>
            {/*  이름이 안 적혀 있으면 지어내지 않고 그 자리를 비웁니다. */}
            {i.who && <span className="shrink-0 text-[1.03rem] font-bold text-navy-600">{i.who}</span>}
            {i.adHoc && <span className="pill shrink-0 bg-amber-100 text-amber-700">예정 외</span>}
            {/*  ⚠ 병원 이름은 거래처로 가는 링크라 그대로 둡니다. 고치는 길은
                 따로 답니다 — 한 줄에 목적지가 둘이면 어느 쪽이 눌릴지
                 사람이 예상하지 못합니다. */}
            {i.eventId && (
              <button
                data-field-input-edit={i.clientId}
                onClick={() => setOpenId(i.eventId)}
                className="ml-auto flex min-h-[2.5rem] shrink-0 items-center gap-1 rounded-xl px-2.5 text-[1rem] font-bold text-teal-700 transition hover:bg-teal-50"
              >
                <Pencil size={14} strokeWidth={2.6} /> 보기·수정
              </button>
            )}

            {/*  ⚠ 이사님이 카카오톡 사진을 다시 여는 이유가 **용기 개수와
                 공급 자재**입니다. 수거량만 있으면 이 화면으로 사진을
                 대신할 수 없습니다. 안 적힌 것은 0 으로 채우지 않고 비웁니다 —
                 「안 적었다」와 「0개였다」는 다른 말입니다. */}
            <span className="w-full min-w-0 basis-full">
              {i.containerLine ? (
                <span data-field-containers={i.clientId} className="t-caption break-keep text-navy-600">
                  용기 {i.containerLine}
                  {i.containerTotal != null && ` (${i.containerTotal}개)`}
                </span>
              ) : (
                <span data-field-nocontainer={i.clientId} className="t-caption break-keep text-navy-300">
                  용기 미기재
                </span>
              )}
              {i.supplyLine && (
                <span data-field-supply={i.clientId} className="t-caption break-keep text-teal-700">
                  {' · 자재 '}
                  {i.supplyLine}
                </span>
              )}
            </span>
            {i.memo && (
              <span data-field-memo={i.clientId} className="w-full basis-full break-keep text-[0.98rem] leading-snug text-navy-500">
                {i.memo}
              </span>
            )}
          </li>
        ))}
      </ul>

      {rest > 0 && (
        <Link
          to="/history"
          data-field-today-more
          className="mt-2 inline-flex items-center gap-1 text-[0.98rem] font-bold text-teal-700 underline-offset-2 hover:underline"
        >
          나머지 {rest}건 보기
          <ArrowRight size={13} strokeWidth={2.6} />
        </Link>
      )}

      {/*  아직 안 들어온 곳 (F4).
           ⚠ **「누락」이라고 쓰지 않습니다.** 일정이 바뀌었을 수도, 병원이
             쉬었을 수도, 내일 처리하기로 했을 수도 있습니다. 시스템은 그
             이유를 모릅니다 — 「아직 입력이 없다」는 사실만 적습니다. */}
      {day.pending.length > 0 && (
        <div data-field-pending className="mt-3 rounded-2xl bg-amber-50 px-3.5 py-3">
          <p data-field-pending-headline className="break-keep text-[1.05rem] font-extrabold text-navy-900">
            아직 입력이 없는 곳 {day.pending.length}곳
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {day.pending.slice(0, 8).map((v) => (
              <li key={v.scheduleId} data-field-pending-row={v.clientId} className="flex items-center gap-1.5">
                {v.atTime && <span className="t-caption tabular-nums text-navy-400">{v.atTime}</span>}
                <Link
                  to={`/clients/${v.clientId}`}
                  className="break-keep text-[1.02rem] font-bold text-navy-800 underline-offset-4 hover:underline"
                >
                  {v.clientName}
                </Link>
                {v.who && <span className="t-caption text-navy-400">{v.who}</span>}
              </li>
            ))}
          </ul>
          <p className="t-caption mt-1.5 break-keep leading-snug text-navy-500">
            일정이 바뀌었거나 병원이 쉬었을 수도 있습니다. 「안 했다」가 아니라 <b>아직 입력이 없다</b>는 뜻입니다.
          </p>
        </div>
      )}

      {/*  사람별 한 줄 — 「누구 것이 아직 안 들어왔나」.
           ⚠ **성적표가 아닙니다.** 「N곳 아직」은 「안 했다」가 아니라
             「아직 입력이 없다」입니다. 그래서 「누락·미이행」 같은 말을
             쓰지 않고, 숫자에 빨간색도 안 씁니다 — 색이 곧 판정이 됩니다.
           ⚠ 사람이 한 명뿐이면 위 목록과 같은 말이라 안 그립니다. */}
      {day.staff.filter((r) => r.who).length > 1 && (
        <div data-field-staff className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {day.staff
            .filter((r) => r.who)
            .map((r) => (
              <span
                key={r.who}
                data-field-staff-row={r.who}
                className="flex items-center gap-1.5 break-keep text-[1.02rem]"
              >
                <b className="font-extrabold text-navy-800">{r.who}</b>
                <span className="tabular-nums text-navy-500">{r.done}곳 들어옴</span>
                {r.pending > 0 && (
                  <span data-field-staff-pending className="tabular-nums text-navy-400">
                    · {r.pending}곳 아직
                  </span>
                )}
              </span>
            ))}
        </div>
      )}

      {/*  누가 오늘 업무를 마감했나 (0088) — 카톡으로 「다 끝났습니다」를
           받던 자리입니다. 판 73 전에는 아무것도 안 그립니다. */}
      <DayCloseStatus />

      <CollectionRecord eventId={openId} onClose={() => setOpenId(null)} />

      {day.noName > 0 && (
        <p data-field-noname className="t-caption mt-2 break-keep text-navy-400">
          {day.noName}건은 기사 이름이 안 적혀 있습니다 — 수거 입력의 「기사」 칸을 채우면 여기에 함께 보입니다.
        </p>
      )}
    </section>
  )
}

/**
 * 거래처에 붙는 마지막 수거 한 줄.
 *
 *  「8월 16일 · 김준기 · 120kg」. **사실만** 적습니다 — 잘했다/못했다를
 *  매기지 않습니다. 기록이 없으면 그렇게 말합니다.
 */
export function LastCollectionLine({ clientId, className = '' }: { clientId: string; className?: string }) {
  const { data } = useData()
  const last = lastCollectionOf(data, clientId)
  if (!last) {
    return (
      <span data-last-collection={clientId} className={`t-caption text-navy-300 ${className}`}>
        수거 기록 없음
      </span>
    )
  }
  return (
    <span data-last-collection={clientId} className={`t-caption text-navy-500 ${className}`}>
      마지막 수거 {lastCollectionLine(last)}
    </span>
  )
}
