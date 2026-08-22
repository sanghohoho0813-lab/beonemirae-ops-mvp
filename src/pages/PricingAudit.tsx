import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarX, FileSpreadsheet, Pencil, Search, Tags } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { PricingModal } from '../components/Settlement'
import { TaxFields, type TaxFieldValues } from '../components/ClientForm'
import { Modal } from '../components/Modal'
import { ClientInfoPaste } from '../components/ClientInfoPaste'
import { FilterChip, EmptyState } from '../components/ui'
import { Stagger, StaggerItem } from '../components/motion'
import { auditPricing, type PriceRow } from '../lib/priceAudit'
import { priceVersionsOf } from '../lib/billing'
import { prettyDate } from '../lib/format'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 점검
//
//  청구가 틀리거나 막히는 원인은 거의 거래처에 빠진 값 하나입니다.
//
//   단가가 없으면 → 기본 950원/kg 으로 조용히 청구됩니다
//   사업자정보가 없으면 → 세금계산서를 못 끊습니다
//   결제일이 없으면 → 연체를 「몇 개월」로만 셀 수 있습니다
//   월정액 빈 달 정책이 미정이면 → 배출 0건인 달에 청구를 못 만듭니다 (0044)
//
//  그런데 이 셋을 확인하려면 거래처를 하나씩 열어야 했습니다. 거래처가
//  스무 곳이면 스무 번입니다. 여기서 한 화면에 모으고, 급한 것부터
//  위로 올리고, 그 자리에서 고칩니다.
//
//  고치는 창은 거래처 화면에 있던 것과 같은 창을 씁니다 — 저장 경로가
//  둘이 되면 규칙이 갈립니다.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = '확인 필요' | '전체' | '완료'

