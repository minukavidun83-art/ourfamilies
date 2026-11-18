import React, { useEffect, useMemo, useState } from 'react';
import {
  Cake,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
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
import { T } from '../i18n';
import type {
  BirthdayEntry,
  EventEntry,
  Family,
  FamilyMember,
  FeatureSubTab,
  Lang,
  LocalProfile,
  MediaAsset,
  TripEntry,
} from '../types';
import { MultiMediaUploader, SinglePhotoUploader } from './MediaUploader';
import { AvatarStack, WishSenderPickerRow, resolveSelectedSenders } from './MemberSenderPicker';

interface Props {
  lang: Lang;
  families: Family[];
  allMembers: FamilyMember[];
  localProfile: LocalProfile;
  refreshSignal: number;
  initialSubTab?: FeatureSubTab;
}

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

export const SpecialFeaturesView: React.FC<Props> = ({
  lang,
  families,
  allMembers,
  localProfile,
  refreshSignal,
  initialSubTab = 'birthdays',
}) => {
  const t = T[lang];
  const [subTab, setSubTab] = useState<FeatureSubTab>(initialSubTab);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [trips, setTrips] = useState<TripEntry[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxMedia, setLightboxMedia] = useState<MediaAsset | null>(null);

  // Birthday Calendar State
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [wishText, setWishText] = useState<Record<string, string>>({});
  const [wishSenderIds, setWishSenderIds] = useState<Record<string, string[]>>({});
  const [showAddBirthday, setShowAddBirthday] = useState(false);
  const [bName, setBName] = useState('');
  const [bDate, setBDate] = useState('');
  const [bFamily, setBFamily] = useState('');
  const [bPhoto, setBPhoto] = useState('');
  const [bNotes, setBNotes] = useState('');

  // Trips State
  const [tripFilter, setTripFilter] = useState<'all' | 'upcoming' | 'previous'>('all');
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [tTitle, setTTitle] = useState('');
  const [tDest, setTDest] = useState('');
  const [tDate, setTDate] = useState('');
  const [tFamily, setTFamily] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tMedia, setTMedia] = useState<MediaAsset[]>([]);
  const [tripError, setTripError] = useState('');

  // Events State
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eCat, setECat] = useState<'wedding' | 'party' | 'celebration' | 'religious' | 'other'>('celebration');
  const [eDate, setEDate] = useState('');
  const [eLoc, setELoc] = useState('');
  const [eFamily, setEFamily] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eMedia, setEMedia] = useState<MediaAsset[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const authorName =
    localProfile.name.trim() || (lang === 'si' ? 'පවුලේ සාමාජික' : 'Family Member');

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const headers = { 'x-client-id': localProfile.clientId };
      const [bRes, tRes, eRes] = await Promise.all([
        fetch('/api/birthdays', { cache: 'no-store', headers }),
        fetch('/api/trips', { cache: 'no-store', headers }),
        fetch('/api/events', { cache: 'no-store', headers }),
      ]);
      if (bRes.ok) setBirthdays((await bRes.json()).birthdays || []);
      if (tRes.ok) setTrips((await tRes.json()).trips || []);
      if (eRes.ok) setEvents((await eRes.json()).events || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(refreshSignal > 0);
  }, [refreshSignal]);

  const sortedBirthdays = useMemo(() => {
    return [...birthdays].sort(
      (a, b) => getDaysUntilBirthday(a.birthDate) - getDaysUntilBirthday(b.birthDate)
    );
  }, [birthdays]);

  // Auto 1-Month (30 Days) Upcoming Birthdays
  const upcomingReminders = useMemo(() => {
    return sortedBirthdays.filter((b) => getDaysUntilBirthday(b.birthDate) <= 30);
  }, [sortedBirthdays]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);
    return cells;
  }, [calMonth, calYear]);

  const birthdaysOnDay = (day: number) => {
    const mm = String(calMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return birthdays.filter((b) => b.birthDate.endsWith(`-${mm}-${dd}`));
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const filteredTrips = useMemo(() => {
    return trips.filter((tr) => {
      if (tripFilter === 'upcoming') return tr.tripDate >= todayIso;
      if (tripFilter === 'previous') return tr.tripDate < todayIso;
      return true;
    });
  }, [trips, tripFilter, todayIso]);

  const handleToggleLike = async (
    targetType: 'trip' | 'event',
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
      if (targetType === 'trip') {
        setTrips((prev) =>
          prev.map((x) =>
            x.id === targetId ? { ...x, likeCount: data.likeCount, likedByMe: data.likedByMe } : x
          )
        );
      } else {
        setEvents((prev) =>
          prev.map((x) =>
            x.id === targetId ? { ...x, likeCount: data.likeCount, likedByMe: data.likedByMe } : x
          )
        );
      }
    }
  };

  const handleAddBirthday = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/birthdays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': localProfile.clientId,
          'x-author-name': encodeURIComponent(authorName),
        },
        body: JSON.stringify({
          memberName: bName,
          birthDate: bDate,
          familyId: bFamily || null,
          photoUrl: bPhoto,
          notes: bNotes,
        }),
      });
      if (res.ok) {
        setShowAddBirthday(false);
        setBName('');
        setBDate('');
        setBPhoto('');
        setBNotes('');
        await loadAll(true);
      }
    } finally {
      setSaving(false);
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
      await loadAll(true);
    }
  };

  const handleDeleteBirthday = async (id: string) => {
    const res = await fetch(`/api/birthdays/${id}`, {
      method: 'DELETE',
      headers: { 'x-client-id': localProfile.clientId },
    });
    if (res.ok) await loadAll(true);
  };

  const handleAddTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^family-[1-8]$/.test(tFamily)) {
      setTripError(t.tripFamilyRequiredErr);
      return;
    }
    setTripError('');
    setSaving(true);
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': localProfile.clientId,
        },
        body: JSON.stringify({
          title: tTitle,
          destination: tDest,
          tripDate: tDate,
          familyId: tFamily,
          description: tDesc,
          media: tMedia,
          authorName,
        }),
      });
      if (res.ok) {
        setShowAddTrip(false);
        setTTitle('');
        setTDest('');
        setTDate('');
        setTFamily('');
        setTDesc('');
        setTMedia([]);
        setTripError('');
        await loadAll(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        setTripError(errData.error || t.tripFamilyRequiredErr);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTrip = async (id: string) => {
    const res = await fetch(`/api/trips/${id}`, {
      method: 'DELETE',
      headers: { 'x-client-id': localProfile.clientId },
    });
    if (res.ok) await loadAll(true);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': localProfile.clientId,
        },
        body: JSON.stringify({
          title: eTitle,
          category: eCat,
          eventDate: eDate,
          location: eLoc,
          familyId: eFamily || null,
          description: eDesc,
          media: eMedia,
          authorName,
        }),
      });
      if (res.ok) {
        setShowAddEvent(false);
        setETitle('');
        setEDate('');
        setELoc('');
        setEDesc('');
        setEMedia([]);
        await loadAll(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleApproveEvent = async (id: string) => {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': localProfile.clientId,
      },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (res.ok) await loadAll(true);
  };

  const handleDeleteEvent = async (id: string) => {
    const res = await fetch(`/api/events/${id}`, {
      method: 'DELETE',
      headers: { 'x-client-id': localProfile.clientId },
    });
    if (res.ok) await loadAll(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-24 lg:pb-16 space-y-10">
      <div className="border-b border-stone-200 dark:border-stone-800 pb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-50">
          ⭐ {t.specialFeaturesTitle}
        </h1>
        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 mt-2 max-w-2xl">
          {t.specialFeaturesSub}
        </p>
      </div>

      {/* 3 Large Feature Selector Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          {
            id: 'birthdays' as FeatureSubTab,
            title: `🎂 ${t.birthdaysBtn}`,
            sub: t.birthdaysSub,
            img: '/src/assets/images/feature_birthday_celebration_1794925789421.jpg',
          },
          {
            id: 'trips' as FeatureSubTab,
            title: `✈️ ${t.tripsBtn}`,
            sub: t.tripsSub,
            img: '/src/assets/images/feature_family_trip_1794925793319.jpg',
          },
          {
            id: 'events' as FeatureSubTab,
            title: `🎉 ${t.eventsBtn}`,
            sub: t.eventsSub,
            img: '/src/assets/images/feature_special_events_1794925790435.jpg',
          },
        ].map((card) => {
          const active = subTab === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setSubTab(card.id)}
              className={`group relative rounded-2xl overflow-hidden text-left border transition-all ${
                active
                  ? 'border-rose-600 ring-2 ring-rose-600/30'
                  : 'border-stone-200 dark:border-stone-800 hover:border-rose-300 dark:hover:border-rose-700'
              }`}
            >
              <div className="aspect-4/3 w-full relative">
                <img
                  src={card.img}
                  alt={card.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${
                    active
                      ? 'from-rose-950/90 via-rose-950/45 to-black/15'
                      : 'from-black/85 via-black/40 to-black/10'
                  }`}
                />
                <div className="absolute inset-0 p-6 flex flex-col justify-end">
                  <span className="font-display text-xl sm:text-2xl font-bold text-white">
                    {card.title}
                  </span>
                  <span className="text-xs sm:text-sm text-stone-200 mt-1">
                    {card.sub}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm text-stone-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t.loading}</span>
        </div>
      ) : (
        <>
          {/* BIRTHDAYS PANEL */}
          {subTab === 'birthdays' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-display text-2xl font-bold text-stone-900 dark:text-stone-100">
                  🎂 {t.upcomingBirthdays}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddBirthday(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 text-xs font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addBirthday}</span>
                </button>
              </div>

              {/* 1-Month (30-Day) Automatic Birthday Reminders Banner */}
              {upcomingReminders.length > 0 && (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-5 space-y-2">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    {t.upcoming1MonthTitle}
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {upcomingReminders.map((b) => {
                      const days = getDaysUntilBirthday(b.birthDate);
                      return (
                        <div key={b.targetKey} className="text-sm text-stone-900 dark:text-stone-100">
                          <span className="font-semibold">{b.memberName}</span>
                          <span className="text-stone-500 dark:text-stone-400"> · </span>
                          <span className="tabular-nums text-amber-700 dark:text-amber-300 font-medium">
                            {days === 0 ? t.todayLabel : `${days} ${t.daysAway}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Upcoming Birthdays + Wishes */}
                <div className="lg:col-span-7 space-y-5">
                  {sortedBirthdays.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
                      <Cake className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                      <p className="text-sm text-stone-600 dark:text-stone-400">{t.noBirthdaysYet}</p>
                    </div>
                  ) : (
                    sortedBirthdays.map((b) => {
                      const days = getDaysUntilBirthday(b.birthDate);
                      const isWithinMonth = days <= 30;
                      return (
                        <article
                          key={b.targetKey}
                          className={`rounded-2xl border bg-white dark:bg-stone-900 p-5 space-y-4 ${
                            isWithinMonth
                              ? 'border-amber-300 dark:border-amber-800/80'
                              : 'border-stone-200 dark:border-stone-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
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
                                <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
                                  {b.memberName}
                                </h3>
                                <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums mt-0.5">
                                  {b.birthDate}
                                  {b.familyNameEn && (
                                    <> · {lang === 'si' ? b.familyNameSi : b.familyNameEn}</>
                                  )}
                                  {b.notes && <> · {b.notes}</>}
                                </p>
                                <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mt-1 tabular-nums">
                                  {days === 0 ? t.todayLabel : `${days} ${t.daysAway}`}
                                </p>
                              </div>
                            </div>
                            {b.source === 'birthday' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteBirthday(b.id)}
                                aria-label={t.delete}
                                className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Birthday Wishes Thread */}
                          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-3">
                            <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                              {t.birthdayWishes} ({b.wishes.length})
                            </p>
                            {b.wishes.length > 0 && (
                              <div className="space-y-2 max-h-48 overflow-y-auto">
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
                                      <div className="flex items-baseline justify-between gap-2">
                                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                                          {w.authorName}
                                        </span>
                                        <span className="text-[10px] text-stone-400 tabular-nums">
                                          {new Date(w.createdAt).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </div>
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
                              preferredFamilyId={b.familyId}
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
                    })
                  )}
                </div>

                {/* Birthday Calendar */}
                <div className="lg:col-span-5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                      <span>{t.birthdayCalendar}</span>
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (calMonth === 0) {
                            setCalMonth(11);
                            setCalYear((y) => y - 1);
                          } else {
                            setCalMonth((m) => m - 1);
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-semibold tabular-nums min-w-[100px] text-center">
                        {new Date(calYear, calMonth).toLocaleString(lang === 'si' ? 'si-LK' : 'en-US', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (calMonth === 11) {
                            setCalMonth(0);
                            setCalYear((y) => y + 1);
                          } else {
                            setCalMonth((m) => m + 1);
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-stone-500">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={idx} />;
                      const list = birthdaysOnDay(day);
                      const hasBirthday = list.length > 0;
                      return (
                        <div
                          key={idx}
                          title={list.map((x) => x.memberName).join(', ')}
                          className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs tabular-nums border ${
                            hasBirthday
                              ? 'bg-rose-700 text-white border-rose-700 font-semibold'
                              : 'border-stone-100 dark:border-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          <span>{day}</span>
                          {hasBirthday && <span className="text-[9px] leading-none">🎂</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FAMILY TRIPS PANEL */}
          {subTab === 'trips' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800">
                  {(
                    [
                      ['all', t.allTrips],
                      ['upcoming', t.upcomingTrips],
                      ['previous', t.previousTrips],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTripFilter(id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        tripFilter === id
                          ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTripError('');
                    setTFamily('');
                    setShowAddTrip(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 text-xs font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addTrip}</span>
                </button>
              </div>

              {filteredTrips.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
                  <Plane className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                  <p className="text-sm text-stone-600 dark:text-stone-400">{t.noTripsYet}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredTrips.map((tr) => (
                    <article
                      key={tr.id}
                      className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs text-rose-700 dark:text-rose-400 font-medium tabular-nums flex items-center gap-1.5">
                            <span>{tr.tripDate}</span>
                            <span>·</span>
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{tr.destination}</span>
                          </p>
                          <h3 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100 mt-1">
                            {tr.title}
                          </h3>
                          {tr.familyNameEn && (
                            <p className="text-xs text-stone-500 mt-0.5">
                              {lang === 'si' ? tr.familyNameSi : tr.familyNameEn}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTrip(tr.id)}
                          aria-label={t.delete}
                          className="p-2 rounded-lg text-stone-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
                          <Heart className={`w-3.5 h-3.5 ${tr.likedByMe ? 'fill-rose-600 text-rose-600' : ''}`} />
                          <span>{tr.likedByMe ? t.likedBtn : t.likeBtn}</span>
                          {(tr.likeCount || 0) > 0 && (
                            <span className="tabular-nums">· {tr.likeCount}</span>
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OTHER EVENTS PANEL */}
          {subTab === 'events' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-display text-2xl font-bold text-stone-900 dark:text-stone-100">
                  🎉 {t.eventsBtn}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddEvent(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 text-xs font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addEvent}</span>
                </button>
              </div>

              {events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
                  <PartyPopper className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                  <p className="text-sm text-stone-600 dark:text-stone-400">{t.noEventsYet}</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {events.map((ev) => {
                    const isSuggested = ev.status === 'suggested';
                    return (
                      <article
                        key={ev.id}
                        className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 space-y-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
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
                              {isSuggested && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {' · '}
                                  {t.suggestedBadge}
                                </span>
                              )}
                            </p>
                            <h3 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                              {ev.title}
                            </h3>
                          </div>

                          <div className="flex items-center gap-2">
                            {isSuggested && (
                              <button
                                type="button"
                                onClick={() => handleApproveEvent(ev.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-xs font-medium"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t.approveEvent}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev.id)}
                              aria-label={t.delete}
                              className="p-2 rounded-lg text-stone-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {ev.description && (
                          <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                            {ev.description}
                          </p>
                        )}

                        {ev.media.length > 0 && (
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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
                            <Heart className={`w-3.5 h-3.5 ${ev.likedByMe ? 'fill-rose-600 text-rose-600' : ''}`} />
                            <span>{ev.likedByMe ? t.likedBtn : t.likeBtn}</span>
                            {(ev.likeCount || 0) > 0 && (
                              <span className="tabular-nums">· {ev.likeCount}</span>
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Birthday Modal */}
      {showAddBirthday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{t.addBirthday}</h3>
              <button type="button" onClick={() => setShowAddBirthday(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddBirthday} className="space-y-3">
              <SinglePhotoUploader lang={lang} value={bPhoto} onChange={setBPhoto} />
              <input
                type="text"
                required
                placeholder={t.memberName}
                value={bName}
                onChange={(e) => setBName(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <input
                type="date"
                required
                value={bDate}
                onChange={(e) => setBDate(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <select
                value={bFamily}
                onChange={(e) => setBFamily(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              >
                <option value="">{t.allFamiliesRoom}</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === 'si' ? f.nameSi : f.nameEn}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t.personalDesc}
                value={bNotes}
                onChange={(e) => setBNotes(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddBirthday(false)}
                  className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-rose-700 text-white text-xs font-medium"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Trip Modal */}
      {showAddTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{t.addTrip}</h3>
              <button type="button" onClick={() => setShowAddTrip(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddTrip} className="space-y-3">
              <input
                type="text"
                required
                placeholder={t.tripName}
                value={tTitle}
                onChange={(e) => setTTitle(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder={t.destination}
                  value={tDest}
                  onChange={(e) => setTDest(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  required
                  value={tDate}
                  onChange={(e) => setTDate(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                />
              </div>
              <select
                required
                value={tFamily}
                onChange={(e) => {
                  setTFamily(e.target.value);
                  setTripError('');
                }}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  {t.selectFamilyRequired}
                </option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === 'si' ? f.nameSi : f.nameEn}
                  </option>
                ))}
              </select>
              {tripError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {tripError}
                </p>
              )}
              <textarea
                rows={3}
                placeholder={t.tripDesc}
                value={tDesc}
                onChange={(e) => setTDesc(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <MultiMediaUploader lang={lang} items={tMedia} onChange={setTMedia} />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTrip(false)}
                  className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-rose-700 text-white text-xs font-medium"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{t.addEvent}</h3>
              <button type="button" onClick={() => setShowAddEvent(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddEvent} className="space-y-3">
              <input
                type="text"
                required
                placeholder={t.eventTitle}
                value={eTitle}
                onChange={(e) => setETitle(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={eCat}
                  onChange={(e) => setECat(e.target.value as any)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                >
                  <option value="wedding">{t.catWedding}</option>
                  <option value="party">{t.catParty}</option>
                  <option value="celebration">{t.catCelebration}</option>
                  <option value="religious">{t.catReligious}</option>
                  <option value="other">{t.catOther}</option>
                </select>
                <input
                  type="date"
                  required
                  value={eDate}
                  onChange={(e) => setEDate(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                />
              </div>
              <input
                type="text"
                placeholder={t.eventLocation}
                value={eLoc}
                onChange={(e) => setELoc(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <select
                value={eFamily}
                onChange={(e) => setEFamily(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              >
                <option value="">{t.allFamiliesRoom}</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === 'si' ? f.nameSi : f.nameEn}
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                placeholder={t.eventDesc}
                value={eDesc}
                onChange={(e) => setEDesc(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <MultiMediaUploader lang={lang} items={eMedia} onChange={setEMedia} />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEvent(false)}
                  className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-rose-700 text-white text-xs font-medium"
                >
                  {t.save}
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
          <div onClick={(e) => e.stopPropagation()} className="max-w-4xl max-h-[85vh] w-full flex items-center justify-center">
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
