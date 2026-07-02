// Nearby places + geocoding via free OpenStreetMap services.
// No API key required. Uses Overpass API for POIs and Nominatim for geocoding.

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const UA = 'TripPlanner/1.0 (domestic trip planner demo)';

// Map friendly categories -> OSM tag filters
const CATEGORY_QUERY = {
  food:        'node["amenity"~"restaurant|cafe|fast_food|food_court"]',
  atm:         'node["amenity"="atm"]',
  petrol:      'node["amenity"="fuel"]',
  hospital:    'node["amenity"~"hospital|clinic|pharmacy"]',
  hotel:       'node["tourism"~"hotel|guest_house|hostel"]',
  attraction:  'node["tourism"~"attraction|viewpoint|museum|zoo|theme_park"]',
  parking:     'node["amenity"="parking"]',
  toilets:     'node["amenity"="toilets"]',
  cafe:        'node["amenity"="cafe"]',
  shopping:    'node["shop"~"mall|supermarket|convenience"]',
};

export async function nearby(category, lat, lng, radius = 3000) {
  const filter = CATEGORY_QUERY[category] || CATEGORY_QUERY.food;
  const q = `[out:json][timeout:20];(${filter}(around:${radius},${lat},${lng}););out body 40;`;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('Overpass error ' + res.status);
  const data = await res.json();

  return (data.elements || [])
    .filter((el) => el.lat && el.lon && el.tags?.name)
    .map((el) => ({
      id: String(el.id),
      name: el.tags.name,
      category,
      lat: el.lat,
      lng: el.lon,
      address: [el.tags['addr:street'], el.tags['addr:city']].filter(Boolean).join(', '),
      phone: el.tags.phone || el.tags['contact:phone'] || null,
      cuisine: el.tags.cuisine || null,
      distance: haversine(lat, lng, el.lat, el.lon),
    }))
    .sort((a, b) => a.distance - b.distance);
}

export async function geocode(query) {
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
