import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router'
import { useSettings, effectiveTextSize } from './lib/settings.js'
import PatientLayout from './components/PatientLayout.jsx'
import Home from './pages/Home.jsx'
import Register from './pages/Register.jsx'
import SlipPage from './pages/Slip.jsx'
import MyTurn from './pages/MyTurn.jsx'
import HaveSlip from './pages/HaveSlip.jsx'
import FindPlace from './pages/FindPlace.jsx'
import Emergency from './pages/Emergency.jsx'
import Settings from './pages/Settings.jsx'

// Staff screens, the board and the forecast load only when opened, so a
// patient's phone downloads less on a weak connection.
const Plan = lazy(() => import('./pages/Plan.jsx'))
const CheckIn = lazy(() => import('./pages/CheckIn.jsx'))
const Ask = lazy(() => import('./pages/Ask.jsx'))
const Stage = lazy(() => import('./pages/Stage.jsx'))
const Board = lazy(() => import('./pages/Board.jsx'))
const StaffLayout = lazy(() => import('./pages/staff/StaffLayout.jsx'))
const Dashboard = lazy(() => import('./pages/staff/Dashboard.jsx'))
const Counter = lazy(() => import('./pages/staff/Counter.jsx'))
const Forecast = lazy(() => import('./pages/staff/Forecast.jsx'))
const Login = lazy(() => import('./pages/staff/Login.jsx'))
const Accounts = lazy(() => import('./pages/staff/Accounts.jsx'))
const Activity = lazy(() => import('./pages/staff/Activity.jsx'))
const Payments = lazy(() => import('./pages/staff/Payments.jsx'))
const Claims = lazy(() => import('./pages/staff/Claims.jsx'))
const EmergencyDesk = lazy(() => import('./pages/staff/EmergencyDesk.jsx'))

export default function App() {
  const [settings] = useSettings()
  const { pathname } = useLocation()
  const patient = !pathname.startsWith('/staff') && !pathname.startsWith('/board')

  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('hc', settings.contrast)
    html.classList.toggle('staff', pathname.startsWith('/staff'))
    html.classList.remove('ts-1', 'ts-2')
    const size = patient ? effectiveTextSize(settings) : 0
    if (size) html.classList.add(`ts-${size}`)
    if (patient) {
      html.lang = settings.lang || 'en'
      document.title = 'OPD Saathi'
    }
  }, [settings, patient, pathname])

  return (
    <Suspense fallback={<p className="p-6 text-lg">…</p>}>
      <Routes>
      <Route element={<PatientLayout />}>
        <Route index element={<Home />} />
        <Route path="register" element={<Register />} />
        <Route path="slip/:token" element={<SlipPage />} />
        <Route path="turn/:token" element={<MyTurn />} />
        <Route path="have-slip" element={<HaveSlip />} />
        <Route path="find" element={<FindPlace />} />
        <Route path="emergency" element={<Emergency />} />
        <Route path="settings" element={<Settings />} />
        <Route path="plan" element={<Plan />} />
        <Route path="checkin" element={<CheckIn />} />
        <Route path="ask" element={<Ask />} />
      </Route>
      <Route path="staff/login" element={<Login />} />
      <Route path="stage" element={<Stage />} />
      <Route path="staff" element={<StaffLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="counter" element={<Counter />} />
        <Route path="forecast" element={<Forecast />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="activity" element={<Activity />} />
        <Route path="payments" element={<Payments />} />
        <Route path="claims" element={<Claims />} />
        <Route path="emergency" element={<EmergencyDesk />} />
      </Route>
      <Route path="board" element={<Board />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
