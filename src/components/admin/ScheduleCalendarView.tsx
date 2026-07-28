import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { SlotEngine } from '../../services/slotEngine';
import { Booking, AdminUser, DynamicSlot, Court } from '../../types/schema';
import { OfflineBookingModal } from './OfflineBookingModal';
import { Calendar, ChevronLeft, ChevronRight, Plus, UserCheck, XCircle, CheckCircle, Clock, Info, ShieldAlert } from 'lucide-react';

interface ScheduleCalendarViewProps {
  currentAdmin: AdminUser;
}

export const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({ currentAdmin }) => {
  const courts = store.getCourts();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Selected cell for offline booking modal
  const [offlineModalSlot, setOfflineModalSlot] = useState<{ courtId: string; date: string; time: string } | null>(null);

  // Detail drawer for selected booking
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Generate 1-hour time slots from 06:00 to 23:00
  const timeRows = Array.from({ length: 17 }, (_, i) => {
    const h = (6 + i).toString().padStart(2, '0');
    return `${h}:00`;
  });

  const handleUpdateStatus = (bookingId: string, status: 'completed' | 'no_show' | 'cancelled') => {
    const res = PostgresEngine.updateBookingStatus(bookingId, status);
    if (res.success) {
      AuditLogger.log(currentAdmin.id, `UPDATE_BOOKING_STATUS_${status.toUpperCase()}`, 'Booking', bookingId);
      setSelectedBooking(null);
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Calendar Bar */}
      <div className="flex items-center justify-between bg-[#131b2e] p-3 rounded-xl border border-[#24304f]">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <h2 className="font-bold text-white text-sm">Schedule Matrix View</h2>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="btn btn-secondary p-1.5">
            <ChevronLeft className="w-4 h-4" />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-[#0f172a] border border-[#24304f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg outline-none"
          />

          <button onClick={() => changeDate(1)} className="btn btn-secondary p-1.5">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Online</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Offline</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span> Blocked</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Free</span>
        </div>
      </div>

      {/* Grid Table */}
      <div className="bg-[#131b2e] border border-[#24304f] rounded-xl overflow-x-auto shadow-xl">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-[#0b0f19] border-b border-[#24304f] text-xs font-semibold text-gray-400">
              <th className="p-3 w-24 text-center border-r border-[#24304f]">Time</th>
              {courts.map(court => (
                <th key={court.id} className="p-3 border-r border-[#24304f] last:border-r-0">
                  <div className="font-bold text-white text-sm">{court.name}</div>
                  <div className="text-[10px] text-emerald-400 font-normal">₹{court.base_price_per_hour}/hr</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeRows.map(timeStr => (
              <tr key={timeStr} className="border-b border-[#24304f]/60 hover:bg-[#1a253e]/40">
                {/* Time Column */}
                <td className="p-3 text-xs font-mono font-bold text-gray-400 bg-[#0f172a] text-center border-r border-[#24304f]">
                  {timeStr}
                </td>

                {/* Courts Columns */}
                {courts.map(court => {
                  const slots = SlotEngine.computeSlotsForCourt(court, selectedDate);
                  const slot = slots.find(s => s.start_time === timeStr);

                  if (!slot) {
                    return <td key={court.id} className="p-2 border-r border-[#24304f] bg-[#0b0f19]/40"></td>;
                  }

                  const b = slot.existing_booking;

                  return (
                    <td
                      key={court.id}
                      className="p-1.5 border-r border-[#24304f] last:border-r-0 align-top"
                    >
                      {slot.status === 'available' && (
                        <button
                          onClick={() => setOfflineModalSlot({ courtId: court.id, date: selectedDate, time: timeStr })}
                          className="w-full h-14 rounded-lg border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-400 text-xs font-medium flex flex-col items-center justify-center gap-1 transition-all group"
                        >
                          <span className="text-[10px] opacity-75">Available (₹{slot.price})</span>
                          <span className="text-[11px] font-bold opacity-0 group-hover:opacity-100 flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Book Offline
                          </span>
                        </button>
                      )}

                      {slot.status === 'booked_online' && b && (
                        <div
                          onClick={() => setSelectedBooking(b)}
                          className="w-full h-14 p-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 cursor-pointer hover:border-red-400 transition-all flex flex-col justify-between"
                        >
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="bg-red-950 px-1 rounded text-red-200">ONLINE</span>
                            <span className="font-mono">{b.booking_ref.split('-')[2]}</span>
                          </div>
                          <div className="text-xs font-bold truncate text-white">
                            {store.getCustomers().find(c => c.id === b.customer_id)?.name || 'Online Customer'}
                          </div>
                        </div>
                      )}

                      {slot.status === 'booked_offline' && b && (
                        <div
                          onClick={() => setSelectedBooking(b)}
                          className="w-full h-14 p-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 cursor-pointer hover:border-amber-400 transition-all flex flex-col justify-between"
                        >
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="bg-amber-950 px-1 rounded text-amber-200">OFFLINE</span>
                            <span className="font-mono">{b.booking_ref.split('-')[2]}</span>
                          </div>
                          <div className="text-xs font-bold truncate text-white">
                            {store.getCustomers().find(c => c.id === b.customer_id)?.name || 'Walk-in'}
                          </div>
                        </div>
                      )}

                      {slot.status === 'blocked' && (
                        <div className="w-full h-14 rounded-lg bg-[#1e293b] border border-slate-700 text-gray-400 text-[10px] font-medium flex items-center justify-center p-2 text-center">
                          🔒 {slot.blocked_reason}
                        </div>
                      )}

                      {slot.status === 'locked' && (
                        <div className="w-full h-14 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[10px] font-medium flex items-center justify-center p-2 text-center animate-pulse">
                          ⏱️ Customer Checking Out
                        </div>
                      )}

                      {slot.status === 'past' && (
                        <div className="w-full h-14 rounded-lg bg-gray-900/40 text-gray-600 text-[10px] flex items-center justify-center">
                          Passed
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Booking Detail Drawer Modal */}
      {selectedBooking && (
        <div className="modal-backdrop">
          <div className="bg-[#131b2e] border border-[#24304f] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#24304f] pb-3">
              <h3 className="font-bold text-lg text-white">Booking Details</h3>
              <span className="font-mono text-xs text-emerald-400 font-semibold">{selectedBooking.booking_ref}</span>
            </div>

            <div className="bg-[#0f172a] p-4 rounded-xl space-y-2 text-xs">
              <p className="text-gray-300">Customer: <strong className="text-white">{store.getCustomers().find(c => c.id === selectedBooking.customer_id)?.name}</strong></p>
              <p className="text-gray-300">Phone: <strong className="text-white">+91 {store.getCustomers().find(c => c.id === selectedBooking.customer_id)?.phone}</strong></p>
              <p className="text-gray-300">Court: <strong className="text-white">{store.getCourts().find(c => c.id === selectedBooking.court_id)?.name}</strong></p>
              <p className="text-gray-300">Date & Time: <strong className="text-emerald-400">{selectedBooking.booking_date} | {selectedBooking.start_time} - {selectedBooking.end_time}</strong></p>
              <p className="text-gray-300">Source: <strong className="text-amber-400 uppercase">{selectedBooking.source}</strong></p>
              <p className="text-gray-300">Status: <strong className="text-emerald-400 uppercase">{selectedBooking.status}</strong></p>
              <p className="text-gray-300">Amount Paid: <strong className="text-white text-sm">₹{selectedBooking.total_amount}</strong></p>
              {selectedBooking.notes && <p className="text-gray-400 italic">Notes: {selectedBooking.notes}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400">Update Booking Status:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedBooking.id, 'completed')}
                  className="btn btn-primary text-xs flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedBooking.id, 'no_show')}
                  className="btn btn-secondary text-xs text-amber-400 border-amber-500/30 flex items-center justify-center gap-1"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" /> Mark No-Show
                </button>
              </div>
              <button
                onClick={() => handleUpdateStatus(selectedBooking.id, 'cancelled')}
                className="btn btn-danger w-full text-xs flex items-center justify-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel Booking
              </button>
            </div>

            <button
              onClick={() => setSelectedBooking(null)}
              className="btn btn-secondary w-full text-xs mt-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Offline Booking Modal trigger */}
      {offlineModalSlot && (
        <OfflineBookingModal
          initialCourtId={offlineModalSlot.courtId}
          initialDate={offlineModalSlot.date}
          initialStartTime={offlineModalSlot.time}
          currentAdmin={currentAdmin}
          onClose={() => setOfflineModalSlot(null)}
          onSuccess={() => setOfflineModalSlot(null)}
        />
      )}
    </div>
  );
};
