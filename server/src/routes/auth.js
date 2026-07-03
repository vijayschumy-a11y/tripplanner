import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { signToken, requireAuth } from '../lib/auth.js';
import { sendOtp, isDemo } from '../lib/sms.js';

const router = Router();

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

const normalizePhone = (p) => (p || '').replace(/\D/g, '');
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, avatar_color: u.avatar_color });

// ---------- Email + password ----------
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });

  const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const id = nanoid();
  const hash = bcrypt.hashSync(password, 10);
  const color = randomColor();
  await db.prepare('INSERT INTO users (id, name, email, password, avatar_color) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, email.toLowerCase(), hash, color);

  const user = { id, name, email: email.toLowerCase(), phone: null, avatar_color: color };
  res.json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!row) return res.status(401).json({ error: 'Invalid email or password' });
  if (!row.password) return res.status(400).json({ error: 'This account uses phone login. Sign in with your phone number.' });
  if (!bcrypt.compareSync(password || '', row.password))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: signToken(publicUser(row)), user: publicUser(row) });
});

// ---------- Phone + OTP ----------
// POST /auth/otp/request { phone, purpose: 'register'|'login'|'reset' }
router.post('/otp/request', async (req, res) => {
  const purpose = ['register', 'login', 'reset'].includes(req.body?.purpose) ? req.body.purpose : 'login';
  const phone = normalizePhone(req.body?.phone);
  if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error: 'Enter a valid phone number' });

  const existing = await db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (purpose === 'register' && existing)
    return res.status(409).json({ error: 'That number is already registered — try signing in instead' });
  if ((purpose === 'login' || purpose === 'reset') && !existing)
    return res.status(404).json({ error: 'No account with that number — please register first' });

  // Rate limit: one code per 30s per phone+purpose
  const last = await db
    .prepare('SELECT created_at FROM otp_codes WHERE phone = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1')
    .get(phone, purpose);
  if (last) {
    const age = (Date.now() - new Date(last.created_at).getTime()) / 1000;
    if (age < 30) return res.status(429).json({ error: `Please wait ${Math.ceil(30 - age)}s before requesting another code` });
  }

  const code = genCode();
  await db.prepare('DELETE FROM otp_codes WHERE phone = ? AND purpose = ?').run(phone, purpose);
  await db
    .prepare("INSERT INTO otp_codes (id, phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?, now() + interval '10 minutes')")
    .run(nanoid(), phone, bcrypt.hashSync(code, 8), purpose);

  try {
    await sendOtp(phone, code, `${code} is your TripPlanner verification code. Valid for 10 minutes.`);
  } catch (e) {
    return res.status(502).json({ error: 'Could not send the code: ' + e.message });
  }
  // In demo mode we return the code so the UI can display it (no real SMS provider configured).
  res.json({ ok: true, demo: isDemo(), ...(isDemo() ? { code } : {}) });
});

// POST /auth/otp/verify { phone, code, purpose, name?, email?, password? }
router.post('/otp/verify', async (req, res) => {
  const purpose = ['register', 'login', 'reset'].includes(req.body?.purpose) ? req.body.purpose : 'login';
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!phone || !code) return res.status(400).json({ error: 'phone and code required' });

  const row = await db
    .prepare('SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1')
    .get(phone, purpose);
  if (!row) return res.status(400).json({ error: 'Request a code first' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM otp_codes WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'Code expired — request a new one' });
  }
  if (row.attempts >= 5) {
    await db.prepare('DELETE FROM otp_codes WHERE id = ?').run(row.id);
    return res.status(429).json({ error: 'Too many attempts — request a new code' });
  }
  if (!bcrypt.compareSync(code, row.code_hash)) {
    await db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return res.status(401).json({ error: 'Incorrect code' });
  }
  await db.prepare('DELETE FROM otp_codes WHERE id = ?').run(row.id); // consume

  if (purpose === 'register') {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (await db.prepare('SELECT id FROM users WHERE phone = ?').get(phone))
      return res.status(409).json({ error: 'That number is already registered' });
    const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : null;
    if (email && (await db.prepare('SELECT id FROM users WHERE email = ?').get(email)))
      return res.status(409).json({ error: 'Email already registered' });
    const password = req.body?.password ? bcrypt.hashSync(req.body.password, 10) : null;
    const id = nanoid();
    const color = randomColor();
    await db.prepare('INSERT INTO users (id, name, email, phone, password, avatar_color) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, email, phone, password, color);
    const user = { id, name, email, phone, avatar_color: color };
    return res.json({ token: signToken(user), user });
  }

  const u = await db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!u) return res.status(404).json({ error: 'No account with that number' });

  if (purpose === 'reset') {
    const password = req.body?.password;
    if (!password || String(password).length < 4) return res.status(400).json({ error: 'Enter a new password (min 4 characters)' });
    await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), u.id);
  }
  res.json({ token: signToken(publicUser(u)), user: publicUser(u) });
});

// ---------- Session / directory ----------
router.get('/me', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT id, name, email, phone, avatar_color FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: row });
});

router.get('/users', requireAuth, async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const rows = await db
    .prepare('SELECT id, name, email, avatar_color FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? LIMIT 10')
    .all(q, q);
  res.json({ users: rows });
});

export default router;
