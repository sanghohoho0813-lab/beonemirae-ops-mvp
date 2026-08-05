import { useRef, useState } from 'react'
import {
  Type,
  Building2,
  Download,
  Upload,
  RotateCcw,
  CalendarClock,
  PlayCircle,
  Database,
  CheckCircle2,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { FontSizeControl } from '../components/FontSizeControl'
import { Modal } from '../components/Modal'
import { exportData, parseImportFile } from '../lib/backup'
import { CLIENT_SETS, type ClientSetSize } from '../lib/storage'
import { prettyDate, today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 설정 (/settings)
//  사이드바 「설정」에서 진입하는 운영자용 설정 화면.
//  · 화면 글자 크기 (기본 / 크게 / 매우 크게)
//  · 거래처 데이터 세트 (실제 5곳 / 시연 확장)
//  · 데이터 백업·복원 (JSON)
//  · 시연 데이터 관리 (초기화 · 오늘 일정 복원 · 새 세션)
//  · 전체 초기화 (되돌릴 수 없음)
//  · 시스템 정보 (저장 위치·보관 건수)
// ─────────────────────────────────────────────────────────────────────────────

/** 설정 화면 공통 카드 — 아이콘 + 제목 + 설명 + 본문 */
function SettingCard({
  icon: Icon,
  title,
  desc,
  tone = 'navy',
  children,
}: {
  icon: LucideIcon
  title: string
  desc: string
  tone?: 'navy' | 'teal' | 'amber' | 'rose'
  children: React.ReactNode
}) {
  const toneStyle = {
    navy: 'bg-navy-50 text-navy-600',
    teal: 'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-500',
  }[tone]
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneStyle}`}>
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="t-card text-navy-900">{title}</h2>
          <p className="t-muted mt-1">{desc}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Settings() {
  const { data, clientSet, setClientSet, replaceAll, reset, resetDemo, restoreToday, startDemo } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [confirmKind, setConfirmKind] = useState<null | 'demo' | 'reset'>(null)

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3200)
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
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

  const counts = [
    { label: '거래처', value: data.clients.length },
    { label: '수거 일정', value: data.schedules.length },
    { label: '수거 입력 이력', value: data.events?.length ?? 0 },
    { label: '현장 메모', value: data.notes?.length ?? 0 },
  ]

  return (
    <PageShell>
      <PageHeader title="설정" subtitle="화면 표시 · 데이터 관리 설정 (이 기기에 저장됩니다)" />

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-2xl px-4 py-3.5 ${
            msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
          <span className="t-body font-bold">{msg.text}</span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start xl:gap-5">
        {/* ── 좌: 화면 표시 ── */}
        <div className="space-y-4 xl:space-y-5">
          <SettingCard
            icon={Type}
            title="화면 글자 크기"
            desc="앱 전체 글자 크기를 조절합니다. 선택 즉시 반영되고 이 기기에 저장됩니다."
            tone="teal"
          >
            <FontSizeControl />
            {/* 실제 적용 결과를 바로 확인할 수 있는 미리보기 */}
            <div className="mt-4 rounded-2xl bg-navy-50 p-4">
              <p className="t-muted mb-1.5 font-bold">미리보기</p>
              <p className="t-card text-navy-900">의료법인한양의료재단</p>
              <p className="t-body mt-1 text-navy-600">오늘 수거 293kg · 인계 완료 · 다음 방문 시 전용용기 3개 공급</p>
            </div>
          </SettingCard>

          <SettingCard
            icon={Building2}
            title="거래처 데이터 세트"
            desc="화면에 표시할 거래처 범위입니다. 기본 5곳은 실제 주요거래처, 확장분은 서울·경기권 시연용 데이터입니다."
          >
            <div className="flex gap-1 rounded-2xl bg-navy-50 p-1">
              {CLIENT_SETS.map((s) => {
                const active = clientSet === s.demoCount
                return (
                  <button
                    key={s.demoCount}
                    onClick={() => setClientSet(s.demoCount as ClientSetSize)}
                    className={`flex-1 rounded-xl py-2.5 text-center text-[0.95rem] font-extrabold transition active:scale-[0.98] ${
                      active ? 'bg-white text-teal-600 shadow-sm' : 'text-navy-500 hover:text-navy-700'
                    }`}
                  >
                    {s.total}곳
                  </button>
                )
              })}
            </div>
            <p className="t-muted mt-2.5">
              현재 선택: {CLIENT_SETS.find((s) => s.demoCount === clientSet)?.label ?? '실제 주요거래처 5곳'}
            </p>
          </SettingCard>

          <SettingCard
            icon={Database}
            title="시스템 정보"
            desc="이 기기 브라우저에 저장된 운영 데이터 현황입니다. (Supabase 연동은 개발 예정)"
          >
            <div className="grid grid-cols-2 gap-2.5">
              {counts.map((c) => (
                <div key={c.label} className="rounded-2xl bg-navy-50 px-4 py-3">
                  <p className="t-muted font-bold">{c.label}</p>
                  <p className="t-kpi-sm mt-1 text-navy-900">{c.value.toLocaleString('ko-KR')}</p>
                </div>
              ))}
            </div>
            <p className="t-muted mt-3">저장 위치: 이 브라우저(localStorage) · 기준일 {prettyDate(today())}</p>
          </SettingCard>
        </div>

        {/* ── 우: 데이터 관리 ── */}
        <div className="space-y-4 xl:space-y-5">
          <SettingCard
            icon={Download}
            title="데이터 백업 · 복원"
            desc="전체 운영 데이터를 JSON 파일로 내보내거나, 백업 파일에서 되돌릴 수 있습니다."
          >
            <div className="space-y-2.5">
              <button className="btn-navy w-full" onClick={() => exportData(data)}>
                <Download size={18} strokeWidth={2.4} /> 전체 데이터 JSON 내보내기
              </button>
              <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}>
                <Upload size={18} strokeWidth={2.4} /> JSON 파일 가져오기
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
            </div>
            <p className="t-muted mt-3">가져오기를 실행하면 현재 데이터를 덮어씁니다. 먼저 내보내기로 백업해 두세요.</p>
          </SettingCard>

          <SettingCard
            icon={PlayCircle}
            title="시연 데이터 관리"
            desc="시연용 변경만 기준 상태로 되돌립니다. 실제 거래처 기본정보는 유지됩니다."
            tone="amber"
          >
            <div className="space-y-2.5">
              <button className="btn-ghost w-full justify-start" onClick={() => setConfirmKind('demo')}>
                <RotateCcw size={17} strokeWidth={2.4} /> 시연 상태 초기화
              </button>
              <button
                className="btn-ghost w-full justify-start"
                onClick={() => {
                  restoreToday()
                  flash('ok', '오늘 일정이 기준값으로 복원되었습니다.')
                }}
              >
                <CalendarClock size={17} strokeWidth={2.4} /> 오늘 일정만 복원
              </button>
              <button
                className="btn-ghost w-full justify-start"
                onClick={() => {
                  startDemo()
                  flash('ok', '새 시연 세션이 시작되었습니다.')
                }}
              >
                <PlayCircle size={17} strokeWidth={2.4} /> 시연 시작 (새 세션)
              </button>
            </div>
          </SettingCard>

          <SettingCard
            icon={AlertTriangle}
            title="전체 초기화"
            desc="모든 입력 내용을 지우고 초기 샘플 상태로 되돌립니다. 되돌릴 수 없습니다."
            tone="rose"
          >
            <button className="btn-danger w-full" onClick={() => setConfirmKind('reset')}>
              <RotateCcw size={17} strokeWidth={2.4} /> 샘플 데이터로 전체 초기화
            </button>
            <p className="t-muted mt-3">실행 전에 위의 「전체 데이터 JSON 내보내기」로 백업하는 것을 권장합니다.</p>
          </SettingCard>
        </div>
      </div>

      <Modal
        open={confirmKind !== null}
        title={confirmKind === 'reset' ? '전체 초기화' : '시연 상태 초기화'}
        onClose={() => setConfirmKind(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setConfirmKind(null)}>
              취소
            </button>
            <button
              className={confirmKind === 'reset' ? 'btn-danger flex-1' : 'btn-primary flex-1'}
              onClick={() => {
                if (confirmKind === 'reset') {
                  reset()
                  flash('ok', '샘플 데이터로 초기화했습니다.')
                } else {
                  resetDemo()
                  flash('ok', '시연 상태가 기본값으로 복원되었습니다.')
                }
                setConfirmKind(null)
              }}
            >
              초기화
            </button>
          </>
        }
      >
        <p className="t-body leading-relaxed text-navy-700">
          {confirmKind === 'reset'
            ? '입력한 수거 기록·메모·거래처 변경을 모두 지우고 초기 샘플 상태로 되돌립니다. 되돌릴 수 없습니다.'
            : '시연용 데이터만 기본 상태로 되돌립니다. 실제 거래처 기본정보와 거래처 세트는 유지됩니다.'}
        </p>
      </Modal>
    </PageShell>
  )
}
