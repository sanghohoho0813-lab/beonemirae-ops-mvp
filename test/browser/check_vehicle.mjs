import { chromium, EXEC } from './_pw.mjs'
const BASE='http://localhost:4173'
const SHOT=(process.env.TEST_OUT ?? '/tmp')
const out=[]; const ok=(c,m,d='')=>{out.push(`${c?' OK ':'FAIL'} | ${m}${d?` — ${d}`:''}`); if(!c)process.exitCode=1}
const b=await chromium.launch({executablePath: EXEC})

async function open(role,uid,vehicles,mobile){
  const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1400,height:1000}})
  const profile={id:uid,email:`${role}@b.test`,name:role==='admin'?'대표':'김기사',role,font_scale:'normal',active:true,approved_at:'2026-01-01T00:00:00Z',client_id:null,created_at:'2026-01-01T00:00:00Z'}
  await ctx.route('**/rest/v1/**',(r)=>{
    const url=r.request().url(); const single=(r.request().headers()['accept']??'').includes('vnd.pgrst.object')
    const json=(v)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)})
    if(url.includes('/profiles'))return json(single?profile:[profile])
    if(url.includes('/vehicles'))return json(vehicles)
    if(url.includes('/office_stock')){const st={id:1,corrugated_box:0,plastic_container:0,bag:0,needle_box:0};return json(single?st:[st])}
    if(url.includes('/clients'))return json([{id:'c1',name:'병원 1',type:'병원',address:'서울',manager:'',phone:'',collection_cycle:'주 1회',collects_medical_waste:true,collects_diaper:false,storage_size:'보통',note:'',is_demo_generated:false,demo_session_id:null,active:true,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}])
    return json([])
  })
  const p=await ctx.newPage()
  await p.addInitScript(([k,u])=>window.localStorage.setItem(k,JSON.stringify({access_token:'t',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:'r',user:u})),['beonemirae-ops:auth',{id:uid,aud:'authenticated',email:profile.email,app_metadata:{},user_metadata:{}}])
  return {ctx,p}
}

// 1. 차량 0대 — 설정 맨 위에 뜨는가
{
  const {ctx,p}=await open('admin','00000000-0000-0000-0000-0000000000ad',[],false)
  await p.goto(`${BASE}/settings`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
  const el=p.locator('#vehicles')
  ok(await el.count()>0,'설정에 운행 차량 칸이 있음')
  const box=await el.boundingBox()
  ok((box?.y??9999)<700,'차량이 0대면 화면 위쪽에 있음',`${Math.round(box?.y??0)}px`)
  ok(/먼저 등록해 주세요/.test(await p.textContent('main')??''),'먼저 등록하라고 알려 줌')
  await p.screenshot({path:`${SHOT}/settings-vehicle-top.png`})
  await ctx.close()
}
// 2. 시작하기에서 눌렀을 때 그 자리로 가는가
{
  const {ctx,p}=await open('admin','00000000-0000-0000-0000-0000000000ad',[],false)
  await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
  const link=p.getByRole('link',{name:/운행 차량 등록/})
  ok(await link.count()>0,'대시보드 시작하기에 「운행 차량 등록」이 있음')
  await link.first().click(); await p.waitForTimeout(1500)
  ok(p.url().includes('#vehicles'),'차량 자리로 바로 이동',p.url().split('/').pop())
  const y=await p.evaluate(()=>window.scrollY)
  const box=await p.locator('#vehicles').boundingBox()
  ok(Math.abs(box?.y??9999)<200,'차량 칸이 화면 안에 보임',`화면상 ${Math.round(box?.y??0)}px · 스크롤 ${y}px`)
  await ctx.close()
}
// 3. 차량 등록 뒤에는 원래 자리로
{
  const {ctx,p}=await open('admin','00000000-0000-0000-0000-0000000000ad',[{id:'v1',name:'의료폐기물 1호',waste_type:'의료폐기물',tonnage:1,nominal_capacity:1000,expected_capacity:800,driver:'김기사',active:true,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}],false)
  await p.goto(`${BASE}/settings`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
  const box=await p.locator('#vehicles').boundingBox()
  ok((box?.y??0)>700,'차량이 있으면 원래 자리로 내려감',`${Math.round(box?.y??0)}px`)
  ok(!/먼저 등록해 주세요/.test(await p.textContent('main')??''),'재촉 문구가 사라짐')
  await ctx.close()
}
// 4. 현장 — 차량 없으면 왜 저장이 안 되는지 알려 주는가
{
  const {ctx,p}=await open('field','00000000-0000-0000-0000-0000000000f1',[],true)
  await p.goto(`${BASE}/collection`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
  const t=await p.textContent('main')??''
  //  ⚠ 0067 부터 **현장에는 차량 고르는 칸이 없습니다.** 그래서 「차량이 한
  //     대도 없다」와 「내 계정에 차량이 안 묶였다」가 기사님에게는 같은 일이고,
  //     할 일도 같습니다 — 사무실에 문의. 대표님이 정해 주신 문구를 씁니다.
  //     (사무실·관리자 화면에는 예전 문구가 그대로 있습니다.)
  ok(/담당 차량이 지정되지 않았습니다/.test(t),'현장에 이유를 알려 줌')
  ok(/사무실에 문의해 주세요/.test(t),'무엇을 하면 되는지 알려 줌')
  //  저장이 실제로 잠겨 있어야 합니다 — 말만 하고 눌리면 서버가 거절합니다.
  ok(await p.locator('[data-tour="collect-save"]').isDisabled(),'저장이 잠겨 있음')
  await p.screenshot({path:`${SHOT}/collection-no-vehicle.png`,fullPage:true})
  await ctx.close()
}
await b.close(); console.log(out.join('\n'))
