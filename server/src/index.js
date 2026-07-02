import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

import db from './db.js';
import { verifyToken } from './lib/auth.js';
import { seedIfEmpty } from './lib/seedData.js';
import authRoutes from './routes/auth.js';
import tripRoutes from './routes/trips.js';
import expenseRoutes from './routes/expenses.js';
import placeRoutes from './routes/places.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Ensure the app is usable immediately after a fresh/ephemeral deploy.
if (process.env.SEED_ON_BOOT !== 'false') {
  try {
    const r = seedIfEmpty();
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

// --- Realtime: live location sharing + trip chat ---
io.use((socket, next) => {
  const payload = verifyToken(socket.handshake.auth?.token);
  if (!payload) return next(new Error('unauthorized'));
  socket.user = payload;
  next();
});

io.on('connection', (socket) => {
  const user = socket.user;

  socket.on('trip:join', (tripId) => {
    const member = db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, user.id);
    if (!member) return;
    socket.join(tripId);
    // send current locations snapshot to the newcomer
    const locs = db
      .prepare(
        `SELECT l.user_id, l.lat, l.lng, l.updated_at, u.name, u.avatar_color
         FROM locations l JOIN users u ON u.id = l.user_id WHERE l.trip_id = ?`
      )
      .all(tripId);
    socket.emit('location:snapshot', locs);
    socket.to(tripId).emit('presence:online', { userId: user.id, name: user.name });
  });

  socket.on('location:update', ({ tripId, lat, lng }) => {
    if (lat == null || lng == null) return;
    const member = db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, user.id);
    if (!member) return;
    db.prepare(
      `INSERT INTO locations (trip_id, user_id, lat, lng, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(trip_id, user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, updated_at = datetime('now')`
    ).run(tripId, user.id, lat, lng);
    io.to(tripId).emit('location:update', {
      userId: user.id, name: user.name, avatar_color: user.avatar_color, lat, lng, updated_at: new Date().toISOString(),
    });
  });

  socket.on('chat:message', ({ tripId, text }) => {
    if (!text) return;
    const member = db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, user.id);
    if (!member) return;
    io.to(tripId).emit('chat:message', {
      userId: user.id, name: user.name, text, at: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {});
});

server.listen(PORT, () => {
  console.log(`\n  TripPlanner API + realtime running on http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});
