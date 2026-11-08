import React, { useState, useEffect } from 'react';
import { CustomerApp } from './components/customer/CustomerApp';
import { AdminApp } from './components/admin/AdminApp';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ReminderScheduler } from './services/reminderScheduler';

export const App: React.FC = () => {
  const checkIsAdminRoute = () => {
    return (
      window.location.search.includes('admin') ||
      window.location.hash.includes('admin') ||
      window.location.pathname.startsWith('/admin')
    );
  };

  const [view, setView] = useState<'customer' | 'admin'>(() => (checkIsAdminRoute() ? 'admin' : 'customer'));

  useEffect(() => {
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
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('admin', 'true');
    window.history.pushState({}, '', `?${currentParams.toString()}`);
    setView('admin');
  };

  const handleSwitchToCustomer = () => {
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
