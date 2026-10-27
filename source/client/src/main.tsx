import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './app/AuthContext'
import { SystemSocketProvider } from './app/SystemSocketContext'
import { PlacementProvider, usePlacement } from './app/PlacementContext'
import { RegistrationWelcomeProvider } from './app/RegistrationWelcomeContext'
import { ErrorState, Loading } from './components/States'
import { SupportChatWidget } from './components/SupportChat'
import './styles.css'
const PlacementPage = lazy(() => import('./pages/PlacementPage').then(module => ({ default: module.PlacementPage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then(module => ({ default: module.AuthPage })))
const AttemptPage = lazy(() => import('./pages/AttemptPage').then(module => ({ default: module.AttemptPage })))
const ResultRoute = lazy(() => import('./pages/AttemptPage').then(module => ({ default: module.ResultRoute })))
const Dashboard = lazy(() => import('./pages/LearningPages').then(module => ({ default: module.Dashboard })))
const LessonPage = lazy(() => import('./pages/LearningPages').then(module => ({ default: module.LessonPage })))
const PracticeSelect = lazy(() => import('./pages/LearningPages').then(module => ({ default: module.PracticeSelect })))
const Roadmap = lazy(() => import('./pages/RoadmapPage').then(module => ({ default: module.Roadmap })))
const Forbidden = lazy(() => import('./pages/OtherPages').then(module => ({ default: module.Forbidden })))
const NotFound = lazy(() => import('./pages/OtherPages').then(module => ({ default: module.NotFound })))
const ProfilePage = lazy(() => import('./pages/OtherPages').then(module => ({ default: module.ProfilePage })))
const ClassesPage = lazy(() => import('./pages/ClassroomPages').then(module => ({ default: module.ClassesPage })))
const ClassDetailPage = lazy(() => import('./pages/ClassroomPages').then(module => ({ default: module.ClassDetailPage })))
const ArenaPage = lazy(() => import('./pages/ArenaPage').then(module => ({ default: module.ArenaPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })))
const TeacherQuestionsPage = lazy(() => import('./pages/TeacherQuestionsPage').then(module => ({ default: module.TeacherQuestionsPage })))
const TeacherDashboardPage = lazy(() => import('./pages/TeacherDashboardPage').then(module => ({ default: module.TeacherDashboardPage })))
const TeacherCurriculumPage = lazy(() => import('./pages/TeacherCurriculumPage').then(module => ({ default: module.TeacherCurriculumPage })))

function Protected({ children, learnerOnly = false }: { children: React.ReactNode; learnerOnly?: boolean }) {
  const { user, loading } = useAuth()
  const placement=usePlacement()
  const location=useLocation()
  if(loading) return <Loading/>
  if(!user) return <Navigate to="/login" replace/>
  if(user.role==='ADMIN') return <Navigate to="/admin" replace/>
  if(learnerOnly && user.role!=='LEARNER') return <Navigate to="/teacher" replace/>
  if(user.role==='LEARNER'&&user.placementEligible&&location.pathname!=='/placement'){
    if(placement.loading)return <Loading/>
    if(placement.error)return <ErrorState message={placement.error} retry={placement.reload}/>
    if(placement.data?.required)return <Navigate to="/placement" replace/>
  }
  return <>{children}</>
}
function AppSupport(){
  const {user}=useAuth()
  const placement=usePlacement()
  const location=useLocation()
  if(location.pathname==='/placement'||(user?.role==='LEARNER'&&user.placementEligible&&(placement.loading||placement.error||placement.data?.required)))return null
  return <SupportChatWidget/>
}
function AdminOnly({children}:{children:React.ReactNode}) {
  const {user,loading}=useAuth()
  if(loading)return <Loading/>
  return user?.role==='ADMIN'?<>{children}</>:<Navigate to="/403" replace/>
}
function TeacherOnly({children}:{children:React.ReactNode}) {
  const {user,loading}=useAuth()
  if(loading)return <Loading/>
  if(user?.role==='ADMIN')return <Navigate to="/admin" replace/>
  return user?.role==='TEACHER'?<>{children}</>:<Navigate to="/403" replace/>
}
const home=(role?:string)=>role==='ADMIN'?'/admin':role==='TEACHER'?'/teacher':'/dashboard'
function AccountHome(){
  const {user,loading}=useAuth()
  const placement=usePlacement()
  if(loading)return <Loading/>
  if(!user)return <Navigate to="/login" replace/>
  if(user.role==='LEARNER'&&user.placementEligible){
    if(placement.loading)return <Loading/>
    if(placement.error)return <ErrorState message={placement.error} retry={placement.reload}/>
    return <Navigate to={placement.data?.required?'/placement':placement.data?.resumePath??'/roadmap'} replace/>
  }
  return <Navigate to={home(user.role)} replace/>
}
function AppRoutes() {
  const { user, loading } = useAuth()
  // Resolve the existing session before showing a login form or redirecting.
  if(loading)return <Loading/>
  return <Routes>
    <Route path="/" element={<AccountHome/>}/>
    <Route path="/login" element={user?<AccountHome/>:<AuthPage mode="login"/>}/>
    <Route path="/register" element={user?<AccountHome/>:<AuthPage mode="register"/>}/>
    <Route path="/placement" element={<Protected learnerOnly><PlacementPage/></Protected>}/>
    <Route path="/dashboard" element={<Protected learnerOnly><Dashboard/></Protected>}/>
    <Route path="/roadmap" element={<Protected learnerOnly><Roadmap/></Protected>}/>
    <Route path="/lessons/:id" element={<Protected learnerOnly><LessonPage/></Protected>}/>
    <Route path="/practice" element={<Protected learnerOnly><PracticeSelect/></Protected>}/>
    <Route path="/attempts/:id" element={<Protected learnerOnly><AttemptPage/></Protected>}/>
    <Route path="/attempts/:id/result" element={<Protected learnerOnly><ResultRoute/></Protected>}/>
    <Route path="/profile" element={<Protected><ProfilePage/></Protected>}/>
    <Route path="/arena" element={<Protected learnerOnly><ArenaPage/></Protected>}/>
    <Route path="/classes" element={<Protected><ClassesPage/></Protected>}/>
    <Route path="/classes/:id" element={<Protected><ClassDetailPage/></Protected>}/>
    <Route path="/admin" element={<AdminOnly><AdminPage/></AdminOnly>}/>
    <Route path="/system" element={<Navigate to="/admin" replace/>}/>
    <Route path="/admin/server-dashboard" element={<Navigate to="/admin" replace/>}/>
    <Route path="/teacher/questions" element={<TeacherOnly><TeacherQuestionsPage/></TeacherOnly>}/>
    <Route path="/teacher/curriculum" element={<TeacherOnly><TeacherCurriculumPage/></TeacherOnly>}/>
    <Route path="/teacher" element={<TeacherOnly><TeacherDashboardPage/></TeacherOnly>}/>
    <Route path="/403" element={<Protected><Forbidden/></Protected>}/>
    <Route path="*" element={<Protected><NotFound/></Protected>}/>
  </Routes>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><SystemSocketProvider><PlacementProvider><RegistrationWelcomeProvider><Suspense fallback={<Loading/>}><AppRoutes/><AppSupport/></Suspense></RegistrationWelcomeProvider></PlacementProvider></SystemSocketProvider></AuthProvider></BrowserRouter></React.StrictMode>)
