import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Home,
  Users,
  Sparkles,
  MessageCircle,
  Image as ImageIcon,
  Sun,
  Moon,
  Search,
  Languages,
  CheckCheck,
  User,
} from 'lucide-react';
import { T, translateRelationship } from '../i18n';
import type {
  AppNotification,
  FamilyMember,
  Lang,
  LocalProfile,
  PageTab,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface Props {
  lang: Lang;
  onToggleLang: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  activeTab: PageTab;
  onNavigate: (tab: PageTab) => void;
  localProfile: LocalProfile;
  onOpenProfileModal: () => void;
  unreadChatCount: number;
  notifications: AppNotification[];
  bellPulse?: boolean;
  onMarkAllNotificationsRead: () => void;
  onSelectSearchMember: (familyId: string) => void;
}

export const TopBar: React.FC<Props> = ({
  lang,
  onToggleLang,
  theme,
  onToggleTheme,
  activeTab,
  onNavigate,
  localProfile,
  onOpenProfileModal,
  unreadChatCount,
  notifications,
  bellPulse = false,
  onMarkAllNotificationsRead,
  onSelectSearchMember,
}) => {
  const t = T[lang];
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FamilyMember[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  const navItems: { id: PageTab; label: string }[] = [
    { id: 'home', label: t.navHome },
    { id: 'families', label: t.navFamilies },
    { id: 'features', label: t.navFeatures },
    { id: 'chat', label: t.navChat },
    { id: 'moments', label: t.navMoments },
  ];

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/members/search?q=${encodeURIComponent(value.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.members || []);
        setSearchOpen(true);
      }
    } catch {
      // ignore offline search error
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200 dark:border-stone-800 bg-[#faf9f7]/95 dark:bg-[#0f0f12]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50 whitespace-nowrap shrink-0 hover:text-rose-700 dark:hover:text-rose-400 transition-colors"
          >
            {t.siteTitle} <span aria-hidden="true">❤️</span>
          </button>

          {/* Zone 2: Clean single-line text nav links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-stone-600 dark:text-stone-300">
            {navItems.map((item) => {
              const isActive =
                activeTab === item.id ||
                (item.id === 'families' && activeTab === 'family-detail');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'text-rose-700 dark:text-rose-400 font-semibold'
                      : 'hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'chat' && unreadChatCount > 0 && (
                    <span className="ml-1.5 text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                      ({unreadChatCount})
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute left-0 right-0 -bottom-0.5 h-0.5 bg-rose-700 dark:bg-rose-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action (Display Name / Avatar) */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenProfileModal}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors min-h-[40px] max-w-[160px]"
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{localProfile.name || t.myNameBtn}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Utility Toolbar below header */}
      <div className="border-b border-stone-200/70 dark:border-stone-800/70 bg-white/70 dark:bg-stone-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Language + Theme + PWA Install */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:text-stone-100 hover:border-rose-300 dark:hover:border-rose-700 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
            >
              <Languages className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
              <span>{lang === 'en' ? '🇱🇰 සිංහල' : '🇬🇧 English'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? t.lightMode : t.darkMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">{t.lightMode}</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-stone-600" />
                  <span className="hidden sm:inline">{t.darkMode}</span>
                </>
              )}
            </button>

            <PWAInstallButton lang={lang} />
          </div>

          {/* Right: Member Search + Notifications */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
            <div ref={searchContainerRef} className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (searchQuery.trim()) setSearchOpen(true);
                }}
                placeholder={t.searchMembersPlaceholder}
                className="w-full rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 pl-8 pr-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-rose-500 min-h-[36px]"
              />
              {searchOpen && searchQuery.trim() && (
                <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg z-50 max-h-64 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <div className="p-3 text-xs text-stone-500">
                      {lang === 'si' ? 'සාමාජිකයෙකු හමු නොවීය' : 'No matching family members'}
                    </div>
                  ) : (
                    searchResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery('');
                          onSelectSearchMember(m.familyId);
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2.5 border-b last:border-b-0 border-stone-100 dark:border-stone-800"
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shrink-0 flex items-center justify-center">
                          {m.photoUrl ? (
                            <img
                              src={m.photoUrl}
                              alt={m.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-3.5 h-3.5 text-stone-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                            {m.name}
                          </p>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                            {translateRelationship(m.relationship, lang)} ·{' '}
                            {lang === 'si' ? m.familyNameSi : m.familyNameEn}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div ref={notifContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={t.notifications}
                className={`relative inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5 transition-colors min-h-[36px] min-w-[36px] ${
                  bellPulse
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/30'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:border-rose-300 dark:hover:border-rose-700'
                }`}
              >
                <Bell className={`w-4 h-4 ${bellPulse ? 'animate-bounce text-rose-600 dark:text-rose-400' : ''}`} />
                {unreadNotifCount > 0 && (
                  <span className="ml-1 text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                      {t.notifications}
                    </span>
                    {unreadNotifCount > 0 && (
                      <button
                        type="button"
                        onClick={onMarkAllNotificationsRead}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 hover:underline"
                      >
                        <CheckCheck className="w-3 h-3" />
                        <span>{t.markAllRead}</span>
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-stone-500 text-center">
                        {t.noNotifications}
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onNavigate((n.linkTab as PageTab) || 'home');
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors ${
                            !n.isRead ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                              {lang === 'si' ? n.titleSi : n.titleEn}
                            </p>
                            <span className="text-[10px] text-stone-400 tabular-nums shrink-0">
                              {new Date(n.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 line-clamp-2">
                            {lang === 'si' ? n.bodySi : n.bodyEn}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar (under 15% mobile height) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0f0f12]/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800"
      >
        <div className="grid grid-cols-5 items-center h-15">
          {[
            { id: 'home' as PageTab, icon: Home, label: t.navHome },
            { id: 'families' as PageTab, icon: Users, label: t.navFamilies },
            { id: 'features' as PageTab, icon: Sparkles, label: t.navFeatures },
            { id: 'chat' as PageTab, icon: MessageCircle, label: t.navChat },
            { id: 'moments' as PageTab, icon: ImageIcon, label: t.navMoments },
          ].map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id ||
              (item.id === 'families' && activeTab === 'family-detail');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative flex flex-col items-center justify-center h-full px-1 transition-colors ${
                  isActive
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium truncate max-w-full mt-0.5">
                  {item.label}
                </span>
                {item.id === 'chat' && unreadChatCount > 0 && (
                  <span className="absolute top-1.5 right-3 text-[10px] font-bold tabular-nums text-rose-700 dark:text-rose-400">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
