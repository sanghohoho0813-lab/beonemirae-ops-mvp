import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

//  복구 실측 2 — **나중에 더한 표**(proposals)까지 되살아나는가 (0151)
//
//   db_restore 는 마이그레이션으로 생기는 표만 봅니다. 그런데 운영 DB 는 그 뒤에 proposals 를
//   여러 개 실행한 상태이고, 거기서 생긴 표 10개(병원 문의 · 품목별 재고 · AX 실증 근거 …)는
//   지금까지 스냅샷에 **담기지도, 「안 담긴다」고 적혀 있지도 않았습니다.**
//
//   하는 일
//    1. 원본 DB = 마이그레이션 + proposals. 그 표들에 자료를 넣는다
//    2. 앱의 코드(src/lib/snapshot.ts)로 스냅샷 → 복구 SQL
//    3. **마이그레이션만 돌린 DB** 에 부으면 → 시작도 하지 않고 멈춘다 (무엇이 없는지 말하고)
//       — 멈추지 않으면 없는 칸의 값이 말없이 버려진 채 「성공」으로 끝납니다
//    4. 같은 proposals 를 실행한 빈 DB 에 부으면 → 글자까지 같게 되살아난다
//    5. 계정에 묶인 표 3개는 복구 SQL 이 건드리지 않고, 파일 안에 줄 그대로 남는다

const SRC = 'restopt'
const DST = 'restopt2'
const BARE = 'restopt3'
const ROOT = new URL('../../', import.meta.url).pathname
const HERE = new URL('.', import.meta.url).pathname
const PROPOSALS = ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close', '0074_amend',
  '0075_supply_items', '0076_snooze_who', '0077_schedule_origin', '0079_stock_items', '0083_customer_platform',
  '0087_request_detail', '0106_evidence', '0108_ax_coach', '0122_pilot_clients', '0123_pilot_start']

