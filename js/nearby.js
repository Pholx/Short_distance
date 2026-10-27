const OVERPASS_SERVERS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

// Modulnivå: håller koll på pågående sökning så vi kan avbryta den
// när användaren trycker på en annan kategori (sparar data + undviker race conditions).
let currentBatch = null;

function buildQuery(lat, lon, radius, category) {
  const around = `(around:${radius},${lat},${lon})`;
  const filters = [];

  if (category === 'all' || category === 'attraction') {
    filters.push(`nwr${around}["name"]["tourism"~"attraction|viewpoint|artwork|gallery|zoo|theme_park"];`);
    filters.push(`nwr${around}["name"]["historic"];`);
    filters.push(`nwr${around}["name"]["man_made"~"tower|lighthouse|pier|bridge|windmill|watermill|obelisk"];`);
    filters.push(`nwr${around}["name"]["amenity"="place_of_worship"];`);
  }

  if (category === 'all' || category === 'activity') {
    filters.push(`nwr${around}["name"]["leisure"~"park|garden|playground|sports_centre|stadium|track|pitch|swimming_pool|water_park|bowling_alley|fitness_centre|nature_reserve|dog_park|golf_course|miniature_golf|ice_rink|marina|slipway|amusement_arcade|adult_gaming_centre|escape_game"];`);
    filters.push(`nwr${around}["name"]["amenity"~"theatre|cinema|arts_centre|community_centre|nightclub|casino|gambling|planetarium|events_venue|music_venue"];`);
    filters.push(`nwr${around}["name"]["tourism"="museum"];`);
  }

  if (category === 'all' || category === 'food') {
    filters.push(`nwr${around}["name"]["amenity"~"restaurant|fast_food|food_court|bar|pub|biergarten"];`);
    filters.push(`nwr${around}["name"]["shop"~"deli|greengrocer|butcher|seafood|marketplace"];`);
  }

  if (category === 'all' || category === 'coffee') {
    filters.push(`nwr${around}["name"]["amenity"~"cafe|ice_cream"];`);
    filters.push(`nwr${around}["name"]["shop"~"bakery|confectionery|pastry|coffee|tea"];`);
  }

  if (category === 'all' || category === 'essentials') {
    filters.push(`nwr${around}["name"]["amenity"~"pharmacy|bank|atm"];`);
    filters.push(`nwr${around}["name"]["shop"~"supermarket|convenience|general|kiosk"];`);
  }

  if (category === 'all' || category === 'facilities') {
    filters.push(`nwr${around}["name"]["amenity"~"toilets|drinking_water|parking|fuel|charging_station"];`);
  }

  if (filters.length === 0) return null;
  return `[out:json][timeout:10];(${filters.join('')});out center 300;`;
}

function categorize(tags) {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const historic = tags.historic;
  const manMade = tags.man_made;
  const shop = tags.shop;

  if (tourism && ['hotel','hostel','guest_house','motel','apartment','chalet','camp_site','caravan_site','alpine_hut','wilderness_hut','resort'].includes(tourism)) {
    return null;
  }

  if (amenity && ['pharmacy','bank','atm'].includes(amenity)) return 'essentials';
  if (shop && ['supermarket','convenience','general','kiosk'].includes(shop)) return 'essentials';

  if (amenity && ['toilets','drinking_water','parking','fuel','charging_station'].includes(amenity)) return 'facilities';

  if (amenity && ['restaurant','fast_food','food_court','bar','pub','biergarten'].includes(amenity)) return 'food';
  if (shop && ['deli','greengrocer','butcher','seafood','marketplace'].includes(shop)) return 'food';

  if (amenity && ['cafe','ice_cream'].includes(amenity)) return 'coffee';
  if (shop && ['bakery','confectionery','pastry','coffee','tea'].includes(shop)) return 'coffee';

  if (historic) return 'attraction';
  if (manMade && ['tower','lighthouse','pier','bridge','windmill','watermill','obelisk'].includes(manMade)) return 'attraction';
  if (amenity === 'place_of_worship') return 'attraction';
  if (tourism && ['attraction','viewpoint','artwork','gallery','zoo','theme_park'].includes(tourism)) return 'attraction';

  if (tourism === 'museum') return 'activity';
  if (leisure && ['park','garden','playground','sports_centre','stadium','track','pitch','swimming_pool','water_park','bowling_alley','fitness_centre','nature_reserve','dog_park','golf_course','miniature_golf','ice_rink','marina','slipway','amusement_arcade','adult_gaming_centre','escape_game'].includes(leisure)) return 'activity';
  if (amenity && ['theatre','cinema','arts_centre','community_centre','nightclub','casino','gambling','planetarium','events_venue','music_venue'].includes(amenity)) return 'activity';

  return null;
}

