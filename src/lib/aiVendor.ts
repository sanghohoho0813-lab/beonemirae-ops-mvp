/** 응답에 적힌 모델 이름으로 회사 이름 — 화면 표시용 (모르면 빈 글) · 0140/0141 */
export function aiVendor(model: string | null | undefined): string {
  const m = (model ?? '').toLowerCase()
  if (m.startsWith('gemini')) return 'Google Gemini'
  if (m.startsWith('claude')) return 'Anthropic Claude'
  if (m.startsWith('gpt') || /^o\d/.test(m)) return 'OpenAI'
  return ''
}

/** 「실제 AI 응답 · Google Gemini · 모델 … · 4.9초」 */
export function aiMetaLine(model: string | null | undefined, ms: number | null | undefined): string {
  const v = aiVendor(model)
  return ['실제 AI 응답', v, model ? `모델 ${model}` : '모델 이름 없음', ms != null ? `${(ms / 1000).toFixed(1)}초` : ''].filter(Boolean).join(' · ')
}
