import { execFileSync } from 'node:child_process'

//  현장(field) 계정이 **수거 일정**에 무엇을 할 수 있는지 서버에서 직접 확인합니다.
//   화면을 보지 않습니다 — 화면에서 숨겨도 서버가 열려 있으면 아무 뜻이 없습니다.
//
//   대표님 요청(달력에서 본인 일정 추가)이 지금 구조로 안전하게 되는지,
//   그리고 「확정 일정은 못 건드린다」가 실제로 지켜지는지 봅니다.

const DB = 'fschedq'
const PSQL = ['-h','/var/tmp/pgt','-p','55432','-U','postgres','-d',DB,'-qtA','-v','ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo',['-u','pgtest','psql',...PSQL,'-c', uid ? asRole(uid, sql) : sql],{encoding:'utf8'}).trim()
const psql = (s)=>run(s)
const tryAs = (uid, sql) => { try { return {ok:true,out:run(sql,uid)} } catch(e){ return {ok:false,out:String(e.stderr??e.message)} } }
const ok = (c,m,d='')=>{ console.log(`${c?' OK ':'FAIL'} | ${m}${d?` — ${d}`:''}`); if(!c) process.exitCode=1 }
const err = (r)=>(String(r.out).match(/ERROR:.*/)??[''])[0].slice(0,110)

