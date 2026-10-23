import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CheckRow, FieldRow, OpenData, RequestRow } from '../../lib/bizPlan'
import { BizPlanError, openPlan } from '../../lib/bizPlanApi'
import { BizPlanContext, type PlanCtx } from './parts'
import { FieldEditor } from './FieldEditor'
import { RequestSheet } from './RequestSheet'

// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 자료 · 창(편집 · 수정요청) · 알림을 한곳에서 (0146)
//
//  사업계획서 화면(/bizplan)과 요청함 탭(사용자 피드백 › 사업계획서 수정요청)이
//  같은 것을 씁니다. 자료는 서버 함수 bizplan_open 하나로 받습니다.
//  다른 분이 고친 것이 보이도록, 앱으로 돌아올 때(화면이 다시 보일 때) 다시 읽습니다.
// ─────────────────────────────────────────────────────────────────────────────

export type LoadState = { kind: 'loading' } | { kind: 'fail'; error: BizPlanError } | { kind: 'ready'; data: OpenData }

export function BizPlanProvider({
  children,
  onOpenField,
  fallback,
}: {
  children: ReactNode
  /** 항목을 골랐을 때 (문서 화면: 오른쪽 칸 · 요청함: 문서로 이동) */
  onOpenField: (key: string) => void
  /** 불러오는 중 · 못 불러옴 */
  fallback: (s: Exclude<LoadState, { kind: 'ready' }>, retry: () => void) => ReactNode
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [editor, setEditor] = useState<{ key: string; requestId?: string; suggestion?: string } | null>(null)
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null)
  const loading = useRef(false)

  const reload = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const data = await openPlan()
      setState({ kind: 'ready', data })
    } catch (e) {
      const err = e instanceof BizPlanError ? e : new BizPlanError('other', '잠시 문제가 생겼습니다.')
      //  이미 열려 있으면 화면을 지우지 않고 알림만 — 적던 글이 날아가지 않게
      setState((s) => (s.kind === 'ready' ? s : { kind: 'fail', error: err }))
      if (err.kind !== 'missing' && err.kind !== 'denied') setToast({ msg: err.message, n: Date.now() })
      throw err
    } finally {
      loading.current = false
    }
  }, [])

  useEffect(() => {
    reload().catch(() => undefined)
    const onVis = () => {
      if (document.visibilityState === 'visible') reload().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [reload])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast])

  const notify = useCallback((msg: string) => setToast({ msg, n: Date.now() }), [])
  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    reload().catch(() => undefined)
  }, [reload])

  const ctx = useMemo<PlanCtx | null>(() => {
    if (state.kind !== 'ready') return null
    const d = state.data
    const fields = new Map<string, FieldRow>(d.fields.map((f) => [f.key, f]))
    const requestsByKey = new Map<string, RequestRow[]>()
    for (const r of d.requests) requestsByKey.set(r.key, [...(requestsByKey.get(r.key) ?? []), r])
    const checksByKey = new Map<string, CheckRow[]>()
    for (const c of d.checks) checksByKey.set(c.key, [...(checksByKey.get(c.key) ?? []), c])
    return {
      data: d,
      fields,
      requestsByKey,
      checksByKey,
      isEditor: d.me?.role === 'editor',
      reload: () => reload().catch(() => undefined),
      notify,
      openRequest: (key) => setRequestKey(key),
      openEditor: (key, o) => setEditor({ key, ...o }),
      openField: onOpenField,
    }
  }, [state, reload, notify, onOpenField])

  if (!ctx) return <>{fallback(state as Exclude<LoadState, { kind: 'ready' }>, retry)}</>

  return (
    <BizPlanContext.Provider value={ctx}>
      {children}
      {editor && <FieldEditor key={`${editor.key}:${editor.requestId ?? ''}`} fieldKey={editor.key} requestId={editor.requestId} suggestion={editor.suggestion} onClose={() => setEditor(null)} />}
      {requestKey && <RequestSheet key={requestKey} fieldKey={requestKey} onClose={() => setRequestKey(null)} />}
      {toast && (
        <div
          key={toast.n}
          role="status"
          data-bizplan-toast
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-[80] flex justify-center px-4 lg:bottom-6 print:hidden"
        >
          <p className="max-w-md break-keep rounded-2xl bg-navy-900 px-4 py-3 text-center text-[0.98rem] font-bold text-white shadow-lg">{toast.msg}</p>
        </div>
      )}
    </BizPlanContext.Provider>
  )
}
