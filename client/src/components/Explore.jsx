import React, { useEffect, useRef, useState } from 'react';
import { L, coloredPin } from '../lib/leaflet.js';
import { api } from '../lib/api.js';
import { useToast, CATEGORY_ICON } from '../lib/ui.jsx';

const CATEGORIES = [
  ['food', 'Food', '🍽️'],
  ['cafe', 'Cafés', '☕'],
  ['atm', 'ATM', '🏧'],
  ['petrol', 'Petrol', '⛽'],
  ['hospital', 'Medical', '🏥'],
  ['hotel', 'Stay', '🏨'],
  ['attraction', 'Sights', '📸'],
  ['parking', 'Parking', '🅿️'],
  ['shopping', 'Shops', '🛍️'],
];

export default function Explore({ trip }) {
  const toast = useToast();
  const mapRef = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [center, setCenter] = useState({ lat: trip.lat || 20.5937, lng: trip.lng || 78.9629 });
  const [cat, setCat] = useState('food');
  const [results, setResults] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  // init map
  useEffect(() => {
    map.current = L.map(mapRef.current).setView([center.lat, center.lng], trip.lat ? 13 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    if (trip.lat) search('food', trip.lat, trip.lng);
    api.get(`/trips/${trip.id}/places`).then((d) => setSaved(d.places));
    return () => map.current.remove();
  }, []);

  const search = async (category = cat, lat = center.lat, lng = center.lng) => {
    setLoading(true);
    setCat(category);
    try {
      const d = await api.get(`/places/nearby?category=${category}&lat=${lat}&lng=${lng}&radius=4000`);
      setResults(d.results);
      draw(d.results, lat, lng, category);
      if (d.results.length === 0) toast('Nothing found nearby — try another category');
    } catch (e) { toast('Places lookup failed'); }
    finally { setLoading(false); }
  };

  const draw = (places, lat, lng, category) => {
    layer.current.clearLayers();
    L.marker([lat, lng], { icon: coloredPin('#111', '📍') }).addTo(layer.current).bindPopup('You / trip center');
    map.current.setView([lat, lng], 14);
    places.forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: coloredPin('#2563eb', CATEGORY_ICON[category] || '📍') }).addTo(layer.current);
      m.bindPopup(
        `<strong>${p.name}</strong><br/>${p.distance} m away${p.cuisine ? '<br/>' + p.cuisine : ''}` +
        `<br/><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank">Directions ↗</a>`
      );
    });
  };

  const geocode = async () => {
    if (!query) return;
    try {
      const d = await api.get(`/places/geocode?q=${encodeURIComponent(query)}`);
      if (d.results[0]) {
        const r = d.results[0];
        setCenter({ lat: r.lat, lng: r.lng });
        search(cat, r.lat, r.lng);
      } else toast('Place not found');
    } catch { toast('Search failed'); }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast('Geolocation unavailable');
    navigator.geolocation.getCurrentPosition(
      (pos) => { const { latitude, longitude } = pos.coords; setCenter({ lat: latitude, lng: longitude }); search(cat, latitude, longitude); },
      () => toast('Location permission denied')
    );
  };

  const savePlace = async (p) => {
    try {
      await api.post(`/trips/${trip.id}/places`, { name: p.name, category: cat, lat: p.lat, lng: p.lng, address: p.address });
      const d = await api.get(`/trips/${trip.id}/places`);
      setSaved(d.places);
      toast('Saved to trip ⭐');
    } catch (e) { toast(e.message); }
  };

  const removeSaved = async (id) => {
    await api.del(`/trips/${trip.id}/places/${id}`);
    setSaved((s) => s.filter((x) => x.id !== id));
  };

  return (
    <div className="detail-grid" style={{ gridTemplateColumns: '1fr 360px' }}>
      <div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Jump to a place…" onKeyDown={(e) => e.key === 'Enter' && geocode()} />
          <button className="btn" onClick={geocode}>Go</button>
          <button className="btn" onClick={useMyLocation}>📍 Me</button>
        </div>
        <div className="chip-row">
          {CATEGORIES.map(([key, label, icon]) => (
            <div key={key} className={`chip ${cat === key ? 'active' : ''}`} onClick={() => search(key)}>
              {icon} {label}
            </div>
          ))}
        </div>
        <div ref={mapRef} className="map" />
      </div>

      <div>
        <div className="between" style={{ marginBottom: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Nearby {loading && <span className="spinner" style={{ display: 'inline-block' }} />}</h3>
          <span className="pill">{results.length}</span>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
          {results.map((p) => (
            <div key={p.id} className="list-item">
              <div className="grow">
                <strong style={{ fontSize: 14 }}>{p.name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{p.distance} m{p.cuisine ? ` · ${p.cuisine}` : ''}</div>
              </div>
              <button className="btn sm" onClick={() => savePlace(p)}>⭐</button>
              <a className="btn sm" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">↗</a>
            </div>
          ))}
          {!loading && results.length === 0 && <p className="muted">Pick a category to see places.</p>}
        </div>

        <h3 className="section-title">Saved for this trip ({saved.length})</h3>
        {saved.map((p) => (
          <div key={p.id} className="list-item">
            <span>{CATEGORY_ICON[p.category] || '⭐'}</span>
            <div className="grow"><strong style={{ fontSize: 14 }}>{p.name}</strong></div>
            <button className="btn danger sm" onClick={() => removeSaved(p.id)}>✕</button>
          </div>
        ))}
        {saved.length === 0 && <p className="muted">Tap ⭐ on a place to save it.</p>}
      </div>
    </div>
  );
}
