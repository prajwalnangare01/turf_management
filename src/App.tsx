import React, { useState, useEffect } from 'react';
import { CustomerApp } from './components/customer/CustomerApp';
import { AdminApp } from './components/admin/AdminApp';
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
  const checkIsAdminRoute = () => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('admin') === 'true' ||
      window.location.hash.includes('admin') ||
      window.location.pathname.startsWith('/admin')
    );
  };

  const [view, setView] = useState<'customer' | 'admin'>(() => (checkIsAdminRoute() ? 'admin' : 'customer'));

  useEffect(() => {
    // Initialize Supabase PostgreSQL Hydration & Realtime multi-channel sync
    SupabaseSyncService.init();

    const handleUrlChange = () => {
      if (checkIsAdminRoute()) {
        setView('admin');
      } else {
        setView('customer');
      }
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
    const query = currentParams.toString() ? `?${currentParams.toString()}` : window.location.pathname;
    window.history.pushState({}, '', query);
    setView('customer');
  };

  return (
    <ErrorBoundary>
      <div>
        {view === 'admin' ? (
          <AdminApp onSwitchToCustomer={handleSwitchToCustomer} />
        ) : (
          <CustomerApp onSwitchToAdmin={handleSwitchToAdmin} />
        )}
      </div>
    </ErrorBoundary>
  );
};
