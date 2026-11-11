import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, PlusCircle, Trash2, Check, RotateCcw, AlertCircle } from 'lucide-react';
import { Sport, AdminUser } from '../../types/schema';
import { store } from '../../services/store';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { AuditLogger } from '../../services/auditLogger';
import { DEFAULT_SPORT_FALLBACK_IMAGE, processSportImageFile } from '../../utils/imageUpload';
import { getEmojiForSport, SPORT_EMOJI_CHOICES } from './CustomSportCreator';

interface SportsImageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sports: Sport[];
  currentAdmin: AdminUser;
  predefinedSportIds: string[];
  onSportsUpdated: (updated: Sport[]) => void;
  onRequestDeleteSport?: (sportId: string, sportName: string, e: React.MouseEvent) => void;
}

const DEFAULT_FALLBACK_MAP: Record<string, { img: string; subtitle: string; icon: string }> = {
  football: {
    img: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=600&q=80',
    subtitle: '5-a-side & 11-a-side',
    icon: '⚽'
  },
  cricket: {
    img: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=600&q=80',
    subtitle: 'Indoor Net & Turf Pitch',
    icon: '🏏'
  },
  badminton: {
    img: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=600&q=80',
    subtitle: 'BWF Wooden Synthetic',
    icon: '🏸'
  },
  pickleball: {
    img: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=600&q=80',
    subtitle: 'Outdoor Pro Cushioned',
    icon: '🏓'
  }
};

