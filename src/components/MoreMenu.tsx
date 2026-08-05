import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, Wallet, PieChart, Truck, Smartphone, Download, Upload, RotateCcw, ChevronRight, Sparkles, Globe, Workflow, ExternalLink, FileBarChart, History, Lock, type LucideIcon } from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { useData } from '../context/DataContext'
import { FontSizeControl } from './FontSizeControl'
import { InfoBanner } from './InfoBanner'
import { RnDCard } from './RnDCard'
import { IconChip } from './ui'
import { Tappable } from './motion'
import { exportData, parseImportFile } from '../lib/backup'

// ─────────────────────────────────────────────────────────────────────────────
// 더보기 메뉴 콘텐츠 — 디바이스별 분리
//  · 모바일: 배차·경로 / 자재 관리 / 미수금 관리 / 통계 (사이드바가 없으므로 노출)
//  · 데스크톱: 자재/미수금/통계는 사이드바에 있으므로 숨김, 모바일 미리보기 노출
//  공통: 시연용 핵심 요약 / 글자 크기 / 백업·복원 / 초기화 / 기술개발 / MVP 안내
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE_SHORTCUTS: { to: string; label: string; icon: LucideIcon; desc: string }[] = [
  { to: '/reports', label: '운영 리포트', icon: FileBarChart, desc: '병원별 월간 운영 리포트' },
  { to: '/stats', label: '통계', icon: PieChart, desc: '수거량·거래처·차량 실적' },
  { to: '/materials', label: '자재 관리', icon: Boxes, desc: '박스·비닐·바늘통 공급 내역' },
  { to: '/receivables', label: '미수금 관리', icon: Wallet, desc: '청구·입금 현황 및 미수금' },
  { to: '/dispatch', label: '배차·경로', icon: Truck, desc: '차량별 배차·경로 추천' },
  { to: '/history', label: '수거이력', icon: History, desc: '전체 수거 입력 이력·감사기록' },
]

/** 추가 개발 예정 — 아직 실사용 단계가 아닌 확장 기능 */
const PLANNED_FEATURES = [
  'AI 배차·경로 고도화',
  '병원 요청 포털',
  '소모품 주문',
  '배출자 교육 관리',
  '자동 문서 발송',
  '올바로 API 연동',
  '실시간 다중 사용자',
  'SaaS 서비스 확장',
]

