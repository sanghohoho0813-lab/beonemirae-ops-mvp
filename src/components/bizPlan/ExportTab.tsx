import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Download, FileText, Loader2, Printer } from 'lucide-react'
import {
  BIZPLAN_DOC_TITLE, FIELD_REFS, OPEN_REQ, SECTIONS, isBlank, isEditable, plainText,
  type FieldStatus, type Section, type Value,
} from '../../lib/bizPlan'
import { BizPlanError, getVersion, type VersionFull } from '../../lib/bizPlanApi'
import { usePrintIsolate } from '../../lib/usePrintIsolate'
import { RefTableView, ValueView, copyText, download, stamp, usePlan, when } from './parts'
import { PreflightView, usePreflight } from './PreflightView'

// ─────────────────────────────────────────────────────────────────────────────
// 제출본 내보내기 (0146)
//
//  원본 서식 순서 그대로, **검토 표시(상태 · 요청 · 확인 · 근거) 없이** 깨끗한 문서로.
//   · 인쇄 · PDF 저장 — 이 문서만 찍힙니다(usePrintIsolate)
//   · 전체 복사 — 원본 서식에 옮겨 적을 때
//   · 자료 내보내기(JSON) — 원본 순서 · 칸 이름 그대로
//   · 진행 현황(CSV) — 내부 공유용 (이것만 상태가 들어갑니다)
//
//  ⚠ HWPX 자동 채우기는 하지 않습니다. 원본 표는 칸 합치기 · 고정 문구가 많아 자동으로
//    넣으면 칸이 어긋날 위험이 있습니다 — 미리보기 순서대로 원본 서식에 옮겨 적습니다.
//  ⚠ 주민등록번호 · 개인 연락처 · 자산 · 계좌번호 · 서명은 이 시스템에 없습니다 —
//    「(제출본에 직접 기입)」으로 나옵니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 예시 · 빈칸 표시가 남은 곳 — 제출 전에 꼭 고칠 것 */
const PLACEHOLDER = /○○|△△|XX|\(예시\)|확인 필요|검토 필요|미정|TBD|\?\?/

type Source = { kind: 'work' } | { kind: 'version'; v: VersionFull }
type ValueOf = (key: string) => Value | null

