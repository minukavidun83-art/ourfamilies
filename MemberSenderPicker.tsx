import React, { useMemo, useState } from 'react';
import { Check, Search, User, Users, X } from 'lucide-react';
import { T, translateRelationship } from '../i18n';
import type { Family, FamilyMember, Lang, LocalProfile } from '../types';

export interface ResolvedSender {
  name: string;
  avatar: string;
  avatars: string[];
  selectedMembers: FamilyMember[];
}

export function resolveSelectedSenders(
  selectedIds: string[],
  allMembers: FamilyMember[],
  localProfile: LocalProfile,
  lang: Lang
): ResolvedSender {
  const byId = new Map(allMembers.map((m) => [m.id, m]));
  const selectedMembers = selectedIds
    .map((id) => byId.get(id))
    .filter((m): m is FamilyMember => Boolean(m));

  if (selectedMembers.length === 0) {
    const fallbackName =
      localProfile.name.trim() || (lang === 'si' ? 'පවුලේ සාමාජික' : 'Family Member');
    const fallbackAvatar = localProfile.avatarUrl || '';
    return {
      name: fallbackName,
      avatar: fallbackAvatar,
      avatars: fallbackAvatar ? [fallbackAvatar] : [],
      selectedMembers: [],
    };
  }

  if (selectedMembers.length === 1) {
    const m = selectedMembers[0];
    return {
      name: m.name,
      avatar: m.photoUrl || '',
      avatars: m.photoUrl ? [m.photoUrl] : [],
      selectedMembers,
    };
  }

  const names = selectedMembers.map((m) => m.name);
  let combinedName = '';
  if (names.length === 2) {
    combinedName = `${names[0]} & ${names[1]}`;
  } else if (names.length === 3) {
    combinedName = `${names[0]}, ${names[1]} & ${names[2]}`;
  } else {
    const extra = names.length - 2;
    combinedName =
      lang === 'si'
        ? `${names[0]}, ${names[1]} සහ තවත් ${extra} දෙනෙක්`
        : `${names[0]}, ${names[1]} & ${extra} others`;
  }

  const avatars = selectedMembers
    .map((m) => m.photoUrl)
    .filter((u): u is string => Boolean(u && u.trim()))
    .slice(0, 4);

  return {
    name: combinedName,
    avatar: avatars[0] || '',
    avatars,
    selectedMembers,
  };
}

