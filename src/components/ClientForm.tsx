import type { Client, ClientType, StorageSize } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 추가/수정 폼 — 거래처 목록·상세에서 공용
// ─────────────────────────────────────────────────────────────────────────────

export const CLIENT_TYPES: ClientType[] = [
  '병원',
  '요양병원',
  '의원',
  '장례식장',
  '요양원',
  '치과',
  '한의원',
  '한방병원',
]
export const STORAGE_SIZES: StorageSize[] = ['큼', '보통', '작음']

export const emptyClientForm: Omit<Client, 'id'> = {
  name: '',
  type: '병원',
  address: '',
  manager: '관리팀',
  phone: '',
  collectionCycle: '주 1회',
  collectsMedicalWaste: true,
  collectsDiaper: false,
  storageSize: '보통',
  note: '',
  isDemoGenerated: false,
  contractStart: null,
  contractEnd: null,
  paymentTerms: '',
  paymentDueDay: null,
}

export function ClientForm({
  form,
  setForm,
}: {
  form: Omit<Client, 'id'>
  setForm: (f: Omit<Client, 'id'>) => void
}) {
  const set = <K extends keyof Omit<Client, 'id'>>(key: K, value: Omit<Client, 'id'>[K]) =>
    setForm({ ...form, [key]: value })

  return (
    <>
      <div>
        <label className="field-label">거래처명 *</label>
        <input className="field-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">유형</label>
          <select className="field-input" value={form.type} onChange={(e) => set('type', e.target.value as ClientType)}>
            {CLIENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">창고 크기</label>
          <select className="field-input" value={form.storageSize} onChange={(e) => set('storageSize', e.target.value as StorageSize)}>
            {STORAGE_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="field-label">주소</label>
        <input className="field-input" value={form.address} onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">담당자</label>
          <input className="field-input" value={form.manager} onChange={(e) => set('manager', e.target.value)} />
        </div>
        <div>
          <label className="field-label">연락처</label>
          <input className="field-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field-label">수거주기</label>
        <input
          className="field-input"
          value={form.collectionCycle}
          onChange={(e) => set('collectionCycle', e.target.value)}
          placeholder="예: 주 2회"
        />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-[1.08rem] font-medium text-navy-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={form.collectsMedicalWaste}
            onChange={(e) => set('collectsMedicalWaste', e.target.checked)}
          />
          의료폐기물 수거
        </label>
        <label className="flex items-center gap-2 text-[1.08rem] font-medium text-navy-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={form.collectsDiaper}
            onChange={(e) => set('collectsDiaper', e.target.checked)}
          />
          일회용기저귀 수거
        </label>
      </div>
      {/* 계약 — 매달 다시 적지 않도록 여기서 한 번만 정합니다.
          거래명세서의 결제기한과 계약 만료 안내가 이 값에서 나옵니다. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">계약 시작일</label>
          <input
            type="date"
            className="field-input"
            value={form.contractStart ?? ''}
            onChange={(e) => set('contractStart', e.target.value || null)}
          />
        </div>
        <div>
          <label className="field-label">계약 종료일</label>
          <input
            type="date"
            className="field-input"
            value={form.contractEnd ?? ''}
            onChange={(e) => set('contractEnd', e.target.value || null)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">결제일 (익월 며칠)</label>
          <input
            type="number"
            inputMode="numeric"
            className="field-input"
            value={form.paymentDueDay ?? ''}
            onChange={(e) => set('paymentDueDay', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="예: 20"
          />
        </div>
        <div>
          <label className="field-label">결제조건</label>
          <input
            className="field-input"
            value={form.paymentTerms ?? ''}
            onChange={(e) => set('paymentTerms', e.target.value)}
            placeholder="예: 현금 (상호로 입금)"
          />
        </div>
      </div>
      <div>
        <label className="field-label">특이사항</label>
        <textarea className="field-input" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
      </div>
    </>
  )
}
