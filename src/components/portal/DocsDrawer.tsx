import { useMemo } from 'react'
import { ClipboardList, FileBarChart, Headset, ScrollText } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PortalSheet } from '../PortalSheet'
import { CLIENT_TEL } from '../../lib/brand'
import { clientSchedules } from '../../lib/ops'
import { weight, thisMonth } from '../../lib/format'
import type { Client } from '../../types'
import type { SheetName } from '../../lib/portalSheet'

// ─────────────────────────────────────────────────────────────────────────────
// 증빙자료 서랍 (0089)
//
//  대표님: 「가능한 실제 자료만 표시 … 작동하지 않는 Download CTA는 만들지
//  않는다」
//
//  ── 그래서 이 창은 **자료를 만들어 주는 곳이 아닙니다** ─────────────────
//   지금 병원이 인증·실사에 실제로 쓸 수 있는 것은 두 가지입니다.
//     · 수거 이력 (날짜·유형·수거량·용기·인계 여부)
//     · 월간 배출 리포트
//   둘 다 **브라우저 인쇄에서 「PDF로 저장」**을 고르면 파일이 나옵니다.
//   그건 진짜로 동작합니다.
//
//  ⚠ 수거대장(법정 서식) 자동 발급과 올바로 시스템 연동은 **아직 없습니다.**
//    있는 척하는 단추를 만들지 않고, 없다고 적고 받으실 방법을 적습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function DocsDrawer({
  open,
  client,
  onClose,
  onOpen,
}: {
  open: boolean
  client: Client
  onClose: () => void
  /** 다른 창으로 넘겨 줍니다 — 화면을 옮기지 않습니다 */
  onOpen: (name: SheetName) => void
}) {
  const { data } = useData()

  const stat = useMemo(() => {
    const done = clientSchedules(data, client.id).filter((s) => s.status === '완료')
    const m = thisMonth()
    const mine = done.filter((s) => s.date.startsWith(m))
    return {
      total: done.length,
      first: done.length > 0 ? done[done.length - 1].date : null,
      monthKg: mine.reduce((a, s) => a + (s.actualAmount ?? 0), 0),
      monthVisits: mine.length,
    }
  }, [data, client.id])

  const items = [
    {
      key: 'history' as SheetName,
      icon: ClipboardList,
      title: '수거 이력',
      desc:
        stat.total > 0
          ? `${stat.first} 이후 ${stat.total}건. 날짜·유형·수거량·용기·처리장 인계까지 그대로 나옵니다.`
          : '아직 수거 기록이 없습니다.',
      on: stat.total > 0,
    },
    {
      key: 'report' as SheetName,
      icon: FileBarChart,
      title: '월간 배출 리포트',
      desc:
        stat.monthVisits > 0
          ? `이번 달 ${weight(stat.monthKg)} · ${stat.monthVisits}회. 달을 바꿔 가며 보실 수 있습니다.`
          : '이번 달 수거가 아직 없습니다. 지난 달을 골라 보실 수 있습니다.',
      on: true,
    },
  ]

  const contract = [
    client.contractStart ? `계약 시작 ${client.contractStart}` : null,
    client.contractEnd ? `계약 종료 ${client.contractEnd}` : null,
    client.paymentTerms || null,
    client.bizNo ? `사업자등록번호 ${client.bizNo}` : null,
  ].filter(Boolean)

  return (
    <PortalSheet
      name="docs"
      kind="drawer"
      open={open}
      onClose={onClose}
      title="증빙자료"
      subtitle={`${client.name} · 인증·실사에 그대로 쓰실 수 있는 자료입니다`}
    >
      <ul className="grid gap-2.5">
        {items.map((x) => {
          const Icon = x.icon
          return (
            <li key={x.key}>
              <button
                data-docs-open={x.key}
                onClick={() => onOpen(x.key)}
                disabled={!x.on}
                className="flex w-full items-start gap-3.5 rounded-2xl bg-white p-4 text-left ring-1 ring-navy-200 transition hover:ring-navy-400 disabled:opacity-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
                  <Icon size={21} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body block break-keep font-extrabold text-navy-900">{x.title}</span>
                  <span className="t-muted mt-0.5 block break-keep leading-snug">{x.desc}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/*  ⚠ 인쇄로 PDF 가 나온다는 것을 알려 드립니다 — 모르시면 전화를 겁니다. */}
      <p className="t-muted mt-3 break-keep rounded-2xl bg-navy-50 px-4 py-3 leading-snug">
        열어서 <b className="text-navy-700">인쇄 · PDF 저장</b>을 누르시면, 인쇄 창에서 「PDF로 저장」을
        골라 파일로 받으실 수 있습니다.
      </p>

      {contract.length > 0 && (
        <section className="mt-5">
          <h3 className="t-body mb-2.5 flex items-center gap-2 break-keep font-extrabold text-navy-900">
            <ScrollText size={17} strokeWidth={2.4} className="shrink-0 text-navy-500" />
            계약 정보
          </h3>
          <ul data-docs-contract className="divide-y divide-navy-100 rounded-2xl bg-white ring-1 ring-navy-100">
            {contract.map((c) => (
              <li key={c} className="t-body break-keep px-4 py-3 font-bold text-navy-800">
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*  ⚠ 없는 것을 없다고 적습니다. 있는 척하는 단추보다 낫습니다. */}
      <section className="mt-5 rounded-2xl bg-amber-50 px-4 py-4 ring-1 ring-amber-100">
        <p className="t-body break-keep font-extrabold text-amber-900">아직 준비되지 않은 자료</p>
        <p className="t-muted mt-1 break-keep leading-snug text-amber-800">
          법정 서식 수거대장 자동 발급과 올바로 시스템 연동은 개발 중입니다. 지금 필요하시면 상담센터로
          말씀해 주시면 담당자가 바로 보내 드립니다.
        </p>
        <a
          href={`tel:${CLIENT_TEL}`}
          className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-2 rounded-2xl bg-white px-4 text-[1.02rem] font-extrabold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
        >
          <Headset size={17} strokeWidth={2.5} /> {CLIENT_TEL}
        </a>
      </section>
    </PortalSheet>
  )
}
