import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { vapidPublicKey, saveSubscription, pushEnabled } from '../lib/push.js';

const router = Router();

// Public VAPID key so the client can subscribe
router.get('/vapid', (_req, res) => res.json({ key: vapidPublicKey(), enabled: pushEnabled() }));

// Store a browser push subscription for the current user
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    await saveSubscription(req.user.id, req.body?.subscription);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Could not save subscription' });
  }
});

export default router;
