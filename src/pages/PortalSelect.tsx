import { useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { PageShell } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { PortalClientPicker } from '../components/PortalPreviewBar'
import { PORTAL_PAGES, type PortalPage } from '../lib/portalClient'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고르기 — **자기 주소를 가진 화면** (0088)
//
//  ⚠ 0088 이전에는 이 목록이 「병원을 못 정했다」는 상태일 때 아무 화면의
//    본문 자리에 끼어들었습니다. 그래서 대표님이 메뉴를 누를 때마다
//    튀어나왔고, 고르면 첫 화면으로 돌아갔습니다.
//
//    이제 여기는 **눌러서 오는 곳**입니다 — 「병원 변경」을 누르거나,
//    직원이 병원 없이 /portal 로 들어왔을 때만 옵니다.
//
//  ⚠ `?back=` 에 보던 화면을 담아 옵니다. 리포트를 보다 병원을 바꾸면
//    새 병원의 **리포트**가 열립니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalSelect() {
  const { data } = useData()
  const [params] = useSearchParams()
  const raw = params.get('back') ?? ''
  const back: PortalPage = (PORTAL_PAGES as readonly string[]).includes(raw) ? (raw as PortalPage) : ''

  return (
    <PageShell>
      {/*  ⚠ 자료가 오기 전에 「등록된 거래처가 없습니다」라고 하면 대표님이
           시스템이 비었다고 읽으십니다. 다 읽은 뒤에만 그렇게 말합니다. */}
      {data.clients.length === 0 ? (
        <LoadGate loadingTitle="거래처 목록을 불러오는 중입니다" empty={<PortalClientPicker clients={[]} />} />
      ) : (
        <PortalClientPicker clients={data.clients} back={back} />
      )}
    </PageShell>
  )
}
