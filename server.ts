import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import multer from 'multer';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { db, UPLOADS_DIR } from './server/db.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded media files
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer storage for images and videos
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const safeExt = /^[a-z0-9.]+$/i.test(ext) ? ext : '.bin';
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 45 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    if (!allowed) {
      cb(new Error('Only image and video files are supported'));
      return;
    }
    cb(null, true);
  },
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const allSockets = new Set<WebSocket>();

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (!url.startsWith('/ws')) {
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws);
  });
});

wss.on('connection', (ws: WebSocket) => {
  allSockets.add(ws);
  ws.send(JSON.stringify({ type: 'connected' }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'chat:typing' && typeof msg.roomId === 'string') {
        broadcastAll(
          {
            type: 'chat:typing',
            roomId: msg.roomId,
            clientId: typeof msg.clientId === 'string' ? msg.clientId : '',
            userName:
              typeof msg.userName === 'string' && msg.userName.trim()
                ? msg.userName.trim()
                : 'Family Member',
          },
          ws
        );
      }
    } catch {
      // ignore malformed frames
    }
  });

  ws.on('close', () => {
    allSockets.delete(ws);
  });
});

function broadcastAll(payload: unknown, excludeSocket?: WebSocket) {
  const serialized = JSON.stringify(payload);
  for (const sock of allSockets) {
    if (excludeSocket && sock === excludeSocket) continue;
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(serialized);
    }
  }
}

function broadcastSync(scope: string, sourceClientId = '') {
  broadcastAll({ type: 'data:sync', scope, sourceClientId });
}

function createNotification(params: {
  type: string;
  titleEn: string;
  titleSi: string;
  bodyEn: string;
  bodySi: string;
  linkTab: string;
  sourceClientId?: string;
}) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (id, target_role, target_user_id, type, title_en, title_si, body_en, body_si, link_tab, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    null,
    null,
    params.type,
    params.titleEn,
    params.titleSi,
    params.bodyEn,
    params.bodySi,
    params.linkTab,
    createdAt
  );

  broadcastAll({
    type: 'notification:new',
    sourceClientId: params.sourceClientId || '',
    notification: {
      id,
      type: params.type,
      titleEn: params.titleEn,
      titleSi: params.titleSi,
      bodyEn: params.bodyEn,
      bodySi: params.bodySi,
      linkTab: params.linkTab,
      createdAt,
      isRead: false,
      sourceClientId: params.sourceClientId || '',
    },
  });
}

function getClientId(req: express.Request): string {
  const fromHeader = req.headers['x-client-id'];
  const fromQuery = req.query.clientId;
  const fromBody = req.body?.clientId;
  const val = String(fromHeader || fromQuery || fromBody || 'shared-family-client').trim();
  return val || 'shared-family-client';
}

function getActorName(req: express.Request): string {
  const fromHeader = req.headers['x-author-name'];
  const fromBody = req.body?.authorName || req.body?.senderName;
  let val = '';
  if (typeof fromBody === 'string' && fromBody.trim()) {
    val = fromBody.trim();
  } else if (typeof fromHeader === 'string' && fromHeader.trim()) {
    try {
      val = decodeURIComponent(fromHeader.trim());
    } catch {
      val = fromHeader.trim();
    }
  }
  return val || 'Family Member';
}

function getDaysUntilBirthdayServer(birthDate: string): { days: number; nextYear: number } {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return { days: 999, nextYear: new Date().getFullYear() };
  }
  const [, mStr, dStr] = birthDate.split('-');
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m, d);
  if (next < today) {
    next = new Date(now.getFullYear() + 1, m, d);
  }
  const days = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return { days, nextYear: next.getFullYear() };
}

function getAllBirthdayEntries() {
  const standalone = db.prepare(`
    SELECT b.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM birthdays b
    LEFT JOIN families f ON f.id = b.family_id
  `).all() as any[];

  const memberBirthdays = db.prepare(`
    SELECT m.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM family_members m
    JOIN families f ON f.id = m.family_id
    WHERE m.birthday IS NOT NULL AND m.birthday != ''
  `).all() as any[];

  const wishesRows = db.prepare('SELECT * FROM birthday_wishes ORDER BY created_at DESC').all() as any[];
  const wishesByTarget = new Map<string, any[]>();
  for (const w of wishesRows) {
    let parsedAvatars: string[] = [];
    try {
      const arr = JSON.parse(w.author_avatars_json || '[]');
      if (Array.isArray(arr)) parsedAvatars = arr.filter((x) => typeof x === 'string' && x);
    } catch {
      parsedAvatars = [];
    }
    if (parsedAvatars.length === 0 && w.author_avatar) {
      parsedAvatars = [w.author_avatar];
    }
    const arr = wishesByTarget.get(w.target_key) || [];
    arr.push({
      id: w.id,
      targetKey: w.target_key,
      authorId: w.author_id,
      authorName: w.author_name,
      authorAvatar: w.author_avatar || '',
      authorAvatars: parsedAvatars,
      message: w.message,
      createdAt: w.created_at,
    });
    wishesByTarget.set(w.target_key, arr);
  }

  return [
    ...standalone.map((b) => ({
      id: b.id,
      source: 'birthday' as const,
      targetKey: `b-${b.id}`,
      familyId: b.family_id,
      familyNameEn: b.family_name_en || '',
      familyNameSi: b.family_name_si || '',
      memberName: b.member_name,
      birthDate: b.birth_date,
      photoUrl: b.photo_url || '',
      notes: b.notes || '',
      createdBy: b.created_by,
      wishes: wishesByTarget.get(`b-${b.id}`) || [],
    })),
    ...memberBirthdays.map((m) => ({
      id: m.id,
      source: 'member' as const,
      targetKey: `m-${m.id}`,
      familyId: m.family_id,
      familyNameEn: m.family_name_en || '',
      familyNameSi: m.family_name_si || '',
      memberName: m.name,
      birthDate: m.birthday,
      photoUrl: m.photo_url || '',
      notes: m.relationship,
      createdBy: m.created_by,
      wishes: wishesByTarget.get(`m-${m.id}`) || [],
    })),
  ];
}

