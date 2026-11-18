import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Cake,
  Calendar,
  Edit3,
  Heart,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PartyPopper,
  Plane,
  Plus,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { RELATIONSHIPS, T, translateRelationship } from '../i18n';
import type {
  Family,
  FamilyHistoryData,
  FamilyMember,
  Lang,
  LocalProfile,
  MediaAsset,
} from '../types';
import { EditFamilyModal } from './EditFamilyModal';
import { SinglePhotoUploader } from './MediaUploader';
import { AvatarStack, WishSenderPickerRow, resolveSelectedSenders } from './MemberSenderPicker';

interface Props {
  lang: Lang;
  familyId: string;
  families: Family[];
  allMembers: FamilyMember[];
  localProfile: LocalProfile;
  onBack: () => void;
  onFamilyUpdated: (updated: Family) => void;
  refreshSignal: number;
}

type HistoryFilter = 'all' | 'trips' | 'pictures' | 'birthdays' | 'events';

function getDaysUntilBirthday(birthDate: string): number {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return 999;
  const [, mStr, dStr] = birthDate.split('-');
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m, d);
  if (next < today) {
    next = new Date(now.getFullYear() + 1, m, d);
  }
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const EMPTY_HISTORY: FamilyHistoryData = {
  trips: [],
  pictures: [],
  events: [],
  birthdays: [],
};

