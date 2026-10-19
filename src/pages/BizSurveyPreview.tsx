import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SurveyRunner } from '../components/bizSurvey/SurveyRunner'
import { BIZ_SURVEY_ENABLED, RESPONDENT_KEYS, type Answers, type Respondent } from '../lib/bizSurvey'

// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 사전 설문 — 관리자 미리보기 (/survey-preview/ceo · director) · 0144
//
//  대표님 · 이사님이 보시는 화면 그대로를 미리 눌러 봅니다. 서버에는 **아무것도
//  저장하지 않습니다** — 고른 것은 이 화면을 닫으면 사라집니다.
// ─────────────────────────────────────────────────────────────────────────────

export function BizSurveyPreview() {
  const { who: raw = 'ceo' } = useParams()
  const who: Respondent = (RESPONDENT_KEYS as string[]).includes(raw) ? (raw as Respondent) : 'ceo'
  const { role } = useAuth()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState<Answers>({})
  const [submitted, setSubmitted] = useState(false)

  if (!BIZ_SURVEY_ENABLED || role !== 'admin') {
    return <p className="p-8 text-center text-[1.05rem] font-bold text-navy-500">설문 미리보기는 관리자만 볼 수 있습니다.</p>
  }
  return (
    <SurveyRunner
      who={who}
      answers={answers}
      status={submitted ? 'submitted' : 'draft'}
      updatedAt={null}
      submittedAt={null}
      onChange={setAnswers}
      onSubmit={async () => setSubmitted(true)}
      preview
      onExit={() => navigate('/dev-requests?tab=survey')}
    />
  )
}
