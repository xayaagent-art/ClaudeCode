import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Positions from './pages/Positions'
import PositionDetail from './pages/PositionDetail'
import LogTrade from './pages/LogTrade'
import Scan from './pages/Scan'
import Analytics from './pages/Analytics'

export default function App() {
  const { user, authLoading } = useAuth()

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-rh-bg">
        <div className="text-center">
          <div className="text-3xl font-bold mb-2">
            <span className="text-rh-green">θ</span>Wheel
          </div>
          <p className="text-rh-subtext text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/positions" element={<Positions />} />
        <Route path="/positions/:id" element={<PositionDetail />} />
        <Route path="/log" element={<LogTrade />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