function ensureMonthlyBirthdayNotifications(sourceClientId = '') {
  const all = getAllBirthdayEntries();
  for (const entry of all) {
    const { days, nextYear } = getDaysUntilBirthdayServer(entry.birthDate);
    if (days >= 0 && days <= 30) {
      const reminderType = `bday_30d:${entry.targetKey}:${nextYear}`;
      const existing = db.prepare('SELECT id FROM notifications WHERE type = ?').get(reminderType);
      if (!existing) {
        const whenEn = days === 0 ? 'today!' : `in ${days} day${days === 1 ? '' : 's'} (${entry.birthDate})`;
        const whenSi = days === 0 ? 'අදයි!' : `තව දින ${days} කින් (${entry.birthDate})`;
        createNotification({
          type: reminderType,
          titleEn: `🎂 Upcoming Birthday: ${entry.memberName}`,
          titleSi: `🎂 ආසන්න උපන්දිනය: ${entry.memberName}`,
          bodyEn: `${entry.memberName}'s birthday is ${whenEn}. Send a warm birthday wish!`,
          bodySi: `${entry.memberName} ගේ උපන්දිනය ${whenSi}. උණුසුම් සුබපැතුමක් එක් කරන්න!`,
          linkTab: 'features',
          sourceClientId,
        });
      }
    }
  }
}

function getLikesMap(targetType: string, clientId: string) {
  const counts = db
    .prepare('SELECT target_id, COUNT(*) as cnt FROM media_likes WHERE target_type = ? GROUP BY target_id')
    .all(targetType) as { target_id: string; cnt: number }[];
  const mine = db
    .prepare('SELECT target_id FROM media_likes WHERE target_type = ? AND client_id = ?')
    .all(targetType, clientId) as { target_id: string }[];

  const countMap = new Map<string, number>();
  for (const c of counts) countMap.set(c.target_id, c.cnt);
  const mineSet = new Set(mine.map((m) => m.target_id));
  return { countMap, mineSet };
}

function mapFamilyRow(row: any, memberCount?: number) {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    nameEn: row.name_en,
    nameSi: row.name_si,
    descriptionEn: row.description_en || '',
    descriptionSi: row.description_si || '',
    coverPhotoUrl: row.cover_photo_url || '',
    updatedAt: row.updated_at,
    ...(typeof memberCount === 'number' ? { memberCount } : {}),
  };
}

function mapMemberRow(row: any) {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    relationship: row.relationship,
    birthday: row.birthday || '',
    photoUrl: row.photo_url || '',
    description: row.description || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==========================================
// BOOTSTRAP ROUTE
// ==========================================

app.get('/api/bootstrap', (_req, res) => {
  ensureMonthlyBirthdayNotifications();

  const settings = db.prepare('SELECT * FROM site_settings WHERE id = ?').get('main') as any;
  const familiesRows = db.prepare('SELECT * FROM families ORDER BY sort_order ASC').all() as any[];

  const countByFamily = new Map<string, number>();
  const counts = db.prepare('SELECT family_id, COUNT(*) as cnt FROM family_members GROUP BY family_id').all() as { family_id: string; cnt: number }[];
  for (const c of counts) countByFamily.set(c.family_id, c.cnt);

  const upcomingBirthdays = getAllBirthdayEntries()
    .filter((b) => {
      const { days } = getDaysUntilBirthdayServer(b.birthDate);
      return days >= 0 && days <= 30;
    })
    .sort(
      (a, b) =>
        getDaysUntilBirthdayServer(a.birthDate).days -
        getDaysUntilBirthdayServer(b.birthDate).days
    );

  const allMemberRows = db.prepare(`
    SELECT m.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM family_members m
    JOIN families f ON f.id = m.family_id
    ORDER BY f.sort_order ASC, m.created_at ASC
  `).all() as any[];

  res.json({
    siteSettings: {
      heroPhotoUrl: settings?.hero_photo_url || '',
      welcomeEn: settings?.welcome_en || '',
      welcomeSi: settings?.welcome_si || '',
      updatedAt: settings?.updated_at || new Date().toISOString(),
    },
    families: familiesRows.map((f) => mapFamilyRow(f, countByFamily.get(f.id) || 0)),
    upcomingBirthdays,
    allMembers: allMemberRows.map((r) => ({
      ...mapMemberRow(r),
      familyNameEn: r.family_name_en,
      familyNameSi: r.family_name_si,
    })),
  });
});

// ==========================================
// FILE UPLOAD ROUTE
// ==========================================

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const url = `/uploads/${req.file.filename}`;
  const type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
  res.json({ url, type, name: req.file.originalname });
});

// ==========================================
// LIKES ROUTE (Gallery, Trips, Events)
// ==========================================

app.post('/api/likes/toggle', (req, res) => {
  const clientId = getClientId(req);
  const actorName = getActorName(req);
  const { targetType, targetId, itemTitle } = req.body || {};
  if (!['gallery', 'trip', 'event'].includes(targetType) || typeof targetId !== 'string' || !targetId) {
    return res.status(400).json({ error: 'Invalid like target' });
  }

  const existing = db
    .prepare('SELECT 1 FROM media_likes WHERE target_type = ? AND target_id = ? AND client_id = ?')
    .get(targetType, targetId, clientId);

  let likedByMe = false;
  if (existing) {
    db.prepare('DELETE FROM media_likes WHERE target_type = ? AND target_id = ? AND client_id = ?').run(
      targetType,
      targetId,
      clientId
    );
    likedByMe = false;
  } else {
    db.prepare(
      'INSERT INTO media_likes (target_type, target_id, client_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(targetType, targetId, clientId, new Date().toISOString());
    likedByMe = true;

    const label = typeof itemTitle === 'string' && itemTitle.trim() ? itemTitle.trim() : 'a family memory';
    createNotification({
      type: 'like',
      titleEn: `❤️ New Like on ${label}`,
      titleSi: `❤️ "${label}" සඳහා කැමැත්තක් ලැබුණි`,
      bodyEn: `${actorName} liked "${label}".`,
      bodySi: `${actorName} "${label}" හට කැමැත්ත පළ කළේය.`,
      linkTab: targetType === 'gallery' ? 'moments' : 'features',
      sourceClientId: clientId,
    });
  }

  const cnt = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM media_likes WHERE target_type = ? AND target_id = ?')
      .get(targetType, targetId) as { cnt: number }
  ).cnt;

  broadcastSync('likes', clientId);
  res.json({ likedByMe, likeCount: cnt });
});

