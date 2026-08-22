import { execFileSync } from 'node:child_process'

//  브라우저의 Supabase 요청을 **Node(curl) 로 중계**합니다.
//
//  ── 왜 필요한가 ────────────────────────────────────────────────────────────
//
//   이 컨테이너의 Chromium 은 바깥 HTTPS 를 하나도 못 나갑니다
//   (example.com 도 net::ERR_CONNECTION_RESET). 프록시를 물려도 같습니다.
//   반면 curl 은 정상입니다 — 바깥 통신은 프록시를 거치게 돼 있고 curl 은
//   그것을 따릅니다.
//
//   그래서 **화면은 진짜 브라우저 390px**, **서버는 진짜 Supabase** 로 두고
//   그 사이만 중계합니다. 앱 코드는 한 줄도 안 바꿉니다 — 검사 장치입니다.
//
//  ⚠ TLS 검증을 끄지 않습니다. curl 이 프록시 CA 를 그대로 씁니다.

const HOP = new Set([
  'host', 'connection', 'content-length', 'accept-encoding',
  'origin', 'referer', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest',
  'user-agent', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
])

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
}

/**
 * @param {import('playwright').Route} route
 * @param {(info:{method:string,url:string,body:string,status:number})=>void} [onCall]
 * @param {(info:{method:string,url:string})=>boolean} [allow] false 를 주면 그 요청을 막습니다
 */
export async function relay(route, onCall, allow) {
  const req = route.request()
  const method = req.method()
  const url = req.url()

  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' })

  if (allow && !allow({ method, url })) {
    //  ⚠ 막을 때는 **조용히 넘기지 않습니다.** 못 쓴 것과 안 쓴 것은 다릅니다.
    return route.fulfill({
      status: 403, headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'E2E: 쓰기가 막혀 있습니다' }),
    })
  }

  const args = ['-s', '-i', '-X', method, url, '--max-time', '30']
  for (const [k, v] of Object.entries(req.headers())) {
    if (HOP.has(k.toLowerCase())) continue
    args.push('-H', `${k}: ${v}`)
  }
  const post = req.postData()
  if (post != null) args.push('--data-binary', post)

  let raw = ''
  try {
    raw = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch (e) {
    return route.fulfill({
      status: 502, headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ message: `E2E relay 실패: ${String(e).slice(0, 120)}` }),
    })
  }

  //  ⚠ -i 는 헤더를 함께 줍니다. 프록시가 100 Continue 나 CONNECT 응답을
  //    앞에 붙이는 경우가 있어, **마지막 헤더 덩어리**를 씁니다.
  const parts = raw.split(/\r?\n\r?\n/)
  let head = parts[0]
  let bodyIdx = 1
  while (bodyIdx < parts.length && /^HTTP\/[\d.]+ (?:1\d\d|2\d\d Connection)/.test(head)) {
    head = parts[bodyIdx]; bodyIdx += 1
  }
  const body = parts.slice(bodyIdx).join('\n\n')
  const status = Number((head.match(/^HTTP\/[\d.]+ (\d{3})/m) ?? [])[1] ?? 500)
  const headers = { ...CORS }
  for (const line of head.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i).trim().toLowerCase()
    if (['content-length', 'transfer-encoding', 'content-encoding', 'connection'].includes(k)) continue
    headers[k] = line.slice(i + 1).trim()
  }
  onCall?.({ method, url, body, status })
  return route.fulfill({ status, headers, body })
}
