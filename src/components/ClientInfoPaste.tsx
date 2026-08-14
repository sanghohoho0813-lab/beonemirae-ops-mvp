import { useMemo, useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { useData } from '../context/DataContext'
import { ExpandableSection, SecondaryButton } from './ui'
import { changeText, parseClientInfo, patchOf } from '../lib/clientImport'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 정보 붙여넣기
//
//  세금계산서 칸을 만들었지만 그 값은 지금 이사님 엑셀에 있습니다.
//  스무 곳을 하나씩 열어 여섯 칸씩 옮겨 적기 전까지 세금계산서 목록은
//  계속 비어 있습니다. 있는 엑셀을 그대로 붙여 넣게 합니다.
//
//  단가는 여기서 넣지 않습니다 — 청구 금액을 바꾸는 값이라 거래처마다
//  계약서를 보고 한 곳씩 확인해야 합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function ClientInfoPaste() {
  const { data, updateClient, reload, sync } = useData()
  const [text, setText] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ ok: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => parseClientInfo(text, data.clients), [text, data.clients])
  //  덮어쓰기가 꺼져 있으면 빈 칸만 채웁니다 — 실제로 바뀌는 게 없는
  //  줄까지 「저장할 3곳」에 세면 눌러도 아무 일이 없습니다.
  const willChange = parsed.matched.filter((r) => Object.keys(patchOf(r, overwrite)).length > 0)
  const conflicts = parsed.matched.filter((r) => r.changes.some((c) => c.conflict))

  async function save() {
    if (willChange.length === 0) return
    if (
      !window.confirm(
        `거래처 ${willChange.length}곳의 정보를 채웁니다.\n` +
          (overwrite
            ? '이미 들어 있는 값도 덮어씁니다.\n'
            : '지금 비어 있는 칸만 채웁니다 (기존 값은 그대로 둡니다).\n') +
          '\n진행할까요?',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    let ok = 0
    for (const r of willChange) {
      if (!r.clientId) continue
      const res = await updateClient(r.clientId, patchOf(r, overwrite), { quiet: true })
      if (!res.ok) {
        setError(res.error ?? '저장하지 못했습니다.')
        break
      }
      ok += 1
    }
    await reload()
    setBusy(false)
    setDone({ ok, skipped: parsed.unmatched.length })
    if (ok === willChange.length) setText('')
  }

  return (
    <ExpandableSection label="엑셀에서 한 번에 붙여넣기">
      <div data-paste className="card p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <ClipboardPaste size={19} className="mt-0.5 shrink-0 text-navy-400" strokeWidth={2.4} />
          <div className="min-w-0 flex-1 text-[1.05rem] leading-relaxed text-navy-600">
            <p className="break-keep">
              쓰시던 엑셀에서 <b className="text-navy-800">머리글까지 함께</b> 긁어 붙여 넣으세요. 거래처명으로 찾아
              사업자정보와 결제일을 채웁니다.
            </p>
            <p className="t-caption mt-1 break-keep">
              단가는 여기서 넣지 않습니다 — 청구 금액을 바꾸는 값이라 계약서를 보고 한 곳씩 확인해야 합니다. 이름이
              목록에 없으면 새로 만들지 않고 그대로 알려 드립니다.
            </p>
          </div>
        </div>

        <textarea
          data-paste-input
          rows={5}
          className="field-input mt-3 w-full resize-y font-mono text-[0.98rem]"
          placeholder={'거래처명\t사업자등록번호\t대표자\t업태\t종목\t이메일\t부가세\t결제일\n더원요양병원\t123-45-67890\t김대표\t의료업\t병원\ttax@x.kr\t별도\t20'}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setDone(null)
          }}
        />

        {text.trim() !== '' && !parsed.hasHeader && (
          <p data-paste-nohead className="mt-2 break-keep text-[1.03rem] font-semibold text-amber-700">
            머리글 줄을 찾지 못했습니다. 「거래처명 · 사업자등록번호 · 대표자 …」처럼 첫 줄에 칸 이름을 함께 넣어
            주세요 — 순서를 짐작해 엉뚱한 칸에 넣지 않기 위해서입니다.
          </p>
        )}

        {parsed.hasHeader && (
          <p data-paste-cols className="t-caption mt-2 break-keep text-navy-500">
            읽은 칸 — {Object.keys(parsed.columns).filter((k) => k !== 'name').length}개 ·{' '}
            {parsed.matched.length}곳을 찾았습니다
            {parsed.unmatched.length > 0 && ` · ${parsed.unmatched.length}줄은 확인이 필요합니다`}
          </p>
        )}

        {willChange.length > 0 && (
          <div data-paste-preview className="mt-3 rounded-xl bg-navy-50/70 p-3.5">
            <p className="t-body font-bold text-navy-800">채울 거래처 {willChange.length}곳</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {willChange.slice(0, 12).map((r) => (
                <li key={r.line} data-paste-row={r.clientId} className="t-caption break-keep text-navy-600">
                  <b className="text-navy-800">{r.clientName}</b>{' '}
                  {r.changes
                    .filter((c) => overwrite || !c.conflict)
                    .map(changeText)
                    .join(' · ')}
                </li>
              ))}
              {willChange.length > 12 && (
                <li className="t-caption text-navy-400">외 {willChange.length - 12}곳</li>
              )}
            </ul>
          </div>
        )}

        {/*
          이미 값이 있는 칸은 기본으로 손대지 않습니다. 어느 쪽이 맞는지는
          사람이 압니다 — 시스템이 붙여 넣은 쪽을 맞다고 정하면 안 됩니다.
        */}
        {conflicts.length > 0 && (
          <label data-paste-conflict className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-amber-50 p-3.5">
            <input
              type="checkbox"
              data-paste-overwrite
              className="mt-1 h-5 w-5 shrink-0 accent-amber-600"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            <span className="min-w-0 text-[1.03rem] leading-relaxed text-navy-700">
              <b className="text-amber-700">이미 값이 들어 있는 칸 {conflicts.length}곳</b>은 기본으로 그대로 둡니다.
              붙여 넣은 값이 맞다면 켜 주세요 — 켜면 기존 값을 덮어씁니다.
              <span className="t-caption mt-1 block break-keep text-navy-500">
                {conflicts
                  .slice(0, 4)
                  .map((r) => `${r.clientName} ${r.changes.filter((c) => c.conflict).map(changeText).join(', ')}`)
                  .join(' / ')}
                {conflicts.length > 4 && ` 외 ${conflicts.length - 4}곳`}
              </span>
            </span>
          </label>
        )}

        {parsed.unmatched.length > 0 && (
          <div data-paste-bad className="mt-2 rounded-xl bg-rose-50 p-3.5">
            <p className="t-body font-bold text-rose-600">확인이 필요한 {parsed.unmatched.length}줄 — 저장하지 않습니다</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {parsed.unmatched.slice(0, 8).map((r) => (
                <li key={r.line} className="t-caption break-keep text-navy-600">
                  {r.line}번째 줄 「{r.name}」 — {r.blockers.join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p data-paste-error className="mt-2 text-[1.03rem] font-semibold text-rose-600">
            {error}
          </p>
        )}
        {done && (
          <p data-paste-done className="mt-2 text-[1.03rem] font-semibold text-teal-700">
            거래처 {done.ok}곳을 채웠습니다{done.skipped > 0 && ` · ${done.skipped}줄은 건너뛰었습니다`}.
          </p>
        )}

        <div className="mt-3">
          <SecondaryButton onClick={() => void save()} disabled={busy || sync.saving || willChange.length === 0}>
            <span data-paste-save>{busy ? '저장하는 중…' : `${willChange.length}곳 채우기`}</span>
          </SecondaryButton>
        </div>
      </div>
    </ExpandableSection>
  )
}
