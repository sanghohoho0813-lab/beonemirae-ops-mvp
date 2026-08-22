import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Stethoscope } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { healthCheck, EXPECTED_SCHEMA_VERSION, type HealthCheck } from '../lib/repo'

// ─────────────────────────────────────────────────────────────────────────────
// DB 자가진단
//
//  화면 맨 위의 안내는 **판 번호 하나**만 봅니다. 그 숫자는 마이그레이션
//  파일 마지막 줄에서 올라가므로 「파일이 끝까지 돌았다」까지만 말해 줍니다.
//  그 뒤에 정책이 지워지거나 색인이 사라져도 숫자는 그대로입니다.
//
//  여기서는 서버가 **직접 세어** 봅니다 — 돈을 지키는 표·칸·함수·색인·권한이
//  실제로 거기 있는지. 없으면 이름을 그대로 보여 줍니다. 「어딘가 이상합니다」
//  같은 말은 아무 도움이 안 됩니다.
//
//  이상이 없으면 한 줄로 끝냅니다. 매번 긴 목록을 보여 줄 이유가 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function HealthCard() {
  const { role, mode } = useAuth()
  const [state, setState] = useState<'loading' | 'done' | 'unavailable'>('loading')
  const [health, setHealth] = useState<HealthCheck | null>(null)

  useEffect(() => {
    if (mode !== 'live' || role !== 'admin') return
    let alive = true
    void healthCheck()
      .then((h) => {
        if (!alive) return
        setHealth(h)
        //  0043 이전 DB 에는 이 함수가 없습니다 — 고장이 아니라 구버전입니다.
        setState(h ? 'done' : 'unavailable')
      })
      //  통신이 끊겨도 설정 화면의 나머지(백업·내보내기)는 그대로 써야 합니다.
      .catch(() => {
        if (alive) setState('unavailable')
      })
    return () => {
      alive = false
    }
  }, [mode, role])

  if (mode !== 'live' || role !== 'admin') return null

  const bad = health ? !health.ok : false

  return (
    <div
      data-health-card
      className={`card px-4 py-3.5 sm:px-5 ${bad ? 'border-rose-200 bg-rose-50' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            bad ? 'bg-rose-100 text-rose-600' : 'bg-navy-50 text-navy-500'
          }`}
        >
          {bad ? <AlertTriangle size={20} strokeWidth={2.4} /> : <Stethoscope size={20} strokeWidth={2.3} />}
        </span>
        <div className="min-w-0 flex-1 basis-[12rem]">
          <p className="t-body break-keep font-extrabold text-navy-900">서버 자가진단</p>
          <p className="t-muted mt-0.5 break-keep" data-health-line>
            {state === 'loading' ? (
              <>
                <Loader2 size={14} className="mr-1 inline animate-spin" /> 확인하는 중…
              </>
            ) : state === 'unavailable' ? (
              `이 DB 에는 자가진단이 아직 없습니다 — 앱은 판 ${EXPECTED_SCHEMA_VERSION} 기준입니다.`
            ) : bad ? (
              `${health?.missing.length}군데가 있어야 하는데 없습니다 — 아래 이름 그대로 확인해 주세요.`
            ) : (
              <>
                <CheckCircle2 size={14} className="mr-1 inline -translate-y-px text-emerald-600" />
                돈을 지키는 표 · 칸 · 함수 · 색인 · 권한이 모두 제자리에 있습니다 (판 {health?.version}).
              </>
            )}
          </p>
        </div>
      </div>

      {bad && (
        <ul className="mt-3 space-y-1" data-health-missing>
          {health?.missing.map((m) => (
            <li key={m} className="t-body break-keep font-bold text-rose-700">
              · {m}
            </li>
          ))}
        </ul>
      )}

      {bad && (
        <p className="t-muted mt-3 break-keep">
          이 목록은 <b className="text-navy-600">아직 실행하지 않은 RUN_*.sql 이 있다</b>는 뜻이거나, 누군가 서버에서
          직접 지웠다는 뜻입니다. 그대로 두면 돈이 두 번 들어가거나 지워질 수 있습니다.
        </p>
      )}
    </div>
  )
}
