import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TourButton } from '../components/TourEntry'
import {
  Type,
  Building2,
  Download,
  Upload,
  RotateCcw,
  CalendarClock,
  PlayCircle,
  FlaskConical,
  Database,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Users,
  Truck,
  KeyRound,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { UserManagementCard, ImportLocalCard } from '../components/AdminPanels'
import { VehicleManager } from '../components/VehicleManager'
import { PasswordCard } from '../components/PasswordCard'
import { DEMO_BASELINE, EMPTY_BASELINE, type BaselineMetrics } from '../types'
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

/** 도입 전 기준값 5종 — 라벨/단위/설명은 정책자금 심사 설명과 동일한 문구를 씁니다. */
const BASELINE_FIELDS: { key: keyof Omit<BaselineMetrics, 'source' | 'updatedAt'>; label: string; unit: string; hint: string }[] = [
  { key: 'adminMinutesPerCollection', label: '수거 1건 후 행정업무', unit: '분', hint: '수거 1건을 마친 뒤 장부·문서 정리에 걸리던 평균 시간' },
  { key: 'repeatEntriesPerCollection', label: '동일 정보 반복 입력', unit: '회', hint: '같은 수거 정보를 여러 장부·파일에 다시 적던 횟수' },
  { key: 'monthlyDocHours', label: '월간 문서 작성시간', unit: '시간', hint: '수거대장·월간 명세 등 문서 정리에 쓰던 월 합계 시간' },
  { key: 'monthlyReworkCount', label: '월간 누락·재확인', unit: '건', hint: '기록 누락·재확인·재작성이 발생하던 월 건수' },
  { key: 'dailyCapacity', label: '하루 평균 처리건수', unit: '건', hint: '하루에 처리하던 수거 건수' },
]

export function Settings() {
  const {
    data,
    clientSet,
    setClientSet,
    replaceAll,
    reset,
    resetDemo,
    restoreToday,
    startDemo,
    setBaseline,
    setExperimentStart,
    setDemoActive,
  } = useData()
  const { mode, profile } = useAuth()
  const live = mode === 'live'
  const demoActive = data.demoSession?.active !== false
  const navigate = useNavigate()
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

      {/* 사용 방법 — 언제든 다시 실행 */}
      <section className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-5 sm:p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <PlayCircle size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="t-card break-keep text-navy-900">사용 방법 다시 보기</h2>
          <p className="t-muted mt-1 break-keep">
            화면을 하나씩 짚어가며 "왜 필요한지 · 어떻게 쓰는지 · 무엇이 바뀌는지"를 안내합니다. 역할에 맞는
            내용으로 보여집니다.
          </p>
        </div>
        <TourButton className="btn-primary shrink-0" label="사용 방법 보기" />
      </section>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start xl:gap-5">
        {/* ── 좌: 성과측정 · 화면 표시 ── */}
        <div className="space-y-4 xl:space-y-5">
          {/* AX 실증 — 도입 전 기준값 (반드시 사용자가 입력. 시스템이 임의 생성하지 않음) */}
          <section id="baseline" className="card p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                <Gauge size={22} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="t-card text-navy-900">AX 실증 · 도입 전 기준값</h2>
                <p className="t-muted mt-1">
                  이 시스템을 쓰기 전의 실제 업무 값을 입력하세요. 도입 후 성과와 비교하는 기준이 됩니다.
                </p>
              </div>
            </div>

            {/* 실증 시작일 */}
            <div className="mt-4 rounded-2xl bg-navy-50 p-4">
              <label className="field-label" htmlFor="exp-start">
                실증 시작일
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="exp-start"
                  type="date"
                  className="field-input max-w-[14rem]"
                  value={data.experiment.startDate ?? ''}
                  onChange={(e) => setExperimentStart(e.target.value || null)}
                />
                {data.experiment.startDate && (
                  <button className="btn-ghost" onClick={() => setExperimentStart(null)}>
                    해제
                  </button>
                )}
              </div>
              <p className="t-muted mt-2">이 날짜 이후의 입력만 「도입 후 성과」로 집계합니다. 미설정 시 전체 기간을 집계합니다.</p>
            </div>

            {/* 기준값 5종 */}
            <div className="mt-4 space-y-3">
              {BASELINE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="field-label" htmlFor={`bl-${f.key}`}>
                    {f.label} <span className="font-medium text-navy-400">({f.unit})</span>
                  </label>
                  <input
                    id={`bl-${f.key}`}
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    className="field-input"
                    placeholder="미입력"
                    value={data.baseline[f.key] ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      setBaseline({ [f.key]: raw === '' ? null : Number(raw), source: 'user' } as Partial<BaselineMetrics>)
                    }}
                  />
                  <p className="t-muted mt-1.5">{f.hint}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`pill ${data.baseline.source === 'demo' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}
              >
                {data.baseline.source === 'demo' ? '시연 기준값' : '사용자 입력값'}
              </span>
              <button className="btn-ghost" onClick={() => setBaseline({ ...DEMO_BASELINE })}>
                시연용 예시값 채우기
              </button>
              <button className="btn-ghost" onClick={() => setBaseline({ ...EMPTY_BASELINE })}>
                기준값 비우기
              </button>
            </div>
            <p className="t-muted mt-2.5">
              「시연용 예시값」을 쓰면 출처가 <b>시연 기준값</b>으로 표시됩니다. 심사 제출 시에는 실제 업무 값을 직접
              입력해 주세요.
            </p>

            <button className="btn-primary mt-4 w-full" onClick={() => navigate('/performance')}>
              AX 도입 성과 보기 <ArrowRight size={17} strokeWidth={2.4} />
            </button>
          </section>

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
                    className={`flex-1 rounded-xl py-2.5 text-center text-[1.08rem] font-extrabold transition active:scale-[0.98] ${
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

          {/* 차량 — 한 대도 없으면 수거 완료 입력이 불가능합니다 */}
          <SettingCard
            icon={Truck}
            title="운행 차량"
            desc="수거에 사용하는 차량을 등록합니다. 차량이 없으면 수거 입력을 할 수 없습니다."
            tone={data.vehicles.length === 0 ? 'amber' : 'navy'}
          >
            <VehicleManager />
          </SettingCard>

          {/* 본인 비밀번호 변경 (실제 운영 모드에서만) */}
          {live && (
            <SettingCard
              icon={KeyRound}
              title="내 비밀번호"
              desc="본인 계정의 비밀번호를 변경합니다."
              tone="navy"
            >
              <PasswordCard />
            </SettingCard>
          )}

          {/* ── 실사용 전환: 사용자 계정 / 데이터 가져오기 ── */}
          {live && (
            <>
              <SettingCard
                icon={Users}
                title="사용자 계정"
                desc="직원 계정의 역할과 사용 여부를 관리합니다."
                tone="navy"
              >
                <UserManagementCard />
              </SettingCard>

              <SettingCard
                icon={Database}
                title="브라우저 데이터 가져오기"
                desc="이 브라우저에 저장된 실제 데이터를 확인한 뒤 서버로 올립니다."
                tone="teal"
              >
                <ImportLocalCard />
              </SettingCard>
            </>
          )}

          {/* 성과 실증의 기준 — 시연 모드에서만 의미가 있습니다.
              실제 운영(live)에서는 모든 입력이 항상 실제 현장 데이터입니다. */}
          {!live && (
          <SettingCard
            icon={FlaskConical}
            title="운영 모드"
            desc="이후 저장되는 수거 입력·영업 기록을 시연 데이터로 남길지, 실제 현장 데이터로 남길지 정합니다."
            tone={demoActive ? 'amber' : 'teal'}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { active: true, label: '시연 모드', desc: '시연 초기화로 되돌릴 수 있음 · 성과 실증에서 제외' },
                { active: false, label: '실제 현장 운영', desc: '실증 데이터로 집계 · 시연 초기화해도 보존' },
              ].map((m) => (
                <button
                  key={m.label}
                  onClick={() => {
                    setDemoActive(m.active)
                    flash(
                      'ok',
                      m.active
                        ? '시연 모드로 전환했습니다. 이후 입력은 시연 데이터로 기록됩니다.'
                        : '실제 현장 운영 모드로 전환했습니다. 이후 입력이 실증 데이터로 집계됩니다.',
                    )
                  }}
                  className={`rounded-2xl px-4 py-3.5 text-left transition ${
                    demoActive === m.active
                      ? 'bg-navy-900 text-white'
                      : 'bg-navy-50 text-navy-500 hover:text-navy-700'
                  }`}
                >
                  <p className="t-body font-extrabold">{m.label}</p>
                  <p className={`t-muted mt-1 break-keep ${demoActive === m.active ? 'text-navy-200' : ''}`}>
                    {m.desc}
                  </p>
                </button>
              ))}
            </div>
            <p className="t-muted mt-3 break-keep">
              이미 저장된 기록의 출처는 바뀌지 않습니다. 성과 지표의 「실제 현장 데이터」 집계와 실증 단계는 이
              모드를 끈 뒤 입력한 기록만으로 산출됩니다.
            </p>
          </SettingCard>
          )}

          {live ? (
            <SettingCard
              icon={Database}
              title="실제 운영 중"
              desc="이 계정은 서버(Supabase)에 연결되어 있습니다."
              tone="teal"
            >
              <p className="t-body break-keep font-bold text-navy-600">
                입력한 내용은 서버에 저장되어 다른 기기에서도 동일하게 보입니다.
              </p>
              <p className="t-muted mt-2.5 break-keep">
                실제 운영 데이터를 보호하기 위해 「시연 상태 초기화」·「샘플 데이터로 전체 초기화」·「거래처 세트
                전환」은 실제 운영 모드에서 동작하지 않습니다. 시연이 필요하면 로그아웃 후 시연 모드에서 사용해
                주세요.
              </p>
              {profile && (
                <p className="t-muted mt-2.5">
                  로그인 계정 · {profile.name || profile.email} ({profile.role})
                </p>
              )}
            </SettingCard>
          ) : (
          <SettingCard
            icon={PlayCircle}
            title="시연 데이터 관리"
            desc="시연용 변경만 기준 상태로 되돌립니다. 실제 거래처 기본정보와 실제 현장 기록은 유지됩니다."
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
          )}

          {!live && (
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
          )}
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
