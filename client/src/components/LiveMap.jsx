import React, { useEffect, useRef, useState } from 'react';
import { L, coloredPin } from '../lib/leaflet.js';
import { getSocket } from '../lib/socket.js';
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
  const [meet, setMeet] = useState(trip.meet_lat != null ? { lat: trip.meet_lat, lng: trip.meet_lng, label: trip.meet_label } : null);
  const [placing, setPlacing] = useState(false);
  const [meetName, setMeetName] = useState('');
  const [, force] = useState(0);

  const drawMeet = (m) => {
    if (meetMarker.current) { map.current.removeLayer(meetMarker.current); meetMarker.current = null; }
    if (m && m.lat != null) {
      meetMarker.current = L.marker([m.lat, m.lng], { icon: coloredPin('#f59e0b', '🚩'), zIndexOffset: 1000 })
        .addTo(map.current)
        .bindPopup(`<strong>🚩 ${m.label || 'Meeting point'}</strong><br/><a href="${navLink(m.lat, m.lng)}" target="_blank">Navigate here ↗</a>`);
    }
  };

  useEffect(() => {
    map.current = L.map(mapRef.current).setView([trip.lat || 20.5937, trip.lng || 78.9629], trip.lat ? 12 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map.current);

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
    socket.on('meet:update', (m) => {
      const next = m.lat != null ? { lat: m.lat, lng: m.lng, label: m.label } : null;
      setMeet(next); drawMeet(next);
      if (m.by) toast(m.lat != null ? `${m.by} set the meeting point` : `${m.by} cleared the meeting point`);
    });

    // tap map to place the meeting point (when in placing mode)
    map.current.on('click', (e) => {
      if (!placingRef.current) return;
      placingRef.current = false; setPlacing(false);
      getSocket().emit('meet:set', { tripId: trip.id, lat: e.latlng.lat, lng: e.latlng.lng, label: meetNameRef.current || 'Meeting point' });
    });

    if (meet) drawMeet(meet);

    return () => {
      socket.off('location:snapshot'); socket.off('location:update'); socket.off('meet:update');
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      map.current.remove();
    };
  }, [trip.id]);

  const toggleShare = () => {
    const socket = getSocket();
    if (sharing) {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null; setSharing(false); toast('Stopped sharing');
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

  const startPlacing = () => { meetNameRef.current = meetName.trim() || 'Meeting point'; placingRef.current = true; setPlacing(true); toast('Tap the map to drop the meeting point'); };
  const meetHere = () => {
    if (!myPos.current) return toast('Tap “Locate me” or “Share” first');
    getSocket().emit('meet:set', { tripId: trip.id, lat: myPos.current.lat, lng: myPos.current.lng, label: meetName.trim() || 'Meeting point' });
  };
  const clearMeet = () => getSocket().emit('meet:clear', { tripId: trip.id });

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

      {/* Meeting point */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 className="section-title">🚩 Meeting point</h3>
        {meet ? (
          <div className="list-item">
            <span style={{ fontSize: 18 }}>🚩</span>
            <div className="grow">
              <strong>{meet.label || 'Meeting point'}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{distToMeet != null ? `${fmtDist(distToMeet)} from you` : 'Shared with everyone'}</div>
            </div>
            <a className="btn sm" href={navLink(meet.lat, meet.lng)} target="_blank" rel="noreferrer">Navigate ↗</a>
            <button className="btn danger sm" onClick={clearMeet}>Clear</button>
          </div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Drop a spot everyone can navigate to — a café, hotel or gate.</p>
            <div className="row" style={{ marginBottom: 8 }}>
              <input className="input" value={meetName} onChange={(e) => setMeetName(e.target.value)} placeholder="Name (e.g. Beach Road café)" />
            </div>
            <div className="row wrap">
              <button className={`btn ${placing ? 'primary' : ''}`} onClick={startPlacing}>{placing ? '👆 Tap the map…' : '📌 Tap map to place'}</button>
              <button className="btn" onClick={meetHere}>📍 Use my location</button>
            </div>
          </>
        )}
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
