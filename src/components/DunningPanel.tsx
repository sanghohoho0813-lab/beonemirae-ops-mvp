import { useMemo, useState } from 'react'
import { AlarmClock, Copy, Phone } from 'lucide-react'
import { Modal } from './Modal'
import { useData } from '../context/DataContext'
import { won } from '../lib/format'
import { ageLabel, dunningMessage, dunningSummary, type DunningRow } from '../lib/dunning'

// ─────────────────────────────────────────────────────────────────────────────
// 독촉 대상
//
//  통장 대사로 「들어온 돈」까지는 시스템이 붙였는데, 「안 들어온 돈을
//  누구에게 말할지」는 여전히 눈으로 골랐습니다. 미수금 목록은 청구월
//  순서로만 늘어놓아서, 석 달 밀린 곳과 어제 청구한 곳이 같아 보입니다.
//
//  여기서는 거래처 단위로 묶어, 오래 밀린 곳부터 위에 놓습니다.
//  문구는 만들어만 두고 보내지 않습니다 — 돈 이야기는 사람이 보냅니다.
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<string, string> = {
  '3개월이상': 'bg-rose-100 text-rose-600',
  '2개월': 'bg-orange-100 text-orange-600',
  '1개월': 'bg-amber-100 text-amber-700',
  이번달: 'bg-navy-100 text-navy-500',
}

export function DunningPanel() {
  const { data } = useData()
  const sum = useMemo(() => dunningSummary(data), [data])
  const [open, setOpen] = useState<DunningRow | null>(null)
  const [copied, setCopied] = useState(false)

  if (sum.rows.length === 0) return null

  const text = open ? dunningMessage(open) : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      //  클립보드를 못 쓰는 환경(구형 웹뷰·비 HTTPS)에서는 아래 상자를
      //  직접 길게 눌러 복사하면 됩니다. 실패를 감추지 않고 알려 줍니다.
      setCopied(false)
      window.alert('자동 복사가 막혀 있습니다. 아래 문구를 직접 선택해 복사해 주세요.')
    }
  }

  return (
    <section data-dunning className="mb-5">
      <div className="card border-rose-200 bg-rose-50/40 p-5">
        <div className="flex items-start gap-2.5">
          <AlarmClock size={20} className="mt-0.5 shrink-0 text-rose-500" strokeWidth={2.6} />
          <div className="min-w-0 flex-1">
            <p className="t-body font-extrabold text-navy-900">
              독촉 대상 {sum.rows.length}곳 · <span className="text-rose-600">{won(sum.total)}</span>
            </p>
            <p className="t-caption mt-0.5 break-keep">
              지난달 이전 청구가 아직 남아 있는 거래처입니다. 오래 밀린 곳부터 보여 줍니다.
            </p>
          </div>
        </div>

        {/* 구간 요약 — 대표가 먼저 보는 숫자는 「3개월 이상이 얼마인가」입니다 */}
        <div data-dunning-buckets className="mt-3 flex flex-wrap gap-2">
          {sum.byBucket.map((b) => (
            <span key={b.bucket} className={`pill ${TONE[b.bucket] ?? 'bg-navy-100 text-navy-500'}`}>
              {b.bucket === '3개월이상' ? '3개월 이상' : b.bucket === '이번달' ? '기한 지남' : `${b.bucket} 경과`} {b.count}곳 ·{' '}
              {won(b.amount)}
            </span>
          ))}
        </div>

        <ul className="mt-3.5 flex flex-col gap-2">
          {sum.rows.map((r) => (
            <li key={r.clientId} data-dunning-row={r.clientId} className="rounded-xl bg-white/90 p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-extrabold text-navy-900">{r.clientName}</span>
                <span className={`pill shrink-0 ${TONE[r.bucket] ?? ''}`}>{ageLabel(r)}</span>
              </div>
              <div className="mt-1.5 flex items-end justify-between gap-3">
                <p className="t-caption min-w-0 break-keep">
                  {r.bills.map((b) => `${b.billingMonth} ${won(b.outstanding)}`).join(' · ')}
                  {r.manager || r.phone ? (
                    <span className="ml-1 text-navy-400">
                      {' / '}
                      {[r.manager, r.phone].filter(Boolean).join(' ')}
                    </span>
                  ) : null}
                </p>
                <p className="shrink-0 text-right text-lg font-extrabold text-rose-600">{won(r.total)}</p>
              </div>
              <div className="mt-2.5 flex justify-end gap-2">
                {r.phone && (
                  <a
                    href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`}
                    className="flex items-center gap-1.5 rounded-full bg-navy-50 px-4 py-2 text-[1.05rem] font-bold text-navy-600 transition active:scale-95"
                  >
                    <Phone size={15} strokeWidth={2.6} />
                    전화
                  </a>
                )}
                <button
                  data-dunning-msg={r.clientId}
                  className="flex items-center gap-1.5 rounded-full bg-navy-800 px-4 py-2 text-[1.05rem] font-bold text-white transition active:scale-95"
                  onClick={() => {
                    setCopied(false)
                    setOpen(r)
                  }}
                >
                  <Copy size={15} strokeWidth={2.6} />
                  문구
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={open != null}
        title={`${open?.clientName ?? ''} 독촉 문구`}
        onClose={() => setOpen(null)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setOpen(null)}>
              닫기
            </button>
            <button data-dunning-copy className="btn-primary flex-1" onClick={() => void copy()}>
              {copied ? '복사했습니다' : '복사'}
            </button>
          </>
        }
      >
        <p className="t-muted break-keep">
          문자·카톡에 붙여 넣어 보내시면 됩니다. 자동으로 보내지 않습니다 — 보낼지 말지는 대표님이 정하십니다.
        </p>
        <textarea
          data-dunning-text
          readOnly
          value={text}
          rows={Math.min(14, text.split('\n').length + 1)}
          className="field-input w-full resize-none leading-relaxed"
          onFocus={(e) => e.currentTarget.select()}
        />
        <p className="t-muted break-keep">
          계좌번호는 넣지 않았습니다. 시스템에 저장된 값이 아니라 잘못 적히면 엉뚱한 곳으로 입금됩니다.
        </p>
      </Modal>
    </section>
  )
}
