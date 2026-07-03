import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../App.jsx';

export default function JoinTrip() {
  const { code } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/trips/invite/${code}`).then(setInfo).catch(() => setErr('This invite link is invalid or expired.'));
  }, [code]);

  // Once signed in, join automatically and go to the trip.
  useEffect(() => {
    if (user && code) {
      api.post(`/trips/join/${code}`)
        .then((d) => { localStorage.removeItem('tp_join'); nav(`/trip/${d.trip.id}`); })
        .catch((e) => setErr(e.message));
    }
  }, [user, code]);

  if (err) {
    return (
      <div className="auth-wrap"><div className="auth-card card">
        <div className="brand"><span className="logo">🧭</span> TripPlanner</div>
        <p className="muted">{err}</p>
        <button className="btn" onClick={() => nav('/')}>Go home</button>
      </div></div>
    );
  }

  if (!user) {
    localStorage.setItem('tp_join', code);
    return (
      <div className="auth-wrap"><div className="auth-card card">
        <div className="brand" style={{ marginBottom: 8 }}><span className="logo">🧭</span> TripPlanner</div>
        <h2 style={{ margin: '0 0 4px' }}>You're invited{info?.trip ? ` to “${info.trip.name}”` : ''} 🎉</h2>
        {info?.trip && <p className="muted" style={{ marginTop: 0 }}>📍 {info.trip.destination}</p>}
        <p className="muted">Sign in or create a free account to join the trip — you'll be added automatically.</p>
        <button className="btn primary" style={{ width: '100%' }} onClick={() => nav('/login')}>Continue</button>
      </div></div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="spinner" /> <span className="muted">Joining{info?.trip ? ` “${info.trip.name}”` : ''}…</span>
      </div>
    </div>
  );
}
