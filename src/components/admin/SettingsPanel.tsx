import React, { useState } from 'react';
import { store } from '../../services/store';
import { AdminUser } from '../../types/schema';
import { Sliders, Save, RefreshCw, MessageSquare } from 'lucide-react';

interface SettingsPanelProps {
  currentAdmin: AdminUser;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ currentAdmin }) => {
  const [venue, setVenue] = useState(store.getVenue());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdmin.role !== 'owner') {
      alert('Permission denied: Only Owners can modify venue settings.');
      return;
    }
    store.setVenue(venue);
    alert('Venue settings updated successfully!');
  };

  const handleReset = () => {
    if (confirm('Reset entire platform database to seed defaults? This will erase custom bookings.')) {
      store.resetToDefaults();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-[#131b2e] p-5 rounded-xl border border-[#24304f]">
        <h2 className="font-bold text-white text-base flex items-center gap-2 mb-4">
          <Sliders className="w-5 h-5 text-emerald-400" /> Platform & Venue Configuration
        </h2>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-300 font-semibold mb-1">Venue Name</label>
            <input
              type="text"
              value={venue.name}
              onChange={e => setVenue({ ...venue, name: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-gray-300 font-semibold mb-1">GST Identification Number</label>
            <input
              type="text"
              value={venue.gst_number}
              onChange={e => setVenue({ ...venue, gst_number: e.target.value })}
              className="input-field font-mono uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-300 font-semibold mb-1">Min Notice (Minutes)</label>
              <input
                type="number"
                value={venue.min_notice_minutes}
                onChange={e => setVenue({ ...venue, min_notice_minutes: parseInt(e.target.value) || 0 })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-gray-300 font-semibold mb-1">Max Advance Booking (Days)</label>
              <input
                type="number"
                value={venue.max_advance_days}
                onChange={e => setVenue({ ...venue, max_advance_days: parseInt(e.target.value) || 14 })}
                className="input-field"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#24304f] space-y-2">
            <p className="font-semibold text-white">Outbound Notification Channels</p>

            <label className="flex items-center gap-2 cursor-pointer text-gray-300">
              <input
                type="checkbox"
                checked={venue.whatsapp_enabled}
                onChange={e => setVenue({ ...venue, whatsapp_enabled: e.target.checked })}
                className="rounded accent-emerald-500"
              />
              Enable WhatsApp Primary Confirmation (Interakt / Meta API)
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-gray-300">
              <input
                type="checkbox"
                checked={venue.sms_fallback_enabled}
                onChange={e => setVenue({ ...venue, sms_fallback_enabled: e.target.checked })}
                className="rounded accent-emerald-500"
              />
              Enable Automatic SMS Fallback (MSG91 / Twilio)
            </label>
          </div>

          {currentAdmin.role === 'owner' && (
            <button type="submit" className="btn btn-primary w-full text-xs font-bold py-2.5 mt-2">
              <Save className="w-4 h-4" /> Save Venue Settings
            </button>
          )}
        </form>
      </div>

      <div className="bg-[#131b2e] p-5 rounded-xl border border-[#24304f] flex justify-between items-center">
        <div>
          <h3 className="font-bold text-white text-xs">Reset Platform Database</h3>
          <p className="text-[11px] text-gray-400">Restores all seed courts, bookings, and customer records.</p>
        </div>

        <button onClick={handleReset} className="btn btn-danger text-xs flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Reset Database
        </button>
      </div>
    </div>
  );
};
