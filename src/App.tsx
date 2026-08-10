import { Navigate, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/ScrollToTop'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { TodaySchedule } from './pages/TodaySchedule'
import { Dispatch } from './pages/Dispatch'
import { Clients } from './pages/Clients'
import { ClientDetail } from './pages/ClientDetail'
import { CollectionInput } from './pages/CollectionInput'
import { Materials } from './pages/Materials'
import { Receivables } from './pages/Receivables'
import { Statistics } from './pages/Statistics'
import { Reports } from './pages/Reports'
import { More } from './pages/More'
import { Settings } from './pages/Settings'
import { Purpose } from './pages/Purpose'
import { Performance } from './pages/Performance'
import { DemoSummary } from './pages/DemoSummary'
import { Roadmap } from './pages/Roadmap'
import { CollectionHistory } from './pages/CollectionHistory'
import { Presentation } from './pages/Presentation'
import { MobilePreview } from './pages/MobilePreview'
import { CompanyHomePage } from './pages/CompanyHomePage'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { AuditLog } from './pages/AuditLog'
import { Requests } from './pages/Requests'
import { PortalLayout } from './components/PortalLayout'
import { PortalHome } from './pages/PortalHome'
import { PortalReport } from './pages/PortalReport'
import { PortalHistory } from './pages/PortalHistory'
import { RequireAuth } from './components/RequireAuth'
import { TourOverlay } from './components/TourOverlay'

export default function App() {
  return (
    <>
      <ScrollToTop />
      {/* 제품 투어 — 어느 화면에서든 실행되고, 단계마다 필요한 화면으로 이동합니다 */}
      <TourOverlay />
      <Routes>
        {/* 시연 전용 — Layout(사이드바/탭) 바깥의 독립 전체화면 라우트 */}
        <Route path="mobile-preview" element={<MobilePreview />} />
        {/* 공개용 회사 홈페이지 — Layout 바깥의 독립 전체화면 라우트 */}
        <Route path="company" element={<CompanyHomePage />} />
        {/* 로그인 — Layout 바깥의 독립 전체화면 라우트 */}
        <Route path="login" element={<Login />} />
        <Route path="reset-password" element={<ResetPassword />} />

        {/* 병원 고객 포털 — 내부 운영 레이아웃과 완전히 분리된 단순 화면 */}
        <Route
          path="portal"
          element={
            <RequireAuth>
              <PortalLayout />
            </RequireAuth>
          }
        >
          <Route index element={<PortalHome />} />
          <Route path="report" element={<PortalReport />} />
          <Route path="history" element={<PortalHistory />} />
        </Route>

        {/* 아래 모든 운영 화면은 로그인 + 역할 확인을 거칩니다.
            (Supabase 미설정 시에는 기존 시연 모드로 그대로 동작) */}
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="today" element={<TodaySchedule />} />
          <Route path="dispatch" element={<Dispatch />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="history" element={<CollectionHistory />} />
          <Route path="collection" element={<CollectionInput />} />
          <Route path="requests" element={<Requests />} />
          <Route path="materials" element={<Materials />} />
          <Route path="receivables" element={<Receivables />} />
          <Route path="stats" element={<Statistics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="more" element={<More />} />
          <Route path="settings" element={<Settings />} />
          <Route path="why" element={<Purpose />} />
          <Route path="performance" element={<Performance />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="demo" element={<DemoSummary />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="presentation" element={<Presentation />} />
          {/*
            없는 주소로 들어왔을 때 대시보드를 그려 주고 있었습니다. 그런데
            역할 확인은 '아는 주소' 에만 걸려 있어서(access.ts 는 목록에 없는
            경로를 허용으로 봅니다), 현장 담당자가 주소창에 아무 글자나 넣으면
            대시보드가 그대로 열렸습니다 — 매출·미수금·경영지표가 있는,
            현장에는 열지 않기로 한 바로 그 화면입니다. 실제로 재현했습니다.
            (/settlement · /aaa-none 등 모두 열렸습니다)

            없는 주소는 각자의 첫 업무 화면으로 보냅니다. '/' 는 RequireAuth 가
            역할별로 갈라 주므로, 현장은 오늘 일정으로 갑니다.
          */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}