export const AvatarStack: React.FC<{
  avatars?: string[];
  fallbackAvatar?: string;
  alt: string;
  size?: 'sm' | 'md';
}> = ({ avatars = [], fallbackAvatar = '', alt, size = 'sm' }) => {
  const list = avatars.length > 0 ? avatars : fallbackAvatar ? [fallbackAvatar] : [];
  const dim = size === 'md' ? 'w-8 h-8' : 'w-6 h-6';
  const iconDim = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  if (list.length === 0) {
    return (
      <div
        className={`${dim} rounded-full overflow-hidden bg-stone-200 dark:bg-stone-700 shrink-0 flex items-center justify-center`}
      >
        <User className={`${iconDim} text-stone-500 dark:text-stone-400`} />
      </div>
    );
  }

  if (list.length === 1) {
    return (
      <div
        className={`${dim} rounded-full overflow-hidden bg-stone-200 dark:bg-stone-700 shrink-0 border border-stone-200 dark:border-stone-700`}
      >
        <img
          src={list[0]}
          alt={alt}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center -space-x-2 shrink-0">
      {list.slice(0, 4).map((url, idx) => (
        <div
          key={`${url}-${idx}`}
          className={`${dim} rounded-full overflow-hidden bg-stone-200 dark:bg-stone-700 border-2 border-white dark:border-stone-900`}
        >
          <img
            src={url}
            alt={alt}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
      ))}
    </div>
  );
};

interface ModalProps {
  lang: Lang;
  families: Family[];
  allMembers: FamilyMember[];
  selectedIds: string[];
  preferredFamilyId?: string | null;
  mode?: 'multi' | 'single';
  onChange: (nextIds: string[]) => void;
  onClose: () => void;
}

export const MemberSenderModal: React.FC<ModalProps> = ({
  lang,
  families,
  allMembers,
  selectedIds,
  preferredFamilyId,
  mode = 'multi',
  onChange,
  onClose,
}) => {
  const t = T[lang];
  const [query, setQuery] = useState('');

  const orderedFamilies = useMemo(() => {
    const list = [...families].sort((a, b) => a.sortOrder - b.sortOrder);
    if (!preferredFamilyId) return list;
    return [
      ...list.filter((f) => f.id === preferredFamilyId),
      ...list.filter((f) => f.id !== preferredFamilyId),
    ];
  }, [families, preferredFamilyId]);

  const membersByFamily = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, FamilyMember[]>();
    for (const m of allMembers) {
      if (q) {
        const hay = `${m.name} ${m.relationship} ${m.familyNameEn || ''} ${m.familyNameSi || ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const arr = map.get(m.familyId) || [];
      arr.push(m);
      map.set(m.familyId, arr);
    }
    return map;
  }, [allMembers, query]);

  const toggleMember = (memberId: string) => {
    if (mode === 'single') {
      onChange([memberId]);
      onClose();
      return;
    }
    if (selectedIds.includes(memberId)) {
      onChange(selectedIds.filter((id) => id !== memberId));
    } else {
      onChange([...selectedIds, memberId]);
    }
  };

  const toggleWholeFamily = (familyMembers: FamilyMember[]) => {
    const ids = familyMembers.map((m) => m.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !ids.includes(id)));
    } else {
      const merged = new Set([...selectedIds, ...ids]);
      onChange(Array.from(merged));
    }
  };

  const anyVisible = Array.from(membersByFamily.values()).some((arr) => arr.length > 0);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              {t.selectMembersTitle}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {mode === 'multi' ? t.selectMembersMultiHint : t.selectMembersSingleHint}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-stone-100 dark:border-stone-800 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchMembersPlaceholder}
              className="w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 pl-9 pr-3 py-2 text-sm text-stone-900 dark:text-stone-100"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-stone-500 dark:text-stone-400 tabular-nums">
              {selectedIds.length > 0 ? `${selectedIds.length} ${t.selectedMembersCount}` : t.clearToMyNameBtn}
            </span>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-rose-700 dark:text-rose-400 font-medium hover:underline"
              >
                {t.clearToMyNameBtn}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {!anyVisible ? (
            <div className="py-10 text-center space-y-2">
              <Users className="w-7 h-7 text-stone-400 mx-auto" />
              <p className="text-sm text-stone-600 dark:text-stone-400 max-w-xs mx-auto">
                {t.noGroupMembersYet}
              </p>
            </div>
          ) : (
            orderedFamilies.map((fam) => {
              const famMembers = membersByFamily.get(fam.id) || [];
              if (famMembers.length === 0) return null;
              const famName = lang === 'si' ? fam.nameSi : fam.nameEn;
              const allFamSelected = famMembers.every((m) => selectedIds.includes(m.id));
              return (
                <div key={fam.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-stone-100 dark:border-stone-800">
                    <h4 className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                      {famName}
                    </h4>
                    <button
                      type="button"
                      onClick={() => toggleWholeFamily(famMembers)}
                      className="text-xs font-medium text-rose-700 dark:text-rose-400 hover:underline"
                    >
                      {allFamSelected ? t.clearToMyNameBtn : t.selectAllFamilyBtn}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {famMembers.map((m) => {
                      const active = selectedIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMember(m.id)}
                          className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors min-h-[48px] ${
                            active
                              ? 'border-rose-600 bg-rose-50/70 dark:bg-rose-950/40 dark:border-rose-500'
                              : 'border-stone-200 dark:border-stone-800 hover:border-rose-300 dark:hover:border-rose-700'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 flex items-center justify-center border border-stone-200 dark:border-stone-700">
                            {m.photoUrl ? (
                              <img
                                src={m.photoUrl}
                                alt={m.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-stone-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                              {m.name}
                            </p>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                              {translateRelationship(m.relationship, lang)}
                            </p>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-rose-700 border-rose-700 text-white'
                                : 'border-stone-300 dark:border-stone-600'
                            }`}
                          >
                            {active && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-rose-700 hover:bg-rose-800 text-white px-5 py-2 text-xs font-medium min-h-[40px]"
          >
            {t.doneBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

interface CompactPickerRowProps {
  lang: Lang;
  families: Family[];
  allMembers: FamilyMember[];
  localProfile: LocalProfile;
  selectedIds: string[];
  preferredFamilyId?: string | null;
  onChange: (nextIds: string[]) => void;
}

export const WishSenderPickerRow: React.FC<CompactPickerRowProps> = ({
  lang,
  families,
  allMembers,
  localProfile,
  selectedIds,
  preferredFamilyId,
  onChange,
}) => {
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const resolved = resolveSelectedSenders(selectedIds, allMembers, localProfile, lang);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-stone-500 dark:text-stone-400 shrink-0">{t.sendingAsLabel}:</span>
          <AvatarStack
            avatars={resolved.avatars}
            fallbackAvatar={resolved.avatar}
            alt={resolved.name}
            size="sm"
          />
          <span className="font-semibold text-stone-800 dark:text-stone-200 truncate">
            {resolved.name}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 px-2.5 py-1.5 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:border-rose-300 dark:hover:border-rose-700 hover:text-rose-700 dark:hover:text-rose-400 transition-colors shrink-0"
        >
          <Users className="w-3.5 h-3.5" />
          <span>{t.selectMembersBtn}</span>
        </button>
      </div>

      {open && (
        <MemberSenderModal
          lang={lang}
          families={families}
          allMembers={allMembers}
          selectedIds={selectedIds}
          preferredFamilyId={preferredFamilyId}
          mode="multi"
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
