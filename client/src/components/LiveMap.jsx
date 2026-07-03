import React, { useEffect, useRef, useState } from 'react';
import { L, coloredPin } from '../lib/leaflet.js';
import { getSocket } from '../lib/socket.js';
import { api } from '../lib/api.js';
import { useToast } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
const fmtDist = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const navLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
// Open a place in Google Maps by name (Google resolves local/informal names well)
const gmapsSearch = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const isMapLink = (s) => /^https?:\/\//i.test(s) && /(google\.[a-z.]+\/maps|maps\.google|goo\.gl|maps\.app\.goo\.gl)/i.test(s);
// Best link for the meeting point: by name if we have one, else by coords
const meetLink = (m) => (m.label ? gmapsSearch(m.label) : navLink(m.lat, m.lng));
const ago = (t) => {
  const s = Math.round((Date.now() - new Date(t).getTime()) / 1000);
  if (!isFinite(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
};

export default function LiveMap({ trip }) {
  const { user } = useAuth();
  const toast = useToast();
  const mapRef = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const meetMarker = useRef(null);
  const watchId = useRef(null);
  const myPos = useRef(null);
  const placingRef = useRef(false);
  const meetNameRef = useRef('Meeting point');

  const [sharing, setSharing] = useState(false);
  const [people, setPeople] = useState({});
  const [meet, setMeet] = useState((trip.meet_lat != null || trip.meet_label) ? { lat: trip.meet_lat, lng: trip.meet_lng, label: trip.meet_label } : null);
  const [placing, setPlacing] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [, force] = useState(0);

  const drawMeet = (m) => {
    if (meetMarker.current) { map.current.removeLayer(meetMarker.current); meetMarker.current = null; }
    if (m && m.lat != null) {
      meetMarker.current = L.marker([m.lat, m.lng], { icon: coloredPin('#f59e0b', '🚩'), zIndexOffset: 1000 })
        .addTo(map.current)
        .bindPopup(`<strong>🚩 ${m.label || 'Meeting point'}</strong><br/><a href="${navLink(m.lat, m.lng)}" target="_blank">Navigate here ↗</a>`);
      map.current.setView([m.lat, m.lng], 14);
    }
  };

  useEffect(() => {
    map.current = L.map(mapRef.current).setView([trip.lat || 20.5937, trip.lng || 78.9629], trip.lat ? 12 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map.current);

    // Trip destination pin — link opens Google Maps by NAME (reliable even if the
    // stored coords are a rough geocode) so shared links land on the right place.
    if (trip.lat != null) {
      L.marker([trip.lat, trip.lng], { icon: coloredPin('#2563eb', '🏁') })
        .addTo(map.current)
        .bindPopup(`<strong>🏁 ${trip.destination}</strong><br/><a href="${gmapsSearch(trip.destination)}" target="_blank">Open in Google Maps ↗</a>`);
    }

    const socket = getSocket();
    socket.emit('trip:join', trip.id);

    const upsert = (u) => {
      setPeople((prev) => ({ ...prev, [u.userId]: { ...u, at: u.updated_at || new Date().toISOString() } }));
      const color = u.avatar_color || '#3b82f6';
      const label = (u.name || '?')[0].toUpperCase();
      if (markers.current[u.userId]) markers.current[u.userId].setLatLng([u.lat, u.lng]);
      else markers.current[u.userId] = L.marker([u.lat, u.lng], { icon: coloredPin(color, label) })
        .addTo(map.current).bindPopup(`${u.name}${u.userId === user.id ? ' (you)' : ''}<br/><a href="${navLink(u.lat, u.lng)}" target="_blank">Navigate ↗</a>`);
    };

    socket.on('location:snapshot', (list) => list.forEach(upsert));
    socket.on('location:update', upsert);
    socket.on('location:gone', ({ userId }) => {
      setPeople((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      if (markers.current[userId]) { map.current.removeLayer(markers.current[userId]); delete markers.current[userId]; }
    });
    socket.on('meet:update', (m) => {
      const cleared = m.lat == null && !m.label;
      const next = cleared ? null : { lat: m.lat ?? null, lng: m.lng ?? null, label: m.label };
      setMeet(next); drawMeet(next);
      if (m.by) toast(cleared ? `${m.by} cleared the meeting point` : `${m.by} set the meeting point 🚩`);
    });

    map.current.on('click', (e) => {
      if (!placingRef.current) return;
      placingRef.current = false; setPlacing(false);
      getSocket().emit('meet:set', { tripId: trip.id, lat: e.latlng.lat, lng: e.latlng.lng, label: meetNameRef.current || 'Meeting point' });
    });

    if (meet) drawMeet(meet);

    return () => {
      socket.off('location:snapshot'); socket.off('location:update'); socket.off('location:gone'); socket.off('meet:update');
      if (watchId.current) { navigator.geolocation.clearWatch(watchId.current); socket.emit('location:stop', { tripId: trip.id }); }
      map.current.remove();
    };
  }, [trip.id]);

  // ---- meeting point actions ----
  // Type a place -> auto-pin the best match; if the free geocoder can't find it,
  // still set it by name so Google Maps opens the exact spot for everyone.
  const setByName = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      // Pasted a Google Maps link -> resolve to exact coordinates
      if (isMapLink(q)) {
        const d = await api.get(`/places/resolve?url=${encodeURIComponent(q)}`);
        const r = d.result;
        getSocket().emit('meet:set', { tripId: trip.id, lat: r.lat, lng: r.lng, label: r.label || 'Meeting point' });
        toast('Pinned from your link ✓');
        setQuery('');
        return;
      }
      window.open(gmapsSearch(q), '_blank'); // typed a name -> open Google Maps too
      let d = await api.get(`/places/geocode?q=${encodeURIComponent(q)}`);
      if (!d.results.length && trip.destination) {
        d = await api.get(`/places/geocode?q=${encodeURIComponent(q + ', ' + trip.destination)}`);
      }
      if (d.results.length) {
        const r = d.results[0];
        getSocket().emit('meet:set', { tripId: trip.id, lat: r.lat, lng: r.lng, label: q });
        toast('Meeting point pinned ✓');
      } else {
        getSocket().emit('meet:set', { tripId: trip.id, label: q });
        toast('Set by name — “Open in Google Maps” finds the exact spot');
      }
      setQuery('');
    } catch (e) { toast(e.message || 'Could not set that'); } finally { setSearching(false); }
  };
  const startPlacing = () => { meetNameRef.current = query.trim() || 'Meeting point'; placingRef.current = true; setPlacing(true); toast('Tap the map to drop the meeting point'); };
  const meetHere = () => {
    if (!myPos.current) return toast('Tap “Locate me” or “Share” first');
    getSocket().emit('meet:set', { tripId: trip.id, lat: myPos.current.lat, lng: myPos.current.lng, label: query.trim() || 'Meeting point' });
    setQuery('');
  };
  const clearMeet = () => getSocket().emit('meet:clear', { tripId: trip.id });

  // ---- my location ----
  const toggleShare = () => {
    const socket = getSocket();
    if (sharing) {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null; setSharing(false);
      socket.emit('location:stop', { tripId: trip.id }); // remove me from everyone's map
      toast('Stopped sharing');
      return;
    }
    if (!navigator.geolocation) return toast('Geolocation not supported');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        myPos.current = { lat: latitude, lng: longitude }; force((n) => n + 1);
        socket.emit('location:update', { tripId: trip.id, lat: latitude, lng: longitude });
        map.current.setView([latitude, longitude], 14);
      },
      () => toast('Location permission denied'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharing(true); toast('You are now sharing your live location');
  };
  const locateMe = () => {
    if (!navigator.geolocation) return toast('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      (pos) => { myPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; map.current.setView([myPos.current.lat, myPos.current.lng], 14); force((n) => n + 1); },
      () => toast('Location permission denied')
    );
  };

  const centerOn = (p) => { map.current.setView([p.lat, p.lng], 15); markers.current[p.userId]?.openPopup(); };
  const list = Object.values(people);
  const distToMeet = myPos.current && meet ? haversine(myPos.current.lat, myPos.current.lng, meet.lat, meet.lng) : null;

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="between wrap" style={{ gap: 10 }}>
          <div>
            <strong>{sharing ? '🟢 You are sharing your live location' : '📡 Live location'}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {sharing ? 'Everyone on this trip who opens the Live tab sees you move in real time.' : 'Share so your crew can trace where you are.'}
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={locateMe}>📍 Locate me</button>
            <button className={`btn ${sharing ? 'danger' : 'primary'}`} onClick={toggleShare}>{sharing ? '⏹ Stop' : '📡 Share'}</button>
          </div>
        </div>
      </div>

      {trip.lat != null && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="between">
            <div><strong>🏁 Trip destination</strong><div className="muted" style={{ fontSize: 13 }}>{trip.destination}</div></div>
            <a className="btn sm" href={gmapsSearch(trip.destination)} target="_blank" rel="noreferrer">Open in Maps ↗</a>
          </div>
        </div>
      )}

      {/* Meeting point */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 className="section-title">🚩 Meeting point</h3>
        {meet && (
          <div className="list-item">
            <span style={{ fontSize: 18 }}>🚩</span>
            <div className="grow">
              <strong>{meet.label || 'Meeting point'}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{distToMeet != null ? `${fmtDist(distToMeet)} from you · shared with all` : 'Shared with everyone'}</div>
            </div>
            <a className="btn sm" href={meetLink(meet)} target="_blank" rel="noreferrer">Open in Maps ↗</a>
            <button className="btn danger sm" onClick={clearMeet}>Clear</button>
          </div>
        )}
        <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>{meet ? 'Change it — t' : 'T'}ype a place <strong>or paste a Google Maps link</strong> — everyone can open it in Google Maps.</p>
        <div className="row">
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Place name or paste a Maps link…" onKeyDown={(e) => e.key === 'Enter' && setByName()} />
          <button className="btn primary" onClick={setByName} disabled={searching}>{searching ? '…' : 'Set'}</button>
        </div>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button className={`btn ${placing ? 'primary' : ''}`} onClick={startPlacing}>{placing ? '👆 Tap the map…' : '📌 Tap map'}</button>
          <button className="btn" onClick={meetHere}>📍 Use my location</button>
        </div>
      </div>

      <div ref={mapRef} className="map" style={{ height: '55vh' }} />

      <div className="card" style={{ marginTop: 12 }}>
        <div className="between">
          <h3 className="section-title" style={{ margin: 0 }}>Sharing now</h3>
          <span className="pill">{list.length}</span>
        </div>
        {list.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No one is sharing yet. Tap “Share”.</p>}
        {list.map((p) => {
          const d = myPos.current && p.userId !== user.id ? haversine(myPos.current.lat, myPos.current.lng, p.lat, p.lng) : null;
          return (
            <div key={p.userId} className="list-item">
              <span style={{ fontSize: 16 }}>🟢</span>
              <div className="grow" style={{ cursor: 'pointer' }} onClick={() => centerOn(p)}>
                <strong style={{ fontSize: 14 }}>{p.name}{p.userId === user.id ? ' (you)' : ''}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{d != null ? `${fmtDist(d)} away · ` : ''}{ago(p.at)}</div>
              </div>
              <button className="btn sm" onClick={() => centerOn(p)}>Trace</button>
              {p.userId !== user.id && <a className="btn sm" href={navLink(p.lat, p.lng)} target="_blank" rel="noreferrer">Go ↗</a>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
