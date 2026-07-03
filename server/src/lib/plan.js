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

export async function weather(lat, lng, start, end) {
  const range = start && end ? `&start_date=${start}&end_date=${end}` : '&forecast_days=7';
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('weather provider error');
  const d = await res.json();
  const day = d.daily || {};
  return (day.time || []).map((date, i) => ({
    date,
    ...describe(day.weather_code[i]),
    tmax: Math.round(day.temperature_2m_max[i]),
    tmin: Math.round(day.temperature_2m_min[i]),
    rain: day.precipitation_probability_max?.[i] ?? null,
  }));
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

export async function generatePlan({ destLat, destLng, destName, days, startName, startLat, startLng }) {
  days = Math.max(1, Math.min(Number(days) || 2, 7));

  let attractionsRaw = [], food = [];
  try {
    [attractionsRaw, food] = await Promise.all([
      nearby('attraction', destLat, destLng, 15000),
      nearby('food', destLat, destLng, 8000),
    ]);
  } catch { /* fall through with whatever we got */ }

  const attractions = attractionsRaw.slice(0, days * 3);
  const startPt = startLat && startLng ? { lat: startLat, lng: startLng } : { lat: destLat, lng: destLng };
  const ordered = nearestNeighbour(attractions, startPt.lat, startPt.lng);
  const perDay = Math.max(1, Math.ceil(ordered.length / days));

  const nearestFood = (lat, lng) =>
    food.length ? food.reduce((a, b) => (dist(lat, lng, a.lat, a.lng) < dist(lat, lng, b.lat, b.lng) ? a : b)) : null;
  const dirLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  const plan = [];
  for (let di = 0; di < days; di++) {
    const dayAttractions = ordered.slice(di * perDay, (di + 1) * perDay);
    const items = [];
    let clock = 8 * 60;
    const push = (type, title, lat, lng, note) =>
      items.push({ time: fmt(clock), type, title, lat: lat ?? null, lng: lng ?? null, note: note ?? null, map: lat ? dirLink(lat, lng) : null });

    if (di === 0 && startName) {
      push('start', `Start from ${startName}`, startLat, startLng, 'Begin the journey');
      clock += 120;
      push('drive', `Arrive in ${destName}`, destLat, destLng, 'Freshen up / check in');
      clock += 30;
    }

    const base0 = dayAttractions[0] || { lat: destLat, lng: destLng };
    const bf = nearestFood(base0.lat, base0.lng);
    if (bf) { push('breakfast', `Breakfast — ${bf.name}`, bf.lat, bf.lng, bf.cuisine); clock += 60; }

    const half = Math.ceil(dayAttractions.length / 2);
    dayAttractions.slice(0, half).forEach((a) => { push('visit', a.name, a.lat, a.lng, a.cuisine || 'Sightseeing'); clock += 90; });

    clock = Math.max(clock, 13 * 60);
    const lb = dayAttractions[half - 1] || base0;
    const lunch = nearestFood(lb.lat, lb.lng);
    if (lunch) { push('lunch', `Lunch — ${lunch.name}`, lunch.lat, lunch.lng, lunch.cuisine); clock += 75; }

    dayAttractions.slice(half).forEach((a) => { push('visit', a.name, a.lat, a.lng, 'Sightseeing'); clock += 90; });

    clock = Math.max(clock, 19.5 * 60);
    const db = dayAttractions[dayAttractions.length - 1] || base0;
    const dinner = nearestFood(db.lat, db.lng);
    if (dinner) push('dinner', `Dinner — ${dinner.name}`, dinner.lat, dinner.lng, dinner.cuisine);

    plan.push({ dayIndex: di, visitCount: dayAttractions.length, items });
  }

  return { plan, totals: { attractions: attractions.length, food: food.length } };
}
