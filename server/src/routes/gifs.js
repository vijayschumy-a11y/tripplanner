import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/gifs?q=tamil comedy&type=gifs|stickers
router.get('/', async (req, res) => {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return res.json({ configured: false, results: [] });
  const q = (req.query.q || 'tamil comedy').toString();
  const type = req.query.type === 'stickers' ? 'stickers' : 'gifs';
  try {
    const url = `https://api.giphy.com/v1/${type}/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13&bundle=fixed_height_small`;
    const r = await fetch(url);
    const d = await r.json();
    const results = (d.data || [])
      .map((g) => g.images?.fixed_height_small?.url || g.images?.downsized?.url || g.images?.original?.url)
      .filter(Boolean)
      .map((u) => ({ url: u }));
    res.json({ configured: true, results });
  } catch (e) {
    res.status(502).json({ configured: true, results: [], error: 'GIF search failed' });
  }
});

export default router;