const mk = (email, role) => {
  psql(`insert into auth.users (id,email) values (gen_random_uuid(),'${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id,email,name,role,active,approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}

// ── 준비 ────────────────────────────────────────────────────────────────────
const CA = psql(`insert into public.clients (name,type,collects_medical_waste) values ('가나병원','병원',true) returning id`)
const CB = psql(`insert into public.clients (name,type,collects_medical_waste) values ('다라병원','병원',true) returning id`)
const CC = psql(`insert into public.clients (name,type,collects_medical_waste) values ('마바병원','병원',true) returning id`)
const V  = psql(`insert into public.vehicles (name,waste_type,tonnage,nominal_capacity,expected_capacity,active)
                 values ('1호차','의료폐기물',1,1000,800,true) returning id`)
const admin = mk('a@x.c','admin')
const f1 = mk('f1@x.c','field')
const f2 = mk('f2@x.c','field')
const TOM = psql(`select (current_date + 7)::text`)

//  관리자가 확정해 둔 일정 (field 가 못 건드려야 하는 것)
const fixed = psql(`insert into public.schedules (date,client_id,waste_type,status,origin,created_by)
  values ('${TOM}','${CA}','의료폐기물','예정','system','${admin}') returning id`)

//  ⚠ 이 파일은 **0067 전과 후를 둘 다** 잽니다.
//     ① 칸은 「지금 열려 있는 구멍」을 **사실로 적어 두는** 자리입니다.
//     0067 이 migrations/ 로 옮겨가면 DB 가 이미 막힌 상태로 만들어지므로,
//     판 번호를 보고 ① 을 건너뜁니다. 안 그러면 고쳐 놓고도 빨간 줄이 납니다.
const VER0 = Number(psql(`select public.app_schema_version()`))
const BEFORE = VER0 < 67
console.log(`══ ① 지금 상태 (판 ${VER0}) ══`)

// 1. field 가 일정을 넣을 수 있는가
//  ⚠ CA 에는 관리자 확정분이 이미 있습니다. 같은 날·같은 병원·같은 구분은
//    서버가 하나만 받습니다(schedules_planned_uniq) — 그건 **정상 동작**이라
//    다른 병원으로 넣어야 「넣을 수 있는가」를 제대로 봅니다.
const ins = tryAs(f1, `insert into public.schedules (date,client_id,waste_type,status,origin,created_by)
  values ('${TOM}','${CC}','의료폐기물','예정','field','${f1}') returning id`)
ok(ins.ok, '현장이 **일정을 넣을 수 있음** (달력 ＋ 가 서버에서 됨)', ins.ok ? '' : err(ins))
const mine = ins.ok ? ins.out : null

// 2. field 가 관리자 확정 일정을 지울 수 있는가 — 막혀야 정상
const del = tryAs(f1, `delete from public.schedules where id='${fixed}'`)
const delCount = psql(`select count(*) from public.schedules where id='${fixed}'`)
ok(delCount === '1', '현장이 **확정 일정을 못 지움** (0002 delete=is_staff)', `남은 ${delCount}줄`)

// 3. field 가 관리자 확정 일정을 **고칠** 수 있는가 — 여기가 구멍입니다
const upd = tryAs(f1, `update public.schedules set date='${TOM}', memo='현장이 고침' where id='${fixed}'`)
const memo = psql(`select coalesce(memo,'') from public.schedules where id='${fixed}'`)
if (BEFORE) ok(memo === '현장이 고침', '(0067 전) 현장이 확정 일정을 고칠 수 있음 — **닫아야 할 구멍 ①**')
else ok(memo !== '현장이 고침', '현장이 확정 일정을 못 고침 (이미 막혀 있음)')

// 4. field 가 **다른 기사 일정**을 고칠 수 있는가
const other = psql(`insert into public.schedules (date,client_id,waste_type,status,origin,created_by)
  values ('${TOM}','${CB}','의료폐기물','예정','field','${f2}') returning id`)
tryAs(f1, `update public.schedules set memo='남의 것' where id='${other}'`)
const om = psql(`select coalesce(memo,'') from public.schedules where id='${other}'`)
if (BEFORE) ok(om === '남의 것', '(0067 전) 현장이 다른 기사 일정을 고칠 수 있음 — **닫아야 할 구멍 ②**')
else ok(om !== '남의 것', '현장이 다른 기사 일정을 못 고침 (이미 막혀 있음)')

// 5. 병원 계정은 일정을 넣을 수 없어야 함
psql(`insert into auth.users (id,email) values (gen_random_uuid(),'h@x.c') on conflict (email) do nothing`)
const hid = psql(`select id from auth.users where email='h@x.c' limit 1`)
psql(`insert into public.profiles (id,email,name,role,active,approved_at,client_id)
      values ('${hid}','h@x.c','병원','client',true,now(),'${CA}')
      on conflict (id) do update set role='client', active=true, approved_at=now(), client_id='${CA}'`)
const hins = tryAs(hid, `insert into public.schedules (date,client_id,waste_type,status,origin,created_by)
  values ('${TOM}','${CA}','의료폐기물','예정','field','${hid}') returning id`)
ok(!hins.ok, '⚠ **병원 계정은 일정을 못 넣어야** 함', hins.ok ? '넣어졌습니다 — 지금은 열려 있음' : '막힘')

// 6. 배정이 걸리면 남의 거래처 일정이 안 보이는가 (0056)
psql(`insert into public.client_assignments (client_id, profile_id) values ('${CA}','${f1}')`)
const seen = tryAs(f1, `select count(*) from public.schedules`)
ok(seen.ok && Number(seen.out) > 0, '배정 뒤에도 내 거래처 일정은 보임', `${seen.out}줄`)
const seenB = tryAs(f1, `select count(*) from public.schedules where client_id='${CB}'`)
ok(seenB.ok && seenB.out === '0', '**배정 뒤 남의 거래처 일정은 안 보임** (0056 이 이미 막음)', `${seenB.out}줄`)

// 7. 같은 날 순서를 가리키는 칸이 있는가
const cols = psql(`select string_agg(column_name,',' order by ordinal_position)
                   from information_schema.columns where table_name='schedules' and table_schema='public'`)
ok(!/visit_order|sort_order|seq/.test(cols), '순서 칸은 **아직 없음** (시간으로만 정렬)', /order/.test(cols) ? cols : 'visit_order 없음')

// ── ⑧ 기사가 **자기 차량을 스스로 바꿀 수 있는가** ─────────────────────────
//   대표님 요구: 담당차량 변경은 관리자·사무실만.
//   set_profile_vehicle() 는 관리자만입니다. 그런데 profiles 표를 직접
//   고치는 길이 열려 있으면 함수를 안 거치고 바꿔 버립니다.
{
  const selfSet = tryAs(f1, `update public.profiles set vehicle_id='${V}' where id='${f1}'`)
  const got = psql(`select coalesce(vehicle_id::text,'없음') from public.profiles where id='${f1}'`)
  if (BEFORE) ok(got !== '없음', '(0067 전) 기사가 자기 차량을 스스로 바꿀 수 있음 — **닫아야 할 구멍 ③**')
  else ok(got === '없음', '기사가 자기 차량을 못 바꿈 (이미 막혀 있음)')

  const fnTry = tryAs(f1, `select public.set_profile_vehicle('${f1}','${V}')`)
  ok(!fnTry.ok, '기사가 차량 지정 **함수**를 못 부름 (관리자 전용)', fnTry.ok ? '불러졌습니다' : '막힘')
}

// ═══════════════════════════════════════════════════════════════════════════
//  ② 0067 을 적용한 뒤 — 막을 것은 막히고, **하던 일은 그대로 되는가**
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ② 0067 적용 후 ══')
//  이미 적용돼 있어도 다시 돌려서 문제 없습니다 (전부 create or replace / if not exists).
execFileSync('sudo',['-u','pgtest','psql','-h','/var/tmp/pgt','-p','55432','-U','postgres','-d',DB,'-q','-v','ON_ERROR_STOP=1',
  '-f','/home/user/beonemirae-ops-mvp/supabase/proposals/PROPOSAL_0067_field_schedule.sql'],{encoding:'utf8'})

//  판 번호
ok(psql(`select public.app_schema_version()`) === '67', '판이 67 로 올라감')
ok(psql(`select count(*) from information_schema.columns
         where table_name='schedules' and column_name='visit_order'`) === '1', '방문 순서 칸이 생김')

//  차량을 원래대로 돌려 놓고(위 ⑧ 에서 바꿔 놨습니다) 다시 시도
psql(`update public.profiles set vehicle_id = null where id='${f1}'`)
tryAs(f1, `update public.profiles set vehicle_id='${V}' where id='${f1}'`)
ok(psql(`select coalesce(vehicle_id::text,'없음') from public.profiles where id='${f1}'`) === '없음',
   '**기사가 자기 차량을 못 바꿈** (0067 이 닫음)')

//  본인 이름·글자크기는 여전히 바꿀 수 있어야 합니다 — 막다가 업무를 막으면 실패
const rename = tryAs(f1, `update public.profiles set name='김준기', font_scale='xl' where id='${f1}'`)
ok(rename.ok && psql(`select font_scale from public.profiles where id='${f1}'`) === 'xl',
   '이름·글자크기는 **그대로 바꿀 수 있음** (막다가 업무를 막지 않음)')

//  확정 일정 — 이제 못 고쳐야 합니다
psql(`update public.schedules set memo='' where id='${fixed}'`)
tryAs(f1, `update public.schedules set memo='현장이 고침' where id='${fixed}'`)
ok(psql(`select coalesce(memo,'') from public.schedules where id='${fixed}'`) !== '현장이 고침',
   '**현장이 확정 일정을 못 고침** (0067 이 닫음)')

//  다른 기사 일정 — 이제 못 고쳐야 합니다
psql(`update public.schedules set memo='' where id='${other}'`)
tryAs(f1, `update public.schedules set memo='남의 것' where id='${other}'`)
ok(psql(`select coalesce(memo,'') from public.schedules where id='${other}'`) !== '남의 것',
   '**현장이 다른 기사 일정을 못 고침** (0067 이 닫음)')

//  ⚠ 그런데 **본인이 만든 일정은 여전히 고칠 수 있어야** 합니다.
//    여기가 막히면 「달력에서 본인 일정 운영」이 통째로 죽습니다.
//
//  ⚠⚠ 검사 순서 주의 — `mine` 은 CC 병원 일정입니다. 0067 의 수정 규칙은
//     「본인이 만든 것 **그리고** 본인 담당 거래처」라서, CC 배정을 먼저
//     걸어 두지 않으면 여기서 막히고 그 실패가 「0067 이 업무를 막았다」로
//     읽힙니다. 실제로 그렇게 한 번 났습니다 — 원인은 검사 순서였습니다.
psql(`insert into public.client_assignments (client_id, profile_id)
      values ('${CC}','${f1}') on conflict do nothing`)
const own = tryAs(f1, `update public.schedules set memo='3층 앞', visit_order=2 where id='${mine}'`)
ok(own.ok && psql(`select coalesce(memo,'') from public.schedules where id='${mine}'`) === '3층 앞',
   '**본인이 만든 일정은 그대로 고침** (순서도 저장됨)',
   `순서 ${psql(`select coalesce(visit_order::text,'없음') from public.schedules where id='${mine}'`)}`)

//  본인 담당 거래처에 새 일정 — 계속 돼야 합니다
const D2 = psql(`select (current_date + 9)::text`)
const ins2 = tryAs(f1, `insert into public.schedules (date,client_id,waste_type,status,origin,created_by)
  values ('${D2}','${CC}','의료폐기물','예정','field','${f1}') returning id`)
ok(ins2.ok, '**본인 담당 거래처에는 계속 일정을 넣을 수 있음**', ins2.ok ? '' : err(ins2))

//  배정 안 된 거래처에는 못 넣어야 합니다 (넣어도 본인이 못 보는 줄이 됩니다)
const ins3 = tryAs(f1, `insert into public.schedules (date,client_id,waste_type,status,origin,created_by)
  values ('${D2}','${CB}','의료폐기물','예정','field','${f1}') returning id`)
ok(!ins3.ok, '배정 안 된 거래처에는 못 넣음 (만들자마자 안 보이는 줄을 막음)', ins3.ok ? '넣어졌습니다' : '막힘')

//  관리자는 전부 그대로
const admOk = tryAs(admin, `update public.schedules set memo='사무실 메모' where id='${other}'`)
ok(admOk.ok, '관리자는 남의 일정도 **그대로 고침** (권한 안 좁아짐)', admOk.ok ? '' : err(admOk))
const admDel = tryAs(admin, `delete from public.schedules where id='${ins2.ok ? ins2.out : mine}'`)
ok(admDel.ok, '관리자는 **그대로 지움**', admDel.ok ? '' : err(admDel))

// ── ⑨ 방문 예약 함수 — 현장이 본인 담당 거래처를 잡을 수 있는가 ────────────
console.log('\n══ ③ 방문 예약(book_visit) ══')
{
  const D3 = psql(`select (current_date + 11)::text`)
  //  본인 담당(CC) — 돼야 합니다
  const r1 = tryAs(f1, `select public.book_visit('${CC}','${D3}','의료폐기물','09:30',null,'3층 앞',0,null)`)
  ok(r1.ok, '**현장이 본인 담당 거래처의 방문을 잡음**', r1.ok ? '' : err(r1))

  //  잡은 줄이 「현장이 잡은 것」으로 남는가 — 사무실 확정분과 구별돼야 합니다
  const org = psql(`select origin from public.schedules where client_id='${CC}' and date='${D3}'`)
  ok(org === 'field', '기사님이 잡은 것으로 남음 (사무실 확정분과 구별)', org)
  const by = psql(`select coalesce(created_by::text,'없음') from public.schedules where client_id='${CC}' and date='${D3}'`)
  ok(by === f1, '만든 사람이 본인으로 남음 (그래야 본인만 고칩니다)', by === f1 ? '본인' : by)

  //  담당 아닌 거래처(CB) — 막혀야 합니다
  const r2 = tryAs(f1, `select public.book_visit('${CB}','${D3}','의료폐기물','09:30',null,'',0,null)`)
  ok(!r2.ok && /담당이 아닌/.test(r2.out), '**담당이 아닌 거래처는 막힘**', r2.ok ? '잡혔습니다' : err(r2))

  //  병원 계정 — 여전히 막혀야 합니다
  const r3 = tryAs(hid, `select public.book_visit('${CA}','${D3}','의료폐기물','09:30',null,'',0,null)`)
  ok(!r3.ok, '병원 계정은 **그대로 막힘**', r3.ok ? '잡혔습니다' : '막힘')

  //  관리자 — 그대로 됩니다
  const D4 = psql(`select (current_date + 12)::text`)
  const r4 = tryAs(admin, `select public.book_visit('${CB}','${D4}','의료폐기물','10:00',null,'',0,null)`)
  ok(r4.ok, '관리자는 **그대로 잡음** (권한 안 좁아짐)', r4.ok ? '' : err(r4))
  ok(psql(`select origin from public.schedules where client_id='${CB}' and date='${D4}'`) === 'system',
     '사무실이 잡은 것은 확정분으로 남음')

  //  지난 날짜는 여전히 막혀야 합니다 (수거 입력의 자리)
  const r5 = tryAs(f1, `select public.book_visit('${CC}',(current_date-1),'의료폐기물','',null,'',0,null)`)
  ok(!r5.ok && /지난 날짜/.test(r5.out), '지난 날짜는 **그대로 막힘** (수거 입력이 할 일)', r5.ok ? '잡혔습니다' : '막힘')
}

// ── ⑩ 방문 목적 (0067) ─────────────────────────────────────────────────────
//
//   ⚠ 여기가 조마조마한 자리입니다. 같은 날 중복을 막는 색인은
//     `where status='예정' and is_additional=false and canceled_at is null`
//     **부분 색인**입니다. 추가수거(is_additional=true)나 긴급(status='긴급')은
//     그 조건을 벗어나는데, `on conflict ... where <같은 조건>` 이 그때도
//     제대로 도는지 **실제로 넣어 봐야** 압니다. 짐작하면 안 됩니다.
console.log('\n══ ④ 방문 목적 ══')
{
  const D = (n) => psql(`select (current_date + ${n})::text`)

  //  정기 — 지금까지와 같아야 합니다
  const r1 = tryAs(f1, `select public.book_visit('${CC}','${D(20)}','의료폐기물','09:00',null,'',0,null,'정기수거')`)
  ok(r1.ok, '정기수거로 잡힘', r1.ok ? '' : err(r1))
  const row1 = psql(`select status || '/' || is_additional from public.schedules where client_id='${CC}' and date='${D(20)}'`)
  ok(row1 === '예정/false', '정기 = 예정 · 추가 아님', row1)

  //  같은 날 같은 병원에 **또** 정기를 잡으면 막혀야 합니다
  const dup = tryAs(f1, `select public.book_visit('${CC}','${D(20)}','의료폐기물','10:00',null,'',0,null,'정기수거')`)
  //  ⚠ 막는 자리가 두 군데입니다 — 미리 보는 검사(「이미 잡혀 있습니다」)와
  //     동시에 눌렸을 때의 검사(「방금 잡았습니다」). 평소에는 앞엣것이 걸립니다.
  ok(!dup.ok && /이미 잡혀 있습니다|방금 잡았습니다/.test(dup.out),
     '같은 날 중복은 그대로 막힘', dup.ok ? '두 번 잡혔습니다' : '막힘')

  //  ⚠ 추가수거를 **이미 방문이 잡힌 날**에 또 잡는 것은 0059 가 일부러
  //    막아 둔 자리입니다 — 「같은 날 한 번 더 가야 하면 그날 수거 입력에서
  //    추가 수거로 기록하라」고 안내합니다. 목적 칸을 붙였다고 그 규칙을
  //    조용히 풀지 않습니다. 규칙이 **그대로인지**를 확인합니다.
  const same = tryAs(f1, `select public.book_visit('${CC}','${D(20)}','의료폐기물','15:00',null,'',0,null,'추가수거')`)
  ok(!same.ok && /이미 잡혀 있습니다/.test(same.out),
     '이미 방문이 있는 날은 목적이 달라도 그대로 막힘 (0059 규칙 유지)', same.ok ? '뚫렸습니다' : '막힘')

  //  빈 날에 추가수거로 잡으면 그 표시가 남아야 합니다
  const r2 = tryAs(f1, `select public.book_visit('${CC}','${D(24)}','의료폐기물','15:00',null,'오후 한 번 더',0,null,'추가수거')`)
  ok(r2.ok, '**빈 날에는 추가수거로 잡힘**', r2.ok ? '' : err(r2))
  ok(psql(`select is_additional::text from public.schedules where client_id='${CC}' and date='${D(24)}'`) === 'true',
     '추가수거로 남음 (청구서에 「추가 수거」라고 적힙니다 — 금액은 안 바뀝니다)')

  //  긴급 — status 가 '긴급' 으로 남아야 합니다
  const r3 = tryAs(f1, `select public.book_visit('${CC}','${D(21)}','의료폐기물','08:00',null,'',0,null,'긴급수거')`)
  ok(r3.ok, '긴급수거로 잡힘', r3.ok ? '' : err(r3))
  ok(psql(`select status from public.schedules where client_id='${CC}' and date='${D(21)}'`) === '긴급',
     '**긴급으로 남음** (오늘 일정에서 빨갛게 뜹니다)')

  //  모르는 목적은 조용히 넘기지 않습니다
  const r4 = tryAs(f1, `select public.book_visit('${CC}','${D(22)}','의료폐기물','08:00',null,'',0,null,'아무거나')`)
  ok(!r4.ok && /목적이 올바르지 않습니다/.test(r4.out), '모르는 목적은 그대로 알려 줌', r4.ok ? '통과됐습니다' : '막힘')

  //  목적을 안 주면 정기 (기존 화면이 그대로 돕니다)
  const r5 = tryAs(admin, `select public.book_visit('${CB}','${D(23)}','의료폐기물','09:00',null,'',0,null)`)
  ok(r5.ok, '목적을 안 줘도 그대로 됨 (기존 화면 안 깨짐)', r5.ok ? '' : err(r5))
  ok(psql(`select status || '/' || is_additional from public.schedules where client_id='${CB}' and date='${D(23)}'`)
     === '예정/false', '안 주면 정기수거')
}
