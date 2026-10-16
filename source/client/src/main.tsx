import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './app/AuthContext'
import { Loading } from './components/States'
import { AuthPage } from './pages/AuthPage'
import { AttemptPage, ResultRoute } from './pages/AttemptPage'
import { Dashboard, LessonPage, PracticeSelect } from './pages/LearningPages'
import { Roadmap } from './pages/RoadmapPage'
import { Forbidden, NotFound, ProfilePage } from './pages/OtherPages'
import { ClassesPage, ClassDetailPage } from './pages/ClassroomPages'
import { ArenaPage } from './pages/ArenaPage'
import { AdminPage } from './pages/AdminPage'
import { TeacherQuestionsPage } from './pages/TeacherQuestionsPage'
import { TeacherDashboardPage } from './pages/TeacherDashboardPage'
import { TeacherCurriculumPage } from './pages/TeacherCurriculumPage'
import './styles.css'

function Protected({ children, learnerOnly = false }: { children: React.ReactNode; learnerOnly?: boolean }) {
  const { user, loading } = useAuth()
  if(loading) return <Loading/>
  if(!user) return <Navigate to="/login" replace/>
  if(user.role==='ADMIN') return <Navigate to="/admin" replace/>
  if(learnerOnly && user.role!=='LEARNER') return <Navigate to="/teacher" replace/>
  return <>{children}</>
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
function AppRoutes() {
  const { user } = useAuth()
  return <Routes>
    <Route path="/" element={<Navigate to={user?home(user.role):'/login'} replace/>}/>
    <Route path="/login" element={user?<Navigate to={home(user.role)} replace/>:<AuthPage mode="login"/>}/>
    <Route path="/register" element={user?<Navigate to={home(user.role)} replace/>:<AuthPage mode="register"/>}/>
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
    <Route path="/teacher/questions" element={<TeacherOnly><TeacherQuestionsPage/></TeacherOnly>}/>
    <Route path="/teacher/curriculum" element={<TeacherOnly><TeacherCurriculumPage/></TeacherOnly>}/>
    <Route path="/teacher" element={<TeacherOnly><TeacherDashboardPage/></TeacherOnly>}/>
    <Route path="/403" element={<Protected><Forbidden/></Protected>}/>
    <Route path="*" element={<Protected><NotFound/></Protected>}/>
  </Routes>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><AppRoutes/></AuthProvider></BrowserRouter></React.StrictMode>)
