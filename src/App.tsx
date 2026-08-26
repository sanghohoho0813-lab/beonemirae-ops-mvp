import { Navigate, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/ScrollToTop'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { TodaySchedule } from './pages/TodaySchedule'
import { Dispatch } from './pages/Dispatch'
import { SchedulePlan } from './pages/SchedulePlan'
import { BankMatch } from './pages/BankMatch'
import { MonthClose } from './pages/MonthClose'
import { PricingAudit } from './pages/PricingAudit'
import { Revenue } from './pages/Revenue'
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
import { Signup } from './pages/Signup'
import { ResetPassword } from './pages/ResetPassword'
import { AuditLog } from './pages/AuditLog'
import { Users } from './pages/Users'
import { DevRequests } from './pages/DevRequests'
import { ImportExcel } from './pages/ImportExcel'
import { Requests } from './pages/Requests'
import { CustomerInsight } from './pages/CustomerInsight'
import { PortalLayout } from './components/PortalLayout'
import { PortalHome } from './pages/PortalHome'
import { PortalReport } from './pages/PortalReport'
import { PortalSupplies } from './pages/PortalSupplies'
import { PortalBilling } from './pages/PortalBilling'
import { PortalSupport } from './pages/PortalSupport'
import { Supplies } from './pages/Supplies'
import { PortalHistory } from './pages/PortalHistory'
import { PortalSelect } from './pages/PortalSelect'
import { RequireAuth } from './components/RequireAuth'
import { TourOverlay } from './components/TourOverlay'

export default function App() {
  return (
    <>
      <ScrollToTop />
      {/* 제품 투어 — 어느 화면에서든 실행되고, 단계마다 필요한 화면으로 이동합니다 */}
      <TourOverlay />
      <Routes>
        {/*
          시연 전용 — Layout(사이드바/탭) 바깥의 독립 전체화면 라우트.

          로그인 밖에 두었더니 주소만 알면 누구나 열 수 있었습니다. 안쪽
          폰 프레임은 로그인 화면을 띄우므로 데이터가 새지는 않았지만,
          로그인하지 않은 사람에게 회사 내부 화면이 하나 열려 있는 것은
          맞지 않습니다. 다른 내부 주소와 같은 자리에 둡니다.
        */}
        <Route
          path="mobile-preview"
          element={
            <RequireAuth>
              <MobilePreview />
            </RequireAuth>
          }
        />
        {/* 공개용 회사 홈페이지 — Layout 바깥의 독립 전체화면 라우트 */}
        <Route path="company" element={<CompanyHomePage />} />
        {/* 로그인 — Layout 바깥의 독립 전체화면 라우트 */}
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="reset-password" element={<ResetPassword />} />

        {/*  ── 병원 고객 포털 ─────────────────────────────────────────────────
             내부 운영 레이아웃과 완전히 분리된 단순 화면입니다.

             ⚠ 0088 — **길이 둘입니다.**

               /portal/...          병원 계정. 자기 병원 하나뿐이라 id 가
                                    주소에 없습니다 — 고를 것이 없으니
                                    보여 줄 이유도 없습니다.
               /portal/c/<id>/...   직원이 그 병원 화면을 확인할 때.

             ⚠ 병원 id 가 **경로 안**에 있는 것이 핵심입니다. 0085 에서는
               `?client=<id>` 였는데, 메뉴 단추가 물음표 뒤를 안 달고 있어서
               한 번 누르면 어느 병원인지 사라졌습니다(대표님 신고).
               경로에 있으면 메뉴를 눌러도, 새로고침해도, 뒤로가기를 해도
               안 지워집니다.

             ⚠ `c` 한 글자가 있어야 `/portal/report` 의 `report` 를 병원 id 로
               잘못 읽지 않습니다. */}
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
          <Route path="supplies" element={<PortalSupplies />} />
          {/*  0083 — 정산 확인 · 문의(티켓). 병원이 전화로 물어보던 두 가지입니다. */}
          <Route path="billing" element={<PortalBilling />} />
          <Route path="support" element={<PortalSupport />} />
          {/*  직원이 병원을 고르는 화면 (0088). **일반 메뉴 이동으로는 여기
               오지 않습니다** — 「병원 변경」을 눌렀을 때만 옵니다. */}
          <Route path="select" element={<PortalSelect />} />
        </Route>
        <Route
          path="portal/c/:clientId"
          element={
            <RequireAuth>
              <PortalLayout />
            </RequireAuth>
          }
        >
          <Route index element={<PortalHome />} />
          <Route path="report" element={<PortalReport />} />
          <Route path="history" element={<PortalHistory />} />
          <Route path="supplies" element={<PortalSupplies />} />
          <Route path="billing" element={<PortalBilling />} />
          <Route path="support" element={<PortalSupport />} />
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
          <Route path="plan" element={<SchedulePlan />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="history" element={<CollectionHistory />} />
          <Route path="collection" element={<CollectionInput />} />
          <Route path="requests" element={<Requests />} />
          {/*  0083 — 거래처 인사이트 (규칙 기반 건강도 · 다음 조치) */}
          <Route path="insight" element={<CustomerInsight />} />
          <Route path="materials" element={<Materials />} />
          <Route path="receivables" element={<Receivables />} />
          <Route path="billing" element={<MonthClose />} />
          <Route path="pricing" element={<PricingAudit />} />
          <Route path="revenue" element={<Revenue />} />
          <Route path="supplies" element={<Supplies />} />
          <Route path="bank" element={<BankMatch />} />
          <Route path="stats" element={<Statistics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="more" element={<More />} />
          <Route path="settings" element={<Settings />} />
          <Route path="why" element={<Purpose />} />
          <Route path="performance" element={<Performance />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="users" element={<Users />} />
          <Route path="dev-requests" element={<DevRequests />} />
          <Route path="import" element={<ImportExcel />} />
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
