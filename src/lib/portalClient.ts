import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import type { Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 이 포털 화면은 **어느 병원**을 보여 주는가 (0085)
//
//  ── 여기 실제 결함이 있었습니다 ───────────────────────────────────────────
//
//   포털 화면 일곱 곳이 전부 `data.clients[0]` 를 썼습니다.
//
//   병원 계정에서는 맞습니다 — RLS 가 자기 병원 하나만 내려 줍니다.
//   그런데 **대표·이사 계정에서는 전체 거래처가 내려옵니다.** 그래서
//   「병원이 보는 화면」을 누르면 목록의 **첫 병원**이 「우리 병원」인 것처럼
//   떴습니다. 대표님이 더원요양병원을 확인하려고 눌러도 가나요양병원이
//   나오는 상태였습니다.
//
//   대표님 금지사항 그대로입니다 — 「hard-coded hospital name을 모든 계정에
//   표시」·「가짜 특정 병원 데이터가 모든 계정에 고정되어서는 안 된다」.
//
//  ── 그래서 이렇게 정합니다 ────────────────────────────────────────────────
//
//   병원 계정   자기 병원. 주소에 뭐가 붙어 있어도 무시합니다.
//               (남의 병원 id 를 붙여도 서버가 안 줍니다 — 이중으로 막습니다)
//   직원 계정   주소의 `?client=<id>`. **없으면 아무 병원도 안 고릅니다.**
//               ⚠ 첫 병원을 슬쩍 보여 주지 않습니다. 그게 지금 결함입니다.
//                 대신 「어느 병원 화면을 보시겠습니까」를 묻습니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalTarget {
  /** 지금 보여 줄 병원. 못 정했으면 null */
  client: Client | null
  /** 비원미래 직원이 확인용으로 보고 있는가 */
  isPreview: boolean
  /** 직원이 고를 수 있는 거래처 (병원 계정에는 빈 배열) */
  choices: Client[]
  /** 직원인데 아직 안 골랐는가 */
  needsPick: boolean
}

export function usePortalClient(): PortalTarget {
  const { role, mode } = useAuth()
  const { data } = useData()
  const [params] = useSearchParams()
  const wanted = params.get('client')

  return useMemo(() => {
    //  시연 모드에는 역할이 없습니다 — 예전처럼 첫 거래처를 씁니다.
    //  (시연 자료는 한 병원으로 만들어져 있습니다)
    if (mode !== 'live') {
      return { client: data.clients[0] ?? null, isPreview: false, choices: [], needsPick: false }
    }

    //  ⚠ 병원 계정은 주소를 무시합니다. 서버도 자기 것만 주지만, 화면에서도
    //    묻지 않는 편이 낫습니다 — 「고를 수 있다」는 인상을 주면 안 됩니다.
    if (role === 'client') {
      return { client: data.clients[0] ?? null, isPreview: false, choices: [], needsPick: false }
    }

    const choices = data.clients
    const picked = wanted ? (choices.find((c) => c.id === wanted) ?? null) : null
    return {
      client: picked,
      isPreview: true,
      choices,
      //  ⚠ 못 찾았을 때도 아무거나 보여 주지 않습니다. 주소에 있는 id 가
      //    지워진 거래처일 수도 있고, 그때 엉뚱한 병원을 보여 주면
      //    대표님은 그것을 그 병원 자료로 읽습니다.
      needsPick: picked == null,
    }
  }, [mode, role, data.clients, wanted])
}
