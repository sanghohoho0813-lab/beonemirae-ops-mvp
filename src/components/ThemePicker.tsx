import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Palette } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import { THEMES } from '../lib/themes'
import { Modal } from './Modal'

// ─────────────────────────────────────────────────────────────────────────────
// 화면 색 고르기 (0081)
//
//  누르면 그 자리에서 바로 바뀝니다. 「적용」 단추를 따로 두지 않았습니다 —
//  색은 눌러 보고 고르는 것이라, 확인 단계를 끼우면 아홉 개를 다 눌러 보는
//  일이 아홉 번 두 번 누르기가 됩니다.
//
//  ⚠ 바뀌는 것은 **색뿐**입니다. 화면 배치도, 메뉴도, 하는 일도 그대로입니다.
//    <html data-theme="..."> 한 글자만 바뀌고 나머지는 CSS 변수가 받습니다.
//
//  ⚠ 글자가 안 보이게 되는 테마는 없습니다. 아홉 테마 모두 **각 단계의 밝기를
//    같게** 두고 색상만 바꿨기 때문에, 대비(읽힘 정도)가 기본색과 똑같습니다.
//    test/browser/check_theme.mjs 가 매번 다시 잽니다.
// ─────────────────────────────────────────────────────────────────────────────

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useSettings()

  return (
    <div
      data-theme-picker
      className={`grid gap-2.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}
    >
      {THEMES.map((t) => {
        const active = t.id === theme
        return (
          <button
            key={t.id}
            type="button"
            data-theme-option={t.id}
            aria-pressed={active}
            onClick={() => setTheme(t.id)}
            /*  누르는 자리를 넉넉히 둡니다 — 손가락 기준 44px 을 훨씬 넘깁니다.
                색 견본은 「무엇이 바뀌는지」를 글자보다 빨리 알려 줍니다. */
            className={`relative flex min-h-[4.2rem] flex-col items-start gap-1.5 rounded-2xl border-2 px-3.5 py-3 text-left transition ${
              active
                ? 'border-teal-500 bg-teal-50'
                : 'border-navy-100 bg-white hover:border-navy-300'
            }`}
          >
            {active && (
              <Check
                size={15}
                strokeWidth={3.5}
                className="absolute right-2.5 top-2.5 text-teal-700"
                aria-hidden
              />
            )}
            {/*  색 다섯 방울 — 바탕 · 주색 · 강조 · 강조2 · 강조3 (0084).
                ⚠ 이 값만 실제 색을 그대로 적습니다. 견본은 **지금 켜진 테마와
                  상관없이** 그 테마의 색을 보여 줘야 하기 때문입니다.
                  (토큰을 쓰면 아홉 개가 전부 똑같이 보입니다.) */}
            <span className="flex gap-[3px]" aria-hidden>
              {t.swatch.map((c, i) => (
                <span
                  key={i}
                  className="h-[1.15rem] w-[1.15rem] rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block break-keep text-[1.05rem] font-extrabold text-navy-900">
                {t.name}
              </span>
              {/*  ⚠ 폰에서는 설명 한 줄을 접습니다. 아홉 칸에 설명까지 다 넣으면
                   시트가 화면보다 길어져 **아래 세 가지는 스크롤해야** 나옵니다.
                   고르는 창에서 스크롤하게 만들면, 있는 줄 모르고 지나갑니다.
                   무엇이 바뀌는지는 왼쪽 색 세 방울이 이미 말해 줍니다. */}
              <span className="mt-0.5 hidden break-keep text-[0.95rem] text-navy-400 sm:block">
                {t.desc}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 *  오른쪽 위 「화면 색」 단추 — 누르면 고르는 창이 열립니다.
 *
 *  ⚠ 아이콘만 두지 않고 넓은 화면에서는 글자도 답니다. 팔레트 그림만으로는
 *    무엇을 하는 단추인지 50~60대 사용자에게 전달되지 않습니다.
 */
export function ThemeButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { theme } = useSettings()
  const now = THEMES.find((t) => t.id === theme)

  return (
    <>
      <button
        type="button"
        data-theme-open
        onClick={() => setOpen(true)}
        title="화면 색 바꾸기"
        aria-label={`화면 색 바꾸기 (지금 ${now?.name ?? ''})`}
        className={
          className ||
          'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[0.95rem] font-bold text-navy-600 shadow-sm ring-1 ring-navy-100 transition active:bg-navy-50'
        }
      >
        <Palette size={17} strokeWidth={2.3} className="shrink-0" />
        <span className="hidden min-[420px]:inline">화면 색</span>
      </button>
      {/*  ⚠ 0081 — 이 시트는 **문서 맨 바깥(body)** 에 그립니다.
           이 단추는 폰 머리띠 안에 있는데, 그 머리띠에 backdrop-blur 가
           걸려 있습니다. CSS 에서 backdrop-filter 가 걸린 요소는 그 안의
           position:fixed 요소의 **기준 상자**가 됩니다 — 화면 전체가 아니라
           머리띠(126px)가 기준이 되어, 시트가 머리띠 안에 갇혀 위로 잘려
           나갔습니다(아홉 개 중 한 개만 보였습니다).
           공용 Modal 자체는 건드리지 않습니다 — 다른 화면에서는 잘 돌고
           있고, 이건 **이 단추를 여기에 둔** 사정이라 여기서 풉니다. */}
      {createPortal(
        <Modal open={open} title="화면 색 고르기" onClose={() => setOpen(false)}>
          <p className="t-body mb-3.5 break-keep text-navy-500">
            누르면 바로 바뀝니다. 화면 배치와 기능은 그대로이고 <b className="text-navy-700">색만</b>{' '}
            바뀝니다. 고른 색은 이 기기에 저장됩니다.
          </p>
          <ThemePicker />
        </Modal>,
        document.body,
      )}
    </>
  )
}
