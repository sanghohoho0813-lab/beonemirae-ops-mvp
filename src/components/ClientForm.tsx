import type { Client, ClientType, StorageSize, VatMode } from '../types'

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
  bizNo: '',
  bizCeo: '',
  bizType: '',
  bizItem: '',
  taxEmail: '',
  vatMode: null,
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
      <TaxFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />

      <div>
        <label className="field-label">특이사항</label>
        <textarea className="field-input" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 세금계산서 칸
//
//  매달 홈택스에 옮겨 적던 값입니다. 한 번 넣어 두면 월말 청구 화면에서
//  발행 목록이 바로 나옵니다.
//
//  부가세는 시스템이 정하지 않습니다. 청구액이 공급가액인지 부가세가 든
//  합계인지는 계약마다 다르고, 임의로 10%를 붙이면 틀린 계산서가 나갑니다.
//  비워 두면 발행 목록에서 「확인 필요」로 빠집니다.
//
//  거래처 등록 폼과 거래처 점검 화면이 같은 칸을 씁니다 — 두 벌로 두면
//  한쪽만 고쳐집니다.
// ─────────────────────────────────────────────────────────────────────────────

export type TaxFieldValues = Pick<Client, 'bizNo' | 'bizCeo' | 'bizType' | 'bizItem' | 'taxEmail' | 'vatMode'>

export function TaxFields({
  value,
  onChange,
  title = '세금계산서 (비워 두어도 됩니다)',
}: {
  value: TaxFieldValues
  onChange: (patch: Partial<TaxFieldValues>) => void
  title?: string
}) {
  return (
    <div className="rounded-xl bg-navy-50/60 p-3.5">
      <p className="t-label mb-2 text-navy-500">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">사업자등록번호</label>
          <input
            data-tax-field="bizNo"
            className="field-input"
            value={value.bizNo ?? ''}
            onChange={(e) => onChange({ bizNo: e.target.value })}
            placeholder="123-45-67890"
          />
        </div>
        <div>
          <label className="field-label">대표자명</label>
          <input
            data-tax-field="bizCeo"
            className="field-input"
            value={value.bizCeo ?? ''}
            onChange={(e) => onChange({ bizCeo: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">업태</label>
          <input
            data-tax-field="bizType"
            className="field-input"
            value={value.bizType ?? ''}
            onChange={(e) => onChange({ bizType: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">종목</label>
          <input
            data-tax-field="bizItem"
            className="field-input"
            value={value.bizItem ?? ''}
            onChange={(e) => onChange({ bizItem: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">계산서 이메일</label>
          <input
            data-tax-field="taxEmail"
            className="field-input"
            value={value.taxEmail ?? ''}
            onChange={(e) => onChange({ taxEmail: e.target.value })}
            placeholder="tax@hospital.kr"
          />
        </div>
        <div>
          <label className="field-label">부가세</label>
          <select
            data-tax-field="vatMode"
            className="field-input"
            value={value.vatMode ?? ''}
            onChange={(e) => onChange({ vatMode: e.target.value === '' ? null : (e.target.value as VatMode) })}
          >
            <option value="">미지정 (확인 필요)</option>
            <option value="별도">별도 — 청구액이 공급가액</option>
            <option value="포함">포함 — 청구액이 합계</option>
            <option value="면세">면세</option>
          </select>
        </div>
      </div>
    </div>
  )
}
