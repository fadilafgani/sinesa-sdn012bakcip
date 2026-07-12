import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Login } from '@/features/auth/pages/login';
import { AdminDashboard } from '@/features/admin/pages/dashboard';
import { TeacherDashboard } from '@/features/teacher/pages/dashboard';
import { QuizEditor } from '@/features/quiz/pages/quiz-editor';
import { HostSession } from '@/features/session/pages/host-session';
import { Analytics } from '@/features/teacher/pages/analytics';
import { StudentDashboard } from '@/features/student/pages/dashboard';
import { PlaySession } from '@/features/session/pages/play-session';
import { ProtectedRoute } from '@/app/router/protected-route';

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
