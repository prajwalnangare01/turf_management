import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { store } from '../../services/store';
import { 
  Phone, Mail, MapPin, Clock, ShieldCheck, FileText, RotateCcw, 
  AlertTriangle, ArrowLeft, CheckCircle2, Trophy, 
  ExternalLink, MessageSquare, Car, ShieldAlert,
  ChevronRight, Lock, Check, Info
} from 'lucide-react';

export type PolicySection = 'helpline' | 'location' | 'cancellation' | 'terms' | 'privacy';

interface VenueInfoAndPoliciesPageProps {
  onBackToBooking: () => void;
  initialSection?: PolicySection;
}

export const VenueInfoAndPoliciesPage: React.FC<VenueInfoAndPoliciesPageProps> = ({
  onBackToBooking,
  initialSection = 'helpline'
}) => {
  const [activeTab, setActiveTab] = useState<PolicySection>(initialSection);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [locationQrUrl, setLocationQrUrl] = useState<string>('');

  const venue = store.getVenue();
  const cancellationSettings = store.getCancellationSettings();

  // Scroll to top when active tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(venue.contact_phone || '+919579158374');
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText('support@turfflow.in');
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const whatsappNumberClean = (venue.contact_phone || '9579158374').replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${whatsappNumberClean.startsWith('91') ? whatsappNumberClean : '91' + whatsappNumberClean}?text=${encodeURIComponent(
    `Hi ${venue.name}, I need assistance with court booking, cancellation, or venue information.`
  )}`;

  const googleMapsUrl = venue.location_url || venue.google_maps_link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${venue.name}, ${venue.address}`
  )}`;

  useEffect(() => {
    QRCode.toDataURL(googleMapsUrl, { margin: 1, width: 140 })
      .then(url => setLocationQrUrl(url))
      .catch(() => setLocationQrUrl(''));
  }, [googleMapsUrl]);

  return (
    <div className="bg-[#f8fafc] text-on-surface min-h-screen pb-20 sm:pb-24">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-xs">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          {/* Left: Back & Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={onBackToBooking}
              className="p-2 -ml-1 sm:ml-0 rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition cursor-pointer flex items-center gap-1.5 font-bold text-xs shrink-0"
              title="Return to Pitch Booking"
            >
              <ArrowLeft className="w-4 h-4 text-primary" />
              <span className="hidden xs:inline">Back</span>
            </button>
            <div className="h-4 w-px bg-outline-variant/50 hidden xs:block shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="font-headline font-bold text-xs sm:text-base text-primary leading-tight truncate flex items-center gap-1.5">
                <span className="truncate">{venue.name}</span>
                <span className="hidden md:inline-flex text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">
                  Directory &amp; Policies
                </span>
              </h1>
              <p className="text-[10px] sm:text-[10.5px] text-on-surface-variant truncate">
                Helpline • Location • Cancellation • Terms • Privacy
              </p>
            </div>
          </div>

          {/* Right: Book CTA */}
          <button
            onClick={onBackToBooking}
            className="btn-cta text-[11px] sm:text-xs px-3 py-1.5 sm:px-4 sm:py-2 font-headline font-bold uppercase tracking-wider flex items-center gap-1.5 rounded-xl shadow-xs shrink-0 cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Book a Pitch</span>
            <span className="sm:hidden">Book</span>
          </button>
        </div>

        {/* Section Navigation Pills (Touch-optimized Horizontal Scroll) */}
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 border-t border-outline-variant/20 overflow-x-auto no-scrollbar py-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
            <button
              onClick={() => setActiveTab('helpline')}
              className={`px-3 py-1.5 rounded-xl text-xs font-headline font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'helpline'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-white hover:bg-surface-container-low text-on-surface-variant border border-outline-variant/40'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Owner Helpline</span>
            </button>

            <button
              onClick={() => setActiveTab('location')}
              className={`px-3 py-1.5 rounded-xl text-xs font-headline font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'location'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-white hover:bg-surface-container-low text-on-surface-variant border border-outline-variant/40'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Location &amp; Map</span>
            </button>

            <button
              onClick={() => setActiveTab('cancellation')}
              className={`px-3 py-1.5 rounded-xl text-xs font-headline font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'cancellation'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-white hover:bg-surface-container-low text-on-surface-variant border border-outline-variant/40'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Cancellation &amp; Refunds</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'cancellation' ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
              }`}>
                {cancellationSettings.cutoff_hours}h Rule
              </span>
            </button>

            <button
              onClick={() => setActiveTab('terms')}
              className={`px-3 py-1.5 rounded-xl text-xs font-headline font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'terms'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-white hover:bg-surface-container-low text-on-surface-variant border border-outline-variant/40'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Terms &amp; Conditions</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-3 py-1.5 rounded-xl text-xs font-headline font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'privacy'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-white hover:bg-surface-container-low text-on-surface-variant border border-outline-variant/40'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Privacy Policy</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        
        {/* Banner Hero */}
        <div className="bg-gradient-to-r from-[#004d20] via-[#006b30] to-[#00873d] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-md sm:shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 w-48 sm:w-80 h-full opacity-10 pointer-events-none flex items-center justify-center">
            <Trophy className="w-40 sm:w-72 h-40 sm:h-72 text-white" />
          </div>

          <div className="relative z-10 max-w-2xl space-y-1.5 sm:space-y-2">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-white/15 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold backdrop-blur-xs">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300 shrink-0" />
              <span>Official Player &amp; Customer Support Center</span>
            </div>
            <h2 className="font-headline font-black text-xl sm:text-2xl md:text-3xl tracking-tight leading-tight">
              Venue Information, Helplines &amp; Player Policies
            </h2>
            <p className="text-[11px] sm:text-sm text-emerald-100 leading-relaxed font-medium">
              Direct contact numbers for the venue owner, manager desk, location navigation, cancellation rules, and player privacy guarantees.
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: OWNER HELPLINE & LIVE CONTACT DIRECTORY */}
        {/* ========================================================================= */}
        {activeTab === 'helpline' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-outline-variant/30 pb-2">
              <h3 className="font-headline font-bold text-base sm:text-lg text-primary flex items-center gap-2">
                <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" /> Owner &amp; Management Helpline Directory
              </h3>
              <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium">
                Direct phone, WhatsApp, and email escalation channels for immediate player assistance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {/* Card 1: Primary Owner Helpline */}
              <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="w-1.5 sm:w-2 h-full bg-emerald-600 absolute left-0 top-0" />
                <div className="space-y-2.5 pl-1 sm:pl-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-emerald-700 tracking-wider block truncate">
                          Primary Booking Desk &amp; Owner
                        </span>
                        <h4 className="font-headline font-bold text-sm sm:text-base text-on-surface truncate">
                          {venue.contact_phone || '+91 95791 58374'}
                        </h4>
                      </div>
                    </div>
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      24/7
                    </span>
                  </div>

                  <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                    Direct line for urgent slot holds, counter walk-ins, match rescheduling requests, and general turf management queries.
                  </p>
                </div>

                <div className="pt-2 border-t border-outline-variant/30 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pl-1 sm:pl-0">
                  <a
                    href={`tel:${venue.contact_phone || '+919579158374'}`}
                    className="btn-primary text-xs py-2 px-3 sm:px-4 font-headline font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call Now
                  </a>
                  <button
                    onClick={handleCopyPhone}
                    className="btn-secondary text-xs py-2 px-3 sm:px-3.5 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : null}
                    <span>{copiedPhone ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Official WhatsApp Helpdesk */}
              <div className="bg-white border border-green-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div className="w-1.5 sm:w-2 h-full bg-green-500 absolute left-0 top-0" />
                <div className="space-y-2.5 pl-1 sm:pl-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-green-100 text-green-800 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-green-700 tracking-wider block truncate">
                          WhatsApp Automated Chat Desk
                        </span>
                        <h4 className="font-headline font-bold text-sm sm:text-base text-on-surface truncate">
                          +91 95791 58374
                        </h4>
                      </div>
                    </div>
                    <span className="bg-green-100 text-green-800 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" /> Live Chat
                    </span>
                  </div>

                  <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                    Receive instant Gate Pass OTPs, match e-receipts, directions, or chat directly with our on-duty manager.
                  </p>
                </div>

                <div className="pt-2 border-t border-outline-variant/30 pl-1 sm:pl-0">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba59] text-white text-xs px-4 py-2 rounded-xl font-headline font-bold transition shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Open WhatsApp Chat</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                </div>
              </div>

              {/* Card 3: Support & Billing Email */}
              <div className="bg-white border border-sky-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-sky-700 tracking-wider block truncate">
                          Official Billing &amp; Support Email
                        </span>
                        <h4 className="font-headline font-bold text-sm sm:text-base text-on-surface truncate">
                          support@turfflow.in
                        </h4>
                      </div>
                    </div>
                    <span className="bg-sky-50 text-sky-800 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      Verified
                    </span>
                  </div>

                  <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                    For corporate tournament bookings, tax invoices, GST input credits, and sponsorship inquiries.
                  </p>
                </div>

                <div className="pt-2 border-t border-outline-variant/30 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                  <a
                    href="mailto:support@turfflow.in"
                    className="btn-secondary text-xs py-2 px-3 sm:px-3.5 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" /> Compose
                  </a>
                  <button
                    onClick={handleCopyEmail}
                    className="btn-secondary text-xs py-2 px-3 sm:px-3.5 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : null}
                    <span>{copiedEmail ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Card 4: Operating Hours & Emergency Duty Desk */}
              <div className="bg-white border border-outline-variant/60 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-amber-800 tracking-wider block truncate">
                          Helpline &amp; Ground Hours
                        </span>
                        <h4 className="font-headline font-bold text-sm sm:text-base text-on-surface truncate">
                          06:00 AM – 11:30 PM
                        </h4>
                      </div>
                    </div>
                    <span className="bg-amber-100 text-amber-900 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      Open 7 Days
                    </span>
                  </div>

                  <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                    Operating 365 days a year including weekends and national holidays. Staff is on-site during active hours.
                  </p>
                </div>

                <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/30 text-[10.5px] sm:text-[11px] space-y-1">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-on-surface-variant shrink-0">Ground Desk:</span>
                    <strong className="text-on-surface truncate">Duty Supervisor &amp; Marshals</strong>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-on-surface-variant shrink-0">GSTIN:</span>
                    <strong className="text-primary font-mono">{venue.gst_number || '29ABCDE1234F1Z5'}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: VENUE LOCATION, DIRECTIONS & PARKING */}
        {/* ========================================================================= */}
        {activeTab === 'location' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-outline-variant/30 pb-2">
              <h3 className="font-headline font-bold text-base sm:text-lg text-primary flex items-center gap-2">
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" /> Venue Location &amp; Navigation Guide
              </h3>
              <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium">
                Precise coordinates, parking accessibility, and transit guidelines.
              </p>
            </div>

            <div className="bg-white border border-outline-variant/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30">
                <div className="space-y-1">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-primary">
                    Official Venue Address
                  </span>
                  <h4 className="font-headline font-bold text-sm sm:text-base text-on-surface">
                    {venue.name}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium leading-relaxed max-w-lg">
                    {venue.address}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-outline-variant/20">
                  {locationQrUrl && (
                    <div className="hidden sm:block text-center p-1 bg-white rounded-xl border border-outline-variant/40 shadow-2xs">
                      <img src={locationQrUrl} alt="Location QR Code" className="w-14 h-14 object-contain mx-auto" />
                      <span className="block text-[7.5px] font-bold text-primary uppercase mt-0.5">Scan Map</span>
                    </div>
                  )}
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-xs px-4 py-2.5 font-headline font-bold flex items-center justify-center gap-1.5 shadow-xs w-full sm:w-auto"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Google Maps</span>
                  </a>
                </div>
              </div>

              {/* Key Location Features */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Car className="w-4 h-4" />
                  </div>
                  <h5 className="font-headline font-bold text-xs text-on-surface">Free Dedicated Parking</h5>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Complimentary secure on-premise parking for 30+ cars and 80+ two-wheelers inside the gated sports campus.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <h5 className="font-headline font-bold text-xs text-on-surface">Prominent Landmarks</h5>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Opposite Aeromall Gate 3, 5 minutes drive from Phoenix Marketcity and 8 minutes from Pune International Airport.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h5 className="font-headline font-bold text-xs text-on-surface">24/7 Security &amp; CCTV</h5>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Full campus perimeter secured by night security staff and continuous high-definition CCTV surveillance.
                  </p>
                </div>
              </div>

              {/* Arrival Guidelines */}
              <div className="bg-amber-50/70 border border-amber-200/60 p-3.5 sm:p-4 rounded-2xl text-xs space-y-2">
                <h5 className="font-headline font-bold text-amber-950 flex items-center gap-1.5 text-xs sm:text-sm">
                  <Info className="w-4 h-4 text-amber-700 shrink-0" /> Match Day Arrival Guidelines
                </h5>
                <ul className="text-amber-900 text-[11px] space-y-1 list-disc list-inside leading-relaxed">
                  <li>Please arrive <strong>10 minutes prior</strong> to your reserved start time for kit change and gate OTP verification.</li>
                  <li>Present your 4-digit numeric check-in OTP or digital match PDF to the entry marshal.</li>
                  <li>Rubber studs or indoor turf shoes only (Metal cleat spikes strictly prohibited).</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CANCELLATION & REFUND POLICY */}
        {/* ========================================================================= */}
        {activeTab === 'cancellation' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-outline-variant/30 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                  <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-base sm:text-lg text-primary leading-tight">
                    Cancellation Terms &amp; Refund Policy
                  </h3>
                  <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium">
                    Transparent, fair, automated cancellation rules enforced across our platform.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Rule Card */}
            <div className="bg-gradient-to-r from-red-50 via-amber-50 to-emerald-50 border border-outline-variant/60 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] sm:text-[10px] font-headline font-extrabold text-on-surface-variant uppercase tracking-wider">
                    Core Cancellation Rule
                  </span>
                  <h4 className="font-headline font-bold text-sm sm:text-base text-on-surface">
                    {cancellationSettings.cutoff_hours}-Hour Advance Notice Cutoff Window
                  </h4>
                  <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                    Notice provided &ge; {cancellationSettings.cutoff_hours} hours prior to slot kickoff qualifies for {cancellationSettings.refund_percentage}% full refund.
                  </p>
                </div>

                <div className="bg-white px-4 py-2 sm:py-2.5 rounded-2xl border border-outline-variant/40 text-center shrink-0 shadow-xs flex sm:flex-col items-center justify-between sm:justify-center gap-2 sm:gap-0">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase">Eligible Refund</span>
                  <span className="font-headline font-black text-xl sm:text-2xl text-emerald-700">
                    {cancellationSettings.refund_percentage}%
                  </span>
                  <span className="text-[10px] text-on-surface-variant">Back to Source</span>
                </div>
              </div>
            </div>

            {/* Detailed Scenarios Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {/* Scenario 1: Met Terms */}
              <div className="bg-white border border-emerald-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2.5 sm:space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-emerald-800 font-headline font-bold text-xs sm:text-sm">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
                  <span>Cancellations Made &ge; {cancellationSettings.cutoff_hours} Hours Before Match</span>
                </div>
                <div className="text-[11px] sm:text-xs text-on-surface-variant space-y-2 leading-relaxed">
                  <p>
                    If you cancel at least <strong>{cancellationSettings.cutoff_hours} hours</strong> before your scheduled game time:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-on-surface text-[10.5px] sm:text-[11px] font-medium">
                    <li>You receive an automated <strong>{cancellationSettings.refund_percentage}% refund</strong> of the booking amount.</li>
                    <li>Refund is processed through Razorpay directly to your original payment method (Bank / UPI / Card).</li>
                    <li>Settlement is completed within <strong>{cancellationSettings.processing_business_days} business days</strong>.</li>
                    <li>The slot is immediately released for other players.</li>
                  </ul>
                </div>
                <div className="bg-emerald-50 p-2 sm:p-2.5 rounded-xl border border-emerald-200/60 text-[10.5px] sm:text-[11px] text-emerald-900 font-semibold">
                  ✓ Self-serve cancellation available directly from your Customer Profile page.
                </div>
              </div>

              {/* Scenario 2: Within Cutoff Window */}
              <div className="bg-white border border-amber-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2.5 sm:space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-amber-900 font-headline font-bold text-xs sm:text-sm">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" />
                  <span>Cancellations Made Within {cancellationSettings.cutoff_hours} Hours of Kickoff</span>
                </div>
                <div className="text-[11px] sm:text-xs text-on-surface-variant space-y-2 leading-relaxed">
                  <p>
                    Due to reserved pitch allocation, floodlight staffing, and near-zero re-booking probability on short notice:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-on-surface text-[10.5px] sm:text-[11px] font-medium">
                    <li>Cancellations requested inside {cancellationSettings.cutoff_hours} hours are <strong>non-refundable (₹0 refund)</strong>.</li>
                    <li>The system releases the pitch so other teams can play, but no monetary refund is issued.</li>
                    <li>If a genuine medical emergency arises, call the Owner Helpline (+91 95791 58374) for evaluation.</li>
                  </ul>
                </div>
                <div className="bg-amber-50 p-2 sm:p-2.5 rounded-xl border border-amber-200/60 text-[10.5px] sm:text-[11px] text-amber-900 font-semibold">
                  ⚠️ Please notify us early if your team cannot attend to avoid forfeiting funds.
                </div>
              </div>

              {/* Scenario 3: Bad Weather / Rainout */}
              <div className="bg-white border border-sky-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2.5 sm:space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-sky-900 font-headline font-bold text-xs sm:text-sm">
                  <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600 shrink-0" />
                  <span>Weather Emergencies &amp; Pitch Closures</span>
                </div>
                <div className="text-[11px] sm:text-xs text-on-surface-variant space-y-2 leading-relaxed">
                  <p>
                    In the event of unplayable weather conditions (torrential downpours, electrical storms, or waterlogging):
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-on-surface text-[10.5px] sm:text-[11px] font-medium">
                    <li>The ground manager reserves the right to declare the pitch unplayable for player safety.</li>
                    <li><strong>100% full refund or free rescheduling</strong> is guaranteed with zero deductions.</li>
                    <li>Automated WhatsApp notices will inform all affected captains immediately.</li>
                  </ul>
                </div>
              </div>

              {/* Scenario 4: No-Show Blacklist Policy */}
              <div className="bg-white border border-red-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2.5 sm:space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-red-900 font-headline font-bold text-xs sm:text-sm">
                  <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
                  <span>No-Show &amp; Automated Account Suspension</span>
                </div>
                <div className="text-[11px] sm:text-xs text-on-surface-variant space-y-2 leading-relaxed">
                  <p>
                    To guarantee genuine players get fair court access and curb duplicate phantom bookings:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-on-surface text-[10.5px] sm:text-[11px] font-medium">
                    <li>If a player fails to appear within 15 minutes of kickoff without notifying the desk, it is recorded as a <strong>No-Show</strong>.</li>
                    <li>Accumulating <strong>3 consecutive No-Shows</strong> results in automated suspension of online reservation privileges.</li>
                    <li>Suspended accounts must contact management to restore booking access.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: TERMS & CONDITIONS */}
        {/* ========================================================================= */}
        {activeTab === 'terms' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-outline-variant/30 pb-2">
              <h3 className="font-headline font-bold text-base sm:text-lg text-primary flex items-center gap-2">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" /> Turf Booking Terms &amp; Conditions of Service
              </h3>
              <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium">
                Effective as of November 2026. Applies to all players, guests, and spectators.
              </p>
            </div>

            <div className="bg-white border border-outline-variant/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-3.5 sm:space-y-4 text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
              <div className="space-y-1">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  1. Gate Pass &amp; Entry Verification
                </h4>
                <p>
                  All confirmed online reservations generate a 4-digit numeric Common Gate Pass OTP and a unique alphanumeric booking reference (e.g. TRF-YYYYMMDD-XXXX). Players must present this code to the gate attendant before entering the pitch enclosure. Entry may be denied without valid confirmation.
                </p>
              </div>

              <div className="space-y-1 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  2. Session Durations &amp; Turnaround
                </h4>
                <p>
                  Each reserved slot is exactly 60 minutes. Teams must vacate the turf within 2 minutes of the final whistle to allow the subsequent scheduled team to begin their session on time. Overstaying past your reserved block is billed at full hourly rates subject to availability.
                </p>
              </div>

              <div className="space-y-1 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  3. Code of Conduct &amp; Safety
                </h4>
                <p>
                  Players must maintain good sportsmanship. Violent conduct, physical altercations, abusive profanity, chewing gum, smoking, and consumption of alcohol or illegal substances within the facility are strictly prohibited. The arena management reserves the right to immediately expel violators without refund.
                </p>
              </div>

              <div className="space-y-1 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  4. Player Injury &amp; Personal Property Disclaimer
                </h4>
                <p>
                  Football, cricket, and racquet sports carry inherent physical risks. All participants play at their own risk. {venue.name}, its owners, and employees shall not be held liable for personal injuries, muscular strains, or accidents sustained during play. Furthermore, the venue is not responsible for lost, stolen, or damaged personal valuables or electronics left unattended.
                </p>
              </div>

              <div className="space-y-1 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  5. Facility Equipment &amp; Property Damage
                </h4>
                <p>
                  Players are required to respect venue equipment including boundary netting, goal nets, goalposts, floodlight poles, and spectator seating. Willful vandalism or intentional damage to synthetic turf grass will be billed to the booking captain at actual replacement cost.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PRIVACY POLICY */}
        {/* ========================================================================= */}
        {activeTab === 'privacy' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-outline-variant/30 pb-2">
              <h3 className="font-headline font-bold text-base sm:text-lg text-primary flex items-center gap-2">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" /> Customer Privacy Policy &amp; Data Security
              </h3>
              <p className="text-[11px] sm:text-xs text-on-surface-variant font-medium">
                How we protect and respect your personal information, phone number, and payment details.
              </p>
            </div>

            <div className="bg-white border border-outline-variant/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-3.5 sm:space-y-4 text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
              <div className="space-y-1">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  1. Information We Collect
                </h4>
                <p>
                  We collect basic identification data necessary to provide seamless venue booking services:
                </p>
                <ul className="list-disc list-inside space-y-1 pt-1 text-[10.5px] sm:text-[11px] font-medium text-on-surface">
                  <li><strong>Full Name:</strong> To identify the booking party on pitch rosters.</li>
                  <li><strong>10-Digit Mobile Phone:</strong> Used for secure SMS OTP authentication and automated WhatsApp Gate Pass delivery.</li>
                  <li><strong>Email Address:</strong> Used for sending verified digital tax invoices, booking receipts, and account notices via Resend.</li>
                </ul>
              </div>

              <div className="space-y-1 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  2. Payment Card &amp; UPI Security
                </h4>
                <p>
                  All online payments on TurfFlow are processed securely through Razorpay, a PCI-DSS Level 1 certified payment gateway. We never store, process, or transmit your raw debit/credit card numbers, CVVs, netbanking passwords, or UPI MPINs. All transactions utilize 256-bit TLS encryption.
                </p>
              </div>

              <div className="space-y-1 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  3. Zero Spam &amp; No Third-Party Data Sharing
                </h4>
                <p>
                  We despise spam as much as you do. Your phone number and email are strictly confidential. We do not sell, rent, trade, or share your personal data with any external advertising agencies, brokers, or marketing networks. All notifications dispatched are strictly transactional match alerts (pass confirmations, 1-hour kickoff reminders, and refund receipts).
                </p>
              </div>

              <div className="space-y-1 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5">
                  4. Data Control &amp; Account Erasure
                </h4>
                <p>
                  Under customer data protection standards, you have the right to request a complete export of your booking ledger or complete account deletion. To request data removal, simply email our compliance officer at <span className="font-mono text-primary font-bold">privacy@turfflow.in</span> or call the Owner Helpline at <span className="font-bold">{venue.contact_phone || '+91 95791 58374'}</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bottom CTA Card */}
        <div className="bg-surface-container-low border border-outline-variant/40 rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-headline font-bold text-xs sm:text-sm text-on-surface truncate">Ready to Kick Off Your Next Game?</h4>
              <p className="text-[10px] sm:text-[11px] text-on-surface-variant font-medium truncate">
                Reserve your favorite court with live 100% double-booking protection.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={onBackToBooking}
              className="btn-cta w-full sm:w-auto py-2.5 px-5 sm:px-6 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md cursor-pointer rounded-xl"
            >
              <span>View Available Slots</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </main>
    </div>
  );
};
