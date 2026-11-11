import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { store } from '../../services/store';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, CancellationPolicy, CancellationSettings } from '../../types/schema';
import { Sliders, Save, RefreshCw, MessageSquare, DollarSign, Clock, PlusCircle, Trash2, ShieldCheck, ArrowRight, AlertCircle, RotateCcw, Mail, Send, CheckCircle2, Database, Radio, MapPin, QrCode, ExternalLink, Info } from 'lucide-react';
import { getSupabaseConfig, setSupabaseConfig, clearSupabaseConfig, testSupabaseConnection, isSupabaseConfigured } from '../../services/supabaseClient';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { EmailService } from '../../services/emailService';

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

  // Venue Settings & Gate Pass Location QR States
  const [venueQrDataUrl, setVenueQrDataUrl] = useState<string>('');
  const [venueSuccessMsg, setVenueSuccessMsg] = useState<string | null>(null);

  // Real-time Venue Location QR Code generation for testing & verification
  useEffect(() => {
    const targetUrl = venue.location_url || venue.google_maps_link || `https://maps.google.com/?q=${encodeURIComponent(venue.name + ', ' + venue.address)}`;
    if (!targetUrl) {
      setVenueQrDataUrl('');
      return;
    }
    QRCode.toDataURL(targetUrl, { margin: 1, width: 180 })
      .then(url => setVenueQrDataUrl(url))
      .catch(() => setVenueQrDataUrl(''));
  }, [venue.location_url, venue.google_maps_link, venue.name, venue.address]);

  // Supabase Sync State
  const [supabaseConfig, setSupabaseConfigState] = useState(() => getSupabaseConfig());
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(supabaseConfig.url);
  const [supabaseKeyInput, setSupabaseKeyInput] = useState(supabaseConfig.anonKey);
  const [supabaseTestLoading, setSupabaseTestLoading] = useState(false);
  const [supabaseTestResult, setSupabaseTestResult] = useState<{
    connected: boolean;
    message: string;
    venue?: any;
    stats?: { courts: number; bookings: number; customers: number };
  } | null>(null);
  const [supabaseSyncLoading, setSupabaseSyncLoading] = useState(false);

  const handleTestSupabase = async () => {
    setSupabaseTestLoading(true);
    setSupabaseTestResult(null);
    try {
      const res = await testSupabaseConnection();
      setSupabaseTestResult(res);
    } catch (err: any) {
      setSupabaseTestResult({ connected: false, message: err.message });
    } finally {
      setSupabaseTestLoading(false);
    }
  };

  const handleSaveSupabaseConfig = async () => {
    setSupabaseConfig(supabaseUrlInput, supabaseKeyInput);
    setSupabaseConfigState(getSupabaseConfig());
    setSupabaseSyncLoading(true);
    try {
      await SupabaseSyncService.init();
      await handleTestSupabase();
      alert('Supabase credentials saved and synced successfully!');
    } catch (e: any) {
      alert('Saved, but sync encountered error: ' + e.message);
    } finally {
      setSupabaseSyncLoading(false);
    }
  };

  const handleClearSupabaseConfig = () => {
    if (confirm('Revert to default environment variables for Supabase?')) {
      clearSupabaseConfig();
      const cfg = getSupabaseConfig();
      setSupabaseConfigState(cfg);
      setSupabaseUrlInput(cfg.url);
      setSupabaseKeyInput(cfg.anonKey);
      setSupabaseTestResult(null);
    }
  };

  const handleForceFullSync = async () => {
    setSupabaseSyncLoading(true);
    try {
      const ok = await SupabaseSyncService.hydrateFromSupabase();
      if (ok) {
        alert('Successfully re-synced all tables from Supabase PostgreSQL!');
      } else {
        alert('Supabase hydration completed (running with local cache).');
      }
    } catch (err: any) {
      alert('Sync failed: ' + err.message);
    } finally {
      setSupabaseSyncLoading(false);
    }
  };

  // Resend Email Test State
  const [testEmailRecipient, setTestEmailRecipient] = useState(currentAdmin.email || 'delivered@resend.dev');
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string; simulated?: boolean } | null>(null);

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) return;
    if (EmailService.isResendSenderEmail(testEmailRecipient)) {
      setTestEmailResult({
        success: false,
        message: `You can't send on this email (${testEmailRecipient}) — it is the sender email! Both sender and recipient cannot be the same. Please provide a different recipient email.`
      });
      return;
    }
    setTestEmailLoading(true);
    setTestEmailResult(null);
    try {
      const result = await EmailService.sendTestEmail(testEmailRecipient, venue.name);
      setTestEmailLoading(false);
      if (result.success) {
        setTestEmailResult({
          success: true,
          message: result.simulated
            ? `Simulation successful! Email logged for ${testEmailRecipient} (Add RESEND_API_KEY in .env for live dispatch)`
            : `Live email successfully delivered to ${testEmailRecipient} via Resend API (ID: ${result.id})!`,
          simulated: result.simulated
        });
      } else {
        setTestEmailResult({
          success: false,
          message: result.error || 'Failed to dispatch test email.'
        });
      }
    } catch (err: any) {
      setTestEmailLoading(false);
      setTestEmailResult({
        success: false,
        message: err.message || 'Error sending test email'
      });
    }
  };

  const handleSaveVenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdmin.role === 'staff') {
      alert('Permission denied: Staff accounts cannot modify venue parameters. Only Owners and Managers can update venue settings.');
      return;
    }
    const targetMapUrl = venue.location_url || venue.google_maps_link || `https://maps.google.com/?q=${encodeURIComponent(venue.name + ', ' + venue.address)}`;
    const updatedVenue = {
      ...venue,
      location_url: targetMapUrl,
      google_maps_link: targetMapUrl
    };

    setVenue(updatedVenue);
    store.setVenue(updatedVenue);
    AuditLogger.log(currentAdmin.id, 'UPDATE_VENUE_SETTINGS', 'Venue', venue.id, null, updatedVenue);

    // Sync to backend server
    try {
      fetch('/api/venue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue: updatedVenue })
      }).catch(() => {});
    } catch {}

    // Sync to Supabase
    SupabaseSyncService.syncVenueToSupabase(updatedVenue).catch(() => {});

    setVenueSuccessMsg('Venue settings, address, and Google Maps location QR link updated successfully!');
    setTimeout(() => setVenueSuccessMsg(null), 5000);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/30 pb-3">
          <div>
            <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
              <Sliders className="w-5 h-5 text-primary" /> Venue Location, Identity & Operational Parameters
            </h2>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5">
              Configure turf address, Google Maps navigation link (encoded into Gate Pass QR), tax details, and channels.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-1 rounded-full shrink-0">
            {currentAdmin.role === 'staff' ? 'View Only (Staff)' : 'Admin Authority: Editable'}
          </span>
        </div>

        {venueSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{venueSuccessMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveVenue} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-on-surface-variant font-headline font-bold mb-1">Venue Display Name *</label>
              <input
                type="text"
                required
                value={venue.name}
                disabled={currentAdmin.role === 'staff'}
                onChange={e => setVenue({ ...venue, name: e.target.value })}
                className="form-input"
              />
            </div>
            <div>
              <label className="block text-on-surface-variant font-headline font-bold mb-1">Helpdesk / Owner Contact Phone *</label>
              <input
                type="text"
                required
                value={venue.contact_phone}
                disabled={currentAdmin.role === 'staff'}
                onChange={e => setVenue({ ...venue, contact_phone: e.target.value })}
                className="form-input font-mono"
              />
            </div>
          </div>

          {/* TURF LOCATION & GATE PASS GOOGLE MAPS QR CONFIGURATION */}
          <div className="p-4 bg-white rounded-xl border border-outline-variant/60 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                <h3 className="font-headline font-bold text-sm text-on-surface">
                  Turf Physical Address & Google Maps Navigation Link
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <QrCode className="w-3 h-3 text-emerald-600" /> Embedded in Gate Pass
              </span>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Admin Authority: Update the venue physical address and Google Maps directions link below. When updated, the new address and Google Maps link will appear across all Gate Passes, PDF receipts, WhatsApp notifications, and will be automatically encoded into the scannable Gate Pass Location QR Code.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start pt-1">
              <div className="md:col-span-8 space-y-3">
                {/* Physical Address */}
                <div>
                  <label className="block text-on-surface-variant font-headline font-bold mb-1">
                    Venue Physical Address *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={venue.address}
                    disabled={currentAdmin.role === 'staff'}
                    onChange={e => setVenue({ ...venue, address: e.target.value })}
                    placeholder="e.g. Plot 42, Sports Enclave, Near Viman Nagar, Pune, Maharashtra 411045"
                    className="form-input text-xs resize-none"
                  />
                  <p className="text-[10.5px] text-on-surface-variant mt-0.5">
                    Printed at the bottom of customer Gate Passes, PDF passes, tax receipts, and booking alerts.
                  </p>
                </div>

                {/* Google Maps Location URL */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-on-surface-variant font-headline font-bold">
                      Google Maps Location Link (URL) *
                    </label>
                    {(venue.location_url || venue.google_maps_link) && (
                      <a
                        href={venue.location_url || venue.google_maps_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10.5px] font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Test in Google Maps
                      </a>
                    )}
                  </div>
                  <input
                    type="url"
                    required
                    value={venue.location_url || venue.google_maps_link || ''}
                    disabled={currentAdmin.role === 'staff'}
                    onChange={e => setVenue({ 
                      ...venue, 
                      location_url: e.target.value,
                      google_maps_link: e.target.value 
                    })}
                    placeholder="https://maps.google.com/?q=18.5204,73.8567"
                    className="form-input text-xs font-mono"
                  />
                  <p className="text-[10.5px] text-on-surface-variant mt-0.5">
                    This exact Google Maps link is encoded into the Gate Pass QR code. Scanning the QR code with any mobile camera immediately opens Google Maps navigation.
                  </p>
                </div>
              </div>

              {/* Real-time Location QR Code Preview */}
              <div className="md:col-span-4 bg-surface-container-low rounded-xl p-3.5 border border-outline-variant/40 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1 flex items-center gap-1">
                  <QrCode className="w-3 h-3 text-primary" /> Live Gate Pass QR
                </span>
                {venueQrDataUrl ? (
                  <div className="p-1.5 bg-white rounded-lg border border-outline-variant/40 shadow-2xs my-1">
                    <img 
                      src={venueQrDataUrl} 
                      alt="Turf Location QR Code" 
                      className="w-24 h-24 sm:w-28 sm:h-28 object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 bg-surface-container rounded-lg flex items-center justify-center border border-dashed border-outline-variant/40 my-1">
                    <QrCode className="w-8 h-8 text-on-surface-variant/40 animate-pulse" />
                  </div>
                )}
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-1">
                  Gate Pass QR Ready
                </span>
                <span className="text-[9.5px] text-on-surface-variant mt-1 leading-tight">
                  Scan with your phone to test navigation directly to the turf.
                </span>
              </div>
            </div>
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
            <div className="flex items-center justify-between">
              <p className="font-headline font-bold text-sm text-on-surface">Outbound Notification Channels</p>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                EmailService.isResendConfigured()
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                {EmailService.isResendConfigured() ? '⚡ Resend API Active' : '🧪 Resend Simulation Mode'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 font-medium text-xs cursor-pointer p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30">
                <input
                  type="checkbox"
                  checked={venue.whatsapp_enabled}
                  onChange={e => setVenue({ ...venue, whatsapp_enabled: e.target.checked })}
                  className="rounded accent-primary"
                />
                <span>WhatsApp Instant Dispatch</span>
              </label>

              <label className="flex items-center gap-2 font-medium text-xs cursor-pointer p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30">
                <input
                  type="checkbox"
                  checked={venue.sms_fallback_enabled}
                  onChange={e => setVenue({ ...venue, sms_fallback_enabled: e.target.checked })}
                  className="rounded accent-primary"
                />
                <span>SMS Gateway Fallback</span>
              </label>

              <label className="flex items-center gap-2 font-medium text-xs cursor-pointer p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30">
                <input
                  type="checkbox"
                  checked={venue.email_enabled !== false}
                  onChange={e => setVenue({ ...venue, email_enabled: e.target.checked })}
                  className="rounded accent-primary"
                />
                <span>Resend Email Dispatch</span>
              </label>
            </div>

            {/* Resend Email Configuration & Live Test */}
            <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Resend From / Sender Address
                  </label>
                  <input
                    type="text"
                    value={venue.email_sender || 'TurfFlow Arena <rajupainter84688@gmail.com>'}
                    onChange={e => setVenue({ ...venue, email_sender: e.target.value })}
                    placeholder="TurfFlow Arena <rajupainter84688@gmail.com>"
                    className="form-input text-xs"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Active Sender: <code className="bg-surface-container px-1 py-0.5 rounded text-primary font-bold">rajupainter84688@gmail.com</code> (TurfFlow Arena)
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Send Test Email via Resend
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmailRecipient}
                      onChange={e => setTestEmailRecipient(e.target.value)}
                      placeholder="e.g. delivered@resend.dev or your email"
                      className="form-input text-xs flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleSendTestEmail}
                      disabled={testEmailLoading || !testEmailRecipient}
                      className="btn-secondary text-xs px-3 py-1.5 font-bold flex items-center gap-1.5 border-primary/40 text-primary hover:bg-primary/5 shrink-0"
                    >
                      {testEmailLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Test Resend</span>
                    </button>
                  </div>
                  {/* Resend Sender Email Conflict Notice (No Brackets) */}
                  {EmailService.isResendSenderEmail(testEmailRecipient) ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-red-800 bg-red-50 border border-red-300 px-2.5 py-1.5 rounded-lg mt-2 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span><strong>You can't send to this email — it's the sender email!</strong> Please enter a separate test recipient.</span>
                    </div>
                  ) : testEmailRecipient.trim().includes('@') ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg mt-2 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Recipient is distinct from sender. Ready for dispatch.</span>
                    </div>
                  ) : null}
                  <p className="text-[10px] text-on-surface-variant mt-1.5">
                    Tip: Use a separate test inbox or <code className="bg-surface-container px-1 py-0.5 rounded text-primary font-bold">delivered@resend.dev</code> for sandbox verification.
                  </p>
                </div>
              </div>

              {testEmailResult && (
                <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  testEmailResult.success
                    ? testEmailResult.simulated
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {testEmailResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span>{testEmailResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* 6. Supabase Cloud Database & Realtime Sync Card */}
          <div className="card p-6 border-slate-200/80 bg-white/95 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-base text-slate-800 flex items-center gap-2">
                    Supabase PostgreSQL & Realtime Synchronization
                    {isSupabaseConfigured() ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Live Supabase Sync
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span> Local Cache (Demo Mode)
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Synchronizes bookings, slot locks, and customer data in real time between Website and WhatsApp Bot.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleForceFullSync}
                  disabled={supabaseSyncLoading}
                  className="btn-secondary text-xs px-3 py-1.5 font-bold flex items-center gap-1.5"
                  title="Pull latest bookings, courts, and customers from Supabase"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${supabaseSyncLoading ? 'animate-spin' : ''}`} />
                  <span>Resync All</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 flex items-center justify-between">
                  <span>Supabase Project URL (VITE_SUPABASE_URL)</span>
                  {supabaseConfig.isCustom && (
                    <span className="text-[10px] text-primary font-mono">(Custom Override Active)</span>
                  )}
                </label>
                <input
                  type="url"
                  value={supabaseUrlInput}
                  onChange={e => setSupabaseUrlInput(e.target.value)}
                  placeholder="https://your-project-id.supabase.co"
                  className="input-field font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400">Found in Supabase Dashboard -&gt; Project Settings -&gt; API</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">
                  Supabase Anon Key (VITE_SUPABASE_ANON_KEY)
                </label>
                <input
                  type="password"
                  value={supabaseKeyInput}
                  onChange={e => setSupabaseKeyInput(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="input-field font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400">Public browser key with Row-Level Security (RLS) enforcement</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSaveSupabaseConfig}
                disabled={supabaseSyncLoading}
                className="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Credentials & Connect</span>
              </button>

              <button
                type="button"
                onClick={handleTestSupabase}
                disabled={supabaseTestLoading}
                className="btn-secondary text-xs px-4 py-2 font-bold flex items-center gap-1.5 border-slate-300 hover:bg-slate-50"
              >
                {supabaseTestLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" /> : <Radio className="w-3.5 h-3.5 text-emerald-600" />}
                <span>Test Live Connection</span>
              </button>

              {supabaseConfig.isCustom && (
                <button
                  type="button"
                  onClick={handleClearSupabaseConfig}
                  className="text-xs text-slate-500 hover:text-slate-800 underline px-2 py-1"
                >
                  Clear Custom Credentials
                </button>
              )}

              <div className="ml-auto flex items-center gap-2">
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
                >
                  Supabase Dashboard &rarr;
                </a>
              </div>
            </div>

            {/* Test Connection Output Banner */}
            {supabaseTestResult && (
              <div className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                supabaseTestResult.connected
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}>
                {supabaseTestResult.connected ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <div className="font-bold flex items-center justify-between">
                    <span>{supabaseTestResult.message}</span>
                    {supabaseTestResult.venue && (
                      <span className="text-[11px] font-mono font-normal opacity-75">
                        Venue: {supabaseTestResult.venue.name}
                      </span>
                    )}
                  </div>
                  {supabaseTestResult.stats && (
                    <div className="flex items-center gap-4 text-[11px] pt-1 text-emerald-700 font-mono">
                      <span>Courts: {supabaseTestResult.stats.courts}</span>
                      <span>Bookings: {supabaseTestResult.stats.bookings}</span>
                      <span>Customers: {supabaseTestResult.stats.customers}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Schema Migration Helper */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between font-semibold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Automated Database Setup & Schema Deployment
                </span>
                <span className="text-[11px] text-slate-500 font-mono">supabase_setup.sql</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Run the included schema in your Supabase project with one click: Open your Supabase Dashboard, navigate to the <b>SQL Editor</b>, paste the contents of <code>supabase_setup.sql</code> (in the project root), and click <b>Run</b>. It creates all 15 tables, activates Supabase Realtime publication on bookings, and installs the Layer-2 Concurrency Unique Index.
              </p>
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