// ==========================================
// SITE SETTINGS (HERO & WELCOME)
// ==========================================

app.patch('/api/site-settings', (req, res) => {
  const clientId = getClientId(req);
  const actorName = getActorName(req);
  const { heroPhotoUrl, welcomeEn, welcomeSi } = req.body || {};
  const existing = db.prepare('SELECT * FROM site_settings WHERE id = ?').get('main') as any;
  const nextHero = typeof heroPhotoUrl === 'string' ? heroPhotoUrl : existing.hero_photo_url;
  const nextEn = typeof welcomeEn === 'string' ? welcomeEn : existing.welcome_en;
  const nextSi = typeof welcomeSi === 'string' ? welcomeSi : existing.welcome_si;
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE site_settings SET hero_photo_url = ?, welcome_en = ?, welcome_si = ?, updated_at = ? WHERE id = 'main'
  `).run(nextHero, nextEn, nextSi, updatedAt);

  createNotification({
    type: 'upload',
    titleEn: 'Home Page Updated',
    titleSi: 'මුල් පිටුව යාවත්කාලීන කරන ලදී',
    bodyEn: `${actorName} updated the family cover photo or welcome message.`,
    bodySi: `${actorName} විසින් මුල් පිටුවේ ඡායාරූපය හෝ පණිවිඩය යාවත්කාලීන කරන ලදී.`,
    linkTab: 'home',
    sourceClientId: clientId,
  });

  broadcastSync('siteSettings', clientId);

  res.json({
    heroPhotoUrl: nextHero,
    welcomeEn: nextEn,
    welcomeSi: nextSi,
    updatedAt,
  });
});

// ==========================================
// FAMILIES & MEMBERS ROUTES
// ==========================================

app.get('/api/families', (_req, res) => {
  const rows = db.prepare('SELECT * FROM families ORDER BY sort_order ASC').all() as any[];
  const countByFamily = new Map<string, number>();
  const counts = db.prepare('SELECT family_id, COUNT(*) as cnt FROM family_members GROUP BY family_id').all() as { family_id: string; cnt: number }[];
  for (const c of counts) countByFamily.set(c.family_id, c.cnt);
  res.json({
    families: rows.map((f) => mapFamilyRow(f, countByFamily.get(f.id) || 0)),
  });
});

app.get('/api/families/:id', (req, res) => {
  const familyId = String(req.params.id);
  const clientId = getClientId(req);
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId) as any;
  if (!family) {
    return res.status(404).json({ error: 'Family not found' });
  }
  const members = db.prepare('SELECT * FROM family_members WHERE family_id = ? ORDER BY created_at ASC').all(familyId) as any[];

  // Family History: trips, gallery pictures/videos, events, and birthdays ONLY
  // (Strictly excludes chat_messages and announcements)
  const tripLikes = getLikesMap('trip', clientId);
  const galleryLikes = getLikesMap('gallery', clientId);
  const eventLikes = getLikesMap('event', clientId);

  const tripRows = db.prepare(`
    SELECT t.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM trips t
    LEFT JOIN families f ON f.id = t.family_id
    WHERE t.family_id = ?
    ORDER BY t.trip_date DESC, t.created_at DESC
  `).all(familyId) as any[];

  const pictureRows = db.prepare(`
    SELECT g.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM gallery_items g
    LEFT JOIN families f ON f.id = g.family_id
    WHERE g.family_id = ?
    ORDER BY g.moment_date DESC, g.created_at DESC
  `).all(familyId) as any[];

  const eventRows = db.prepare(`
    SELECT e.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM events e
    LEFT JOIN families f ON f.id = e.family_id
    WHERE e.family_id = ?
    ORDER BY e.event_date DESC, e.created_at DESC
  `).all(familyId) as any[];

  const familyBirthdays = getAllBirthdayEntries()
    .filter((b) => b.familyId === familyId)
    .sort((a, b) => getDaysUntilBirthdayServer(a.birthDate).days - getDaysUntilBirthdayServer(b.birthDate).days);

  res.json({
    family: mapFamilyRow(family, members.length),
    members: members.map(mapMemberRow),
    history: {
      trips: tripRows.map((r) => ({
        id: r.id,
        familyId: r.family_id,
        familyNameEn: r.family_name_en || family.name_en || '',
        familyNameSi: r.family_name_si || family.name_si || '',
        title: r.title,
        destination: r.destination,
        tripDate: r.trip_date,
        description: r.description || '',
        media: JSON.parse(r.media_json || '[]'),
        createdBy: r.created_by,
        createdByName: r.created_by_name,
        createdAt: r.created_at,
        likeCount: tripLikes.countMap.get(r.id) || 0,
        likedByMe: tripLikes.mineSet.has(r.id),
      })),
      pictures: pictureRows.map((r) => ({
        id: r.id,
        familyId: r.family_id,
        familyNameEn: r.family_name_en || family.name_en || '',
        familyNameSi: r.family_name_si || family.name_si || '',
        title: r.title,
        caption: r.caption || '',
        location: r.location || '',
        momentDate: r.moment_date,
        kind: r.kind,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        uploadedBy: r.uploaded_by,
        uploadedByName: r.uploaded_by_name,
        createdAt: r.created_at,
        likeCount: galleryLikes.countMap.get(r.id) || 0,
        likedByMe: galleryLikes.mineSet.has(r.id),
      })),
      events: eventRows.map((r) => ({
        id: r.id,
        familyId: r.family_id,
        familyNameEn: r.family_name_en || family.name_en || '',
        familyNameSi: r.family_name_si || family.name_si || '',
        category: r.category,
        title: r.title,
        eventDate: r.event_date,
        location: r.location || '',
        description: r.description || '',
        media: JSON.parse(r.media_json || '[]'),
        status: r.status,
        createdBy: r.created_by,
        createdByName: r.created_by_name,
        createdAt: r.created_at,
        likeCount: eventLikes.countMap.get(r.id) || 0,
        likedByMe: eventLikes.mineSet.has(r.id),
      })),
      birthdays: familyBirthdays,
    },
  });
});

app.patch('/api/families/:id', (req, res) => {
  const clientId = getClientId(req);
  const actorName = getActorName(req);
  const familyId = String(req.params.id);
  const existing = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Family not found' });
  }
  const { nameEn, nameSi, descriptionEn, descriptionSi, coverPhotoUrl } = req.body || {};
  const nextNameEn = typeof nameEn === 'string' && nameEn.trim() ? nameEn.trim() : existing.name_en;
  const nextNameSi = typeof nameSi === 'string' && nameSi.trim() ? nameSi.trim() : existing.name_si;
  const nextDescEn = typeof descriptionEn === 'string' ? descriptionEn : existing.description_en;
  const nextDescSi = typeof descriptionSi === 'string' ? descriptionSi : existing.description_si;
  const nextCover = typeof coverPhotoUrl === 'string' ? coverPhotoUrl : existing.cover_photo_url;
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE families SET name_en = ?, name_si = ?, description_en = ?, description_si = ?, cover_photo_url = ?, updated_at = ?
    WHERE id = ?
  `).run(nextNameEn, nextNameSi, nextDescEn, nextDescSi, nextCover, updatedAt, familyId);

  createNotification({
    type: 'family',
    titleEn: `${nextNameEn} Updated`,
    titleSi: `${nextNameSi} යාවත්කාලීන කරන ලදී`,
    bodyEn: `${actorName} updated ${nextNameEn}'s photo or details.`,
    bodySi: `${actorName} විසින් ${nextNameSi} හි ඡායාරූපය හෝ විස්තර යාවත්කාලීන කරන ලදී.`,
    linkTab: 'families',
    sourceClientId: clientId,
  });

  broadcastSync('families', clientId);
  const updated = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId) as any;
  const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM family_members WHERE family_id = ?').get(familyId) as { cnt: number }).cnt;
  res.json({ family: mapFamilyRow(updated, cnt) });
});

