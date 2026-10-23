import { useEffect, useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { ROLE_LABEL } from '../../context/AuthContext'
import { BizPlanError, memberSet, membersList, type MembersData } from '../../lib/bizPlanApi'
import { Pill, usePlan, when } from './parts'

// ─────────────────────────────────────────────────────────────────────────────
// 참여자 — 누가 이 사업계획서를 보고 고칠 수 있는가 (0146)
//
//  · 담당(editor) — 본문을 고치고, 수정요청을 처리하고, 버전을 저장합니다.
//  · 검토(reviewer) — 읽고, 확인 표시를 하고, 수정요청을 남깁니다(본문은 못 고침).
//  · 대표·관리자 계정은 등록하지 않아도 「검토」로 열립니다. 담당이 되려면 등록합니다.
//  · 사무실 계정은 등록해야 열립니다. 현장 · 병원 계정은 서버가 등록을 거절합니다.
//  화면에서 막는 것이 아니라 **서버가** 정합니다(bizplan_member_set · bizplan_require).
// ─────────────────────────────────────────────────────────────────────────────

const TITLES = ['대표', '이사', '사업계획 담당']

export function MembersTab() {
  const { reload, notify } = usePlan()
  const [d, setD] = useState<MembersData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [add, setAdd] = useState<{ id: string; role: 'editor' | 'reviewer'; title: string } | null>(null)

  async function load() {
    try {
      setD(await membersList())
      setErr(null)
    } catch (e) {
      setErr(e instanceof BizPlanError ? e.message : '불러오지 못했습니다.')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function set(id: string, role: 'editor' | 'reviewer', title: string, active: boolean) {
    setBusy(id)
    try {
      await memberSet(id, role, title, active)
      await load()
      await reload()
      notify('참여자를 바꿨습니다 · 기록이 남았습니다.')
      setAdd(null)
    } catch (e) {
      notify(e instanceof BizPlanError ? e.message : '바꾸지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  if (err) return <p className="rounded-2xl bg-rose-50 px-4 py-3 text-[0.98rem] font-bold text-rose-700">{err}</p>
  if (!d)
    return (
      <p className="flex items-center gap-2 text-[1rem] font-bold text-navy-500">
        <Loader2 size={18} className="animate-spin" /> 불러오는 중…
      </p>
    )
  const memberIds = new Set(d.members.map((m) => m.profile_id))
  const candidates = d.candidates.filter((c) => !memberIds.has(c.profile_id))

  return (
    <div className="space-y-4" data-bizplan-members>
      <p className="break-keep rounded-2xl bg-navy-50 px-4 py-3 text-[0.95rem] leading-relaxed text-navy-700">
        <b>담당</b>은 본문을 고치고 수정요청을 처리합니다. <b>검토</b>는 읽고 · 확인 표시 · 수정요청만 합니다.
        대표·관리자 계정은 등록하지 않아도 검토로 열립니다. 현장 · 병원 계정은 등록할 수 없습니다.
      </p>
      <ul className="space-y-2">
        {d.members.map((m) => (
          <li key={m.profile_id} data-member-row={m.name} className={`space-y-2 rounded-xl px-3.5 py-3 ring-1 ${m.active ? 'bg-white ring-navy-100' : 'bg-navy-50 ring-navy-100 opacity-80'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[1.05rem] font-extrabold text-navy-900">{m.name}</span>
              {m.title && <Pill>{m.title}</Pill>}
              <Pill tone={m.role === 'editor' ? 'teal' : 'navy'}>{m.role === 'editor' ? '담당' : '검토'}</Pill>
              {!m.active && <Pill tone="rose">꺼짐</Pill>}
              <span className="text-[0.88rem] text-navy-400">
                {ROLE_LABEL[m.account_role as keyof typeof ROLE_LABEL] ?? m.account_role} 계정 · {m.added_by} {when(m.added_at)} 등록
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-member-role={m.role === 'editor' ? 'reviewer' : 'editor'} disabled={busy === m.profile_id} onClick={() => void set(m.profile_id, m.role === 'editor' ? 'reviewer' : 'editor', m.title, m.active)} className="min-h-[40px] rounded-full bg-navy-50 px-3.5 text-[0.92rem] font-bold text-navy-700">
                {m.role === 'editor' ? '검토로 바꾸기' : '담당으로 바꾸기'}
              </button>
              <button type="button" data-member-active={!m.active} disabled={busy === m.profile_id} onClick={() => void set(m.profile_id, m.role, m.title, !m.active)} className="min-h-[40px] rounded-full bg-navy-50 px-3.5 text-[0.92rem] font-bold text-navy-700">
                {m.active ? '참여 끄기' : '다시 켜기'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <section className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-navy-100">
        <h3 className="flex items-center gap-2 text-[1.05rem] font-extrabold text-navy-900">
          <UserPlus size={18} /> 참여자 등록
        </h3>
        {candidates.length === 0 ? (
          <p className="text-[0.95rem] text-navy-400">등록할 수 있는 대표·관리자 · 사무실 계정이 더 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <button
                key={c.profile_id}
                type="button"
                data-member-candidate={c.name}
                onClick={() => setAdd({ id: c.profile_id, role: 'reviewer', title: '' })}
                className={`min-h-[44px] rounded-full px-3.5 text-[0.95rem] font-bold ${add?.id === c.profile_id ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700'}`}
              >
                {c.name || '(이름 없음)'} · {ROLE_LABEL[c.account_role as keyof typeof ROLE_LABEL] ?? c.account_role}
              </button>
            ))}
          </div>
        )}
        {add && (
          <div className="space-y-2 border-t border-navy-100 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {(['reviewer', 'editor'] as const).map((r) => (
                <button key={r} type="button" data-member-new-role={r} aria-pressed={add.role === r} onClick={() => setAdd({ ...add, role: r })} className={`min-h-[44px] rounded-full px-4 text-[0.95rem] font-bold ${add.role === r ? 'bg-teal-600 text-white' : 'bg-navy-50 text-navy-700'}`}>
                  {r === 'editor' ? '담당 (고치기 · 처리)' : '검토 (읽기 · 요청)'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TITLES.map((t) => (
                <button key={t} type="button" onClick={() => setAdd({ ...add, title: t })} className={`min-h-[40px] rounded-full px-3 text-[0.92rem] font-bold ${add.title === t ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-600'}`}>
                  {t}
                </button>
              ))}
              <input className="field-input min-w-[8rem] flex-1" data-member-title value={add.title} maxLength={30} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="직함 (예: 이사)" />
            </div>
            <button type="button" data-member-save className="btn-primary min-h-[48px] w-full sm:w-auto" disabled={busy === add.id} onClick={() => void set(add.id, add.role, add.title.trim(), true)}>
              {busy === add.id && <Loader2 size={16} className="animate-spin" />} 등록
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
