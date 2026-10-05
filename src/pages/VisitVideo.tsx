import { useEffect, useRef, useState } from 'react'
import { Expand, Film, Gauge, ListVideo, Lock, Play } from 'lucide-react'
import { PageShell } from '../components/ui'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { VISIT_VIDEO } from '../lib/visitVideo'

// ─────────────────────────────────────────────────────────────────────────────
// 신용보증기금 방문용 영상 (/visit-video) — 0130
//
//  대표님 요청: 「대표님·이사님·개발자 화면에서 볼 수 있게, 오늘 날짜·현재 시각
//  옆에 버튼을 두고, 누르면 영상과 간단한 상세가 뜨게. 1.25배·1.5배로도」.
//
//  ⚠ 영상 파일은 **저장소(public/)에 넣지 않았습니다.** 이 저장소는 공개라,
//    public/ 에 두면 주소만 알면 누구나 매출 숫자가 든 영상을 받을 수 있습니다.
//    Supabase Storage 의 **비공개** 칸(visit-media)에 두고, 대표·사무실 계정이
//    화면을 열 때마다 몇 시간짜리 서명 주소를 받아 재생합니다.
//    (칸 만들기·권한은 supabase/proposals/PROPOSAL_0130_visit_video_storage.sql)
// ─────────────────────────────────────────────────────────────────────────────

const RATES = [1, 1.25, 1.5] as const
type Rate = (typeof RATES)[number]