app.post('/api/families/:id/members', (req, res) => {
  const clientId = getClientId(req);
  const actorName = getActorName(req);
  const familyId = String(req.params.id);
  const fam = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId) as any;
  if (!fam) {
    return res.status(404).json({ error: 'Family not found' });
  }
  const { name, relationship, birthday, photoUrl, description } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Member name is required' });
  }
  if (!relationship || typeof relationship !== 'string' || !relationship.trim()) {
    return res.status(400).json({ error: 'Relationship is required' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanBday = typeof birthday === 'string' ? birthday.trim() : '';

  db.prepare(`
    INSERT INTO family_members (id, family_id, name, relationship, birthday, photo_url, description, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    familyId,
    name.trim(),
    relationship.trim(),
    cleanBday,
    typeof photoUrl === 'string' ? photoUrl.trim() : '',
    typeof description === 'string' ? description.trim() : '',
    clientId,
    now,
    now
  );

  createNotification({
    type: 'member',
    titleEn: `New Member in ${fam.name_en}`,
    titleSi: `${fam.name_si} වෙත නව සාමාජිකයෙක්`,
    bodyEn: `${actorName} added ${name.trim()} (${relationship.trim()}) to ${fam.name_en}.`,
    bodySi: `${actorName} විසින් ${name.trim()} ${fam.name_si} වෙත එක් කරන ලදී.`,
    linkTab: 'families',
    sourceClientId: clientId,
  });

  if (cleanBday) {
    ensureMonthlyBirthdayNotifications(clientId);
  }

  broadcastSync('families', clientId);
  const row = db.prepare('SELECT * FROM family_members WHERE id = ?').get(id);
  res.status(201).json({ member: mapMemberRow(row) });
});

app.patch('/api/members/:memberId', (req, res) => {
  const clientId = getClientId(req);
  const actorName = getActorName(req);
  const existing = db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.memberId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Member not found' });
  }
  const { name, relationship, birthday, photoUrl, description } = req.body || {};
  const now = new Date().toISOString();
  const cleanName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
  const cleanBday = typeof birthday === 'string' ? birthday.trim() : existing.birthday;

  db.prepare(`
    UPDATE family_members
    SET name = ?, relationship = ?, birthday = ?, photo_url = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(
    cleanName,
    typeof relationship === 'string' && relationship.trim() ? relationship.trim() : existing.relationship,
    cleanBday,
    typeof photoUrl === 'string' ? photoUrl.trim() : existing.photo_url,
    typeof description === 'string' ? description.trim() : existing.description,
    now,
    existing.id
  );

  createNotification({
    type: 'member',
    titleEn: `Member Updated: ${cleanName}`,
    titleSi: `සාමාජික තොරතුරු යාවත්කාලීනයි: ${cleanName}`,
    bodyEn: `${actorName} updated ${cleanName}'s profile or photo.`,
    bodySi: `${actorName} විසින් ${cleanName} ගේ විස්තර හෝ ඡායාරූපය යාවත්කාලීන කරන ලදී.`,
    linkTab: 'families',
    sourceClientId: clientId,
  });

  if (cleanBday) {
    ensureMonthlyBirthdayNotifications(clientId);
  }

  broadcastSync('families', clientId);
  const updated = db.prepare('SELECT * FROM family_members WHERE id = ?').get(existing.id);
  res.json({ member: mapMemberRow(updated) });
});

app.delete('/api/members/:memberId', (req, res) => {
  const clientId = getClientId(req);
  const existing = db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.memberId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Member not found' });
  }
  db.prepare('DELETE FROM family_members WHERE id = ?').run(existing.id);
  db.prepare('DELETE FROM birthday_wishes WHERE target_key = ?').run(`m-${existing.id}`);
  broadcastSync('families', clientId);
  res.json({ ok: true });
});

app.get('/api/members/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = db.prepare(`
    SELECT m.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM family_members m
    JOIN families f ON f.id = m.family_id
    ORDER BY f.sort_order ASC, m.name ASC
  `).all() as any[];

  const filtered = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.relationship.toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          r.family_name_en.toLowerCase().includes(q) ||
          r.family_name_si.toLowerCase().includes(q)
      )
    : rows;

  res.json({
    members: filtered.map((r) => ({
      ...mapMemberRow(r),
      familyNameEn: r.family_name_en,
      familyNameSi: r.family_name_si,
    })),
  });
});

// ==========================================
// BIRTHDAYS & WISHES ROUTES
// ==========================================

app.get('/api/birthdays', (_req, res) => {
  ensureMonthlyBirthdayNotifications();
  res.json({ birthdays: getAllBirthdayEntries() });
});

app.post('/api/birthdays', (req, res) => {
  const clientId = getClientId(req);
  const actorName = getActorName(req);
  const { memberName, birthDate, familyId, photoUrl, notes } = req.body || {};
  if (!memberName || typeof memberName !== 'string' || !memberName.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!birthDate || typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) {
    return res.status(400).json({ error: 'Valid birth date (YYYY-MM-DD) is required' });
  }
  const validFamilyId = typeof familyId === 'string' && /^family-[1-8]$/.test(familyId) ? familyId : null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO birthdays (id, family_id, member_name, birth_date, photo_url, notes, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    validFamilyId,
    memberName.trim(),
    birthDate.trim(),
    typeof photoUrl === 'string' ? photoUrl.trim() : '',
    typeof notes === 'string' ? notes.trim() : '',
    clientId,
    now
  );

  createNotification({
    type: 'birthday',
    titleEn: `🎂 Birthday Added: ${memberName.trim()}`,
    titleSi: `🎂 නව උපන්දිනයක්: ${memberName.trim()}`,
    bodyEn: `${actorName} added ${memberName.trim()}'s birthday (${birthDate.trim()}).`,
    bodySi: `${actorName} විසින් ${memberName.trim()} ගේ උපන්දිනය (${birthDate.trim()}) එක් කරන ලදී.`,
    linkTab: 'features',
    sourceClientId: clientId,
  });

  ensureMonthlyBirthdayNotifications(clientId);
  broadcastSync('birthdays', clientId);
  res.status(201).json({ id });
});