function distance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchOverpass(query, batch) {
  const encoded = encodeURIComponent(query);
  const urls = OVERPASS_SERVERS.map(server => `${server}?data=${encoded}`);

  return new Promise((resolve, reject) => {
    let settled = false;
    let pending = urls.length;
    let lastError = null;

    const finish = (err, data) => {
      if (settled) return;
      settled = true;
      batch.controllers.forEach(c => { try { c.abort(); } catch {} });
      if (err) reject(err);
      else resolve(data);
    };
    batch.settle = finish;

    if (batch.aborted) {
      finish(new DOMException('Aborted', 'AbortError'));
      return;
    }

    for (const url of urls) {
      const controller = new AbortController();
      batch.controllers.push(controller);
      const timeoutId = setTimeout(() => { try { controller.abort(); } catch {} }, 10000);

      fetch(url, { signal: controller.signal })
        .then(res => {
          if (settled || batch.aborted) return null;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          clearTimeout(timeoutId);
          if (settled || batch.aborted || !data) return;
          finish(null, data);
        })
        .catch(err => {
          clearTimeout(timeoutId);
          if (settled) return;
          if (batch.aborted) {
            finish(new DOMException('Aborted', 'AbortError'));
            return;
          }
          lastError = err.name === 'AbortError' ? new Error('Timeout') : err;
          pending--;
          if (pending === 0) {
            finish(lastError || new Error('All Overpass servers failed'));
          }
        });
    }
  });
}

export async function searchNearby(lat, lon, radius, category = 'all') {
  // Avbryt tidigare sökning (sparar bandbredd, förhindrar race conditions)
  if (currentBatch) currentBatch.abort();

  const batch = {
    aborted: false,
    controllers: [],
    settle: null,
    abort() {
      this.aborted = true;
      this.controllers.forEach(c => { try { c.abort(); } catch {} });
      if (this.settle) this.settle(new DOMException('Aborted', 'AbortError'));
    }
  };
  currentBatch = batch;

  try {
    const query = buildQuery(lat, lon, radius, category);
    if (!query) throw new Error('Invalid category');

    const data = await fetchOverpass(query, batch);

    const elements = data.elements || [];
    const results = {
      attraction: [], activity: [], food: [],
      coffee: [], essentials: [], facilities: []
    };
    const seen = new Set();

    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name;
      if (!name) continue;

      const cat = categorize(tags);
      if (!cat) continue;
      if (category !== 'all' && cat !== category) continue;

      const pLat = el.lat ?? el.center?.lat;
      const pLon = el.lon ?? el.center?.lon;
      if (pLat == null || pLon == null) continue;

      const key = `${name}@${pLat.toFixed(5)},${pLon.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const dist = distance(lat, lon, pLat, pLon);
      results[cat].push({
        id: `${el.type}/${el.id}`,
        name, lat: pLat, lon: pLon,
        distance: dist, category: cat, tags
      });
    }

    for (const cat in results) {
      results[cat].sort((a, b) => a.distance - b.distance);
      results[cat] = results[cat].slice(0, 5);
    }

    if (category === 'all') return results;
    return { [category]: results[category] };
  } finally {
    if (currentBatch === batch) currentBatch = null;
  }
}