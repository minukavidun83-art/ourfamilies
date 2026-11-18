import React, { useState } from 'react';
import { User, X } from 'lucide-react';
import { T } from '../i18n';
import type { Lang, LocalProfile } from '../types';
import { SinglePhotoUploader } from './MediaUploader';

interface Props {
  lang: Lang;
  profile: LocalProfile;
  onSave: (next: LocalProfile) => void;
  onClose: () => void;
}

export const MemberIdentityModal: React.FC<Props> = ({ lang, profile, onSave, onClose }) => {
  const t = T[lang];
  const [name, setName] = useState(profile.name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...profile,
      name: name.trim() || (lang === 'si' ? 'පවුලේ සාමාජික' : 'Family Member'),
      avatarUrl,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100">
            {t.myProfileTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            {t.myProfileDesc}
          </p>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shrink-0 flex items-center justify-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name || 'Avatar'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-stone-400" />
              )}
            </div>
            <SinglePhotoUploader lang={lang} value={avatarUrl} onChange={setAvatarUrl} />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
              {t.fullName}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lang === 'si' ? 'ඔබේ නම ඇතුළත් කරන්න' : 'Enter your display name'}
              className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-medium"
            >
              {t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
