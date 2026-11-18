import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const uploadsDir = path.resolve(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const UPLOADS_DIR = uploadsDir;
export const db = new Database(path.resolve(dataDir, 'our_families.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS site_settings (
    id TEXT PRIMARY KEY,
    hero_photo_url TEXT NOT NULL,
    welcome_en TEXT NOT NULL,
    welcome_si TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member',
    family_id TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    can_upload_photos INTEGER NOT NULL DEFAULT 1,
    bio TEXT NOT NULL DEFAULT '',
    birthday TEXT NOT NULL DEFAULT '',
    reset_code TEXT DEFAULT NULL,
    reset_expires_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL,
    name_en TEXT NOT NULL,
    name_si TEXT NOT NULL,
    description_en TEXT NOT NULL DEFAULT '',
    description_si TEXT NOT NULL DEFAULT '',
    cover_photo_url TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS family_members (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    birthday TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS birthdays (
    id TEXT PRIMARY KEY,
    family_id TEXT DEFAULT NULL REFERENCES families(id) ON DELETE SET NULL,
    member_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    photo_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS birthday_wishes (
    id TEXT PRIMARY KEY,
    target_key TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_avatar TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    family_id TEXT DEFAULT NULL REFERENCES families(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    destination TEXT NOT NULL,
    trip_date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    media_json TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    family_id TEXT DEFAULT NULL REFERENCES families(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'celebration',
    title TEXT NOT NULL,
    event_date TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    media_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'approved',
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    family_id TEXT DEFAULT NULL REFERENCES families(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    moment_date TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'gallery',
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    uploaded_by TEXT NOT NULL,
    uploaded_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_likes (
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (target_type, target_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    family_id TEXT DEFAULT NULL REFERENCES families(id) ON DELETE SET NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_avatar TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '',
    media_type TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_read_state (
    user_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    last_read_at TEXT NOT NULL,
    PRIMARY KEY (user_id, room_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    target_role TEXT DEFAULT NULL,
    target_user_id TEXT DEFAULT NULL,
    type TEXT NOT NULL,
    title_en TEXT NOT NULL,
    title_si TEXT NOT NULL,
    body_en TEXT NOT NULL,
    body_si TEXT NOT NULL,
    link_tab TEXT NOT NULL DEFAULT 'home',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    read_at TEXT NOT NULL,
    PRIMARY KEY (notification_id, user_id)
  );
`);

// Safe migrations for existing DBs
try {
  db.exec(`ALTER TABLE gallery_items ADD COLUMN location TEXT NOT NULL DEFAULT ''`);
} catch {
  // column already exists
}
try {
  db.exec(`ALTER TABLE birthday_wishes ADD COLUMN author_avatars_json TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // column already exists
}
try {
  db.exec(`ALTER TABLE chat_messages ADD COLUMN sender_avatars_json TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // column already exists
}

// Seed site settings if empty
const existingSettings = db.prepare('SELECT id FROM site_settings WHERE id = ?').get('main');
if (!existingSettings) {
  db.prepare(`
    INSERT INTO site_settings (id, hero_photo_url, welcome_en, welcome_si, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'main',
    '/src/assets/images/hero_family_gathering_1794925789784.jpg',
    'Welcome to OUR FAMILIES — a shared home for our eight families to preserve memories, celebrate milestones, share journeys, and stay close across every generation.',
    'අපේ පවුල් වෙත සාදරයෙන් පිළිගනිමු — අපගේ පවුල් අටේ සුන්දර මතකයන් සුරැකීමට, උපන්දින හා විශේෂ අවස්ථා සැමරීමට, සංචාර බෙදා ගැනීමට සහ සැමදා සමීපව සිටීමට තැනූ පොදු නිවහනයි.',
    new Date().toISOString()
  );
}

// Seed 8 empty family cards ONLY if families table is empty
const familyCountRow = db.prepare('SELECT COUNT(*) as cnt FROM families').get() as { cnt: number };
if (familyCountRow.cnt === 0) {
  const insertFamily = db.prepare(`
    INSERT INTO families (id, sort_order, name_en, name_si, description_en, description_si, cover_photo_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (let i = 1; i <= 8; i++) {
      insertFamily.run(
        `family-${i}`,
        i,
        `Family ${i}`,
        `පවුල ${i}`,
        '',
        '',
        '',
        now
      );
    }
  });
  tx();
}
