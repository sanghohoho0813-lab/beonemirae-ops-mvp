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
import { More } from './pages/More'
import { DemoSummary } from './pages/DemoSummary'
import { MobilePreview } from './pages/MobilePreview'

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* 시연 전용 — Layout(사이드바/탭) 바깥의 독립 전체화면 라우트 */}
        <Route path="mobile-preview" element={<MobilePreview />} />

        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="today" element={<TodaySchedule />} />
          <Route path="dispatch" element={<Dispatch />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="collection" element={<CollectionInput />} />
          <Route path="materials" element={<Materials />} />
          <Route path="receivables" element={<Receivables />} />
          <Route path="stats" element={<Statistics />} />
          <Route path="more" element={<More />} />
          <Route path="demo" element={<DemoSummary />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </>
  )
}