export function PricingAudit() {
  const { data, updateClient, savePricing, setFlatFeePolicy } = useData()
  const audit = useMemo(() => auditPricing(data), [data])
  const [filter, setFilter] = useState<Filter>('확인 필요')
  const [query, setQuery] = useState('')
  const [priceOf, setPriceOf] = useState<Client | null>(null)
  const [taxOf, setTaxOf] = useState<Client | null>(null)
  const [taxDraft, setTaxDraft] = useState<TaxFieldValues>({})
  const [flatBusy, setFlatBusy] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return audit.rows
      .filter((r) =>
        filter === '전체' ? true : filter === '확인 필요' ? r.blocked.length > 0 : r.blocked.length === 0,
      )
      .filter((r) => (q ? r.clientName.toLowerCase().includes(q) : true))
  }, [audit.rows, filter, query])

  //  계약서를 보고 내린 판단입니다. 값이 그대로여도 「정했다」로 기록해야
  //  다음 달에 같은 거래처를 다시 묻지 않습니다.
  const decideFlat = async (clientId: string, whenEmpty: boolean) => {
    setFlatBusy(clientId)
    await setFlatFeePolicy(clientId, whenEmpty)
    setFlatBusy('')
  }

  const openTax = (clientId: string) => {
    const c = data.clients.find((x) => x.id === clientId)
    if (!c) return
    setTaxDraft({
      bizNo: c.bizNo ?? '',
      bizCeo: c.bizCeo ?? '',
      bizType: c.bizType ?? '',
      bizItem: c.bizItem ?? '',
      taxEmail: c.taxEmail ?? '',
      vatMode: c.vatMode ?? null,
    })
    setTaxOf(c)
  }

  return (
    <div>
      <PageHeader title="거래처 점검" subtitle="청구·세금계산서에 빠진 값이 있는 곳" />

      {/* 요약 — 무엇이 몇 곳 남았는지 */}
      {/*
        칸 사이 선은 gap-px + 바탕색으로 긋습니다. divide-x 는 두 줄로 접히는
        휴대폰에서 둘째 줄 첫 칸에도 선을 그어 어긋납니다.
      */}
      <div
        data-price-summary
        className="card mb-4 grid grid-cols-2 gap-px overflow-hidden bg-navy-100 sm:grid-cols-4"
      >
        <div className="bg-white px-3 py-4 text-center">
          <p className="t-label text-navy-500">거래처</p>
          <p className="t-stat mt-1 tabular-nums text-navy-900">{audit.total}곳</p>
        </div>
        <div className="bg-white px-3 py-4 text-center">
          <p className="t-label text-navy-500">기본 단가</p>
          <p className={`t-stat mt-1 tabular-nums ${audit.onDefault.length > 0 ? 'text-rose-500' : 'text-navy-900'}`}>
            {audit.onDefault.length}곳
          </p>
        </div>
        <div className="bg-white px-3 py-4 text-center">
          <p className="t-label text-navy-500">세금계산서</p>
          <p className={`t-stat mt-1 tabular-nums ${audit.taxMissing.length > 0 ? 'text-amber-700' : 'text-navy-900'}`}>
            {audit.taxMissing.length}곳
          </p>
        </div>
        <div className="bg-white px-3 py-4 text-center">
          <p className="t-label text-navy-500">월정액 정책</p>
          <p
            className={`t-stat mt-1 tabular-nums ${audit.flatUndecided.length > 0 ? 'text-amber-700' : 'text-navy-900'}`}
          >
            {audit.flatUndecided.length}곳
          </p>
        </div>
      </div>

      {/*
        경고는 「몇 곳이 비었나」가 아니라 「그중 이미 청구가 나간 곳」이
        핵심입니다. 아직 수거도 청구도 없는 신규 거래처는 급하지 않습니다.
      */}
      {audit.onDefaultBilled.length > 0 && (
        <div data-price-warn className="card mb-3 border-rose-200 bg-rose-50/50 p-5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-500" strokeWidth={2.6} />
            <div className="min-w-0 flex-1">
              <p className="t-body font-extrabold text-navy-900">
                이미 청구가 나간 거래처 {audit.onDefaultBilled.length}곳이 기본 단가로 계산되고 있습니다
              </p>
              <p className="t-caption mt-1 break-keep">
                계약 단가를 넣지 않으면 의료폐기물 950원/kg · 일회용기저귀 660원/kg 이 그대로 쓰입니다. 계약서와
                다르면 명세서 금액과 미수금이 함께 틀어집니다.
              </p>
              <p className="t-caption mt-1.5 break-keep text-navy-500">
                {audit.onDefaultBilled.slice(0, 6).map((r) => r.clientName).join(' · ')}
                {audit.onDefaultBilled.length > 6 && ` 외 ${audit.onDefaultBilled.length - 6}곳`}
              </p>
            </div>
          </div>
        </div>
      )}

      {audit.taxMissingBilled.length > 0 && (
        <div data-tax-warn className="card mb-4 border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-start gap-2.5">
            <FileSpreadsheet size={20} className="mt-0.5 shrink-0 text-amber-700" strokeWidth={2.5} />
            <div className="min-w-0 flex-1">
              <p className="t-body font-extrabold text-navy-900">
                청구가 나간 거래처 {audit.taxMissingBilled.length}곳은 아직 세금계산서를 끊을 수 없습니다
              </p>
              <p className="t-caption mt-1 break-keep">
                사업자등록번호와 부가세 처리 방식은 계약서를 보고 사람이 넣어야 합니다 — 시스템이 짐작하면 틀린
                계산서가 홈택스로 나갑니다. 여기서 바로 넣으실 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/*
        0042 부터 배출이 0건인 달도 월정액으로 확정할 수 있습니다 — 단 그
        거래처에 「배출 없어도 청구함」이 켜져 있어야 합니다. 아무도 안 정해
        두면 그 달에 서버가 확정을 거부하고, 900만원짜리 계약이 그 달만
        엑셀로 넘어갑니다. 확정을 눌러 보기 전에 여기서 먼저 보이게 합니다.
      */}
      {audit.flatUndecided.length > 0 && (
        <div data-flat-warn className="card mb-4 border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-start gap-2.5">
            <CalendarX size={20} className="mt-0.5 shrink-0 text-amber-700" strokeWidth={2.5} />
            <div className="min-w-0 flex-1">
              <p className="t-body font-extrabold text-navy-900">
                월정액 거래처 {audit.flatUndecided.length}곳은 배출이 없는 달에 청구를 만들 수 없습니다
              </p>
              <p className="t-caption mt-1 break-keep">
                「수거가 한 건도 없어도 월정액을 청구하는 계약인가」를 아직 아무도 정하지 않았습니다. 계약서마다
                다르고 시스템이 짐작하면 안 되는 값이라, 각 거래처 카드에서 「청구함 / 청구 안 함」을 한 번만 정해
                주시면 됩니다. 「청구 안 함」도 정한 것으로 기록되어 다시 묻지 않습니다.
              </p>
              <p className="t-caption mt-1.5 break-keep text-navy-500">
                {audit.flatUndecided.slice(0, 6).map((r) => r.clientName).join(' · ')}
                {audit.flatUndecided.length > 6 && ` 외 ${audit.flatUndecided.length - 6}곳`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/*  빈 칸을 찾는 자리와 채우는 자리가 같아야 합니다. */}
      <div className="mb-4">
        <ClientInfoPaste />
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {(['확인 필요', '완료', '전체'] as Filter[]).map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === '확인 필요' ? `확인 필요 ${audit.needsCheck.length}` : f}
          </FilterChip>
        ))}
      </div>

      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-300" />
        <input
          className="field-input w-full pl-11"
          placeholder="거래처 이름으로 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={filter === '확인 필요' ? '확인할 거래처가 없습니다' : '해당하는 거래처가 없습니다'}
          subtitle={
            filter === '확인 필요'
              ? '계약 단가·세금계산서 정보가 다 들어가 있고, 월정액 빈 달 정책도 다 정해져 있습니다.'
              : '다른 조건으로 찾아 보세요.'
          }
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:items-start">
          {list.map((r) => (
            <Row
              key={r.clientId}
              row={r}
              versions={priceVersionsOf(data, r.clientId)}
              flatBusy={flatBusy === r.clientId}
              onPrice={() => {
                const c = data.clients.find((x) => x.id === r.clientId)
                if (c) setPriceOf(c)
              }}
              onTax={() => openTax(r.clientId)}
              onFlat={(v) => void decideFlat(r.clientId, v)}
            />
          ))}
        </Stagger>
      )}

      {/*  거래처 화면과 같은 창입니다 — 저장 경로가 둘이면 규칙이 갈립니다. */}
      {priceOf && (
        <PricingModal
          open
          client={priceOf}
          onClose={() => setPriceOf(null)}
          onSave={(pricing, from) => {
            void savePricing(priceOf.id, pricing, from)
            setPriceOf(null)
          }}
        />
      )}

      <Modal
        open={taxOf != null}
        title={`${taxOf?.name ?? ''} 세금계산서 정보`}
        onClose={() => setTaxOf(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setTaxOf(null)}>
              취소
            </button>
            <button
              data-tax-save
              className="btn-primary flex-1"
              onClick={() => {
                if (taxOf) void updateClient(taxOf.id, taxDraft)
                setTaxOf(null)
              }}
            >
              저장
            </button>
          </>
        }
      >
        <p className="t-muted break-keep">
          한 번 넣으면 매달 홈택스에 옮겨 적지 않습니다. 부가세는 계약서를 보고 정해 주세요 — 시스템이 짐작하지
          않습니다.
        </p>
        <TaxFields value={taxDraft} onChange={(patch) => setTaxDraft({ ...taxDraft, ...patch })} title="" />
      </Modal>
    </div>
  )
}

