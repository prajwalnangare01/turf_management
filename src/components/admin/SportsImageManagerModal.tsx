import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, PlusCircle, Check, RotateCcw, AlertCircle, GripVertical, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { Sport, AdminUser, Court } from '../../types/schema';
import { store } from '../../services/store';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { AuditLogger } from '../../services/auditLogger';
import { DEFAULT_SPORT_FALLBACK_IMAGE, processSportImageFile } from '../../utils/imageUpload';
import { getEmojiForSport, SPORT_EMOJI_CHOICES } from './CustomSportCreator';

interface SportsImageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sports: Sport[];
  courts?: Court[];
  currentAdmin: AdminUser;
  predefinedSportIds: string[];
  onSportsUpdated: (updated: Sport[]) => void;
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
  courts,
  currentAdmin,
  predefinedSportIds,
  onSportsUpdated
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
  const [draggedSportId, setDraggedSportId] = useState<string | null>(null);
  const [dragOverSportId, setDragOverSportId] = useState<string | null>(null);
  const [reorderSuccessMsg, setReorderSuccessMsg] = useState<string | null>(null);

  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const cardFileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  if (!isOpen) return null;

  // Active courts resolution
  const activeCourtsList = courts && courts.length > 0 ? courts : store.getCourts();

  // Helper: Find courts that list this sport
  const getCourtsForSport = (sport: Sport): Court[] => {
    return activeCourtsList.filter(c => {
      if (Array.isArray(c.sport_ids) && c.sport_ids.includes(sport.id)) return true;
      if (Array.isArray(c.sport_ids) && c.sport_ids.some(id => id.toLowerCase() === sport.id.toLowerCase() || id.toLowerCase().includes(sport.name.toLowerCase()))) return true;
      return false;
    });
  };

  // Only show sports of which our courts are listed, sorted by display_order!
  const listedCourtSports = sports
    .filter(s => getCourtsForSport(s).length > 0)
    .sort((a, b) => {
      const ordA = typeof a.display_order === 'number' ? a.display_order : sports.findIndex(s => s.id === a.id);
      const ordB = typeof b.display_order === 'number' ? b.display_order : sports.findIndex(s => s.id === b.id);
      if (ordA !== -1 && ordB !== -1) return ordA - ordB;
      if (ordA !== -1) return -1;
      if (ordB !== -1) return 1;
      return 0;
    });

  const showSavedFeedback = (id: string) => {
    setSavedNoticeId(id);
    setTimeout(() => {
      setSavedNoticeId(prev => (prev === id ? null : prev));
    }, 1800);
  };

  const persistSportUpdate = (updatedSport: Sport) => {
    const oldSport = sports.find(s => s.id === updatedSport.id) || null;
    const finalSport: Sport = {
      ...updatedSport,
      display_order: updatedSport.display_order ?? oldSport?.display_order ?? sports.findIndex(s => s.id === updatedSport.id)
    };
    const updatedList = sports.map(s => (s.id === finalSport.id ? finalSport : s));
    store.setSports(updatedList);
    onSportsUpdated(updatedList);
    SupabaseSyncService.syncSportToSupabase(finalSport).catch(() => {});
    AuditLogger.log(currentAdmin.id, 'UPDATE_SPORT_IMAGE', 'Sport', finalSport.id, oldSport, finalSport);
    showSavedFeedback(finalSport.id);
  };

  const handleReorder = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const fromIndex = listedCourtSports.findIndex(s => s.id === sourceId);
    const toIndex = listedCourtSports.findIndex(s => s.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reorderedListed = [...listedCourtSports];
    const [movedItem] = reorderedListed.splice(fromIndex, 1);
    reorderedListed.splice(toIndex, 0, movedItem);

    // Keep unlisted sports after the listed ones while preserving their order
    const unlisted = sports.filter(s => !reorderedListed.some(rs => rs.id === s.id));
    const fullUpdatedSports: Sport[] = [...reorderedListed, ...unlisted].map((s, idx) => ({
      ...s,
      display_order: idx
    }));

    store.setSports(fullUpdatedSports);
    onSportsUpdated(fullUpdatedSports);
    SupabaseSyncService.syncSportsOrderToSupabase(fullUpdatedSports).catch(() => {});
    AuditLogger.log(currentAdmin.id, 'REORDER_SPORTS', 'Sport', movedItem.id, null, {
      movedSport: movedItem.name,
      fromPosition: fromIndex + 1,
      toPosition: toIndex + 1,
      newOrder: fullUpdatedSports.map(s => s.name)
    });

    setReorderSuccessMsg(`Arranged "${movedItem.name}" to position #${toIndex + 1}`);
    setTimeout(() => {
      setReorderSuccessMsg(null);
    }, 2500);
  };

  const handleMoveStep = (sportId: string, direction: 'earlier' | 'later') => {
    const currentIndex = listedCourtSports.findIndex(s => s.id === sportId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'earlier' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= listedCourtSports.length) return;

    const targetSport = listedCourtSports[targetIndex];
    handleReorder(sportId, targetSport.id);
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
        image_url: newImageUrl.trim() || undefined,
        display_order: sports.length
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
              Upload custom cover images and subtitles for sports with active pitches listed on your venue.
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
                Will appear once assigned to an active pitch in Configured Pitches
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

          {/* Listed Sports Grid (Only sports whose pitches are listed!) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-headline font-bold text-sm text-on-surface">
                  Sports with Listed Pitches ({listedCourtSports.length})
                </h4>
                <p className="text-[11px] text-on-surface-variant font-medium">
                  Showing only the sports configured on your venue&apos;s pitches and courts.
                </p>
              </div>
            </div>

            {/* Reorder Guidance & Drag Notice */}
            {listedCourtSports.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-primary flex items-center gap-1.5">
                      Arrange Display Sequence (Drag &amp; Drop)
                    </h5>
                    <p className="text-[11px] text-on-surface-variant font-medium">
                      Drag any sport card by its grip handle (or use the ◀ / ▶ buttons) to choose the display order (1st, 2nd, etc.) on the customer booking page.
                    </p>
                  </div>
                </div>
                {reorderSuccessMsg && (
                  <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs shrink-0 animate-fadeIn">
                    <Check className="w-3.5 h-3.5" />
                    <span>{reorderSuccessMsg}</span>
                  </div>
                )}
              </div>
            )}

            {listedCourtSports.length === 0 ? (
              <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-dashed border-outline-variant/60 space-y-2">
                <div className="text-3xl">🏟️</div>
                <h5 className="font-headline font-bold text-sm text-on-surface">No Sports Assigned to Pitches</h5>
                <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                  Only sports associated with active pitches appear here. Please assign sports to your pitches in Configured Pitches to manage card covers.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {listedCourtSports.map((sport, index) => {
                  const fallback = DEFAULT_FALLBACK_MAP[sport.name.toLowerCase()];
                  const previewImg = sport.image_url || fallback?.img || DEFAULT_SPORT_FALLBACK_IMAGE;
                  const displaySubtitle = subtitleDrafts[sport.id] ?? sport.subtitle ?? fallback?.subtitle ?? 'Professional Facilities';
                  const draftUrl = urlDrafts[sport.id] ?? '';
                  const isJustSaved = savedNoticeId === sport.id;
                  const assignedCourts = getCourtsForSport(sport);
                  const isDragging = draggedSportId === sport.id;
                  const isDragOver = dragOverSportId === sport.id && draggedSportId !== sport.id;

                  return (
                    <div
                      key={sport.id}
                      draggable
                      onDragStart={e => {
                        const target = e.target as HTMLElement;
                        if (
                          target.tagName === 'INPUT' ||
                          target.tagName === 'TEXTAREA' ||
                          target.tagName === 'BUTTON' ||
                          target.closest('input') ||
                          target.closest('button')
                        ) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', sport.id);
                        setDraggedSportId(sport.id);
                      }}
                      onDragOver={e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverSportId !== sport.id) {
                          setDragOverSportId(sport.id);
                        }
                      }}
                      onDragLeave={e => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        if (dragOverSportId === sport.id) {
                          setDragOverSportId(null);
                        }
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        const sourceId = e.dataTransfer.getData('text/plain') || draggedSportId;
                        setDraggedSportId(null);
                        setDragOverSportId(null);
                        if (sourceId) {
                          handleReorder(sourceId, sport.id);
                        }
                      }}
                      onDragEnd={() => {
                        setDraggedSportId(null);
                        setDragOverSportId(null);
                      }}
                      className={`rounded-2xl border bg-white overflow-hidden shadow-xs flex flex-col transition-all duration-200 ${
                        isDragging
                          ? 'opacity-40 scale-95 ring-2 ring-primary border-primary shadow-lg cursor-grabbing'
                          : isDragOver
                          ? 'ring-2 ring-primary border-primary scale-[1.02] shadow-xl bg-primary/5'
                          : 'border-outline-variant/50 hover:border-primary/40 hover:shadow-sm'
                      }`}
                    >
                      {/* Reorder Grip & Sequence Bar */}
                      <div className="bg-surface-container-low px-3 py-2 border-b border-outline-variant/30 flex items-center justify-between gap-2 select-none">
                        <div
                          className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing text-on-surface-variant hover:text-primary transition-colors py-0.5"
                          title="Click and drag to rearrange this sport"
                        >
                          <GripVertical className="w-4 h-4 text-on-surface-variant/80 shrink-0" />
                          <span className="text-[11px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                            #{index + 1}
                          </span>
                          <span className="text-[11px] font-bold text-on-surface-variant">
                            {index === 0 ? '1st (First Displayed)' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={e => {
                              e.stopPropagation();
                              handleMoveStep(sport.id, 'earlier');
                            }}
                            className="p-1 rounded-md text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                            title={index === 0 ? 'Already first in order' : `Move ${sport.name} earlier (Left)`}
                            aria-label={`Move ${sport.name} earlier`}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={index === listedCourtSports.length - 1}
                            onClick={e => {
                              e.stopPropagation();
                              handleMoveStep(sport.id, 'later');
                            }}
                            className="p-1 rounded-md text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                            title={index === listedCourtSports.length - 1 ? 'Already last in order' : `Move ${sport.name} later (Right)`}
                            aria-label={`Move ${sport.name} later`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

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
                          </div>
                        </div>

                        {/* Associated Pitches Badge */}
                        <div className="bg-primary/5 border border-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="shrink-0">{assignedCourts.length} Pitch{assignedCourts.length > 1 ? 'es' : ''}:</span>
                          <span className="font-semibold text-on-surface truncate">
                            {assignedCourts.map(c => c.name).join(', ')}
                          </span>
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
            )}
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
