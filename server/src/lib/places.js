// Nearby places + geocoding via free OpenStreetMap services.
// No API key required. Uses Overpass API for POIs and Nominatim for geocoding.

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const UA = 'TripPlanner/1.0 (domestic trip planner demo)';

// Map friendly categories -> OSM tag filters (each queried as node/way/relation so areas count too)
const CATEGORY_QUERY = {
  food:        ['["amenity"~"restaurant|cafe|fast_food|food_court"]'],
  atm:         ['["amenity"="atm"]'],
  petrol:      ['["amenity"="fuel"]'],
  hospital:    ['["amenity"~"hospital|clinic|pharmacy"]'],
  hotel:       ['["tourism"~"hotel|guest_house|hostel"]'],
  attraction:  ['["tourism"~"attraction|viewpoint|artwork|monument"]', '["historic"]'],
  parking:     ['["amenity"="parking"]'],
  toilets:     ['["amenity"="toilets"]'],
  cafe:        ['["amenity"="cafe"]'],
  shopping:    ['["shop"~"mall|supermarket|convenience"]'],
  // Discover / family & kids
  playground:  ['["leisure"~"playground|water_park"]', '["amenity"="theatre"]'],
  themepark:   ['["tourism"~"theme_park|zoo|aquarium"]', '["leisure"="amusement_arcade"]'],
  park:        ['["leisure"~"park|garden|nature_reserve"]'],
  museum:      ['["tourism"~"museum|gallery"]', '["amenity"="arts_centre"]'],
  mall:        ['["shop"~"mall|department_store"]'],
  beach:       ['["natural"="beach"]'],
};

export async function nearby(category, lat, lng, radius = 3000) {
  const filters = CATEGORY_QUERY[category] || CATEGORY_QUERY.food;
  const body = filters.map((f) => `nwr${f}(around:${radius},${lat},${lng});`).join('');
  const q = `[out:json][timeout:25];(${body});out center 60;`;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('Overpass error ' + res.status);
  const data = await res.json();

  const seen = new Set();
  return (data.elements || [])
    .map((el) => {
      const plat = el.lat ?? el.center?.lat;
      const plon = el.lon ?? el.center?.lon;
      if (plat == null || plon == null || !el.tags?.name) return null;
      return {
        id: String(el.id),
        name: el.tags.name,
        category,
        lat: plat,
        lng: plon,
        address: [el.tags['addr:street'], el.tags['addr:city']].filter(Boolean).join(', '),
        phone: el.tags.phone || el.tags['contact:phone'] || null,
        cuisine: el.tags.cuisine || null,
        distance: haversine(lat, lng, plat, plon),
      };
    })
    .filter((r) => r && !seen.has(r.name.toLowerCase()) && seen.add(r.name.toLowerCase()))
    .sort((a, b) => a.distance - b.distance);
}

// Google Places resolves informal/local names (e.g. "Kora food street") that OSM
// doesn't. Used only when GOOGLE_MAPS_API_KEY is set; otherwise free Nominatim.
export async function geocode(query) {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const g = await googlePlaces(query);
      if (g.length) return g;
    } catch { /* fall back to OSM */ }
  }
  return nominatim(query);
}

async function googlePlaces(query) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&region=in&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status))
    throw new Error('Google ' + data.status + (data.error_message ? ': ' + data.error_message : ''));
  return (data.results || []).slice(0, 6).map((r) => ({
    name: r.name ? `${r.name}, ${r.formatted_address || ''}`.replace(/,\s*$/, '') : r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    type: (r.types || [])[0] || 'place',
  }));
}

async function nominatim(query) {
  const url = `${NOMINATIM}/search?format=json&limit=6&countrycodes=in&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('Geocode error ' + res.status);
  const data = await res.json();
  return data.map((d) => ({
    name: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    type: d.type,
  }));
}

// Resolve a Google/Apple Maps share link to coordinates (follows short links).
export async function resolveMapLink(url) {
  let finalUrl = url, html = '';
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TripPlanner/1.0)' } });
    finalUrl = res.url || url;
    html = await res.text().catch(() => '');
  } catch { /* fall back to parsing the raw url */ }
  let coords = extractCoords(finalUrl) || extractCoords(url) || extractCoordsFromHtml(html);
  // consent/redirect pages wrap the real maps URL in a continue=/url= param
  if (!coords) {
    const wrapped = (finalUrl.match(/[?&](?:continue|url)=([^&]+)/) || [])[1];
    if (wrapped) { try { coords = extractCoords(decodeURIComponent(wrapped)); } catch { /* ignore */ } }
  }
  // share.google / knowledge-panel links carry a place NAME (q=...) but no coords
  const label = extractLabel(finalUrl) || extractLabel(url) || extractQueryName(finalUrl) || extractTitle(html);
  if (!coords && label) {
    try { const g = await geocode(label); if (g.length) coords = { lat: g[0].lat, lng: g[0].lng }; } catch { /* keep name only */ }
  }
  if (!coords && !label) return null;
  return { lat: coords?.lat ?? null, lng: coords?.lng ?? null, label: label || null };
}

// Reject Google's opaque tokens (long, no spaces) that appear on consent pages
const looksLikeToken = (v) => /^[A-Za-z0-9_-]{18,}$/.test(v);
function extractQueryName(u = '') {
  const m = u.match(/[?&](?:q|query)=([^&]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(v) || looksLikeToken(v)) return null;
  return v.slice(0, 80);
}
function extractTitle(html = '') {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return null;
  const t = m[1].replace(/\s*-\s*Google (Search|Maps).*$/i, '').trim();
  if (!t || t.length < 2 || /^Google (Search|Maps)$/i.test(t) || looksLikeToken(t)) return null;
  return t.slice(0, 80);
}

function extractCoords(u = '') {
  let m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) return { lat: +m[1], lng: +m[2] };
  m = u.match(/[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) return { lat: +m[1], lng: +m[2] };
  m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/); if (m) return { lat: +m[1], lng: +m[2] };
  m = u.match(/\/(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) return { lat: +m[1], lng: +m[2] };
  return null;
}
function extractCoordsFromHtml(html = '') {
  if (!html) return null;
  let m = html.match(/@(-?\d+\.\d{3,}),(-?\d+\.\d{3,})/); if (m) return { lat: +m[1], lng: +m[2] };
  m = html.match(/\[null,null,(-?\d+\.\d{3,}),(-?\d+\.\d{3,})\]/); if (m) return { lat: +m[1], lng: +m[2] };
  m = html.match(/"latitude":(-?\d+\.\d{3,}),"longitude":(-?\d+\.\d{3,})/); if (m) return { lat: +m[1], lng: +m[2] };
  return null;
}
function extractLabel(u = '') {
  const m = u.match(/\/place\/([^/@]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')).slice(0, 80) : null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