export const SportsImageManagerModal: React.FC<SportsImageManagerModalProps> = ({
  isOpen,
  onClose,
  sports,
  currentAdmin,
  predefinedSportIds,
  onSportsUpdated,
  onRequestDeleteSport
}) => {
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [subtitleDrafts, setSubtitleDrafts] = useState<Record<string, string>>({});
  const [iconDrafts, setIconDrafts] = useState<Record<string, string>>({});
  const [openEmojiPickerId, setOpenEmojiPickerId] = useState<string | null>(null);
  const [savedNoticeId, setSavedNoticeId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const cardFileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  if (!isOpen) return null;

  const showSavedFeedback = (id: string) => {
    setSavedNoticeId(id);
    setTimeout(() => {
      setSavedNoticeId(prev => (prev === id ? null : prev));
    }, 1800);
  };

  const persistSportUpdate = (updatedSport: Sport) => {
    const oldSport = sports.find(s => s.id === updatedSport.id) || null;
    const updatedList = sports.map(s => (s.id === updatedSport.id ? updatedSport : s));
    store.setSports(updatedList);
    onSportsUpdated(updatedList);
    SupabaseSyncService.syncSportToSupabase(updatedSport).catch(() => {});
    AuditLogger.log(currentAdmin.id, 'UPDATE_SPORT_IMAGE', 'Sport', updatedSport.id, oldSport, updatedSport);
    showSavedFeedback(updatedSport.id);
  };

  const handleExistingSportFileUpload = async (sport: Sport, file?: File) => {
    if (!file) return;
    setErrorMsg(null);
    setUploadingId(sport.id);
    try {
      const dataUrl = await processSportImageFile(file);
      persistSportUpdate({ ...sport, image_url: dataUrl });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload image.');
    } finally {
      setUploadingId(null);
      const input = cardFileInputsRef.current[sport.id];
      if (input) input.value = '';
    }
  };

  const handleNewSportFileUpload = async (file?: File) => {
    if (!file) return;
    setErrorMsg(null);
    setUploadingId('__new__');
    try {
      const dataUrl = await processSportImageFile(file);
      setNewImageUrl(dataUrl);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload image.');
    } finally {
      setUploadingId(null);
      if (newFileInputRef.current) newFileInputRef.current.value = '';
    }
  };

  const handleCreateSport = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) return;

    const existing = sports.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      persistSportUpdate({
        ...existing,
        icon: newIcon.trim() || existing.icon,
        subtitle: newSubtitle.trim() || existing.subtitle,
        image_url: newImageUrl.trim() || existing.image_url
      });
    } else {
      const created: Sport = {
        id: `sp-${cleanName.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`,
        name: cleanName,
        icon: newIcon.trim() || getEmojiForSport(cleanName),
        subtitle: newSubtitle.trim() || 'Professional Facilities',
        image_url: newImageUrl.trim() || undefined
      };
      const updatedList = [...sports, created];
      store.setSports(updatedList);
      onSportsUpdated(updatedList);
      SupabaseSyncService.syncSportToSupabase(created).catch(() => {});
      AuditLogger.log(currentAdmin.id, 'CREATE_SPORT', 'Sport', created.id, null, created);
      showSavedFeedback(created.id);
    }

    setNewName('');
    setNewIcon('');
    setNewSubtitle('');
    setNewImageUrl('');
    setErrorMsg(null);
  };

  const handleResetToDefault = (sport: Sport) => {
    const def = DEFAULT_FALLBACK_MAP[sport.name.toLowerCase()];
    persistSportUpdate({
      ...sport,
      icon: def?.icon || sport.icon,
      image_url: def?.img || undefined,
      subtitle: def?.subtitle || 'Professional Facilities'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-outline-variant/40 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-modalScaleIn overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
          <div>
            <h3 className="font-headline font-bold text-base sm:text-lg text-primary flex items-center gap-2">
              <ImageIcon className="w-5 h-5" /> Manage Sports &amp; Card Images
            </h3>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5">
              Upload custom cover images and subtitles for the customer &ldquo;Select Sport&rdquo; cards (e.g., Football, Cricket, Badminton, Swimming).
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Add New Sport & Image Form */}
          <form
            onSubmit={handleCreateSport}
            className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-headline font-bold text-sm text-primary flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4" /> Add New Sport with Cover Image
              </h4>
              <span className="text-[10px] font-bold text-on-surface-variant">
                Appears in Select Sport once assigned to an active pitch
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1">Sport Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Swimming"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="form-input text-xs py-1.5 w-full font-semibold"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-on-surface-variant">Emoji Icon</label>
                  <button
                    type="button"
                    onClick={() => setOpenEmojiPickerId(prev => (prev === '__new__' ? null : '__new__'))}
                    className="text-[10px] font-bold text-primary hover:underline"
                  >
                    Pick
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={newName ? getEmojiForSport(newName) : '🏊'}
                  value={newIcon}
                  onChange={e => setNewIcon(e.target.value)}
                  className="form-input text-xs py-1.5 w-full text-center font-semibold"
                />
              </div>

              <div className="sm:col-span-6">
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1">Card Subtitle</label>
                <input
                  type="text"
                  placeholder="e.g. Olympic & Heated Pool"
                  value={newSubtitle}
                  onChange={e => setNewSubtitle(e.target.value)}
                  className="form-input text-xs py-1.5 w-full font-medium"
                />
              </div>
            </div>

            {openEmojiPickerId === '__new__' && (
              <div className="p-2 bg-white border border-outline-variant/40 rounded-xl flex flex-wrap gap-1.5">
                {SPORT_EMOJI_CHOICES.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setNewIcon(emoji);
                      setOpenEmojiPickerId(null);
                    }}
                    className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-colors ${
                      newIcon === emoji
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-surface-container-low hover:bg-primary/10 border border-outline-variant/40'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                ref={newFileInputRef}
                type="file"
                accept="image/*"
                onChange={e => handleNewSportFileUpload(e.target.files?.[0])}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => newFileInputRef.current?.click()}
                disabled={uploadingId === '__new__'}
                className="bg-white hover:bg-primary/10 border border-primary/40 text-primary text-xs font-bold px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingId === '__new__' ? 'Uploading...' : newImageUrl ? 'Change Image' : 'Upload Sport Image'}</span>
              </button>

              <input
                type="url"
                placeholder="Or paste image URL (https://...)"
                value={newImageUrl.startsWith('data:') ? '' : newImageUrl}
                onChange={e => setNewImageUrl(e.target.value)}
                className="form-input text-xs py-1.5 flex-1 font-medium"
              />

              <button
                type="submit"
                disabled={!newName.trim() || uploadingId === '__new__'}
                className="btn-primary text-xs px-4 py-2 font-bold shrink-0 disabled:opacity-50"
              >
                + Add Sport
              </button>
            </div>

            {newImageUrl && (
              <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-outline-variant/40">
                <img src={newImageUrl} alt="New sport preview" className="w-20 h-12 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-on-surface">Cover Image Preview</p>
                  <p className="text-[10px] text-on-surface-variant truncate">
                    {newImageUrl.startsWith('data:') ? 'Uploaded image ready (compressed)' : newImageUrl}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewImageUrl('')}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </form>

          {/* Existing Sports Grid */}
          <div className="space-y-3">
            <h4 className="font-headline font-bold text-sm text-on-surface">
              Configured Sports ({sports.length})
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sports.map(sport => {
                const fallback = DEFAULT_FALLBACK_MAP[sport.name.toLowerCase()];
                const previewImg = sport.image_url || fallback?.img || DEFAULT_SPORT_FALLBACK_IMAGE;
                const displaySubtitle = subtitleDrafts[sport.id] ?? sport.subtitle ?? fallback?.subtitle ?? 'Professional Facilities';
                const draftUrl = urlDrafts[sport.id] ?? '';
                const isCustom = !predefinedSportIds.includes(sport.id);
                const isJustSaved = savedNoticeId === sport.id;

                return (
                  <div
                    key={sport.id}
                    className="rounded-2xl border border-outline-variant/50 bg-white overflow-hidden shadow-xs flex flex-col"
                  >
                    {/* Storefront Card Preview */}
                    <div className="h-28 w-full relative overflow-hidden bg-surface-container-low">
                      <img
                        src={previewImg}
                        alt={sport.name}
                        onError={e => {
                          const target = e.currentTarget;
                          if (target.src !== DEFAULT_SPORT_FALLBACK_IMAGE) {
                            target.src = DEFAULT_SPORT_FALLBACK_IMAGE;
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30" />
                      <button
                        type="button"
                        onClick={() => setOpenEmojiPickerId(prev => (prev === sport.id ? null : sport.id))}
                        className="absolute top-2 left-2 text-xl bg-white/95 hover:bg-white p-1 rounded-xl shadow-xs transition-transform hover:scale-105 cursor-pointer"
                        title="Click to change emoji icon"
                      >
                        {sport.icon}
                      </button>

                      {isJustSaved && (
                        <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                          <Check className="w-3 h-3" /> Saved
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => cardFileInputsRef.current[sport.id]?.click()}
                        disabled={uploadingId === sport.id}
                        className="absolute bottom-2 right-2 bg-white/95 hover:bg-white text-primary text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{uploadingId === sport.id ? 'Uploading...' : 'Upload Image'}</span>
                      </button>
                      <input
                        ref={el => { cardFileInputsRef.current[sport.id] = el; }}
                        type="file"
                        accept="image/*"
                        onChange={e => handleExistingSportFileUpload(sport, e.target.files?.[0])}
                        className="hidden"
                      />
                    </div>

                    {/* Controls */}
                    <div className="p-3 space-y-2 flex-1 flex flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-headline font-bold text-sm text-on-surface truncate">
                          {sport.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {fallback && (
                            <button
                              type="button"
                              onClick={() => handleResetToDefault(sport)}
                              className="p-1 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                              title="Reset to default image, icon & subtitle"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isCustom && onRequestDeleteSport && (
                            <button
                              type="button"
                              onClick={e => onRequestDeleteSport(sport.id, sport.name, e)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title={`Delete ${sport.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="block text-[10px] font-bold text-on-surface-variant">
                            Emoji Icon
                          </label>
                          <button
                            type="button"
                            onClick={() => setOpenEmojiPickerId(prev => (prev === sport.id ? null : sport.id))}
                            className="text-[10px] font-bold text-primary hover:underline"
                          >
                            {openEmojiPickerId === sport.id ? 'Hide Picker' : 'Quick Pick'}
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={iconDrafts[sport.id] ?? sport.icon}
                            onChange={e => setIconDrafts(prev => ({ ...prev, [sport.id]: e.target.value }))}
                            placeholder="🏆"
                            className="form-input text-xs py-1 flex-1 font-medium text-center"
                          />
                          {iconDrafts[sport.id] !== undefined &&
                            iconDrafts[sport.id].trim() !== '' &&
                            iconDrafts[sport.id].trim() !== sport.icon && (
                              <button
                                type="button"
                                onClick={() => {
                                  persistSportUpdate({ ...sport, icon: iconDrafts[sport.id].trim() });
                                  setIconDrafts(prev => {
                                    const next = { ...prev };
                                    delete next[sport.id];
                                    return next;
                                  });
                                }}
                                className="btn-primary text-[10px] px-2 py-1 font-bold"
                              >
                                Save
                              </button>
                            )}
                        </div>

                        {openEmojiPickerId === sport.id && (
                          <div className="mt-1.5 p-1.5 bg-surface-container-low border border-outline-variant/40 rounded-xl flex flex-wrap gap-1">
                            {SPORT_EMOJI_CHOICES.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  persistSportUpdate({ ...sport, icon: emoji });
                                  setIconDrafts(prev => {
                                    const next = { ...prev };
                                    delete next[sport.id];
                                    return next;
                                  });
                                  setOpenEmojiPickerId(null);
                                }}
                                className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-colors ${
                                  sport.icon === emoji
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'bg-white hover:bg-primary/10 border border-outline-variant/40'
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant mb-0.5">
                          Subtitle
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={displaySubtitle}
                            onChange={e => setSubtitleDrafts(prev => ({ ...prev, [sport.id]: e.target.value }))}
                            placeholder="Card subtitle"
                            className="form-input text-[11px] py-1 flex-1 font-medium"
                          />
                          {subtitleDrafts[sport.id] !== undefined && subtitleDrafts[sport.id] !== (sport.subtitle || '') && (
                            <button
                              type="button"
                              onClick={() => {
                                persistSportUpdate({ ...sport, subtitle: subtitleDrafts[sport.id].trim() || undefined });
                                setSubtitleDrafts(prev => {
                                  const next = { ...prev };
                                  delete next[sport.id];
                                  return next;
                                });
                              }}
                              className="btn-primary text-[10px] px-2 py-1 font-bold"
                            >
                              Save
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant mb-0.5">
                          Or Paste Image URL
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="url"
                            value={draftUrl}
                            onChange={e => setUrlDrafts(prev => ({ ...prev, [sport.id]: e.target.value }))}
                            placeholder="https://images..."
                            className="form-input text-[11px] py-1 flex-1 font-medium"
                          />
                          <button
                            type="button"
                            disabled={!draftUrl.trim()}
                            onClick={() => {
                              persistSportUpdate({ ...sport, image_url: draftUrl.trim() });
                              setUrlDrafts(prev => {
                                const next = { ...prev };
                                delete next[sport.id];
                                return next;
                              });
                            }}
                            className="btn-secondary text-[10px] px-2 py-1 font-bold disabled:opacity-40"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/30 bg-surface-container-low flex justify-end">
          <button onClick={onClose} className="btn-primary text-xs px-5 py-2 font-bold">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
