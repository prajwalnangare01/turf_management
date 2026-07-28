import React from 'react';
import { store } from '../../services/store';
import { ShieldCheck, History } from 'lucide-react';

export const AuditLogViewer: React.FC = () => {
  const auditLogs = store.getAuditLogs();

  return (
    <div className="space-y-4">
      <div className="bg-[#131b2e] p-4 rounded-xl border border-[#24304f] flex justify-between items-center text-xs">
        <h2 className="font-bold text-white text-base flex items-center gap-2">
          <History className="w-5 h-5 text-emerald-400" /> Admin Audit Trail & Dispute Log
        </h2>
        <span className="text-gray-400">Total Audit Logs: {auditLogs.length}</span>
      </div>

      <div className="bg-[#131b2e] border border-[#24304f] rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0b0f19] border-b border-[#24304f] text-gray-400 font-semibold uppercase">
            <tr>
              <th className="p-3">Timestamp</th>
              <th className="p-3">Admin User</th>
              <th className="p-3">Action</th>
              <th className="p-3">Entity Type</th>
              <th className="p-3">Entity ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#24304f]/60">
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  No audit logs recorded yet. Perform admin actions to generate audit events.
                </td>
              </tr>
            ) : (
              auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-[#1a253e]/40">
                  <td className="p-3 font-mono text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="p-3 font-bold text-white">{log.admin_name}</td>
                  <td className="p-3 font-mono text-emerald-400 font-semibold">{log.action}</td>
                  <td className="p-3 text-gray-300">{log.entity_type}</td>
                  <td className="p-3 font-mono text-xs text-gray-400">{log.entity_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
