import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { FontSizeControl } from '../components/FontSizeControl'
import { InfoBanner } from '../components/InfoBanner'
import { exportData, parseImportFile } from '../lib/backup'

// ─────────────────────────────────────────────────────────────────────────────
// 더보기 — 부가 메뉴 및 설정 모음
//  · 자재 관리 / 미수금 관리 / 통계 바로가기
//  · 글자 크기 설정
//  · 데이터 백업/복원 (JSON 내보내기·가져오기)
//  · 샘플 데이터 초기화
//  · 시연용 안내
// ─────────────────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { to: '/materials', label: '자재 관리', icon: '⬚', desc: '박스·비닐·바늘통 공급 내역' },
  { to: '/receivables', label: '미수금 관리', icon: '₩', desc: '청구·입금 현황 및 미수금' },
  { to: '/stats', label: '통계', icon: '◔', desc: '수거량·거래처·차량 실적' },
]

export function More() {
  const { data, replaceAll, reset } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    try {
      const imported = await parseImportFile(file)
      if (window.confirm('가져온 데이터로 현재 데이터를 덮어쓸까요?')) {
        replaceAll(imported)
        flash('ok', '데이터를 성공적으로 가져왔습니다.')
      }
    } catch (err) {
      flash('err', err instanceof Error ? err.message : '가져오기에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="더보기" subtitle="부가 메뉴 및 설정" />

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-semibold ring-1 ${
            msg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
              : 'bg-rose-50 text-rose-600 ring-rose-100'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 바로가기 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-navy-500">메뉴</h2>
        <div className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <Link key={s.to} to={s.to} className="card flex items-center gap-3 p-4 transition hover:ring-teal-200">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-xl text-navy-600">
                {s.icon}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-navy-900">{s.label}</p>
                <p className="text-xs text-navy-400">{s.desc}</p>
              </div>
              <span className="ml-auto text-navy-300">›</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 글자 크기 설정 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-navy-500">글자 크기</h2>
        <div className="card p-4">
          <FontSizeControl />
          <p className="mt-3 text-xs text-navy-400">
            선택한 글자 크기는 이 기기에 저장되어 새로고침해도 유지됩니다.
          </p>
        </div>
      </section>

      {/* 데이터 백업/복원 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-navy-500">데이터 백업 / 복원</h2>
        <div className="card space-y-3 p-4">
          <button className="btn-navy w-full" onClick={() => exportData(data)}>
            ⬇ 전체 데이터 JSON 내보내기
          </button>
          <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}>
            ⬆ JSON 파일 가져오기
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          <p className="text-xs text-navy-400">
            Supabase 연동 전까지 시연 데이터를 JSON 파일로 보관·복원할 수 있습니다.
          </p>
        </div>
      </section>

      {/* 샘플 데이터 초기화 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-navy-500">초기화</h2>
        <div className="card flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-navy-700">샘플 데이터로 초기화</p>
            <p className="text-xs text-navy-400">모든 변경 내용을 지우고 초기 샘플로 되돌립니다.</p>
          </div>
          <button
            className="btn-danger shrink-0"
            onClick={() => {
              if (window.confirm('모든 데이터를 초기 샘플 상태로 되돌릴까요?')) {
                reset()
                flash('ok', '샘플 데이터로 초기화했습니다.')
              }
            }}
          >
            초기화
          </button>
        </div>
      </section>

      {/* 시연용 안내 */}
      <InfoBanner />

      <p className="pb-2 text-center text-xs text-navy-300">㈜비원미래 · beonemirae ops · 시연용 MVP</p>
    </div>
  )
}
