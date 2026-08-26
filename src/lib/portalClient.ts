import { useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useLoadState } from '../components/LoadState'
import { PORTAL_PREFIX } from './access'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 이 포털 화면은 **어느 병원**을 보여 주는가 (0085 → 0088 에서 다시 고침)
//
//  ── 0088 에서 고친 결함 (대표님 신고) ────────────────────────────────────
//
//   대표님: 「비원종합병원 선택 → 필요한 물품 → **다시 병원 선택 화면** →
//   다시 선택 → **대시보드로 원점 복귀**」
//
//   원인은 한 줄이었습니다. 0085 에서 병원을 `?client=<id>` 로 주소에 달았는데,
//   포털 안 메뉴 단추들은 `/portal/supplies` 처럼 **물음표 뒤를 안 달고**
//   있었습니다. 메뉴를 누르는 순간 어느 병원인지가 사라집니다.
//   그러면 화면은 규칙대로 「어느 병원을 보시겠습니까」를 다시 묻고,
//   고르면 첫 화면으로 갑니다 — 물품을 보러 가던 길이 지워집니다.
//
//   ⚠ 「메뉴마다 물음표를 붙이자」로 고치지 않았습니다. 그건 붙이는 것을 한
//     군데라도 빠뜨리면 같은 일이 다시 납니다. 붙일 자리가 하나도 없는
//     구조로 바꿉니다 — **병원 id 를 경로 자체에 넣습니다.**
//
//       직원 미리보기   /portal/c/<병원id>            (첫 화면)
//                       /portal/c/<병원id>/supplies   (필요한 물품)
//       병원 계정       /portal                       (자기 병원)
//                       /portal/supplies
//
//     경로에 있으면 메뉴를 눌러도, 새로고침해도, 뒤로가기를 해도 안 지워집니다.
//     주소창을 그대로 복사해 드려도 같은 화면이 열립니다.
//
//   ⚠ `c` 라는 한 글자를 굳이 넣은 이유 — `/portal/<id>` 로 두면
//     `/portal/report` 의 `report` 가 병원 id 로 읽힙니다. 갈림길이 생기면
//     언젠가 반드시 잘못 갑니다.
//
//  ── 어느 병원인지 정하는 규칙 ────────────────────────────────────────────
//
//   병원 계정   자기 병원. 주소에 뭐가 붙어 있어도 무시합니다.
//               (남의 병원 id 를 붙여도 서버가 안 줍니다 — 이중으로 막습니다)
//   직원 계정   경로의 병원 id. 없으면 고르는 화면으로 보냅니다.
//               ⚠ 첫 병원을 슬쩍 보여 주지 않습니다 — 대표님은 그것을
//                 「지금 보려던 그 병원」으로 읽으십니다.
//
//  ⚠ **자료를 읽는 중에는 아무것도 묻지 않습니다.** 0088 전에는 첫 렌더에서
//    거래처 목록이 비어 있어 「못 찾았다 → 고르세요」로 잠깐 튀었습니다.
//    「아직 안 읽었다」와 「정말 없다」는 다른 말입니다(LoadState).
// ─────────────────────────────────────────────────────────────────────────────

/** 직원이 특정 병원 화면을 볼 때의 경로 앞머리 */
export const PORTAL_PREVIEW_PREFIX = `${PORTAL_PREFIX}/c`
/** 직원이 병원을 고르는 화면 */
export const PORTAL_SELECT_PATH = `${PORTAL_PREFIX}/select`

/** 포털 안의 화면들 — 빈 문자열이 첫 화면입니다 */
export const PORTAL_PAGES = ['', 'supplies', 'report', 'history', 'billing', 'support'] as const
export type PortalPage = (typeof PORTAL_PAGES)[number]

/**
 * **병원을 잃지 않고** 다른 메뉴로 가는 주소.
 *
 *  ⚠ 포털 안의 이동은 전부 이 함수를 지나가야 합니다. 한 군데라도 직접
 *    `/portal/supplies` 라고 적으면 거기서 병원이 지워집니다 — 그게 0088
 *    이전의 결함이었습니다.
 */
export function portalPath(clientId: string | null, page: PortalPage = ''): string {
  const base = clientId ? `${PORTAL_PREVIEW_PREFIX}/${clientId}` : PORTAL_PREFIX
  return page ? `${base}/${page}` : base
}