export function MoreMenu({ variant = 'mobile', onNavigate }: { variant?: 'mobile' | 'desktop'; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { data, replaceAll, reset } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  function go(to: string) {
    onNavigate?.()
    navigate(to)
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

  return (
    <div className="space-y-5">
      {msg && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 시연용 핵심 요약 */}
      <Tappable
        as="div"
        onClick={() => go('/demo')}
        className="flex cursor-pointer items-center gap-3 rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-4 text-white shadow-lg"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Sparkles size={20} className="text-teal-300" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">시연용 핵심 요약</p>
          <p className="text-[0.6875rem] text-navy-300">회사 규모 · 수거 실적 · 기술개발/특허</p>
        </div>
        <ChevronRight size={18} className="ml-auto shrink-0 text-white/60" />
      </Tappable>

      {/* 활용 계획·업무흐름도 — 대표·실사용 한눈에 보기 */}
      <Tappable
        as="div"
        onClick={() => go('/roadmap')}
        className="flex cursor-pointer items-center gap-3 rounded-3xl bg-teal-500 p-4 text-white shadow-lg"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Workflow size={20} className="text-white" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">활용 계획 · 업무흐름도</p>
          <p className="text-[0.6875rem] text-teal-100">일일 업무 흐름 · 단계별 활용 로드맵</p>
        </div>
        <ChevronRight size={18} className="ml-auto shrink-0 text-white/70" />
      </Tappable>

      {/* 바로가기 — 모바일: 배차·경로/자재/미수금/통계, 데스크톱: 모바일 미리보기 */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-navy-500">메뉴</h3>
        <div className="space-y-2.5">
          <Tappable as="div" onClick={() => go('/company')} className="card flex cursor-pointer items-center gap-3 p-4">
            <IconChip icon={Globe} tone="navy" />
            <div className="min-w-0">
              <p className="font-bold text-navy-900">회사 홈페이지</p>
              <p className="text-xs text-navy-400">주식회사 비원미래 공식 홈페이지</p>
            </div>
            <ChevronRight size={18} className="ml-auto text-navy-300" />
          </Tappable>
          <a
            href={ALLBARO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="card flex items-center gap-3 p-4 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <IconChip icon={ExternalLink} tone="teal" />
            <div className="min-w-0">
              <p className="font-bold text-navy-900">올바로 시스템</p>
              <p className="text-xs text-navy-400">폐기물 적법처리 국가시스템 바로가기</p>
            </div>
            <ExternalLink size={16} className="ml-auto shrink-0 text-navy-300" />
          </a>
          {variant === 'mobile' &&
            MOBILE_SHORTCUTS.map((s) => (
              <Tappable key={s.to} as="div" onClick={() => go(s.to)} className="card flex cursor-pointer items-center gap-3 p-4">
                <IconChip icon={s.icon} tone="navy" />
                <div className="min-w-0">
                  <p className="font-bold text-navy-900">{s.label}</p>
                  <p className="text-xs text-navy-400">{s.desc}</p>
                </div>
                <ChevronRight size={18} className="ml-auto text-navy-300" />
              </Tappable>
            ))}
          {variant === 'desktop' && (
            <Tappable as="div" onClick={() => go('/mobile-preview')} className="card flex cursor-pointer items-center gap-3 p-4">
              <IconChip icon={Smartphone} tone="navy" />
              <div className="min-w-0">
                <p className="font-bold text-navy-900">모바일 프레임으로 보기</p>
                <p className="text-xs text-navy-400">시연용 모바일 미리보기</p>
              </div>
              <ChevronRight size={18} className="ml-auto text-navy-300" />
            </Tappable>
          )}
        </div>
      </section>

      {/* 추가 개발 예정 — 현재 사용 기능과 확장 예정 기능을 명확히 구분 */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-navy-500">추가 개발 예정</h3>
        <div className="card p-4">
          <div className="flex flex-wrap gap-1.5">
            {PLANNED_FEATURES.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-semibold text-navy-500"
              >
                <Lock size={12} /> {f}
              </span>
            ))}
          </div>
          <button className="btn-ghost mt-3 w-full" onClick={() => go('/roadmap')}>
            <Workflow size={16} strokeWidth={2.4} /> 단계별 활용 계획 보기
          </button>
          <p className="mt-2.5 text-xs text-navy-400">
            위 기능은 아직 실사용 단계가 아니며, 단계별 로드맵에 따라 개발 예정입니다.
          </p>
        </div>
      </section>

      {/* 글자 크기 설정 */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-navy-500">글자 크기</h3>
        <div className="card p-4">
          <FontSizeControl />
          <p className="mt-3 text-xs text-navy-400">선택한 글자 크기는 이 기기에 저장되어 새로고침해도 유지됩니다.</p>
        </div>
      </section>

      {/* 데이터 백업/복원 */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-navy-500">데이터 백업 / 복원</h3>
        <div className="card space-y-3 p-4">
          <button className="btn-navy w-full" onClick={() => exportData(data)}>
            <Download size={17} strokeWidth={2.4} /> 전체 데이터 JSON 내보내기
          </button>
          <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}>
            <Upload size={17} strokeWidth={2.4} /> JSON 파일 가져오기
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          <p className="text-xs text-navy-400">Supabase 연동 전까지 시연 데이터를 JSON 파일로 보관·복원할 수 있습니다.</p>
        </div>
      </section>

      {/* 샘플 초기화 */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-navy-500">초기화</h3>
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
            <RotateCcw size={16} strokeWidth={2.4} /> 초기화
          </button>
        </div>
      </section>

      {/* 기술개발 현황 */}
      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-navy-500">기술개발 현황</h3>
        <RnDCard />
      </section>

      <InfoBanner />

      <p className="pb-1 text-center text-xs text-navy-300">㈜비원미래 · beonemirae ops · 시연용 MVP</p>
    </div>
  )
}
