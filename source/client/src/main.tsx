import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './app/AuthContext'
import { DailyQuestsProvider } from './app/DailyQuestsContext'
import { SystemSocketProvider } from './app/SystemSocketContext'
import { PlacementProvider, usePlacement } from './app/PlacementContext'
import { RegistrationWelcomeProvider } from './app/RegistrationWelcomeContext'
import { PlacementPage } from './pages/PlacementPage'
import { ErrorState, Loading } from './components/States'
import { AuthPage } from './pages/AuthPage'
import { AttemptPage, ResultRoute } from './pages/AttemptPage'
import { Dashboard, LessonPage, PracticeSelect } from './pages/LearningPages'
import { QuestsPage } from './pages/QuestsPage'
import { Roadmap } from './pages/RoadmapPage'
import { Forbidden, NotFound, ProfilePage } from './pages/OtherPages'
import { ClassesPage, ClassDetailPage } from './pages/ClassroomPages'
import { ArenaPage } from './pages/ArenaPage'
import { AdminPage } from './pages/AdminPage'
import { TeacherQuestionsPage } from './pages/TeacherQuestionsPage'
import { TeacherDashboardPage } from './pages/TeacherDashboardPage'
import { TeacherCurriculumPage } from './pages/TeacherCurriculumPage'
import { SupportChatWidget } from './components/SupportChat'
import './styles.css'
import './readability.css'
import './ui-refresh.css'

function Protected({
  children,
  learnerOnly = false,
}: {
  children: React.ReactNode
  learnerOnly?: boolean
}) {
  const { user, loading } = useAuth()
  const placement = usePlacement()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />
  if (learnerOnly && user.role !== 'LEARNER') return <Navigate to="/teacher" replace />
  if (user.role === 'LEARNER' && user.placementEligible && location.pathname !== '/placement') {
    if (placement.loading) return <Loading />
    if (placement.error) return <ErrorState message={placement.error} retry={placement.reload} />
    if (placement.data?.required) return <Navigate to="/placement" replace />
  }
  return <>{children}</>
}
function AppSupport() {
  const { user } = useAuth()
  const placement = usePlacement()
  const location = useLocation()
  if (
    location.pathname === '/placement' ||
    (user?.role === 'LEARNER' &&
      user.placementEligible &&
      (placement.loading || placement.error || placement.data?.required))
  )
    return null
  return <SupportChatWidget />
}
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  return user?.role === 'ADMIN' ? <>{children}</> : <Navigate to="/403" replace />
}
function TeacherOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />
  return user?.role === 'TEACHER' ? <>{children}</> : <Navigate to="/403" replace />
}
const home = (role?: string) =>
  role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/dashboard'
function AccountHome() {
  const { user, loading } = useAuth()
  const placement = usePlacement()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'LEARNER' && user.placementEligible) {
    if (placement.loading) return <Loading />
    if (placement.error) return <ErrorState message={placement.error} retry={placement.reload} />
    return (
      <Navigate
        to={placement.data?.required ? '/placement' : (placement.data?.resumePath ?? '/roadmap')}
        replace
      />
    )
  }
  return <Navigate to={home(user.role)} replace />
}
function AppRoutes() {
  const { user, loading } = useAuth()
  // Resolve the existing session before showing a login form or redirecting.
  if (loading) return <Loading />
  return (
    <Routes>
      <Route path="/" element={<AccountHome />} />
      <Route path="/login" element={user ? <AccountHome /> : <AuthPage mode="login" />} />
      <Route path="/register" element={user ? <AccountHome /> : <AuthPage mode="register" />} />
      <Route
        path="/placement"
        element={
          <Protected learnerOnly>
            <PlacementPage />
          </Protected>
        }
      />
      <Route
        path="/dashboard"
        element={
          <Protected learnerOnly>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/quests"
        element={
          <Protected learnerOnly>
            <QuestsPage />
          </Protected>
        }
      />
      <Route
        path="/roadmap"
        element={
          <Protected learnerOnly>
            <Roadmap />
          </Protected>
        }
      />
      <Route
        path="/lessons/:id"
        element={
          <Protected learnerOnly>
            <LessonPage />
          </Protected>
        }
      />
      <Route
        path="/practice"
        element={
          <Protected learnerOnly>
            <PracticeSelect />
          </Protected>
        }
      />
      <Route
        path="/attempts/:id"
        element={
          <Protected learnerOnly>
            <AttemptPage />
          </Protected>
        }
      />
      <Route
        path="/attempts/:id/result"
        element={
          <Protected learnerOnly>
            <ResultRoute />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <ProfilePage />
          </Protected>
        }
      />
      <Route
        path="/arena"
        element={
          <Protected learnerOnly>
            <ArenaPage />
          </Protected>
        }
      />
      <Route
        path="/classes"
        element={
          <Protected>
            <ClassesPage />
          </Protected>
        }
      />
      <Route
        path="/classes/:id"
        element={
          <Protected>
            <ClassDetailPage />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminOnly>
            <AdminPage />
          </AdminOnly>
        }
      />
      <Route path="/system" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/server-dashboard" element={<Navigate to="/admin" replace />} />
      <Route
        path="/teacher/questions"
        element={
          <TeacherOnly>
            <TeacherQuestionsPage />
          </TeacherOnly>
        }
      />
      <Route
        path="/teacher/curriculum"
        element={
          <TeacherOnly>
            <TeacherCurriculumPage />
          </TeacherOnly>
        }
      />
      <Route
        path="/teacher"
        element={
          <TeacherOnly>
            <TeacherDashboardPage />
          </TeacherOnly>
        }
      />
      <Route
        path="/403"
        element={
          <Protected>
            <Forbidden />
          </Protected>
        }
      />
      <Route
        path="*"
        element={
          <Protected>
            <NotFound />
          </Protected>
        }
      />
    </Routes>
  )
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DailyQuestsProvider>
          <SystemSocketProvider>
            <PlacementProvider>
              <RegistrationWelcomeProvider>
                <AppRoutes />
                <AppSupport />
              </RegistrationWelcomeProvider>
            </PlacementProvider>
          </SystemSocketProvider>
        </DailyQuestsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
