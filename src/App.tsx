import React, { useState } from 'react';
import { CustomerApp } from './components/customer/CustomerApp';
import { AdminApp } from './components/admin/AdminApp';

export const App: React.FC = () => {
  const [view, setView] = useState<'customer' | 'admin'>('customer');

  return (
    <div>
      {view === 'customer' ? (
        <CustomerApp onSwitchToAdmin={() => setView('admin')} />
      ) : (
        <AdminApp onSwitchToCustomer={() => setView('customer')} />
      )}
    </div>
  );
};
