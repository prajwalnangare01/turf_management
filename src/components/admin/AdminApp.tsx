import React, { useState } from 'react';
import { store } from '../../services/store';
import { AdminUser } from '../../types/schema';
import { ScheduleCalendarView } from './ScheduleCalendarView';
import { BookingListView } from './BookingListView';
import { CourtPricingManager } from './CourtPricingManager';
import { CustomerCRM } from './CustomerCRM';
import { ReportsAnalytics } from './ReportsAnalytics';
import { AuditLogViewer } from './AuditLogViewer';
import { SettingsPanel } from './SettingsPanel';
import { OfflineBookingModal } from './OfflineBookingModal';
import { 
  Calendar, ListFilter, Settings, Users, BarChart3, History, 
  Sliders, PlusCircle, UserCheck, ArrowLeft, Lock, ShieldCheck, Zap
} from 'lucide-react';

interface AdminAppProps {
  onSwitchToCustomer: () => void;
}

export const AdminApp: React.FC<AdminAppProps> = ({ onSwitchToCustomer }) => {
  const adminUsers = store.getAdminUsers();
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser>(adminUsers[0]);
  const [activeTab, setActiveTab] = useState<'calendar' | 'bookings' | 'courts' | 'crm' | 'reports' | 'audit' | 'settings'>('calendar');

  const [showOfflineModal, setShowOfflineModal] = useState(false);

  // Compute metrics
  const bookings = store.getBookings();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.booking_date === todayStr && b.status !== 'cancelled');
  const todayRevenue = todayBookings.reduce((sum, b) => sum + b.total_amount, 0);

  const activeLocksCount = store.getSlotLocks().filter(l => l.expires_at > Date.now()).length;

  return (
    <div className="min-h-screen text-slate-100 pb-16">
      {/* Admin Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#070b15]/90 backdrop-blur-xl border-b border-white/10 px-4 py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onSwitchToCustomer}
              className="btn-glass text-xs px-3 py-1.5 flex items-center gap-1.5 font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Customer Portal
            </button>

            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl flex items-center justify-center font-black text-base shadow-lg shadow-amber-500/10">
                🛡️
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-black text-base text-white tracking-tight leading-none">Apex Turf Operations</h1>
                  <span className="badge-neon badge-neon-amber text-[9px] px-1.5 py-0.5">
                    EXECUTIVE PORTAL
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Real-time Scheduling & Control Center</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Role Switcher */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 font-semibold">Active Role:</span>
              <select
                value={currentAdmin.id}
                onChange={e => {
                  const adm = adminUsers.find(a => a.id === e.target.value);
                  if (adm) setCurrentAdmin(adm);
                }}
                className="bg-transparent text-white font-extrabold outline-none cursor-pointer"
              >
                {adminUsers.map(a => (
                  <option key={a.id} value={a.id} className="bg-slate-900 text-white">
                    {a.name} ({a.role.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowOfflineModal(true)}
              className="btn-emerald text-xs px-4 py-2 font-black shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" /> + New Offline Booking
            </button>
          </div>
        </div>
      </header>

      {/* Metric Cards Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="glass-card p-5 space-y-2 border-emerald-500/30">
            <div className="flex justify-between items-center text-slate-400 font-bold uppercase text-[10px] tracking-wider">
              <span>Today's Revenue</span>
              <span className="text-emerald-400">₹</span>
            </div>
            <h3 className="text-2xl font-black text-emerald-400">₹{todayRevenue}</h3>
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" /> Live Captured Revenue
            </p>
          </div>

          <div className="glass-card p-5 space-y-2">
            <div className="flex justify-between items-center text-slate-400 font-bold uppercase text-[10px] tracking-wider">
              <span>Today's Bookings</span>
              <span>📅</span>
            </div>
            <h3 className="text-2xl font-black text-white">{todayBookings.length} Sessions</h3>
            <p className="text-[10px] text-slate-400">Online & Counter Walk-ins</p>
          </div>

          <div className="glass-card p-5 space-y-2 border-cyan-500/30">
            <div className="flex justify-between items-center text-slate-400 font-bold uppercase text-[10px] tracking-wider">
              <span>Active Customer Locks</span>
              <Lock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            </div>
            <h3 className="text-2xl font-black text-cyan-300">{activeLocksCount} Held</h3>
            <p className="text-[10px] text-cyan-400/80 font-medium">5-Min Redis Lock Guard</p>
          </div>

          <div className="glass-card p-5 space-y-2 border-amber-500/30">
            <div className="flex justify-between items-center text-slate-400 font-bold uppercase text-[10px] tracking-wider">
              <span>Current Admin</span>
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <h3 className="text-base font-black text-white truncate">{currentAdmin.name}</h3>
            <span className="badge-neon badge-neon-amber text-[9px] px-2 py-0.5">
              {currentAdmin.role}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <main className="max-w-7xl mx-auto px-4 space-y-6">
        <div className="flex gap-2 border-b border-white/10 overflow-x-auto pb-1 text-xs font-extrabold">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'calendar'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" /> Schedule Matrix
          </button>

          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'bookings'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ListFilter className="w-4 h-4" /> Bookings Directory
          </button>

          <button
            onClick={() => setActiveTab('courts')}
            className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'courts'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" /> Courts & Pricing
          </button>

          <button
            onClick={() => setActiveTab('crm')}
            className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'crm'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Customer CRM
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'reports'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Reports & CSV
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'audit'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" /> Audit Log
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'settings'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" /> Settings
          </button>
        </div>

        {/* Tab Views */}
        <div>
          {activeTab === 'calendar' && <ScheduleCalendarView currentAdmin={currentAdmin} />}
          {activeTab === 'bookings' && <BookingListView currentAdmin={currentAdmin} />}
          {activeTab === 'courts' && <CourtPricingManager currentAdmin={currentAdmin} />}
          {activeTab === 'crm' && <CustomerCRM currentAdmin={currentAdmin} />}
          {activeTab === 'reports' && <ReportsAnalytics currentAdmin={currentAdmin} />}
          {activeTab === 'audit' && <AuditLogViewer />}
          {activeTab === 'settings' && <SettingsPanel currentAdmin={currentAdmin} />}
        </div>
      </main>

      {/* Offline Booking Modal */}
      {showOfflineModal && (
        <OfflineBookingModal
          currentAdmin={currentAdmin}
          onClose={() => setShowOfflineModal(false)}
          onSuccess={() => setShowOfflineModal(false)}
        />
      )}
    </div>
  );
};
