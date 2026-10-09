import { useEffect, useRef, useState } from 'react'
import { Download, Expand, Film, Gauge, ListVideo, Play, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { PageShell } from '../components/ui'
import { VIDEOS, type VideoDef, type VideoVersion } from '../lib/visitVideo'

// ─────────────────────────────────────────────────────────────────────────────
// 신용보증기금 방문용 영상 (/visit-video) — 0130
//
//  대표님 요청: 「대표님·이사님·개발자 화면에서 볼 수 있게, 오늘 날짜·현재 시각
//  옆에 버튼을 두고, 누르면 영상과 간단한 상세가 뜨게. 1.25배·1.5배로도」.
//
//  영상 파일은 앱 안(public/media/)에 있습니다 — SQL·업로드 없이 바로 재생됩니다.
//  ⚠ 0130 처음에는 Supabase Storage 비공개 칸에 두었는데, 대표님이 「SQL 실행
//    없이 바로 보이게」를 고르셨습니다. 저장소가 공개라 **파일 주소를 아는
//    사람은 로그인 없이도 받을 수 있다**는 점을 알리고 정한 것입니다.
//    단추·화면은 그대로 대표·이사님(admin·office)에게만 보입니다.
//
//  v3.1 — 세로(9:16)·가로(16:9) 두 판. 대표님: 「클릭 한 번에 왔다 갔다」·「각각 파일로
//  내려받아 카카오톡으로 보낼 생각」. 두 판은 같은 음성·같은 길이라, 바꿔도 **보던 자리·
//  속도·재생 중인지**를 그대로 이어 갑니다. 내려받기는 판마다 따로 있습니다.
//
//  0133 — 영상이 둘. 대표님: 「기존 영상은 아래로 미루고 강남 스타트업 지점 발표용 영상을
//  새로 올려 — 다운로드도 다 똑같이」. 영상마다 같은 묶음(재생 · 비율 · 속도 · 내려받기 ·
//  흐름 · 메모)을 그대로 그립니다. 순서는 lib/visitVideo 의 VIDEOS.
// ─────────────────────────────────────────────────────────────────────────────

const RATES = [1, 1.25, 1.5] as const
type Rate = (typeof RATES)[number]

type Src = { state: 'ready' } | { state: 'missing'; reason: string }
type VerId = VideoVersion['id']
const loadVer = (key: string): VerId => {
  try { return localStorage.getItem(key) === 'wide' ? 'wide' : 'tall' } catch { return 'tall' }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function VisitVideo() {
  return (
    <PageShell>
      <header className="px-1">
        <p className="text-[0.9rem] font-extrabold tracking-[0.2em] text-teal-600">방문 · 발표용</p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight text-navy-900 lg:text-[2rem]">방문 · 발표용 영상</h1>
        <p className="mt-2 text-[1rem] font-semibold text-navy-500">영상 {VIDEOS.length}개 · 세로(9:16) · 가로(16:9) · 자막 포함 · 파일로 내려받기</p>
      </header>
      {VIDEOS.map((v, i) => (
        <VideoBlock key={v.id} def={v} first={i === 0} />
      ))}
    </PageShell>
  )
}

function VideoBlock({ def, first }: { def: VideoDef; first: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<Src>({ state: 'ready' })
  const [rate, setRate] = useState<Rate>(1)
  const [now, setNow] = useState(0)
  const [verId, setVerId] = useState<VerId>(() => loadVer(def.storageKey))
  const ver = def.versions.find((v) => v.id === verId) ?? def.versions[0]
  //  판을 바꿀 때 — 보던 자리와 재생 중이었는지를 들고 갔다가, 새 판이 준비되면 그대로 잇습니다
  const resume = useRef<{ t: number; playing: boolean } | null>(null)
  const switchVer = (id: VerId) => {
    if (id === verId) return
    const v = video.current
    resume.current = v ? { t: v.currentTime, playing: !v.paused && !v.ended } : null
    setSrc({ state: 'ready' })
    setVerId(id)
    try { localStorage.setItem(def.storageKey, id) } catch { /* 저장 못 해도 화면은 그대로 */ }
  }

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
  //  재생 실패 — 파일을 못 받은 것인지, 받았는데 이 브라우저가 형식을 못 푸는 것인지 가립니다.
  //  ⚠ 크롬은 둘 다 같은 오류 번호(4)로 알려 줍니다. 파일이 있는지 직접 물어봅니다.
  const onVideoError = () => {
    const missing = { state: 'missing', reason: '영상을 불러오지 못했습니다 — 인터넷 연결을 확인하고 새로고침해 주세요.' } as const
    fetch(ver.src, { method: 'HEAD' })
      .then((r) => setSrc(r.ok
        ? { state: 'missing', reason: '이 브라우저에서는 영상을 재생할 수 없습니다 — 크롬·사파리·엣지에서 열어 주세요.' }
        : missing))
      .catch(() => setSrc(missing))
  }
  const full = () => { void video.current?.requestFullscreen?.().catch(() => {}) }

  return (
    <section data-video-block={def.id} className={`space-y-4 ${first ? '' : 'border-t border-navy-100 pt-8'}`}>
      <div className="px-1">
        <p className="text-[0.85rem] font-extrabold tracking-[0.2em] text-teal-600">{def.eyebrow}</p>
        <h2 data-video-title className="mt-1 text-[1.45rem] font-extrabold leading-tight text-navy-900 lg:text-[1.65rem]">{def.title}</h2>
        <p className="mt-1.5 text-[1rem] font-semibold text-navy-500">
          {def.summary} · {def.lengthLabel} · 세로(9:16) · 가로(16:9) · 자막 포함
        </p>
      </div>

      {/*  ⚠ 가로판은 영상이 넓어 옆에 상세를 둘 자리가 없습니다 — 가로일 때는 위아래로 */}
      <div className={`grid gap-6 ${ver.id === 'tall' ? 'min-[1380px]:grid-cols-[minmax(0,auto)_minmax(0,1fr)] min-[1380px]:items-start' : ''}`}>
        {/* ── 영상 ─────────────────────────────────────────────────────── */}
        <section className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-navy-100 lg:p-4" data-visit-video-player>
          {/*  세로 ↔ 가로 — 한 번 누르면 바뀝니다 */}
          <div className="mx-auto mb-3 flex w-fit rounded-full bg-navy-50 p-1 ring-1 ring-navy-100" role="group" aria-label="영상 비율">
            {def.versions.map((v) => (
              <button
                key={v.id}
                type="button"
                data-visit-version={v.id}
                aria-pressed={v.id === ver.id}
                onClick={() => switchVer(v.id)}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[1rem] font-extrabold transition ${
                  v.id === ver.id ? 'bg-navy-800 text-white shadow-sm' : 'text-navy-600 hover:bg-white'
                }`}
              >
                {v.id === 'tall' ? <RectangleVertical className="h-4 w-4" aria-hidden /> : <RectangleHorizontal className="h-4 w-4" aria-hidden />}
                {v.short}
              </button>
            ))}
          </div>
          {/*  ⚠ 두 칸은 1380px 부터 — 1024px 에서는 상세가 글자 한 자 폭, 1280px 에서도 252px 로 찌그러졌습니다 */}
          {/*  ⚠ 높이를 고정하면 폰(390px)에서 9:16 폭이 화면보다 넓어져 오른쪽이 잘렸습니다.
               폭을 정하고(화면 폭과 「높이 76vh 일 때의 폭」 중 작은 쪽) 높이는 비율로 따라오게 합니다. */}
          <div
            data-visit-video-box
            data-ratio={ver.id}
            className="mx-auto overflow-hidden rounded-2xl bg-[#0f1216]"
            style={ver.id === 'tall'
              ? { aspectRatio: '9 / 16', width: 'min(100%, calc(min(76vh, 760px) * 9 / 16))' }
              : { aspectRatio: '16 / 9', width: 'min(100%, calc(min(70vh, 720px) * 16 / 9))' }}
          >
            {src.state === 'ready' ? (
              <video
                ref={video}
                src={ver.src}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  v.playbackRate = rate
                  const r = resume.current
                  resume.current = null
                  if (r) {
                    v.currentTime = Math.min(r.t, Math.max(0, v.duration - .5))
                    if (r.playing) void v.play().catch(() => {})
                  }
                }}
                //  영상이 둘이라 — 하나를 틀면 다른 하나는 멈춥니다 (소리가 겹치지 않게)
                onPlay={(e) => {
                  for (const other of document.querySelectorAll<HTMLVideoElement>('video[data-visit-video]')) {
                    if (other !== e.currentTarget && !other.paused) other.pause()
                  }
                }}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onError={onVideoError}
                className="h-full w-full bg-black object-contain"
                data-visit-video
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[1rem] font-semibold text-white/80" data-visit-video-missing={src.state === 'missing' ? '' : undefined}>
                <Film className="h-9 w-9" aria-hidden />
                <p>{src.state === 'missing' ? src.reason : ''}</p>
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
          {/*  내려받기 — 카카오톡으로 보낼 파일. 판마다 따로 */}
          <div className="mt-3 border-t border-navy-50 pt-3" data-visit-downloads>
            <p className="mb-2 text-center text-[0.95rem] font-bold text-navy-500">파일로 내려받기 · 카카오톡 전송용</p>
            <div className="flex flex-wrap justify-center gap-2">
              {def.versions.map((v) => (
                <a
                  key={v.id}
                  href={v.src}
                  download={v.file}
                  data-visit-download={v.id}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-4 text-[1rem] font-bold text-navy-700 ring-1 ring-navy-200 transition hover:bg-navy-50"
                >
                  <Download className="h-4 w-4" aria-hidden /> {v.short} ({v.sizeMB}MB)
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── 간단한 상세 ───────────────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-navy-100" data-visit-chapters>
            <h3 className="flex items-center gap-2 text-[1.15rem] font-extrabold text-navy-900">
              <ListVideo className="h-5 w-5 text-teal-600" aria-hidden /> 영상 흐름
            </h3>
            <p className="mt-1 text-[0.95rem] font-medium text-navy-500">누르면 그 장면부터 재생합니다.</p>
            <ol className="mt-3 divide-y divide-navy-50">
              {def.chapters.map((c, i) => {
                const next = def.chapters[i + 1]?.at ?? Infinity
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

          {def.numbers.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-navy-100" data-visit-numbers>
            <h3 className="text-[1.15rem] font-extrabold text-navy-900">영상에서 말하는 숫자</h3>
            <p className="mt-1 text-[0.95rem] font-medium text-navy-500">영상 속 음성·화면과 같은 값입니다. 질문을 받으시면 이 숫자로 답하시면 됩니다.</p>
            <ul className="mt-3 space-y-2">
              {def.numbers.map((n) => (
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
          )}

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-navy-100" data-visit-tips>
            <h3 className="text-[1.15rem] font-extrabold text-navy-900">보여드리기 전에</h3>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-[1rem] font-medium leading-relaxed text-navy-600">
              {def.tips.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </section>

        </div>
      </div>
    </section>
  )
}