export const FamilyDetailView: React.FC<Props> = ({
  lang,
  familyId,
  families,
  allMembers,
  localProfile,
  onBack,
  onFamilyUpdated,
  refreshSignal,
}) => {
  const t = T[lang];
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [history, setHistory] = useState<FamilyHistoryData>(EMPTY_HISTORY);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [wishText, setWishText] = useState<Record<string, string>>({});
  const [wishSenderIds, setWishSenderIds] = useState<Record<string, string[]>>({});
  const [lightboxMedia, setLightboxMedia] = useState<MediaAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingFamily, setEditingFamily] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);

  // Member form state
  const [mName, setMName] = useState('');
  const [mRel, setMRel] = useState('Father');
  const [mBirthday, setMBirthday] = useState('');
  const [mPhoto, setMPhoto] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [savingMember, setSavingMember] = useState(false);

  const authorName =
    localProfile.name.trim() || (lang === 'si' ? 'පවුලේ සාමාජික' : 'Family Member');

  const fetchFamilyDetail = async (): Promise<Family | null> => {
    setError('');
    try {
      const res = await fetch(`/api/families/${familyId}`, {
        cache: 'no-store',
        headers: { 'x-client-id': localProfile.clientId },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load family');
      setFamily(data.family);
      setMembers(data.members || []);
      setHistory(data.history || EMPTY_HISTORY);
      return data.family || null;
    } catch (err: any) {
      setError(err.message || 'Error loading family');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setHistoryFilter('all');
    fetchFamilyDetail();
  }, [familyId]);

  useEffect(() => {
    if (refreshSignal > 0) {
      fetchFamilyDetail();
    }
  }, [refreshSignal]);

  const openAddMember = () => {
    setEditingMember(null);
    setMName('');
    setMRel('Father');
    setMBirthday('');
    setMPhoto('');
    setMDesc('');
    setMemberModalOpen(true);
  };

  const openEditMember = (m: FamilyMember) => {
    setEditingMember(m);
    setMName(m.name);
    setMRel(m.relationship);
    setMBirthday(m.birthday);
    setMPhoto(m.photoUrl);
    setMDesc(m.description);
    setMemberModalOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMember(true);
    try {
      if (editingMember) {
        const res = await fetch(`/api/members/${editingMember.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': localProfile.clientId,
            'x-author-name': encodeURIComponent(authorName),
          },
          body: JSON.stringify({
            name: mName,
            relationship: mRel,
            birthday: mBirthday,
            photoUrl: mPhoto,
            description: mDesc,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        setMembers((prev) => prev.map((x) => (x.id === editingMember.id ? data.member : x)));
      } else {
        const res = await fetch(`/api/families/${familyId}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': localProfile.clientId,
            'x-author-name': encodeURIComponent(authorName),
          },
          body: JSON.stringify({
            name: mName,
            relationship: mRel,
            birthday: mBirthday,
            photoUrl: mPhoto,
            description: mDesc,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Add failed');
        setMembers((prev) => [...prev, data.member]);
      }
      setMemberModalOpen(false);
      const updatedFam = await fetchFamilyDetail();
      if (updatedFam) onFamilyUpdated(updatedFam);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSavingMember(false);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'x-client-id': localProfile.clientId },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      const updatedFam = await fetchFamilyDetail();
      if (updatedFam) onFamilyUpdated(updatedFam);
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  const handleToggleLike = async (
    targetType: 'trip' | 'gallery' | 'event',
    targetId: string,
    itemTitle: string
  ) => {
    const res = await fetch('/api/likes/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': localProfile.clientId,
      },
      body: JSON.stringify({ targetType, targetId, authorName, itemTitle }),
    });
    if (res.ok) {
      const data = await res.json();
      setHistory((prev) => {
        if (targetType === 'trip') {
          return {
            ...prev,
            trips: prev.trips.map((x) =>
              x.id === targetId ? { ...x, likeCount: data.likeCount, likedByMe: data.likedByMe } : x
            ),
          };
        }
        if (targetType === 'gallery') {
          return {
            ...prev,
            pictures: prev.pictures.map((x) =>
              x.id === targetId ? { ...x, likeCount: data.likeCount, likedByMe: data.likedByMe } : x
            ),
          };
        }
        return {
          ...prev,
          events: prev.events.map((x) =>
            x.id === targetId ? { ...x, likeCount: data.likeCount, likedByMe: data.likedByMe } : x
          ),
        };
      });
    }
  };

  const handleSendWish = async (targetKey: string) => {
    const msg = (wishText[targetKey] || '').trim();
    if (!msg) return;
    const resolved = resolveSelectedSenders(
      wishSenderIds[targetKey] || [],
      allMembers,
      localProfile,
      lang
    );
    const res = await fetch(`/api/birthdays/${targetKey}/wishes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': localProfile.clientId,
      },
      body: JSON.stringify({
        message: msg,
        authorName: resolved.name,
        authorAvatar: resolved.avatar,
        authorAvatars: resolved.avatars,
      }),
    });
    if (res.ok) {
      setWishText((prev) => ({ ...prev, [targetKey]: '' }));
      await fetchFamilyDetail();
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t.loading}</span>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-sm text-rose-600">{error || 'Family not found'}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium"
        >
          {t.backToFamilies}
        </button>
      </div>
    );
  }

  const displayName = lang === 'si' ? family.nameSi : family.nameEn;
  const displayDesc =
    lang === 'si'
      ? family.descriptionSi || family.descriptionEn
      : family.descriptionEn || family.descriptionSi;

  const totalHistoryCount =
    history.trips.length +
    history.pictures.length +
    history.birthdays.length +
    history.events.length;

  const showTrips =
    (historyFilter === 'all' || historyFilter === 'trips') && history.trips.length > 0;
  const showPictures =
    (historyFilter === 'all' || historyFilter === 'pictures') && history.pictures.length > 0;
  const showBirthdays =
    (historyFilter === 'all' || historyFilter === 'birthdays') && history.birthdays.length > 0;
  const showEvents =
    (historyFilter === 'all' || historyFilter === 'events') && history.events.length > 0;
  const hasVisibleHistory = showTrips || showPictures || showBirthdays || showEvents;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-16 space-y-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-rose-700 dark:hover:text-rose-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t.backToFamilies}</span>
      </button>

      {/* Family Cover Header */}
      <div className="rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 aspect-16/10 lg:aspect-auto lg:min-h-[340px] bg-stone-100 dark:bg-stone-800 relative">
          {family.coverPhotoUrl ? (
            <img
              src={family.coverPhotoUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
              <ImageIcon className="w-10 h-10 text-stone-400 mb-2" />
              <p className="text-sm text-stone-500">{t.noPhotoYet}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400 tabular-nums">
              0{family.sortOrder} · {members.length} {t.membersCount}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-50">
              {displayName}
            </h1>
            <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300 leading-relaxed">
              {displayDesc || t.noDescriptionYet}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={openAddMember}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white px-4 py-2.5 text-xs font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t.addMember}</span>
            </button>
            <button
              type="button"
              onClick={() => setEditingFamily(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 dark:border-stone-700 px-4 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-rose-300 dark:hover:border-rose-700"
            >
              <Edit3 className="w-4 h-4" />
              <span>{t.editFamily}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Members Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-4">
          <h2 className="font-display text-2xl font-bold text-stone-900 dark:text-stone-100">
            {lang === 'si' ? 'පවුලේ සාමාජිකයන්' : 'Family Members'}
          </h2>
          <button
            type="button"
            onClick={openAddMember}
            className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-rose-700 dark:hover:bg-rose-600 dark:hover:text-white px-4 py-2 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.addMember}</span>
          </button>
        </div>

        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center space-y-3">
            <User className="w-8 h-8 text-stone-400 mx-auto" />
            <p className="text-sm text-stone-600 dark:text-stone-400 max-w-md mx-auto">
              {t.noMembersYet}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {members.map((m) => (
              <article
                key={m.id}
                className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 border border-stone-200 dark:border-stone-700">
                    {m.photoUrl ? (
                      <img
                        src={m.photoUrl}
                        alt={m.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400">
                        <User className="w-7 h-7" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {m.name}
                    </h3>
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-400 mt-0.5">
                      {translateRelationship(m.relationship, lang)}
                    </p>
                    {m.birthday && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5 flex items-center gap-1.5 tabular-nums">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{m.birthday}</span>
                      </p>
                    )}
                  </div>
                </div>

                {m.description && (
                  <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                    {m.description}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => openEditMember(m)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-rose-300"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{t.edit}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMember(m.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t.delete}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Family History Section (Trips, Pictures, Birthdays, Events — Excludes Chats & Announcements) */}
      <section className="space-y-6 pt-4">
        <div className="border-b border-stone-200 dark:border-stone-800 pb-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-stone-900 dark:text-stone-100">
              {t.familyHistoryTitle}
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 mt-1">
              {t.familyHistorySub}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-stone-100 dark:bg-stone-800">
            {(
              [
                ['all', t.historyAll, totalHistoryCount],
                ['trips', t.historyTrips, history.trips.length],
                ['pictures', t.historyPictures, history.pictures.length],
                ['birthdays', t.historyBirthdays, history.birthdays.length],
                ['events', t.historyEvents, history.events.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setHistoryFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors tabular-nums ${
                  historyFilter === key
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {!hasVisibleHistory ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center space-y-2">
            <Plane className="w-7 h-7 text-stone-400 mx-auto" />
            <p className="text-sm text-stone-600 dark:text-stone-400 max-w-md mx-auto">
              {t.noHistoryYet}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Family Trips */}
            {showTrips && (
              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                  <span>{t.historyTrips}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {history.trips.map((tr) => (
                    <article
                      key={tr.id}
                      className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-4"
                    >
                      <div>
                        <p className="text-xs text-rose-700 dark:text-rose-400 font-medium tabular-nums flex items-center gap-1.5">
                          <span>{tr.tripDate}</span>
                          <span>·</span>
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{tr.destination}</span>
                        </p>
                        <h4 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100 mt-1">
                          {tr.title}
                        </h4>
                      </div>

                      {tr.description && (
                        <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                          {tr.description}
                        </p>
                      )}

                      {tr.media.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {tr.media.map((m, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setLightboxMedia(m)}
                              className="aspect-square rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
                            >
                              {m.type === 'video' ? (
                                <video src={m.url} className="w-full h-full object-cover" />
                              ) : (
                                <img
                                  src={m.url}
                                  alt={tr.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800">
                        <span className="text-xs text-stone-400">{tr.createdByName}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleLike('trip', tr.id, tr.title)}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors border ${
                            tr.likedByMe
                              ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                              : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-rose-300'
                          }`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${tr.likedByMe ? 'fill-rose-600 text-rose-600' : ''}`}
                          />
                          <span>{tr.likedByMe ? t.likedBtn : t.likeBtn}</span>
                          {(tr.likeCount || 0) > 0 && (
                            <span className="tabular-nums">· {tr.likeCount}</span>
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {/* Family Pictures & Videos */}
            {showPictures && (
              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                  <span>{t.historyPictures}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {history.pictures.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden flex flex-col justify-between"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxMedia({
                            url: item.mediaUrl,
                            type: item.mediaType,
                            name: item.title,
                          })
                        }
                        className="aspect-4/3 w-full bg-stone-100 dark:bg-stone-800 overflow-hidden"
                      >
                        {item.mediaType === 'video' ? (
                          <video src={item.mediaUrl} className="w-full h-full object-cover" />
                        ) : (
                          <img
                            src={item.mediaUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
                          />
                        )}
                      </button>
                      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-rose-700 dark:text-rose-400 tabular-nums">
                            {item.momentDate}
                          </p>
                          <h4 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
                            {item.title}
                          </h4>
                          {item.location && (
                            <p className="text-xs text-stone-600 dark:text-stone-300 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                              <span>{item.location}</span>
                            </p>
                          )}
                          {item.caption && (
                            <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-2">
                              {item.caption}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
                          <span className="text-[11px] text-stone-400">{item.uploadedByName}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleLike('gallery', item.id, item.title)}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition-colors border ${
                              item.likedByMe
                                ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-rose-300'
                            }`}
                          >
                            <Heart
                              className={`w-3.5 h-3.5 ${item.likedByMe ? 'fill-rose-600 text-rose-600' : ''}`}
                            />
                            <span>{item.likedByMe ? t.likedBtn : t.likeBtn}</span>
                            {item.likeCount > 0 && (
                              <span className="tabular-nums">· {item.likeCount}</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {/* Family Birthdays */}
            {showBirthdays && (
              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Cake className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                  <span>{t.historyBirthdays}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {history.birthdays.map((b) => {
                    const days = getDaysUntilBirthday(b.birthDate);
                    return (
                      <article
                        key={b.targetKey}
                        className={`rounded-2xl border bg-white dark:bg-stone-900 p-5 space-y-4 ${
                          days <= 30
                            ? 'border-amber-300 dark:border-amber-800/80'
                            : 'border-stone-200 dark:border-stone-800'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 flex items-center justify-center border border-stone-200 dark:border-stone-700">
                            {b.photoUrl ? (
                              <img
                                src={b.photoUrl}
                                alt={b.memberName}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Cake className="w-6 h-6 text-rose-600" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
                              {b.memberName}
                            </h4>
                            <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums mt-0.5">
                              {b.birthDate}
                              {b.notes && <> · {b.notes}</>}
                            </p>
                            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mt-1 tabular-nums">
                              {days === 0 ? t.todayLabel : `${days} ${t.daysAway}`}
                            </p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-3">
                          <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                            {t.birthdayWishes} ({b.wishes.length})
                          </p>
                          {b.wishes.length > 0 && (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {b.wishes.map((w) => (
                                <div
                                  key={w.id}
                                  className="rounded-xl bg-stone-50 dark:bg-stone-800/60 px-3 py-2 text-xs flex items-start gap-2.5"
                                >
                                  <AvatarStack
                                    avatars={w.authorAvatars}
                                    fallbackAvatar={w.authorAvatar}
                                    alt={w.authorName}
                                    size="sm"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="font-semibold text-stone-900 dark:text-stone-100">
                                      {w.authorName}
                                    </span>
                                    <p className="text-stone-700 dark:text-stone-300 mt-0.5">
                                      {w.message}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <WishSenderPickerRow
                            lang={lang}
                            families={families}
                            allMembers={allMembers}
                            localProfile={localProfile}
                            selectedIds={wishSenderIds[b.targetKey] || []}
                            preferredFamilyId={familyId}
                            onChange={(ids) =>
                              setWishSenderIds((prev) => ({ ...prev, [b.targetKey]: ids }))
                            }
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={wishText[b.targetKey] || ''}
                              onChange={(e) =>
                                setWishText((prev) => ({ ...prev, [b.targetKey]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSendWish(b.targetKey);
                                }
                              }}
                              placeholder={t.writeWish}
                              className="flex-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleSendWish(b.targetKey)}
                              className="inline-flex items-center gap-1 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-rose-700 dark:hover:bg-rose-600 dark:hover:text-white px-3.5 py-2 text-xs font-medium transition-colors"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{t.sendWish}</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Family Events */}
            {showEvents && (
              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <PartyPopper className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                  <span>{t.historyEvents}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {history.events.map((ev) => (
                    <article
                      key={ev.id}
                      className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-4"
                    >
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-rose-700 dark:text-rose-400 tabular-nums">
                          {ev.eventDate} · {ev.category}
                          {ev.location && (
                            <>
                              {' · '}
                              <MapPin className="w-3 h-3 inline mr-0.5" />
                              {ev.location}
                            </>
                          )}
                        </p>
                        <h4 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                          {ev.title}
                        </h4>
                      </div>

                      {ev.description && (
                        <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                          {ev.description}
                        </p>
                      )}

                      {ev.media.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {ev.media.map((m, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setLightboxMedia(m)}
                              className="aspect-square rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
                            >
                              {m.type === 'video' ? (
                                <video src={m.url} className="w-full h-full object-cover" />
                              ) : (
                                <img
                                  src={m.url}
                                  alt={ev.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800">
                        <span className="text-xs text-stone-400">{ev.createdByName}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleLike('event', ev.id, ev.title)}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors border ${
                            ev.likedByMe
                              ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                              : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-rose-300'
                          }`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${ev.likedByMe ? 'fill-rose-600 text-rose-600' : ''}`}
                          />
                          <span>{ev.likedByMe ? t.likedBtn : t.likeBtn}</span>
                          {(ev.likeCount || 0) > 0 && (
                            <span className="tabular-nums">· {ev.likeCount}</span>
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {editingFamily && (
        <EditFamilyModal
          lang={lang}
          family={family}
          localProfile={localProfile}
          onClose={() => setEditingFamily(false)}
          onSaved={(updated) => {
            setFamily(updated);
            onFamilyUpdated(updated);
          }}
        />
      )}

      {/* Add / Edit Member Modal */}
      {memberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
                {editingMember ? t.editMember : t.addMember}
              </h3>
              <button
                type="button"
                onClick={() => setMemberModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveMember} className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shrink-0 flex items-center justify-center">
                  {mPhoto ? (
                    <img
                      src={mPhoto}
                      alt={mName || 'Member'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-stone-400" />
                  )}
                </div>
                <SinglePhotoUploader lang={lang} value={mPhoto} onChange={setMPhoto} />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t.memberName}
                </label>
                <input
                  type="text"
                  required
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    {t.relationship}
                  </label>
                  <select
                    value={mRel}
                    onChange={(e) => setMRel(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {lang === 'si' ? r.si : r.en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    {t.birthday}
                  </label>
                  <input
                    type="date"
                    value={mBirthday}
                    onChange={(e) => setMBirthday(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t.personalDesc}
                </label>
                <textarea
                  rows={3}
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-medium"
                >
                  {savingMember && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t.save}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Viewer */}
      {lightboxMedia && (
        <div
          onClick={() => setLightboxMedia(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxMedia(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl max-h-[85vh] w-full flex items-center justify-center"
          >
            {lightboxMedia.type === 'video' ? (
              <video src={lightboxMedia.url} controls autoPlay className="max-h-[85vh] rounded-xl" />
            ) : (
              <img
                src={lightboxMedia.url}
                alt={lightboxMedia.name || 'Media'}
                referrerPolicy="no-referrer"
                className="max-h-[85vh] max-w-full rounded-xl object-contain"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
