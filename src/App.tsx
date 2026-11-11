import React, { useState, useEffect } from 'react';
import { CustomerApp } from './components/customer/CustomerApp';
import { AdminApp } from './components/admin/AdminApp';
import { NotFoundPage } from './components/common/NotFoundPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ReminderScheduler } from './services/reminderScheduler';
import { SupabaseSyncService } from './services/supabaseSyncService';
import { RedisLockService } from './services/redisLockService';
import { store } from './services/store';

if (typeof window !== 'undefined') {
  (window as any).__turfflow_redis = RedisLockService;
  (window as any).__turfflow_store = store;
}

export const App: React.FC = () => {
  const checkRoute = (): 'customer' | 'admin' | '404' => {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    const hash = window.location.hash;

    // Explicit 404 requests
    if (pathname === '/404' || params.get('page') === '404' || params.get('error') === '404') {
      return '404';
    }

    // Admin portal routes
    if (
      params.get('admin') === 'true' ||
      hash.includes('admin') ||
      pathname.startsWith('/admin')
    ) {
      return 'admin';
    }

    // Known customer paths
    const validPaths = ['/', '/booking', '/policies', '/profile', '/turf'];
    if (validPaths.includes(pathname)) {
      return 'customer';
    }

    // Unrecognized routes trigger 404
    return '404';
  };

  const [view, setView] = useState<'customer' | 'admin' | '404'>(() => checkRoute());

  useEffect(() => {
    // Initialize Supabase PostgreSQL Hydration & Realtime multi-channel sync
    SupabaseSyncService.init();

    const handleUrlChange = () => {
      setView(checkRoute());
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    // Initialize automated 1-hour matchday reminder background checker
    ReminderScheduler.start(60000);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
      ReminderScheduler.stop();
    };
  }, []);

  const handleSwitchToAdmin = () => {
    try { sessionStorage.removeItem('turfflow_active_view'); } catch {}
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('admin', 'true');
    window.history.pushState({}, '', `?${currentParams.toString()}`);
    setView('admin');
  };

  const handleSwitchToCustomer = () => {
    try { sessionStorage.removeItem('turfflow_active_view'); } catch {}
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.delete('admin');
    const query = currentParams.toString() ? `?${currentParams.toString()}` : '/';
    window.history.pushState({}, '', query);
    setView('customer');
  };

  const handleGoHome = () => {
    try { sessionStorage.removeItem('turfflow_active_view'); } catch {}
    window.history.pushState({}, '', '/');
    setView('customer');
  };

  return (
    <ErrorBoundary>
      <div>
        {view === 'admin' ? (
          <AdminApp onSwitchToCustomer={handleSwitchToCustomer} />
        ) : view === '404' ? (
          <NotFoundPage
            onNavigateHome={handleGoHome}
            onSwitchToAdmin={handleSwitchToAdmin}
          />
        ) : (
          <CustomerApp onSwitchToAdmin={handleSwitchToAdmin} />
        )}
      </div>
    </ErrorBoundary>
  );
};
