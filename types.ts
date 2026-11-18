export type Lang = 'en' | 'si';

export type PageTab =
  | 'home'
  | 'families'
  | 'family-detail'
  | 'features'
  | 'chat'
  | 'moments';

export type FeatureSubTab = 'birthdays' | 'trips' | 'events';

export interface LocalProfile {
  clientId: string;
  name: string;
  avatarUrl: string;
}

export interface SiteSettings {
  heroPhotoUrl: string;
  welcomeEn: string;
  welcomeSi: string;
  updatedAt: string;
}

export interface Family {
  id: string;
  sortOrder: number;
  nameEn: string;
  nameSi: string;
  descriptionEn: string;
  descriptionSi: string;
  coverPhotoUrl: string;
  updatedAt: string;
  memberCount?: number;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  name: string;
  relationship: string;
  birthday: string;
  photoUrl: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  familyNameEn?: string;
  familyNameSi?: string;
}

export interface BirthdayWish {
  id: string;
  targetKey: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorAvatars?: string[];
  message: string;
  createdAt: string;
}

export interface BirthdayEntry {
  id: string;
  source: 'birthday' | 'member';
  targetKey: string;
  familyId: string | null;
  familyNameEn: string;
  familyNameSi: string;
  memberName: string;
  birthDate: string;
  photoUrl: string;
  notes: string;
  createdBy: string;
  wishes: BirthdayWish[];
}

export interface MediaAsset {
  url: string;
  type: 'image' | 'video';
  name?: string;
}

export interface TripEntry {
  id: string;
  familyId: string | null;
  familyNameEn: string;
  familyNameSi: string;
  title: string;
  destination: string;
  tripDate: string;
  description: string;
  media: MediaAsset[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
}

export interface EventEntry {
  id: string;
  familyId: string | null;
  familyNameEn: string;
  familyNameSi: string;
  category: 'wedding' | 'party' | 'celebration' | 'religious' | 'other';
  title: string;
  eventDate: string;
  location: string;
  description: string;
  media: MediaAsset[];
  status: 'approved' | 'suggested';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
}

export interface GalleryItem {
  id: string;
  familyId: string | null;
  familyNameEn: string;
  familyNameSi: string;
  title: string;
  caption: string;
  location: string;
  momentDate: string;
  kind: 'gallery' | 'moment' | 'timeline';
  mediaUrl: string;
  mediaType: 'image' | 'video';
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important';
  familyId: string | null;
  familyNameEn: string;
  familyNameSi: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface ChatRoom {
  roomId: string;
  nameEn: string;
  nameSi: string;
  coverPhotoUrl: string;
  unreadCount: number;
  lastMessage: {
    id: string;
    senderName: string;
    text: string;
    mediaType: 'image' | 'video' | null;
    createdAt: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderAvatars?: string[];
  text: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  titleEn: string;
  titleSi: string;
  bodyEn: string;
  bodySi: string;
  linkTab: string;
  createdAt: string;
  isRead: boolean;
  sourceClientId?: string;
}

export interface FamilyHistoryData {
  trips: TripEntry[];
  pictures: GalleryItem[];
  events: EventEntry[];
  birthdays: BirthdayEntry[];
}

