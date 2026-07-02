import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Modal, useToast, rupee } from '../lib/ui.jsx';

const EMOJIS = ['🏔️', '🏖️', '🏕️', '🛕', '🌆', '🌴', '🚞', '🕌'];

export default function Trips() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const nav = useNavigate();

  const load = () => api.get('/trips').then((d) => setTrips(d.trips)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  return (
    <div className="container">
      <div className="between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="h-title">Your trips</h1>
          <p className="muted" style={{ margin: 0 }}>{trips.length} trip{trips.length !== 1 ? 's' : ''} planned</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New trip</button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : trips.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 44 }}>🗺️</div>
          <h3>No trips yet</h3>
          <p className="muted">Create your first trip and invite your travel crew.</p>
          <button className="btn primary" onClick={() => setShowNew(true)}>Plan a trip</button>
        </div>
      ) : (
        <div className="grid-trips">
          {trips.map((t, i) => (
            <div key={t.id} className="card trip-card" onClick={() => nav(`/trip/${t.id}`)}>
              <div className="trip-cover">{EMOJIS[i % EMOJIS.length]}</div>
              <div className="body">
                <div className="between">
                  <strong>{t.name}</strong>
                  <span className="pill">{t.member_count} 👤</span>
                </div>
                <p className="muted" style={{ margin: '6px 0' }}>📍 {t.destination}</p>
                <div className="between">
                  <span className="muted" style={{ fontSize: 13 }}>
                    {t.start_date ? `${t.start_date} → ${t.end_date || '…'}` : 'Dates TBD'}
                  </span>
                  {t.budget > 0 && <span className="pill">{rupee(t.budget)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewTrip onClose={() => setShowNew(false)} onCreated={(id) => nav(`/trip/${id}`)} />}
    </div>
  );
}

function NewTrip({ onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', destination: '', start_date: '', end_date: '', budget: '' });
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const search = async () => {
    if (!form.destination) return;
    setSearching(true);
    try {
      const d = await api.get(`/places/geocode?q=${encodeURIComponent(form.destination)}`);
      setResults(d.results);
    } catch { toast('Search failed'); }
    finally { setSearching(false); }
  };

  const create = async () => {
    if (!form.name || !form.destination) return toast('Name and destination required');
    setBusy(true);
    try {
      const d = await api.post('/trips', {
        name: form.name,
        destination: picked ? picked.name.split(',').slice(0, 2).join(',') : form.destination,
        lat: picked?.lat, lng: picked?.lng,
        start_date: form.start_date || null, end_date: form.end_date || null,
        budget: Number(form.budget) || 0,
      });
      onCreated(d.trip.id);
    } catch (e) { toast(e.message); setBusy(false); }
  };

  return (
    <Modal title="Plan a new trip" onClose={onClose}>
      <div className="field">
        <label>Trip name</label>
        <input className="input" value={form.name} onChange={set('name')} placeholder="Goa with college gang" />
      </div>
      <div className="field">
        <label>Destination (India)</label>
        <div className="row">
          <input className="input" value={form.destination} onChange={set('destination')} placeholder="Search a city or place…" onKeyDown={(e) => e.key === 'Enter' && search()} />
          <button className="btn" onClick={search} disabled={searching}>{searching ? '…' : 'Search'}</button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 160, overflow: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} className="list-item" style={{ cursor: 'pointer', borderColor: picked === r ? 'var(--primary)' : undefined }}
                onClick={() => { setPicked(r); setResults([]); setForm({ ...form, destination: r.name.split(',').slice(0, 2).join(',') }); }}>
                <span>📍</span><span style={{ fontSize: 13 }}>{r.name}</span>
              </div>
            ))}
          </div>
        )}
        {picked && <p className="muted" style={{ fontSize: 12 }}>✓ Pinned {picked.lat.toFixed(3)}, {picked.lng.toFixed(3)}</p>}
      </div>
      <div className="row">
        <div className="field grow"><label>Start</label><input className="input" type="date" value={form.start_date} onChange={set('start_date')} /></div>
        <div className="field grow"><label>End</label><input className="input" type="date" value={form.end_date} onChange={set('end_date')} /></div>
      </div>
      <div className="field">
        <label>Budget (₹, optional)</label>
        <input className="input" type="number" value={form.budget} onChange={set('budget')} placeholder="40000" />
      </div>
      <button className="btn primary" style={{ width: '100%' }} onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create trip'}</button>
    </Modal>
  );
}