function Row({
  row,
  versions,
  flatBusy,
  onPrice,
  onTax,
  onFlat,
}: {
  row: PriceRow
  versions: ReturnType<typeof priceVersionsOf>
  flatBusy: boolean
  onPrice: () => void
  onTax: () => void
  onFlat: (whenEmpty: boolean) => void
}) {
  const warn = row.onDefault.length > 0
  const taxWarn = row.taxMissing.length > 0
  const hasFlat = row.mode === '월정액' || row.mode === '혼합'
  const supplies = row.paidSupplies.filter((s) => s.own)
  return (
    <StaggerItem>
      {/*  StaggerItem 은 data-tour 외의 속성을 DOM 으로 넘기지 않습니다.
          카드 자체에 표시를 달아야 화면 검증에서 이 행을 집을 수 있습니다. */}
      <div
        data-price-row={row.clientId}
        className={`card p-4 ${warn ? 'border-rose-200' : taxWarn || row.flatPolicyUndecided ? 'border-amber-200' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 font-extrabold text-navy-900">{row.clientName}</span>
          <span className="pill shrink-0 bg-navy-50 text-navy-500">
            {row.mode === '수거구분없음' ? '수거 구분 없음' : row.mode}
          </span>
        </div>

        {row.terms.length === 0 ? (
          <p className="t-caption mt-2 break-keep text-amber-700">
            의료폐기물·일회용기저귀 중 무엇을 수거하는지 지정되지 않았습니다 — 거래처 정보에서 먼저 정해 주세요.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {row.terms.map((t) => (
              <li key={t.label} className="flex items-baseline justify-between gap-2">
                <span className="t-caption shrink-0">{t.label}</span>
                <span className="min-w-0 text-right">
                  <b className={`t-cell tabular-nums ${t.own ? 'text-navy-800' : 'text-rose-600'}`}>{t.value}</b>
                  {!t.own && <span className="pill ml-1.5 bg-rose-100 text-rose-600">기본값</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {row.diaperVatPct > 0 && (
          <p className="t-caption mt-1.5 text-navy-500">지정폐기물 부가세 {row.diaperVatPct}% 별도</p>
        )}

        {/*
          계약으로 정한 물품 단가만 적습니다. 합성수지 2·5·20L 은 넣지 않아도
          회사 기본 판매가가 붙는데, 그것까지 줄줄이 적으면 모든 카드에 같은
          세 줄이 반복되어 정작 봐야 할 계약 단가가 묻힙니다.
        */}
        {supplies.length > 0 && (
          <p data-price-supplies className="t-caption mt-1.5 break-keep text-navy-500">
            계약 물품 {supplies.map((s) => `${s.label} ${s.price.toLocaleString('ko-KR')}원`).join(' · ')}
          </p>
        )}

        {/*
          단가가 언제부터인지 — 이 값이 있으면 그 전 달은 그때 단가로
          계산됩니다. 하나도 없으면 지금 단가가 모든 달에 쓰입니다.
        */}
        {versions.length > 0 && (
          <p data-price-since={row.clientId} className="t-caption mt-1.5 break-keep text-navy-500">
            지금 단가 {prettyDate(versions[0].effectiveFrom)}부터
            {versions.length > 1 && ` · 이전 판 ${versions.length - 1}개`}
          </p>
        )}

        {/* 세금계산서 · 결제일 */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-navy-100 pt-2.5">
          <span className="t-caption shrink-0 text-navy-500">세금계산서</span>
          {taxWarn ? (
            <span data-tax-missing={row.clientId} className="pill bg-amber-100 text-amber-700">
              {row.taxMissing.join(' · ')} 없음
            </span>
          ) : (
            <span className="pill bg-emerald-50 text-emerald-600">준비됨</span>
          )}
          {/*
            결제일은 없어도 정상입니다 — 실제 계약서 11건 중 결제조건이
            적힌 곳이 없었습니다. 다만 넣으면 연체를 일 단위로 볼 수 있어
            참고로만 적습니다. 「확인 필요」로 세지 않습니다.
          */}
          {!row.hasDueDay && (
            <span data-no-dueday={row.clientId} className="t-muted">
              결제일 미입력 — 연체는 개월 단위로만 셉니다
            </span>
          )}
        </div>

        {/*
          월정액이 있는 거래처에만 나옵니다. kg 단가만 쓰는 곳은 수거가 0건이면
          청구할 금액 자체가 없으므로 정할 것이 없습니다.

          「청구 안 함」도 눌러야 정해집니다 — 값이 이미 꺼져 있어도, 계약서를
          보고 확인한 것과 아무도 안 본 것은 다른 일이기 때문입니다.
        */}
        {hasFlat && (
          <div
            data-flat-policy={row.clientId}
            className="mt-2.5 border-t border-navy-100 pt-2.5"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="t-caption shrink-0 text-navy-500">배출 없는 달</span>
              {row.flatPolicyUndecided ? (
                <span data-flat-undecided={row.clientId} className="pill bg-amber-100 text-amber-700">
                  아직 안 정함
                </span>
              ) : (
                <span data-flat-decided={row.clientId} className="pill bg-emerald-50 text-emerald-600">
                  {row.flatWhenEmpty ? '월정액 청구함' : '청구 안 함'}
                </span>
              )}
            </div>
            {row.flatPolicyUndecided && (
              <p className="t-muted mt-1 break-keep">
                수거가 한 건도 없는 달에도 월정액을 청구하는 계약인가요? 정해 두지 않으면 그 달은 확정이 막힙니다.
              </p>
            )}
            <div className="mt-1.5 flex gap-2">
              <button
                data-flat-yes={row.clientId}
                className={row.flatWhenEmpty && !row.flatPolicyUndecided ? 'btn-primary' : 'btn-ghost'}
                disabled={flatBusy}
                onClick={() => onFlat(true)}
              >
                청구함
              </button>
              <button
                data-flat-no={row.clientId}
                className={!row.flatWhenEmpty && !row.flatPolicyUndecided ? 'btn-primary' : 'btn-ghost'}
                disabled={flatBusy}
                onClick={() => onFlat(false)}
              >
                청구 안 함
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="t-muted min-w-0">
            청구 {row.billedMonths}개월 · 수거 {row.collections}건
          </p>
          <div className="flex shrink-0 gap-2">
            <button data-tax-edit={row.clientId} className="btn-ghost" onClick={onTax}>
              <FileSpreadsheet size={16} strokeWidth={2.4} /> 계산서
            </button>
            <button data-price-edit={row.clientId} className="btn-ghost" onClick={onPrice}>
              <Pencil size={16} strokeWidth={2.4} /> 단가
            </button>
          </div>
        </div>
      </div>
    </StaggerItem>
  )
}
