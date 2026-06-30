import { Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/ScrollToTop'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { TodaySchedule } from './pages/TodaySchedule'
import { Clients } from './pages/Clients'
import { CollectionInput } from './pages/CollectionInput'
import { Materials } from './pages/Materials'
import { Receivables } from './pages/Receivables'
import { Statistics } from './pages/Statistics'
import { More } from './pages/More'

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="today" element={<TodaySchedule />} />
        <Route path="clients" element={<Clients />} />
        <Route path="collection" element={<CollectionInput />} />
        <Route path="materials" element={<Materials />} />
        <Route path="receivables" element={<Receivables />} />
        <Route path="stats" element={<Statistics />} />
        <Route path="more" element={<More />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
      </Routes>
    </>
  )
}
