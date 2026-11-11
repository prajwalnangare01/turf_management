import React from 'react';
import {
  PhoneCall,
  MapPin,
  RefreshCw,
  FileText,
  Shield,
  Users,
  ShieldCheck,
  Globe,
  Instagram,
  Twitter
} from 'lucide-react';

export interface FooterProps {
  onNavigateToPolicies?: (section: 'helpline' | 'location' | 'cancellation' | 'terms' | 'privacy') => void;
  onSwitchToAdmin?: () => void;
  venueName?: string;
  logoUrl?: string;
  gstin?: string;
  hasActiveHold?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateToPolicies,
  onSwitchToAdmin,
  venueName = 'TurfFlow Arena',
  logoUrl = '/logo.png',
  gstin = '29ABCDE1234F1Z5',
  hasActiveHold = false
}) => {
  return (
    <footer
      className={`w-full bg-[#0F172A] border-t border-gray-800 text-gray-400 text-sm py-12 px-6 md:px-12 transition-all ${
        hasActiveHold ? 'pb-32 md:pb-24' : ''
      }`}
    >
      <div className="max-w-7xl mx-auto">
        {/* Primary 5-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Col 1: Branding & Info */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <img
                src={logoUrl}
                alt={`${venueName} Logo`}
                className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shadow-md shrink-0 border border-gray-700/60"
              />
              <span className="font-bold text-lg text-white tracking-tight">{venueName}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium leading-relaxed">
              High Performance Sports Venues
            </p>
            <p className="text-xs text-gray-500 mt-2 font-mono">
              GSTIN: {gstin}
            </p>
          </div>

          {/* Col 2: Connect & Support */}
          <div className="flex flex-col gap-3.5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Connect & Support
            </h4>
            <button
              type="button"
              onClick={() => onNavigateToPolicies?.('helpline')}
              className="group flex items-center gap-2.5 text-gray-400 hover:text-white transition-colors duration-150 text-left cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 text-emerald-500 shrink-0 group-hover:scale-110 transition-transform duration-150" />
              <span className="text-sm font-medium">Owner Helpline</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateToPolicies?.('location')}
              className="group flex items-center gap-2.5 text-gray-400 hover:text-white transition-colors duration-150 text-left cursor-pointer"
            >
              <MapPin className="w-4 h-4 text-emerald-500 shrink-0 group-hover:scale-110 transition-transform duration-150" />
              <span className="text-sm font-medium">Location & Map</span>
            </button>
          </div>

          {/* Col 3: Bookings & Care */}
          <div className="flex flex-col gap-3.5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Bookings & Care
            </h4>
            <button
              type="button"
              onClick={() => onNavigateToPolicies?.('cancellation')}
              className="group flex items-center gap-2.5 text-gray-400 hover:text-white transition-colors duration-150 text-left cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-emerald-500 shrink-0 group-hover:rotate-45 transition-transform duration-200" />
              <span className="text-sm font-medium">Cancellation & Refund Policy</span>
            </button>
          </div>

          {/* Col 4: Fine Print */}
          <div className="flex flex-col gap-3.5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Fine Print
            </h4>
            <button
              type="button"
              onClick={() => onNavigateToPolicies?.('terms')}
              className="group flex items-center gap-2.5 text-gray-400 hover:text-white transition-colors duration-150 text-left cursor-pointer"
            >
              <FileText className="w-4 h-4 text-emerald-500 shrink-0 group-hover:scale-110 transition-transform duration-150" />
              <span className="text-sm font-medium">Terms & Conditions</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateToPolicies?.('privacy')}
              className="group flex items-center gap-2.5 text-gray-400 hover:text-white transition-colors duration-150 text-left cursor-pointer"
            >
              <Shield className="w-4 h-4 text-emerald-500 shrink-0 group-hover:scale-110 transition-transform duration-150" />
              <span className="text-sm font-medium">Privacy Policy</span>
            </button>
          </div>

          {/* Col 5: Access / Portals */}
          <div className="flex flex-col gap-3.5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Portals
            </h4>
            <button
              type="button"
              onClick={onSwitchToAdmin}
              className="group flex items-center gap-2.5 text-gray-400 hover:text-white transition-colors duration-150 text-left cursor-pointer"
            >
              <Users className="w-4 h-4 text-emerald-500 shrink-0 group-hover:scale-110 transition-transform duration-150" />
              <span className="text-sm font-medium">Staff / Manager Portal Access</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-800/80 my-8" />

        {/* Bottom Section: Copyright & Compliance */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p className="text-center md:text-left">
            © 2026 {venueName}. All rights reserved.
          </p>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>SSL 256-Bit Encrypted</span>
            </div>
            <div className="flex items-center gap-3 text-gray-500">
              <span
                className="hover:text-emerald-400 transition-colors cursor-pointer"
                title="Global Network"
              >
                <Globe className="w-4 h-4" />
              </span>
              <span
                className="hover:text-emerald-400 transition-colors cursor-pointer"
                title="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </span>
              <span
                className="hover:text-emerald-400 transition-colors cursor-pointer"
                title="Twitter"
              >
                <Twitter className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
