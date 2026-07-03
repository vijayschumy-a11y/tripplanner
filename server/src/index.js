import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

import db from './db.js';
import { verifyToken } from './lib/auth.js';
import { seedIfEmpty } from './lib/seedData.js';
import authRoutes from './routes/auth.js';
import tripRoutes from './routes/trips.js';
import expenseRoutes from './routes/expenses.js';
import placeRoutes from './routes/places.js';
import planRoutes from './routes/plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Create tables (idempotent), then seed demo data if the DB is empty.
await db.init();
if (process.env.SEED_ON_BOOT !== 'false') {
  try {
    const r = await seedIfEmpty();
    if (r.seeded) console.log('  Seeded demo data (empty database).');
  } catch (e) {
    console.warn('  Seed skipped:', e.message);
  }
}

const app = express();
app.use(cors({ origin: [CLIENT_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/plan', planRoutes);

// Serve built client if present (production single-server mode)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const isMember = (tripId, userId) =>
  db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId);

// --- Realtime: live location sharing + trip chat ---
io.use((socket, next) => {
  const payload = verifyToken(socket.handshake.auth?.token);
  if (!payload) return next(new Error('unauthorized'));
  socket.user = payload;
  next();
});

io.on('connection', (socket) => {
  const user = socket.user;

  socket.on('trip:join', async (tripId) => {
    try {
      if (!(await isMember(tripId, user.id))) return;
      socket.join(tripId);
      const locs = await db
        .prepare(
          `SELECT l.user_id, l.lat, l.lng, l.updated_at, u.name, u.avatar_color
           FROM locations l JOIN users u ON u.id = l.user_id WHERE l.trip_id = ?`
        )
        .all(tripId);
      socket.emit('location:snapshot', locs);
      socket.to(tripId).emit('presence:online', { userId: user.id, name: user.name });
    } catch (e) {
      console.error('trip:join error', e.message);
    }
  });

  socket.on('location:update', async ({ tripId, lat, lng }) => {
    if (lat == null || lng == null) return;
    try {
      if (!(await isMember(tripId, user.id))) return;
      await db.prepare(
        `INSERT INTO locations (trip_id, user_id, lat, lng, updated_at) VALUES (?, ?, ?, ?, now())
         ON CONFLICT (trip_id, user_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = now()`
      ).run(tripId, user.id, lat, lng);
      io.to(tripId).emit('location:update', {
        userId: user.id, name: user.name, avatar_color: user.avatar_color, lat, lng, updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('location:update error', e.message);
    }
  });

  socket.on('meet:set', async ({ tripId, lat, lng, label }) => {
    if (lat == null || lng == null) return;
    try {
      if (!(await isMember(tripId, user.id))) return;
      await db.prepare('UPDATE trips SET meet_lat = ?, meet_lng = ?, meet_label = ? WHERE id = ?')
        .run(lat, lng, label || 'Meeting point', tripId);
      io.to(tripId).emit('meet:update', { lat, lng, label: label || 'Meeting point', by: user.name });
    } catch (e) { console.error('meet:set error', e.message); }
  });

  socket.on('meet:clear', async ({ tripId }) => {
    try {
      if (!(await isMember(tripId, user.id))) return;
      await db.prepare('UPDATE trips SET meet_lat = NULL, meet_lng = NULL, meet_label = NULL WHERE id = ?').run(tripId);
      io.to(tripId).emit('meet:update', { lat: null, lng: null, label: null, by: user.name });
    } catch (e) { console.error('meet:clear error', e.message); }
  });

  socket.on('chat:message', async ({ tripId, text }) => {
    if (!text || !text.trim()) return;
    try {
      if (!(await isMember(tripId, user.id))) return;
      const id = randomUUID();
      const at = new Date().toISOString();
      const clean = String(text).slice(0, 2000);
      await db.prepare('INSERT INTO messages (id, trip_id, user_id, name, text) VALUES (?, ?, ?, ?, ?)')
        .run(id, tripId, user.id, user.name, clean);
      io.to(tripId).emit('chat:message', { id, userId: user.id, name: user.name, text: clean, at });
    } catch (e) {
      console.error('chat:message error', e.message);
    }
  });

  socket.on('disconnect', () => {});
});

server.listen(PORT, () => {
  console.log(`\n  TripPlanner API + realtime running on http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});
