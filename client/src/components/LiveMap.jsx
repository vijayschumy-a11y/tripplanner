import React, { useEffect, useRef, useState } from 'react';
import { L, coloredPin } from '../lib/leaflet.js';
import { getSocket } from '../lib/socket.js';
import { useToast } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

export default function LiveMap({ trip }) {
  const { user } = useAuth();
  const toast = useToast();
  const mapRef = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const watchId = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [people, setPeople] = useState({});

  useEffect(() => {
    map.current = L.map(mapRef.current).setView([trip.lat || 20.5937, trip.lng || 78.9629], trip.lat ? 12 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map.current);

    const socket = getSocket();
    socket.emit('trip:join', trip.id);

    const upsert = (u) => {
      setPeople((prev) => ({ ...prev, [u.userId]: { ...u, at: u.updated_at || Date.now() } }));
      const color = u.avatar_color || '#3b82f6';
      const label = (u.name || '?')[0].toUpperCase();
      if (markers.current[u.userId]) markers.current[u.userId].setLatLng([u.lat, u.lng]);
      else markers.current[u.userId] = L.marker([u.lat, u.lng], { icon: coloredPin(color, label) })
        .addTo(map.current).bindPopup(u.name + (u.userId === user.id ? ' (you)' : ''));
    };

    socket.on('location:snapshot', (list) => list.forEach(upsert));
    socket.on('location:update', upsert);

    return () => {
      socket.off('location:snapshot'); socket.off('location:update');
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      map.current.remove();
    };
  }, [trip.id]);

  const toggleShare = () => {
    const socket = getSocket();
    if (sharing) {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setSharing(false);
      toast('Stopped sharing');
      return;
    }
    if (!navigator.geolocation) return toast('Geolocation not supported');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        socket.emit('location:update', { tripId: trip.id, lat: latitude, lng: longitude });
        map.current.setView([latitude, longitude], 14);
      },
      () => toast('Location permission denied'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharing(true);
    toast('You are now sharing your live location');
  };

  const list = Object.values(people);
  const others = list.filter((p) => p.userId !== user.id);

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="between wrap" style={{ gap: 10 }}>
          <div>
            <strong>{sharing ? '🟢 You are sharing your live location' : '📡 Live location'}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {sharing
                ? 'Everyone on this trip who opens the Live tab can see you move on the map.'
                : 'Tap share so your crew can see where you are in real time.'}
            </div>
          </div>
          <button className={`btn ${sharing ? 'danger' : 'primary'}`} onClick={toggleShare}>
            {sharing ? '⏹ Stop sharing' : '📡 Share my location'}
          </button>
        </div>
      </div>

      <div ref={mapRef} className="map" style={{ height: '58vh' }} />

      <div className="card" style={{ marginTop: 12 }}>
        <div className="between">
          <h3 className="section-title" style={{ margin: 0 }}>On the map now</h3>
          <span className="pill">{list.length} shared</span>
        </div>
        <div className="row wrap" style={{ marginTop: 8 }}>
          {list.map((p) => (
            <span key={p.userId} className="pill">🟢 {p.name}{p.userId === user.id ? ' (you)' : ''}</span>
          ))}
          {list.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No one is sharing yet. Tap “Share my location” to start.</span>}
        </div>
        {sharing && others.length === 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            You're sharing ✓ — others will appear here when they open this tab and tap share too.
          </p>
        )}
      </div>
    </div>
  );
}
