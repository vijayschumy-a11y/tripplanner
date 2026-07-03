import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { weather, generatePlan } from '../lib/plan.js';

const router = Router();
router.use(requireAuth);

const isMember = (tripId, userId) =>
  db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId);

function daysBetween(start, end) {
  if (!start) return 2;
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  return Math.min(7, Math.max(1, Math.round((e - s) / 86400000) + 1));
}
function addDays(dateStr, n) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Weather for the trip's destination + dates
router.get('/weather/:tripId', async (req, res) => {
  if (!(await isMember(req.params.tripId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const trip = await db.prepare('SELECT lat, lng, start_date, end_date FROM trips WHERE id = ?').get(req.params.tripId);
  if (!trip || trip.lat == null) return res.status(400).json({ error: 'This trip has no pinned location' });
  try {
    res.json({ weather: await weather(trip.lat, trip.lng, trip.start_date, trip.end_date) });
  } catch (e) {
    res.status(502).json({ error: 'Weather lookup failed' });
  }
});

// Generate a full day-by-day plan (route + attractions + meals) with weather
router.post('/generate', async (req, res) => {
  const { tripId, startName, startLat, startLng } = req.body || {};
  if (!(await isMember(tripId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.lat == null) return res.status(400).json({ error: 'Set a pinned destination for this trip first (edit the trip location).' });

  const days = daysBetween(trip.start_date, trip.end_date);
  let result;
  try {
    result = await generatePlan({
      destLat: trip.lat, destLng: trip.lng, destName: trip.destination, days,
      startName: startName || null, startLat: startLat ?? null, startLng: startLng ?? null,
    });
  } catch (e) {
    console.error('plan/generate error:', e.stack || e.message);
    return res.status(502).json({ error: 'Could not build the plan (places provider busy) — try again.' });
  }

  let wx = [];
  try { wx = await weather(trip.lat, trip.lng, trip.start_date, trip.end_date); } catch { /* optional */ }

  result.plan.forEach((d, i) => {
    d.date = addDays(trip.start_date, i);
    d.label = d.date ? new Date(d.date).toDateString() : `Day ${i + 1}`;
    d.weather = d.date ? wx.find((w) => w.date === d.date) || null : null;
  });

  res.json({ ...result, destination: trip.destination });
});

export default router;
