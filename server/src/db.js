import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\n  DATABASE_URL is not set. Point it at a Postgres instance.');
  console.error('  Local dev example:');
  console.error('    DATABASE_URL=postgres://user:pass@localhost:5432/tripplanner\n');
  process.exit(1);
}

// SSL is required for external/hosted Postgres (host has a domain), not for
// Render's in-region internal host (single-label) or localhost.
function needsSsl(cs) {
  try {
    const host = new URL(cs).hostname;
    return host.includes('.') && host !== 'localhost';
  } catch {
    return /sslmode=require/.test(cs);
  }
}

const pool = new Pool({
  connectionString,
  ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : false,
  max: 10,
});

pool.on('error', (err) => console.error('Postgres pool error:', err.message));

// Convert better-sqlite3-style `?` placeholders to Postgres `$1, $2, ...`
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + ++i);
}

function wrap(runner) {
  return (sql) => {
    const text = toPg(sql);
    return {
      get: async (...params) => (await runner(text, params)).rows[0],
      all: async (...params) => (await runner(text, params)).rows,
      run: async (...params) => {
        const r = await runner(text, params);
        return { rowCount: r.rowCount, rows: r.rows };
      },
    };
  };
}

// db.prepare(sql).get(...params) — mirrors the old sync API, now async.
const prepare = wrap((text, params) => pool.query(text, params));

// Run a set of statements atomically on one connection.
async function tx(fn) {
  const client = await pool.connect();
  const cprepare = wrap((text, params) => client.query(text, params));
  try {
    await client.query('BEGIN');
    const result = await fn({ prepare: cprepare });
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#2563eb',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trips (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  start_date  TEXT,
  end_date    TEXT,
  budget      DOUBLE PRECISION DEFAULT 0,
  cover       TEXT,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trip_members (
  trip_id   TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  amount      DOUBLE PRECISION NOT NULL,
  paid_by     TEXT NOT NULL REFERENCES users(id),
  split_type  TEXT NOT NULL DEFAULT 'equal',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share      DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (expense_id, user_id)
);
CREATE TABLE IF NOT EXISTS itinerary (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  time       TEXT,
  title      TEXT NOT NULL,
  note       TEXT,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  done       INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS saved_places (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  address    TEXT,
  saved_by   TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS locations (
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL DEFAULT 'personal',  -- 'personal' (private) | 'team' (shared)
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  done_by    TEXT REFERENCES users(id),
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phone + OTP support (idempotent migrations for existing databases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx ON users(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS otp_codes (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  purpose    TEXT NOT NULL,        -- 'register' | 'login' | 'reset'
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_phone_purpose_idx ON otp_codes(phone, purpose);

-- Advances / kitty: a collector gathers a fixed amount per person up front.
CREATE TABLE IF NOT EXISTS advances (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  collector_id TEXT NOT NULL REFERENCES users(id),
  per_person   DOUBLE PRECISION NOT NULL,
  category     TEXT NOT NULL DEFAULT 'general',
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS advance_participants (
  advance_id TEXT NOT NULL REFERENCES advances(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (advance_id, user_id)
);

-- Shareable invite links (WhatsApp / copy link)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS invite_code TEXT;
UPDATE trips SET invite_code = substr(md5(random()::text || id), 1, 10) WHERE invite_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trips_invite_code_uidx ON trips(invite_code) WHERE invite_code IS NOT NULL;

-- Profile photo (small base64 data URL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Shared meeting point (rendezvous) for the trip
ALTER TABLE trips ADD COLUMN IF NOT EXISTS meet_lat DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS meet_lng DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS meet_label TEXT;

-- Persistent trip chat
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_trip_idx ON messages(trip_id, created_at);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';
`;

async function init() {
  await pool.query(SCHEMA);
}

export default { prepare, tx, init, pool };
