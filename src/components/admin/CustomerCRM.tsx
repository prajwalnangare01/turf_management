import React, { useState } from 'react';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, Customer } from '../../types/schema';
import { ConfirmModal } from '../common/ConfirmModal';
import { Users, Search, Phone, ShieldAlert, ShieldCheck, ShoppingBag, DollarSign, AlertCircle } from 'lucide-react';

interface CustomerCRMProps {
  currentAdmin: AdminUser;
}

export const CustomerCRM: React.FC<CustomerCRMProps> = ({ currentAdmin }) => {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>(() => store.getCustomers());

  // Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'success' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const closeConfirm = () => setConfirmState(prev => ({ ...prev, isOpen: false }));

  const filtered = customers.filter(
    c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const executeToggleBlacklist = (customer: Customer) => {
    const nextState = !customer.is_blacklisted;
    const updated = customers.map(c => {
      if (c.id === customer.id) {
        AuditLogger.log(
          currentAdmin.id,
          nextState ? 'BLACKLIST_CUSTOMER' : 'UNBLACKLIST_CUSTOMER',
          'Customer',
          customer.id
        );
        return { ...c, is_blacklisted: nextState };
      }
      return c;
    });

    store.setCustomers(updated);
    setCustomers(updated);
    closeConfirm();
  };

  const handleToggleBlacklist = (customer: Customer) => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can toggle customer blacklist status.');
      return;
    }

    const isBlacklisting = !customer.is_blacklisted;

    setConfirmState({
      isOpen: true,
      title: isBlacklisting ? `Blacklist Customer: ${customer.name}` : `Unblock Customer: ${customer.name}`,
      message: isBlacklisting
        ? `Are you sure you want to blacklist "${customer.name}" (+91 ${customer.phone})? Blacklisted customers are automatically blocked from reserving slots.`
        : `Remove blacklist flag for "${customer.name}" (+91 ${customer.phone}) and restore full booking privileges?`,
      confirmText: isBlacklisting ? 'Yes, Blacklist Customer' : 'Yes, Restore Privileges',
      variant: isBlacklisting ? 'danger' : 'success',
      onConfirm: () => executeToggleBlacklist(customer)
    });
  };

  return (
    <div className="space-y-4 text-on-surface">
      {/* Search Header Bar */}
      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
          <Users className="w-5 h-5 text-primary shrink-0" /> Customer CRM & Blacklist Controls
        </h2>
        <div className="flex items-center gap-2 w-full sm:w-auto sm:max-w-xs">
          <Search className="w-4 h-4 text-primary shrink-0" />
          <input
            type="text"
            placeholder="Search name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input py-1.5 text-xs font-medium w-full"
          />
        </div>
      </div>

      {/* MOBILE CARD VIEW (Displayed on screens < 640px) */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {filtered.length === 0 ? (
          <div className="bg-white p-6 rounded-xl text-center text-on-surface-variant font-medium text-xs border border-outline-variant/40">
            No customers found matching search filter.
          </div>
        ) : (
          filtered.map(c => (
            <div
              key={c.id}
              className={`bg-white rounded-2xl p-4 border shadow-xs space-y-3 ${
                c.is_blacklisted ? 'border-red-300 bg-red-50/30' : 'border-outline-variant/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-headline font-bold text-base text-on-surface">{c.name}</h3>
                  <a
                    href={`tel:${c.phone}`}
                    className="text-xs text-primary font-mono font-medium flex items-center gap-1 mt-0.5"
                  >
                    <Phone className="w-3.5 h-3.5" /> +91 {c.phone}
                  </a>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-headline font-bold text-[10px] uppercase ${
                    c.is_blacklisted
                      ? 'bg-red-100 text-red-900 border border-red-300'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}
                >
                  {c.is_blacklisted ? 'Blacklisted' : 'Active'}
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-2.5 rounded-xl text-center border border-outline-variant/30 text-xs">
                <div>
                  <span className="text-[10px] text-on-surface-variant font-headline font-bold uppercase block">Bookings</span>
                  <span className="font-bold text-on-surface">{c.total_bookings}</span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant font-headline font-bold uppercase block">No-Shows</span>
                  <span className={`font-bold ${c.no_show_count > 0 ? 'text-red-600' : 'text-on-surface-variant'}`}>
                    {c.no_show_count}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleToggleBlacklist(c)}
                className={`w-full py-2 rounded-xl text-xs font-headline font-bold flex items-center justify-center gap-1.5 transition ${
                  c.is_blacklisted
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    : 'bg-red-50 text-red-800 border border-red-200 hover:bg-red-100'
                }`}
              >
                {c.is_blacklisted ? (
                  <>
                    <ShieldCheck className="w-4 h-4" /> Unblock & Restore Access
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-red-600" /> Blacklist Customer
                  </>
                )}
              </button>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP / TABLET DATA TABLE (Displayed on screens >= 640px) */}
      <div className="hidden sm:block bg-white border border-outline-variant/40 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-left text-xs min-w-[600px]">
          <thead className="bg-surface-container-low border-b border-outline-variant/40 font-headline font-bold text-on-surface-variant uppercase tracking-wider">
            <tr>
              <th className="p-3">Customer Name</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Bookings</th>
              <th className="p-3">No-Shows</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                  No customers found matching search filter.
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr key={c.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="p-3 font-headline font-bold text-on-surface">{c.name}</td>
                  <td className="p-3 font-mono font-medium text-on-surface-variant">
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-primary">
                      <Phone className="w-3 h-3 text-primary shrink-0" /> +91 {c.phone}
                    </a>
                  </td>
                  <td className="p-3 font-bold text-on-surface">{c.total_bookings}</td>
                  <td className="p-3">
                    <span className={`font-bold ${c.no_show_count > 0 ? 'text-red-600' : 'text-on-surface-variant'}`}>
                      {c.no_show_count}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2.5 py-0.5 rounded-full font-headline font-bold text-[10px] uppercase ${
                      c.is_blacklisted ? 'bg-red-100 text-red-900 border border-red-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    }`}>
                      {c.is_blacklisted ? 'Blacklisted' : 'Active'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleToggleBlacklist(c)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        c.is_blacklisted
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-red-50 text-red-800 border border-red-200 hover:bg-red-100'
                      }`}
                    >
                      {c.is_blacklisted ? 'Unblock Customer' : 'Blacklist Customer'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
};