const PSQL = (db) => ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', db]
const P = (db, sql) => execFileSync('sudo', [...PSQL(db), '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()
const src = (sql) => P(SRC, sql)
const dst = (sql) => P(DST, sql)
const pour = (db, sql) => {
  try {
    execFileSync('sudo', [...PSQL(db), '-q', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: sql, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
    return { ok: true, err: '' }
  } catch (e) {
    return { ok: false, err: String(e.stderr ?? e.message) }
  }
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const setup = (db, withProposals) => {
  const r = execFileSync('bash', [join(HERE, 'setup_db.sh'), db], { encoding: 'utf8' }).trim()
  if (!r.includes('준비 완료')) throw new Error(`${db} 준비 실패: ${r}`)
  if (withProposals) {
    for (const f of PROPOSALS) {
      execFileSync('sudo', [...PSQL(db), '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}supabase/proposals/PROPOSAL_${f}.sql`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    }
  }
}

// ── 1. 원본 — 마이그레이션 + proposals, 그리고 그 표들의 자료 ──────────────────
setup(SRC, true)
const OPTIONAL = ['item_buckets', 'office_stock_items', 'client_inquiries', 'ops_changes', 'dispatch_decisions', 'recommendation_views', 'ai_calls']
const BOUND = ['day_closes', 'ax_coach_missions', 'vehicle_reservations']
ok(src(`select count(*) from unnest(array['${[...OPTIONAL, ...BOUND].join("','")}']) t where to_regclass('public.' || t) is not null`) === '10',
  'proposals 를 실행한 DB 에 나중에 더한 표 10개가 있음')

const mk = (email, role, name) => {
  src(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = src(`select id from auth.users where email='${email}'`)
  src(`insert into public.profiles (id, email, name, role, active, approved_at)
       values ('${id}','${email}','${name}','${role}',true,now()) on conflict (id) do update set name = excluded.name, role = excluded.role, active = true`)
  return id
}
const ADMIN = mk('opt-admin@beonemirae.test', 'admin', '관리자')
const FIELD = mk('opt-field@beonemirae.test', 'field', '기사')

src(`insert into public.clients (name, type, address, manager, phone, collection_cycle, collects_medical_waste, collects_diaper, storage_size, created_by, updated_by)
     values ('[복구2]가상의원','의원','가상시 가상구','담당','010-0000-0000','주 1회',true,false,'보통','${ADMIN}','${ADMIN}')`)
const CID = src(`select id from public.clients where name = '[복구2]가상의원'`)
src(`insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver, active)
     values ('[복구2]1호차','의료폐기물',1.2,1500,1200,'기사',true)`)
const VID = src(`select id from public.vehicles where name = '[복구2]1호차'`)

const items = src(`select string_agg(item, ',' order by item) from (select item from public.item_buckets order by item limit 3) x`).split(',')
ok(items.length === 3, '자재 품목 구분(item_buckets)에 기본 품목이 있음', items.join(' · '))
src(`insert into public.office_stock_items (item, qty, counted_at, updated_by) values
       ('${items[0]}', 12, now(), '${ADMIN}'), ('${items[1]}', 0, null, '${ADMIN}'), ('${items[2]}', null, null, null)
     on conflict (item) do update set qty = excluded.qty, counted_at = excluded.counted_at, updated_by = excluded.updated_by`)
src(`insert into public.client_inquiries (client_id, topic, subject, body, status, reply, asked_by_name, handled_by, handled_at, created_by) values
       ('${CID}','자재','가상 문의 1','박스가 모자랍니다','답변 완료','내일 가져갑니다','원무과','${ADMIN}', now(), '${ADMIN}'),
       ('${CID}','정산','가상 문의 2','세금계산서 문의 — 따옴표 '' 와 줄바꿈' || E'\\n' || '둘째 줄','접수','','원무과',null,null,null)`)
src(`insert into public.ops_changes (kind, title, status, effective_on, note, created_by, created_name) values
       ('feature','가상 기능 도입','applied','2026-09-01','메모','${ADMIN}','관리자'), ('vehicle','가상 차량 추가','planned',null,'',null,'')`)
src(`insert into public.dispatch_decisions (date, vehicle_id, vehicle_name, proposal, decision, reason, decided_by, decided_name) values
       ('2026-09-02','v1','1호차','{"stops":[1,2,3],"km":41.5}'::jsonb,'modified','순서 바꿈','${ADMIN}','관리자')`)
src(`insert into public.recommendation_views (client_id, shown_on, viewer_id, viewer_role, items, rule_version, action) values
       ('${CID}','2026-09-03','${ADMIN}','admin','[{"sku":"box63","qty":10}]'::jsonb,'r1','shown')`)
src(`insert into public.ai_calls (kind, input, output, model, ok, error, ms, actor_id, actor_name, edited, edited_note) values
       ('request_triage','가상 요청 글','{"topic":"자재","urgent":false}'::jsonb,'가상-모델',true,'',812,'${ADMIN}','관리자',true,'주제 고침'),
       ('request_triage','실패한 호출',null,'가상-모델',false,'timeout',30000,null,'',false,'')`)
//  계정에 묶인 표 — 「누구의 것」인 칸이 비울 수 없는 칸
src(`insert into public.day_closes (profile_id, profile_name, date, note, summary) values ('${FIELD}','기사','2026-09-04','이상 없음','{"done":7}'::jsonb)`)
src(`insert into public.ax_coach_missions (mission_key, evidence_area, issued_by, issued_name, issued_role, verified_at, verified_what)
     values ('m1','work','${ADMIN}','관리자','admin', now(), '수거 입력 1건')`)
src(`insert into public.vehicle_reservations (vehicle_id, date, profile_id, note, created_by) values ('${VID}','2026-09-05','${FIELD}','오전','${ADMIN}')`)

// ── 2. 앱의 코드로 스냅샷 → 복구 SQL ───────────────────────────────────────
const work = mkdtempSync(join(tmpdir(), 'restore-optional-'))
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'),
  [join(ROOT, 'src/lib/snapshot.ts'), '--bundle', '--format=esm', `--outfile=${join(work, 'snapshot.mjs')}`, '--log-level=error'],
  { encoding: 'utf8', cwd: ROOT })
const { SNAPSHOT_TABLES, SNAPSHOT_EXTRAS, EXTRA_ROW_TABLES, buildSnapshot } = await import(join(work, 'snapshot.mjs'))

ok(OPTIONAL.every((n) => SNAPSHOT_TABLES.some((t) => t.name === n && t.optional)), '스냅샷 표 목록에 나중에 더한 표 7개가 들어 있음 (optional · 만드는 파일 이름과 함께)')
ok(BOUND.every((n) => EXTRA_ROW_TABLES[n] && SNAPSHOT_EXTRAS.some((x) => x.name === n)), '계정에 묶인 표 3개는 보관용 사본 목록에')
ok(BOUND.every((n) => !SNAPSHOT_TABLES.some((t) => t.name === n)), '계정에 묶인 표는 복구 대상 목록에 없음 (없는 계정을 가리키게 되므로)')

const readRows = (name, order) => JSON.parse(src(`select coalesce(json_agg(x order by x."${order}"), '[]'::json)::text from (select * from public.${name}) x`))
const tables = {}
for (const t of SNAPSHOT_TABLES) tables[t.name] = readRows(t.name, t.order)
const extras = SNAPSHOT_EXTRAS.filter((x) => EXTRA_ROW_TABLES[x.name]).map((x) => ({ ...x, via: [`select * from ${x.name}`], data: readRows(x.name, EXTRA_ROW_TABLES[x.name]) }))
const snap = buildSnapshot({ tables, unreadable: [], absent: [], schemaVersion: Number(src(`select public.app_schema_version()`)), takenBy: '관리자', takenAt: '2026-09-10T09:30:00.000Z', extras })
const snapPath = join(work, 'snapshot.json')
writeFileSync(snapPath, JSON.stringify(snap))

ok(OPTIONAL.every((n) => snap.order.includes(n)), '스냅샷 복구 순서에 7개가 모두 들어감')
ok(snap.order.indexOf('item_buckets') < snap.order.indexOf('office_stock_items') && snap.order.indexOf('clients') < snap.order.indexOf('client_inquiries'),
  '가리키는 표가 먼저 (품목 구분 → 품목별 재고 · 거래처 → 병원 문의)')
ok(snap.absent.length === 0 && snap.needs.client_inquiries === 'PROPOSAL_0083_customer_platform.sql' && Object.keys(snap.needs).length === 7,
  '파일이 「이 표는 어느 SQL 이 만드는가」를 적어 둠', Object.keys(snap.needs).length + '개')
//  품목별 재고는 0079 가 품목마다 한 줄씩(아직 안 셈 = null) 미리 만들어 둡니다 — 그 가운데 3줄을 위에서 고쳤습니다
const STOCK_ROWS = Number(src(`select count(*) from public.office_stock_items`))
ok(snap.tables.client_inquiries.length === 2 && snap.tables.ai_calls.length === 2 && snap.tables.office_stock_items.length === STOCK_ROWS && STOCK_ROWS >= 3,
  '줄이 그대로 담김 (문의 2 · AI 호출 2 · 품목 재고는 품목마다 한 줄)', `품목 재고 ${STOCK_ROWS}줄`)
ok(['handled_by', 'created_by'].every((c) => snap.nullify.client_inquiries.includes(c)) && snap.nullify.ai_calls.includes('actor_id') && snap.nullify.office_stock_items.includes('updated_by'),
  '계정을 가리키는 칸이 「비울 칸」에 적혀 있음')

const sql = execFileSync('node', [join(ROOT, 'scripts/restore-from-snapshot.mjs'), snapPath], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
ok(sql.includes('PROPOSAL_0083_customer_platform.sql') && sql.includes('PROPOSAL_0106_evidence.sql') && /proposals\/ 의 아래 파일을 번호 순서대로/.test(sql),
  '복구 SQL 머리말이 먼저 실행할 proposals 파일을 이름으로 알려 줌')
ok(sql.includes('구조 확인') && sql.indexOf('$precheck$') < sql.indexOf('delete from public.'), '구조 확인이 「대상 비우기」보다 앞에 있음')
ok(BOUND.every((n) => !sql.includes(`insert into public.${n} `) && !sql.includes(`delete from public.${n};`)), '계정에 묶인 표는 복구 SQL 이 건드리지 않음')
ok(sql.includes('보관용 사본') && sql.includes('day_closes'), '머리말이 보관용 사본(자동 복구 아님)을 밝힘')

// ── 3. 마이그레이션만 돌린 DB 에 부으면 — 시작도 하지 않고 멈춘다 ────────────────
setup(BARE, false)
P(BARE, `insert into public.clients (name, type, address, manager, phone, collection_cycle, collects_medical_waste, collects_diaper, storage_size)
         values ('[그대로]있던 거래처','의원','가상시','담당','010','주 1회',true,false,'보통')`)
const bare = pour(BARE, sql)
ok(!bare.ok, '구조가 옛것인 DB 에서는 복구가 멈춤 (말없이 「성공」하지 않음)')
ok(/복구를 시작하지 않았습니다/.test(bare.err) && /아무것도 바뀌지 않았습니다/.test(bare.err), '멈춘 까닭을 한국어로 말함', (bare.err.match(/복구를 시작하지 않았습니다[^\n]*/) ?? [''])[0].slice(0, 60))
ok(/표 없음: item_buckets\s+← supabase\/proposals\/PROPOSAL_0075_supply_items\.sql/.test(bare.err) && /표 없음: ai_calls/.test(bare.err),
  '없는 표를 이름과 만드는 파일까지 알려 줌')
const lostCols = [...bare.err.matchAll(/칸 없음: ([a-z_]+\.[a-z_0-9]+)/g)].map((m) => m[1])
ok(lostCols.length > 0, '없는 칸도 알려 줌 — 그대로 부었다면 이 칸들의 값이 말없이 버려졌을 것', `${lostCols.length}개 (예: ${lostCols.slice(0, 3).join(', ')})`)
ok(P(BARE, `select count(*) from public.clients`) === '1' && P(BARE, `select name from public.clients`) === '[그대로]있던 거래처',
  '멈춘 DB 는 그대로 — 있던 자료가 지워지지 않음 (대상 비우기 전에 멈춤)')

// ── 4. 같은 proposals 를 실행한 빈 DB 에 부으면 — 그대로 되살아난다 ───────────────
setup(DST, true)
const first = pour(DST, sql)
ok(first.ok, '구조가 같은 DB 에는 복구 SQL 이 끝까지 들어감', first.err.split('\n').slice(0, 2).join(' / '))
for (const name of OPTIONAL) {
  const t = SNAPSHOT_TABLES.find((x) => x.name === name)
  const a = src(`select count(*) from public.${name}`)
  const b = dst(`select count(*) from public.${name}`)
  ok(a === b && Number(a) > 0, `${t.label}(${name}) 줄 수가 같음`, `원본 ${a} · 복구 ${b}`)
  const drop = (snap.nullify[name] ?? []).map((c) => ` - '${c}'`).join('')
  const q = `select coalesce(md5(string_agg((to_jsonb(x)${drop})::text, '|' order by x."${t.order}"::text)), 'EMPTY') from (select * from public.${name}) x`
  ok(src(q) === dst(q), `${t.label}(${name}) 내용이 글자까지 같음`, src(q).slice(0, 8))
}
ok(dst(`select body from public.client_inquiries where subject = '가상 문의 2'`).includes("따옴표 ' 와 줄바꿈"), '따옴표 · 줄바꿈이 든 글도 그대로')
ok(dst(`select (proposal->>'km')::numeric = 41.5 and jsonb_array_length(proposal->'stops') = 3 from public.dispatch_decisions`) === 't', 'jsonb 칸(배차 제안)이 그대로')
ok(dst(`select qty from public.office_stock_items where item = '${items[0]}'`) === '12'
   && dst(`select qty from public.office_stock_items where item = '${items[1]}'`) === '0'
   && dst(`select qty is null from public.office_stock_items where item = '${items[2]}'`) === 't'
   && dst(`select count(*) from public.office_stock_items where qty is null`) === src(`select count(*) from public.office_stock_items where qty is null`),
  '「12개」 · 「0개」 · 「아직 안 셈(null)」이 구분된 채 되살아남', `null ${dst(`select count(*) from public.office_stock_items where qty is null`)}줄`)
const refs = dst(`select (select count(*) from public.client_inquiries where handled_by is not null or created_by is not null)
                       + (select count(*) from public.ai_calls where actor_id is not null)
                       + (select count(*) from public.ops_changes where created_by is not null)
                       + (select count(*) from public.dispatch_decisions where decided_by is not null)
                       + (select count(*) from public.recommendation_views where viewer_id is not null)
                       + (select count(*) from public.office_stock_items where updated_by is not null)`)
ok(refs === '0', '계정을 가리키던 칸은 전부 비어 있음 (없는 계정을 가리키지 않음)', refs)
ok(dst(`select string_agg(created_name || '/' , '' order by title) from public.ops_changes`).includes('관리자') && dst(`select actor_name from public.ai_calls where ok`) === '관리자',
  '누가 했는지는 이름으로 남아 있음')
//  끊긴 연결 — 복구된 표의 외래키가 전부 실제 줄을 가리키는가
const orphans = dst(`
  do $$ declare r record; n bigint; bad text := ''; begin
    for r in select c.conrelid::regclass::text as t, a.attname as col, c.confrelid::regclass::text as ft, fa.attname as fcol
               from pg_constraint c
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
               join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
              where c.contype = 'f' and array_length(c.conkey, 1) = 1
                and c.conrelid::regclass::text = any (array['${OPTIONAL.join("','")}'])
    loop
      execute format('select count(*) from %s x where x.%I is not null and not exists (select 1 from %s y where y.%I = x.%I)', r.t, r.col, r.ft, r.fcol, r.col) into n;
      if n > 0 then bad := bad || r.t || '.' || r.col || '=' || n || ' '; end if;
    end loop;
    if bad <> '' then raise exception 'ORPHAN %', bad; end if;
  end $$; select 'none'`)
ok(orphans === 'none', '복구된 표에 끊긴 연결(외래키 고아)이 하나도 없음')
//  되살린 뒤 그 기능이 실제로 도는가 — 새 줄을 넣어 봅니다
ok(dst(`insert into public.client_inquiries (client_id, topic, subject, body) values ('${CID}','기타','복구 뒤 새 문의','') returning status`) === '접수',
  '복구 뒤 병원 문의를 새로 남길 수 있음')
dst(`delete from public.client_inquiries where subject = '복구 뒤 새 문의'`)
const again = pour(DST, sql)
ok(again.ok && OPTIONAL.every((n) => src(`select count(*) from public.${n}`) === dst(`select count(*) from public.${n}`)), '같은 복구 SQL 을 한 번 더 부어도 그대로 (줄이 늘거나 줄지 않음)')

// ── 5. 계정에 묶인 표 — 복구되지 않고, 파일 안에 줄 그대로 ─────────────────────
ok(BOUND.every((n) => dst(`select count(*) from public.${n}`) === '0'), '계정에 묶인 표 3개는 복구된 DB 에서 비어 있음 (복구 SQL 대상 아님)')
const ex = Object.fromEntries(snap.extras.map((x) => [x.name, x]))
ok(ex.day_closes?.data?.[0]?.profile_name === '기사' && ex.day_closes.data[0].summary?.done === 7, '하루 마감 기록 — 파일 안에 줄 그대로 (이름 · 내용)')
ok(ex.ax_coach_missions?.data?.[0]?.verified_what === '수거 입력 1건' && ex.vehicle_reservations?.data?.[0]?.note === '오전', 'AX 코치 확인 · 차량 예약도 파일 안에 그대로')
ok(BOUND.every((n) => /자동 복구 대상이 아님/.test(ex[n]?.holds ?? '')), '그 사본이 「자동 복구 대상이 아님」이라고 스스로 밝힘')

// ── 6. 칸 하나가 모자라도 멈춘다 ──────────────────────────────────────────────
dst(`alter table public.client_inquiries drop column subject`)
const before = dst(`select count(*) from public.client_inquiries`)
const short = pour(DST, sql)
ok(!short.ok && /칸 없음: client_inquiries\.subject/.test(short.err), '대상에 칸 하나가 없어도 멈춤 — 「칸 없음: client_inquiries.subject」')
ok(dst(`select count(*) from public.client_inquiries`) === before, '그때도 있던 줄은 그대로')

//  급할 때를 위한 길 — 알고도 부어야 하면 확인을 끌 수 있고, 그때는 SQL 이 그 사실을 크게 적습니다
const forced = execFileSync('node', [join(ROOT, 'scripts/restore-from-snapshot.mjs'), snapPath],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, RESTORE_SKIP_PRECHECK: '1' } })
ok(!forced.includes('$precheck$') && /구조 확인을 껐습니다/.test(forced) && /말없이 버려집니다/.test(forced), 'RESTORE_SKIP_PRECHECK=1 — 확인을 끄되, 값이 버려진다는 것을 SQL 머리말에 적음')
ok(/RESTORE_SKIP_PRECHECK=1/.test(short.err), '멈출 때 그 길도 함께 알려 줌')
const forcedRun = pour(DST, forced)
ok(forcedRun.ok && dst(`select count(*) from public.client_inquiries`) === before, '확인을 끄면 칸이 없는 DB 에도 들어감 (없는 칸의 값만 빠짐 — 줄 수는 그대로)', forcedRun.err.split('\n')[0])

console.log(`\n${out.filter(Boolean).length}/${out.length} 통과`)
