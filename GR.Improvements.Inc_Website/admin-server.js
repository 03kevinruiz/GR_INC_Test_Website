'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const app  = express();
const PORT = 3001;
const ROOT = __dirname;

// ── Directories ────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DB_DIR      = path.join(ROOT, 'db');
[UPLOADS_DIR, DB_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Database ───────────────────────────────────────────────────────────────
const db = new Database(path.join(DB_DIR, 'gri.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

// ── Multer ─────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, name);
  },
});

const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
  'video/mp4','video/quicktime','video/webm','video/x-msvideo',
]);

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME.has(file.mimetype)),
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(ROOT));           // serves admin.html, brand_assets, etc.

// ── Helpers ────────────────────────────────────────────────────────────────
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const maxOrder = (table, where, val) =>
  db.prepare(`SELECT COALESCE(MAX(display_order),0) AS m FROM ${table} WHERE ${where} = ?`).get(val).m;

// ═══════════════════════════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/services', (_req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY display_order, id').all());
});

app.post('/api/services', (req, res) => {
  const { name, description = '', icon = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const slug = slugify(name);
  const order = maxOrder('services', '1', 1) + 1;
  try {
    const r = db.prepare(
      'INSERT INTO services (name,slug,description,icon,display_order) VALUES (?,?,?,?,?)'
    ).run(name.trim(), slug, description, icon, order);
    res.status(201).json(db.prepare('SELECT * FROM services WHERE id=?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(409).json({ error: 'Slug conflict — try a different name' });
  }
});

app.put('/api/services/:id', (req, res) => {
  const svc = db.prepare('SELECT * FROM services WHERE id=?').get(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Not found' });
  const { name = svc.name, description = svc.description, icon = svc.icon, display_order = svc.display_order } = req.body;
  db.prepare('UPDATE services SET name=?,description=?,icon=?,display_order=? WHERE id=?')
    .run(name, description, icon, display_order, req.params.id);
  res.json(db.prepare('SELECT * FROM services WHERE id=?').get(req.params.id));
});

app.delete('/api/services/:id', (req, res) => {
  const projects = db.prepare('SELECT id FROM projects WHERE service_id=?').all(req.params.id);
  projects.forEach(p => deleteProjectFiles(p.id));
  db.prepare('DELETE FROM services WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/services/:serviceId/projects', (req, res) => {
  const rows = db.prepare(
    'SELECT p.*, (SELECT COUNT(*) FROM media WHERE project_id=p.id) AS media_count FROM projects p WHERE p.service_id=? ORDER BY p.display_order, p.id'
  ).all(req.params.serviceId);
  res.json(rows);
});

app.get('/api/projects/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

app.post('/api/services/:serviceId/projects', (req, res) => {
  const { name, description = '', location = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const slug  = slugify(name);
  const order = maxOrder('projects', 'service_id', req.params.serviceId) + 1;
  const r = db.prepare(
    'INSERT INTO projects (service_id,name,slug,description,location,display_order) VALUES (?,?,?,?,?,?)'
  ).run(req.params.serviceId, name.trim(), slug, description, location, order);
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/projects/:id', (req, res) => {
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  const {
    name = proj.name, description = proj.description, location = proj.location,
    cover_media_id = proj.cover_media_id, display_order = proj.display_order,
  } = req.body;
  db.prepare('UPDATE projects SET name=?,description=?,location=?,cover_media_id=?,display_order=? WHERE id=?')
    .run(name, description, location, cover_media_id, display_order, req.params.id);
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id));
});

app.delete('/api/projects/:id', (req, res) => {
  deleteProjectFiles(req.params.id);
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/projects/:id/media', (req, res) => {
  res.json(db.prepare('SELECT * FROM media WHERE project_id=? ORDER BY display_order, id').all(req.params.id));
});

app.post('/api/projects/:id/media', upload.array('files', 500), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  const base  = maxOrder('media', 'project_id', req.params.id);
  const stmt  = db.prepare(
    'INSERT INTO media (project_id,filename,original_filename,mimetype,size,media_type,display_order) VALUES (?,?,?,?,?,?,?)'
  );
  const inserted = db.transaction(() =>
    req.files.map((f, i) => {
      const mtype = f.mimetype.startsWith('video/') ? 'video' : 'photo';
      const r = stmt.run(req.params.id, f.filename, f.originalname, f.mimetype, f.size, mtype, base + i + 1);
      return db.prepare('SELECT * FROM media WHERE id=?').get(r.lastInsertRowid);
    })
  )();

  // Auto-assign cover if project has none
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!proj.cover_media_id) {
    const firstPhoto = inserted.find(m => m.media_type === 'photo') || inserted[0];
    db.prepare('UPDATE projects SET cover_media_id=? WHERE id=?').run(firstPhoto.id, req.params.id);
  }

  res.status(201).json(inserted);
});

app.post('/api/projects/:id/media/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array of ids' });
  const stmt = db.prepare('UPDATE media SET display_order=? WHERE id=? AND project_id=?');
  db.transaction(() => order.forEach((id, i) => stmt.run(i + 1, id, req.params.id)))();
  res.json({ ok: true });
});

app.put('/api/media/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (req.body.display_order !== undefined) {
    db.prepare('UPDATE media SET display_order=? WHERE id=?').run(req.body.display_order, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id));
});

app.delete('/api/media/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  deleteFile(m.filename);
  db.prepare('UPDATE projects SET cover_media_id=NULL WHERE cover_media_id=?').run(m.id);
  db.prepare('DELETE FROM media WHERE id=?').run(m.id);
  res.json({ ok: true });
});

// ── File cleanup helpers ───────────────────────────────────────────────────
function deleteFile(filename) {
  const fp = path.join(UPLOADS_DIR, filename);
  try { fs.unlinkSync(fp); } catch (_) {}
}

function deleteProjectFiles(projectId) {
  const rows = db.prepare('SELECT filename FROM media WHERE project_id=?').all(projectId);
  rows.forEach(r => deleteFile(r.filename));
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ GR Admin  →  http://localhost:${PORT}/admin.html\n`);
});
