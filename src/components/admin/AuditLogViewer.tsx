import React, { useState, useEffect } from 'react';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { 
  History, Shield, Mail, Zap, ShieldCheck, Search, Filter, 
  FileSpreadsheet, ArrowUpRight, CheckCircle2, Clock
} from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/formatters';
import { AuditLog } from '../../types/schema';

export const AuditLogViewer: React.FC = () => {
  const [filterType, setFilterType] = useState<'all' | 'email' | 'staff'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);

  // 60-day operational retention window
  const sixtyDaysAgoMs = AuditLogger.RETENTION_MS;
  const cutoffDate = new Date(Date.now() - sixtyDaysAgoMs);
  const cutoffDateFormatted = formatDateDDMMYYYY(cutoffDate);

  const loadLogs = () => {
    // Purge records older than 60 days on every mount to keep database clean
    AuditLogger.purgeRecordsOlderThan60Days();
    setLogs(AuditLogger.getLogsLast60Days());
  };

  useEffect(() => {
    loadLogs();
    const unsubscribe = store.subscribe(() => {
      loadLogs();
    });
    return () => unsubscribe();
  }, []);

  const getHumanReadableAction = (action: string) => {
    // Email Operations
    if (action === 'DISPATCH_EMAIL_ARCHIVE') {
      return { 
        label: 'Dispatched Owner Data Archive', 
        bg: 'bg-purple-100 text-purple-900 border-purple-300',
        isEmail: true
      };
    }
    if (action === 'SEND_EMAIL_CONFIRMATION') {
      return { 
        label: 'Sent Booking Confirmation Email', 
        bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        isEmail: true
      };
    }
    if (action === 'SEND_EMAIL_CANCELLATION') {
      return { 
        label: 'Sent Booking Cancellation Email', 
        bg: 'bg-rose-100 text-rose-900 border-rose-300',
        isEmail: true
      };
    }
    if (action === 'SEND_EMAIL_REMINDER') {
      return { 
        label: 'Sent Matchday Reminder Email', 
        bg: 'bg-blue-100 text-blue-900 border-blue-300',
        isEmail: true
      };
    }
    if (action === 'SEND_EMAIL' || action.includes('EMAIL')) {
      return { 
        label: 'Sent Email Notification', 
        bg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        isEmail: true
      };
    }

    // Status / Booking Actions
    if (action.startsWith('UPDATE_BOOKING_STATUS_COMPLETED') || action === 'UPDATE_STATUS_completed') {
      return { label: 'Marked Booking Completed', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', isEmail: false };
    }
    if (action.startsWith('UPDATE_BOOKING_STATUS_NO_SHOW') || action === 'UPDATE_STATUS_no_show') {
      return { label: 'Marked Booking No-Show', bg: 'bg-amber-100 text-amber-900 border-amber-300', isEmail: false };
    }
    if (action.startsWith('UPDATE_BOOKING_STATUS_CANCELLED') || action === 'UPDATE_STATUS_cancelled') {
      return { label: 'Cancelled Reservation', bg: 'bg-red-100 text-red-900 border-red-300', isEmail: false };
    }
    if (action === 'CREATE_OFFLINE_BOOKING') {
      return { label: 'Created Walk-in Booking', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', isEmail: false };
    }
    if (action === 'CREATE_COURT') {
      return { label: 'Added New Pitch', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', isEmail: false };
    }
    if (action === 'UPDATE_COURT') {
      return { label: 'Updated Pitch Configuration', bg: 'bg-blue-100 text-blue-900 border-blue-300', isEmail: false };
    }
    if (action === 'DELETE_COURT') {
      return { label: 'Deleted Pitch', bg: 'bg-red-100 text-red-900 border-red-300', isEmail: false };
    }
    if (action === 'CREATE_BLOCKED_SLOT') {
      return { label: 'Blocked Pitch Maintenance', bg: 'bg-amber-100 text-amber-900 border-amber-300', isEmail: false };
    }
    if (action === 'DELETE_BLOCKED_SLOT') {
      return { label: 'Removed Pitch Maintenance Block', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', isEmail: false };
    }
    if (action === 'UPDATE_VENUE_SETTINGS') {
      return { label: 'Updated Venue Settings', bg: 'bg-indigo-100 text-indigo-900 border-indigo-300', isEmail: false };
    }

    return { 
      label: action.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
      bg: 'bg-gray-100 text-gray-800 border-gray-300',
      isEmail: false
    };
  };

  const isEmailAction = (log: AuditLog) => {
    return log.action.includes('EMAIL') || log.entity_type === 'DataArchive' || !!log.new_value?.recipient;
  };

  // Filter logs by tab selection and search query
  const filteredLogs = logs.filter(log => {
    // 1. Tab filter
    if (filterType === 'email' && !isEmailAction(log)) return false;
    if (filterType === 'staff' && isEmailAction(log)) return false;

    // 2. Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchAdmin = (log.admin_name || '').toLowerCase().includes(q);
      const matchAction = (log.action || '').toLowerCase().includes(q);
      const matchEntity = (log.entity_id || '').toLowerCase().includes(q);
      const matchRecipient = (log.new_value?.recipient || '').toLowerCase().includes(q);
      const matchRef = (log.new_value?.bookingRef || '').toLowerCase().includes(q);
      const matchPeriod = (log.new_value?.period || '').toLowerCase().includes(q);
      return matchAdmin || matchAction || matchEntity || matchRecipient || matchRef || matchPeriod;
    }

    return true;
  });

  const emailLogsCount = logs.filter(l => isEmailAction(l)).length;
  const staffLogsCount = logs.length - emailLogsCount;

  return (
    <div className="space-y-4 text-on-surface">
      {/* Top Banner & 60-Day Retention Notice */}
      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> Staff Activity & Security Audit Trail
            </h2>
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              60-Day Retention Active
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1 font-medium">
            Displaying operations &amp; email dispatches from the last 60 days (since <span className="font-bold text-on-surface font-mono">{cutoffDateFormatted}</span>). Older records are automatically purged to keep the database lightweight.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <span className="text-on-surface-variant font-headline font-bold bg-white px-3 py-1.5 rounded-lg border border-outline-variant/30 text-xs shadow-xs">
            Showing {filteredLogs.length} of {logs.length} Records
          </span>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Category Pills */}
        <div className="inline-flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/40 text-xs font-headline font-bold">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filterType === 'all'
                ? 'bg-white text-primary shadow-xs font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            All Records ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('email')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              filterType === 'email'
                ? 'bg-white text-purple-800 shadow-xs font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Email Operations ({emailLogsCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('staff')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              filterType === 'staff'
                ? 'bg-white text-primary shadow-xs font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Staff Actions ({staffLogsCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px] sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search email, ref, staff, action..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-outline-variant/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-on-surface-variant/50"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-700 bg-gray-100 rounded-full w-4 h-4 flex items-center justify-center font-bold"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Audit Log Records Table */}
      <div className="bg-white border border-outline-variant/40 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low border-b border-outline-variant/40 font-headline font-bold text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="p-3.5 whitespace-nowrap">Date &amp; Time (DD/MM/YYYY)</th>
                <th className="p-3.5 whitespace-nowrap">Operator / Actor</th>
                <th className="p-3.5 whitespace-nowrap">Activity Performed</th>
                <th className="p-3.5">Target Record &amp; Dispatch Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-on-surface-variant font-medium">
                    {searchTerm 
                      ? 'No audit log records match your search filter.' 
                      : 'No audit records within the 60-day retention window.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const activity = getHumanReadableAction(log.action);
                  const isEmail = isEmailAction(log);
                  const isSystem = log.admin_user_id === 'SYSTEM';

                  return (
                    <tr key={log.id} className="hover:bg-surface-container-low/40 transition-colors">
                      {/* Date & Time */}
                      <td className="p-3.5 font-mono text-on-surface-variant text-[11px] whitespace-nowrap">
                        {(() => {
                          const d = new Date(log.created_at);
                          const timeStr = isNaN(d.getTime()) 
                            ? '' 
                            : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                          return (
                            <div className="flex flex-col">
                              <span className="font-bold text-on-surface">{formatDateDDMMYYYY(log.created_at)}</span>
                              <span className="text-[10px] text-gray-500">{timeStr}</span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Staff Member / System Automation */}
                      <td className="p-3.5 whitespace-nowrap">
                        {isSystem ? (
                          <div className="font-headline font-bold text-amber-800 flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 w-fit">
                            <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>System Automation</span>
                          </div>
                        ) : (
                          <div className="font-headline font-bold text-on-surface flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{log.admin_name || 'Staff Member'}</span>
                          </div>
                        )}
                      </td>

                      {/* Activity Performed */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-md font-headline font-bold text-xs border inline-flex items-center gap-1 ${activity.bg}`}>
                            {activity.isEmail && <Mail className="w-3 h-3 shrink-0" />}
                            {activity.label}
                          </span>
                        </div>
                      </td>

                      {/* Target Record & Details */}
                      <td className="p-3.5 text-on-surface-variant font-medium">
                        {isEmail ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded font-mono text-[11px] font-bold">
                                <Mail className="w-3 h-3 text-purple-700" />
                                {log.new_value?.recipient || log.entity_id}
                              </span>
                              {log.new_value?.status && (
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border ${
                                  log.new_value.status === 'sent' 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}>
                                  {log.new_value.status}
                                </span>
                              )}
                            </div>

                            {/* Additional metadata pills if available */}
                            {log.new_value?.period && (
                              <div className="text-[11px] text-gray-700 flex items-center gap-1 font-medium">
                                <span className="font-semibold text-gray-900">Period:</span> {log.new_value.period}
                                {log.new_value?.bookingsCount !== undefined && (
                                  <span className="text-gray-500">• {log.new_value.bookingsCount} bookings (₹{Number(log.new_value.netRevenue || 0).toLocaleString('en-IN')})</span>
                                )}
                              </div>
                            )}

                            {log.new_value?.attachmentFilename && (
                              <div className="text-[10px] text-emerald-800 font-mono flex items-center gap-1">
                                <FileSpreadsheet className="w-3 h-3 text-emerald-700" />
                                {log.new_value.attachmentFilename}
                              </div>
                            )}

                            {log.new_value?.bookingRef && (
                              <div className="text-[11px] text-gray-700 font-mono">
                                Ref: <span className="font-bold text-gray-900">{log.new_value.bookingRef}</span>
                                {log.new_value?.customerName && (
                                  <span className="font-sans text-gray-600"> • {log.new_value.customerName}</span>
                                )}
                                {log.new_value?.slot && (
                                  <span className="font-sans text-gray-500 text-[10px] block">Slot: {log.new_value.slot}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="bg-surface-container-low px-2 py-1 rounded font-mono text-[11px] border border-outline-variant/30 inline-block font-semibold">
                              {log.entity_type}: {log.entity_id}
                            </span>
                            {log.new_value && typeof log.new_value === 'object' && !Array.isArray(log.new_value) && (
                              <div className="text-[10px] text-gray-500 truncate max-w-md">
                                {Object.entries(log.new_value)
                                  .filter(([k]) => !['recipient', 'status'].includes(k))
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(' • ')}
                              </div>
                            )}
                          </div>
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
    </div>
  );
};
