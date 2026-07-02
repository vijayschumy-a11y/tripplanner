import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { signToken, requireAuth } from '../lib/auth.js';

const router = Router();

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });

  const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const id = nanoid();
  const hash = bcrypt.hashSync(password, 10);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  await db.prepare(
    'INSERT INTO users (id, name, email, password, avatar_color) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, email.toLowerCase(), hash, color);

  const user = { id, name, email: email.toLowerCase(), avatar_color: color };
  res.json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!row || !bcrypt.compareSync(password || '', row.password))
    return res.status(401).json({ error: 'Invalid email or password' });

  const user = { id: row.id, name: row.name, email: row.email, avatar_color: row.avatar_color };
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: row });
});

// Directory search to add people to a trip
router.get('/users', requireAuth, async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const rows = await db
    .prepare(
      'SELECT id, name, email, avatar_color FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? LIMIT 10'
    )
    .all(q, q);
  res.json({ users: rows });
});

export default router;
