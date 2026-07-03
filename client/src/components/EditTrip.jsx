import React, { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal, useToast } from '../lib/ui.jsx';

// Edit a trip's name, destination (with place search), dates & budget.
export default function EditTrip({ trip, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: trip.name || '',
    destination: trip.destination || '',
    start_date: trip.start_date || '',
    end_date: trip.end_date || '',
    budget: trip.budget || '',
  });
  const [picked, setPicked] = useState(trip.lat != null ? { lat: trip.lat, lng: trip.lng } : null);
  const [cover, setCover] = useState(trip.cover || null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickCover = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return toast('Please choose an image');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = 640, h = Math.round((img.height / img.width) * 640);
        const c = document.createElement('canvas'); c.width = w; c.height = Math.min(h, 420);
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        setCover(c.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const isMapLink = (s) => /^https?:\/\//i.test(s) && /(google\.[a-z.]+\/(maps|search)|maps\.google|goo\.gl|maps\.app\.goo\.gl|share\.google|g\.co)/i.test(s);
  const search = async () => {
    const q = form.destination.trim();
    if (!q) return;
    setSearching(true);
    try {
      if (isMapLink(q)) {
        const d = await api.get(`/places/resolve?url=${encodeURIComponent(q)}`);
        const r = d.result;
        if (r.lat != null) setPicked({ lat: r.lat, lng: r.lng });
        setForm({ ...form, destination: r.label || form.destination });
        toast(r.lat != null ? 'Location set from link ✓' : 'Name set from link');
        return;
      }
      const d = await api.get(`/places/geocode?q=${encodeURIComponent(q)}`);
      setResults(d.results);
      if (!d.results.length) toast('No place found — you can still save the name');
    } catch (e) { toast(e.message || 'Search failed'); } finally { setSearching(false); }
  };

  const pick = (r) => {
    const name = r.name.split(',').slice(0, 3).join(',');
    setPicked({ lat: r.lat, lng: r.lng });
    setForm({ ...form, destination: name });
    setResults([]);
  };

  const save = async () => {
    if (!form.name || !form.destination) return toast('Name and destination required');
    setBusy(true);
    try {
      const d = await api.patch(`/trips/${trip.id}`, {
        name: form.name,
        destination: form.destination,
        lat: picked?.lat ?? null,
        lng: picked?.lng ?? null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget: Number(form.budget) || 0,
        cover,
      });
      onSaved(d.trip);
    } catch (e) { toast(e.message); setBusy(false); }
  };

  return (
    <Modal title="Edit trip" onClose={onClose}>
      <div className="field">
        <label>Cover photo</label>
        <div className="trip-cover" style={cover ? { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
          {!cover && <span style={{ fontSize: 40 }}>🏔️</span>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>📷 {cover ? 'Change photo' : 'Add photo'}</button>
          {cover && <button className="btn ghost sm" onClick={() => setCover(null)}>Remove</button>}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickCover} />
        </div>
      </div>
      <div className="field"><label>Trip name</label>
        <input className="input" value={form.name} onChange={set('name')} /></div>
      <div className="field">
        <label>Destination — type a place or paste a Google Maps link (shows on the trips list)</label>
        <div className="row">
          <input className="input" value={form.destination} onChange={set('destination')} placeholder="Resort name or paste a Maps link…" onKeyDown={(e) => e.key === 'Enter' && search()} />
          <button className="btn" onClick={search} disabled={searching}>{searching ? '…' : 'Find'}</button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 160, overflow: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} className="list-item" style={{ cursor: 'pointer' }} onClick={() => pick(r)}>
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
      <div className="field"><label>Budget (₹)</label><input className="input" type="number" value={form.budget} onChange={set('budget')} /></div>
      <button className="btn primary" style={{ width: '100%' }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </Modal>
  );
}
