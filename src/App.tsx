import React, { useState, useEffect } from 'react';
import { CustomerApp } from './components/customer/CustomerApp';
import { AdminApp } from './components/admin/AdminApp';
import { WhatsAppOnlyLanding } from './components/customer/WhatsAppOnlyLanding';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export const App: React.FC = () => {
  const isWhatsAppOnlyTier = () => {
    return (
      (import.meta as any).env?.VITE_TURFFLOW_PRODUCT_TIER === 'whatsapp_only' ||
      window.location.search.includes('tier=whatsapp') ||
      window.location.hash.includes('tier=whatsapp')
    );
  };

  const checkIsAdminRoute = () => {
    return (
      window.location.search.includes('admin') ||
      window.location.hash.includes('admin') ||
      window.location.pathname.startsWith('/admin')
    );
  };

  const [view, setView] = useState<'customer' | 'admin'>(() => (checkIsAdminRoute() ? 'admin' : 'customer'));
  const [productTier, setProductTier] = useState<'full' | 'whatsapp_only'>(() => 
    isWhatsAppOnlyTier() ? 'whatsapp_only' : 'full'
  );

  useEffect(() => {
    const handleUrlChange = () => {
      if (checkIsAdminRoute()) {
        setView('admin');
      } else {
        setView('customer');
      }
      setProductTier(isWhatsAppOnlyTier() ? 'whatsapp_only' : 'full');
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
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
        ) : productTier === 'whatsapp_only' ? (
          <WhatsAppOnlyLanding onSwitchToAdmin={handleSwitchToAdmin} />
        ) : (
          <CustomerApp onSwitchToAdmin={handleSwitchToAdmin} />
        )}
      </div>
    </ErrorBoundary>
  );
};
