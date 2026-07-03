import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../App.jsx';

// Countdown hook for resend buttons (seconds remaining).
function useCooldown() {
  const [left, setLeft] = useState(0);
  const ref = useRef(null);
  const start = (s) => {
    setLeft(s);
    clearInterval(ref.current);
    ref.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) { clearInterval(ref.current); return 0; }
        return v - 1;
      });
    }, 1000);
  };
  useEffect(() => () => clearInterval(ref.current), []);
  return [left, start];
}

export default function Login() {
  const { login } = useAuth();
  const [screen, setScreen] = useState('auth'); // 'auth' | 'reset'
  const [method, setMethod] = useState('password'); // 'password' | 'phone'
  const [isRegister, setIsRegister] = useState(false);

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="brand" style={{ marginBottom: 6 }}><span className="logo">🧭</span> TripPlanner</div>
        <p className="muted" style={{ marginTop: 0 }}>Plan domestic trips, split costs & stay together.</p>

        {screen === 'reset' ? (
          <ResetForm onDone={login} onBack={() => setScreen('auth')} />
        ) : (
          <>
            <div className="chip-row" style={{ marginTop: 6 }}>
              <div className={`chip ${method === 'password' ? 'active' : ''}`} onClick={() => setMethod('password')}>✉️ Email &amp; password</div>
              <div className={`chip ${method === 'phone' ? 'active' : ''}`} onClick={() => setMethod('phone')}>📱 Phone OTP</div>
            </div>

            {method === 'password' ? (
              <PasswordForm isRegister={isRegister} onDone={login} />
            ) : (
              <PhoneForm isRegister={isRegister} onDone={login} />
            )}

            <div className="between" style={{ marginTop: 14 }}>
              <button className="btn ghost sm" onClick={() => setIsRegister((v) => !v)}>
                {isRegister ? 'Have an account? Sign in' : 'New here? Create account'}
              </button>
              {method === 'password' && !isRegister && (
                <button className="btn ghost sm" onClick={() => setScreen('reset')}>Forgot password?</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Err({ children }) {
  if (!children) return null;
  return <p style={{ color: '#fca5a5', fontSize: 13, margin: '4px 0' }}>{children}</p>;
}

function DemoBanner({ code }) {
  if (!code) return null;
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: 10, margin: '4px 0 12px', borderColor: 'var(--primary)' }}>
      <span style={{ fontSize: 13 }}>🔐 Demo mode — no SMS is sent. Your code is <strong style={{ letterSpacing: 2 }}>{code}</strong> (prefilled below).</span>
    </div>
  );
}

// ---------- Email + password ----------
function PasswordForm({ isRegister, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const d = await api.post(isRegister ? '/auth/register' : '/auth/login', form);
      onDone(d.token, d.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      {isRegister && (
        <div className="field"><label>Name</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Your name" required /></div>
      )}
      <div className="field"><label>Email</label>
        <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required /></div>
      <div className="field"><label>Password</label>
        <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required /></div>
      <Err>{err}</Err>
      <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
        {busy ? '…' : isRegister ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}

// ---------- Phone + OTP (register / login) ----------
function PhoneForm({ isRegister, onDone }) {
  const [step, setStep] = useState('enter'); // 'enter' | 'code'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const purpose = isRegister ? 'register' : 'login';

  const request = async (e) => {
    e?.preventDefault();
    if (isRegister && !name.trim()) return setErr('Enter your name');
    if (cooldown > 0) return;
    setErr(''); setBusy(true);
    try {
      const d = await api.post('/auth/otp/request', { phone, purpose });
      if (d.demo && d.code) { setDemoCode(d.code); setCode(d.code); }
      setStep('code');
      startCooldown(30);
    } catch (e) {
      setErr(e.message);
      const m = /wait (\d+)s/.exec(e.message);
      if (m) startCooldown(Number(m[1]));
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const d = await api.post('/auth/otp/verify', { phone, code, purpose, name });
      onDone(d.token, d.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (step === 'enter') {
    return (
      <form onSubmit={request}>
        {isRegister && (
          <div className="field"><label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
        )}
        <div className="field"><label>Mobile number</label>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" required /></div>
        <Err>{err}</Err>
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</button>
      </form>
    );
  }

  return (
    <form onSubmit={verify}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Code sent to {phone}. <button type="button" className="btn ghost sm" onClick={() => { setStep('enter'); setDemoCode(''); setCode(''); }}>change</button></p>
      <DemoBanner code={demoCode} />
      <div className="field"><label>Enter 6-digit code</label>
        <input className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="______" maxLength={6} required style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }} /></div>
      <Err>{err}</Err>
      <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Verifying…' : isRegister ? 'Verify & create account' : 'Verify & sign in'}</button>
      <button type="button" className="btn ghost sm" style={{ width: '100%', marginTop: 8 }} onClick={request} disabled={busy || cooldown > 0}>
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </button>
    </form>
  );
}

// ---------- Reset password (via phone OTP) ----------
function ResetForm({ onDone, onBack }) {
  const [step, setStep] = useState('enter');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useCooldown();

  const request = async (e) => {
    e?.preventDefault();
    if (cooldown > 0) return;
    setErr(''); setBusy(true);
    try {
      const d = await api.post('/auth/otp/request', { phone, purpose: 'reset' });
      if (d.demo && d.code) { setDemoCode(d.code); setCode(d.code); }
      setStep('code');
      startCooldown(30);
    } catch (e) {
      setErr(e.message);
      const m = /wait (\d+)s/.exec(e.message);
      if (m) startCooldown(Number(m[1]));
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const d = await api.post('/auth/otp/verify', { phone, code, password, purpose: 'reset' });
      onDone(d.token, d.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <strong>Reset password</strong>
        <button className="btn ghost sm" onClick={onBack}>← Back</button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>We'll send a code to your registered mobile number.</p>

      {step === 'enter' ? (
        <form onSubmit={request}>
          <div className="field"><label>Mobile number</label>
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" required /></div>
          <Err>{err}</Err>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Sending…' : 'Send reset code'}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <DemoBanner code={demoCode} />
          <div className="field"><label>Code</label>
            <input className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="______" maxLength={6} required style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }} /></div>
          <div className="field"><label>New password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" required /></div>
          <Err>{err}</Err>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Saving…' : 'Set new password & sign in'}</button>
          <button type="button" className="btn ghost sm" style={{ width: '100%', marginTop: 8 }} onClick={request} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </form>
      )}
    </div>
  );
}