app.delete('/api/birthdays/:id', (req, res) => {
  const clientId = getClientId(req);
  const row = db.prepare('SELECT * FROM birthdays WHERE id = ?').get(req.params.id) as any;
  if (!row) {
    return res.status(404).json({ error: 'Birthday entry not found' });
  }
  db.prepare('DELETE FROM birthdays WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM birthday_wishes WHERE target_key = ?').run(`b-${row.id}`);
  broadcastSync('birthdays', clientId);
  res.json({ ok: true });
});

app.post('/api/birthdays/:targetKey/wishes', (req, res) => {
  const clientId = getClientId(req);
  const targetKey = String(req.params.targetKey);
  const { message, authorName, authorAvatar, authorAvatars } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Wish message is required' });
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const cleanAuthor = typeof authorName === 'string' && authorName.trim() ? authorName.trim() : 'Family Member';
  const cleanAvatar = typeof authorAvatar === 'string' ? authorAvatar.trim() : '';
  const safeAvatars = Array.isArray(authorAvatars)
    ? authorAvatars.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).slice(0, 6)
    : cleanAvatar
      ? [cleanAvatar]
      : [];

  db.prepare(`
    INSERT INTO birthday_wishes (id, target_key, author_id, author_name, author_avatar, author_avatars_json, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    targetKey,
    clientId,
    cleanAuthor,
    cleanAvatar || safeAvatars[0] || '',
    JSON.stringify(safeAvatars),
    message.trim(),
    createdAt
  );

  // Lookup birthday person name
  let personName = 'a family member';
  if (targetKey.startsWith('b-')) {
    const b = db.prepare('SELECT member_name FROM birthdays WHERE id = ?').get(targetKey.slice(2)) as any;
    if (b?.member_name) personName = b.member_name;
  } else if (targetKey.startsWith('m-')) {
    const m = db.prepare('SELECT name FROM family_members WHERE id = ?').get(targetKey.slice(2)) as any;
    if (m?.name) personName = m.name;
  }

  createNotification({
    type: 'wish',
    titleEn: `🎂 Birthday Wish for ${personName}`,
    titleSi: `🎂 ${personName} වෙත උපන්දින සුබපැතුමක්`,
    bodyEn: `${cleanAuthor}: "${message.trim().slice(0, 100)}"`,
    bodySi: `${cleanAuthor}: "${message.trim().slice(0, 100)}"`,
    linkTab: 'features',
    sourceClientId: clientId,
  });

  broadcastSync('birthdays', clientId);
  res.status(201).json({
    wish: {
      id,
      targetKey,
      authorId: clientId,
      authorName: cleanAuthor,
      authorAvatar: cleanAvatar || safeAvatars[0] || '',
      authorAvatars: safeAvatars,
      message: message.trim(),
      createdAt,
    },
  });
});

// ==========================================
// FAMILY TRIPS ROUTES
// ==========================================

app.get('/api/trips', (req, res) => {
  const clientId = getClientId(req);
  const { countMap, mineSet } = getLikesMap('trip', clientId);
  const rows = db.prepare(`
    SELECT t.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM trips t
    LEFT JOIN families f ON f.id = t.family_id
    ORDER BY t.trip_date DESC
  `).all() as any[];

  res.json({
    trips: rows.map((r) => ({
      id: r.id,
      familyId: r.family_id,
      familyNameEn: r.family_name_en || '',
      familyNameSi: r.family_name_si || '',
      title: r.title,
      destination: r.destination,
      tripDate: r.trip_date,
      description: r.description || '',
      media: JSON.parse(r.media_json || '[]'),
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
      likeCount: countMap.get(r.id) || 0,
      likedByMe: mineSet.has(r.id),
    })),
  });
});

app.post('/api/trips', (req, res) => {
  const clientId = getClientId(req);
  const { title, destination, tripDate, description, familyId, media, authorName } = req.body || {};
  if (!title || !destination || !tripDate) {
    return res.status(400).json({ error: 'Title, destination, and date are required' });
  }
  if (typeof familyId !== 'string' || !/^family-[1-8]$/.test(familyId)) {
    return res.status(400).json({ error: 'Please select a family group' });
  }
  const validFamilyId = familyId;
  const familyRow = db.prepare('SELECT name_en, name_si FROM families WHERE id = ?').get(validFamilyId) as
    | { name_en: string; name_si: string }
    | undefined;
  const famLabelEn = familyRow?.name_en ? ` (${familyRow.name_en})` : '';
  const famLabelSi = familyRow?.name_si ? ` (${familyRow.name_si})` : '';
  const cleanAuthor = typeof authorName === 'string' && authorName.trim() ? authorName.trim() : 'Family Member';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const safeMedia = Array.isArray(media) ? media : [];

  db.prepare(`
    INSERT INTO trips (id, family_id, title, destination, trip_date, description, media_json, created_by, created_by_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    validFamilyId,
    String(title).trim(),
    String(destination).trim(),
    String(tripDate).trim(),
    String(description || '').trim(),
    JSON.stringify(safeMedia),
    clientId,
    cleanAuthor,
    now
  );

  createNotification({
    type: 'event',
    titleEn: `✈️ New Family Trip${famLabelEn}: ${String(title).trim()}`,
    titleSi: `✈️ නව පවුලේ සංචාරයක්${famLabelSi}: ${String(title).trim()}`,
    bodyEn: `${cleanAuthor} added a trip to ${String(destination).trim()} into${famLabelEn || ' family'} history.`,
    bodySi: `${cleanAuthor} විසින් ${String(destination).trim()} සංචාරය${famLabelSi} පවුලේ ඉතිහාසයට එක් කරන ලදී.`,
    linkTab: 'features',
    sourceClientId: clientId,
  });

  broadcastSync('trips', clientId);
  res.status(201).json({ id, familyId: validFamilyId });
});

