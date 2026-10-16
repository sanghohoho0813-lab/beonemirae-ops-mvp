import { useCallback, useRef } from 'react'
import { useRawData } from './DemoScope'
import { emptyClientForm } from '../components/ClientForm'
import { SAMPLE_REQUEST } from '../lib/presenter'
import type { AppData, Client, ClientRequest } from '../types'
import { DEMO_CLIENT_NAME, isPresenterDemoClient } from '../lib/demoScope'

// ─────────────────────────────────────────────────────────────────────────────
// 신보 발표 — AI 시연에 쓸 「시연 요청」 준비 (0140)
//
//  발표 중에 요청을 찾느라 헤매지 않게, 「AI 요청 분석 시연 시작」을 누르면
//  시연용 거래처의 시연 요청 하나를 바로 엽니다.
//
//   · 시연용 거래처(isDemoGenerated) 가 있으면 그것을 씁니다. 없으면 하나만 만듭니다
//     — 이름 「시연용 병원」, 주소 · 연락처 · 사업자 정보 **비움**(지어내지 않음).
//     시연용 거래처는 성과 · 실증 · IR · 준비도 숫자에서 이미 빠지고(isDemoGenerated),
//     그 요청의 AI 호출은 「시연 호출」(request_triage_demo)로 따로 기록됩니다.
//   · 같은 시연 요청(같은 글 · 처리 완료 전)이 있으면 그것을 씁니다. 없으면 하나만 넣습니다.
//   · 두 번 눌러도 하나 — 진행 중인 준비를 같이 기다리고, 넣을 때는 이번 시도 표(requestId)를
//     같은 값으로 보냅니다(서버 색인이 두 번째를 막음).
//   · 실제 거래처 자료는 읽기만 합니다. 고치거나 그 이름으로 요청을 넣지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export { DEMO_CLIENT_NAME }
/** 시연용 거래처 만들기 시도 표 — 늘 같은 값이라 두 번 만들어지지 않습니다 */
const DEMO_CLIENT_REQ = '5b0e0140-0000-4000-8000-000000000001'
const REQ_KEY = 'beonemirae-ops:presenter-demo-req'

export function findDemoClient(data: AppData): Client | null {
  const demo = data.clients.filter((c) => c.isDemoGenerated)
  //  0142 — 「시연용 병원 (신보 발표)」처럼 예전 이름으로 만든 것도 같은 시연 거래처로 봅니다
  //    (시연을 끈 업무 화면에서 거르는 거래처와 같은 기준 — lib/demoScope)
  return demo.find((c) => c.name === DEMO_CLIENT_NAME) ?? demo.find(isPresenterDemoClient) ?? demo[0] ?? null
}

export function findDemoRequest(data: AppData, clientId: string): ClientRequest | null {
  const same = data.requests
    .filter((r) => r.clientId === clientId && r.content.trim() === SAMPLE_REQUEST && r.status !== '처리 완료')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return same[0] ?? null
}

export interface DemoPrep {
  clientId: string
  requestId: string
  createdClient: boolean
  createdRequest: boolean
  /** 0143 — 이번 시연 시작 시각(ISO · 서버가 이 시연 요청을 만든 시각 − 1초). 이보다 앞선 연습 기록은 시연 중에도 안 보임 */
  since: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function usePrepareDemo() {
  //  ⚠ 0143 — 거르지 않은 자료로 (시연 중 거른 자료에서는 방금 넣은 요청을 못 찾을 수 있음)
  const { data, addClient, addRequest, reload } = useRawData()
  //  넣은 뒤 다시 읽은 자료에서 찾아야 해서 — 늘 최신 자료를 봅니다
  const latest = useRef(data)
  latest.current = data
  const inflight = useRef<Promise<DemoPrep> | null>(null)

  const prepare = useCallback((): Promise<DemoPrep> => {
    if (inflight.current) return inflight.current
    const run = (async (): Promise<DemoPrep> => {
      let client = findDemoClient(latest.current)
      let createdClient = false
      if (!client) {
        const made = await addClient(
          { ...emptyClientForm, name: DEMO_CLIENT_NAME, isDemoGenerated: true, note: 'AI 시연용 — 실적 · 성과에서 빠짐. 주소 · 연락처는 비워 둠' },
          { requestId: DEMO_CLIENT_REQ },
        )
        if (!made) throw new Error('시연용 거래처를 만들지 못했습니다 — 화면 위쪽 저장 오류 안내를 확인해 주세요.')
        //  ⚠ 시연 표가 실제로 저장됐는지 다시 확인 — 아니면 운영 거래처처럼 보이므로 요청을 넣지 않고 멈춤
        if (!made.isDemoGenerated) {
          throw new Error(`「${made.name}」이 시연용 표시 없이 만들어졌습니다 — 요청을 넣지 않고 멈췄습니다. 거래처 화면에서 이 거래처를 정리해 주세요.`)
        }
        client = made
        createdClient = true
      }
      //  ⚠ 0143 — 대표님: 「예시로 눌러 봤던 흔적이 남는다」. 시연을 시작할 때마다 **새 시연 요청 하나**를 만들고,
      //    그 요청이 만들어진 시각(서버) 뒤의 기록만 시연 중에 보이게 합니다(DemoScope). 지난 연습에서 회신 · 상태를
      //    바꿔 둔 요청을 다시 쓰지 않습니다.
      const cid = client.id
      const sample = (d: AppData) => d.requests.filter((r) => r.clientId === cid && r.content.trim() === SAMPLE_REQUEST)
      const before = new Set(sample(latest.current).map((r) => r.id))
      const fresh = () => sample(latest.current).filter((r) => !before.has(r.id)).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0] ?? null
      let req: ClientRequest | null = null
      let createdRequest = false
      {
        let key: string | null = null
        try { key = sessionStorage.getItem(REQ_KEY) } catch { /* noop */ }
        if (!key) {
          key = crypto.randomUUID()
          try { sessionStorage.setItem(REQ_KEY, key) } catch { /* noop */ }
        }
        const r = await addRequest({
          clientId: client.id,
          kind: '긴급수거',
          content: SAMPLE_REQUEST,
          urgent: true,
          source: 'portal',
          requesterName: '시연 담당자',
          requestId: key,
        })
        if (!r.ok) throw new Error(r.error ?? '시연 요청을 만들지 못했습니다.')
        createdRequest = true
        for (let i = 0; i < 20 && !req; i++) {
          await sleep(150)
          req = fresh()
        }
        if (!req) {
          await reload()
          for (let i = 0; i < 10 && !req; i++) {
            await sleep(150)
            req = fresh()
          }
        }
        //  같은 시도 표로 이미 들어가 있던 경우(앞선 시도가 중간에 끊김) — 처리 전 시연 요청 중 가장 새것
        if (!req) req = findDemoRequest(latest.current, cid)
        if (!req) throw new Error('시연 요청을 넣었지만 목록에서 찾지 못했습니다 — 새로고침 뒤 다시 눌러 주세요.')
        try { sessionStorage.removeItem(REQ_KEY) } catch { /* noop */ }
      }
      const t = Date.parse(req.createdAt ?? '')
      const since = Number.isFinite(t) ? new Date(t - 1000).toISOString() : ''
      return { clientId: client.id, requestId: req.id, createdClient, createdRequest, since }
    })()
    inflight.current = run
    run.finally(() => { inflight.current = null }).catch(() => { /* 부른 쪽이 받습니다 */ })
    return run
  }, [addClient, addRequest, reload])

  return { prepare, demoClient: findDemoClient(data) }
}
