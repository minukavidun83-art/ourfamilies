import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Heart,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Megaphone,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { T } from '../i18n';
import type { Announcement, Family, GalleryItem, Lang, LocalProfile } from '../types';
import { SinglePhotoUploader } from './MediaUploader';

interface Props {
  lang: Lang;
  families: Family[];
  localProfile: LocalProfile;
  refreshSignal: number;
}

export const GalleryMomentsView: React.FC<Props> = ({
  lang,
  families,
  localProfile,
  refreshSignal,
}) => {
  const t = T[lang];
  const [tab, setTab] = useState<'gallery' | 'timeline' | 'moments' | 'announcements'>('gallery');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);

  const [showAddGallery, setShowAddGallery] = useState(false);
  const [gTitle, setGTitle] = useState('');
  const [gLocation, setGLocation] = useState('');
  const [gCaption, setGCaption] = useState('');
  const [gDate, setGDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [gKind, setGKind] = useState<'gallery' | 'timeline' | 'moment'>('gallery');
  const [gFamily, setGFamily] = useState('');
  const [gUrl, setGUrl] = useState('');
  const [gType, setGType] = useState<'image' | 'video'>('image');

  const [showAddAnn, setShowAddAnn] = useState(false);
  const [aTitle, setATitle] = useState('');
  const [aBody, setABody] = useState('');
  const [aPriority, setAPriority] = useState<'normal' | 'important'>('normal');
  const [aFamily, setAFamily] = useState('');
  const [saving, setSaving] = useState(false);

  const authorName =
    localProfile.name.trim() || (lang === 'si' ? 'පවුලේ සාමාජික' : 'Family Member');

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [gRes, aRes] = await Promise.all([
        fetch('/api/gallery', {
          cache: 'no-store',
          headers: { 'x-client-id': localProfile.clientId },
        }),
        fetch('/api/announcements', { cache: 'no-store' }),
      ]);
      if (gRes.ok) {
        const nextItems: GalleryItem[] = (await gRes.json()).items || [];
        setItems(nextItems);
        setLightbox((prev) => (prev ? nextItems.find((x) => x.id === prev.id) || null : null));
      }
      if (aRes.ok) setAnnouncements((await aRes.json()).announcements || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(refreshSignal > 0);
  }, [refreshSignal]);

  const handleSaveGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gUrl) return;
    setSaving(true);
    try {
      const mediaType = /\.(mp4|webm|mov|ogg)$/i.test(gUrl) ? 'video' : gType;
      const res = await fetch('/api/gallery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': localProfile.clientId,
        },
        body: JSON.stringify({
          title: gTitle,
          location: gLocation,
          caption: gCaption,
          momentDate: gDate,
          kind: gKind,
          familyId: gFamily || null,
          mediaUrl: gUrl,
          mediaType,
          authorName,
        }),
      });
      if (res.ok) {
        setShowAddGallery(false);
        setGTitle('');
        setGLocation('');
        setGCaption('');
        setGUrl('');
        await loadData(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLike = async (item: GalleryItem) => {
    const res = await fetch('/api/likes/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': localProfile.clientId,
      },
      body: JSON.stringify({
        targetType: 'gallery',
        targetId: item.id,
        authorName,
        itemTitle: item.title,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, likeCount: data.likeCount, likedByMe: data.likedByMe }
            : x
        )
      );
      setLightbox((prev) =>
        prev && prev.id === item.id
          ? { ...prev, likeCount: data.likeCount, likedByMe: data.likedByMe }
          : prev
      );
    }
  };

  const handleDeleteGallery = async (id: string) => {
    const res = await fetch(`/api/gallery/${id}`, {
      method: 'DELETE',
      headers: { 'x-client-id': localProfile.clientId },
    });
    if (res.ok) await loadData(true);
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': localProfile.clientId,
        },
        body: JSON.stringify({
          title: aTitle,
          body: aBody,
          priority: aPriority,
          familyId: aFamily || null,
          authorName,
        }),
      });
      if (res.ok) {
        setShowAddAnn(false);
        setATitle('');
        setABody('');
        await loadData(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const res = await fetch(`/api/announcements/${id}`, {
      method: 'DELETE',
      headers: { 'x-client-id': localProfile.clientId },
    });
    if (res.ok) await loadData(true);
  };

  const filteredItems =
    tab === 'gallery'
      ? items
      : tab === 'timeline'
        ? items.filter((i) => i.kind === 'timeline' || i.kind === 'moment' || i.kind === 'gallery')
        : items.filter((i) => i.kind === 'moment');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-24 lg:pb-16 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-50">
            {t.galleryTitle}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setGKind(tab === 'moments' ? 'moment' : tab === 'timeline' ? 'timeline' : 'gallery');
              setShowAddGallery(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 text-xs font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>{t.uploadToGallery}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddAnn(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 dark:border-stone-700 px-4 py-2 text-xs font-medium text-stone-800 dark:text-stone-100 hover:border-rose-400"
          >
            <Megaphone className="w-4 h-4" />
            <span>{t.postAnnouncement}</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800 w-fit">
        {(
          [
            ['gallery', t.tabGallery],
            ['timeline', t.tabTimeline],
            ['moments', t.tabMoments],
            ['announcements', t.tabAnnouncements],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === id
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm text-stone-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t.loading}</span>
        </div>
      ) : tab === 'announcements' ? (
        <div className="space-y-4">
          {announcements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
              <Megaphone className="w-8 h-8 text-stone-400 mx-auto mb-2" />
              <p className="text-sm text-stone-600 dark:text-stone-400">{t.noAnnouncementsYet}</p>
            </div>
          ) : (
            announcements.map((a) => (
              <article
                key={a.id}
                className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 space-y-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-400 tabular-nums">
                      {a.priority === 'important' ? t.importantNotice : t.normalNotice} ·{' '}
                      {a.authorName} · {a.createdAt.slice(0, 10)}
                    </p>
                    <h3 className="font-display text-xl font-semibold text-stone-900 dark:text-stone-100 mt-1">
                      {a.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    aria-label={t.delete}
                    className="p-2 rounded-lg text-stone-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed whitespace-pre-wrap">
                  {a.body}
                </p>
              </article>
            ))
          )}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
          <ImageIcon className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-sm text-stone-600 dark:text-stone-400">{t.noGalleryYet}</p>
        </div>
      ) : tab === 'timeline' ? (
        <div className="space-y-6">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden grid grid-cols-1 md:grid-cols-12"
            >
              <div
                onClick={() => setLightbox(item)}
                className="md:col-span-4 aspect-4/3 md:aspect-auto bg-stone-100 dark:bg-stone-800 cursor-pointer"
              >
                {item.mediaType === 'video' ? (
                  <video src={item.mediaUrl} className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={item.mediaUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="md:col-span-8 p-6 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-400 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{item.momentDate}</span>
                      </span>
                      {item.location && (
                        <span className="inline-flex items-center gap-1 text-stone-600 dark:text-stone-300">
                          · <MapPin className="w-3.5 h-3.5 text-rose-600" />
                          <span>{item.location}</span>
                        </span>
                      )}
                      {item.familyNameEn && (
                        <> · {lang === 'si' ? item.familyNameSi : item.familyNameEn}</>
                      )}
                    </p>
                    <h3 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100 mt-1">
                      {item.title}
                    </h3>
                    {item.caption && (
                      <p className="text-sm text-stone-600 dark:text-stone-300 mt-2 leading-relaxed">
                        {item.caption}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteGallery(item.id)}
                    aria-label={t.delete}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-stone-100 dark:border-stone-800">
                  <p className="text-xs text-stone-400">{item.uploadedByName}</p>
                  <button
                    type="button"
                    onClick={() => handleToggleLike(item)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors border ${
                      item.likedByMe
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                        : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-rose-300'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${item.likedByMe ? 'fill-rose-600 text-rose-600' : ''}`} />
                    <span>{item.likedByMe ? t.likedBtn : t.likeBtn}</span>
                    {item.likeCount > 0 && <span className="tabular-nums">· {item.likeCount}</span>}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="group rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden flex flex-col"
            >
              <div
                onClick={() => setLightbox(item)}
                className="aspect-4/3 bg-stone-100 dark:bg-stone-800 cursor-pointer overflow-hidden relative"
              >
                {item.mediaType === 'video' ? (
                  <video src={item.mediaUrl} className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={item.mediaUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold text-stone-900 dark:text-stone-100">
                      {item.title}
                    </h3>
                    {item.location && (
                      <p className="text-xs font-medium text-rose-700 dark:text-rose-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.location}</span>
                      </p>
                    )}
                    <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums mt-0.5">
                      {item.momentDate} · {item.uploadedByName}
                    </p>
                    {item.caption && (
                      <p className="text-xs text-stone-600 dark:text-stone-300 mt-1.5">
                        {item.caption}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteGallery(item.id)}
                    aria-label={t.delete}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(item)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors border ${
                      item.likedByMe
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                        : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-rose-300'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${item.likedByMe ? 'fill-rose-600 text-rose-600' : ''}`} />
                    <span>{item.likedByMe ? t.likedBtn : t.likeBtn}</span>
                    {item.likeCount > 0 && <span className="tabular-nums">· {item.likeCount}</span>}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Upload Gallery Item Modal */}
      {showAddGallery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{t.uploadToGallery}</h3>
              <button type="button" onClick={() => setShowAddGallery(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveGallery} className="space-y-3">
              {gUrl && (
                <div className="aspect-4/3 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800">
                  {gType === 'video' ? (
                    <video src={gUrl} controls className="w-full h-full object-cover" />
                  ) : (
                    <img
                      src={gUrl}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              )}
              <SinglePhotoUploader
                lang={lang}
                value={gUrl}
                accept="image/*,video/*"
                label={t.uploadMedia}
                onChange={(url) => {
                  setGUrl(url);
                  setGType(/\.(mp4|webm|mov|ogg)$/i.test(url) ? 'video' : 'image');
                }}
              />
              <input
                type="text"
                required
                placeholder={t.eventTitle}
                value={gTitle}
                onChange={(e) => setGTitle(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-600" />
                  <span>{t.photoLocationLabel}</span>
                </label>
                <input
                  type="text"
                  placeholder={t.photoLocationPlaceholder}
                  value={gLocation}
                  onChange={(e) => setGLocation(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={gDate}
                  onChange={(e) => setGDate(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                />
                <select
                  value={gKind}
                  onChange={(e) => setGKind(e.target.value as any)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                >
                  <option value="gallery">{t.tabGallery}</option>
                  <option value="timeline">{t.tabTimeline}</option>
                  <option value="moment">{t.tabMoments}</option>
                </select>
              </div>
              <select
                value={gFamily}
                onChange={(e) => setGFamily(e.target.value)}
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
                rows={2}
                placeholder={t.personalDesc}
                value={gCaption}
                onChange={(e) => setGCaption(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddGallery(false)}
                  className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving || !gUrl}
                  className="px-5 py-2 rounded-xl bg-rose-700 disabled:opacity-50 text-white text-xs font-medium"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post Announcement Modal */}
      {showAddAnn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{t.postAnnouncement}</h3>
              <button type="button" onClick={() => setShowAddAnn(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAnnouncement} className="space-y-3">
              <input
                type="text"
                required
                placeholder={t.announcementTitle}
                value={aTitle}
                onChange={(e) => setATitle(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={aPriority}
                  onChange={(e) => setAPriority(e.target.value as any)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                >
                  <option value="normal">{t.normalNotice}</option>
                  <option value="important">{t.importantNotice}</option>
                </select>
                <select
                  value={aFamily}
                  onChange={(e) => setAFamily(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
                >
                  <option value="">{t.allFamiliesRoom}</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {lang === 'si' ? f.nameSi : f.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={4}
                required
                placeholder={t.announcementBody}
                value={aBody}
                onChange={(e) => setABody(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAnn(false)}
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

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-4xl max-h-[85vh] space-y-3 text-center">
            {lightbox.mediaType === 'video' ? (
              <video src={lightbox.mediaUrl} controls autoPlay className="max-h-[70vh] rounded-xl mx-auto" />
            ) : (
              <img
                src={lightbox.mediaUrl}
                alt={lightbox.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] max-w-full rounded-xl object-contain mx-auto"
              />
            )}
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">{lightbox.title}</p>
              {lightbox.location && (
                <p className="text-xs text-rose-300 inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{lightbox.location}</span>
                </p>
              )}
              {lightbox.caption && <p className="text-xs text-stone-300">{lightbox.caption}</p>}
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => handleToggleLike(lightbox)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-colors ${
                  lightbox.likedByMe
                    ? 'bg-rose-700 text-white'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                <Heart className={`w-4 h-4 ${lightbox.likedByMe ? 'fill-white' : ''}`} />
                <span>{lightbox.likedByMe ? t.likedBtn : t.likeBtn}</span>
                {lightbox.likeCount > 0 && <span className="tabular-nums">· {lightbox.likeCount}</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
