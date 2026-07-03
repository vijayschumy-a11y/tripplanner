import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { nearby, geocode, resolveMapLink } from '../lib/places.js';

const router = Router();
router.use(requireAuth);

// GET /api/places/nearby?category=food&lat=..&lng=..&radius=3000
router.get('/nearby', async (req, res) => {
  const { category = 'food', lat, lng, radius } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const results = await nearby(category, parseFloat(lat), parseFloat(lng), radius ? parseInt(radius) : 3000);
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach places provider', detail: String(e.message) });
  }
});

// GET /api/places/resolve?url=<google maps link>
router.get('/resolve', async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await resolveMapLink(String(req.query.url));
    if (!result) return res.status(422).json({ error: "Couldn't read that link. In Google Maps, use Share → Copy link (a maps.app.goo.gl link)." });
    res.json({ result });
  } catch (e) {
    res.status(502).json({ error: 'Could not resolve the link' });
  }
});

// GET /api/places/geocode?q=Ooty
router.get('/geocode', async (req, res) => {
  if (!req.query.q) return res.status(400).json({ error: 'q required' });
  try {
    res.json({ results: await geocode(req.query.q) });
  } catch (e) {
    res.status(502).json({ error: 'Geocoding failed', detail: String(e.message) });
  }
});

export default router;
