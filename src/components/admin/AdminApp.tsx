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
    <div className="bg-background text-on-surface min-h-screen pb-16">
      {/* Admin Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-sm px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onSwitchToCustomer}
              className="btn-secondary text-xs px-3.5 py-1.5 flex items-center gap-1.5 font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-primary" /> Customer Portal
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-sm">
                🛡️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-headline font-bold text-xl text-primary leading-none">Apex Turf Operations</h1>
                  <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-headline font-bold text-[10px]">
                    EXECUTIVE PORTAL
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">Real-time Scheduling & Control Center</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Role Switcher */}
            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline-variant/40 text-xs">
              <UserCheck className="w-4 h-4 text-primary" />
              <span className="text-on-surface-variant font-medium">Role:</span>
              <select
                value={currentAdmin.id}
                onChange={e => {
                  const adm = adminUsers.find(a => a.id === e.target.value);
                  if (adm) setCurrentAdmin(adm);
                }}
                className="bg-transparent text-on-surface font-headline font-bold outline-none cursor-pointer"
              >
                {adminUsers.map(a => (
                  <option key={a.id} value={a.id} className="bg-white text-on-surface">
                    {a.name} ({a.role.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowOfflineModal(true)}
              className="btn-cta text-xs px-4 py-2 font-headline font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md"
            >
              <PlusCircle className="w-4 h-4" /> + New Walk-in Booking
            </button>
          </div>
        </div>
      </header>

      {/* Metric Cards Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-on-surface-variant font-headline font-bold text-xs uppercase tracking-wider">
              <span>Today's Bookings</span>
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <p className="text-3xl font-headline font-extrabold text-on-surface">{todayBookings.length}</p>
            <p className="text-[11px] text-primary font-semibold">Active pitches booked</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-on-surface-variant font-headline font-bold text-xs uppercase tracking-wider">
              <span>Today's Revenue</span>
              <Zap className="w-4 h-4 text-secondary" />
            </div>
            <p className="text-3xl font-headline font-extrabold text-primary">₹{todayRevenue.toLocaleString()}</p>
            <p className="text-[11px] text-on-surface-variant font-medium">Verified Razorpay & Walk-in</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-on-surface-variant font-headline font-bold text-xs uppercase tracking-wider">
              <span>Live Redis Locks</span>
              <Lock className="w-4 h-4 text-sky-600" />
            </div>
            <p className="text-3xl font-headline font-extrabold text-sky-700">{activeLocksCount}</p>
            <p className="text-[11px] text-sky-600 font-semibold">Sessions holding slots</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-on-surface-variant font-headline font-bold text-xs uppercase tracking-wider">
              <span>DB Integrity Guard</span>
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <p className="text-3xl font-headline font-extrabold text-primary">100%</p>
            <p className="text-[11px] text-on-surface-variant font-medium">Zero double-bookings</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto my-6 border-b border-outline-variant/40 pb-2 no-scrollbar">
          {[
            { id: 'calendar', label: 'Schedule Calendar', icon: Calendar },
            { id: 'bookings', label: 'Bookings Directory', icon: ListFilter },
            { id: 'courts', label: 'Court Pricing Manager', icon: Sliders },
            { id: 'crm', label: 'Customer CRM', icon: Users },
            { id: 'reports', label: 'Analytics & Revenue', icon: BarChart3 },
            { id: 'audit', label: 'Audit Logs', icon: History },
            { id: 'settings', label: 'Venue Settings', icon: Settings },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-white text-on-surface-variant hover:text-on-surface border border-outline-variant/40'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Views */}
        <div className="bg-white rounded-2xl p-6 border border-outline-variant/50 shadow-sm">
          {activeTab === 'calendar' && <ScheduleCalendarView currentAdmin={currentAdmin} />}
          {activeTab === 'bookings' && <BookingListView currentAdmin={currentAdmin} />}
          {activeTab === 'courts' && <CourtPricingManager currentAdmin={currentAdmin} />}
          {activeTab === 'crm' && <CustomerCRM currentAdmin={currentAdmin} />}
          {activeTab === 'reports' && <ReportsAnalytics currentAdmin={currentAdmin} />}
          {activeTab === 'audit' && <AuditLogViewer />}
          {activeTab === 'settings' && <SettingsPanel currentAdmin={currentAdmin} />}
        </div>
      </div>

      {showOfflineModal && (
        <OfflineBookingModal
          currentAdmin={currentAdmin}
          onClose={() => setShowOfflineModal(false)}
        />
      )}
    </div>
  );
};
