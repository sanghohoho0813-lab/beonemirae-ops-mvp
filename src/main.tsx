import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { DataProvider } from './context/DataContext'
import { SettingsProvider } from './context/SettingsContext'
import { AuthProvider } from './context/AuthContext'
import { TourProvider } from './context/TourContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// AuthProvider 가 DataProvider 보다 바깥에 있어야, 데이터 레이어가 로그인 상태와
// 역할에 따라 서버(Supabase) / 로컬(시연) 중 어디를 볼지 결정할 수 있습니다.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/*  바깥 한 겹 — 껍데기까지 터져도 흰 화면 대신 사람이 읽을 수 있는 것이 남습니다. */}
    <ErrorBoundary scope="app">
      <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <DataProvider>
            <TourProvider>
              <App />
            </TourProvider>
          </DataProvider>
        </SettingsProvider>
      </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
