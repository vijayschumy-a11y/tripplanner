import { Router } from 'express';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

// Guard: user must be a member of the trip
function isMember(tripId, userId) {
  return db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId);
}

function memberList(tripId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.avatar_color, m.role
       FROM trip_members m JOIN users u ON u.id = m.user_id
       WHERE m.trip_id = ? ORDER BY m.joined_at`
    )
    .all(tripId);
}

// ---- Trips ----
router.get('/', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM trip_members WHERE trip_id = t.id) AS member_count
       FROM trips t JOIN trip_members m ON m.trip_id = t.id
       WHERE m.user_id = ? ORDER BY t.created_at DESC`
    )
    .all(req.user.id);
  res.json({ trips: rows });
});

router.post('/', async (req, res) => {
  const { name, destination, lat, lng, start_date, end_date, budget, cover } = req.body || {};
  if (!name || !destination) return res.status(400).json({ error: 'name and destination required' });
  const id = nanoid();
  await db.prepare(
    `INSERT INTO trips (id, name, destination, lat, lng, start_date, end_date, budget, cover, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, destination, lat ?? null, lng ?? null, start_date ?? null, end_date ?? null, budget ?? 0, cover ?? null, req.user.id);
  await db.prepare('INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user.id, 'owner');
  res.json({ trip: await db.prepare('SELECT * FROM trips WHERE id = ?').get(id) });
});

router.get('/:id', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Not found' });
  res.json({ trip, members: await memberList(req.params.id) });
});

router.delete('/:id', async (req, res) => {
  const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Not found' });
  if (trip.owner_id !== req.user.id) return res.status(403).json({ error: 'Only owner can delete' });
  await db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Members ----
router.get('/:id/members', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  res.json({ members: await memberList(req.params.id) });
});

router.post('/:id/members', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const { email } = req.body || {};
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user) return res.status(404).json({ error: 'No user with that email' });
  await db.prepare('INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(
    req.params.id, user.id, 'member'
  );
  res.json({ members: await memberList(req.params.id) });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const trip = await db.prepare('SELECT owner_id FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Not found' });
  if (trip.owner_id !== req.user.id && req.user.id !== req.params.userId)
    return res.status(403).json({ error: 'Not allowed' });
  if (req.params.userId === trip.owner_id) return res.status(400).json({ error: 'Owner cannot leave' });
  await db.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ members: await memberList(req.params.id) });
});

// ---- Itinerary ----
router.get('/:id/itinerary', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const items = await db.prepare('SELECT * FROM itinerary WHERE trip_id = ? ORDER BY day, sort, time').all(req.params.id);
  res.json({ items });
});

router.post('/:id/itinerary', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const { day, time, title, note, lat, lng } = req.body || {};
  if (!day || !title) return res.status(400).json({ error: 'day and title required' });
  const id = nanoid();
  const max = await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM itinerary WHERE trip_id = ? AND day = ?').get(req.params.id, day);
  await db.prepare(
    'INSERT INTO itinerary (id, trip_id, day, time, title, note, lat, lng, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.id, day, time ?? null, title, note ?? null, lat ?? null, lng ?? null, Number(max.m) + 1);
  res.json({ item: await db.prepare('SELECT * FROM itinerary WHERE id = ?').get(id) });
});

router.patch('/:id/itinerary/:itemId', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const cur = await db.prepare('SELECT * FROM itinerary WHERE id = ? AND trip_id = ?').get(req.params.itemId, req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const { title, time, note, done } = req.body || {};
  await db.prepare('UPDATE itinerary SET title = ?, time = ?, note = ?, done = ? WHERE id = ?').run(
    title ?? cur.title, time ?? cur.time, note ?? cur.note, done ?? cur.done, cur.id
  );
  res.json({ item: await db.prepare('SELECT * FROM itinerary WHERE id = ?').get(cur.id) });
});

router.delete('/:id/itinerary/:itemId', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  await db.prepare('DELETE FROM itinerary WHERE id = ? AND trip_id = ?').run(req.params.itemId, req.params.id);
  res.json({ ok: true });
});

// ---- Saved places ----
router.get('/:id/places', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  res.json({ places: await db.prepare('SELECT * FROM saved_places WHERE trip_id = ? ORDER BY created_at DESC').all(req.params.id) });
});

router.post('/:id/places', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const { name, category, lat, lng, address } = req.body || {};
  if (!name || lat == null || lng == null) return res.status(400).json({ error: 'name, lat, lng required' });
  const id = nanoid();
  await db.prepare(
    'INSERT INTO saved_places (id, trip_id, name, category, lat, lng, address, saved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.id, name, category || 'general', lat, lng, address ?? null, req.user.id);
  res.json({ place: await db.prepare('SELECT * FROM saved_places WHERE id = ?').get(id) });
});

router.delete('/:id/places/:placeId', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  await db.prepare('DELETE FROM saved_places WHERE id = ? AND trip_id = ?').run(req.params.placeId, req.params.id);
  res.json({ ok: true });
});

// ---- Live locations (latest snapshot; realtime via socket.io) ----
router.get('/:id/locations', async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const rows = await db
    .prepare(
      `SELECT l.user_id, l.lat, l.lng, l.updated_at, u.name, u.avatar_color
       FROM locations l JOIN users u ON u.id = l.user_id WHERE l.trip_id = ?`
    )
    .all(req.params.id);
  res.json({ locations: rows });
});

export default router;
