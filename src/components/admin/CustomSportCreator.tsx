import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Sport } from '../../types/schema';
import { store } from '../../services/store';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { processSportImageFile } from '../../utils/imageUpload';

export const SPORT_EMOJI_CHOICES = [
  '⚽', '🏏', '🏸', '🏓', '🏊', '🏀', '🏐', '🎾',
  '🥊', '⛳', '🏹', '🎳', '🛼', '🤼', '🏋️', '🚴', '🧘', '🏆'
];

export const PRESET_QUICK_SPORTS = [
  { name: 'Swimming', icon: '🏊', subtitle: 'Olympic & Heated Pool' },
  { name: 'Volleyball', icon: '🏐', subtitle: 'Pro Sand & Indoor Court' },
  { name: 'Basketball', icon: '🏀', subtitle: 'Indoor Maple Hardwood' },
  { name: 'Futsal', icon: '⚽', subtitle: 'FIFA Pro 5-a-side Turf' },
  { name: 'Padel', icon: '🎾', subtitle: 'Glass Panoramic Court' },
  { name: 'Squash', icon: '🏸', subtitle: 'Glass-Back Championship Court' },
  { name: 'Kabaddi', icon: '🤼', subtitle: 'Standard Pro Mat Arena' }
];

export function getEmojiForSport(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('volley')) return '🏐';
  if (lower.includes('basket')) return '🏀';
  if (lower.includes('foot') || lower.includes('soccer') || lower.includes('futsal')) return '⚽';
  if (lower.includes('cricket')) return '🏏';
  if (lower.includes('badminton') || lower.includes('squash')) return '🏸';
  if (lower.includes('tennis') || lower.includes('padel')) return '🎾';
  if (lower.includes('swim') || lower.includes('pool') || lower.includes('aqua')) return '🏊';
  if (lower.includes('skate') || lower.includes('roller')) return '🛼';
  if (lower.includes('golf')) return '⛳';
  if (lower.includes('boxing') || lower.includes('mma')) return '🥊';
  if (lower.includes('archery')) return '🏹';
  if (lower.includes('bowling')) return '🎳';
  if (lower.includes('table') || lower.includes('ping')) return '🏓';
  if (lower.includes('kabaddi')) return '🤼';
  return '🏆';
}

interface CustomSportCreatorProps {
  sports: Sport[];
  onSportsUpdated: (updated: Sport[]) => void;
  onSelectSportId: (sportId: string) => void;
  onClose?: () => void;
}

export const CustomSportCreator: React.FC<CustomSportCreatorProps> = ({
  sports,
  onSportsUpdated,
  onSelectSportId,
  onClose
}) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const upsertSport = (
    sportName: string,
    icon: string,
    customImage?: string,
    customSubtitle?: string
  ) => {
    const cleanName = sportName.trim();
    if (!cleanName) return;

    const existing = sports.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
    let targetSport: Sport;
    let updatedSports: Sport[];

    if (existing) {
      targetSport = {
        ...existing,
        icon: icon || existing.icon,
        image_url: customImage || existing.image_url,
        subtitle: customSubtitle || existing.subtitle
      };
      updatedSports = sports.map(s => (s.id === existing.id ? targetSport : s));
    } else {
      targetSport = {
        id: `sp-${cleanName.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`,
        name: cleanName,
        icon,
        image_url: customImage || undefined,
        subtitle: customSubtitle || undefined
      };
      updatedSports = [...sports, targetSport];
    }

    store.setSports(updatedSports);
    onSportsUpdated(updatedSports);
    onSelectSportId(targetSport.id);
    SupabaseSyncService.syncSportToSupabase(targetSport).catch(() => {});
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      const dataUrl = await processSportImageFile(file);
      setImageUrl(dataUrl);
    } catch (err: any) {
      setUploadError(err.message || 'Could not process image file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateCustom = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!name.trim()) return;

    upsertSport(
      name,
      icon.trim() || getEmojiForSport(name),
      imageUrl.trim() || undefined,
      subtitle.trim() || undefined
    );

    setName('');
    setIcon('');
    setSubtitle('');
    setImageUrl('');
    setUploadError(null);
    onClose?.();
  };

  return (
    <div className="bg-primary/5 border border-primary/20 p-2.5 rounded-xl space-y-2.5 mt-2 animate-modalScaleIn">
      <div>
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider block mb-1">
          ⚡ Quick 1-Click Sports
        </span>
        <div className="flex flex-wrap gap-1">
          {PRESET_QUICK_SPORTS.map(preset => (
            <button
              type="button"
              key={preset.name}
              onClick={() => upsertSport(preset.name, preset.icon, undefined, preset.subtitle)}
              className="bg-white hover:bg-primary/10 border border-outline-variant/50 text-on-surface text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors"
            >
              <span>{preset.icon}</span>
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-outline-variant/30 pt-2 space-y-2">
        <span className="text-[10px] font-bold text-on-surface block">
          Or Add Custom Sport &amp; Card Image:
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5">
          <input
            type="text"
            placeholder="Sport Name (e.g. Swimming, Archery)"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleCreateCustom(e);
              }
            }}
            className="form-input text-xs py-1 font-medium sm:col-span-5"
          />
          <input
            type="text"
            placeholder={name ? getEmojiForSport(name) : '🏊 Emoji'}
            value={icon}
            onChange={e => setIcon(e.target.value)}
            title="Emoji Icon (optional)"
            className="form-input text-xs py-1 font-medium text-center sm:col-span-2"
          />
          <input
            type="text"
            placeholder="Subtitle (e.g. Olympic Heated Pool)"
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            className="form-input text-xs py-1 font-medium sm:col-span-5"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-white hover:bg-primary/10 border border-primary/40 text-primary text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Processing...' : imageUrl ? 'Change Image' : 'Upload Image'}</span>
          </button>

          <input
            type="url"
            placeholder="Or paste image URL (https://...)"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={e => {
              setUploadError(null);
              setImageUrl(e.target.value);
            }}
            className="form-input text-[11px] py-1 flex-1 font-medium"
          />

          <button
            type="button"
            onClick={handleCreateCustom}
            disabled={!name.trim() || isUploading}
            className="btn-primary text-xs px-3 py-1.5 font-bold shrink-0 shadow-xs disabled:opacity-50"
          >
            + Add Sport
          </button>
        </div>

        {uploadError && (
          <div className="flex items-center gap-1 text-[10.5px] text-red-600 font-semibold">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {imageUrl && (
          <div className="flex items-center gap-2.5 bg-white p-1.5 rounded-lg border border-outline-variant/40">
            <div className="w-16 h-10 rounded-md overflow-hidden bg-surface-container-low shrink-0 relative">
              <img src={imageUrl} alt="Sport preview" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] font-bold text-on-surface flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-primary" /> Card Image Ready
              </p>
              <p className="text-[9.5px] text-on-surface-variant truncate">
                {imageUrl.startsWith('data:') ? 'Uploaded local image (compressed)' : imageUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImageUrl('')}
              className="p-1 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Remove selected image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