app.delete('/api/trips/:id', (req, res) => {
  const clientId = getClientId(req);
  const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Trip not found' });
  db.prepare('DELETE FROM trips WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM media_likes WHERE target_type = ? AND target_id = ?').run('trip', row.id);
  broadcastSync('trips', clientId);
  res.json({ ok: true });
});

// ==========================================
// OTHER EVENTS ROUTES
// ==========================================

app.get('/api/events', (req, res) => {
  const clientId = getClientId(req);
  const { countMap, mineSet } = getLikesMap('event', clientId);
  const rows = db.prepare(`
    SELECT e.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM events e
    LEFT JOIN families f ON f.id = e.family_id
    ORDER BY e.event_date ASC
  `).all() as any[];

  res.json({
    events: rows.map((r) => ({
      id: r.id,
      familyId: r.family_id,
      familyNameEn: r.family_name_en || '',
      familyNameSi: r.family_name_si || '',
      category: r.category,
      title: r.title,
      eventDate: r.event_date,
      location: r.location || '',
      description: r.description || '',
      media: JSON.parse(r.media_json || '[]'),
      status: r.status,
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
      likeCount: countMap.get(r.id) || 0,
      likedByMe: mineSet.has(r.id),
    })),
  });
});

app.post('/api/events', (req, res) => {
  const clientId = getClientId(req);
  const { title, category, eventDate, location, description, familyId, media, authorName } = req.body || {};
  if (!title || !eventDate) {
    return res.status(400).json({ error: 'Event title and date are required' });
  }
  const validFamilyId = typeof familyId === 'string' && /^family-[1-8]$/.test(familyId) ? familyId : null;
  const cleanAuthor = typeof authorName === 'string' && authorName.trim() ? authorName.trim() : 'Family Member';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const safeMedia = Array.isArray(media) ? media : [];

  db.prepare(`
    INSERT INTO events (id, family_id, category, title, event_date, location, description, media_json, status, created_by, created_by_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    validFamilyId,
    String(category || 'celebration'),
    String(title).trim(),
    String(eventDate).trim(),
    String(location || '').trim(),
    String(description || '').trim(),
    JSON.stringify(safeMedia),
    'approved',
    clientId,
    cleanAuthor,
    now
  );

  createNotification({
    type: 'event',
    titleEn: `🎉 New Event: ${String(title).trim()}`,
    titleSi: `🎉 නව පවුලේ උත්සවයක්: ${String(title).trim()}`,
    bodyEn: `${cleanAuthor} added "${String(title).trim()}" on ${String(eventDate).trim()}.`,
    bodySi: `${cleanAuthor} විසින් ${String(eventDate).trim()} දින "${String(title).trim()}" උත්සවය එක් කරන ලදී.`,
    linkTab: 'features',
    sourceClientId: clientId,
  });

  broadcastSync('events', clientId);
  res.status(201).json({ id, status: 'approved' });
});

app.patch('/api/events/:id', (req, res) => {
  const clientId = getClientId(req);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Event not found' });
  const { status, title, eventDate, description, location, category } = req.body || {};
  db.prepare(`
    UPDATE events SET status = ?, title = ?, event_date = ?, description = ?, location = ?, category = ? WHERE id = ?
  `).run(
    typeof status === 'string' ? status : row.status,
    typeof title === 'string' && title.trim() ? title.trim() : row.title,
    typeof eventDate === 'string' ? eventDate : row.event_date,
    typeof description === 'string' ? description : row.description,
    typeof location === 'string' ? location : row.location,
    typeof category === 'string' ? category : row.category,
    row.id
  );
  broadcastSync('events', clientId);
  res.json({ ok: true });
});

app.delete('/api/events/:id', (req, res) => {
  const clientId = getClientId(req);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM media_likes WHERE target_type = ? AND target_id = ?').run('event', row.id);
  broadcastSync('events', clientId);
  res.json({ ok: true });
});

// ==========================================
// GALLERY, TIMELINE, MOMENTS & ANNOUNCEMENTS
// ==========================================

app.get('/api/gallery', (req, res) => {
  const clientId = getClientId(req);
  const { countMap, mineSet } = getLikesMap('gallery', clientId);

  const rows = db.prepare(`
    SELECT g.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM gallery_items g
    LEFT JOIN families f ON f.id = g.family_id
    ORDER BY g.moment_date DESC, g.created_at DESC
  `).all() as any[];

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      familyId: r.family_id,
      familyNameEn: r.family_name_en || '',
      familyNameSi: r.family_name_si || '',
      title: r.title,
      caption: r.caption || '',
      location: r.location || '',
      momentDate: r.moment_date,
      kind: r.kind,
      mediaUrl: r.media_url,
      mediaType: r.media_type,
      uploadedBy: r.uploaded_by,
      uploadedByName: r.uploaded_by_name,
      createdAt: r.created_at,
      likeCount: countMap.get(r.id) || 0,
      likedByMe: mineSet.has(r.id),
    })),
  });
});

app.post('/api/gallery', (req, res) => {
  const clientId = getClientId(req);
  const { title, caption, location, momentDate, kind, mediaUrl, mediaType, familyId, authorName } = req.body || {};
  if (!title || !mediaUrl) {
    return res.status(400).json({ error: 'Title and media are required' });
  }
  const validFamilyId = typeof familyId === 'string' && /^family-[1-8]$/.test(familyId) ? familyId : null;
  const cleanAuthor = typeof authorName === 'string' && authorName.trim() ? authorName.trim() : 'Family Member';
  const cleanLoc = typeof location === 'string' ? location.trim() : '';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO gallery_items (id, family_id, title, caption, location, moment_date, kind, media_url, media_type, uploaded_by, uploaded_by_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    validFamilyId,
    String(title).trim(),
    String(caption || '').trim(),
    cleanLoc,
    String(momentDate || now.slice(0, 10)),
    String(kind || 'gallery'),
    String(mediaUrl).trim(),
    mediaType === 'video' ? 'video' : 'image',
    clientId,
    cleanAuthor,
    now
  );

  const locEn = cleanLoc ? ` (${cleanLoc})` : '';
  const locSi = cleanLoc ? ` (${cleanLoc})` : '';
  createNotification({
    type: 'upload',
    titleEn: `📸 New ${mediaType === 'video' ? 'Video' : 'Photo'}: ${String(title).trim()}`,
    titleSi: `📸 නව ${mediaType === 'video' ? 'වීඩියෝවක්' : 'ඡායාරූපයක්'}: ${String(title).trim()}`,
    bodyEn: `${cleanAuthor} uploaded "${String(title).trim()}"${locEn}.`,
    bodySi: `${cleanAuthor} විසින් "${String(title).trim()}"${locSi} උඩුගත කරන ලදී.`,
    linkTab: 'moments',
    sourceClientId: clientId,
  });

  broadcastSync('gallery', clientId);
  res.status(201).json({ id });
});

app.delete('/api/gallery/:id', (req, res) => {
  const clientId = getClientId(req);
  const row = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Item not found' });
  db.prepare('DELETE FROM gallery_items WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM media_likes WHERE target_type = ? AND target_id = ?').run('gallery', row.id);
  broadcastSync('gallery', clientId);
  res.json({ ok: true });
});

app.get('/api/announcements', (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, f.name_en as family_name_en, f.name_si as family_name_si
    FROM announcements a
    LEFT JOIN families f ON f.id = a.family_id
    ORDER BY a.created_at DESC
  `).all() as any[];
  res.json({
    announcements: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      priority: r.priority,
      familyId: r.family_id,
      familyNameEn: r.family_name_en || '',
      familyNameSi: r.family_name_si || '',
      authorId: r.author_id,
      authorName: r.author_name,
      createdAt: r.created_at,
    })),
  });
});

