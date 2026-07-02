# 🧭 TripPlanner — domestic trip planner

A full-stack trip planning app for planning trips across India with your crew.

- **Frontend:** React 18 + Vite + React Router, Leaflet maps (OpenStreetMap), Socket.IO client
- **Backend:** Node + Express REST API, Socket.IO realtime
- **Database:** SQLite (via better-sqlite3) — real relational storage, zero setup
- **Maps/Places:** OpenStreetMap tiles, Overpass API (nearby POIs) & Nominatim (geocoding) — no API keys

## Features

| Area | What you get |
|------|--------------|
| 👥 People | Create a trip, invite members by email, roles (owner/member) |
| 💸 Payment split | Add expenses, split equally or custom, auto **settle-up** (who-pays-whom minimal transactions), budget tracking |
| 🗺️ Explore | Find nearby **food, cafés, ATM, petrol bunks, hospitals, hotels, sights, parking, shops** on a live map with directions |
| 🔎 Search | Geocode-jump to any place in India; "near me" using device GPS |
| ⭐ Saved places | Bookmark places to the trip, shared with everyone |
| 📅 Itinerary | Day-by-day plan with times, notes and check-off |
| 📡 Live location | Real-time location sharing among members on a shared map |
| 💬 Trip chat | Realtime group chat per trip |
| 🔐 Auth | JWT auth, bcrypt-hashed passwords |

## Run it (two terminals)

```bash
# 1) Backend
cd server
npm install
npm run seed      # optional: demo trip + users
npm run dev       # http://localhost:4000

# 2) Frontend
cd client
npm install
npm run dev       # http://localhost:5173
```

Open http://localhost:5173. Use the **"Use demo"** button (login `arjun@demo.in` / `password`) or register a new account.

### Single-server production build

```bash
cd client && npm install && npm run build
cd ../server && npm install && npm start   # serves the built client + API on :4000
```

## Project layout

```
TripPlanner/
├── server/          Express + Socket.IO + SQLite
│   └── src/
│       ├── index.js      app + realtime
│       ├── db.js         schema
│       ├── seed.js       demo data
│       ├── lib/          auth, settle-up, places (OSM)
│       └── routes/       auth, trips, expenses, places
└── client/          React + Vite
    └── src/
        ├── pages/        Login, Trips, TripDetail
        ├── components/   Members, Expenses, Explore, Itinerary, LiveMap
        └── lib/          api, socket, leaflet, ui helpers
```

## Ideas to extend
Document upload (tickets/hotel PDFs), packing checklist, weather, train/flight PNR tracking, offline PWA, push notifications, UPI deep-links for settlement, per-day route optimization.
