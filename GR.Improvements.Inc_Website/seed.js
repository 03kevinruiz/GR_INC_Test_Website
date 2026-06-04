'use strict';
/**
 * seed.js — one-time import of existing brand_assets photos into the admin DB.
 * Run: node seed.js
 * Safe to re-run (checks for duplicates).
 */
const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

const ROOT      = __dirname;
const DB_DIR    = path.join(ROOT, 'db');
const UPLOADS   = path.join(ROOT, 'uploads');
const BRAND_DIR = path.join(ROOT, 'brand_assets');

fs.mkdirSync(DB_DIR,    { recursive: true });
fs.mkdirSync(UPLOADS,   { recursive: true });

const db = new Database(path.join(DB_DIR, 'gri.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema (idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    slug          TEXT    NOT NULL UNIQUE,
    description   TEXT    NOT NULL DEFAULT '',
    icon          TEXT    NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS projects (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id    INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    slug          TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    location      TEXT    NOT NULL DEFAULT '',
    cover_media_id INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS media (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename          TEXT    NOT NULL,
    original_filename TEXT    NOT NULL,
    mimetype          TEXT    NOT NULL,
    size              INTEGER NOT NULL DEFAULT 0,
    media_type        TEXT    NOT NULL CHECK(media_type IN ('photo','video')),
    display_order     INTEGER NOT NULL DEFAULT 0,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── 1. Ensure "Kitchen Remodeling" service exists ──────────────────────────
let svc = db.prepare("SELECT * FROM services WHERE slug='kitchen-remodeling'").get();
if (!svc) {
  const r = db.prepare(
    "INSERT INTO services (name,slug,description,icon,display_order) VALUES (?,?,?,?,?)"
  ).run('Kitchen Remodeling', 'kitchen-remodeling', 'Custom kitchen remodels in DC and Maryland.', '🍳', 1);
  svc = db.prepare('SELECT * FROM services WHERE id=?').get(r.lastInsertRowid);
  console.log(`Created service: ${svc.name} (id=${svc.id})`);
} else {
  console.log(`Service already exists: ${svc.name} (id=${svc.id})`);
}

// ── 2. Ensure Project 1 exists ─────────────────────────────────────────────
let proj = db.prepare("SELECT * FROM projects WHERE service_id=? AND slug='kitchen-remodel-northwest-dc'").get(svc.id);
if (!proj) {
  const r = db.prepare(
    "INSERT INTO projects (service_id,name,slug,description,location,display_order) VALUES (?,?,?,?,?,?)"
  ).run(svc.id, 'Kitchen Remodel — Northwest, Washington DC', 'kitchen-remodel-northwest-dc', '', 'Northwest, Washington DC', 1);
  proj = db.prepare('SELECT * FROM projects WHERE id=?').get(r.lastInsertRowid);
  console.log(`Created project: ${proj.name} (id=${proj.id})`);
} else {
  console.log(`Project already exists: ${proj.name} (id=${proj.id})`);
}

// ── 3. Import photos that were curated in kitchen-remodeling.html ──────────
// These are the 37 photos currently in the gallery array
const GALLERY_FILES = [
  'IMG_5820','IMG_5835','IMG_5836','IMG_5837','IMG_5839','IMG_5841','IMG_5842','IMG_5843',
  'IMG_5844','IMG_5845','IMG_5846','IMG_5849','IMG_5850','IMG_5851','IMG_5852','IMG_5866',
  'IMG_5867','IMG_5869','IMG_5870','IMG_5872','IMG_5873','IMG_5912','IMG_5913','IMG_5914',
  'IMG_5915','IMG_5916','IMG_5917','IMG_5918','IMG_5921','IMG_5922','IMG_5923','IMG_5924',
  'IMG_5925','IMG_5926','IMG_5927','IMG_5928','IMG_5929',
].map(n => `${n}.jpeg`);

const insertMedia = db.prepare(
  'INSERT INTO media (project_id,filename,original_filename,mimetype,size,media_type,display_order) VALUES (?,?,?,?,?,?,?)'
);

let imported = 0;
let skipped  = 0;

db.transaction(() => {
  GALLERY_FILES.forEach((fname, i) => {
    const srcPath  = path.join(BRAND_DIR, 'kitchen', 'project1', fname);
    const destPath = path.join(UPLOADS, fname);

    if (!fs.existsSync(srcPath)) {
      console.warn(`  SKIP (not found): ${fname}`);
      skipped++;
      return;
    }

    // Already imported?
    const existing = db.prepare('SELECT id FROM media WHERE project_id=? AND original_filename=?').get(proj.id, fname);
    if (existing) {
      console.log(`  SKIP (exists):    ${fname}`);
      skipped++;
      return;
    }

    // Symlink or copy into uploads/
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }

    const stat = fs.statSync(destPath);
    const r = insertMedia.run(proj.id, fname, fname, 'image/jpeg', stat.size, 'photo', i + 1);
    console.log(`  Imported: ${fname} (media id=${r.lastInsertRowid})`);
    imported++;
  });
})();

// ── 4. Set cover to IMG_5844 (the card cover photo) ───────────────────────
if (!proj.cover_media_id) {
  const cover = db.prepare("SELECT id FROM media WHERE project_id=? AND original_filename='IMG_5844.jpeg'").get(proj.id);
  if (cover) {
    db.prepare('UPDATE projects SET cover_media_id=? WHERE id=?').run(cover.id, proj.id);
    console.log(`Set cover photo to IMG_5844.jpeg (media id=${cover.id})`);
  }
}

console.log(`\nDone. Imported: ${imported}, Skipped: ${skipped}`);
console.log('Run "npm run admin" to start the admin server at http://localhost:3001/admin.html\n');
