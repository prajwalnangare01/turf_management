import React from 'react';
import { store } from '../../services/store';
import { AdminUser } from '../../types/schema';
import { BarChart3, Download, TrendingUp, Calendar, PieChart } from 'lucide-react';

interface ReportsAnalyticsProps {
  currentAdmin: AdminUser;
}

export const ReportsAnalytics: React.FC<ReportsAnalyticsProps> = ({ currentAdmin }) => {
  const bookings = store.getBookings();
  const todayStr = new Date().toISOString().split('T')[0];

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
  const todayRevenue = confirmedBookings
    .filter(b => b.booking_date === todayStr)
    .reduce((sum, b) => sum + b.total_amount, 0);

  const totalRevenue = confirmedBookings.reduce((sum, b) => sum + b.total_amount, 0);
  const onlineCount = confirmedBookings.filter(b => b.source === 'online').length;
  const offlineCount = confirmedBookings.filter(b => b.source !== 'online').length;

  const exportToCsv = () => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can export financial CSV reports.');
      return;
    }

    const headers = ['Booking Ref', 'Date', 'Start Time', 'End Time', 'Source', 'Status', 'Amount (INR)'];
    const rows = bookings.map(b => [
      b.booking_ref,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.source,
      b.status,
      b.total_amount
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `turf-revenue-report-${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-[#131b2e] p-4 rounded-xl border border-[#24304f]">
        <div>
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" /> Revenue & Occupancy Reports
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Financial summaries, court heatmaps, and CSV export.</p>
        </div>

        <button
          onClick={exportToCsv}
          className="btn btn-primary text-xs flex items-center gap-1.5 font-bold"
        >
          <Download className="w-4 h-4" /> Export Bookings CSV
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#131b2e] p-5 rounded-xl border border-[#24304f] space-y-1">
          <span className="text-xs text-gray-400 font-semibold uppercase">Today's Revenue</span>
          <h3 className="text-2xl font-extrabold text-emerald-400">₹{todayRevenue}</h3>
          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" /> Real-time captured revenue
          </p>
        </div>

        <div className="bg-[#131b2e] p-5 rounded-xl border border-[#24304f] space-y-1">
          <span className="text-xs text-gray-400 font-semibold uppercase">Total Platform Revenue</span>
          <h3 className="text-2xl font-extrabold text-white">₹{totalRevenue}</h3>
          <p className="text-[11px] text-gray-400 mt-1">{confirmedBookings.length} confirmed sessions</p>
        </div>

        <div className="bg-[#131b2e] p-5 rounded-xl border border-[#24304f] space-y-1">
          <span className="text-xs text-gray-400 font-semibold uppercase">Booking Source Mix</span>
          <div className="flex items-center gap-3 pt-2 text-xs font-bold">
            <span className="text-red-400">Online: {onlineCount}</span>
            <span className="text-amber-400">Walk-in: {offlineCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
