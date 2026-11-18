import React, { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Loader2,
  MessageCircle,
  Send,
  User,
  Users,
  X,
} from 'lucide-react';
import { T } from '../i18n';
import type { ChatMessage, ChatRoom, Family, FamilyMember, Lang, LocalProfile } from '../types';
import { AvatarStack, MemberSenderModal, resolveSelectedSenders } from './MemberSenderPicker';

interface Props {
  lang: Lang;
  families: Family[];
  allMembers: FamilyMember[];
  localProfile: LocalProfile;
  onOpenProfileModal: () => void;
  incomingMessage: ChatMessage | null;
  typingUser: { roomId: string; userName: string } | null;
  onSendTyping: (roomId: string, userName?: string) => void;
  onUnreadCountChange: (total: number) => void;
  refreshSignal: number;
}

export const FamilyChatView: React.FC<Props> = ({
  lang,
  families,
  allMembers,
  localProfile,
  onOpenProfileModal,
  incomingMessage,
  typingUser,
  onSendTyping,
  onUnreadCountChange,
  refreshSignal,
}) => {
  const t = T[lang];
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState('all');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [selectedSenderIds, setSelectedSenderIds] = useState<string[]>([]);
  const [senderModalOpen, setSenderModalOpen] = useState(false);

  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSender = resolveSelectedSenders(
    selectedSenderIds,
    allMembers,
    localProfile,
    lang
  );
  const roomMembers = activeRoomId.startsWith('family-')
    ? allMembers.filter((m) => m.familyId === activeRoomId)
    : allMembers;
  const quickMembers = (roomMembers.length > 0 ? roomMembers : allMembers).slice(0, 6);

  const loadRooms = async () => {
    try {
      const res = await fetch('/api/chat/rooms', {
        cache: 'no-store',
        headers: { 'x-client-id': localProfile.clientId },
      });
      if (res.ok) {
        const data = await res.json();
        const loaded: ChatRoom[] = data.rooms || [];
        setRooms(loaded);
        onUnreadCountChange(loaded.reduce((acc, r) => acc + r.unreadCount, 0));
      }
    } catch {
      // ignore offline mode
    } finally {
      setLoadingRooms(false);
    }
  };

  const loadMessages = async (roomId: string) => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/chat/messages?roomId=${encodeURIComponent(roomId)}`, {
        cache: 'no-store',
        headers: { 'x-client-id': localProfile.clientId },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setRooms((prev) => {
          const next = prev.map((r) => (r.roomId === roomId ? { ...r, unreadCount: 0 } : r));
          onUnreadCountChange(next.reduce((acc, r) => acc + r.unreadCount, 0));
          return next;
        });
      }
    } catch {
      // ignore offline mode
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, [refreshSignal]);

  useEffect(() => {
    loadMessages(activeRoomId);
  }, [activeRoomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!incomingMessage) return;
    if (incomingMessage.roomId === activeRoomId) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === incomingMessage.id)) return prev;
        return [...prev, incomingMessage];
      });
      fetch('/api/chat/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': localProfile.clientId,
        },
        body: JSON.stringify({ roomId: activeRoomId }),
      });
    } else {
      loadRooms();
    }
  }, [incomingMessage]);

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setChatError('');
    setUploadingMedia(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('purpose', 'media');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      setMediaUrl(data.url);
      setMediaType(data.type);
    } catch (err: any) {
      setChatError(err?.message || 'Upload failed');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !mediaUrl) return;
    setChatError('');
    setSending(true);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': localProfile.clientId,
        },
        body: JSON.stringify({
          roomId: activeRoomId,
          text: text.trim(),
          mediaUrl,
          mediaType,
          senderName: activeSender.name,
          senderAvatar: activeSender.avatar,
          senderAvatars: activeSender.avatars,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      setText('');
      setMediaUrl('');
      setMediaType(null);
    } catch (err: any) {
      setChatError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const activeRoom = rooms.find((r) => r.roomId === activeRoomId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[600px] max-h-[78vh]">
        {/* Left Sidebar: Chat Rooms */}
        <aside className="md:col-span-4 lg:col-span-3 border-b md:border-b-0 md:border-r border-stone-200 dark:border-stone-800 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-stone-200 dark:border-stone-800">
            <h1 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-rose-700 dark:text-rose-400" />
              <span>{t.familyChatTitle}</span>
            </h1>
          </div>

          {loadingRooms ? (
            <div className="p-4 text-xs text-stone-500">{t.loading}</div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {rooms.map((room) => {
                const active = room.roomId === activeRoomId;
                const roomName = lang === 'si' ? room.nameSi : room.nameEn;
                return (
                  <button
                    key={room.roomId}
                    type="button"
                    onClick={() => setActiveRoomId(room.roomId)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      active
                        ? 'bg-rose-50 dark:bg-rose-950/30'
                        : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 overflow-hidden shrink-0 flex items-center justify-center border border-stone-200 dark:border-stone-700">
                      {room.coverPhotoUrl ? (
                        <img
                          src={room.coverPhotoUrl}
                          alt={roomName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Users className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {roomName}
                        </p>
                        {room.unreadCount > 0 && (
                          <span className="text-[11px] font-bold tabular-nums text-rose-700 dark:text-rose-400">
                            {room.unreadCount}
                          </span>
                        )}
                      </div>
                      {room.lastMessage && (
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                          {room.lastMessage.senderName}:{' '}
                          {room.lastMessage.text ||
                            (room.lastMessage.mediaType === 'video' ? '[Video]' : '[Photo]')}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Pane: Messages */}
        <div className="md:col-span-8 lg:col-span-9 flex flex-col h-full min-h-[460px] max-h-[78vh]">
          <div className="px-5 py-3.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-stone-900 dark:text-stone-100">
                {activeRoom ? (lang === 'si' ? activeRoom.nameSi : activeRoom.nameEn) : t.allFamiliesRoom}
              </h2>
              {typingUser && typingUser.roomId === activeRoomId && (
                <p className="text-[11px] text-rose-700 dark:text-rose-400">
                  {typingUser.userName} {t.typingIndicator}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenProfileModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-rose-300"
            >
              <User className="w-3.5 h-3.5" />
              <span>{localProfile.name || t.myNameBtn}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-stone-50/50 dark:bg-stone-950/30">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-10 gap-2 text-xs text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.loading}</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="py-16 text-center text-sm text-stone-500">{t.noMessagesYet}</div>
            ) : (
              messages.map((m) => {
                const isMine =
                  m.senderId === localProfile.clientId && m.senderName === activeSender.name;
                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <AvatarStack
                      avatars={m.senderAvatars}
                      fallbackAvatar={m.senderAvatar}
                      alt={m.senderName}
                      size="md"
                    />
                    <div
                      className={`max-w-[78%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 space-y-2 ${
                        isMine
                          ? 'bg-rose-700 text-white'
                          : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span
                          className={`text-[11px] font-semibold ${
                            isMine ? 'text-rose-100' : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {m.senderName}
                        </span>
                        <span
                          className={`text-[10px] tabular-nums ${
                            isMine ? 'text-rose-200' : 'text-stone-400'
                          }`}
                        >
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {m.mediaUrl && (
                        <div className="rounded-xl overflow-hidden bg-black/10">
                          {m.mediaType === 'video' ? (
                            <video src={m.mediaUrl} controls className="max-h-64 rounded-xl" />
                          ) : (
                            <img
                              src={m.mediaUrl}
                              alt="Chat attachment"
                              referrerPolicy="no-referrer"
                              className="max-h-64 rounded-xl object-cover"
                            />
                          )}
                        </div>
                      )}

                      {m.text && <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</p>}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSend}
            className="p-3 sm:p-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-2"
          >
            {chatError && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">
                <span>{chatError}</span>
                <button
                  type="button"
                  onClick={() => setChatError('')}
                  aria-label={t.close}
                  className="p-0.5 hover:opacity-75"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {mediaUrl && (
              <div className="relative inline-block">
                {mediaType === 'video' ? (
                  <video src={mediaUrl} className="h-20 rounded-lg border border-stone-200" />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="Attachment preview"
                    referrerPolicy="no-referrer"
                    className="h-20 rounded-lg border border-stone-200 object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMediaUrl('');
                    setMediaType(null);
                  }}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-stone-900 text-white p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-stone-500 dark:text-stone-400 shrink-0">
                  {t.sendingAsLabel}:
                </span>
                <AvatarStack
                  avatars={activeSender.avatars}
                  fallbackAvatar={activeSender.avatar}
                  alt={activeSender.name}
                  size="sm"
                />
                <span className="text-xs font-semibold text-stone-800 dark:text-stone-100 truncate">
                  {activeSender.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
                {quickMembers.map((qm) => {
                  const isActive =
                    selectedSenderIds.length === 1 && selectedSenderIds[0] === qm.id;
                  return (
                    <button
                      key={qm.id}
                      type="button"
                      onClick={() => setSelectedSenderIds(isActive ? [] : [qm.id])}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        isActive
                          ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                          : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-rose-300'
                      }`}
                    >
                      {qm.photoUrl ? (
                        <img
                          src={qm.photoUrl}
                          alt={qm.name}
                          referrerPolicy="no-referrer"
                          className="w-4 h-4 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <User className="w-3 h-3 shrink-0" />
                      )}
                      <span>{qm.name}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSenderModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:border-rose-300 whitespace-nowrap"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{t.selectMembersBtn}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleAttachFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMedia}
                aria-label={t.uploadMedia}
                className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-rose-300 dark:hover:border-rose-700 min-h-[42px] min-w-[42px] flex items-center justify-center"
              >
                {uploadingMedia ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4" />
                )}
              </button>

              <input
                type="text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onSendTyping(activeRoomId, activeSender.name);
                }}
                placeholder={t.typeMessage}
                className="flex-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm min-h-[42px]"
              />

              <button
                type="submit"
                disabled={sending || (!text.trim() && !mediaUrl)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-4 py-2.5 text-xs font-medium min-h-[42px]"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">{t.send}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {senderModalOpen && (
        <MemberSenderModal
          lang={lang}
          families={families}
          allMembers={allMembers}
          selectedIds={selectedSenderIds}
          preferredFamilyId={activeRoomId.startsWith('family-') ? activeRoomId : null}
          mode="multi"
          onChange={setSelectedSenderIds}
          onClose={() => setSenderModalOpen(false)}
        />
      )}
    </div>
  );
};
