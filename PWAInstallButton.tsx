import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { T } from '../i18n';
import type { Lang } from '../types';

interface Props {
  lang: Lang;
}

export const PWAInstallButton: React.FC<Props> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const t = T[lang];

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-rose-300 dark:hover:border-rose-700 hover:text-rose-700 dark:hover:text-rose-300 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
      >
        {isIOS ? <Smartphone className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
        <span>{isIOS ? t.installIOS : t.installApp}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                {t.iosGuideTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label={t.close}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
              {isIOS ? (
                <>
                  <p>1. {t.iosStep1}</p>
                  <p>2. {t.iosStep2}</p>
                </>
              ) : (
                <p>
                  {lang === 'si'
                    ? 'ඔබගේ බ්‍රව්සරයේ ලිපින තීරුවේ ඇති "Install" අයිකනය හෝ බ්‍රව්සර් මෙනුවේ "Add to Home Screen / Install OUR FAMILIES" තෝරන්න.'
                    : 'Use the Install icon in your browser address bar or open your browser menu and choose "Install OUR FAMILIES" / "Add to Home Screen".'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full rounded-xl bg-rose-700 hover:bg-rose-800 text-white py-2.5 text-sm font-medium transition-colors"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
