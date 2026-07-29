import React, { useState, useEffect } from 'react';
import { CustomerApp } from './components/customer/CustomerApp';
import { AdminApp } from './components/admin/AdminApp';

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
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  const handleSwitchToAdmin = () => {
    window.history.pushState({}, '', '?admin=true');
    setView('admin');
  };

  const handleSwitchToCustomer = () => {
    window.history.pushState({}, '', window.location.pathname);
    setView('customer');
  };

  return (
    <div>
      {view === 'customer' ? (
        <CustomerApp onSwitchToAdmin={handleSwitchToAdmin} />
      ) : (
        <AdminApp onSwitchToCustomer={handleSwitchToCustomer} />
      )}
    </div>
  );
};