export function ExportTab({ onGo }: { onGo: (key: string) => void }) {
  const { data, fields, notify } = usePlan()
  const [source, setSource] = useState<Source>({ kind: 'work' })
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [withAnnex, setWithAnnex] = useState(true)
  const [withRefs, setWithRefs] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  usePrintIsolate(docRef, true)
  const pfState = usePreflight()

  const valueOf: ValueOf = useMemo(() => {
    if (source.kind === 'version') {
      const snap = source.v.snapshot ?? {}
      return (k) => snap[k]?.value ?? null
    }
    return (k) => fields.get(k)?.value ?? null
  }, [source, fields])
  const statusOf = (k: string): FieldStatus =>
    (source.kind === 'version' ? source.v.snapshot?.[k]?.status : fields.get(k)?.status) ?? '작성 전'

  const sections = SECTIONS.filter((s) => (s.part === '참고' ? withRefs : s.part === '별첨' ? withAnnex : true))
  const label = source.kind === 'version' ? source.v.label : `작업본 (${data.doc.version_label || '버전 저장 전'} 이후)`

  //  ── 제출 전 점검 ──
  const editable = FIELD_REFS.filter((r) => isEditable(r.def) && sections.includes(r.section))
  const openReq = data.requests.filter((r) => OPEN_REQ.includes(r.status)).length
  const notFinal = editable.filter((r) => statusOf(r.def.key) !== '최종 확인 완료')
  const blank = editable.filter((r) => isBlank(valueOf(r.def.key)))
  const holders = editable.filter((r) => PLACEHOLDER.test(plainText(r.def, valueOf(r.def.key))))
  const offline = FIELD_REFS.filter((r) => r.def.kind === 'offline' && sections.includes(r.section))

  async function pickVersion(id: number | null) {
    if (id == null) return setSource({ kind: 'work' })
    setLoadingId(id)
    try {
      setSource({ kind: 'version', v: await getVersion(id) })
    } catch (e) {
      notify(e instanceof BizPlanError ? e.message : '버전을 불러오지 못했습니다.')
    } finally {
      setLoadingId(null)
    }
  }

  const fullText = () => docText(sections, valueOf, label)
  async function copyAll() {
    notify((await copyText(fullText())) ? '전체 내용을 복사했습니다 · 원본 서식 순서 그대로입니다.' : '복사하지 못했습니다.')
  }
  function exportJson() {
    const out = {
      title: BIZPLAN_DOC_TITLE,
      source: label,
      exported_at: new Date().toISOString(),
      note: '원본 서식 순서 · 칸 이름 그대로. 검토 표시(상태 · 요청 · 확인 · 근거)는 넣지 않았습니다. 주민등록번호 · 계좌 · 서명 등은 이 시스템에 없습니다.',
      sections: sections.map((s) => ({
        no: s.no,
        title: s.title,
        unit: s.unit ?? '',
        groups: s.groups.map((g) => ({
          title: g.title ?? '',
          fields: g.fields.map((f) => ({
            key: f.key,
            label: f.label,
            unit: f.unit ?? '',
            value: f.kind === 'notice' ? f.text : f.kind === 'offline' ? null : valueOf(f.key),
            text: plainText(f, valueOf(f.key)),
          })),
        })),
      })),
    }
    download(`뉴본펭귄_사업계획서_${source.kind === 'version' ? source.v.label : '작업본'}_${stamp()}.json`, JSON.stringify(out, null, 2), 'application/json')
  }
  function exportProgress() {
    const rows = [['번호', '위치', '상태', '처리 전 요청', '최종 수정']]
    for (const r of FIELD_REFS.filter((x) => isEditable(x.def))) {
      const f = fields.get(r.def.key)
      const open = data.requests.filter((q) => q.key === r.def.key && OPEN_REQ.includes(q.status)).length
      rows.push([r.section.no, r.path, f?.status ?? '작성 전', String(open), f?.updated_at ? `${f.updated_by} ${when(f.updated_at)}` : ''])
    }
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    download(`뉴본펭귄_사업계획서_진행현황_${stamp()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  return (
    <div className="space-y-4" data-bizplan-export>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-navy-100 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.95rem] font-bold text-navy-500">내보낼 내용</span>
          <button type="button" data-export-source="work" aria-pressed={source.kind === 'work'} onClick={() => void pickVersion(null)} className={`min-h-[40px] rounded-full px-3.5 text-[0.95rem] font-bold ${source.kind === 'work' ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'}`}>
            지금 작업본
          </button>
          {data.versions.map((v) => (
            <button
              key={v.id}
              type="button"
              data-export-source={v.label}
              aria-pressed={source.kind === 'version' && source.v.id === v.id}
              onClick={() => void pickVersion(v.id)}
              className={`inline-flex min-h-[40px] items-center gap-1 rounded-full px-3.5 text-[0.95rem] font-bold ${source.kind === 'version' && source.v.id === v.id ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'}`}
            >
              {loadingId === v.id && <Loader2 size={14} className="animate-spin" />}
              {v.label}
              {v.is_submission && ' · 제출본'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.95rem] font-semibold text-navy-700">
          <label className="inline-flex min-h-[40px] items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-navy-900" checked={withAnnex} onChange={(e) => setWithAnnex(e.target.checked)} /> 별첨(리틀펭귄 · 퍼스트펭귄 · Pre-ICON 보증용) 넣기
          </label>
          <label className="inline-flex min-h-[40px] items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-navy-900" checked={withRefs} onChange={(e) => setWithRefs(e.target.checked)} /> 작성 참고사항 · 작성요령 넣기
          </label>
        </div>

        <div data-export-warnings className="space-y-1.5 rounded-xl bg-amber-50/70 px-3.5 py-3 ring-1 ring-amber-200">
          <p className="flex items-center gap-1.5 text-[0.98rem] font-extrabold text-amber-900">
            <AlertTriangle size={17} /> 이 내보내기 요약
          </p>
          <ul className="space-y-1 text-[0.95rem] text-navy-800">
            <li data-export-warn="open">처리 전 수정요청 <b>{openReq}건</b>{openReq > 0 ? ' — 제출본 확정 전에 처리해야 합니다' : ''}</li>
            <li data-export-warn="notfinal">최종 확인 전 항목 <b>{notFinal.length}개</b> / {editable.length}개</li>
            <li data-export-warn="blank">비어 있는 항목 <b>{blank.length}개</b> (해당 없음이면 그대로 둬도 됩니다)</li>
            <li data-export-warn="offline">원본 서식에 직접 적을 칸 <b>{offline.length}개</b> — 주민등록번호 · 개인 연락처 · 자산 · 계좌 · 서명(날인)</li>
          </ul>
          {holders.length > 0 && (
            <details className="pt-1" data-export-holders={holders.length}>
              <summary className="min-h-[40px] cursor-pointer py-2 text-[0.95rem] font-bold text-amber-900">
                예시 · 확인 표시가 남은 항목 {holders.length}개 (○○ · 확인 필요 · 미정 등)
              </summary>
              <ul className="space-y-1">
                {holders.map((r) => (
                  <li key={r.def.key}>
                    <button type="button" className="min-h-[36px] break-keep text-left text-[0.93rem] font-semibold text-teal-700 underline-offset-2 hover:underline" onClick={() => onGo(r.def.key)}>
                      {r.path} ›
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {source.kind === 'work' && pfState.on && <PreflightView state={pfState} onGo={onGo} compact />}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button type="button" data-export-print className="btn-primary min-h-[48px]" onClick={() => window.print()}>
            <Printer size={18} /> 인쇄 · PDF 저장
          </button>
          <button type="button" data-export-copy className="btn-ghost min-h-[48px]" onClick={() => void copyAll()}>
            <ClipboardCopy size={18} /> 전체 복사
          </button>
          <button type="button" data-export-json className="btn-ghost min-h-[48px]" onClick={exportJson}>
            <Download size={18} /> 자료 내보내기
          </button>
          <button type="button" data-export-progress className="btn-ghost min-h-[48px]" onClick={exportProgress}>
            <FileText size={18} /> 진행 현황
          </button>
        </div>
        <p className="break-keep text-[0.9rem] leading-relaxed text-navy-500">
          HWPX(한글) 원본에 자동으로 채워 넣지는 않습니다 — 원본 표는 칸 합치기와 고정 문구가 많아 자동으로 넣으면 칸이 어긋날 수 있습니다.
          아래 미리보기는 원본 서식 순서 그대로이니, 칸마다 옮겨 적어 주세요. 검토 표시(상태 · 요청 · 확인)는 제출본에 나오지 않습니다.
        </p>
      </div>

      <div ref={docRef} data-export-doc className="rounded-2xl bg-white px-4 py-5 ring-1 ring-navy-100 sm:px-8 sm:py-8 print:rounded-none print:p-0 print:ring-0">
        <PlanDocument sections={sections} valueOf={valueOf} label={label} />
      </div>
    </div>
  )
}

/** 깨끗한 문서 — 원본 순서 그대로, 검토 표시 없음 */
export function PlanDocument({ sections, valueOf, label }: { sections: Section[]; valueOf: ValueOf; label: string }) {
  return (
    <article className="space-y-7 text-navy-900">
      <header className="space-y-1 border-b-2 border-navy-900 pb-3 text-center">
        <h1 className="break-keep text-[1.45rem] font-black">{BIZPLAN_DOC_TITLE}</h1>
        <p className="text-[0.95rem] font-semibold text-navy-500">{label} · {when(new Date().toISOString())} 기준</p>
      </header>
      {sections.map((s) => (
        <section key={s.id} data-doc-section={s.id} className="space-y-3 break-inside-avoid-page">
          <h2 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-navy-200 pb-1.5">
            <span className="break-keep text-[1.15rem] font-extrabold">{s.title}</span>
            {s.unit && <span className="text-[0.9rem] font-semibold text-navy-500">({s.unit})</span>}
          </h2>
          {s.groups.map((g) => (
            <div key={g.id} className="space-y-2">
              {g.title && <h3 className="break-keep text-[1rem] font-extrabold text-navy-700">{g.title}</h3>}
              {g.fields.map((f) => (
                <div key={f.key} data-doc-field={f.key} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
                  <p className="break-keep text-[0.95rem] font-bold text-navy-600">{f.label}{f.unit ? ` (${f.unit})` : ''}</p>
                  <div className="min-w-0">
                    {f.kind === 'offline' ? (
                      <p className="text-[0.98rem] text-navy-500">(제출본에 직접 기입)</p>
                    ) : isBlank(valueOf(f.key)) && f.kind !== 'notice' ? (
                      <p className="text-[0.98rem] text-navy-300">—</p>
                    ) : (
                      <ValueView def={f} value={valueOf(f.key)} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {s.footnotes?.map((x, i) => (
            <p key={i} className="break-keep text-[0.88rem] leading-snug text-navy-500">{x}</p>
          ))}
          {s.refs?.map((t, i) => <RefTableView key={i} t={t} />)}
        </section>
      ))}
    </article>
  )
}

/** 전체 복사용 글 — 원본 순서 · 검토 표시 없음 */
export function docText(sections: Section[], valueOf: ValueOf, label: string): string {
  const out: string[] = [BIZPLAN_DOC_TITLE, `(${label})`, '']
  for (const s of sections) {
    out.push(`■ ${s.title}${s.unit ? ` (${s.unit})` : ''}`)
    for (const g of s.groups) {
      if (g.title) out.push(`[${g.title}]`)
      for (const f of g.fields) {
        const text = plainText(f, valueOf(f.key))
        out.push(`- ${f.label}${f.unit ? ` (${f.unit})` : ''}: ${text.includes('\n') ? '\n' + text : text}`)
      }
    }
    for (const x of s.footnotes ?? []) out.push(x)
    out.push('')
  }
  return out.join('\n')
}
