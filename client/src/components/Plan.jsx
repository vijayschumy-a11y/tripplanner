import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/ui.jsx';

const ICON = { start: '🚩', drive: '🚗', breakfast: '☕', lunch: '🍽️', dinner: '🍽️', visit: '📸' };

export default function Plan({ tripId, trip }) {
  const toast = useToast();
  const [startQuery, setStartQuery] = useState('');
  const [start, setStart] = useState(null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [plan, setPlan] = useState(null);
  const [weather, setWeather] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get(`/plan/weather/${tripId}`).then((d) => setWeather(d.weather)).catch(() => {}); }, [tripId]);

  const searchStart = async () => {
    if (!startQuery) return;
    setSearching(true);
    try { const d = await api.get(`/places/geocode?q=${encodeURIComponent(startQuery)}`); setResults(d.results); }
    catch { toast('Search failed'); } finally { setSearching(false); }
  };

  const pick = (r) => {
    const name = r.name.split(',').slice(0, 2).join(',');
    setStart({ name, lat: r.lat, lng: r.lng });
    setResults([]); setStartQuery(name);
  };

  const generate = async () => {
    setLoading(true); setPlan(null);
    try {
      const d = await api.post('/plan/generate', { tripId, startName: start?.name, startLat: start?.lat, startLng: start?.lng });
      setPlan(d.plan);
      const wx = d.plan.map((x) => x.weather).filter(Boolean);
      if (wx.length) setWeather(wx);
      if (!d.plan.some((p) => p.items.length)) toast('No sights found near this destination');
    } catch (e) { toast(e.message); } finally { setLoading(false); }
  };

  const saveToItinerary = async () => {
    const withDates = (plan || []).filter((d) => d.date);
    if (!withDates.length) return toast('Add start & end dates to the trip to save the plan');
    setSaving(true);
    try {
      for (const day of withDates)
        for (const it of day.items)
          await api.post(`/trips/${tripId}/itinerary`, { day: day.date, time: it.time, title: it.title, note: it.note, lat: it.lat, lng: it.lng });
      toast('Saved to Itinerary ✅');
    } catch (e) { toast(e.message); } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Auto-plan your trip ✨</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          A weather-aware, routed day-by-day plan — sights to visit and where to eat — for {trip.destination}.
        </p>
        <label>Starting place (optional)</label>
        <div className="row">
          <input className="input" value={startQuery} onChange={(e) => setStartQuery(e.target.value)} placeholder="e.g. Chennai" onKeyDown={(e) => e.key === 'Enter' && searchStart()} />
          <button className="btn" onClick={searchStart} disabled={searching}>{searching ? '…' : 'Find'}</button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 140, overflow: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} className="list-item" style={{ cursor: 'pointer' }} onClick={() => pick(r)}>
                <span>📍</span><span style={{ fontSize: 13 }}>{r.name}</span>
              </div>
            ))}
          </div>
        )}
        {start && <p className="muted" style={{ fontSize: 12 }}>✓ Starting from {start.name}</p>}
        <button className="btn primary" style={{ width: '100%', marginTop: 10 }} onClick={generate} disabled={loading}>
          {loading ? 'Building your plan…' : '✨ Generate full plan'}
        </button>
      </div>

      {weather.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title">Weather forecast</h3>
          <div className="row wrap">
            {weather.map((w, i) => (
              <div key={i} className="chip" style={{ flexDirection: 'column', alignItems: 'center', padding: '8px 12px', gap: 2 }}>
                <span style={{ fontSize: 12 }}>{new Date(w.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</span>
                <span style={{ fontSize: 22 }}>{w.emoji}</span>
                <span style={{ fontSize: 12 }}>{w.tmax}°/{w.tmin}°</span>
                {w.rain != null && <span className="muted" style={{ fontSize: 11 }}>💧{w.rain}%</span>}
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {weather.some((w) => w.seasonal)
              ? '≈ Typical weather (last year, same dates) — a live forecast appears within ~16 days of travel.'
              : 'Live forecast for your travel dates.'}
          </p>
        </div>
      )}

      {loading && <div className="card"><div className="row" style={{ alignItems: 'center' }}><div className="spinner" /> <span className="muted">Finding the best route, sights & food — a few seconds…</span></div></div>}

      {plan && (
        <>
          <div className="between" style={{ marginBottom: 10 }}>
            <h3 className="section-title" style={{ margin: 0 }}>Your {plan.length}-day plan</h3>
            <button className="btn primary sm" onClick={saveToItinerary} disabled={saving}>{saving ? 'Saving…' : '＋ Add to Itinerary'}</button>
          </div>
          {plan.map((day, di) => (
            <div key={di} className="card" style={{ marginBottom: 14 }}>
              <div className="between">
                <h3 className="section-title" style={{ margin: 0 }}>📅 {day.label}</h3>
                {day.weather && <span className="pill">{day.weather.emoji} {day.weather.tmax}°/{day.weather.tmin}°{day.weather.rain != null ? ` · 💧${day.weather.rain}%` : ''}</span>}
              </div>
              {day.items.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No sights found nearby for this day.</p>}
              {day.items.map((it, ii) => (
                <div key={ii} className="list-item">
                  <span className="pill" style={{ minWidth: 50, textAlign: 'center' }}>{it.time}</span>
                  <span style={{ fontSize: 18 }}>{ICON[it.type] || '•'}</span>
                  <div className="grow">
                    <strong style={{ fontSize: 14 }}>{it.title}</strong>
                    {it.note && <div className="muted" style={{ fontSize: 12 }}>{it.note}</div>}
                  </div>
                  {it.map && <a className="btn sm" href={it.map} target="_blank" rel="noreferrer">↗</a>}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
