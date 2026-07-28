import React, { useState } from 'react';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser } from '../../types/schema';
import { Users, Search, AlertOctagon, ShieldCheck, Phone } from 'lucide-react';

interface CustomerCRMProps {
  currentAdmin: AdminUser;
}

export const CustomerCRM: React.FC<CustomerCRMProps> = ({ currentAdmin }) => {
  const [search, setSearch] = useState('');
  const customers = store.getCustomers();

  const filtered = customers.filter(
    c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const toggleBlacklist = (customerId: string) => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can toggle customer blacklist status.');
      return;
    }

    const updated = customers.map(c => {
      if (c.id === customerId) {
        const nextState = !c.is_blacklisted;
        AuditLogger.log(currentAdmin.id, nextState ? 'BLACKLIST_CUSTOMER' : 'UNBLACKLIST_CUSTOMER', 'Customer', customerId);
        return { ...c, is_blacklisted: nextState };
      }
      return c;
    });

    store.setCustomers(updated);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#131b2e] p-4 rounded-xl border border-[#24304f] flex justify-between items-center text-xs">
        <h2 className="font-bold text-white text-base flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" /> Customer CRM & Blacklist Management
        </h2>
        <div className="flex items-center gap-2 max-w-xs">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field py-1"
          />
        </div>
      </div>

      <div className="bg-[#131b2e] border border-[#24304f] rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0b0f19] border-b border-[#24304f] text-gray-400 font-semibold uppercase">
            <tr>
              <th className="p-3">Customer Name</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Total Bookings</th>
              <th className="p-3">Total Spent</th>
              <th className="p-3">No-Shows</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#24304f]/60">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#1a253e]/40">
                <td className="p-3 font-bold text-white">{c.name}</td>
                <td className="p-3 font-mono text-gray-300">+91 {c.phone}</td>
                <td className="p-3 font-bold text-emerald-400">{c.total_bookings}</td>
                <td className="p-3 font-bold text-white">₹{c.total_spent}</td>
                <td className="p-3">
                  <span className={`font-bold ${c.no_show_count > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {c.no_show_count}
                  </span>
                </td>
                <td className="p-3">
                  {c.is_blacklisted ? (
                    <span className="badge badge-online flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3" /> Blacklisted
                    </span>
                  ) : (
                    <span className="badge badge-available flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Active
                    </span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => toggleBlacklist(c.id)}
                    className={`btn text-xs py-1 px-2.5 ${
                      c.is_blacklisted ? 'btn-primary' : 'btn-danger'
                    }`}
                  >
                    {c.is_blacklisted ? 'Un-blacklist' : 'Blacklist'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
