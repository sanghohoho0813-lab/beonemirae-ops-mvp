// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — 홈페이지 상담문의 이메일 발송 (/api/contact)
//  · Edge 런타임 · 외부 SDK 없이 Resend REST API(fetch)로 발송
//  · 필요한 환경변수: RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL
//    (모두 서버 전용 — 프론트에는 노출하지 않음)
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: 'edge' }

interface ContactPayload {
  inquiry?: string
  org?: string
  manager?: string
  contact?: string
  email?: string
  region?: string
  type?: string
  message?: string
  agree?: boolean
  company?: string // honeypot
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (ch) => map[ch] ?? ch)
}

function renderEmail(d: {
  inquiry: string
  org: string
  manager: string
  contact: string
  email: string
  region: string
  type: string
  message: string
}): string {
  const row = (labelText: string, value: string) => `
    <tr>
      <td style="padding:8px 12px;background:#f1f5f9;font-weight:700;color:#0f1a2e;white-space:nowrap;vertical-align:top;">${escapeHtml(labelText)}</td>
      <td style="padding:8px 12px;color:#334155;">${value ? escapeHtml(value).replace(/\n/g, '<br/>') : '-'}</td>
    </tr>`
  return `
  <div style="font-family:'Apple SD Gothic Neo',Arial,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#0f1a2e;font-size:18px;margin:0 0 12px;">주식회사 비원미래 홈페이지 상담문의</h2>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:14px;">
      ${row('문의유형', d.inquiry)}
      ${row('기관명', d.org)}
      ${row('담당자명', d.manager)}
      ${row('연락처', d.contact)}
      ${row('이메일', d.email)}
      ${row('지역', d.region)}
      ${row('배출기관 유형', d.type)}
      ${row('문의내용', d.message)}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:12px;">이 메일은 비원미래 홈페이지 상담문의 폼에서 자동 발송되었습니다.</p>
  </div>`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  let body: ContactPayload
  try {
    body = (await req.json()) as ContactPayload
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  // honeypot: 값이 있으면 스팸 → 성공처럼 응답하되 실제 발송하지 않음
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return json({ ok: true }, 200)
  }

  const inquiry = (body.inquiry || '').trim()
  const org = (body.org || '').trim()
  const manager = (body.manager || '').trim()
  const contact = (body.contact || '').trim()
  const email = (body.email || '').trim()
  const region = (body.region || '').trim()
  const type = (body.type || '').trim()
  const message = (body.message || '').trim()

  // 필수값 검증
  if (!org || !manager || !contact || !email || !inquiry) {
    return json({ ok: false, error: 'missing_fields' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'invalid_email' }, 400)
  }
  // 개인정보 수집·이용 동의 필수
  if (body.agree !== true) {
    return json({ ok: false, error: 'consent_required' }, 400)
  }

  // 서버 전용 환경변수 (globalThis.process 로 접근 — Node 타입 의존/충돌 없이 사용)
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  const apiKey = env.RESEND_API_KEY
  const toEmail = env.CONTACT_TO_EMAIL
  const fromEmail = env.CONTACT_FROM_EMAIL
  if (!apiKey || !toEmail || !fromEmail) {
    return json({ ok: false, error: 'server_not_configured' }, 500)
  }

  const subject = `[비원미래 홈페이지 문의] ${org} - ${inquiry}`
  const html = renderEmail({ inquiry, org, manager, contact, email, region, type, message })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      return json({ ok: false, error: 'send_failed' }, 502)
    }
  } catch {
    return json({ ok: false, error: 'send_error' }, 502)
  }

  return json({ ok: true }, 200)
}
