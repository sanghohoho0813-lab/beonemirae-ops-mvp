import { Route, Routes } from 'react-router-dom'
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

export default function App() {
  return (
    <>
      <ScrollToTop />
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
          <Route path="performance" element={<Performance />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="demo" element={<DemoSummary />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="presentation" element={<Presentation />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </>
  )
}
