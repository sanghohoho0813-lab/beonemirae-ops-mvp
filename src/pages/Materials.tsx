import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { MetricCard, EmptyState } from '../components/ui'
import { Modal } from '../components/Modal'
import { additionalMaterialCount } from '../lib/selectors'
import { num, prettyDate, thisMonth, today } from '../lib/format'
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
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="이번 달 추가공급" value={addCount} unit="건" tone="amber" hint="월평균 4~5회" />
        <MetricCard label="박스 공급" value={num(totals.box)} unit="개" tone="navy" />
        <MetricCard label="비닐 공급" value={num(totals.vinyl)} unit="개" tone="navy" />
        <MetricCard label="바늘통 공급" value={num(totals.needle)} unit="개" tone="navy" />
      </div>

      <h2 className="mb-2.5 px-1 text-[15px] font-bold text-navy-700">공급 내역</h2>
      {sorted.length === 0 ? (
        <EmptyState icon="📦" title="자재공급 내역이 없어요" subtitle="우측 상단에서 공급을 등록해 보세요." />
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((m) => {
            const client = clientById(m.clientId)
            return (
              <li key={m.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-navy-900">{client?.name ?? '알 수 없음'}</span>
                      {m.isAdditionalRequest && (
                        <span className="pill bg-amber-50 text-amber-600">추가요청</span>
                      )}
                    </div>
                    <p className="mt-0.5 t-caption">{prettyDate(m.date)}</p>
                  </div>
                  <button className="text-xs font-medium text-navy-300 hover:text-rose-500" onClick={() => removeMaterial(m.id)}>
                    삭제
                  </button>
                </div>
                <div className="mt-2.5 flex gap-4 text-sm font-medium text-navy-500">
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
        <label className="flex items-center gap-2 text-sm font-medium text-navy-700">
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