app.post('/api/announcements', (req, res) => {
  const clientId = getClientId(req);
  const { title, body, priority, familyId, authorName } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and message are required' });
  }
  const validFamilyId = typeof familyId === 'string' && /^family-[1-8]$/.test(familyId) ? familyId : null;
  const cleanAuthor = typeof authorName === 'string' && authorName.trim() ? authorName.trim() : 'Family Member';
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO announcements (id, title, body, priority, family_id, author_id, author_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(title).trim(),
    String(body).trim(),
    priority === 'important' ? 'important' : 'normal',
    validFamilyId,
    clientId,
    cleanAuthor,
    createdAt
  );

  createNotification({
    type: 'announcement',
    titleEn: `📢 Announcement: ${String(title).trim()}`,
    titleSi: `📢 නිවේදනය: ${String(title).trim()}`,
    bodyEn: `${cleanAuthor}: ${String(body).trim().slice(0, 110)}`,
    bodySi: `${cleanAuthor}: ${String(body).trim().slice(0, 110)}`,
    linkTab: 'moments',
    sourceClientId: clientId,
  });

  broadcastSync('announcements', clientId);
  res.status(201).json({ id });
});

app.delete('/api/announcements/:id', (req, res) => {
  const clientId = getClientId(req);
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Announcement not found' });
  db.prepare('DELETE FROM announcements WHERE id = ?').run(row.id);
  broadcastSync('announcements', clientId);
  res.json({ ok: true });
});

// ==========================================
// REAL-TIME FAMILY CHAT ROUTES
// ==========================================

app.get('/api/chat/rooms', (req, res) => {
  const clientId = getClientId(req);
  const families = db.prepare('SELECT * FROM families ORDER BY sort_order ASC').all() as any[];
  const roomIds = ['all', ...families.map((f) => f.id)];

  const rooms = roomIds.map((roomId) => {
    const readRow = db
      .prepare('SELECT last_read_at FROM chat_read_state WHERE user_id = ? AND room_id = ?')
      .get(clientId, roomId) as { last_read_at: string } | undefined;
    const lastReadAt = readRow?.last_read_at || '1970-01-01T00:00:00.000Z';

    const unreadCount = (
      db
        .prepare('SELECT COUNT(*) as cnt FROM chat_messages WHERE room_id = ? AND created_at > ? AND sender_id != ?')
        .get(roomId, lastReadAt, clientId) as { cnt: number }
    ).cnt;

    const latest = db
      .prepare('SELECT * FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(roomId) as any;

    const fam = families.find((f) => f.id === roomId);
    return {
      roomId,
      nameEn: fam ? fam.name_en : 'All Families Group',
      nameSi: fam ? fam.name_si : 'සියලුම පවුල් සමූහය',
      coverPhotoUrl: fam ? fam.cover_photo_url : '',
      unreadCount,
      lastMessage: latest
        ? {
            id: latest.id,
            senderName: latest.sender_name,
            text: latest.text,
            mediaType: latest.media_type,
            createdAt: latest.created_at,
          }
        : null,
    };
  });

  res.json({ rooms });
});

app.get('/api/chat/messages', (req, res) => {
  const clientId = getClientId(req);
  const roomId = String(req.query.roomId || 'all');
  const rows = db
    .prepare('SELECT * FROM chat_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 200')
    .all(roomId) as any[];

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO chat_read_state (user_id, room_id, last_read_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, room_id) DO UPDATE SET last_read_at = excluded.last_read_at
  `).run(clientId, roomId, now);

  res.json({
    messages: rows.map((r) => {
      let parsedAvatars: string[] = [];
      try {
        const arr = JSON.parse(r.sender_avatars_json || '[]');
        if (Array.isArray(arr)) parsedAvatars = arr.filter((x) => typeof x === 'string' && x);
      } catch {
        parsedAvatars = [];
      }
      if (parsedAvatars.length === 0 && r.sender_avatar) parsedAvatars = [r.sender_avatar];
      return {
        id: r.id,
        roomId: r.room_id,
        senderId: r.sender_id,
        senderName: r.sender_name,
        senderAvatar: r.sender_avatar || '',
        senderAvatars: parsedAvatars,
        text: r.text || '',
        mediaUrl: r.media_url || '',
        mediaType: r.media_type || null,
        createdAt: r.created_at,
      };
    }),
  });
});

app.post('/api/chat/read', (req, res) => {
  const clientId = getClientId(req);
  const roomId = String(req.body?.roomId || 'all');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO chat_read_state (user_id, room_id, last_read_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, room_id) DO UPDATE SET last_read_at = excluded.last_read_at
  `).run(clientId, roomId, now);
  res.json({ ok: true });
});

