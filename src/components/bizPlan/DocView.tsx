import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Info, Lock, MessageSquarePlus, PenLine, X } from 'lucide-react'
import {
  DOC_SECTIONS, FIELD_BY_KEY, FILTERS, OPEN_REQ, REVIEW_FOCUS, SECTIONS, currentChecks, groupTitle, hiddenInDoc, isBlank, isEditable, matchesFilter, shortTitle, staleChecks,
  type FieldDef, type Filter, type Section,
} from '../../lib/bizPlan'
import { FieldPanel } from './FieldPanel'
import { BasisLine, ChecksLine, Pill, RecheckBadge, RefTableView, STATUS_STYLE, StatusBadge, ValueView, usePlan } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 문서 보기 — PC 3칸 (목차 | 본문 | 검토 칸) · 폰 3단계 (목차 → 본문 → 수정요청) · 0146
//
//  · 순서는 원본 서식 그대로입니다. 칸마다 상태(글자 + 옅은 색) · 출처 · 기준일이 보입니다.
//  · 항목을 누르면 오른쪽(폰은 3단계)에 확인 표시 · 수정요청 · 기록이 열립니다.
//  · 거르기 — 전체 · 확인 필요 · 수정 요청 있음 · 미작성 · 최종 확인 완료 · 의견 조율 필요
//  · 장은 접었다 폅니다. 처음에는 대표님 · 이사님이 정해 주실 장(REVIEW_FOCUS)만 펼쳐 둡니다.
//    거르기 중이거나 그 장의 항목으로 가면 저절로 펼쳐집니다. 펼친 장은 이 기기에만 기억합니다.
//  · 표지 · 확약 · 겹치는 참고사항(HIDDEN_IN_DOC)과 원본 고정 안내문 · 동의 서명 칸(hiddenInDoc)은
//    목차 · 본문에서 뺍니다 — 그 칸으로 가면 그때만 보입니다. 내보내기(원본 순서)에는 그대로 있습니다.
//  · mode="review" — 「확인 · 결정」 탭: 자금 장(REVIEW_FOCUS)만, 늘 펼친 채로, 목차 · 거르기 없이.
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_KEY = 'beonemirae-ops:bizplan-open'
function loadOpen(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null')
    if (Array.isArray(v)) return new Set(v.filter((x) => typeof x === 'string'))
  } catch {
    /* 저장소를 못 읽어도 기본값으로 */
  }
  return new Set(REVIEW_FOCUS)
}
function saveOpen(s: Set<string>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...s]))
  } catch {
    /* 사생활 보호 모드 등 — 기억만 못 함 */
  }
}
const inSection = (s: Section, key: string | null) => !!key && s.groups.some((g) => g.fields.some((d) => d.key === key))

type Step = 'toc' | 'body' | 'panel'
const wideNow = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches

function useWide(q = '(min-width: 1024px)') {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setWide(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [q])
  return wide
}

