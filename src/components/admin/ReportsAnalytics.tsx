import React from 'react';
import { store } from '../../services/store';
import { AdminUser } from '../../types/schema';
import { BarChart3, Download, TrendingUp } from 'lucide-react';

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
    <div className="space-y-6 text-on-surface">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/40">
        <div>
          <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Revenue & Occupancy Reports
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5 font-medium">Financial summaries, pitch heatmaps, and CSV export.</p>
        </div>

        <button
          onClick={exportToCsv}
          className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 font-headline font-bold shadow-sm"
        >
          <Download className="w-4 h-4" /> Export Bookings CSV
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-1">
          <span className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider">Today's Revenue</span>
          <h3 className="text-3xl font-headline font-extrabold text-primary">₹{todayRevenue}</h3>
          <p className="text-[11px] text-primary font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-primary" /> Real-time captured revenue
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-1">
          <span className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider">Total Platform Revenue</span>
          <h3 className="text-3xl font-headline font-extrabold text-on-surface">₹{totalRevenue}</h3>
          <p className="text-[11px] text-on-surface-variant font-medium mt-1">{confirmedBookings.length} confirmed sessions</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-1">
          <span className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider">Booking Mix</span>
          <div className="flex items-center gap-3 pt-2 text-xs font-headline font-bold">
            <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">Online: {onlineCount}</span>
            <span className="bg-secondary-container text-on-secondary-container px-2.5 py-1 rounded-full">Walk-in: {offlineCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
