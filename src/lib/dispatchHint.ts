// ─────────────────────────────────────────────────────────────────────────────
// 요청 → 「누가 갈 수 있나」 (0141 · 신보 발표 STEP 1)
//
//  대표님: 「회신 문구만 정리해 주는 것보다, 기사 일정까지 한 번에 파악해서 누가 갈 수 있는지까지
//          바로 보여 주면 좋겠다.」
//
//  ⚠ 이것은 **일정표에서 바로 계산**합니다(AI 가 아님 · 같은 화면 AI 결과 아래에 둠). 그날 차량별
//    방문 수 · 이 병원을 늘 가던 차량 · 그날 이미 이 병원에 가는 차량. 확정은 담당자가 「날짜 잡기」로.
//  ⚠ 날짜는 병원이 적은 희망일 → 요청 글의 「오늘 · 내일 · 모레」 → 긴급이면 오늘 · 아니면 내일 순서.
//    어떻게 정했는지(why)를 함께 돌려줍니다 — 화면이 그대로 보여 줍니다.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppData, Vehicle } from '../types'
import { today } from './format'

/** 'YYYY-MM-DD' + n일 (날짜 글자만 — 시간대와 무관) */
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export interface DriverLoad {
  vehicleId: string
  vehicleName: string
  driver: string
  /** 그날 이 차량의 방문 수 (취소 제외) */
  visits: number
  /** 이 병원을 가장 최근에 맡았던 차량 */
  regular: boolean
  /** 그날 이미 이 병원에 가는 차량 */
  alreadyThere: boolean
}

export interface DispatchHint {
  date: string
  why: string
  loads: DriverLoad[]
  /** 추천 후보 (없으면 null) */
  pick: DriverLoad | null
  pickWhy: string
}

export function targetDate(req: { desiredDate?: string | null; content: string; urgent: boolean }, now = today()): { date: string; why: string } {
  if (req.desiredDate && /^\d{4}-\d{2}-\d{2}/.test(req.desiredDate)) return { date: req.desiredDate.slice(0, 10), why: '병원이 적은 희망일' }
  const c = req.content
  if (/모레/.test(c)) return { date: addDays(now, 2), why: '요청 글의 「모레」' }
  if (/내일/.test(c)) return { date: addDays(now, 1), why: '요청 글의 「내일」' }
  if (/오늘|지금|당장/.test(c)) return { date: now, why: '요청 글의 「오늘」' }
  return req.urgent ? { date: now, why: '날짜가 없고 긴급 — 오늘' } : { date: addDays(now, 1), why: '날짜가 없어 — 내일' }
}

function servesClient(v: Vehicle, collectsMedical: boolean): boolean {
  //  의료폐기물을 내는 병원이면 의료폐기물 차량만 (기저귀 차량은 빼고)
  return collectsMedical ? v.wasteType === '의료폐기물' : true
}

export function dispatchHint(
  data: AppData,
  req: { clientId: string; desiredDate?: string | null; content: string; urgent: boolean },
  now = today(),
): DispatchHint {
  const { date, why } = targetDate(req, now)
  const client = data.clients.find((c) => c.id === req.clientId)
  const medical = client?.collectsMedicalWaste !== false
  const live = data.schedules.filter((s) => !s.canceledAt)
  const lastForClient = live
    .filter((s) => s.clientId === req.clientId && s.vehicleId && s.date <= now)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const loads: DriverLoad[] = data.vehicles
    .filter((v) => servesClient(v, medical))
    .map((v) => {
      const day = live.filter((s) => s.date === date && s.vehicleId === v.id)
      return {
        vehicleId: v.id,
        vehicleName: v.name,
        driver: v.driver,
        visits: day.length,
        regular: lastForClient?.vehicleId === v.id,
        alreadyThere: day.some((s) => s.clientId === req.clientId),
      }
    })
    .sort((a, b) => Number(b.alreadyThere) - Number(a.alreadyThere) || a.visits - b.visits || a.vehicleName.localeCompare(b.vehicleName, 'ko'))

  let pick: DriverLoad | null = null
  let pickWhy = ''
  const there = loads.find((l) => l.alreadyThere)
  const minVisits = loads.length ? Math.min(...loads.map((l) => l.visits)) : 0
  const regular = loads.find((l) => l.regular)
  if (there) { pick = there; pickWhy = '그날 이미 이 병원에 갑니다 — 함께 처리' }
  else if (regular && regular.visits <= minVisits + 2) { pick = regular; pickWhy = `늘 가던 차량 · 그날 방문 ${regular.visits}곳` }
  else if (loads.length) { pick = loads.find((l) => l.visits === minVisits) ?? null; pickWhy = pick ? `그날 가장 여유 (방문 ${pick.visits}곳)` : '' }
  return { date, why, loads, pick, pickWhy }
}
