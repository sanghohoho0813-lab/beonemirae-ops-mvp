import { chromium, EXEC } from './_pw.mjs'
import { relay } from './live_relay.mjs'
import { execFileSync } from 'node:child_process'

//  실제 field 계정 · 여러 폭에서 첫 화면 구조를 잽니다.
const SBURL=process.env.SB_URL, KEY=process.env.SB_KEY, PW=process.env.SB_PW
const LABEL=process.env.LABEL ?? 'BEFORE'
const tok = JSON.parse(execFileSync('curl',['-s',`${SBURL}/auth/v1/token?grant_type=password`,'-H',`apikey: ${KEY}`,
  '-H','content-type: application/json','--data-binary',JSON.stringify({email:'kjg@beonemirae.com',password:PW})],{encoding:'utf8'}))
const b = await chromium.launch({ executablePath: EXEC })

for (const W of [390, 412, 673, 768]) {
  const ctx = await b.newContext({ viewport:{width:W,height:844}, isMobile: W < 700, hasTouch: W < 700 })
  await ctx.route('**/*.supabase.co/**',(r)=>relay(r,undefined,({method,url})=>
    !(['POST','PATCH','PUT','DELETE'].includes(method) && !/\/auth\/v1\//.test(url) && !/\/rpc\//.test(url))))
  const p = await ctx.newPage()
  await p.addInitScript(([k,v])=>window.localStorage.setItem(k,v),['beonemirae-ops:auth',JSON.stringify(tok)])
  await p.goto(`${process.env.BASE ?? 'http://localhost:4173'}/today`,{waitUntil:'domcontentloaded'})
  await p.waitForFunction(()=>{const t=document.querySelector('main')?.innerText??'';return t.length>20&&!/불러오는 중/.test(t)},null,{timeout:40000}).catch(()=>{})
  await p.waitForTimeout(1000)
  const m = await p.evaluate(() => {
    const vis=(el)=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'}
    const cal = document.querySelector('[data-schedule-calendar]')
    const main = document.querySelector('main')
    const mainTop = main ? Math.round(main.getBoundingClientRect().top + window.scrollY) : 0
    const firstCard = document.querySelector('main .card, main [data-day-strip]')
    return {
      h: document.documentElement.scrollHeight,
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      monthCal: cal ? (vis(cal) ? '보임' : '숨김') : '없음',
      monthToggle: !!document.querySelector('[data-month-toggle]'),
      strip: !!document.querySelector('[data-day-strip]'),
      headerPx: mainTop,
      firstWorkPx: firstCard ? Math.round(firstCard.getBoundingClientRect().top + window.scrollY) : -1,
      notice: !!document.querySelector('[data-car-notice]'),
      cards: [...document.querySelectorAll('main .card')].filter(vis).length,
    }
  })
  console.log(`${LABEL} ${String(W).padStart(4)}px · 길이 ${m.h}px · 가로밀림 ${m.overflowX}px`)
  console.log(`        월간달력 ${m.monthCal} · 펼침단추 ${m.monthToggle ? '있음' : '없음'} · 날짜띠 ${m.strip ? '있음' : '없음'}`)
  console.log(`        머리글 ${m.headerPx}px · 업무 시작 ${m.firstWorkPx}px · 카드 ${m.cards}개 · 호차안내 ${m.notice ? '뜸' : '안뜸'}`)
  await p.screenshot({ path:`shots/ux_${LABEL}_${W}.png`, fullPage:true })
  await ctx.close()
}
await b.close()
