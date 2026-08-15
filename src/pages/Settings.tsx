import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TourButton, TourWhyButton } from '../components/TourEntry'
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
  Package,
  KeyRound,
  ArrowRight,
  type LucideIcon,
  FileSpreadsheet,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { ImportLocalCard } from '../components/AdminPanels'
import { UserAdmin } from '../components/UserAdmin'
import { VehicleManager } from '../components/VehicleManager'
import { StockCard } from '../components/StockCard'
import { PasswordCard } from '../components/PasswordCard'
import { DEMO_BASELINE, EMPTY_BASELINE, type BaselineMetrics } from '../types'
import { PageShell } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { FontSizeControl } from '../components/FontSizeControl'
import { Modal } from '../components/Modal'
import { exportData, parseImportFile } from '../lib/backup'
import { exportTables, downloadCsv } from '../lib/exportData'
import { downloadSnapshot, snapshotRowCount, snapshotSummary, SNAPSHOT_EXCLUDED } from '../lib/snapshot'
import { rawSnapshot } from '../lib/repo'
import { HealthCard } from '../components/HealthCard'
import { ErrorLogCard } from '../components/ErrorLogCard'
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
  anchor,
  children,
}: {
  icon: LucideIcon
  title: string
  desc: string
  tone?: 'navy' | 'teal' | 'amber' | 'rose'
  /** 주소 뒤에 #이름 을 붙여 바로 올 수 있게 (예: /settings#vehicles) */
  anchor?: string
  children: React.ReactNode
}) {
  const toneStyle = {
    navy: 'bg-navy-50 text-navy-600',
    teal: 'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-500',
  }[tone]
  return (
    <section id={anchor} className="card scroll-mt-6 p-5 sm:p-6">
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

  //  기준값 칸은 타이핑 중에는 화면에만 담아 두고, 칸을 벗어날 때 한 번 저장합니다.
  //  예전에는 글자를 칠 때마다 서버에 쓰고 전체 데이터를 다시 읽어 왔는데,
  //  그 응답이 늦게 도착하면서 입력하던 숫자를 덮어썼습니다.
  //  (실제로 '120' 을 치면 '2' 가 저장됐습니다)
  const [blDraft, setBlDraft] = useState<Record<string, string>>({})
  //  저장이 끝나 서버 값이 새로 오면 임시 입력값은 비웁니다.
  useEffect(() => setBlDraft({}), [data.baseline])

  function commitBaseline(key: (typeof BASELINE_FIELDS)[number]['key']) {
    const raw = blDraft[key]
    if (raw === undefined) return
    const next = raw.trim() === '' ? null : Number(raw)
    if (next !== null && !Number.isFinite(next)) return
    if (next === (data.baseline[key] ?? null)) return
    setBaseline({ [key]: next, source: 'user' } as Partial<BaselineMetrics>)
  }
  const fileRef = useRef<HTMLInputElement>(null)

  //  내려받을 수 있는 표들. 자료가 바뀌면 줄 수도 함께 바뀝니다.
  const tables = useMemo(() => exportTables(data), [data])
  const [exporting, setExporting] = useState(false)
  //  브라우저가 연달아 내려받기를 막는 일이 있어 사이를 띄웁니다.
  async function downloadAll() {
    setExporting(true)
    for (const t of tables) {
      if (t.rows.length === 0) continue
      downloadCsv(t)
      await new Promise((r) => setTimeout(r, 350))
    }
    setExporting(false)
  }
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [confirmKind, setConfirmKind] = useState<null | 'demo' | 'reset'>(null)

  //  전체 스냅샷 — 서버의 줄을 그대로 받아 옵니다. 화면이 들고 있는 값이
  //  아니라 그때 서버에 있는 값이라, 누르는 순간 다시 읽습니다.
  const [snapping, setSnapping] = useState(false)
  const [snapDone, setSnapDone] = useState<{ rows: number; tables: number; unreadable: number } | null>(null)
  async function takeSnapshot() {
    setSnapping(true)
    try {
      const snap = await rawSnapshot(profile?.name ?? '', new Date().toISOString())
      const rows = snapshotRowCount(snap)
      downloadSnapshot(snap)
      setSnapDone({ rows, tables: snapshotSummary(snap).length, unreadable: snap.unreadable.length })
      if (snap.unreadable.length > 0) {
        //  못 읽은 표가 있으면 조용히 넘어가지 않습니다 — 반쪽 백업을
        //  온전한 백업으로 알고 있는 게 백업이 없는 것보다 위험합니다.
        flash('err', `${snap.unreadable.length}개 표를 읽지 못했습니다 (${snap.unreadable.map((u) => u.name).join(', ')}). 파일 안에 그대로 적혀 있습니다.`)
      } else {
        flash('ok', `${rows.toLocaleString('ko-KR')}줄을 파일 하나로 받았습니다.`)
      }
    } catch (e) {
      flash('err', e instanceof Error ? e.message : '스냅샷을 만들지 못했습니다.')
    } finally {
      setSnapping(false)
    }
  }

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
      //  실사용(서버 연결)에서는 가져오기가 동작하지 않습니다(replaceAll 이
      //  live 에서 아무것도 하지 않습니다). 그런데도 "성공적으로 가져왔습니다"
      //  라고 알려 주고 있었습니다. 백업에서 되돌릴 수 있다고 믿고 있다가
      //  정작 필요할 때 아무 일도 일어나지 않습니다. 사실대로 말합니다.
      if (live) {
        flash('err', '실사용 데이터는 이 화면에서 되돌릴 수 없습니다. 내보낸 파일은 보관용입니다.')
        return
      }
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

      {/*  차량이 한 대도 없으면 설정 화면 **맨 위**에 둡니다.
           설정은 스크롤이 3,000px 을 넘습니다. 원래 자리는 1,300px 아래라
           "차량 등록하는 곳이 없다"는 이야기를 들었습니다 — 있었는데 안 보인
           것입니다. 아래 「화면 글자 크기」 앞에 놓아 봤지만 그것도 1,600px
           이라 마찬가지였습니다.

           차량이 없으면 현장에서 수거 입력 자체가 저장되지 않습니다. 설정에서
           가장 급한 일이 맞으니 맨 위가 제자리입니다. 한 대라도 등록하면
           아래 원래 자리로 내려갑니다. */}
      {data.vehicles.length === 0 && (
        <SettingCard
          icon={Truck}
          anchor="vehicles"
          title="운행 차량 — 먼저 등록해 주세요"
          desc="차량이 한 대도 없습니다. 차량이 없으면 현장에서 수거 입력을 저장할 수 없습니다."
          tone="amber"
        >
          <VehicleManager />
        </SettingCard>
      )}

      {/* 사용 방법 — 언제든 다시 실행 */}
      <section className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-5 sm:p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <PlayCircle size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="t-card break-keep text-navy-900">도움말</h2>
          <p className="t-muted mt-1 break-keep">
            「사용 방법」은 화면을 하나씩 짚어 어디에 무엇을 입력하는지 역할에 맞게 안내합니다.
            「이 시스템을 만든 이유」는 왜 시작했고 회사가 어디로 가려는지 읽는 글입니다 — 목적이 다릅니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <TourWhyButton className="btn-ghost" />
          <TourButton className="btn-primary" label="사용 방법 보기" />
        </div>
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
                    value={blDraft[f.key] ?? (data.baseline[f.key] ?? '')}
                    onChange={(e) => setBlDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    onBlur={() => commitBaseline(f.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
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
          {/*
            서버 자가진단 — 판 번호만으로는 알 수 없는 것.

             위쪽 안내는 숫자 하나만 비교합니다. 그 숫자가 맞아도 정책이
             지워졌거나 색인이 사라졌으면 돈이 두 번 들어갈 수 있습니다.
             서버가 직접 세어 보고, 없으면 이름을 그대로 보여 줍니다.
          */}
          <HealthCard />
          <ErrorLogCard />

          {/*
            전체 스냅샷.

             Supabase 자동 백업은 **그 프로젝트 안에** 있습니다. 프로젝트가
             사라지면(결제 중단·삭제·계정 문제) 백업도 같이 사라집니다.
             그때 회사에 남는 것은 내려받아 둔 파일뿐입니다.

             예전에 여기서 받던 파일은 화면이 쓰는 모양이라 감사기록·자재
             입출고가 아예 없었고, 되돌리는 데 쓸 수 없었습니다. 이제는 DB 의
             줄을 그대로 담습니다 — 빈 데이터베이스에 다시 부어 넣을 수 있는
             파일입니다. 절차는 docs/RESTORE.md 에 있습니다.
          */}
          <SettingCard
            icon={Download}
            title={live ? '전체 스냅샷 내려받기' : '데이터 백업 · 복원'}
            desc={
              live
                ? '되돌릴 수 있는 파일입니다. DB 의 줄을 그대로 담아 파일 하나로 받습니다.'
                : '전체 운영 데이터를 JSON 파일로 내보내거나, 백업 파일에서 되돌릴 수 있습니다.'
            }
          >
            <div className="space-y-2.5">
              {live ? (
                <button className="btn-navy w-full" data-snapshot-take onClick={() => void takeSnapshot()} disabled={snapping}>
                  <Download size={18} strokeWidth={2.4} />
                  {snapping ? '서버에서 읽는 중…' : '전체 스냅샷 받기 (.json)'}
                </button>
              ) : (
                <button className="btn-navy w-full" onClick={() => exportData(data)}>
                  <Download size={18} strokeWidth={2.4} /> 전체 데이터 JSON 내보내기
                </button>
              )}
              {!live && (
                <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}>
                  <Upload size={18} strokeWidth={2.4} /> JSON 파일 가져오기
                </button>
              )}
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
            </div>
            {live && snapDone && (
              <p className="t-muted mt-3 break-keep text-emerald-700" data-snapshot-done>
                표 {snapDone.tables}개 · {snapDone.rows.toLocaleString('ko-KR')}줄을 받았습니다
                {snapDone.unreadable > 0 ? ` (못 읽은 표 ${snapDone.unreadable}개)` : ''}.
              </p>
            )}
            {live ? (
              <div className="t-muted mt-3 space-y-1.5 break-keep" data-snapshot-note>
                <p>
                  <b className="text-navy-600">이 파일에 담기지 않는 것</b> —{' '}
                  {SNAPSHOT_EXCLUDED.map((x) => x.label).join(' · ')}. 로그인 계정은 Supabase 가 따로 보관하므로,
                  되돌린 뒤 사람은 새로 초대합니다.
                </p>
                <p>되돌리는 절차는 저장소의 docs/RESTORE.md 에 있습니다. 한 달에 한 번 받아 회사 밖(개인 드라이브 등)에 두시면 됩니다.</p>
              </div>
            ) : (
              <p className="t-muted mt-3">가져오기를 실행하면 현재 데이터를 덮어씁니다. 먼저 내보내기로 백업해 두세요.</p>
            )}
          </SettingCard>

          {/*
            운영 데이터 표로 내려받기.

             위 JSON 은 기계가 읽는 파일이라 사람이 숫자를 확인할 수 없습니다.
             표를 CSV 로 내려받으면 엑셀이 바로 열고, 대표님이 눈으로 검산할
             수 있습니다. 세무사·은행에 낼 자료도 여기서 나옵니다.

             복구용이 아니라는 것을 화면에 그대로 적습니다 — 백업인 줄 알고
             안심하는 것이 가장 위험합니다.
          */}
          <SettingCard
            icon={FileSpreadsheet}
            title="운영 데이터 표로 내려받기"
            desc="거래처 · 수거 · 청구 · 입금 · 매출을 엑셀에서 열어 확인하고 보관합니다."
          >
            <div className="space-y-2" data-export-list>
              {tables.map((t) => (
                <div
                  key={t.key}
                  data-export-row={t.key}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-navy-50/70 px-3.5 py-3"
                >
                  <span className="min-w-0 flex-1 basis-[8rem]">
                    <span className="block break-keep font-bold text-navy-900">
                      {t.label}
                      <span className="ml-1.5 text-[0.98rem] font-semibold text-navy-400">
                        {t.rows.length.toLocaleString('ko-KR')}줄
                      </span>
                    </span>
                    <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">{t.desc}</span>
                  </span>
                  <button
                    type="button"
                    data-export-one={t.key}
                    disabled={t.rows.length === 0}
                    onClick={() => downloadCsv(t)}
                    className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[1rem] font-bold text-navy-600 transition hover:bg-navy-100 disabled:opacity-40"
                  >
                    <Download size={15} className="mr-1 inline -translate-y-px" />
                    CSV
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn-navy mt-3 w-full"
              data-export-all
              onClick={() => void downloadAll()}
              disabled={exporting}
            >
              <Download size={18} strokeWidth={2.4} />
              {exporting ? '내려받는 중…' : `${tables.length}개 표 전부 내려받기`}
            </button>
            <p className="t-muted mt-3 break-keep">
              엑셀에서 바로 열립니다(한글 깨짐 없음). <b className="text-navy-600">이 파일로 시스템을 되돌리지는
              못합니다</b> — 보관·검산·제출용입니다. 되돌리는 것은 Supabase 백업, 그게 안 되면 위의 전체 스냅샷으로
              합니다.
            </p>
          </SettingCard>

          {/* 사무실 자재 재고 — 공급으로 줄기만 하던 것을 채울 수 있게 합니다 */}
          <SettingCard
            icon={Package}
            title="사무실 자재 재고"
            desc="지금 창고에 남은 수량입니다. 새로 들어온 만큼 적어 주세요."
          >
            <StockCard />
          </SettingCard>

          {/*  차량 — 한 대도 없으면 수거 완료 입력이 불가능합니다.
               차량이 0대일 때는 이 카드를 화면 맨 위로 올립니다(위쪽 참조).
               여기 남는 것은 이미 등록이 끝난 뒤의 자리입니다. */}
          {data.vehicles.length > 0 && (
            <SettingCard
              icon={Truck}
              anchor="vehicles"
              title="운행 차량"
              desc="수거에 사용하는 차량을 등록합니다. 차량이 없으면 수거 입력을 할 수 없습니다."
            >
              <VehicleManager />
            </SettingCard>
          )}

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
                desc="계정 만들기 · 역할 · 사용/중지 · 비밀번호 초기화."
                tone="navy"
              >
                <UserAdmin />
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
