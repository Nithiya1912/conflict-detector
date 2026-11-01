import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PageSkeleton, ToastProvider } from './components/ui'
import AppLayout from './layouts/AppLayout'
import { AuthProvider, useAuth } from './lib/auth'

const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Cases = lazy(() => import('./pages/Cases'))
const CaseDetail = lazy(() => import('./pages/CaseDetail'))
const Notes = lazy(() => import('./pages/Notes'))
const Analysis = lazy(() => import('./pages/Analysis'))
const ConflictDetail = lazy(() => import('./pages/ConflictDetail'))
const DietPlans = lazy(() => import('./pages/DietPlans'))
const DietPlanDetail = lazy(() => import('./pages/DietPlanDetail'))
const Medications = lazy(() => import('./pages/Medications'))
const KnowledgeGraph = lazy(() => import('./pages/KnowledgeGraph'))
const Guidelines = lazy(() => import('./pages/Guidelines'))
const Validation = lazy(() => import('./pages/Validation'))
const TestSessions = lazy(() => import('./pages/TestSessions'))
const TestSessionDetail = lazy(() => import('./pages/TestSessionDetail'))
const Evaluation = lazy(() => import('./pages/Evaluation'))
const Reports = lazy(() => import('./pages/Reports'))
const ReportView = lazy(() => import('./pages/ReportView'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const SettingsPage = lazy(() => import('./pages/Settings'))

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="p-8"><PageSkeleton /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/app" element={<Protected><AppLayout /></Protected>}>
                <Route index element={<Dashboard />} />
                <Route path="cases" element={<Cases />} />
                <Route path="cases/:id" element={<CaseDetail />} />
                <Route path="notes" element={<Notes />} />
                <Route path="analysis" element={<Analysis />} />
                <Route path="conflicts/:id" element={<ConflictDetail />} />
                <Route path="diet-plans" element={<DietPlans />} />
                <Route path="diet-plans/:id" element={<DietPlanDetail />} />
                <Route path="medications" element={<Medications />} />
                <Route path="graph" element={<KnowledgeGraph />} />
                <Route path="guidelines" element={<Guidelines />} />
                <Route path="validation" element={<Validation />} />
                <Route path="tests" element={<TestSessions />} />
                <Route path="tests/:id" element={<TestSessionDetail />} />
                <Route path="evaluation" element={<Evaluation />} />
                <Route path="reports" element={<Reports />} />
                <Route path="reports/:id" element={<ReportView />} />
                <Route path="audit" element={<AuditLogs />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
