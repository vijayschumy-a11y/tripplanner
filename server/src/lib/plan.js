// Auto trip planner: weather (Open-Meteo) + a routed day-by-day itinerary
// (attractions + meal stops) from OpenStreetMap. All free, no API keys.
import { nearby } from './places.js';

const UA = 'TripPlanner/1.0';

const WMO = [
  { max: 0, emoji: '☀️', label: 'Clear' },
  { max: 3, emoji: '⛅', label: 'Partly cloudy' },
  { max: 48, emoji: '🌫️', label: 'Fog' },
  { max: 67, emoji: '🌧️', label: 'Rain' },
  { max: 77, emoji: '❄️', label: 'Snow' },
  { max: 82, emoji: '🌦️', label: 'Showers' },
  { max: 86, emoji: '❄️', label: 'Snow showers' },
  { max: 99, emoji: '⛈️', label: 'Thunderstorm' },
];
const describe = (code) => WMO.find((w) => code <= w.max) || { emoji: '🌡️', label: '—' };

function dist(aLat, aLng, bLat, bLng) {
  const dLat = aLat - bLat, dLng = aLng - bLng;
  return dLat * dLat + dLng * dLng; // squared euclidean is fine for ordering
}

const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max';
const shiftYear = (s, n) => { const d = new Date(s); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };
const addDaysStr = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.reason || 'weather error');
  return j;
}

// Live forecast within ~16 days; otherwise a seasonal estimate from last year's
// archive for the same dates. Returns [] only if both providers fail.
export async function weather(lat, lng, start, end) {
  try {
    const range = start && end ? `&start_date=${start}&end_date=${end}` : '&forecast_days=7';
    const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=${DAILY}&timezone=auto${range}`);
    const day = j.daily || {};
    return (day.time || []).map((date, i) => ({
      date, ...describe(day.weather_code[i]),
      tmax: Math.round(day.temperature_2m_max[i]), tmin: Math.round(day.temperature_2m_min[i]),
      rain: day.precipitation_probability_max?.[i] ?? null,
    }));
  } catch {
    if (!start) return [];
    try {
      const j = await getJson(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
        `&start_date=${shiftYear(start, -1)}&end_date=${shiftYear(end || start, -1)}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
      );
      const day = j.daily || {};
      return (day.time || []).map((_, i) => ({
        date: addDaysStr(start, i), ...describe(day.weather_code[i]),
        tmax: Math.round(day.temperature_2m_max[i]), tmin: Math.round(day.temperature_2m_min[i]),
        rain: null, seasonal: true,
      }));
    } catch { return []; }
  }
}

function nearestNeighbour(items, lat, lng) {
  const rest = [...items];
  const order = [];
  let cur = { lat, lng };
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((p, i) => { const dd = dist(cur.lat, cur.lng, p.lat, p.lng); if (dd < bd) { bd = dd; bi = i; } });
    const [p] = rest.splice(bi, 1);
    order.push(p);
    cur = p;
  }
  return order;
}

