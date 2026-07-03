import React, { createContext, useContext, useState, useCallback } from 'react';

export function Avatar({ user, size = 34 }) {
  const initials = (user?.name || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (user?.avatar) {
    return (
      <img
        className="avatar"
        src={user.avatar}
        alt={user?.name || ''}
        style={{ width: size, height: size, objectFit: 'cover' }}
      />
    );
  }
  return (
    <div className="avatar" style={{ background: user?.avatar_color || '#334155', width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}

export const rupee = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const CATEGORY_ICON = {
  food: '🍽️', transport: '🚗', stay: '🏨', shopping: '🛍️', activity: '🎟️',
  fuel: '⛽', general: '💳', atm: '🏧', petrol: '⛽', hospital: '🏥',
  hotel: '🏨', attraction: '📸', parking: '🅿️', toilets: '🚻', cafe: '☕',
};
