import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { heartbeatStatus, type Heartbeat } from '../lib/repo'
import { SERVER_PAUSED_MESSAGE } from '../lib/supabase'
import { daysSince } from './BackupReminder'

// ─────────────────────────────────────────────────────────────────────────────
// 서버 유지 신호 (0151)
//
//  Supabase 무료 프로젝트는 1주일 동안 DB 사용이 없으면 일시정지됩니다. 직원이 앱을
//  쓰는 날은 그것으로 충분합니다 — 이 신호는 **아무도 안 쓰는 주**를 위한 것입니다.
//
//  이 카드가 하는 일은 두 가지뿐입니다.
//   · 마지막 유지 신호가 언제였는지 보여 줍니다 (PROPOSAL_0151 을 실행했을 때)
//   · 「지금 유지 신호 보내기」 — /api/keepalive 를 한 번 부릅니다
//
//  ⚠ 사람 손 없이 매일 보내는 **예약 호출은 이 카드가 켜지 않습니다.** 켜져 있는지도
//    이 화면은 알 수 없습니다 — 그래서 「켜져 있다」고 말하지 않고, 마지막 신호 시각으로
//    스스로 확인하게 합니다(켜져 있으면 그 시각이 매일 바뀝니다).
//  ⚠ 이 카드를 여는 것만으로는 신호가 가지 않습니다 — 그래야 저 시각이 예약 호출이
//    실제로 돌았는지를 말해 줍니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 날수 넘게 신호가 없으면 「예약이 돌지 않는다」고 알립니다 */
const QUIET_DAYS = 3

type Status = { kind: 'loading' } | { kind: 'missing' } | { kind: 'unavailable' } | { kind: 'ready'; hb: Heartbeat }
type Sent = { tone: 'ok' | 'warn' | 'bad'; text: string }

const fmtAt = (iso: string) =>
  new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/** /api/keepalive 의 답을 사람 말로 */
export function sentMessage(body: unknown): Sent {
  const r = (body ?? {}) as { ok?: unknown; state?: unknown; needs_sql?: unknown }
  if (r.state === 'paused') return { tone: 'bad', text: SERVER_PAUSED_MESSAGE }
  if (r.state === 'not_configured')
    return { tone: 'bad', text: '보내지 못했습니다 — 배포 서버에 Supabase 주소 · 공개 키 환경변수가 없습니다 (Vercel 환경변수 확인).' }
  if (r.ok === true && r.state === 'ok') return { tone: 'ok', text: '유지 신호를 보냈습니다 — DB 가 기록했습니다.' }
  if (r.ok === true && r.state === 'reached')
    return {
      tone: 'warn',
      text: '유지 신호가 DB 까지 닿았습니다. 다만 기록 함수가 없어 시각은 남지 않았습니다 (PROPOSAL_0151_keepalive.sql 실행 전).',
    }
  if (r.state === 'down') return { tone: 'bad', text: '유지 신호가 DB 에 닿지 못했습니다 — 서버가 응답하지 않습니다. 잠시 뒤 다시 눌러 주세요.' }
  return { tone: 'bad', text: '이 주소에는 유지 신호 기능이 없습니다 — 배포된 주소(운영 주소)에서 눌러 주세요.' }
}

export function KeepaliveCard() {
  const { role, mode } = useAuth()
  const on = mode === 'live' && role === 'admin'
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)

  const load = useCallback(async () => {
    try {
      const hb = await heartbeatStatus()
      setStatus(hb === 'missing' ? { kind: 'missing' } : { kind: 'ready', hb })
    } catch {
      //  통신이 끊겨도 설정 화면의 나머지는 그대로 써야 합니다
      setStatus({ kind: 'unavailable' })
    }
  }, [])

  useEffect(() => {
    if (on) void load()
  }, [on, load])

  if (!on) return null

  async function send() {
    setSending(true)
    setSent(null)
    try {
      const res = await fetch('/api/keepalive', { cache: 'no-store' })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        body = null //  이 주소에 함수가 없으면 화면(HTML)이 옵니다
      }
      setSent(sentMessage(body))
      await load()
    } catch {
      setSent({ tone: 'bad', text: '보내지 못했습니다 — 인터넷 연결을 확인하고 다시 눌러 주세요.' })
    } finally {
      setSending(false)
    }
  }

  const hb = status.kind === 'ready' ? status.hb : null
  const days = hb?.lastAt ? daysSince(hb.lastAt) : null
  const quiet = days != null && days >= QUIET_DAYS

  return (
    <div data-keepalive-card={status.kind} className={`card px-4 py-3.5 sm:px-5 ${quiet ? 'border-amber-200 bg-amber-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            quiet ? 'bg-amber-100 text-amber-700' : 'bg-navy-50 text-navy-500'
          }`}
        >
          {quiet ? <AlertTriangle size={20} strokeWidth={2.4} /> : <Activity size={20} strokeWidth={2.3} />}
        </span>
        <div className="min-w-0 flex-1 basis-[12rem]">
          <p className="t-body break-keep font-extrabold text-navy-900">서버 유지 신호</p>
          <p className="t-muted mt-0.5 break-keep" data-keepalive-line>
            {status.kind === 'loading' ? (
              <>
                <Loader2 size={14} className="mr-1 inline animate-spin" /> 확인하는 중…
              </>
            ) : status.kind === 'missing' ? (
              '마지막 신호 시각을 남기는 기능이 이 DB 에 아직 없습니다 (PROPOSAL_0151_keepalive.sql 실행 전). 신호는 지금도 보낼 수 있습니다.'
            ) : status.kind === 'unavailable' ? (
              '마지막 신호 시각을 읽지 못했습니다.'
            ) : !hb?.lastAt ? (
              '아직 유지 신호가 한 번도 없었습니다.'
            ) : (
              <>
                {!quiet && <CheckCircle2 size={14} className="mr-1 inline -translate-y-px text-emerald-600" />}
                마지막 유지 신호 {fmtAt(hb.lastAt)} ({days === 0 ? '오늘' : `${days}일 전`}) · 누적 {hb.pings.toLocaleString('ko-KR')}번
              </>
            )}
          </p>
        </div>
        <button className="btn-ghost min-h-[2.75rem] max-sm:w-full" data-keepalive-send onClick={() => void send()} disabled={sending}>
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} strokeWidth={2.4} />}
          {sending ? '보내는 중…' : '지금 유지 신호 보내기'}
        </button>
      </div>

      {quiet && (
        <p className="t-body mt-3 break-keep font-bold text-amber-900" data-keepalive-quiet>
          {days}일째 유지 신호가 없습니다 — 예약 호출이 꺼져 있거나 돌지 않고 있습니다. 직원이 매일 앱을 쓰고 있다면 괜찮습니다.
        </p>
      )}

      {sent && (
        <p
          data-keepalive-sent={sent.tone}
          className={`t-body mt-3 break-keep rounded-xl px-3 py-2.5 font-bold ${
            sent.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : sent.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {sent.text}
        </p>
      )}

      <p className="t-muted mt-3 break-keep" data-keepalive-note>
        무료 서버는 <b className="text-navy-600">1주일 동안 사용이 없으면 일시정지</b>됩니다. 직원이 앱을 쓰는 날은 그것으로 충분하고,
        이 신호는 아무도 안 쓰는 주를 위한 것입니다. 사람 손 없이 매일 보내는 <b className="text-navy-600">예약 호출은 따로 켜야</b> 합니다 —
        켜져 있으면 위 시각이 매일 바뀝니다 (방법: 저장소의 docs/SERVER_KEEPALIVE_0151.md).
      </p>
    </div>
  )
}
