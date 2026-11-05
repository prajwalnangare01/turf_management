import React, { useState } from 'react';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, CancellationPolicy, CancellationSettings } from '../../types/schema';
import { Sliders, Save, RefreshCw, MessageSquare, DollarSign, Clock, PlusCircle, Trash2, ShieldCheck, ArrowRight, AlertCircle, RotateCcw } from 'lucide-react';

interface SettingsPanelProps {
  currentAdmin: AdminUser;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ currentAdmin }) => {
  const [venue, setVenue] = useState(store.getVenue());
  const [policies, setPolicies] = useState<CancellationPolicy[]>(() => {
    return [...store.getCancellationPolicies()].sort((a, b) => b.hours_before_start - a.hours_before_start);
  });

  // Primary Cancellation Terms (Till what time booking can be cancelled & refund %)
  const [cancellationSettings, setCancellationSettingsState] = useState<CancellationSettings>(() => {
    return store.getCancellationSettings();
  });

  // New policy tier inputs
  const [newHours, setNewHours] = useState<number>(12);
  const [newPercentage, setNewPercentage] = useState<number>(75);
  const [newLabel, setNewLabel] = useState<string>('Partial Refund (12h+ notice)');
  const [policySuccessMsg, setPolicySuccessMsg] = useState<string | null>(null);

  const handleSaveVenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdmin.role !== 'owner') {
      alert('Permission denied: Only Owners can modify venue parameters.');
      return;
    }
    store.setVenue(venue);
    AuditLogger.log(currentAdmin.id, 'UPDATE_VENUE_SETTINGS', 'Venue', venue.id, null, venue);
    alert('Venue settings updated successfully!');
  };

  const handleSaveCancellationTerms = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can configure cancellation terms.');
      return;
    }
    store.setCancellationSettings(cancellationSettings);
    AuditLogger.log(currentAdmin.id, 'UPDATE_CANCELLATION_TERMS', 'CancellationSettings', 'global', null, cancellationSettings);
    setPolicySuccessMsg(`Saved Terms: Cancellations allowed until ${cancellationSettings.cutoff_hours}h before match for ${cancellationSettings.refund_percentage}% refund (${cancellationSettings.processing_business_days} business days).`);
    setTimeout(() => setPolicySuccessMsg(null), 4000);
  };

  const handleAddPolicyTier = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can configure refund policies.');
      return;
    }

    if (newHours < 0 || newPercentage < 0 || newPercentage > 100) {
      alert('Hours must be 0 or more, and refund percentage must be between 0% and 100%.');
      return;
    }

    const newTier: CancellationPolicy = {
      id: `cp-${Date.now()}`,
      hours_before_start: Number(newHours),
      refund_percentage: Number(newPercentage),
      label: newLabel.trim() || `${newPercentage}% Refund (${newHours}h+ notice)`
    };

    const updated = [...policies, newTier].sort((a, b) => b.hours_before_start - a.hours_before_start);
    setPolicies(updated);
    store.setCancellationPolicies(updated);
    AuditLogger.log(currentAdmin.id, 'ADD_REFUND_POLICY_TIER', 'CancellationPolicy', newTier.id, null, newTier);

    setPolicySuccessMsg(`Added new refund tier: ${newTier.refund_percentage}% refund for cancellations ${newTier.hours_before_start}h before match.`);
    setTimeout(() => setPolicySuccessMsg(null), 4000);
  };

  const handleDeletePolicyTier = (id: string) => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can delete refund policy tiers.');
      return;
    }

    if (policies.length <= 1) {
      alert('You must keep at least one refund policy tier.');
      return;
    }

    const updated = policies.filter(p => p.id !== id);
    setPolicies(updated);
    store.setCancellationPolicies(updated);
    AuditLogger.log(currentAdmin.id, 'DELETE_REFUND_POLICY_TIER', 'CancellationPolicy', id);
    setPolicySuccessMsg('Refund policy tier removed.');
    setTimeout(() => setPolicySuccessMsg(null), 4000);
  };

  const handleUpdatePolicyTierField = (id: string, field: 'hours_before_start' | 'refund_percentage' | 'label', val: any) => {
    if (currentAdmin.role === 'staff') return;

    const updated = policies.map(p => {
      if (p.id === id) {
        return { ...p, [field]: field === 'label' ? val : Number(val) };
      }
      return p;
    }).sort((a, b) => b.hours_before_start - a.hours_before_start);

    setPolicies(updated);
    store.setCancellationPolicies(updated);
  };

  const handleResetPolicyDefaults = () => {
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Only Owners and Managers can reset refund policies.');
      return;
    }
    const defaults: CancellationPolicy[] = [
      { id: 'cp-001', hours_before_start: 24, refund_percentage: 100, label: 'Full Refund (24h+ notice)' },
      { id: 'cp-002', hours_before_start: 6, refund_percentage: 50, label: 'Half Refund (6h–24h notice)' },
      { id: 'cp-003', hours_before_start: 0, refund_percentage: 0, label: 'No Refund (< 6h notice)' }
    ];
    setPolicies(defaults);
    store.setCancellationPolicies(defaults);
    AuditLogger.log(currentAdmin.id, 'RESET_REFUND_POLICIES_DEFAULT', 'CancellationPolicy', 'all');
    setPolicySuccessMsg('Refund policies reset to standard defaults (24h=100%, 6h=50%, 0h=0%).');
    setTimeout(() => setPolicySuccessMsg(null), 4000);
  };

  const handleResetDatabase = () => {
    if (currentAdmin.role !== 'owner') {
      alert('Permission denied: Only the Venue Owner can wipe the database.');
      return;
    }
    if (confirm('Completely clear entire database? This will erase all bookings, payments, locks, and custom records.')) {
      store.clearAllData();
      alert('Database cleared successfully!');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl text-on-surface">
      
      {/* SECTION 1: CANCELLATION & REFUND MECHANISM CONTROL */}
      <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/40 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/30 pb-3">
          <div>
            <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-700" /> Cancellation & Refund Policy Rules
            </h2>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5">
              Control the time notice window and refund percentage returned to customers upon reservation cancellation.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetPolicyDefaults}
            className="btn-secondary text-[11px] px-3 py-1.5 font-bold flex items-center gap-1.5 shrink-0"
            title="Reset to 24h=100%, 6h=50%, 0h=0%"
          >
            <RotateCcw className="w-3.5 h-3.5 text-primary" /> Reset Defaults
          </button>
        </div>

        {policySuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{policySuccessMsg}</span>
          </div>
        )}

        {/* PRIMARY CANCELLATION TERMS & CONDITIONS INPUTS */}
        <form onSubmit={handleSaveCancellationTerms} className="bg-white p-4 rounded-xl border border-outline-variant/60 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="font-headline font-bold text-sm text-on-surface">
                Primary Cancellation Cut-Off & Refund Rules
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              Customer Self-Service Policy
            </span>
          </div>

          <p className="text-xs text-on-surface-variant">
            Set the cut-off notice deadline and refund percentage. When a user cancels, they receive a refund only if they cancel before this time window.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Input 1: Till what time any booking can be cancelled */}
            <div className="space-y-1">
              <label className="block text-xs font-headline font-bold text-on-surface">
                Cancellation Notice Cut-Off *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={168}
                  required
                  value={cancellationSettings.cutoff_hours}
                  disabled={currentAdmin.role === 'staff'}
                  onChange={e => setCancellationSettingsState(prev => ({
                    ...prev,
                    cutoff_hours: Math.max(1, parseInt(e.target.value) || 1)
                  }))}
                  className="form-input py-2 text-xs font-bold text-primary w-full pr-14"
                />
                <span className="absolute right-3 top-2.5 text-xs text-on-surface-variant font-bold pointer-events-none">
                  Hours
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant">
                Cancel before this time to get refund (e.g. 6 hours).
              </p>
            </div>

            {/* Input 2: How much will be refunded */}
            <div className="space-y-1">
              <label className="block text-xs font-headline font-bold text-on-surface">
                Eligible Refund Percentage *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={cancellationSettings.refund_percentage}
                  disabled={currentAdmin.role === 'staff'}
                  onChange={e => setCancellationSettingsState(prev => ({
                    ...prev,
                    refund_percentage: Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                  }))}
                  className="form-input py-2 text-xs font-bold text-primary w-full pr-10"
                />
                <span className="absolute right-3 top-2.5 text-xs text-on-surface-variant font-bold pointer-events-none">
                  %
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant">
                % of paid amount refunded if terms are met (e.g. 100%).
              </p>
            </div>

            {/* Input 3: Settlement Timeline (Business Days) */}
            <div className="space-y-1">
              <label className="block text-xs font-headline font-bold text-on-surface">
                Processing Timeline *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={cancellationSettings.processing_business_days}
                  disabled={currentAdmin.role === 'staff'}
                  onChange={e => setCancellationSettingsState(prev => ({
                    ...prev,
                    processing_business_days: e.target.value
                  }))}
                  placeholder="e.g. 5-7"
                  className="form-input py-2 text-xs font-bold text-on-surface w-full pr-24"
                />
                <span className="absolute right-3 top-2.5 text-[11px] text-on-surface-variant font-medium pointer-events-none">
                  Business Days
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant">
                Displayed to user in cancellation confirmation popup.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-outline-variant/20">
            <div className="text-[11px] text-on-surface-variant">
              <span>Rule Summary: </span>
              <strong className="text-primary font-bold">
                Cancel ≥ {cancellationSettings.cutoff_hours}h prior → {cancellationSettings.refund_percentage}% refund ({cancellationSettings.processing_business_days} business days). Cancel &lt; {cancellationSettings.cutoff_hours}h → ₹0 refund.
              </strong>
            </div>

            {currentAdmin.role !== 'staff' && (
              <button
                type="submit"
                className="btn-primary text-xs py-1.5 px-4 font-bold flex items-center gap-1.5 shadow-xs shrink-0 self-end sm:self-auto"
              >
                <Save className="w-3.5 h-3.5" /> Save Terms
              </button>
            )}
          </div>
        </form>

        {/* Active Policy Tiers Table */}
        <div className="space-y-3">
          <span className="font-headline font-bold text-xs uppercase tracking-wider text-on-surface-variant block">
            Active Refund Window Tiers (Sorted by notice hours)
          </span>

          <div className="grid gap-2.5">
            {policies.map((p, idx) => (
              <div 
                key={p.id}
                className="bg-white p-3.5 rounded-xl border border-outline-variant/50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0 font-mono">
                    {idx + 1}
                  </span>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <strong className="font-headline font-bold text-sm text-on-surface">
                        ≥ {p.hours_before_start} Hours Notice
                      </strong>
                      <span className={`px-2 py-0.5 rounded-full font-headline font-bold text-[11px] ${
                        p.refund_percentage >= 100 
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : p.refund_percentage > 0
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-red-100 text-red-900 border border-red-300'
                      }`}>
                        {p.refund_percentage}% Refund
                      </span>
                    </div>
                    <span className="text-[11px] text-on-surface-variant font-medium block">
                      {p.label || `Eligible for ${p.refund_percentage}% refund if cancelled ≥ ${p.hours_before_start}h prior`}
                    </span>
                  </div>
                </div>

                {/* Inline Editing Controls */}
                <div className="flex items-center gap-2 self-end md:self-auto">
                  <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-lg border border-outline-variant/30">
                    <span className="text-[10px] font-bold text-on-surface-variant">Hours:</span>
                    <input
                      type="number"
                      min={0}
                      value={p.hours_before_start}
                      disabled={currentAdmin.role === 'staff'}
                      onChange={e => handleUpdatePolicyTierField(p.id, 'hours_before_start', e.target.value)}
                      className="w-14 bg-white border border-outline-variant/40 rounded px-1.5 py-0.5 text-xs font-bold text-center"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-lg border border-outline-variant/30">
                    <span className="text-[10px] font-bold text-on-surface-variant">Refund %:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={p.refund_percentage}
                      disabled={currentAdmin.role === 'staff'}
                      onChange={e => handleUpdatePolicyTierField(p.id, 'refund_percentage', e.target.value)}
                      className="w-14 bg-white border border-outline-variant/40 rounded px-1.5 py-0.5 text-xs font-bold text-center text-primary"
                    />
                  </div>

                  {currentAdmin.role !== 'staff' && (
                    <button
                      type="button"
                      onClick={() => handleDeletePolicyTier(p.id)}
                      className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition"
                      title="Delete this tier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add New Refund Tier Form */}
        {currentAdmin.role !== 'staff' && (
          <form onSubmit={handleAddPolicyTier} className="bg-white p-4 rounded-xl border border-dashed border-primary/40 space-y-3 text-xs">
            <span className="font-headline font-bold text-xs text-primary flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-primary" /> Add Custom Refund Window Tier
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Hours Notice Threshold *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={newHours}
                  onChange={e => setNewHours(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 12"
                  className="form-input font-bold"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Refund Percentage (0 - 100%) *</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={newPercentage}
                  onChange={e => setNewPercentage(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 75"
                  className="form-input font-bold text-primary"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant font-headline font-bold mb-1">Tier Description Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. 75% Refund (12h+ notice)"
                  className="form-input"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary text-xs px-4 py-2 font-headline font-bold flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Append Refund Tier
            </button>
          </form>
        )}

        {/* Live Example Card */}
        <div className="bg-primary/5 border border-primary/20 p-3.5 rounded-xl text-xs space-y-1 text-primary">
          <strong className="font-headline font-bold block">💡 How Customer Cancellation Refunds Work:</strong>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            When a customer cancels via their portal or self-service lookup, the system calculates the exact hours remaining until match start. The highest matching tier is applied to credit the refund automatically and release the reserved pitch.
          </p>
        </div>
      </div>

      {/* SECTION 2: VENUE OPERATIONAL PARAMETERS */}
      <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/40 space-y-4">
        <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary" /> Venue & Operational Parameters
        </h2>

        <form onSubmit={handleSaveVenue} className="space-y-4 text-xs">
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
              onClick={handleResetDatabase}
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