type Src =
  | { state: 'loading' }
  | { state: 'ready'; url: string }
  | { state: 'missing'; reason: string }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function VisitVideo() {
  const video = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<Src>({ state: 'loading' })
  const [rate, setRate] = useState<Rate>(1)
  const [now, setNow] = useState(0)

  useEffect(() => {
    let alive = true
    if (!isSupabaseConfigured || !supabase) {
      setSrc({ state: 'missing', reason: '데모 모드에서는 영상이 열리지 않습니다 — 실제 계정으로 로그인해 주세요.' })
      return
    }
    supabase.storage
      .from(VISIT_VIDEO.bucket)
      .createSignedUrl(VISIT_VIDEO.path, VISIT_VIDEO.signSeconds)
      .then(({ data, error }) => {
        if (!alive) return
        if (error || !data?.signedUrl) {
          setSrc({ state: 'missing', reason: '영상 파일을 아직 찾지 못했습니다. 아래 「영상 올리는 법」을 확인해 주세요.' })
        } else setSrc({ state: 'ready', url: data.signedUrl })
      })
    return () => { alive = false }
  }, [])

  //  ⚠ 브라우저는 영상 주소가 바뀌거나 다시 읽을 때 속도를 1배로 되돌립니다.
  //    고른 속도를 상태로 들고 있다가, 영상이 준비될 때마다 다시 걸어 둡니다.
  useEffect(() => {
    if (video.current) video.current.playbackRate = rate
  }, [rate, src])

  const seek = (t: number) => {
    const v = video.current
    if (!v) return
    v.currentTime = t
    void v.play().catch(() => {})
  }
  const full = () => { void video.current?.requestFullscreen?.().catch(() => {}) }

  return (
    <PageShell>
      <header className="px-1">
        <p className="text-[0.9rem] font-extrabold tracking-[0.2em] text-teal-600">신용보증기금 방문용</p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight text-navy-900 lg:text-[2rem]">신용보증기금 방문용 영상</h1>
        <p className="mt-2 text-[1rem] font-semibold text-navy-500">
          ㈜비원미래 상담용 소개 영상 · {VISIT_VIDEO.lengthLabel} · 세로 화면(9:16) · 자막 포함
        </p>
      </header>

      <div className="grid gap-6 min-[1380px]:grid-cols-[minmax(0,auto)_minmax(0,1fr)] min-[1380px]:items-start">
        {/* ── 영상 ─────────────────────────────────────────────────────── */}
        <section className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-navy-100 lg:p-4" data-visit-video-player>
          {/*  ⚠ 두 칸은 1380px 부터 — 1024px 에서는 상세가 글자 한 자 폭, 1280px 에서도 252px 로 찌그러졌습니다 */}
          <div className="mx-auto overflow-hidden rounded-2xl bg-[#0f1216]" style={{ aspectRatio: '9 / 16', height: 'min(76vh, 760px)', maxWidth: '100%' }}>
            {src.state === 'ready' ? (
              <video
                ref={video}
                src={src.url}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
                onLoadedMetadata={(e) => { e.currentTarget.playbackRate = rate }}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                className="h-full w-full bg-black object-contain"
                data-visit-video
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[1rem] font-semibold text-white/80" data-visit-video-missing={src.state === 'missing' ? '' : undefined}>
                {src.state === 'loading' ? <Film className="h-9 w-9 animate-pulse" aria-hidden /> : <Lock className="h-9 w-9" aria-hidden />}
                <p>{src.state === 'loading' ? '영상을 불러오는 중…' : src.reason}</p>
              </div>
            )}
          </div>

          {/* 재생 속도 — 1배 · 1.25배 · 1.5배 */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="재생 속도">
            <span className="me-1 flex items-center gap-1 text-[0.95rem] font-bold text-navy-500">
              <Gauge className="h-4 w-4" aria-hidden /> 재생 속도
            </span>
            {RATES.map((r) => (
              <button
                key={r}
                type="button"
                data-rate={r}
                aria-pressed={rate === r}
                onClick={() => setRate(r)}
                className={`min-h-[44px] min-w-[72px] rounded-full px-4 text-[1rem] font-extrabold ring-1 transition ${
                  rate === r ? 'bg-navy-800 text-white ring-navy-800' : 'bg-white text-navy-600 ring-navy-200 hover:bg-navy-50'
                }`}
              >
                {r === 1 ? '1배' : `${r}배`}
              </button>
            ))}
            <button
              type="button"
              onClick={full}
              disabled={src.state !== 'ready'}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-4 text-[1rem] font-bold text-navy-600 ring-1 ring-navy-200 transition hover:bg-navy-50 disabled:opacity-40"
            >
              <Expand className="h-4 w-4" aria-hidden /> 전체 화면
            </button>
          </div>
        </section>

        {/* ── 간단한 상세 ───────────────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-navy-100" data-visit-chapters>
            <h2 className="flex items-center gap-2 text-[1.15rem] font-extrabold text-navy-900">
              <ListVideo className="h-5 w-5 text-teal-600" aria-hidden /> 영상 흐름
            </h2>
            <p className="mt-1 text-[0.95rem] font-medium text-navy-500">누르면 그 장면부터 재생합니다.</p>
            <ol className="mt-3 divide-y divide-navy-50">
              {VISIT_VIDEO.chapters.map((c, i) => {
                const next = VISIT_VIDEO.chapters[i + 1]?.at ?? Infinity
                const on = src.state === 'ready' && now >= c.at && now < next
                return (
                  <li key={c.at}>
                    <button
                      type="button"
                      onClick={() => seek(c.at)}
                      disabled={src.state !== 'ready'}
                      className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-navy-50 disabled:cursor-default disabled:hover:bg-transparent ${on ? 'bg-teal-50' : ''}`}
                    >
                      <span className="w-12 shrink-0 font-mono text-[0.95rem] font-bold text-navy-400">{mmss(c.at)}</span>
                      <span className="text-[1rem] font-bold text-navy-800">{c.title}</span>
                      {on && <Play className="ms-auto h-4 w-4 shrink-0 text-teal-600" aria-label="지금 재생 중" />}
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-navy-100" data-visit-numbers>
            <h2 className="text-[1.15rem] font-extrabold text-navy-900">영상에서 말하는 숫자</h2>
            <p className="mt-1 text-[0.95rem] font-medium text-navy-500">영상 속 음성·화면과 같은 값입니다. 질문을 받으시면 이 숫자로 답하시면 됩니다.</p>
            <ul className="mt-3 space-y-2">
              {VISIT_VIDEO.numbers.map((n) => (
                //  이름은 위, 금액은 아래 — 옆으로 나란히 두면 1280px 이하에서 칸을 넘칩니다
                <li key={n.label} className="rounded-xl bg-navy-50/60 px-3.5 py-2.5">
                  <span className="block text-[0.95rem] font-bold text-navy-500">{n.label}</span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <span className={`whitespace-nowrap text-[1.15rem] font-extrabold ${n.projection ? 'text-teal-600' : 'text-navy-900'}`}>{n.value}</span>
                    {n.projection && <span className="whitespace-nowrap text-[0.85rem] font-bold text-navy-400">전망 · 실적 아님</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-navy-100">
            <h2 className="text-[1.15rem] font-extrabold text-navy-900">보여드리기 전에</h2>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-[1rem] font-medium leading-relaxed text-navy-600">
              <li>소리를 켜 주세요 — 자막도 영상 안에 들어 있어 소리 없이도 읽힙니다.</li>
              <li>시간이 빠듯하면 1.25배로 보셔도 자막이 충분히 읽힙니다.</li>
              <li>영상 속 앱 화면의 병원·사람 이름은 예시 데이터입니다.</li>
              <li>AX 효과는 수치로 말하지 않습니다 — 지금은 데이터를 쌓는 단계라고 설명합니다.</li>
            </ul>
          </section>

          {src.state === 'missing' && isSupabaseConfigured && (
            <section className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200" data-visit-upload-help>
              <h2 className="text-[1.05rem] font-extrabold text-amber-900">영상 올리는 법 (한 번만)</h2>
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-[0.98rem] font-medium leading-relaxed text-amber-900">
                <li>Supabase SQL 편집기에서 <code>PROPOSAL_0130_visit_video_storage.sql</code> 을 실행합니다.</li>
                <li>Supabase → Storage → <b>{VISIT_VIDEO.bucket}</b> 칸에 영상 파일을 올립니다.</li>
                <li>파일 이름을 <b>{VISIT_VIDEO.path}</b> 로 맞춥니다.</li>
              </ol>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  )
}