export function DocView({ focus, onFocus, initialFilter, mode = 'doc' }: { focus: string | null; onFocus: (key: string | null) => void; initialFilter?: string | null; mode?: 'doc' | 'review' }) {
  const { data, fields, requestsByKey, checksByKey, isEditor } = usePlan()
  const review = mode === 'review'
  const wide = useWide()
  const [opened, setOpened] = useState<Set<string>>(loadOpen)
  const setOpen = (ids: string[], on: boolean) =>
    setOpened((prev) => {
      const n = new Set(prev)
      for (const id of ids) {
        if (on) n.add(id)
        else n.delete(id)
      }
      saveOpen(n)
      return n
    })
  //  감춘 장도 그 칸으로 가면(제출 전 점검 등) 그때만 보입니다
  const sections = review ? SECTIONS.filter((s) => REVIEW_FOCUS.includes(s.id)) : SECTIONS.filter((s) => DOC_SECTIONS.includes(s) || inSection(s, focus))
  const [filter, setFilter] = useState<Filter>(FILTERS.includes(initialFilter as Filter) ? (initialFilter as Filter) : '전체')
  useEffect(() => {
    if (initialFilter && FILTERS.includes(initialFilter as Filter)) {
      setFilter(initialFilter as Filter)
      if (!wideNow()) setStep('body')
    }
  }, [initialFilter])
  const [step, setStep] = useState<Step>(focus || review ? 'body' : 'toc')
  const [active, setActive] = useState<string>(DOC_SECTIONS[0].id)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const openCount = (k: string) => (requestsByKey.get(k) ?? []).filter((r) => OPEN_REQ.includes(r.status)).length
  //  0147 — 의견 조율은 지금 문장에 대한 표시끼리만, 재확인은 변경 전 문장에 대한 표시 수
  const match = (f: Filter, d: FieldDef) => {
    const row = fields.get(d.key)
    const cs = checksByKey.get(d.key) ?? []
    return matchesFilter(f, row?.status ?? '작성 전', openCount(d.key), currentChecks(cs, row), isBlank(row?.value), staleChecks(cs, row).length)
  }
  const visibleField = (d: FieldDef) => {
    if (hiddenInDoc(d) && d.key !== focus) return false
    if (filter === '전체') return true
    const ok = match(filter, d)
    //  고정 문구 · 직접 기입 칸은 「작성 전」으로 세지 않습니다 — 요청 · 의견만 거릅니다
    return isEditable(d) ? ok : (filter === '수정 요청 있음' || filter === '의견 조율 필요') && ok
  }
  const filterCount = useMemo(() => {
    const c = {} as Record<Filter, number>
    for (const f of FILTERS) c[f] = 0
    for (const s of DOC_SECTIONS)
      for (const g of s.groups)
        for (const d of g.fields) {
          if (!isEditable(d)) continue
          for (const f of FILTERS) if (match(f, d)) c[f]++
        }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, requestsByKey, checksByKey])

  //  고른 항목으로 — 위치로 이동 · 기록에서 누름
  useEffect(() => {
    if (!focus) return
    if (!wide) setStep((s) => (s === 'toc' ? 'body' : s))
    const t = setTimeout(() => {
      document.querySelector(`[data-field-card="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  //  PC — 지금 읽는 절을 목차에 표시 (위에서 160px 선을 넘은 마지막 절)
  useEffect(() => {
    if (!wide) return
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        let cur = ''
        for (const e of Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[data-section]') ?? [])) {
          if (e.getBoundingClientRect().top <= 160) cur = e.dataset.section ?? cur
          else break
        }
        if (cur) setActive(cur)
      })
    }
    window.addEventListener('scroll', on, { passive: true })
    on()
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [wide, filter])

  //  폰 — 단계를 바꾸면 단계 띠가 화면 맨 위에 오게 (위 요약을 다시 내려 보지 않게)
  const toStepTop = () =>
    setTimeout(() => {
      const el = rootRef.current
      if (!el) return
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 64) })
    }, 20)

  function goSection(id: string) {
    setActive(id)
    if (!opened.has(id)) setOpen([id], true)
    if (!wide) setStep('body')
    setTimeout(() => document.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'start', behavior: wide ? 'smooth' : 'auto' }), 30)
  }
  function pickField(key: string) {
    onFocus(key)
    if (!wide) {
      setStep('panel')
      toStepTop()
    }
  }
  function backToBody() {
    setStep('body')
    if (focus) setTimeout(() => document.querySelector(`[data-field-card="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'center' }), 30)
  }

  const shownSections = sections.filter((s) => filter === '전체' || s.groups.some((g) => g.fields.some(visibleField)))
  const isOpen = (s: Section) => review || opened.has(s.id) || filter !== '전체' || inSection(s, focus)
  const allIds = DOC_SECTIONS.map((s) => s.id)
  const focusSections = DOC_SECTIONS.filter((s) => REVIEW_FOCUS.includes(s.id))
  const empty = data.fields.length === 0

  const filters = (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" data-bizplan-filters>
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          data-filter={f}
          aria-pressed={filter === f}
          onClick={() => setFilter(f)}
          className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-3.5 text-[0.95rem] font-bold transition ${
            filter === f ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
          }`}
        >
          {f} <span className={filter === f ? 'text-navy-200' : 'text-navy-400'}>{filterCount[f]}</span>
        </button>
      ))}
    </div>
  )

  const toc = <Toc sections={sections} active={active} onPick={goSection} filter={filter} visibleField={visibleField} />
  const body = (
    <div ref={bodyRef} className="min-w-0 space-y-5" data-bizplan-body>
      {empty && (
        <p data-bizplan-empty className="break-keep rounded-2xl bg-amber-50 px-4 py-3 text-[0.98rem] font-semibold leading-relaxed text-amber-900 ring-1 ring-amber-200">
          아직 1차 초안이 들어오지 않았습니다. 사업계획 담당이 칸마다 직접 쓰거나, 대표님이 초안 SQL(저장소 밖 파일)을 실행하면 채워집니다.
        </p>
      )}
      {filter !== '전체' && (
        <p className="flex flex-wrap items-center gap-2 text-[0.95rem] font-bold text-navy-600">
          「{filter}」 {filterCount[filter]}개만 보는 중
          <button type="button" data-filter-clear onClick={() => setFilter('전체')} className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-navy-50 px-3 text-navy-700">
            <X size={14} /> 전체 보기
          </button>
        </p>
      )}
      {!review && filter === '전체' && !isEditor && focusSections.length > 0 && (
        <div data-review-focus className="space-y-2 rounded-2xl bg-teal-50 px-4 py-3 ring-1 ring-teal-200">
          <p className="break-keep text-[1.02rem] font-extrabold text-teal-900">사업계획서 전문 — 대표님 · 이사님께 정해 주시길 부탁드리는 장</p>
          <div className="flex flex-wrap gap-1.5">
            {focusSections.map((s) => (
              <button key={s.id} type="button" data-review-focus-go={s.id} onClick={() => goSection(s.id)} className="min-h-[44px] rounded-full bg-white px-3.5 text-[0.95rem] font-extrabold text-teal-800 ring-1 ring-inset ring-teal-300">
                {shortTitle(s)}
              </button>
            ))}
          </div>
          <p className="break-keep text-[0.9rem] text-teal-800">나머지 장은 담당이 작성했고 접혀 있습니다 — 보고 싶은 장만 제목을 눌러 펼치세요.</p>
        </div>
      )}
      {!review && filter === '전체' && (
        <div className="flex flex-wrap justify-end gap-1.5">
          <button type="button" data-open-all onClick={() => setOpen(allIds, true)} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-white px-3 text-[0.9rem] font-bold text-navy-600 ring-1 ring-inset ring-navy-200">
            <ChevronsUpDown size={15} /> 모두 펼치기
          </button>
          <button type="button" data-close-all onClick={() => setOpen(allIds, false)} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-white px-3 text-[0.9rem] font-bold text-navy-600 ring-1 ring-inset ring-navy-200">
            <ChevronsDownUp size={15} /> 모두 접기
          </button>
        </div>
      )}
      {shownSections.map((s) => (
        <SectionBlock key={s.id} s={s} visibleField={visibleField} focus={focus} onPick={pickField} filtered={filter !== '전체'}
          open={isOpen(s)} onToggle={() => setOpen([s.id], !opened.has(s.id))} toggleable={!review && filter === '전체' && !inSection(s, focus)} />
      ))}
      {shownSections.length === 0 && <p className="rounded-2xl bg-white px-4 py-10 text-center text-[1rem] font-bold text-navy-500 ring-1 ring-navy-100">해당하는 항목이 없습니다.</p>}
    </div>
  )

  if (wide) {
    return (
      <div className="space-y-3">
        {!review && filters}
        <div className={`grid items-start gap-4 ${review ? 'grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_27rem] 2xl:grid-cols-[minmax(0,1fr)_30rem]' : 'grid-cols-[15.5rem_minmax(0,1fr)_21rem] xl:grid-cols-[17rem_minmax(0,1fr)_25rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_28rem]'}`}>
          {!review && (
            <aside className="sticky top-[4.4rem] max-h-[calc(100dvh-5.4rem)] overflow-y-auto rounded-2xl bg-white p-2 ring-1 ring-navy-100" data-bizplan-toc-pane>
              {toc}
            </aside>
          )}
          {body}
          <aside className="sticky top-[4.4rem] max-h-[calc(100dvh-5.4rem)] overflow-y-auto rounded-2xl bg-white p-4 ring-1 ring-navy-100" data-bizplan-panel-pane>
            {focus && FIELD_BY_KEY.has(focus) ? (
              <>
                <button type="button" onClick={() => onFocus(null)} className="float-right -mr-1 -mt-1 flex h-10 w-10 items-center justify-center rounded-full text-navy-400 hover:bg-navy-50" aria-label="검토 칸 닫기">
                  <X size={18} />
                </button>
                <FieldPanel fieldKey={focus} />
              </>
            ) : (
              <PanelEmpty />
            )}
          </aside>
        </div>
      </div>
    )
  }

  //  ── 폰: 3단계 (「확인 · 결정」은 본문 ↔ 검토 칸 두 단계, 단계 띠 없이) ──
  return (
    <div ref={rootRef} className="space-y-3">
      {!review && <div role="tablist" aria-label="보는 단계" className="sticky top-[3.6rem] z-20 -mx-4 grid grid-cols-3 gap-1 border-b border-navy-100 bg-app/95 px-4 py-2 backdrop-blur" data-bizplan-steps>
        {(
          [
            ['toc', '① 목차'],
            ['body', '② 본문'],
            ['panel', '③ 수정요청'],
          ] as const
        ).map(([k, lb]) => (
          <button
            key={k}
            type="button"
            role="tab"
            data-step={k}
            aria-selected={step === k}
            onClick={() => {
              if (k === 'body') return backToBody()
              setStep(k)
              toStepTop()
            }}
            className={`min-h-[44px] rounded-xl text-[0.98rem] font-extrabold transition ${step === k ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 ring-1 ring-inset ring-navy-200'}`}
          >
            {lb}
          </button>
        ))}
      </div>}
      {step === 'toc' && !review && (
        <div className="space-y-3">
          {filters}
          <div className="rounded-2xl bg-white p-2 ring-1 ring-navy-100">{toc}</div>
        </div>
      )}
      {(step === 'body' || (step === 'toc' && review)) && (
        <div className="space-y-3">
          {!review && filters}
          {body}
        </div>
      )}
      {step === 'panel' && (
        <div className="space-y-3">
          <button type="button" data-panel-back onClick={backToBody} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-4 text-[0.98rem] font-bold text-navy-700 ring-1 ring-navy-200">
            <ArrowLeft size={17} /> 본문으로
          </button>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-navy-100">{focus && FIELD_BY_KEY.has(focus) ? <FieldPanel fieldKey={focus} /> : <PanelEmpty />}</div>
        </div>
      )}
    </div>
  )
}

function PanelEmpty() {
  const { data } = usePlan()
  const open = data.requests.filter((r) => OPEN_REQ.includes(r.status)).length
  return (
    <div className="space-y-2 py-6 text-center" data-panel-empty>
      <Info size={26} className="mx-auto text-navy-300" />
      <p className="break-keep text-[1rem] font-bold text-navy-600">본문에서 항목을 누르면</p>
      <p className="break-keep text-[0.95rem] text-navy-500">검토 상태 · 내 확인 표시 · 수정요청 · 변경 기록이 여기에 보입니다.</p>
      {open > 0 && <p className="text-[0.95rem] font-bold text-orange-700">처리 전 수정요청 {open}건 — 위 「요청함」에서 모아 볼 수 있습니다.</p>}
    </div>
  )
}

// ── 목차 ─────────────────────────────────────────────────────────────────────
function Toc({ sections, active, onPick, filter, visibleField }: { sections: Section[]; active: string; onPick: (id: string) => void; filter: Filter; visibleField: (d: FieldDef) => boolean }) {
  const { fields, requestsByKey, checksByKey } = usePlan()
  const navRef = useRef<HTMLElement>(null)
  //  PC — 목차 칸 안에서 지금 절이 보이게 (창 전체는 움직이지 않음)
  useEffect(() => {
    const nav = navRef.current
    const pane = nav?.closest('[data-bizplan-toc-pane]') as HTMLElement | null
    const btn = nav?.querySelector<HTMLElement>(`[data-toc="${active}"]`)
    if (!pane || !btn) return
    const top = btn.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop
    if (top < pane.scrollTop || top + btn.offsetHeight > pane.scrollTop + pane.clientHeight) pane.scrollTo({ top: top - pane.clientHeight / 3 })
  }, [active])
  const parts: Section['part'][] = ['본문', '추가 서식', '참고', '별첨']
  return (
    <nav ref={navRef} aria-label="사업계획서 목차" className="space-y-2" data-bizplan-toc>
      {parts.map((p) => {
        const ss = sections.filter((s) => s.part === p)
        if (ss.length === 0) return null
        return (
          <div key={p}>
            <p className="px-2 pb-1 pt-1.5 text-[0.8rem] font-black uppercase tracking-wider text-navy-400">{p === '별첨' ? '별첨 (리틀펭귄 · 퍼스트펭귄 · Pre-ICON 보증용)' : p}</p>
            <ul className="space-y-0.5">
              {ss.map((s) => {
                const defs = s.groups.flatMap((g) => g.fields).filter(isEditable)
                const st = defs.map((d) => fields.get(d.key)?.status ?? '작성 전')
                const written = defs.filter((d) => !isBlank(fields.get(d.key)?.value)).length
                const final = st.filter((x) => x === '최종 확인 완료').length
                const need = st.filter((x) => x === '확인 필요').length
                const req = s.groups.flatMap((g) => g.fields).reduce((n, d) => n + (requestsByKey.get(d.key) ?? []).filter((r) => OPEN_REQ.includes(r.status)).length, 0)
                const re = defs.filter((d) => staleChecks(checksByKey.get(d.key) ?? [], fields.get(d.key)).length > 0).length
                const hits = filter === '전체' ? null : s.groups.flatMap((g) => g.fields).filter(visibleField).length
                const allFinal = defs.length > 0 && final === defs.length
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      data-toc={s.id}
                      aria-current={active === s.id ? 'true' : undefined}
                      onClick={() => onPick(s.id)}
                      disabled={hits === 0}
                      className={`flex min-h-[48px] w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-40 ${active === s.id ? 'bg-navy-900 text-white' : 'text-navy-800 hover:bg-navy-50'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block break-keep text-[0.95rem] font-extrabold leading-snug">{shortTitle(s)}</span>
                        <span className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.8rem] font-bold ${active === s.id ? 'text-navy-200' : 'text-navy-400'}`}>
                          {defs.length > 0 ? (
                            <span data-toc-progress>
                              작성 {written}/{defs.length}
                            </span>
                          ) : (
                            <span>읽을거리</span>
                          )}
                          {need > 0 && <span className={active === s.id ? 'text-amber-200' : 'text-amber-700'}>확인 {need}</span>}
                          {req > 0 && <span className={active === s.id ? 'text-orange-200' : 'text-orange-700'}>요청 {req}</span>}
                          {re > 0 && <span data-toc-recheck={re} className={active === s.id ? 'text-amber-200' : 'text-amber-800'}>재확인 {re}</span>}
                          {hits != null && <span>· 맞는 항목 {hits}</span>}
                        </span>
                      </span>
                      {allFinal ? <CheckCircle2 size={17} className="shrink-0 text-teal-500" aria-label="모두 최종 확인" /> : <ChevronRight size={16} className="shrink-0 opacity-50" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

// ── 절 하나 ───────────────────────────────────────────────────────────────────
function SectionBlock({ s, visibleField, focus, onPick, filtered, open, onToggle, toggleable }: {
  s: Section; visibleField: (d: FieldDef) => boolean; focus: string | null; onPick: (k: string) => void; filtered: boolean
  open: boolean; onToggle: () => void; toggleable: boolean
}) {
  const { fields, requestsByKey, checksByKey } = usePlan()
  const defs = s.groups.flatMap((g) => g.fields).filter(isEditable)
  const written = defs.filter((d) => !isBlank(fields.get(d.key)?.value)).length
  const need = defs.filter((d) => (fields.get(d.key)?.status ?? '작성 전') === '확인 필요').length
  const req = s.groups.flatMap((g) => g.fields).reduce((n, d) => n + (requestsByKey.get(d.key) ?? []).filter((r) => OPEN_REQ.includes(r.status)).length, 0)
  const re = defs.filter((d) => staleChecks(checksByKey.get(d.key) ?? [], fields.get(d.key)).length > 0).length
  const focusMark = REVIEW_FOCUS.includes(s.id)
  return (
    <section data-section={s.id} data-section-open={open ? 'y' : 'n'} className="scroll-mt-32 space-y-3">
      <header className={`rounded-2xl text-white ${focusMark ? 'bg-teal-800' : 'bg-navy-900'}`}>
        <button
          type="button"
          data-section-toggle={s.id}
          aria-expanded={open}
          disabled={!toggleable}
          onClick={onToggle}
          className="flex min-h-[52px] w-full items-start gap-2 px-4 py-3 text-left disabled:cursor-default"
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="break-keep text-[1.1rem] font-black leading-snug">{s.title}</span>
              {s.unit && <span className="text-[0.88rem] font-bold text-navy-200">({s.unit})</span>}
            </span>
            <span className="flex flex-wrap gap-x-2 text-[0.85rem] font-bold text-navy-200">
              {focusMark && <span className="rounded-md bg-white/15 px-1.5 text-white">대표님 · 이사님 확인</span>}
              {defs.length > 0 ? <span>작성 {written}/{defs.length}</span> : <span>읽을거리</span>}
              {need > 0 && <span className="text-amber-200">확인 {need}</span>}
              {req > 0 && <span className="text-orange-200">요청 {req}</span>}
              {re > 0 && <span className="text-amber-200">재확인 {re}</span>}
            </span>
            {s.note && open && <span className="block break-keep text-[0.92rem] font-semibold text-amber-200">{s.note}</span>}
          </span>
          {toggleable && <ChevronDown size={20} className={`mt-1 shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
        </button>
      </header>
      {open && <SectionBody s={s} visibleField={visibleField} focus={focus} onPick={onPick} filtered={filtered} />}
    </section>
  )
}

function SectionBody({ s, visibleField, focus, onPick, filtered }: { s: Section; visibleField: (d: FieldDef) => boolean; focus: string | null; onPick: (k: string) => void; filtered: boolean }) {
  return (
    <>
      {s.groups.map((g) => {
        const defs = g.fields.filter(visibleField)
        if (defs.length === 0) return null
        const title = groupTitle(g)
        const desc = g.title?.match(/—\s*(.*)$/)?.[1]
        return (
          <div key={g.id} className="space-y-2">
            {(title || g.guide?.length) && (
              <div className="px-1">
                {title && <h3 className="break-keep text-[1.02rem] font-extrabold text-navy-800">{title}</h3>}
                {desc && <p className="break-keep text-[0.9rem] text-navy-500">{desc}</p>}
                {g.guide && g.guide.length > 0 && <Guide lines={g.guide} />}
              </div>
            )}
            {defs.map((d) => (
              <FieldCard key={d.key} d={d} selected={focus === d.key} onPick={() => onPick(d.key)} />
            ))}
          </div>
        )
      })}
      {!filtered && s.footnotes?.map((x, i) => (
        <p key={i} className="break-keep px-1 text-[0.88rem] leading-snug text-navy-500">{x}</p>
      ))}
      {!filtered && s.refs?.map((t, i) => (
        <div key={i} className="rounded-2xl bg-white p-3 ring-1 ring-navy-100">
          <RefTableView t={t} />
        </div>
      ))}
    </>
  )
}

function Guide({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button type="button" data-guide-toggle onClick={() => setOpen((v) => !v)} className="inline-flex min-h-[36px] items-center gap-1 text-[0.9rem] font-bold text-teal-700">
        원본 작성 안내 {open ? '접기' : '보기'} <ChevronDown size={15} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="space-y-1 rounded-xl bg-navy-50/70 px-3 py-2 text-[0.9rem] leading-relaxed text-navy-600">
          {lines.map((x, i) => (
            <p key={i} className="break-keep">{x}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 칸 하나 ───────────────────────────────────────────────────────────────────
function FieldCard({ d, selected, onPick }: { d: FieldDef; selected: boolean; onPick: () => void }) {
  const { data, fields, requestsByKey, checksByKey, isEditor, openRequest, openEditor } = usePlan()
  const row = fields.get(d.key)
  const status = row?.status ?? '작성 전'
  const open = (requestsByKey.get(d.key) ?? []).filter((r) => OPEN_REQ.includes(r.status)).length
  const checks = checksByKey.get(d.key) ?? []
  const stale = staleChecks(checks, row).length
  const editable = isEditable(d)
  const [hint, setHint] = useState(false)
  const tier = data.rules?.required.includes(d.key) ? '필수' : data.rules?.recommended.includes(d.key) ? '해당 시' : null

  return (
    <article
      data-field-card={d.key}
      data-field-status={editable ? status : d.kind}
      data-field-recheck={stale || undefined}
      className={`scroll-mt-36 rounded-2xl border px-3.5 py-3 transition ${editable ? STATUS_STYLE[status].card : 'border-navy-100 bg-white'} ${selected ? 'ring-2 ring-teal-400' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button type="button" data-field-open={d.key} onClick={onPick} className="min-h-[40px] min-w-0 flex-1 text-left">
          <span className="break-keep text-[1.02rem] font-extrabold leading-snug text-navy-900">{d.label}</span>
          {d.unit && <span className="ml-1 text-[0.88rem] font-bold text-navy-400">({d.unit})</span>}
          {tier && (
            <span data-field-tier={tier} className={`ml-1.5 inline-block rounded-md px-1.5 py-0.5 align-middle text-[0.75rem] font-extrabold ${tier === '필수' ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500'}`}>
              {tier}
            </span>
          )}
        </button>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {editable ? <StatusBadge status={status} /> : d.kind === 'offline' ? <Pill><Lock size={13} className="mr-1" />직접 기입</Pill> : <Pill>원본 문구</Pill>}
          {stale > 0 && <RecheckBadge n={stale} />}
        </span>
      </div>
      {d.hint && d.kind !== 'offline' && (
        <button type="button" data-field-hint={d.key} onClick={() => setHint((v) => !v)} className="inline-flex min-h-[40px] items-center break-keep text-left text-[0.85rem] font-bold text-navy-400 underline-offset-2 hover:underline">
          {hint ? d.hint : '작성 안내'}
        </button>
      )}
      <div className="mt-1">
        <ValueView def={d} value={row?.value} />
      </div>
      {row?.basis && <div className="mt-2"><BasisLine basis={row.basis} /></div>}
      {checks.length > 0 && <div className="mt-2"><ChecksLine checks={checks} field={row} /></div>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {open > 0 && (
          <button type="button" onClick={onPick} className="min-h-[40px] rounded-full bg-orange-100 px-3 text-[0.9rem] font-extrabold text-orange-800" data-field-open-req={open}>
            처리 전 요청 {open}건
          </button>
        )}
        <span className="flex-1" />
        <button type="button" data-card-request={d.key} onClick={() => openRequest(d.key)} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-white px-3 text-[0.92rem] font-bold text-navy-700 ring-1 ring-inset ring-navy-200 hover:bg-navy-50">
          <MessageSquarePlus size={15} /> 수정 요청
        </button>
        {isEditor && editable && (
          <button type="button" data-card-edit={d.key} onClick={() => openEditor(d.key)} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-teal-600 px-3 text-[0.92rem] font-bold text-white hover:bg-teal-700">
            <PenLine size={15} /> 편집
          </button>
        )}
        <button type="button" data-card-detail={d.key} onClick={onPick} className="inline-flex min-h-[40px] items-center gap-0.5 rounded-full px-2.5 text-[0.92rem] font-bold text-navy-500 hover:bg-navy-50">
          검토 <ChevronRight size={15} />
        </button>
      </div>
    </article>
  )
}
