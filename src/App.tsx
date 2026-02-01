import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar, MobileNav } from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Playground from './pages/Playground';
import Personalities from './pages/Personalities';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import MemoryPage from './pages/Memory';
import Tools from './pages/Tools';
import Login from './pages/Login';
import IntegrationsPage from './pages/Integrations';
import FileStorage from './pages/FileStorage';
import AdminPage from './pages/Admin';
import { Toaster } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar className="hidden md:flex" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav className="md:hidden" />
        <main className="flex-1 overflow-y-auto relative">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/files" element={<FileStorage />} />
            <Route path="/personalities" element={<Personalities />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
