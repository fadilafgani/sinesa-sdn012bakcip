import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Login } from '@/features/auth/pages/login';
import { ProtectedRoute } from '@/app/router/protected-route';
import { LoadingSkeleton } from '@/shared/components/loading-skeleton';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { OfflineDetector } from '@/shared/components/offline-detector';

const AdminDashboard = lazy(() => import('@/features/admin/pages/dashboard').then(m => ({ default: m.AdminDashboard })));
const TeacherDashboard = lazy(() => import('@/features/teacher/pages/dashboard').then(m => ({ default: m.TeacherDashboard })));
const QuizEditor = lazy(() => import('@/features/quiz/pages/quiz-editor').then(m => ({ default: m.QuizEditor })));
const HostSession = lazy(() => import('@/features/session/pages/host-session').then(m => ({ default: m.HostSession })));
const Analytics = lazy(() => import('@/features/teacher/pages/analytics').then(m => ({ default: m.Analytics })));
const StudentDashboard = lazy(() => import('@/features/student/pages/dashboard').then(m => ({ default: m.StudentDashboard })));
const PlaySession = lazy(() => import('@/features/session/pages/play-session').then(m => ({ default: m.PlaySession })));

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
    <ErrorBoundary>
      <OfflineDetector />
      <BrowserRouter>
        <Suspense fallback={<LoadingSkeleton />}>
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
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
