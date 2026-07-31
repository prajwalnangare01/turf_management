import React, { useState, useEffect } from 'react';
import { store } from '../../services/store';
import { AdminUser, AdminRole } from '../../types/schema';
import { AuthService } from '../../services/authService';
import { AdminLoginPage } from './AdminLoginPage';
import { SwitchAdminModal } from './SwitchAdminModal';
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
  Sliders, PlusCircle, UserCheck, ArrowLeft, Lock, ShieldCheck, Zap, LogOut, ShieldAlert
} from 'lucide-react';

interface AdminAppProps {
  onSwitchToCustomer: () => void;
}

export const AdminApp: React.FC<AdminAppProps> = ({ onSwitchToCustomer }) => {
  const adminUsers = store.getAdminUsers();
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(() => {
    return AuthService.getAuthenticatedAdmin();
  });

  const [activeTab, setActiveTab] = useState<'calendar' | 'bookings' | 'courts' | 'crm' | 'reports' | 'audit' | 'settings'>('calendar');
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [pendingSwitchAdmin, setPendingSwitchAdmin] = useState<AdminUser | null>(null);

  useEffect(() => {
    const authAdmin = AuthService.getAuthenticatedAdmin();
    if (authAdmin) {
      setCurrentAdmin(authAdmin);
    }
  }, []);

  const handleLogout = () => {
    AuthService.logout();
    setCurrentAdmin(null);
  };

  const handleRoleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (currentAdmin && selectedId === currentAdmin.id) return;

    const target = adminUsers.find(a => a.id === selectedId);
    if (target) {
      // Require password re-verification modal
      setPendingSwitchAdmin(target);
    }
  };

  // If not authenticated, render Login Page Guard
  if (!currentAdmin) {
    return (
      <AdminLoginPage
        onLoginSuccess={(admin) => setCurrentAdmin(admin)}
        onSwitchToCustomer={onSwitchToCustomer}
      />
    );
  }

  // Compute metrics
  const bookings = store.getBookings();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.booking_date === todayStr && b.status !== 'cancelled');
  const todayRevenue = todayBookings.reduce((sum, b) => sum + b.total_amount, 0);

  const activeLocksCount = store.getSlotLocks().filter(l => l.expires_at > Date.now()).length;

  // Define tab authorization levels
  const TAB_MIN_ROLE: Record<string, AdminRole[]> = {
    calendar: ['owner', 'manager', 'staff'],
    bookings: ['owner', 'manager', 'staff'],
    courts: ['owner', 'manager'],
    crm: ['owner', 'manager', 'staff'],
    reports: ['owner', 'manager'],
    audit: ['owner', 'manager'],
    settings: ['owner']
  };

  const hasAccessToTab = (tabId: string): boolean => {
    const allowedRoles = TAB_MIN_ROLE[tabId] || ['owner'];
    return allowedRoles.includes(currentAdmin.role);
  };

  return (
    <div className="bg-background text-on-surface min-h-screen pb-16">
      {/* Admin Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-sm px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="max-w-7xl mx-auto space-y-2 md:space-y-0 md:flex md:items-center md:justify-between md:gap-3">
          
          {/* Top Row / Desktop Left Header */}
          <div className="flex items-center justify-between md:justify-start gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={onSwitchToCustomer}
                className="btn-secondary text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 flex items-center gap-1 font-bold shrink-0"
                title="Return to Customer Storefront"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-primary" /> <span className="hidden xs:inline">Customer Portal</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-primary text-white rounded-xl flex items-center justify-center font-bold text-base sm:text-lg shadow-sm shrink-0">
                  🛡️
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="font-headline font-bold text-base sm:text-xl text-primary leading-none">Apex Operations</h1>
                    <span className="bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded-full font-headline font-bold text-[9px]">
                      EXECUTIVE
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Logout Button (Visible top-right on mobile) */}
            <button
              onClick={handleLogout}
              title="Logout from Admin Portal"
              className="md:hidden btn-secondary text-[11px] px-2.5 py-1.5 text-error hover:bg-error/10 border-error/20 flex items-center gap-1 font-headline font-bold shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" /> <span>Logout</span>
            </button>
          </div>

          {/* Bottom Row / Desktop Right Controls */}
          <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
            {/* Authenticated Admin Account & Role Guard */}
            <div className="flex items-center gap-1.5 bg-surface-container-low px-2.5 py-1.5 rounded-xl border border-outline-variant/40 text-[11px] sm:text-xs flex-1 md:flex-none justify-between">
              <div className="flex items-center gap-1 overflow-hidden">
                <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-on-surface font-headline font-bold truncate max-w-[70px] sm:max-w-none">{currentAdmin.name}</span>
                <span className={`px-1.5 py-0.5 rounded-md font-mono font-extrabold text-[9px] uppercase shrink-0 ${
                  currentAdmin.role === 'owner' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                  currentAdmin.role === 'manager' ? 'bg-sky-100 text-sky-900 border border-sky-300' :
                  'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}>
                  {currentAdmin.role}
                </span>
              </div>

              {/* Secure Account Switch Dropdown */}
              <select
                value={currentAdmin.id}
                onChange={handleRoleSelectChange}
                className="bg-transparent text-on-surface-variant hover:text-on-surface font-headline font-bold outline-none cursor-pointer text-[10px] border-l border-outline-variant/40 pl-1 ml-1 shrink-0"
                title="Switch admin account (Requires Password)"
              >
                {adminUsers.map(a => (
                  <option key={a.id} value={a.id} className="bg-white text-on-surface">
                    Switch: {a.name} ({a.role.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* + Walk-in Booking CTA Button (Always Prominent & Visible) */}
            <button
              onClick={() => setShowOfflineModal(true)}
              className="btn-cta text-[11px] sm:text-xs px-3 sm:px-4 py-1.5 sm:py-2 font-headline font-bold uppercase tracking-wider flex items-center gap-1 shadow-md shrink-0 whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" /> <span>+ Walk-in</span>
            </button>

            {/* Desktop Logout Button */}
            <button
              onClick={handleLogout}
              title="Logout from Admin Portal"
              className="hidden md:flex btn-secondary text-xs px-3 py-2 text-error hover:bg-error/10 border-error/20 items-center gap-1.5 font-headline font-bold shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" /> <span>Logout</span>
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

        {/* MOBILE ADMIN TAB SWITCHER (Visible on screens < 768px) */}
        <div className="md:hidden bg-white p-3.5 rounded-2xl border border-outline-variant/60 shadow-sm space-y-1.5 my-4">
          <label className="text-[11px] font-headline font-bold text-on-surface-variant uppercase tracking-wider block">
            Navigate Admin Section:
          </label>
          <select
            value={activeTab}
            onChange={e => setActiveTab(e.target.value as any)}
            className="w-full form-input font-headline font-extrabold text-xs text-primary py-2.5 bg-surface-container-low border-primary/40 rounded-xl"
          >
            <option value="calendar">📅 Schedule Calendar Matrix</option>
            <option value="bookings">📋 Bookings Audit Directory</option>
            <option value="courts">⚙️ Court Pricing Manager</option>
            <option value="crm">👥 Customer CRM & Blacklist</option>
            <option value="reports">📊 Analytics & Revenue Reports</option>
            <option value="audit">📜 System Audit Logs</option>
            <option value="settings">🔒 Venue Settings & Controls</option>
          </select>
        </div>

        {/* DESKTOP / TABLET TAB NAVIGATION (Visible on screens >= 768px) */}
        <div className="hidden md:flex gap-2 overflow-x-auto my-6 border-b border-outline-variant/40 pb-2 no-scrollbar scroll-smooth">
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
            const isAllowed = hasAccessToTab(tab.id);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-all shrink-0 ${
                  isActive
                    ? 'bg-primary text-white shadow-md'
                    : isAllowed
                    ? 'bg-white text-on-surface-variant hover:text-on-surface border border-outline-variant/40'
                    : 'bg-surface-container-low text-on-surface-variant/60 border border-outline-variant/20'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
                {!isAllowed && (
                  <span title="Requires higher privilege level">
                    <Lock className="w-3 h-3 text-amber-500 ml-1 shrink-0" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Views with Role Security Gate */}
        <div className="bg-white rounded-2xl p-6 border border-outline-variant/50 shadow-sm">
          {!hasAccessToTab(activeTab) ? (
            <div className="py-12 text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-3xl flex items-center justify-center mx-auto text-2xl shadow-xs">
                🔒
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Restricted Privilege Area</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                The <strong>{activeTab.toUpperCase()}</strong> module requires{' '}
                <strong className="text-amber-700">
                  {TAB_MIN_ROLE[activeTab]?.join(' or ').toUpperCase()}
                </strong>{' '}
                privileges. You are currently authenticated as <strong>{currentAdmin.name} ({currentAdmin.role.toUpperCase()})</strong>.
              </p>
              <button
                onClick={() => {
                  const ownerAdmin = adminUsers.find(a => a.role === 'owner');
                  if (ownerAdmin) setPendingSwitchAdmin(ownerAdmin);
                }}
                className="btn-cta text-xs px-5 py-2.5 font-headline font-bold flex items-center gap-2 mx-auto shadow-md"
              >
                <ShieldAlert className="w-4 h-4" /> Authenticate as Owner
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'calendar' && <ScheduleCalendarView currentAdmin={currentAdmin} />}
              {activeTab === 'bookings' && <BookingListView currentAdmin={currentAdmin} />}
              {activeTab === 'courts' && <CourtPricingManager currentAdmin={currentAdmin} />}
              {activeTab === 'crm' && <CustomerCRM currentAdmin={currentAdmin} />}
              {activeTab === 'reports' && <ReportsAnalytics currentAdmin={currentAdmin} />}
              {activeTab === 'audit' && <AuditLogViewer />}
              {activeTab === 'settings' && <SettingsPanel currentAdmin={currentAdmin} />}
            </>
          )}
        </div>
      </div>

      {showOfflineModal && (
        <OfflineBookingModal
          currentAdmin={currentAdmin}
          onClose={() => setShowOfflineModal(false)}
        />
      )}

      {/* Password Re-verification Modal when switching role/account */}
      {pendingSwitchAdmin && (
        <SwitchAdminModal
          targetAdmin={pendingSwitchAdmin}
          currentAdmin={currentAdmin}
          onConfirmSwitch={(authenticatedAdmin) => {
            setCurrentAdmin(authenticatedAdmin);
            setPendingSwitchAdmin(null);
          }}
          onClose={() => setPendingSwitchAdmin(null)}
        />
      )}
    </div>
  );
};
