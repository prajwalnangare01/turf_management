import React from 'react';
import { store } from '../../services/store';
import { History, Shield } from 'lucide-react';

export const AuditLogViewer: React.FC = () => {
  const auditLogs = store.getAuditLogs();

  const getHumanReadableAction = (action: string) => {
    if (action.startsWith('UPDATE_BOOKING_STATUS_COMPLETED') || action === 'UPDATE_STATUS_completed') {
      return { label: 'Marked Booking Completed', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
    }
    if (action.startsWith('UPDATE_BOOKING_STATUS_NO_SHOW') || action === 'UPDATE_STATUS_no_show') {
      return { label: 'Marked Booking No-Show', bg: 'bg-amber-100 text-amber-900 border-amber-300' };
    }
    if (action.startsWith('UPDATE_BOOKING_STATUS_CANCELLED') || action === 'UPDATE_STATUS_cancelled') {
      return { label: 'Cancelled Reservation', bg: 'bg-red-100 text-red-900 border-red-300' };
    }
    if (action === 'CREATE_OFFLINE_BOOKING') {
      return { label: 'Created Walk-in Booking', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
    }
    if (action === 'CREATE_COURT') {
      return { label: 'Added New Pitch', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
    }
    if (action === 'UPDATE_COURT') {
      return { label: 'Updated Pitch Configuration', bg: 'bg-blue-100 text-blue-900 border-blue-300' };
    }
    if (action === 'DELETE_COURT') {
      return { label: 'Deleted Pitch', bg: 'bg-red-100 text-red-900 border-red-300' };
    }
    if (action === 'CREATE_BLOCKED_SLOT') {
      return { label: 'Blocked Pitch Maintenance', bg: 'bg-amber-100 text-amber-900 border-amber-300' };
    }
    if (action === 'DELETE_BLOCKED_SLOT') {
      return { label: 'Removed Pitch Maintenance Block', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
    }
    if (action === 'UPDATE_VENUE_SETTINGS') {
      return { label: 'Updated Venue Settings', bg: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
    }

    return { 
      label: action.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
      bg: 'bg-gray-100 text-gray-800 border-gray-300' 
    };
  };

  return (
    <div className="space-y-4 text-on-surface">
      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 flex justify-between items-center text-xs">
        <div>
          <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Staff Activity & Security History
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5 font-medium">Clear human-readable record of actions performed by venue staff.</p>
        </div>
        <span className="text-on-surface-variant font-headline font-bold bg-white px-3 py-1 rounded-lg border border-outline-variant/30">
          Total Activity Records: {auditLogs.length}
        </span>
      </div>

      <div className="bg-white border border-outline-variant/40 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-container-low border-b border-outline-variant/40 font-headline font-bold text-on-surface-variant uppercase tracking-wider">
            <tr>
              <th className="p-3.5">Date & Time</th>
              <th className="p-3.5">Staff Member</th>
              <th className="p-3.5">Activity Performed</th>
              <th className="p-3.5">Target Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-on-surface-variant font-medium">
                  No staff activity recorded yet. Staff operations will appear here automatically.
                </td>
              </tr>
            ) : (
              auditLogs.map(log => {
                const activity = getHumanReadableAction(log.action);

                return (
                  <tr key={log.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-3.5 font-mono text-on-surface-variant text-[11px]">
                      {new Date(log.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="p-3.5">
                      <div className="font-headline font-bold text-on-surface flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        <span>{log.admin_name}</span>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-1 rounded-md font-headline font-bold text-xs border inline-block ${activity.bg}`}>
                        {activity.label}
                      </span>
                    </td>
                    <td className="p-3.5 text-on-surface-variant font-medium">
                      <span className="bg-surface-container-low px-2 py-1 rounded font-mono text-[11px] border border-outline-variant/30">
                        {log.entity_type}: {log.entity_id}
                      </span>
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
