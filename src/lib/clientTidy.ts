import type { Client } from '../types'
import { clientNameKey } from './clientName'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 정리 도우미 — 무엇이 비었고 무엇이 겹치는가 (0105)
//
//  이사님(첫 실사용 피드백): 「엑셀로 매일 보니까 머릿속에 다 들어 있어서
//  몰랐는데, 프로그램화하니까 뒤죽박죽인 게 보입니다. 정리를 좀 해야 될 것
//  같아요.」
//
//  시스템이 문제를 만든 게 아니라 원래 있던 것을 드러낸 것입니다. 다만 여태는
//  드러내기만 하고 **고치는 길을 안 내주었습니다.** 여기서는 거래처 한 곳 한
//  곳의 빈칸과 겹침을 모아, 누르면 그 자리로 가게 합니다.
//
//  ── 지키는 것 ───────────────────────────────────────────────────────────
//  ⚠ 전부 **지금 저장돼 있는 값**으로만 판정합니다. 「아마 주소가 틀렸을 것」
//    같은 추측은 없습니다 — 비었으면 비었다, 겹치면 겹친다.
//  ⚠ 순서를 정해 줍니다: 돈에 닿는 것(단가) → 매일 쓰는 것(주소·연락처·주기)
//    → 나중 것(계약일). 한꺼번에 다 채우라고 하면 아무도 시작을 못 합니다.
//  ⚠ 겹침은 **의심**입니다. 「가나요양병원」과 「가나 요양병원」은 같은 곳일
//    수도 다른 곳일 수도 있고, 그건 사람만 압니다. 합치지 않고 보여만 줍니다.
//  ⚠ 시연용 거래처는 세지 않습니다 — 그건 정리 대상이 아니라 지울 대상입니다.
//    다만 실제와 섞여 있으면 그 사실 하나는 알려 줍니다.
// ─────────────────────────────────────────────────────────────────────────────

export type TidyGroup = '돈' | '매일' | '나중' | '겹침'

export interface TidyIssue {
  /** 같은 거래처의 같은 문제는 하나 */
  key: string
  group: TidyGroup
  clientId: string
  clientName: string
  /** 무엇이 문제인가 — 한 줄 */
  label: string
  /** 누르면 갈 곳 */
  to: string
}

export interface TidyReport {
  issues: TidyIssue[]
  /** 묶음별 개수 (0 인 묶음도 넣습니다 — 「돈 0」이 보이면 안심이 됩니다) */
  byGroup: Record<TidyGroup, number>
  /** 실제 거래처 수 (시연용 제외) */
  clients: number
  /** 문제가 하나도 없는 거래처 수 */
  clean: number
  /** 실제와 섞여 있는 시연용 거래처 수 (0 이면 걱정 없음) */
  demoMixed: number
}

export const TIDY_GROUP_ORDER: TidyGroup[] = ['돈', '매일', '나중', '겹침']

export const TIDY_GROUP_LABEL: Record<TidyGroup, string> = {
  돈: '청구에 닿는 것',
  매일: '매일 쓰는 것',
  나중: '나중에 필요한 것',
  겹침: '이름이 비슷한 곳',
}

/** 왜 이 순서인가 — 화면에 한 줄로 */
export const TIDY_GROUP_WHY: Record<TidyGroup, string> = {
  돈: '단가가 없으면 기본값으로 청구됩니다. 엑셀과 금액이 달라지는 첫째 이유입니다.',
  매일: '주소·연락처·수거주기가 비면 현장에서 못 찾고 못 걸고, 다음 수거 예상이 안 나옵니다.',
  나중: '계약일이 비면 만료 알림이 오지 않습니다. 급하지는 않지만 한 번은 채워야 합니다.',
  겹침: '같은 병원이 두 곳으로 갈리면 수거도 정산도 미수금도 둘로 나뉩니다. 사람이 보고 정해 주세요.',
}

const blank = (v: string | null | undefined) => (v ?? '').trim() === ''

/**
 * 거래처 목록을 훑어 정리할 것을 모읍니다.
 *
 *  ⚠ 겹침은 실제 거래처끼리만 봅니다. 시연용과 겹치는 것은 시연용을 지우면
 *    끝나는 일이라 따로 세지 않습니다.
 */
