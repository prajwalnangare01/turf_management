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
    <div className="space-y-6 max-w-2xl text-on-surface">
      <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/40 space-y-4">
        <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary" /> Venue & Operational Parameters
        </h2>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="block text-on-surface-variant font-headline font-bold mb-1">Venue Name</label>
            <input
              type="text"
              value={venue.name}
              onChange={e => setVenue({ ...venue, name: e.target.value })}
              className="form-input"
            />
          </div>

          <div>
            <label className="block text-on-surface-variant font-headline font-bold mb-1">GST Identification Number</label>
            <input
              type="text"
              value={venue.gst_number}
              onChange={e => setVenue({ ...venue, gst_number: e.target.value })}
              className="form-input font-mono uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-surface-variant font-headline font-bold mb-1">Min Notice (Minutes)</label>
              <input
                type="number"
                value={venue.min_notice_minutes}
                onChange={e => setVenue({ ...venue, min_notice_minutes: parseInt(e.target.value) || 0 })}
                className="form-input"
              />
            </div>
            <div>
              <label className="block text-on-surface-variant font-headline font-bold mb-1">Max Advance Booking (Days)</label>
              <input
                type="number"
                value={venue.max_advance_days}
                onChange={e => setVenue({ ...venue, max_advance_days: parseInt(e.target.value) || 14 })}
                className="form-input"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-outline-variant/30 space-y-3">
            <p className="font-headline font-bold text-sm text-on-surface">Outbound Notification Channels</p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 font-medium text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={venue.whatsapp_enabled}
                  onChange={e => setVenue({ ...venue, whatsapp_enabled: e.target.checked })}
                  className="rounded accent-primary"
                />
                WhatsApp Instant Receipt Dispatch
              </label>

              <label className="flex items-center gap-2 font-medium text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={venue.sms_fallback_enabled}
                  onChange={e => setVenue({ ...venue, sms_fallback_enabled: e.target.checked })}
                  className="rounded accent-primary"
                />
                SMS Gateway Fallback
              </label>
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <button type="submit" className="btn-primary text-xs px-6 py-2.5 font-headline font-bold flex items-center gap-1.5 shadow-sm">
              <Save className="w-4 h-4" /> Save Configuration
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="btn-secondary text-xs px-4 py-2.5 font-bold text-red-700 hover:bg-red-50 flex items-center gap-1.5 ml-auto"
            >
              <RefreshCw className="w-4 h-4 text-red-600" /> Reset Database to Seed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
