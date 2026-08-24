import { useMemo, useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { MetricCard, EmptyState, SectionTitle, QtyField } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { MaterialRiskCard } from '../components/ops'
import { StockCard } from '../components/StockCard'
import { StockItems } from '../components/StockItems'
import { StockLedger } from '../components/StockLedger'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import { additionalMaterialCount } from '../lib/selectors'
import { materialUsage, type UsageStatus } from '../lib/ops'
import { num, prettyDate, thisMonth, today, weight } from '../lib/format'
import { SUPPLY_ITEMS, itemsOf, stockDeltaOf, isLegacySupply, type ItemCounts, type ItemKey } from '../lib/billing'
import { STOCK_KEYS } from '../lib/collection'
import type { MaterialSupply } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 자재 관리 — 거래처별 자재공급 내역 / **규격별** 공급 입력 / 추가요청 통계
//
//  ⚠ 0075 — 이 화면만 옛 3칸(박스·비닐·바늘통)에 멈춰 있었습니다.
//    수거 입력은 규격 13가지로 받고 정산도 규격마다 다른 단가를 쓰는데,
//    여기서 등록하면 규격이 안 남아 **대표 규격 단가로 추정**됐습니다.
//    63L 박스와 12L 박스는 매입가가 다릅니다 — 추정이 섞이면 원가가 틀립니다.
// ─────────────────────────────────────────────────────────────────────────────

const emptyForm = {
  clientId: '',
  date: today(),
  boxCount: 0,
  vinylCount: 0,
  needleBoxCount: 0,
  isAdditionalRequest: false,
  memo: '',
  items: {} as ItemCounts,
}

//  규격을 재고 칸으로 묶어 보여 줍니다 — 「이 규격을 주면 어느 재고가 주는가」가
//  한눈에 보여야 합니다. 순서·이름은 lib/billing.ts 의 품목표 그대로입니다.
const GROUPS = STOCK_KEYS.map((b) => ({
  ...b,
  items: SUPPLY_ITEMS.filter((it) => it.bucket === b.key),
})).filter((g) => g.items.length > 0)

const usageStyle: Record<UsageStatus, string> = {
  정상: 'bg-emerald-50 text-emerald-600',
  '확인 필요': 'bg-amber-50 text-amber-700',
  '점검 필요': 'bg-rose-50 text-rose-500',
}

export function Materials() {
  const { data, addMaterial, removeMaterial, clientById } = useData()
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Omit<MaterialSupply, 'id'> & { items: ItemCounts }>(emptyForm)
  /*
    저장 시도 표 (0043).

     자재 공급은 재고를 줄이고 **월말 청구에 자재비로 들어갑니다.** 통신이
     끊긴 줄 알고 다시 누르면 예전에는 두 줄이 됐고, 그 달 청구에 자재비가
     두 배로 들어갔습니다. 창을 열 때 표를 하나 만들고 실패해서 다시 눌러도
     같은 표를 냅니다 — 서버가 「같은 저장」임을 알아봅니다.
  */
  const [requestId, setRequestId] = useState('')

  const sorted = useMemo(
    () => [...data.materials].sort((a, b) => b.date.localeCompare(a.date)),
    [data.materials],
  )

  //  ⚠ 0075 — 이번 달 **규격별** 공급. 대표님 지적: 「지금은 4개밖에 없잖아?
  //    10개 이상 정리돼야 하고」. 아래 넉 장 카드는 재고 칸 합계라 63L 인지
  //    12L 인지가 안 보입니다 — 그 둘은 매입가가 다릅니다.
  //  ⚠ 규격이 없는 옛 기록은 **지어내서 채우지 않고** 따로 셉니다.
  const monthItems = useMemo(() => {
    const m = thisMonth()
    const sum: ItemCounts = {}
    let legacy = 0
    for (const r of data.materials) {
      if (!r.date.startsWith(m)) continue
      if (isLegacySupply(r)) {
        legacy += r.boxCount + r.vinylCount + r.needleBoxCount
        continue
      }
      for (const [k, n] of Object.entries(itemsOf(r))) sum[k as ItemKey] = (sum[k as ItemKey] ?? 0) + (n ?? 0)
    }
    return { sum, legacy }
  }, [data.materials])

  const month = thisMonth()
  const monthList = sorted.filter((m) => m.date.startsWith(month))
  const addCount = additionalMaterialCount(data)
  const usage = useMemo(() => materialUsage(data), [data])
  const totals = monthList.reduce(
    (acc, m) => ({
      box: acc.box + m.boxCount,
      vinyl: acc.vinyl + m.vinylCount,
      needle: acc.needle + m.needleBoxCount,
    }),
    { box: 0, vinyl: 0, needle: 0 },
  )

  //  이 화면의 공급도 이제 사무실 재고에서 빠집니다(수거 입력과 같은 결과).
  //  그래서 남은 것보다 많이 넣으면 서버가 재고 음수를 막아 기록만 남고
  //  재고는 안 빠지는 어긋난 상태가 됩니다. 저장 전에 여기서 걸러 냅니다.
  //  ⚠ 0075 — 규격에서 재고 칸으로 묶어 계산합니다. 예전에는 화면이
  //    「바늘통 칸 → 합성수지 재고」로 보고, 서버는 「바늘통 재고」에서
  //    뺐습니다 — 두 곳이 서로 다른 칸을 보고 있었습니다.
  const need = stockDeltaOf(form.items)
  const overStock = STOCK_KEYS.filter(({ key }) => need[key] > (data.officeStock?.[key] ?? 0))
    .map(({ key, label }) => `${label} (남은 ${data.officeStock?.[key] ?? 0}개)`)
  const itemTotal = Object.values(form.items).reduce((a, b) => a + (b ?? 0), 0)

  function save() {
    if (!form.clientId) return
    if (overStock.length > 0 || itemTotal <= 0) return
    //  현장이 수거하면서 자재를 함께 주면 그 입력에서 이미 기록됩니다.
    //  같은 거래처·같은 날짜로 여기서 또 넣으면 공급이 두 번 잡히고 재고도
    //  두 번 빠집니다. 막지는 않습니다 — 정말 두 번 나간 날도 있습니다.
    const already = data.materials.filter((m) => m.clientId === form.clientId && m.date === form.date)
    if (already.length > 0) {
      const name = clientById(form.clientId)?.name ?? '이 거래처'
      const okToAdd = window.confirm(
        `${name} ${prettyDate(form.date)} 자재 공급이 이미 ${already.length}건 있습니다.\n` +
          '현장 수거 입력에서 함께 넣은 것일 수 있습니다. 그래도 하나 더 등록할까요?',
      )
      if (!okToAdd) return
    }
    //  저장 시도 표 (0043) — 통신이 끊겨 다시 눌러도 두 줄이 되지 않게.
    //  창을 열 때 만든 표를 그대로 보냅니다. 자재는 청구에 들어갑니다.
    //  ⚠ 옛 3칸은 **규격에서 계산해** 넣습니다. 화면이 두 번 세지 않습니다.
    //    (서버도 같은 규칙으로 다시 계산합니다 — 어긋날 수 없습니다.)
    addMaterial({
      ...form,
      boxCount: need.corrugatedBox,
      vinylCount: need.bag,
      needleBoxCount: need.plasticContainer + need.needleBox,
      items: form.items,
      requestId,
    })
    setForm(emptyForm)
    setOpen(false)
  }

  return (
    <div>
      <PageHeader
        title="자재 관리"
        subtitle="박스 · 비닐 · 합성수지 바늘통"
        action={
          <button className="btn-primary" onClick={() => { setForm(emptyForm); setRequestId(crypto.randomUUID()); setOpen(true) }}>
            ＋ 공급 등록
          </button>
        }
      />

      {/*  ⚠ 0087 — 사무실 재고(현재 수량 · 입고 · 재고 조정 · 최근 변동)가
           **설정 화면 깊숙한 곳에만** 있었습니다. 운영 중 자주 여는 것인데
           설정까지 들어가야 했습니다.
           원칙을 이렇게 잡습니다 —
             「설정」 = 자재 품목·기본값 같은 **구조 설정**
             「운영 화면」 = 지금 몇 개 있나 · 넣고 · 바로잡고 · 최근 변동
           그래서 자재 화면 맨 위로 올립니다. 설정에는 **가는 길만** 남겼습니다
           (0088) — 같은 화면이 두 자리에 있으면 어느 쪽이 진짜인지 헷갈립니다.
           ⚠ 현장 담당자에게는 안 보입니다. 사무실 재고는 사무실 일이고,
             최소권한 원칙을 그대로 지킵니다.
           ⚠ 0074 — 그 아래에 **최근 재고 변동**을 답니다. 지금까지 이 표는
             쓰기만 하고 한 번도 읽지 않았습니다. 숫자만 보여 주고 왜 그
             숫자인지 안 보여 주면, 이상할 때 되짚을 방법이 없습니다. */}
      {(role === 'admin' || role === 'office') && (
        <div className="mb-5">
          <StockCard />
          {/*  ── 규격별 재고 (0079) ────────────────────────────────────────
               대표님: 「2L 합성수지 ~ 기저귀비닐 40L 까지도 수량을 실시간으로
               확인할 수 있게 해줘. 지금은 4개밖에 없어서 불편해.」
               위 넉 장은 **칸 합계**이고, 아래가 그 안쪽 규격별 내역입니다. */}
          <StockItems />
          <StockLedger />
        </div>
      )}

      {/* 이번 달 통계 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="이번 달 추가공급" value={addCount} unit="건" tone="amber" hint="월평균 4~5회" />
        <MetricCard label="박스 공급" value={num(totals.box)} unit="개" tone="navy" />
        <MetricCard label="비닐 공급" value={num(totals.vinyl)} unit="개" tone="navy" />
        <MetricCard label="바늘통 공급" value={num(totals.needle)} unit="개" tone="navy" />
      </div>

      {/*  이번 달 규격별 공급 — 「무엇을 몇 개 주고 왔나」.
           ⚠ 0인 규격도 **줄을 남깁니다.** 안 보이면 그 규격을 쓰는 병원이
             있는지조차 알 수 없고, 재고를 채울 때 빠뜨립니다. */}
      <section data-month-items className="card mb-5 p-4">
        <SectionTitle size="sub">이번 달 규격별 공급</SectionTitle>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {SUPPLY_ITEMS.map((it) => {
            const n = monthItems.sum[it.key as ItemKey] ?? 0
            return (
              <div key={it.key} data-month-item={it.key} className="flex items-baseline justify-between gap-2">
                <span className={`break-keep text-[1.02rem] ${n > 0 ? 'font-bold text-navy-800' : 'text-navy-400'}`}>
                  {it.label}
                </span>
                <span className={`shrink-0 tabular-nums text-[1.12rem] font-extrabold ${n > 0 ? 'text-navy-900' : 'text-navy-300'}`}>
                  {num(n)}
                </span>
              </div>
            )
          })}
        </div>
        {monthItems.legacy > 0 && (
          <p data-month-legacy className="t-caption mt-2.5 break-keep leading-snug text-amber-700">
            규격이 안 적힌 옛 기록 {num(monthItems.legacy)}개가 따로 있습니다 — 위 표에는 안 넣었습니다.
            어느 규격인지 모르는 것을 지어내지 않습니다.
          </p>
        )}
      </section>

      {/* 자재 소진 위험 */}
      <section className="mb-5">
        <SectionTitle>자재 소진 위험</SectionTitle>
        <MaterialRiskCard />
      </section>

      {/* 자재 공급 대비 배출 비교 (원가·관리 점검) */}
      <section className="mb-5">
        <SectionTitle>자재 공급 대비 배출 비교</SectionTitle>
        <div className="card p-4 sm:p-5">
          <p className="mb-3 text-[1.03rem] leading-snug text-navy-400">
            자재 공급량과 실제 배출량(수거량)을 비교하여 과다 사용 또는 관리 누락 가능성을 확인합니다. 확정적 판단이 아닌
            <b className="text-navy-500"> 점검용 지표</b>입니다.
          </p>
          {usage.length === 0 ? (
            <p className="rounded-xl bg-navy-50 px-3.5 py-3 text-[1.08rem] text-navy-400">이번 달 공급 내역이 쌓이면 비교가 표시됩니다.</p>
          ) : (
            <div className="space-y-2">
              {usage.map((u) => (
                <div key={u.clientId} className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="break-keep font-bold text-navy-800">{u.clientName}</p>
                    <p className="mt-0.5 text-[0.98rem] font-medium text-navy-500">
                      공급 {u.suppliedUnits}단위 · 배출 {weight(u.dischargedKg)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.98rem] font-bold ${usageStyle[u.status]}`}>{u.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <h2 className="mb-2.5 px-1 text-[1.07rem] font-bold text-navy-700">공급 내역</h2>
      {sorted.length === 0 ? (
        <LoadGate
          loadingTitle="자재공급 내역을 불러오는 중입니다"
          empty={
            <EmptyState icon={PackageSearch} title="자재공급 내역이 없어요" subtitle="우측 상단에서 공급을 등록해 보세요." />
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {sorted.map((m) => {
            const client = clientById(m.clientId)
            return (
              <li key={m.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[1.07rem] font-bold text-navy-900">{client?.name ?? '알 수 없음'}</span>
                      {m.isAdditionalRequest && (
                        <span className="pill bg-amber-50 text-amber-700">추가요청</span>
                      )}
                    </div>
                    <p className="mt-0.5 t-caption">{prettyDate(m.date)}</p>
                  </div>
                  {/*  이제 실제로 지워지고 재고가 돌아옵니다(0023). 되돌릴 수
                       없으므로 무엇이 지워지는지 보여 주고 한 번 확인합니다. */}
                  <button
                    className="text-[0.98rem] font-medium text-navy-300 hover:text-rose-500"
                    onClick={() => {
                      const who = client?.name ?? '알 수 없음'
                      if (
                        window.confirm(
                          `${who} · ${prettyDate(m.date)} 공급 기록을 지웁니다.\n\n` +
                            `${
                              isLegacySupply(m)
                                ? `박스 ${m.boxCount} · 비닐 ${m.vinylCount} · 바늘통 ${m.needleBoxCount}`
                                : SUPPLY_ITEMS.filter((it) => (itemsOf(m)[it.key as ItemKey] ?? 0) > 0)
                                    .map((it) => `${it.label} ${itemsOf(m)[it.key as ItemKey]}`)
                                    .join(' · ')
                            }\n\n` +
                            '공급하며 깎였던 사무실 재고는 되돌립니다. 되돌릴 수 없습니다. 진행할까요?',
                        )
                      ) {
                        removeMaterial(m.id)
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
                {/*  ⚠ 0075 — 규격 그대로 적습니다. 「박스 12」로 뭉개면 63L 인지
                     12L 인지 알 수 없고, 그 둘은 매입가가 다릅니다.
                     규격이 없는 옛 기록은 **지어내지 않고** 그렇다고 말합니다. */}
                <div data-supply-line={m.id} className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[1.08rem] font-medium text-navy-500">
                  {isLegacySupply(m) ? (
                    <>
                      <span>박스 <b className="text-navy-900">{m.boxCount}</b></span>
                      <span>비닐 <b className="text-navy-900">{m.vinylCount}</b></span>
                      <span>바늘통 <b className="text-navy-900">{m.needleBoxCount}</b></span>
                      <span data-supply-legacy={m.id} className="pill bg-amber-50 text-amber-700">규격 미상</span>
                    </>
                  ) : (
                    SUPPLY_ITEMS.filter((it) => (itemsOf(m)[it.key as ItemKey] ?? 0) > 0).map((it) => (
                      <span key={it.key}>
                        {it.label} <b className="text-navy-900">{itemsOf(m)[it.key as ItemKey]}</b>
                      </span>
                    ))
                  )}
                </div>
                {m.memo && <p className="mt-1.5 t-caption">{m.memo}</p>}
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={open}
        title="자재 공급 등록"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setOpen(false)}>
              취소
            </button>
            <button className="btn-primary flex-1 disabled:opacity-40" disabled={overStock.length > 0} onClick={save}>
              저장
            </button>
          </>
        }
      >
        <div>
          <label className="field-label">거래처 *</label>
          <select
            className="field-input"
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          >
            <option value="">거래처를 선택하세요</option>
            {data.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">공급 날짜</label>
          <input
            type="date"
            className="field-input"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>
        {/*  ⚠ 규격 그대로 받습니다 — 정산이 규격마다 다른 단가를 씁니다.
             ＋ － 로 누르셔도 되고 숫자를 직접 치셔도 됩니다(QtyField).
             재고 칸별로 묶어, 어느 재고가 주는지 함께 보여 줍니다. */}
        <div data-supply-items className="flex flex-col gap-3">
          {GROUPS.map((g) => {
            const out = need[g.key]
            const have = data.officeStock?.[g.key] ?? 0
            return (
              <div key={g.key} data-supply-group={g.key} className="rounded-2xl border border-navy-100 p-3">
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                  <p className="text-[1.05rem] font-extrabold text-navy-900">{g.label}</p>
                  <span
                    data-supply-group-stock={g.key}
                    className={`t-caption tabular-nums ${out > have ? 'font-bold text-rose-600' : 'text-navy-500'}`}
                  >
                    창고 <b className="text-navy-800">{have}개</b>
                    {out > 0 && (
                      <>
                        {' → 이번 공급 '}
                        <b className="text-navy-800">{out}개</b>
                        {' → 저장 후 '}
                        <b className={have - out < 0 ? 'text-rose-600' : 'text-teal-700'}>{have - out}개</b>
                      </>
                    )}
                  </span>
                </div>
                <div className="divide-y divide-navy-50">
                  {g.items.map((it) => (
                    <div key={it.key} data-supply-item={it.key}>
                      <QtyField
                        row
                        label={it.label}
                        value={form.items[it.key as ItemKey] ?? 0}
                        badge={
                          <span className={`pill ${it.billable ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}>
                            {it.billable ? '유상' : '무상'}
                          </span>
                        }
                        onChange={(v) =>
                          setForm((f) => {
                            const items = { ...f.items }
                            if (v > 0) items[it.key as ItemKey] = v
                            else delete items[it.key as ItemKey]
                            return { ...f, items }
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {itemTotal === 0 && (
          <p className="t-caption break-keep text-navy-500">규격마다 몇 개를 드렸는지 넣어 주세요.</p>
        )}
        {overStock.length > 0 && (
          <p className="t-body break-keep rounded-2xl bg-rose-50 px-3.5 py-3 font-bold text-rose-600">
            사무실 재고보다 많이 공급할 수 없습니다 — {overStock.join(' · ')}
            <span className="mt-1 block font-medium">
              창고에 들어온 자재는 이 화면 맨 위 「사무실 자재 재고」에서 입고로 먼저 적어 주세요.
            </span>
          </p>
        )}
        <label className="flex items-center gap-2 text-[1.08rem] font-medium text-navy-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={form.isAdditionalRequest}
            onChange={(e) => setForm({ ...form, isAdditionalRequest: e.target.checked })}
          />
          추가요청 건
        </label>
        <div>
          <label className="field-label">메모</label>
          <textarea
            className="field-input"
            rows={2}
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  )
}
