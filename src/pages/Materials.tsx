import { useMemo, useState } from 'react'
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

  function save() {
    if (!form.clientId) return
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
          <p className="mb-3 text-[0.9rem] leading-snug text-navy-400">
            자재 공급량과 실제 배출량(수거량)을 비교하여 과다 사용 또는 관리 누락 가능성을 확인합니다. 확정적 판단이 아닌
            <b className="text-navy-500"> 점검용 지표</b>입니다.
          </p>
          {usage.length === 0 ? (
            <p className="rounded-xl bg-navy-50 px-3.5 py-3 text-[0.95rem] text-navy-400">이번 달 공급 내역이 쌓이면 비교가 표시됩니다.</p>
          ) : (
            <div className="space-y-2">
              {usage.map((u) => (
                <div key={u.clientId} className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-navy-800">{u.clientName}</p>
                    <p className="mt-0.5 text-[0.85rem] font-medium text-navy-500">
                      공급 {u.suppliedUnits}단위 · 배출 {weight(u.dischargedKg)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.85rem] font-bold ${usageStyle[u.status]}`}>{u.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <h2 className="mb-2.5 px-1 text-[0.9375rem] font-bold text-navy-700">공급 내역</h2>
      {sorted.length === 0 ? (
        <EmptyState icon="📦" title="자재공급 내역이 없어요" subtitle="우측 상단에서 공급을 등록해 보세요." />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {sorted.map((m) => {
            const client = clientById(m.clientId)
            return (
              <li key={m.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[0.9375rem] font-bold text-navy-900">{client?.name ?? '알 수 없음'}</span>
                      {m.isAdditionalRequest && (
                        <span className="pill bg-amber-50 text-amber-600">추가요청</span>
                      )}
                    </div>
                    <p className="mt-0.5 t-caption">{prettyDate(m.date)}</p>
                  </div>
                  <button className="text-[0.85rem] font-medium text-navy-300 hover:text-rose-500" onClick={() => removeMaterial(m.id)}>
                    삭제
                  </button>
                </div>
                <div className="mt-2.5 flex gap-4 text-[0.95rem] font-medium text-navy-500">
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
            <button className="btn-primary flex-1" onClick={save}>
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
        <label className="flex items-center gap-2 text-[0.95rem] font-medium text-navy-700">
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