app.post('/api/chat/messages', (req, res) => {
  const clientId = getClientId(req);
  const { roomId, text, mediaUrl, mediaType, senderName, senderAvatar, senderAvatars } = req.body || {};
  const cleanRoom = typeof roomId === 'string' && (roomId === 'all' || /^family-[1-8]$/.test(roomId)) ? roomId : 'all';
  const cleanText = typeof text === 'string' ? text.trim() : '';
  const cleanMedia = typeof mediaUrl === 'string' ? mediaUrl.trim() : '';
  const cleanSender = typeof senderName === 'string' && senderName.trim() ? senderName.trim() : 'Family Member';
  const cleanAvatar = typeof senderAvatar === 'string' ? senderAvatar.trim() : '';
  const safeAvatars = Array.isArray(senderAvatars)
    ? senderAvatars.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).slice(0, 6)
    : cleanAvatar
      ? [cleanAvatar]
      : [];

  if (!cleanText && !cleanMedia) {
    return res.status(400).json({ error: 'Message text or media is required' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const cleanMediaType = cleanMedia ? (mediaType === 'video' ? 'video' : 'image') : null;

  db.prepare(`
    INSERT INTO chat_messages (id, room_id, sender_id, sender_name, sender_avatar, sender_avatars_json, text, media_url, media_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    cleanRoom,
    clientId,
    cleanSender,
    cleanAvatar || safeAvatars[0] || '',
    JSON.stringify(safeAvatars),
    cleanText,
    cleanMedia,
    cleanMediaType,
    createdAt
  );

  db.prepare(`
    INSERT INTO chat_read_state (user_id, room_id, last_read_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, room_id) DO UPDATE SET last_read_at = excluded.last_read_at
  `).run(clientId, cleanRoom, createdAt);

  const message = {
    id,
    roomId: cleanRoom,
    senderId: clientId,
    senderName: cleanSender,
    senderAvatar: cleanAvatar || safeAvatars[0] || '',
    senderAvatars: safeAvatars,
    text: cleanText,
    mediaUrl: cleanMedia,
    mediaType: cleanMediaType,
    createdAt,
  };

  broadcastAll({
    type: 'chat:message',
    message,
  });

  // Notify via Bell when someone sends a photo/video or message in family chat
  const previewEn = cleanMedia
    ? `${cleanSender} shared a ${cleanMediaType === 'video' ? 'video' : 'photo'}${cleanText ? `: "${cleanText.slice(0, 70)}"` : ''}`
    : `${cleanSender}: "${cleanText.slice(0, 90)}"`;
  const previewSi = cleanMedia
    ? `${cleanSender} ${cleanMediaType === 'video' ? 'වීඩියෝවක්' : 'ඡායාරූපයක්'} එවන ලදී${cleanText ? `: "${cleanText.slice(0, 70)}"` : ''}`
    : `${cleanSender}: "${cleanText.slice(0, 90)}"`;

  createNotification({
    type: 'chat',
    titleEn: cleanMedia ? '💬 New Photo/Video in Family Chat' : '💬 New Message in Family Chat',
    titleSi: cleanMedia ? '💬 පවුලේ කතාබහට නව ඡායාරූප/වීඩියෝවක්' : '💬 පවුලේ කතාබහට නව පණිවිඩයක්',
    bodyEn: previewEn,
    bodySi: previewSi,
    linkTab: 'chat',
    sourceClientId: clientId,
  });

  res.status(201).json({ message });
});

// ==========================================
// NOTIFICATIONS ROUTES
// ==========================================

app.get('/api/notifications', (req, res) => {
  const clientId = getClientId(req);
  const rows = db
    .prepare(`
      SELECT n.*, CASE WHEN nr.user_id IS NOT NULL THEN 1 ELSE 0 END as is_read
      FROM notifications n
      LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 40
    `)
    .all(clientId) as any[];

  res.json({
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      titleEn: r.title_en,
      titleSi: r.title_si,
      bodyEn: r.body_en,
      bodySi: r.body_si,
      linkTab: r.link_tab,
      createdAt: r.created_at,
      isRead: Boolean(r.is_read),
    })),
  });
});

app.post('/api/notifications/read-all', (req, res) => {
  const clientId = getClientId(req);
  const now = new Date().toISOString();
  const rows = db.prepare('SELECT id FROM notifications').all() as { id: string }[];

  const stmt = db.prepare(`
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(notification_id, user_id) DO NOTHING
  `);
  const tx = db.transaction(() => {
    for (const r of rows) {
      stmt.run(r.id, clientId, now);
    }
  });
  tx();
  res.json({ ok: true });
});

// ==========================================
// API & MULTER ERROR HANDLER
// ==========================================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api/') || err instanceof multer.MulterError) {
    const message =
      err?.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds maximum allowed size (45 MB).'
        : err?.message || 'Request failed';
    return res.status(typeof err?.status === 'number' ? err.status : 400).json({ error: message });
  }
  return next(err);
});

// ==========================================
// VITE DEV / PRODUCTION STATIC SERVING
// ==========================================

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: {
          server,
          path: '/__vite_ws',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`OUR FAMILIES server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
