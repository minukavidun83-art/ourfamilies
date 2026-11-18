import React, { useRef, useState } from 'react';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { T } from '../i18n';
import type { Lang, MediaAsset } from '../types';

interface SingleUploadProps {
  lang: Lang;
  value: string;
  onChange: (url: string) => void;
  purpose?: 'media' | 'avatar';
  accept?: string;
  label?: string;
}

export const SinglePhotoUploader: React.FC<SingleUploadProps> = ({
  lang,
  value,
  onChange,
  purpose = 'media',
  accept = 'image/*',
  label,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const t = T[lang];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      onChange(data.url);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFile}
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          <span>{uploading ? t.uploading : value ? t.changePhoto : label || t.uploadPhoto}</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t.removePhoto}</span>
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
};

interface MultiUploadProps {
  lang: Lang;
  items: MediaAsset[];
  onChange: (items: MediaAsset[]) => void;
}

export const MultiMediaUploader: React.FC<MultiUploadProps> = ({ lang, items, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const t = T[lang];

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const uploaded: MediaAsset[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('purpose', 'media');
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        uploaded.push({ url: data.url, type: data.type, name: data.name });
      }
      onChange([...items, ...uploaded]);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFiles}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        <span>{uploading ? t.uploading : t.uploadMedia}</span>
      </button>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((item, idx) => (
            <div
              key={`${item.url}-${idx}`}
              className="relative group rounded-lg overflow-hidden border border-stone-200 dark:border-stone-700 aspect-square bg-stone-100 dark:bg-stone-800"
            >
              {item.type === 'video' ? (
                <video src={item.url} className="w-full h-full object-cover" />
              ) : (
                <img
                  src={item.url}
                  alt={item.name || 'Uploaded media'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                aria-label="Remove media"
                className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-1 opacity-90 hover:bg-rose-700"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
