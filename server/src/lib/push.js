// Web push notifications via VAPID. Inert (no-op) until VAPID keys are set.
import webpush from 'web-push';
import db from '../db.js';

const PUBLIC = process.env.VAPID_PUBLIC;
const PRIVATE = process.env.VAPID_PRIVATE;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:trips@tripplanner.app';
const enabled = !!(PUBLIC && PRIVATE);
if (enabled) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

export const pushEnabled = () => enabled;
export const vapidPublicKey = () => PUBLIC || null;

export async function saveSubscription(userId, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return;
  await db.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth);
}

// Fire-and-forget push to a set of users. Cleans up dead subscriptions.
export async function pushToUsers(userIds, payload) {
  if (!enabled || !userIds?.length) return;
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const subs = await db
    .prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY(?)`)
    .all(ids);
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint).catch(() => {});
      }
    }
  }));
}
