import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/auth/LoginPage'
import ProfileSelectPage from './pages/auth/ProfileSelectPage'
import RootLayout from './components/layout/RootLayout'
import AdminLayout from './components/layout/AdminLayout'
import BarberLayout from './components/layout/BarberLayout'

import RootDashboard from './pages/root/RootDashboard'
import TenantForm from './pages/root/TenantForm'

import AdminDashboard from './pages/admin/AdminDashboard'
import BarbersPage from './pages/admin/BarbersPage'
import ConfigPage from './pages/admin/ConfigPage'
import SalesPage from './pages/admin/SalesPage'
import DraftsPage from './pages/admin/DraftsPage'
import DayClosingPage from './pages/admin/DayClosingPage'
import StatsPage from './pages/admin/StatsPage'

import BarberDraftPage from './pages/barber/BarberDraftPage'
import BarberHistoryPage from './pages/barber/BarberHistoryPage'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-100">
      <div className="flex flex-col items-center gap-3">
        <span className="font-display text-3xl text-gold tracking-tight">Momentum</span>
        <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )
}

function RequireRoot({ children }) {
  const { session, isRoot, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!isRoot) return <Navigate to="/select" replace />
  return children
}

function RequireAdminOrBarber({ children }) {
  const { session, isAdmin, isBarber, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin && !isBarber) return <Navigate to="/select" replace />
  return children
}

function RequireBarber({ children }) {
  const { session, isBarber, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!isBarber) return <Navigate to="/select" replace />
  return children
}

export default function App() {
  const { session, isRoot, isAdmin, isBarber, loading } = useAuth()
  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/login" element={
        session
          ? isRoot ? <Navigate to="/root" replace />
          : <Navigate to="/select" replace />
          : <LoginPage />
      } />

      <Route path="/select" element={
        session ? <ProfileSelectPage /> : <Navigate to="/login" replace />
      } />

      {/* ROOT */}
      <Route path="/root" element={<RequireRoot><RootLayout /></RequireRoot>}>
        <Route index element={<RootDashboard />} />
        <Route path="tenant/new" element={<TenantForm />} />
        <Route path="tenant/:id/edit" element={<TenantForm />} />
      </Route>

      {/* ADMIN */}
      <Route path="/admin" element={<RequireAdminOrBarber><AdminLayout /></RequireAdminOrBarber>}>
        <Route index element={<AdminDashboard />} />
        <Route path="barbers" element={<BarbersPage />} />
        <Route path="config" element={<ConfigPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="drafts" element={<DraftsPage />} />
        <Route path="closing" element={<DayClosingPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>

      {/* BARBER */}
      <Route path="/barber" element={<RequireBarber><BarberLayout /></RequireBarber>}>
        <Route index element={<BarberDraftPage />} />
        <Route path="history" element={<BarberHistoryPage />} />
      </Route>

      <Route path="/" element={
        !session ? <Navigate to="/login" replace />
          : isRoot ? <Navigate to="/root" replace />
          : isBarber ? <Navigate to="/barber" replace />
          : isAdmin ? <Navigate to="/admin" replace />
          : <Navigate to="/select" replace />
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