const fmt = (mins) => {
  const h = Math.floor(mins / 60) % 24, m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function haversineM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

// Best-dish suggestions by cuisine — veg & non-veg
const DISHES = {
  south:   { veg: ['Masala Dosa', 'Ghee Pongal', 'Idli-Sambar'], nonveg: ['Chettinad Chicken', 'Fish Fry', 'Mutton Kola Urundai'] },
  north:   { veg: ['Paneer Butter Masala', 'Dal Makhani', 'Chole Bhature'], nonveg: ['Butter Chicken', 'Rogan Josh', 'Seekh Kebab'] },
  chinese: { veg: ['Veg Manchurian', 'Hakka Noodles'], nonveg: ['Chilli Chicken', 'Chicken Fried Rice'] },
  biryani: { veg: ['Veg Dum Biryani'], nonveg: ['Chicken Biryani', 'Mutton Biryani'] },
  seafood: { veg: ['Veg Thali'], nonveg: ['Grilled Fish', 'Prawn Masala', 'Crab Roast'] },
  cafe:    { veg: ['Filter Coffee', 'Veg Sandwich', 'Cake'], nonveg: ['Chicken Sandwich'] },
  fast:    { veg: ['Veg Burger', 'Fries'], nonveg: ['Chicken Burger', 'Chicken Wings'] },
  pizza:   { veg: ['Margherita', 'Farmhouse'], nonveg: ['Chicken Pizza', 'Pepperoni'] },
  default: { veg: ['Paneer Tikka', 'Veg Biryani', 'Masala Dosa'], nonveg: ['Chicken Biryani', 'Tandoori Chicken'] },
};
function suggestDishes(cuisine) {
  const c = (cuisine || '').toLowerCase();
  if (c.includes('south') || c.includes('tamil') || c.includes('kerala') || c.includes('andhra')) return DISHES.south;
  if (c.includes('north') || c.includes('punjabi') || c.includes('mughlai')) return DISHES.north;
  if (c.includes('chinese') || c.includes('asian')) return DISHES.chinese;
  if (c.includes('biryani')) return DISHES.biryani;
  if (c.includes('seafood') || c.includes('fish')) return DISHES.seafood;
  if (c.includes('pizza') || c.includes('italian')) return DISHES.pizza;
  if (c.includes('burger') || c.includes('fast')) return DISHES.fast;
  if (c.includes('coffee') || c.includes('cafe') || c.includes('bakery')) return DISHES.cafe;
  return DISHES.default;
}

// Richer attraction search: sights, temples, historic spots, parks, beaches, viewpoints
async function attractionsNear(lat, lng, radius) {
  const q =
    `[out:json][timeout:25];(` +
    `node["tourism"~"attraction|viewpoint|museum|zoo|theme_park|gallery"]["name"](around:${radius},${lat},${lng});` +
    `node["historic"]["name"](around:${radius},${lat},${lng});` +
    `node["leisure"~"park|beach_resort|garden"]["name"](around:${radius},${lat},${lng});` +
    `node["amenity"="place_of_worship"]["name"](around:${radius},${lat},${lng});` +
    `node["natural"~"beach|peak"]["name"](around:${radius},${lat},${lng});` +
    `);out body 60;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('Overpass ' + res.status);
  const data = await res.json();
  const seen = new Set();
  return (data.elements || [])
    .filter((e) => e.lat && e.lon && e.tags?.name)
    .map((e) => {
      const t = e.tags;
      const type = t.tourism || t.historic || t.leisure || (t.amenity === 'place_of_worship' ? 'temple / church' : t.natural) || 'sight';
      return { name: t.name, lat: e.lat, lng: e.lon, type: String(type).replace(/_/g, ' '), distance: haversineM(lat, lng, e.lat, e.lon) };
    })
    .filter((a) => { const k = a.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.distance - b.distance);
}

export async function generatePlan({ destLat, destLng, destName, days, startName, startLat, startLng }) {
  days = Math.max(1, Math.min(Number(days) || 2, 7));

  // Query providers independently & sequentially so one failure doesn't sink the plan
  let attractionsRaw = [], food = [];
  try { attractionsRaw = await attractionsNear(destLat, destLng, 15000); } catch { /* keep empty */ }
  try { food = await nearby('food', destLat, destLng, 9000); } catch { /* keep empty */ }

  // de-duplicate food by name so meals don't repeat the same place
  const fseen = new Set();
  food = food.filter((f) => { const k = f.name.toLowerCase(); if (fseen.has(k)) return false; fseen.add(k); return true; });

  const attractions = attractionsRaw.slice(0, days * 3);
  const startPt = startLat && startLng ? { lat: startLat, lng: startLng } : { lat: destLat, lng: destLng };
  const ordered = nearestNeighbour(attractions, startPt.lat, startPt.lng);
  const perDay = Math.max(1, Math.ceil(ordered.length / days));

  // pick the nearest UNUSED restaurant each time (different for each meal)
  const used = new Set();
  const nearestFood = (lat, lng) => {
    const pool = food.filter((f) => !used.has(f.name));
    const src = pool.length ? pool : food;
    if (!src.length) return null;
    const pick = src.reduce((a, b) => (dist(lat, lng, a.lat, a.lng) < dist(lat, lng, b.lat, b.lng) ? a : b));
    used.add(pick.name);
    return pick;
  };
  const dirLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  const plan = [];
  for (let di = 0; di < days; di++) {
    const dayAttractions = ordered.slice(di * perDay, (di + 1) * perDay);
    const items = [];
    let clock = 8 * 60;
    const push = (o) => items.push({ time: fmt(clock), map: o.lat ? dirLink(o.lat, o.lng) : null, ...o });
    const meal = (type, place) => {
      if (!place) return false;
      const d = suggestDishes(place.cuisine);
      push({
        type, title: `${cap(type)} — ${place.name}`, lat: place.lat, lng: place.lng,
        note: place.cuisine ? place.cuisine.replace(/_/g, ' / ').replace(/;/g, ', ') : null,
        veg: d.veg.slice(0, 2).join(', '), nonveg: d.nonveg.slice(0, 2).join(', '),
      });
      return true;
    };

    if (di === 0 && startName) {
      push({ type: 'start', title: `Start from ${startName}`, lat: startLat, lng: startLng, note: 'Begin the journey' });
      clock += 120;
      push({ type: 'drive', title: `Arrive in ${destName}`, lat: destLat, lng: destLng, note: 'Freshen up / check in' });
      clock += 30;
    }

    const base0 = dayAttractions[0] || { lat: destLat, lng: destLng };
    if (meal('breakfast', nearestFood(base0.lat, base0.lng))) clock += 60;

    const half = Math.ceil(dayAttractions.length / 2);
    dayAttractions.slice(0, half).forEach((a) => { push({ type: 'visit', title: a.name, lat: a.lat, lng: a.lng, note: `${a.type} · ${a.distance} m from centre` }); clock += 90; });

    clock = Math.max(clock, 13 * 60);
    const lb = dayAttractions[half - 1] || base0;
    if (meal('lunch', nearestFood(lb.lat, lb.lng))) clock += 75;

    dayAttractions.slice(half).forEach((a) => { push({ type: 'visit', title: a.name, lat: a.lat, lng: a.lng, note: a.type }); clock += 90; });

    clock = Math.max(clock, 19.5 * 60);
    const db = dayAttractions[dayAttractions.length - 1] || base0;
    meal('dinner', nearestFood(db.lat, db.lng));

    plan.push({ dayIndex: di, visitCount: dayAttractions.length, items });
  }

  return { plan, totals: { attractions: attractions.length, food: food.length } };
}
