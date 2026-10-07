import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { WhatsAppSettingsView } from './components/WhatsAppSettingsView.tsx';
import { ContactsView } from './components/ContactsView.tsx';
import { TemplatesView } from './components/TemplatesView.tsx';
import { CreateAutomationView } from './components/CreateAutomationView.tsx';
import { ScheduledAutomationsView } from './components/ScheduledAutomationsView.tsx';
import { BirthdayView } from './components/BirthdayView.tsx';
import { DashboardData } from './types.ts';
import {
  LayoutDashboard,
  Settings,
  Users,
  FileText,
  PlusCircle,
  Clock,
  LogOut,
  MessageSquare,
  ShieldCheck,
  Cake,
} from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, loading: authLoading, logout, fetchWithAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [workerRunning, setWorkerRunning] = useState(false);

  const fetchDashboardStats = async (retries = 2) => {
    setLoadingStats(true);
    try {
      const res = await fetchWithAuth('/api/dashboard/stats');
      if (res.ok) {
        const ct = res.headers.get('content-type');
        if (ct && ct.includes('application/json')) {
          const data = await res.json();
          setDashboardData(data);
        }
      } else {
        console.warn('Dashboard stats returned non-ok status:', res.status);
      }
    } catch (err: any) {
      if (retries > 0) {
        setTimeout(() => fetchDashboardStats(retries - 1), 800);
      } else {
        console.warn('Notice loading dashboard statistics (will retry on next refresh):', err?.message || err);
      }
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboardStats();
    }
  }, [user]);

  const handleRunWorkerNow = async (options?: { forceAll?: boolean; simulate?: boolean }) => {
    setWorkerRunning(true);
    try {
      const res = await fetchWithAuth('/api/automations/worker/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });
      const data = await res.json();
      await fetchDashboardStats();
      return data;
    } catch (err: any) {
      console.error('Error running worker:', err);
      return { success: false, error: err?.message || 'Failed to run worker' };
    } finally {
      setWorkerRunning(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono">Initializing WhatsApp Business System...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'birthdays', label: 'Birthday Automation', icon: Cake },
    { id: 'automations', label: 'Scheduled Messages', icon: Clock },
    { id: 'create', label: 'Create Automation', icon: PlusCircle },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'settings', label: 'WhatsApp Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Navigation Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-white tracking-tight text-sm sm:text-base">
                GreetSync
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                Official Meta Cloud API
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-white">{user.displayName || 'Administrator'}</div>
              <div className="text-[11px] text-slate-400 font-mono truncate max-w-[160px]">{user.email}</div>
            </div>
            <button
              id="header-logout-button"
              onClick={logout}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Secondary Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto no-scrollbar gap-1 border-t border-slate-800/50">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 py-3 px-3.5 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-emerald-500 text-white font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            data={dashboardData}
            loading={loadingStats}
            onRefresh={fetchDashboardStats}
            onNavigate={(tab) => setActiveTab(tab)}
            onRunWorkerNow={handleRunWorkerNow}
            workerRunning={workerRunning}
          />
        )}

        {activeTab === 'birthdays' && <BirthdayView />}

        {activeTab === 'settings' && (
          <WhatsAppSettingsView
            onSettingsUpdated={() => {
              fetchDashboardStats();
            }}
          />
        )}

        {activeTab === 'contacts' && <ContactsView />}

        {activeTab === 'templates' && <TemplatesView />}

        {activeTab === 'create' && (
          <CreateAutomationView
            onAutomationCreated={() => {
              fetchDashboardStats();
            }}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'automations' && (
          <ScheduledAutomationsView
            onRunWorkerNow={handleRunWorkerNow}
            workerRunning={workerRunning}
            onNavigate={(tab) => setActiveTab(tab)}
            isAccountConfigured={Boolean(dashboardData?.connection?.configured)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        Official Meta WhatsApp Business Cloud API &bull; PostgreSQL &bull; Production Job Queue
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