/** 지금 주소가 포털의 어느 화면인가 — 메뉴에 표시를 하려고 씁니다 */
export function portalPageOf(pathname: string): PortalPage {
  const tail = pathname
    .replace(new RegExp(`^${PORTAL_PREVIEW_PREFIX}/[^/]+`), '')
    .replace(new RegExp(`^${PORTAL_PREFIX}`), '')
    .replace(/^\//, '')
    .split('/')[0]
  return (PORTAL_PAGES as readonly string[]).includes(tail) ? (tail as PortalPage) : ''
}

/**
 * 지금 주소가 「직원이 어느 병원을 미리보는 중」이면 그 병원 id (0088).
 *
 *  ⚠ 포털 **바깥**에 사는 것(제품 투어 같은)도 지금 병원을 알아야 할 때가
 *    있습니다. 그런 곳은 라우트 안이 아니라서 useParams 를 못 씁니다.
 *    주소 글자에서 직접 읽습니다.
 */
export function previewClientIdOf(pathname: string): string | null {
  const m = pathname.match(new RegExp(`^${PORTAL_PREVIEW_PREFIX}/([^/]+)`))
  return m ? m[1] : null
}

/**
 * 포털 안의 주소 하나를 **지금 보고 있는 병원에 맞게** 고쳐 줍니다 (0088).
 *
 *  제품 투어처럼 `/portal/support` 를 통째로 적어 둔 곳이 있습니다.
 *  직원이 미리보기로 보는 중이면 그대로 옮겨 가면 병원이 지워집니다.
 *  포털 밖 주소는 손대지 않고 그대로 돌려줍니다.
 */
export function keepPortalClient(route: string, pathname: string): string {
  if (route !== PORTAL_PREFIX && !route.startsWith(`${PORTAL_PREFIX}/`)) return route
  const id = previewClientIdOf(pathname)
  if (!id) return route
  return portalPath(id, portalPageOf(route))
}

export interface PortalTarget {
  /** 지금 보여 줄 병원. 못 정했으면 null */
  client: Client | null
  /** 비원미래 직원이 확인용으로 보고 있는가 */
  isPreview: boolean
  /** 직원이 고를 수 있는 거래처 (병원 계정에는 빈 배열) */
  choices: Client[]
  /** 직원인데 아직 안 골랐는가 — **자료를 다 읽은 뒤에만** true 가 됩니다 */
  needsPick: boolean
  /** 아직 자료가 오는 중인가 */
  loading: boolean
  /**
   * 이 병원을 달고 가는 주소를 만듭니다.
   *  ⚠ 포털 안의 모든 이동이 여기를 지나갑니다.
   */
  path: (page?: PortalPage) => string
  /** 지금 화면 (메뉴 표시용) */
  page: PortalPage
}

export function usePortalClient(): PortalTarget {
  const { role, mode } = useAuth()
  const { data } = useData()
  const { clientId } = useParams()
  const { pathname } = useLocation()
  const load = useLoadState()

  return useMemo(() => {
    const page = portalPageOf(pathname)

    //  시연 모드에는 역할이 없습니다 — 예전처럼 첫 거래처를 씁니다.
    //  (시연 자료는 한 병원으로 만들어져 있습니다)
    if (mode !== 'live') {
      return {
        client: data.clients[0] ?? null,
        isPreview: false, choices: [], needsPick: false, loading: false,
        path: (p: PortalPage = '') => portalPath(null, p),
        page,
      }
    }

    //  ⚠ 병원 계정은 주소를 무시합니다. 서버도 자기 것만 주지만, 화면에서도
    //    묻지 않는 편이 낫습니다 — 「고를 수 있다」는 인상을 주면 안 됩니다.
    if (role === 'client') {
      return {
        client: data.clients[0] ?? null,
        isPreview: false, choices: [], needsPick: false, loading: load === 'loading',
        path: (p: PortalPage = '') => portalPath(null, p),
        page,
      }
    }

    const choices = data.clients
    const picked = clientId ? (choices.find((c) => c.id === clientId) ?? null) : null
    //  ⚠ 읽는 중에는 「못 찾았다」가 아닙니다. 여기서 needsPick 을 켜면
    //    대표님이 메뉴를 누를 때마다 고르는 화면이 한 번 깜빡입니다.
    const loading = load === 'loading'
    return {
      client: picked,
      isPreview: true,
      choices,
      //  ⚠ 못 찾았을 때도 아무거나 보여 주지 않습니다. 주소에 있는 id 가
      //    지워진 거래처일 수도 있고, 그때 엉뚱한 병원을 보여 주면
      //    대표님은 그것을 그 병원 자료로 읽습니다.
      needsPick: !loading && picked == null,
      loading,
      //  ⚠ 병원을 아직 못 정했어도 **경로 만드는 방법은 같습니다.**
      path: (p: PortalPage = '') => portalPath(clientId ?? null, p),
      page,
    }
  }, [mode, role, data.clients, clientId, pathname, load])
}
