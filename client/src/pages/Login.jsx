import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const d = await api.post(path, form);
      login(d.token, d.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => setForm({ ...form, email: 'arjun@demo.in', password: 'password' });

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="brand" style={{ marginBottom: 6 }}><span className="logo">🧭</span> TripPlanner</div>
        <p className="muted" style={{ marginTop: 0 }}>Plan domestic trips, split costs & stay together.</p>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="field">
              <label>Name</label>
              <input className="input" value={form.name} onChange={set('name')} placeholder="Your name" required />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required />
          </div>
          {err && <p style={{ color: '#fca5a5', fontSize: 13 }}>{err}</p>}
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="between" style={{ marginTop: 14 }}>
          <button className="btn ghost sm" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
          </button>
          <button className="btn ghost sm" onClick={fillDemo}>Use demo</button>
        </div>
      </div>
    </div>
  );
}
