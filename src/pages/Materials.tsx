import { useMemo, useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { MetricCard, EmptyState, SectionTitle } from '../components/ui'
import { MaterialRiskCard } from '../components/ops'
import { Modal } from '../components/Modal'
import { additionalMaterialCount } from '../lib/selectors'
import { materialUsage, type UsageStatus } from '../lib/ops'
import { num, prettyDate, thisMonth, today, weight } from '../lib/format'
import type { MaterialSupply } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 자재 관리 — 거래처별 자재공급 내역 / 박스·비닐·바늘통 입력 / 추가요청 통계
// ─────────────────────────────────────────────────────────────────────────────

const emptyForm = {
  clientId: '',
  date: today(),
  boxCount: 0,
  vinylCount: 0,
  needleBoxCount: 0,
  isAdditionalRequest: false,
  memo: '',
}

const usageStyle: Record<UsageStatus, string> = {
  정상: 'bg-emerald-50 text-emerald-600',
  '확인 필요': 'bg-amber-50 text-amber-600',
  '점검 필요': 'bg-rose-50 text-rose-500',
}

export function Materials() {
  const { data, addMaterial, removeMaterial, clientById } = useData()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Omit<MaterialSupply, 'id'>>(emptyForm)

  const sorted = useMemo(
    () => [...data.materials].sort((a, b) => b.date.localeCompare(a.date)),
    [data.materials],
  )

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
  const overStock = (() => {
    const stock = data.officeStock
    const need = {
      corrugatedBox: Number(form.boxCount) || 0,
      bag: Number(form.vinylCount) || 0,
      plasticContainer: Number(form.needleBoxCount) || 0,
    }
    const over = []
    if (need.corrugatedBox > (stock?.corrugatedBox ?? 0))
      over.push(`골판지 전용박스 (남은 ${stock?.corrugatedBox ?? 0}개)`)
    if (need.bag > (stock?.bag ?? 0)) over.push(`전용 봉투 (남은 ${stock?.bag ?? 0}개)`)
    if (need.plasticContainer > (stock?.plasticContainer ?? 0))
      over.push(`합성수지 전용용기 (남은 ${stock?.plasticContainer ?? 0}개)`)
    return over
  })()

  function save() {
    if (!form.clientId) return
    if (overStock.length > 0) return
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
    addMaterial({
      ...form,
      boxCount: Number(form.boxCount),
      vinylCount: Number(form.vinylCount),
      needleBoxCount: Number(form.needleBoxCount),
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
          <button className="btn-primary" onClick={() => { setForm(emptyForm); setOpen(true) }}>
            ＋ 공급 등록
          </button>
        }
      />

      {/* 이번 달 통계 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="이번 달 추가공급" value={addCount} unit="건" tone="amber" hint="월평균 4~5회" />
        <MetricCard label="박스 공급" value={num(totals.box)} unit="개" tone="navy" />
        <MetricCard label="비닐 공급" value={num(totals.vinyl)} unit="개" tone="navy" />
        <MetricCard label="바늘통 공급" value={num(totals.needle)} unit="개" tone="navy" />
      </div>

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
        <EmptyState icon={PackageSearch} title="자재공급 내역이 없어요" subtitle="우측 상단에서 공급을 등록해 보세요." />
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
                        <span className="pill bg-amber-50 text-amber-600">추가요청</span>
                      )}
                    </div>
                    <p className="mt-0.5 t-caption">{prettyDate(m.date)}</p>
                  </div>
                  <button className="text-[0.98rem] font-medium text-navy-300 hover:text-rose-500" onClick={() => removeMaterial(m.id)}>
                    삭제
                  </button>
                </div>
                <div className="mt-2.5 flex gap-4 text-[1.08rem] font-medium text-navy-500">
                  <span>박스 <b className="text-navy-900">{m.boxCount}</b></span>
                  <span>비닐 <b className="text-navy-900">{m.vinylCount}</b></span>
                  <span>바늘통 <b className="text-navy-900">{m.needleBoxCount}</b></span>
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
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">박스</label>
            <input
              type="number"
              className="field-input"
              value={form.boxCount}
              onChange={(e) => setForm({ ...form, boxCount: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="field-label">비닐</label>
            <input
              type="number"
              className="field-input"
              value={form.vinylCount}
              onChange={(e) => setForm({ ...form, vinylCount: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="field-label">바늘통</label>
            <input
              type="number"
              className="field-input"
              value={form.needleBoxCount}
              onChange={(e) => setForm({ ...form, needleBoxCount: Number(e.target.value) })}
            />
          </div>
        </div>
        {overStock.length > 0 && (
          <p className="t-body break-keep rounded-2xl bg-rose-50 px-3.5 py-3 font-bold text-rose-600">
            사무실 재고보다 많이 공급할 수 없습니다 — {overStock.join(' · ')}
            <span className="mt-1 block font-medium">
              창고에 들어온 자재는 설정 &gt; 사무실 자재 재고에서 입고로 먼저 적어 주세요.
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
