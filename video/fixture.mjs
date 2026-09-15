import * as F from '../test/browser/perf_fixtures.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  촬영용 기록 (0112) — **흉내 서버 안에만 있습니다.**
//
//   왜 필요한가
//    첫 촬영에서는 기록이 하나도 없어 AX 코치가 네 영역 모두 0% 였습니다.
//    「시스템을 아직 아무도 안 쓴다」로 보입니다. 그런데 이 영상이 보여 줄
//    이야기는 그게 아닙니다.
//
//      이미 일부 기록이 있다 → 코치가 **비어 있는 곳**을 찾는다
//      → 오늘 할 일을 준다 → 사람이 한다 → 코치가 그 기록을 확인한다
//
//   무엇을 넣었나 — **일부러 적게** 넣었습니다
//    · 지난 완료 방문 12건 (5일 · 거래처 3곳 · 기사 2명)
//    · 그중 **현장에서 입력한 것은 1건뿐**
//    · 병원이 포털로 직접 올린 요청 3건 (2곳, 한 곳은 두 번)
//    · 오늘 예정 방문 1건
//
//   이 상태가 그리는 그림은 이렇습니다.
//     「배차하고 완료 처리는 하고 있는데, **현장 입력이 아직 안 쌓였다**」
//   AX 코치가 「업무 활용」을 가장 비어 있는 곳으로 짚고, 그래서 오늘 할 일이
//   「수거 입력」이 됩니다 — 영상의 ②③단계가 바로 그것입니다.
//
//  ⚠ **매출은 한 건도 만들지 않았습니다.** 주문·청구·입금을 지어내면 금액이
//    생깁니다. 없는 매출을 만드는 것은 이 시스템이 하지 않기로 한 일입니다.
//    그래서 「매출 증거」는 0% 로 남습니다 — 그것도 사실입니다.
//  ⚠ 회사의 실제 실적·수치가 아닙니다. 그래서 화면에 「예시 데이터 · 기능
//    시연용」이 항상 떠 있습니다.
//  ⚠ 날짜는 **오늘에서 며칠 전**으로만 셉니다. 무작위가 없으므로 같은 날
//    몇 번을 찍어도 같은 화면이 나옵니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 오늘에서 n일 전 (한국 날짜) */
function ago(today, n) {
  const d = new Date(`${today}T00:00:00+09:00`)
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

/** 지난 방문이 있었던 날 — 5일 (고정) */
const PAST_DAYS = [3, 6, 9, 13, 17]
/** 그날 몇 곳을 다녀왔는가 — 합계 12건 (고정) */
const PER_DAY = [3, 3, 2, 2, 2]

export function captureFixture(today = F.TODAY) {
  const cl = F.clients.slice(0, 3)
  const schedules = []
  let n = 0

  //  ── 지난 완료 방문 ─────────────────────────────────────────────────────
  PAST_DAYS.forEach((back, di) => {
    const day = ago(today, back)
    for (let i = 0; i < PER_DAY[di]; i += 1) {
      const c = cl[(di + i) % cl.length]
      const v = (di + i) % 2 === 0 ? 1 : 2
      n += 1
      schedules.push({
        id: `vs${n}`, date: day, client_id: c.id, waste_type: '의료폐기물',
        vehicle_id: `v${v}`, scheduled_time: `${9 + i}:00`, status: '완료',
        expected_amount: 80, actual_amount: 60 + ((n * 7) % 40),
        completed_at: `${day}T0${1 + i}:00:00Z`, memo: '', origin: 'field',
        is_additional: false, demo_session_id: null, plan_batch: null,
        handover_status: '인계 완료', driver_name: `${v}호기사`,
        created_at: `${day}T00:00:00Z`, updated_at: `${day}T00:00:00Z`,
      })
    }
  })

  //  ── 오늘 예정 1건 ──────────────────────────────────────────────────────
  //   이게 있어야 코치가 「오늘 갈 병원 1곳, 다녀온 자리에서 바로 입력해
  //   주세요」를 냅니다 — 영상 ②단계에서 누르는 그 일입니다.
  schedules.push({
    id: 'sx', date: today, client_id: cl[0].id, waste_type: '의료폐기물',
    vehicle_id: 'v1', scheduled_time: '10:00', status: '예정',
    expected_amount: 80, actual_amount: null, completed_at: null, memo: '',
    origin: 'field', is_additional: false, demo_session_id: null, plan_batch: null,
    handover_status: null, driver_name: '1호기사',
    created_at: `${today}T00:00:00Z`, updated_at: `${today}T00:00:00Z`,
  })

  //  ── 현장에서 입력한 수거 — **딱 1건** ──────────────────────────────────
  //   12번 다녀왔는데 입력은 1건. 이것이 코치가 찾아내는 공백입니다.
  const first = schedules[0]
  const events = [{
    id: 'ev-past-1', at: `${first.date}T02:10:00Z`, actor_role: 'field',
    screen: '수거 입력', action: '수거 완료', schedule_id: first.id,
    created_schedule: false, client_id: first.client_id,
    client_name: cl[0].name, waste_type: first.waste_type, amount_kg: first.actual_amount,
    before_state: { status: '예정', actualAmount: null, handoverStatus: null },
    material_ids: [], stock_before: null, request_updates: [], note: '',
    reverted: false, reverted_at: null, demo_session_id: null, input_duration_ms: 42000,
  }]

  //  ── 병원이 포털로 직접 올린 요청 ───────────────────────────────────────
  //   ⚠ 직원이 대신 접수한 것(source='staff')은 「병원 직접사용」에 안 들어갑니다.
  //     여기 넣는 것은 전부 병원이 직접 올린 것입니다.
  const req = (id, ci, back, kind, handledBack) => {
    const day = ago(today, back)
    return {
      id, client_id: cl[ci].id, kind, content: '', desired_date: null, urgent: false,
      waste_type: null, expected_kg: null,
      status: handledBack == null ? '접수' : '처리 완료',
      source: 'portal', requester_name: '병원 담당자', reply: '',
      snoozed_until: null, snooze_reason: '',
      handled_by: handledBack == null ? null : F.UID,
      handled_at: handledBack == null ? null : `${ago(today, handledBack)}T02:00:00Z`,
      created_at: `${day}T01:00:00Z`, clients: { name: cl[ci].name },
    }
  }
  const requests = [
    req('vr1', 0, 14, '추가수거', 13),
    req('vr2', 1, 8, '소모품', 8),
    req('vr3', 0, 2, '추가수거', null),
  ]

  return { schedules, events, requests, startedOn: ago(today, 30) }
}
