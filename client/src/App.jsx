import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { api } from './lib/api.js';
import { closeSocket } from './lib/socket.js';
import { Avatar, ToastProvider } from './lib/ui.jsx';
import Login from './pages/Login.jsx';
import Trips from './pages/Trips.jsx';
import TripDetail from './pages/TripDetail.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tp_token');
    if (!token) return setLoading(false);
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => localStorage.removeItem('tp_token')).finally(() => setLoading(false));
  }, []);

  const login = (token, user) => {
    localStorage.setItem('tp_token', token);
    setUser(user);
  };
  const logout = () => {
    localStorage.removeItem('tp_token');
    closeSocket();
    setUser(null);
  };

  if (loading)
    return <div className="auth-wrap"><div className="spinner" /></div>;

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <ToastProvider>
        {user && <TopBar />}
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/" element={user ? <Trips /> : <Navigate to="/login" />} />
          <Route path="/trip/:id" element={user ? <TripDetail /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ToastProvider>
    </AuthCtx.Provider>
  );
}

function TopBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="topbar">
      <Link to="/" className="brand"><span className="logo">🧭</span> TripPlanner</Link>
      <div className="row" style={{ alignItems: 'center' }}>
        <Avatar user={user} />
        <span className="muted" style={{ alignSelf: 'center' }}>{user.name}</span>
        <button className="btn ghost sm" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
      </div>
    </div>
  );
}
