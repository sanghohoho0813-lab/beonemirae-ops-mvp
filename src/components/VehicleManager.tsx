import { useState } from 'react'
import { Plus, Trash2, Truck } from 'lucide-react'
import { useData } from '../context/DataContext'
import type { Vehicle, WasteType } from '../types'
import { Modal } from './Modal'

// ─────────────────────────────────────────────────────────────────────────────
// 차량 관리
//
//  차량이 한 대도 없으면 수거 완료 입력이 아예 불가능합니다(배차 차량 필수).
//  실사용 전환 후 SQL 을 직접 쓰지 않고 앱에서 등록할 수 있어야 해서 추가했습니다.
//  삭제는 비활성화로 처리해 과거 배차 이력이 끊기지 않게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY: Omit<Vehicle, 'id'> = {
  name: '',
  wasteType: '의료폐기물',
  tonnage: 1,
  nominalCapacity: 1000,
  expectedCapacity: 800,
  driver: '',
}

export function VehicleManager() {
  const { data, addVehicle, updateVehicle, removeVehicle } = useData()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Vehicle, 'id'>>(EMPTY)

  const startAdd = () => {
    setEditing(null)
    setForm(EMPTY)
    setOpen(true)
  }
  const startEdit = (v: Vehicle) => {
    setEditing(v.id)
    const { id: _id, ...rest } = v
    setForm(rest)
    setOpen(true)
  }
  const save = () => {
    if (!form.name.trim()) return
    if (editing) updateVehicle(editing, form)
    else addVehicle(form)
    setOpen(false)
  }

  const set = <K extends keyof Omit<Vehicle, 'id'>>(k: K, v: Omit<Vehicle, 'id'>[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-3">
      {data.vehicles.length === 0 && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3.5">
          <p className="t-body break-keep font-bold text-amber-800">
            등록된 차량이 없습니다. 차량이 없으면 수거 완료 입력을 할 수 없습니다.
          </p>
          <p className="t-muted mt-1 break-keep text-amber-700">
            실제로 운행하는 차량을 먼저 등록해 주세요. 의료폐기물 차량과 일회용기저귀 차량은 서로 배차할 수
            없으므로 구분을 정확히 선택해야 합니다.
          </p>
        </div>
      )}

      <div className="divide-y divide-navy-50 overflow-hidden rounded-2xl bg-navy-50/60">
        {data.vehicles.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-white px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
              <Truck size={20} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1 basis-[9rem]">
              <p className="t-body break-keep font-extrabold text-navy-900">{v.name}</p>
              <p className="t-muted break-keep">
                {v.wasteType} · {v.tonnage}톤 · 최대 {v.nominalCapacity.toLocaleString('ko-KR')}kg
                {v.driver ? ` · ${v.driver}` : ''}
              </p>
            </div>
            <button onClick={() => startEdit(v)} className="btn-ghost shrink-0">
              수정
            </button>
            <button
              onClick={() => {
                if (window.confirm(`${v.name} 차량을 사용 중지할까요? 과거 수거 이력은 그대로 남습니다.`))
                  removeVehicle(v.id)
              }}
              title="사용 중지 (이력은 유지)"
              className="shrink-0 rounded-2xl bg-rose-50 p-3 text-rose-500 transition hover:bg-rose-100"
            >
              <Trash2 size={18} strokeWidth={2.2} />
            </button>
          </div>
        ))}
      </div>

      <button onClick={startAdd} className="btn-primary w-full">
        <Plus size={19} strokeWidth={2.6} /> 차량 추가
      </button>

      <Modal
        open={open}
        title={editing ? '차량 수정' : '차량 추가'}
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
        <div className="space-y-3">
          <div>
            <label className="field-label" htmlFor="v-name">
              차량명 *
            </label>
            <input
              id="v-name"
              className="field-input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="예: 의료폐기물 1호"
            />
          </div>

          <div>
            <label className="field-label">폐기물 구분 *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['의료폐기물', '일회용기저귀'] as WasteType[]).map((w) => (
                <button
                  key={w}
                  onClick={() => set('wasteType', w)}
                  className={`rounded-2xl px-4 py-3.5 text-[1.05rem] font-extrabold transition ${
                    form.wasteType === w ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <p className="t-muted mt-1.5 break-keep">
              이 구분과 다른 폐기물은 배차할 수 없습니다(수거 입력에서 자동 차단).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="v-ton">
                톤수
              </label>
              <input
                id="v-ton"
                type="number"
                step="0.5"
                min={0}
                inputMode="decimal"
                className="field-input"
                value={form.tonnage}
                onChange={(e) => set('tonnage', Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="v-driver">
                담당 기사
              </label>
              <input
                id="v-driver"
                className="field-input"
                value={form.driver}
                onChange={(e) => set('driver', e.target.value)}
                placeholder="예: 김기사"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="v-nom">
                최대 적재량 (kg)
              </label>
              <input
                id="v-nom"
                type="number"
                min={0}
                inputMode="numeric"
                className="field-input"
                value={form.nominalCapacity}
                onChange={(e) => set('nominalCapacity', Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="v-exp">
                실제 예상 적재량 (kg)
              </label>
              <input
                id="v-exp"
                type="number"
                min={0}
                inputMode="numeric"
                className="field-input"
                value={form.expectedCapacity}
                onChange={(e) => set('expectedCapacity', Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
