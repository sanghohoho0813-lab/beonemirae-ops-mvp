import { useState } from 'react'
import { StickyNote, Plus, Check, X, Package, Phone, AlertTriangle, Truck, MoreHorizontal } from 'lucide-react'
import { useData } from '../context/DataContext'
import type { NoteKind, SiteNote } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 현장 메모 / 특이사항
//  현장에서 수기로 적거나 담당자가 기억하던 병원별 유의사항을 한 번 기록하면
//  거래처 상세·오늘 일정·수거 입력·대시보드에서 함께 확인됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export const NOTE_KINDS: NoteKind[] = ['수거요청', '자재', '연락', '주의', '기타']

export const noteMeta: Record<NoteKind, { icon: typeof Package; chip: string }> = {
  수거요청: { icon: Truck, chip: 'bg-teal-50 text-teal-700' },
  자재: { icon: Package, chip: 'bg-sky-50 text-sky-700' },
  연락: { icon: Phone, chip: 'bg-navy-100 text-navy-600' },
  주의: { icon: AlertTriangle, chip: 'bg-amber-50 text-amber-700' },
  기타: { icon: MoreHorizontal, chip: 'bg-navy-100 text-navy-600' },
}

/** 다른 화면(오늘 일정·수거 입력·대시보드)에서 쓰는 읽기 전용 요약 */
export function NoteChips({ notes, max = 2 }: { notes: SiteNote[]; max?: number }) {
  const open = notes.filter((n) => !n.done)
  if (open.length === 0) return null
  const shown = open.slice(0, max)
  return (
    <div className="mt-2 space-y-1.5">
      {shown.map((n) => {
        const m = noteMeta[n.kind]
        const Icon = m.icon
        return (
          <p
            key={n.id}
            className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[0.82rem] font-semibold leading-snug ${m.chip}`}
          >
            <Icon size={15} strokeWidth={2.4} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-keep">{n.content}</span>
          </p>
        )
      })}
      {open.length > max && (
        <p className="px-1 text-[0.8rem] font-semibold text-navy-400">+ 현장 메모 {open.length - max}건 더</p>
      )}
    </div>
  )
}

/** 거래처 상세에서 쓰는 편집 가능한 메모 목록 */
export function SiteNotesPanel({ clientId }: { clientId: string }) {
  const { notesFor, addNote, toggleNote, removeNote } = useData()
  const notes = notesFor(clientId)
  const [kind, setKind] = useState<NoteKind>('수거요청')
  const [text, setText] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    addNote(clientId, kind, text)
    setText('')
  }

  return (
    <div className="card p-5 sm:p-6">
      {/* 입력 */}
      <form onSubmit={submit}>
        <div className="flex flex-wrap gap-2">
          {NOTE_KINDS.map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-4 py-2 text-[0.85rem] font-bold transition ${
                kind === k ? 'bg-teal-500 text-white' : 'bg-navy-50 text-navy-500 hover:bg-navy-100'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예) 다음 방문 시 20L 용기 3개 추가"
            className="field-input min-w-0 flex-1"
          />
          <button type="submit" disabled={!text.trim()} className="btn-primary shrink-0 px-5">
            <Plus size={19} strokeWidth={2.6} /> 기록
          </button>
        </div>
      </form>

      {/* 목록 */}
      <div className="mt-5 space-y-2">
        {notes.length === 0 ? (
          <p className="rounded-2xl bg-navy-50 px-4 py-5 text-center t-body text-navy-400">
            기록된 현장 메모가 없습니다. 현장에서 확인한 특이사항을 남겨보세요.
          </p>
        ) : (
          notes.map((n) => {
            const m = noteMeta[n.kind]
            const Icon = m.icon
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 transition ${
                  n.done ? 'bg-navy-50/60' : 'bg-navy-50'
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.chip}`}>
                  <Icon size={17} strokeWidth={2.3} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`t-body font-semibold ${n.done ? 'text-navy-400 line-through' : 'text-navy-800'}`}
                  >
                    {n.content}
                  </p>
                  <p className="mt-1 text-[0.8rem] text-navy-400">
                    {n.kind} · {n.createdAt.slice(5, 10).replace('-', '/')} 기록
                  </p>
                </div>
                <button
                  onClick={() => toggleNote(n.id)}
                  title={n.done ? '미완료로 되돌리기' : '처리 완료'}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                    n.done ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-navy-400 hover:text-emerald-600'
                  }`}
                >
                  <Check size={17} strokeWidth={2.6} />
                </button>
                <button
                  onClick={() => removeNote(n.id)}
                  title="삭제"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-navy-300 transition hover:text-rose-500"
                >
                  <X size={17} strokeWidth={2.6} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <p className="mt-3 flex items-start gap-2 t-muted">
        <StickyNote size={15} className="mt-0.5 shrink-0" />
        여기 기록한 메모는 오늘 일정·수거 입력·대시보드에서도 함께 표시됩니다.
      </p>
    </div>
  )
}
