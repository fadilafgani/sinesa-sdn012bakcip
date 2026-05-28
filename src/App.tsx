import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth-store';
import { Login } from './pages/auth/login';
import { AdminDashboard } from './pages/admin/dashboard';
import { TeacherDashboard } from './pages/teacher/dashboard';
import { QuizEditor } from './pages/teacher/quiz-editor';
import { HostSession } from './pages/teacher/host-session';
import { Analytics } from './pages/teacher/analytics';
import { StudentDashboard } from './pages/student/dashboard';
import { PlaySession } from './pages/student/play-session';
import { ProtectedRoute } from './components/protected-route';

function App() {
  const { initialize, loading } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-mesh">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm font-medium text-muted-foreground">Memulai SINESA...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Auth Route */}
        <Route path="/login" element={<Login />} />

        {/* Admin Protected Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Teacher Protected Routes */}
        <Route
          path="/teacher/dashboard"
          element={
            <ProtectedRoute allowedRoles={['teacher', 'admin']}>
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/quiz-editor"
          element={
            <ProtectedRoute allowedRoles={['teacher', 'admin']}>
              <QuizEditor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/host-session"
          element={
            <ProtectedRoute allowedRoles={['teacher', 'admin']}>
              <HostSession />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/analytics"
          element={
            <ProtectedRoute allowedRoles={['teacher', 'admin']}>
              <Analytics />
            </ProtectedRoute>
          }
        />

        {/* Student Protected Routes */}
        <Route
          path="/student/dashboard"
          element={
            <ProtectedRoute allowedRoles={['student', 'admin']}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/play-session"
          element={
            <ProtectedRoute allowedRoles={['student', 'admin']}>
              <PlaySession />
            </ProtectedRoute>
          }
        />

        {/* Fallbacks */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
