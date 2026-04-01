'use strict';
const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');

// DB_PATH z env premennej (pre Docker: /data/storms.db)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'storms.db');
let db, SQL;

function getDb() { return db; }

async function initDb() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // Zaistí existenciu adresára pre DB
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('📂 Načítaná existujúca DB:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('🆕 Vytvorená nová DB:', DB_PATH);
  }

  createSchema();
  ensureUsers();
  saveDb();
  console.log('✅ Database ready:', DB_PATH);
}

function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function createSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL,
    store      TEXT,
    mfa_secret TEXT,
    mfa_enabled INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS zakazky (
    id             TEXT PRIMARY KEY,
    obchod         TEXT NOT NULL,
    dopyt_d        TEXT, obhliadka_d TEXT, ponuka_d TEXT, objednavka_d TEXT,
    zakaznik       TEXT NOT NULL, typ_zak TEXT, lokalita TEXT, stav TEXT,
    zdroj TEXT, vysledok TEXT, typ_prod TEXT, typ_riesenia TEXT, model TEXT,
    cena_krb       REAL DEFAULT 0, nakup_krb      REAL DEFAULT 0,
    cena_komin     REAL DEFAULT 0, nakup_komin    REAL DEFAULT 0,
    cena_montaz    REAL DEFAULT 0, naklad_montaz  REAL DEFAULT 0,
    cena_prislus   REAL DEFAULT 0, nakup_prislus  REAL DEFAULT 0,
    doprava_fakt   REAL DEFAULT 0, naklad_doprava REAL DEFAULT 0,
    zlava          REAL DEFAULT 0, poznamka TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS servis (
    id          TEXT PRIMARY KEY,
    obchod      TEXT NOT NULL,
    datum       TEXT, technik TEXT, zakaznik TEXT NOT NULL,
    typ TEXT, zaruka TEXT,
    fakturovane REAL DEFAULT 0, naklad REAL DEFAULT 0, cas REAL DEFAULT 0,
    poznamka    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fotky (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   TEXT NOT NULL,
    typ         TEXT NOT NULL,
    nazov       TEXT,
    mime_type   TEXT DEFAULT 'image/jpeg',
    data_b64    TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);

  // Migrácie pre existujúce DB
  try { db.run("ALTER TABLE fotky ADD COLUMN mime_type TEXT DEFAULT 'image/jpeg'"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN mfa_secret TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0"); } catch(e) {}
}

function ensureUsers() {
  const USERS = [
    { username: 'veduci_ke', password: 'ke2025',     role: 'store', store: 'Obchod KE' },
    { username: 'veduci_sl', password: 'sl2025',     role: 'store', store: 'Obchod SL' },
    { username: 'veduci_ba', password: 'ba2025',     role: 'store', store: 'Obchod BA' },
    { username: 'veduci_cz', password: 'cz2025',     role: 'store', store: 'Obchod CZ' },
    { username: 'veduci_vo', password: 'vo2025',     role: 'store', store: 'V.O.'      },
    { username: 'majitel',   password: 'storms2025', role: 'owner', store: null        },
    { username: 'admin',     password: 'admin2025',  role: 'admin', store: null        },
  ];

  for (const u of USERS) {
    const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
    stmt.bind([u.username]);
    const exists = stmt.step();
    stmt.free();
    if (!exists) {
      db.run('INSERT INTO users (username, password, role, store) VALUES (?, ?, ?, ?)',
        [u.username, bcrypt.hashSync(u.password, 10), u.role, u.store]);
      console.log(`  + Vytvorený používateľ: ${u.username}`);
    }
  }
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) { return query(sql, params)[0] || null; }

function queryCount(sql, params = []) {
  const row = queryOne(sql, params);
  return row ? (row.c || 0) : 0;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  const row = queryOne('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: row?.id, changes: db.getRowsModified() };
}

module.exports = { getDb, initDb, saveDb, query, queryOne, queryCount, run };
