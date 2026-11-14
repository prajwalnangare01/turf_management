import React, { useState } from 'react';
import { store } from '../../services/store';
import { AdminUser } from '../../types/schema';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { AuditLogger } from '../../services/auditLogger';
import { AuthService } from '../../services/authService';
import { 
  Trash2, Database, AlertTriangle, CheckCircle2, X, RefreshCw, 
  ShieldAlert, Lock, Info, Server, Layers, Calendar, Receipt, Users
} from 'lucide-react';

export interface ClearDatabaseModalProps {
  isOpen: boolean;
  currentAdmin: AdminUser;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const ClearDatabaseModal: React.FC<ClearDatabaseModalProps> = ({
  isOpen,
  currentAdmin,
  onClose,
  onSuccess
}) => {
  const [mode, setMode] = useState<'operational' | 'full'>('operational');
  const [confirmInput, setConfirmInput] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const bookingsCount = store.getBookings().length;
  const paymentsCount = store.getPayments().length;
  const locksCount = store.getSlotLocks().length;
  const blockedCount = store.getBlockedSlots().length;
  const customersCount = store.getCustomers().length;
  const auditLogsCount = store.getAuditLogs().length;

  const isOwner = currentAdmin.role === 'owner';
  const isManager = currentAdmin.role === 'manager';
  const canClear = isOwner || isManager;

  const isConfirmed = confirmInput.trim().toUpperCase() === 'CLEAR';

  const handleExecuteClear = async () => {
    if (!canClear) {
      setErrorMsg('Permission denied: Only the Venue Owner or Manager has authorization to clear database records.');
      return;
    }

    if (!isConfirmed) {
      setErrorMsg('Please type CLEAR in capital letters into the verification box to proceed.');
      return;
    }

    setIsClearing(true);
    setErrorMsg(null);

    try {
      // 1. Wipe remote Supabase PostgreSQL tables if connected
      const supabaseResult = await SupabaseSyncService.clearSupabaseDatabase(mode);

      // 2. Clear backend Express / Node store via REST endpoint
      try {
        await fetch('/api/database/clear', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...AuthService.getAuthHeaders()
          },
          body: JSON.stringify({ mode })
        });
      } catch (backendErr) {
        // Backend might be offline in browser-only mode, continue cleanly
        console.warn('Backend /api/database/clear notice:', backendErr);
      }

      // 3. Clear client local store & cache (preserving admin login session)
      if (mode === 'operational') {
        store.clearOperationalData();
      } else {
        store.clearAllData(true);
      }

      // 4. Record high-priority audit entry
      AuditLogger.log(
        currentAdmin.id,
        mode === 'full' ? 'FULL_FACTORY_DATABASE_RESET' : 'CLEAR_OPERATIONAL_DATABASE',
        'Database',
        mode,
        {
          previousBookings: bookingsCount,
          previousPayments: paymentsCount,
          previousLocks: locksCount
        },
        {
          mode,
          clearedBy: currentAdmin.name,
          role: currentAdmin.role,
          clearedAt: new Date().toISOString()
        }
      );

      const successNotice = mode === 'full'
        ? 'Database completely reset to factory seed! All operational and custom records cleared.'
        : 'All bookings, payment records, and slot locks cleared successfully!';

      if (onSuccess) {
        onSuccess(successNotice);
      } else {
        alert(successNotice);
      }

      setConfirmInput('');
      onClose();
    } catch (err: any) {
      console.error('Error clearing database:', err);
      setErrorMsg(err.message || 'Failed to clear database. Please check your connection and retry.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="modal-overlay z-[9999]" style={{ zIndex: 9999 }}>
      <div className="bg-white border border-red-200 rounded-3xl sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface relative z-[10000] overflow-hidden max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-red-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-300 flex items-center justify-center text-red-600 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-headline font-bold text-lg text-slate-900 leading-tight flex items-center gap-2">
                Clear Database
                <span className="bg-red-100 text-red-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-red-200">
                  DANGER ZONE
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Permanently purge data from Supabase & local storage
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isClearing}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Database Footprint Summary Cards */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-headline font-bold text-slate-600 uppercase tracking-wider block">
            Current Records to be Cleared
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-red-50/70 border border-red-200/60 p-2 rounded-xl">
              <span className="text-[10px] text-red-700 font-semibold block flex items-center justify-center gap-1">
                <Calendar className="w-3 h-3" /> Bookings
              </span>
              <strong className="text-base font-extrabold text-red-900 font-mono">{bookingsCount}</strong>
            </div>

            <div className="bg-red-50/70 border border-red-200/60 p-2 rounded-xl">
              <span className="text-[10px] text-red-700 font-semibold block flex items-center justify-center gap-1">
                <Receipt className="w-3 h-3" /> Payments
              </span>
              <strong className="text-base font-extrabold text-red-900 font-mono">{paymentsCount}</strong>
            </div>

            <div className="bg-red-50/70 border border-red-200/60 p-2 rounded-xl">
              <span className="text-[10px] text-red-700 font-semibold block flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" /> Slot Locks
              </span>
              <strong className="text-base font-extrabold text-red-900 font-mono">{locksCount}</strong>
            </div>

            <div className="bg-red-50/70 border border-red-200/60 p-2 rounded-xl col-span-3 sm:col-span-1">
              <span className="text-[10px] text-red-700 font-semibold block flex items-center justify-center gap-1">
                <Users className="w-3 h-3" /> Customers
              </span>
              <strong className="text-base font-extrabold text-red-900 font-mono">{customersCount}</strong>
            </div>
          </div>
        </div>

        {/* Sync Environment Banner */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-700">Database Target:</span>
          </div>
          {isSupabaseConfigured() ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Supabase PostgreSQL + Local Cache
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Local Cache & Server Memory
            </span>
          )}
        </div>

        {/* Clear Scope Option Selector */}
        <div className="space-y-2">
          <span className="text-[11px] font-headline font-bold text-slate-700 uppercase tracking-wider block">
            Select Scope of Wipe
          </span>

          <label className={`block p-3 rounded-xl border cursor-pointer transition-all ${
            mode === 'operational' 
              ? 'bg-amber-50/60 border-amber-300 shadow-xs' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}>
            <div className="flex items-start gap-2.5">
              <input
                type="radio"
                name="clear_mode"
                value="operational"
                checked={mode === 'operational'}
                onChange={() => setMode('operational')}
                className="mt-0.5 text-primary accent-primary"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <strong className="text-xs font-bold text-slate-900">
                    Operational Data Only (Recommended)
                  </strong>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded">
                    SAFE
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Clears all bookings, payments, slot locks, blocked slots, and resets customer spend counters to ₹0. 
                  <strong className="text-slate-800"> Your pitches, sports, venue settings, and admin logins are preserved.</strong>
                </p>
              </div>
            </div>
          </label>

          <label className={`block p-3 rounded-xl border cursor-pointer transition-all ${
            mode === 'full' 
              ? 'bg-red-50/60 border-red-300 shadow-xs' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}>
            <div className="flex items-start gap-2.5">
              <input
                type="radio"
                name="clear_mode"
                value="full"
                checked={mode === 'full'}
                onChange={() => setMode('full')}
                className="mt-0.5 text-red-600 accent-red-600"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <strong className="text-xs font-bold text-red-950">
                    Full Factory Reset (Complete Slate)
                  </strong>
                  <span className="bg-red-200 text-red-900 text-[10px] font-extrabold px-1.5 py-0.2 rounded">
                    DESTRUCTIVE
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Wipes operational data <strong className="text-red-700">AND</strong> restores venue configuration, sports catalog, courts, pricing rules, and refund policies back to factory seed defaults.
                </p>
              </div>
            </div>
          </label>
        </div>

        {/* Warning Alert */}
        <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs flex items-start gap-2.5 text-red-900">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-bold">Warning: This action cannot be undone.</span>
            <p className="text-[11px] text-red-800">
              Ensure you have downloaded an Excel ledger export from <b>Analytics & Revenue</b> if you need historical records before clearing.
            </p>
          </div>
        </div>

        {/* Permission Guard / Type-to-Confirm */}
        {!canClear ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Only administrators with <b>Owner</b> or <b>Manager</b> role can clear the database.</span>
          </div>
        ) : (
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-bold text-slate-800">
              To confirm, type <span className="font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 font-extrabold">CLEAR</span> in the box below:
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="Type CLEAR to unlock wipe"
              disabled={isClearing}
              className="w-full form-input text-xs font-mono font-bold tracking-wider py-2 px-3 border-red-300 focus:border-red-500 focus:ring-red-200 rounded-xl uppercase"
            />
          </div>
        )}

        {/* Error Message */}
        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-red-100/80 border border-red-300 text-red-900 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isClearing}
            className="btn-secondary py-2.5 text-xs font-bold"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteClear}
            disabled={!canClear || !isConfirmed || isClearing}
            className={`py-2.5 text-xs font-headline font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 ${
              !canClear || !isConfirmed || isClearing
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer active:scale-98'
            }`}
          >
            {isClearing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Wiping Database...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wipe Database Now</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
