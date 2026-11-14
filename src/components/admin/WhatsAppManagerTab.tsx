import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Bot, CheckCircle2, Zap, 
  ExternalLink, Phone, Send, RotateCw, Sparkles, AlertCircle, 
  Ticket, Copy, Check, Users, ArrowRight, QrCode, Key, LogOut,
  Sun, Moon
} from 'lucide-react';
import { store } from '../../services/store';
import { AuthService } from '../../services/authService';
import { AdminUser, Booking } from '../../types/schema';
import { formatTime12hPlain, formatDateDDMMYYYY } from '../../utils/formatters';

const formatChatTimestamp = (d: Date = new Date()): string => {
  const datePart = formatDateDDMMYYYY(d);
  const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
};

interface Props {
  currentAdmin: AdminUser;
}

export const WhatsAppManagerTab: React.FC<Props> = ({ currentAdmin }) => {
  const [copiedPairingCode, setCopiedPairingCode] = useState(false);
  const [simulatedPhone, setSimulatedPhone] = useState('+919876543210');
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isPairingLoading, setIsPairingLoading] = useState(false);
  const [phoneInput, setPhoneInput] = useState('9579158374');
  
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'agent' | 'user'; text: string; time: string }>>([
    {
      sender: 'agent',
      text: '🤖 *TurfFlow AI Agent Operational.*\nConnected to live Supabase PostgreSQL database. Ask me for slot availability or simulate a WhatsApp booking reservation!',
      time: formatChatTimestamp()
    }
  ]);

  const [whatsappBookings, setWhatsappBookings] = useState<Booking[]>([]);
  const [agentHealth, setAgentHealth] = useState<{
    status: string;
    databaseMode: string;
    supabaseRealtime: boolean;
    activeLocks: number;
  }>({
    status: 'checking',
    databaseMode: 'unknown',
    supabaseRealtime: false,
    activeLocks: 0
  });

  const [waClientStatus, setWaClientStatus] = useState<{
    status: string;
    linkedPhone: string | null;
    targetPhone: string;
    pairingCode: string | null;
    hasQr: boolean;
    qrDataUrl: string | null;
  }>({
    status: 'connecting',
    linkedPhone: null,
    targetPhone: '9579158374',
    pairingCode: null,
    hasQr: false,
    qrDataUrl: null
  });

  const venue = store.getVenue();
  const courts = store.getCourts();
  const getCourtName = (courtId: string) => courts.find(c => c.id === courtId)?.name || courtId;
  const targetPhoneNumber = '9579158374';
  const rawActivePhone = (waClientStatus.linkedPhone || waClientStatus.targetPhone || targetPhoneNumber).replace(/\D/g, '');
  const activeTenDigitPhone = rawActivePhone.length >= 10 ? rawActivePhone.slice(-10) : rawActivePhone;

  const refreshData = async () => {
    // 1. Filter bookings originated via WhatsApp
    const all = store.getBookings();
    const wa = all.filter(b => b.source === 'offline_whatsapp' || b.notes?.toLowerCase().includes('whatsapp'));
    setWhatsappBookings(wa);

    // 2. Fetch agent health
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setAgentHealth({
          status: data.status,
          databaseMode: data.databaseMode,
          supabaseRealtime: Boolean(data.supabaseRealtime),
          activeLocks: data.stats?.activeLocks || 0
        });
      }
    } catch {}

    // 3. Fetch native Baileys WhatsApp client status
    try {
      const waRes = await fetch('/api/whatsapp/status');
      if (waRes.ok) {
        const waData = await waRes.json();
        setWaClientStatus({
          status: waData.status,
          linkedPhone: waData.linkedPhone,
          targetPhone: waData.targetPhone || targetPhoneNumber,
          pairingCode: waData.pairingCode,
          hasQr: Boolean(waData.hasQr),
          qrDataUrl: waData.qrDataUrl || null
        });
      }
    } catch {}
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPairingCode(true);
    setTimeout(() => setCopiedPairingCode(false), 2000);
  };

  const handleRequestPairingCode = async (explicitPhone?: string | React.MouseEvent) => {
    setIsPairingLoading(true);
    try {
      const targetPhone = (typeof explicitPhone === 'string' ? explicitPhone : null) || phoneInput || targetPhoneNumber;
      const res = await fetch('/api/whatsapp/pair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getAuthHeaders()
        },
        body: JSON.stringify({ phone: targetPhone.replace(/\D/g, '') })
      });
      const data = await res.json();
      if (data.pairingCode) {
        setWaClientStatus(prev => ({
          ...prev,
          status: 'pairing_code_ready',
          pairingCode: data.pairingCode
        }));
      }
    } catch (err: any) {
      alert(`Pairing code error: ${err.message}`);
    } finally {
      setIsPairingLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!confirm('Are you sure you want to unpair this WhatsApp account?')) return;
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      refreshData();
    } catch (err: any) {
      alert(`Disconnect error: ${err.message}`);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text || isSending) return;

    const time = formatChatTimestamp();
    setChatHistory(prev => [...prev, { sender: 'user', text, time }]);
    setChatInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getAuthHeaders()
        },
        body: JSON.stringify({
          fromPhone: simulatedPhone,
          senderName: 'Test Player',
          messageText: text
        })
      });

      const data = await res.json();
      setIsSending(false);

      if (data.success) {
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'agent',
            text: data.reply || 'Request executed.',
            time: formatChatTimestamp()
          }
        ]);
        refreshData();
      } else {
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'agent',
            text: `⚠️ Error: ${data.message || 'Agent failed to respond'}`,
            time: formatChatTimestamp()
          }
        ]);
      }
    } catch (err: any) {
      setIsSending(false);
      setChatHistory(prev => [
        ...prev,
        {
          sender: 'agent',
          text: `⚠️ Network error: Could not reach /api/agent/chat (${err.message})`,
          time: formatChatTimestamp()
        }
      ]);
    }
  };

  const handleConfirmPayment = async (bookingRef: string) => {
    try {
      const res = await fetch('/api/bookings/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...AuthService.getAuthHeaders()
        },
        body: JSON.stringify({ bookingRef, paymentId: `pay_admin_${Date.now()}` })
      });
      const data = await res.json();
      if (data.success) {
        refreshData();
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'agent',
            text: `🎉 *PAYMENT CAPTURED:* Booking is confirmed! Official pass dispatched.`,
            time: formatChatTimestamp()
          }
        ]);
      }
    } catch (err: any) {
      alert(`Payment confirmation error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner / Status Overview */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 rounded-2xl p-6 text-white border border-emerald-800/40 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
              <Bot className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-headline font-bold">TurfFlow WhatsApp AI Agent</h2>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold flex items-center gap-1.5 ${
              waClientStatus.status === 'connected'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}>
              <span className={`w-2 h-2 rounded-full ${waClientStatus.status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              {waClientStatus.status === 'connected' ? 'LIVE ON REAL WHATSAPP' : 'AWAITING PHONE PAIRING'}
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Directly connected to WhatsApp number <strong>+91 {activeTenDigitPhone}</strong>. When a customer sends a message to this number on WhatsApp, the AI concierge answers queries, checks live slots in Supabase, and books pitches automatically.
          </p>
        </div>

        <div className="flex flex-wrap md:flex-col gap-2 shrink-0 text-xs">
          <div className="bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700/60 flex items-center justify-between gap-3">
            <span className="text-slate-400 font-medium">Supabase Realtime:</span>
            <span className={`font-mono font-bold ${agentHealth.supabaseRealtime ? 'text-emerald-400' : 'text-amber-400'}`}>
              {agentHealth.supabaseRealtime ? '⚡ CONNECTED' : 'FALLBACK'}
            </span>
          </div>
          <div className="bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700/60 flex items-center justify-between gap-3">
            <span className="text-slate-400 font-medium">5-min Slot Holds:</span>
            <span className="font-mono font-bold text-cyan-400">{agentHealth.activeLocks} Active</span>
          </div>
        </div>
      </div>

      {/* PROPER WHATSAPP PHONE PAIRING SECTION */}
      <div className="bg-white rounded-2xl p-6 border border-emerald-500/30 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-2xl shadow-xs">
              📱
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline font-bold text-base text-slate-900">
                  WhatsApp Device Link: +91 {activeTenDigitPhone}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  waClientStatus.status === 'connected'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}>
                  {waClientStatus.status === 'connected' ? 'Connected' : 'Pairing Required'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Link your real WhatsApp account on phone <strong>+91 {activeTenDigitPhone}</strong> to allow this server to send & receive messages.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {waClientStatus.status === 'connected' ? (
              <button
                onClick={handleDisconnectWhatsApp}
                className="btn-secondary text-xs px-3.5 py-2 text-rose-600 hover:bg-rose-50 border-rose-200 flex items-center gap-1.5 font-bold"
              >
                <LogOut className="w-3.5 h-3.5" /> Disconnect Device
              </button>
            ) : (
              <button
                onClick={handleRequestPairingCode}
                disabled={isPairingLoading}
                className="btn-cta text-xs px-4 py-2 font-headline font-bold flex items-center gap-2 shadow-xs"
              >
                <Key className="w-3.5 h-3.5" />
                {isPairingLoading ? 'Generating Code...' : 'Get 8-Digit Pairing Code'}
              </button>
            )}
          </div>
        </div>

        {/* Pairing Instructions & Code Display */}
        {waClientStatus.status === 'connected' ? (
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-headline font-bold text-emerald-950 text-xs">
                  Agent is actively running on +91 {activeTenDigitPhone}!
                </p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Any customer who texts this number on WhatsApp will receive instantaneous, AI-powered slot bookings and confirmations.
                </p>
              </div>
            </div>
            <a
              href={`https://wa.me/91${activeTenDigitPhone}?text=${encodeURIComponent('Hi TurfFlow Arena!')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-xs shrink-0"
            >
              <span>Test on WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
            
            {/* Option 1: Live QR Code Scanner (Fastest & Most Reliable) */}
            <div className="md:col-span-5 bg-white rounded-xl p-4 text-center border-2 border-emerald-500/30 shadow-xs flex flex-col items-center justify-center">
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider block mb-2 border border-emerald-200">
                Recommended: Scan QR with WhatsApp
              </span>

              {waClientStatus.qrDataUrl ? (
                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs inline-block mb-2">
                  <img
                    src={waClientStatus.qrDataUrl}
                    alt="WhatsApp Web QR Code"
                    className="w-48 h-48 object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-slate-100 rounded-xl flex flex-col items-center justify-center border border-dashed border-slate-300 mb-2">
                  <QrCode className="w-10 h-10 text-slate-400 mb-2 animate-pulse" />
                  <span className="text-[11px] text-slate-500 font-medium">Generating QR Code...</span>
                </div>
              )}

              <p className="text-[11px] text-slate-600 font-medium max-w-xs">
                Open <strong>WhatsApp</strong> on phone &gt; <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong> &gt; Scan this QR.
              </p>
            </div>

            {/* Option 2: 8-digit Pairing Code */}
            <div className="md:col-span-7 bg-slate-900 rounded-xl p-5 text-white border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider">
                    Alternative: Link With Phone Number
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">+91 {phoneInput || targetPhoneNumber}</span>
                </div>

                <p className="text-xs text-slate-300 mb-3">
                  If you prefer not to scan the QR code, tap <strong>&ldquo;Link with phone number instead&rdquo;</strong> at the bottom of the WhatsApp scanner screen and enter this code:
                </p>

                <div className="flex items-center gap-2 mb-3 bg-slate-800/90 p-2 rounded-lg border border-slate-700">
                  <span className="text-xs text-slate-400 font-mono font-bold">+91</span>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Enter 10-digit number"
                    className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1 text-xs font-mono flex-1 focus:outline-emerald-500"
                  />
                  <button
                    onClick={() => handleRequestPairingCode(phoneInput)}
                    disabled={isPairingLoading || phoneInput.length < 10}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1 rounded font-semibold transition disabled:opacity-50 shrink-0"
                  >
                    {isPairingLoading ? 'Generating...' : 'Get Code'}
                  </button>
                </div>

                <div className="bg-slate-800/80 rounded-lg p-3 text-center border border-slate-700 my-2">
                  <div className="text-2xl sm:text-3xl font-mono font-extrabold tracking-widest text-emerald-400 select-all">
                    {waClientStatus.pairingCode || 'Generating...'}
                  </div>
                  <button
                    onClick={() => handleCopy(waClientStatus.pairingCode || '')}
                    disabled={!waClientStatus.pairingCode}
                    className="mt-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold px-3 py-1 rounded-md border border-slate-600 inline-flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {copiedPairingCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPairingCode ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>💡 Make sure your phone is connected to the internet.</span>
                <button
                  onClick={handleRequestPairingCode}
                  disabled={isPairingLoading}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold underline text-[11px]"
                >
                  {isPairingLoading ? 'Refreshing...' : 'Regenerate Code'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Main Grid: Live Testing Console & WhatsApp Inbound Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT: Live Interactive WhatsApp Tester (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-outline-variant/60 shadow-sm flex flex-col h-[600px] overflow-hidden">
          
          {/* Header */}
          <div className="bg-[#075E54] text-white p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center text-sm font-bold shadow-sm">
                ⚽
              </div>
              <div>
                <h3 className="text-xs font-headline font-bold leading-none">Agent Conversation Tester</h3>
                <p className="text-[10px] text-emerald-200 mt-0.5">Test conversational responses locally</p>
              </div>
            </div>
            <button
              onClick={() => {
                setChatHistory([
                  {
                    sender: 'agent',
                    text: '👋 Chat reset! Ready to simulate new inquiries.',
                    time: formatChatTimestamp()
                  }
                ]);
              }}
              title="Clear Test Conversation"
              className="text-emerald-100 hover:text-white text-xs bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Test Phone Profile Selector */}
          <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 text-xs flex items-center justify-between">
            <span className="text-slate-600 font-medium">Customer Phone:</span>
            <input
              value={simulatedPhone}
              onChange={e => setSimulatedPhone(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 w-36 text-center focus:outline-emerald-600"
            />
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 bg-[#efeae2] p-3 overflow-y-auto space-y-2.5">
            {chatHistory.map((msg, i) => {
              const isAgent = msg.sender === 'agent';
              return (
                <div key={i} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-xl text-xs leading-relaxed shadow-xs ${
                      isAgent ? 'bg-white text-slate-900 rounded-tl-xs' : 'bg-[#d9fdd3] text-slate-950 rounded-tr-xs'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')}</div>
                    <div className="text-[10px] text-slate-400 text-right mt-1">{msg.time}</div>
                  </div>
                </div>
              );
            })}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white px-3 py-1.5 rounded-xl rounded-tl-xs shadow-xs text-xs text-slate-500 italic">
                  Agent responding...
                </div>
              </div>
            )}
          </div>

          {/* Quick Test Prompt Chips */}
          <div className="bg-slate-100 border-t border-slate-200 p-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleSendMessage('Show football slots for tomorrow')}
              className="bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition"
            >
              ⚽ Football Tomorrow
            </button>
            <button
              onClick={() => handleSendMessage('Book Turf A tomorrow at 8pm')}
              className="bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition"
            >
              🎟️ Book Turf A 8pm
            </button>
            <button
              onClick={() => handleSendMessage('My bookings')}
              className="bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition"
            >
              📋 My Bookings
            </button>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-2 bg-[#f0f2f5] border-t border-slate-200 flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type test message (e.g. Check cricket slots)..."
              className="flex-1 bg-white text-xs rounded-full px-3.5 py-2 border border-slate-300 focus:outline-emerald-600 text-slate-800"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isSending}
              className="w-8 h-8 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#069576] disabled:opacity-50 transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>

        {/* RIGHT: WhatsApp Bookings Ledger (7 cols) */}
        <div className="lg:col-span-7 space-y-6">

          {/* Bookings Originating from WhatsApp */}
          <div className="bg-white rounded-2xl p-5 border border-outline-variant/60 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-headline font-bold text-on-surface flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-emerald-600" />
                  Live WhatsApp Bookings Ledger
                </h3>
                <p className="text-[11px] text-on-surface-variant">Bookings created via WhatsApp AI concierge and synced to Supabase</p>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-mono font-bold">
                {whatsappBookings.length} Total
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-container-low text-on-surface-variant font-headline font-bold text-[11px] uppercase tracking-wider border-b border-outline-variant/40">
                  <tr>
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3">Pitch / Time</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30 font-mono text-[11px]">
                  {whatsappBookings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-on-surface-variant font-sans">
                        No WhatsApp bookings created yet.
                      </td>
                    </tr>
                  ) : (
                    whatsappBookings.map(b => (
                      <tr key={b.id} className="hover:bg-surface-container-low/50 transition">
                        <td className="py-2.5 px-3 font-bold text-primary">{b.booking_ref}</td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="font-semibold text-on-surface">{getCourtName(b.court_id)}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div
                              className={`p-0.5 rounded shrink-0 flex items-center justify-center ${
                                parseInt(b.start_time.split(':')[0], 10) >= 18 || parseInt(b.start_time.split(':')[0], 10) < 5
                                  ? 'bg-indigo-50 text-indigo-500'
                                  : 'bg-amber-50 text-amber-500'
                              }`}
                            >
                              {parseInt(b.start_time.split(':')[0], 10) >= 18 || parseInt(b.start_time.split(':')[0], 10) < 5 ? (
                                <Moon className="w-2.5 h-2.5" />
                              ) : (
                                <Sun className="w-2.5 h-2.5" />
                              )}
                            </div>
                            <span className="text-[10px] text-on-surface-variant font-medium">
                              {formatDateDDMMYYYY(b.booking_date)} @ {formatTime12hPlain(b.start_time)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-600">₹{b.total_amount}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                            b.status === 'pending_payment' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans">
                          {b.status === 'pending_payment' ? (
                            <button
                              onClick={() => handleConfirmPayment(b.booking_ref)}
                              className="btn-cta text-[10px] px-2.5 py-1 font-bold shadow-xs"
                            >
                              Simulate Pay
                            </button>
                          ) : (
                            <span className="text-[10px] text-on-surface-variant font-medium">Synced</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
