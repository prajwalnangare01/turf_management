import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, BookingStatus, BookingSource } from '../../types/schema';
import { Search, Filter, CheckCircle, XCircle, UserX, FileText } from 'lucide-react';

interface BookingListViewProps {
  currentAdmin: AdminUser;
}

export const BookingListView: React.FC<BookingListViewProps> = ({ currentAdmin }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const bookings = store.getBookings();
  const customers = store.getCustomers();
  const courts = store.getCourts();

  const filteredBookings = bookings.filter(b => {
    const cust = customers.find(c => c.id === b.customer_id);
    const matchesSearch =
      b.booking_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cust?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cust?.phone.includes(searchQuery);

    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || b.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesSource;
  });

  const handleUpdateStatus = (bookingId: string, status: BookingStatus) => {
    const res = PostgresEngine.updateBookingStatus(bookingId, status);
    if (res.success) {
      AuditLogger.log(currentAdmin.id, `UPDATE_STATUS_${status}`, 'Booking', bookingId);
      // force update
      setSearchQuery(q => q);
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="bg-[#131b2e] p-4 rounded-xl border border-[#24304f] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Booking Ref, Customer Name or Phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-field py-1.5"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="input-field py-1.5"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-Show</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="input-field py-1.5"
          >
            <option value="all">All Sources</option>
            <option value="online">Online</option>
            <option value="offline_walkin">Walk-in</option>
            <option value="offline_phone">Phone Call</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#131b2e] border border-[#24304f] rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0b0f19] border-b border-[#24304f] text-gray-400 font-semibold uppercase tracking-wider">
            <tr>
              <th className="p-3">Ref #</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Court</th>
              <th className="p-3">Date & Time</th>
              <th className="p-3">Source</th>
              <th className="p-3">Status</th>
              <th className="p-3">Amount</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#24304f]/60">
            {filteredBookings.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400">
                  No bookings found matching filters.
                </td>
              </tr>
            ) : (
              filteredBookings.map(b => {
                const cust = customers.find(c => c.id === b.customer_id);
                const court = courts.find(c => c.id === b.court_id);

                return (
                  <tr key={b.id} className="hover:bg-[#1a253e]/40">
                    <td className="p-3 font-mono font-bold text-emerald-400">{b.booking_ref}</td>
                    <td className="p-3">
                      <div className="font-bold text-white">{cust?.name || 'Unknown'}</div>
                      <div className="text-[10px] text-gray-400">+91 {cust?.phone}</div>
                    </td>
                    <td className="p-3 font-medium text-gray-200">{court?.name}</td>
                    <td className="p-3 font-mono">
                      <div>{b.booking_date}</div>
                      <div className="text-[11px] text-emerald-400">{b.start_time} - {b.end_time}</div>
                    </td>
                    <td className="p-3">
                      <span className={`badge ${b.source === 'online' ? 'badge-online' : 'badge-offline'}`}>
                        {b.source}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`badge ${
                        b.status === 'confirmed' ? 'badge-available' :
                        b.status === 'completed' ? 'badge-offline' :
                        b.status === 'no_show' ? 'badge-blocked' : 'badge-online'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-white">₹{b.total_amount}</td>
                    <td className="p-3 text-right space-x-1">
                      {b.status === 'confirmed' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(b.id, 'completed')}
                            title="Mark Completed"
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(b.id, 'no_show')}
                            title="Mark No-Show"
                            className="p-1 text-amber-400 hover:text-amber-300"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(b.id, 'cancelled')}
                            title="Cancel Booking"
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
