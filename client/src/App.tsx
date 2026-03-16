import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';

// Lazy-loaded pages for better initial bundle size
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage'));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
const PipelinePage = lazy(() => import('./pages/PipelinePage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const NumbersPage = lazy(() => import('./pages/NumbersPage'));
const AutomationPage = lazy(() => import('./pages/AutomationPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const TwilioAccountPage = lazy(() => import('./pages/TwilioAccountPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, initialized, checkAuth } = useAuthStore();

  useEffect(() => {
    if (!initialized) {
      checkAuth();
    }
  }, [initialized, checkAuth]);

  if (isLoading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-scl-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-scl-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { resolved } = useThemeStore();
  const isDark = resolved === 'dark';

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="campaigns" element={<CampaignsPage />} />
                        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
                        <Route path="inbox" element={<InboxPage />} />
                        <Route path="pipeline" element={<PipelinePage />} />
                        <Route path="leads" element={<LeadsPage />} />
                        <Route path="numbers" element={<NumbersPage />} />
                        <Route path="automation" element={<AutomationPage />} />
                        <Route path="analytics" element={<AnalyticsPage />} />
                        <Route path="twilio" element={<TwilioAccountPage />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </Suspense>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: isDark ? '#1c1c27' : '#ffffff',
              color: isDark ? '#e2e2ea' : '#1e293b',
              border: isDark ? '1px solid rgba(56, 56, 76, 0.5)' : '1px solid rgba(226, 232, 240, 0.8)',
              borderRadius: '12px',
              fontSize: '14px',
              boxShadow: isDark ? undefined : '0 4px 12px rgba(0, 0, 0, 0.08)',
            },
            success: {
              iconTheme: { primary: '#6366f1', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#fff' },
            },
          }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
