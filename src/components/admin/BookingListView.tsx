import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, BookingStatus, Booking } from '../../types/schema';
import { ConfirmModal } from '../common/ConfirmModal';
import { formatTimeRange12h } from '../../utils/formatters';
import { Search, Filter, CheckCircle, XCircle, UserX, Calendar, ArrowUpDown, X, Clock, MapPin, Tag } from 'lucide-react';

interface BookingListViewProps {
  currentAdmin: AdminUser;
}

export const BookingListView: React.FC<BookingListViewProps> = ({ currentAdmin }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');

  // Reusable Confirm Modal State
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

  const bookings = store.getBookings();
  const customers = store.getCustomers();
  const courts = store.getCourts();

  const filteredBookings = bookings
    .filter(b => {
      const cust = customers.find(c => c.id === b.customer_id);
      const otpCode = b.booking_ref.slice(-4);
      const matchesSearch =
        b.booking_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
        otpCode.includes(searchQuery) ||
        cust?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cust?.phone.includes(searchQuery);

      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesSource = sourceFilter === 'all' || b.source === sourceFilter;
      const matchesDate = !dateFilter || b.booking_date === dateFilter;

      return matchesSearch && matchesStatus && matchesSource && matchesDate;
    })
    .sort((a, b) => {
      const timeA = new Date(`${a.booking_date}T${a.start_time}:00`).getTime();
      const timeB = new Date(`${b.booking_date}T${b.start_time}:00`).getTime();

      if (sortOrder === 'latest') {
        return timeB - timeA;
      } else {
        return timeA - timeB;
      }
    });

  const requestStatusUpdate = (b: Booking, targetStatus: BookingStatus) => {
    const cust = customers.find(c => c.id === b.customer_id);
    const actionLabel =
      targetStatus === 'completed' ? 'Mark Completed (Checked-In)' :
      targetStatus === 'no_show' ? 'Mark No-Show' : 'Cancel Reservation';

    setConfirmState({
      isOpen: true,
      title: `${actionLabel}: ${b.booking_ref}`,
      message: `Update reservation for "${cust?.name || 'Customer'}" (${b.booking_date} | ${formatTimeRange12h(b.start_time, b.end_time)}) to status "${targetStatus.toUpperCase()}"?`,
      confirmText: actionLabel,
      variant: targetStatus === 'cancelled' ? 'danger' : targetStatus === 'no_show' ? 'warning' : 'success',
      onConfirm: () => {
        const res = PostgresEngine.updateBookingStatus(b.id, targetStatus);
        if (res.success) {
          AuditLogger.log(currentAdmin.id, `UPDATE_BOOKING_${targetStatus.toUpperCase()}`, 'Booking', b.id);
          closeConfirm();
          window.location.reload();
        } else {
          alert(res.message);
        }
      }
    });
  };

  return (
    <div className="space-y-4 text-on-surface">
      {/* Header & Filter Controls Bar */}
      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary shrink-0" /> Bookings Audit Directory
          </h2>
          <span className="text-xs text-on-surface-variant font-bold bg-white px-3 py-1 rounded-full border border-outline-variant/40">
            {filteredBookings.length} Record{filteredBookings.length !== 1 ? 's' : ''} Found
          </span>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-primary absolute left-3 top-2.5 shrink-0" />
            <input
              type="text"
              placeholder="Search Ref, Gate OTP, Name, Phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input pl-9 py-1.5 text-xs font-medium w-full"
            />
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-outline-variant/40">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-on-surface focus:outline-none w-full"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-on-surface-variant hover:text-red-600 p-0.5"
                title="Clear date filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-primary shrink-0 hidden lg:block" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="form-input py-1.5 font-headline font-bold text-xs w-full"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-Show</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="form-input py-1.5 text-xs font-medium w-full"
          >
            <option value="all">All Sources</option>
            <option value="online">Online</option>
            <option value="offline_walkin">Walk-in</option>
            <option value="offline_phone">Phone Call</option>
          </select>
        </div>
      </div>

      {/* MOBILE CARDS VIEW (Displayed on screens < 768px) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filteredBookings.length === 0 ? (
          <div className="bg-white p-6 rounded-xl text-center text-on-surface-variant font-medium text-xs border border-outline-variant/40">
            No bookings found matching filters.
          </div>
        ) : (
          filteredBookings.map(b => {
            const cust = customers.find(c => c.id === b.customer_id);
            const court = courts.find(c => c.id === b.court_id);
            const otpCode = b.booking_ref.slice(-4);

            return (
              <div
                key={b.id}
                className="bg-white rounded-2xl p-4 border border-outline-variant/50 shadow-xs space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-xs text-primary">{b.booking_ref}</span>
                      <span className="bg-secondary-container/40 text-on-secondary-container border border-secondary-container/60 px-1.5 py-0.5 rounded text-[10px] font-black tracking-widest">
                        OTP: {otpCode}
                      </span>
                    </div>
                    <h3 className="font-headline font-bold text-base text-on-surface mt-1">{cust?.name || 'Unknown'}</h3>
                    <p className="text-xs text-on-surface-variant font-mono">+91 {cust?.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-headline font-extrabold text-lg text-primary">₹{b.total_amount}</p>
                    <span className={`px-2 py-0.5 rounded-full font-headline font-bold text-[9px] uppercase block mt-0.5 ${
                      b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                      b.status === 'pending_payment' ? 'bg-sky-100 text-sky-900 border border-sky-300' :
                      b.status === 'completed' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-900'
                    }`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Session Details */}
                <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/30 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-medium">Court:</span>
                    <strong className="text-on-surface font-bold">{court?.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-medium">Date & Slot:</span>
                    <strong className="text-primary font-bold">{b.booking_date} ({formatTimeRange12h(b.start_time, b.end_time)})</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-medium">Channel Source:</span>
                    <span className="font-headline uppercase text-[10px] font-bold text-secondary">{b.source.replace('_', ' ')}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                {b.status === 'confirmed' && (
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      onClick={() => requestStatusUpdate(b, 'completed')}
                      className="px-2 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-[10px] hover:bg-emerald-100 flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Complete
                    </button>
                    <button
                      onClick={() => requestStatusUpdate(b, 'no_show')}
                      className="px-2 py-1.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-bold text-[10px] hover:bg-amber-100 flex items-center justify-center gap-1"
                    >
                      <UserX className="w-3.5 h-3.5" /> No-Show
                    </button>
                    <button
                      onClick={() => requestStatusUpdate(b, 'cancelled')}
                      className="px-2 py-1.5 bg-red-50 text-red-800 border border-red-200 rounded-lg font-bold text-[10px] hover:bg-red-100 flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP DATA TABLE (Displayed on screens >= 768px) */}
      <div className="hidden md:block bg-white border border-outline-variant/40 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-left text-xs min-w-[750px]">
          <thead className="bg-surface-container-low border-b border-outline-variant/40 font-headline font-bold text-on-surface-variant uppercase tracking-wider">
            <tr>
              <th className="p-3">Ref & Gate OTP</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Court</th>
              <th className="p-3">Date & Time</th>
              <th className="p-3">Source</th>
              <th className="p-3">Status</th>
              <th className="p-3">Amount</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {filteredBookings.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-on-surface-variant font-medium">
                  No bookings found matching filters.
                </td>
              </tr>
            ) : (
              filteredBookings.map(b => {
                const cust = customers.find(c => c.id === b.customer_id);
                const court = courts.find(c => c.id === b.court_id);
                const otpCode = b.booking_ref.slice(-4);

                return (
                  <tr key={b.id} className="hover:bg-surface-container-low/50">
                    <td className="p-3 font-mono">
                      <div className="font-bold text-primary text-xs">{b.booking_ref}</div>
                      <span className="inline-block bg-secondary-container/40 text-on-secondary-container border border-secondary-container/60 px-1.5 py-0.5 rounded text-[10px] font-black tracking-widest mt-0.5 shadow-2xs">
                        OTP: {otpCode}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-headline font-bold text-on-surface">{cust?.name || 'Unknown'}</div>
                      <div className="text-[10px] text-on-surface-variant">+91 {cust?.phone}</div>
                    </td>
                    <td className="p-3 font-semibold text-on-surface">{court?.name}</td>
                    <td className="p-3 font-mono">
                      <div>{b.booking_date}</div>
                      <div className="text-[11px] text-primary font-bold">{formatTimeRange12h(b.start_time, b.end_time)}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full font-headline font-bold text-[10px] uppercase ${
                        b.source === 'online' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        {b.source}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-0.5 rounded-full font-headline font-bold text-[10px] uppercase ${
                        b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                        b.status === 'pending_payment' ? 'bg-sky-100 text-sky-900 border border-sky-300 animate-pulse font-extrabold' :
                        b.status === 'completed' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-900'
                      }`}>
                        {b.status === 'pending_payment' ? 'Pending Payment' : b.status}
                      </span>
                    </td>
                    <td className="p-3 font-headline font-extrabold text-on-surface">₹{b.total_amount}</td>
                    <td className="p-3 text-right">
                      {b.status === 'confirmed' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => requestStatusUpdate(b, 'completed')}
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-[10px] hover:bg-emerald-100 flex items-center gap-1 transition-colors shadow-2xs"
                            title="Mark as Checked-in & Played"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-700" /> Complete
                          </button>

                          <button
                            onClick={() => requestStatusUpdate(b, 'no_show')}
                            className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-bold text-[10px] hover:bg-amber-100 flex items-center gap-1 transition-colors shadow-2xs"
                            title="Mark Customer as No-Show"
                          >
                            <UserX className="w-3.5 h-3.5 text-amber-700" /> No-Show
                          </button>

                          <button
                            onClick={() => requestStatusUpdate(b, 'cancelled')}
                            className="px-2 py-1 bg-red-50 text-red-800 border border-red-200 rounded-lg font-bold text-[10px] hover:bg-red-100 flex items-center gap-1 transition-colors shadow-2xs"
                            title="Cancel Reservation"
                          >
                            <XCircle className="w-3.5 h-3.5 text-red-700" /> Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-on-surface-variant font-medium italic">No action</span>
                      )}
                    </td>
                  </tr>
                );
              })
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
