import React, { useState } from 'react';
import { store } from '../../services/store';
import { AdminUser } from '../../types/schema';
import { formatTime12hPlain, formatDateDDMMYYYY, formatPhoneNumber, getBookingGatePassOtp } from '../../utils/formatters';
import { getVenueDateString } from '../../utils/venueTime';
import { DataArchiveService, ArchiveDispatchResult } from '../../services/dataArchiveService';
import { EmailService } from '../../services/emailService';
import { 
  BarChart3, 
  TrendingUp, 
  FileSpreadsheet, 
  Mail, 
  Send, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  RotateCcw,
  Layers,
  Database,
  ArrowRight,
  Info
} from 'lucide-react';

interface ReportsAnalyticsProps {
  currentAdmin: AdminUser;
}

export const ReportsAnalytics: React.FC<ReportsAnalyticsProps> = ({ currentAdmin }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<number>(30); // 30, 60, or 0 (all)
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dispatchResultModal, setDispatchResultModal] = useState<ArchiveDispatchResult | null>(null);

  // Settings
  const archiveSettings = store.getDataArchiveSettings();
  const [ownerEmailInput, setOwnerEmailInput] = useState(
    archiveSettings.owner_email || 'owner@turfflow.com'
  );

  const bookings = store.getBookings();
  const courts = store.getCourts();
  const customers = store.getCustomers();
  const todayStr = getVenueDateString(0);

  // Financial calculations
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
  const todayRevenue = confirmedBookings
    .filter(b => b.booking_date === todayStr)
    .reduce((sum, b) => sum + (b.total_amount || 0), 0);

  const totalGrossRevenue = bookings
    .filter(b => b.status === 'confirmed' || b.status === 'completed' || b.status === 'refunded')
    .reduce((sum, b) => sum + (b.total_amount || 0), 0);

  const totalRefunds = bookings
    .filter(b => b.status === 'refunded')
    .reduce((sum, b) => sum + (b.refund_amount || b.total_amount || 0), 0);

  const totalNetRevenue = totalGrossRevenue - totalRefunds;

  const onlineCount = confirmedBookings.filter(b => b.source === 'online').length;
  const whatsappCount = confirmedBookings.filter(b => b.source === 'offline_whatsapp').length;
  const walkinCount = confirmedBookings.filter(b => b.source === 'offline_walkin' || b.source === 'offline_phone').length;

  // Selected period records
  const periodBookings = DataArchiveService.getBookingsForPeriod(selectedPeriod);
  const periodRevenue = periodBookings
    .filter(b => b.status === 'confirmed' || b.status === 'completed')
    .reduce((sum, b) => sum + (b.total_amount || 0), 0);

  // Handlers
  const handleDownloadExcel = () => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can export financial data files.');
      return;
    }
    const res = DataArchiveService.downloadExcelArchive(selectedPeriod);
    if (res.success) {
      setEmailStatus({
        type: 'success',
        message: `Excel file "${res.filename}" downloaded successfully with ${res.count} records!`
      });
      setTimeout(() => setEmailStatus(null), 5000);
    }
  };

  const handleSendEmailNow = async () => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can dispatch financial audit reports.');
      return;
    }

    const cleanEmail = ownerEmailInput.trim().toLowerCase();
    if (EmailService.isResendSenderEmail(cleanEmail)) {
      setEmailStatus({
        type: 'error',
        message: "You can't send on this email — it's the sender email! Both sender and recipient cannot be the same. Please provide a different recipient email."
      });
      return;
    }

    setIsSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await DataArchiveService.dispatchArchiveToOwner({
        targetEmail: ownerEmailInput,
        periodDays: selectedPeriod,
        isManual: true,
        adminId: currentAdmin.id
      } as any);

      setDispatchResultModal(res);

      if (res.success) {
        setEmailStatus({
          type: 'success',
          message: `Complete past ${selectedPeriod}-day data backup dispatched to ${res.recipient} with attached Excel file (${res.filename || 'ledger.xls'})!`
        });
      } else {
        setEmailStatus({
          type: 'error',
          message: res.message || 'Failed to dispatch data archive email.'
        });
      }
    } catch (err: any) {
      const failRes: ArchiveDispatchResult = {
        success: false,
        message: err?.message || 'Error occurred while sending archive email.',
        recipient: ownerEmailInput,
        bookingsCount: periodBookings.length,
        grossRevenue: 0,
        netRevenue: 0
      };
      setDispatchResultModal(failRes);
      setEmailStatus({
        type: 'error',
        message: err?.message || 'Error occurred while sending archive email.'
      });
    } finally {
      setIsSendingEmail(false);
      setTimeout(() => setEmailStatus(null), 12000);
    }
  };

  const handleSaveEmail = () => {
    const cleanEmail = ownerEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setEmailStatus({
        type: 'error',
        message: 'Please enter a valid email address.'
      });
      return;
    }
    if (EmailService.isResendSenderEmail(cleanEmail)) {
      setEmailStatus({
        type: 'error',
        message: "You can't send on this email — it's the sender email! Both sender and recipient cannot be the same. Please provide a different recipient email address."
      });
      return;
    }
    store.updateDataArchiveSettings({ owner_email: cleanEmail });
    setEmailStatus({
      type: 'success',
      message: `Owner archive dispatch email saved as ${cleanEmail}!`
    });
    setTimeout(() => setEmailStatus(null), 5000);
  };

  const lastDispatchStr = archiveSettings.last_dispatch_date 
    ? formatDateDDMMYYYY(archiveSettings.last_dispatch_date)
    : 'Not yet dispatched';

  const nextDispatchDate = DataArchiveService.getNextScheduledDispatchDate();
  const nextDispatchStr = formatDateDDMMYYYY(nextDispatchDate);

  return (
    <div className="space-y-6 text-on-surface">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/40">
        <div>
          <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Revenue, Occupancy &amp; Data Archival
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5 font-medium">
            Financial analytics, automated 30-day owner email backups, and multi-sheet Excel exports.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadExcel}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs rounded-xl font-headline font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            title="Download multi-sheet Excel file (.xls / .xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>Download Excel</span>
          </button>
        </div>
      </div>

      {/* Notification / Feedback Banner */}
      {emailStatus && (
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 animate-modalScaleIn ${
          emailStatus.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
            : 'bg-red-50 text-red-900 border-red-300'
        }`}>
          <div className="flex items-center gap-2">
            {emailStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-semibold">{emailStatus.message}</span>
          </div>
          <button 
            onClick={() => setEmailStatus(null)} 
            className="text-xs font-bold opacity-60 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-1">
          <span className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider">Today's Revenue</span>
          <h3 className="text-3xl font-headline font-extrabold text-primary">₹{todayRevenue}</h3>
          <p className="text-[11px] text-primary font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-primary" /> Live captured revenue
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-1">
          <span className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider">Net Retained Revenue</span>
          <h3 className="text-3xl font-headline font-extrabold text-emerald-700">₹{totalNetRevenue}</h3>
          <p className="text-[11px] text-on-surface-variant font-medium mt-1">
            Gross: ₹{totalGrossRevenue} &bull; Refunds: ₹{totalRefunds}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-1">
          <span className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider">Operational Retention</span>
          <div className="flex items-center gap-1.5 pt-1">
            <span className="bg-primary/10 text-primary border border-primary/20 text-xs font-bold px-2.5 py-0.5 rounded-full">
              60 Days Active
            </span>
            <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full">
              30d User
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant font-medium mt-1">
            Keeps database lightweight &amp; fast
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-sm space-y-1">
          <span className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider">Booking Channel Mix</span>
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-headline font-bold">
            <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full">WhatsApp: {whatsappCount}</span>
            <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">Web: {onlineCount}</span>
            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">Walk-in: {walkinCount}</span>
          </div>
          <p className="text-[11px] text-on-surface-variant font-medium mt-1">
            {confirmedBookings.length} total active sessions
          </p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* OWNER DATA ARCHIVAL & EXCEL BACKUP CENTER                     */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl p-6 border border-outline-variant/60 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-outline-variant/30 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-700" />
              <h3 className="font-headline font-extrabold text-base sm:text-lg text-gray-900">
                Owner Data Archival &amp; Excel Backup Center
              </h3>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
                AUTOMATED 30-DAY BACKUPS
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Customer site displays the last 30 days and admin retains 60 days. All historical records are compiled into formatted Excel files and emailed to the owner automatically.
            </p>
          </div>

          {/* Timeframe Selector Pills */}
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl self-start md:self-auto border border-gray-200 text-xs font-bold">
            {[
              { days: 30, label: 'Last 30 Days' },
              { days: 60, label: 'Last 60 Days' }
            ].map(p => (
              <button
                key={p.days}
                type="button"
                onClick={() => setSelectedPeriod(p.days)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  selectedPeriod === p.days
                    ? 'bg-white text-emerald-800 shadow-xs border border-gray-200'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2-Column Grid: On-Demand Downloads & Automated Email Dispatch */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Card 1: On-Demand Direct Data Download */}
          <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/40 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Option 1: Direct On-Demand Download
                </span>
                <h4 className="font-headline font-bold text-sm sm:text-base text-gray-900 mt-0.5">
                  Export Selected Data Anytime
                </h4>
              </div>
              <span className="bg-white px-2.5 py-1 rounded-full border border-gray-200 text-[11px] font-bold text-gray-700">
                {periodBookings.length} Bookings Selected
              </span>
            </div>

            <p className="text-xs text-gray-600 font-medium leading-relaxed">
              Download complete operational data for <strong>the last {selectedPeriod} days</strong>. Includes all booking statuses: Confirmed, Completed, Cancelled, and Refunded.
            </p>

            {/* Excel Sheet Structure Pills */}
            <div className="bg-white p-3 rounded-xl border border-gray-200/80 space-y-2 text-xs">
              <span className="text-[11px] font-bold text-gray-700 block">Spreadsheet Includes 3 Worksheets:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/60">
                  <strong className="block text-emerald-900 font-bold">1. Booking Ledger</strong>
                  <span className="text-gray-500 text-[10px]">All 22 columns with DD/MM/YYYY dates &amp; OTPs</span>
                </div>
                <div className="bg-blue-50/70 p-2 rounded-lg border border-blue-200/60">
                  <strong className="block text-blue-900 font-bold">2. Financial Summary</strong>
                  <span className="text-gray-500 text-[10px]">Gross, Refunds, Net Revenue &amp; AOV</span>
                </div>
                <div className="bg-purple-50/70 p-2 rounded-lg border border-purple-200/60">
                  <strong className="block text-purple-900 font-bold">3. Pitch Analytics</strong>
                  <span className="text-gray-500 text-[10px]">Pitch breakdown &amp; channel mix</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-headline font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Download Excel (.xls)</span>
              </button>
            </div>
          </div>

          {/* Card 2: Automated 1st-of-Month Email Dispatch to Owner */}
          <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/40 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wider block">
                    Option 2: Automated 1st-of-Month Auto-Send
                  </span>
                  <h4 className="font-headline font-bold text-sm sm:text-base text-gray-900 mt-0.5">
                    Monthly Backup to Owner Inbox
                  </h4>
                </div>
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  ACTIVE
                </span>
              </div>

              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                On the 1st of every month, TurfFlow automatically compiles all records from the previous month into an Excel archive and emails the full report to the owner. Admins can also manually send an instant backup on any date for either the last 30 or 60 days.
              </p>

              {/* Editable Owner Email Field */}
              <div className="bg-white p-3.5 rounded-xl border border-gray-200/90 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="owner-email-input" className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-primary" />
                    <span>Owner Email Recipient</span>
                  </label>
                  <span className="text-[10px] text-gray-500 font-medium">Pre-filled &amp; editable</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="owner-email-input"
                    type="email"
                    value={ownerEmailInput}
                    onChange={e => setOwnerEmailInput(e.target.value)}
                    className="form-input flex-1 text-xs py-2 px-3 font-mono border-gray-300 rounded-lg bg-gray-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="owner@turfflow.com"
                  />
                  <button
                    type="button"
                    onClick={handleSaveEmail}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1 shrink-0"
                    title="Save updated owner email"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>

                {/* Resend Sender Email Conflict Warning / Success Notice (1 Line, No Brackets) */}
                {EmailService.isResendSenderEmail(ownerEmailInput) ? (
                  <div className="flex items-center gap-1.5 bg-red-50 border border-red-300 text-red-900 px-2.5 py-1.5 rounded-lg text-xs font-medium animate-fadeIn">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span><strong>You can't send on this email — it's the sender email!</strong></span>
                  </div>
                ) : ownerEmailInput.trim().includes('@') ? (
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 px-2.5 py-1.5 rounded-lg text-xs font-medium animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>Valid Recipient Email</strong> — ready for delivery.</span>
                  </div>
                ) : null}
              </div>

              {/* Schedule Info Box */}
              <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 space-y-2 text-xs">
                <div className="flex justify-between items-center text-gray-600">
                  <span className="font-medium">Automated Frequency:</span>
                  <strong className="text-gray-900 font-bold">1st of Every Month (Last Month's Data)</strong>
                </div>

                <div className="flex justify-between items-center text-gray-600">
                  <span className="font-medium">Next Scheduled:</span>
                  <span className="text-emerald-700 font-bold">{nextDispatchStr}</span>
                </div>

                <div className="flex justify-between items-center text-gray-600">
                  <span className="font-medium">Last Dispatched:</span>
                  <span className="text-gray-700 font-semibold">{lastDispatchStr}</span>
                </div>

                <div className="flex items-center justify-between text-gray-700 pt-2 border-t border-gray-100">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-gray-700">Backup Period Range:</span>
                  <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setSelectedPeriod(30)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                        selectedPeriod === 30
                          ? 'bg-primary text-white shadow-2xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Past 30 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPeriod(60)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                        selectedPeriod === 60
                          ? 'bg-primary text-white shadow-2xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Past 60 Days
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-gray-600">
                  <span className="font-medium">Selected Scope:</span>
                  <span className="text-primary font-bold">Past {selectedPeriod} Days ({periodBookings.length} records &bull; Excel Attached)</span>
                </div>
              </div>
            </div>

            {/* Prominent Inline Email Feedback Message */}
            {emailStatus && (
              <div className={`p-3.5 rounded-xl border text-xs space-y-1 animate-modalScaleIn shadow-xs ${
                emailStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                  : 'bg-red-50 text-red-950 border-red-300'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5 text-xs">
                    {emailStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{emailStatus.type === 'success' ? 'Backup Dispatched Successfully!' : 'Dispatch Notice'}</span>
                  </span>
                  <button 
                    onClick={() => setEmailStatus(null)} 
                    className="text-xs font-bold opacity-60 hover:opacity-100 p-0.5 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed pl-5 font-medium">{emailStatus.message}</p>
              </div>
            )}

            {/* Instant Dispatch Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSendEmailNow}
                disabled={isSendingEmail || EmailService.isResendSenderEmail(ownerEmailInput)}
                className={`w-full py-2.5 px-4 rounded-xl font-headline font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition ${
                  EmailService.isResendSenderEmail(ownerEmailInput)
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                    : 'bg-primary hover:bg-primary-dark text-white cursor-pointer'
                }`}
                title={
                  EmailService.isResendSenderEmail(ownerEmailInput)
                    ? "Cannot send: recipient matches the sender email. Both cannot be the same."
                    : `Send past ${selectedPeriod}-day backup to ${ownerEmailInput}`
                }
              >
                {isSendingEmail ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Compiling Excel &amp; Dispatching to {ownerEmailInput}...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-emerald-200" />
                    <span>Send Past {selectedPeriod}-Day Backup with Excel File to Owner Email Now</span>
                  </>
                )}
              </button>
              {EmailService.isResendSenderEmail(ownerEmailInput) && (
                <p className="text-[11px] text-red-600 font-bold text-center mt-1.5 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>Cannot send: Recipient cannot be the sender email.</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Selected Period Booking Records Table Preview */}
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-headline font-bold text-xs sm:text-sm text-gray-900 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-primary" />
              <span>Preview Records in Selected Archive Window ({periodBookings.length} Total)</span>
            </h4>
            <span className="text-xs text-gray-500 font-medium">
              Net Value: <strong className="text-emerald-700 font-bold">₹{periodRevenue}</strong>
            </span>
          </div>

          <div className="overflow-x-auto border border-outline-variant/40 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/40 text-[11px] font-headline font-bold text-on-surface-variant uppercase tracking-wider">
                  <th className="py-2.5 px-3">Booking Ref</th>
                  <th className="py-2.5 px-3">Match Date</th>
                  <th className="py-2.5 px-3">Slot Time</th>
                  <th className="py-2.5 px-3">Pitch</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center">Gate OTP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {periodBookings.slice(0, 8).map(b => {
                  const cust = customers.find(c => c.id === b.customer_id);
                  const court = courts.find(c => c.id === b.court_id);
                  const otp = getBookingGatePassOtp(b);

                  return (
                    <tr key={b.id} className="hover:bg-surface-container-lowest/50 transition">
                      <td className="py-2 px-3 font-mono font-bold text-primary">{b.booking_ref || b.id}</td>
                      <td className="py-2 px-3 text-gray-700">{formatDateDDMMYYYY(b.booking_date)}</td>
                      <td className="py-2 px-3 text-gray-700 font-medium">
                        {formatTime12hPlain(b.start_time)} – {formatTime12hPlain(b.end_time)}
                      </td>
                      <td className="py-2 px-3 text-gray-900 font-semibold">{court?.name || 'Pitch'}</td>
                      <td className="py-2 px-3 text-gray-700">{cust?.name || b.customer_name || 'Player'}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                          b.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                          b.status === 'refunded' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-headline font-bold text-gray-900">₹{b.total_amount}</td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-emerald-800 bg-emerald-50/50 rounded">{otp}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Dispatch Confirmation Modal */}
      {dispatchResultModal && (
        <div className="modal-overlay z-[9999]">
          <div className="bg-white border border-outline-variant/60 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-modalScaleIn text-on-surface space-y-4">
            <div className="text-center space-y-2">
              <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl shadow-xs ${
                dispatchResultModal.success ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'
              }`}>
                {dispatchResultModal.success ? '✅' : '⚠️'}
              </div>
              <h3 className="font-headline font-extrabold text-lg text-on-surface">
                {dispatchResultModal.success ? 'Backup Dispatched to Owner!' : 'Dispatch Notice'}
              </h3>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                {dispatchResultModal.message}
              </p>
            </div>

            {/* Breakdown Details Grid */}
            <div className="bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/30 text-xs space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant font-medium">Recipient Email:</span>
                <strong className="font-mono text-primary font-bold text-xs">{dispatchResultModal.recipient}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant font-medium">Selected Window:</span>
                <strong className="font-bold text-on-surface">Past {selectedPeriod} Days from Current</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant font-medium">Total Ledger Records:</span>
                <span className="bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-full text-[11px]">
                  {dispatchResultModal.bookingsCount} Bookings
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant font-medium">Net Revenue:</span>
                <strong className="text-emerald-700 font-extrabold font-mono">₹{dispatchResultModal.netRevenue}</strong>
              </div>
              {dispatchResultModal.filename && (
                <div className="pt-2 border-t border-outline-variant/30 flex items-start justify-between gap-2">
                  <span className="text-on-surface-variant font-medium shrink-0">Attached File:</span>
                  <span className="font-mono text-[10.5px] font-bold text-emerald-800 bg-white px-2 py-1 rounded-lg border border-emerald-300 truncate max-w-[230px] shadow-2xs">
                    📎 {dispatchResultModal.filename}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDispatchResultModal(null)}
                className="btn-cta w-full py-2.5 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Got it, Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