export interface TidyContext {
  /** 담당 기사 배정 (0056). 한 곳이라도 배정돼 있을 때만 「배정 없음」을 셉니다 */
  assignments?: { clientId: string }[]
}

export function tidyClients(all: Client[], ctx: TidyContext = {}): TidyReport {
  const real = all.filter((c) => !c.isDemoGenerated)
  //  담당 기사를 아무도 배정하지 않으면 모든 기사에게 보입니다 — 정한 규칙이지 결함이
  //  아닙니다. 그래서 회사가 배정을 **쓰기 시작한 뒤**에만 빠진 곳을 셉니다.
  const assigned = new Set((ctx.assignments ?? []).map((a) => a.clientId))
  const usesAssignment = assigned.size > 0
  const issues: TidyIssue[] = []
  const dirty = new Set<string>()
  const push = (c: Client, group: TidyGroup, what: string, label: string, edit = true) => {
    issues.push({
      key: `${c.id}:${what}`, group, clientId: c.id, clientName: c.name, label,
      to: edit ? `/clients/${c.id}?edit=1` : `/clients/${c.id}`,
    })
    dirty.add(c.id)
  }

  //  라벨은 「무엇이 비었나 → 어떤 업무가 막히나」입니다. 빈칸 이름만 적으면
  //  왜 채워야 하는지 모르고, 그러면 엑셀을 계속 씁니다.
  for (const c of real) {
    //  돈 — 단가를 한 번도 정하지 않은 곳 (기본값으로 청구되는 중)
    const priced = c.pricing && Object.values(c.pricing).some((p) => p != null)
    if (!priced) push(c, '돈', 'price', '단가 없음 → 기본 단가로 청구됨 · 엑셀과 금액이 달라짐')

    //  매일 — 현장·사무실이 매일 보는 칸
    if (blank(c.address)) push(c, '매일', 'address', '주소 없음 → 현장에서 못 찾음 · 동선·거리 계산 불가')
    if (blank(c.phone)) push(c, '매일', 'phone', '연락처 없음 → 현장에서 전화 못 걺')
    if (blank(c.manager)) push(c, '매일', 'manager', '담당자 없음 → 누구에게 연락할지 모름')
    if (blank(c.collectionCycle)) push(c, '매일', 'cycle', '수거주기 없음 → 다음 수거 예상·자동 편성 안 됨')
    if (usesAssignment && !assigned.has(c.id)) push(c, '매일', 'driver', '담당 기사 없음 → 모든 기사에게 보임 · 「내 일정」이 안 됨', false)

    //  나중 — 알림·계약에 쓰는 칸
    if (blank(c.contractStart)) push(c, '나중', 'contract', '계약 시작일 없음 → 만료 알림이 안 옴')
  }

  //  겹침 — 같은 열쇠(법인격·띄어쓰기 무시)거나 한쪽이 다른 쪽으로 시작하는 이름.
  //  쌍마다 한 번만 적습니다 (a↔b 를 두 번 세지 않게).
  const seenPair = new Set<string>()
  for (let i = 0; i < real.length; i += 1) {
    const a = real[i]
    const ka = clientNameKey(a.name)
    if (!ka) continue
    for (let j = i + 1; j < real.length; j += 1) {
      const b = real[j]
      const kb = clientNameKey(b.name)
      if (!kb) continue
      const same = ka === kb
      const similar = !same && (ka.startsWith(kb) || kb.startsWith(ka))
      if (!same && !similar) continue
      const pair = [a.id, b.id].sort().join('|')
      if (seenPair.has(pair)) continue
      seenPair.add(pair)
      issues.push({
        key: `dup:${pair}`, group: '겹침', clientId: a.id, clientName: a.name,
        label: `${same ? '사실상 같은 이름' : '비슷한 이름'} — 「${b.name}」과 겹칩니다`,
        to: `/clients/${a.id}`,
      })
      dirty.add(a.id); dirty.add(b.id)
    }
  }

  const byGroup: Record<TidyGroup, number> = { 돈: 0, 매일: 0, 나중: 0, 겹침: 0 }
  for (const it of issues) byGroup[it.group] += 1

  return {
    issues,
    byGroup,
    clients: real.length,
    clean: real.filter((c) => !dirty.has(c.id)).length,
    demoMixed: real.length > 0 ? all.length - real.length : 0,
  }
}
